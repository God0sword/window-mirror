# Window Mirror - Implementation Plan

## Vision
A surveillance platform that happens to render HTML. A browser-IDE-pentest workspace combining:
- **Browser shell** (Zen Browser UX + macOS aesthetics)
- **System-wide MITM proxy** (hudsucker + rcgen CA + Chromium launcher)
- **DevTools** (TanStack DevTools + Chrome DevTools Protocol replication)
- **SAST Engine** (Tree-sitter + customizable rules)
- **WASM Sandbox** (Wasmtime + presets)
- **Persistence** (SQLite + encryption)

---

## Phase 0: Foundation (Week 1)
**Goal**: Solid build foundation with all tooling configured

### Tasks
- [ ] Fix TypeScript strict mode (remove `any`, add proper types)
- [ ] Configure Vite: WASM loading, web workers, Monaco editor workers, TanStack DevTools plugin
- [ ] Configure tree-sitter WASM grammar loading for browser
- [ ] Implement SettingsModal with full config UI (from ConfigurationSystem schemas)
- [ ] Implement CommandPalette with fuzzy search
- [ ] Add CI: lint, typecheck, basic tests
- [ ] Verify `npm run dev` and `cargo build` work

### Files to Modify
- `packages/frontend/tsconfig.json` - strict mode
- `packages/frontend/vite.config.ts` - WASM, workers, Monaco, TanStack
- `packages/frontend/src/components/settings/SettingsModal.tsx` - NEW
- `packages/frontend/src/components/command-palette/CommandPalette.tsx` - NEW
- `.github/workflows/ci.yml` - NEW

---

## Phase 1: Browser Shell (Week 2)
**Goal**: Working browser with tabs, address bar, sidebar, navigation

### Tasks
- [ ] Tab bar component (drag, reorder, close, pin, mute, favicon)
- [ ] Address bar (URL input, security indicator, reload, navigation buttons)
- [ ] Sidebar (vertical tabs like Zen: Files/Workspaces/Timeline/Extensions/Settings)
- [ ] Navigation (back/forward/reload/home, keyboard shortcuts)
- [ ] Target view (iframe with proxy injection point)
- [ ] Window controls (min/max/close, custom titlebar)
- [ ] Zen/Telemetry/Focus/Interrogation mode switching
- [ ] Per-file mode persistence (cursor, scroll, mode)
- [ ] Theme system (CSS variables, Zen + macOS aesthetics, reduced motion)

### Files to Create/Modify
- `packages/frontend/src/components/tabs/TabBar.tsx` - NEW
- `packages/frontend/src/components/address-bar/AddressBar.tsx` - enhance existing
- `packages/frontend/src/components/sidebar/Sidebar.tsx` - enhance existing
- `packages/frontend/src/components/target/TargetView.tsx` - enhance existing
- `packages/frontend/src/components/layouts/AppLayout.tsx` - enhance existing
- `packages/frontend/src/styles/theme.css` - NEW

---

## Phase 2: System-wide MITM Proxy (Week 3-4)
**Goal**: Full HTTP/HTTPS interception with Chromium launcher

### Rust Backend (`src-tauri/src/mitm_proxy.rs`)
- [ ] CA management (rcgen generate/import/export/install to system + NSS)
- [ ] hudsucker proxy server with HttpHandler
- [ ] Interception rules engine (priority-based, match/modify/block/redirect/mock)
- [ ] Request/response modification (headers, body, URL, method)
- [ ] WebSocket interception
- [ ] Session persistence (HAR, curl, raw, JSON export)
- [ ] Chromium launcher with dedicated profile + NSS trust store
- [ ] Tauri commands for all operations

### Frontend Integration
- [ ] Proxy history panel (timeline, filter, search)
- [ ] Interception rules panel (create/edit/delete/reorder)
- [ ] CA management panel (generate/import/export/install)
- [ ] Request/response inspector (headers, body, timing, diff)
- [ ] WebSocket frame inspector
- [ ] Replay functionality (single, sequence, with modifications)

### Tauri Commands
```rust
proxy:start, proxy:stop, proxy:restart, proxy:status
proxy:generate-ca, proxy:import-ca, proxy:export-ca, proxy:install-ca
proxy:launch-chromium, proxy:kill-chromium
proxy:get-history, proxy:get-event, proxy:clear-history, proxy:export
proxy:pause-request, proxy:resume-request, proxy:modify-request
proxy:replay-request, proxy:replay-sequence
proxy:get-rules, proxy:add-rule, proxy:update-rule, proxy:delete-rule
proxy:create-session, proxy:load-session, proxy:save-session
```

### Files to Create
- `src-tauri/src/mitm_proxy.rs` - NEW
- `src-tauri/src/ca_manager.rs` - NEW
- `src-tauri/src/chromium_launcher.rs` - NEW
- `src-tauri/src/rules_engine.rs` - NEW

---

## Phase 3: DevTools Core (Week 4-5)
**Goal**: TanStack DevTools + Chrome DevTools Protocol replication

