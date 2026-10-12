import type { Profile } from '../types'

interface ProfileSectionProps {
  profileDraft: Profile | null
  onProfileDraftChange: (next: Profile | null) => void
  onSave: () => void
  saving: boolean
}

export function ProfileSection({ profileDraft, onProfileDraftChange, onSave, saving }: ProfileSectionProps) {
  if (!profileDraft) {
    return <div className="empty-state">Profile data is loading.</div>
  }

  return (
    <section className="screen profile-screen">
      <div className="section-header">
        <div>
          <span className="eyebrow">Profile</span>
          <h2>Business and contact details</h2>
        </div>
      </div>

      <form className="profile-form" onSubmit={(event) => {
        event.preventDefault()
        onSave()
      }}>
        <div className="split-fields">
          <label className="field">
            <span>Display name</span>
            <input value={profileDraft.displayName ?? ''} onChange={(event) => onProfileDraftChange({ ...profileDraft, displayName: event.target.value })} />
          </label>
          <label className="field">
            <span>Email</span>
            <input value={profileDraft.email ?? ''} disabled aria-disabled="true" />
          </label>
        </div>

        <div className="split-fields">
          <label className="field">
            <span>City</span>
            <input value={profileDraft.city ?? ''} onChange={(event) => onProfileDraftChange({ ...profileDraft, city: event.target.value })} />
          </label>
          <label className="field">
            <span>Phone</span>
            <input value={profileDraft.phone ?? ''} onChange={(event) => onProfileDraftChange({ ...profileDraft, phone: event.target.value })} />
          </label>
        </div>

        <div className="split-fields">
          <label className="field">
            <span>Region</span>
            <input value={profileDraft.region ?? ''} onChange={(event) => onProfileDraftChange({ ...profileDraft, region: event.target.value })} />
          </label>
          <label className="field">
            <span>Country</span>
            <input value={profileDraft.country ?? ''} onChange={(event) => onProfileDraftChange({ ...profileDraft, country: event.target.value })} />
          </label>
        </div>

        <p className="muted">Your role is assigned by the platform. Contact an administrator to change it.</p>

        <button type="submit" className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
      </form>
    </section>
  )
}
