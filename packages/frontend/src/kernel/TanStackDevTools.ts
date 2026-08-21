/**
 * Window Mirror - TanStack DevTools Integration for SolidJS
 * 
 * TanStack Devtools has native SolidJS support! 
 * Packages: @tanstack/solid-devtools, @tanstack/devtools-event-client
 * 
 * Architecture (from research):
 * - Framework adapters: @tanstack/solid-devtools (thin wrapper)
 * - Core shell: @tanstack/devtools (Solid.js based)
 * - Event transport: @tanstack/devtools-event-client (framework agnostic)
 * - Event bus: ClientEventBus + ServerEventBus (WebSocket for cross-tab)
 * - Vite plugin: @tanstack/devtools-vite (auto-inject, go-to-source)
 * 
 * The core shell is always Solid.js, but plugins run in YOUR framework (Solid in our case).
 * Adapters bridge via portals: Solid uses `Portal` from solid-js/web.
 */

import type {
  Plugin, PluginManifest, PluginInstance,
  KernelPrimitives, Subscription
} from './BrowserKernel';

// ============================================================================
// TANSTACK DEVTOOLS TYPES
// ============================================================================

export interface TanStackDevToolsConfig {
  // Core
  enabled: boolean;
  position?: 'bottom' | 'right' | 'left' | 'detached';
  theme?: 'light' | 'dark' | 'system';
  
  // Plugins
  plugins: TanStackPlugin[];
  
  // Event bus
  eventBusConfig?: {
    debug?: boolean;
    host?: string;
    port?: number;
    protocol?: 'ws' | 'wss';
    reconnectEveryMs?: number;
  };
  
  // Vite plugin (dev only)
  vitePlugin?: {
    enabled: boolean;
    goToSource?: boolean;
    consolePiping?: boolean;
  };
  
  // Picture-in-Picture
  pip?: {
    enabled: boolean;
    defaultOpen?: boolean;
  };
}

export interface TanStackPlugin {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  category?: string;
  // Render function - receives DOM element and theme
  render: (container: HTMLElement, theme: 'light' | 'dark') => {
    destroy: () => void;
    update?: (theme: 'light' | 'dark') => void;
  };
  // Optional: default open
  defaultOpen?: boolean;
  // Optional: keyboard shortcut
  shortcut?: string;
  // Optional: when to show (context condition)
  when?: string;
}

export interface DevToolsEventMap {
  // Core events
  'plugin-register': { pluginId: string; plugin: TanStackPlugin };
  'plugin-unregister': { pluginId: string };
  'plugin-toggle': { pluginId: string; open: boolean };
  'theme-change': { theme: 'light' | 'dark' };
  'position-change': { position: string };
  
  // Custom events (plugin-specific)
  [key: string]: any;
}

// ============================================================================
// EVENT CLIENT (Framework agnostic - from @tanstack/devtools-event-client)
// ============================================================================

export class DevToolsEventClient<T extends Record<string, any> = DevToolsEventMap> {
  private pluginId: string;
  private debug: boolean;
  private eventTarget: EventTarget;
  private listeners = new Map<string, Set<(payload: any) => void>>();
  private globalTarget: EventTarget;
  private connected = false;
  private ws?: WebSocket | undefined;
  private reconnectTimer?: number;
  private reconnectEveryMs: number;
  
  constructor(options: {
    pluginId: string;
    debug?: boolean;
    eventTarget?: EventTarget;
    globalTarget?: EventTarget;
    reconnectEveryMs?: number;
  }) {
    this.pluginId = options.pluginId;
    this.debug = options.debug ?? false;
    this.eventTarget = options.eventTarget ?? new EventTarget();
    this.globalTarget = options.globalTarget ?? (typeof window !== 'undefined' ? window : new EventTarget());
    this.reconnectEveryMs = options.reconnectEveryMs ?? 3000;
    
    this.setupGlobalListener();
    if (this.debug) {
      console.log(`[tanstack-devtools:${this.pluginId}] EventClient initialized`);
    }
  }
  
  private setupGlobalListener(): void {
    this.globalTarget.addEventListener('tanstack-dispatch-event', (e: any) => {
      const { type, payload, pluginId } = e.detail;
      if (pluginId !== this.pluginId) return;
      
      const eventName = type.replace(`${this.pluginId}:`, '');
      this.emitLocal(eventName, payload);
    });
  }
  
  private emitLocal(eventName: string, payload: any): void {
    const listeners = this.listeners.get(eventName);
    if (listeners) {
      listeners.forEach(fn => fn(payload));
    }
  }
  
