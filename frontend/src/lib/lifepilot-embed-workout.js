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
  if (active.routineId && String(active.routineId) !== String(ctx.routineId)) return true;
  if (!ctx.externalSessionId || active.id !== ctx.externalSessionId) return true;
  // v2 is frozen by MASIS at start. Same external session + routine keeps the
  // snapshotted workout across embed refreshes, including calendar midnight.
  // Preserve the historical rebuild behaviour for legacy v1 sessions.
  if (ctx.prescription?.prescriptionContractVersion === 2) return false;
  if (today && active.d && active.d !== today) return true;
  return !activeWorkoutHasCompletedSet(active);
}

/** What the embed should do so the native app can start the Apple strength workout. */
export function embeddedWorkoutStartAction(ctx, active, today = null) {
  if (shouldBeginEmbeddedWorkout(ctx, active, today)) return "begin";
  if (!ctx || ctx.mode === "manage" || !active?.id || !active.start) return "none";
  return "notify";
}
