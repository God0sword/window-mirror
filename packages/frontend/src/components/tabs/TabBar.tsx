import { createSignal, For, Show } from 'solid-js'
import type { AppMode, FileTab } from '../../types'
import {
  openFilesList,
  activeFileId,
  activeFile,
  setActiveFileId,
  removeFile,
  reorderFiles,
  addFile,
} from '../../stores/appStore'

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

const modeColors: Record<AppMode, string> = {
  zen: 'bg-[#00d4aa]/20 text-[#00d4aa]',
  telemetry: 'bg-blue-500/20 text-blue-400',
  focus: 'bg-purple-500/20 text-purple-400',
  interrogation: 'bg-red-500/20 text-red-400',
}

let untitledCounter = 0

export function TabBar() {
  const [dragId, setDragId] = createSignal<string | null>(null)
  const [overId, setOverId] = createSignal<string | null>(null)

  function handleDrop(e: DragEvent, targetId: string) {
    e.preventDefault()
    const dragged = dragId() ?? e.dataTransfer?.getData('text/plain') ?? null
    if (dragged) reorderFiles(dragged, targetId)
    setDragId(null)
    setOverId(null)
  }

  return (
    <div class="flex items-center h-8 bg-zen-surface border-b border-white/10 px-2 gap-1 overflow-x-auto scrollbar-thin">
      <For each={openFilesList()}>
        {(file) => {
          const isDragging = () => dragId() === file.id
          const isOver = () => overId() === file.id && dragId() !== file.id
          return (
            <div
              class={`
                flex items-center gap-1.5 px-3 py-1 rounded-t-lg text-sm font-medium transition-all duration-150 cursor-pointer select-none
                ${
                  activeFileId() === file.id
                    ? 'bg-black/40 text-white border-b-2 border-[#00d4aa]'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }
                ${isDragging() ? 'opacity-50' : ''}
                ${isOver() ? 'bg-[#00d4aa]/5 ring-1 ring-[#00d4aa]/40' : ''}
              `}
              draggable
              onDragStart={(e) => {
                e.dataTransfer?.setData('text/plain', file.id)
                if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
                setDragId(file.id)
              }}
              onDragOver={(e) => {
                e.preventDefault()
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
                setOverId(file.id)
              }}
              onDragLeave={() => setOverId((cur) => (cur === file.id ? null : cur))}
              onDrop={(e) => handleDrop(e, file.id)}
              onDragEnd={() => {
                setDragId(null)
                setOverId(null)
              }}
              onClick={() => setActiveFileId(file.id)}
              title={file.path}
            >
              <span class="text-sm">{getFileIcon(file.language)}</span>
              <span class="truncate max-w-[150px]">{file.name}</span>
              {file.dirty && <span class="text-[#00d4aa] text-xs">●</span>}
              <button
                class="ml-1 opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity text-gray-500 hover:text-red-400 text-xs leading-none"
                onClick={(e) => {
                  e.stopPropagation()
                  removeFile(file.id)
                }}
              >
                ×
              </button>
            </div>
          )
        }}
      </For>

      {/* New Tab Button */}
      <button
        class="ml-2 p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
        onClick={() => {
          untitledCounter += 1
          addFile({
            id: `untitled-${untitledCounter}-${Date.now()}`,
            path: `~/untitled-${untitledCounter}.ts`,
            name: `untitled-${untitledCounter}.ts`,
            language: 'typescript',
            dirty: false,
            mode: 'zen',
          })
        }}
        title="New File (Ctrl+N)"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
      </button>

      {/* Mode Indicator */}
      <div class="ml-auto flex items-center gap-2 pr-2">
        <Show when={activeFile()}>
          {(file) => (
            <span class={`px-2 py-1 rounded text-xs font-medium ${modeColors[file().mode]}`}>
              {file().mode.toUpperCase()}
            </span>
          )}
        </Show>
      </div>
    </div>
  )
}
