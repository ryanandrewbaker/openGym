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

export function catalogueFromState(state) {
  return (state?.routines || []).map((routine) => ({
    openGymRoutineId: String(routine.id),
    routineName: routine.name,
  }));
}

function slotRoutineId(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && typeof value.openGymRoutineId === "string") {
    return value.openGymRoutineId.trim();
  }
  return "";
}

/** True when OpenGym's state is newer than the snapshot LifePilot last read. */
export function scheduleWriteConflicts(state, baseUpdatedAt, force) {
  if (force) return false;
  if (typeof baseUpdatedAt !== "number" || !Number.isFinite(baseUpdatedAt)) return false;
  return typeof state?._ts === "number" && state._ts > baseUpdatedAt;
}

export function applyLifePilotScheduleToState(state, input) {
  const knownIds = new Set((state?.routines || []).map((routine) => String(routine.id)));
  const week = {};
  for (const row of input.routines || []) {
    const weekdayIndex = Number(row.weekdayIndex);
    const routineId = String(row.openGymRoutineId || "");
    if (!Number.isInteger(weekdayIndex) || weekdayIndex < 0 || weekdayIndex > 6) continue;
    if (!knownIds.has(routineId)) continue;
    week[String(weekdayIndex)] = routineId;
  }
  state.week = week;

  if (input.rotation == null) {
    delete state.rotation;
  } else {
    const length = Math.floor(Number(input.rotation.length));
    const anchor = typeof input.rotation.anchor === "string" ? input.rotation.anchor : "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(anchor) && length > 0) {
      const slots = {};
      for (const [key, value] of Object.entries(input.rotation.slots || {})) {
        const index = Number(key);
        if (!Number.isInteger(index) || index < 0 || index >= length) continue;
        const routineId = slotRoutineId(value);
        if (!knownIds.has(routineId)) continue;
        slots[String(index)] = routineId;
      }
      state.rotation = { anchor, length, slots };
    } else {
      delete state.rotation;
    }
  }

  state._ts = Date.now();
  return state;
}
