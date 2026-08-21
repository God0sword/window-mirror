import { For } from 'solid-js'

function Placeholder(props: { title: string; cdp: string; bullets: string[] }) {
  return (
    <div class="h-full flex flex-col bg-zen-bg text-xs p-4 gap-3 overflow-auto">
      <div class="text-sm font-medium text-white">{props.title}</div>
      <div class="text-gray-500 font-mono">Transport: {props.cdp}</div>
      <ul class="list-disc list-inside text-gray-400 space-y-1">
        <For each={props.bullets}>{(b) => <li>{b}</li>}</For>
      </ul>
      <div class="mt-auto px-2 py-1 rounded bg-yellow-500/10 text-yellow-400 w-fit">
        Placeholder — implementation tracked in MASTER.md Part 7 Phase 3
      </div>
    </div>
  )
}

export function PerformancePanel() {
  return (
    <Placeholder
      title="Performance"
      cdp="Tracing / Performance domains"
      bullets={['Scripting/rendering/painting lanes', 'Long tasks + layout shifts', 'Flame chart']}
    />
  )
}

export function MemoryPanel() {
  return (
    <Placeholder
      title="Memory"
      cdp="HeapProfiler domain"
      bullets={['Heap snapshots (3-way diff)', 'Allocation timelines', 'Detached-node detection']}
    />
  )
}

export function ApplicationPanel() {
  return (
    <Placeholder
      title="Application"
      cdp="CDP + direct storage APIs"
      bullets={['Manifest / Service Workers', 'Local/Session/IndexedDB/Cookies editors', 'Storage quota pie']}
    />
  )
}

export function SecurityPanel() {
  return (
    <Placeholder
      title="Security"
      cdp="Security domain"
      bullets={['Cert chain viewer', 'Mixed-content report', 'CSP violations']}
    />
  )
}

export function SASTPanel() {
  return (
    <Placeholder
      title="SAST"
      cdp="sast:* Tauri commands (tree-sitter)"
      bullets={['Findings grouped by file/severity/rule', 'Pattern + taint mode', 'SARIF export']}
    />
  )
}

export function JWTDecoderPanel() {
  return (
    <Placeholder
      title="JWT Decoder"
      cdp="MITM tap → token auto-detect"
      bullets={['Decode header/payload', 'Verify signature', 'Edit claims + replay']}
    />
  )
}

export function CryptoDetectorPanel() {
  return (
    <Placeholder
      title="Crypto Detector"
      cdp="Response/bundle scanning"
      bullets={['Weak hashes (MD5/SHA1)', 'Hardcoded keys', 'Low-entropy randomness']}
    />
  )
}

export function FuzzerPanel() {
  return (
    <Placeholder
      title="Fuzzer"
      cdp="proxy:replay-sequence"
      bullets={['Param/wordlist fuzzing', 'Response diffing', 'Anomaly scoring']}
    />
  )
}

export function AuthAnalyzerPanel() {
  return (
    <Placeholder
      title="Auth Analyzer"
      cdp="MITM tap → cookie/token graph"
      bullets={['Secure/SameSite/HttpOnly audit', 'Token flow graph', 'CSRF surface hints']}
    />
  )
}

export function APIMapperPanel() {
  return (
    <Placeholder
      title="API Mapper"
      cdp="Traffic harvest + introspection"
      bullets={['Endpoint graph', 'OpenAPI export', 'GraphQL introspection']}
    />
  )
}

export function DOMDiffPanel() {
  return (
    <Placeholder
      title="DOM Diff"
      cdp="DOM domain snapshots"
      bullets={['Snapshot A/B compare', 'Mutation timeline scrubber', 'Selector generator']}
    />
  )
}

export function WebSocketPanel() {
  return (
    <Placeholder
      title="WebSocket"
      cdp="Network.webSocketFrame* events"
      bullets={['Frame stream viewer', 'Direction/timing columns', 'Mutation hooks (plugins)']}
    />
  )
}

export function GraphQLPanel() {
  return (
    <Placeholder
      title="GraphQL"
      cdp="Captured operations + introspection"
      bullets={['Schema explorer', 'Query builder', 'Persisted operations']}
    />
  )
}

export function WasmPanel() {
  return (
    <Placeholder
      title="WASM Inspector"
      cdp="wasm:* Tauri commands (Wasmtime)"
      bullets={['Module list, exports/imports', 'Memory hex view', 'Invoke exported fn (sandboxed)']}
    />
  )
}
