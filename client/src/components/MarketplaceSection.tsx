import type { FormEvent } from 'react'
import type { Listing } from '../types'
import { StatusBadge } from './StatusBadge'

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
  onSelectListing: (id: string) => void
  loading: boolean
  error: string | null
  onRetry: () => void
}


export function MarketplaceSection(props: MarketplaceSectionProps) {
  const { listings, searchTerm, onSearchChange, category, onCategoryChange } = props
  const { location, onLocationChange, page, pageCount, onPageChange, onSelectListing, loading, error, onRetry } = props

  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
  }

  return (
    <section className="screen marketplace-screen">
      <div className="section-header">
        <div>
          <span className="eyebrow">Marketplace</span>
          <h2>Browse active listings</h2>
        </div>
      </div>

      <form className="toolbar" onSubmit={submitSearch} role="search">
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
          <input
            list="marketplace-location-options"
            value={location === 'All' ? '' : location}
            onChange={(event) => onLocationChange(event.target.value.trim() === '' ? 'All' : event.target.value)}
            placeholder="All locations"
          />
          <datalist id="marketplace-location-options">
            {['Harare', 'Mutoko', 'Bulawayo', 'Chinhoyi', 'Gweru', 'Chiredzi', 'Masvingo', 'Kwekwe', 'Kadoma', 'Marondera', 'Bindura', 'Victoria Falls', 'Rusape', 'Chipinge', 'Karoi'].map((town) => (
              <option key={town} value={town} />
            ))}
          </datalist>
        </label>
      </form>

      {error ? (
        <div className="notice error" role="alert">
          <span>{error}</span>
          <button type="button" className="ghost-button small" onClick={onRetry}>Retry</button>
        </div>
      ) : loading ? (
        <div className="listing-skeletons" aria-label="Loading listings">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton-card" aria-hidden="true">
              <div className="skeleton-line wide" />
              <div className="skeleton-line" />
              <div className="skeleton-line short" />
            </div>
          ))}
        </div>
      ) : listings.length === 0 ? (
        <div className="empty-state">No listings match these filters. Try clearing the search or adjusting the category and location filters.</div>
      ) : (
        <div className="listing-grid">
          {listings.map((listing) => (
            <button
              key={listing.id}
              type="button"
              className="listing-card"
              onClick={() => onSelectListing(listing.id)}
            >
              <div className="listing-header space-between">
                <span className="listing-badge">{listing.category ?? 'Produce'}</span>
                <StatusBadge status={listing.status} />
              </div>
              <h3>{listing.title}</h3>
              <div className="meta-row">
                <span>{listing.quantity} {listing.unit ?? ''}</span>
                <span>{listing.location ?? 'Location on request'}</span>
              </div>
              <div className="price-line">
                <strong>{listing.pricePerUnit} {listing.currency}</strong>
                <span>per {listing.unit ?? 'unit'}</span>
              </div>
              <p>{listing.sellerName ?? 'Seller details unavailable'}</p>
            </button>
          ))}
        </div>
      )}

      <div className="pagination">
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>Previous</button>
        <span>{page} / {Math.max(1, pageCount)}</span>
        <button type="button" disabled={page >= Math.max(1, pageCount)} onClick={() => onPageChange(Math.min(Math.max(1, pageCount), page + 1))}>Next</button>
      </div>
    </section>
  )
}
