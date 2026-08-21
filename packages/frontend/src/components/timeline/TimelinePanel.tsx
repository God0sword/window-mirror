import { For } from 'solid-js'
import type { MirrorEventSummary } from '../../types'
import { recentEvents, setSelectedEventId, selectedEventId, clearTimeline } from '../../stores/appStore'

const kindColors: Record<string, string> = {
  network: 'text-blue-400',
  dom: 'text-green-400',
  storage: 'text-yellow-400',
  console: 'text-purple-400',
  error: 'text-red-400',
  custom: 'text-gray-400',
}

const kindIcons: Record<string, string> = {
  network: '🌐',
  dom: '🌳',
  storage: '💾',
  console: '📋',
  error: '⚠️',
  custom: '⚡',
}

export function TimelinePanel() {
  return (
    <div class="flex-1 flex flex-col bg-zen-surface border-r border-white/10 overflow-hidden">
      {/* Header */}
      <div class="h-10 px-3 border-b border-white/10 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-lg">📊</span>
          <span class="font-medium">Timeline</span>
          <span class="px-2 py-0.5 rounded text-xs bg-black/30 text-gray-400">{recentEvents().length}</span>
        </div>
        <div class="flex items-center gap-1">
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
          <button class="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/5" title="Filter">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
          </button>
        </div>
      </div>

      {/* Event List */}
      <div class="flex-1 overflow-y-auto scrollbar-thin">
        {recentEvents().length === 0 ? (
          <div class="h-full flex flex-col items-center justify-center text-gray-500 p-4">
            <div class="text-4xl mb-2">📊</div>
            <p class="text-sm">No events captured</p>
            <p class="text-xs text-gray-500 mt-1">Start proxy to capture events</p>
          </div>
        ) : (
          <For each={recentEvents()}>
            {(event: MirrorEventSummary) => (
              <div
                class={`
                  px-3 py-2 border-b border-white/5 transition-colors cursor-pointer
                  ${selectedEventId() === event.id ? 'bg-[#00d4aa]/10' : 'hover:bg-white/5'}
                `}
                onClick={() => setSelectedEventId(event.id)}
              >
                <div class="flex items-center gap-2 mb-1">
                  <span class={kindColors[event.kind]}>{kindIcons[event.kind]}</span>
                  <span class="text-xs font-mono text-gray-400">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                  <span class="text-xs px-1.5 py-0.5 rounded bg-black/30 text-gray-400 capitalize">
                    {event.kind}
                  </span>
                </div>
                <div class="text-sm text-white truncate ml-6">{event.summary}</div>
                {event.sourceLocation && (
                  <div class="text-xs text-gray-500 ml-6 font-mono mt-1">
                    {event.sourceLocation.file}:{event.sourceLocation.line}
                  </div>
                )}
              </div>
            )}
          </For>
        )}
      </div>
    </div>
  )
}
