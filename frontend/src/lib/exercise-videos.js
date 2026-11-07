import { EXERCISE_VIDEO_CATALOG } from './exercise-videos.manifest.js'

export const EXERCISE_VIDEO_UNAVAILABLE = 'Video not yet available'
export const EXERCISE_VIDEO_LOAD_FAILED =
  "Couldn't load this video. Check your connection and try again."

const ENV = import.meta.env || {}
export const VIDEO_BASE = ENV.VITE_VIDEO_BASE || '/video/'

export function exerciseVideoEntry(exerciseId) {
  if (exerciseId == null || exerciseId === '') return null
  return EXERCISE_VIDEO_CATALOG[String(exerciseId)] ?? null
}

export function exerciseVideoEligible(exerciseId) {
  const entry = exerciseVideoEntry(exerciseId)
  if (!entry?.token) return false
  return entry.techniqueVerified === true && entry.ownerApprovedForUse === true
}

export function exerciseVideoUrl(exerciseId) {
  if (!exerciseVideoEligible(exerciseId)) return null
  const entry = exerciseVideoEntry(exerciseId)
  const base = VIDEO_BASE.endsWith('/') ? VIDEO_BASE : `${VIDEO_BASE}/`
  return `${base}${entry.token}.mp4`
}
