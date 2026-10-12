// MundaLink App shell — contract-aligned marketplace + fulfilment tracker.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
import { DealsSection } from './components/DealsSection'
import { FeaturePanel } from './components/FeaturePanel'
import { HeroSection } from './components/HeroSection'
import { ListingDetailSection } from './components/ListingDetailSection'
import { MarketplaceSection } from './components/MarketplaceSection'
import { OffersSection } from './components/OffersSection'
import { ProfileSection } from './components/ProfileSection'
import { ToastStack, type Toast } from './components/ToastStack'
import { ApiError, api } from './lib/apiClient'
import { auth } from './lib/firebase'
import type { Deal, Listing, Offer, Profile } from './types'

export type View =
  | 'discover' | 'marketplace' | 'auth' | 'create'
  | 'dashboard' | 'profile' | 'listing' | 'offers' | 'deals'

type ListingForm = {
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

type OfferForm = { quantity: string; price: string; message: string }
type AuthMode = 'signin' | 'signup'

const emptyListingForm: ListingForm = {
  title: '', description: '', commodity: '', category: 'Cereals',
  quantity: '', unit: 'bags', pricePerUnit: '', availableQuantity: '',
  currency: 'USD', location: '',
}

const emptyOfferForm: OfferForm = { quantity: '', price: '', message: '' }

let toastId = 1

function App() {
  const [view, setView] = useState<View>('discover')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [user, setUser] = useState<User | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [offers, setOffers] = useState<Offer[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [apiHealth, setApiHealth] = useState({ ok: true, status: 'demo', mode: 'mock' as 'live' | 'mock', message: 'Connecting…' })
  const [loading, setLoading] = useState(true)
  const [listingsLoading, setListingsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(!navigator.onLine)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [selectedLocation, setSelectedLocation] = useState('All')
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null)
  const [listingForm, setListingForm] = useState<ListingForm>(emptyListingForm)
  const [offerForm, setOfferForm] = useState<OfferForm>(emptyOfferForm)
  const [authMode, setAuthMode] = useState<AuthMode>('signin')
  const [authForm, setAuthForm] = useState({ email: '', password: '', displayName: '' })
  const [authError, setAuthError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [listingSubmitting, setListingSubmitting] = useState(false)
  const [listingError, setListingError] = useState<string | null>(null)
  const [offerSubmitting, setOfferSubmitting] = useState(false)
  const [offerError, setOfferError] = useState<string | null>(null)
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null)
  const [busyDealId, setBusyDealId] = useState<string | null>(null)
  const [profileDraft, setProfileDraft] = useState<Profile | null>(null)
  const [profileSaving, setProfileSaving] = useState(false)

  const pushToast = useCallback((kind: Toast['kind'], message: string) => {
    const id = toastId++
    setToasts((current) => [...current, { id, kind, message }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id))
    }, 5000)
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  useEffect(() => {
    const onOnline = () => setOffline(false)
    const onOffline = () => setOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const refreshUserData = useCallback(async () => {
    if (!auth.currentUser) {
      setProfile(null)
      setProfileDraft(null)
      setOffers([])
      setDeals([])
      return
    }
    try {
      const [nextProfile, nextOffers, nextDeals] = await Promise.all([
        api.profile.me(),
        api.offers.mine(),
        api.deals.mine(),
      ])
      setProfile(nextProfile)
      setProfileDraft(nextProfile)
      setOffers(nextOffers)
      setDeals(nextDeals)
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Could not load your offers and deals.'
      setError(message)
    }
  }, [])

  const refreshListings = useCallback(async () => {
    setListingsLoading(true)
    try {
      const result = await api.listings.list({
        search: searchTerm.trim() || undefined,
        category: selectedCategory === 'All' ? undefined : selectedCategory,
        location: selectedLocation === 'All' ? undefined : selectedLocation,
        page,
        limit: 9,
      })
      setListings(result.items)
      setPageCount(Math.max(1, result.totalPages))
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Could not load listings.'
      setError(message)
    } finally {
      setListingsLoading(false)
    }
  }, [searchTerm, selectedCategory, selectedLocation, page])

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setError(null)
      try {
        const health = await api.health()
        setApiHealth(health)
        await refreshListings()
        await refreshUserData()
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : 'Could not load market data.'
        setError(message)
      } finally {
        setLoading(false)
      }
    }
    void loadData()
  }, [refreshListings, refreshUserData])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshListings()
    }, 350)
    return () => window.clearTimeout(timer)
  }, [refreshListings])

  // Sync signed-in user data without setState-in-effect: the auth listener
  // below is the only subscription, and refreshes fire from its callback.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      if (nextUser) void refreshUserData()
      else {
        setProfile(null)
        setProfileDraft(null)
        setOffers([])
        setDeals([])
      }
    })
    return () => unsubscribe()
  }, [refreshUserData])

  const selectedListing = useMemo(
    () => listings.find((entry) => entry.id === selectedListingId) ?? null,
    [listings, selectedListingId],
  )
  const featuredListings = useMemo(() => listings.slice(0, 3), [listings])

  const openListing = useCallback((id: string) => {
    setSelectedListingId(id)
    setOfferForm({ quantity: '', price: '', message: '' })
    setOfferError(null)
    setView('listing')
  }, [])

  const handleAuthSubmit = async () => {
    setAuthError(null)
    setAuthLoading(true)
    try {
      if (authMode === 'signup') {
        await createUserWithEmailAndPassword(auth, authForm.email, authForm.password)
      } else {
        await signInWithEmailAndPassword(auth, authForm.email, authForm.password)
      }
      setAuthForm({ email: '', password: '', displayName: '' })
      await refreshUserData()
      await refreshListings()
      pushToast('success', 'Signed in. Your offers and deals are loading.')
      setView('dashboard')
    } catch (authFailure) {
      const message = authFailure instanceof Error ? authFailure.message : 'Authentication failed.'
      setAuthError(message)
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = async () => {
    await signOut(auth)
    setProfile(null)
    setProfileDraft(null)
    setOffers([])
    setDeals([])
    setView('discover')
    setMobileNavOpen(false)
  }

  const navigateTo = (nextView: View) => {
    setView(nextView)
    setMobileNavOpen(false)
    if (mobileNavOpen) menuButtonRef.current?.focus()
  }

  useEffect(() => {
    if (!mobileNavOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileNavOpen(false)
        menuButtonRef.current?.focus()
        return
      }

      if (event.key === 'Tab' && sidebarRef.current) {
        const focusable = sidebarRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
        )
        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [mobileNavOpen])

  const handleCreateListing = async () => {
    if (!user) {
      pushToast('error', 'Sign in to create a listing.')
      setView('auth')
      return
    }
    if (listingSubmitting) return
    setListingError(null)
    setListingSubmitting(true)
    try {
      const created = await api.listings.create({
        title: listingForm.title.trim(),
        description: listingForm.description.trim() || null,
        commodity: listingForm.commodity.trim() || null,
        category: listingForm.category || null,
        quantity: listingForm.quantity,
        unit: listingForm.unit.trim() || null,
        pricePerUnit: listingForm.pricePerUnit,
        availableQuantity: listingForm.availableQuantity || listingForm.quantity,
        currency: listingForm.currency,
        location: listingForm.location.trim() || null,
      })
      setListingForm(emptyListingForm)
      await refreshListings()
      pushToast('success', 'Listing saved as a draft. Publish it from the detail view.')
      openListing(created.id)
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : 'Could not create the listing.'
      setListingError(message)
      pushToast('error', message)
    } finally {
      setListingSubmitting(false)
    }
  }

  const handlePublishListing = async (id: string) => {
    try {
      const updated = await api.listings.publish(id)
      if (updated) {
        setListings((current) => current.map((l) => (l.id === id ? updated : l)))
        pushToast('success', 'Listing published and visible to buyers.')
      }
      await refreshListings()
    } catch (publishError) {
      pushToast('error', publishError instanceof Error ? publishError.message : 'Could not publish.')
    }
  }

  const handleOfferSubmit = async () => {
    if (!selectedListingId || offerSubmitting) return
    if (!user) {
      pushToast('error', 'Sign in to submit an offer.')
      setView('auth')
      return
    }
    setOfferError(null)
    setOfferSubmitting(true)
    try {
      await api.offers.create({
        listingId: selectedListingId,
        offeredQuantity: offerForm.quantity,
        offeredPrice: offerForm.price,
        message: offerForm.message.trim() || null,
      })
      setOfferForm(emptyOfferForm)
      const [nextOffers, nextDeals] = await Promise.all([api.offers.mine(), api.deals.mine()])
      setOffers(nextOffers)
      setDeals(nextDeals)
      pushToast('success', 'Offer submitted. The seller can accept or decline it.')
    } catch (offerFailure) {
      const message = offerFailure instanceof Error ? offerFailure.message : 'Could not submit the offer.'
      setOfferError(message)
      if (offerFailure instanceof ApiError && offerFailure.status === 401) {
        pushToast('error', 'Your session expired. Sign in again to submit offers.')
      }
    } finally {
      setOfferSubmitting(false)
    }
  }

  const handleOfferAction = async (offerId: string, status: Offer['status']) => {
    setBusyOfferId(offerId)
    try {
      await api.offers.updateStatus(offerId, status)
      const [nextOffers, nextDeals] = await Promise.all([api.offers.mine(), api.deals.mine()])
      setOffers(nextOffers)
      setDeals(nextDeals)
      await refreshListings()
      if (status === 'ACCEPTED') pushToast('success', 'Offer accepted. An agreed deal was created.')
      else if (status === 'DECLINED') pushToast('info', 'Offer declined.')
      else if (status === 'WITHDRAWN') pushToast('info', 'Offer withdrawn.')
      else pushToast('info', `Offer marked ${status}.`)
    } catch (actionError) {
      pushToast('error', actionError instanceof Error ? actionError.message : 'Could not update offer.')
    } finally {
      setBusyOfferId(null)
    }
  }

  const handleDealTransition = async (dealId: string, status: Deal['status']) => {
    setBusyDealId(dealId)
    try {
      await api.deals.updateStatus(dealId, status)
      setDeals(await api.deals.mine())
      if (status === 'CONFIRMED') pushToast('success', 'Deal confirmed. Coordinate delivery next.')
      else if (status === 'COMPLETED') pushToast('success', 'Deal completed.')
      else pushToast('info', 'Deal cancelled.')
    } catch (transitionError) {
      pushToast('error', transitionError instanceof Error ? transitionError.message : 'Could not update deal.')
    } finally {
      setBusyDealId(null)
    }
  }

  const handleProfileSave = async () => {
    if (!profileDraft) return
    setProfileSaving(true)
    try {
      const updated = await api.profile.update({
        displayName: profileDraft.displayName,
        phone: profileDraft.phone,
        city: profileDraft.city,
        region: profileDraft.region,
        country: profileDraft.country,
      })
      setProfile(updated)
      setProfileDraft(updated)
      pushToast('success', 'Profile saved.')
    } catch (saveError) {
      pushToast('error', saveError instanceof Error ? saveError.message : 'Could not save profile.')
    } finally {
      setProfileSaving(false)
    }
  }

  const navItems: { id: View; label: string }[] = [
    { id: 'discover', label: 'Discover' },
    { id: 'marketplace', label: 'Marketplace' },
    { id: 'offers', label: 'Offers' },
    { id: 'deals', label: 'Deals' },
    { id: 'create', label: 'Create Listing' },
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'profile', label: 'Profile' },
  ]
  const activeNavItem = view === 'listing' ? 'marketplace' : view
  const pendingOffersCount = offers.filter((offer) => offer.status === 'PENDING').length

  const renderNavigation = (mobile = false) => (
    <nav className="sidebar-nav" aria-label={mobile ? 'Mobile navigation' : 'Primary navigation'}>
      <span className="sidebar-section-label">Workspace</span>
      {navItems.map((item) => (
        <button
          key={item.id}
          type="button"
          className={activeNavItem === item.id ? 'sidebar-link active' : 'sidebar-link'}
          onClick={() => navigateTo(item.id)}
          aria-current={activeNavItem === item.id ? 'page' : undefined}
        >
          <NavIcon name={item.id} />
          <span>{item.label}</span>
          {item.id === 'offers' && pendingOffersCount > 0 ? (
            <span className="sidebar-count" aria-label={`${pendingOffersCount} pending offers`}>{pendingOffersCount}</span>
          ) : null}
        </button>
      ))}
    </nav>
  )

  const renderDiscover = () => (
    <section className="discover-shell">
      <div className="discover-main">
        <HeroSection onBrowse={() => setView('marketplace')} onCreate={() => setView('create')} />
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
          <button key={listing.id} type="button" className="listing-card featured" onClick={() => openListing(listing.id)}>
            <div className="listing-header">
              <div>
                <span className="listing-badge">{listing.category ?? 'Produce'}</span>
                <h3>{listing.title}</h3>
              </div>
              <strong>{listing.pricePerUnit} {listing.currency}/{listing.unit ?? 'unit'}</strong>
            </div>
            <div className="meta-row">
              <span>{listing.quantity} {listing.unit ?? ''}</span>
              <span>{listing.location ?? 'Location on request'}</span>
            </div>
            <p>{listing.commodity ?? ''}</p>
          </button>
        ))}
      </div>
    </section>
  )

  if (loading) {
    return (
      <div className="site-shell">
        <div className="loading-screen" role="status">Loading MundaLink marketplace…</div>
      </div>
    )
  }

  return (
    <div className="site-shell">
      {mobileNavOpen ? (
        <button
          className="mobile-nav-backdrop"
          type="button"
          tabIndex={-1}
          aria-label="Close navigation menu"
          onClick={() => {
            setMobileNavOpen(false)
            menuButtonRef.current?.focus()
          }}
        />
      ) : null}
      <aside
        id="mobile-navigation"
        ref={sidebarRef}
        className={mobileNavOpen ? 'sidebar mobile-open' : 'sidebar'}
        role={mobileNavOpen ? 'dialog' : undefined}
        aria-modal={mobileNavOpen ? true : undefined}
        aria-label={mobileNavOpen ? 'Navigation menu' : undefined}
      >
        <div className="sidebar-brand-row">
          <div className="brand-wrap">
            <div className="brand-mark" aria-hidden="true">M</div>
            <div>
              <div className="brand-name">MundaLink</div>
              <div className="brand-subtitle">Agricultural market coordination</div>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            className="icon-button sidebar-close"
            type="button"
            aria-label="Close navigation menu"
            onClick={() => {
              setMobileNavOpen(false)
              menuButtonRef.current?.focus()
            }}
          >
            <NavIcon name="close" />
          </button>
        </div>

        {renderNavigation(mobileNavOpen)}

        <div className="sidebar-footer">
          <span className={apiHealth.mode === 'mock' ? 'status-badge demo' : 'status-badge live'}>
            {apiHealth.mode === 'mock' ? 'Demonstration data' : 'Live API'}
          </span>
          {user ? (
            <button type="button" className="sidebar-account" onClick={() => void handleLogout()}>
              <span className="sidebar-avatar">{(profile?.displayName ?? user.email ?? 'A').charAt(0).toUpperCase()}</span>
              <span className="sidebar-account-copy">
                <strong>{profile?.displayName ?? user.email ?? 'Your account'}</strong>
                <small>Sign out</small>
              </span>
              <NavIcon name="signout" />
            </button>
          ) : (
            <button type="button" className="primary-button sidebar-signin" onClick={() => navigateTo('auth')}>
              Sign in to MundaLink
            </button>
          )}
        </div>
      </aside>

      <div className="app-main">
        <header className="mobile-topbar">
          <button
            ref={menuButtonRef}
            className="icon-button mobile-menu-trigger"
            type="button"
            aria-label="Open navigation menu"
            aria-haspopup="dialog"
            aria-controls="mobile-navigation"
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen(true)}
          >
            <NavIcon name="menu" />
          </button>
          <div className="mobile-brand">
            <div className="brand-mark" aria-hidden="true">M</div>
            <span>MundaLink</span>
          </div>
          <span className={apiHealth.mode === 'mock' ? 'status-badge demo' : 'status-badge live'}>
            {apiHealth.mode === 'mock' ? 'Demo' : 'Live'}
          </span>
        </header>

        <div className="main-column">
          {apiHealth.message ? <div className="api-banner" role="status">{apiHealth.message}</div> : null}
          {offline ? (
            <div className="offline-banner" role="alert">
              You are offline. Listings and offers may be out of date; actions will retry when you reconnect.
            </div>
          ) : null}
          {error ? <div className="notice error">{error}</div> : null}
          <main className="main-content">
        {view === 'discover' && renderDiscover()}
        {view === 'marketplace' && (
          <MarketplaceSection
            listings={listings}
            searchTerm={searchTerm}
            onSearchChange={(value) => { setSearchTerm(value); setPage(1) }}
            category={selectedCategory}
            onCategoryChange={(value) => { setSelectedCategory(value); setPage(1) }}
            location={selectedLocation}
            onLocationChange={(value) => { setSelectedLocation(value); setPage(1) }}
            page={page}
            pageCount={pageCount}
            onPageChange={setPage}
            onSelectListing={openListing}
            loading={listingsLoading}
          />
        )}
        {view === 'listing' && selectedListing && (
          <ListingDetailSection
            listing={selectedListing}
            offers={offers}
            isOwner={profile != null && selectedListing.sellerId === profile.id}
            signedIn={user != null}
            offerForm={offerForm}
            onOfferFieldChange={(field, value) => setOfferForm((c) => ({ ...c, [field]: value }))}
            onSubmitOffer={handleOfferSubmit}
            onPublish={() => handlePublishListing(selectedListing.id)}
            onOfferAction={handleOfferAction}
            offerSubmitting={offerSubmitting}
            offerError={offerError}
            onBack={() => setView('marketplace')}
          />
        )}
        {view === 'listing' && !selectedListing && (
          <div className="empty-state">Select a listing from the marketplace to view its details.</div>
        )}
        {view === 'offers' && (
          <OffersSection offers={offers} profileId={profile?.id ?? null} onAction={handleOfferAction} busyId={busyOfferId} />
        )}
        {view === 'deals' && (
          <DealsSection deals={deals} onTransition={handleDealTransition} busyId={busyDealId} />
        )}
        {view === 'auth' && (
          <AuthSection
            authMode={authMode}
            onAuthModeChange={setAuthMode}
            email={authForm.email}
            onEmailChange={(value) => setAuthForm((c) => ({ ...c, email: value }))}
            password={authForm.password}
            onPasswordChange={(value) => setAuthForm((c) => ({ ...c, password: value }))}
            displayName={authForm.displayName}
            onDisplayNameChange={(value) => setAuthForm((c) => ({ ...c, displayName: value }))}
            authError={authError}
            authLoading={authLoading}
            onSubmit={handleAuthSubmit}
          />
        )}
        {view === 'create' && (
          <div>
            <CreateListingSection
              form={listingForm}
              onFieldChange={(field, value) => setListingForm((c) => ({ ...c, [field]: value }))}
              onSubmit={handleCreateListing}
              submitting={listingSubmitting}
            />
            {listingError ? <div className="notice error">{listingError}</div> : null}
          </div>
        )}
        {view === 'dashboard' && (
          <DashboardSection profile={profile} listings={listings} offers={offers} deals={deals} onOpenListing={openListing} />
        )}
        {view === 'profile' && (
          <ProfileSection
            profileDraft={profileDraft}
            onProfileDraftChange={setProfileDraft}
            onSave={handleProfileSave}
            saving={profileSaving}
          />
        )}
          </main>
        </div>
      </div>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

