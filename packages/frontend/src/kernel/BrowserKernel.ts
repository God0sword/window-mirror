/**
 * Window Mirror - Core Browser Kernel
 * 
 * A fully customizable browser platform where EVERYTHING is a plugin.
 * The kernel provides only primitives - everything else is user-replaceable.
 */

// ============================================================================
// PRIMITIVES - The unchangeable foundation
// ============================================================================

export interface KernelPrimitives {
  // Storage
  storage: StorageEngine;
  
  // Messaging
  bus: MessageBus;
  
  // Process management
  processes: ProcessManager;
  
  // Network
  network: NetworkStack;
  
  // UI
  renderer: RendererEngine;
  
  // Security
  sandbox: SandboxEngine;
}

// ============================================================================
// STORAGE ENGINE - Abstract, swappable
// ============================================================================

export interface StorageEngine {
  // Key-value
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
  
  // Namespaces
  namespace(ns: string): StorageEngine;
  
  // Transactions
  transaction<T>(fn: (tx: StorageTransaction) => Promise<T>): Promise<T>;
}

export interface StorageTransaction {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
  delete(key: string): Promise<void>;
}

// ============================================================================
// MESSAGE BUS - All communication goes through this
// ============================================================================

export interface MessageBus {
  // Pub/sub
  subscribe(topic: string, handler: MessageHandler): Subscription;
  publish(topic: string, payload: any): Promise<void>;
  
  // Request/response
  request<T>(target: string, action: string, payload: any): Promise<T>;
  respond(action: string, handler: RequestHandler): void;
  
  // Streams
  stream(topic: string): AsyncIterable<any>;
}

export type MessageHandler = (payload: any, meta: MessageMeta) => void | Promise<void>;
export type RequestHandler = (payload: any, meta: MessageMeta) => any | Promise<any>;

export interface MessageMeta {
  source: string;
  timestamp: number;
  correlationId?: string;
  replyTo?: string;
}

export interface Subscription {
  unsubscribe(): void;
}

// ============================================================================
// PROCESS MANAGER - Isolated execution contexts
// ============================================================================

export interface ProcessManager {
  spawn(config: ProcessConfig): Promise<Process>;
  kill(pid: string): Promise<void>;
  list(): Promise<ProcessInfo[]>;
  get(pid: string): Promise<Process | null>;
}

export interface ProcessConfig {
  id?: string;
  type: 'renderer' | 'extension' | 'worker' | 'utility';
  entryPoint: string;
  permissions: PermissionSet;
  resources: ResourceLimits;
  env?: Record<string, string>;
}

export interface PermissionSet {
  network: boolean;
  filesystem: boolean;
  clipboard: boolean;
  notifications: boolean;
  geolocation: boolean;
  camera: boolean;
  microphone: boolean;
  custom: string[];
}

export interface ResourceLimits {
  cpu: number; // percentage
  memory: number; // MB
  disk: number; // MB
}

export interface Process {
  pid: string;
  config: ProcessConfig;
  send(message: any): Promise<void>;
  onMessage(handler: (msg: any) => void): void;
  onExit(handler: (code: number) => void): void;
  kill(): Promise<void>;
}

export interface ProcessInfo {
  pid: string;
  type: string;
  status: 'running' | 'stopped' | 'crashed';
  memory: number;
  cpu: number;
  startTime: number;
}

// ============================================================================
// NETWORK STACK - Fully interceptable
// ============================================================================

export interface NetworkStack {
  // Request lifecycle hooks
  onBeforeRequest(hook: RequestHook): HookHandle;
  onBeforeSendHeaders(hook: HeaderHook): HookHandle;
  onHeadersReceived(hook: ResponseHook): HookHandle;
  onBeforeRedirect(hook: RedirectHook): HookHandle;
  onResponseStarted(hook: ResponseHook): HookHandle;
  onCompleted(hook: CompletionHook): HookHandle;
  onErrorOccurred(hook: ErrorHook): HookHandle;
  
