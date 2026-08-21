import { createSignal } from 'solid-js'
export function ProxyCAPanel() {
  const [status, setStatus] = createSignal('not-installed')
  return (
    <div class="flex flex-col h-full bg-zen-surface p-3 gap-3">
      <div class="glass p-4 rounded-lg">
        <div class="text-sm font-medium mb-2">Certificate Authority</div>
        <div class="text-xs text-gray-400 mb-3">MITM proxy generates per-host certs signed by this CA. Install to system + NSS stores to intercept HTTPS.</div>
        <div class={`px-2 py-1 rounded text-xs mb-3 ${status()==='installed'?'bg-green-500/20 text-green-400':'bg-yellow-500/20 text-yellow-400'}`}>Status: {status()}</div>
        <div class="flex gap-2">
          <button class="zen-btn-primary text-xs flex-1" onClick={() => setStatus('installed')}>Generate CA</button>
          <button class="zen-btn text-xs flex-1">Install to System</button>
          <button class="zen-btn text-xs flex-1">Export PEM</button>
        </div>
      </div>
      <div class="glass p-3 rounded-lg">
        <div class="text-xs text-gray-500">Common Name: Window Mirror MITM CA</div>
        <div class="text-xs text-gray-500">Valid: 10 years</div>
        <div class="text-xs text-gray-500">Location: ~/.local/share/window-mirror/ca/</div>
      </div>
    </div>
  )
}