### TanStack DevTools Integration
- [ ] Vite plugin: `@tanstack/devtools-vite` (server bus, go-to-source, console piping)
- [ ] TanStack DevTools shell with 19 panels
- [ ] Custom panels for Window Mirror (SAST, Timeline, JWT, Crypto, Fuzzer, etc.)

### Chrome DevTools Protocol Replication
- [ ] CDP domains: Network, DOM, Debugger, Runtime, Console, Page, Target, Security
- [ ] WebSocket transport to proxy backend
- [ ] Panel implementations (core 5 first):
  1. **Elements** - DOM tree, styles, computed, event listeners
  2. **Console** - REPL, filtering, error stack traces
  3. **Sources** - File tree, breakpoints, call stack, scope variables
  4. **Network** - Waterfall, headers, preview, response, timing, WS frames
  5. **Timeline** - Unified event stream (network, DOM, console, storage)

### Files to Create
- `packages/frontend/src/components/devtools/panels/ElementsPanel.tsx`
- `packages/frontend/src/components/devtools/panels/ConsolePanel.tsx`
- `packages/frontend/src/components/devtools/panels/SourcesPanel.tsx`
- `packages/frontend/src/components/devtools/panels/NetworkPanel.tsx`
- `packages/frontend/src/components/devtools/panels/TimelinePanel.tsx`

---

## Phase 4: SAST Engine (Week 5-6)
**Goal**: Tree-sitter based static analysis with customizable rules

### Rust Backend
- [ ] Tree-sitter parser pool (17 languages)
- [ ] Pattern mode: tree-sitter query execution
- [ ] Taint mode: source/sink/sanitizer + propagation
- [ ] Cross-file analysis via call graph
- [ ] Rule format: JSON with schema validation
- [ ] SARIF export for CI/CD

### Frontend
- [ ] SAST findings panel (group by file/severity/rule)
- [ ] Inline editor diagnostics (gutter markers, hover, quick-fix)
- [ ] Rule editor (create/edit/test rules)
- [ ] Taint flow visualization

### Tauri Commands
```rust
sast:scan, sast:scan-file, sast:validate-rules, sast:export-sarif
sast:get-rules, sast:add-rule, sast:update-rule, sast:delete-rule
```

### Files to Create
- `src-tauri/src/sast.rs` - NEW
- `src-tauri/src/tree_sitter_pool.rs` - NEW
- `src-tauri/src/taint_analyzer.rs` - NEW

---

## Phase 5: WASM Sandbox (Week 6-7)
**Goal**: Wasmtime sandbox with presets

### Rust Backend
- [ ] Per-tenant Engine with compilation cache
- [ ] Fuel metering + epoch interruption
- [ ] Explicit linker (deny-by-default host functions)
- [ ] ResourceLimiter (memory, table, fuel)
- [ ] WASI preopened dirs only
- [ ] Host function registry (log, random, time, crypto)
- [ ] Preset configs: `deny-all`, `allow-network`, `allow-fs`, `allow-network-fs`, `full`

### Frontend
- [ ] Sandbox panel (create/run/snapshot/restore)
- [ ] Preset selector with custom config
- [ ] Execution output (stdout/stderr, fuel, time, memory)
- [ ] Host function call log

### Tauri Commands
```rust
wasm:create-engine, wasm:destroy-engine
wasm:validate-module, wasm:execute-function, wasm:execute-module
wasm:snapshot, wasm:restore, wasm:get-stats
wasm:register-host-func, wasm:unregister-host-func
```

### Files to Create
- `src-tauri/src/wasm_sandbox.rs` - NEW

---

## Phase 6: SQLite Persistence + Encryption (Week 7)
**Goal**: Unified persistence with encryption

### Database Schema
```sql
-- Workspaces
CREATE TABLE workspaces (id TEXT PRIMARY KEY, name TEXT, path TEXT, config TEXT, created INTEGER);

-- Files
CREATE TABLE files (id TEXT PRIMARY KEY, workspace_id TEXT, path TEXT, content TEXT, cursor_pos TEXT, scroll_pos TEXT, mode TEXT, dirty INTEGER);

-- Proxy events
CREATE TABLE proxy_events (id TEXT PRIMARY KEY, session_id TEXT, timestamp INTEGER, type TEXT, data TEXT);

-- SAST findings
CREATE TABLE sast_findings (id TEXT PRIMARY KEY, file_id TEXT, rule_id TEXT, severity TEXT, location TEXT, message TEXT);

-- Sandbox snapshots
CREATE TABLE sandbox_snapshots (id TEXT PRIMARY KEY, sandbox_id TEXT, timestamp INTEGER, data BLOB);

-- Settings
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT, encrypted INTEGER);
```

### Encryption
- [ ] SQLCipher for encryption at rest
- [ ] Per-profile encryption keys
- [ ] Key derivation from password (Argon2id)
- [ ] Transparent encryption/decryption

### Migration
- [ ] Migrate existing Redb data to SQLite
- [ ] Versioned migrations

---