  // Direct requests
  fetch(request: FetchRequest): Promise<FetchResponse>;
  
  // WebSocket
  connectWebSocket(url: string, protocols?: string[]): WebSocketConnection;
}

export type RequestHook = (details: RequestDetails) => RequestAction | Promise<RequestAction>;
export type HeaderHook = (details: HeaderDetails) => HeaderAction | Promise<HeaderAction>;
export type ResponseHook = (details: ResponseDetails) => ResponseAction | Promise<ResponseAction>;
export type RedirectHook = (details: RedirectDetails) => RedirectAction | Promise<RedirectAction>;
export type CompletionHook = (details: CompletionDetails) => void | Promise<void>;
export type ErrorHook = (details: ErrorDetails) => void | Promise<void>;

export interface RequestDetails {
  requestId: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: ArrayBuffer;
  initiator: string;
  tabId?: string;
  frameId?: string;
  resourceType: ResourceType;
  timestamp: number;
}

export interface HeaderDetails extends RequestDetails {
  requestHeaders: Record<string, string>;
}

export interface ResponseDetails extends RequestDetails {
  statusCode: number;
  statusLine: string;
  responseHeaders: Record<string, string>;
  fromCache: boolean;
}

export interface RedirectDetails extends RequestDetails {
  redirectUrl: string;
  statusCode: number;
}

export interface CompletionDetails extends RequestDetails {
  statusCode: number;
  responseHeaders: Record<string, string>;
  bytesReceived: number;
  timing: TimingInfo;
}

export interface ErrorDetails extends RequestDetails {
  error: string;
}

export interface RequestAction {
  cancel?: boolean;
  redirectUrl?: string;
  upgradeToSecure?: boolean;
  requestHeaders?: Record<string, string>;
}

export interface HeaderAction {
  cancel?: boolean;
  requestHeaders?: Record<string, string>;
}

export interface ResponseAction {
  cancel?: boolean;
  responseHeaders?: Record<string, string>;
}

export interface RedirectAction {
  cancel?: boolean;
  redirectUrl?: string;
}

export type ResourceType = 
  | 'main_frame' | 'sub_frame' | 'stylesheet' | 'script' 
  | 'image' | 'font' | 'object' | 'xmlhttprequest' | 'fetch'
  | 'websocket' | 'manifest' | 'signed_exchange' | 'ping'
  | 'csp_report' | 'preflight' | 'other';

export interface TimingInfo {
  dnsStart: number;
  dnsEnd: number;
  connectStart: number;
  connectEnd: number;
  sslStart: number;
  sslEnd: number;
  sendStart: number;
  sendEnd: number;
  pushStart: number;
  pushEnd: number;
  receiveHeadersStart: number;
  receiveHeadersEnd: number;
}

export interface FetchRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: ArrayBuffer | string;
  credentials?: 'omit' | 'same-origin' | 'include';
  cache?: 'default' | 'no-store' | 'reload' | 'no-cache' | 'force-cache' | 'only-if-cached';
  redirect?: 'follow' | 'error' | 'manual';
  integrity?: string;
  keepalive?: boolean;
  signal?: AbortSignal;
  priority?: 'high' | 'low' | 'auto';
}

export interface FetchResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: ReadableStream;
  url: string;
  redirected: boolean;
  type: 'basic' | 'cors' | 'default' | 'error' | 'opaque' | 'opaqueredirect';
}

export interface WebSocketConnection {
  send(data: string | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
  onMessage(handler: (data: string | ArrayBuffer) => void): void;
  onClose(handler: (code: number, reason: string) => void): void;
  onError(handler: (error: Error) => void): void;
}

export interface HookHandle {
  remove(): void;
}

// ============================================================================
// RENDERER ENGINE - Abstract UI layer
// ============================================================================

export interface RendererEngine {
  // Window management
  createWindow(config: WindowConfig): Promise<WindowHandle>;
  getWindow(id: string): WindowHandle | null;
  listWindows(): WindowHandle[];
  
