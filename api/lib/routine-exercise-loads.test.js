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

test("partial per-set prefills with unknown weights do not collapse to a scalar", () => {
  const cfg = { id: "0289", sets: 2, reps: 8, weight: 18 };
  const cases = [
    [
      [
        { w: 10, r: 8, done: true },
        { w: null, r: 8, done: true },
      ],
      [10, null],
    ],
    [
      [
        { w: null, r: 8, done: true },
        { w: 10, r: 8, done: true },
      ],
      [null, 10],
    ],
  ];
  for (const [sets, expectedLoads] of cases) {
    const state = {
      unit: "kg",
      workouts: [{ entries: [{ id: "0289", sets }] }],
      exWeights: {},
    };
    assert.deepEqual(resolvePlannedPrefillLoadsKg(state, cfg), expectedLoads);
    const uiSets = buildSets(state, cfg);
    assert.deepEqual(
      expectedLoads,
      uiSets.map((set) => (set.w == null || set.w === "" ? null : set.w)),
    );
    const summary = resolvePlannedPrefill(state, cfg);
    assert.equal(summary.progressionWorkingLoadKg, null);
    assert.equal(summary.progressionLoadSource, "partial_per_set");
    assert.equal(summary.progressionWorkingLoadUniform, false);
    const enriched = enrichExerciseLoadFields(state, cfg);
    assert.equal(enriched.progressionWorkingLoadKg, null);
    assert.equal(enriched.progressionNextAvailableLoadKg, null);
  }
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
  assert.equal(classifyLoadSemantics(null, LATERAL, "0334").implementsPerSet, 2);
  assert.equal(classifyLoadSemantics(null, TRICEPS, "2188").implementsPerSet, null);
  assert.equal(classifyLoadSemantics(null, DB_BENCH, "0289").loadSemantics, "per_implement");
  assert.equal(classifyLoadSemantics(null, DB_BENCH, "0289").loadSemanticsSource, "catalogue");
  assert.equal(classifyLoadSemantics(null, { id: "0285", side: true }, "0285").implementsPerSet, null);
});

test("owner-verified custom exercise reports per_implement without name heuristics", () => {
  const customId = "test-custom-dumbbell-move";
  const state = {
    unit: "kg",
    customEx: [
      {
        id: customId,
        n: "Dumbbell Fancy Curl",
        bp: "arms",
        eq: "custom",
        custom: true,
        verifiedLoadSemantics: "per_implement",
        verifiedImplementsPerSet: 1,
      },
    ],
    workouts: [],
    exWeights: {},
  };
  const cfg = { id: customId, sets: 3, reps: 10, weight: 15 };
  const semantics = classifyLoadSemantics(state, cfg, customId);
  assert.equal(semantics.loadSemantics, "per_implement");
  assert.equal(semantics.loadSemanticsSource, "owner_verified");
  assert.equal(semantics.implementsPerSet, 1);
  const enriched = enrichExerciseLoadFields(state, cfg);
  assert.equal(enriched.loadSemantics, "per_implement");
  assert.equal(enriched.loadSemanticsSource, "owner_verified");
});

test("unverified custom exercise with dumbbell in name stays unknown", () => {
  const customId = "test-custom-unverified";
  const state = {
    customEx: [
      {
        id: customId,
        n: "Cross-Body Dumbbell Hammer Curl",
        eq: "custom",
        custom: true,
      },
    ],
  };
  const semantics = classifyLoadSemantics(state, { id: customId, sets: 2, weight: 13 }, customId);
  assert.equal(semantics.loadSemantics, "unknown");
  assert.equal(semantics.loadSemanticsSource, "unknown");
});

test("revoked owner verification falls back to unknown for custom exercises", () => {
  const customId = "test-custom-revoked";
  const state = {
    customEx: [{ id: customId, n: "Formerly verified", eq: "custom", custom: true }],
  };
  const semantics = classifyLoadSemantics(state, { id: customId, sets: 2, weight: 10 }, customId);
  assert.equal(semantics.loadSemantics, "unknown");
  assert.equal(semantics.loadSemanticsSource, "unknown");
});

