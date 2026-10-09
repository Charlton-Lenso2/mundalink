import type { Profile } from '../types'

interface ProfileSectionProps {
  profileDraft: Profile | null
  onProfileDraftChange: (next: Profile | null) => void
  onSave: () => void
}

export function ProfileSection({ profileDraft, onProfileDraftChange, onSave }: ProfileSectionProps) {
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
            <span>Full name</span>
            <input value={profileDraft.name} onChange={(event) => onProfileDraftChange({ ...profileDraft, name: event.target.value })} />
          </label>
          <label className="field">
            <span>Farm or business name</span>
            <input value={profileDraft.farmName} onChange={(event) => onProfileDraftChange({ ...profileDraft, farmName: event.target.value })} />
          </label>
        </div>

        <div className="split-fields">
          <label className="field">
            <span>Location</span>
            <input value={profileDraft.location} onChange={(event) => onProfileDraftChange({ ...profileDraft, location: event.target.value })} />
          </label>
          <label className="field">
            <span>Phone</span>
            <input value={profileDraft.phone} onChange={(event) => onProfileDraftChange({ ...profileDraft, phone: event.target.value })} />
          </label>
        </div>

        <label className="field">
          <span>Business role</span>
          <select value={profileDraft.role} onChange={(event) => onProfileDraftChange({ ...profileDraft, role: event.target.value as Profile['role'] })}>
            <option value="Farmer">Farmer</option>
            <option value="Buyer">Buyer</option>
            <option value="Aggregator">Aggregator</option>
          </select>
        </label>

        <label className="field">
          <span>Bio</span>
          <textarea rows={5} value={profileDraft.bio} onChange={(event) => onProfileDraftChange({ ...profileDraft, bio: event.target.value })} />
        </label>

        <button type="submit" className="primary-button">Save profile</button>
      </form>
    </section>
  )
}