  // Tab management
  createTab(windowId: string, config: TabConfig): Promise<TabHandle>;
  getTab(id: string): TabHandle | null;
  
  // UI primitives
  createElement(tag: string, props: ElementProps): UIElement;
  mount(parent: UIElement, child: UIElement): void;
  unmount(element: UIElement): void;
  
  // Styles
  addStyleSheet(css: string): StyleSheet;
  removeStyleSheet(sheet: StyleSheet): void;
  
  // Events
  onEvent(event: string, handler: EventHandler): Subscription;
}

export interface WindowConfig {
  id?: string;
  title: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
  fullscreen?: boolean;
  maximized?: boolean;
  minimized?: boolean;
  alwaysOnTop?: boolean;
  frame?: 'none' | 'native' | 'custom';
  transparent?: boolean;
  resizable?: boolean;
  closable?: boolean;
  minimizable?: boolean;
  maximizable?: boolean;
  backgroundColor?: string;
}

export interface TabConfig {
  id?: string;
  url?: string;
  active?: boolean;
  pinned?: boolean;
  muted?: boolean;
  discarded?: boolean;
  openerTabId?: string;
}

export interface WindowHandle {
  id: string;
  config: WindowConfig;
  tabs: TabHandle[];
  activeTab: TabHandle | null;
  on(event: WindowEvent, handler: (data: any) => void): Subscription;
  focus(): void;
  close(): Promise<void>;
  minimize(): void;
  maximize(): void;
  restore(): void;
  setBounds(bounds: WindowBounds): void;
  getBounds(): WindowBounds;
  setTitle(title: string): void;
  setFullscreen(fullscreen: boolean): void;
  setAlwaysOnTop(top: boolean): void;
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type WindowEvent = 'focus' | 'blur' | 'close' | 'minimize' | 'maximize' | 'restore' | 'resize' | 'move' | 'tab-created' | 'tab-closed' | 'tab-activated';

export interface TabHandle {
  id: string;
  windowId: string;
  config: TabConfig;
  url: string;
  title: string;
  favicon: string;
  loading: boolean;
  muted: boolean;
  pinned: boolean;
  discarded: boolean;
  on(event: TabEvent, handler: (data: any) => void): Subscription;
  navigate(url: string): Promise<void>;
  reload(bypassCache?: boolean): Promise<void>;
  goBack(): Promise<void>;
  goForward(): Promise<void>;
  canGoBack(): boolean;
  canGoForward(): boolean;
  executeScript(script: string): Promise<any>;
  insertCSS(css: string): Promise<void>;
  removeCSS(key: string): Promise<void>;
  captureVisibleArea(): Promise<ArrayBuffer>;
  print(): Promise<void>;
  discard(): void;
  close(): Promise<void>;
  activate(): void;
  mute(muted: boolean): void;
  pin(pinned: boolean): void;
}

export type TabEvent = 'navigate' | 'load-start' | 'load-commit' | 'load-stop' | 'title-change' | 'favicon-change' | 'loading-change' | 'close' | 'crash' | 'mute-change' | 'pin-change' | 'discard';

export interface ElementProps {
  id?: string;
  class?: string;
  style?: Record<string, string>;
  dataset?: Record<string, string>;
  children?: (UIElement | string)[];
  events?: Record<string, EventHandler>;
}

export interface UIElement {
  id: string;
  tag: string;
  props: ElementProps;
  parent: UIElement | null;
  children: UIElement[];
  mount(parent: UIElement): void;
  unmount(): void;
  update(props: Partial<ElementProps>): void;
  querySelector(selector: string): UIElement | null;
  querySelectorAll(selector: string): UIElement[];
  addEventListener(event: string, handler: EventHandler): void;
  removeEventListener(event: string, handler: EventHandler): void;
  focus(): void;
  blur(): void;
}

export interface StyleSheet {
  id: string;
  css: string;
  disabled: boolean;
  update(css: string): void;
  enable(): void;
  disable(): void;
}

export type EventHandler = (event: UIEvent) => void | Promise<void>;

export interface UIEvent {
  type: string;
  target: UIElement;
  currentTarget: UIElement;
  timestamp: number;
  bubbles: boolean;
  cancelable: boolean;
  defaultPrevented: boolean;
  preventDefault(): void;
  stopPropagation(): void;
  stopImmediatePropagation(): void;
}

// ============================================================================
// SANDBOX ENGINE - Security isolation
// ============================================================================

export interface SandboxEngine {
  createSandbox(config: SandboxConfig): Promise<Sandbox>;
  getSandbox(id: string): Sandbox | null;
  listSandboxes(): Sandbox[];
}

export interface SandboxConfig {
  id?: string;
  type: 'wasm' | 'vm' | 'container' | 'process';
  permissions: PermissionSet;
  resources: ResourceLimits;
  network: NetworkPolicy;
  filesystem: FilesystemPolicy;
}

export interface NetworkPolicy {
  allowed: string[]; // domains/IPs
  blocked: string[];
  proxy?: string;
}

export interface FilesystemPolicy {
  allowed: string[]; // paths
  blocked: string[];
  readonly: boolean;
}

export interface Sandbox {
  id: string;
  config: SandboxConfig;
  execute(code: string): Promise<any>;
  evaluate(expression: string): Promise<any>;
  setGlobal(name: string, value: any): void;
  getGlobal(name: string): any;
  terminate(): Promise<void>;
  snapshot(): Promise<SandboxSnapshot>;
  restore(snapshot: SandboxSnapshot): Promise<void>;
}

export interface SandboxSnapshot {
  id: string;
  timestamp: number;
  memory: ArrayBuffer;
  globals: Record<string, any>;
}

// ============================================================================
// PLUGIN SYSTEM - Everything is a plugin
// ============================================================================

export interface PluginSystem {
  // Registry
  register(plugin: Plugin): Promise<void>;
  unregister(id: string): Promise<void>;
  get(id: string): Plugin | null;
  list(): Plugin[];
  
