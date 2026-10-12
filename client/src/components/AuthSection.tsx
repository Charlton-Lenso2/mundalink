interface AuthSectionProps {
  authMode: 'signin' | 'signup'
  onAuthModeChange: (mode: 'signin' | 'signup') => void
  email: string
  onEmailChange: (value: string) => void
  password: string
  onPasswordChange: (value: string) => void
  displayName: string
  onDisplayNameChange: (value: string) => void
  authError: string | null
  authLoading: boolean
  onSubmit: () => void
}

export function AuthSection({
  authMode,
  onAuthModeChange,
  email,
  onEmailChange,
  password,
  onPasswordChange,
  displayName,
  onDisplayNameChange,
  authError,
  authLoading,
  onSubmit,
}: AuthSectionProps) {
  return (
    <section className="screen auth-screen">
      <div className="auth-panel">
        <div className="section-header compact">
          <div>
            <span className="eyebrow">Authentication</span>
            <h2>{authMode === 'signin' ? 'Welcome back' : 'Create your account'}</h2>
          </div>
        </div>

        <div className="auth-toggle">
          <button type="button" className={authMode === 'signin' ? 'toggle-button active' : 'toggle-button'} onClick={() => onAuthModeChange('signin')}>
            Sign in
          </button>
          <button type="button" className={authMode === 'signup' ? 'toggle-button active' : 'toggle-button'} onClick={() => onAuthModeChange('signup')}>
            Register
          </button>
        </div>

        <form className="auth-form" onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}>
          {authMode === 'signup' ? (
            <label className="field">
              <span>Full name</span>
              <input value={displayName} onChange={(event) => onDisplayNameChange(event.target.value)} placeholder="Your full name" required autoComplete="name" />
            </label>
          ) : null}

          <label className="field">
            <span>Email address</span>
            <input type="email" value={email} onChange={(event) => onEmailChange(event.target.value)} placeholder="you@example.com" required autoComplete="email" />
          </label>

          <label className="field">
            <span>Password</span>
            <input type="password" value={password} onChange={(event) => onPasswordChange(event.target.value)} placeholder="At least 6 characters" required minLength={6} autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} />
          </label>

          {authError ? <div className="notice error">{authError}</div> : null}

          <button type="submit" className="primary-button" disabled={authLoading}>
            {authLoading ? 'Please wait...' : authMode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </section>
  )
}
