/** Whether a LifePilot embed should start (or replace) the active workout. */
export function shouldBeginEmbeddedWorkout(ctx, active, today = null) {
  if (!ctx || ctx.mode === "manage" || !ctx.routineId) return false;
  if (!active) return true;
  // Entries are snapshotted at beginWorkout. A leftover from last Thursday still
  // has exercises later removed from the live routine.
  if (today && active.d && active.d !== today) return true;
  if (active.routineId && String(active.routineId) !== String(ctx.routineId)) return true;
  return !ctx.externalSessionId || active.id !== ctx.externalSessionId;
}
