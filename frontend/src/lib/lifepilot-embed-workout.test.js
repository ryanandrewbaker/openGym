import { describe, expect, it } from "vitest";
import { embeddedWorkoutStartAction, shouldBeginEmbeddedWorkout } from "./lifepilot-embed-workout.js";

describe("shouldBeginEmbeddedWorkout", () => {
  const sunday = {
    mode: "workout",
    routineId: "shoulders-hinge",
    externalSessionId: "session-sunday",
  };

  it("starts the requested routine when nothing is in progress", () => {
    expect(shouldBeginEmbeddedWorkout(sunday, null)).toBe(true);
  });

  it("keeps the in-progress workout when LifePilot is resuming that same session with logged sets", () => {
    expect(
      shouldBeginEmbeddedWorkout(sunday, {
        id: "session-sunday",
        routineId: "shoulders-hinge",
        d: "2026-09-24",
        entries: [{ id: "0405", sets: [{ done: true }] }],
      }, "2026-09-24"),
    ).toBe(false);
  });

  it("preserves frozen active entries when the live routine was reordered or trimmed", () => {
    const active = {
      id: "session-sunday",
      routineId: "shoulders-hinge",
      d: "2026-09-24",
      start: Date.parse("2026-09-24T01:00:00.000Z"),
      entries: [
        {
          id: "0405",
          sg: "pair",
          target: { sets: 2, repsMin: 8, repsMax: 12 },
          sets: [{ w: 10, r: 8, done: false }, { w: 14, r: 8, done: false }],
        },
        {
          id: "0406",
          sets: [{ w: 36, r: 10, done: true }],
        },
      ],
    };
    const snapshot = JSON.stringify(active);
    const v2 = {
      mode: "workout",
      routineId: "shoulders-hinge",
      externalSessionId: "session-sunday",
      prescription: { prescriptionContractVersion: 2, prescriptionCoverage: "full", exercises: [] },
    };
    expect(shouldBeginEmbeddedWorkout(v2, active, "2026-09-24")).toBe(false);
    expect(embeddedWorkoutStartAction(v2, active, "2026-09-24")).toBe("notify");
    expect(JSON.stringify(active)).toBe(snapshot);
    expect(active.entries[0].sg).toBe("pair");
    expect(active.entries[0].sets[1].w).toBe(14);
  });

  it("never rebuilds an existing same-session frozen v2 workout, even before its first logged set", () => {
    const v2 = { ...sunday, prescription: { prescriptionContractVersion: 2, prescriptionCoverage: "full", exercises: [] } };
    const active = {
      id: "session-sunday",
      routineId: "shoulders-hinge",
      d: "2026-09-24",
      start: Date.parse("2026-09-24T01:00:00.000Z"),
      entries: [{ id: "0405", sets: [{ w: 10, r: 8, done: false }, { w: 14, r: 8, done: false }] }],
    };
    expect(shouldBeginEmbeddedWorkout(v2, active, "2026-09-24")).toBe(false);
    expect(embeddedWorkoutStartAction(v2, active, "2026-09-24")).toBe("notify");
    expect(embeddedWorkoutStartAction(v2, null, "2026-09-24")).toBe("begin");
  });

  it("rebuilds today's unused session so later routine edits replace the snapshot", () => {
    expect(
      shouldBeginEmbeddedWorkout(
        {
          mode: "workout",
          routineId: "back-shoulders-biceps",
          externalSessionId: "session-thursday",
        },
        {
          id: "session-thursday",
          routineId: "back-shoulders-biceps",
          d: "2026-09-24",
          entries: [{ id: "0327", sets: [{ done: false }] }, { id: "0406", sets: [{ done: false }] }],
        },
        "2026-09-24",
      ),
    ).toBe(true);
  });

  it("starts Sunday's routine instead of leaving Saturday's leftover session on screen", () => {
    expect(
      shouldBeginEmbeddedWorkout(sunday, {
        id: "session-saturday",
        routineId: "press-squat",
      }),
    ).toBe(true);
  });

  it("replaces a leftover Thursday workout even if the LifePilot session id was reused", () => {
    expect(
      shouldBeginEmbeddedWorkout(
        {
          mode: "workout",
          routineId: "press-squat",
          externalSessionId: "session-shared",
        },
        {
          id: "session-shared",
          routineId: "back-shoulders-biceps",
        },
      ),
    ).toBe(true);
  });

  it("replaces a historical in-progress workout whose exercise list predates later routine edits", () => {
    expect(
      shouldBeginEmbeddedWorkout(
        {
          mode: "workout",
          routineId: "back-shoulders-biceps",
          externalSessionId: "session-old-thursday",
        },
        {
          id: "session-old-thursday",
          routineId: "back-shoulders-biceps",
          d: "2026-09-10",
        },
        "2026-09-19",
      ),
    ).toBe(true);
  });

  it("does not start a workout in manage mode", () => {
    expect(
      shouldBeginEmbeddedWorkout({ mode: "manage", routineId: "r1" }, null),
    ).toBe(false);
  });

  it("notifies the native app when resuming a session that already has logged sets", () => {
    const active = {
      id: "session-sunday",
      routineId: "shoulders-hinge",
      d: "2026-09-24",
      start: Date.parse("2026-09-24T01:00:00.000Z"),
      entries: [{ id: "0405", sets: [{ done: true }] }],
    };
    expect(embeddedWorkoutStartAction(sunday, active, "2026-09-24")).toBe("notify");
  });

  it("begins a new embedded workout when nothing is in progress", () => {
    expect(embeddedWorkoutStartAction(sunday, null)).toBe("begin");
  });

  it("stays quiet in manage mode and without a start clock", () => {
    expect(embeddedWorkoutStartAction({ mode: "manage", routineId: "r1" }, null)).toBe("none");
    expect(
      embeddedWorkoutStartAction(sunday, {
        id: "session-sunday",
        routineId: "shoulders-hinge",
        d: "2026-09-24",
        entries: [{ id: "0405", sets: [{ done: true }] }],
      }, "2026-09-24"),
    ).toBe("none");
  });
});
