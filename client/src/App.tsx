import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth'
import './App.css'
import { AuthSection } from './components/AuthSection'
import { CreateListingSection } from './components/CreateListingSection'
import { DashboardSection } from './components/DashboardSection'
import { FeaturePanel } from './components/FeaturePanel'
import { HeroSection } from './components/HeroSection'
import { ProfileSection } from './components/ProfileSection'
import { api } from './lib/api'
import { auth } from './lib/firebase'
import type { Deal, Listing, Offer, Profile } from './types'

type View = 'discover' | 'marketplace' | 'auth' | 'create' | 'dashboard' | 'profile'

type ListingForm = {
  title: string
  description: string
  commodity: string
  category: string
  quantity: string
  unit: string
  price: string
  currency: string
  location: string
}

type OfferForm = {
  quantity: string
  price: string
  message: string
}

type AuthMode = 'signin' | 'signup'

const emptyListingForm: ListingForm = {
  title: '',
  description: '',
  commodity: '',
  category: 'Cereals',
  quantity: '',
  unit: 'bags',
  price: '',
  currency: 'USD',
  location: '',
}

const emptyOfferForm: OfferForm = {
  quantity: '',
  price: '',
  message: '',
}

const categoryOptions = ['All', 'Cereals', 'Legumes', 'Vegetables', 'Fruits', 'Livestock', 'Inputs']
const locationOptions = ['All', 'Harare', 'Mutoko', 'Bulawayo', 'Chinhoyi', 'Gweru']

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

