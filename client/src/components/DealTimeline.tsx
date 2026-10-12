import type { Deal } from '../types'
import { StatusBadge } from './StatusBadge'

const STEPS = ['PENDING', 'CONFIRMED', 'COMPLETED'] as const

export function DealTimeline({ deal }: { deal: Deal }) {
  if (deal.status === 'CANCELLED') {
    return (
      <ol className="timeline">
        <li className="timeline-step done"><strong>Agreed</strong><span>Offer accepted and deal recorded.</span></li>
        <li className="timeline-step cancelled"><strong>Cancelled</strong><span>This deal was cancelled. No further action.</span></li>
      </ol>
    )
  }
  const currentIndex = STEPS.indexOf(deal.status as (typeof STEPS)[number])
  const safeIndex = currentIndex === -1 ? 0 : currentIndex
  return (
    <ol className="timeline">
      {STEPS.map((step, index) => (
        <li key={step} className={`timeline-step ${index < safeIndex ? 'done' : ''} ${index === safeIndex ? 'current' : ''}`}>
          <strong>{step === 'PENDING' ? 'Agreed' : step === 'CONFIRMED' ? 'Confirmed' : 'Completed'}</strong>
          <span>
            {step === 'PENDING' && 'Offer accepted and deal recorded.'}
            {step === 'CONFIRMED' && 'A buyer or seller confirmed the deal.'}
            {step === 'COMPLETED' && (deal.executedAt ? `Marked completed ${new Date(deal.executedAt).toLocaleDateString()}.` : 'Marked completed.')}
          </span>
        </li>
      ))}
      <li className="timeline-status">
        <StatusBadge status={deal.status} />
      </li>
    </ol>
  )
}
