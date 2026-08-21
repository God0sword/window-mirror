import { createSignal, createMemo, For, Show } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { ElementsPanel } from './panels/ElementsPanel';
import { SourcesPanel } from './panels/SourcesPanel';
import { NetworkPanel } from './panels/NetworkPanel';
import { ConsolePanel } from '../console/ConsolePanel';
import { TimelinePanel } from '../timeline/TimelinePanel';
import {
  PerformancePanel,
  MemoryPanel,
  ApplicationPanel,
  SecurityPanel,
  SASTPanel,
  JWTDecoderPanel,
  CryptoDetectorPanel,
  FuzzerPanel,
  AuthAnalyzerPanel,
  APIMapperPanel,
  DOMDiffPanel,
  WebSocketPanel,
  GraphQLPanel,
  WasmPanel,
} from './panels/PlaceholderPanels';

const panels = [
  { id: 'elements', label: 'Elements', icon: '🧬', component: ElementsPanel },
  { id: 'console', label: 'Console', icon: '📋', component: ConsolePanel },
  { id: 'sources', label: 'Sources', icon: '📝', component: SourcesPanel },
  { id: 'network', label: 'Network', icon: '🌐', component: NetworkPanel },
  { id: 'timeline', label: 'Timeline', icon: '📊', component: TimelinePanel },
  { id: 'performance', label: 'Performance', icon: '⚡', component: PerformancePanel },
  { id: 'memory', label: 'Memory', icon: '🧠', component: MemoryPanel },
  { id: 'application', label: 'Application', icon: '📦', component: ApplicationPanel },
  { id: 'security', label: 'Security', icon: '🔒', component: SecurityPanel },
  { id: 'sast', label: 'SAST', icon: '🛡️', component: SASTPanel },
  { id: 'jwt', label: 'JWT Decoder', icon: '🔐', component: JWTDecoderPanel },
  { id: 'crypto', label: 'Crypto Detector', icon: '🔑', component: CryptoDetectorPanel },
  { id: 'fuzzer', label: 'Fuzzer', icon: '🎯', component: FuzzerPanel },
  { id: 'auth', label: 'Auth Analyzer', icon: '🔐', component: AuthAnalyzerPanel },
  { id: 'api', label: 'API Mapper', icon: '🗺️', component: APIMapperPanel },
  { id: 'dom-diff', label: 'DOM Diff', icon: '🔄', component: DOMDiffPanel },
  { id: 'websocket', label: 'WebSocket', icon: '🔌', component: WebSocketPanel },
  { id: 'graphql', label: 'GraphQL', icon: '◆', component: GraphQLPanel },
  { id: 'wasm', label: 'WASM', icon: '⚙️', component: WasmPanel },
];

export function DevToolsPanel() {
  const [activePanel, setActivePanel] = createSignal<string>('elements');
  const [dockSide, setDockSide] = createSignal<'right' | 'bottom' | 'detached'>('right');
  const [search, setSearch] = createSignal('');
  
  const activePanelComponent = createMemo(() => {
    return panels.find(p => p.id === activePanel())?.component;
  });

  const filteredPanels = createMemo(() => {
    const s = search().toLowerCase();
    return panels.filter(p => 
      p.label.toLowerCase().includes(s) || p.id.includes(s)
    );
  });

  return (
    <div class="flex flex-col bg-zen-surface border-l border-zen-border overflow-hidden" style={{ 'min-width': '320px', 'max-width': '800px' }}>
      {/* Toolbar */}
      <div class="h-9 px-2 border-b border-zen-border flex items-center gap-2 bg-zen-elevated/50">
        <div class="flex-1 flex items-center gap-1">
          <input
            type="text"
            class="px-2 py-1 text-xs bg-zen-bg border border-zen-border rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-zen-accent w-48"
            placeholder="Search panels..."
            value={search()}
            onInput={(e) => setSearch(e.currentTarget.value)}
          />
          <div class="flex items-center gap-1 ml-2 border-l border-zen-border pl-2">
            <For each={filteredPanels()}>
              {(panel) => (
                <button
                  class={`
                    px-2 py-1 rounded text-xs font-medium transition-all duration-150
                    ${activePanel() === panel.id 
                      ? 'bg-zen-accent/20 text-zen-accent border-b-2 border-zen-accent' 
                      : 'text-gray-400 hover:text-white hover:bg-zen-elevated'
                    }
                  `}
                  onClick={() => setActivePanel(panel.id)}
                  title={panel.label}
                >
                  <span class="text-sm">{panel.icon}</span>
                  <span class="ml-1 hidden sm:inline">{panel.label}</span>
                </button>
              )}
            </For>
          </div>
        </div>
        
        <div class="flex items-center gap-1">
          <button 
            class="p-1.5 rounded text-gray-400 hover:text-white hover:bg-zen-elevated"
            onClick={() => setDockSide(dockSide() === 'right' ? 'bottom' : dockSide() === 'bottom' ? 'detached' : 'right')}
            title={`Dock: ${dockSide()}`}
          >
            {dockSide() === 'right' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>}
            {dockSide() === 'bottom' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>}
            {dockSide() === 'detached' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2" ry="2" /><polyline points="9 11 12 14 15 11" /><polyline points="9 13 12 16 15 13" /></svg>}
          </button>
          <button class="p-1.5 rounded text-gray-400 hover:text-white hover:bg-zen-elevated" title="Settings">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
          </button>
          <button class="p-1.5 rounded text-gray-400 hover:text-red-400 hover:bg-zen-elevated" title="Close DevTools">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      </div>

      {/* Panel Content */}
      <div class="flex-1 overflow-hidden">
        <Show when={activePanelComponent()} keyed>
          {(Component) => <Dynamic component={Component} />}
        </Show>
      </div>
    </div>
  );
}