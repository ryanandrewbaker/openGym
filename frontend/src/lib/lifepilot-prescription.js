import { applyPrescription } from "./progression.js";

export function findLifePilotPrescription(prescriptions, exerciseId) {
  if (!Array.isArray(prescriptions) || !exerciseId) return null;
  return prescriptions.find((entry) => String(entry.exerciseId) === String(exerciseId)) ?? null;
}

export function buildSetsFromLifePilotPrescription(prescription) {
  const setsCount = Math.max(1, Number(prescription?.sets) || 1);
  const repsMin = Number(prescription?.repsMin);
  const loadKg = prescription?.loadKg == null ? null : Number(prescription.loadKg);
  const sets = [];
  for (let i = 0; i < setsCount; i += 1) {
    const set = { r: Number.isFinite(repsMin) && repsMin > 0 ? repsMin : 1, done: false };
    if (loadKg != null && Number.isFinite(loadKg)) {
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

export function buildEntryFromLifePilotPrescription(cfg, prescription) {
  const setsCount = Math.max(1, Number(prescription.sets) || Number(cfg.sets) || 1);
  const repsMin = Number(prescription.repsMin) || Number(cfg.reps) || 1;
  const repsMax = Number(prescription.repsMax) || Number(cfg.reps) || repsMin;
  const loadKg = prescription.loadKg == null ? null : Number(prescription.loadKg);
  const target = {
    ...cfg,
    sets: setsCount,
    reps: repsMax,
    repsMin,
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
    }),
  };
}

export function buildWorkoutEntries(st, routine, prescriptionList, helpers) {
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
