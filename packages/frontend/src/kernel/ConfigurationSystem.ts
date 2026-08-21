/**
 * Configuration System - Everything is configurable
 * 
 * Supports:
 * - Hierarchical config with inheritance
 * - Multiple profiles (work, personal, pentest, etc.)
 * - Schema validation with UI hints
 * - Hot-reload without restart
 * - Import/export
 * - Per-window/tab overrides
 */

import type { 
  ConfigurationSystem, ConfigSchema, ConfigProfile, 
  ValidationResult, ValidationError, ValidationWarning,
  ConfigWatchHandler, Subscription,
  ConfigUIOptions
} from './BrowserKernel';

export class ConfigurationManager implements ConfigurationSystem {
  private config = new Map<string, any>();
  private schemas = new Map<string, ConfigSchema>();
  private profiles = new Map<string, ConfigProfile>();
  private currentProfile = 'default';
  private watchers = new Map<string, Set<ConfigWatchHandler>>();
  private allWatchers = new Set<ConfigWatchHandler>();
  private storage: StorageEngine;
  
  constructor(storage: StorageEngine) {
    this.storage = storage;
    this.initializeDefaults();
  }
  
  private async initializeDefaults(): Promise<void> {
    // Load from storage
    const saved = await this.storage.get('config:profiles');
    if (saved) {
      for (const [name, profile] of Object.entries(saved)) {
        this.profiles.set(name, profile as ConfigProfile);
      }
    }
    
    const current = await this.storage.get('config:currentProfile');
    if (current) {
      this.currentProfile = current;
    }
    
    // Load profile config
    await this.loadProfile(this.currentProfile);
    
    // Register built-in schemas
    this.registerBuiltinSchemas();
  }
  
