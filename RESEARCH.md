# Window Mirror - Architecture Research & Implementation Guide

## Overview
This document summarizes the research conducted on real-world implementations and how those patterns have been integrated into Window Mirror.

---

## Research Sources

### 1. Tauri + Monaco Editor + Plugin Architecture
**Projects Studied:**
- **SideX** (Sidenai/sidex): VS Code ported to Tauri - 96% smaller, same architecture
- **skript-studio**: Tauri 2 + React 19 + Monaco + LSP sidecar
- **ncode**: VS Code-inspired editor with AI, Tauri 2 + React + Monaco
- **darce**: Tauri 2 + Svelte 5 + Monaco + AI
- **Tabularis**: Tauri + React + Monaco + SQL editor
- **ssmsx**: Tauri v2 + React + Monaco + C# sidecar
- **Code Editor Land**: Mountain/Cocoon/Sky/Wind architecture

**Key Patterns Adopted:**
- Tauri 2 with native webview (WebView2/WKWebView/WebKitGTK)
- Rust backend for privileged operations (fs, process, terminal, git)
- TypeScript frontend with Monaco Editor
- Plugin system with explicit extension points
- Dependency injection / service layer in Rust

### 2. MITM Proxy (Rust)
**Projects Studied:**
- **hudsucker** (omjadas): rcgen CA, rustls upstream, HttpHandler for request/response modification
- **http-mitm-proxy**: MitmProxy + DefaultClient, service_fn for request handling
- **Proyx**: State machine, moka cache, DefaultClient with native/rustls TLS
- **RUP**: Burp-like desktop app, Tauri 2 + TypeScript, Chromium launcher with NSS trust
- **cheolsu-proxy**: Tauri + React + Ratatui, intercept rules, server replay, TypeScript scripting
- **proxelar**: Lua scripting, interactive intercept, reverse/forward modes

**Key Patterns Adopted:**
- rcgen for on-the-fly CA generation
- rustls for upstream TLS (preferred over native-tls)
- hudsucker HttpHandler for request/response interception
- moka cache for certificate caching
- Chromium launcher with NSS trust store integration
- Interception rules engine with priority-based matching
- Session persistence (HAR, curl, raw export)

### 3. Tree-sitter SAST Engine
**Projects Studied:**
- **Sighthound** (Corgea): tree-sitter + RON rules, pattern + taint mode, 9 languages
- **nyx-scanner**: Multi-language, SSA-based dataflow, cross-file taint, 10 languages
- **the-janitor**: 23 tree-sitter grammars, IFDS taint solver, Kani/Z3 verification
- **AEGIS**: 14 languages, inter-procedural call graph, cross-file taint
- **Fluid Attacks**: Tree-sitter as core SAST foundation

**Key Patterns Adopted:**
- tree-sitter for parsing (incremental, error recovery, 23+ languages)
- Pattern mode: tree-sitter queries for structural matching
- Taint mode: source/sink/sanitizer with propagation rules
- Cross-file taint analysis via call graphs
- RON/JSON rule format for extensibility
- SARIF output for CI/CD integration

### 4. WASM Sandbox (Wasmtime)
**Projects Studied:**
- **wasmtime docs**: consume_fuel, epoch_interruption, memory limits, deny-by-default linker
- **wasm-sandbox crate**: Capability-based security, resource limits, async host-guest
- **sandboxd**: Fuel + epoch interruption, deny-by-default with explicit host functions
- **Safeguard.sh**: Per-tenant Engine, explicit linker, seccomp defense-in-depth
- **Extism/moonrepo**: WASI preopened dirs, host functions, virtual paths

**Key Patterns Adopted:**
- Per-tenant Engine for compilation cache isolation
- Fuel metering (deterministic) + epoch interruption (wall-clock)
- Explicit linker - NO `add_to_linker` - deny by default
- ResourceLimiter for memory, StoreLimits for tables
- WASI preopened dirs only, no inherit_stdio
- Host function registry with rate limiting + validation
- seccomp profile as defense-in-depth

