/* @refresh reload */
import { render } from 'solid-js/web'
import './index.css'
import { App } from './App.tsx'

// D14: kernel bootstrap is not real yet (KernelBootstrap throws "not implemented").
// Skip initialization entirely until the bootstrap lands; the UI boots blank
// (Zen-style) with the command palette always available.
async function initializeApp() {
  try {
    const { createKernel } = await import('./kernel')
    if (typeof createKernel !== 'function') return

    const kernel = await createKernel({
      builtinPlugins: [],
      pluginDirs: [],
      configDir: '',
      devMode: import.meta.env.DEV,
      debug: import.meta.env.DEV,
      rendererType: 'webview',
      sandboxType: 'wasm',
      strictSandbox: true,
    })
    ;(window as unknown as Record<string, unknown>).__WINDOW_MIRROR_KERNEL__ = kernel
    console.log('[Window Mirror] Kernel initialized')
  } catch (error) {
    // Expected until KernelBootstrap is real — non-fatal, UI still renders.
    console.warn('[Window Mirror] Kernel init skipped:', error)
  }
}

void initializeApp()

const root = document.getElementById('root')
render(() => <App />, root!)