  private registerBuiltinSchemas(): void {
    // Core browser settings
    this.registerSchema('browser', {
      type: 'object',
      title: 'Browser',
      properties: {
        startup: {
          type: 'string',
          title: 'On Startup',
          enum: ['new-tab', 'restore-session', 'open-pages'],
          default: 'restore-session',
          ui: { widget: 'select', category: 'general', order: 1 }
        },
        homePage: {
          type: 'url',
          title: 'Home Page',
          default: 'https://example.com',
          ui: { widget: 'input', category: 'general', order: 2 }
        },
        newTabPage: {
          type: 'string',
          title: 'New Tab Page',
          enum: ['default', 'blank', 'custom'],
          default: 'default',
          ui: { widget: 'select', category: 'general', order: 3 }
        },
        customNewTabUrl: {
          type: 'url',
          title: 'Custom New Tab URL',
          default: '',
          ui: { widget: 'input', category: 'general', order: 4, hidden: true }
        }
      }
    });
    
    // Appearance
    this.registerSchema('appearance', {
      type: 'object',
      title: 'Appearance',
      properties: {
        theme: {
          type: 'string',
          title: 'Theme',
          enum: ['system', 'light', 'dark', 'zen', 'custom'],
          default: 'system',
          ui: { widget: 'select', category: 'theme', order: 1 }
        },
        customTheme: {
          type: 'object',
          title: 'Custom Theme',
          properties: {
            name: { type: 'string', default: 'Custom' },
            colors: {
              type: 'object',
              properties: {
                bg: { type: 'color', default: '#0d0d0d' },
                surface: { type: 'color', default: '#141414' },
                elevated: { type: 'color', default: '#1c1c1c' },
                border: { type: 'color', default: '#2a2a2a' },
                accent: { type: 'color', default: '#00d4aa' },
                text: { type: 'color', default: '#e0e0e0' },
                textMuted: { type: 'color', default: '#888888' }
              }
            },
            fonts: {
              type: 'object',
              properties: {
                sans: { type: 'font', default: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif' },
                mono: { type: 'font', default: '"JetBrains Mono", "Fira Code", monospace' }
              }
            }
          },
          ui: { widget: 'json-editor', category: 'theme', order: 2, advanced: true }
        },
        density: {
          type: 'string',
          title: 'UI Density',
          enum: ['compact', 'comfortable', 'spacious'],
          default: 'comfortable',
          ui: { widget: 'select', category: 'layout', order: 1 }
        },
        animations: {
          type: 'boolean',
          title: 'Animations',
          default: true,
          ui: { widget: 'toggle', category: 'layout', order: 2 }
        },
        animationSpeed: {
          type: 'string',
          title: 'Animation Speed',
          enum: ['slow', 'normal', 'fast', 'instant'],
          default: 'normal',
          ui: { widget: 'select', category: 'layout', order: 3 }
        },
        reducedMotion: {
          type: 'boolean',
          title: 'Reduced Motion',
          default: false,
          ui: { widget: 'toggle', category: 'accessibility', order: 1 }
        }
      }
    });
    
    // Editor
    this.registerSchema('editor', {
      type: 'object',
      title: 'Editor',
      properties: {
        fontSize: {
          type: 'number',
          title: 'Font Size',
          minimum: 8,
          maximum: 32,
          default: 14,
          ui: { widget: 'slider', category: 'display', order: 1 }
        },
        fontFamily: {
          type: 'font',
          title: 'Font Family',
          default: '"JetBrains Mono", "Fira Code", monospace',
          ui: { widget: 'font-picker', category: 'display', order: 2 }
        },
        tabSize: {
          type: 'number',
          title: 'Tab Size',
          minimum: 1,
          maximum: 8,
          default: 2,
          ui: { widget: 'slider', category: 'formatting', order: 1 }
        },
        wordWrap: {
          type: 'boolean',
          title: 'Word Wrap',
          default: true,
          ui: { widget: 'toggle', category: 'formatting', order: 2 }
        },
        minimap: {
          type: 'boolean',
          title: 'Minimap',
          default: false,
          ui: { widget: 'toggle', category: 'display', order: 3 }
        },
        lineNumbers: {
          type: 'boolean',
          title: 'Line Numbers',
          default: true,
          ui: { widget: 'toggle', category: 'display', order: 4 }
        },
        formatOnSave: {
          type: 'boolean',
          title: 'Format on Save',
          default: true,
          ui: { widget: 'toggle', category: 'formatting', order: 3 }
        },
        autoSave: {
          type: 'boolean',
          title: 'Auto Save',
          default: true,
          ui: { widget: 'toggle', category: 'behavior', order: 1 }
        },
        lintOnChange: {
          type: 'boolean',
          title: 'Lint on Change',
          default: true,
          ui: { widget: 'toggle', category: 'behavior', order: 2 }
        },
        cursorBlinking: {
          type: 'string',
          title: 'Cursor Blinking',
          enum: ['blink', 'smooth', 'phase', 'expand', 'solid'],
          default: 'smooth',
          ui: { widget: 'select', category: 'display', order: 5 }
        },
        bracketPairColorization: {
          type: 'boolean',
          title: 'Bracket Pair Colors',
          default: true,
          ui: { widget: 'toggle', category: 'display', order: 6 }
        }
      }
    });
    
    // Proxy / Network
    this.registerSchema('network', {
      type: 'object',
      title: 'Network',
      properties: {
        proxy: {
          type: 'object',
          title: 'Proxy',
          properties: {
            mode: {
              type: 'string',
              enum: ['direct', 'system', 'auto', 'pac', 'custom'],
              default: 'direct',
              ui: { widget: 'select', category: 'proxy', order: 1 }
            },
            pacUrl: {
              type: 'url',
              default: '',
              ui: { widget: 'input', category: 'proxy', order: 2 }
            },
            customProxy: {
              type: 'string',
              default: '',
              ui: { widget: 'input', category: 'proxy', order: 3 }
            },
            bypassList: {
              type: 'array',
              items: { type: 'string' },
              default: ['localhost', '127.0.0.1', '::1'],
              ui: { widget: 'code-editor', category: 'proxy', order: 4 }
            }
          }
        },
        mitm: {
          type: 'object',
          title: 'MITM Proxy',
          properties: {
            enabled: { type: 'boolean', default: false },
            port: { type: 'number', minimum: 1, maximum: 65535, default: 8080 },
            interceptHttps: { type: 'boolean', default: true },
            captureBodies: { type: 'boolean', default: true },
            maxBodySize: { type: 'number', default: 10485760 },
            ignoreHosts: {
              type: 'array',
              items: { type: 'string' },
              default: ['localhost', '127.0.0.1'],
              ui: { widget: 'code-editor', category: 'mitm', order: 5 }
            },
            autoStart: { type: 'boolean', default: false }
          }
        },
        dns: {
          type: 'object',
          title: 'DNS',
          properties: {
            useDOH: { type: 'boolean', default: false },
            dohProvider: { type: 'string', default: 'https://dns.google/dns-query' },
            cache: { type: 'boolean', default: true }
          }
        }
      }
    });
    
    // Security
    this.registerSchema('security', {
      type: 'object',
      title: 'Security',
      properties: {
        sandbox: {
          type: 'object',
          title: 'Sandbox',
          properties: {
            type: {
              type: 'string',
              enum: ['wasm', 'vm', 'container', 'process'],
              default: 'wasm',
              ui: { widget: 'select', category: 'sandbox', order: 1 }
            },
            strict: { type: 'boolean', default: true },
            wasmFuelLimit: { type: 'number', default: 10000000 },
            memoryLimitMb: { type: 'number', default: 128 },
            timeoutSeconds: { type: 'number', default: 30 }
          }
        },
        certificates: {
          type: 'object',
          title: 'Certificates',
          properties: {
            verifyHostname: { type: 'boolean', default: true },
            allowInvalidCerts: { type: 'boolean', default: false },
            customCAs: {
              type: 'array',
              items: { type: 'string' },
              default: [],
              ui: { widget: 'code-editor', category: 'certificates', order: 1 }
            }
          }
        },
        permissions: {
          type: 'object',
          title: 'Permissions',
          properties: {
            defaultPermission: {
              type: 'string',
              enum: ['ask', 'allow', 'block'],
              default: 'ask'
            },
            autoGrant: {
              type: 'array',
              items: { type: 'string' },
              default: []
            },
            autoBlock: {
              type: 'array',
              items: { type: 'string' },
              default: []
            }
          }
        }
      }
    });
    
    // Window Mirror specific
    this.registerSchema('window-mirror', {
      type: 'object',
      title: 'Window Mirror',
      properties: {
        mode: {
          type: 'string',
          title: 'Default Mode',
          enum: ['zen', 'telemetry', 'focus', 'interrogation'],
          default: 'zen',
          ui: { widget: 'select', category: 'mode', order: 1 }
        },
        sidebar: {
          type: 'object',
          title: 'Sidebar',
          properties: {
            defaultWidth: { type: 'number', minimum: 200, maximum: 600, default: 280 },
            collapsedWidth: { type: 'number', minimum: 48, maximum: 80, default: 56 },
            defaultPanel: { type: 'string', enum: ['files', 'workspaces', 'timeline', 'extensions', 'settings'], default: 'files' },
            autoCollapse: { type: 'boolean', default: false }
          }
        },
        timeline: {
          type: 'object',
          title: 'Timeline',
          properties: {
            maxEvents: { type: 'number', minimum: 100, maximum: 100000, default: 10000 },
            autoScroll: { type: 'boolean', default: true },
            groupByType: { type: 'boolean', default: false },
            showSourceLocation: { type: 'boolean', default: true }
          }
        },
        proxy: {
          type: 'object',
          title: 'Proxy Integration',
          properties: {
            injectScripts: { type: 'boolean', default: true },
            captureWebSocket: { type: 'boolean', default: true },
            captureConsole: { type: 'boolean', default: true },
            captureStorage: { type: 'boolean', default: true },
            captureDOM: { type: 'boolean', default: true },
            correlateSource: { type: 'boolean', default: true }
          }
        },
        sandbox: {
          type: 'object',
          title: 'Sandbox',
          properties: {
            defaultBackend: { type: 'string', enum: ['wasmtime', 'firecracker', 'gvisor', 'native'], default: 'wasmtime' },
            wasmFuelLimit: { type: 'number', default: 10000000 },
            memoryLimitMb: { type: 'number', default: 128 },
            timeoutSeconds: { type: 'number', default: 30 },
            allowNetwork: { type: 'boolean', default: false },
            allowFs: { type: 'boolean', default: false }
          }
        }
      }
    });
    
    // DevTools
    this.registerSchema('devtools', {
      type: 'object',
      title: 'DevTools',
      properties: {
        theme: { type: 'string', enum: ['dark', 'light', 'auto'], default: 'dark' },
        panelOrder: {
          type: 'array',
          items: { type: 'string' },
          default: ['elements', 'console', 'sources', 'network', 'timeline', 'performance', 'memory', 'application', 'security']
        },
        shortcuts: {
          type: 'object',
          title: 'Keyboard Shortcuts',
          properties: {
            openDevTools: { type: 'keybinding', default: 'F12' },
            openCommandPalette: { type: 'keybinding', default: 'Ctrl+Shift+P' },
            toggleSidebar: { type: 'keybinding', default: 'Ctrl+B' },
            switchMode: { type: 'keybinding', default: 'Ctrl+\\' },
            newTab: { type: 'keybinding', default: 'Ctrl+T' },
            closeTab: { type: 'keybinding', default: 'Ctrl+W' },
            reopenTab: { type: 'keybinding', default: 'Ctrl+Shift+T' },
            focusAddressBar: { type: 'keybinding', default: 'Ctrl+L' },
            findInPage: { type: 'keybinding', default: 'Ctrl+F' },
            zoomIn: { type: 'keybinding', default: 'Ctrl+=' },
            zoomOut: { type: 'keybinding', default: 'Ctrl+-' },
            zoomReset: { type: 'keybinding', default: 'Ctrl+0' }
          }
        }
      }
    });
    
    // Advanced
    this.registerSchema('advanced', {
      type: 'object',
      title: 'Advanced',
      properties: {
        experimental: {
          type: 'object',
          title: 'Experimental Features',
          properties: {
            webgpu: { type: 'boolean', default: false },
            wasmThreads: { type: 'boolean', default: false },
            wasmSIMD: { type: 'boolean', default: false },
            webTransport: { type: 'boolean', default: false },
            webNN: { type: 'boolean', default: false }
          }
        },
        debug: {
          type: 'object',
          title: 'Debug',
          properties: {
            enabled: { type: 'boolean', default: false },
            logLevel: { type: 'string', enum: ['trace', 'debug', 'info', 'warn', 'error'], default: 'info' },
            logToFile: { type: 'boolean', default: false },
            logFile: { type: 'file', default: '' },
            enableInspector: { type: 'boolean', default: true },
            enableRemoteDebugging: { type: 'boolean', default: false },
            remoteDebuggingPort: { type: 'number', default: 9222 }
          }
        }
      }
    });
  }
  
  // =========================================================================
  // ConfigurationSystem implementation
  // =========================================================================
  
  get<T>(path: string): T | undefined {
    const keys = path.split('.');
    let current: any = this.config;
    
    for (const key of keys) {
      if (current === undefined || current === null) return undefined;
      current = current[key];
    }
    
    return current as T;
  }
  
  async set<T>(path: string, value: T): Promise<void> {
    const keys = path.split('.');
    const schema = this.getSchemaForPath(path);
    
    // Validate if schema exists
    if (schema) {
      const result = this.validateValue(path, value, schema);
      if (!result.valid) {
        throw new Error(`Validation failed: ${result.errors.map(e => e.message).join(', ')}`);
      }
    }
    
    // Get old value
    const oldValue = this.get(path);
    
    // Set new value
    let current: any = this.config;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i]!;
      if (!current[k]) current[k] = {};
      current = current[k];
    }
    current[keys[keys.length - 1]!] = value;
    