### 5. DevTools (TanStack DevTools)
**Projects Studied:**
- **TanStack DevTools**: Native SolidJS support! Core shell in Solid, adapters for React/Vue/Preact
- **Chrome DevTools Protocol**: 53+ domains, TypeScript definitions
- **chrome-devtools-kit**: Panel/sidebar creation, network interception, theme matching
- **solid-devtools**: Reactivity debugger, Chrome extension + overlay

**Key Patterns Adopted:**
- TanStack DevTools has **native SolidJS support** - perfect for Window Mirror!
- Core shell always Solid.js, plugins render in YOUR framework via portals
- EventClient: framework-agnostic typed event bus
- ClientEventBus + ServerEventBus (WebSocket for cross-tab)
- Vite plugin: auto-inject, go-to-source, console piping
- Plugin factories: `createSolidPlugin()` for easy creation

### 6. Monaco Editor LSP Integration
**Projects Studied:**
- **TypeFox/monaco-languageclient**: Connect Monaco with LSP servers via WebSocket/JSON-RPC
- **monaco-languageclient-examples**: Worker-based LSP servers (clangd, pyright in WASM)
- **monaco-vscode-api**: VS Code extension API compatibility layer
- **monaco-editor-wrapper**: Unified config for classic/extended modes
- **tower-lsp-web-demo**: Rust LSP (tower-lsp) + tree-sitter compiled to WASM in browser

**Key Patterns Adopted:**
- `monaco-languageclient` for LSP client
- `vscode-ws-jsonrpc` for WebSocket transport
- Worker-based LSP servers (clangd, pyright compiled to WASM)
- `monaco-vscode-api` for VS Code extension compatibility
- Two adapter strategies: TypeScript (direct TS compiler) vs LSP-style (CSS/HTML/JSON)
- `lspLanguageFeatures.ts` shared adapter for LSP-based languages

---

## Window Mirror Implementation

### Kernel Architecture (`packages/frontend/src/kernel/`)

```
kernel/
├── BrowserKernel.ts          # Core primitives + plugin system + extension points
├── PluginRegistry.ts         # Plugin lifecycle, dependencies, built-in plugins
├── ConfigurationSystem.ts    # Hierarchical config, schemas, profiles, validation
├── KernelBootstrap.ts        # Kernel implementation, Tauri commands, Rust primitives
├── SASTEngine.ts             # Tree-sitter SAST with pattern + taint mode
├── WASSandboxEngine.ts       # Wasmtime sandbox with fuel + epoch + deny-by-default
├── MITMProxyEngine.ts        # hudsucker-based MITM proxy with rules + Chromium
├── MonacoLSPIntegration.ts   # TypeFox monaco-languageclient + LSP servers
├── TanStackDevTools.ts       # TanStack DevTools integration for SolidJS
└── index.ts                  # Unified exports
```

### Built-in Plugins (20+)

| Category | Plugins |
|----------|---------|
| **Core UI** | tab-bar, address-bar, sidebar, command-palette |
| **Navigation** | navigation, tab-management, session-restore |
| **Network** | network-hooks (MITM proxy), cache, proxy, dns |
| **DevTools** | elements, console, sources, network, timeline, performance, memory, application, security |
| **Window Mirror** | MITM Proxy, SAST, WASM Sandbox, Timeline Engine |
| **Advanced DevTools** | JWT Decoder, Crypto Detector, Fuzzer, Auth Analyzer, API Mapper, DOM Diff, WebSocket, GraphQL, WASM |

### Extension Points (Everything Replaceable)

