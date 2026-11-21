import { EXDB } from "../lib/exercises-data.js";
import { convertLoad } from "./equipment-core.js";

const BARBELL_EQ = new Set([
  "barbell",
  "ez barbell",
  "olympic barbell",
  "smith machine",
  "trap bar",
]);

const PER_IMPLEMENT_EQ = new Set(["dumbbell", "kettlebell"]);

/** Names that reliably use one dumbbell for the logged scalar (both hands on one implement). */
const SINGLE_DUMBBELL_NAME =
  /\b(seated triceps extension|lying triceps extension|goblet squat|goblet|pullover|concentration curl)\b/i;

export function catalogueEq(exerciseId) {
  return EXDB.find((entry) => entry.id === exerciseId)?.eq || "";
}

function isBwFlag(cfg, exerciseId) {
  if (cfg && cfg.bodyweight != null) return !!cfg.bodyweight;
  return catalogueEq(exerciseId) === "body weight";
}

function isPerSide(cfg) {
  return !!(cfg && cfg.side);
}

function singleDumbbellSession(exerciseId, exerciseName) {
  const name = String(exerciseName || "").trim();
  if (SINGLE_DUMBBELL_NAME.test(name)) return true;
  const ex = EXDB.find((entry) => entry.id === exerciseId);
  if (ex && SINGLE_DUMBBELL_NAME.test(String(ex.n || ""))) return true;
  return false;
}

/**
 * Classify how a logged scalar load should be interpreted for agents.
 * Does not transform weights — documentation only.
 */
export function classifyLoadSemantics(cfg, exerciseId, exerciseName) {
  const eq = catalogueEq(exerciseId);
  const bw = isBwFlag(cfg, exerciseId);

  if (bw || eq === "body weight") {
    return { loadSemantics: "bodyweight_offset", implementsPerSet: null };
  }
  if (BARBELL_EQ.has(eq)) {
    return { loadSemantics: "barbell_total", implementsPerSet: null };
  }
  if (PER_IMPLEMENT_EQ.has(eq)) {
    let implementsPerSet = null;
    if (!isPerSide(cfg) && !singleDumbbellSession(exerciseId, exerciseName)) {
      implementsPerSet = 2;
    } else if (singleDumbbellSession(exerciseId, exerciseName)) {
      implementsPerSet = 1;
    }
    return { loadSemantics: "per_implement", implementsPerSet };
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

/**
 * Mirrors planned-session `buildSets()` prefill (preferLast: false) — exWeights, then last
 * usable working set, then routine template weight.
 */
export function resolvePlannedPrefill(state, cfg) {
  const last = lastEntryFor(state, cfg.id);
  const conf = state?.exWeights?.[cfg.id];
  const prev = last?.sets?.[0] ?? null;
  const usable = prev && prev.r > 0 ? prev : null;

  let weightInUnit = null;
  let progressionLoadSource = "unavailable";

  if (conf && conf.w > 0) {
    weightInUnit = Number(conf.w);
    progressionLoadSource = "ex_weights";
  } else if (usable) {
    weightInUnit = usable.w != null ? Number(usable.w) : null;
    progressionLoadSource = "last_usable_set";
  } else if (cfg.weight != null && Number(cfg.weight) > 0) {
    weightInUnit = Number(cfg.weight);
    progressionLoadSource = "routine_template";
  }

  if (weightInUnit == null || !Number.isFinite(weightInUnit)) {
    return {
      progressionWorkingLoadKg: null,
      progressionLoadSource: "unavailable",
    };
  }

  const unit = state?.unit === "lb" ? "lb" : "kg";
  return {
    progressionWorkingLoadKg: convertLoad(weightInUnit, unit, "kg"),
    progressionLoadSource,
  };
}

export function routineTemplateLoadKg(entry, state) {
  const unit = state?.unit === "lb" ? "lb" : "kg";
  return convertLoad(entry.weight, unit, "kg");
}

export function enrichExerciseLoadFields(state, entry, exerciseName) {
  const routineTemplate = routineTemplateLoadKg(entry, state);
  const { progressionWorkingLoadKg, progressionLoadSource } = resolvePlannedPrefill(state, entry);
  const semantics = classifyLoadSemantics(entry, entry.id, exerciseName);
  return {
    routineTemplateLoadKg: routineTemplate,
    progressionWorkingLoadKg,
    progressionLoadSource,
    loadSemantics: semantics.loadSemantics,
    implementsPerSet: semantics.implementsPerSet,
  };
}