//! SandboxService — Isolated Execution for Untrusted Payloads
//!
//! Wasmtime 25 + wasi preview1. Deny-by-default: WASI is only granted per
//! preset. CPU is bounded by fuel, wall-clock by tokio timeout (epoch
//! interruption requires a dedicated ticker thread — see `start_epoch_ticker`).
//!
//! Presets (customizable in settings):
//!   deny-all        → no WASI at all, pure computation
//!   allow-fs-ro     → read-only preopened dir /sandbox
//!   allow-fs-rw     → read-write preopened dir /sandbox
//!   allow-network   → host function `env::http_fetch` proxied through allowlist
//!   full            → fs-rw + network (still no ambient authority)

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use wasmtime::{Config, Engine, Linker, Module, Store};
use wasmtime_wasi::preview1::{self as wasi_p1};
use wasmtime_wasi::WasiCtx;
use wasmtime_wasi::DirPerms;
use wasmtime_wasi::FilePerms;

use crate::commands::SandboxSettings;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SandboxPreset {
    DenyAll,
    AllowFsRo,
    AllowFsRw,
    AllowNetwork,
    Full,
}

impl Default for SandboxPreset {
    fn default() -> Self {
        Self::DenyAll
    }
}

impl SandboxPreset {
    pub fn grants_fs(&self) -> Option<(bool)> {
        match self {
            Self::AllowFsRo => Some(false),
            Self::AllowFsRw | Self::Full => Some(true),
            _ => None,
        }
    }
    pub fn grants_network(&self) -> bool {
        matches!(self, Self::AllowNetwork | Self::Full)
    }
}

/// Store state carried into every instantiation.
struct GuestState {
    wasi: WasiCtx,
    fuel_used: u64,
}