    // Persist
    await this.persist();
    
    // Notify watchers
    this.notifyWatchers(path, oldValue, value);
  }
  
  has(path: string): boolean {
    return this.get(path) !== undefined;
  }
  
  async delete(path: string): Promise<void> {
    const keys = path.split('.');
    let current: any = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i]!;
      if (!current[k]) return;
      current = current[k];
    }
    
    const lastKey = keys[keys.length - 1]!;
    const oldValue = current[lastKey];
    delete current[lastKey];
    
    await this.persist();
    this.notifyWatchers(path, oldValue, undefined);
  }
  
  registerSchema(path: string, schema: ConfigSchema): void {
    this.schemas.set(path, schema);
  }
  
  getSchema(path: string): ConfigSchema | undefined {
    return this.schemas.get(path);
  }
  
  private getSchemaForPath(path: string): ConfigSchema | undefined {
    // Find most specific schema
    const parts = path.split('.');
    for (let i = parts.length; i > 0; i--) {
      const schemaPath = parts.slice(0, i).join('.');
      if (this.schemas.has(schemaPath)) {
        const schema = this.schemas.get(schemaPath)!;
        // Navigate to the specific property
        const remaining = parts.slice(i);
        return this.getNestedSchema(schema, remaining);
      }
    }
    return undefined;
  }
  
  private getNestedSchema(schema: ConfigSchema, path: string[]): ConfigSchema | undefined {
    if (path.length === 0) return schema;
    const head = path[0]!;
    if (schema.properties && schema.properties[head]) {
      return this.getNestedSchema(schema.properties[head]!, path.slice(1));
    }
    if (schema.items && head === '*') {
      return this.getNestedSchema(schema.items, path.slice(1));
    }
    return undefined;
  }
  
  validate(path: string, value: any): ValidationResult {
    const schema = this.getSchemaForPath(path);
    if (!schema) {
      return { path, valid: true, errors: [], warnings: [] };
    }
    return this.validateValue(path, value, schema);
  }
  
  validateAll(): ValidationResult[] {
    const results: ValidationResult[] = [];
    for (const [path, schema] of this.schemas) {
      const value = this.get(path);
      if (value !== undefined) {
        results.push(this.validateValue(path, value, schema));
      }
    }
    return results;
  }
  
  private validateValue(path: string, value: any, schema: ConfigSchema): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    
    // Type validation
    if (!this.checkType(value, schema.type)) {
      errors.push({
        path,
        message: `Expected ${schema.type}, got ${typeof value}`,
        code: 'TYPE_MISMATCH',
        value
      });
    }
    
    // Enum validation
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push({
        path,
        message: `Value must be one of: ${schema.enum.join(', ')}`,
        code: 'INVALID_ENUM',
        value
      });
    }
    
    // Range validation
    if (schema.type === 'number') {
      if (schema.minimum !== undefined && value < schema.minimum) {
        errors.push({
          path,
          message: `Value must be >= ${schema.minimum}`,
          code: 'BELOW_MINIMUM',
          value
        });
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        errors.push({
          path,
          message: `Value must be <= ${schema.maximum}`,
          code: 'ABOVE_MAXIMUM',
          value
        });
      }
    }
    
    // Pattern validation
    if (schema.pattern && typeof value === 'string') {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(value)) {
        errors.push({
          path,
          message: `Value does not match pattern: ${schema.pattern}`,
          code: 'PATTERN_MISMATCH',
          value
        });
      }
    }
    
    // Object validation
    if (schema.type === 'object' && schema.properties) {
      for (const [prop, propSchema] of Object.entries(schema.properties)) {
        if (schema.required?.includes(prop) && !(prop in value)) {
          errors.push({
            path: `${path}.${prop}`,
            message: `Required property missing`,
            code: 'MISSING_REQUIRED',
            value: undefined
          });
        }
        if (prop in value) {
          const propResult = this.validateValue(`${path}.${prop}`, value[prop], propSchema);
          errors.push(...propResult.errors);
          warnings.push(...propResult.warnings);
        }
      }
    }
    
    // Array validation
    if (schema.type === 'array' && schema.items) {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const itemResult = this.validateValue(`${path}[${i}]`, value[i], schema.items);
          errors.push(...itemResult.errors);
          warnings.push(...itemResult.warnings);
        }
      }
    }
    
    return {
      path,
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  private checkType(value: any, type: string): boolean {
    switch (type) {
      case 'string': return typeof value === 'string';
      case 'number': return typeof value === 'number' && !isNaN(value);
      case 'boolean': return typeof value === 'boolean';
      case 'array': return Array.isArray(value);
      case 'object': return value !== null && typeof value === 'object' && !Array.isArray(value);
      case 'color': return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
      case 'font': return typeof value === 'string';
      case 'keybinding': return typeof value === 'string';
      case 'url': return typeof value === 'string' && (value === '' || this.isValidUrl(value));
      case 'file': case 'directory': return typeof value === 'string';
      default: return true; // unknown type, allow
    }
  }
  
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
  
  // =========================================================================
  // Profiles
  // =========================================================================
  
  async createProfile(name: string, base?: string): Promise<ConfigProfile> {
    if (this.profiles.has(name)) {
      throw new Error(`Profile already exists: ${name}`);
    }
    
    let baseConfig: Record<string, any> = {};
    if (base) {
      const baseProfile = this.profiles.get(base);
      if (baseProfile) baseConfig = { ...baseProfile.config };
    } else {
      baseConfig = { ...this.config };
    }
    
    const profile: ConfigProfile = {
      name,
      ...(base !== undefined ? { base } : {}),
      config: baseConfig,
      created: Date.now(),
      modified: Date.now(),
      description: `Profile based on ${base || 'current config'}`
    };
    
    this.profiles.set(name, profile);
    await this.saveProfiles();
    
    return profile;
  }
  
  async switchProfile(name: string): Promise<void> {
    const profile = this.profiles.get(name);
    if (!profile) throw new Error(`Profile not found: ${name}`);
    
    // Merge with base if exists
    let config = { ...profile.config };
    if (profile.base) {
      const baseProfile = this.profiles.get(profile.base);
      if (baseProfile) {
        config = { ...baseProfile.config, ...config };
      }
    }
    
    this.config.clear();
    for (const [key, value] of Object.entries(config)) {
      this.config.set(key, value);
    }
    
    this.currentProfile = name;
    await this.storage.set('config:currentProfile', name);
    await this.persist();
    
    // Notify all watchers
    this.allWatchers.forEach(w => w('*', undefined, this.config));
  }
  
  async deleteProfile(name: string): Promise<void> {
    if (name === 'default') throw new Error('Cannot delete default profile');
    if (name === this.currentProfile) throw new Error('Cannot delete active profile');
    
    this.profiles.delete(name);
    await this.saveProfiles();
  }
  
  listProfiles(): ConfigProfile[] {
    return Array.from(this.profiles.values());
  }
  
  getCurrentProfile(): ConfigProfile {
    return this.profiles.get(this.currentProfile)!;
  }
  
  // =========================================================================
  // Import/Export
  // =========================================================================
  
  async export(): Promise<string> {
    const data = {
      version: 1,
      timestamp: Date.now(),
      profile: this.currentProfile,
      profiles: Object.fromEntries(this.profiles),
      config: Object.fromEntries(this.config),
      schemas: Object.fromEntries(this.schemas)
    };
    return JSON.stringify(data, null, 2);
  }
  
  async import(data: string, merge = false): Promise<void> {
    const parsed = JSON.parse(data);
    
    if (!merge) {
      this.config.clear();
    }
    
    if (parsed.config) {
      for (const [key, value] of Object.entries(parsed.config)) {
        this.config.set(key, value);
      }
    }
    
    if (parsed.profiles) {
      for (const [name, profile] of Object.entries(parsed.profiles)) {
        this.profiles.set(name, profile as ConfigProfile);
      }
    }
    
    if (parsed.currentProfile) {
      this.currentProfile = parsed.currentProfile;
    }
    
    await this.persist();
    await this.saveProfiles();
    
    this.allWatchers.forEach(w => w('*', undefined, this.config));
  }
  
  // =========================================================================
  // Watch
  // =========================================================================
  
  watch(path: string, handler: ConfigWatchHandler): Subscription {
    if (!this.watchers.has(path)) {
      this.watchers.set(path, new Set());
    }
    this.watchers.get(path)!.add(handler);
    
    return {
      unsubscribe: () => {
        this.watchers.get(path)?.delete(handler);
      }
    };
  }
  
  watchAll(handler: ConfigWatchHandler): Subscription {
    this.allWatchers.add(handler);
    
    return {
      unsubscribe: () => {
        this.allWatchers.delete(handler);
      }
    };
  }
  
  private notifyWatchers(path: string, oldValue: any, newValue: any): void {
    // Specific path watchers
    this.watchers.get(path)?.forEach(h => h(path, oldValue, newValue));
    
    // Parent path watchers
    const parts = path.split('.');
    for (let i = parts.length - 1; i > 0; i--) {
      const parentPath = parts.slice(0, i).join('.');
      this.watchers.get(parentPath)?.forEach(h => h(parentPath, oldValue, newValue));
    }
    
    // All watchers
    this.allWatchers.forEach(h => h(path, oldValue, newValue));
  }
  
  // =========================================================================
  // Persistence
  // =========================================================================
  
  private async persist(): Promise<void> {
    const configObj = Object.fromEntries(this.config);
    await this.storage.set(`config:profile:${this.currentProfile}`, configObj);
  }
  
  private async loadProfile(name: string): Promise<void> {
    const saved = await this.storage.get(`config:profile:${name}`);
    if (saved) {
      this.config.clear();
      for (const [key, value] of Object.entries(saved)) {
        this.config.set(key, value);
      }
    }
  }
  
  private async saveProfiles(): Promise<void> {
    await this.storage.set('config:profiles', Object.fromEntries(this.profiles));
  }
}

