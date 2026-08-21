export function ElementsPanel() {
  return (
    <div class="flex h-full bg-zen-bg">
      <div class="w-1/2 border-r border-zen-border p-3 overflow-auto font-mono text-xs">
        <div class="text-gray-500 mb-2">DOM Tree (model-view-presenter, lit-html, CDP DOM domain)</div>
        <div class="text-white">&lt;html&gt;<div class="ml-4">&lt;body&gt;<div class="ml-4 text-zen-accent">&lt;div id="app"&gt;…&lt;/div&gt;</div>&lt;/body&gt;</div>&lt;/html&gt;</div>
      </div>
      <div class="w-1/2 p-3 overflow-auto text-xs">
        <div class="text-gray-400 mb-2">Styles • Computed • Event Listeners</div>
        <div class="glass p-2 rounded">element.style &#123; color: #00d4aa &#125;</div>
      </div>
    </div>
  )
}
