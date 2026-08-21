export function SourcesPanel() {
  return (
    <div class="flex h-full bg-zen-bg">
      <div class="w-64 border-r border-zen-border p-3 text-xs">
        <div class="text-gray-400 mb-2">File Tree</div>
        <div class="text-white">src/App.tsx</div><div class="text-white">src/main.tsx</div>
        <div class="text-gray-500 mt-4">Breakpoints • Call Stack • Scope • Watch</div>
      </div>
      <div class="flex-1 p-3 font-mono text-xs text-gray-300">Debugger (CDP Debugger domain + V8 Inspector, breakpoints, stepping, stack traces)</div>
    </div>
  )
}
