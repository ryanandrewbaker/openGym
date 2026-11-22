/**
 * MASIS-157: validate an authoritative frozen full prescription before signing
 * its LifePilot bridge token. v1 arrays are handled separately and unchanged.
 */
const INVALID = "invalid_v2_prescription";
const EXERCISE_FIELDS = new Set([
  "exerciseId", "sets", "repsMin", "repsMax", "loadKg", "prefillLoadsKg",
]);
const TOP_FIELDS = new Set([
  "prescriptionContractVersion", "prescriptionCoverage", "exercises",
]);

const record = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const exactFields = (value, allowed) =>
  Object.keys(value).every((key) => allowed.has(key));
const positiveInt = (value, max) =>
  Number.isSafeInteger(value) && value > 0 && value <= max;
const validLoad = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export function validateFullV2SessionPrescription(value, routine) {
  if (
    !record(value) ||
    !exactFields(value, TOP_FIELDS) ||
    value.prescriptionContractVersion !== 2 ||
    value.prescriptionCoverage !== "full" ||
    !Array.isArray(value.exercises) ||
    !Array.isArray(routine?.ex) ||
    routine.ex.length === 0 ||
    value.exercises.length !== routine.ex.length
  ) {
    throw new Error(INVALID);
  }

  const seen = new Set();
  const exercises = value.exercises.map((exercise, index) => {
    const expectedId = String(routine.ex[index]?.id ?? "");
    if (
      !record(exercise) ||
      !exactFields(exercise, EXERCISE_FIELDS) ||
      typeof exercise.exerciseId !== "string" ||
      !exercise.exerciseId.trim() ||
      exercise.exerciseId !== expectedId ||
      seen.has(exercise.exerciseId) ||
      !positiveInt(exercise.sets, 100) ||
      !positiveInt(exercise.repsMin, 1000) ||
      !positiveInt(exercise.repsMax, 1000) ||
      exercise.repsMax < exercise.repsMin
    ) {
      throw new Error(INVALID);
    }
    seen.add(exercise.exerciseId);

    const hasScalar = Object.hasOwn(exercise, "loadKg");
    const hasPerSet = Object.hasOwn(exercise, "prefillLoadsKg");
    if (hasScalar && !validLoad(exercise.loadKg)) {
      throw new Error(INVALID);
    }
    if (hasPerSet) {
      if (
        !Array.isArray(exercise.prefillLoadsKg) ||
        exercise.prefillLoadsKg.length !== exercise.sets ||
        !exercise.prefillLoadsKg.every((load) => load === null || validLoad(load)) ||
        (hasScalar && !exercise.prefillLoadsKg.every((load) => load === exercise.loadKg))
      ) {
        throw new Error(INVALID);
      }
    }

    return {
      exerciseId: exercise.exerciseId,
      sets: exercise.sets,
      repsMin: exercise.repsMin,
      repsMax: exercise.repsMax,
      ...(hasScalar ? { loadKg: exercise.loadKg } : {}),
      ...(hasPerSet ? { prefillLoadsKg: [...exercise.prefillLoadsKg] } : {}),
    };
  });

  return {
    prescriptionContractVersion: 2,
    prescriptionCoverage: "full",
    exercises,
  };
}
