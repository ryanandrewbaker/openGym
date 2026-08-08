/** Pure helpers for LifePilot ↔ openGym routine/week schedule sync. */

export function routineMappingsFromState(state) {
  const routines = state?.routines || [];
  const week = state?.week || {};
  const byId = new Map(routines.map((routine) => [routine.id, routine]));

  return Object.entries(week)
    .map(([weekdayIndex, routineId]) => {
      const routine = byId.get(routineId);
      if (!routine) {
        return null;
      }
      return {
        weekdayIndex: Number(weekdayIndex),
        openGymRoutineId: String(routineId),
        routineName: routine.name,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.weekdayIndex - b.weekdayIndex);
}

export function applySeededRoutinesToState(state, seeded) {
  state.routines = seeded.map((item) => ({ ...item.routine, id: item.openGymRoutineId }));
  state.week = Object.fromEntries(seeded.map((item) => [String(item.weekdayIndex), item.openGymRoutineId]));
  return state;
}
