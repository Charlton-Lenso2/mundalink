import type { Listing } from '../types'

interface MarketplaceSectionProps {
  listings: Listing[]
  searchTerm: string
  onSearchChange: (value: string) => void
  category: string
  onCategoryChange: (value: string) => void
  location: string
  onLocationChange: (value: string) => void
  page: number
  pageCount: number
  onPageChange: (nextPage: number) => void
  selectedListingId: string | null
  onSelectListing: (id: string) => void
  onOfferSubmit: () => void
}

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export function MarketplaceSection({
  listings,
  searchTerm,
  onSearchChange,
  category,
  onCategoryChange,
  location,
  onLocationChange,
  page,
  pageCount,
  onPageChange,
  selectedListingId,
  onSelectListing,
}: MarketplaceSectionProps) {
  const selectedListing = listings.find((listing) => listing.id === selectedListingId) ?? listings[0] ?? null

  return (
    <section className="screen marketplace-screen">
      <div className="section-header">
        <div>
          <span className="eyebrow">Marketplace</span>
          <h2>Browse active listings</h2>
        </div>
      </div>

      <div className="toolbar">
        <label className="field inline-field search-field">
          <span>Search</span>
          <input value={searchTerm} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search commodity or location" />
        </label>

        <label className="field inline-field">
          <span>Category</span>
          <select value={category} onChange={(event) => onCategoryChange(event.target.value)}>
            <option>All</option>
            <option>Cereals</option>
            <option>Legumes</option>
            <option>Vegetables</option>
            <option>Fruits</option>
            <option>Livestock</option>
            <option>Inputs</option>
          </select>
        </label>

        <label className="field inline-field">
          <span>Location</span>
          <select value={location} onChange={(event) => onLocationChange(event.target.value)}>
            <option>All</option>
            <option>Harare</option>
            <option>Mutoko</option>
            <option>Bulawayo</option>
            <option>Chinhoyi</option>
            <option>Gweru</option>
          </select>
        </label>
      </div>

      <div className="marketplace-grid">
        <div className="listing-list">
          {listings.map((listing) => (
            <button
              key={listing.id}
              type="button"
              className={selectedListing?.id === listing.id ? 'listing-card selected' : 'listing-card'}
              onClick={() => onSelectListing(listing.id)}
            >
              <div className="listing-header space-between">
                <span className="listing-badge">{listing.category}</span>
                <span className={listing.status === 'Available' ? 'status-pill available' : 'status-pill'}>{listing.status}</span>
              </div>
              <h3>{listing.title}</h3>
              <div className="meta-row">
                <span>{listing.quantity} {listing.unit}</span>
                <span>{listing.location}</span>
              </div>
              <div className="price-line">
                <strong>{money.format(listing.price)}</strong>
                <span>per {listing.unit}</span>
              </div>
              <p>{listing.sellerName}</p>
            </button>
          ))}

          <div className="pagination">
            <button type="button" disabled={page === 1} onClick={() => onPageChange(Math.max(1, page - 1))}>Previous</button>
            <span>{page} / {pageCount}</span>
            <button type="button" disabled={page >= pageCount} onClick={() => onPageChange(Math.min(pageCount, page + 1))}>Next</button>
          </div>
        </div>

        {selectedListing ? (
          <aside className="listing-detail">
            <div className="detail-topbar">
              <span className="listing-badge">{selectedListing.category}</span>
              <span className={selectedListing.status === 'Available' ? 'status-pill available' : 'status-pill'}>{selectedListing.status}</span>
            </div>
            <h3>{selectedListing.title}</h3>
            <p className="detail-subtitle">{selectedListing.commodity}</p>
            <div className="price-display">{money.format(selectedListing.price)}<span> per {selectedListing.unit}</span></div>
            <dl className="detail-meta">
              <div>
                <dt>Quantity</dt>
                <dd>{selectedListing.quantity} {selectedListing.unit}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{selectedListing.location}</dd>
              </div>
              <div>
                <dt>Seller</dt>
                <dd>{selectedListing.sellerName}</dd>
              </div>
              <div>
                <dt>Posted</dt>
                <dd>{new Date(selectedListing.createdAt).toLocaleDateString('en-ZW', { dateStyle: 'medium' })}</dd>
              </div>
            </dl>
            <p>{selectedListing.description}</p>

            <form className="offer-form" onSubmit={(event) => {
              event.preventDefault()
              onOfferSubmit()
            }}>
              <h4>Submit an offer</h4>
              <button type="submit" className="primary-button">Create offer</button>
            </form>
          </aside>
        ) : null}
      </div>
    </section>
  )
}

