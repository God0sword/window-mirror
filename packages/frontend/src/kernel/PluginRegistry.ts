/**
 * Plugin Registry - Manages all plugins
 */

import type { 
  PluginSystem, Plugin, PluginManifest, PluginConfig, 
  PluginInstance, PluginEvent, PluginDependency,
  Subscription, MessageBus, KernelPrimitives
} from './BrowserKernel';

export class PluginRegistry implements PluginSystem {
  private plugins = new Map<string, Plugin>();
  private loadOrder: string[] = [];
  private messageBus: MessageBus;
  private config: Map<string, PluginConfig> = new Map();
  
  constructor(messageBus: MessageBus) {
    this.messageBus = messageBus;
  }
  
  async register(plugin: Plugin): Promise<void> {
    // Validate manifest
    this.validateManifest(plugin.manifest);
    
    // Check dependencies
    await this.resolveDependencies(plugin);
    
    // Check conflicts
    this.checkConflicts(plugin);
    
    // Register
    this.plugins.set(plugin.manifest.id, plugin);
    this.loadOrder.push(plugin.manifest.id);
    
    // Initialize instance
    if (plugin.instance.onLoad) {
      await plugin.instance.onLoad(this.getKernelPrimitives());
    }
    
    this.emit('register', plugin);
  }
  
  async unregister(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) return;
    
    // Disable first
    await this.disable(id);
    
    // Unload
    if (plugin.instance.onUnload) {
      await plugin.instance.onUnload();
    }
    
    this.plugins.delete(id);
    this.loadOrder = this.loadOrder.filter(p => p !== id);
    this.config.delete(id);
    
    this.emit('unregister', plugin);
  }
  
  get(id: string): Plugin | null {
    return this.plugins.get(id) || null;
  }
  
  list(): Plugin[] {
    return Array.from(this.plugins.values());
  }
  
  async enable(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin || plugin.enabled) return;
    
    plugin.enabled = true;
    
    if (plugin.instance.onEnable) {
      await plugin.instance.onEnable();
    }
    
    this.emit('enable', plugin);
  }
  
  async disable(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin || !plugin.enabled) return;
    
    plugin.enabled = false;
    
    if (plugin.instance.onDisable) {
      await plugin.instance.onDisable();
    }
    
    this.emit('disable', plugin);
  }
  
  async reload(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) return;
    
    await this.disable(id);
    // Re-initialize
    if (plugin.instance.onLoad) {
      await plugin.instance.onLoad(this.getKernelPrimitives());
    }
    await this.enable(id);
    
    this.emit('reload', plugin);
  }
  
  async resolveDependencies(plugin: Plugin): Promise<Plugin[]> {
    const resolved: Plugin[] = [];
    
    for (const dep of plugin.manifest.dependencies) {
      const depPlugin = this.plugins.get(dep.id);
      if (!depPlugin) {
        if (!dep.optional) {
          throw new Error(`Missing required dependency: ${dep.id}@${dep.version}`);
        }
        continue;
      }
      
      // Check version compatibility
      if (!this.satisfiesVersion(depPlugin.manifest.version, dep.version)) {
        throw new Error(`Version mismatch for ${dep.id}: have ${depPlugin.manifest.version}, need ${dep.version}`);
      }
      
      resolved.push(depPlugin);
    }
    
    return resolved;
  }
  
  getConfig(id: string): PluginConfig {
    return this.config.get(id) || { enabled: true, settings: {} };
  }
  
  async setConfig(id: string, config: PluginConfig): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new Error(`Plugin not found: ${id}`);
    
    const oldConfig = this.getConfig(id);
    this.config.set(id, config);
    plugin.config = config;
    
    if (plugin.instance.onConfigChange) {
      await plugin.instance.onConfigChange(oldConfig, config);
    }
    
    this.emit('config-change', plugin);
  }
  
  onPluginEvent(event: PluginEvent, handler: (plugin: Plugin) => void): Subscription {
    // In real implementation, subscribe to message bus
    return {
      unsubscribe: () => {}
    };
  }
  
  // =========================================================================
  // Private methods
  // =========================================================================
  
  private validateManifest(manifest: PluginManifest): void {
    if (!manifest.id) throw new Error('Plugin must have an id');
    if (!manifest.name) throw new Error('Plugin must have a name');
    if (!manifest.version) throw new Error('Plugin must have a version');
    if (!manifest.main) throw new Error('Plugin must have a main entry point');
    
    // Validate semver
    if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
      throw new Error('Version must be semver');
    }
  }
  
  private checkConflicts(plugin: Plugin): void {
    for (const [, existing] of this.plugins) {
      if (existing.manifest.id === plugin.manifest.id) {
        throw new Error(`Plugin already registered: ${plugin.manifest.id}`);
      }
      
      // Check override conflicts
      if (plugin.manifest.overrides && existing.manifest.overrides) {
        for (const override of plugin.manifest.overrides) {
          for (const existingOverride of existing.manifest.overrides) {
            if (override.target === existingOverride.target && 
                override.priority === existingOverride.priority) {
              console.warn(`Override conflict: ${plugin.manifest.id} vs ${existing.manifest.id} for ${override.target}`);
            }
          }
        }
      }
    }
  }
  
  private satisfiesVersion(version: string, range: string): boolean {
    // Simplified semver check - in real implementation use semver library
    return true;
  }
  
  private emit(event: PluginEvent, plugin: Plugin): void {
    this.messageBus.publish(`plugin:${event}`, plugin);
  }
  
  private getKernelPrimitives(): KernelPrimitives {
    // Return kernel primitives for plugin (wired when kernel bootstrap lands)
    return {} as KernelPrimitives;
  }
}

