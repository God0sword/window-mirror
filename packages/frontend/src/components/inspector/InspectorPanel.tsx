import { createMemo } from 'solid-js'
import { Show } from 'solid-js'
import type { MirrorEventDetail, MirrorEventSummary } from '../../types'
import { timelineEvents, selectedEventId } from '../../stores/appStore'

export function InspectorPanel() {
  const event = createMemo<MirrorEventDetail | MirrorEventSummary | null>(
    () => timelineEvents.find((e) => e.id === selectedEventId()) ?? null
  )

  return (
    <Show
      when={event()}
      fallback={
        <div class="flex-1 flex items-center justify-center text-gray-500 p-4 bg-zen-surface border-l border-white/10">
          <div class="text-center">
            <div class="text-4xl mb-2">🔍</div>
            <p>Select an event to inspect</p>
          </div>
        </div>
      }
    >
      {(e) => (
        <div class="flex-1 flex flex-col bg-zen-surface border-l border-white/10 overflow-hidden">
          <div class="h-10 px-3 border-b border-white/10 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-lg">🔍</span>
              <span class="font-medium">Inspector</span>
            </div>
          </div>
          <div class="flex-1 overflow-y-auto p-3">
            <div class="space-y-4">
              <div class="glass p-4 rounded-lg">
                <h4 class="font-medium text-gray-400 mb-2">Summary</h4>
                <div class="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span class="text-gray-500">ID:</span>{' '}
                    <span class="font-mono text-xs ml-2">{e().id.slice(0, 16)}...</span>
                  </div>
                  <div>
                    <span class="text-gray-500">Time:</span>{' '}
                    <span class="font-mono text-xs ml-2">{new Date(e().timestamp).toLocaleString()}</span>
                  </div>
                  <div>
                    <span class="text-gray-500">Kind:</span> <span class="capitalize ml-2">{e().kind}</span>
                  </div>
                  <Show when={e().sourceLocation}>
                    {(loc) => (
                      <div class="col-span-2">
                        <span class="text-gray-500">Source:</span>{' '}
                        <span class="font-mono text-xs ml-2">
                          {loc().file}:{loc().line}
                        </span>
                      </div>
                    )}
                  </Show>
                </div>
              </div>

              <Section title="Request" data={(e() as MirrorEventDetail).request} />
              <Section title="Response" data={(e() as MirrorEventDetail).response} />
              <Section title="DOM Mutation" data={(e() as MirrorEventDetail).domMutation} />
              <Section title="Console" data={(e() as MirrorEventDetail).consoleMessage} />
            </div>
          </div>
        </div>
      )}
    </Show>
  )
}

function Section(props: { title: string; data: unknown }) {
  return (
    <Show when={!!props.data}>
      <div class="glass p-4 rounded-lg">
        <h4 class="font-medium text-gray-400 mb-2">{props.title}</h4>
        <pre class="text-xs text-gray-300 overflow-x-auto font-mono bg-black/30 p-2 rounded">
          {JSON.stringify(props.data, null, 2)}
        </pre>
      </div>
    </Show>
  )
}
