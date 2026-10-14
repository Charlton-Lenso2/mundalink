import type { Profile } from '../types'

export type RequirementDraft = {
  title: string
  commodity: string
  quantity: string
  unit: string
  location: string
  neededBy: string
  targetPrice: string
  currency: string
  description: string
  qualityNotes: string
}

export type RequirementDraftErrors = Partial<Record<keyof RequirementDraft, string>>

export function validateRequirementDraft(draft: RequirementDraft): RequirementDraftErrors {
  const errors: RequirementDraftErrors = {}
  const decimal = /^(?:0|[1-9]\d*)(?:\.\d+)?$/

  if (!draft.title.trim()) errors.title = 'Enter a short title for the requirement.'
  if (!draft.commodity.trim()) errors.commodity = 'Enter the produce or commodity.'
  if (!draft.unit.trim()) errors.unit = 'Choose or enter a unit.'
  if (!decimal.test(draft.quantity) || Number(draft.quantity) <= 0) {
    errors.quantity = 'Enter a quantity greater than zero.'
  }
  if (draft.targetPrice && (!decimal.test(draft.targetPrice) || Number(draft.targetPrice) < 0)) {
    errors.targetPrice = 'Enter a valid non-negative target price.'
  }
  if (draft.neededBy && Number.isNaN(Date.parse(draft.neededBy))) {
    errors.neededBy = 'Enter a valid date.'
  }

  return errors
}

export function getRequirementFeatureViews(role: Profile['role'] | undefined): ('requirements' | 'aggregation')[] {
  if (role === 'BUYER') return ['requirements']
  if (role === 'SELLER') return ['aggregation']
  return []
}