// ============================================================================
// Built-in Plugin Loader
// ============================================================================

export interface PluginLoader {
  load(path: string): Promise<Plugin>;
  loadFromDirectory(dir: string): Promise<Plugin[]>;
  loadFromUrl(url: string): Promise<Plugin>;
  loadFromSource(source: string, id: string): Promise<Plugin>;
}

export class DefaultPluginLoader implements PluginLoader {
  private messageBus: MessageBus;
  
  constructor(messageBus: MessageBus) {
    this.messageBus = messageBus;
  }
  
  async load(path: string): Promise<Plugin> {
    // Load manifest
    const manifest = await this.loadManifest(path);
    
    // Load plugin code
    const module = await import(path);
    
    // Create plugin instance
    const instance = module.default || module;
    
    const plugin: Plugin = {
      manifest,
      instance,
      enabled: false,
      config: { enabled: true, settings: {} }
    };
    
    return plugin;
  }
  
  async loadFromDirectory(dir: string): Promise<Plugin[]> {
    const plugins: Plugin[] = [];
    // In real implementation, scan directory for plugin manifests
    return plugins;
  }
  
  async loadFromUrl(url: string): Promise<Plugin> {
    // Load plugin from URL (WASM module, ES module, etc.)
    throw new Error('Not implemented');
  }
  
  async loadFromSource(source: string, id: string): Promise<Plugin> {
    // Load plugin from source code string
    throw new Error('Not implemented');
  }
  
  private async loadManifest(path: string): Promise<PluginManifest> {
    // In real implementation, read package.json or manifest.json
    return {
      id: path,
      name: path,
      version: '0.0.0',
      description: '',
      author: '',
      license: 'MIT',
      main: path,
      permissions: {
        network: false,
        filesystem: false,
        clipboard: false,
        notifications: false,
        geolocation: false,
        camera: false,
        microphone: false,
        custom: []
      },
      dependencies: [],
      optionalDependencies: []
    };
  }
}

// ============================================================================
// Plugin Manager - High-level API
// ============================================================================

export class PluginManager {
  private registry: PluginRegistry;
  private loader: PluginLoader;
  
  constructor(messageBus: MessageBus) {
    this.registry = new PluginRegistry(messageBus);
    this.loader = new DefaultPluginLoader(messageBus);
  }
  
  getRegistry(): PluginRegistry {
    return this.registry;
  }
  
  async installPlugin(source: string): Promise<Plugin> {
    const plugin = await this.loader.load(source);
    await this.registry.register(plugin);
    await this.registry.enable(plugin.manifest.id);
    return plugin;
  }
  
  async uninstallPlugin(id: string): Promise<void> {
    await this.registry.unregister(id);
  }
  
  async enablePlugin(id: string): Promise<void> {
    await this.registry.enable(id);
  }
  
  async disablePlugin(id: string): Promise<void> {
    await this.registry.disable(id);
  }
  
  async reloadPlugin(id: string): Promise<void> {
    await this.registry.reload(id);
  }
  
  async updatePlugin(id: string, source: string): Promise<Plugin> {
    await this.registry.unregister(id);
    const plugin = await this.loader.load(source);
    await this.registry.register(plugin);
    await this.registry.enable(id);
    return plugin;
  }
  
  getPlugin(id: string): Plugin | null {
    return this.registry.get(id);
  }
  
  listPlugins(): Plugin[] {
    return this.registry.list();
  }
  
  getEnabledPlugins(): Plugin[] {
    return this.registry.list().filter(p => p.enabled);
  }
  
