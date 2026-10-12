import type { Offer } from '../types'
import { StatusBadge } from './StatusBadge'

interface OffersSectionProps {
  offers: Offer[]
  profileId: string | null
  onAction: (offerId: string, status: Offer['status']) => void
  busyId: string | null
}

export function OffersSection({ offers, profileId, onAction, busyId }: OffersSectionProps) {
  if (offers.length === 0) {
    return (
      <section className="screen">
        <div className="section-header"><div><span className="eyebrow">Offers</span><h2>Offers inbox</h2></div></div>
        <div className="empty-state">No offers yet. Browse the marketplace and submit an offer, or share a listing to receive one.</div>
      </section>
    )
  }
  return (
    <section className="screen">
      <div className="section-header"><div><span className="eyebrow">Offers</span><h2>Offers inbox</h2></div></div>
      <ul className="stack-list">
        {offers.map((offer) => (
          <li key={offer.id} className="offer-card">
            <div>
              <strong>{offer.listingTitle ?? offer.listingId}</strong>
              <span>{offer.buyerName ?? 'Buyer'} · {offer.offeredQuantity} {offer.unit ?? 'units'} @ {offer.offeredPrice}{offer.currency ? ` ${offer.currency}` : ''}</span>
              {offer.message ? <span className="muted">{offer.message}</span> : null}
            </div>
            <div className="offer-side">
              <StatusBadge status={offer.status} />
              {offer.status === 'PENDING' && offer.sellerId === profileId ? (
                <div className="offer-actions">
                  <button type="button" className="mini-accept" disabled={busyId === offer.id}
                    onClick={() => onAction(offer.id, 'ACCEPTED')}>Accept</button>
                  <button type="button" className="mini-decline" disabled={busyId === offer.id}
                    onClick={() => onAction(offer.id, 'DECLINED')}>Decline</button>
                </div>
              ) : null}
              {offer.status === 'PENDING' && offer.buyerId === profileId ? (
                <div className="offer-actions">
                  <button type="button" className="mini-decline" disabled={busyId === offer.id}
                    onClick={() => onAction(offer.id, 'WITHDRAWN')}>Withdraw</button>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
