import { describe, expect, it, vi } from "vitest";
import { buildSets } from "./history.js";
import {
  applyLifePilotPrescription,
  buildEntryFromLifePilotPrescription,
  buildWorkoutEntries,
} from "./lifepilot-prescription.js";
import { applyPrescription, nextPrescription } from "./progression.js";

const LATERAL = "0334";
const BENCH = "0289";
const CURL = "0294";

function openGymState() {
  return {
    unit: "kg",
    workouts: [{
      d: "2026-09-01",
      entries: [
        { id: LATERAL, sets: [{ w: 7, r: 12, done: true }, { w: 7, r: 12, done: true }, { w: 7, r: 12, done: true }] },
        { id: BENCH, sets: [{ w: 25, r: 8, done: true }, { w: 25, r: 8, done: true }, { w: 25, r: 8, done: true }] },
        { id: CURL, sets: [{ w: 12, r: 10, done: true }, { w: 12, r: 10, done: true }, { w: 12, r: 10, done: true }] },
      ],
    }],
    exWeights: {
      [LATERAL]: { w: 7, d: "2026-09-01" },
      [BENCH]: { w: 25, d: "2026-09-01" },
      [CURL]: { w: 12, d: "2026-09-01" },
    },
  };
}

const routine = {
  id: "push",
  ex: [
    { id: LATERAL, sets: 3, reps: 12, repsMin: 8, weight: 7 },
    { id: BENCH, sets: 3, reps: 8, weight: 25 },
    { id: CURL, sets: 3, reps: 10, weight: 12 },
  ],
};

function startWorkout(state, prescriptionList) {
  return buildWorkoutEntries(state, routine, prescriptionList, {
    nextPrescription,
    applyPrescription,
    buildSets,
  });
}

describe("buildWorkoutEntries", () => {
  const routine = {
    id: "r1",
    ex: [{ id: "0025", sets: 3, reps: 8, weight: 0 }],
  };

  it("builds LifePilot loads and set counts without calling nextPrescription", () => {
    const nextPrescription = vi.fn();
    const applyPrescription = vi.fn();
    const buildSets = vi.fn();
    const entries = buildWorkoutEntries(
      { unit: "kg", workouts: [], exWeights: {} },
      routine,
      [{ exerciseId: "0025", sets: 4, loadKg: 34, repsMin: 8, repsMax: 12 }],
      { nextPrescription, applyPrescription, buildSets },
    );

    expect(nextPrescription).not.toHaveBeenCalled();
    expect(applyPrescription).not.toHaveBeenCalled();
    expect(buildSets).not.toHaveBeenCalled();
    expect(entries).toHaveLength(1);
    expect(entries[0].sets).toHaveLength(4);
    expect(entries[0].sets[0]).toEqual({ w: 34, r: 8, done: false });
    expect(entries[0].target.weight).toBe(34);
    expect(entries[0].plan.kind).toBe("lifepilot");
  });

  it("leaves weight unset when the prescribed load is null", () => {
    const entry = buildEntryFromLifePilotPrescription(
      { id: "0334", sets: 3, reps: 12, weight: 0 },
      { exerciseId: "0334", sets: 3, loadKg: null, repsMin: 8, repsMax: 12 },
    );
    expect(entry.sets[0].w).toBeUndefined();
    expect(entry.target.weight).toBeUndefined();
  });

  it("uses nextPrescription when no LifePilot prescription is present", () => {
    const nextPrescription = vi.fn(() => ({ kind: "up", weight: 62.5, reps: 8 }));
    const applyPrescription = vi.fn((sets, plan) => sets.map((set) => ({ ...set, w: plan.weight })));
    const buildSets = vi.fn(() => [{ w: 60, r: 8, done: false }]);
    const entries = buildWorkoutEntries(
      { unit: "kg", workouts: [], exWeights: {} },
      routine,
      null,
      { nextPrescription, applyPrescription, buildSets },
    );
    expect(nextPrescription).toHaveBeenCalled();
    expect(entries[0].sets[0].w).toBe(62.5);
  });
});

