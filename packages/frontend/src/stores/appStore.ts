import { createSignal, createMemo, onCleanup } from 'solid-js';
import { createStore } from 'solid-js/store';
import type { 
  AppMode, SidebarState, SidebarPanel, FileTab, WorkspaceInfo, 
  SplitLayout, Pane, MirrorEventSummary, ProxyStatus, Settings,
  KeyboardShortcut
} from '../types';

// Default configurations
const defaultSidebarState: SidebarState = {
  visible: true,
  width: 280,
  collapsed: false,
  activePanel: 'files',
};

const defaultSettings: Settings = {
  theme: 'dark',
  animations: { enabled: true, speed: 'normal', reducedMotion: false },
  editor: {
    fontSize: 14,
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    tabSize: 2,
    wordWrap: true,
    minimap: false,
    lineNumbers: true,
    formatOnSave: true,
    autoSave: true,
    lintOnChange: true,
  },
  proxy: {
    port: 8080,
    autoStart: false,
    interceptHttps: true,
    captureBodies: true,
    maxBodySize: 10 * 1024 * 1024,
    ignoreHosts: ['localhost', '127.0.0.1'],
  },
  sandbox: {
    defaultBackend: 'wasmtime',
    wasmFuelLimit: 10_000_000,
    memoryLimitMb: 128,
    timeoutSeconds: 30,
    allowNetwork: false,
    allowFs: false,
  },
  security: {
    encryptSessions: false,
    requireAuth: false,
    auditLog: true,
  },
};

// App State
export const [appMode, setAppMode] = createSignal<AppMode>('zen');
export const [sidebar, setSidebar] = createStore<SidebarState>(defaultSidebarState);
export const [workspaces, setWorkspaces] = createStore<Record<string, WorkspaceInfo>>({});
export const [currentWorkspaceId, setCurrentWorkspaceId] = createSignal<string>('');
export const [openFiles, setOpenFiles] = createStore<Record<string, FileTab>>({});
export const [activeFileId, setActiveFileId] = createSignal<string>('');
export const [fileOrder, setFileOrder] = createSignal<string[]>([]);
export const [splitLayout, setSplitLayout] = createSignal<SplitLayout | undefined>(undefined);
export const [timelineEvents, setTimelineEvents] = createStore<MirrorEventSummary[]>([]);
export const [selectedEventId, setSelectedEventId] = createSignal<string | null>(null);
export const [proxyStatus, setProxyStatus] = createStore<ProxyStatus>({
  running: false,
  port: 8080,
  caInstalled: false,
  interceptedCount: 0,
  activeConnections: 0,
});
export const [settings, setSettings] = createStore<Settings>(defaultSettings);
export const [keyboardShortcuts, setKeyboardShortcuts] = createSignal<KeyboardShortcut[]>([]);

// Derived state
export const currentWorkspace = createMemo(() => 
  workspaces[currentWorkspaceId()] || null
);

export const activeFile = createMemo(() => 
  openFiles[activeFileId()] || null
);

export const openFilesList = createMemo(() => {
  const order = fileOrder();
  const all = Object.values(openFiles);
  const rank = new Map(order.map((id, i) => [id, i] as const));
  return all.sort(
    (a, b) => (rank.get(a.id) ?? order.length) - (rank.get(b.id) ?? order.length)
  );
});

export function reorderFiles(draggedId: string, targetId: string) {
  if (draggedId === targetId) return;
  setFileOrder((prev) => {
    const ids = prev.length ? [...prev] : Object.keys(openFiles);
    const from = ids.indexOf(draggedId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return ids;
    ids.splice(from, 1);
    ids.splice(to, 0, draggedId);
    return ids;
  });
}

export const recentEvents = createMemo(() => 
  timelineEvents.slice(-100).reverse()
);

// Actions
export function toggleSidebar() {
  setSidebar('visible', !sidebar.visible);
}

export function setSidebarPanel(panel: SidebarPanel) {
  setSidebar('activePanel', panel);
}

export function addFile(file: FileTab) {
  setOpenFiles(file.id, file);
  setFileOrder((prev) => (prev.includes(file.id) ? prev : [...prev, file.id]));
  if (!activeFileId()) {
    setActiveFileId(file.id);
  }
}

export function removeFile(id: string) {
  const { [id]: _, ...rest } = openFiles;
  setOpenFiles(rest);
  setFileOrder((prev) => prev.filter((fid) => fid !== id));
  if (activeFileId() === id) {
    const remaining = fileOrder();
    setActiveFileId(remaining[0] || '');
  }
}

export function updateFile(id: string, updates: Partial<FileTab>) {
  setOpenFiles(id, updates);
}

export function addWorkspace(ws: WorkspaceInfo) {
  setWorkspaces(ws.id, ws);
  setCurrentWorkspaceId(ws.id);
}

export function removeWorkspace(id: string) {
  setWorkspaces((prev) => {
    const { [id]: _, ...rest } = prev;
    return rest as Record<string, WorkspaceInfo>;
  });
  if (currentWorkspaceId() === id) {
    const remaining = Object.keys(workspaces);
    setCurrentWorkspaceId(remaining[0] || '');
  }
}

export function setMode(mode: AppMode) {
  setAppMode(mode);
  if (currentWorkspaceId()) {
    setWorkspaces(currentWorkspaceId(), 'mode', mode);
  }
}

export function addTimelineEvent(event: MirrorEventSummary) {
  const current = timelineEvents;
  if (current.length >= 10000) {
    setTimelineEvents(current.slice(-9999));
  }
  setTimelineEvents([...current, event]);
}

export function clearTimeline() {
  setTimelineEvents([]);
}

export function updateProxyStatus(status: Partial<ProxyStatus>) {
  setProxyStatus(status);
}

export function updateSettings(updates: Partial<Settings>) {
  setSettings(updates);
}

export function registerShortcut(shortcut: KeyboardShortcut) {
  setKeyboardShortcuts(prev => [...prev, shortcut]);
}

// Keyboard handling
export function setupKeyboardShortcuts() {
  const handler = (e: KeyboardEvent) => {
    const shortcuts = keyboardShortcuts();
    const key = [
      e.metaKey || e.ctrlKey ? 'CmdOrCtrl' : '',
      e.shiftKey ? 'Shift' : '',
      e.altKey ? 'Alt' : '',
      e.key === ' ' ? 'Space' : e.key
    ].filter(Boolean).join('+');
    
    const shortcut = shortcuts.find(s => s.key === key);
    if (shortcut) {
      e.preventDefault();
      shortcut.action();
    }
  };
  
  window.addEventListener('keydown', handler);
  onCleanup(() => window.removeEventListener('keydown', handler));
}