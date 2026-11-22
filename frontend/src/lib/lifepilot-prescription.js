import { applyPrescription } from "./progression.js";
import {
  INVALID_V2_PRESCRIPTION,
  routineShapeForV2Validation,
  validateFullV2SessionPrescription,
} from "./lifepilot-prescription-v2-validate.js";

export {
  INVALID_V2_PRESCRIPTION,
  routineShapeForV2Validation,
  validateFullV2SessionPrescription,
} from "./lifepilot-prescription-v2-validate.js";


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
  const plan = {
    kind: "lifepilot",
    reps: repsMin,
    sets: setsCount,
  };
  if (v2) {
    if (loadKg != null && Number.isFinite(loadKg)) {
      plan.weight = loadKg;
    }
  } else {
    // v1 retains explicit null scalar weights in the stored plan metadata.
    plan.weight = loadKg;
  }
  return {
    id: cfg.id,
    sg: cfg.sg,
    target,
    plan,
    sets: buildSetsFromLifePilotPrescription({
      sets: setsCount,
      loadKg,
      repsMin,
      ...(v2 && Object.hasOwn(prescription, "prefillLoadsKg")
        ? { prefillLoadsKg: prescription.prefillLoadsKg } : {}),
    }, { v2 }),
  };
}

function exerciseCfgForFrozenSlot(st, externalSessionId, slot, templateById) {
  const active = st?.active;
  if (
    externalSessionId &&
    active?.id === externalSessionId &&
    Array.isArray(active.entries)
  ) {
    const frozen = active.entries.find((entry) => String(entry.id) === String(slot.id));
    if (frozen) {
      const template = templateById.get(String(slot.id));
      const target = frozen.target || {};
      return {
        ...(template || { id: frozen.id }),
        id: frozen.id,
        sg: frozen.sg ?? template?.sg,
        sets: target.sets ?? template?.sets,
        reps: target.reps ?? template?.reps,
        repsMin: target.repsMin ?? template?.repsMin,
        repsMax: target.repsMax ?? template?.repsMax,
        weight: target.weight ?? template?.weight,
      };
    }
  }
  return templateById.get(String(slot.id)) || slot;
}

export function buildWorkoutEntries(st, routine, prescriptionList, helpers, { externalSessionId = null } = {}) {
  // A full-v2 plan must cover the routine *before* any entries are built.
  // Never fall through to OpenGym progression for an omitted frozen slot.
  if (prescriptionList != null && !Array.isArray(prescriptionList)) {
    if (!routine?.ex?.length) {
      throw new Error(INVALID_V2_PRESCRIPTION);
    }
    const validated = routineShapeForV2Validation(st, routine, externalSessionId);
    const full = validateFullV2SessionPrescription(prescriptionList, validated);
    const templateById = new Map((routine.ex || []).map((cfg) => [String(cfg.id), cfg]));
    const ordered = (validated.ex || []).map((slot) =>
      exerciseCfgForFrozenSlot(st, externalSessionId, slot, templateById));
    return ordered.map((cfg, index) =>
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
