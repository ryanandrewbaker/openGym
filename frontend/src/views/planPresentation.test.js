import { describe, expect, it } from 'vitest'
import { planPresentation } from './planPresentation.js'

describe('planPresentation', () => {
  it('shows routines-only chrome in LifePilot manage mode', () => {
    expect(planPresentation(true)).toEqual({
      titleKey: 'Manage routines',
      subtitleKey: 'Create and edit workout routines',
      showScheduling: false,
      showSharePlan: false,
    })
  })

  it('keeps the full Plan UI in standalone OpenGym', () => {
    expect(planPresentation(false)).toEqual({
      titleKey: 'Plan',
      subtitleKey: 'Your weekly routine',
      showScheduling: true,
      showSharePlan: true,
    })
  })
})