describe("Coach prescription at workout start", () => {
  it("uses the point rep target when min and max match after a load increase", () => {
    const entry = buildEntryFromLifePilotPrescription(
      { id: BENCH, sets: 3, reps: 12, repsMin: 8, weight: 27 },
      { exerciseId: BENCH, sets: 3, loadKg: 29, repsMin: 8, repsMax: 8 },
    );
    expect(entry.sets.map((set) => set.r)).toEqual([8, 8, 8]);
    expect(entry.target.reps).toBe(8);
  });

  it("starts lateral raise at the Coach 9 kg instead of the OpenGym 7 kg", () => {
    const state = openGymState();
    const before = JSON.stringify(state.workouts);
    const entries = startWorkout(state, [
      { exerciseId: LATERAL, sets: 3, loadKg: 9, repsMin: 8, repsMax: 12 },
    ]);
    const lateral = entries.find((entry) => entry.id === LATERAL);
    expect(lateral.plan.kind).toBe("lifepilot");
    expect(lateral.sets.map((set) => set.w)).toEqual([9, 9, 9]);
    expect(lateral.sets.map((set) => set.r)).toEqual([8, 8, 8]);
    expect(lateral.target.repsMin).toBe(8);
    expect(lateral.target.reps).toBe(12);
    expect(JSON.stringify(state.workouts)).toBe(before);
  });

  it("keeps the prescribed weight when it matches the OpenGym weight", () => {
    const entries = startWorkout(openGymState(), [
      { exerciseId: LATERAL, sets: 3, loadKg: 7, repsMin: 12, repsMax: 12 },
    ]);
    const lateral = entries.find((entry) => entry.id === LATERAL);
    expect(lateral.plan.kind).toBe("lifepilot");
    expect(lateral.sets[0]).toMatchObject({ w: 7, r: 12, done: false });
  });

  it("starts below the OpenGym weight when Coach prescribed less", () => {
    const entries = startWorkout(openGymState(), [
      { exerciseId: BENCH, sets: 3, loadKg: 20, repsMin: 8, repsMax: 8 },
    ]);
    const bench = entries.find((entry) => entry.id === BENCH);
    expect(bench.plan.kind).toBe("lifepilot");
    expect(bench.sets.map((set) => set.w)).toEqual([20, 20, 20]);
    expect(bench.sets[0].r).toBe(8);
  });

  it("applies different prescribed loads and leaves an unprescribed exercise on OpenGym logic", () => {
    const entries = startWorkout(openGymState(), [
      { exerciseId: LATERAL, sets: 3, loadKg: 9, repsMin: 10, repsMax: 15 },
      { exerciseId: BENCH, sets: 4, loadKg: 22, repsMin: 6, repsMax: 8 },
    ]);
    const lateral = entries.find((entry) => entry.id === LATERAL);
    const bench = entries.find((entry) => entry.id === BENCH);
    const curl = entries.find((entry) => entry.id === CURL);
    expect(lateral.sets[0]).toMatchObject({ w: 9, r: 10 });
    expect(lateral.target.reps).toBe(15);
    expect(bench.sets).toHaveLength(4);
    expect(bench.sets[0]).toMatchObject({ w: 22, r: 6 });
    expect(bench.target.reps).toBe(8);
    const untouched = startWorkout(openGymState(), null).find((entry) => entry.id === CURL);
    expect(curl.plan.kind).not.toBe("lifepilot");
    expect(curl.plan.kind).toBe(untouched.plan.kind);
    expect(curl.sets[0].w).toBe(untouched.sets[0].w);
    expect(curl.sets[0].r).toBe(untouched.sets[0].r);
  });

  it("would have started lateral raise at 7 kg without a Coach prescription", () => {
    const lateral = startWorkout(openGymState(), null).find((entry) => entry.id === LATERAL);
    expect(lateral.plan.kind).not.toBe("lifepilot");
    expect(lateral.sets[0].w).toBe(7);
  });
});

