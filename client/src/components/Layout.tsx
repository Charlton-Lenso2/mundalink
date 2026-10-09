import type { ReactNode } from 'react'

interface LayoutProps {
  children: ReactNode
  userLabel?: string
  onSignIn?: () => void
  onSignOut?: () => void
  badgeLabel?: string
  badgeTone?: 'live' | 'demo'
}

export function Layout({
  children,
  userLabel,
  onSignIn,
  onSignOut,
  badgeLabel,
  badgeTone = 'demo',
}: LayoutProps) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-wrap">
          <div className="brand-mark">M</div>
          <div>
            <div className="brand-name">MundaLink</div>
            <div className="brand-subtitle">Agricultural market coordination</div>
          </div>
        </div>

        <nav className="main-nav" aria-label="Primary navigation">
          <button type="button" className="nav-button active">Discover</button>
          <button type="button" className="nav-button">Marketplace</button>
          <button type="button" className="nav-button">Create Listing</button>
          <button type="button" className="nav-button">Dashboard</button>
          <button type="button" className="nav-button">Profile</button>
        </nav>

        <div className="topbar-actions">
          <span className={badgeTone === 'live' ? 'status-badge live' : 'status-badge demo'}>{badgeLabel}</span>
          {userLabel ? (
            <button type="button" className="primary-button small" onClick={onSignOut}>
              {userLabel}
            </button>
          ) : (
            <button type="button" className="primary-button small" onClick={onSignIn}>
              Sign in
            </button>
          )}
        </div>
      </header>

      {children}
    </div>
  )
}