  // Emit event to devtools shell and other listeners
  emit<K extends keyof T>(eventName: K, payload: T[K]): void {
    const fullEventName = `${this.pluginId}:${eventName as string}`;
    
    // Local listeners
    this.emitLocal(eventName as string, payload);
    
    // Dispatch to global target (picked up by ClientEventBus)
    this.globalTarget.dispatchEvent(new CustomEvent('tanstack-dispatch-event', {
      detail: {
        type: fullEventName,
        payload,
        pluginId: this.pluginId
      }
    }));
    
    if (this.debug) {
      console.log(`[tanstack-devtools:${this.pluginId}] Emitted: ${fullEventName}`, payload);
    }
  }
  
  // Listen for events
  on<K extends keyof T>(eventName: K, callback: (payload: T[K]) => void): () => void {
    const name = eventName as string;
    if (!this.listeners.has(name)) {
      this.listeners.set(name, new Set());
    }
    this.listeners.get(name)!.add(callback);
    
    return () => {
      this.listeners.get(name)?.delete(callback);
    };
  }
  
  // Listen for all events from this plugin
  onAll(callback: (eventName: string, payload: any) => void): () => void {
    const wrapped = (e: any) => {
      const fullName = e.detail.type;
      const eventName = fullName.replace(`${this.pluginId}:`, '');
      callback(eventName, e.detail.payload);
    };
    this.globalTarget.addEventListener('tanstack-dispatch-event', wrapped);
    return () => this.globalTarget.removeEventListener('tanstack-dispatch-event', wrapped);
  }
  
  // Connect to server bus (for cross-tab/process)
  async connect(config?: { host: string; port: number; protocol: 'ws' | 'wss' }): Promise<void> {
    if (this.connected) return;
    
    const host = config?.host ?? 'localhost';
    const port = config?.port ?? 3001;
    const protocol = config?.protocol ?? 'ws';
    const url = `${protocol}://${host}:${port}`;
    
    try {
      this.ws = new WebSocket(url);
      
      this.ws.onopen = () => {
        this.connected = true;
        if (this.debug) console.log(`[tanstack-devtools:${this.pluginId}] Connected to server bus`);
      };
      
      this.ws.onmessage = (event) => {
        try {
          const { type, payload, pluginId } = JSON.parse(event.data);
          if (pluginId !== this.pluginId) return;
          const eventName = type.replace(`${this.pluginId}:`, '');
          this.emitLocal(eventName, payload);
        } catch (e) {
          if (this.debug) console.error(`[tanstack-devtools:${this.pluginId}] Failed to parse message`, e);
        }
      };
      
      this.ws.onclose = () => {
        this.connected = false;
        if (this.debug) console.log(`[tanstack-devtools:${this.pluginId}] Disconnected, reconnecting...`);
        this.scheduleReconnect(config);
      };
      
      this.ws.onerror = (err) => {
        if (this.debug) console.error(`[tanstack-devtools:${this.pluginId}] WebSocket error`, err);
      };
    } catch (e) {
      if (this.debug) console.error(`[tanstack-devtools:${this.pluginId}] Failed to connect`, e);
      this.scheduleReconnect(config);
    }
  }
  
  private scheduleReconnect(config?: { host: string; port: number; protocol: 'ws' | 'wss' }): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = window.setTimeout(() => {
      this.connect(config);
    }, this.reconnectEveryMs);
  }
  
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
    this.connected = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
  }
  
  destroy(): void {
    this.disconnect();
    this.listeners.clear();
  }
}

// ============================================================================
// TANSTACK DEVTOOLS PLUGIN FOR WINDOW MIRROR
// ============================================================================

