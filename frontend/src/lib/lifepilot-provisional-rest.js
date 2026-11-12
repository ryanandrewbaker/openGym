const LP_CTX_KEY = 'lp_context'

const DEFAULT_BETWEEN_SETS = 90
const DEFAULT_BETWEEN_EXERCISES = 120

let canonicalRestPolicy = {
  betweenSets: DEFAULT_BETWEEN_SETS,
  betweenExercises: DEFAULT_BETWEEN_EXERCISES,
}
let provisionalGeneration = 0
let provisionalActive = false
let lastAuthoritativeRestEndsAt = null

function isLpWorkoutMode() {
  try {
    const context = JSON.parse(sessionStorage.getItem(LP_CTX_KEY) || 'null')
    return !!context && context.mode !== 'manage'
  } catch {
    return false
  }
}

export function resetLpProvisionalRestState() {
  canonicalRestPolicy = {
    betweenSets: DEFAULT_BETWEEN_SETS,
    betweenExercises: DEFAULT_BETWEEN_EXERCISES,
  }
  provisionalGeneration = 0
  provisionalActive = false
  lastAuthoritativeRestEndsAt = null
}

export function cacheCanonicalRestPolicy(snapshot) {
  if (!snapshot) return
  if (Number.isFinite(snapshot.restBetweenSetsSeconds)) {
    canonicalRestPolicy.betweenSets = Math.max(1, Math.round(snapshot.restBetweenSetsSeconds))
  }
  if (Number.isFinite(snapshot.restAfterExerciseSeconds)) {
    canonicalRestPolicy.betweenExercises = Math.max(1, Math.round(snapshot.restAfterExerciseSeconds))
  }
}

export function isProvisionalRestActive() {
  return provisionalActive
}

export function onLpUserSkippedRest() {
  if (!isLpWorkoutMode()) return
  provisionalActive = false
  provisionalGeneration += 1
  lastAuthoritativeRestEndsAt = null
}

function workoutHasRemainingWork(active) {
  if (!active?.entries) return false
  return active.entries.some((entry) => entry.sets?.some((set) => !set.warmup && !set.done))
}

export function estimateProvisionalRestSeconds(active, entryIdx, setIdx) {
  const entry = active?.entries?.[entryIdx]
  const set = entry?.sets?.[setIdx]
  if (!entry || !set || set.warmup || !set.done) return 0
  if (!workoutHasRemainingWork(active)) return 0

  const hasMoreOnExercise = entry.sets.some((row, index) => (
    index > setIdx && !row.warmup && !row.done
  ))
  if (hasMoreOnExercise) return canonicalRestPolicy.betweenSets

  if (!workoutHasRemainingWork(active)) return 0
  return canonicalRestPolicy.betweenExercises
}

export function onLpLocalSetCompletion(active, { entryIdx, setIdx, completed, warmup }, { startRest, stopRest }) {
  if (!isLpWorkoutMode() || typeof startRest !== 'function') return
  if (warmup) return

  if (!completed) {
    if (provisionalActive && typeof stopRest === 'function') stopRest()
    provisionalActive = false
    provisionalGeneration += 1
    return
  }

  const seconds = estimateProvisionalRestSeconds(active, entryIdx, setIdx)
  if (seconds <= 0) {
    provisionalActive = false
    if (typeof stopRest === 'function') stopRest()
    return
  }

  provisionalGeneration += 1
  provisionalActive = true
  startRest(seconds)
}

export function reconcileRestFromSnapshot(snapshot, { startRest, stopRest }) {
  cacheCanonicalRestPolicy(snapshot)
  const phase = snapshot?.cursor?.phase
  const restEndsAt = snapshot?.cursor?.restEndsAt

  if (phase === 'rest' && restEndsAt) {
    const remaining = Math.max(0, Math.ceil((Date.parse(restEndsAt) - Date.now()) / 1000))
    const restEndsAtChanged = lastAuthoritativeRestEndsAt !== restEndsAt
    const needsAuthoritativeSync = restEndsAtChanged || provisionalActive

    if (needsAuthoritativeSync) {
      lastAuthoritativeRestEndsAt = restEndsAt
      provisionalActive = false
      if (typeof startRest === 'function' && remaining > 0) startRest(remaining)
      else if (typeof stopRest === 'function') stopRest()
    } else if (remaining <= 0 && typeof stopRest === 'function') {
      stopRest()
    }
    return
  }

  lastAuthoritativeRestEndsAt = null
  provisionalActive = false
  if (typeof stopRest === 'function' && phase !== 'rest') stopRest()
}
