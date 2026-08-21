export type AppMode = 'zen' | 'telemetry' | 'focus' | 'interrogation';

export type SidebarPanel = 'files' | 'workspaces' | 'timeline' | 'extensions' | 'settings';

export interface SidebarState {
  visible: boolean;
  width: number;
  collapsed: boolean;
  activePanel: SidebarPanel;
}

export interface CursorPosition {
  line: number;
  column: number;
}

export interface ScrollPosition {
  x: number;
  y: number;
}

export interface FileTab {
  id: string;
  path: string;
  name: string;
  language: string;
  dirty: boolean;
  mode: AppMode;
  cursorPosition?: CursorPosition;
  scrollPosition?: ScrollPosition;
}

export interface SplitDirection {
  horizontal: 'horizontal';
  vertical: 'vertical';
}

export type SplitDirectionType = 'horizontal' | 'vertical';

export type PaneKind = 
  | 'editor' 
  | 'timeline' 
  | 'inspector' 
  | 'console' 
  | 'targetView' 
  | 'controlPanel';

export interface Pane {
  id: string;
  kind: PaneKind;
  size: number;
  activeTab?: string;
}

export interface SplitLayout {
  direction: SplitDirectionType;
  panes: Pane[];
}

export interface WorkspaceInfo {
  id: string;
  name: string;
  path: string;
  active: boolean;
  mode: AppMode;
  sidebar: SidebarState;
  openFiles: FileTab[];
  splitLayout?: SplitLayout;
}

export type EventKind = 'network' | 'dom' | 'storage' | 'console' | 'error' | 'custom';

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

export interface MirrorEventSummary {
  id: string;
  timestamp: string;
  kind: EventKind;
  summary: string;
  sourceLocation?: SourceLocation;
}

export interface MirrorEventDetail extends MirrorEventSummary {
  request?: HttpRequest;
  response?: HttpResponse;
  domMutation?: DomMutation;
  storageChange?: StorageChange;
  consoleMessage?: ConsoleMessage;
  errorEvent?: ErrorEvent;
  customData?: Record<string, unknown>;
}

export interface HttpRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  timestamp: string;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body?: string;
  durationMs: number;
}

export interface DomMutation {
  type: string;
  target: string;
  oldValue?: string;
  newValue?: string;
}

export interface StorageChange {
  action: string;
  key: string;
  oldValue?: string;
  newValue?: string;
}

export interface ConsoleMessage {
  level: string;
  message: string;
  stackTrace?: string;
}

export interface ErrorEvent {
  message: string;
  errorType: string;
  stackTrace?: string;
}

export interface ProxyStatus {
  running: boolean;
  port: number;
  caInstalled: boolean;
  interceptedCount: number;
  activeConnections: number;
}

export interface Settings {
  theme: Theme;
  animations: AnimationConfig;
  editor: EditorSettings;
  proxy: ProxySettings;
  sandbox: SandboxSettings;
  security: SecuritySettings;
}

export type Theme = 'dark' | 'light' | 'system' | `custom-${string}`;

export interface AnimationConfig {
  enabled: boolean;
  speed: 'none' | 'fast' | 'normal' | 'slow' | `custom-${number}`;
  reducedMotion: boolean;
}

export interface EditorSettings {
  fontSize: number;
  fontFamily: string;
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
  lineNumbers: boolean;
  formatOnSave: boolean;
  autoSave: boolean;
  lintOnChange: boolean;
}

export interface ProxySettings {
  port: number;
  autoStart: boolean;
  interceptHttps: boolean;
  captureBodies: boolean;
  maxBodySize: number;
  ignoreHosts: string[];
}

export interface SandboxSettings {
  defaultBackend: 'wasmtime' | 'firecracker' | 'gvisor' | 'native';
  wasmFuelLimit?: number;
  memoryLimitMb: number;
  timeoutSeconds: number;
  allowNetwork: boolean;
  allowFs: boolean;
}

export interface SecuritySettings {
  encryptSessions: boolean;
  sessionPassword?: string;
  requireAuth: boolean;
  auditLog: boolean;
}

export interface KeyboardShortcut {
  key: string;
  description: string;
  action: () => void;
}