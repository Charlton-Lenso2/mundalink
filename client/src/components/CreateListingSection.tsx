interface CreateListingSectionProps {
  form: {
    title: string
    description: string
    commodity: string
    category: string
    quantity: string
    unit: string
    pricePerUnit: string
    availableQuantity: string
    currency: string
    location: string
  }
  onFieldChange: (field: string, value: string) => void
  onSubmit: () => void
  submitting: boolean
}

const categoryOptions = ['Cereals', 'Legumes', 'Vegetables', 'Fruits', 'Livestock', 'Inputs']

export function CreateListingSection({ form, onFieldChange, onSubmit, submitting }: CreateListingSectionProps) {
  return (
    <section className="screen create-screen">
      <div className="section-header">
        <div>
          <span className="eyebrow">Create listing</span>
          <h2>List produce or input stock</h2>
        </div>
      </div>

      <form className="listing-form" onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}>
        <div className="split-fields">
          <label className="field">
            <span>Listing title</span>
            <input value={form.title} onChange={(event) => onFieldChange('title', event.target.value)} placeholder="e.g. Grade A maize harvest" required />
          </label>
          <label className="field">
            <span>Commodity</span>
            <input value={form.commodity} onChange={(event) => onFieldChange('commodity', event.target.value)} placeholder="e.g. White maize" required />
          </label>
        </div>

        <div className="split-fields">
          <label className="field">
            <span>Category</span>
            <select value={form.category} onChange={(event) => onFieldChange('category', event.target.value)}>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Location</span>
            <input value={form.location} onChange={(event) => onFieldChange('location', event.target.value)} placeholder="e.g. Chiredzi" required />
          </label>
        </div>

        <label className="field">
          <span>Description</span>
          <textarea value={form.description} onChange={(event) => onFieldChange('description', event.target.value)} rows={5} placeholder="Describe quality, storage, packing, and collection terms." required />
        </label>

        <div className="split-fields">
          <label className="field">
            <span>Quantity</span>
            <input type="number" min="0.000001" step="0.000001" value={form.quantity} onChange={(event) => onFieldChange('quantity', event.target.value)} required />
          </label>
          <label className="field">
            <span>Unit</span>
            <input value={form.unit} onChange={(event) => onFieldChange('unit', event.target.value)} placeholder="bags" required />
          </label>
        </div>

        <label className="field">
          <span>Available quantity (same unit)</span>
          <input type="number" min="0" max={form.quantity || undefined} step="0.000001" value={form.availableQuantity} onChange={(event) => onFieldChange('availableQuantity', event.target.value)} required />
        </label>

        <div className="split-fields">
          <label className="field">
            <span>Price per unit</span>
            <input type="number" min="0" step="0.000001" value={form.pricePerUnit} onChange={(event) => onFieldChange('pricePerUnit', event.target.value)} required />
          </label>
          <label className="field">
            <span>Currency</span>
            <select value={form.currency} onChange={(event) => onFieldChange('currency', event.target.value)}>
              <option value="USD">USD</option>
              <option value="ZWL">ZWL</option>
              <option value="ZAR">ZAR</option>
            </select>
          </label>
        </div>

        <button type="submit" className="primary-button" disabled={submitting}>{submitting ? 'Saving listing...' : 'Save as draft'}</button>
      </form>
    </section>
  )
}

