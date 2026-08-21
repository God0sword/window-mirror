import { Show } from 'solid-js'
import { MonacoEditor } from '../../lib/monaco/MonacoEditor'
import { TabBar } from '../tabs/TabBar'
import { activeFile, appMode } from '../../stores/appStore'

const modeColors: Record<string, string> = {
  zen: 'bg-[#00d4aa]/20 text-[#00d4aa]',
  telemetry: 'bg-blue-500/20 text-blue-400',
  focus: 'bg-purple-500/20 text-purple-400',
  interrogation: 'bg-red-500/20 text-red-400',
}

export function EditorPane() {
  return (
    <div class="flex-1 flex flex-col overflow-hidden bg-zen-bg">
      <TabBar />

      <div class="flex-1 relative overflow-hidden">
        <MonacoEditor />
      </div>

      <div class="h-6 bg-zen-surface border-t border-zen-border flex items-center px-3 gap-4 text-xs text-gray-400">
        <span>{activeFile()?.language || 'Plain Text'}</span>
        <span>
          Ln {activeFile()?.cursorPosition?.line ?? 1}, Col{' '}
          {activeFile()?.cursorPosition?.column ?? 1}
        </span>
        <span>Spaces: {activeFile()?.language === 'python' ? 4 : 2}</span>
        <span>UTF-8</span>
        <Show when={activeFile()?.dirty}>
          <span class="text-yellow-500">● unsaved</span>
        </Show>
        <span class={`ml-auto px-1 rounded ${modeColors[appMode()]}`}>{appMode()}</span>
      </div>
    </div>
  )
}
