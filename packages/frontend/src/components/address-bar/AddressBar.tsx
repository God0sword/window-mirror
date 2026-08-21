import { createComponent, createSignal, createEffect } from 'solid-js'

export function AddressBar() {
  const [url, setUrl] = createSignal<string>('https://example.com')
  const [loading, setLoading] = createSignal(false)
  const [securityInfo, setSecurityInfo] = createSignal<{ secure: boolean; cert?: any }>({ secure: true })

  const navigate = () => {
    setLoading(true)
    // In real implementation, this would navigate the iframe
    console.log('Navigate to:', url())
  }

  return (
    <div class="h-10 bg-zen-surface border-b border-zen-border flex items-center gap-2 px-3">
      <div class="flex items-center gap-2">
        <button class="p-1.5 rounded text-gray-400 hover:text-white hover:bg-zen-elevated" title="Back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <button class="p-1.5 rounded text-gray-400 hover:text-white hover:bg-zen-elevated" title="Forward">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
        <button class="p-1.5 rounded text-gray-400 hover:text-white hover:bg-zen-elevated" onClick={() => {}} title="Reload">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6" />
            <path d="M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
        <div class="flex-1 relative">
          <div class="flex items-center gap-1">
            <span class={`px-2 py-0.5 rounded text-xs font-mono ${securityInfo().secure ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              {securityInfo().secure ? '🔒' : '⚠️'}
            </span>
            <input
              type="url"
              class="flex-1 px-3 py-1.5 rounded-lg bg-zen-bg border border-zen-border text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-zen-accent/50 focus:border-zen-accent text-sm"
              value={url()}
              onInput={(e) => setUrl(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && navigate()}
              placeholder="Enter URL..."
            />
            {loading() && (
              <div class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-zen-accent border-t-transparent rounded-full animate-spin" />
            )}
          </div>
        </div>
      </div>
      <div class="flex items-center gap-1">
        <button class="p-1.5 rounded text-gray-400 hover:text-white hover:bg-zen-elevated" title="Open in new tab">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </button>
        <button class="p-1.5 rounded text-gray-400 hover:text-white hover:bg-zen-elevated" title="Inspect">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
      </div>
    </div>
  )
}