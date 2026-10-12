export function HeroSection({ onBrowse, onCreate }: { onBrowse: () => void; onCreate: () => void }) {
  return (
    <section className="hero-panel">
      <div className="eyebrow">Zimbabwe commodity network</div>
      <h1>Trade with confidence from farm gate to buyer.</h1>
      <p>
        Discover produce listings, make offers, and track agreed deals to completion with clear status visibility.
      </p>

      <div className="cta-row">
        <button type="button" className="primary-button" onClick={onBrowse}>Browse listings</button>
        <button type="button" className="secondary-button" onClick={onCreate}>Create a listing</button>
      </div>

      <div className="hero-metrics">
        <div>
          <strong>Discover</strong>
          <span>search produce by commodity and location</span>
        </div>
        <div>
          <strong>Offer</strong>
          <span>negotiate quantity and price</span>
        </div>
        <div>
          <strong>Fulfil</strong>
          <span>confirm and complete agreed deals</span>
        </div>
      </div>
    </section>
  )
}
