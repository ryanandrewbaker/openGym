export function activeWorkoutHasCompletedSet(active) {
  return (active?.entries || []).some((entry) =>
    (entry.sets || []).some((set) => set.done),
  )
}

/** Whether a LifePilot embed should start (or replace) the active workout. */
export function shouldBeginEmbeddedWorkout(ctx, active, today = null) {
  if (!ctx || ctx.mode === "manage" || !ctx.routineId) return false;
  if (!active) return true;
  // Entries are snapshotted at beginWorkout. A leftover from last Thursday still
  // has exercises later removed from the live routine.
  if (today && active.d && active.d !== today) return true;
  if (active.routineId && String(active.routineId) !== String(ctx.routineId)) return true;
  if (!ctx.externalSessionId || active.id !== ctx.externalSessionId) return true;
  // Same day, same routine, same LifePilot session: still rebuild when nothing
  // has been logged, so later plan edits (removed incline row / shrugs) apply.
  return !activeWorkoutHasCompletedSet(active);
}
