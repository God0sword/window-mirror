# Window Mirror — Architecture Specification

**Version:** 0.1.0  
**Date:** 2026-08-20  
**Status:** Draft — Phase 1 (Core Shell & Editor)

---

## 1. Vision & Core Metaphor

> **The Window Mirror** — A police interrogation room's one-way mirror.  
> **We** (the operators) sit behind the mirror.  
> **The Suspect** (the target application, page, payload) sits in the interrogation room.  
> We have **full visibility**: every DOM mutation, every network request, every storage change, every WebSocket frame, every console log, every timing delta.  
> We have **controlled interaction**: inject scripts, modify headers, replay requests, mutate state, pause execution.  
> The suspect **never knows we're there** unless we choose to reveal ourselves.

This is not a browser with devtools bolted on.  
This is a **surveillance platform that happens to render HTML**.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WINDOW MIRROR APPLICATION                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      TAURI DESKTOP SHELL (Rust)                     │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │  Frontend    │  │  Backend     │  │  System      │              │   │
│  │  │  (TypeScript/│  │  (Rust)      │  │  Integration │              │   │
│  │  │   React/     │  │              │  │  (OS APIs,   │              │   │
│  │  │   Solid/     │  │  • Commands  │  │   FS, Net,   │              │   │
│  │  │   Svelte)    │  │  • Events    │  │   Process)   │              │   │
│  │  │              │  │  • State     │  │              │              │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │   │
│  │         │                 │                 │                      │   │
│  │         ▼                 ▼                 ▼                      │   │
│  │  ┌──────────────────────────────────────────────────────────────┐  │   │
│  │  │                    CORE SERVICES LAYER                        │  │   │
│  │  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────┐  │  │   │
│  │  │  │   Window    │ │   Monaco    │ │   Proxy /   │ │ Sandbox│  │  │   │
│  │  │  │   Mirror    │ │   Engine    │ │   Intercept │ │ Engine │  │  │   │
│  │  │  │   Engine    │ │             │ │   Service   │ │        │  │  │   │
│  │  │  └─────────────┘ └─────────────┘ └─────────────┘ └────────┘  │  │   │
│  │  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────┐  │  │   │
│  │  │  │   SAST/     │ │   Workspace │ │   Session   │ │ Plugin │  │  │   │
│  │  │  │   Semgrep   │ │   Manager   │ │   Replay    │ │ API    │  │  │   │
│  │  │  └─────────────┘ └─────────────┘ └─────────────┘ └────────┘  │  │   │
│  │  └──────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Technology Choices (Performance-First)

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Desktop Shell** | **Tauri 2.x** (Rust) | Tiny binary (~3MB), native performance, WebView2/WebKitGTK, no Electron bloat |
| **Frontend Framework** | **SolidJS** (or React if preferred) | Fine-grained reactivity, no virtual DOM overhead, tiny bundle |
| **Editor** | **Monaco Editor** (via `@monaco-editor/react` or custom wrapper) | VS Code's editor, LSP support, excellent performance |
| **Browser Engine** | **Tauri WebView** (WebView2 on Windows, WebKitGTK on Linux, WebKit on macOS) | Native OS webview, no bundled Chromium |
| **Proxy/Interception** | **Rust: `tokio` + `hyper` + `rustls`** | Zero-copy, async, TLS termination, MITM cert generation |
| **Static Analysis** | **Semgrep (CLI) + custom AST walkers (tree-sitter)** | Fast, rule-based, extensible, runs in background |
| **Sandboxing** | **Wasmtime (WebAssembly) + optional `firecracker`/`gvisor` for microVMs** | Wasm for speed, microVMs for hardware/malware isolation |
| **IPC** | **Tauri Commands + Channels (Event streaming)** | Type-safe, low-latency, bidirectional |
| **State Management** | **SolidJS Signals + Custom Sync Engine** | Reactive, performant, serializable for replay |

---

## 4. Core Modules

### 4.1 Window Mirror Engine (`window-mirror-engine/`)
**The heart of the surveillance platform.**

**Responsibilities:**
- Local MITM proxy (HTTP/1.1, HTTP/2, WebSocket)
- Certificate authority management (auto-generate, trust store injection)
- Request/response logging with full body capture
- WebSocket frame interception and modification
- DOM mutation observer injection (via content script)
- Console/error/network event capture
- Timeline construction: correlate code location → network → DOM → storage

**Rust crate structure:**
```
window-mirror-engine/
├── src/
│   ├── proxy/           # MITM proxy core
│   │   ├── ca.rs        # Certificate authority
│   │   ├── intercept.rs # Request/response modification
│   │   ├── ws.rs        # WebSocket handling
│   │   └── logger.rs    # Structured logging (JSONL)
│   ├── dom/             # DOM observation
│   │   ├── injector.rs  # Content script injection
│   │   ├── observer.rs  # MutationRecord streaming
│   │   └── correlator.rs# Code ↔ DOM mapping
│   ├── timeline/        # Unified event timeline
│   │   ├── event.rs     # Event types (network, dom, storage, console, error)
│   │   ├── store.rs     # Append-only event log (sled/redb)
│   │   └── query.rs     # Time-range, filter, correlation queries
│   └── lib.rs
├── Cargo.toml
└── build.rs             # Embed CA cert, generate rustls config
```