test("routine slot verifiedLoadSemantics overrides customEx metadata", () => {
  const customId = "test-slot-override";
  const state = {
    customEx: [
      {
        id: customId,
        n: "Custom move",
        eq: "custom",
        verifiedLoadSemantics: "per_implement",
        verifiedImplementsPerSet: 2,
      },
    ],
  };
  const cfg = {
    id: customId,
    sets: 3,
    reps: 8,
    weight: 20,
    verifiedLoadSemantics: "barbell_total",
  };
  const semantics = classifyLoadSemantics(state, cfg, customId);
  assert.equal(semantics.loadSemantics, "barbell_total");
  assert.equal(semantics.loadSemanticsSource, "owner_verified");
  assert.equal(semantics.implementsPerSet, null);
});

test("slot per_implement does not inherit stale custom implement count", () => {
  const customId = "test-slot-per-implement";
  const state = {
    customEx: [
      {
        id: customId,
        n: "Custom move",
        eq: "custom",
        verifiedLoadSemantics: "barbell_total",
        verifiedImplementsPerSet: 2,
      },
    ],
  };
  const cfg = {
    id: customId,
    sets: 3,
    reps: 8,
    weight: 20,
    verifiedLoadSemantics: "per_implement",
  };
  const semantics = classifyLoadSemantics(state, cfg, customId);
  assert.equal(semantics.loadSemantics, "per_implement");
  assert.equal(semantics.implementsPerSet, null);
});

test("slot per_implement uses only slot-verified implement count", () => {
  const customId = "test-slot-explicit-count";
  const state = {
    customEx: [
      {
        id: customId,
        n: "Custom move",
        eq: "custom",
        verifiedLoadSemantics: "per_implement",
        verifiedImplementsPerSet: 1,
      },
    ],
  };
  const cfg = {
    id: customId,
    sets: 3,
    reps: 8,
    weight: 20,
    verifiedLoadSemantics: "per_implement",
    verifiedImplementsPerSet: 2,
  };
  const semantics = classifyLoadSemantics(state, cfg, customId);
  assert.equal(semantics.implementsPerSet, 2);
});

test("parseVerifiedImplementsPerSet rejects coerced non-numeric values", () => {
  const customId = "test-invalid-implements";
  const state = {
    customEx: [
      {
        id: customId,
        n: "Custom move",
        eq: "custom",
        verifiedLoadSemantics: "per_implement",
        verifiedImplementsPerSet: true,
      },
    ],
  };
  const semantics = classifyLoadSemantics(state, { id: customId }, customId);
  assert.equal(semantics.loadSemantics, "per_implement");
  assert.equal(semantics.implementsPerSet, null);

  const stateString = {
    customEx: [
      {
        id: customId,
        n: "Custom move",
        eq: "custom",
        verifiedLoadSemantics: "per_implement",
        verifiedImplementsPerSet: "2",
      },
    ],
  };
  assert.equal(
    classifyLoadSemantics(stateString, { id: customId }, customId).implementsPerSet,
    2,
  );
  assert.equal(
    classifyLoadSemantics(
      {
        customEx: [
          {
            id: customId,
            verifiedLoadSemantics: "per_implement",
            verifiedImplementsPerSet: "2.5",
          },
        ],
      },
      { id: customId },
      customId,
    ).implementsPerSet,
    null,
  );
});

test("invalid owner verified semantics values are ignored", () => {
  const customId = "test-invalid-verified";
  const state = {
    customEx: [
      {
        id: customId,
        n: "Bad metadata",
        eq: "custom",
        verifiedLoadSemantics: "pair_total",
      },
    ],
  };
  const semantics = classifyLoadSemantics(state, { id: customId, sets: 2, weight: 5 }, customId);
  assert.equal(semantics.loadSemantics, "unknown");
  assert.equal(semantics.loadSemanticsSource, "unknown");
});

test("0289 progression 36 kg remains per_implement catalogue semantics", () => {
  const state = stale0289State(36);
  const enriched = enrichExerciseLoadFields(state, DB_BENCH);
  assert.equal(enriched.progressionWorkingLoadKg, 36);
  assert.equal(enriched.loadSemantics, "per_implement");
  assert.equal(enriched.loadSemanticsSource, "catalogue");
  assert.equal(enriched.implementsPerSet, 2);
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