## Technical Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Storage** | **SQLite (rusqlite + SQLCipher)** | Mature, SQL queries, encryption, portable, benchmarks competitive |
| **Proxy** | **hudsucker + rcgen + rustls** | Pure Rust, HTTP/2, WebSocket, CA management, active maintenance |
| **DevTools** | **TanStack DevTools (SolidJS native)** | Native SolidJS, framework-agnostic EventClient, Vite plugin, extensible |
| **SAST** | **Tree-sitter (17 langs) + custom rules** | Incremental parsing, error recovery, pattern + taint modes |
| **Sandbox** | **Wasmtime (fuel + epoch + deny-by-default)** | Per-tenant isolation, deterministic limits, seccomp defense-in-depth |
| **LSP** | **monaco-languageclient + external binaries** | Smaller than WASM servers, mature servers (rust-analyzer, pyright, etc.) |
| **Persistence** | **SQLite + SQLCipher** | SQL queries, encryption, portable, single file |
| **Proxy Mode** | **System-wide + per-WebView hybrid** | Maximum visibility, Chromium launcher with NSS trust store |

---

## File Structure Target

```
window-mirror/
├── ARCHITECTURE.md
├── IMPLEMENTATION_PLAN.md
├── RESEARCH.md
├── Cargo.toml (workspace)
├── tauri.conf.json
├── src-tauri/
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands.rs          (all Tauri commands)
│   │   ├── state.rs             (AppState)
│   │   ├── setup.rs
│   │   ├── proxy.rs             (basic)
│   │   ├── timeline.rs          (Redb -> SQLite migration)
│   │   ├── workspace.rs
│   │   ├── sandbox.rs           (basic)
│   │   ├── mitm_proxy.rs        # NEW - Phase 2
│   │   ├── ca_manager.rs        # NEW - Phase 2
│   │   ├── chromium_launcher.rs # NEW - Phase 2
│   │   ├── rules_engine.rs      # NEW - Phase 2
│   │   ├── sast.rs              # NEW - Phase 4
│   │   ├── tree_sitter_pool.rs  # NEW - Phase 4
│   │   ├── taint_analyzer.rs    # NEW - Phase 4
│   │   ├── wasm_sandbox.rs      # NEW - Phase 5
│   │   ├── sqlite_db.rs         # NEW - Phase 6
│   │   └── encryption.rs        # NEW - Phase 6
│   └── tauri.conf.json
├── packages/
│   └── frontend/
│       ├── package.json
│       ├── vite.config.ts
│       ├── tsconfig.json
│       ├── tailwind.config.js
│       ├── postcss.config.js
│       ├── index.html
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── index.css
│       │   ├── types.ts
│       │   ├── stores/
│       │   │   └── appStore.ts
│       │   ├── components/
│       │   │   ├── layouts/
│       │   │   ├── tabs/
│       │   │   ├── address-bar/
│       │   │   ├── sidebar/
│       │   │   ├── editor/
│       │   │   ├── target/
│       │   │   ├── timeline/
│       │   │   ├── inspector/
│       │   │   ├── console/
│       │   │   ├── control/
│       │   │   ├── devtools/
│       │   │   │   ├── DevToolsPanel.tsx
│       │   │   │   └── panels/
│       │   │   │       ├── ElementsPanel.tsx
│       │   │   │       ├── ConsolePanel.tsx
│       │   │   │       ├── SourcesPanel.tsx
│       │   │   │       ├── NetworkPanel.tsx
│       │   │   │       ├── TimelinePanel.tsx
│       │   │   │       ├── SASTPanel.tsx
│       │   │   │       ├── JWTDecoderPanel.tsx
│       │   │   │       ├── CryptoDetectorPanel.tsx
│       │   │   │       ├── FuzzerPanel.tsx
│       │   │   │       ├── AuthAnalyzerPanel.tsx
│       │   │   │       ├── APIMapperPanel.tsx
│       │   │   │       ├── DOMDiffPanel.tsx
│       │   │   │       ├── WebSocketPanel.tsx
│       │   │   │       ├── GraphQLPanel.tsx
│       │   │   │       └── WasmPanel.tsx
│       │   │   ├── settings/
│       │   │   │   └── SettingsModal.tsx
│       │   │   ├── command-palette/
│       │   │   │   └── CommandPalette.tsx
│       │   │   └── tabs/
│       │   ├── kernel/
│       │   │   ├── BrowserKernel.ts
│       │   │   ├── PluginRegistry.ts
│       │   │   ├── ConfigurationSystem.ts
│       │   │   ├── KernelBootstrap.ts
│       │   │   ├── SASTEngine.ts
│       │   │   ├── WASSandboxEngine.ts
│       │   │   ├── MITMProxyEngine.ts
│       │   │   ├── MonacoLSPIntegration.ts
│       │   │   ├── TanStackDevTools.ts
│       │   │   └── index.ts
│       │   └── styles/
│       │       └── theme.css
└── .github/workflows/ci.yml
```

---

## Next Immediate Action
Start **Phase 0: Foundation** - Fix TypeScript, configure Vite, add missing components.