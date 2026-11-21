import { EXDB } from "../lib/exercises-data.js";
import {
  convertLoad,
  equipmentForCatalogue,
  getLoadJumpPercent,
  getNextAvailableLoad,
  getPreviousAvailableLoad,
  loadsInUnit,
} from "./equipment-core.js";

const BARBELL_EQ = new Set([
  "barbell",
  "ez barbell",
  "olympic barbell",
  "smith machine",
  "trap bar",
]);

const PER_IMPLEMENT_EQ = new Set(["dumbbell", "kettlebell"]);

/**
 * Verified catalogue bilateral dumbbell exercises where two implements share one
 * logged scalar. Do not extend by name heuristics — unknown IDs stay null.
 */
const VERIFIED_IMPLEMENTS_PER_SET = new Map([
  ["0289", 2], // dumbbell bench press (UAT / MASIS-149)
  ["0334", 2], // dumbbell lateral raise (catalogue bilateral convention)
]);

export function catalogueEq(exerciseId) {
  return EXDB.find((entry) => entry.id === exerciseId)?.eq || "";
}

function isBwFlag(cfg, exerciseId) {
  if (cfg && cfg.bodyweight != null) return !!cfg.bodyweight;
  return catalogueEq(exerciseId) === "body weight";
}

/**
 * Classify how a logged scalar load should be interpreted for agents.
 * Does not transform weights — documentation only.
 */
export function classifyLoadSemantics(cfg, exerciseId) {
  const eq = catalogueEq(exerciseId);
  const bw = isBwFlag(cfg, exerciseId);

  if (bw || eq === "body weight") {
    return { loadSemantics: "bodyweight_offset", implementsPerSet: null };
  }
  if (BARBELL_EQ.has(eq)) {
    return { loadSemantics: "barbell_total", implementsPerSet: null };
  }
  if (PER_IMPLEMENT_EQ.has(eq)) {
    const verified = VERIFIED_IMPLEMENTS_PER_SET.get(String(exerciseId));
    return {
      loadSemantics: "per_implement",
      implementsPerSet: verified ?? null,
    };
  }
  return { loadSemantics: "unknown", implementsPerSet: null };
}

export function lastEntryFor(state, exerciseId) {
  const workouts = state?.workouts || [];
  for (let i = workouts.length - 1; i >= 0; i--) {
    const entry = (workouts[i].entries || []).find((e) => String(e.id) === String(exerciseId));
    if (entry && (entry.sets || []).some((s) => s.done)) {
      return { sets: entry.sets.filter((s) => s.done) };
    }
  }
  return null;
}

function weightsNearlyEqual(a, b) {
  return Math.abs(Number(a) - Number(b)) < 0.05;
}

/**
 * Planned-session prefill weights in kg, mirroring `buildSets(S, cfg)` with preferLast: false.
 */
export function resolvePlannedPrefillLoadsKg(state, cfg) {
  const last = lastEntryFor(state, cfg.id);
  const setCount = Math.max(1, Number(cfg.sets) || 1);
  const conf = state?.exWeights?.[cfg.id];
  const unit = state?.unit === "lb" ? "lb" : "kg";
  const prevAt = (i) => (last ? last.sets[i] || last.sets[last.sets.length - 1] : null);
  const out = [];

  for (let i = 0; i < setCount; i += 1) {
    const prev = prevAt(i);
    const usable = prev && prev.r > 0 ? prev : null;
    const w = conf && conf.w > 0 ? conf.w : usable ? usable.w : cfg.weight;
    if (w == null || w === "") {
      out.push(null);
      continue;
    }
    const n = Number(w);
    out.push(Number.isFinite(n) ? convertLoad(n, unit, "kg") : null);
  }
  return out;
}

function uniformLoadKg(loadsKg) {
  const finite = loadsKg.filter((v) => v != null && Number.isFinite(v));
  if (finite.length === 0) {
    return { uniform: null, heterogeneous: false };
  }
  const first = finite[0];
  const heterogeneous = finite.some((v) => !weightsNearlyEqual(v, first));
  if (heterogeneous) {
    return { uniform: null, heterogeneous: true };
  }
  return { uniform: first, heterogeneous: false };
}

/**
 * Scalar summary + source for agents. Heterogeneous per-set prefills must not collapse to first set only.
 */
