import type { DealStatus, ListingStatus, OfferStatus } from '../types'

const tone: Record<string, 'good' | 'warn' | 'bad' | 'muted'> = {
  ACTIVE: 'good',
  DRAFT: 'muted',
  SOLD: 'muted',
  REJECTED: 'bad',
  PENDING: 'warn',
  ACCEPTED: 'good',
  CONFIRMED: 'good',
  DECLINED: 'bad',
  WITHDRAWN: 'muted',
  EXPIRED: 'muted',
  COMPLETED: 'good',
  CANCELLED: 'bad',
}

export function StatusBadge({ status }: { status: ListingStatus | OfferStatus | DealStatus | string }) {
  const cls = tone[status] ?? 'muted'
  return <span className={`status-pill ${cls}`}>{status}</span>
}