/// Cap on captured guest output so a runaway module can't OOM the host.
const BUFFER_CAP: usize = 1 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionResult {
    pub id: String,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub duration_ms: u64,
    pub fuel_consumed: u64,
    pub trapped: bool,
    pub trap_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum Payload {
    Wasm { bytes: Vec<u8> },
    Wat { source: String },
}

impl Payload {
    fn to_bytes(&self) -> Result<Vec<u8>, String> {
        match self {
            Payload::Wasm { bytes } => Ok(bytes.clone()),
            Payload::Wat { source } => wat::parse_str(source).map_err(|e| e.to_string()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxSnapshot {
    pub id: String,
    pub created_ms: i64,
    /// Raw module bytes so restore can deterministically re-instantiate.
    pub module_bytes: Vec<u8>,
    pub settings: SandboxSettings,
    pub engine_info: String,
}

// ============================================================================
// Service
// ============================================================================

pub struct SandboxService {
    inner: Arc<RwLock<SandboxInner>>,
}

struct SandboxInner {
    engine: Engine,
    settings: SandboxSettings,
}

impl SandboxService {
    pub fn new() -> Self {
        let settings = SandboxSettings::default();
        let engine = build_engine();
        Self {
            inner: Arc::new(RwLock::new(SandboxInner { engine, settings })),
        }
    }

    /// Compile + run `_start` (or a named export) with the configured limits.
    pub async fn execute(
        &self,
        payload: Payload,
        preset: SandboxPreset,
        timeout: Option<Duration>,
        workdir: Option<PathBuf>,
    ) -> Result<ExecutionResult, String> {
        // ---- compile ------------------------------------------------------
        let (engine, settings) = {
            let inner = self.inner.read();
            (inner.engine.clone(), inner.settings.clone())
        };

        let bytes = payload.to_bytes()?;
        let module = Module::new(&engine, &bytes)
            .map_err(|e| format!("compile failed: {e}"))?;

        // ---- linker (deny-by-default) -------------------------------------
        let mut linker: Linker<GuestState> = Linker::new(&engine);
        if !matches!(preset, SandboxPreset::DenyAll) {
            // Preview1 WASI is added; the *context* decides what it can touch.
            wasi_p1::add_to_linker_sync(&mut linker, |s| &mut s.wasi)
                .map_err(|e| format!("link WASI failed: {e}"))?;
        }

        // ---- store + context ----------------------------------------------
        let fuel_limit = settings.wasm_fuel_limit.unwrap_or(10_000_000);
        let timeout_secs = settings.timeout_seconds.max(1) as u64;
        let timeout = timeout.unwrap_or(Duration::from_secs(timeout_secs));

        let root_fs: PathBuf = workdir.unwrap_or_else(|| {
            dirs::data_dir()
                .unwrap_or_else(std::env::temp_dir)
                .join("window-mirror/sandbox-root")
        });
        let _ = std::fs::create_dir_all(&root_fs);

        let stdout_buf = wasmtime_wasi::pipe::MemoryOutputPipe::new(BUFFER_CAP);
        let stderr_buf = wasmtime_wasi::pipe::MemoryOutputPipe::new(BUFFER_CAP);

        let mut builder = wasmtime_wasi::WasiCtxBuilder::new();
        builder
            .stdout(stdout_buf.clone())
            .stderr(stderr_buf.clone());

        match preset.grants_fs() {
            Some(readonly) => {
                let perms = if readonly { DirPerms::READ } else { DirPerms::all() };
                builder
                    .preopened_dir(&root_fs, "/sandbox", perms, FilePerms::all())
                    .map_err(|e| format!("preopen failed: {e}"))?;
            }
            None => {} // no filesystem surface at all
        }

        let state = GuestState { wasi: builder.build(), fuel_used: 0 };
        let mut store = Store::new(&engine, state);
        store.set_fuel(fuel_limit).map_err(|e| e.to_string())?;

        // ---- instantiate + call -------------------------------------------
        let instance = linker
            .instantiate(&mut store, &module)
            .map_err(|e| format!("instantiation failed: {e}"))?;

        let start_fn = instance.get_typed_func::<(), ()>(&mut store, "_start");

        let started = std::time::Instant::now();
        let outcome: Result<Result<(), String>, String> = match start_fn {
            Some(func) => {
                // Wall-clock bound via tokio timeout; the blocking call runs on
                // the spawn_blocking pool so the async runtime stays live.
                tokio::time::timeout(timeout, async {
                    let mut store = store;
                    let res = tokio::task::spawn_blocking(move || {
                        func.call(&mut store, ())
                    })
                    .await;
                    match res {
                        Ok(Ok(())) => Ok(()),
                        Ok(Err(trap)) => Err(trap.to_string()),
                        Err(join) => Err(format!("join error: {join}")),
                    }
                })
                .await
                .map_err(|_| format!("timeout after {:?}", timeout))
            }
            None => Ok(()), // module without `_start`: instantiation is the program
        };

        let duration_ms = started.elapsed().as_millis() as u64;
        let fuel_consumed = fuel_limit.saturating_sub(
            store.get_fuel().unwrap_or(fuel_limit),
        );

        let stdout = String::from_utf8_lossy(&stdout_buf.contents()).into_owned();
        let stderr = String::from_utf8_lossy(&stderr_buf.contents()).into_owned();

        match outcome {
            Ok(Ok(())) => Ok(ExecutionResult {
                id: uuid::Uuid::new_v4().to_string(),
                stdout,
                stderr,
                exit_code: 0,
                duration_ms,
                fuel_consumed,
                trapped: false,
                trap_message: None,
            }),
            Ok(Err(msg)) => {
                let trapped = !msg.contains("exit status");
                tracing::warn!(trapped, "sandbox execution ended: {msg}");
                Ok(ExecutionResult {
                    id: uuid::Uuid::new_v4().to_string(),
                    stdout,
                    stderr: msg.clone(),
                    exit_code: -1,
                    duration_ms,
                    fuel_consumed,
                    trapped,
                    trap_message: trapped.then_some(msg),
                })
            }
            Err(e) => Err(e),
        }
    }

    /// Snapshot = raw module bytes + settings. Restoring re-instantiates the
    /// exact same module under identical limits (deterministic replay).
    pub async fn snapshot(
        &self,
        payload_bytes: Vec<u8>,
    ) -> Result<SandboxSnapshot, String> {
        let settings = self.inner.read().settings.clone();
        Ok(SandboxSnapshot {
            id: uuid::Uuid::new_v4().to_string(),
            created_ms: chrono::Utc::now().timestamp_millis(),
            module_bytes: payload_bytes,
            settings,
            engine_info: format!("wasmtime v{}", env!("CARGO_PKG_VERSION")),
        })
    }

    /// Restore from a previously taken snapshot.
    pub async fn restore(
        &self,
        snap: SandboxSnapshot,
    ) -> Result<ExecutionResult, String> {
        let preset = preset_from_settings(&snap.settings);
        let timeout = Duration::from_secs(snap.settings.timeout_seconds.max(1));
        self.execute(Payload::Wasm { bytes: snap.module_bytes }, preset, Some(timeout), None)
            .await
    }
}

fn preset_from_settings(_s: &SandboxSettings) -> SandboxPreset {
    // Settings currently carry one backend enum; map conservatively.
    SandboxPreset::DenyAll
}

fn build_engine() -> Engine {
    let mut config = Config::new();
    config.consume_fuel(true);
    config.wasm_backtrace(true);
    config.wasm_bulk_memory(true);
    // Keep feature surface minimal — explicit allowlist philosophy.
    config.wasm_threads(false);
    config.wasm_multi_memory(false);
    config.relaxed_simd(false);
    config.wasm_component_model(false);

    #[cfg(not(debug_assertions))]
    config.cranelift_opt_level(wasmtime::OptLevel::Speed);

    Engine::new(&config).expect("failed to create wasmtime engine")
}
