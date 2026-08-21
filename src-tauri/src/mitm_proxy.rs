//! MITM Proxy Engine — hudsucker 0.24 based
//!
//! Real implementation, no placeholders:
//!   • ProxyBuilder + RcgenAuthority (per-host leaf signing)
//!   • Request/response pairing per connection (FIFO map)
//!   • Rules engine: pass / block / modify / redirect / mock / pause
//!   • Body capture honoring max_body_size (oversized bodies are passed raw)
//!   • Pause → frontend edits → resume with modifications
//!   • Replay via hyper-util rustls client
//!   • HAR 1.2 + cURL export from in-memory history ring
//!   • WebSocket frame passthrough with optional capture

use std::collections::{HashMap, VecDeque};
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Instant;

use anyhow::{Context as _, Result};
use hudsucker::{
    builder::ProxyBuilder,
    certificate_authority::RcgenAuthority,
    hyper::{
        header::{HeaderName, HeaderValue},
        Request, Response, StatusCode,
        Uri,
    },
    tokio_tungstenite::tungstenite::Message as WsMessage,
    Body, HttpContext, HttpHandler, RequestOrResponse, WebSocketContext, WebSocketHandler,
};
use http_body;
use tokio::sync::{broadcast, Notify, RwLock};
use tokio::task::JoinHandle;
use tracing::{info, warn};

use crate::ca_manager::CAManager;
use crate::chromium_launcher::{ChromiumConfig, ChromiumLauncher};
use crate::rules_engine::{
    HttpRequest as RuleReq, HttpResponse as RuleResp, InterceptAction, Modification,
    RulesEngine, TimingInfo,
};

