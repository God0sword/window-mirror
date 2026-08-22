# WINDOW MIRROR — MASTER DOCUMENT

> **One file. Everything.** Vision, product spec, architecture, full research library,
> phased plan with live status, honest debt register, and open questions.
>
> Other docs (`ARCHITECTURE.md`, `RESEARCH.md`, `IMPLEMENTATION_PLAN.md`) are
> historical snapshots; this document supersedes them.

---

# PART 1 — VISION

## 1.1 The Metaphor

**A police interrogation room's one-way mirror.**

- **We** (the operator) sit behind the mirror.
- **The suspect** (any web page, API, payload, or our own code) sits in the interrogation room.
- We have **full visibility**: every DOM mutation, every network request, every storage
  change, every WebSocket frame, every console log, every timing delta — correlated back
  to the exact source line that caused them.
- We have **controlled interaction**: inject scripts, rewrite headers, replay requests,
  mutate state, pause execution mid-flight.
- The suspect **never knows we're there** unless we choose to reveal ourselves.

This is not a browser with devtools bolted on.
**It is a surveillance platform that happens to render HTML.**

## 1.2 What It Is

A single desktop application combining four things that normally live in four tools:

| Traditional tool | Window Mirror equivalent |
|---|---|
| Zen Browser / Arc | The browser shell (Part 2.1) |
| Burp Suite / mitmproxy | The system-wide MITM proxy (Part 3) |
| Chrome DevTools | The interrogation panels (Part 4) |
| VS Code | Monaco editor workspace (Part 5) |

Plus two things none of them give you:
1. **Correlation** — click a line of code → see every request/DOM/storage event it caused;
   click a request → jump to the code that fired it.
2. **Total customizability** — every panel, behavior, theme, keybinding is a plugin on an
   explicit extension-point list. Nothing is hard-coded chrome.

## 1.3 Non-Negotiables (locked with owner)

- **Speed & security first** → Rust for everything privileged; TypeScript only where web tech wins.
- **System-wide visibility** → MITM proxy captures ALL machine traffic (PAC/system mode),
  plus per-webview scoping; everything filterable because customization is king.
- **Everything customizable** → themes, layouts, keybindings, proxy rules, SAST rules,
  sandbox presets, panel order — all user-configurable, hot-reloadable.
- **Local-first** → no telemetry home, works fully offline, encryption available.
- **Linux first** → WebKitGTK; Windows/macOS later.

---

# PART 2 — PRODUCT SPEC

## 2.1 Browser Shell (Zen Browser DNA)

Research source: docs.zen-browser.app user manual + 2026 feature guide.

| Zen feature | Our adaptation | Status |
|---|---|---|
| **Vertical tab sidebar** | Left sidebar = tabs + workspaces + timeline + extensions + settings panels. Collapsible to 48–56px icon strip. | 🟡 built (Sidebar.tsx) |
| **Workspaces** | Isolated sets of tabs/pinned-tabs per project; each binds optional *session container* (isolated cookies like Firefox containers). Sidebar shows only current workspace; switching swaps contents. Icons + names per workspace. | 🟡 store exists, UI partial |
| **Compact Mode** (= our **Zen Mode**) | Hide sidebar AND top toolbar; hover screen edges to reveal. Three auto-collapse toggles (hide-on-click-outside, hide-toolbar-on-blur, show-on-hover). Animated slide (respects `prefers-reduced-motion`). | 🟡 mode enum exists, hover-reveal missing |
| **Split View** (up to 4 tabs, grid) | 2–4 panes tiled H/V/grid; drag tab onto pane edge to split; `:::` drag handle + `‒` unsplit overlay buttons; shortcuts Alt+Ctrl+H/V/G. Binary-tree layout engine. | 🔴 planned Phase 1 |
| **Glance** | Alt+click any link → floating preview window without leaving page. | 🔴 backlog |
| **Container Tabs** | Per-workspace cookie jars. In WebKitGTK: separate `WebsiteDataStore` per container. | 🔴 backlog |
| **Pinned Tabs / Essentials** | Always-available pinned strip atop sidebar. | 🟡 flag exists in TabConfig |
| **Mods ecosystem** | Our **plugin system** (Part 6). Mods = folder w/ `chrome.css` + optional `script.js` + `theme.json`; registry with install/toggle/uninstall. Ours adds WASM plugins beyond CSS/JS. | 🟡 kernel types done, loader stub |
| **Boosts** (per-site tint/fonts/zap/dark) | Per-domain style overrides stored in profile. | 🔴 backlog |

### Modes (our addition, locked)

| Mode | Layout | Visible | Persists per-file? |
|---|---|---|---|
| **Zen** | Single pane | Editor OR Target fullscreen | cursor/scroll/folds |
| **Telemetry** | 4-pane grid | Editor \| Timeline \| Inspector \| Console | pane sizes, active tabs |
| **Focus** | 2-pane | Editor \| one chosen panel | which panel |
| **Interrogation** | 3-pane | Target \| Mirror Timeline \| Control Panel | layout, filters |

