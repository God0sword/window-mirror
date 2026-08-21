//! CA Manager — Certificate Authority for the MITM proxy
//!
//! Generates (or loads) a self-signed CA, persists PEM files, optionally
//! installs into system + NSS trust stores, and hands hudsucker an
//! `RcgenAuthority` for on-the-fly leaf signing.

use anyhow::{Context as _, Result};
use rcgen::{
    BasicConstraints, Certificate, CertificateParams, DistinguishedName, DnType,
    DnValue, IsCa, KeyPair, KeyUsagePurpose,
};
use std::fs;
use std::path::PathBuf;
use time::{Duration, OffsetDateTime};
use tracing::{info, warn};

/// CA configuration
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CAConfig {
    pub cert_path: Option<PathBuf>,
    pub key_path: Option<PathBuf>,
    pub generate: bool,
    pub common_name: Option<String>,
    pub organization: Option<String>,
    pub validity_days: Option<i64>,
    pub auto_install: bool,
    pub trust_stores: Option<Vec<String>>,
}

impl Default for CAConfig {
    fn default() -> Self {
        Self {
            cert_path: None,
            key_path: None,
            generate: true,
            common_name: Some("Window Mirror MITM CA".into()),
            organization: Some("Window Mirror".into()),
            validity_days: Some(3650),
            auto_install: false, // opt-in; needs root/NSS tools
            trust_stores: Some(vec!["nss".into()]),
        }
    }
}

pub struct CAManager {
    config: CAConfig,
    ca_dir: PathBuf,
    key_pair: Option<KeyPair>,
    cert: Option<Certificate>,
}

impl CAManager {
    pub fn new(config: CAConfig) -> Self {
        let ca_dir = dirs::data_dir()
            .unwrap_or_else(std::env::temp_dir)
            .join("window-mirror/ca");
        let _ = fs::create_dir_all(&ca_dir);
        Self { config, ca_dir, key_pair: None, cert: None }
    }

    /// Load existing PEMs or generate fresh ones. Never fails hard — a broken
    /// install degrades to "HTTPS interception unavailable", not a crash.
    pub async fn initialize(&mut self) -> Result<()> {
        let (cert_p, key_p) = self.resolved_paths();

        if cert_p.exists() && key_p.exists() {
            match self.try_load(&cert_p, &key_p) {
                Ok(()) => return Ok(()),
                Err(e) => warn!("existing CA unusable ({e}); regenerating"),
            }
        }

        if !self.config.generate {
            anyhow::bail!("no usable CA and generation is disabled");
        }
        self.generate()?;
        if self.config.auto_install {
            if let Some(stores) = self.config.trust_stores.clone() {
                if let Some(cert) = &self.cert {
                    let _ = self.install_to_stores(cert, &stores).await;
                }
            }
        }
        Ok(())
    }

    fn resolved_paths(&self) -> (PathBuf, PathBuf) {
        let cert = self.config.cert_path.clone().unwrap_or_else(|| self.ca_dir.join("ca.pem"));
        let key = self.config.key_path.clone().unwrap_or_else(|| self.ca_dir.join("ca.key.pem"));
        (cert, key)
    }

    fn try_load(&mut self, cert_p: &PathBuf, key_p: &PathBuf) -> Result<()> {
        let cert_pem = fs::read_to_string(cert_p).context("read ca.pem")?;
        let key_pem = fs::read_to_string(key_p).context("read ca.key.pem")?;
        let key = KeyPair::from_pem(&key_pem).context("parse CA key")?;
        let cert = Certificate::from_pem(&cert_pem).context("parse CA cert")?;
        self.key_pair = Some(key);
        self.cert = Some(cert);
        info!("loaded existing CA from {}", self.ca_dir.display());
        Ok(())
    }

    fn generate(&mut self) -> Result<()> {
        let mut params = CertificateParams::default();
        params.distinguished_name = {
            let mut dn = DistinguishedName::new();
            dn.push(
                DnType::CommonName,
                DnValue::Utf8String(
                    self.config.common_name.clone().unwrap_or_else(|| "Window Mirror MITM CA".into()),
                ),
            );
            dn.push(
                DnType::OrganizationName,
                DnValue::Utf8String(
                    self.config.organization.clone().unwrap_or_else(|| "Window Mirror".into()),
                ),
            );
            dn
        };
        params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
        params.key_usages = vec![KeyUsagePurpose::KeyCertSign, KeyUsagePurpose::CrlSign];
        let now = OffsetDateTime::now_utc();
        params.not_before = now;
        params.not_after = now + Duration::days(self.config.validity_days.unwrap_or(3650));

        let key = KeyPair::generate().context("generate CA keypair")?;
        let cert = params.signed_by(&key, &params, &key)
            .or_else(|_| params.self_signed(&key))
            .context("self-sign CA")?;

        // Persist.
        let (cert_p, key_p) = self.resolved_paths();
        fs::create_dir_all(cert_p.parent().unwrap_or(&self.ca_dir))?;
        fs::write(&cert_p, cert.pem())?;
        fs::write(&key_p, key.serialize_pem())?;

        info!("generated new CA at {} (valid {}d)", cert_p.display(),
              self.config.validity_days.unwrap_or(3650));
        self.key_pair = Some(key);
        self.cert = Some(cert);
        Ok(())
    }