// ============================================================================
// Storage Engine Implementation (IndexedDB)
// ============================================================================

export interface StorageEngine {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
  namespace(ns: string): StorageEngine;
  transaction<T>(fn: (tx: StorageTransaction) => Promise<T>): Promise<T>;
}

export interface StorageTransaction {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
  delete(key: string): Promise<void>;
}

export class IndexedDBStorage implements StorageEngine {
  private db: IDBDatabase | null = null;
  private dbName = 'window-mirror';
  private storeName = 'config';
  
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
    });
  }
  
  async get(key: string): Promise<any> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  
  async set(key: string, value: any): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  async delete(key: string): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  async list(prefix: string): Promise<string[]> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.getAllKeys();
      request.onsuccess = () => {
        const keys = request.result as string[];
        resolve(keys.filter(k => k.startsWith(prefix)));
      };
      request.onerror = () => reject(request.error);
    });
  }
  
  namespace(ns: string): StorageEngine {
    const parent = this;
    return {
      get(key: string) { return parent.get(`${ns}:${key}`); },
      set(key: string, value: any) { return parent.set(`${ns}:${key}`, value); },
      delete(key: string) { return parent.delete(`${ns}:${key}`); },
      list(prefix: string) { return parent.list(`${ns}:${prefix}`); },
      namespace(subNs: string) { return parent.namespace(`${ns}:${subNs}`); },
      transaction(fn) { return parent.transaction(fn); }
    };
  }
  
  async transaction<T>(fn: (tx: StorageTransaction) => Promise<T>): Promise<T> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      
      const transaction: StorageTransaction = {
        get(key: string) {
          return new Promise((res, rej) => {
            const req = store.get(key);
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
          });
        },
        set(key: string, value: any) {
          return new Promise((res, rej) => {
            const req = store.put(value, key);
            req.onsuccess = () => res();
            req.onerror = () => rej(req.error);
          });
        },
        delete(key: string) {
          return new Promise((res, rej) => {
            const req = store.delete(key);
            req.onsuccess = () => res();
            req.onerror = () => rej(req.error);
          });
        }
      };
      
      fn(transaction).then(resolve).catch(reject);
    });
  }
}

