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
