//! AppState — Central Application State
//!
//! One source of truth shared by every Tauri command and background service.
//! Mutable state sits behind async RwLocks; services are constructed once here.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::Manager;
use tauri::AppHandle;
use tokio::sync::RwLock;
use tracing::instrument;

use crate::commands::{AppMode, Settings, SidebarState, WorkspaceInfo};
use crate::events::InternalEventBus;
use crate::mitm_proxy::{CAConfig as MitmCaConfig, MITMProxyEngine, ProxyConfig as MitmProxyConfig};
use crate::sandbox::SandboxService;
use crate::timeline::TimelineStore;
use crate::workspace::WorkspaceManager;

// ============================================================================
// UI State (mode, sidebar, per-file)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiState {
    pub current_mode: AppMode,
    pub sidebar: SidebarState,
    pub sidebar_panels: HashMap<String, SidebarState>,
    pub file_state: HashMap<String, FileUiState>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FileUiState {
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

// ============================================================================
// Workspace / Files / Settings containers
// ============================================================================

pub struct WorkspaceState {
    pub workspaces: HashMap<String, WorkspaceInfo>,
    pub current: WorkspaceInfo,
    pub manager: WorkspaceManager,
}

pub struct OpenFiles {
    pub files: HashMap<String, crate::commands::FileTab>,
}

pub struct SettingsState {
    pub settings: Settings,
    pub config_dir: PathBuf,
}

// ============================================================================
// AppState — Root
// ============================================================================

pub struct AppState {
    pub handle: AppHandle,

    // Core state
    pub ui: Arc<RwLock<UiState>>,
    pub workspace: Arc<RwLock<WorkspaceState>>,
    pub open_files: Arc<RwLock<OpenFiles>>,
    pub settings: Arc<RwLock<SettingsState>>,

    // Services
    /// THE proxy engine (hudsucker). Legacy ProxyService was removed.
    pub proxy: Arc<MITMProxyEngine>,
    pub timeline: Arc<TimelineStore>,
    pub sandbox: Arc<SandboxService>,

    // Internal event bus for high-throughput streaming
    pub event_bus: Arc<InternalEventBus>,

    // App data directory
    pub app_data_dir: PathBuf,
}

impl AppState {
    /// Fully synchronous construction. Long-running work (CA generation,
    /// listener bind) happens later in [`setup_app`] / explicit commands.
    pub fn new(handle: AppHandle) -> Self {
        let app_data_dir = Self::get_app_data_dir(&handle);

        // ---- directories ---------------------------------------------------
        let config_dir = app_data_dir.join("config");
        let _ = std::fs::create_dir_all(&config_dir);
        let _ = std::fs::create_dir_all(app_data_dir.join("timeline"));
        let _ = std::fs::create_dir_all(app_data_dir.join("workspaces"));

        // ---- settings ------------------------------------------------------
        let settings_path = config_dir.join("settings.json");
        let settings_state = Self::load_settings(&settings_path);
        let settings = settings_state.settings.clone();

        // ---- workspaces ----------------------------------------------------
        let workspace_manager = WorkspaceManager::new(&app_data_dir);
        let current_workspace = workspace_manager.load_or_create_default();

        let mut workspaces = HashMap::new();
        workspaces.insert(current_workspace.id.clone(), current_workspace.clone());
        let workspace_state = WorkspaceState {
            workspaces,
            current: current_workspace,
            manager: workspace_manager,
        };

        // ---- services --------------------------------------------------------
        let proxy = Arc::new(MITMProxyEngine::new_sync(Self::build_proxy_config(&settings)));
        let timeline = Arc::new(TimelineStore::new(app_data_dir.join("timeline")));
        let sandbox = Arc::new(SandboxService::new());

        // Event bus needs the AppHandle so it can emit straight to the UI.
        let event_bus = Arc::new(InternalEventBus::new(handle.clone(), 65_536));

        Self {
            handle,
            ui: Arc::new(RwLock::new(UiState {
                current_mode: AppMode::default(),
                sidebar: SidebarState::default(),
                sidebar_panels: HashMap::new(),
                file_state: HashMap::new(),
            })),
            workspace: Arc::new(RwLock::new(workspace_state)),
            open_files: Arc::new(RwLock::new(OpenFiles { files: HashMap::new() })),
            settings: Arc::new(RwLock::new(settings_state)),
            proxy,
            timeline,
            sandbox,
            event_bus,
            app_data_dir,
        }
    }

    /// Map user-facing settings onto the engine's config.
    fn build_proxy_config(settings: &Settings) -> MitmProxyConfig {
        let p = &settings.proxy;
        MitmProxyConfig {
            bind_address: format!("127.0.0.1:{}", p.port),
            ca: MitmCaConfig {
                cert_path: None, // default location under $DATA/window-mirror/ca
                key_path: None,
                generate: true,
                common_name: Some("Window Mirror MITM CA".into()),
                organization: Some("Window Mirror".into()),
                validity_days: Some(3650),
                auto_install: false, // guided copy-paste wizard installs instead
                trust_stores: Some(vec!["nss".into(), "system".into()]),
            },
            intercept_https: p.intercept_https,
            capture_bodies: p.capture_bodies,
            max_body_size: p.max_body_size,
            capture_websocket: true,
            pause_timeout_secs: 30,
            chromium: p.auto_start.then_some(Default::default()),
        }
    }

    pub fn get_app_data_dir(handle: &AppHandle) -> PathBuf {
        #[cfg(target_os = "linux")]
        {
            if let Some(dir) = std::env::var("XDG_DATA_HOME")
                .ok()
                .map(PathBuf::from)
                .or_else(|| dirs::home_dir().map(|h| h.join(".local/share")))
            {
                return dir.join("window-mirror");
            }
        }

        handle
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| PathBuf::from("/tmp/window-mirror"))
    }

    fn load_settings(path: &PathBuf) -> SettingsState {
        let fallback_dir = path
            .parent()
            .unwrap_or(PathBuf::from("/tmp").as_path())
            .to_path_buf();

        let defaults = || SettingsState {
            settings: Settings::default(),
            config_dir: fallback_dir.clone(),
        };

        if !path.exists() {
            return defaults();
        }
        let content = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!("settings unreadable ({}), using defaults", e);
                return defaults();
            }
        };
        match serde_json::from_str::<Settings>(&content) {
            Ok(settings) => SettingsState { settings, config_dir: fallback_dir },
            Err(e) => {
                tracing::warn!("settings parse failed ({}), using defaults", e);
                defaults()
            }
        }
    }

    // =========================================================================
    // Persistence (called from commands.rs)
    // =========================================================================

    #[instrument(skip(self))]
    pub async fn persist_ui_state(&self) -> Result<(), String> {
        let ui = self.ui.read().await;
        let ws = self.workspace.read().await;

        let payload = serde_json::json!({
            "current_mode": ui.current_mode,
            "sidebar": ui.sidebar,
            "file_state": ui.file_state,
        });
        tokio::fs::write(self.app_data_dir.join("ui_state.json"), payload.to_string())
            .await
            .map_err(|e| format!("persist ui_state: {e}"))?;

        for (id, workspace) in &ws.workspaces {
            let ws_path = self.app_data_dir.join("workspaces").join(format!("{id}.json"));
            let content = serde_json::to_string(workspace).map_err(|e| e.to_string())?;
            tokio::fs::write(ws_path, content)
                .await
                .map_err(|e| format!("persist workspace: {e}"))?;
        }
        Ok(())
    }

    #[instrument(skip(self))]
    pub async fn persist_workspace(&self) -> Result<(), String> {
        let ws = self.workspace.read().await;
        let content = serde_json::to_string(&ws.current).map_err(|e| e.to_string())?;
        tokio::fs::write(self.app_data_dir.join("workspace_state.json"), content)
            .await
            .map_err(|e| format!("persist workspace_state: {e}"))
    }

    #[instrument(skip(self))]
    pub async fn persist_settings(&self) -> Result<(), String> {
        let s = self.settings.read().await;
        let content = serde_json::to_string_pretty(&s.settings).map_err(|e| e.to_string())?;
        tokio::fs::write(s.config_dir.join("settings.json"), content)
            .await
            .map_err(|e| format!("persist settings: {e}"))
    }

    // =========================================================================
    // Emit helpers → InternalEventBus → Tauri frontend channels
    // =========================================================================

    pub async fn emit_mode_change(&self, mode: AppMode) {
        let ev = crate::events::ModeChangeEvent {
            mode,
            previous_mode: None,
            timestamp: Utc::now().to_rfc3339(),
        };
        self.event_bus.emit_app_event(
            crate::events::CHANNEL_MODE_CHANGE,
            crate::events::AppEvent::ModeChange(ev),
        );
    }

    pub async fn emit_sidebar_change(&self, sidebar: SidebarState) {
        let ev = crate::events::SidebarChangeEvent {
            sidebar,
            timestamp: Utc::now().to_rfc3339(),
        };
        self.event_bus.emit_app_event(
            crate::events::CHANNEL_SIDEBAR_CHANGE,
            crate::events::AppEvent::SidebarChange(ev),
        );
    }

    pub async fn emit_file_opened(&self, file: crate::commands::FileTab) {
        let ev = crate::events::FileEvent { file, timestamp: Utc::now().to_rfc3339() };
        self.event_bus.emit_app_event(
            crate::events::CHANNEL_FILE_OPENED,
            crate::events::AppEvent::FileOpened(ev),
        );
    }

    pub async fn emit_file_saved(&self, file: crate::commands::FileTab) {
        let ev = crate::events::FileEvent { file, timestamp: Utc::now().to_rfc3339() };
        self.event_bus.emit_app_event(
            crate::events::CHANNEL_FILE_SAVED,
            crate::events::AppEvent::FileSaved(ev),
        );
    }

    pub async fn emit_file_closed(&self, file_id: String) {
        let ev = crate::events::FileClosedEvent {
            file_id,
            timestamp: Utc::now().to_rfc3339(),
        };
        self.event_bus.emit_app_event(
            crate::events::CHANNEL_FILE_CLOSED,
            crate::events::AppEvent::FileClosed(ev),
        );
    }

    pub async fn emit_workspace_change(&self, workspace: WorkspaceInfo) {
        let ev = crate::events::WorkspaceChangeEvent {
            workspace,
            previous_workspace_id: None,
            timestamp: Utc::now().to_rfc3339(),
        };
        self.event_bus.emit_app_event(
            crate::events::CHANNEL_WORKSPACE_CHANGE,
            crate::events::AppEvent::WorkspaceChange(ev),
        );
    }

    pub async fn emit_settings_change(&self, settings: Settings) {
        let ev = crate::events::SettingsChangeEvent {
            settings,
            timestamp: Utc::now().to_rfc3339(),
        };
        self.event_bus.emit_app_event(
            crate::events::CHANNEL_SETTINGS_CHANGE,
            crate::events::AppEvent::SettingsChange(ev),
        );
    }

    pub fn emit_log(
        &self,
        level: &str,
        target: &str,
        message: &str,
        fields: Option<serde_json::Value>,
    ) {
        self.event_bus.emit_log(level, target, message, fields);
    }
}
