//! TimelineStore — Event Storage & Correlation
//!
//! Append-only event log using Redb (embedded ACID database).
//! Events are indexed twice: by id (dedup) and by (timestamp, id) for
//! time-ordered retrieval. JSONL export supported for portability.

use std::path::PathBuf;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use redb::{Database, ReadableTable, TableDefinition};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::sync::Notify;
use tracing::instrument;

// Table definitions are const so every open uses the identical schema.
const T_EVENTS: TableDefinition<&str, &str> = TableDefinition::new("events");
const T_BY_TIME: TableDefinition<&str, &str> = TableDefinition::new("events_by_time");

// ============================================================================
// Event Definitions
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MirrorEvent {
    Network(NetworkEvent),
    Dom(DomEvent),
    Storage(StorageEvent),
    Console(ConsoleEvent),
    Error(ErrorEvent),
    Custom(CustomEvent),
}

impl MirrorEvent {
    pub fn id(&self) -> &str {
        match self {
            Self::Network(e) => &e.id,
            Self::Dom(e) => &e.id,
            Self::Storage(e) => &e.id,
            Self::Console(e) => &e.id,
            Self::Error(e) => &e.id,
            Self::Custom(e) => &e.id,
        }
    }

    pub fn timestamp(&self) -> DateTime<Utc> {
        match self {
            Self::Network(e) => e.timestamp,
            Self::Dom(e) => e.timestamp,
            Self::Storage(e) => e.timestamp,
            Self::Console(e) => e.timestamp,
            Self::Error(e) => e.timestamp,
            Self::Custom(e) => e.timestamp,
        }
    }

    /// Millis since epoch — used as the sortable time key.
    pub fn ts_millis(&self) -> i64 {
        self.timestamp().timestamp_millis()
    }

    pub fn summary(&self) -> String {
        match self {
            Self::Network(e) => {
                format!("HTTP {} {} {}", e.method, e.status, e.url)
            }
            Self::Dom(e) => format!("DOM {} on {}", e.mutation_type, e.target_selector),
            Self::Storage(e) => format!("Storage {} on {}", e.action, e.key),
            Self::Console(e) => format!("{}: {}", e.level, e.message),
            Self::Error(e) => format!("Error: {}", e.message),
            Self::Custom(e) => format!("Custom: {}", e.label),
        }
    }

