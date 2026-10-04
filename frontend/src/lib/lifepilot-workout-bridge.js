const LP_CTX_KEY = 'lp_context'

function isLpWorkoutMode() {
  try {
    const context = JSON.parse(sessionStorage.getItem(LP_CTX_KEY) || 'null')
    return !!context && context.mode !== 'manage'
  } catch {
    return false
  }
}

export function workoutStartedPayload(sessionId, startedAt) {
  return {
    type: 'lifepilot-workout-started',
    sessionId,
    startedAt: toIso(startedAt),
  }
}

export function workoutFinishedPayload(sessionId, endedAt) {
  return {
    type: 'lifepilot-workout-finished',
    sessionId,
    endedAt: toIso(endedAt),
  }
}

export function workoutLeftPayload(sessionId, hasLoggedSets) {
  return {
    type: 'lifepilot-workout-left',
    sessionId,
    hasLoggedSets: !!hasLoggedSets,
  }
}

export function notifyLpWorkoutStarted(sessionId, startedAt) {
  if (!isLpWorkoutMode() || !sessionId) return
  postLifePilotMessage(workoutStartedPayload(sessionId, startedAt))
}

export function notifyLpWorkoutFinished(sessionId, endedAt) {
  if (!isLpWorkoutMode() || !sessionId) return
  postLifePilotMessage(workoutFinishedPayload(sessionId, endedAt))
}

export function notifyLpWorkoutLeft(sessionId, hasLoggedSets) {
  if (!isLpWorkoutMode() || !sessionId) return
  postLifePilotMessage(workoutLeftPayload(sessionId, hasLoggedSets))
}

export function workoutDiscardedPayload(sessionId) {
  return {
    type: 'lifepilot-workout-discarded',
    sessionId,
  }
}

export function notifyLpWorkoutDiscarded(sessionId) {
  if (!isLpWorkoutMode() || !sessionId) return
  postLifePilotMessage(workoutDiscardedPayload(sessionId))
}

export function notifyLpSetChanged(change) {
  if (!isLpWorkoutMode()) return
  postLifePilotMessage({
    type: 'lifepilot-set-changed',
    ...change,
  })
}

let applyingRemoteSnapshot = false

export function isApplyingRemoteSnapshot() {
  return applyingRemoteSnapshot
}

export function applyCanonicalExecutionSnapshot(snapshot, { update, startRest, stopRest }) {
  if (!snapshot || typeof update !== 'function') return
  applyingRemoteSnapshot = true
  try {
    update((state) => {
      const active = state.active
      if (!active?.entries) return
      for (const performed of snapshot.performed || []) {
        const entry = active.entries.find((item) => String(item.id) === String(performed.exerciseId))
        if (!entry) continue
        for (const set of performed.sets || []) {
          if (set.warmup) continue
          const row = workSetAt(entry, set.setNumber)
          if (!row) continue
          row.done = !!set.completed
          if (set.weightKg != null) row.w = set.weightKg
          if (set.reps != null) row.r = set.reps
        }
      }
    }, false)
    const restEndsAt = snapshot.cursor?.restEndsAt
    if (snapshot.cursor?.phase === 'rest' && restEndsAt && typeof startRest === 'function') {
      const remaining = Math.max(0, Math.ceil((Date.parse(restEndsAt) - Date.now()) / 1000))
      if (remaining > 0) startRest(remaining)
      else if (typeof stopRest === 'function') stopRest()
    } else if (typeof stopRest === 'function' && snapshot.cursor?.phase !== 'rest') {
      stopRest()
    }
  } finally {
    applyingRemoteSnapshot = false
  }
}

export function workSetNumber(entry, index) {
  let number = 0
  for (let i = 0; i <= index; i += 1) {
    if (!entry.sets[i]?.warmup) number += 1
  }
  return number
}

function workSetAt(entry, setNumber) {
  let number = 0
  for (const set of entry.sets || []) {
    if (set.warmup) continue
    number += 1
    if (number === setNumber) return set
  }
  return null
}

export function requestLifePilotExit() {
  postLifePilotMessage({ type: 'lifepilot-exit-workout' })
}

export function emitBeginWorkoutBridge(active) {
  if (!active) return
  notifyLpWorkoutStarted(active.id, active.start)
}

export function emitFinishWorkoutBridge(workout) {
  if (!workout) return
  notifyLpWorkoutFinished(workout.id, workout.end)
}

function postLifePilotMessage(payload) {
  if (typeof window === 'undefined') return
  if (window.parent !== window) {
    window.parent.postMessage(payload, '*')
  }
  if (window.webkit?.messageHandlers?.lifepilot) {
    window.webkit.messageHandlers.lifepilot.postMessage(payload)
  }
}

function toIso(value) {
  const date = value instanceof Date ? value : new Date(value)
  return date.toISOString()
}
