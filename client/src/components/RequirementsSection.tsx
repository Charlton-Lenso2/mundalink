import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, api } from '../lib/apiClient'
import { validateRequirementDraft, type RequirementDraft, type RequirementDraftErrors } from '../lib/requirementFeatures'
import type { ContributionStatus, Requirement, RequirementStatus } from '../types'

export type { ContributionStatus, RequirementStatus }

export interface RequirementSummary {
  id: string
  title: string
  commodity: string | null
  quantity: string
  unit: string
  location: string | null
  neededBy: string | null
  targetPrice: string | null
  currency: string
  status: RequirementStatus
  committedSupply: string
  remainingDemand: string
  description: string | null
  qualityNotes: string | null
}

export function toRequirementSummary(requirement: Requirement, committedSupply = '0', remainingDemand?: string): RequirementSummary {
  return {
    id: requirement.id,
    title: requirement.title,
    commodity: requirement.commodity,
    quantity: requirement.quantity,
    unit: requirement.unit,
    location: requirement.location,
    neededBy: requirement.neededBy,
    targetPrice: requirement.targetPrice,
    currency: requirement.currency,
    status: requirement.status,
    committedSupply,
    remainingDemand: remainingDemand ?? requirement.quantity,
    description: requirement.description,
    qualityNotes: requirement.qualityNotes,
  }
}

const statusCopy: Record<RequirementStatus, string> = {
  OPEN: 'Open',
  PARTIALLY_FULFILLED: 'Partially fulfilled',
  FULFILLED: 'Fulfilled',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
}

export function RequirementStatusLabel({ status }: { status: RequirementStatus }) {
  return <span className={`requirement-status requirement-status-${status.toLowerCase()}`}>{statusCopy[status]}</span>
}

