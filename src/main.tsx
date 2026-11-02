import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { AppProvider } from './app/AppContext'
import { InstallProvider } from './app/InstallContext'
import { AppController } from './app/controller'
import { HttpApi } from './platform/api'
import { attachInstaller } from './platform/install'
import { browserStore } from './platform/storage'
import { App } from './ui/App'
import './styles.css'

try {
  void navigator.storage?.persist?.()?.catch(() => undefined)
} catch {
  // Persistence is a best-effort request.
}

const store = browserStore()
const controller = new AppController(store, () => new Date(), new HttpApi())
// Before rendering: Chromium can fire beforeinstallprompt as soon as the page loads.
const installer = attachInstaller(window, store)

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
      <InstallProvider installer={installer}>
        <App />
      </InstallProvider>
    </AppProvider>
  </StrictMode>,
)
