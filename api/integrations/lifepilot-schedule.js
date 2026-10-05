/** Pure helpers for LifePilot ↔ openGym routine/week schedule sync. */

/** Repeating multi-week plan. Null when the profile still uses a single week. */
export function rotationFromState(state) {
  const rotation = state?.rotation;
  if (!rotation || typeof rotation.anchor !== "string") return null;
  const length = Math.floor(Number(rotation.length));
  if (!(length > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(rotation.anchor)) return null;

  const byId = new Map((state?.routines || []).map((routine) => [routine.id, routine]));
  const slots = {};
  for (const [key, routineId] of Object.entries(rotation.slots || {})) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= length) continue;
    const routine = byId.get(routineId);
    if (!routine) continue;
    slots[String(index)] = {
      openGymRoutineId: String(routineId),
      routineName: routine.name,
    };
  }

  return { anchor: rotation.anchor, length, slots };
}

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