```typescript
// UI Components
'ui.tab-bar', 'ui.address-bar', 'ui.sidebar', 'ui.command-palette',
'ui.new-tab-page', 'ui.error-page', 'ui.settings', 'ui.devtools',
'ui.find-bar', 'ui.print-preview', 'ui.downloads', 'ui.history',
'ui.bookmarks', 'ui.extensions'

// Behavior
'behavior.navigation', 'behavior.tab-management', 'behavior.session-restore',
'behavior.download-handling', 'behavior.search-engine', 'behavior.auto-fill',
'behavior.password-manager', 'behavior.translation', 'behavior.reader-mode',
'behavior.picture-in-picture'

// Network
'network.request-hooks', 'network.cache', 'network.proxy', 'network.dns',
'network.certificate', 'network.hsts', 'network.ocsp'

// Rendering
'rendering.engine', 'rendering.font', 'rendering.scroll', 'rendering.zoom',
'rendering.theme', 'rendering.animation'

// Security
'security.sandbox', 'security.csp', 'security.cookies', 'security.permissions',
'security.mixed-content', 'security.referrer', 'security.feature-policy'

// DevTools
'devtools.elements', 'devtools.console', 'devtools.sources', 'devtools.network',
'devtools.performance', 'devtools.memory', 'devtools.application',
'devtools.security', 'devtools.lighthouse', 'devtools.custom'

// Storage
'storage.local', 'storage.session', 'storage.indexeddb', 'storage.cache',
'storage.cookies', 'storage.service-worker'

// Platform
'platform.clipboard', 'platform.notifications', 'platform.geolocation',
'platform.media', 'platform.bluetooth', 'platform.usb', 'platform.serial',
'platform.hid', 'platform.nfc'

// Customization
'customization.themes', 'customization.keybindings', 'customization.gestures',
'customization.menus', 'customization.toolbar', 'customization.sidebar'
```

---

## Key Implementation Files

### 1. SAST Engine (`SASTEngine.ts`)
- 15 built-in security rules (XSS, SQLi, CMDi, Path Traversal, Secrets, Crypto, SSRF, etc.)
- Tree-sitter queries for 17 languages
- Pattern mode + Taint mode support
- Web worker implementation for background scanning

### 2. WASM Sandbox (`WASSandboxEngine.ts`)
- Wasmtime with fuel + epoch interruption
- Deny-by-default host function registry
- Per-tenant Engine isolation
- seccomp defense-in-depth
- Host functions: log, random, time, crypto.getRandomValues

### 3. MITM Proxy (`MITMProxyEngine.ts`)
- hudsucker-based with rcgen CA
- Interception rules engine (priority-based)
- Chromium launcher with NSS trust store
- Session persistence (HAR, curl, raw)
- Request/response modification + replay

### 4. Monaco LSP (`MonacoLSPIntegration.ts`)
- 12 built-in LSP servers (TypeScript, Python, Rust, Go, C++, etc.)
- TypeFox monaco-languageclient integration
- Worker-based WASM LSP servers
- monaco-vscode-api compatibility layer

### 5. TanStack DevTools (`TanStackDevTools.ts`)
- 19 built-in panels (Core + Window Mirror specific)
- Native SolidJS support via `@tanstack/solid-devtools`
- Framework-agnostic EventClient
- Vite plugin integration

---

## Rust Backend Commands (`src-tauri/src/`)

Each engine exposes Tauri commands:

| Engine | Commands |
|--------|----------|
| **SAST** | `sast:scan`, `sast:scan-file`, `sast:validate-rules`, `sast:export-sarif` |
| **WASM Sandbox** | `wasm:create-engine`, `wasm:validate-module`, `wasm:execute`, `wasm:snapshot` |
| **MITM Proxy** | `proxy:start`, `proxy:stop`, `proxy:launch-chromium`, `proxy:replay`, `proxy:export-har` |
| **Monaco LSP** | `lsp:start-server`, `lsp:restart-server`, `lsp:get-diagnostics` |

---

## Development Workflow

### 1. Install Dependencies
```bash
cd packages/frontend
npm install
```

### 2. Run Dev Server
```bash
npm run dev
```

### 3. Build for Production
```bash
npm run build
```

### 4. Rust Backend
```bash
cd src-tauri
cargo build --release
```

---

## Key Dependencies

### Frontend
```json
{
  "@tanstack/solid-devtools": "^0.1.0",
  "@tanstack/devtools-event-client": "^0.1.0",
  "monaco-languageclient": "^0.20.0",
  "vscode-ws-jsonrpc": "^2.0.0",
  "vscode-languageserver-protocol": "^3.17.0",
  "tree-sitter": "^0.21.0",
  "tree-sitter-typescript": "^0.21.0",
  "tree-sitter-python": "^0.20.0",
  "tree-sitter-rust": "^0.20.0",
  // ... 23 tree-sitter grammars
  "@wasm-tool/wasm": "^1.0.0"
}
```

