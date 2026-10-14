import { useState, type FormEvent } from 'react'
import { validateRequirementDraft, type RequirementDraft, type RequirementDraftErrors } from '../lib/requirementFeatures'

export type RequirementStatus =
  | 'OPEN'
  | 'PARTIALLY_FULFILLED'
  | 'FULFILLED'
  | 'CANCELLED'
  | 'EXPIRED'

export type ContributionStatus = 'PROPOSED' | 'COMMITTED' | 'FULFILLED' | 'CANCELLED'

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
  const [showForm, setShowForm] = useState(false)

  if (showForm) {
    return (
      <section className="screen requirement-screen">
        <div className="section-header">
          <div><span className="eyebrow">Buyer workspace</span><h2>New requirement</h2></div>
          <button type="button" className="ghost-button" onClick={() => setShowForm(false)}>Back to requirements</button>
        </div>
        <RequirementFormPreview onCancel={() => setShowForm(false)} />
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

      <FeatureUnavailableNotice
        title="Requirement records are not connected"
        description="Requirement routes have appeared in the server worktree, but the API contract and route/service signatures are not aligned yet. MundaLink is not querying or creating records here."
      />

      <div className="requirement-filters" aria-label="Requirement search and filters">
        <label>
          Search requirements
          <input type="search" placeholder="Search produce or location" disabled aria-describedby="requirements-filter-note" />
        </label>
        <label>
          Status
          <select disabled aria-describedby="requirements-filter-note" defaultValue="">
            <option value="">All statuses</option>
          </select>
        </label>
        <p id="requirements-filter-note">Search and status filters will be available when the API supports requirement discovery.</p>
      </div>

      <div className="empty-state requirement-empty" role="status">
        <h3>Your requirements have not been loaded</h3>
        <p>This is not an empty-account result. The client cannot check whether you have saved requirements until the backend exposes the required endpoints.</p>
      </div>
      <RequirementStatusGuide />
    </section>
  )
}

function RequirementFormPreview({ onCancel }: { onCancel: () => void }) {
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
  const [validationComplete, setValidationComplete] = useState(false)
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
    setValidationComplete(true)
  }

  return (
    <div className="requirement-form-panel">
      <div className="feature-preview-note" role="status">
        You can check the draft locally. Saving is unavailable because no requirement endpoint is documented or mounted.
      </div>
      <form onSubmit={handleSubmit} aria-label="Requirement form preview">
        <fieldset>
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
        {validationComplete && Object.keys(errors).length === 0 ? (
          <p className="requirement-validation-success" role="status">The draft passes local checks. It has not been saved or sent to the backend.</p>
        ) : null}
        <div className="requirement-form-actions">
          <button type="button" className="ghost-button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="secondary-button">Check draft</button>
          <button type="submit" className="primary-button" disabled>Save requirement — unavailable</button>
        </div>
      </form>
    </div>
  )
}

export function SellerAggregationSection({ onBrowseMarketplace }: { onBrowseMarketplace: () => void }) {
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
        description="Requirement and contribution routes have appeared in the server worktree, but their API contract and current route/service signatures need alignment. No matching requirements, inventory, or demand totals are being shown."
      />

      <div className="requirement-filters" aria-label="Opportunity search and filters">
        <label>
          Search produce
          <input type="search" placeholder="Commodity or product" disabled />
        </label>
        <label>
          Location
          <input type="text" placeholder="District or town" disabled />
        </label>
        <label>
          Unit
          <input type="text" placeholder="Match the requested unit" disabled />
        </label>
      </div>

      <div className="empty-state requirement-empty" role="status">
        <h3>No live opportunity result is available</h3>
        <p>This does not mean there are no buyers looking for produce. The client cannot query or confirm demand yet.</p>
        <button type="button" className="secondary-button" onClick={onBrowseMarketplace}>Browse the marketplace</button>
      </div>

      <section className="contribution-preview-panel" aria-labelledby="contribution-preview-title">
        <div>
          <span className="eyebrow">Contribution workflow</span>
          <h3 id="contribution-preview-title">Only API-confirmed quantities count</h3>
          <p>Once the backend contract and handlers are verified, sellers can choose an eligible listing and enter a quantity in the requirement's exact unit. Inventory and remaining demand must come from the server.</p>
          <p>Contribution activity history is not available in the current API contract.</p>
        </div>
        <fieldset disabled className="contribution-form-preview">
          <legend>Contribution form preview — unavailable</legend>
          <label>
            Your eligible listing
            <select defaultValue=""><option value="">Listings will load from your account</option></select>
          </label>
          <label>
            Quantity to propose
            <input type="number" min="0" placeholder="Enter quantity in the matching unit" />
          </label>
          <button type="button" className="primary-button" disabled>Continue — unavailable</button>
        </fieldset>
      </section>
      <ContributionStatusGuide />
    </section>
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
