import type { Deal } from '../types'
import { DealTimeline } from './DealTimeline'

interface DealsSectionProps {
  deals: Deal[]
  onTransition: (dealId: string, status: Deal['status']) => void
  busyId: string | null
}

function nextActions(status: Deal['status']): Deal['status'][] {
  if (status === 'PENDING') return ['CONFIRMED', 'CANCELLED']
  if (status === 'CONFIRMED') return ['COMPLETED', 'CANCELLED']
  return []
}

export function DealsSection({ deals, onTransition, busyId }: DealsSectionProps) {
  if (deals.length === 0) {
    return (
      <section className="screen">
        <div className="section-header"><div><span className="eyebrow">Agreed deals</span><h2>Fulfilment tracker</h2></div></div>
        <div className="empty-state">No agreed deals yet. When a seller accepts your offer, the deal and its fulfilment steps appear here.</div>
      </section>
    )
  }
  return (
    <section className="screen">
      <div className="section-header"><div><span className="eyebrow">Agreed deals</span><h2>Fulfilment tracker</h2></div></div>
      <div className="deals-grid">
        {deals.map((deal) => (
          <article key={deal.id} className="deal-card">
            <div className="section-header compact">
              <div>
                <span className="eyebrow">{deal.listingTitle ?? deal.listingId}</span>
                <h3>{deal.agreedQuantity} units @ {deal.agreedPrice} {deal.currency}</h3>
              </div>
            </div>
            <p className="muted">{deal.buyerName} · {deal.sellerName}</p>
            <DealTimeline deal={deal} />
            {nextActions(deal.status).length > 0 ? (
              <div className="offer-actions">
                {nextActions(deal.status).map((s) => (
                  <button key={s} type="button" disabled={busyId === deal.id}
                    className={s === 'CANCELLED' ? 'mini-decline' : 'mini-accept'}
                    onClick={() => onTransition(deal.id, s)}>
                    {s === 'CONFIRMED' ? 'Confirm' : s === 'COMPLETED' ? 'Mark completed' : 'Cancel deal'}
                  </button>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  )
}
