import { useApp } from '../app/AppContext'
import { Icon } from './Icon'

export function AccountButton() {
  const { controller, sync } = useApp()
  if (!controller.sync.available) return null
  const email = sync.account?.email
  const label = email ? `Account, signed in as ${email}${sync.error ? ', last sync failed' : ''}` : 'Account, signed out'
  return (
    <button type="button" className="account-btn" aria-label={label} onClick={() => controller.openSheet('account')}>
      {email ? <span aria-hidden="true">{email.charAt(0).toUpperCase()}</span> : <Icon name="person" size={20} />}
      {email && sync.error && <span className="account-dot" aria-hidden="true" />}
    </button>
  )
}