function NavIcon({ name }: { name: View | 'menu' | 'close' | 'signout' }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  }

  const paths: Record<typeof name, ReactNode> = {
    discover: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></>,
    marketplace: <><circle cx="9" cy="20" r="1" /><circle cx="19" cy="20" r="1" /><path d="M3 4h2l2.4 11.4a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 2-1.6L22 8H6" /></>,
    offers: <><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></>,
    deals: <><path d="m5 12 4 4L19 6" /><path d="M21 12a9 9 0 1 1-4.1-7.5" /></>,
    create: <><path d="M12 5v14" /><path d="M5 12h14" /><rect x="3" y="3" width="18" height="18" rx="4" /></>,
    dashboard: <><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="5" rx="1" /><rect x="13" y="10" width="8" height="11" rx="1" /><rect x="3" y="13" width="8" height="8" rx="1" /></>,
    profile: <><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
    listing: <><circle cx="9" cy="20" r="1" /><circle cx="19" cy="20" r="1" /><path d="M3 4h2l2.4 11.4a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 2-1.6L22 8H6" /></>,
    auth: <><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="m10 17 5-5-5-5" /><path d="M15 12H3" /></>,
    menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
    close: <><path d="m18 6-12 12" /><path d="m6 6 12 12" /></>,
    signout: <><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" /></>,
  }

  return <svg {...common}>{paths[name]}</svg>
}

export default App

