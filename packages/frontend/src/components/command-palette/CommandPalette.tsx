import { createSignal, createMemo, onCleanup } from 'solid-js'
import { For, Show } from 'solid-js'
import { toggleSidebar, setMode } from '../../stores/appStore'

interface Command {
  id: string
  title: string
  description?: string
  category: string
  shortcut?: string
  action: () => void
  keywords: string[]
}

interface Props {
  isOpen?: boolean
  onClose?: () => void
}

export function CommandPalette(props: Props = {}) {
  const [internalOpen, setInternalOpen] = createSignal(false)
  const isOpen = () => props.isOpen ?? internalOpen()
  const [query, setQuery] = createSignal('')
  const [selectedIndex, setSelectedIndex] = createSignal(0)

  const builtinCommands: Command[] = [
    { id: 'file.new', title: 'New File', description: 'Create a new file', category: 'File', shortcut: 'Ctrl+N', action: () => {}, keywords: ['new', 'file', 'create'] },
    { id: 'file.open', title: 'Open File', description: 'Open an existing file', category: 'File', shortcut: 'Ctrl+O', action: () => {}, keywords: ['open', 'file'] },
    { id: 'file.save', title: 'Save', description: 'Save current file', category: 'File', shortcut: 'Ctrl+S', action: () => {}, keywords: ['save', 'file'] },
    { id: 'file.save-all', title: 'Save All', description: 'Save all open files', category: 'File', shortcut: 'Ctrl+Shift+S', action: () => {}, keywords: ['save', 'all'] },
    { id: 'edit.find', title: 'Find', description: 'Find in current file', category: 'Edit', shortcut: 'Ctrl+F', action: () => {}, keywords: ['find', 'search'] },
    { id: 'edit.replace', title: 'Replace', description: 'Replace in current file', category: 'Edit', shortcut: 'Ctrl+H', action: () => {}, keywords: ['replace'] },
    { id: 'view.toggle-sidebar', title: 'Toggle Sidebar', description: 'Show/hide sidebar', category: 'View', shortcut: 'Ctrl+B', action: toggleSidebar, keywords: ['sidebar', 'toggle'] },
    { id: 'view.zen', title: 'Zen Mode', description: 'Enter zen mode', category: 'View', shortcut: 'Ctrl+\\', action: () => setMode('zen'), keywords: ['zen', 'mode'] },
    { id: 'view.telemetry', title: 'Telemetry Mode', description: 'Enter telemetry mode', category: 'View', action: () => setMode('telemetry'), keywords: ['telemetry', 'mode'] },
    { id: 'view.focus', title: 'Focus Mode', description: 'Enter focus mode', category: 'View', action: () => setMode('focus'), keywords: ['focus', 'mode'] },
    { id: 'view.interrogation', title: 'Interrogation Mode', description: 'Enter interrogation mode', category: 'View', action: () => setMode('interrogation'), keywords: ['interrogation', 'mode'] },
    { id: 'devtools.open', title: 'Open DevTools', description: 'Open developer tools', category: 'DevTools', shortcut: 'F12', action: () => {}, keywords: ['devtools', 'debug'] },
    { id: 'proxy.start', title: 'Start Proxy', description: 'Start MITM proxy', category: 'Proxy', shortcut: 'Ctrl+Alt+P', action: () => {}, keywords: ['proxy', 'start', 'mitm'] },
    { id: 'proxy.stop', title: 'Stop Proxy', description: 'Stop MITM proxy', category: 'Proxy', shortcut: 'Ctrl+Shift+X', action: () => {}, keywords: ['proxy', 'stop'] },
    { id: 'proxy.launch-chromium', title: 'Launch Chromium', description: 'Launch Chromium with proxy', category: 'Proxy', action: () => {}, keywords: ['chromium', 'launch', 'browser'] },
    { id: 'sast.scan', title: 'Scan Project', description: 'Run SAST scan on project', category: 'Security', action: () => {}, keywords: ['scan', 'sast', 'security'] },
    { id: 'wasm.run', title: 'Run WASM', description: 'Run WASM module in sandbox', category: 'Sandbox', action: () => {}, keywords: ['wasm', 'sandbox', 'run'] },
    { id: 'workspace.new', title: 'New Workspace', description: 'Create new workspace', category: 'Workspace', action: () => {}, keywords: ['workspace', 'new'] },
    { id: 'settings.open', title: 'Open Settings', description: 'Open settings', category: 'General', shortcut: 'Ctrl+,', action: () => {}, keywords: ['settings', 'preferences'] },
    { id: 'help.shortcuts', title: 'Keyboard Shortcuts', description: 'Show all keyboard shortcuts', category: 'Help', shortcut: 'Ctrl+K', action: () => {}, keywords: ['shortcuts', 'keys', 'help'] },
  ]

  const filteredCommands = createMemo(() => {
    const q = query().toLowerCase().trim()
    if (!q) return builtinCommands
    return builtinCommands.filter(
      (cmd) =>
        cmd.title.toLowerCase().includes(q) ||
        cmd.description?.toLowerCase().includes(q) ||
        cmd.category.toLowerCase().includes(q) ||
        cmd.shortcut?.toLowerCase().includes(q) ||
        cmd.keywords.some((k) => k.toLowerCase().includes(q))
    )
  })

  const selectedCommand = createMemo(() => filteredCommands()[selectedIndex()])

  function open() {
    setInternalOpen(true)
    setQuery('')
    setSelectedIndex(0)
  }

  function close() {
    if (props.onClose && props.isOpen !== undefined) {
      props.onClose()
    } else {
      setInternalOpen(false)
    }
    setQuery('')
  }

  function executeSelected() {
    const cmd = selectedCommand()
    if (cmd) {
      cmd.action()
      close()
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || (e.shiftKey && e.key === 'P'))) {
      e.preventDefault()
      open()
      return
    }
    if (!isOpen()) return
    switch (e.key) {
      case 'Escape':
        close()
        break
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, filteredCommands().length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        executeSelected()
        break
    }
  }

  document.addEventListener('keydown', handleKeyDown)
  onCleanup(() => document.removeEventListener('keydown', handleKeyDown))

  return (
    <Show when={isOpen()}>
      <div class="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50 animate-fade-in" onClick={close}>
        <div class="glass-strong w-full max-w-2xl animate-slide-in" onClick={(e) => e.stopPropagation()}>
          {/* Input */}
          <div class="p-4 border-b border-white/10">
            <div class="flex items-center gap-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-gray-400">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                class="flex-1 bg-transparent border-none text-white text-lg focus:outline-none placeholder-gray-500"
                placeholder="Type a command..."
                value={query()}
                onInput={(e) => {
                  setQuery(e.currentTarget.value)
                  setSelectedIndex(0)
                }}
                autocomplete="off"
                spellcheck={false}
              />
              <kbd class="px-2 py-1 text-xs bg-black/40 border border-white/10 rounded text-gray-400">Ctrl+K</kbd>
            </div>
          </div>

          {/* Results */}
          <div class="max-h-96 overflow-y-auto">
            <Show
              when={filteredCommands().length > 0}
              fallback={
                <Show when={query()}>
                  <div class="p-8 text-center text-gray-500">No commands found for "{query()}"</div>
                </Show>
              }
            >
              <For each={filteredCommands()}>
                {(cmd, index) => (
                  <button
                    class={`w-full px-4 py-3 text-left transition-colors ${
                      index() === selectedIndex()
                        ? 'bg-[#00d4aa]/10 text-[#00d4aa]'
                        : 'hover:bg-white/5'
                    }`}
                    onClick={() => {
                      setSelectedIndex(index())
                      executeSelected()
                    }}
                    onMouseEnter={() => setSelectedIndex(index())}
                  >
                    <div class="flex items-center justify-between gap-3">
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                          <span class="font-medium truncate">{cmd.title}</span>
                          {cmd.description && (
                            <span class="text-xs text-gray-400 truncate">{cmd.description}</span>
                          )}
                        </div>
                        <div class="flex items-center gap-1 text-xs text-gray-500">
                          <span class="px-1.5 py-0.5 bg-black/30 rounded">{cmd.category}</span>
                        </div>
                      </div>
                      {cmd.shortcut && (
                        <kbd class="px-2 py-0.5 text-xs bg-black/30 border border-white/10 rounded text-gray-400 font-mono">
                          {cmd.shortcut}
                        </kbd>
                      )}
                    </div>
                  </button>
                )}
              </For>
            </Show>
          </div>

          {/* Footer */}
          <div class="p-3 border-t border-white/10 flex items-center justify-between text-xs text-gray-500">
            <span>{filteredCommands().length} commands</span>
            <span>↑↓ Navigate • Enter Execute • Esc Close</span>
          </div>
        </div>
      </div>
    </Show>
  )
}
