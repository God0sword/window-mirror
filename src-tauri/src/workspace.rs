//! WorkspaceManager — Project-Centric Workspace Management
//!
//! Handles workspace lifecycle, persistence, discovery, and .window-mirror/ config.
//! Phase 1: Local directory-based workspaces with JSON persistence.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use anyhow::Result;
use serde::{Deserialize, Serialize};
use tracing::{debug, info, warn, instrument};
use uuid::Uuid;

use crate::commands::WorkspaceInfo;
use crate::commands::{AppMode, SidebarState};

// ============================================================================
// Workspace Config (.window-mirror/config.toml)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceConfig {
    pub name: String,
    pub mode: AppMode,
    pub sidebar: SidebarState,
    pub ignore_patterns: Vec<String>,
    pub proxy_targets: Vec<String>,
    pub sast_enabled: bool,
    pub sandbox_enabled: bool,
    pub extensions: Vec<String>,
}

impl Default for WorkspaceConfig {
    fn default() -> Self {
        Self {
            name: String::new(),
            mode: AppMode::Zen,
            sidebar: SidebarState::default(),
            ignore_patterns: vec![
                ".git/".into(),
                "node_modules/".into(),
                "target/".into(),
                "dist/".into(),
                ".window-mirror/".into(),
            ],
            proxy_targets: vec!["localhost".into(), "127.0.0.1".into()],
            sast_enabled: true,
            sandbox_enabled: true,
            extensions: Vec::new(),
        }
    }
}