**Key Data Structures:**
```rust
// timeline/event.rs
pub enum MirrorEvent {
    Network(NetworkEvent),
    Dom(DomEvent),
    Storage(StorageEvent),
    Console(ConsoleEvent),
    Error(ErrorEvent),
    Custom(CustomEvent),  // For plugin extensions
}

pub struct NetworkEvent {
    pub id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub request: HttpRequest,
    pub response: Option<HttpResponse>,
    pub timing: TimingInfo,
    pub initiator: InitiatorInfo,  // Code location, stack trace
}

pub struct DomEvent {
    pub id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub mutation_type: MutationType,
    pub target: NodeInfo,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
    pub initiator: InitiatorInfo,
}
```

---

### 4.2 Monaco Editor Engine (`monaco-engine/`)
**Embedded code intelligence with security overlays.**

**Features:**
- Multi-language LSP (TypeScript, Python, Rust, Go, C/C++, etc.)
- Real-time SAST diagnostics (Semgrep + custom rules)
- Inline "Window Mirror" annotations: hover a line → see correlated network/DOM events
- Diff view: original vs. modified (for replay/tampering)
- Zen Mode: full-screen, minimal chrome
- Telemetry Mode: split panes (editor | timeline | inspector | console)

**Integration Points:**
- File watcher → triggers SAST re-scan
- Save → optionally proxy-reload target page
- Breakpoint-like "inspection points" → pause proxy, inject payload

---

### 4.3 Proxy / Interception Service (`proxy-service/`)
**Standalone Rust service (can run headless).**

- Starts before WebView, shuts down after
- System proxy configuration (PAC file or explicit)
- Per-tab / per-workspace isolation
- Request/response rewriting rules (YAML/DSL)
- Export HAR, PCAP, custom JSONL
- Replay engine: resend captured requests with modifications

---

### 4.4 Sandbox Engine (`sandbox-engine/`)
**Isolated execution for untrusted code.**

| Target | Backend | Use Case |
|--------|---------|----------|
| JS/TS snippets | Wasmtime (Wasm) | Fast, deterministic, no OS access |
| Python/Go/Rust | Wasmtime (WASI) | Script analysis, payload testing |
| Native binaries | Firecracker microVM | Malware, hardware telemetry, kernel exploits |
| Browser contexts | Isolated WebView profile | Extension testing, fingerprinting |

**API:**
```rust
pub trait Sandbox {
    async fn execute(&self, payload: Payload, limits: Limits) -> Result<ExecutionResult>;
    async fn snapshot(&self) -> SandboxSnapshot;
    async fn restore(&self, snapshot: SandboxSnapshot);
}
```

---

### 4.5 Workspace Manager (`workspace-manager/`)
**Project-centric, persistent, portable.**

- Workspace = directory with `.window-mirror/` config
- Per-file mode persistence (Zen/Telemetry, split ratios, open panels)
- Session recording: full timeline + editor state → replay later
- Git integration: blame correlate → which commit introduced this vulnerability?

---

### 4.6 Plugin API (`plugin-api/`)
**Extensibility for custom diagnostics.**

- WASM plugins (sandboxed, fast)
- Native dynamic libraries (Rust/C/C++) for performance-critical tools
- Hook points: `onRequest`, `onResponse`, `onDomMutation`, `onSave`, `onBuild`
- UI extension slots: panel, sidebar, editor decoration, context menu

---

## 5. UI/UX — Zen Browser Inspiration

**From Zen Browser we adopt:**
| Feature | Adaptation |
|---------|------------|
| Vertical tabs sidebar | **Workspace/Session sidebar** — tabs = open files + live targets |
| Compact Mode | **Zen Mode** — editor only, auto-hide all chrome |
| Workspaces | **Investigation Workspaces** — separate target contexts |
| Split View | **Telemetry Mode** — editor \| timeline \| inspector \| console |
| Glance (Peek) | **Quick Inspect** — hover request → modal with full detail |
| Tab Folders | **Nested Session Groups** — organize by target, vuln type, date |
| Theming (gradients, textures) | **Full theming engine** — CSS variables, Zen Mods compatible |
| Firefox extension compat | **WebExtension API subset** — run uBlock, Tampermonkey, etc. |

**Mode Definitions:**