export function resolvePlannedPrefill(state, cfg) {
  const loadsKg = resolvePlannedPrefillLoadsKg(state, cfg);
  const conf = state?.exWeights?.[cfg.id];
  const { uniform, heterogeneous } = uniformLoadKg(loadsKg);

  if (conf && conf.w > 0) {
    const unit = state?.unit === "lb" ? "lb" : "kg";
    return {
      progressionWorkingLoadKg: convertLoad(Number(conf.w), unit, "kg"),
      progressionLoadSource: "ex_weights",
      progressionPrefillLoadsKg: loadsKg,
      progressionWorkingLoadUniform: true,
    };
  }

  if (heterogeneous) {
    return {
      progressionWorkingLoadKg: null,
      progressionLoadSource: "last_usable_set_per_set",
      progressionPrefillLoadsKg: loadsKg,
      progressionWorkingLoadUniform: false,
    };
  }

  if (uniform != null) {
    const last = lastEntryFor(state, cfg.id);
    const hadUsableHistory =
      last &&
      loadsKg.some((_, i) => {
        const prev = last.sets[i] || last.sets[last.sets.length - 1];
        return prev && prev.r > 0;
      });
    return {
      progressionWorkingLoadKg: uniform,
      progressionLoadSource: hadUsableHistory ? "last_usable_set" : "routine_template",
      progressionPrefillLoadsKg: loadsKg,
      progressionWorkingLoadUniform: true,
    };
  }

  return {
    progressionWorkingLoadKg: null,
    progressionLoadSource: "unavailable",
    progressionPrefillLoadsKg: loadsKg,
    progressionWorkingLoadUniform: false,
  };
}

export function ladderFromLoadKg(loadKg, kit) {
  if (!kit || loadKg == null || !Number.isFinite(loadKg)) {
    return {
      nextAvailableLoadKg: null,
      previousAvailableLoadKg: null,
      loadJumpPercent: null,
    };
  }
  const loads = loadsInUnit(kit, "kg");
  const next = getNextAvailableLoad(loadKg, loads);
  const prev = getPreviousAvailableLoad(loadKg, loads);
  return {
    nextAvailableLoadKg: next != null ? convertLoad(next, "kg", "kg") : null,
    previousAvailableLoadKg: prev != null ? convertLoad(prev, "kg", "kg") : null,
    loadJumpPercent: next != null && loadKg > 0 ? getLoadJumpPercent(loadKg, next) : null,
  };
}

export function routineTemplateLoadKg(entry, state) {
  const unit = state?.unit === "lb" ? "lb" : "kg";
  return convertLoad(entry.weight, unit, "kg");
}

export function enrichExerciseLoadFields(state, entry) {
  const exerciseId = String(entry.id);
  const routineTemplate = routineTemplateLoadKg(entry, state);
  const prefill = resolvePlannedPrefill(state, entry);
  const semantics = classifyLoadSemantics(entry, exerciseId);
  const kit = equipmentForCatalogue(state, entry, catalogueEq(exerciseId));

  const templateLadder = ladderFromLoadKg(routineTemplate, kit);
  const progressionLadder =
    prefill.progressionWorkingLoadKg != null
      ? ladderFromLoadKg(prefill.progressionWorkingLoadKg, kit)
      : {
          nextAvailableLoadKg: null,
          previousAvailableLoadKg: null,
          loadJumpPercent: null,
        };

  return {
    routineTemplateLoadKg: routineTemplate,
    progressionWorkingLoadKg: prefill.progressionWorkingLoadKg,
    progressionLoadSource: prefill.progressionLoadSource,
    progressionPrefillLoadsKg: prefill.progressionPrefillLoadsKg,
    progressionWorkingLoadUniform: prefill.progressionWorkingLoadUniform,
    loadSemantics: semantics.loadSemantics,
    implementsPerSet: semantics.implementsPerSet,
    templateLadderReference: "routine_template",
    progressionLadderReference:
      prefill.progressionWorkingLoadKg != null ? "progression_working_load" : null,
    progressionNextAvailableLoadKg: progressionLadder.nextAvailableLoadKg,
    progressionPreviousAvailableLoadKg: progressionLadder.previousAvailableLoadKg,
    progressionLoadJumpPercent: progressionLadder.loadJumpPercent,
    templateNextAvailableLoadKg: templateLadder.nextAvailableLoadKg,
    templatePreviousAvailableLoadKg: templateLadder.previousAvailableLoadKg,
    templateLoadJumpPercent: templateLadder.loadJumpPercent,
  };
}