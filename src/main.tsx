import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { AppProvider } from './app/AppContext'
import { AppController } from './app/controller'
import { HttpApi } from './platform/api'
import { browserStore } from './platform/storage'
import { App } from './ui/App'
import './styles.css'

try {
  void navigator.storage?.persist?.()?.catch(() => undefined)
} catch {
  // Persistence is a best-effort request.
}

const controller = new AppController(browserStore(), () => new Date(), new HttpApi())

// autoUpdate: a new service worker activates as soon as it is ready; the app works offline after first load.
// Reload for it, but never mid-Game (the app boots to Home): wait until the player is Home or the page is hidden.
let reloadPending = false
const reloadIfIdle = () => {
  if (reloadPending && (controller.getSnapshot().session === null || document.visibilityState === 'hidden')) {
    window.location.reload()
  }
}
controller.subscribe(reloadIfIdle)
document.addEventListener('visibilitychange', reloadIfIdle)
registerSW({
  immediate: true,
  onNeedReload() {
    reloadPending = true
    reloadIfIdle()
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider controller={controller}>
      <App />
    </AppProvider>
  </StrictMode>,
)
