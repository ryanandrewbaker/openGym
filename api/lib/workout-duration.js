/** Elapsed time from the workout's original start, not the current process. */
export function completionTiming(workout, now = Date.now()) {
  const start = workout?.start
  const end = workout?.end || now
  return {
    startedAt: new Date(start).toISOString(),
    completedAt: new Date(end).toISOString(),
    durationSeconds: start ? Math.max(0, Math.round((end - start) / 1000)) : 0,
  }
}