  // Lifecycle
  enable(id: string): Promise<void>;
  disable(id: string): Promise<void>;
  reload(id: string): Promise<void>;
  
  // Dependencies
  resolveDependencies(plugin: Plugin): Promise<Plugin[]>;
  
  // Configuration
  getConfig(id: string): PluginConfig;
  setConfig(id: string, config: PluginConfig): Promise<void>;
  
  // Events
  onPluginEvent(event: PluginEvent, handler: (plugin: Plugin) => void): Subscription;
}

export interface Plugin {
  manifest: PluginManifest;
  instance: PluginInstance;
  enabled: boolean;
  config: PluginConfig;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  homepage?: string;
  repository?: string;
  
  // Entry points
  main: string; // main process
  renderer?: string; // renderer process
  worker?: string; // background worker
  
  // Permissions
  permissions: PermissionSet;
  
  // Dependencies
  dependencies: PluginDependency[];
  optionalDependencies: PluginDependency[];
  
  // UI
  ui?: PluginUI;
  
  // Commands
  commands?: PluginCommand[];
  
  // Settings schema
  settings?: PluginSettingsSchema;
  
  // Override targets (what this plugin can replace)
  overrides?: OverrideTarget[];
}

export interface PluginDependency {
  id: string;
  version: string; // semver range
  optional: boolean;
}

export interface PluginUI {
  // Sidebar panels
  sidebarPanels?: SidebarPanel[];
  
  // Toolbar items
  toolbarItems?: ToolbarItem[];
  
  // Context menus
  contextMenus?: ContextMenu[];
  
