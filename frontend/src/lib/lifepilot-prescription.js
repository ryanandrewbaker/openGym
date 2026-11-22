import { applyPrescription } from "./progression.js";

// Pure, strict v2 contract validation mirrors the API validator. Both the
// signed-token endpoint and native embed must fail closed before workout writes.
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


export function findLifePilotPrescription(prescriptions, exerciseId) {
  if (!Array.isArray(prescriptions) || !exerciseId) return null;
  return prescriptions.find((entry) => String(entry.exerciseId) === String(exerciseId)) ?? null;
}

export function buildSetsFromLifePilotPrescription(prescription, { v2 = false } = {}) {
  const setsCount = Math.max(1, Number(prescription?.sets) || 1);
  const repsMin = Number(prescription?.repsMin);
  const loadKg = prescription?.loadKg == null ? null : Number(prescription.loadKg);
  // A v2 null is an explicit unset value, never a signal to consult live
  // nextPrescription/buildSets. Legacy v1 remains scalar-only.
  const perSet = v2 && Array.isArray(prescription?.prefillLoadsKg)
    ? prescription.prefillLoadsKg : null;
  const sets = [];
  for (let i = 0; i < setsCount; i += 1) {
    const set = { r: Number.isFinite(repsMin) && repsMin > 0 ? repsMin : 1, done: false };
    if (perSet) {
      if (perSet[i] !== null) set.w = perSet[i];
    } else if (loadKg != null && Number.isFinite(loadKg)) {
      set.w = loadKg;
    }
    sets.push(set);
  }
  return sets;
}

export function applyLifePilotPrescription(sets, prescription) {
  if (!Array.isArray(sets) || sets.length === 0) {
    return buildSetsFromLifePilotPrescription(prescription);
  }
  const loadKg = prescription?.loadKg == null ? null : Number(prescription.loadKg);
  const plan = {
    kind: "up",
    reps: Number(prescription?.repsMin) || undefined,
    sets: Number(prescription?.sets) || undefined,
  };
  if (loadKg != null && Number.isFinite(loadKg)) {
    plan.weight = loadKg;
  }
  return applyPrescription(sets, plan);
}

export function buildEntryFromLifePilotPrescription(cfg, prescription, { v2 = false } = {}) {
  const setsCount = Math.max(1, Number(prescription.sets) || Number(cfg.sets) || 1);
  const repsMin = Number(prescription.repsMin) || Number(cfg.reps) || 1;
  const repsMax = Number(prescription.repsMax) || Number(cfg.reps) || repsMin;
  const loadKg = prescription.loadKg == null ? null : Number(prescription.loadKg);
  const target = {
    ...cfg,
    sets: setsCount,
    reps: repsMin === repsMax ? repsMin : repsMax,
    repsMin,
    repsMax,
  };
  if (loadKg != null && Number.isFinite(loadKg)) {
    target.weight = loadKg;
  } else {
    delete target.weight;
  }
  return {
    id: cfg.id,
    sg: cfg.sg,
    target,
    plan: {
      kind: "lifepilot",
      weight: loadKg,
      reps: repsMin,
      sets: setsCount,
    },
    sets: buildSetsFromLifePilotPrescription({
      sets: setsCount,
      loadKg,
      repsMin,
      ...(v2 && Object.hasOwn(prescription, "prefillLoadsKg")
        ? { prefillLoadsKg: prescription.prefillLoadsKg } : {}),
    }, { v2 }),
  };
}

export function buildWorkoutEntries(st, routine, prescriptionList, helpers) {
  // A full-v2 plan must cover the routine *before* any entries are built.
  // Never fall through to OpenGym progression for an omitted frozen slot.
  if (prescriptionList != null && !Array.isArray(prescriptionList)) {
    const full = validateFullV2SessionPrescription(prescriptionList, routine);
    return routine.ex.map((cfg, index) =>
      buildEntryFromLifePilotPrescription(cfg, full.exercises[index], { v2: true }));
  }
  const { nextPrescription, applyPrescription: apply, buildSets } = helpers;
  return (routine ? routine.ex : []).map((cfg) => {
    const lp = findLifePilotPrescription(prescriptionList, cfg.id);
    if (lp) {
      return buildEntryFromLifePilotPrescription(cfg, lp);
    }
    const plan = nextPrescription(st, cfg, routine);
    return { id: cfg.id, sg: cfg.sg, target: { ...cfg }, plan, sets: apply(buildSets(st, cfg), plan) };
  });
}
