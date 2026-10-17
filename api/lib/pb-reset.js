export function pbResetStatus(state) {
  const last = state?.pbResetAudit?.at(-1)
  const latestWorkoutEnd = (state?.workouts || []).reduce((latest, w) => Number.isFinite(w.end) ? Math.max(latest, w.end) : latest, 0)
  return {
    pbResetAt: state?.pbResetAt || null,
    resetId: state?.pbResetOperation?.id || null,
    stateTs: Number(state?._ts) || 0,
    activeWorkout: Boolean(state?.active),
    latestWorkoutEnd: latestWorkoutEnd || null,
    lastRollback: !state?.pbResetOperation && last?.action === 'rollback'
      ? { id: last.id, at: last.at, previousAt: last.previousAt || null }
      : null,
  }
}

export function applyPbReset(state, { resetId, resetAt, expectedStateTs }, now = Date.now()) {
  if (!state || typeof state !== 'object') return { error: 'state_not_found', status: 404 }
  if (!resetId || typeof resetId !== 'string' || resetId.length > 100) return { error: 'invalid_reset_id', status: 400 }
  const at = Date.parse(resetAt)
  if (typeof resetAt !== 'string' || !Number.isFinite(at) || new Date(at).toISOString() !== resetAt || at > now + 60_000) {
    return { error: 'invalid_reset_at', status: 400 }
  }
  if (state.pbResetOperation?.id === resetId) {
    return state.pbResetAt === resetAt ? { state, unchanged: true } : { error: 'reset_id_conflict', status: 409 }
  }
  if ((state.pbResetAudit || []).some(record => record.id === resetId)) {
    return { error: 'reset_id_reused', status: 409 }
  }
  if (state.active) return { error: 'active_workout', status: 409 }
  if (Number(expectedStateTs) !== Number(state._ts || 0)) return { error: 'state_changed', status: 409 }
  if ((state.workouts || []).some(w => !Number.isFinite(w.end) || w.end >= at)) {
    return { error: 'reset_before_existing_workout', status: 409 }
  }
  const next = {
    ...state,
    pbResetAt: resetAt,
    pbResetOperation: { id: resetId, at: resetAt, previousAt: state.pbResetAt || null },
    pbResetAudit: [...(state.pbResetAudit || []), { action: 'apply', id: resetId, at: resetAt, recordedAt: new Date(now).toISOString() }],
    _ts: Math.max(now, Number(state._ts || 0) + 1),
  }
  return { state: next, unchanged: false }
}

export function rollbackPbReset(state, { resetId, expectedResetAt }, now = Date.now()) {
  if (!state || typeof state !== 'object') return { error: 'state_not_found', status: 404 }
  const last = state.pbResetAudit?.at(-1)
  if (!state.pbResetOperation && last?.action === 'rollback' && last.id === resetId && last.at === expectedResetAt && state.pbResetAt === (last.previousAt || null)) {
    return { state, unchanged: true }
  }
  const operation = state.pbResetOperation
  if (!operation || operation.id !== resetId || state.pbResetAt !== expectedResetAt) {
    return { error: 'reset_conflict', status: 409 }
  }
  const at = Date.parse(expectedResetAt)
  if (state.active || (state.workouts || []).some(w => Number.isFinite(w.end) && w.end > at)) {
    return { error: 'post_reset_training_exists', status: 409 }
  }
  const next = {
    ...state,
    pbResetAt: operation.previousAt || null,
    pbResetOperation: null,
    pbResetAudit: [...(state.pbResetAudit || []), { action: 'rollback', id: resetId, at: expectedResetAt, previousAt: operation.previousAt || null, recordedAt: new Date(now).toISOString() }],
    _ts: Math.max(now, Number(state._ts || 0) + 1),
  }
  return { state: next, unchanged: false }
}
