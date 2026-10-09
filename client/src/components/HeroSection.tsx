export function HeroSection() {
  return (
    <section className="hero-panel">
      <div className="eyebrow">Zimbabwe commodity network</div>
      <h1>Trade with confidence from farm gate to buyer.</h1>
      <p>
        Source grains, legumes, vegetables, and seasonal inputs from verified market participants with clear status visibility.
      </p>

      <div className="cta-row">
        <button type="button" className="primary-button">Browse listings</button>
        <button type="button" className="secondary-button">Create a listing</button>
      </div>

      <div className="hero-metrics">
        <div>
          <strong>1,340</strong>
          <span>market checks</span>
        </div>
        <div>
          <strong>94%</strong>
          <span>timely delivery</span>
        </div>
        <div>
          <strong>48h</strong>
          <span>average offer cycle</span>
        </div>
      </div>
    </section>
  )
}
