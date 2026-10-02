/** In-progress strength session. Completed history lives on `workouts`, never here. */
export const ACTIVE_WORKOUT_STATUSES = ["active", "interrupted", "completed", "cancelled"]

/** An unfinished session older than this asks before it is resumed. */
export const STALE_ACTIVE_WORKOUT_MS = 12 * 60 * 60 * 1000

export const DURABLE_ACTIVE_WORKOUT_KEY = "gym_active_session_v1"

export function logWorkoutSession(event, fields = {}) {
  const sessionId = fields.sessionId || null
  const status = fields.status || null
  console.info("[workout-session]", event, { sessionId, status })
}

export function completedSetCount(active) {
  return (active?.entries || []).reduce(
    (count, entry) => count + (entry.sets || []).filter((set) => set.done).length,
    0,
  )
}

function usableActive(active) {
  if (!active || typeof active !== "object" || !active.id || !active.start) return null
  if (active.status === "completed" || active.status === "cancelled") return null
  return active
}

function closedSessionId(active) {
  if (!active || typeof active !== "object" || !active.id) return null
  if (active.status === "completed" || active.status === "cancelled") return active.id
  return null
}

function preferActive(left, right) {
  const leftSets = completedSetCount(left)
  const rightSets = completedSetCount(right)
  if (leftSets !== rightSets) return leftSets > rightSets ? left : right
  const leftTs = left.updatedAt || left.start || 0
  const rightTs = right.updatedAt || right.start || 0
  return leftTs >= rightTs ? left : right
}

/**
 * Pick the in-progress snapshot that still has the user's logged work.
 * A finished id in workout history is not an active session.
 */
export function resolveRestoredActive({ localActive = null, remoteActive = null, remoteWorkoutIds = [] } = {}) {
  const finished = new Set(remoteWorkoutIds || [])
  const closedId = closedSessionId(localActive)
  let local = usableActive(localActive)
  let remote = usableActive(remoteActive)
  if (local && finished.has(local.id)) local = null
  if (remote && (finished.has(remote.id) || remote.id === closedId)) remote = null
  if (local && remote) return preferActive(local, remote)
  return local || remote || null
}

export function markInterrupted(active) {
  const session = usableActive(active)
  if (!session) return null
  return { ...session, status: "interrupted" }
}

export function isStaleActiveWorkout(active, now) {
  const session = usableActive(active)
  if (!session) return false
  const stamp = session.updatedAt || session.start
  return now - stamp >= STALE_ACTIVE_WORKOUT_MS
}

/** Duration from the original start. A relaunch must not supply a new start. */
export function durationSecondsFor(active, endedAt) {
  const start = active?.start
  if (!start || endedAt == null) return 0
  return Math.max(0, Math.round((endedAt - start) / 1000))
}
