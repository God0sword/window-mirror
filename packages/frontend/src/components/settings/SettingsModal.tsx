import { createSignal, createMemo, For, Show } from 'solid-js'
import { settings, updateSettings } from '../../stores/appStore'
import type { Settings } from '../../types'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

type Widget =
  | 'toggle'
  | 'select'
  | 'slider'
  | 'text'
  | 'font-picker'

interface FieldDef {
  path: string
  title: string
  description?: string
  category: string
  widget: Widget
  options?: string[]
  min?: number
  max?: number
}

const FIELDS: FieldDef[] = [
  // General / Appearance
  { path: 'theme', title: 'Theme', description: 'Color theme for the whole app', category: 'appearance', widget: 'select', options: ['dark', 'light', 'system'] },
  { path: 'animations.enabled', title: 'Animations', description: 'Enable UI animations', category: 'appearance', widget: 'toggle' },
  { path: 'animations.speed', title: 'Animation Speed', category: 'appearance', widget: 'select', options: ['none', 'fast', 'normal', 'slow'] },
  { path: 'animations.reducedMotion', title: 'Reduced Motion', description: 'Respect prefers-reduced-motion', category: 'appearance', widget: 'toggle' },
  // Editor
  { path: 'editor.fontSize', title: 'Font Size', category: 'editor', widget: 'slider', min: 8, max: 32 },
  { path: 'editor.fontFamily', title: 'Font Family', category: 'editor', widget: 'font-picker' },
  { path: 'editor.tabSize', title: 'Tab Size', category: 'editor', widget: 'slider', min: 2, max: 8 },
  { path: 'editor.wordWrap', title: 'Word Wrap', category: 'editor', widget: 'toggle' },
  { path: 'editor.minimap', title: 'Minimap', category: 'editor', widget: 'toggle' },
  { path: 'editor.lineNumbers', title: 'Line Numbers', category: 'editor', widget: 'toggle' },
  { path: 'editor.formatOnSave', title: 'Format on Save', category: 'editor', widget: 'toggle' },
  { path: 'editor.autoSave', title: 'Auto Save', category: 'editor', widget: 'toggle' },
  { path: 'editor.lintOnChange', title: 'Lint on Change', category: 'editor', widget: 'toggle' },
  // Proxy
  { path: 'proxy.port', title: 'Proxy Port', category: 'proxy', widget: 'slider', min: 1024, max: 65535 },
  { path: 'proxy.autoStart', title: 'Auto Start Proxy', category: 'proxy', widget: 'toggle' },
  { path: 'proxy.interceptHttps', title: 'Intercept HTTPS', description: 'Requires CA trust — see first-run wizard', category: 'proxy', widget: 'toggle' },
  { path: 'proxy.captureBodies', title: 'Capture Bodies', category: 'proxy', widget: 'toggle' },
  // Sandbox
  { path: 'sandbox.defaultBackend', title: 'Sandbox Backend', category: 'sandbox', widget: 'select', options: ['wasmtime', 'firecracker', 'gvisor', 'native'] },
  { path: 'sandbox.memoryLimitMb', title: 'Memory Limit (MB)', category: 'sandbox', widget: 'slider', min: 16, max: 4096 },
  { path: 'sandbox.timeoutSeconds', title: 'Execution Timeout (s)', category: 'sandbox', widget: 'slider', min: 1, max: 300 },
  { path: 'sandbox.allowNetwork', title: 'Allow Network', category: 'sandbox', widget: 'toggle' },
  { path: 'sandbox.allowFs', title: 'Allow Filesystem', category: 'sandbox', widget: 'toggle' },
  // Security
  { path: 'security.encryptSessions', title: 'Encrypt Sessions', description: 'SQLCipher at rest, Argon2id key', category: 'security', widget: 'toggle' },
  { path: 'security.requireAuth', title: 'Require Auth', category: 'security', widget: 'toggle' },
  { path: 'security.auditLog', title: 'Audit Log', category: 'security', widget: 'toggle' },
]

const STORAGE_KEY = 'wm.settings.v1'

function loadOverrides(): Partial<Settings> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Partial<Settings>) : {}
  } catch {
    return {}
  }
}

