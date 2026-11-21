import assert from "node:assert/strict";
import test from "node:test";
import { buildSets } from "../../frontend/src/lib/history.js";
import {
  classifyLoadSemantics,
  enrichExerciseLoadFields,
  resolvePlannedPrefill,
  resolvePlannedPrefillLoadsKg,
  routineTemplateLoadKg,
} from "./routine-exercise-loads.js";

const DB_BENCH = { id: "0289", sets: 4, reps: 10, weight: 18 };
const LATERAL = { id: "0334", sets: 3, reps: 12, weight: 9, repsMin: 8 };
const TRICEPS = { id: "2188", sets: 3, reps: 10, weight: 13 };

function stale0289State(exWeight = 36) {
  return {
    unit: "kg",
    equipment: [
      {
        id: "adjustable-dumbbells",
        name: "Adjustable dumbbells",
        eq: "dumbbell",
        unit: "kg",
        loads: [5, 7, 9, 11, 13, 15, 18, 20, 22, 25, 27, 29, 32, 34, 36, 38, 40],
      },
    ],
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

test("0289 template 18 / progression 36 — template ladder 20 vs progression ladder 38", () => {
  const state = stale0289State(36);
  const enriched = enrichExerciseLoadFields(state, DB_BENCH);
  assert.equal(enriched.routineTemplateLoadKg, 18);
  assert.equal(enriched.progressionWorkingLoadKg, 36);
  assert.equal(enriched.progressionLoadSource, "ex_weights");
  assert.equal(enriched.templateNextAvailableLoadKg, 20);
  assert.equal(enriched.progressionNextAvailableLoadKg, 38);
  assert.equal(enriched.templateLadderReference, "routine_template");
  assert.equal(enriched.progressionLadderReference, "progression_working_load");
  assert.equal(enriched.nextAvailableLoadKg, undefined);
});

test("prefill parity with buildSets for heterogeneous last sets without exWeights", () => {
  const cfg = { id: "0289", sets: 2, reps: 8, weight: 18 };
  const state = {
    unit: "kg",
    workouts: [
      {
        entries: [
          {
            id: "0289",
            sets: [
              { w: 10, r: 8, done: true },
              { w: 14, r: 8, done: true },
            ],
          },
        ],
      },
    ],
    exWeights: {},
  };

  const apiLoads = resolvePlannedPrefillLoadsKg(state, cfg);
  const uiSets = buildSets(state, cfg);
  assert.deepEqual(
    apiLoads,
    uiSets.map((set) => set.w),
  );
  const summary = resolvePlannedPrefill(state, cfg);
  assert.equal(summary.progressionWorkingLoadKg, null);
  assert.equal(summary.progressionLoadSource, "last_usable_set_per_set");
  assert.deepEqual(summary.progressionPrefillLoadsKg, [10, 14]);
  assert.equal(summary.progressionWorkingLoadUniform, false);
});

test("prefill parity for homogeneous last sets without exWeights", () => {
  const cfg = { id: "0289", sets: 3, reps: 8, weight: 18 };
  const state = {
    unit: "kg",
    workouts: [
      {
        entries: [{ id: "0289", sets: [{ w: 34, r: 8, done: true }] }],
      },
    ],
    exWeights: {},
  };
  assert.deepEqual(resolvePlannedPrefillLoadsKg(state, cfg), [34, 34, 34]);
  const summary = resolvePlannedPrefill(state, cfg);
  assert.equal(summary.progressionWorkingLoadKg, 34);
  assert.equal(summary.progressionLoadSource, "last_usable_set");
});

test("bodyweight_offset prefill can be 0 kg (valid), not unavailable", () => {
  const cfg = { id: "0001", sets: 3, reps: 10, weight: 0, bodyweight: true };
  const state = { unit: "kg", workouts: [], exWeights: {} };
  const summary = resolvePlannedPrefill(state, cfg);
  assert.equal(summary.progressionWorkingLoadKg, 0);
  assert.equal(summary.progressionLoadSource, "routine_template");
  assert.deepEqual(summary.progressionPrefillLoadsKg, [0, 0, 0]);
});

test("implementsPerSet: verified 0289/0334 only; ambiguous exercises stay null", () => {
  assert.equal(classifyLoadSemantics(LATERAL, "0334").implementsPerSet, 2);
  assert.equal(classifyLoadSemantics(TRICEPS, "2188").implementsPerSet, null);
  assert.equal(classifyLoadSemantics(DB_BENCH, "0289").loadSemantics, "per_implement");
  assert.equal(classifyLoadSemantics({ id: "0285", side: true }, "0285").implementsPerSet, null);
});

test("exWeights beats last set beats template precedence", () => {
  const state = {
    unit: "kg",
    workouts: [
      {
        entries: [{ id: "0289", sets: [{ w: 34, r: 8, done: true }] }],
      },
    ],
    exWeights: { "0289": { w: 36 } },
  };
  assert.deepEqual(resolvePlannedPrefill(state, { id: "0289", sets: 2, weight: 18 }), {
    progressionWorkingLoadKg: 36,
    progressionLoadSource: "ex_weights",
    progressionPrefillLoadsKg: [36, 36],
    progressionWorkingLoadUniform: true,
  });
});

test("routineTemplateLoadKg matches template weight conversion", () => {
  assert.equal(routineTemplateLoadKg({ weight: 18 }, { unit: "kg" }), 18);
});