  // Command palette entries
  commands?: PluginCommand[];
  
  // Keyboard shortcuts
  shortcuts?: KeyboardShortcut[];
  
  // Themes
  themes?: Theme[];
  
  // Custom elements
  customElements?: CustomElementDefinition[];
}

export interface SidebarPanel {
  id: string;
  title: string;
  icon: string;
  component: string; // path to component
  defaultOpen?: boolean;
  order?: number;
}

export interface ToolbarItem {
  id: string;
  type: 'button' | 'input' | 'select' | 'separator' | 'spacer';
  title: string;
  icon?: string;
  action?: string;
  component?: string;
  order?: number;
}

export interface ContextMenu {
  id: string;
  contexts: ContextType[];
  items: ContextMenuItem[];
}

export type ContextType = 'page' | 'link' | 'image' | 'selection' | 'editable' | 'tab' | 'toolbar' | 'sidebar';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  action: string;
  enabled?: boolean | ((context: any) => boolean);
  visible?: boolean | ((context: any) => boolean);
  separator?: boolean;
  submenu?: ContextMenuItem[];
}

export interface PluginCommand {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  shortcut?: string;
  action: string;
  category?: string;
}

export interface KeyboardShortcut {
  key: string;
  command: string;
  when?: string; // context condition
  description?: string;
}

export interface Theme {
  id: string;
  name: string;
  type: 'light' | 'dark' | 'auto';
  colors: Record<string, string>;
  fonts?: Record<string, string>;
  spacing?: Record<string, string>;
  borderRadius?: Record<string, string>;
  shadows?: Record<string, string>;
  animations?: Record<string, string>;
}

export interface CustomElementDefinition {
  tagName: string;
  component: string;
  observedAttributes?: string[];
}

export interface PluginSettingsSchema {
  type: 'object';
  properties: Record<string, SettingProperty>;
  required?: string[];
}

export interface SettingProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'color' | 'font' | 'keybinding';
  title: string;
  description?: string;
  default?: any;
  enum?: any[];
  minimum?: number;
  maximum?: number;
  pattern?: string;
  format?: string;
}

export interface OverrideTarget {
  target: string; // what to override (e.g., 'tab-bar', 'address-bar', 'new-tab-page')
  priority: number; // higher wins
  component: string;
  condition?: string; // when to apply
}

export interface PluginInstance {
  // Lifecycle
  onLoad?(kernel: KernelPrimitives): Promise<void> | void;
  onEnable?(): Promise<void> | void;
  onDisable?(): Promise<void> | void;
  onUnload?(): Promise<void> | void;
  
  // Config
  onConfigChange?(oldConfig: PluginConfig, newConfig: PluginConfig): Promise<void> | void;
  
  // Messages
  onMessage?(message: any): Promise<void> | void;
  
  // Events
  onEvent?(event: string, data: any): Promise<void> | void;
}

export interface PluginConfig {
  enabled: boolean;
  settings: Record<string, any>;
  // Per-window/tab overrides
  windowOverrides?: Record<string, Record<string, any>>;
  tabOverrides?: Record<string, Record<string, any>>;
}

export type PluginEvent = 'register' | 'unregister' | 'enable' | 'disable' | 'reload' | 'config-change' | 'error';

// ============================================================================
// CONFIGURATION SYSTEM - Everything configurable
// ============================================================================

export interface ConfigurationSystem {
  // Core config
  get<T>(path: string): T | undefined;
  set<T>(path: string, value: T): Promise<void>;
  has(path: string): boolean;
  delete(path: string): Promise<void>;
  
  // Schemas
  registerSchema(path: string, schema: ConfigSchema): void;
  getSchema(path: string): ConfigSchema | undefined;
  
  // Validation
  validate(path: string, value: any): ValidationResult;
  validateAll(): ValidationResult[];
  
