import { createMemo, createSignal } from 'solid-js'
import { For } from 'solid-js'
import { timelineEvents, clearTimeline } from '../../stores/appStore'

const levelColors: Record<string, string> = {
  log: 'text-gray-300',
  console: 'text-gray-300',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  info: 'text-blue-400',
  debug: 'text-purple-400',
}

export function ConsolePanel() {
  const [filter, setFilter] = createSignal('all')
  const [input, setInput] = createSignal('')

  const consoleEvents = createMemo(() =>
    timelineEvents
      .filter((e) => e.kind === 'console' || e.kind === 'error')
      .filter((e) => filter() === 'all' || e.kind === filter())
      .slice(-500)
  )

  const handleSubmit = (e: Event) => {
    e.preventDefault()
    if (input().trim()) {
      // REPL wiring lands with the CDP Runtime bridge (Phase 3)
      console.log('REPL:', input())
      setInput('')
    }
  }

  return (
    <div class="flex-1 flex flex-col bg-zen-surface border-l border-white/10 overflow-hidden">
      <div class="h-10 px-3 border-b border-white/10 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-lg">📋</span>
          <span class="font-medium">Console</span>
        </div>
        <div class="flex items-center gap-1">
          <select
            class="px-2 py-1 text-xs bg-black/30 border border-white/10 rounded text-white focus:outline-none focus:ring-1 focus:ring-[#00d4aa]"
            value={filter()}
            onChange={(e) => setFilter(e.currentTarget.value)}
          >
            <option value="all">All</option>
            <option value="console">Logs</option>
            <option value="error">Errors</option>
          </select>
          <button
            class="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/5"
            title="Clear"
            onClick={clearTimeline}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-3 space-y-1 font-mono text-xs">
        <For each={consoleEvents()}>
          {(event) => (
            <div
              class={`
                px-2 py-1 rounded bg-black/20 border border-white/5
                ${levelColors[event.kind] || 'text-gray-300'}
              `}
            >
              <span class="text-gray-500 mr-2">
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
              <span class="text-gray-400 mr-2 capitalize">[{event.kind}]</span>
              <span>{event.summary}</span>
            </div>
          )}
        </For>
      </div>

      {/* REPL Input */}
      <form onSubmit={handleSubmit} class="p-3 border-t border-white/10">
        <div class="flex items-center gap-2">
          <span class="text-[#00d4aa] font-mono text-sm">&gt;</span>
          <input
            type="text"
            class="flex-1 bg-black/30 border border-white/10 rounded px-2 py-1 text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[#00d4aa]"
            value={input()}
            onInput={(e) => setInput(e.currentTarget.value)}
            placeholder="Enter expression..."
            spellcheck={false}
          />
        </div>
      </form>
    </div>
  )
}
