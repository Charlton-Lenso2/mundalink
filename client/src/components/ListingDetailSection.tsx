import type { FormEvent } from 'react'
import type { Listing, Offer } from '../types'
import { StatusBadge } from './StatusBadge'

interface ListingDetailSectionProps {
  listing: Listing
  offers: Offer[]
  isOwner: boolean
  signedIn: boolean
  offerForm: { quantity: string; price: string; message: string }
  onOfferFieldChange: (field: string, value: string) => void
  onSubmitOffer: () => void
  onPublish: () => void
  onOfferAction: (offerId: string, status: Offer['status']) => void
  offerSubmitting: boolean
  offerError: string | null
  onBack: () => void
}

export function ListingDetailSection(props: ListingDetailSectionProps) {
  const { listing, offers, isOwner, signedIn, offerForm } = props
  const { onOfferFieldChange, onSubmitOffer, onPublish, onOfferAction } = props
  const { offerSubmitting, offerError, onBack } = props
  const related = offers.filter((o) => o.listingId === listing.id)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSubmitOffer()
  }

  return (
    <section className="screen detail-screen">
      <button type="button" className="ghost-button small" onClick={onBack}>
        Back to marketplace
      </button>
      <div className="detail-grid">
        <article className="detail-main">
          <div className="section-header compact">
            <div>
              <span className="eyebrow">{listing.commodity ?? listing.category ?? 'Produce listing'}</span>
              <h2>{listing.title}</h2>
            </div>
            <StatusBadge status={listing.status} />
          </div>
          {listing.description ? <p className="detail-description">{listing.description}</p> : null}
          <dl className="detail-facts">
            <div><dt>Quantity</dt><dd>{listing.quantity} {listing.unit ?? ''}</dd></div>
            <div><dt>Available</dt><dd>{listing.availableQuantity} {listing.unit ?? ''}</dd></div>
            <div><dt>Price per unit</dt><dd>{listing.pricePerUnit} {listing.currency}</dd></div>
            <div><dt>Location</dt><dd>{listing.location ?? 'Not specified'}</dd></div>
            <div><dt>Seller</dt><dd>{listing.sellerName ?? 'Seller details unavailable'}</dd></div>
          </dl>
          {listing.status === 'DRAFT' && isOwner ? (
            <div className="notice info">
              This draft is not visible to buyers yet.
              <button type="button" className="primary-button small" onClick={onPublish}>Publish listing</button>
            </div>
          ) : null}
        </article>
        <aside className="detail-side">
          {!isOwner && listing.status === 'ACTIVE' ? (
            <form className="offer-form" onSubmit={submit}>
              <h3>Make an offer</h3>
              {!signedIn ? <p className="muted">Sign in to submit an offer.</p> : null}
              <label className="field">
                <span>Quantity ({listing.unit ?? 'units'})</span>
                <input type="number" min="0.000001" max={listing.availableQuantity} step="0.000001" value={offerForm.quantity}
                  onChange={(e) => onOfferFieldChange('quantity', e.target.value)}
                  required disabled={!signedIn || offerSubmitting} />
              </label>
              <label className="field">
                <span>Price per unit ({listing.currency})</span>
                <input type="number" min="0" step="0.000001" value={offerForm.price}
                  onChange={(e) => onOfferFieldChange('price', e.target.value)}
                  required disabled={!signedIn || offerSubmitting} />
              </label>
              <label className="field">
                <span>Message (optional)</span>
                <textarea rows={3} value={offerForm.message}
                  onChange={(e) => onOfferFieldChange('message', e.target.value)}
                  placeholder="Collection timing, transport, packaging…"
                  disabled={!signedIn || offerSubmitting} />
              </label>
              {offerError ? <div className="notice error">{offerError}</div> : null}
              <button type="submit" className="primary-button" disabled={!signedIn || offerSubmitting}>
                {offerSubmitting ? 'Submitting…' : 'Submit offer'}
              </button>
            </form>
          ) : null}
          <div className="offers-panel">
            <h3>{isOwner ? 'Offers on this listing' : 'Recent offers'}</h3>
            {related.length === 0 ? (
              <div className="empty-state compact">No offers yet.</div>
            ) : (
              <ul className="stack-list">
                {related.map((offer) => (
                  <li key={offer.id} className="offer-card">
                    <div>
                      <strong>{offer.buyerName ?? 'Buyer'}</strong>
                      <span>{offer.offeredQuantity} {offer.unit ?? listing.unit ?? 'units'} @ {offer.offeredPrice}{offer.currency ? ` ${offer.currency}` : ` ${listing.currency}`}</span>
                      {offer.message ? <span className="muted">{offer.message}</span> : null}
                    </div>
                    <div className="offer-side">
                      <StatusBadge status={offer.status} />
                      {isOwner && offer.status === 'PENDING' ? (
                        <div className="offer-actions">
                          <button type="button" className="mini-accept" onClick={() => onOfferAction(offer.id, 'ACCEPTED')}>Accept</button>
                          <button type="button" className="mini-decline" onClick={() => onOfferAction(offer.id, 'DECLINED')}>Decline</button>
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}