### 2.4 Blank Boot + Session Script Generator (owner feature, backlog-flagship)

Boot = blank canvas (nothing auto-opens). Always-available floating command bar
(Ctrl+Shift+P) is the single entry point. Future blank-page **widgets** are plugins.

**Session Script Generator** — the browser writes your startup for you:
1. You configure: sites to open (+ per-site settings: workspace, container, split-slot,
   proxy rules), local files/panels to raise, widget set.
2. Browser emits a portable script — first version JSON "session file"
   (`File → Export session` / auto-saved per workspace); later a runnable
   `wm://session/<name>` or CLI `window-mirror --run-session work.json`.
3. Run it any time → exact state restored (tabs, splits, proxy rules armed, panels docked).
   Think: Zen's session restore × VS Code profiles × macro recorder, but generated from
   what you actually did/configured, editable as text, diffable in git.

Status: 🔴 design only — lands after split-view + persistence (needs both to serialize).

Animations: 200–300ms cubic-bezier, configurable speed (`none/fast/normal/slow/custom-ms`),
`prefers-reduced-motion` always respected. **Modes persist with files/workspaces** (locked).

### Aesthetics

Zen gradients + macOS/Apple glass: `backdrop-blur`, translucent surfaces
(`rgba(28,28,30,.72)`), 6/10/16px radii, accent `#00d4aa` with glow tokens. Full CSS-variable
theme engine — every color/font/radius/shadow/animation token swappable at runtime.

## 2.2 Editor Workspace

Monaco raw API (no wrapper dep), custom Solid wrapper. LSP via TypeFox
`monaco-languageclient` over WebSocket to Rust sidecar servers (rust-analyzer,
pyright, gopls, clangd, typescript-language-server…) — external binaries first
(smaller than WASM builds); WASM-in-worker later for zero-install.

Per-file persistence: cursor, scroll, folds, dirty flag, **and its own mode**
(a file can sit in Telemetry while the app is Zen).

## 2.3 Keyboard Map (default, all remappable)

```
Ctrl+K / Ctrl+Shift+P   Command palette
Ctrl+B                  Toggle sidebar          Ctrl+\    Cycle mode
Ctrl+T / Ctrl+W         New/close tab           Ctrl+L    Focus address bar
Ctrl+S / Ctrl+Shift+S   Save / Save all         F12       DevTools toggle
Alt+← / Alt+→           History                 Ctrl+R    Reload
Alt+Ctrl+H/V/G          Split view layouts      Ctrl+Shift+X  Stop proxy
Ctrl+Shift+P*           Start proxy (*palette wins; proxy gets Ctrl+Alt+P)
Ctrl+Shift+C            Inspect element         Ctrl+F    Find in page
```

---

# PART 3 — MITM PROXY (system-wide)

**Stack:** hudsucker 0.24 (ProxyBuilder + rustls client) · rcgen 0.13 CA · moka leaf cache.

### Capabilities (all implemented or specified in `src-tauri/src/mitm_proxy.rs`)

1. **CA lifecycle** — generate/load PEM, persist under `$DATA/window-mirror/ca/`,
   install to system store (`update-ca-certificates`) and NSS dbs (Chromium profile +
   Firefox profile scan for `cert9.db`). First-run wizard prompts before touching trust stores.
2. **Interception rules engine** — priority-sorted; match on URL glob/regex, method,
   headers, direction, content-type, custom JS filter (later). Actions:
   `pass · block · modify(req/resp headers/body/method/url) · redirect · mock(status/headers/body/delay) · pause · script`.
3. **Pause/Resume** — exchange held on a `Notify`; frontend edits; resume applies queued
   modifications; wall-clock timeout (default 30s) forwards unmodified.
4. **Replay** — real outbound client (hyper-util + hyper-rustls native roots, HTTP/1+2);
   optional modification list; result re-emitted into history.
5. **Export** — HAR 1.2 (entries from history ring), cURL script per request, JSONL dump
   of the Redb timeline.
6. **WebSocket capture** — frames counted/streamed; mutation hooks reserved for plugins.
7. **Chromium launcher** — dedicated `--user-data-dir` profile, `--proxy-server`,
   `--disable-quic` (keeps traffic on TCP path), NSS import via certutil, extra-args passthrough.
8. **Scoping modes** (customization): `per-webview` (wry `proxy_url` → WebKitGTK
   `set_network_proxy_settings(CUSTOM)`), `system-PAC`, `manual global`. Filter lists per scope.

### Event flow

```
WebView/Browser ──▶ hudsucker handler ──▶ rules.evaluate ──▶ forward/block/mock…
                          │                                   │
                          ▼                                   ▼
                broadcast<ProxyEvent> ──▶ setup.rs bridge ──▶ Tauri emit + Redb timeline
                          │
                          └──▶ frontend panels (History, Rules, CA, Interceptor)
```

---

# PART 4 — DEVTOOLS (replicate Chrome, then exceed)

