import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  emitBeginWorkoutBridge,
  emitFinishWorkoutBridge,
  notifyLpWorkoutFinished,
  notifyLpWorkoutLeft,
  notifyLpWorkoutStarted,
  requestLifePilotExit,
  workoutFinishedPayload,
  workoutStartedPayload,
} from "./lifepilot-workout-bridge.js";

const memory = new Map();
const sessionStorageStub = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
  clear: () => memory.clear(),
};

function stubLpContext(context) {
  sessionStorageStub.setItem("lp_context", JSON.stringify(context));
}

describe("LifePilot workout lifecycle bridge", () => {
  beforeEach(() => {
    memory.clear();
    vi.stubGlobal("sessionStorage", sessionStorageStub);
  });

  afterEach(() => {
    memory.clear();
    vi.unstubAllGlobals();
  });

  it("posts started, finished, left, and exit payloads to the native handler", () => {
    stubLpContext({ mode: "workout", routineId: "r1", externalSessionId: "session-1" });
    const posted = [];
    const win = {
      webkit: {
        messageHandlers: {
          lifepilot: { postMessage: (payload) => posted.push(payload) },
        },
      },
    };
    win.parent = win;
    vi.stubGlobal("window", win);

    const startedAt = Date.parse("2026-09-24T01:34:22.154Z");
    const endedAt = Date.parse("2026-09-24T02:01:32.313Z");
    notifyLpWorkoutStarted("session-1", startedAt);
    notifyLpWorkoutFinished("session-1", endedAt);
    notifyLpWorkoutLeft("session-1", true);
    requestLifePilotExit();

    expect(posted).toEqual([
      {
        type: "lifepilot-workout-started",
        sessionId: "session-1",
        startedAt: "2026-09-24T01:34:22.154Z",
      },
      {
        type: "lifepilot-workout-finished",
        sessionId: "session-1",
        endedAt: "2026-09-24T02:01:32.313Z",
      },
      {
        type: "lifepilot-workout-left",
        sessionId: "session-1",
        hasLoggedSets: true,
      },
      { type: "lifepilot-exit-workout" },
    ]);
  });

  it("maps beginWorkout and doFinishWorkout clocks onto the native payloads", () => {
    stubLpContext({ mode: "workout", routineId: "r1", externalSessionId: "session-1" });
    const posted = [];
    const win = {
      webkit: {
        messageHandlers: {
          lifepilot: { postMessage: (payload) => posted.push(payload) },
        },
      },
    };
    win.parent = win;
    vi.stubGlobal("window", win);

    const startedAt = Date.parse("2026-09-24T01:34:22.154Z");
    const endedAt = Date.parse("2026-09-24T02:01:32.313Z");
    emitBeginWorkoutBridge({ id: "session-1", start: startedAt });
    emitFinishWorkoutBridge({ id: "session-1", end: endedAt });

    expect(workoutStartedPayload("session-1", startedAt)).toEqual(posted[0]);
    expect(workoutFinishedPayload("session-1", endedAt)).toEqual(posted[1]);
  });

  it("does not emit workout lifecycle events in manage mode", () => {
    stubLpContext({ mode: "manage", routineId: "r1" });
    const posted = [];
    const win = {
      webkit: {
        messageHandlers: {
          lifepilot: { postMessage: (payload) => posted.push(payload) },
        },
      },
    };
    win.parent = win;
    vi.stubGlobal("window", win);

    notifyLpWorkoutStarted("session-1", Date.now());
    notifyLpWorkoutFinished("session-1", Date.now());
    expect(posted).toEqual([]);
  });
});