| Mode | Layout | Visible Panels | Persistence |
|------|--------|----------------|-------------|
| **Zen** | Single pane | Editor (full) | Per-file: cursor, scroll, folds |
| **Telemetry** | 4-pane grid | Editor \| Timeline \| Inspector \| Console | Per-workspace: pane sizes, active tabs |
| **Focus** | 2-pane | Editor \| One selected panel | Per-file: which panel |
| **Interrogation** | 3-pane | Target View \| Mirror Timeline \| Control Panel | Per-session: layout, filters |

**Animations:**
- CSS transitions (200-300ms) for pane resize, mode switch, sidebar toggle
- `prefers-reduced-motion` respected
- Configurable: `animations: "none" | "fast" | "smooth" | "custom"`

---

## 6. Data Flow — The Mirror Loop

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   EDITOR    │────▶│   PROXY     │────▶│  TIMELINE   │────▶│   EDITOR    │
│  (Source)   │     │ (Intercept) │     │  (Correlate)│     │ (Decorate)  │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
      ▲                                                                │
      │                                                                │
      └────────────────────────────────────────────────────────────────┘
                           FEEDBACK LOOP
```

1. **Write code** in Editor → Save
2. **Proxy** serves/injects into target WebView
3. **Target executes** → Network/DOM/Storage events fire
4. **Mirror Engine** captures, correlates to source lines (via sourcemaps + instrumentation)
5. **Timeline** stores events, pushes to UI via Tauri Channel
6. **Editor** decorates: inline warnings, gutter markers, hover popovers with full event detail
7. **Operator** sees cause→effect instantly, modifies code or injects payload, loop repeats

---

## 7. Security Model

- **No telemetry home** — fully offline-capable
- **Local CA** — generated per-install, never leaves machine
- **Proxy opt-in** — only active for selected workspaces/targets
- **Sandbox default** — all payload execution isolated
- **Permission prompts** — for filesystem, network, process spawn
- **Encrypted session storage** — optional, for sensitive investigations

---

## 8. Phase 1 Deliverables (Core Shell & Editor)

| Component | Status | Notes |
|-----------|--------|-------|
| Tauri app skeleton | 🔲 | `cargo tauri init` |
| SolidJS + TypeScript + Vite | 🔲 | Minimal deps |
| Monaco Editor integration | 🔲 | Worker setup, theme sync |
| WebView target pane | 🔲 | `webview` crate or Tauri `WebviewWindow` |
| Vertical sidebar (Workspace) | 🔲 | SolidJS, collapsible |
| Zen/Telemetry mode toggle | 🔲 | Persisted per-file |
| Basic theming (CSS vars) | 🔲 | Dark/light, gradient support |
| Settings system | 🔲 | TOML config, hot-reload |

---

## 9. File Structure (Monorepo)

```
window-mirror/
├── ARCHITECTURE.md
├── README.md
├── Cargo.toml                    # Workspace root
├── tauri.conf.json               # Tauri config
├── packages/
│   ├── frontend/                 # SolidJS app
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── stores/
│   │   │   ├── styles/
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   └── tsconfig.json
│   ├── window-mirror-engine/     # Rust crate (proxy, DOM, timeline)
│   ├── monaco-engine/            # Rust crate (editor backend, LSP)
│   ├── proxy-service/            # Rust crate (standalone proxy)
│   ├── sandbox-engine/           # Rust crate (Wasm + microVM)
│   ├── workspace-manager/        # Rust crate (project, session)
│   └── plugin-api/               # Rust crate (WASM + native plugins)
├── src-tauri/                    # Tauri entry point
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands.rs           # Tauri commands
│   │   ├── events.rs             # Channel events
│   │   ├── state.rs              # AppState (Arc<Mutex<...>>)
│   │   └── setup.rs              # Initialization
│   ├── Cargo.toml
│   ├── build.rs
│   └── tauri.conf.json
├── .github/
│   └── workflows/
├── .gitignore
├── rustfmt.toml
└── clippy.toml
```

---

## 10. Next Steps

1. **Scaffold Tauri + SolidJS + Monaco** — this document's Phase 1
2. **Implement Window Mirror Engine (proxy core)** — Phase 2
3. **Hook Semgrep + tree-sitter for SAST** — Phase 3
4. **Build Sandbox + Plugin API** — Phase 4

---

## 11. Open Questions for Alignment

1. **Frontend framework:** SolidJS (my recommendation) or React/Svelte/Vue?
2. **Monaco integration:** `@monaco-editor/react` wrapper or raw Monaco API?
3. **Proxy scope:** System-wide PAC or per-WebView proxy config?
4. **Sandbox priority:** Wasmtime first, microVM later? Or both from start?
5. **Session format:** Custom binary (sled/redb) or SQLite/JSONL for portability?
6. **Extension API:** WebExtension compat layer — how much? (MV3 only?)
7. **Target platforms:** Windows/Linux/macOS all Phase 1, or stagger?

---

*End of Architecture Specification*