Research sources: developer.chrome.com/docs/devtools per-panel overviews;
devtoolstips.org cross-browser tool census; ChromeDevTools/devtools-frontend
architecture docs (core/models/panels/ui/entrypoints, lazy-load via `-meta.ts`
view extensions, MVP pattern, lit-html views).

## 4.1 Chrome parity checklist

| Panel | Chrome features to replicate | Transport | Priority |
|---|---|---|---|
| **Elements** | DOM tree; Styles (authored rules, invalid/overridden flags); Computed; Layout (box model, grid/flex overlays); Event Listeners (+passive/blocking filter); DOM Breakpoints; Properties; Accessibility tree | CDP `DOM`+`CSS` domains | P0 |
| **Console** | REPL w/ autocomplete; log/warn/error/info/debug; grouped counts; stack traces w/ source links; `$0`-style recent-element refs; live expressions; filter bar | CDP `Runtime.consoleAPICalled/evaluateOnCallFrame` | P0 |
| **Sources** | File tree (pages/filesystem/overrides); editor w/ breakpoints (line/conditional/log); call stack; scope variables; watch; XHR/fetch breakpoints; pretty-print; Workspaces (map local dir ↔ URL — ours maps to the IDE natively) | CDP `Debugger` domain | P0 |
| **Network** | Waterfall w/ timing bars; Headers/Payload/Response/Initiator/Timing tabs; HAR export; throttling presets; request blocking; WS frames sub-tab; search across bodies | CDP `Network` domain + our MITM tap | P0 |
| **Timeline** ★ours-unified | Chrome splits this across Performance/Monitor; we unify network+DOM+storage+console into ONE stream with source correlation | Internal bus | P0 |
| **Performance** | Record trace: scripting/rendering/painting lanes, long tasks, layout shifts, interactions track, flame chart | CDP `Tracing`/`Performance` | P1 |
| **Memory** | Heap snapshots (3-way diff), allocation timelines, detached-node detection, ArrayBuffer inspector | CDP `HeapProfiler` | P1 |
| **Application** | Manifest; Service Workers (push/update/skipWaiting); Storage quota pie; Local/Session/IndexedDB/Cookies/Cache editors; Background services (fetch/sync/notifications); bfcache tests; Frames (CSP, isolation) | CDP + direct storage APIs | P1 |
| **Security** | Cert chain viewer, mixed-content report, CSP violations, origin isolation | CDP `Security` | P1 |
| **Recorder** | Record/replay/edit user flows (step list, selectors, assertions) | Puppeteer-style replay | P2 |
| **Extras** | Rendering emulation (media/color-vision), Sensors, Search-all-resources, Protocol Monitor, Coverage, Performance Insights | various | P2 |

## 4.2 Our superpowers (Chrome can't)

| Panel | What it does |
|---|---|
| **Unified Timeline** | One correlated stream: HTTP ↔ DOM mutation ↔ storage ↔ console ↔ errors, each stamped with `SourceLocation{file,line,col}` when derivable (source maps + initiator stacks). Click event ⇄ jump editor. |
| **SAST** | Tree-sitter pattern+taint scanning of the workspace; findings as editor gutter markers + SARIF export. Rules are user-editable JSON. |
| **JWT Decoder** | Auto-detect tokens in requests/cookies/storage → decode header/payload, verify sig, edit claims, re-sign, replay. |
| **Crypto Detector** | Scan responses/bundles for weak hashes (MD5/SHA1), hardcoded keys, low-entropy randomness. |
| **Fuzzer** | Param/wordlist fuzzing with response diffing + anomaly scoring. |
| **Auth Analyzer** | Cookie/token flow graph, Secure/SameSite/HttpOnly audit, CSRF surface hints. |
| **API Mapper** | Endpoint graph harvested from traffic; OpenAPI/GraphQL introspection. |
| **DOM Diff** | Snapshot A/B compare, mutation timeline scrubber, selector generator. |
| **WASM Inspector** | Module list, exports/imports tables, memory hex view, invoke exported fn with args (through sandbox). |
| **GraphQL** | Schema explorer, query builder, persisted operations from captured traffic. |

Shell: TanStack DevTools core (Solid-native) hosting our Solid panels via portal adapters;
EventClient typed bus per plugin; Vite plugin for go-to-source + console piping in dev.

---

# PART 5 — ARCHITECTURE

## 5.1 Process topology

```
┌────────────────────────────────────────────────────────────────────┐
│ window-mirror (Tauri 2, Rust)                                      │
│  ├─ mitm_proxy   (hudsucker listener + rules + history ring)       │
│  ├─ ca_manager   (rcgen CA + trust-store installers)               │
│  ├─ chromium_launcher (profiled spawn + NSS import)                │
│  ├─ sast         (tree-sitter pool, pattern+taint, SARIF)          │
│  ├─ wasm_sandbox (wasmtime 25, fuel+timeout, WASI presets)         │
│  ├─ sqlite_db    (rusqlite+sqlcipher; kv, events, findings…)       │
│  ├─ timeline     (redb append-only mirror of events)               │
│  └─ commands.rs  (typed Tauri IPC surface ~45 cmds)                │
└───────────────▲────────────────────────────────────────────────────┘
                │ Tauri commands/events (JSON)
┌───────────────┴────────────────────────────────────────────────────┐
│ Frontend (SolidJS + Tailwind, WebView)                             │
│  ├─ kernel/  primitives+plugin-registry+config (pure TS)           │
│  ├─ components/ shell (tabs/address/sidebar/target/editor/panels)  │
│  └─ devtools/panels/* (TanStack-hosted Solid panels)               │
└────────────────────────────────────────────────────────────────────┘
```

