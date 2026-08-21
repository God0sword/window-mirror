import { createMemo, createSignal, onCleanup } from 'solid-js'
import { For, Show } from 'solid-js'
import type { SidebarPanel, FileTab, WorkspaceInfo } from '../../types'
import {
  sidebar,
  setSidebar,
  setSidebarPanel,
  toggleSidebar,
  openFiles,
  openFilesList,
  activeFileId,
  setActiveFileId,
  removeFile,
  workspaces,
  currentWorkspaceId,
  setCurrentWorkspaceId,
  addWorkspace,
} from '../../stores/appStore'

const panelIcons: Record<SidebarPanel, string> = {
  files: '📁',
  workspaces: '🗂️',
  timeline: '📊',
  extensions: '🧩',
  settings: '⚙️',
}

const panelLabels: Record<SidebarPanel, string> = {
  files: 'Files',
  workspaces: 'Workspaces',
  timeline: 'Timeline',
  extensions: 'Extensions',
  settings: 'Settings',
}

export function Sidebar() {
  const [collapsed, setCollapsed] = createSignal(false)

  const width = createMemo(() => (collapsed() ? 56 : sidebar.width))

  // Resize-drag on the right edge; listeners live for the component lifetime
  // and are always cleaned up.
  onCleanup(() => {
    window.removeEventListener('mousemove', handleResize)
    window.removeEventListener('mouseup', stopResize)
    window.removeEventListener('mousedown', handleMouseDown)
  })

  function handleResize(e: MouseEvent) {
    if (!collapsed()) {
      const newWidth = Math.max(200, Math.min(500, e.clientX))
      setSidebar('width', newWidth)
    }
  }

  function stopResize() {
    window.removeEventListener('mousemove', handleResize)
    window.removeEventListener('mouseup', stopResize)
  }

  function handleMouseDown(e: MouseEvent) {
    if (
      !collapsed() &&
      e.clientX >= sidebar.width - 4 &&
      e.clientX <= sidebar.width + 4
    ) {
      e.preventDefault()
      window.addEventListener('mousemove', handleResize)
      window.addEventListener('mouseup', stopResize)
    }
  }

  window.addEventListener('mousedown', handleMouseDown)

  const panels: SidebarPanel[] = ['files', 'workspaces', 'timeline', 'extensions', 'settings']

  return (
    <div
      class="flex flex-col bg-zen-surface border-r border-zen-border transition-all duration-200 overflow-hidden"
      style={{
        width: `${width()}px`,
        'min-width': `${width()}px`,
        'max-width': `${width()}px`,
      }}
    >
      <div class="flex flex-col h-full">
        <div class="flex flex-col gap-1 p-2 border-b border-zen-border">
          <For each={panels}>
            {(panel) => (
              <button
                class={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200
                  ${
                    sidebar.activePanel === panel
                      ? 'bg-[#00d4aa]/10 text-[#00d4aa] border-l-2 border-[#00d4aa]'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }
                  ${collapsed() ? 'justify-center' : ''}
                `}
                onClick={() => {
                  if (collapsed()) {
                    setCollapsed(false)
                    setSidebarPanel(panel)
                  } else if (sidebar.activePanel === panel) {
                    toggleSidebar()
                  } else {
                    setSidebarPanel(panel)
                  }
                }}
                title={collapsed() ? panelLabels[panel] : ''}
              >
                <span class="text-lg">{panelIcons[panel]}</span>
                {!collapsed() && <span class="font-medium">{panelLabels[panel]}</span>}
              </button>
            )}
          </For>
        </div>

        <Show when={!collapsed()}>
          <div class="flex-1 overflow-hidden">
            <Show when={sidebar.activePanel === 'files'}>
              <FilesPanel />
            </Show>
            <Show when={sidebar.activePanel === 'workspaces'}>
              <WorkspacesPanel />
            </Show>
            <Show when={sidebar.activePanel === 'timeline'}>
              <TimelineSidebar />
            </Show>
            <Show when={sidebar.activePanel === 'extensions'}>
              <ExtensionsPanel />
            </Show>
            <Show when={sidebar.activePanel === 'settings'}>
              <SettingsPanel />
            </Show>
          </div>

          <div class="p-2 border-t border-zen-border flex gap-1">
            <button
              class="w-full flex items-center justify-center px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              onClick={() => setCollapsed(true)}
              title="Collapse to icon strip"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          </div>
        </Show>

        <Show when={collapsed()}>
          <div class="mt-auto p-2 border-t border-zen-border">
            <button
              class="w-full flex items-center justify-center px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              onClick={() => setCollapsed(false)}
              title="Expand sidebar"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        </Show>
      </div>
    </div>
  )
}

function FilesPanel() {
  return (
    <Show
      when={openFilesList().length > 0}
      fallback={
        <div class="h-full flex flex-col items-center justify-center text-gray-500 p-4">
          <div class="text-4xl mb-2">📄</div>
          <p class="text-sm text-center">No files open</p>
          <p class="text-xs text-gray-500 mt-1">Ctrl+O to open</p>
        </div>
      }
    >
      <div class="h-full overflow-y-auto p-2">
        <For each={openFilesList()}>
          {(file: FileTab) => (
            <div
              class={`
                flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer
                ${
                  activeFileId() === file.id
                    ? 'bg-[#00d4aa]/10 text-[#00d4aa]'
                    : 'hover:bg-white/5'
                }
              `}
              onClick={() => setActiveFileId(file.id)}
              title={file.path}
            >
              <span class="text-sm">{getFileIcon(file.language)}</span>
              <span class="flex-1 truncate text-sm font-medium">{file.name}</span>
              {file.dirty && <span class="text-[#00d4aa] text-xs">●</span>}
              <button
                class="opacity-0 hover:opacity-100 focus:opacity-100 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-red-400"
                onClick={(e) => {
                  e.stopPropagation()
                  removeFile(file.id)
                }}
              >
                ×
              </button>
            </div>
          )}
        </For>
      </div>
    </Show>
  )
}

function WorkspacesPanel() {
  const wsList = () => Object.values(workspaces) as WorkspaceInfo[]

  return (
    <div class="h-full overflow-y-auto p-2">
      <For each={wsList()}>
        {(ws) => (
          <div
            class={`
              flex items-center gap-2 px-2 py-2 rounded-lg transition-colors cursor-pointer
              ${
                currentWorkspaceId() === ws.id
                  ? 'bg-[#00d4aa]/10 text-[#00d4aa]'
                  : 'hover:bg-white/5'
              }
            `}
            onClick={() => setCurrentWorkspaceId(ws.id)}
            title={ws.path}
          >
            <span class="text-lg">🗂️</span>
            <div class="flex-1 min-w-0">
              <span class="text-sm font-medium truncate block">{ws.name}</span>
              <span class="text-xs text-gray-500 truncate block">{ws.path}</span>
            </div>
          </div>
        )}
      </For>
      <button
        class="w-full mt-2 p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors text-sm"
        onClick={() => {
          const n = Object.keys(workspaces).length + 1
          addWorkspace({
            id: `ws-${Date.now()}`,
            name: `Workspace ${n}`,
            path: '~/.window-mirror',
            active: false,
            mode: 'zen',
            sidebar: { visible: true, width: 280, collapsed: false, activePanel: 'files' },
            openFiles: [],
          })
        }}
      >
        + New Workspace
      </button>
    </div>
  )
}

function TimelineSidebar() {
  return (
    <div class="h-full flex flex-col p-2">
      <div class="flex items-center gap-2">
        <span class="text-lg">📊</span>
        <span class="font-medium">Timeline</span>
      </div>
      <div class="flex-1 text-gray-500 text-sm text-center py-8">
        Use the Timeline panel at bottom for the full event stream
      </div>
    </div>
  )
}

function ExtensionsPanel() {
  return (
    <div class="h-full flex flex-col p-2">
      <div class="flex items-center gap-2">
        <span class="text-lg">🧩</span>
        <span class="font-medium">Extensions</span>
      </div>
      <div class="flex-1 text-gray-500 text-sm text-center py-8">
        Custom WASM extensions will appear here
      </div>
    </div>
  )
}

function SettingsPanel() {
  return (
    <div class="h-full overflow-y-auto p-2">
      <div class="flex items-center gap-2">
        <span class="text-lg">⚙️</span>
        <span class="font-medium">Settings</span>
      </div>
      <div class="mt-4 space-y-3 text-sm">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" class="accent-[#00d4aa]" /> Auto-save
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" class="accent-[#00d4aa]" /> Format on save
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" class="accent-[#00d4aa]" /> Lint on change
        </label>
      </div>
    </div>
  )
}

function getFileIcon(lang: string): string {
  const icons: Record<string, string> = {
    typescript: '📘',
    javascript: '📜',
    rust: '🦀',
    python: '🐍',
    go: '🐹',
    c: '📄',
    cpp: '📄',
    html: '🌐',
    css: '🎨',
    json: '📋',
    markdown: '📝',
    toml: '⚙️',
    yaml: '⚙️',
  }
  return icons[lang] || '📄'
}
