//! Event System — Tauri Channels for Real-time Communication
//!
//! Provides:
//! - Channel name constants for frontend Tauri event listeners
//! - Event payload types (serialized to frontend)
//! - InternalEventBus for high-throughput Rust-internal streaming

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast;

use crate::commands::{
    AppMode, MirrorEventSummary, ProxyStatus, Settings, SidebarState, WorkspaceInfo,
};
use crate::timeline::MirrorEvent;

// ============================================================================
// Channel Names — Frontend listens via @tauri-apps/api/event::listen
// ============================================================================

pub const CHANNEL_MODE_CHANGE: &str = "window-mirror://mode-change";
pub const CHANNEL_SIDEBAR_CHANGE: &str = "window-mirror://sidebar-change";
pub const CHANNEL_FILE_OPENED: &str = "window-mirror://file-opened";
pub const CHANNEL_FILE_SAVED: &str = "window-mirror://file-saved";
pub const CHANNEL_FILE_CLOSED: &str = "window-mirror://file-closed";
pub const CHANNEL_WORKSPACE_CHANGE: &str = "window-mirror://workspace-change";
pub const CHANNEL_PROXY_STATUS: &str = "window-mirror://proxy-status";
pub const CHANNEL_MIRROR_EVENT: &str = "window-mirror://mirror-event";
pub const CHANNEL_SETTINGS_CHANGE: &str = "window-mirror://settings-change";
pub const CHANNEL_LOG: &str = "window-mirror://log";

// ============================================================================
// Event Payloads — Serialized to frontend via Tauri events
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum AppEvent {
    ModeChange(ModeChangeEvent),
    SidebarChange(SidebarChangeEvent),
    FileOpened(FileEvent),
    FileSaved(FileEvent),
    FileClosed(FileClosedEvent),
    WorkspaceChange(WorkspaceChangeEvent),
    ProxyStatus(ProxyStatusEvent),
    MirrorEvent(MirrorEventEvent),
    SettingsChange(SettingsChangeEvent),
    Log(LogEvent),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModeChangeEvent {
    pub mode: AppMode,
    pub previous_mode: Option<AppMode>,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SidebarChangeEvent {
    pub sidebar: SidebarState,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEvent {
    pub file: crate::commands::FileTab,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileClosedEvent {
    pub file_id: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceChangeEvent {
    pub workspace: WorkspaceInfo,
    pub previous_workspace_id: Option<String>,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyStatusEvent {
    pub status: ProxyStatus,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MirrorEventEvent {
    pub event: MirrorEventSummary,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsChangeEvent {
    pub settings: Settings,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEvent {
    pub level: String,
    pub target: String,
    pub message: String,
    pub timestamp: String,
    pub fields: Option<serde_json::Value>,
}

// ============================================================================
// Internal Event Bus — High-throughput Rust-internal streaming
// Used between proxy engine, timeline, sandbox, and the AppState emit layer
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum InternalEvent {
    Mirror(MirrorEvent),
    ProxyStatus(ProxyStatus),
    Log {
        level: String,
        target: String,
        message: String,
        fields: Option<serde_json::Value>,
    },
}

#[derive(Clone)]
pub struct InternalEventBus {
    tx: broadcast::Sender<InternalEvent>,
    handle: AppHandle,
}

impl InternalEventBus {
    pub fn new(handle: AppHandle, capacity: usize) -> Self {
        let (tx, _rx) = broadcast::channel(capacity);
        Self { tx, handle }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<InternalEvent> {
        self.tx.subscribe()
    }

    pub fn try_send(&self, event: InternalEvent) -> Result<usize, broadcast::error::SendError<InternalEvent>> {
        self.tx.send(event)
    }

    /// Broadcast a MirrorEvent to the frontend via Tauri event channel
    pub fn emit_mirror(&self, event: MirrorEvent) {
        // Emit to frontend
        let summary = MirrorEventSummary {
            id: event.id().to_string(),
            timestamp: event.timestamp().to_rfc3339(),
            kind: match &event {
                MirrorEvent::Network(_) => crate::commands::EventKind::Network,
                MirrorEvent::Dom(_) => crate::commands::EventKind::Dom,
                MirrorEvent::Storage(_) => crate::commands::EventKind::Storage,
                MirrorEvent::Console(_) => crate::commands::EventKind::Console,
                MirrorEvent::Error(_) => crate::commands::EventKind::Error,
                MirrorEvent::Custom(_) => crate::commands::EventKind::Custom,
            },
            summary: event.summary(),
            source_location: event.source_location().map(|loc| crate::commands::SourceLocation {
                file: loc.file,
                line: loc.line,
                column: loc.column,
            }),
        };

        let event_payload = MirrorEventEvent {
            event: summary,
            timestamp: chrono::Utc::now().to_rfc3339(),
        };

        let _ = self.handle.emit(CHANNEL_MIRROR_EVENT, event_payload);

        // Also send to internal bus for timeline storage
        let _ = self.tx.send(InternalEvent::Mirror(event));
    }

    /// Broadcast proxy status to frontend
    pub fn emit_proxy_status(&self, status: ProxyStatus) {
        let event_payload = ProxyStatusEvent {
            status: status.clone(),
            timestamp: chrono::Utc::now().to_rfc3339(),
        };
        let _ = self.handle.emit(CHANNEL_PROXY_STATUS, event_payload);
        let _ = self.tx.send(InternalEvent::ProxyStatus(status));
    }

    /// Log message to frontend console
    pub fn emit_log(&self, level: &str, target: &str, message: &str, fields: Option<serde_json::Value>) {
        let event = LogEvent {
            level: level.to_string(),
            target: target.to_string(),
            message: message.to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
            fields,
        };
        let _ = self.handle.emit(CHANNEL_LOG, event);
    }

    /// Emit generic AppEvent to frontend
    pub fn emit_app_event(&self, channel: &str, event: AppEvent) {
        let _ = self.handle.emit(channel, event);
    }
}
