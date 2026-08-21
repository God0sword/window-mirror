import { For } from 'solid-js'
import { timelineEvents } from '../../../stores/appStore'
export function NetworkPanel() {
  const events = () => timelineEvents.filter(e => e.kind === 'network')
  return (
    <div class="flex flex-col h-full bg-zen-bg text-xs">
      <div class="h-8 px-3 border-b border-zen-border flex items-center gap-2 text-gray-400">Waterfall • Headers • Preview • Response • Timing • WS Frames (CDP Network domain)</div>
      <div class="flex-1 overflow-auto">
        <For each={events()}>{e => <div class="px-3 py-1 border-b border-zen-border/50 flex gap-3"><span class="text-blue-400">{e.summary.slice(0,60)}</span><span class="ml-auto text-gray-500">{new Date(e.timestamp).toLocaleTimeString()}</span></div>}</For>
      </div>
    </div>
  )
}