### Rust (src-tauri/Cargo.toml)
```toml
# Core
tauri = { version = "2.0", features = ["tray-icon", "webview", "window-state"] }
tokio = { version = "1.40", features = ["full", "tracing"] }

# MITM Proxy
hudsucker = { version = "0.24", features = ["rcgen-ca", "rustls-client", "http2", "full"] }
rcgen = "0.11"
rustls = { version = "0.23", features = ["std", "pem"] }
moka = "0.12"

# WASM Sandbox
wasmtime = { version = "25.0", features = ["cranelift", "wasm-backtrace"] }
wasmtime-wasi = { version = "25.0", features = ["preview1"] }

# SAST
tree-sitter = "0.24"
# tree-sitter grammars as dependencies

# Storage
redb = "1.0"
sled = "0.34"

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
ron = "0.8"  # for SAST rules
```

---

## Security Model

### Defense in Depth
1. **WASM Sandbox**: Wasmtime + fuel + epoch + explicit linker + seccomp
2. **MITM Proxy**: rcgen CA + rustls upstream + interception rules
3. **SAST**: Static analysis prevents vulnerable code from running
4. **Kernel**: Capability-based plugin permissions, deny-by-default

### Trust Boundaries
```
┌─────────────────────────────────────────────────────────┐
│                    Kernel (Rust)                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │
│  │   WASM      │ │   MITM      │ │       SAST          │ │
│  │   Sandbox   │ │   Proxy     │ │       Engine        │ │
│  │  (Wasmtime) │ │  (hudsucker)│ │  (tree-sitter)      │ │
│  └─────────────┘ └─────────────┘ └─────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│              Plugin System (WASM/TypeScript)            │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │
│  │  Core UI    │ │  DevTools   │ │  Window Mirror      │ │
│  │  Plugins    │ │  Plugins    │ │  Plugins            │ │
│  └─────────────┘ └─────────────┘ └─────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│              Frontend (SolidJS + Monaco)                │
└─────────────────────────────────────────────────────────┘
```

---

## Next Steps

1. **Install dependencies**: `cd packages/frontend && npm install`
2. **Build Rust backend**: `cd src-tauri && cargo build`
3. **Run dev server**: `npm run dev`
4. **Implement panel components** for each devtools panel
5. **Add Rust implementations** for Tauri commands
6. **Test WASM sandbox** with sample modules
7. **Test MITM proxy** with Chromium launcher
8. **Test SAST engine** on sample codebases

---

## References

### Tauri + Monaco
- SideX: https://github.com/Sidenai/sidex
- skript-studio: https://github.com/skript-studio/skript-studio
- ncode: https://github.com/knand4930/ncode
- Tabularis: https://tabularis.dev/

### MITM Proxy
- hudsucker: https://github.com/omjadas/hudsucker
- http-mitm-proxy: https://crates.io/crates/http-mitm-proxy
- Proyx: https://github.com/michealkeines/Proyx
- RUP: https://github.com/ZZ0R0/RUP
- cheolsu-proxy: https://github.com/ohah/cheolsu-proxy

### SAST
- Sighthound: https://github.com/Corgea/Sighthound
- nyx-scanner: https://docs.rs/nyx-scanner
- the-janitor: https://github.com/janitor-security/the-janitor
- AEGIS: https://aegis.raknor.ai/

### WASM Sandbox
- wasmtime docs: https://docs.wasmtime.dev/
- wasm-sandbox: https://docs.rs/wasm-sandbox
- sandboxd: https://github.com/sarmakska/sandboxd
- Extism: https://extism.org/

### DevTools
- TanStack DevTools: https://tanstack.com/devtools
- Chrome DevTools Protocol: https://chromedevtools.github.io/devtools-protocol/
- chrome-devtools-kit: https://github.com/theluckystrike/chrome-devtools-kit

### Monaco LSP
- TypeFox/monaco-languageclient: https://github.com/TypeFox/monaco-languageclient
- monaco-vscode-api: https://github.com/CodinGame/monaco-vscode-api
- tower-lsp-web-demo: https://github.com/silvanshade/tower-lsp-web-demo