    /// Build the hudsucker authority used to sign per-host leaf certificates.
    pub fn authority(
        &self,
    ) -> Result<hudsucker::certificate_authority::RcgenAuthority> {
        let key = self.key_pair.as_ref().context("CA not initialized")?.clone();
        let cert = self.cert.as_ref().context("CA not initialized")?.clone();
        // Cache size = number of leaf certs kept in memory.
        Ok(hudsucker::certificate_authority::RcgenAuthority::new(key, cert, 1_000))
    }

    pub fn cert_pem(&self) -> Option<String> {
        self.cert.as_ref().map(|c| c.pem())
    }

    pub fn has_cert(&self) -> bool {
        self.cert.is_some()
    }

    /// Install into requested trust stores from a parsed certificate.
    pub async fn install_to_stores(&self, cert: &Certificate, stores: &[String]) -> Result<()> {
        self.install_pem_to_stores(&cert.pem(), stores).await
    }

    /// Install directly from PEM text — the path used by the Tauri command
    /// layer (guided copy-paste wizard's "also try auto-install" button).
    pub async fn install_pem_to_stores(&self, pem: &str, stores: &[String]) -> Result<()> {
        for store in stores {
            match store.as_str() {
                "system" => self.install_system(pem).await,
                "nss" => self.install_nss(pem).await,
                other => warn!("unknown trust store '{other}', skipping"),
            }
        }
        Ok(())
    }

    #[cfg(target_os = "linux")]
    async fn install_system(&self, pem: &str) {
        let dest = PathBuf::from("/usr/local/share/ca-certificates/window-mirror-ca.crt");
        if fs::write(&dest, pem).is_err() {
            warn!("cannot write {} (need root); run manually with sudo", dest.display());
            return;
        }
        match tokio::process::Command::new("update-ca-certificates")
            .arg("--fresh")
            .status()
            .await
        {
            Ok(s) if s.success() => info!("CA installed to system trust store"),
            Ok(s) => warn!("update-ca-certificates exited {s}"),
            Err(e) => warn!("failed to spawn update-ca-certificates: {e}"),
        }
    }

    #[cfg(not(target_os = "linux"))]
    async fn install_system(&self, _pem: &str) {
        warn!("system trust-store install not implemented on this platform");
    }

    /// NSS databases (Chromium/Firefox profile stores).
    async fn install_nss(&self, pem: &str) {
        let certutil = match which::which("certutil") {
            Ok(p) => p,
            Err(_) => {
                warn!("`certutil` (libnss3-tools) not found — cannot import into NSS");
                return;
            }
        };

        let mut candidates: Vec<PathBuf> = Vec::new();
        if let Some(home) = dirs::home_dir() {
            candidates.push(home.join(".pki/nssdb"));
            if let Some(mozilla) = dirs::home_dir() {
                candidates.push(mozilla.join(".mozilla/firefox"));
            }
        }
        candidates.push(PathBuf::from("/etc/pki/nssdb"));

        let tmp = self.ca_dir.join("import-ca.pem");
        if fs::write(&tmp, pem).is_err() {
            warn!("cannot stage CA for NSS import");
            return;
        }

        for dir in candidates {
            if !dir.exists() {
                continue;
            }
            // Firefox keeps per-profile subdirs containing cert9.db.
            let targets: Vec<PathBuf> = if dir.join("cert9.db").exists() {
                vec![dir.clone()]
            } else {
                fs::read_dir(&dir)
                    .into_iter()
                    .flatten()
                    .flatten()
                    .filter(|e| e.path().join("cert9.db").exists())
                    .map(|e| e.path())
                    .collect()
            };

            for t in targets {
                let status = tokio::process::Command::new(&certutil)
                    .args(["-A", "-n", "Window Mirror MITM CA", "-t", "C,,",
                           "-d", &format!("sql:{}", t.display()),
                           "-i"]).arg(&tmp)
                    .output()
                    .await;
                match status {
                    Ok(o) if o.status.success() =>
                        info!("CA imported into NSS db at {}", t.display()),
                    Ok(o) => warn!(
                        "certutil failed at {}: {}",
                        t.display(),
                        String::from_utf8_lossy(&o.stderr).trim()
                    ),
                    Err(e) => warn!("certutil spawn failed: {e}"),
                }
            }
        }
    }
}