describe("applyLifePilotPrescription", () => {
  it("does not rewrite a logged set when the prescription arrives", () => {
    const out = applyLifePilotPrescription(
      [
        { w: 32, r: 8, done: true },
        { w: 32, r: 8, done: false },
      ],
      { sets: 3, loadKg: 34, repsMin: 8 },
    );
    expect(out[0]).toEqual({ w: 32, r: 8, done: true });
    expect(out[1].w).toBe(34);
    expect(out[1].r).toBe(8);
  });
});


describe("MASIS-157 full v2 frozen prescription", () => {
  const full = () => ({
    prescriptionContractVersion: 2,
    prescriptionCoverage: "full",
    exercises: [
      { exerciseId: LATERAL, sets: 2, repsMin: 8, repsMax: 12, prefillLoadsKg: [10, 14] },
      { exerciseId: BENCH, sets: 3, repsMin: 8, repsMax: 8, loadKg: 36, prefillLoadsKg: [36, 36, 36] },
      { exerciseId: CURL, sets: 2, repsMin: 10, repsMax: 12, prefillLoadsKg: [null, 15] },
    ],
  });

  const forbidden = () => ({
    nextPrescription: vi.fn(() => { throw new Error("live progression must not run"); }),
    buildSets: vi.fn(() => { throw new Error("live buildSets must not run"); }),
    applyPrescription: vi.fn(() => { throw new Error("live applyPrescription must not run"); }),
  });

  it("preserves heterogeneous per-index loads, null as unset, rep targets, order, and supersets", () => {
    const state = openGymState();
    const old = JSON.stringify(state);
    const config = { ...routine, ex: routine.ex.map((cfg, i) => ({ ...cfg, ...(i < 2 ? { sg: "pair" } : {}) })) };
    const helpers = forbidden();
    const entries = buildWorkoutEntries(state, config, full(), helpers);
    expect(entries.map((e) => e.id)).toEqual([LATERAL, BENCH, CURL]);
    expect(entries[0].sets.map((set) => set.w)).toEqual([10, 14]);
    expect(entries[0].target.weight).toBeUndefined();
    expect(entries[0].target.repsMin).toBe(8);
    expect(entries[0].target.repsMax).toBe(12);
    expect(entries[0].sg).toBe("pair");
    expect(entries[1].sg).toBe("pair");
    expect(entries[1].sets.map((set) => set.w)).toEqual([36, 36, 36]);
    expect(entries[1].target.weight).toBe(36);
    expect(entries[2].sets[0]).toEqual({ r: 10, done: false });
    expect(entries[2].sets[1]).toEqual({ w: 15, r: 10, done: false });
    expect(JSON.stringify(state)).toBe(old);
    for (const fn of Object.values(helpers)) expect(fn).not.toHaveBeenCalled();
  });

  it("rejects malformed v2 full snapshots without running progression", () => {
    const bad = [
      (x) => { x.prescriptionContractVersion = 3; },
      (x) => { x.prescriptionCoverage = "partial"; },
      (x) => { x.exercises.pop(); },
      (x) => { x.exercises.reverse(); },
      (x) => { x.exercises[1].exerciseId = LATERAL; },
      (x) => { x.exercises[1].exerciseId = "unknown"; },
      (x) => { x.exercises[0].prefillLoadsKg = [10]; },
      (x) => { x.exercises[0].prefillLoadsKg = [10, "14"]; },
      (x) => { x.exercises[0].prefillLoadsKg = [10, -2]; },
      (x) => { x.exercises[0].sets = "2"; },
      (x) => { x.exercises[0].sets = 101; },
      (x) => { x.exercises[0].repsMax = 1001; },
      (x) => { x.exercises[0].repsMin = 0; },
      (x) => { x.exercises[1].prefillLoadsKg = [35, 36, 36]; },
      (x) => { x.exercises[1].loadKg = null; },
      (x) => { x.exercises[2].prefillLoadsKg = [null, Infinity]; },
      (x) => { x.exercises[1].unknownField = 99; },
    ];
    for (const mutate of bad) {
      const value = full();
      mutate(value);
      const helpers = forbidden();
      expect(() => buildWorkoutEntries(openGymState(), routine, value, helpers))
        .toThrow("invalid_v2_prescription");
      for (const fn of Object.values(helpers)) expect(fn).not.toHaveBeenCalled();
    }
  });
});