export function SettingsModal(props: SettingsModalProps) {
  const [activeCategory, setActiveCategory] = createSignal('appearance')
  const [searchQuery, setSearchQuery] = createSignal('')
  const overrides = loadOverrides()

  const categories = ['appearance', 'editor', 'proxy', 'sandbox', 'security']

  const filteredFields = createMemo(() => {
    const q = searchQuery().toLowerCase().trim()
    return FIELDS.filter((f) => {
      if (q) {
        return (
          f.title.toLowerCase().includes(q) ||
          f.path.toLowerCase().includes(q) ||
          f.category.includes(q)
        )
      }
      return f.category === activeCategory() || activeCategory() === 'all'
    })
  })

  function get(path: string): unknown {
    let v: unknown = { ...overrides, ...settings }
    for (const part of path.split('.')) {
      if (v && typeof v === 'object') v = (v as Record<string, unknown>)[part]
      else return undefined
    }
    return v
  }

  function set(path: string, value: unknown) {
    // Update store (nested paths supported by Solid setStore)
    updateSettings(buildPatch(path, value))
    // Persist overrides locally until the Phase 6 SQLite store lands
    try {
      const next = { ...loadOverrides() } as Record<string, unknown>
      let cursor = next
      const parts = path.split('.')
      for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i]!
        cursor[key] = { ...(cursor[key] as Record<string, unknown> | undefined) }
        cursor = cursor[key] as Record<string, unknown>
      }
      cursor[parts[parts.length - 1]!] = value
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // storage unavailable — in-memory only
    }
  }

  function buildPatch(path: string, value: unknown): Partial<Settings> {
    const out: Record<string, unknown> = {}
    let cursor = out
    const parts = path.split('.')
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i]!
      cursor[key] = {}
      cursor = cursor[key] as Record<string, unknown>
    }
    cursor[parts[parts.length - 1]!] = value
    return out as Partial<Settings>
  }

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in" onClick={() => props.onClose()}>
        <div class="glass-strong w-full max-w-4xl max-h-[90vh] h-[90vh] flex flex-col animate-slide-in" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div class="flex items-center justify-between p-4 border-b border-white/10">
            <h2 class="text-lg font-medium">Settings</h2>
            <div class="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search settings..."
                class="px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-[#00d4aa] w-64"
                value={searchQuery()}
                onInput={(e) => setSearchQuery(e.currentTarget.value)}
              />
              <button class="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5" onClick={() => props.onClose()}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Body */}
          <div class="flex-1 flex overflow-hidden">
            <div class="w-48 border-r border-white/10 flex flex-col">
              <For each={categories}>
                {(cat) => (
                  <button
                    class={`px-3 py-2 text-left text-sm transition-colors ${
                      activeCategory() === cat && !searchQuery()
                        ? 'bg-[#00d4aa]/10 text-[#00d4aa] border-l-2 border-[#00d4aa]'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                    onClick={() => {
                      setActiveCategory(cat)
                      setSearchQuery('')
                    }}
                  >
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </button>
                )}
              </For>
            </div>

            <div class="flex-1 overflow-y-auto p-4">
              <Show when={searchQuery()}>
                <div class="text-sm text-gray-500 mb-4">
                  Found {filteredFields().length} settings for "{searchQuery()}"
                </div>
              </Show>

              <div class="space-y-4">
                <For each={filteredFields()}>
                  {(field) => (
                    <SettingItem field={field} value={get(field.path)} onChange={(v) => set(field.path, v)} />
                  )}
                </For>
              </div>

              <Show when={filteredFields().length === 0}>
                <div class="text-center text-gray-500 py-8">No settings found</div>
              </Show>
            </div>
          </div>

          {/* Footer */}
          <div class="p-4 border-t border-white/10 flex justify-end gap-2">
            <button class="zen-btn" onClick={() => props.onClose()}>
              Close
            </button>
          </div>
        </div>
      </div>
    </Show>
  )
}

function SettingItem(props: { field: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  return (
    <div class="glass p-4 rounded-lg">
      <div class="flex items-start justify-between gap-4 mb-2">
        <div class="flex-1 min-w-0">
          <label class="block text-sm font-medium text-white">{props.field.title}</label>
          {props.field.description && <p class="text-xs text-gray-400 mt-1">{props.field.description}</p>}
        </div>
        <span class="text-xs text-gray-600 whitespace-nowrap font-mono">{props.field.path}</span>
      </div>

      <Switch
        field={props.field}
        value={props.value}
        onChange={props.onChange}
      />
    </div>
  )
}

function Switch(props: { field: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  const f = props.field
  switch (f.widget) {
    case 'toggle':
      return (
        <label class="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            class="w-5 h-5 accent-[#00d4aa] rounded"
            checked={!!props.value}
            onChange={(e) => props.onChange(e.currentTarget.checked)}
          />
          <span class="text-sm text-gray-300">{props.value ? 'Enabled' : 'Disabled'}</span>
        </label>
      )
    case 'select':
      return (
        <select
          class="px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-[#00d4aa]"
          value={String(props.value ?? '')}
          onChange={(e) => props.onChange(e.currentTarget.value)}
        >
          <For each={f.options ?? []}>{(opt) => <option value={opt}>{opt}</option>}</For>
        </select>
      )
    case 'slider':
      return (
        <div class="flex items-center gap-4">
          <input
            type="range"
            class="flex-1 accent-[#00d4aa]"
            min={f.min ?? 0}
            max={f.max ?? 100}
            value={Number(props.value ?? 0)}
            onInput={(e) => props.onChange(Number(e.currentTarget.value))}
          />
          <span class="text-sm text-gray-400 w-14 text-right">{String(props.value)}</span>
        </div>
      )
    case 'font-picker':
      return (
        <select
          class="px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-[#00d4aa]"
          value={String(props.value ?? '')}
          onChange={(e) => props.onChange(e.currentTarget.value)}
        >
          {[
            "'JetBrains Mono', 'Fira Code', monospace",
            '"Fira Code", monospace',
            '"Source Code Pro", monospace',
            'monospace',
            'system-ui, sans-serif',
          ].map((font) => (
            <option value={font}>{font.replace(/"/g, '')}</option>
          ))}
        </select>
      )
    default:
      return (
        <input
          type="text"
          class="px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-[#00d4aa]"
          value={String(props.value ?? '')}
          onBlur={(e) => props.onChange(e.currentTarget.value)}
        />
      )
  }
}
