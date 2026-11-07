import { describe, expect, it } from 'vitest'
import {
  EXERCISE_VIDEO_LOAD_FAILED,
  EXERCISE_VIDEO_UNAVAILABLE,
  exerciseVideoEligible,
  exerciseVideoEntry,
  exerciseVideoUrl,
} from './exercise-videos.js'
import { EXERCISE_VIDEO_CATALOG } from './exercise-videos.manifest.js'

describe('exerciseVideoEntry', () => {
  it('resolves catalogue and custom ids exactly', () => {
    expect(exerciseVideoEntry('0285')?.sourceFile).toContain('Bicep Curl')
    expect(exerciseVideoEntry('cmusddpvgv7c8l')?.token).toBeTruthy()
    expect(exerciseVideoEntry('missing-id')).toBeNull()
    expect(exerciseVideoEntry(null)).toBeNull()
  })

  it('shares one token when two ids reference the same source file', () => {
    expect(EXERCISE_VIDEO_CATALOG['0285'].token).toBe(EXERCISE_VIDEO_CATALOG['0416'].token)
  })
})

describe('exerciseVideoUrl', () => {
  it('returns null when technique is not verified even if owner approved', () => {
    expect(exerciseVideoUrl('0416')).toBeNull()
    expect(exerciseVideoEligible('0416')).toBe(false)
    expect(exerciseVideoUrl('1731')).toBeNull()
    expect(exerciseVideoEligible('1731')).toBe(false)
    expect(exerciseVideoUrl('2188')).toBeNull()
    expect(exerciseVideoUrl('9999')).toBeNull()
  })

  it('builds opaque /video/ URLs when both gates pass', () => {
    expect(exerciseVideoUrl('0285')).toMatch(/^\/video\/[a-f0-9]+\.mp4$/)
    expect(exerciseVideoEligible('0285')).toBe(true)
    expect(exerciseVideoEligible('0405')).toBe(true)
  })

  it('blocks playback when owner approval is withdrawn', () => {
    const prior = { ...EXERCISE_VIDEO_CATALOG['0285'] }
    EXERCISE_VIDEO_CATALOG['0285'].ownerApprovedForUse = false
    try {
      expect(exerciseVideoEligible('0285')).toBe(false)
      expect(exerciseVideoUrl('0285')).toBeNull()
    } finally {
      EXERCISE_VIDEO_CATALOG['0285'] = prior
    }
  })
})

describe('fallback copy', () => {
  it('uses the exact unavailable string', () => {
    expect(EXERCISE_VIDEO_UNAVAILABLE).toBe('Video not yet available')
  })

  it('uses distinct copy for playback failures', () => {
    expect(EXERCISE_VIDEO_LOAD_FAILED).toContain("Couldn't load")
    expect(EXERCISE_VIDEO_LOAD_FAILED).not.toBe(EXERCISE_VIDEO_UNAVAILABLE)
  })
})