  // Profiles
  createProfile(name: string, base?: string): Promise<ConfigProfile>;
  switchProfile(name: string): Promise<void>;
  deleteProfile(name: string): Promise<void>;
  listProfiles(): ConfigProfile[];
  getCurrentProfile(): ConfigProfile;
  
  // Import/Export
  export(): Promise<string>;
  import(data: string, merge?: boolean): Promise<void>;
  
  // Watch
  watch(path: string, handler: ConfigWatchHandler): Subscription;
  watchAll(handler: ConfigWatchHandler): Subscription;
}

export interface ConfigSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'color' | 'font' | 'keybinding' | 'file' | 'directory' | 'url';
  title?: string;
  description?: string;
  default?: any;
  enum?: any[];
  minimum?: number;
  maximum?: number;
  pattern?: string;
  format?: string;
  items?: ConfigSchema; // for arrays
  properties?: Record<string, ConfigSchema>; // for objects
  required?: string[];
  dependencies?: Record<string, string[]>;
  ui?: ConfigUIOptions;
}

export interface ConfigUIOptions {
  widget?: 'input' | 'textarea' | 'select' | 'checkbox' | 'toggle' | 'slider' | 'color-picker' | 'font-picker' | 'keybinding-editor' | 'file-picker' | 'directory-picker' | 'code-editor' | 'json-editor';
  placeholder?: string;
  helpText?: string;
  hidden?: boolean;
  readOnly?: boolean;
  category?: string;
  order?: number;
  group?: string;
  advanced?: boolean;
  experimental?: boolean;
  restartRequired?: boolean;
  reloadRequired?: boolean;
}

export interface ConfigProfile {
  name: string;
  base?: string; // parent profile
  config: Record<string, any>;
  created: number;
  modified: number;
  description?: string;
}

export interface ValidationResult {
  path: string;
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
  code: string;
  value: any;
}

export interface ValidationWarning {
  path: string;
  message: string;
  code: string;
  value: any;
}

export type ConfigWatchHandler = (path: string, oldValue: any, newValue: any) => void;

// ============================================================================
// EXTENSION POINTS - What can be customized
// ============================================================================

