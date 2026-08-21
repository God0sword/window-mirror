//! Tauri Commands — Public API for Frontend

use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State, Window};
use uuid::Uuid;

use crate::state::AppState;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AppMode {
    Zen,
    Telemetry,
    Focus,
    Interrogation,
}

impl Default for AppMode {
    fn default() -> Self {
        AppMode::Zen
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SidebarState {
    pub visible: bool,
    pub width: f32,
    pub collapsed: bool,
    pub active_panel: SidebarPanel,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SidebarPanel {
    Files,
    Workspaces,
    Timeline,
    Extensions,
    Settings,
}

impl Default for SidebarState {
    fn default() -> Self {
        Self {
            visible: true,
            width: 280.0,
            collapsed: false,
            active_panel: SidebarPanel::Files,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileTab {
    pub id: String,
    pub path: String,
    pub name: String,
    pub language: String,
    pub dirty: bool,
    pub mode: AppMode,
    pub cursor_position: Option<CursorPosition>,
    pub scroll_position: Option<ScrollPosition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorPosition {
    pub line: u32,
    pub column: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScrollPosition {
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceInfo {
    pub id: String,
    pub name: String,
    pub path: String,
    pub active: bool,
    pub mode: AppMode,
    pub sidebar: SidebarState,
    pub open_files: Vec<FileTab>,
    pub split_layout: Option<SplitLayout>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SplitLayout {
    pub direction: SplitDirection,
    pub panes: Vec<Pane>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SplitDirection {
    Horizontal,
    Vertical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pane {
    pub id: String,
    pub kind: PaneKind,
    pub size: f32, // Percentage
    pub active_tab: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PaneKind {
    Editor,
    Timeline,
    Inspector,
    Console,
    TargetView,
    ControlPanel,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyStatus {
    pub running: bool,
    pub port: u16,
    pub ca_installed: bool,
    pub intercepted_count: u64,
    pub active_connections: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MirrorEventSummary {
    pub id: String,
    pub timestamp: String,
    pub kind: EventKind,
    pub summary: String,
    pub source_location: Option<SourceLocation>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum EventKind {
    Network,
    Dom,
    Storage,
    Console,
    Error,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceLocation {
    pub file: String,
    pub line: u32,
    pub column: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub theme: Theme,
    pub animations: AnimationConfig,
    pub editor: EditorSettings,
    pub proxy: ProxySettings,
    pub sandbox: SandboxSettings,
    pub security: SecuritySettings,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Theme {
    Dark,
    Light,
    System,
    Custom(String), // CSS variable set name
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnimationConfig {
    pub enabled: bool,
    pub speed: AnimationSpeed,
    pub reduced_motion: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AnimationSpeed {
    None,
    Fast,
    Normal,
    Slow,
    Custom(u32), // ms
}

impl Default for AnimationConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            speed: AnimationSpeed::Normal,
            reduced_motion: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditorSettings {
    pub font_size: u32,
    pub font_family: String,
    pub tab_size: u32,
    pub word_wrap: bool,
    pub minimap: bool,
    pub line_numbers: bool,
    pub format_on_save: bool,
    pub auto_save: bool,
    pub lint_on_change: bool,
}

impl Default for EditorSettings {
    fn default() -> Self {
        Self {
            font_size: 14,
            font_family: "'JetBrains Mono', 'Fira Code', monospace".into(),
            tab_size: 2,
            word_wrap: true,
            minimap: false,
            line_numbers: true,
            format_on_save: true,
            auto_save: true,
            lint_on_change: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxySettings {
    pub port: u16,
    pub auto_start: bool,
    pub intercept_https: bool,
    pub capture_bodies: bool,
    pub max_body_size: usize,
    pub ignore_hosts: Vec<String>,
}

impl Default for ProxySettings {
    fn default() -> Self {
        Self {
            port: 8080,
            auto_start: false,
            intercept_https: true,
            capture_bodies: true,
            max_body_size: 10 * 1024 * 1024, // 10MB
            ignore_hosts: vec!["localhost".into(), "127.0.0.1".into()],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxSettings {
    pub default_backend: SandboxBackend,
    pub wasm_fuel_limit: Option<u64>,
    pub memory_limit_mb: u64,
    pub timeout_seconds: u64,
    pub allow_network: bool,
    pub allow_fs: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SandboxBackend {
    Wasmtime,
    Firecracker,
    Gvisor,
    Native,
}

impl Default for SandboxSettings {
    fn default() -> Self {
        Self {
            default_backend: SandboxBackend::Wasmtime,
            wasm_fuel_limit: Some(10_000_000),
            memory_limit_mb: 128,
            timeout_seconds: 30,
            allow_network: false,
            allow_fs: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecuritySettings {
    pub encrypt_sessions: bool,
    pub session_password: Option<String>, // Hashed
    pub require_auth: bool,
    pub audit_log: bool,
}

impl Default for SecuritySettings {
    fn default() -> Self {
        Self {
            encrypt_sessions: false,
            session_password: None,
            require_auth: false,
            audit_log: true,
        }
    }
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: Theme::System,
            animations: AnimationConfig::default(),
            editor: EditorSettings::default(),
            proxy: ProxySettings::default(),
            sandbox: SandboxSettings::default(),
            security: SecuritySettings::default(),
        }
    }
}

// ============================================================================
// Window/Mode Commands
// ============================================================================

#[tauri::command]
pub async fn get_current_mode(state: State<'_, AppState>) -> Result<AppMode, String> {
    Ok(state.ui.read().await.current_mode.clone())
}

#[tauri::command]
pub async fn set_mode(mode: AppMode, state: State<'_, AppState>) -> Result<(), String> {
    let mut ui = state.ui.write().await;
    ui.current_mode = mode.clone();
    // Persist per workspace
    state.persist_ui_state().await.map_err(|e| e.to_string())?;
    // Emit event for frontend
    state.emit_mode_change(mode).await;
    Ok(())
}

#[tauri::command]
pub async fn toggle_sidebar(state: State<'_, AppState>) -> Result<SidebarState, String> {
    let mut ui = state.ui.write().await;
    ui.sidebar.visible = !ui.sidebar.visible;
    let sidebar = ui.sidebar.clone();
    state.persist_ui_state().await.map_err(|e| e.to_string())?;
    state.emit_sidebar_change(sidebar.clone()).await;
    Ok(sidebar)
}

#[tauri::command]
pub async fn get_sidebar_state(state: State<'_, AppState>) -> Result<SidebarState, String> {
    Ok(state.ui.read().await.sidebar.clone())
}

// ============================================================================
// Editor Commands
// ============================================================================

#[tauri::command]
pub async fn open_file(path: String, state: State<'_, AppState>) -> Result<FileTab, String> {
    // Validate path
    let path = std::path::PathBuf::from(&path);
    if !path.exists() {
        return Err(format!("File not found: {}", path.display()));
    }

    let content = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let language = detect_language(&path);
    let id = Uuid::new_v4().to_string();

    let tab = FileTab {
        id: id.clone(),
        path: path.to_string_lossy().to_string(),
        name: path.file_name().unwrap_or_default().to_string_lossy().to_string(),
        language,
        dirty: false,
        mode: AppMode::Zen,
        cursor_position: None,
        scroll_position: None,
    };

    // Add to open files
    let mut files = state.open_files.write().await;
    files.insert(id.clone(), tab.clone());

    // Emit event
    state.emit_file_opened(tab.clone()).await;

    Ok(tab)
}

#[tauri::command]
pub async fn save_file(id: String, content: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut files = state.open_files.write().await;
    let tab = files.get_mut(&id).ok_or("File not found")?;

    tokio::fs::write(&tab.path, &content)
        .await
        .map_err(|e| format!("Failed to write file: {}", e))?;

    tab.dirty = false;
    state.emit_file_saved(tab.clone()).await;
    Ok(())
}

#[tauri::command]
pub async fn close_file(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut files = state.open_files.write().await;
    if files.remove(&id).is_none() {
        return Err("File not found".into());
    }
    state.emit_file_closed(id).await;
    Ok(())
}

#[tauri::command]
pub async fn get_open_files(state: State<'_, AppState>) -> Result<Vec<FileTab>, String> {
    Ok(state.open_files.read().await.values().cloned().collect())
}

// ============================================================================
// Workspace Commands
// ============================================================================

#[tauri::command]
pub async fn get_workspace_state(state: State<'_, AppState>) -> Result<WorkspaceInfo, String> {
    Ok(state.workspace.read().await.current.clone())
}

#[tauri::command]
pub async fn create_workspace(name: String, path: String, state: State<'_, AppState>) -> Result<WorkspaceInfo, String> {
    let workspace_path = std::path::PathBuf::from(&path).join(&name);
    tokio::fs::create_dir_all(&workspace_path)
        .await
        .map_err(|e| format!("Failed to create workspace: {}", e))?;

    let id = Uuid::new_v4().to_string();
    let workspace = WorkspaceInfo {
        id: id.clone(),
        name,
        path: workspace_path.to_string_lossy().to_string(),
        active: true,
        mode: AppMode::Zen,
        sidebar: SidebarState::default(),
        open_files: Vec::new(),
        split_layout: None,
    };

    let mut ws = state.workspace.write().await;
    ws.workspaces.insert(id.clone(), workspace.clone());
    ws.current = workspace.clone();
    state.persist_workspace().await.map_err(|e| e.to_string())?;

    Ok(workspace)
}

#[tauri::command]
pub async fn switch_workspace(id: String, state: State<'_, AppState>) -> Result<WorkspaceInfo, String> {
    let mut ws = state.workspace.write().await;
    let workspace = ws.workspaces.get(&id).cloned().ok_or("Workspace not found")?;
    ws.current = workspace.clone();
    state.persist_workspace().await.map_err(|e| e.to_string())?;
    state.emit_workspace_change(workspace.clone()).await;
    Ok(workspace)
}

// ============================================================================
// Proxy/Mirror Commands — every command wired to MITMProxyEngine
// ============================================================================

#[tauri::command]
pub async fn start_proxy(state: State<'_, AppState>) -> Result<ProxyStatus, String> {
    state.proxy.start().await.map_err(|e| e.to_string())?;
    let s = state.proxy.status().await;
    Ok(ProxyStatus {
        running: s.running,
        port: s.port,
        ca_installed: s.ca_installed,
        intercepted_count: s.intercepted_count,
        active_connections: s.active_connections,
    })
}

#[tauri::command]
pub async fn stop_proxy(state: State<'_, AppState>) -> Result<(), String> {
    state.proxy.stop().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_proxy_status(state: State<'_, AppState>) -> Result<ProxyStatus, String> {
    let s = state.proxy.status().await;
    Ok(ProxyStatus {
        running: s.running,
        port: s.port,
        ca_installed: s.ca_installed,
        intercepted_count: s.intercepted_count,
        active_connections: s.active_connections,
    })
}

#[tauri::command]
pub async fn get_proxy_config(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let cfg = state.proxy.get_config().await;
    serde_json::to_value(cfg).map_err(|e| e.to_string())
}

/// NOTE: port/bind changes require proxy restart to take effect.
#[tauri::command]
pub async fn set_proxy_config(config: serde_json::Value, state: State<'_, AppState>) -> Result<(), String> {
    let cfg: crate::mitm_proxy::ProxyConfig =
        serde_json::from_value(config).map_err(|e| format!("invalid proxy config: {e}"))?;
    state.proxy.set_config(cfg).await;
    Ok(())
}

#[tauri::command]
pub async fn generate_ca(state: State<'_, AppState>) -> Result<String, String> {
    state.proxy.regenerate_ca().await.map_err(|e| e.to_string())?;
    state.proxy.ca_pem().await.ok_or_else(|| "CA generated but PEM unavailable".to_string())
}

#[tauri::command]
pub async fn get_ca_pem(state: State<'_, AppState>) -> Result<Option<String>, String> {
    Ok(state.proxy.ca_pem().await)
}

/// Guided copy-paste flow: frontend renders the returned PEM + the two sudo
/// commands; nothing here ever elevates privileges itself.
#[tauri::command]
pub async fn install_ca(stores: Option<Vec<String>>, state: State<'_, AppState>) -> Result<(), String> {
    state.proxy.install_ca(stores).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn launch_chromium(config: Option<serde_json::Value>, state: State<'_, AppState>) -> Result<(), String> {
    let override_cfg = match config {
        Some(v) if !v.is_null() => Some(
            serde_json::from_value::<crate::chromium_launcher::ChromiumConfig>(v)
                .map_err(|e| format!("invalid chromium config: {e}"))?,
        ),
        _ => None,
    };
    state.proxy.launch_chromium(override_cfg).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn kill_chromium(state: State<'_, AppState>) -> Result<(), String> {
    state.proxy.kill_chromium().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_proxy_rules(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let rules = state.proxy.get_rules().await;
    serde_json::to_value(rules).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_proxy_rule(rule: serde_json::Value, state: State<'_, AppState>) -> Result<(), String> {
    let rule: crate::rules_engine::InterceptRule =
        serde_json::from_value(rule).map_err(|e| format!("invalid rule: {e}"))?;
    state.proxy.add_rule(rule).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_proxy_rule(id: String, rule: serde_json::Value, state: State<'_, AppState>) -> Result<(), String> {
    let rule: crate::rules_engine::InterceptRule =
        serde_json::from_value(rule).map_err(|e| format!("invalid rule: {e}"))?;
    state.proxy.update_rule(id, rule).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_proxy_rule(id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.proxy.delete_rule(id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn toggle_proxy_rule(id: String, enabled: bool, state: State<'_, AppState>) -> Result<(), String> {
    state.proxy.toggle_rule(id, enabled).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reorder_proxy_rules(ids: Vec<String>, state: State<'_, AppState>) -> Result<(), String> {
    state.proxy.reorder_rules(ids).await.map_err(|e| e.to_string())
}

/// Resume a paused exchange, optionally applying UI edits before forwarding.
#[tauri::command]
pub async fn resume_proxy_request(
    request_id: String,
    modifications: Option<serde_json::Value>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mods: Vec<crate::rules_engine::Modification> = match modifications {
        Some(v) if !v.is_null() => serde_json::from_value(v).map_err(|e| e.to_string())?,
        _ => vec![],
    };
    state.proxy.resume(&request_id, mods).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn replay_proxy_request(
    request_id: String,
    modifications: Option<serde_json::Value>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let mods: Vec<crate::rules_engine::Modification> = match modifications {
        Some(v) if !v.is_null() => serde_json::from_value(v).map_err(|e| e.to_string())?,
        _ => vec![],
    };
    let resp = state.proxy.replay_request(&request_id, mods).await.map_err(|e| e.to_string())?;
    serde_json::to_value(resp).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_proxy_har(_format: String, _options: Option<serde_json::Value>, state: State<'_, AppState>) -> Result<String, String> {
    state.proxy.export_har().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_proxy_curl(_session_id: Option<String>, state: State<'_, AppState>) -> Result<String, String> {
    state.proxy.export_curl().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_proxy_history(state: State<'_, AppState>) -> Result<(), String> {
    state.proxy.clear_history().await;
    Ok(())
}

#[tauri::command]
pub async fn get_proxy_stats(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let stats = state.proxy.get_stats().await;
    serde_json::to_value(stats).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_recent_events(limit: Option<u32>, state: State<'_, AppState>) -> Result<Vec<MirrorEventSummary>, String> {
    let limit = limit.unwrap_or(100) as usize;
    Ok(state.timeline.recent(limit).await)
}

// ============================================================================
// Settings Commands
// ============================================================================

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    Ok(state.settings.read().await.settings.clone())
}

#[tauri::command]
pub async fn update_settings(settings: Settings, state: State<'_, AppState>) -> Result<(), String> {
    let mut s = state.settings.write().await;
    *s = settings.clone();
    state.persist_settings().await.map_err(|e| e.to_string())?;
    state.emit_settings_change(settings).await;
    Ok(())
}

// ============================================================================
// Internal Commands
// ============================================================================

#[tauri::command]
pub async fn internal_start_services(handle: AppHandle) -> Result<(), String> {
    tracing::info!("Starting Window Mirror background services");

    let state: tauri::State<AppState> = handle
        .try_state::<AppState>()
        .map_err(|_| "AppState not found".to_string())?;

    // Wire event bus into proxy service (so proxy can stream events)
    let _bus = state.event_bus.clone();
    tracing::debug!("ProxyService connected to InternalEventBus");

    // Log startup
    let settings = state.settings.read().await;
    if settings.settings.proxy.auto_start {
        drop(settings);
        state.proxy.start().await.map_err(|e| {
            tracing::error!("Failed to auto-start proxy: {}", e);
            e
        })?;
        tracing::info!("Proxy auto-started on port {}", state.proxy.status().await.port);
    } else {
        tracing::info!("Proxy auto-start disabled (enable in settings)");
    }

    tracing::info!("Background services initialized");
    Ok(())
}

#[tauri::command]
pub async fn internal_shutdown_services(handle: AppHandle) -> Result<(), String> {
    tracing::info!("Shutting down Window Mirror background services");
    // TODO: Implement graceful shutdown
    Ok(())
}

// ============================================================================
// Helpers
// ============================================================================

fn detect_language(path: &std::path::Path) -> String {
    match path.extension().and_then(|s| s.to_str()) {
        Some("rs") => "rust",
        Some("ts") | Some("tsx") => "typescript",
        Some("js") | Some("jsx") => "javascript",
        Some("py") => "python",
        Some("go") => "go",
        Some("c") | Some("h") => "c",
        Some("cpp") | Some("cc") | Some("cxx") | Some("hpp") => "cpp",
        Some("cs") => "csharp",
        Some("java") => "java",
        Some("kt") => "kotlin",
        Some("swift") => "swift",
        Some("rb") => "ruby",
        Some("php") => "php",
        Some("html") | Some("htm") => "html",
        Some("css") | Some("scss") | Some("sass") => "css",
        Some("json") => "json",
        Some("toml") => "toml",
        Some("yaml") | Some("yml") => "yaml",
        Some("md") | Some("markdown") => "markdown",
        Some("sh") | Some("bash") => "shell",
        Some("ps1") => "powershell",
        Some("sql") => "sql",
        Some("dockerfile") | Some("containerfile") => "dockerfile",
        Some("tf") | Some("hcl") => "hcl",
        Some("proto") => "protobuf",
        Some("graphql") | Some("gql") => "graphql",
        _ => "plaintext",
    }
    .to_string()
}