// ============================================================================
// Config UI Generator
// ============================================================================

export class ConfigUIRenderer {
  private config: ConfigurationManager;
  private container: HTMLElement;
  
  constructor(config: ConfigurationManager, container: HTMLElement) {
    this.config = config;
    this.container = container;
  }
  
  render(): void {
    this.container.innerHTML = '';
    
    // Group schemas by category
    const categories = new Map<string, ConfigSchema[]>();
    
    for (const [path, schema] of this.config['schemas']) {
      const category = (schema.ui?.category || 'other') as string;
      if (!categories.has(category)) categories.set(category, []);
      categories.get(category)!.push({ ...schema, _path: path } as any);
    }
    
    // Render each category
    for (const [category, schemas] of categories) {
      const section = document.createElement('section');
      section.className = 'config-section';
      section.innerHTML = `<h2>${category}</h2>`;
      
      for (const schema of schemas) {
        this.renderSchema(section, schema, category);
      }
      
      this.container.appendChild(section);
    }
  }
  
  private renderSchema(container: HTMLElement, schema: ConfigSchema, path: string | null): void {
    const value = path ? this.config.get(path) : undefined;
    const ui = schema.ui || {};
    const widget = ui.widget || this.getDefaultWidget(schema);
    
    const wrapper = document.createElement('div');
    wrapper.className = 'config-item';
    if (path) wrapper.dataset.path = path;
    
    const label = document.createElement('label');
    label.textContent = schema.title ?? 'Setting';
    if (schema.description) label.title = schema.description;
    wrapper.appendChild(label);
    
    const input = this.createWidget(widget, schema, value, path ?? undefined);
    wrapper.appendChild(input);
    
    if (schema.description && !ui.helpText) {
      const help = document.createElement('small');
      help.className = 'config-help';
      help.textContent = schema.description;
      wrapper.appendChild(help);
    }
    
    container.appendChild(wrapper);
  }
  