export const TANSTACK_DEVTOOLS_PLUGIN: Plugin = {
  manifest: {
    id: 'window-mirror.tanstack-devtools',
    name: 'TanStack DevTools Integration',
    version: '1.0.0',
    description: 'Built-in TanStack DevTools for SolidJS with custom plugin support',
    author: 'Window Mirror',
    license: 'MIT',
    main: 'window-mirror/tanstack-devtools/integration',
    permissions: {
      network: false,
      filesystem: false,
      clipboard: false,
      notifications: false,
      geolocation: false,
      camera: false,
      microphone: false,
      custom: ['devtools', 'tanstack']
    },
    dependencies: [],
    optionalDependencies: [],
    ui: {
      // This plugin provides the DevTools shell itself
      customElements: [{
        tagName: 'wm-devtools',
        component: 'TanStackDevToolsShell'
      }],
      commands: [
        { id: 'devtools.open', title: 'Open DevTools', action: 'devtools.open', category: 'Developer Tools', shortcut: 'F12' },
        { id: 'devtools.close', title: 'Close DevTools', action: 'devtools.close', category: 'Developer Tools' },
        { id: 'devtools.toggle', title: 'Toggle DevTools', action: 'devtools.toggle', category: 'Developer Tools', shortcut: 'Ctrl+Shift+I' },
        { id: 'devtools.inspect', title: 'Inspect Element', action: 'devtools.inspect', category: 'Developer Tools', shortcut: 'Ctrl+Shift+C' }
      ],
      shortcuts: [
        { key: 'F12', command: 'devtools.toggle', description: 'Toggle DevTools' },
        { key: 'Ctrl+Shift+I', command: 'devtools.toggle', description: 'Toggle DevTools' },
        { key: 'Ctrl+Shift+C', command: 'devtools.inspect', description: 'Inspect element' }
      ]
    },
    overrides: [
      { target: 'ui.devtools', priority: 100, component: 'TanStackDevToolsShell' }
    ]
  },
  instance: {
    async onLoad(kernel) {
      console.log('[TanStack DevTools] Loaded');
    },
    async onEnable() {
      console.log('[TanStack DevTools] Enabled');
    },
    async onDisable() {
      console.log('[TanStack DevTools] Disabled');
    }
  },
  enabled: true,
  config: { enabled: true, settings: {} }
};

// ============================================================================
// BUILT-IN PLUGINS FOR WINDOW MIRROR
// ============================================================================