    pub fn source_location(&self) -> Option<SourceLocation> {
        match self {
            Self::Network(e) => e.source_location.clone(),
            Self::Dom(e) => e.source_location.clone(),
            Self::Storage(e) => e.source_location.clone(),
            Self::Console(e) => e.source_location.clone(),
            Self::Error(e) => e.source_location.clone(),
            Self::Custom(e) => e.source_location.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkEvent {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub method: String,
    pub url: String,
    pub status: u16,
    pub request_headers: Vec<(String, String)>,
    pub response_headers: Vec<(String, String)>,
    pub request_body: Option<String>,
    pub response_body: Option<String>,
    pub duration_ms: u64,
    pub source_location: Option<SourceLocation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomEvent {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub mutation_type: String,
    pub target_selector: String,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
    pub source_location: Option<SourceLocation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageEvent {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub action: String,
    pub key: String,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
    pub source_location: Option<SourceLocation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsoleEvent {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub level: String,
    pub message: String,
    pub stack_trace: Option<String>,
    pub source_location: Option<SourceLocation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorEvent {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub message: String,
    pub error_type: String,
    pub stack_trace: Option<String>,
    pub source_location: Option<SourceLocation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomEvent {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub label: String,
    pub data: serde_json::Value,
    pub source_location: Option<SourceLocation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceLocation {
    pub file: String,
    pub line: u32,
    pub column: u32,
}

// ============================================================================
// Timeline Store
// ============================================================================

#[derive(Error, Debug)]
pub enum TimelineError {
    #[error("Database error: {0}")]
    Database(#[from] redb::DatabaseError),
    #[error("Transaction error: {0}")]
    Transaction(#[from] redb::TransactionError),
    #[error("Commit error: {0}")]
    Commit(#[from] redb::CommitError),
    #[error("Storage error: {0}")]
    Storage(#[from] redb::StorageError),
    #[error("Table error: {0}")]
    Table(#[from] redb::TableError),
    #[error("Serialization error: {0}")]
    Serialize(#[from] serde_json::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

/// Zero-padded millis → lexicographic order == numeric order.
fn time_key(event: &MirrorEvent) -> String {
    format!("{:020}#{}", event.ts_millis(), event.id())
}

pub struct TimelineStore {
    db: Arc<Database>,
    _base_dir: PathBuf,
    notify: Arc<Notify>,
    event_count: Arc<std::sync::atomic::AtomicU64>,
}

impl TimelineStore {
    pub fn new(base_dir: PathBuf) -> Self {
        let _ = std::fs::create_dir_all(&base_dir);
        let db_path = base_dir.join("timeline.redb");

        let db = Arc::new(Database::create(&db_path).unwrap_or_else(|e| {
            tracing::error!(
                "Failed to create timeline DB at {} ({}), falling back to in-memory",
                db_path.display(),
                e
            );
            Database::builder()
                .create_with_backend(redb::backends::InMemoryBackend::new())
                .expect("in-memory redb must always work")
        )});

        // Ensure both tables exist before first use.
        let write_txn = db.begin_write().expect("begin_write on fresh db");
        {
            let _events = write_txn.open_table(T_EVENTS).expect("open events table");
            let _by_time = write_txn.open_table(T_BY_TIME).expect("open time table");
        }
        write_txn.commit().expect("commit schema init");

        Self {
            db,
            _base_dir: base_dir,
            notify: Arc::new(Notify::new()),
            event_count: Arc::new(std::sync::atomic::AtomicU64::new(0)),
        }
    }

    #[instrument(skip(self, event))]
    pub async fn append(&self, event: MirrorEvent) -> Result<(), TimelineError> {
        let id = event.id().to_string();
        let serialized = serde_json::to_string(&event)?;
        let tkey = time_key(&event);

        let db = self.db.clone(); // Arc clone
        let count = self.event_count.clone();
        let notify = self.notify.clone();

        tokio::task::spawn_blocking(move || {
            let write_txn = db.begin_write()?;
            {
                let mut events = write_txn.open_table(T_EVENTS)?;
                events.insert(id.as_str(), serialized.as_str())?;

                let mut by_time = write_txn.open_table(T_BY_TIME)?;
                by_time.insert(tkey.as_str(), serialized.as_str())?;
            }
            write_txn.commit()?;
            Ok::<_, TimelineError>(())
        })
        .await
        .map_err(|join| TimelineError::Io(std::io::Error::other(join.to_string())))??;

        count.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        notify.notify_waiters();

        Ok(())
    }

    /// Most recent `limit` events, newest first.
    #[instrument(skip(self))]
    pub async fn recent(&self, limit: usize) -> Vec<crate::commands::MirrorEventSummary> {
        let db = self.db.clone(); // Arc clone

        let res = tokio::task::spawn_blocking(move || -> Result<Vec<_>, TimelineError> {
            let read_txn = db.begin_read()?;
            let table = read_txn.open_table(T_BY_TIME)?;

            // Reverse iterate the ordered time index.
            let mut out = Vec::with_capacity(limit);
            for row in table.iter()?.rev() {
                if out.len() >= limit {
                    break;
                }
                let (_k, v) = row?;
                let raw = v.value();
                match serde_json::from_str::<MirrorEvent>(raw) {
                    Ok(ev) => out.push(summary_of(&ev)),
                    Err(e) => tracing::warn!("skipping corrupt event: {e}"),
                }
            }
            Ok(out)
        })
        .await;

        match res {
            Ok(Ok(v)) => v,
            Ok(Err(e)) => {
                tracing::error!("timeline recent() failed: {e}");
                Vec::new()
            }
            Err(join) => {
                tracing::error!("timeline recent() join failed: {join}");
                Vec::new()
            }
        }
    }

    /// Stream every event as a JSONL file (one JSON object per line).
    pub async fn export_jsonl(&self, path: &PathBuf) -> Result<u64, TimelineError> {
        let db = self.db.clone(); // Arc clone
        let path = path.clone();

        let written = tokio::task::spawn_blocking(move || -> Result<u64, TimelineError> {
            use std::io::{BufWriter, Write};
            let read_txn = db.begin_read()?;
            let table = read_txn.open_table(T_EVENTS)?;

            let file = std::fs::File::create(&path)?;
            let mut w = BufWriter::new(file);
            let mut n: u64 = 0;
            for row in table.iter()? {
                let (_k, v) = row?;
                writeln!(w, "{}", v.value())?;
                n += 1;
            }
            w.flush()?;
            Ok(n)
        })
        .await
        .map_err(|join| TimelineError::Io(std::io::Error::other(join.to_string())))??;

        Ok(written)
    }

    pub fn count(&self) -> u64 {
        self.event_count.load(std::sync::atomic::Ordering::Relaxed)
    }
}

/// Build a commands-layer summary from a parsed event.
fn summary_of(event: &MirrorEvent) -> crate::commands::MirrorEventSummary {
    crate::commands::MirrorEventSummary {
        id: event.id().to_string(),
        timestamp: event.timestamp().to_rfc3339(),
        kind: match event {
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
    }
}
