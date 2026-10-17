// PBs use completed workouts, not individual set timestamps. A session that starts
// before a reset and finishes after it belongs to the new baseline window.
export function pbEligibleWorkouts(S) {
  const resetAt = Date.parse(S?.pbResetAt || '')
  if (!Number.isFinite(resetAt)) return S?.workouts || []
  return (S?.workouts || []).filter(w => {
    return Number.isFinite(w.end) && w.end > resetAt
  })
}

export function topLoadOf(entry) {
  let best = 0
  for (const set of entry?.sets || []) {
    if (set.done && !set.warmup && Number(set.w) > best) best = Number(set.w)
  }
  return best > 0 ? best : null
}

export function bestTopLoad(S, exerciseId) {
  let best = null
  for (const workout of pbEligibleWorkouts(S)) {
    for (const entry of workout.entries || []) {
      if (entry.id !== exerciseId) continue
      const load = topLoadOf(entry)
      if (load != null && (best == null || load > best)) best = load
    }
  }
  return best
}

export function classifyPerformance(current, previous) {
  if (current == null) return 'none'
  if (previous == null) return 'baseline'
  return current > previous ? 'improved' : 'none'
}
