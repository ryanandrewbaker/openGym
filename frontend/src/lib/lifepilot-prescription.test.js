import { describe, expect, it, vi } from "vitest";
import {
  applyLifePilotPrescription,
  buildEntryFromLifePilotPrescription,
  buildWorkoutEntries,
} from "./lifepilot-prescription.js";

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
