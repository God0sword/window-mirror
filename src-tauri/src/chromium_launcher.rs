//! Chromium Launcher - Launch Chromium with proxy configuration and NSS trust store

use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tokio::process::Command as TokioCommand;
use tracing::{info, warn};

/// Chromium launcher configuration
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ChromiumConfig {
    pub enabled: bool,
    pub executable: Option<String>,
    pub user_data_dir: Option<PathBuf>,
    pub profile_name: Option<String>,
    pub auto_launch: bool,
    pub proxy_bypass_list: Option<Vec<String>>,
    pub disable_quic: bool,
    pub ignore_certificate_errors: bool,
    pub import_ca_to_nss: bool,
    pub extra_args: Option<Vec<String>>,
}

impl Default for ChromiumConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            executable: None,
            user_data_dir: None,
            profile_name: Some("Window Mirror".to_string()),
            auto_launch: false,
            proxy_bypass_list: Some(vec!["<-loopback>".to_string()]),
            disable_quic: true,
            ignore_certificate_errors: false,
            import_ca_to_nss: true,
            extra_args: Some(vec![
                "--disable-web-security".to_string(),
                "--disable-site-isolation-trials".to_string(),
                "--disable-features=IsolateOrigins,site-per-process".to_string(),
            ]),
        }
    }
}

/// Chromium launcher for MITM proxy
pub struct ChromiumLauncher {
    config: ChromiumConfig,
    proxy_addr: String,
    ca_cert_pem: Option<String>,
    child: Option<tokio::process::Child>,
}

impl ChromiumLauncher {
    /// Create a new Chromium launcher
    pub fn new(config: ChromiumConfig, proxy_addr: String, ca_cert_pem: Option<String>) -> Self {
        Self {
            config,
            proxy_addr,
            ca_cert_pem,
            child: None,
        }
    }

    /// Launch Chromium with proxy configuration
    pub async fn launch(&mut self) -> Result<()> {
        if !self.config.enabled {
            info!("Chromium launcher disabled");
            return Ok(());
        }

        let executable = self.find_chromium_executable()?;
        let profile_dir = self.get_profile_dir()?;
        
        // Create profile directory
        std::fs::create_dir_all(&profile_dir)?;

        // Import CA to NSS trust store if needed
        if self.config.import_ca_to_nss {
            if let Some(ca_pem) = &self.ca_cert_pem {
                self.import_ca_to_nss(ca_pem, &profile_dir).await?;
            }
        }

        // Build command
        let mut cmd = TokioCommand::new(&executable);
        
        cmd.arg(format!("--user-data-dir={}", profile_dir.display()))
           .arg(format!("--proxy-server=http={};https={}", self.proxy_addr, self.proxy_addr))
           .arg("--proxy-bypass-list=<-loopback>")
           .arg("--disable-quic")
           .arg("--ignore-certificate-errors")
           .arg("--disable-web-security")
           .arg("--disable-site-isolation-trials")
           .arg("--disable-features=IsolateOrigins,site-per-process")
           .stdout(Stdio::null())
           .stderr(Stdio::null());

        // Add extra args
        if let Some(args) = &self.config.extra_args {
            for arg in args {
                cmd.arg(arg);
            }
        }

        info!("Launching Chromium: {}", executable.display());
        
        let child = cmd.spawn()
            .context("Failed to spawn Chromium process")?;
        
        self.child = Some(child);
        
        info!("Chromium launched with proxy: {}", self.proxy_addr);
        Ok(())
    }

    /// Kill the Chromium process
    pub async fn kill(&mut self) -> Result<()> {
        if let Some(mut child) = self.child.take() {
            child.kill().await?;
            info!("Chromium process killed");
        }
        Ok(())
    }

    /// Check if Chromium is running
    pub fn is_running(&self) -> bool {
        self.child.is_some()
    }

    /// Find Chromium executable
    fn find_chromium_executable(&self) -> Result<PathBuf> {
        if let Some(exec) = &self.config.executable {
            let path = PathBuf::from(exec);
            if path.exists() {
                return Ok(path);
            }
        }

        // Try common locations
        let candidates = [
            "chromium",
            "chromium-browser",
            "google-chrome-stable",
            "google-chrome",
            "chrome",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/google-chrome",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
        ];

        for candidate in candidates {
            let path = PathBuf::from(candidate);
            if path.exists() {
                return Ok(path);
            }
            
            // Try which
            if let Ok(path) = which::which(candidate) {
                return Ok(path);
            }
        }

        Err(anyhow::anyhow!("Chromium executable not found. Please install Chromium or specify executable path in config."))
    }

    /// Get profile directory
    fn get_profile_dir(&self) -> Result<PathBuf> {
        if let Some(dir) = &self.config.user_data_dir {
            return Ok(dir.clone());
        }

        let base_dir = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("/tmp"))
            .join("window-mirror/chromium");

        let profile_name = self.config.profile_name.as_deref().unwrap_or("Window Mirror");
        let profile_dir = base_dir.join(profile_name.replace(' ', "_"));

        Ok(profile_dir)
    }

    /// Import CA certificate to NSS trust store
    async fn import_ca_to_nss(&self, ca_pem: &str, profile_dir: &Path) -> Result<()> {
        let certutil = match which::which("certutil") {
            Ok(path) => path,
            Err(_) => {
                warn!("certutil not found, skipping NSS CA import");
                return Ok(());
            }
        };

        let nss_dir = self.get_nss_dir(&profile_dir)?;
        std::fs::create_dir_all(&nss_dir)?;

        // Write CA cert to temp file
        let cert_file = nss_dir.join("window-mirror-ca.pem");
        std::fs::write(&cert_file, ca_pem)?;

        // Add to NSS DB
        let output = TokioCommand::new(&certutil)
            .args([
                "-A", "-n", "Window Mirror MITM CA",
                "-t", "C,,",
                "-d", &format!("sql:{}", nss_dir.display()),
                "-i", &cert_file.to_string_lossy(),
            ])
            .output()
            .await?;

        if output.status.success() {
            info!("CA imported to NSS trust store at {}", nss_dir.display());
        } else {
            warn!("Failed to import CA to NSS: {}", String::from_utf8_lossy(&output.stderr));
        }

        Ok(())
    }

    /// Get NSS database directory for profile
    fn get_nss_dir(&self, profile_dir: &Path) -> Result<PathBuf> {
        // Try standard locations
        let nss_dirs = [
            profile_dir.join("nssdb"),
            profile_dir.join("pki/nssdb"),
        ];

        for dir in nss_dirs {
            if dir.exists() || dir.parent().map(|p| p.exists()).unwrap_or(false) {
                return Ok(dir);
            }
        }

        // Default to profile_dir/nssdb
        Ok(profile_dir.join("nssdb"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_chromium_launcher_config() {
        let config = ChromiumConfig::default();
        assert!(config.enabled);
        assert!(config.disable_quic);
        assert!(config.import_ca_to_nss);
    }
}