  getConfig(id: string): PluginConfig {
    return this.registry.getConfig(id);
  }
  
  async setConfig(id: string, config: PluginConfig): Promise<void> {
    return this.registry.setConfig(id, config);
  }
}

// ============================================================================
// Built-in Plugins (Core Browser Features)
// ============================================================================

export const BUILTIN_PLUGINS: Record<string, PluginManifest> = {
  // Core UI
  'core.tab-bar': {
    id: 'core.tab-bar',
    name: 'Tab Bar',
    version: '1.0.0',
    description: 'Default tab bar implementation',
    author: 'Window Mirror',
    license: 'MIT',
    main: 'core/tab-bar',
    permissions: { network: false, filesystem: false, clipboard: false, notifications: false, geolocation: false, camera: false, microphone: false, custom: [] },
    dependencies: [],
    optionalDependencies: [],
    overrides: [{ target: 'ui.tab-bar', priority: 0, component: 'TabBar' }]
  },
  
  'core.address-bar': {
    id: 'core.address-bar',
    name: 'Address Bar',
    version: '1.0.0',
    description: 'Default address bar with search',
    author: 'Window Mirror',
    license: 'MIT',
    main: 'core/address-bar',
    permissions: { network: false, filesystem: false, clipboard: false, notifications: false, geolocation: false, camera: false, microphone: false, custom: [] },
    dependencies: [],
    optionalDependencies: [],
    overrides: [{ target: 'ui.address-bar', priority: 0, component: 'AddressBar' }]
  },
  
  'core.sidebar': {
    id: 'core.sidebar',
    name: 'Sidebar',
    version: '1.0.0',
    description: 'Vertical sidebar with panels',
    author: 'Window Mirror',
    license: 'MIT',
    main: 'core/sidebar',
    permissions: { network: false, filesystem: false, clipboard: false, notifications: false, geolocation: false, camera: false, microphone: false, custom: [] },
    dependencies: [],
    optionalDependencies: [],
    overrides: [{ target: 'ui.sidebar', priority: 0, component: 'Sidebar' }]
  },
  
  'core.command-palette': {
    id: 'core.command-palette',
    name: 'Command Palette',
    version: '1.0.0',
    description: 'Fuzzy search command palette',
    author: 'Window Mirror',
    license: 'MIT',
    main: 'core/command-palette',
    permissions: { network: false, filesystem: false, clipboard: false, notifications: false, geolocation: false, camera: false, microphone: false, custom: [] },
    dependencies: [],
    optionalDependencies: [],
    overrides: [{ target: 'ui.command-palette', priority: 0, component: 'CommandPalette' }]
  },
  
  // Navigation
  'core.navigation': {
    id: 'core.navigation',
    name: 'Navigation Engine',
    version: '1.0.0',
    description: 'Handles all navigation logic',
    author: 'Window Mirror',
    license: 'MIT',
    main: 'core/navigation',
    permissions: { network: true, filesystem: false, clipboard: false, notifications: false, geolocation: false, camera: false, microphone: false, custom: [] },
    dependencies: [],
    optionalDependencies: [],
    overrides: [{ target: 'behavior.navigation', priority: 0, component: 'NavigationEngine' }]
  },
  
  'core.tab-management': {
    id: 'core.tab-management',
    name: 'Tab Management',
    version: '1.0.0',
    description: 'Tab lifecycle and state management',
    author: 'Window Mirror',
    license: 'MIT',
    main: 'core/tab-management',
    permissions: { network: false, filesystem: false, clipboard: false, notifications: false, geolocation: false, camera: false, microphone: false, custom: [] },
    dependencies: [],
    optionalDependencies: [],
    overrides: [{ target: 'behavior.tab-management', priority: 0, component: 'TabManager' }]
  },
  
  // Network
  'core.network-hooks': {
    id: 'core.network-hooks',
    name: 'Network Request Hooks',
    version: '1.0.0',
    description: 'Request/response interception',
    author: 'Window Mirror',
    license: 'MIT',
    main: 'core/network-hooks',
    permissions: { network: true, filesystem: false, clipboard: false, notifications: false, geolocation: false, camera: false, microphone: false, custom: [] },
    dependencies: [],
    optionalDependencies: [],
    overrides: [{ target: 'network.request-hooks', priority: 0, component: 'NetworkHooks' }]
  },
  
  // DevTools
  'core.devtools.elements': {
    id: 'core.devtools.elements',
    name: 'Elements Panel',
    version: '1.0.0',
    description: 'DOM inspector and editor',
    author: 'Window Mirror',
    license: 'MIT',
    main: 'devtools/elements',
    permissions: { network: false, filesystem: false, clipboard: true, notifications: false, geolocation: false, camera: false, microphone: false, custom: [] },
    dependencies: [],
    optionalDependencies: [],
    overrides: [{ target: 'devtools.elements', priority: 0, component: 'ElementsPanel' }]
  },
  
  'core.devtools.console': {
    id: 'core.devtools.console',
    name: 'Console Panel',
    version: '1.0.0',
    description: 'JavaScript console with REPL',
    author: 'Window Mirror',
    license: 'MIT',
    main: 'devtools/console',
    permissions: { network: false, filesystem: false, clipboard: true, notifications: false, geolocation: false, camera: false, microphone: false, custom: [] },
    dependencies: [],
    optionalDependencies: [],
    overrides: [{ target: 'devtools.console', priority: 0, component: 'ConsolePanel' }]
  },
  
  'core.devtools.network': {
    id: 'core.devtools.network',
    name: 'Network Panel',
    version: '1.0.0',
    description: 'Network request inspector with timeline',
    author: 'Window Mirror',
    license: 'MIT',
    main: 'devtools/network',
    permissions: { network: true, filesystem: false, clipboard: true, notifications: false, geolocation: false, camera: false, microphone: false, custom: [] },
    dependencies: [],
    optionalDependencies: [],
    overrides: [{ target: 'devtools.network', priority: 0, component: 'NetworkPanel' }]
  },
  
  'core.devtools.timeline': {
    id: 'core.devtools.timeline',
    name: 'Timeline Panel',
    version: '1.0.0',
    description: 'Unified event timeline (network, DOM, console, storage)',
    author: 'Window Mirror',
    license: 'MIT',
    main: 'devtools/timeline',
    permissions: { network: true, filesystem: false, clipboard: true, notifications: false, geolocation: false, camera: false, microphone: false, custom: [] },
    dependencies: [],
    optionalDependencies: [],
    overrides: [{ target: 'devtools.custom', priority: 0, component: 'TimelinePanel' }]
  },
  
  // Window Mirror specific
  'window-mirror.proxy': {
    id: 'window-mirror.proxy',
    name: 'MITM Proxy',
    version: '1.0.0',
    description: 'Intercepts and logs all HTTP/HTTPS/WebSocket traffic',
    author: 'Window Mirror',
    license: 'MIT',
    main: 'window-mirror/proxy',
    permissions: { network: true, filesystem: true, clipboard: false, notifications: true, geolocation: false, camera: false, microphone: false, custom: ['mitm'] },
    dependencies: [],
    optionalDependencies: [],
    overrides: [{ target: 'network.request-hooks', priority: 100, component: 'MITMProxy' }]
  },
  
  'window-mirror.sast': {
    id: 'window-mirror.sast',
    name: 'Static Analysis (SAST)',
    version: '1.0.0',
    description: 'Real-time security analysis via Tree-sitter',
    author: 'Window Mirror',
    license: 'MIT',
    main: 'window-mirror/sast',
    permissions: { network: false, filesystem: true, clipboard: false, notifications: true, geolocation: false, camera: false, microphone: false, custom: ['sast'] },
    dependencies: [],
    optionalDependencies: [],
    overrides: [{ target: 'devtools.custom', priority: 100, component: 'SASTPanel' }]
  },
  
  'window-mirror.sandbox': {
    id: 'window-mirror.sandbox',
    name: 'WASM Sandbox',
    version: '1.0.0',
    description: 'Isolated execution for untrusted code',
    author: 'Window Mirror',
    license: 'MIT',
    main: 'window-mirror/sandbox',
    permissions: { network: false, filesystem: false, clipboard: false, notifications: false, geolocation: false, camera: false, microphone: false, custom: ['wasm'] },
    dependencies: [],
    optionalDependencies: [],
    overrides: [{ target: 'security.sandbox', priority: 100, component: 'WASMSandbox' }]
  },
  
  'window-mirror.timeline': {
    id: 'window-mirror.timeline',
    name: 'Event Timeline Engine',
    version: '1.0.0',
    description: 'Correlates code ↔ network ↔ DOM ↔ storage',
    author: 'Window Mirror',
    license: 'MIT',
    main: 'window-mirror/timeline',
    permissions: { network: true, filesystem: true, clipboard: false, notifications: false, geolocation: false, camera: false, microphone: false, custom: ['timeline'] },
    dependencies: [],
    optionalDependencies: [],
    overrides: [{ target: 'devtools.custom', priority: 100, component: 'TimelineEngine' }]
  }
};