// ============================================================================
// File System Watcher Event
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChange {
    pub path: String,
    pub kind: FileChangeKind,
    pub timestamp: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum FileChangeKind {
    Create,
    Modify,
    Delete,
    Rename,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

// ============================================================================
// Workspace Manager
// ============================================================================

pub struct WorkspaceManager {
    app_data_dir: PathBuf,
    workspaces: HashMap<String, WorkspaceInfo>,
    current: WorkspaceInfo,
}

impl WorkspaceManager {
    pub fn new(app_data_dir: &Path) -> Self {
        info!("Initializing WorkspaceManager, base_dir={:?}", app_data_dir);
        let manager = Self {
            app_data_dir: app_data_dir.to_path_buf(),
            workspaces: HashMap::new(),
            current: WorkspaceInfo {
                id: String::new(),
                name: "default".into(),
                path: String::new(),
                active: true,
                mode: AppMode::Zen,
                sidebar: SidebarState::default(),
                open_files: Vec::new(),
                split_layout: None,
            },
        };

        // Try to load from persisted state
        let _ = manager.load_state();
        manager
    }

    /// Load or create the default workspace
    #[instrument(skip(self))]
    pub fn load_or_create_default(&self) -> WorkspaceInfo {
        let mut manager = WorkspaceManager {
            app_data_dir: self.app_data_dir.clone(),
            workspaces: HashMap::new(),
            current: WorkspaceInfo {
                id: String::new(),
                name: "default".into(),
                path: String::new(),
                mode: AppMode::Zen,
                sidebar: SidebarState::default(),
                open_files: Vec::new(),
                split_layout: None,
                active: true,
            },
        };

        // Check for persisted state
        let state_path = manager.app_data_dir.join("workspace_state.json");
        if state_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&state_path) {
                if let Ok(workspace) = serde_json::from_str::<WorkspaceInfo>(&content) {
                    manager.current = workspace;
                    manager.workspaces.insert(workspace.id.clone(), workspace.clone());
                    info!("Restored workspace: {} ({})", workspace.name, workspace.id);
                    return workspace;
                }
            }
        }

        // Create default workspace from cwd
        let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/tmp"));
        let id = Uuid::new_v4().to_string();
        let workspace = WorkspaceInfo {
            id: id.clone(),
            name: "default".to_string(),
            path: cwd.to_string_lossy().to_string(),
            active: true,
            mode: AppMode::Zen,
            sidebar: SidebarState::default(),
            open_files: Vec::new(),
            split_layout: None,
        };

        manager.workspaces.insert(id.clone(), workspace.clone());
        manager.current = workspace.clone();

        // Initialize .window-mirror directory
        let wm_dir = cwd.join(".window-mirror");
        let _ = std::fs::create_dir_all(&wm_dir);
        let config_path = wm_dir.join("config.toml");
        if !config_path.exists() {
            let config = WorkspaceConfig::default();
            let config_str = toml::to_string(&config).unwrap_or_default();
            let _ = std::fs::write(&config_path, config_str);
        }

        info!("Created default workspace: {}", workspace.name);
        workspace
    }

    /// Create a new workspace at the given path
    pub fn create_workspace(&self, name: &str, path: &str) -> Result<WorkspaceInfo> {
        let workspace_path = Path::new(path).join(name);
        std::fs::create_dir_all(&workspace_path)?;

        // Create .window-mirror config
        let wm_dir = workspace_path.join(".window-mirror");
        std::fs::create_dir_all(&wm_dir)?;
        let config = WorkspaceConfig::with_name(name.to_string());
        let config_path = wm_dir.join("config.toml");
        let config_str = toml::to_string(&config).unwrap_or_default();
        std::fs::write(&config_path, config_str)?;

        let id = Uuid::new_v4().to_string();
        let workspace = WorkspaceInfo {
            id,
            name: name.to_string(),
            path: workspace_path.to_string_lossy().to_string(),
            active: true,
            mode: AppMode::Zen,
            sidebar: SidebarState::default(),
            open_files: Vec::new(),
            split_layout: None,
        };

        self.save_workspace(&workspace)?;
        info!("Created workspace: {}", workspace.name);
        Ok(workspace)
    }

    /// Switch to a different workspace
    pub fn switch_workspace(&self, id: &str) -> Result<WorkspaceInfo> {
        let state_path = self.app_data_dir.join("workspaces").join(format!("{}.json", id));
        if let Ok(content) = std::fs::read_to_string(&state_path) {
            let workspace: WorkspaceInfo = serde_json::from_str(&content)?;
            info!("Switched to workspace: {}", workspace.name);
            Ok(workspace)
        } else {
            Err(anyhow::anyhow!("Workspace not found: {}", id))
        }
    }

    /// Load persisted state
    fn load_state(&self) -> Result<()> {
        let state_path = self.app_data_dir.join("workspace_state.json");
        if state_path.exists() {
            let content = std::fs::read_to_string(&state_path)?;
            let workspace: WorkspaceInfo = serde_json::from_str(&content)?;
            info!("Loaded workspace: {}", workspace.name);
        }
        Ok(())
    }

    /// Save a workspace to disk
    pub fn save_workspace(&self, workspace: &WorkspaceInfo) -> Result<()> {
        let ws_dir = self.app_data_dir.join("workspaces");
        let _ = std::fs::create_dir_all(&ws_dir);
        let ws_path = ws_dir.join(format!("{}.json", workspace.id));
        let content = serde_json::to_string(workspace)?;
        std::fs::write(&ws_path, content)?;
        Ok(())
    }

    /// List all workspaces
    pub fn list_workspaces(&self) -> Vec<WorkspaceInfo> {
        let ws_dir = self.app_data_dir.join("workspaces");
        let mut workspaces = Vec::new();

        if let Ok(entries) = std::fs::read_dir(&ws_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map_or(false, |ext| ext == "json") {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        if let Ok(ws) = serde_json::from_str::<WorkspaceInfo>(&content) {
                            workspaces.push(ws);
                        }
                    }
                }
            }
        }

        workspaces
    }

    /// Read .window-mirror/config.toml from a workspace directory
    pub fn load_config(workspace_path: &Path) -> WorkspaceConfig {
        let config_path = workspace_path.join(".window-mirror").join("config.toml");
        if config_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&config_path) {
                if let Ok(config) = toml::from_str::<WorkspaceConfig>(&content) {
                    return config;
                }
            }
        }
        WorkspaceConfig::default()
    }

    /// Get the current workspace
    pub fn current(&self) -> &WorkspaceInfo {
        &self.current
    }
}

impl WorkspaceConfig {
    fn with_name(name: String) -> Self {
        Self {
            name,
            ..Default::default()
        }
    }
}
