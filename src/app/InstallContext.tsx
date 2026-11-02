/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react'
import type { InstallSnapshot, Installer } from '../platform/install'

const Ctx = createContext<Installer | null>(null)

export function InstallProvider({ installer, children }: { installer: Installer; children: ReactNode }) {
  return <Ctx.Provider value={installer}>{children}</Ctx.Provider>
}

const NONE: InstallSnapshot = { method: null, iosStandalone: false, dismissedAt: null }
const noop = () => () => undefined

/** The install state, or "nothing to offer" when no Installer is provided (tests, other hosts). */
export function useInstall(): InstallSnapshot & { installer: Installer | null } {
  const installer = useContext(Ctx)
  const snap = useSyncExternalStore(installer?.subscribe ?? noop, installer?.getSnapshot ?? (() => NONE))
  return { ...snap, installer }
}
