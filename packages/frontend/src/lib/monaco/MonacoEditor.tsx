import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js'
import * as monaco from 'monaco-editor'
import { configureMonacoWorkers } from './MonacoLoader'
import { activeFile, appMode, updateFile } from '../../stores/appStore'
import type { FileTab } from '../../types'

export interface MonacoEditorProps {
  onReady?: (editor: monaco.editor.IStandaloneCodeEditor) => void
  onContentChange?: (value: string) => void
}

const THEME_NAME = 'window-mirror'

function defineTheme(): void {
  monaco.editor.defineTheme(THEME_NAME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6A9955' },
      { token: 'keyword', foreground: 'C586C0' },
      { token: 'string', foreground: 'CE9178' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'regexp', foreground: 'D16969' },
      { token: 'operator', foreground: 'D4D4D4' },
      { token: 'namespace', foreground: '4EC9B0' },
      { token: 'type', foreground: '4EC9B0' },
      { token: 'class', foreground: '4EC9B0' },
      { token: 'interface', foreground: '4EC9B0' },
      { token: 'enum', foreground: '4EC9B0' },
      { token: 'function', foreground: 'DCDCAA' },
      { token: 'parameter', foreground: '9CDCFE' },
      { token: 'variable', foreground: '9CDCFE' },
      { token: 'property', foreground: '9CDCFE' },
    ],
    colors: {
      'editor.background': '#0d0d0d',
      'editor.foreground': '#e0e0e0',
      'editor.lineHighlightBackground': '#1a1a1a',
      'editor.selectionBackground': '#00d4aa33',
      'editor.inactiveSelectionBackground': '#00d4aa15',
      'editorCursor.foreground': '#00d4aa',
      'editorWhitespace.foreground': '#333333',
      'editorIndentGuide.background': '#2a2a2a',
      'editorIndentGuide.activeBackground': '#00d4aa44',
      'editorLineNumber.foreground': '#858585',
      'editorLineNumber.activeForeground': '#ffffff',
      'editorGutter.background': '#0d0d0d',
      'editorGutter.modifiedBackground': '#00d4aa33',
      'editorGutter.addedBackground': '#00d4aa33',
      'editorGutter.deletedBackground': '#ff444433',
      'editorOverviewRuler.border': '#0d0d0d',
      'scrollbar.shadow': '#000000',
      'scrollbarSlider.background': '#444444',
      'scrollbarSlider.hoverBackground': '#555555',
      'scrollbarSlider.activeBackground': '#666666',
    },
  })
}

const languageByExtension: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  md: 'markdown',
  rs: 'rust',
  py: 'python',
  go: 'go',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  sh: 'shell',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'ini',
}

export function languageForFile(file: FileTab): string {
  if (file.language && file.language !== 'plaintext') return file.language
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return languageByExtension[ext] ?? 'plaintext'
}

export function MonacoEditor(props: MonacoEditorProps = {}) {
  configureMonacoWorkers()
  defineTheme()

  let containerRef!: HTMLDivElement
  const [editorInstance, setEditorInstance] =
    createSignal<monaco.editor.IStandaloneCodeEditor | null>(null)
  const [mounted, setMounted] = createSignal(false)

  const modeColors: Record<string, string> = {
    zen: 'bg-[#00d4aa]/20 text-[#00d4aa]',
    telemetry: 'bg-blue-500/20 text-blue-400',
    focus: 'bg-purple-500/20 text-purple-400',
    interrogation: 'bg-red-500/20 text-red-400',
  }

  onMount(() => {
    const editor = monaco.editor.create(containerRef, {
      value: '',
      language: 'plaintext',
      theme: THEME_NAME,
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      tabSize: 2,
      wordWrap: 'on',
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      renderLineHighlight: 'all',
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true },
      folding: true,
      foldingStrategy: 'indentation',
      showFoldingControls: 'always',
      renderControlCharacters: true,
      renderWhitespace: 'selection',
      glyphMargin: true,
      lineDecorationsWidth: 10,
      lineNumbersMinChars: 3,
      renderValidationDecorations: 'editable',
      scrollbar: {
        vertical: 'auto',
        horizontal: 'auto',
        useShadows: false,
        verticalHasArrows: false,
        horizontalHasArrows: false,
      },
      overviewRulerLanes: 3,
      overviewRulerBorder: false,
    })

    setEditorInstance(editor)
    setMounted(true)
    props.onReady?.(editor)

    const contentListener = editor.onDidChangeModelContent(() => {
      const file = activeFile()
      if (file) {
        updateFile(file.id, { dirty: true })
        props.onContentChange?.(editor.getValue())
      }
    })

    const cursorListener = editor.onDidChangeCursorPosition((e) => {
      const file = activeFile()
      if (file) {
        updateFile(file.id, {
          cursorPosition: { line: e.position.lineNumber, column: e.position.column },
        })
      }
    })

    let scrollTimer: ReturnType<typeof setTimeout> | undefined
    const scrollListener = editor.onDidScrollChange((e) => {
      const file = activeFile()
      if (!file) return
      clearTimeout(scrollTimer)
      scrollTimer = setTimeout(() => {
        updateFile(file.id, { scrollPosition: { x: e.scrollLeft, y: e.scrollTop } })
      }, 150)
    })

    onCleanup(() => {
      contentListener.dispose()
      cursorListener.dispose()
      scrollListener.dispose()
      clearTimeout(scrollTimer)
      editor.getModel()?.dispose()
      editor.dispose()
    })
  })

  // Swap models when the active file changes; keep one model per open file.
  createEffect<monaco.editor.IStandaloneCodeEditor | null>((prevEditor) => {
    const editor = editorInstance()
    const file = activeFile()
    if (!editor) return prevEditor

    if (!file) {
      editor.setModel(null)
      return prevEditor
    }

    const modelKey = `file:${file.id}`
    const existing = monaco.editor.getModels().find((m) => m.id.includes(modelKey))

    if (existing) {
      editor.setModel(existing)
    } else {
      const model = monaco.editor.createModel(
        '',
        languageForFile(file),
        monaco.Uri.parse(`inmemory://${modelKey}`)
      )
      editor.setModel(model)
    }

    const pos = file.cursorPosition
    if (pos) editor.setPosition({ lineNumber: pos.line, column: pos.column })
    const scroll = file.scrollPosition
    if (scroll) editor.setScrollTop(scroll.y)

    return editor
  }, null)

  return (
    <div class="flex-1 relative overflow-hidden">
      <div ref={containerRef} class="monaco-container h-full w-full" />

      <Show when={appMode() === 'zen' && mounted()}>
        <div class="fixed bottom-4 right-4 z-10 animate-fade-in">
          <div class="glass px-4 py-2 rounded-lg text-xs text-gray-400">
            ZEN MODE · Ctrl+B for sidebar · Ctrl+\ for mode
          </div>
        </div>
      </Show>

      <Show when={mounted()}>
        <div class="absolute top-2 right-2 z-10">
          <span class={`px-2 py-1 rounded text-xs font-medium ${modeColors[appMode()]}`}>
            {appMode().toUpperCase()}
          </span>
        </div>
      </Show>
    </div>
  )
}