export function RequirementStatusGuide() {
  const statuses: RequirementStatus[] = ['OPEN', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED', 'EXPIRED']
  return (
    <section className="requirement-status-guide" aria-labelledby="requirement-status-heading">
      <div>
        <span className="eyebrow">Status guide</span>
        <h3 id="requirement-status-heading">Requirement progress</h3>
      </div>
      <ul>
        {statuses.map((status) => (
          <li key={status}>
            <RequirementStatusLabel status={status} />
            <span>{requirementStatusDescription(status)}</span>
          </li>
        ))}
      </ul>
      <p className="muted">
        The current server service permits edits only while OPEN. Cancellation is limited to OPEN or
        PARTIALLY_FULFILLED requirements with no committed supply. The server remains authoritative;
        actions are not enabled until its API contract is aligned and verified.
      </p>
    </section>
  )
}

function requirementStatusDescription(status: RequirementStatus): string {
  const descriptions: Record<RequirementStatus, string> = {
    OPEN: 'The requirement is accepting potential supply.',
    PARTIALLY_FULFILLED: 'Some supply is recorded against the requirement.',
    FULFILLED: 'The requirement has been recorded as fulfilled.',
    CANCELLED: 'The requirement is no longer open.',
    EXPIRED: 'The requirement is past its validity period.',
  }
  return descriptions[status]
}

export function ContributionStatusGuide() {
  const entries: { status: ContributionStatus; title: string; description: string }[] = [
    {
      status: 'PROPOSED',
      title: 'Proposed',
      description: 'A proposal only. It does not reserve listing inventory or count as committed supply.',
    },
    {
      status: 'COMMITTED',
      title: 'Committed',
      description: 'The backend has confirmed the commitment and reserved the corresponding inventory.',
    },
    {
      status: 'FULFILLED',
      title: 'Fulfilled',
      description: 'The backend has recorded fulfilment. This is distinct from a proposal or commitment.',
    },
    {
      status: 'CANCELLED',
      title: 'Cancelled',
      description: 'The contribution is no longer active.',
    },
  ]

  return (
    <section className="contribution-status-guide" aria-labelledby="contribution-status-heading">
      <div>
        <span className="eyebrow">Contribution states</span>
        <h3 id="contribution-status-heading">A proposal is not an order</h3>
      </div>
      <ul>
        {entries.map((entry) => (
          <li key={entry.status}>
            <span className={`contribution-status contribution-status-${entry.status.toLowerCase()}`}>
              {entry.title}
            </span>
            <span>{entry.description}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function RequirementDetails({ requirement }: { requirement: RequirementSummary }) {
  return (
    <section className="requirement-detail-panel" aria-labelledby="requirement-detail-title">
      <div className="requirement-detail-heading">
        <div>
          <span className="eyebrow">Requirement details</span>
          <h3 id="requirement-detail-title">{requirement.title}</h3>
        </div>
        <RequirementStatusLabel status={requirement.status} />
      </div>
      <dl className="requirement-facts">
        <div><dt>Produce</dt><dd>{requirement.commodity ?? 'Not specified'}</dd></div>
        <div><dt>Quantity requested</dt><dd>{requirement.quantity} {requirement.unit}</dd></div>
        <div><dt>Committed supply</dt><dd>{requirement.committedSupply} {requirement.unit}</dd></div>
        <div><dt>Remaining demand</dt><dd>{requirement.remainingDemand} {requirement.unit}</dd></div>
        <div><dt>Location</dt><dd>{requirement.location ?? 'Not specified'}</dd></div>
        <div><dt>Needed by</dt><dd>{requirement.neededBy ? new Date(requirement.neededBy).toLocaleDateString() : 'No date specified'}</dd></div>
        <div>
          <dt>Target price</dt>
          <dd>{requirement.targetPrice === null ? 'Not specified' : `${requirement.currency} ${requirement.targetPrice}/${requirement.unit}`}</dd>
        </div>
      </dl>
      {requirement.description ? <p>{requirement.description}</p> : null}
      {requirement.qualityNotes ? (
        <p><strong>Quality specifications:</strong> {requirement.qualityNotes}</p>
      ) : null}
    </section>
  )
}

export function BuyerRequirementsSection() {
  const [records, setRecords] = useState<RequirementSummary[] | null>(null)
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [recordsError, setRecordsError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [backendAvailable, setBackendAvailable] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function loadMine() {
      setRecordsLoading(true)
      setRecordsError(null)
      try {
        const page = await api.requirements.mine(1, 20)
        if (cancelled) return
        setBackendAvailable(true)
        setRecords(page.items.map((r) => toRequirementSummary(r)))
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 0) {
          setBackendAvailable(false)
          setRecords(null)
        } else {
          setRecordsError(err instanceof Error ? err.message : 'Could not load your requirements.')
        }
      } finally {
        if (!cancelled) setRecordsLoading(false)
      }
    }
    void loadMine()
    return () => {
      cancelled = true
    }
  }, [])

  if (showForm) {
    return (
      <section className="screen requirement-screen">
        <div className="section-header">
          <div><span className="eyebrow">Buyer workspace</span><h2>New requirement</h2></div>
          <button type="button" className="ghost-button" onClick={() => setShowForm(false)}>Back to requirements</button>
        </div>
        <RequirementFormPanel
          onCreated={(created) => {
            setRecords((current) => (current ? [toRequirementSummary(created), ...current] : [toRequirementSummary(created)]))
            setShowForm(false)
          }}
        />
        <RequirementStatusGuide />
      </section>
    )
  }

  if (!backendAvailable) {
    return (
      <section className="screen requirement-screen">
        <div className="section-header">
          <div>
            <span className="eyebrow">Buyer workspace</span>
            <h2>Buyer requirements</h2>
            <p>Describe the produce, quantity, unit, location, and timing you need.</p>
          </div>
        </div>
        <FeatureUnavailableNotice
          title="Requirement records are not connected"
          description="The requirement records panel needs a live backend connection before it can confirm your demand. Server-side quantities and totals are never guessed."
        />
        <RequirementStatusGuide />
      </section>
    )
  }

  return (
    <section className="screen requirement-screen">
      <div className="section-header">
        <div>
          <span className="eyebrow">Buyer workspace</span>
          <h2>Buyer requirements</h2>
          <p>Describe the produce, quantity, unit, location, and timing you need.</p>
        </div>
        <button type="button" className="primary-button" onClick={() => setShowForm(true)}>
          Draft a requirement
        </button>
      </div>

      {recordsLoading ? <div className="empty-state" role="status">Loading your requirements…</div> : null}
      {recordsError ? <div className="notice error" role="alert">{recordsError}</div> : null}
      {!recordsLoading && !recordsError && records !== null && records.length === 0 ? (
        <div className="empty-state requirement-empty" role="status">
          <h3>No requirements yet</h3>
          <p>Draft your first requirement above — it opens at status OPEN for sellers to propose supply.</p>
        </div>
      ) : null}
      {!recordsLoading && records !== null && records.length > 0 ? (
        <div className="stack-list" role="list" aria-label="Your requirements">
          {records.map((requirement) => (
            <div key={requirement.id} role="listitem">
              <RequirementDetails requirement={requirement} />
            </div>
          ))}
        </div>
      ) : null}
      <RequirementStatusGuide />
    </section>
  )
}

function RequirementFormPanel({ onCreated }: { onCreated: (created: Requirement) => void }) {
  const [draft, setDraft] = useState<RequirementDraft>({
    title: '',
    commodity: '',
    quantity: '',
    unit: '',
    location: '',
    neededBy: '',
    targetPrice: '',
    currency: 'USD',
    description: '',
    qualityNotes: '',
  })
  const [errors, setErrors] = useState<RequirementDraftErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const fields: { key: keyof RequirementDraft; label: string; type?: string; placeholder?: string }[] = [
    { key: 'title', label: 'Requirement title', placeholder: 'e.g. Supply for a school feeding programme' },
    { key: 'commodity', label: 'Produce or commodity', placeholder: 'e.g. white maize' },
    { key: 'quantity', label: 'Quantity', type: 'number', placeholder: 'Enter the amount needed' },
    { key: 'unit', label: 'Unit', placeholder: 'e.g. tonnes, 50 kg bags, crates' },
    { key: 'location', label: 'Delivery or collection location', placeholder: 'District, town, or area' },
    { key: 'neededBy', label: 'Needed by', type: 'date' },
    { key: 'targetPrice', label: 'Target price (optional)', type: 'number', placeholder: 'Amount per unit' },
    { key: 'currency', label: 'Currency', placeholder: 'ISO currency code, e.g. USD' },
    { key: 'description', label: 'Additional details', placeholder: 'Explain timing or other requirements' },
    { key: 'qualityNotes', label: 'Quality specifications', placeholder: 'Describe grade, moisture, packaging, or other requirements' },
  ]

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors = validateRequirementDraft(draft)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    setSubmitting(true)
    setServerError(null)
    void api.requirements.create({
      title: draft.title.trim(),
      quantity: draft.quantity.trim(),
      unit: draft.unit.trim(),
      description: draft.description.trim() || null,
      qualityNotes: draft.qualityNotes.trim() || null,
      category: null,
      commodity: draft.commodity.trim() || null,
      location: draft.location.trim() || null,
      neededBy: draft.neededBy.trim() || null,
      targetPrice: draft.targetPrice.trim() || null,
      currency: draft.currency.trim() || 'USD',
    }).then(
      (created) => {
        setSubmitting(false)
        onCreated(created)
      },
      (err: unknown) => {
        setSubmitting(false)
        setServerError(err instanceof Error ? err.message : 'Could not save the requirement.')
      },
    )
  }

  return (
    <div className="requirement-form-panel">
      <form onSubmit={handleSubmit} aria-label="Requirement form">
        <fieldset disabled={submitting}>
          <legend>Requirement information</legend>
          <div className="requirement-form-grid">
            {fields.map((field) => (
              <label key={field.key} className={field.key === 'description' || field.key === 'qualityNotes' ? 'requirement-field-wide' : ''}>
                {field.label}
                {field.key === 'description' || field.key === 'qualityNotes' ? (
                  <textarea
                    rows={3}
                    placeholder={field.placeholder}
                    value={draft[field.key]}
                    onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                    aria-invalid={Boolean(errors[field.key])}
                  />
                ) : (
                  <input
                    type={field.type ?? 'text'}
                    placeholder={field.placeholder}
                    min={field.type === 'number' ? '0' : undefined}
                    step={field.key === 'quantity' || field.key === 'targetPrice' ? 'any' : undefined}
                    value={draft[field.key]}
                    onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                    aria-invalid={Boolean(errors[field.key])}
                    aria-describedby={errors[field.key] ? `${field.key}-error` : undefined}
                  />
                )}
                {errors[field.key] ? <span className="field-error" id={`${field.key}-error`}>{errors[field.key]}</span> : null}
              </label>
            ))}
          </div>
        </fieldset>
        {serverError ? <div className="notice error" role="alert">{serverError}</div> : null}
        <div className="requirement-form-actions">
          <button type="submit" className="primary-button" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save requirement'}
          </button>
        </div>
      </form>
    </div>
  )
}

export function SellerAggregationSection({ onBrowseMarketplace }: { onBrowseMarketplace: () => void }) {
  const [filters, setFilters] = useState({ commodity: '', location: '', unit: '' })
  const [applied, setApplied] = useState({ commodity: '', location: '', unit: '' })
  const [records, setRecords] = useState<RequirementSummary[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [backendAvailable, setBackendAvailable] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function loadOpen() {
      setLoading(true)
      setError(null)
      try {
        const page = await api.requirements.listOpen({
          commodity: applied.commodity || undefined,
          location: applied.location || undefined,
          unit: applied.unit || undefined,
          page: 1,
          limit: 20,
        })
        if (cancelled) return
        setBackendAvailable(true)
        setRecords(page.items.map((r) => toRequirementSummary(r)))
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 0) {
          setBackendAvailable(false)
          setRecords(null)
        } else {
          setError(err instanceof Error ? err.message : 'Could not load open requirements.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadOpen()
    return () => {
      cancelled = true
    }
  }, [applied])

  if (!backendAvailable) {
    return (
      <section className="screen requirement-screen">
        <div className="section-header">
          <div>
            <span className="eyebrow">Seller workspace</span>
            <h2>Aggregation opportunities</h2>
            <p>Explore buyer demand that could match produce you have listed.</p>
          </div>
        </div>
        <FeatureUnavailableNotice
          title="Matching opportunities cannot be checked yet"
          description="The client needs a live backend connection before it can confirm buyer demand. No demand, inventory, or totals are guessed."
        />
        <ContributionStatusGuide />
      </section>
    )
  }

  return (
    <section className="screen requirement-screen">
      <div className="section-header">
        <div>
          <span className="eyebrow">Seller workspace</span>
          <h2>Aggregation opportunities</h2>
          <p>Explore buyer demand that could match produce you have listed.</p>
        </div>
      </div>

      <form
        className="requirement-filters"
        aria-label="Opportunity search and filters"
        onSubmit={(event) => {
          event.preventDefault()
          setApplied({ ...filters })
        }}
      >
        <label>
          Search produce
          <input
            type="search"
            placeholder="Commodity or product"
            value={filters.commodity}
            onChange={(event) => setFilters((current) => ({ ...current, commodity: event.target.value }))}
          />
        </label>
        <label>
          Location
          <input
            type="text"
            placeholder="District or town"
            value={filters.location}
            onChange={(event) => setFilters((current) => ({ ...current, location: event.target.value }))}
          />
        </label>
        <label>
          Unit
          <input
            type="text"
            placeholder="Match the requested unit"
            value={filters.unit}
            onChange={(event) => setFilters((current) => ({ ...current, unit: event.target.value }))}
          />
        </label>
        <p>
          <button type="submit" className="secondary-button">Search demand</button>
        </p>
      </form>

      {loading ? <div className="empty-state" role="status">Checking buyer demand…</div> : null}
      {error ? <div className="notice error" role="alert">{error}</div> : null}
      {!loading && !error && records !== null && records.length === 0 ? (
        <div className="empty-state requirement-empty" role="status">
          <h3>No matching open demand</h3>
          <p>No OPEN or PARTIALLY_FULFILLED requirements match these filters right now.</p>
          <button type="button" className="secondary-button" onClick={onBrowseMarketplace}>Browse the marketplace</button>
        </div>
      ) : null}
      {!loading && records !== null && records.length > 0 ? (
        <div className="stack-list" role="list" aria-label="Open buyer demand">
          {records.map((requirement) => (
            <div key={requirement.id} role="listitem">
              <RequirementDetails requirement={requirement} />
              <ProposeContributionForm requirementId={requirement.id} unit={requirement.unit} />
            </div>
          ))}
        </div>
      ) : null}

      <ContributionStatusGuide />
    </section>
  )
}

function ProposeContributionForm({ requirementId, unit }: { requirementId: string; unit: string }) {
  const [listings, setListings] = useState<{ id: string; title: string }[]>([])
  const [listingId, setListingId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadListings() {
      try {
        const page = await api.listings.list({ limit: 50 })
        if (cancelled) return
        setListings(page.items.map((l) => ({ id: l.id, title: l.title })))
      } catch {
        if (!cancelled) setListings([])
      }
    }
    void loadListings()
    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!listingId) {
      setFormError('Choose one of your listings.')
      return
    }
    if (!quantity || Number(quantity) <= 0) {
      setFormError('Enter a quantity greater than zero.')
      return
    }
    setSubmitting(true)
    setFormError(null)
    setMessage(null)
    void api.requirements.propose(requirementId, { listingId, quantity }).then(
      () => {
        setSubmitting(false)
        setMessage(`Proposal recorded for ${quantity} ${unit}. The buyer confirms it before anything is reserved.`)
        setQuantity('')
      },
      (err: unknown) => {
        setSubmitting(false)
        setFormError(err instanceof Error ? err.message : 'Could not record the proposal.')
      },
    )
  }

  return (
    <form className="contribution-form-preview" aria-label={`Propose supply for requirement ${requirementId}`} onSubmit={handleSubmit}>
      <label>
        Your eligible listing
        <select value={listingId} onChange={(event) => setListingId(event.target.value)}>
          <option value="">Choose a listing</option>
          {listings.map((listing) => (
            <option key={listing.id} value={listing.id}>{listing.title}</option>
          ))}
        </select>
      </label>
      <label>
        Quantity to propose (in {unit} — exact match, no conversion)
        <input
          type="number"
          min="0"
          step="any"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          placeholder={`Enter quantity in ${unit}`}
        />
      </label>
      {formError ? <div className="notice error" role="alert">{formError}</div> : null}
      {message ? <div className="requirement-validation-success" role="status">{message}</div> : null}
      <button type="submit" className="primary-button" disabled={submitting}>
        {submitting ? 'Recording…' : 'Propose supply'}
      </button>
    </form>
  )
}

function FeatureUnavailableNotice({ title, description }: { title: string; description: string }) {
  return (
    <div className="feature-unavailable" role="status">
      <span className="feature-unavailable-mark" aria-hidden="true">i</span>
      <div><h3>{title}</h3><p>{description}</p></div>
    </div>
  )
}
