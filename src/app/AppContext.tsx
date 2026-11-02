/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { browserStore } from '../platform/storage'
import { AppController, type Snapshot } from './controller'

const Ctx = createContext<AppController | null>(null)

export function AppProvider({ controller, children }: { controller?: AppController; children: ReactNode }) {
  const value = useMemo(() => controller ?? new AppController(browserStore()), [controller])
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') value.refreshToday()
    }
    const onStorage = () => {
      value.profile.refresh()
      value.changed()
    }
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    let timer: ReturnType<typeof setTimeout> | undefined
    const arm = () => {
      const now = new Date()
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0)
      timer = setTimeout(() => {
        value.refreshToday()
        arm()
      }, Math.max(250, next.getTime() - now.getTime()))
    }
    arm()
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('storage', onStorage)
    }
  }, [value])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useController(): AppController {
  const c = useContext(Ctx)
  if (!c) throw new Error('AppProvider missing')
  return c
}

export function useApp(): Snapshot & { controller: AppController } {
  const controller = useController()
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  return { ...snap, controller }
}
