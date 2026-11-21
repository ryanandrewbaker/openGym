import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyLoadSemantics,
  enrichExerciseLoadFields,
  resolvePlannedPrefill,
  routineTemplateLoadKg,
} from "./routine-exercise-loads.js";

const DB_BENCH = { id: "0289", sets: 4, reps: 10, weight: 18 };
const LATERAL = { id: "0334", sets: 3, reps: 12, weight: 9, repsMin: 8 };
const TRICEPS = { id: "2188", sets: 3, reps: 10, weight: 13 };
const BARBELL = { id: "0025", sets: 4, reps: 8, weight: 60 };
const DIP = { id: "0001", sets: 3, reps: 10, weight: 10, bodyweight: true };

function stale0289State(exWeight = 36) {
  return {
    unit: "kg",
    workouts: [
      {
        id: "w1",
        entries: [
          {
            id: "0289",
            sets: [
              { w: 36, r: 8, done: true },
              { w: 36, r: 8, done: true },
            ],
          },
        ],
      },
    ],
    exWeights: { "0289": { w: exWeight, d: "2026-11-20" } },
  };
}

test("0289 stale template 18 kg vs exWeights 36 kg — progression prefill is per dumbbell", () => {
  const state = stale0289State(36);
  const enriched = enrichExerciseLoadFields(state, DB_BENCH, "dumbbell bench press");
  assert.equal(enriched.routineTemplateLoadKg, 18);
  assert.equal(enriched.progressionWorkingLoadKg, 36);
  assert.equal(enriched.progressionLoadSource, "ex_weights");
  assert.equal(enriched.loadSemantics, "per_implement");
  assert.equal(enriched.implementsPerSet, 2);
});

test("prefill precedence: exWeights beats last set beats template", () => {
  const state = {
    unit: "kg",
    workouts: [
      {
        entries: [{ id: "0289", sets: [{ w: 34, r: 8, done: true }] }],
      },
    ],
    exWeights: { "0289": { w: 36 } },
  };
  assert.deepEqual(resolvePlannedPrefill(state, { id: "0289", weight: 18 }), {
    progressionWorkingLoadKg: 36,
    progressionLoadSource: "ex_weights",
  });

  const noExWeights = {
    unit: "kg",
    workouts: state.workouts,
    exWeights: {},
  };
  assert.deepEqual(resolvePlannedPrefill(noExWeights, { id: "0289", weight: 18 }), {
    progressionWorkingLoadKg: 34,
    progressionLoadSource: "last_usable_set",
  });

  const templateOnly = { unit: "kg", workouts: [], exWeights: {} };
  assert.deepEqual(resolvePlannedPrefill(templateOnly, { id: "0289", weight: 18 }), {
    progressionWorkingLoadKg: 18,
    progressionLoadSource: "routine_template",
  });
});

test("load semantics across equipment classes", () => {
  assert.equal(
    classifyLoadSemantics(LATERAL, "0334", "dumbbell lateral raise").loadSemantics,
    "per_implement",
  );
  assert.equal(classifyLoadSemantics(LATERAL, "0334", "dumbbell lateral raise").implementsPerSet, 2);

  const triceps = classifyLoadSemantics(TRICEPS, "2188", "dumbbell seated triceps extension");
  assert.equal(triceps.loadSemantics, "per_implement");
  assert.equal(triceps.implementsPerSet, 1);

  assert.equal(classifyLoadSemantics(BARBELL, "0025", "barbell bench press").loadSemantics, "barbell_total");

  assert.equal(classifyLoadSemantics(DIP, "0001", "weighted dip").loadSemantics, "bodyweight_offset");

  assert.equal(
    classifyLoadSemantics({ id: "custom-1" }, "custom-1", "mystery move").loadSemantics,
    "unknown",
  );
});

test("unilateral side flag does not change load scalar semantics", () => {
  const sideCurl = { id: "0285", side: true, weight: 16 };
  const semantics = classifyLoadSemantics(sideCurl, "0285", "dumbbell alternate biceps curl");
  assert.equal(semantics.loadSemantics, "per_implement");
  assert.equal(semantics.implementsPerSet, null);
});

test("missing progression sources return unavailable, not template guess as ex_weights", () => {
  const state = { unit: "kg", workouts: [], exWeights: {} };
  const enriched = enrichExerciseLoadFields(state, { id: "0289", weight: 0 }, "dumbbell bench press");
  assert.equal(enriched.routineTemplateLoadKg, 0);
  assert.equal(enriched.progressionWorkingLoadKg, null);
  assert.equal(enriched.progressionLoadSource, "unavailable");
});

test("routineTemplateLoadKg matches template weight conversion", () => {
  const state = { unit: "kg" };
  assert.equal(routineTemplateLoadKg({ weight: 18 }, state), 18);
});