## 5.2 Kernel primitives (unchangeable floor)

`StorageEngine · MessageBus(pubsub+req/resp+stream) · ProcessManager ·
NetworkStack(7 hook points) · RendererEngine(windows/tabs/UI) · SandboxEngine`

## 5.3 Plugin model

Manifest(id, entrypoints, permissions, deps, ui contributions, settings schema,
**overrides[]**) → instance lifecycle(onLoad/Enable/Disable/Unload/ConfigChange).
Overrides target the extension-point registry by priority:

```
ui.tab-bar · ui.address-bar · ui.sidebar · ui.command-palette · ui.new-tab-page
ui.devtools(+each panel) · behavior.navigation/tab-mgmt/session/search/passwords
network.hooks/cache/proxy/dns/certs · rendering.engine/theme/animation
security.sandbox/csp/cookies · storage.* · platform.* · customization.*
```

Built-ins ship as ordinary plugins so dogfooding is constant.

## 5.4 Persistence decision (benchmarked)

redb README table + nimbus dual-backend bench + native_db suite:

| op | redb | sqlite | pick |
|---|---|---|---|
| point read | 0.49–0.62µs | 1.1–3.5µs | redb |
| single write | **920ms/10k** | 7.04s/10k | redb |
| batched write | 1595ms | 2625ms | redb |
| indexed/range queries | N/A (KV only) | native SQL | sqlite |
| multi-index relational | N/A | native | sqlite |
| encryption-at-rest | DIY | sqlcipher builtin | sqlite |
| ad-hoc analytics ("find all 500s to api/x last hour") | app-level scan | SQL one-liner | sqlite |

**Decision:** SQLite(rusqlite, bundled-sqlcipher) is the primary store for
workspaces/files/settings/proxy-events/findings/snapshots. Redb stays solely as the
hot append-only timeline mirror (fastest single-writer ingest), JSONL-exportable.
Encryption: SQLCipher key derived Argon2id from user passphrase, per-profile.

## 5.5 Sandboxing presets (customizable, shipped defaults)

```
deny-all       no WASI, pure compute, fuel-capped
allow-fs-ro    preopen $SANDBOX_ROOT read-only
allow-fs-rw    preopen read-write
allow-network  host-fn http_fetch through allowlist proxy
full           fs-rw + network
```
Engine config: fuel on, threads/multi-memory/relaxed-simd/component-model OFF,
stdout/stderr via MemoryOutputPipe(1MiB cap), tokio timeout wrapper.

---

# PART 6 — RESEARCH LIBRARY (curated, with adopt-notes)

## 6.1 Tauri + Monaco shells
- **SideX** (github.com/Sidenai/sidex) — VSCode ported to Tauri; layer map Electron↔Tauri; Open-VSX ext host as sidecar. *Adopt:* layering discipline, SQLite storage, sidecar ext-host later.
- **skript-studio** — Tauri2+React19+Monaco+`monaco-languageclient` over WS to Rust tower-lsp sidecar; `vite-plugin-monaco-editor` blob workers; CSP recipe (`connect-src ws://127.0.0.1:*`, `worker-src blob:`). *Adopt:* LSP transport + CSP.
- **ncode**, **darce**, **Tabularis**, **ssmsx**, **editor.land** — recurring stack: Zustand/signals stores, react-resizable-panels (we: solid equivalents), sidecars over stdio/WS, "privileged work in Rust, rich UI in web" ethos.

## 6.2 MITM proxies
- **hudsucker** (omjadas) — ProxyBuilder{addr, rustls_client, RcgenAuthority(key,cert,cache), HttpHandler(handle_request→Option<RequestOrResponse>, handle_response→Response), WebSocketHandler}; features rcgen-ca/http2/full. *Adopt:* verbatim API.
- **http_mitm_proxy** crate — same shape alt impl (MitmProxy::new(issuer,cache).bind(addr,service_fn)); SSE+raw WS notes. *Reference only.*
- **Proyx** — nginx-style state machine src/state_machine.rs; moka cert cache; Tauri emit("proxy-event"). *Adopt:* event-emission naming.
- **RUP** — Burp-like Tauri2 app: Chromium launcher (`--user-data-dir`,`--proxy-server`,`--disable-quic`, NSS via HOME trick), lossless request model, mapper(crawl+fuzz). *Adopt:* launcher flags exactly.
- **cheolsu-proxy** — intercept rules(block/modify/map-local/redirect), server-replay, Deno/V8 TS scripting, Ratatui+Tauri dual front. *Adopt:* rule taxonomy + future TS-scripting action.
- **proxelar** — Lua on_request/on_response hooks, reverse mode, interactive intercept CLI. *Adopt:* reverse-mode flag.

