import { createSignal, For } from 'solid-js'

interface Rule { id: string; name: string; pattern: string; action: string; enabled: boolean; priority: number }
export function ProxyRulesPanel() {
  const [rules, setRules] = createSignal<Rule[]>([
    { id: '1', name: 'Block ads', pattern: '*doubleclick.net*', action: 'block', enabled: true, priority: 100 },
    { id: '2', name: 'Mock API', pattern: '*/api/user*', action: 'mock', enabled: false, priority: 90 },
  ])
  return (
    <div class="flex flex-col h-full bg-zen-surface p-3 gap-3">
      <div class="flex items-center justify-between"><span class="text-sm font-medium">Interception Rules</span><button class="zen-btn-primary text-xs">+ Add Rule</button></div>
      <For each={rules()}>
        {rule => (
          <div class="glass p-3 rounded-lg flex items-center gap-3">
            <input type="checkbox" checked={rule.enabled} onChange={e => setRules(r => r.map(x => x.id===rule.id?{...x, enabled: e.currentTarget.checked}:x))} class="accent-zen-accent" />
            <div class="flex-1"><div class="text-sm font-medium">{rule.name}</div><div class="text-xs text-gray-500">{rule.pattern} → {rule.action}</div></div>
            <span class="text-xs text-gray-400">P{rule.priority}</span>
          </div>
        )}
      </For>
    </div>
  )
}
