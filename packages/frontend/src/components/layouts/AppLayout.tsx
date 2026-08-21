import { createMemo, type JSX } from 'solid-js'
import { Show } from 'solid-js'
import { appMode } from '../../stores/appStore'

interface AppLayoutProps {
  children: JSX.Element
}

export function AppLayout(props: AppLayoutProps) {
  const layoutClass = createMemo(() => {
    const m = appMode()
    return `h-screen w-screen flex ${m === 'zen' ? 'flex-col' : 'flex-row'}`
  })

  return (
    <div class={layoutClass()}>
      <Show
        when={appMode() !== 'zen'}
        fallback={
          <div class="flex-1 flex flex-col overflow-hidden">{props.children}</div>
        }
      >
        {props.children}
      </Show>
    </div>
  )
}
