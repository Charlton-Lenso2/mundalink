import type { Deal, Listing, Offer, Profile } from '../types'

interface DashboardSectionProps {
  profile: Profile | null
  listings: Listing[]
  offers: Offer[]
  deals: Deal[]
}

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export function DashboardSection({ profile, listings, offers, deals }: DashboardSectionProps) {
  const stats = [
    { label: 'Live listings', value: String(listings.length) },
    { label: 'Open offers', value: String(offers.filter((offer) => offer.status === 'Pending').length) },
    { label: 'Agreed deals', value: String(deals.length) },
    { label: 'Profile status', value: profile ? 'Ready' : 'Draft' },
  ]

  return (
    <section className="screen dashboard-screen">
      <div className="section-header">
        <div>
          <span className="eyebrow">Dashboard</span>
          <h2>Market overview</h2>
        </div>
      </div>

      <div className="stats-grid">
        {stats.map((stat) => (
          <div key={stat.label} className="mini-stat">
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </div>
        ))}
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-panel">
          <h3>Profile summary</h3>
          {profile ? (
            <>
              <div className="profile-summary">
                <div className="avatar">{profile.name.charAt(0)}</div>
                <div>
                  <strong>{profile.name}</strong>
                  <p>{profile.farmName}</p>
                </div>
              </div>
              <ul className="summary-list">
                <li><span>Role</span><strong>{profile.role}</strong></li>
                <li><span>Location</span><strong>{profile.location}</strong></li>
                <li><span>Phone</span><strong>{profile.phone}</strong></li>
              </ul>
            </>
          ) : (
            <div className="empty-state compact">Complete your profile to unlock trusted buyer interactions.</div>
          )}
        </div>

        <div className="dashboard-panel">
          <h3>Your listings</h3>
          {listings.length === 0 ? (
            <div className="empty-state compact">No listings yet. Add one to begin trading.</div>
          ) : (
            <div className="stack-list">
              {listings.slice(0, 3).map((listing) => (
                <div key={listing.id} className="stack-item">
                  <div>
                    <strong>{listing.title}</strong>
                    <span>{listing.location}</span>
                  </div>
                  <span className={listing.status === 'Available' ? 'status-pill available' : 'status-pill'}>{listing.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="dashboard-grid two-up">
        <div className="dashboard-panel">
          <h3>Incoming offers</h3>
          {offers.length === 0 ? (
            <div className="empty-state compact">No new offers yet.</div>
          ) : (
            <div className="stack-list">
              {offers.slice(0, 3).map((offer) => (
                <div key={offer.id} className="offer-card">
                  <div>
                    <strong>{offer.buyerName}</strong>
                    <span>{offer.quantity} units @ {money.format(offer.price)}</span>
                  </div>
                  <span className="status-pill">{offer.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dashboard-panel">
          <h3>Agreed deals</h3>
          {deals.length === 0 ? (
            <div className="empty-state compact">No agreed deals yet.</div>
          ) : (
            <div className="stack-list">
              {deals.map((deal) => (
                <div key={deal.id} className="deal-item">
                  <div>
                    <strong>{deal.commodity}</strong>
                    <span>{deal.quantity} units</span>
                  </div>
                  <span className="status-pill available">{deal.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
