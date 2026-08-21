import { createSignal } from 'solid-js'
import { AppLayout } from './components/layouts/AppLayout'
import { EditorPane } from './components/editor/EditorPane'
import { TargetView } from './components/target/TargetView'
import { Sidebar } from './components/sidebar/Sidebar'
import { TabBar } from './components/tabs/TabBar'
import { TimelinePanel } from './components/timeline/TimelinePanel'
import { InspectorPanel } from './components/inspector/InspectorPanel'
import { ConsolePanel } from './components/console/ConsolePanel'
import { ControlPanel } from './components/control/ControlPanel'
import { DevToolsPanel } from './components/devtools/DevToolsPanel'
import { SettingsModal } from './components/settings/SettingsModal'
import { CommandPalette } from './components/command-palette/CommandPalette'
import { setupKeyboardShortcuts } from './stores/appStore'
import './index.css'

export function App() {
  setupKeyboardShortcuts()
  const [settingsOpen, setSettingsOpen] = createSignal(false)
  const [paletteOpen, setPaletteOpen] = createSignal(false)
  
  return (
    <AppLayout>
      <Sidebar />
      <div class="flex-1 flex flex-col overflow-hidden">
        <TabBar />
        <div class="flex-1 flex overflow-hidden">
          <div class="flex-1 flex flex-col border-r border-zen-border">
            <EditorPane />
          </div>
          <div class="flex-1 flex flex-col">
            <TargetView />
          </div>
        </div>
        <div class="h-72 border-t border-zen-border bg-zen-surface flex overflow-hidden">
          <TimelinePanel />
          <InspectorPanel />
          <ConsolePanel />
        </div>
      </div>
      <ControlPanel />
      <SettingsModal isOpen={settingsOpen()} onClose={() => setSettingsOpen(false)} />
      <CommandPalette isOpen={paletteOpen()} onClose={() => setPaletteOpen(false)} />
    </AppLayout>
  )
}