  private getDefaultWidget(schema: ConfigSchema): string {
    switch (schema.type) {
      case 'boolean': return 'toggle';
      case 'number': return schema.enum ? 'select' : 'slider';
      case 'string': return schema.enum ? 'select' : (schema.format === 'url' ? 'input' : 'input');
      case 'color': return 'color-picker';
      case 'font': return 'font-picker';
      case 'keybinding': return 'keybinding-editor';
      case 'array': return 'code-editor';
      case 'object': return 'json-editor';
      default: return 'input';
    }
  }
  
  private createWidget(widget: string, schema: ConfigSchema, value: any, path?: string): HTMLElement {
    switch (widget) {
      case 'toggle': return this.createToggle(value, path ?? '');
      case 'select': return this.createSelect(schema, value, path ?? '');
      case 'slider': return this.createSlider(schema, value, path ?? '');
      case 'input': return this.createInput(schema, value, path ?? '');
      case 'color-picker': return this.createColorPicker(value, path ?? '');
      case 'font-picker': return this.createFontPicker(value, path ?? '');
      case 'keybinding-editor': return this.createKeybindingEditor(value, path ?? '');
      case 'code-editor': return this.createCodeEditor(schema, value, path ?? '');
      case 'json-editor': return this.createJsonEditor(schema, value, path ?? '');
      case 'file-picker': return this.createFilePicker(value, path ?? '');
      default: return this.createInput(schema, value, path ?? '');
    }
  }
  