export const BUILTIN_TANSTACK_PLUGINS: TanStackPlugin[] = [
  // Elements Panel (DOM Inspector)
  {
    id: 'elements',
    name: 'Elements',
    description: 'DOM inspector and editor',
    icon: '🧬',
    category: 'Core',
    defaultOpen: true,
    shortcut: 'Ctrl+Shift+E',
    render: (container, theme) => {
      // Implementation would mount Solid component
      const el = document.createElement('div');
      el.innerHTML = '<wm-elements-panel></wm-elements-panel>';
      container.appendChild(el);
      return { destroy: () => el.remove() };
    }
  },
  
  // Console Panel
  {
    id: 'console',
    name: 'Console',
    description: 'JavaScript console with REPL',
    icon: '📋',
    category: 'Core',
    defaultOpen: true,
    shortcut: 'Ctrl+Shift+J',
    render: (container, theme) => {
      const el = document.createElement('div');
      el.innerHTML = '<wm-console-panel></wm-console-panel>';
      container.appendChild(el);
      return { destroy: () => el.remove() };
    }
  },
  
  // Sources Panel
  {
    id: 'sources',
    name: 'Sources',
    description: 'Source code debugger with breakpoints',
    icon: '📝',
    category: 'Core',
    shortcut: 'Ctrl+Shift+S',
    render: (container, theme) => {
      const el = document.createElement('div');
      el.innerHTML = '<wm-sources-panel></wm-sources-panel>';
      container.appendChild(el);
      return { destroy: () => el.remove() };
    }
  },
  
  // Network Panel
  {
    id: 'network',
    name: 'Network',
    description: 'Network request inspector with timeline',
    icon: '🌐',
    category: 'Core',
    shortcut: 'Ctrl+Shift+N',
    render: (container, theme) => {
      const el = document.createElement('div');
      el.innerHTML = '<wm-network-panel></wm-network-panel>';
      container.appendChild(el);
      return { destroy: () => el.remove() };
    }
  },
  
  // Timeline Panel (Window Mirror specific)
  {
    id: 'timeline',
    name: 'Timeline',
    description: 'Unified event timeline (network, DOM, console, storage)',
    icon: '📊',
    category: 'Window Mirror',
    defaultOpen: true,
    shortcut: 'Ctrl+Shift+T',
    render: (container, theme) => {
      const el = document.createElement('div');
      el.innerHTML = '<wm-timeline-panel></wm-timeline-panel>';
      container.appendChild(el);
      return { destroy: () => el.remove() };
    }
  },
  
  // Performance Panel
  {
    id: 'performance',
    name: 'Performance',
    description: 'Runtime performance profiling',
    icon: '⚡',
    category: 'Core',
    render: (container, theme) => {
      const el = document.createElement('div');
      el.innerHTML = '<wm-performance-panel></wm-performance-panel>';
      container.appendChild(el);
      return { destroy: () => el.remove() };
    }
  },
  
  // Memory Panel
  {
    id: 'memory',
    name: 'Memory',
    description: 'Heap snapshots and allocation tracking',
    icon: '🧠',
    category: 'Core',
    render: (container, theme) => {
      const el = document.createElement('div');
      el.innerHTML = '<wm-memory-panel></wm-memory-panel>';
      container.appendChild(el);
      return { destroy: () => el.remove() };
    }
  },
  
  // Application Panel
  {
    id: 'application',
    name: 'Application',
    description: 'Storage, cookies, cache, service workers',
    icon: '📦',
    category: 'Core',
    render: (container, theme) => {
      const el = document.createElement('div');
      el.innerHTML = '<wm-application-panel></wm-application-panel>';
      container.appendChild(el);
      return { destroy: () => el.remove() };
    }
  },
  
  // Security Panel
  {
    id: 'security',
    name: 'Security',
    description: 'Certificate, CSP, mixed content analysis',
    icon: '🔒',
    category: 'Core',
    render: (container, theme) => {
      const el = document.createElement('div');
      el.innerHTML = '<wm-security-panel></wm-security-panel>';
      container.appendChild(el);
      return { destroy: () => el.remove() };
    }
  },
  
  // SAST Panel (Window Mirror)
  {
    id: 'sast',
    name: 'SAST',
    description: 'Static analysis findings with taint flow',
    icon: '🛡️',
    category: 'Window Mirror',
    render: (container, theme) => {
      const el = document.createElement('div');
      el.innerHTML = '<wm-sast-panel></wm-sast-panel>';
      container.appendChild(el);
      return { destroy: () => el.remove() };
    }
  },
  
  // JWT Decoder (Window Mirror)
  {
    id: 'jwt-decoder',
    name: 'JWT Decoder',
    description: 'Decode, verify, and edit JWT tokens',
    icon: '🔐',
    category: 'Window Mirror',
    render: (container, theme) => {
      const el = document.createElement('div');
      el.innerHTML = '<wm-jwt-decoder></wm-jwt-decoder>';
      container.appendChild(el);
      return { destroy: () => el.remove() };
    }
  },
  
  // Crypto Detector (Window Mirror)
  {
    id: 'crypto-detector',
    name: 'Crypto Detector',
    description: 'Scan for weak crypto, hardcoded keys, entropy issues',
    icon: '🔑',
    category: 'Window Mirror',
    render: (container, theme) => {
      const el = document.createElement('div');
      el.innerHTML = '<wm-crypto-detector></wm-crypto-detector>';
      container.appendChild(el);
      return { destroy: () => el.remove() };
    }
  },
  
  // Fuzzer (Window Mirror)
  {
    id: 'fuzzer',
    name: 'Fuzzer',
    description: 'Parameter/wordlist fuzzing with response diff',
    icon: '🎯',
    category: 'Window Mirror',
    render: (container, theme) => {
      const el = document.createElement('div');
      el.innerHTML = '<wm-fuzzer-panel></wm-fuzzer-panel>';
      container.appendChild(el);
      return { destroy: () => el.remove() };
    }
  },
  
  // Auth Analyzer (Window Mirror)
  {
    id: 'auth-analyzer',
    name: 'Auth Analyzer',
    description: 'Cookie/token flow, CSRF check, SameSite analysis',
    icon: '🔐',
    category: 'Window Mirror',
    render: (container, theme) => {
      const el = document.createElement('div');
      el.innerHTML = '<wm-auth-analyzer></wm-auth-analyzer>';
      container.appendChild(el);
      return { destroy: () => el.remove() };
    }
  },
  
  // API Mapper (Window Mirror)
  {
    id: 'api-mapper',
    name: 'API Mapper',
    description: 'OpenAPI/GraphQL introspection, endpoint graph',
    icon: '🗺️',
    category: 'Window Mirror',
    render: (container, theme) => {
      const el = document.createElement('div');
      el.innerHTML = '<wm-api-mapper></wm-api-mapper>';
      container.appendChild(el);
      return { destroy: () => el.remove() };
    }
  },
  
  // DOM Diff (Window Mirror)
  {
    id: 'dom-diff',
    name: 'DOM Diff',
    description: 'Snapshot compare, mutation timeline, selector generator',
    icon: '🔄',
    category: 'Window Mirror',
    render: (container, theme) => {
      const el = document.createElement('div');
      el.innerHTML = '<wm-dom-diff></wm-dom-diff>';
      container.appendChild(el);
      return { destroy: () => el.remove() };
    }
  },
  
  // WebSocket Panel (Window Mirror)
  {
    id: 'websocket',
    name: 'WebSocket',
    description: 'WebSocket frame inspector, message replay',
    icon: '🔌',
    category: 'Window Mirror',
    render: (container, theme) => {
      const el = document.createElement('div');
      el.innerHTML = '<wm-websocket-panel></wm-websocket-panel>';
      container.appendChild(el);
      return { destroy: () => el.remove() };
    }
  },
  
  // GraphQL Panel (Window Mirror)
  {
    id: 'graphql',
    name: 'GraphQL',
    description: 'GraphQL query builder, schema explorer, introspection',
    icon: '◆',
    category: 'Window Mirror',
    render: (container, theme) => {
      const el = document.createElement('div');
      el.innerHTML = '<wm-graphql-panel></wm-graphql-panel>';
      container.appendChild(el);
      return { destroy: () => el.remove() };
    }
  },
  
  // WASM Panel (Window Mirror)
  {
    id: 'wasm',
    name: 'WASM',
    description: 'WASM module inspector, memory viewer, function caller',
    icon: '⚙️',
    category: 'Window Mirror',
    render: (container, theme) => {
      const el = document.createElement('div');
      el.innerHTML = '<wm-wasm-panel></wm-wasm-panel>';
      container.appendChild(el);
      return { destroy: () => el.remove() };
    }
  }
];

