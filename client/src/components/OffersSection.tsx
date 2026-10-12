import type { Offer } from '../types'
import { StatusBadge } from './StatusBadge'

interface OffersSectionProps {
  offers: Offer[]
  profileId: string | null
  onAction: (offerId: string, status: Offer['status']) => void
  busyId: string | null
}

export function OffersSection({ offers, profileId, onAction, busyId }: OffersSectionProps) {
  const incoming = offers.filter((o) => o.sellerId != null && o.sellerId !== o.buyerId && profileId != null && o.sellerId === profileId)
  void incoming
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
              <span>{offer.buyerName} · {offer.offeredQuantity} units @ {offer.offeredPrice} {offer.currency}</span>
              {offer.message ? <span className="muted">{offer.message}</span> : null}
            </div>
            <div className="offer-side">
              <StatusBadge status={offer.status} />
              {offer.status === 'PENDING' ? (
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
