import { For, createSignal, createMemo } from 'solid-js'
import { timelineEvents, selectedEventId, setSelectedEventId } from '../../stores/appStore'

export function ProxyHistoryPanel() {
  const [filter, setFilter] = createSignal('')
  const events = () => timelineEvents.filter(e => e.kind === 'network' && e.summary.toLowerCase().includes(filter().toLowerCase()))

  return (
    <div class="flex flex-col h-full bg-zen-surface">
      <div class="h-10 px-3 border-b border-zen-border flex items-center gap-2">
        <span class="text-sm font-medium">Proxy History</span>
        <input class="flex-1 px-2 py-1 text-xs bg-zen-bg border border-zen-border rounded text-white placeholder-gray-500" placeholder="Filter host, url..." value={filter()} onInput={e => setFilter(e.currentTarget.value)} />
        <span class="text-xs text-gray-500">{events().length}</span>
      </div>
      <div class="flex-1 overflow-y-auto scrollbar-thin">
        <For each={events()}>
          {event => (
            <button class={`w-full text-left px-3 py-2 border-b border-zen-border/50 hover:bg-zen-elevated/50 text-xs ${selectedEventId() === event.id ? 'bg-zen-accent/10' : ''}`} onClick={() => setSelectedEventId(event.id)}>
              <div class="flex items-center gap-2"><span class="text-blue-400">🌐</span><span class="truncate">{event.summary}</span></div>
              <div class="text-gray-500 ml-6">{new Date(event.timestamp).toLocaleTimeString()}</div>
            </button>
          )}
        </For>
      </div>
    </div>
  )
}
