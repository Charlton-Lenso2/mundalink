import type { Deal, Listing, Offer, Profile } from '../types'
import farmImage from '../assets/farm.jpg'
import { StatusBadge } from './StatusBadge'

interface DashboardSectionProps {
  profile: Profile | null
  listings: Listing[]
  offers: Offer[]
  deals: Deal[]
  onOpenListing: (id: string) => void
  onOpenProfile: () => void
  onOpenRequirements: () => void
  onOpenAggregation: () => void
}

export function DashboardSection({
  profile,
  listings,
  offers,
  deals,
  onOpenListing,
  onOpenProfile,
  onOpenRequirements,
  onOpenAggregation,
}: DashboardSectionProps) {
  const availableListings = listings.filter((listing) => listing.status === 'ACTIVE').length
  const stats = [
    { label: 'Active listings shown', value: String(availableListings) },
    { label: 'Open offers', value: String(offers.filter((offer) => offer.status === 'PENDING').length) },
    { label: 'Agreed deals', value: String(deals.length) },
    {
      label: 'Profile status',
      value: profile?.displayName && profile.city && profile.phone ? 'Details added' : 'Needs details',
    },
  ]

  return (
    <section className="screen dashboard-screen">
      <div className="section-header">
        <div>
          <span className="eyebrow">Dashboard</span>
          <h2>Market overview</h2>
        </div>
      </div>

      <div className="dashboard-hero">
        <img
          className="dashboard-hero-image"
          src={farmImage}
          alt="Rows of growing crops stretching across a green field beneath a bright sky"
        />
        <div className="dashboard-hero-overlay">
          <div className="glass-panel hero-copy">
            <span className="eyebrow light">Built for the whole journey</span>
            <h3>From the first listing to an agreement you can follow.</h3>
            <p>Keep your produce, buyer offers, and agreed deals together in one clear view.</p>
          </div>

          <div className="glass-panel hero-journey-panel" aria-label="Marketplace transaction journey">
            <span className="panel-kicker">Your marketplace journey</span>
            <ol className="journey-steps">
              <li><span>01</span> List produce</li>
              <li><span>02</span> Discuss an offer</li>
              <li><span>03</span> Record an agreement</li>
              <li className="journey-next">
                <span className="journey-step-number">04</span>
                <span className="journey-step-label">Coordinate fulfilment <small>Coming next</small></span>
              </li>
            </ol>
          </div>
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
                <div className="avatar">{profile.displayName?.charAt(0) ?? '?'}</div>
                <div>
                  <strong>{profile.displayName ?? 'Name not added'}</strong>
                  <p>{profile.email ?? 'Marketplace profile'}</p>
                </div>
              </div>
              <ul className="summary-list">
                <li><span>Role</span><strong>{profile.role}</strong></li>
                <li><span>Location</span><strong>{[profile.city, profile.region, profile.country].filter(Boolean).join(', ') || 'Not added'}</strong></li>
                <li><span>Phone</span><strong>{profile.phone || 'Not added'}</strong></li>
              </ul>
            </>
          ) : (
            <div className="empty-state compact">
              <p>Complete your profile details to help trading partners identify your business.</p>
              <button type="button" className="ghost-button small" onClick={onOpenProfile}>Complete profile</button>
            </div>
          )}
        </div>

        <div className="dashboard-panel">
          <h3>Marketplace listings</h3>
          {listings.length === 0 ? (
            <div className="empty-state compact">No listings are available in the current results.</div>
          ) : (
            <div className="stack-list">
              {listings.slice(0, 3).map((listing) => (
                <button key={listing.id} type="button" className="stack-item link" onClick={() => onOpenListing(listing.id)}>
                  <div>
                    <strong>{listing.title}</strong>
                    <span>{listing.location}</span>
                  </div>
                  <StatusBadge status={listing.status} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {profile?.role === 'BUYER' ? (
        <div className="dashboard-feature-link">
          <div>
            <span className="eyebrow">Buyer workspace</span>
            <h3>Organise demand before you source</h3>
            <p>Draft a produce requirement with a clear quantity, unit, location, and date. Sellers propose supply; you confirm and record delivery.</p>
          </div>
          <button type="button" className="secondary-button" onClick={onOpenRequirements}>Open buyer requirements</button>
        </div>
      ) : null}
      {profile?.role === 'SELLER' ? (
        <div className="dashboard-feature-link">
          <div>
            <span className="eyebrow">Seller workspace</span>
            <h3>Discover buyer demand</h3>
            <p>Browse open buyer demand and propose supply from your listings. Only buyer-confirmed quantities reserve inventory.</p>
          </div>
          <button type="button" className="secondary-button" onClick={onOpenAggregation}>View aggregation opportunities</button>
        </div>
      ) : null}

      <div className="dashboard-grid two-up">
        <div className="dashboard-panel">
          <h3>Recent offers</h3>
          {offers.length === 0 ? (
            <div className="empty-state compact">No new offers yet.</div>
          ) : (
            <div className="stack-list">
              {offers.slice(0, 3).map((offer) => (
                <div key={offer.id} className="offer-card">
                  <div>
                    <strong>{offer.buyerName ?? 'Buyer'}</strong>
                    <span>{offer.offeredQuantity} {offer.unit ?? 'units'} @ {offer.offeredPrice}{offer.currency ? ` ${offer.currency}` : ''}</span>
                  </div>
                  <StatusBadge status={offer.status} />
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
                    <strong>{deal.listingTitle ?? 'Agreed transaction'}</strong>
                    <span>{deal.agreedQuantity} {deal.unit ?? 'units'}</span>
                  </div>
                  <StatusBadge status={deal.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