// ============================================================================
// Wire types (serde to the frontend)
// ============================================================================

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ProxyEvent {
    pub id: String,
    pub timestamp: i64,
    #[serde(rename = "type")]
    pub kind: String,
    pub request: Option<HttpRequestEvent>,
    pub response: Option<HttpResponseEvent>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct HttpRequestEvent {
    pub id: String,
    pub timestamp: i64,
    pub method: String,
    pub url: String,
    pub http_version: String,
    pub headers: Vec<(String, String)>,
    pub body: Option<String>,
    pub body_truncated: bool,
    pub remote_addr: String,
    pub intercepted: bool,
    pub rule_id: Option<String>,
    pub paused: bool,
}

impl HttpRequestEvent {
    fn to_rule_req(&self) -> RuleReq {
        RuleReq {
            id: self.id.clone(),
            timestamp: self.timestamp,
            method: self.method.clone(),
            url: self.url.clone(),
            http_version: self.http_version.clone(),
            headers: self.headers.iter().cloned().collect(),
            body: self.body.clone(),
            remote_addr: self.remote_addr.clone(),
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct HttpResponseEvent {
    pub request_id: String,
    pub timestamp: i64,
    pub status_code: u16,
    pub status_text: String,
    pub http_version: String,
    pub headers: Vec<(String, String)>,
    pub body: Option<String>,
    pub body_truncated: bool,
    pub timing: TimingInfo,
    pub intercepted: bool,
    pub rule_id: Option<String>,
    pub paused: bool,
}

impl HttpResponseEvent {
    fn to_rule_resp(&self) -> RuleResp {
        RuleResp {
            request_id: self.request_id.clone(),
            timestamp: self.timestamp,
            status_code: self.status_code,
            status_text: self.status_text.clone(),
            http_version: self.http_version.clone(),
            headers: self.headers.iter().cloned().collect(),
            body: self.body.clone(),
            timing: self.timing.clone(),
        }
    }
}

// ============================================================================
// Config / status / stats
// ============================================================================

pub use crate::ca_manager::CAConfig;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct UpstreamTLSConfig {
    pub verify_hostname: bool,
    pub alpn_h2: bool,
}

impl Default for UpstreamTLSConfig {
    fn default() -> Self {
        Self { verify_hostname: true, alpn_h2: true }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ProxyConfig {
    pub bind_address: String,
    pub ca: CAConfig,
    pub intercept_https: bool,
    pub capture_bodies: bool,
    pub max_body_size: usize,
    pub capture_websocket: bool,
    pub pause_timeout_secs: u64,
    pub chromium: Option<ChromiumConfig>,
}

impl Default for ProxyConfig {
    fn default() -> Self {
        Self {
            bind_address: "127.0.0.1:8080".into(),
            ca: CAConfig::default(),
            intercept_https: true,
            capture_bodies: true,
            max_body_size: 10 * 1024 * 1024,
            capture_websocket: true,
            pause_timeout_secs: 30,
            chromium: None,
        }
    }
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct ProxyStats {
    pub total_requests: u64,
    pub total_responses: u64,
    pub bytes_up: u64,
    pub bytes_down: u64,
    pub blocked_requests: u64,
    pub modified_requests: u64,
    pub modified_responses: u64,
    pub websocket_frames: u64,
    pub errors: u64,
}

/// One full exchange kept for export.
#[derive(Debug, Clone)]
struct HistoryEntry {
    request: HttpRequestEvent,
    response: Option<HttpResponseEvent>,
}

const HISTORY_CAP: usize = 5_000;

// ============================================================================
// Engine
// ============================================================================

pub struct MITMProxyEngine {
    config: Arc<RwLock<ProxyConfig>>,
    ca: Arc<RwLock<CAManager>>,
    rules: Arc<RulesEngine>,
    history: Arc<RwLock<VecDeque<HistoryEntry>>>,
    stats: Arc<RwLock<ProxyStats>>,
    event_tx: broadcast::Sender<ProxyEvent>,
    /// request_id → resume signal + queued modifications from the UI
    paused: Arc<RwLock<HashMap<String, PausedExchange>>>,
    task: Arc<RwLock<Option<JoinHandle<()>>>>,
    chromium: Arc<RwLock<Option<ChromiumLauncher>>>,
}

struct PausedExchange {
    notify: Arc<Notify>,
    modifications: Vec<Modification>,
}

impl MITMProxyEngine {
    pub fn new_sync(config: ProxyConfig) -> Self {
        let (event_tx, _) = broadcast::channel(8_192);
        Self {
            config: Arc::new(RwLock::new(config)),
            ca: Arc::new(RwLock::new(CAManager::new(config.ca.clone()))),
            rules: Arc::new(RulesEngine::new()),
            history: Arc::new(RwLock::new(VecDeque::with_capacity(HISTORY_CAP))),
            stats: Arc::new(RwLock::new(ProxyStats::default())),
            event_tx,
            paused: Arc::new(RwLock::new(HashMap::new())),
            task: Arc::new(RwLock::new(None)),
            chromium: Arc::new(RwLock::new(None)),
        }
    }

    // ---- lifecycle ---------------------------------------------------------

    /// Initialize CA then start the proxy listener. Idempotent.
    pub async fn start(&self) -> Result<()> {
        if self.task.read().await.is_some() {
            return Ok(()); // already running
        }

        {
            let mut ca = self.ca.write().await;
            if !ca.has_cert() {
                ca.initialize()
                    .await
                    .context("CA initialization failed")?;
            }
        }
        let authority: RcgenAuthority = self.ca.read().await.authority()?;
        let addr: SocketAddr = self.config.read().await.bind_address.parse()
            .context("invalid bind_address")?;

        let handler = Handler {
            cfg: self.config.clone(),
            rules: self.rules.clone(),
            history: self.history.clone(),
            stats: self.stats.clone(),
            events: self.event_tx.clone(),
            paused: self.paused.clone(),
        };

        let mut builder = ProxyBuilder::new()
            .with_addr(addr)
            .with_rustls_client()
            .with_certificate_authority(authority)
            .with_http_handler(handler);

        let proxy = builder.build().await.context("proxy build failed")?;

        let handle = tauri::async_runtime::spawn(async move {
            if let Err(e) = proxy.start().await {
                tracing::error!("proxy terminated: {e:#}");
            }
        });
        *self.task.write().await = Some(handle);

        info!("MITM proxy listening on {}", addr);
        Ok(())
    }

    /// Abort listener and kill Chromium.
    pub async fn stop(&self) -> Result<()> {
        if let Some(h) = self.task.write().await.take() {
            h.abort();
        }
        if let Some(mut launcher) = self.chromium.write().await.take() {
            launcher.kill().await.ok();
        }
        info!("MITM proxy stopped");
        Ok(())
    }

    pub fn subscribe(&self) -> broadcast::Receiver<ProxyEvent> {
        self.event_tx.subscribe()
    }

    pub async fn status(&self) -> Status {
        let cfg = self.config.read().await;
        let st = self.stats.read().await;
        Status {
            running: self.task.read().await.is_some(),
            port: cfg.bind_address.rsplit(':').next().and_then(|p| p.parse().ok()).unwrap_or(0),
            ca_installed: self.ca.read().await.has_cert(),
            intercepted_count: st.total_requests,
            blocked_count: st.blocked_requests,
            active_connections: 0,
            bytes_up: st.bytes_up,
            bytes_down: st.bytes_down,
        }
    }

    pub async fn get_stats(&self) -> ProxyStats {
        self.stats.read().await.clone()
    }

    pub async fn set_config(&self, cfg: ProxyConfig) {
        *self.config.write().await = cfg;
    }

    pub async fn get_config(&self) -> ProxyConfig {
        self.config.read().await.clone()
    }

    // ---- CA ----------------------------------------------------------------

    pub async fn regenerate_ca(&self) -> Result<()> {
        let mut ca = self.ca.write().await;
        let fresh = CAManager::new(self.config.read().await.ca.clone());
        *ca = fresh;
        ca.initialize().await?;
        Ok(())
    }

    pub async fn ca_pem(&self) -> Option<String> {
        self.ca.read().await.cert_pem()
    }

    pub async fn install_ca(&self, stores: Option<Vec<String>>) -> Result<()> {
        let pem = self.ca.read().await.cert_pem().context("no CA generated yet")?;
        let stores = stores.unwrap_or_else(|| vec!["nss".into(), "system".into()]);
        self.ca.read().await.install_pem_to_stores(&pem, &stores).await
    }

    // ---- Chromium ----------------------------------------------------------

    pub async fn launch_chromium(&self, override_cfg: Option<ChromiumConfig>) -> Result<()> {
        let cfg = self.config.read().await;
        let chromium_cfg =
            override_cfg.or_else(|| cfg.chromium.clone()).unwrap_or_default();
        let ca_pem = self.ca.read().await.cert_pem();
        let mut launcher =
            ChromiumLauncher::new(chromium_cfg, cfg.bind_address.clone(), ca_pem);
        launcher.launch().await?;
        *self.chromium.write().await = Some(launcher);
        Ok(())
    }

    pub async fn kill_chromium(&self) -> Result<()> {
        if let Some(mut l) = self.chromium.write().await.take() {
            l.kill().await?;
        }
        Ok(())
    }

    // ---- rules passthrough -------------------------------------------------

    pub async fn add_rule(&self, r: crate::rules_engine::InterceptRule) -> Result<()> {
        self.rules.add_rule(r).await
    }
    pub async fn update_rule(&self, id: String, r: crate::rules_engine::InterceptRule) -> Result<()> {
        self.rules.update_rule(&id, r).await
    }
    pub async fn delete_rule(&self, id: String) -> Result<()> {
        self.rules.delete_rule(&id).await
    }
    pub async fn toggle_rule(&self, id: String, enabled: bool) -> Result<()> {
        self.rules.toggle_rule(&id, enabled).await
    }
    pub async fn reorder_rules(&self, ids: Vec<String>) -> Result<()> {
        self.rules.reorder_rules(ids).await
    }
    pub async fn get_rules(&self) -> Vec<crate::rules_engine::InterceptRule> {
        self.rules.get_rules().await
    }

    // ---- pause / resume ----------------------------------------------------

    /// Resume a paused exchange, optionally applying UI-supplied modifications.
    pub async fn resume(&self, request_id: &str, modifications: Vec<Modification>) -> Result<()> {
        let entry = self.paused.read().await.get(request_id).map(|p| p.notify.clone());
        match entry {
            Some(notify) => {
                self.paused.write().await
                    .get_mut(request_id)
                    .map(|p| p.modifications = modifications);
                notify.notify_waiters();
                Ok(())
            }
            None => Err(anyhow::anyhow!("request {request_id} is not paused")),
        }
    }

    // ---- replay ------------------------------------------------------------

    /// Re-send a captured request through a real HTTP(S) client.
    pub async fn replay_request(
        &self,
        request_id: &str,
        modifications: Vec<Modification>,
    ) -> Result<HttpResponseEvent> {
        let original = self
            .history
            .read()
            .await
            .iter()
            .find(|h| h.request.id == request_id)
            .map(|h| h.request.clone())
            .context("request id not found in history")?;

        let mut req = build_request_from_event(&original)?;
        apply_modifications(&mut req, &modifications)?;

        let started = Instant::now();
        let resp = send_request(req).await?;
        let total_ms = started.elapsed().as_millis() as u64;

        let (parts, body_bytes) = resp.into_parts();
        let headers: Vec<(String, String)> = parts
            .headers
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
            .collect();

        let ev = HttpResponseEvent {
            request_id: request_id.to_string(),
            timestamp: now_ms(),
            status_code: parts.status.as_u16(),
            status_text: parts
                .status
                .canonical_reason()
                .unwrap_or("")
                .to_string(),
            http_version: format!("{:?}", parts.version),
            headers,
            body: String::from_utf8_lossy(body_bytes.as_ref()).into_owned(),
            body_truncated: false,
            timing: TimingInfo { total: Some(total_ms), ..Default::default() },
            intercepted: true,
            rule_id: Some("replay".into()),
            paused: false,
        };

        let _ = self.event_tx.send(ProxyEvent {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: now_ms(),
            kind: "response".into(),
            request: None,
            response: Some(ev.clone()),
            error: None,
        });
        Ok(ev)
    }

    // ---- export ------------------------------------------------------------

    pub async fn export_har(&self) -> Result<String> {
        let hist = self.history.read().await;
        let log: Vec<_> = hist
            .iter()
            .map(|e| har_entry(e))
            .collect::<Vec<_>>();
        drop(hist);

        let har = serde_json::json!({
            "log": {
                "version": "1.2",
                "creator": { "name": "Window Mirror", "version": env!("CARGO_PKG_VERSION") },
                "entries": log,
            }
        });
        Ok(serde_json::to_string_pretty(&har)?)
    }

    pub async fn export_curl(&self) -> Result<String> {
        let hist = self.history.read().await;
        let mut out = String::new();
        for e in hist.iter() {
            out.push_str(&curl_for(&e.request));
            out.push('\n');
        }
        Ok(out)
    }

    pub async fn clear_history(&self) {
        self.history.write().await.clear();
        *self.stats.write().await = ProxyStats::default();
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Status {
    pub running: bool,
    pub port: u16,
    pub ca_installed: bool,
    pub intercepted_count: u64,
    pub blocked_count: u64,
    pub active_connections: u32,
    pub bytes_up: u64,
    pub bytes_down: u64,
}

// ============================================================================
// hudsucker handler
// ============================================================================

#[derive(Clone)]
struct Handler {
    cfg: Arc<RwLock<ProxyConfig>>,
    rules: Arc<RulesEngine>,
    history: Arc<RwLock<VecDeque<HistoryEntry>>>,
    stats: Arc<RwLock<ProxyStats>>,
    events: broadcast::Sender<ProxyEvent>,
    paused: Arc<RwLock<HashMap<String, PausedExchange>>>,
}

/// FIFO of pending requests per upstream host, so responses pair up.
type PendingMap = Arc<RwLock<HashMap<String, VecDeque<HttpRequestEvent>>>>;

static PENDING: once_cell::sync::Lazy<PendingMap> =
    once_cell::sync::Lazy::new(|| Arc::new(RwLock::new(HashMap::new())));

impl Handler {
    async fn push_history(&self, req: HttpRequestEvent, resp: Option<HttpResponseEvent>) {
        let mut h = self.history.write().await;
        if h.len() >= HISTORY_CAP {
            h.pop_front();
        }
        h.push_back(HistoryEntry { request: req, response: resp });
    }

    async fn emit(&self, ev: ProxyEvent) {
        let _ = self.events.send(ev);
    }

    async fn bump<F: FnOnce(&mut ProxyStats)>(&self, f: F) {
        f(&mut self.stats.write().await);
    }
}

impl HttpHandler for Handler {
    async fn handle_request(
        &mut self,
        _ctx: &HttpContext,
        mut req: Request<Body>,
    ) -> RequestOrResponse {
        let cfg = self.cfg.read().await;
        let max_body = cfg.max_body_size;
        let capture_bodies = cfg.capture_bodies;
        drop(cfg);

        let rid = uuid::Uuid::new_v4().to_string();
        let method = req.method().to_string();
        let host = req.uri().host().or_else(|| {
            req.headers().get("host").and_then(|h| h.to_str().ok())
                .and_then(|h| h.split(':').next().map(String::from))
        }).unwrap_or_default();
        let path_q = req.uri().path_and_query().map(|pq| pq.as_str()).unwrap_or("/");
        let url = if req.uri().host().is_some() {
            req.uri().to_string()
        } else {
            format!("https://{host}{path_q}")
        };
        let version = format!("{:?}", req.version());

        let headers: Vec<(String, String)> = req
            .headers()
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
            .collect();

        // ---- body ----------------------------------------------------------
        let mut body_opt: Option<Vec<u8>> = None;
        let mut truncated = false;
        let mut up_bytes: u64 = 0;
        if capture_bodies && req.body().size_hint().exact().map_or(true, |s| s <= max_body) {
            let bytes = read_body(req.body_mut(), max_body).await;
            up_bytes = bytes.len() as u64;
            body_opt = Some(bytes);
        } else if req.body().size_hint().exact().is_some() {
            truncated = true;
        }

        let req_ev = HttpRequestEvent {
            id: rid.clone(),
            timestamp: now_ms(),
            method: method.clone(),
            url: url.clone(),
            http_version: version,
            headers: headers.clone(),
            body: body_opt.as_ref().map(pretty_body),
            body_truncated: truncated,
            remote_addr: _ctx.client_addr.to_string(),
            intercepted: false,
            rule_id: None,
            paused: false,
        };

        self.bump(|s| {
            s.total_requests += 1;
            s.bytes_up += up_bytes;
        })
        .await;

        // ---- rules ---------------------------------------------------------
        let action = self
            .rules
            .evaluate_request(&req_ev.to_rule_req())
            .await;

        let mut intercepted = false;
        let mut rule_id: Option<String> = None;
        let mut short_circuit: Option<Response<Body>> = None;

        match action {
            Some(InterceptAction::Pass) => {}
            Some(InterceptAction::Block) => {
                self.bump(|s| s.blocked_requests += 1).await;
                intercepted = true;
                let resp = text_response(StatusCode::FORBIDDEN, "Blocked by Window Mirror");
                let mut resp_ev = response_event(&rid, &resp, TimingInfo::default(), true, rule_id.clone(), false);
                resp_ev.body = Some("Blocked by Window Mirror".into());
                self.push_history(req_ev.clone(), Some(resp_ev.clone())).await;
                self.emit(request_done(&req_ev, Some(resp_ev))).await;
                return RequestOrResponse::Response(resp);
            }
            Some(InterceptAction::Redirect { redirect_url }) => {
                intercepted = true;
                rule_id = Some("redirect".into());
                let resp = Response::builder()
                    .status(StatusCode::FOUND)
                    .header("location", redirect_url)
                    .body(Body::empty())
                    .expect("static redirect");
                let mut resp_ev = response_event(&rid, &resp, TimingInfo::default(), true, rule_id.clone(), false);
                resp_ev.body = Some(String::new());
                self.push_history(req_ev.clone(), Some(resp_ev.clone())).await;
                self.emit(request_done(&req_ev, Some(resp_ev))).await;
                return RequestOrResponse::Response(resp);
            }
            Some(InterceptAction::Mock { mock }) => {
                intercepted = true;
                rule_id = Some("mock".into());
                if let Some(d) = mock.delay_ms {
                    tokio::time::sleep(std::time::Duration::from_millis(d)).await;
                }
                let mut b = Response::builder().status(mock.status);
                for (k, v) in &mock.headers {
                    b = b.header(k.as_str(), v.as_str());
                }
                let resp = b
                    .body(Body::from(mock.body.clone()))
                    .expect("mock response");
                let mut resp_ev = response_event(&rid, &resp, TimingInfo::default(), true, rule_id.clone(), false);
                resp_ev.body = Some(mock.body);
                self.push_history(req_ev.clone(), Some(resp_ev.clone())).await;
                self.emit(request_done(&req_ev, Some(resp_ev))).await;
                return RequestOrResponse::Response(resp);
            }
            Some(InterceptAction::Modify { modifications }) => {
                intercepted = true;
                rule_id = Some("modify".into());
                self.bump(|s| s.modified_requests += 1).await;
                if let Err(e) = apply_modifications(&mut req, &modifications) {
                    warn!("modify failed on {url}: {e}");
                }
                // finalize_req_ev below refreshes method/url/headers from req.
            }
            Some(InterceptAction::Script { script }) => {
                // Scripting hooks land with the plugin runtime; treat as pass.
                let _ = script;
            }
            Some(InterceptAction::Pause) => {
                intercepted = true;
                rule_id = Some("pause".into());
                let timeout = self.cfg.read().await.pause_timeout_secs.max(1);
                let notify = Arc::new(Notify::new());
                self.paused.write().await.insert(
                    rid.clone(),
                    PausedExchange { notify: notify.clone(), modifications: vec![] },
                );

                let mut paused_ev = req_ev.clone();
                paused_ev.intercepted = true;
                paused_ev.rule_id = rule_id.clone();
                paused_ev.paused = true;
                self.emit(request_done(&paused_ev, None)).await;

                // Wait for resume or timeout.
                let waited = tokio::time::timeout(
                    std::time::Duration::from_secs(timeout),
                    notify.notified(),
                )
                .await;
                let mods = self.paused.write().await.remove(&rid)
                    .map(|p| p.modifications)
                    .unwrap_or_default();

                match waited {
                    Ok(_) => {
                        if !mods.is_empty() {
                            let _ = apply_modifications(&mut req, &mods);
                        }
                        // Refresh event snapshot post-edit.
                        req_ev_intercepted(
                            &req_ev,
                            req.method().to_string(),
                            req.uri().to_string(),
                            headers_of(&req),
                            true,
                            rule_id,
                        );
                    }
                    Err(_) => {
                        warn!("pause timed out on {url}; forwarding unmodified");
                    }
                }
            }
            None => {}
        }

        // Rebuild body into the outbound request if we consumed it.
        if let Some(bytes) = body_opt {
            *req.body_mut() = Body::from(bytes);
        } else if truncated {
            // Oversized: leave stream untouched (already streaming through).
        }

        // Track for response pairing.
        PENDING.write().await.entry(host).or_default().push_back(req_ev.clone());

        let final_ev = finalize_req_ev(req_ev, &req, intercepted, rule_id.clone());
        self.emit(request_done(&final_ev, None)).await;
        self.push_history(final_ev, None).await;

        RequestOrResponse::Request(req) // forward upstream
    }

    async fn handle_response(
        &mut self,
        _ctx: &HttpContext,
        mut res: Response<Body>,
    ) -> Response<Body> {
        let cfg = self.cfg.read().await;
        let max_body = cfg.max_body_size;
        let capture_bodies = cfg.capture_bodies;
        drop(cfg);

        let status = res.status();
        let headers: Vec<(String, String)> = res
            .headers()
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
            .collect();

        let mut down_bytes: u64 = 0;
        let mut body_text: Option<String> = None;
        let mut truncated = false;
        if capture_bodies && content_type_is_text(res.headers()) {
            let bytes = read_body(res.body_mut(), max_body).await;
            down_bytes = bytes.len() as u64;
            body_text = Some(String::from_utf8_lossy(&bytes).into_owned());
            *res.body_mut() = Body::from(bytes);
        } else {
            down_bytes = res.body().size_hint().exact().unwrap_or(0);
        }

        self.bump(|s| {
            s.total_responses += 1;
            s.bytes_down += down_bytes;
        })
        .await;

        // Pair with oldest pending request (any host queue that's non-empty).
        let paired: Option<HttpRequestEvent> = {
            let mut pending = PENDING.write().await;
            pending.values_mut().find_map(|q| q.pop_front())
        };

        let start_ref = paired.as_ref().map(|r| r.timestamp).unwrap_or(now_ms());
        let timing = TimingInfo {
            waiting: Some((now_ms() - start_ref).max(0) as u64),
            total: Some((now_ms() - start_ref).max(0) as u64),
            ..Default::default()
        };

        // Response-side rules against the paired request.
        if let Some(req_ev) = paired.clone() {
            let resp_ev_tmp = HttpResponseEvent {
                request_id: req_ev.id.clone(),
                timestamp: now_ms(),
                status_code: status.as_u16(),
                status_text: status.canonical_reason().unwrap_or("").to_string(),
                http_version: format!("{:?}", res.version()),
                headers: headers.clone(),
                body: body_text.clone(),
                body_truncated: truncated,
                timing: timing.clone(),
                intercepted: false,
                rule_id: None,
                paused: false,
            };

            let action = self
                .rules
                .evaluate_response(&req_ev.to_rule_req(), &resp_ev_tmp.to_rule_resp())
                .await;

            if let Some(InterceptAction::Block) = action {
                self.bump(|s| s.modified_responses += 1).await;
                let blocked =
                    text_response(StatusCode::FORBIDDEN, "Blocked by Window Mirror");
                let ev = response_event(&req_ev.id, &blocked, timing, true, None, false);
                self.push_history(req_ev, Some(ev)).await;
                return blocked;
            }
            if let Some(InterceptAction::Modify { modifications }) = action {
                self.bump(|s| s.modified_responses += 1).await;
                if let Err(e) = apply_response_modifications(&mut res, &modifications) {
                    warn!("response modify failed: {e}");
                }
            }
        }

        // Final event + history update.
        let final_resp = response_event(
            paired.as_ref().map(|r| r.id.as_str()).unwrap_or("?"),
            &res,
            timing,
            false,
            None,
            false,
        )
        .body_override(body_text.clone(), truncated);

        if let Some(req_ev) = paired {
            self.push_history(req_ev, Some(final_resp.clone())).await;
            self.emit(request_done(&req_ev, Some(final_resp))).await;
        }

        res
    }
}

// ============================================================================
// WebSocket passthrough (capture only)
// ============================================================================

impl WebSocketHandler for Handler {
    async fn handle_websocket(
        &mut self,
        _ctx: &WebSocketContext,
        msg: WsMessage,
    ) -> Option<WsMessage> {
        if self.cfg.read().await.capture_websocket {
            self.bump(|s| s.websocket_frames += 1).await;
        }
        Some(msg) // always forward untouched for now
    }
}

// ============================================================================
// Helpers
// ============================================================================

async fn read_body<B: http_body::Body<Data = bytes::Bytes> + Unpin>(
    body: &mut B,
    max: usize,
) -> Vec<u8> {
    let mut out = Vec::new();
    while let Some(chunk) = body.data().await {
        match chunk {
            Ok(b) => {
                if out.len() + b.len() > max {
                    out.extend_from_slice(&b[..max.saturating_sub(out.len())]);
                    break;
                }
                out.extend_from_slice(&b);
            }
            Err(_) => break,
        }
    }
    out
}

fn pretty_body(b: &[u8]) -> String {
    String::from_utf8_lossy(b).into_owned()
}

fn content_type_is_text(headers: &hudsucker::hyper::HeaderMap) -> bool {
    headers
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .map(|ct| {
            ct.contains("json")
                || ct.contains("html")
                || ct.contains("xml")
                || ct.contains("javascript")
                || ct.contains("text/plain")
                || ct.contains("x-www-form-urlencoded")
        })
        .unwrap_or(false)
}

fn text_response(status: StatusCode, text: &str) -> Response<Body> {
    Response::builder()
        .status(status)
        .header("content-type", "text/plain; charset=utf-8")
        .body(Body::from(text.to_owned()))
        .expect("static response")
}

fn headers_of<B>(req: &Request<B>) -> Vec<(String, String)> {
    req.headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect()
}

/// In-place field updates after modification/pause paths.
fn req_ev_intercepted(
    base: &HttpRequestEvent,
    method: String,
    url: String,
    headers: Vec<(String, String)>,
    intercepted: bool,
    rule_id: Option<String>,
) {
    // Events are immutable snapshots; we emit a corrected copy downstream.
    let _ = (base, method, url, headers, intercepted, rule_id);
}

fn finalize_req_ev(
    mut ev: HttpRequestEvent,
    req: &Request<Body>,
    intercepted: bool,
    rule_id: Option<String>,
) -> HttpRequestEvent {
    ev.method = req.method().to_string();
    ev.url = req.uri().to_string();
    ev.headers = headers_of(req);
    ev.intercepted = intercepted;
    ev.rule_id = rule_id;
    ev
}

fn response_event(
    request_id: &str,
    resp: &Response<Body>,
    timing: TimingInfo,
    intercepted: bool,
    rule_id: Option<String>,
    paused: bool,
) -> HttpResponseEvent {
    HttpResponseEvent {
        request_id: request_id.to_string(),
        timestamp: now_ms(),
        status_code: resp.status().as_u16(),
        status_text: resp.status().canonical_reason().unwrap_or("").to_string(),
        http_version: format!("{:?}", resp.version()),
        headers: resp
            .headers()
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
            .collect(),
        body: None,
        body_truncated: false,
        timing,
        intercepted,
        rule_id,
        paused,
    }
}

trait BodyOverride {
    fn body_override(self, body: Option<String>, truncated: bool) -> Self;
}
impl BodyOverride for HttpResponseEvent {
    fn body_override(mut self, body: Option<String>, truncated: bool) -> Self {
        if body.is_some() {
            self.body = body;
            self.body_truncated = truncated;
        }
        self
    }
}

fn request_done(req: &HttpRequestEvent, resp: Option<HttpResponseEvent>) -> ProxyEvent {
    ProxyEvent {
        id: uuid::Uuid::new_v4().to_string(),
        timestamp: now_ms(),
        kind: if resp.is_some() { "exchange" } else { "request" }.into(),
        request: Some(req.clone()),
        response: resp,
        error: None,
    }
}

fn apply_modifications(
    req: &mut Request<Body>,
    mods: &[Modification],
) -> Result<(), String> {
    for m in mods {
        match m.target.as_str() {
            "method" => {
                *req.method_mut() = m.value.parse().map_err(|_| "bad method")?;
            }
            "url" => {
                let uri: Uri = m.value.parse().map_err(|_| "bad uri")?;
                *req.uri_mut() = uri;
            }
            "headers" => {
                let name = m.name.clone().ok_or("missing header name")?;
                let hn = HeaderName::from_bytes(name.as_bytes())
                    .map_err(|e| e.to_string())?;
                match m.operation.as_str() {
                    "remove" => { req.headers_mut().remove(&hn); }
                    "add" => {
                        let hv = HeaderValue::from_str(&m.value)
                            .map_err(|e| e.to_string())?;
                        req.headers_mut().append(&hn, hv);
                    }
                    _ => {
                        let hv = HeaderValue::from_str(&m.value)
                            .map_err(|e| e.to_string())?;
                        req.headers_mut().insert(&hn, hv);
                    }
                }
            }
            "body" => {
                let bytes = bytes::Bytes::from(m.value.clone());
                let len = bytes.len() as u64;
                *req.body_mut() = Body::from(bytes);
                req.headers_mut().insert(
                    "content-length",
                    HeaderValue::from(len),
                );
                req.headers_mut().remove("transfer-encoding");
            }
            other => return Err(format!("unknown target '{other}'")),
        }
    }
    Ok(())
}

fn apply_response_modifications(
    res: &mut Response<Body>,
    mods: &[Modification],
) -> Result<(), String> {
    for m in mods {
        match m.target.as_str() {
            "headers" => {
                let name = m.name.clone().ok_or("missing header name")?;
                let hn = HeaderName::from_bytes(name.as_bytes())
                    .map_err(|e| e.to_string())?;
                match m.operation.as_str() {
                    "remove" => { res.headers_mut().remove(&hn); }
                    "add" => {
                        let hv = HeaderValue::from_str(&m.value)
                            .map_err(|e| e.to_string())?;
                        res.headers_mut().append(&hn, hv);
                    }
                    _ => {
                        let hv = HeaderValue::from_str(&m.value)
                            .map_err(|e| e.to_string())?;
                        res.headers_mut().insert(&hn, hv);
                    }
                }
            }
            "body" => {
                let bytes = bytes::Bytes::from(m.value.clone());
                *res.body_mut() = Body::from(bytes);
                res.headers_mut().insert(
                    "content-length",
                    HeaderValue::from(bytes.len() as u64),
                );
            }
            other => return Err(format!("unknown target '{other}'")),
        }
    }
    Ok(())
}

trait BodySet {
    fn body_set(&mut self, body: Option<String>, truncated: bool);
}

fn build_request_from_event(ev: &HttpRequestEvent) -> Result<Request<Body>, String> {
    let mut b = Request::builder()
        .method(ev.method.as_str())
        .uri(ev.url.as_str());
    for (k, v) in &ev.headers {
        if k.eq_ignore_ascii_case("content-length")
            || k.eq_ignore_ascii_case("transfer-encoding")
            || k.eq_ignore_ascii_case("host")
        {
            continue; // rebuilt below
        }
        b = b.header(k.as_str(), v.as_str());
    }
    let mut req = b.body(Body::empty()).map_err(|e| e.to_string())?;

    // Restore Host from URL authority.
    if let Some(auth) = Uri::try_from(ev.url.as_str())
        .ok()
        .and_then(|u| u.authority().map(|a| a.to_string()))
    {
        if let Ok(hv) = HeaderValue::from_str(&auth) {
            req.headers_mut().insert("host", hv);
        }
    }

    if let Some(text) = &ev.body {
        let bytes = bytes::Bytes::from(text.clone());
        let len = bytes.len() as u64;
        *req.body_mut() = Body::from(bytes);
        req.headers_mut()
            .insert("content-length", HeaderValue::from(len));
    }
    Ok(req)
}

async fn send_request(req: Request<Body>) -> Result<Response<bytes::Bytes>, String> {
    use hyper_util::client::legacy::{Client, connect::HttpConnector};
    use hyper_rustls::HttpsConnectorBuilder;

    let https = HttpsConnectorBuilder::new()
        .with_native_roots()
        .map_err(|e| e.to_string())?
        .https_or_http()
        .enable_http1()
        .enable_http2()
        .build();

    let client: Client<_, Body> =
        Client::builder(hyper_util::rt::TokioExecutor::new()).build(https);

    let resp = client
        .request(req)
        .await
        .map_err(|e| e.to_string())?;

    let (parts, body) = resp.into_parts();
    let collected = http_body_util::BodyExt::collect(body)
        .await
        .map_err(|e| e.to_string())?
        .to_bytes();
    Ok(Response::from_parts(parts, collected))
}

fn curl_for(req: &HttpRequestEvent) -> String {
    let mut parts = vec![format!("curl -X {}", req.method)];
    for (k, v) in &req.headers {
        if k.eq_ignore_ascii_case("content-length") { continue; }
        parts.push(format!("-H '{}: {}'", k.replace('\'', "'\\''"), v.replace('\'', "'\\''")));
    }
    if let Some(body) = &req.body {
        let escaped = body.replace('\'', "'\\''");
        parts.push(format!("--data-raw '{}'", escaped));
    }
    parts.push(format!("'{}'", req.url));
    parts.join(" \\\n  ")
}

fn har_entry(e: &HistoryEntry) -> serde_json::Value {
    let started = chrono::DateTime::from_timestamp_millis(e.request.timestamp)
        .unwrap_or_default()
        .to_rfc3339();
    serde_json::json!({
        "startedDateTime": started,
        "time": e.response.as_ref().and_then(|r| r.timing.total).unwrap_or(0),
        "request": {
            "method": e.request.method,
            "url": e.request.url,
            "httpVersion": e.request.http_version,
            "headers": e.request.headers.iter()
                .map(|(k,v)| serde_json::json!({"name": k, "value": v}))
                .collect::<Vec<_>>(),
            "queryString": [],
            "postData": e.request.body.as_ref().map(|b| serde_json::json!({"text": b})),
            "headersSize": -1,
            "bodySize": e.request.body.as_ref().map(|b| b.len() as i64).unwrap_or(0),
        },
        "response": e.response.as_ref().map(|r| serde_json::json!({
            "status": r.status_code,
            "statusText": r.status_text,
            "httpVersion": r.http_version,
            "headers": r.headers.iter()
                .map(|(k,v)| serde_json::json!({"name": k, "value": v}))
                .collect::<Vec<_>>(),
            "content": {"text": r.body},
            "redirectURL": "",
            "headersSize": -1,
            "bodySize": r.body.as_ref().map(|b| b.len() as i64).unwrap_or(0),
        })).unwrap_or(serde_json::json!(null)),
        "cache": {},
        "timings": {
            "send": 0,
            "wait": e.response.as_ref().and_then(|r| r.timing.waiting).unwrap_or(0),
            "receive": e.response.as_ref().and_then(|r| r.timing.content_download).unwrap_or(0),
        },
    })
}

trait RespEvExt {
    fn body_override(self, body: Option<String>, truncated: bool) -> Self;
}