## 6.3 SAST engines
- **Sighthound** (Corgea) — tree-sitter + RON rules {mode:"search"|taint{sources,sinks,sanitizers}}; parallel walkdir; SARIF out. *Adopt:* rule schema shape (we use JSON).
- **nyx-scanner** — two-pass, CFG, SSA taint, capability sanitizer labels, symex witnesses, SQLite index. *Roadmap:* SSA pass once pattern-mode ships.
- **the-janitor / AEGIS** — IFDS interprocedural, Z3/Kani proofs, PQC provenance. *Lesson:* syntactic-only matching floods FP; need context guards (auth decorators, sanitizers-by-name) early.
- **Fluid Attacks blog + safeguard.sh taint piece** — honest limits: reflection, ORM internals, serialization boundaries, framework-implicit dataflow. *Rule of thumb:* findings carry followed path OR explicit "could not follow X".

## 6.4 WASM sandboxing
- **Wasmtime security doc** — linear memory isolation, guard pages vs bounds-check+Spectre shims, control-flow-integrity roadmap, ANSI escape filtering on guest stdout. *Adopt:* sanitize guest stdout before display.
- **systemshardening guide** — per-tenant Engine (cache isolation!), fresh Store per exec, explicit linker (never add_to_linker blindly), allowlist hosts via proxy host-fn, seccomp outer fence. *Adopt:* per-profile Engine when profiles land.
- **sandboxd** — fuel AND epoch (fuel misses time spent inside host fns); watchdog thread ticks epochs. *Adopt:* epoch ticker task next iteration (tokio timeout covers us meanwhile).
- **moonrepo/Extism** — virtual paths, host-fn registry (log/random/time/send_request). *Adopt:* host-fn names.
- **wasmtime wasip2-plugins example** — Component::from_file + bindgen worlds. *Future:* WIT-typed plugin ABI replacing raw core-modules.

## 6.5 DevTools internals
- **devtools-frontend docs** — core/models/panels/ui-components/entrypoints layering; `-meta.ts` ViewManager.registerViewExtension lazy panels; MVP presenters + lit-html DEFAULT_VIEW; GRD bundling. *Adopt:* lazy meta-registration pattern in TanStack plugin defs.
- **CDP** — pdl→json/ts gen; domains as agents/handlers; Protocol Monitor; chrome.debugger exposes transport to extensions. *Adopt:* mirror domain names in our internal event kinds for familiarity.
- **TanStack devtools** — solid core shell + framework portals; EventClient(pluginId,eventMap) prefixing; ClientEventBus CustomEvents + BroadcastChannel + WS ServerBus; vite plugin trio(server/install/connection-injection); PiP. *Adopt:* whole thing.
- **chrome-devtools-kit** — MV3 wrappers (panel/sidebar/page/network/theme). *Pattern reference.*

## 6.6 Monaco + LSP
- **TypeFox monaco-languageclient** (+wrapper, -react, examples) — WS-jsonrpc or in-worker Langium servers; clangd/pyright WASM workers exist. *Adopt:* WS to Rust-spawned binaries first.
- **monaco-vscode-api** — run real .vsix extensions in Monaco; service overrides; registerExtension. *Backlog:* extension compat tier.
- **tower-lsp-web-demo** — Rust LSP compiled wasm32-unknown-unknown serving JS grammar in-browser; demuxer codec. *Proof WASM-LSP viable offline later.*
- **Read-OSS worker deep-dive** — ts vs lsp-style adapter split; WorkerManager lifecycle; reuse `lspLanguageFeatures` adapter layer for css/html/json-like services. *Adopt when adding custom language services.*

## 6.7 Storage benchmarks
- **redb README** (9950X3D/NVMe): writes 920ms vs sqlite 7040ms/10k; reads 1138ms vs 4283ms; lmdb leads pure-read but lacks Rust purity; compact sizes: rocksdb 893MB < sqlite 1.09G < redb 1.69G(uncompacted).
- **nimbus embedded bench harness** — alternating-order lanes, cold-start isolation, CI95 methodology. *Steal methodology for our own perf CI later.*
- **native_db suite** — secondary-key scaling favors sqlite ≥10 SKs; redb N/A by design.

## 6.8 Tauri webview networking
- wry PR #1006/#8441/#13278: `WebviewBuilder::proxy_url(http|socks5)` — Win=WebView2 args, Linux=WebKitGTK WebsiteDataManager.set_network_proxy_settings(CUSTOM), macOS needs `macos-proxy` feature + macOS14. Known regression: Ubuntu22.04 webkit4.1 ignores system-proxy → we always set explicitly. *Adopt:* never rely on system detection; set per-window ourselves.
- Issue #9978: NO_PROXY escape hatch per webview (`WEBKIT_NETWORK_PROXY_MODE_NO_PROXY`). *Adopt:* per-scope bypass.

