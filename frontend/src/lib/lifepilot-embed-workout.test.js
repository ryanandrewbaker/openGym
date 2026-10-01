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
