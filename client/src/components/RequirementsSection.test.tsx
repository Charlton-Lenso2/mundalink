import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BuyerRequirementsSection,
  ContributionStatusGuide,
  RequirementDetails,
  RequirementStatusGuide,
  SellerAggregationSection,
} from './RequirementsSection'
import { getRequirementFeatureViews, validateRequirementDraft, type RequirementDraft } from '../lib/requirementFeatures'

const validDraft: RequirementDraft = {
  title: 'Maize for school meals',
  commodity: 'White maize',
  quantity: '12.5',
  unit: 'tonnes',
  location: 'Mutoko',
  neededBy: '2026-11-10',
  targetPrice: '280',
  currency: 'USD',
  description: '',
  qualityNotes: '',
}

afterEach(() => cleanup())

describe('requirement feature visibility', () => {
  it('shows buyer and seller areas only for their assigned role', () => {
    expect(getRequirementFeatureViews('BUYER')).toEqual(['requirements'])
    expect(getRequirementFeatureViews('SELLER')).toEqual(['aggregation'])
    expect(getRequirementFeatureViews('OBSERVER')).toEqual([])
    expect(getRequirementFeatureViews('ADMIN')).toEqual([])
    expect(getRequirementFeatureViews(undefined)).toEqual([])
  })
})

describe('buyer requirements', () => {
  it('distinguishes unavailable records from a real empty result', () => {
    render(<BuyerRequirementsSection />)
    expect(screen.getByRole('heading', { name: 'Requirement records are not connected' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Your requirements have not been loaded' })).toBeTruthy()
    expect(screen.queryByText('No requirements yet')).toBeNull()
  })

  it('shows the form preview but prevents submission while the API is unavailable', () => {
    render(<BuyerRequirementsSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Draft a requirement' }))
    expect(screen.getByRole('form', { name: 'Requirement form preview' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save requirement — unavailable' })).toHaveProperty('disabled', true)
    expect(screen.getByText(/You can check the draft locally/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Check draft' }))
    expect(screen.getByText('Enter a short title for the requirement.')).toBeTruthy()
    expect(screen.getByText('Enter a quantity greater than zero.')).toBeTruthy()
  })

  it('validates the required fields and positive quantities', () => {
    expect(validateRequirementDraft(validDraft)).toEqual({})
    expect(validateRequirementDraft({ ...validDraft, title: '  ', quantity: '0', unit: '', targetPrice: '-1' })).toEqual({
      title: 'Enter a short title for the requirement.',
      unit: 'Choose or enter a unit.',
      quantity: 'Enter a quantity greater than zero.',
      targetPrice: 'Enter a valid non-negative target price.',
    })
  })

  it('shows all lifecycle statuses without implying client-managed transitions', () => {
    render(<RequirementStatusGuide />)
    const guide = screen.getByRole('region', { name: 'Requirement progress' })
    for (const status of ['Open', 'Partially fulfilled', 'Fulfilled', 'Cancelled', 'Expired']) {
      expect(within(guide).getByText(status)).toBeTruthy()
    }
    expect(within(guide).getByText(/current server service permits edits only while OPEN/)).toBeTruthy()
  })
})

describe('seller aggregation', () => {
  it('does not describe unavailable discovery as having no matches', () => {
    render(<SellerAggregationSection onBrowseMarketplace={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Matching opportunities cannot be checked yet' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'No live opportunity result is available' })).toBeTruthy()
    expect(screen.getByText(/This does not mean there are no buyers/)).toBeTruthy()
  })

  it('offers a safe route back to the marketplace', () => {
    const onBrowseMarketplace = vi.fn()
    render(<SellerAggregationSection onBrowseMarketplace={onBrowseMarketplace} />)
    fireEvent.click(screen.getByRole('button', { name: 'Browse the marketplace' }))
    expect(onBrowseMarketplace).toHaveBeenCalledOnce()
  })

  it('explains proposed, committed, fulfilled, and cancelled states distinctly', () => {
    render(<ContributionStatusGuide />)
    expect(screen.getByText('A proposal only. It does not reserve listing inventory or count as committed supply.')).toBeTruthy()
    expect(screen.getByText(/backend has confirmed the commitment and reserved/)).toBeTruthy()
    expect(screen.getByText(/backend has recorded fulfilment/)).toBeTruthy()
    expect(screen.getByText('Cancelled')).toBeTruthy()
  })
})

describe('requirement details', () => {
  it('renders quantities with their returned unit and currency', () => {
    render(
      <RequirementDetails
        requirement={{
          id: 'req-1',
          title: 'White maize supply',
          commodity: 'White maize',
          quantity: '20',
          unit: '50 kg bags',
          location: 'Goromonzi',
          neededBy: null,
          targetPrice: '15.50',
          currency: 'USD',
          status: 'PARTIALLY_FULFILLED',
          committedSupply: '8',
          remainingDemand: '12',
          description: null,
          qualityNotes: 'Clean, dry grain',
        }}
      />,
    )
    expect(screen.getByText('20 50 kg bags')).toBeTruthy()
    expect(screen.getByText('8 50 kg bags')).toBeTruthy()
    expect(screen.getByText('12 50 kg bags')).toBeTruthy()
    expect(screen.getByText('USD 15.50/50 kg bags')).toBeTruthy()
    expect(screen.getByText('Partially fulfilled')).toBeTruthy()
  })
})