## 6.9 Zen Browser UX canon (docs.zen-browser.app)
- Workspaces(+container binding, icons, swipe/wrap-around prefs) · Compact Mode(three auto-hide toggles, persistent-mod, 48px strip, edge-hover reveal, zen.view.compact.* flags) · SplitView(drag-to-edge create, ::: handle/‒ unsplit overlay, H/V/Grid shortcuts, min-resize %, drop-to-split pref) · Glance(alt-click preview) · Mods(chrome.css+script.js+theme.json, registry PR flow, about:preferences#zen manager) · Boosts(per-site tint/fonts/zap/forced-dark) · hidden-prefs catalog as inspiration for our power-config page.

## 6.10 Chrome DevTools census
developer.chrome.com/docs/devtools (per-panel overviews incl. new Application sections:
Storage pie, WebMCP, Bounce-tracking, Speculative loads, Device-bound sessions),
devtoolstips.org full cross-browser tool list (Protocol monitor, Coverage, Sensors,
Rendering emulation, Recorder…), Bugfender/LaunchDarkly/DebugBear practitioner tables.
→ distilled into Part 4 checklist.

---

# PART 7 — IMPLEMENTATION PLAN (phases + LIVE STATUS)

Legend: ✅ done · 🟡 partial/in-progress · 🔴 not started

## Phase 0 Foundation
- ✅ tsconfig strict (paths @kernel/@components/@stores)
- ✅ vite.config: wasm+solid, aliases, worker es, chunk split, port1420
- ✅ package.json deps installed (2026-08-21: fixed invalid JSON comments + 3 nonexistent versions; dropped @wasm-tool/wasm & vite-plugin-top-level-await — Vite8/Rolldown incompatible)
- ✅ SettingsModal (schema-driven widgets: toggle/select/slider/color/keybind/code/font/file)
- ✅ CommandPalette (fuzzy, categories, shortcuts, props isOpen/onClose)
- 🔴 CI workflow file
- ✅ First green `npm run typecheck` sweep (tsc -b clean) + `npm run build` produces dist (12MB, all Monaco workers)

## Phase 1 Browser Shell
- ✅ TabBar (drag reorder skeleton, dirty dot, close, mode chip, icons)
- ✅ AddressBar (nav btns, lock indicator, loading spinner, inspect)
- ✅ TargetView iframe (sandbox attrs, back/fwd/reload guards)
- 🟡 Sidebar (5 panels render; resize-drag handler half-done; workspaces CRUD missing)
- 🔴 Split-view layout engine (binary-tree, handles, overlays, shortcuts)
- 🔴 Compact/Zen hover-reveal edges
- 🔴 Theme runtime (CSS-var swap, animation-speed token, reduced-motion)
- 🔴 Per-file/workspace persistence round-trip via commands
- 🔴 Glance preview
- 🔴 Containers/session-isolation per workspace

## Phase 2 MITM Proxy (Rust)
- ✅ Cargo: hudsucker0.24/rcgen0.13/which/once_cell pinned
- ✅ ca_manager: generate+load rcgen0.13, authority()→RcgenAuthority, system+NSS installers(pem-based), Firefox profile scan
- ✅ rules_engine: priority sort, regex cache, match(url-glob/regex/method/headers/dir/content-type), actions Pass/Block/Modify/Redirect/Mock/Script/Pause
- ✅ chromium_launcher: exe discovery(which+known paths), profile dir, NSS import, QUIC-off args
- ✅ mitm_proxy: ProxyBuilder wiring, body capture(max-size, text-sniff), req/resp pairing(PENDING FIFO per host), Block/Redirect/Mock short-circuits w/ history+events, Modify(req&resp incl content-length fixup), Pause→Notify+timeout→apply mods, Replay(hyper-util rustls https_or_http h1+h2), HAR1.2+cURL export, history ring5k, stats counters, WS passthrough counting, subscribe()
- 🟡 setup.rs bridge proxy-event→emit+timeline.append (written, untested)
- 🟡 state.rs rewiring to engine (in progress — see debt D1)
- 🔴 commands.rs full wiring of 18 proxy cmds (stubs today — debt D2)
- 🔴 PAC/system-global mode + per-webview proxy_url application
- 🔴 Script-action runtime (TS via deno_core later)

## Phase 3 DevTools
- 🟡 Shell (DevToolsPanel 19 tabs declared; dock cycle button; search filter)
- ✅ placeholder Elements/Sources/Network panels (honest placeholders, labeled)
- ✅ TimelinePanel (real store feed, kind icons/colors, select→inspector)
- ✅ ConsolePanel bottom variant (filter, REPL input stub)
- ✅ InspectorPanel (request/response/dom/console sections from selected event)
- 🔴 CDP bridge to WebKitGTK inspector OR instrumented-page agent (decision Q3 below gates Sources/Memory/etc.)
- 🔴 Real Elements(Console/Sources/Network) implementations per Part4 checklist
- 🔴 TanStack Vite plugin trio + PiP

## Phase 4 SAST
- ✅ kernel/SASTEngine.ts: 15 rules(XSS/SQLi/CMDi/path/secrets/crypto/SSRF/proto-pollution/open-redir/deser/XXE), LANGUAGE_REGISTRY 17 langs, scanner+worker sketch
- 🟢 src-tauri/src/sast.rs: naive contains() placeholder — **must be replaced with tree-sitter Query pipeline (debt D5)**
- 🔴 Rule JSON loader + validation + hot-reload dir watch
- 🔴 Editor gutter markers + hover cards
- 🔴 Taint mode v0 (single-function source→sink BFS)

## Phase 5 Sandbox
- ✅ sandbox.rs rewritten: presets enum, deny-by-default linker, MemoryOutputPipe caps, fuel, tokio-timeout, snapshot=module bytes+settings, restore=replay
- 🟡 commands for sandbox absent (add run/validate/snapshot)
- 🔴 epoch-interruption ticker (replace/augment timeout)
- 🔴 network preset host-fn http_fetch w/ allowlist

## Phase 6 Persistence
- ✅ sqlite_db.rs: rusqlite bundled-sqlcipher, 7-table schema, kv ops, pragma key hook
- 🔴 migrate_from_redb real reader (debt D6)
- 🔴 Argon2id KDF + per-profile key prompt UX
- 🔴 Swap settings/workspace/file stores from JSON files → sqlite

---

# PART 8 — DEBT REGISTER (placeholders & broken bits, kill-list)

| # | Where | Problem | Fix |
|---|---|---|---|
| D1 | state.rs | Still imports legacy ProxyService path + unused `config_loaded`; engine constructed but start/auto-start path unverified | Rewrite AppState around MITMProxyEngine; drop dead field; unit-shape compile pass |
| D2 | commands.rs | 18 proxy commands are `Ok(json!({}))` stubs | Wire each to state.mitm_proxy methods (status/config/ca/chromium/rules/replay/export/stats/history-clear) |
| D3 | events.rs | OK now (uses MirrorEvent/ProxyStatus) — verify no stale `state::dom` refs remain | grep pass |
| D4 | setup.rs | Rewritten clean (v1 tray/global-shortcut garbage removed) | done; keep |
| D5 | sast.rs | `contains("innerHTML")` fake scanner | Replace with Parser+Query pool, byte→line/col mapping, rule JSON load, SARIF severity map |
| D6 | sqlite_db.rs | migrate_from_redb logs-and-noops | Open Database::create(redb_path), iterate T_EVENTS, insert rows |
| ~~D7~~ | frontend/MonacoLoader.tsx | ✅ KILLED 2026-08-21 — self-contained `?worker` imports; JS worker dropped (monaco 0.52 folds JS into ts.worker) | done |
| ~~D8~~ | lib/monaco/MonacoEditor.tsx | ✅ KILLED — full rewrite (ref var, per-file model switch, dispose cleanup, decorations-ready) | done |
| ~~D9~~ | components/editor/EditorPane.tsx | ✅ KILLED — imports fixed, helpers inlined | done |
| ~~D10~~ | AppLayout.tsx | ✅ KILLED — plain signals + Show per mode | done |
| ~~D11~~ | Sidebar.tsx | ✅ KILLED — named imports, onCleanup resize listeners, workspace CRUD via store actions | done |
| ~~D12~~ | CommandPalette | ✅ KILLED — clean JSX (`<Show>`/`<For>`), props isOpen/onClose, global hotkey handler | done |
| ~~D13~~ | SettingsModal | ✅ KILLED — decoupled from configManager; settings-store driven + localStorage overrides until Phase6 | done |
| ~~D14~~ | index.tsx | ✅ KILLED — kernel init guarded behind dynamic import w/ try/catch; UI boots without it | done |
| ~~D15~~ | vite.config.ts | ✅ KILLED — custom plugin deleted; also removed vite-plugin-top-level-await (Rolldown-incompatible) | done |
| ~~D16~~ | TabBar.tsx | ✅ KILLED — `fileOrder` array in store + reorderFiles() action, real drag-reorder | done |
| ~~D17~~ | TargetView.tsx | ✅ KILLED — let-ref iframe, cross-origin history guards, postMessage wm-agent bridge scaffold | done |

Additional fixes landed 2026-08-21 (typecheck sweep): appStore `createStore` from
`solid-js/store`; kernel barrel minimized to BrowserKernel+KernelBootstrap; duplicate
trailing export blocks removed (BrowserKernel/SAST/TanStack/WASM/MITM/LSP);
tree-sitter dynamic imports stubbed pending Rust SAST (D5); ConfigSchema.title optional;
kernel modules converted to `import type`; Solid strict-JSX pass (stroke-width,
kebab-case styles); 14 DevTools placeholder panels created.

---

# PART 9 — DECISIONS LOCKED (owner answers, 2026-08-21)

1. **Page instrumentation → Embed real Chrome DevTools frontend.**
   Owner directive: "get or reverse-engineer Chrome DevTools' code, or an open-source
   alternative, transform into our fast Rust/C core." Verified viable:
   - `chrome-devtools-frontend` npm package is **BSD-3-Clause** (legal embed), built as its
     own bundle (needs bundling effort — chii/Nice-PLQ prove it runs against non-Chromium
     backends).
   - WebKitGTK exposes a **CDP-shaped Remote Inspector protocol**:
     set `WEBKIT_INSPECTOR_HTTP_SERVER=127.0.0.1:<port>` at init + `developer-extras`;
     `GET /` returns HTML anchor list of targets (no `/json`); per-target WS at
     `/socket/{conn}/{target}/{type}`; JSON-RPC domains mirror CDP names (Runtime/DOM/
     CSS/Network/Console/Debugger — 27 domains, ~248 cmds) with dialect diffs
     (`DOM.getOuterHTML`, no `Page.navigate`). Reference client exists:
     `@gjsify/devtools-cdp`.
   - **Architecture chosen:** Rust transport shim multiplexes three feeds into one CDP
     stream per tab: (a) WebKitGTK inspector sockets (dialect-translated),
     (b) our MITM proxy tap feeding the Network domain (better timing/initiators than
     Chrome), (c) optional injected agent (chobitsu-style JS CDP impl) for deep Runtime
     when needed. Embedded devtools-frontend gets re-themed to glass/dark. Our custom
     panels (Timeline/SAST/JWT/…) stay TanStack Solid alongside.

2. **CA trust flow → Guided copy-paste.** Most controlled + easiest to understand:
   first-run wizard shows exact commands with copy buttons; zero privilege code paths.

3. **Boot layout → Customizable, default Zen-blank.** Browser-first like Zen: minimal
   surface until toggled. Not the current priority — browser shell + customizability first.

4. **Retention → Configurable setting, default forever.**

5. **Instrumentation follow-up (owner):** "we want customization so everything" —
   confirms decision 1; every inspector layer toggleable/rebindable.

6. **Boot layout follow-up (owner):** Boot into BLANK (Zen-style). Confirmed. Plus a new
   flagship backlog feature — see Part 2.4 below. Command palette (Ctrl+Shift+P style,
   VS Code / Zen command bar) is ALWAYS available even from blank state.

## 9c. Append log
- 2026-08-21: Q1–Q6 answered; owner ran CA copy-paste early (harmless — ca.pem appears after first engine init; wizard will re-show post-generation).

## 9b. Decisions Explained (plain language)

**Instrumentation = how panels see inside a page.**
Three doors: (A) engine's built-in diagnostic socket — set
`WEBKIT_INSPECTOR_HTTP_SERVER=127.0.0.1:PORT` at startup + developer-extras; GET /
returns HTML anchor list of targets (parse it), per-target WS at
`/socket/{conn}/{target}/{type}`, JSON-RPC mirroring CDP names with dialect diffs
(no Page.navigate; uses DOM.getOuterHTML). (B) inject a chobitsu-style JS agent that
implements CDP inside the page (chii proves the pattern) — powerful but detectable by
a hostile page, breaking the mirror. (C) CHOSEN: embed Google's BSD-3 devtools-frontend
bundle, re-themed; Rust shim merges (A)+(B-optional)+MITM-tap into one CDP stream per tab;
MITM owns the Network domain (superior: decrypted, machine-wide, real initiators).

**CA install = permission to decrypt HTTPS.** Proxy signs leaf certs with our local CA;
browsers must trust that CA or TLS fails. Guided wizard prints the two sudo commands
(cp to `/usr/local/share/ca-certificates/` + `update-ca-certificates`) with copy buttons —
app itself never elevates.

**Boot layout:** `boot.layout = zen(default,blank) | split(editor⇄target)`. Deferred.

**Retention:** `retention = forever(default) | days(N) | size(MB)`. Purge via UI/export-first.

---

*Generated from live session research; every claim above traces to a linked source in
Part 6 or to code currently in-tree. Update this file — not the scattered ones.*

---

# PART 10 — THE LONG VISION (owner's north star, 2026-08-21)

> **Disclaimer / direction:** Everything above (Phases 0–6) is only a fraction of the
> full vision. The end state is a single self-contained AppImage — data stored inside —
> that is the **main place for everything**:

- **Project hub** — create and manage new projects from inside the browser; add any
  capability as a feature/plugin.
- **Coding home base** — the editor + workspace is where all code lives.
- **Reverse-engineering suite** — dissect other sites and programs, translate open-source
  internals into our browser, build near-identical copies of other software and code,
  all in one place.
- **Emulation layer** — emulate hardware *and* software to test against or as a gateway
  to other destinations.
- **Purple-team platform** — deep enough to take full control of my own router using
  open-source tooling, and beyond.
- **AI harness** — first-class host for AI agents/workflows.
- **3D & mechanical** — code-driven 3D shaping (Blender-derived) plus mechanical
  engineering tooling, absorbed as features.

Everything gets made a feature, taken from open sources, translated into our browser,
and reverse-engineered. **This lands far after we finish the current phases — there is
a long way to go.** Ship order stays: shell → proxy → devtools → SAST → sandbox →
persistence → then this list, one absorbed capability at a time.