function App() {
  const [view, setView] = useState<View>('discover')
  const [user, setUser] = useState<User | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [offers, setOffers] = useState<Offer[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [apiHealth, setApiHealth] = useState({
    ok: true,
    status: 'demo',
    mode: 'mock' as 'live' | 'mock',
    message: 'Demo data mode enabled.',
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [selectedLocation, setSelectedLocation] = useState('All')
  const [page, setPage] = useState(1)
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null)
  const [listingForm, setListingForm] = useState<ListingForm>(emptyListingForm)
  const [offerForm, setOfferForm] = useState<OfferForm>(emptyOfferForm)
  const [authMode, setAuthMode] = useState<AuthMode>('signin')
  const [authForm, setAuthForm] = useState({ email: '', password: '', displayName: '' })
  const [authError, setAuthError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [listingSubmitting, setListingSubmitting] = useState(false)
  const [offerSubmitting, setOfferSubmitting] = useState(false)
  const [profileDraft, setProfileDraft] = useState<Profile | null>(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
    })

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const [health, nextListings, nextProfile, nextOffers, nextDeals] = await Promise.all([
          api.health(),
          api.listings.list(),
          api.profile.me(),
          api.offers.mine(),
          api.deals.mine(),
        ])
        setApiHealth(health)
        setListings(nextListings)
        setProfile(nextProfile)
        setOffers(nextOffers)
        setDeals(nextDeals)
        setProfileDraft(nextProfile)
        if (nextListings[0]) {
          setSelectedListingId(nextListings[0].id)
        }
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : 'Could not load market data.'
        setError(message)
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [])

  const filteredListings = useMemo(() => {
    const normalizedQuery = searchTerm.trim().toLowerCase()
    return listings.filter((listing) => {
      const matchesSearch =
        normalizedQuery.length === 0 ||
        listing.title.toLowerCase().includes(normalizedQuery) ||
        listing.commodity.toLowerCase().includes(normalizedQuery) ||
        listing.location.toLowerCase().includes(normalizedQuery)

      const matchesCategory = selectedCategory === 'All' || listing.category === selectedCategory
      const matchesLocation =
        selectedLocation === 'All' || listing.location.toLowerCase().includes(selectedLocation.toLowerCase())

      return matchesSearch && matchesCategory && matchesLocation
    })
  }, [listings, searchTerm, selectedCategory, selectedLocation])

  const itemsPerPage = 4
  const pageCount = Math.max(1, Math.ceil(filteredListings.length / itemsPerPage))
  const visibleListings = filteredListings.slice((page - 1) * itemsPerPage, page * itemsPerPage)
  const selectedListing = listings.find((entry) => entry.id === selectedListingId) ?? visibleListings[0] ?? null
  const featuredListings = listings.slice(0, 3)

  const handleAuthSubmit = async () => {
    setAuthError(null)
    setAuthLoading(true)

    try {
      if (authMode === 'signin') {
        await signInWithEmailAndPassword(auth, authForm.email, authForm.password)
      } else {
        await createUserWithEmailAndPassword(auth, authForm.email, authForm.password)
      }

      setAuthForm({ email: '', password: '', displayName: '' })
      setView('dashboard')
    } catch (authFailure) {
      const nextMessage = authFailure instanceof Error ? authFailure.message : 'Authentication failed.'
      setAuthError(nextMessage)
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = async () => {
    await signOut(auth)
    setView('discover')
  }

  const handleCreateListing = async () => {
    if (!profile) {
      setError('Please sign in to create a listing.')
      setView('auth')
      return
    }

    setListingSubmitting(true)
    setError(null)

    try {
      const payload = {
        title: listingForm.title,
        description: listingForm.description,
        commodity: listingForm.commodity,
        category: listingForm.category as Listing['category'],
        quantity: Number(listingForm.quantity),
        unit: listingForm.unit,
        price: Number(listingForm.price),
        currency: listingForm.currency,
        location: listingForm.location,
      }

      const created = await api.listings.create(payload)
      setListings((current) => [created, ...current])
      setListingForm(emptyListingForm)
      setSelectedListingId(created.id)
      setView('marketplace')
    } catch (creationError) {
      const message = creationError instanceof Error ? creationError.message : 'Unable to create listing.'
      setError(message)
    } finally {
      setListingSubmitting(false)
    }
  }

  const handleOfferSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()

    if (!selectedListing) {
      setError('Choose a listing before submitting an offer.')
      return
    }

    if (!user) {
      setError('You need to sign in before creating an offer.')
      setView('auth')
      return
    }

    if (!offerForm.quantity || !offerForm.price) {
      setError('Please enter both quantity and offered price.')
      return
    }

    setOfferSubmitting(true)
    setError(null)

    try {
      await api.offers.create({
        listingId: selectedListing.id,
        quantity: Number(offerForm.quantity),
        price: Number(offerForm.price),
        currency: selectedListing.currency,
        message: offerForm.message,
      })

      const updatedOffers = await api.offers.mine()
      setOffers(updatedOffers)
      setOfferForm(emptyOfferForm)
      setView('dashboard')
    } catch (offerError) {
      const message = offerError instanceof Error ? offerError.message : 'Unable to submit offer.'
      setError(message)
    } finally {
      setOfferSubmitting(false)
    }
  }

  const handleProfileSave = async () => {
    if (!profileDraft) {
      return
    }

    try {
      const saved = await api.profile.update(profileDraft)
      setProfile(saved)
      setProfileDraft(saved)
      setView('dashboard')
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : 'Unable to save profile.'
      setError(message)
    }
  }

  const renderDiscover = () => (
    <section className="discover-shell">
      <div className="discover-main">
        <HeroSection />
      </div>
      <FeaturePanel />

      <div className="section-header section-header-featured">
        <div>
          <span className="eyebrow">Featured listings</span>
          <h2>High-interest opportunities</h2>
        </div>
        <button type="button" className="ghost-button" onClick={() => setView('marketplace')}>
          Open marketplace
        </button>
      </div>

      <div className="featured-grid">
        {featuredListings.map((listing) => (
          <button
            key={listing.id}
            type="button"
            className="listing-card featured"
            onClick={() => {
              setSelectedListingId(listing.id)
              setView('marketplace')
            }}
          >
            <div className="listing-header">
              <div>
                <span className="listing-badge">{listing.category}</span>
                <h3>{listing.title}</h3>
              </div>
              <strong>{money.format(listing.price)}/{listing.unit}</strong>
            </div>
            <div className="meta-row">
              <span>{listing.quantity} {listing.unit}</span>
              <span>{listing.location}</span>
            </div>
            <p>{listing.commodity}</p>
          </button>
        ))}
      </div>
    </section>
  )

  const renderMarketplace = () => (
    <section className="screen marketplace-screen">
      <div className="section-header">
        <div>
          <span className="eyebrow">Marketplace</span>
          <h2>Browse active listings</h2>
        </div>
      </div>

      <div className="toolbar">
        <label className="field inline-field search-field">
          <span>Search</span>
          <input
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value)
              setPage(1)
            }}
            placeholder="Search commodity or location"
          />
        </label>

        <label className="field inline-field">
          <span>Category</span>
          <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </label>

        <label className="field inline-field">
          <span>Location</span>
          <select value={selectedLocation} onChange={(event) => setSelectedLocation(event.target.value)}>
            {locationOptions.map((location) => (
              <option key={location} value={location}>{location}</option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="loading-state">Loading listings...</div>
      ) : filteredListings.length === 0 ? (
        <div className="empty-state">No listings match your current search.</div>
      ) : (
        <div className="marketplace-grid">
          <div className="listing-list">
            {visibleListings.map((listing) => (
              <button
                key={listing.id}
                type="button"
                className={selectedListing?.id === listing.id ? 'listing-card selected' : 'listing-card'}
                onClick={() => setSelectedListingId(listing.id)}
              >
                <div className="listing-header space-between">
                  <span className="listing-badge">{listing.category}</span>
                  <span className={listing.status === 'Available' ? 'status-pill available' : 'status-pill'}>{listing.status}</span>
                </div>
                <h3>{listing.title}</h3>
                <div className="meta-row">
                  <span>{listing.quantity} {listing.unit}</span>
                  <span>{listing.location}</span>
                </div>
                <div className="price-line">
                  <strong>{money.format(listing.price)}</strong>
                  <span>per {listing.unit}</span>
                </div>
                <p>{listing.sellerName}</p>
              </button>
            ))}

            <div className="pagination">
              <button type="button" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                Previous
              </button>
              <span>{page} / {pageCount}</span>
              <button type="button" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>
                Next
              </button>
            </div>
          </div>

          {selectedListing ? (
            <aside className="listing-detail">
              <div className="detail-topbar">
                <span className="listing-badge">{selectedListing.category}</span>
                <span className={selectedListing.status === 'Available' ? 'status-pill available' : 'status-pill'}>{selectedListing.status}</span>
              </div>
              <h3>{selectedListing.title}</h3>
              <p className="detail-subtitle">{selectedListing.commodity}</p>
              <div className="price-display">
                {money.format(selectedListing.price)}
                <span> per {selectedListing.unit}</span>
              </div>

              <dl className="detail-meta">
                <div>
                  <dt>Quantity</dt>
                  <dd>{selectedListing.quantity} {selectedListing.unit}</dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>{selectedListing.location}</dd>
                </div>
                <div>
                  <dt>Seller</dt>
                  <dd>{selectedListing.sellerName}</dd>
                </div>
                <div>
                  <dt>Posted</dt>
                  <dd>{new Date(selectedListing.createdAt).toLocaleDateString('en-ZW', { dateStyle: 'medium' })}</dd>
                </div>
              </dl>

              <p>{selectedListing.description}</p>

              <form className="offer-form" onSubmit={handleOfferSubmit}>
                <h4>Submit an offer</h4>
                <div className="split-fields">
                  <label className="field">
                    <span>Quantity</span>
                    <input
                      type="number"
                      min="1"
                      value={offerForm.quantity}
                      onChange={(event) => setOfferForm((current) => ({ ...current, quantity: event.target.value }))}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Offered price</span>
                    <input
                      type="number"
                      min="1"
                      value={offerForm.price}
                      onChange={(event) => setOfferForm((current) => ({ ...current, price: event.target.value }))}
                      required
                    />
                  </label>
                </div>

                <label className="field">
                  <span>Message</span>
                  <textarea
                    value={offerForm.message}
                    rows={4}
                    onChange={(event) => setOfferForm((current) => ({ ...current, message: event.target.value }))}
                    placeholder="Share collection timing, delivery preferences, or payment terms."
                  />
                </label>

                <button type="submit" className="primary-button" disabled={offerSubmitting || !user}>
                  {offerSubmitting ? 'Submitting offer...' : user ? 'Create offer' : 'Sign in to offer'}
                </button>
              </form>
            </aside>
          ) : null}
        </div>
      )}
    </section>
  )

  return (
    <div className="site-shell">
      <header className="topbar">
        <div className="brand-wrap">
          <div className="brand-mark">M</div>
          <div>
            <div className="brand-name">MundaLink</div>
            <div className="brand-subtitle">Agricultural market coordination</div>
          </div>
        </div>

        <nav className="main-nav" aria-label="Primary navigation">
          {(['discover', 'marketplace', 'create', 'dashboard', 'profile'] as View[]).map((item) => (
            <button
              key={item}
              type="button"
              className={view === item ? 'nav-button active' : 'nav-button'}
              onClick={() => setView(item)}
            >
              {item === 'discover' && 'Discover'}
              {item === 'marketplace' && 'Marketplace'}
              {item === 'create' && 'Create Listing'}
              {item === 'dashboard' && 'Dashboard'}
              {item === 'profile' && 'Profile'}
            </button>
          ))}
        </nav>

        <div className="topbar-actions">
          <span className={apiHealth.mode === 'mock' ? 'status-badge demo' : 'status-badge live'}>
            {apiHealth.mode === 'mock' ? 'Demo data' : 'Live API'}
          </span>
          {user ? (
            <button type="button" className="primary-button small" onClick={handleLogout}>
              Sign out
            </button>
          ) : (
            <button type="button" className="primary-button small" onClick={() => setView('auth')}>
              Sign in
            </button>
          )}
        </div>
      </header>

      {apiHealth.message ? <div className="api-banner" role="status">{apiHealth.message}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <main className="main-content">
        {view === 'discover' && renderDiscover()}
        {view === 'marketplace' && renderMarketplace()}
        {view === 'auth' && (
          <AuthSection
            authMode={authMode}
            onAuthModeChange={setAuthMode}
            email={authForm.email}
            onEmailChange={(value) => setAuthForm((current) => ({ ...current, email: value }))}
            password={authForm.password}
            onPasswordChange={(value) => setAuthForm((current) => ({ ...current, password: value }))}
            displayName={authForm.displayName}
            onDisplayNameChange={(value) => setAuthForm((current) => ({ ...current, displayName: value }))}
            authError={authError}
            authLoading={authLoading}
            onSubmit={handleAuthSubmit}
          />
        )}
        {view === 'create' && (
          <CreateListingSection
            form={listingForm}
            onFieldChange={(field, value) => setListingForm((current) => ({ ...current, [field]: value }))}
            onSubmit={handleCreateListing}
            submitting={listingSubmitting}
          />
        )}
        {view === 'dashboard' && <DashboardSection profile={profile} listings={listings} offers={offers} deals={deals} />}
        {view === 'profile' && (
          <ProfileSection
            profileDraft={profileDraft}
            onProfileDraftChange={setProfileDraft}
            onSave={handleProfileSave}
          />
        )}
      </main>
    </div>
  )
}

export default App

