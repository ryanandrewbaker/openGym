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
/** User explicitly skipped; same `restEndsAt` must not reopen from duplicate/late snapshots. */
let dismissedRestEndsAt = null
/** Provisional was skipped before any authoritative `restEndsAt` arrived. */
let dismissProvisionalRestPending = false

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
  dismissedRestEndsAt = null
  dismissProvisionalRestPending = false
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

export function getLpRestReconcileState() {
  return {
    provisionalActive,
    lastAuthoritativeRestEndsAt,
    dismissedRestEndsAt,
    dismissProvisionalRestPending,
  }
}

/** Explicit user Skip (not internal timer replacement or natural expiry). */
export function onLpUserSkippedRest() {
  if (!isLpWorkoutMode()) return
  provisionalActive = false
  provisionalGeneration += 1
  if (lastAuthoritativeRestEndsAt) {
    dismissedRestEndsAt = lastAuthoritativeRestEndsAt
  } else {
    dismissProvisionalRestPending = true
  }
}

export function onLpRestTimerExpired() {
  if (!isLpWorkoutMode()) return
  provisionalActive = false
}

function clearDismissalForNewRestPeriod(restEndsAt) {
  if (dismissedRestEndsAt && restEndsAt !== dismissedRestEndsAt) {
    dismissedRestEndsAt = null
    dismissProvisionalRestPending = false
  }
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

function stopRestInternal(stopRest) {
  if (typeof stopRest === 'function') stopRest({ reason: 'internal' })
}

export function onLpLocalSetCompletion(active, { entryIdx, setIdx, completed, warmup }, { startRest, stopRest }) {
  if (!isLpWorkoutMode() || typeof startRest !== 'function') return
  if (warmup) return

  if (!completed) {
    if (provisionalActive) stopRestInternal(stopRest)
    provisionalActive = false
    provisionalGeneration += 1
    return
  }

  dismissedRestEndsAt = null
  dismissProvisionalRestPending = false

  const seconds = estimateProvisionalRestSeconds(active, entryIdx, setIdx)
  if (seconds <= 0) {
    provisionalActive = false
    stopRestInternal(stopRest)
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
    clearDismissalForNewRestPeriod(restEndsAt)
    if (restEndsAt === dismissedRestEndsAt) {
      provisionalActive = false
      return
    }
    if (dismissProvisionalRestPending) {
      dismissProvisionalRestPending = false
      dismissedRestEndsAt = restEndsAt
      lastAuthoritativeRestEndsAt = restEndsAt
      provisionalActive = false
      stopRestInternal(stopRest)
      return
    }

    const remaining = Math.max(0, Math.ceil((Date.parse(restEndsAt) - Date.now()) / 1000))
    const restEndsAtChanged = lastAuthoritativeRestEndsAt !== restEndsAt
    const needsAuthoritativeSync = restEndsAtChanged || provisionalActive

    if (needsAuthoritativeSync) {
      lastAuthoritativeRestEndsAt = restEndsAt
      provisionalActive = false
      if (typeof startRest === 'function' && remaining > 0) startRest(remaining)
      else stopRestInternal(stopRest)
    } else if (remaining <= 0) {
      stopRestInternal(stopRest)
    }
    return
  }

  lastAuthoritativeRestEndsAt = null
  provisionalActive = false
  if (phase !== 'rest' && phase !== 'complete') {
    dismissProvisionalRestPending = false
  }
  if (typeof stopRest === 'function' && phase !== 'rest') {
    stopRestInternal(stopRest)
  }
}
