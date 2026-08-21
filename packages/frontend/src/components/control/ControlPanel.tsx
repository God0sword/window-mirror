import { createComponent, createSignal } from 'solid-js';
import { Show } from 'solid-js';
import { appMode } from '../../stores/appStore';

export function ControlPanel() {
  const [script, setScript] = createSignal('');
  const [headers, setHeaders] = createSignal('');
  const [targetUrl, setTargetUrl] = createSignal('');

  const isInterrogation = () => appMode() === 'interrogation';

  const injectScript = () => {
    console.log('Injecting script:', script());
  };

  const modifyHeaders = () => {
    console.log('Modifying headers:', headers());
  };

  const replayRequest = () => {
    console.log('Replaying to:', targetUrl());
  };

  return (
    <Show when={isInterrogation()}>
      <div class="h-64 bg-zen-surface border-t border-white/10 overflow-hidden animate-slide-in">
      <div class="h-10 px-3 border-b border-zen-border flex items-center justify-between bg-zen-elevated">
        <div class="flex items-center gap-2">
          <span class="text-lg">🎛️</span>
          <span class="font-medium text-red-400">INTERROGATION MODE</span>
          <span class="px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400">ACTIVE</span>
        </div>
        <button class="p-1.5 rounded text-gray-400 hover:text-white hover:bg-zen-elevated" title="Exit Interrogation">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div class="p-3 space-y-3 overflow-y-auto h-[calc(100%-40px)]">
        {/* Script Injection */}
        <div class="glass p-3 rounded-lg">
          <div class="flex items-center justify-between mb-2">
            <h4 class="font-medium text-sm">Script Injection</h4>
            <span class="text-xs text-gray-500">Executes in target context</span>
          </div>
          <textarea
            class="w-full h-20 bg-zen-bg border border-zen-border rounded px-2 py-1 text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-zen-accent resize-none"
            value={script()}
            onInput={(e) => setScript(e.currentTarget.value)}
            placeholder="// Enter JavaScript to inject into target page&#10;// Example: document.body.style.border = '2px solid red';"
          />
          <div class="flex gap-2 mt-2">
            <button class="zen-btn-primary text-xs flex-1" onClick={injectScript}>Inject</button>
            <button class="zen-btn text-xs" onClick={() => setScript('')}>Clear</button>
          </div>
        </div>

        {/* Header Modification */}
        <div class="glass p-3 rounded-lg">
          <div class="flex items-center justify-between mb-2">
            <h4 class="font-medium text-sm">Header Modification</h4>
            <span class="text-xs text-gray-500">JSON format</span>
          </div>
          <textarea
            class="w-full h-16 bg-zen-bg border border-zen-border rounded px-2 py-1 text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-zen-accent resize-none"
            value={headers()}
            onInput={(e) => setHeaders(e.currentTarget.value)}
            placeholder='{"X-Custom-Header": "value", "Authorization": "Bearer token"}'
          />
          <div class="flex gap-2 mt-2">
            <button class="zen-btn-primary text-xs flex-1" onClick={modifyHeaders}>Apply Headers</button>
            <button class="zen-btn text-xs" onClick={() => setHeaders('')}>Clear</button>
          </div>
        </div>

        {/* Request Replay */}
        <div class="glass p-3 rounded-lg">
          <div class="flex items-center justify-between mb-2">
            <h4 class="font-medium text-sm">Request Replay</h4>
            <span class="text-xs text-gray-500">Replay captured request</span>
          </div>
          <div class="flex gap-2">
            <input
              type="url"
              class="flex-1 zen-input text-xs"
              value={targetUrl()}
              onInput={(e) => setTargetUrl(e.currentTarget.value)}
              placeholder="URL to replay..."
            />
            <button class="zen-btn-primary text-xs whitespace-nowrap" onClick={replayRequest}>Replay</button>
          </div>
        </div>

        {/* Quick Actions */}
        <div class="glass p-3 rounded-lg">
          <h4 class="font-medium text-sm mb-2">Quick Actions</h4>
          <div class="grid grid-cols-2 gap-2">
            <button class="zen-btn text-xs p-2" title="Pause all network">⏸️ Pause Network</button>
            <button class="zen-btn text-xs p-2" title="Clear all storage">🗑️ Clear Storage</button>
            <button class="zen-btn text-xs p-2" title="Snapshot DOM">📸 Snapshot DOM</button>
            <button class="zen-btn text-xs p-2" title="Extract all endpoints">🔗 Extract Endpoints</button>
          </div>
        </div>
      </div>
      </div>
    </Show>
  );
}