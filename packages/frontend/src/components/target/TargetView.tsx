import { createSignal } from 'solid-js'
import { Show } from 'solid-js'

export function TargetView() {
  const [url, setUrl] = createSignal('https://example.com')
  const [inputValue, setInputValue] = createSignal('https://example.com')
  const [loading, setLoading] = createSignal(false)
  const [historyLen, setHistoryLen] = createSignal(0)
  const [historyIdx, setHistoryIdx] = createSignal(-1)

  // D17: plain ref variable (not a signal-indexed tuple)
  let iframeRef: HTMLIFrameElement | undefined

  const normalizeUrl = (raw: string): string => {
    const trimmed = raw.trim()
    if (!trimmed) return 'about:blank'
    if (/^https?:\/\//i.test(trimmed) || trimmed === 'about:blank') return trimmed
    // Looks like a domain? else treat as search-ish URL
    if (/^[\w-]+(\.[\w-]+)+/.test(trimmed)) return `https://${trimmed}`
    return `https://${trimmed}`
  }

  const navigate = () => {
    const next = normalizeUrl(inputValue())
    setUrl(next)
    setLoading(true)
  }

  const goBack = () => {
    if (!iframeRef?.contentWindow) return
    try {
      // Cross-origin frames throw on history access in some engines
      iframeRef.contentWindow.history.back()
      setHistoryIdx((i) => Math.max(0, i - 1))
    } catch {
      /* cross-origin: navigation state not observable */
    }
  }

  const goForward = () => {
    if (!iframeRef?.contentWindow) return
    try {
      iframeRef.contentWindow.history.forward()
      setHistoryIdx((i) => Math.min(historyLen() - 1, i + 1))
    } catch {
      /* cross-origin */
    }
  }

  const reload = () => {
    setLoading(true)
    if (iframeRef) {
      // Reassign src instead of location.reload() — works across origins
      iframeRef.src = url()
    }
  }

  const handleLoad = () => {
    setLoading(false)
    try {
      const len = iframeRef?.contentWindow?.history.length ?? 0
      setHistoryLen(len)
      setHistoryIdx(len > 0 ? len - 1 : -1)
    } catch {
      setHistoryLen(0)
      setHistoryIdx(-1)
    }
  }

  // Scaffold for the injected-agent bridge (MASTER Part 9 decision 1):
  // the page agent posts CDP-shaped messages here once instrumentation lands.
  window.addEventListener('message', (e: MessageEvent) => {
    if (e.source !== iframeRef?.contentWindow) return
    const data = e.data as { type?: string } | null
    if (data && typeof data.type === 'string' && data.type.startsWith('wm-agent:')) {
      console.debug('[TargetView] agent message', data)
    }
  })

  return (
    <div class="flex-1 flex flex-col overflow-hidden bg-white">
      {/* Address Bar */}
      <div class="h-10 bg-zen-surface border-b border-white/10 flex items-center gap-2 px-3">
        <button
          class="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={goBack}
          disabled={historyIdx() <= 0}
          title="Back (Alt+Left)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          class="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={goForward}
          disabled={historyIdx() >= historyLen() - 1}
          title="Forward (Alt+Right)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
        <button
          class="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/5"
          onClick={reload}
          title="Reload (Ctrl+R)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6" />
            <path d="M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
        <div class="flex-1 relative">
          <input
            type="text"
            class="w-full px-3 py-1.5 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#00d4aa]/50 focus:border-[#00d4aa] text-sm"
            value={inputValue()}
            onInput={(e) => setInputValue(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && navigate()}
            placeholder="Enter URL..."
            spellcheck={false}
          />
          <Show when={loading()}>
            <div class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[#00d4aa] border-t-transparent rounded-full animate-spin" />
          </Show>
        </div>
        <button
          class="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/5"
          title="Inspect (via WebKitGTK inspector / CDP shim)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
      </div>

      {/* Iframe */}
      <iframe
        ref={(el) => (iframeRef = el)}
        class="flex-1 w-full border-none"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads allow-top-navigation-by-user-activation"
        src={url()}
        onLoad={handleLoad}
        style={{ 'background-color': 'white' }}
      />
    </div>
  )
}