export const EXTENSION_POINTS = {
  // UI Components (all replaceable)
  'ui.tab-bar': 'Tab bar component',
  'ui.address-bar': 'Address bar component',
  'ui.sidebar': 'Sidebar component',
  'ui.status-bar': 'Status bar component',
  'ui.toolbar': 'Toolbar component',
  'ui.command-palette': 'Command palette component',
  'ui.new-tab-page': 'New tab page component',
  'ui.error-page': 'Error page component',
  'ui.settings': 'Settings UI component',
  'ui.devtools': 'DevTools component',
  'ui.find-bar': 'Find in page bar',
  'ui.print-preview': 'Print preview',
  'ui.downloads': 'Downloads panel',
  'ui.history': 'History panel',
  'ui.bookmarks': 'Bookmarks panel',
  'ui.extensions': 'Extensions panel',
  
  // Behavior
  'behavior.navigation': 'Navigation logic',
  'behavior.tab-management': 'Tab management logic',
  'behavior.session-restore': 'Session restore logic',
  'behavior.download-handling': 'Download handling',
  'behavior.search-engine': 'Search engine logic',
  'behavior.auto-fill': 'Auto-fill logic',
  'behavior.password-manager': 'Password manager',
  'behavior.translation': 'Page translation',
  'behavior.reader-mode': 'Reader mode',
  'behavior.picture-in-picture': 'PiP logic',
  
  // Network
  'network.request-hooks': 'Request interception',
  'network.cache': 'Cache implementation',
  'network.proxy': 'Proxy resolution',
  'network.dns': 'DNS resolution',
  'network.certificate': 'Certificate handling',
  'network.hsts': 'HSTS handling',
  'network.ocsp': 'OCSP checking',
  
  // Rendering
  'rendering.engine': 'Rendering engine (WebKit, Gecko, etc.)',
  'rendering.font': 'Font rendering',
  'rendering.scroll': 'Scroll behavior',
  'rendering.zoom': 'Zoom behavior',
  'rendering.theme': 'Theme engine',
  'rendering.animation': 'Animation engine',
  
  // Security
  'security.sandbox': 'Sandbox implementation',
  'security.csp': 'CSP enforcement',
  'security.cookies': 'Cookie handling',
  'security.permissions': 'Permission handling',
  'security.mixed-content': 'Mixed content handling',
  'security.referrer': 'Referrer policy',
  'security.feature-policy': 'Feature policy',
  
  // Developer Tools
  'devtools.elements': 'Elements panel',
  'devtools.console': 'Console panel',
  'devtools.sources': 'Sources panel',
  'devtools.network': 'Network panel',
  'devtools.performance': 'Performance panel',
  'devtools.memory': 'Memory panel',
  'devtools.application': 'Application panel',
  'devtools.security': 'Security panel',
  'devtools.lighthouse': 'Lighthouse panel',
  'devtools.custom': 'Custom panels',
  
  // Storage
  'storage.local': 'LocalStorage implementation',
  'storage.session': 'SessionStorage implementation',
  'storage.indexeddb': 'IndexedDB implementation',
  'storage.cache': 'Cache API implementation',
  'storage.cookies': 'Cookie storage',
  'storage.service-worker': 'Service worker storage',
  
  // Platform
  'platform.clipboard': 'Clipboard API',
  'platform.notifications': 'Notifications API',
  'platform.geolocation': 'Geolocation API',
  'platform.media': 'Media devices API',
  'platform.bluetooth': 'Bluetooth API',
  'platform.usb': 'USB API',
  'platform.serial': 'Serial API',
  'platform.hid': 'HID API',
  'platform.nfc': 'NFC API',
  
  // Customization
  'customization.themes': 'Theme system',
  'customization.keybindings': 'Keybinding system',
  'customization.gestures': 'Gesture system',
  'customization.menus': 'Menu system',
  'customization.toolbar': 'Toolbar customization',
  'customization.sidebar': 'Sidebar customization',
} as const;

export type ExtensionPoint = keyof typeof EXTENSION_POINTS;

// ============================================================================
// KERNEL BOOTSTRAP
// ============================================================================

export interface KernelBootConfig {
  // Built-in plugins (always loaded)
  builtinPlugins: string[];
  
  // Plugin directories
  pluginDirs: string[];
  
  // Config
  configDir: string;
  profile?: string;
  
  // Features
  devMode: boolean;
  debug: boolean;
  
  // Renderer
  rendererType: 'webview' | 'webgpu' | 'canvas' | 'custom';
  rendererPath?: string;
  
  // Network
  proxyConfig?: ProxyConfig;
  
  // Security
  sandboxType: 'wasm' | 'vm' | 'container' | 'process';
  strictSandbox: boolean;
}

export interface ProxyConfig {
  mode: 'direct' | 'auto' | 'pac' | 'system';
  pacUrl?: string;
  rules?: ProxyRule[];
}

export interface ProxyRule {
  pattern: string;
  proxy: string;
  bypass?: string[];
}

export interface Kernel {
  primitives: KernelPrimitives;
  plugins: PluginSystem;
  config: ConfigurationSystem;
  
  // Lifecycle
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  
  // Window management
  createWindow(config?: Partial<WindowConfig>): Promise<WindowHandle>;
  getMainWindow(): WindowHandle | null;
  
  // Plugin management
  installPlugin(source: string): Promise<Plugin>;
  uninstallPlugin(id: string): Promise<void>;
  
  // Development
  inspect(): Promise<void>;
  debug(): Promise<void>;
}

export async function createKernel(config: KernelBootConfig): Promise<Kernel> {
  // Implementation would wire up all primitives
  throw new Error('Kernel implementation required');
}