  private createToggle(value: any, path: string): HTMLElement {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!value;
    input.addEventListener('change', () => this.config.set(path, input.checked));
    return input;
  }
  
  private createSelect(schema: ConfigSchema, value: any, path: string): HTMLElement {
    const select = document.createElement('select');
    for (const option of schema.enum || []) {
      const opt = document.createElement('option');
      opt.value = option;
      opt.textContent = option;
      opt.selected = option === value;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => this.config.set(path, select.value));
    return select;
  }
  
  private createSlider(schema: ConfigSchema, value: any, path: string): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.gap = '8px';
    
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(schema.minimum || 0);
    input.max = String(schema.maximum || 100);
    input.value = String(value);
    input.style.flex = '1';
    input.addEventListener('input', () => this.config.set(path, Number(input.value)));
    
    const display = document.createElement('span');
    display.style.minWidth = '40px';
    display.textContent = String(value);
    input.addEventListener('input', () => display.textContent = String(input.value));
    
    wrapper.appendChild(input);
    wrapper.appendChild(display);
    return wrapper;
  }
  
  private createInput(schema: ConfigSchema, value: any, path: string): HTMLElement {
    const input = document.createElement('input');
    input.type = schema.format === 'url' ? 'url' : 'text';
    input.value = value || '';
    input.placeholder = schema.ui?.placeholder || '';
    input.addEventListener('blur', () => this.config.set(path, input.value));
    return input;
  }
  
  private createColorPicker(value: any, path: string): HTMLElement {
    const input = document.createElement('input');
    input.type = 'color';
    input.value = value || '#000000';
    input.addEventListener('change', () => this.config.set(path, input.value));
    return input;
  }
  
  private createFontPicker(value: any, path: string): HTMLElement {
    const select = document.createElement('select');
    const fonts = [
      'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto',
      'Helvetica Neue', 'Arial', 'sans-serif',
      '"JetBrains Mono"', '"Fira Code"', '"Source Code Pro"', '"IBM Plex Mono"',
      '"SF Mono"', '"Monaco"', '"Menlo"', '"Consolas"', 'monospace'
    ];
    for (const font of fonts) {
      const opt = document.createElement('option');
      opt.value = font;
      opt.textContent = font.replace(/"/g, '');
      opt.selected = font === value;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => this.config.set(path, select.value));
    return select;
  }
  
  private createKeybindingEditor(value: any, path: string): HTMLElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value || '';
    input.placeholder = 'Press keys...';
    input.addEventListener('keydown', (e) => {
      e.preventDefault();
      const keys = [];
      if (e.ctrlKey || e.metaKey) keys.push('Ctrl');
      if (e.shiftKey) keys.push('Shift');
      if (e.altKey) keys.push('Alt');
      if (e.key !== 'Control' && e.key !== 'Shift' && e.key !== 'Alt' && e.key !== 'Meta') {
        keys.push(e.key === ' ' ? 'Space' : e.key.toUpperCase());
      }
      input.value = keys.join('+');
      this.config.set(path, input.value);
    });
    return input;
  }
  
  private createCodeEditor(schema: ConfigSchema, value: any, path: string): HTMLElement {
    const textarea = document.createElement('textarea');
    textarea.value = JSON.stringify(value, null, 2);
    textarea.style.fontFamily = 'monospace';
    textarea.style.minHeight = '100px';
    textarea.style.width = '100%';
    textarea.addEventListener('blur', () => {
      try {
        this.config.set(path, JSON.parse(textarea.value));
      } catch {
        // Invalid JSON, ignore
      }
    });
    return textarea;
  }
  
  private createJsonEditor(schema: ConfigSchema, value: any, path: string): HTMLElement {
    return this.createCodeEditor(schema, value, path);
  }
  
  private createFilePicker(value: any, path: string): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.gap = '8px';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value || '';
    input.style.flex = '1';
    input.readOnly = true;
    
    const button = document.createElement('button');
    button.textContent = 'Browse...';
    button.addEventListener('click', () => {
      // In real implementation, open file picker
    });
    
    wrapper.appendChild(input);
    wrapper.appendChild(button);
    return wrapper;
  }
}