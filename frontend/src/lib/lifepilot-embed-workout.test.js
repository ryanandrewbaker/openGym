import { describe, expect, it } from "vitest";
import { shouldBeginEmbeddedWorkout } from "./lifepilot-embed-workout.js";

describe("shouldBeginEmbeddedWorkout", () => {
  const sunday = {
    mode: "workout",
    routineId: "shoulders-hinge",
    externalSessionId: "session-sunday",
  };

  it("starts the requested routine when nothing is in progress", () => {
    expect(shouldBeginEmbeddedWorkout(sunday, null)).toBe(true);
  });

  it("keeps the in-progress workout when LifePilot is resuming that same session", () => {
    expect(
      shouldBeginEmbeddedWorkout(sunday, {
        id: "session-sunday",
        routineId: "shoulders-hinge",
      }),
    ).toBe(false);
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
});