// ============================================================================
// SOLIDJS COMPONENT INTEGRATION
// ============================================================================

// This would be the main DevTools shell component
export function TanStackDevToolsShell(props: {
  config: TanStackDevToolsConfig;
  onClose: () => void;
}) {
  // In real implementation, this would use @tanstack/solid-devtools
  // For now, showing the integration pattern
  
  return `
    <div class="wm-devtools-shell" data-theme="${props.config.theme || 'dark'}">
      <div class="devtools-tabs">
        ${props.config.plugins.map(p => `
          <button class="devtools-tab" data-panel="${p.id}">
            <span class="icon">${p.icon}</span>
            <span class="label">${p.name}</span>
          </button>
        `).join('')}
      </div>
      <div class="devtools-panels">
        ${props.config.plugins.map(p => `
          <div class="devtools-panel" id="panel-${p.id}" style="display: ${p.defaultOpen ? 'block' : 'none'}">
            <wm-${p.id.replace('-', '-')}-panel></wm-${p.id.replace('-', '-')}-panel>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ============================================================================
// VITE PLUGIN CONFIGURATION
// ============================================================================

export const TANSTACK_VITE_PLUGIN_CONFIG = {
  // From @tanstack/devtools-vite
  plugins: [
    // Starts ServerEventBus on Vite dev server
    // Sets up middleware for go-to-source editor integration
    // Bidirectional console piping (client logs → terminal, server logs → browser)
    'devtools-server',
    
    // Listens for install-devtools events from devtools UI
    // Runs package manager to install requested package
    // Uses AST manipulation to inject plugin import and configuration
    'devtools-installer',
    
    // Replaces compile-time placeholders in event bus client code
    // with actual values from running dev server
    'connection-injection'
  ]
};

// ============================================================================
// SETUP FUNCTION
// ============================================================================

export function setupTanStackDevTools(config: Partial<TanStackDevToolsConfig> = {}) {
  const finalConfig: TanStackDevToolsConfig = {
    enabled: true,
    position: 'bottom',
    theme: 'dark',
    plugins: BUILTIN_TANSTACK_PLUGINS,
    eventBusConfig: {
      debug: import.meta.env.DEV,
      reconnectEveryMs: 3000,
      ...config.eventBusConfig
    },
    vitePlugin: {
      enabled: import.meta.env.DEV,
      goToSource: true,
      consolePiping: true,
      ...config.vitePlugin
    },
    pip: {
      enabled: true,
      defaultOpen: false,
      ...config.pip
    },
    ...config
  };
  
  // Create event clients for each plugin
  const eventClients = new Map<string, DevToolsEventClient>();
  
  for (const plugin of finalConfig.plugins) {
    const client = new DevToolsEventClient({
      pluginId: plugin.id,
      debug: finalConfig.eventBusConfig?.debug ?? false,
      reconnectEveryMs: finalConfig.eventBusConfig?.reconnectEveryMs ?? 3000
    });
    eventClients.set(plugin.id, client);
  }
  
  // Connect to server bus if in dev mode
  if (import.meta.env.DEV && finalConfig.eventBusConfig?.host) {
    for (const [, client] of eventClients) {
      client.connect({
        host: finalConfig.eventBusConfig.host,
        port: finalConfig.eventBusConfig.port ?? 4930,
        protocol: finalConfig.eventBusConfig.protocol ?? 'ws'
      });
    }
  }
  
  return {
    config: finalConfig,
    eventClients,
    emit: (pluginId: string, eventName: string, payload: any) => {
      eventClients.get(pluginId)?.emit(eventName as any, payload);
    },
    on: (pluginId: string, eventName: string, callback: (payload: any) => void) => {
      return eventClients.get(pluginId)?.on(eventName as any, callback);
    }
  };
}
