import { reconcileRestFromSnapshot } from './lifepilot-provisional-rest.js'

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

export function notifyLpSelectionChanged(change) {
  if (!isLpWorkoutMode() || applyingRemoteSnapshot) return
  postLifePilotMessage({
    type: 'lifepilot-selection-changed',
    ...change,
  })
}

export function notifyLpExecutionReady() {
  if (!isLpWorkoutMode()) return
  postLifePilotMessage({ type: 'lifepilot-execution-ready' })
}

export function notifyLpWebOverlay(open) {
  if (!isLpWorkoutMode()) return
  postLifePilotMessage({ type: open ? 'lifepilot-web-overlay-opened' : 'lifepilot-web-overlay-closed' })
}

export function notifyLpExerciseSelected(exerciseId) {
  if (!isLpWorkoutMode() || !exerciseId) return
  postLifePilotMessage({
    type: 'lifepilot-exercise-selected',
    exerciseId: String(exerciseId),
  })
}

let lastPaintedCursor = null
let lastPaintedRevision = -1
let lastPaintedSessionId = null
let attachedEngineSessionId = null
let attachedExternalSessionId = null

function executionBindingIdentity() {
  return attachedEngineSessionId || attachedExternalSessionId || null
}

function snapshotMatchesAttached(snapshot) {
  if (!executionBindingIdentity()) return true
  const engine = snapshot.sessionId != null ? String(snapshot.sessionId) : null
  const external = snapshot.externalSessionId != null ? String(snapshot.externalSessionId) : null
  if (attachedEngineSessionId && (engine === attachedEngineSessionId || external === attachedEngineSessionId)) {
    return true
  }
  if (attachedExternalSessionId && (external === attachedExternalSessionId || engine === attachedExternalSessionId)) {
    return true
  }
  return false
}

/** Bind canonical paints to one execution session (engine and/or OpenGym external id). */
export function bindLpCanonicalExecutionSession(snapshotOrExternalId) {
  if (!snapshotOrExternalId) return
  const prevBinding = executionBindingIdentity()
  if (typeof snapshotOrExternalId === 'string') {
    attachedExternalSessionId = snapshotOrExternalId
  } else {
    if (snapshotOrExternalId.sessionId) attachedEngineSessionId = String(snapshotOrExternalId.sessionId)
    if (snapshotOrExternalId.externalSessionId) {
      attachedExternalSessionId = String(snapshotOrExternalId.externalSessionId)
    }
  }
  const nextBinding = executionBindingIdentity()
  if (prevBinding && nextBinding && prevBinding !== nextBinding) {
    lastPaintedCursor = null
    lastPaintedRevision = -1
    lastPaintedSessionId = null
  }
}

export function resetLpExecutionPaintState() {
  lastPaintedCursor = null
  lastPaintedRevision = -1
  lastPaintedSessionId = null
  attachedEngineSessionId = null
  attachedExternalSessionId = null
}

export function isApplyingRemoteSnapshot() {
  return applyingRemoteSnapshot
}

export function applyCanonicalExecutionSnapshot(snapshot, { update, startRest, stopRest }) {
  if (!snapshot || typeof update !== 'function') return
  if (!snapshotMatchesAttached(snapshot)) return
  bindLpCanonicalExecutionSession(snapshot)
  const paintSessionKey = String(snapshot.sessionId ?? snapshot.externalSessionId ?? '')
  const revision = snapshot.cursor?.revision
  if (Number.isInteger(revision) && revision < lastPaintedRevision) {
    return
  }
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
          if (
            !set.completed
            && isFabricatedOneRepTarget(set.reps, set.weightKg)
            && rowHasOrdinaryTarget(row)
          ) {
            continue
          }
          row.done = !!set.completed
          if (set.weightKg != null) row.w = set.weightKg
          if (set.reps != null) row.r = set.reps
        }
      }
      const plan = snapshot.plan || []
      const exerciseIndex = snapshot.cursor?.exerciseIndex
      const setIndex = snapshot.cursor?.setIndex
      if (Number.isInteger(exerciseIndex) && Number.isInteger(setIndex)) {
        const planExercise = plan[exerciseIndex]
        const entryIndex = planExercise
          ? active.entries.findIndex((item) => String(item.id) === String(planExercise.exerciseId))
          : exerciseIndex
        const sessionId = paintSessionKey
        const cursorMoved = !lastPaintedCursor
          || lastPaintedCursor.sessionId !== sessionId
          || lastPaintedCursor.exerciseIndex !== exerciseIndex
        if (entryIndex >= 0 && cursorMoved) active.cur = entryIndex
        lastPaintedCursor = { sessionId, exerciseIndex }
        const entry = entryIndex >= 0 ? active.entries[entryIndex] : null
        const row = entry ? workSetAt(entry, setIndex + 1) : null
        if (row && !row.done) {
          applyCursorSelection(row, snapshot.cursor, planExercise)
        }
      }
    }, false)
    reconcileRestFromSnapshot(snapshot, { startRest, stopRest })
    if (paintSessionKey) lastPaintedSessionId = paintSessionKey
    if (Number.isInteger(revision)) {
      lastPaintedRevision = Math.max(lastPaintedRevision, revision)
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

function isFabricatedOneRepTarget(reps, loadKg) {
  return Number(reps) === 1 && (loadKg == null || loadKg === '')
}

function rowHasOrdinaryTarget(row) {
  const reps = Number(row?.r)
  const weight = Number(row?.w)
  return (Number.isFinite(reps) && reps > 1) || (Number.isFinite(weight) && weight > 0)
}

function planExerciseIsFabricated(exercise) {
  if (!exercise) return true
  return Number(exercise.repsMin) === 1
    && Number(exercise.repsMax) === 1
    && (exercise.loadKg == null || exercise.loadKg === '')
}

function applyCursorSelection(row, cursor, planExercise) {
  const fabricated = isFabricatedOneRepTarget(cursor?.selectedReps, cursor?.selectedLoadKg)
  if (fabricated && rowHasOrdinaryTarget(row)) return
  if (fabricated && planExercise && !planExerciseIsFabricated(planExercise)) {
    if (planExercise.loadKg != null) row.w = planExercise.loadKg
    if (planExercise.repsMin != null) row.r = planExercise.repsMin
    return
  }
  if (cursor?.selectedLoadKg != null) row.w = cursor.selectedLoadKg
  if (cursor?.selectedReps != null) row.r = cursor.selectedReps
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
