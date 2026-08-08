import { EXDB } from "./exercises-data.js";

const NAME_BY_ID = Object.fromEntries(EXDB.map((entry) => [entry.id, entry.n]));

function normalizeExerciseDisplayName(name) {
  return String(name).replace(/\u0432\u00b0/g, "\u00b0").replace(/в°/g, "°");
}

export function openGymExerciseName(exerciseId) {
  if (!exerciseId) return exerciseId;
  return normalizeExerciseDisplayName(NAME_BY_ID[exerciseId] ?? exerciseId);
}

export function openGymExerciseNames(exerciseIds) {
  const names = {};
  for (const id of exerciseIds) {
    names[id] = openGymExerciseName(id);
  }
  return names;
}
