import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyCanonicalExecutionSnapshot,
  emitBeginWorkoutBridge,
  emitFinishWorkoutBridge,
  isApplyingRemoteSnapshot,
  notifyLpExecutionReady,
  notifyLpSetChanged,
  notifyLpSelectionChanged,
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

  it("posts a local set change and does not emit one when painting a remote snapshot", () => {
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

    notifyLpSetChanged({
      exerciseId: "bench",
      setNumber: 1,
      loadKg: 34,
      reps: 8,
      completed: true,
    });
    expect(posted).toEqual([
      expect.objectContaining({
        type: "lifepilot-set-changed",
        exerciseId: "bench",
        setNumber: 1,
        completed: true,
      }),
    ]);
    posted.length = 0;

    const entry = { id: "bench", sets: [{ w: 32, r: 8, done: false }] };
    applyCanonicalExecutionSnapshot(
      {
        performed: [
          {
            exerciseId: "bench",
            sets: [{ setNumber: 1, weightKg: 34, reps: 8, completed: true }],
          },
        ],
        cursor: { phase: "rest", restEndsAt: "2026-10-03T10:02:30.000Z" },
      },
      {
        update: (mut) => mut({ active: { entries: [entry] } }),
        startRest: () => {},
        stopRest: () => {},
      },
    );
    expect(entry.sets[0].done).toBe(true);
    expect(entry.sets[0].w).toBe(34);
    expect(posted).toEqual([]);
    expect(isApplyingRemoteSnapshot()).toBe(false);
  });

  it("applies current selected load and reps without echoing a local change", () => {
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

    const entry = { id: "bench", sets: [{ w: 34, r: 8, done: false }] };
    applyCanonicalExecutionSnapshot(
      {
        plan: [{ exerciseId: "bench" }],
        performed: [],
        cursor: {
          phase: "setReady",
          exerciseIndex: 0,
          setIndex: 0,
          selectedLoadKg: 36,
          selectedReps: 9,
        },
      },
      {
        update: (mut) => {
          mut({ active: { entries: [entry] } });
          notifyLpSelectionChanged({
            exerciseId: "bench",
            setNumber: 1,
            loadKg: 36,
            reps: 9,
          });
        },
        startRest: () => {},
        stopRest: () => {},
      },
    );
    expect(entry.sets[0].w).toBe(36);
    expect(entry.sets[0].r).toBe(9);
    expect(entry.sets[0].done).toBe(false);
    expect(posted).toEqual([]);

    applyingFlagCheck();
    notifyLpSelectionChanged({
      exerciseId: "bench",
      setNumber: 1,
      loadKg: 38,
      reps: 8,
    });
    expect(posted).toEqual([
      expect.objectContaining({
        type: "lifepilot-selection-changed",
        exerciseId: "bench",
        loadKg: 38,
        reps: 8,
      }),
    ]);
  });

  it("posts execution-ready and follows the watch exercise cursor", () => {
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

    notifyLpExecutionReady();
    expect(posted).toEqual([{ type: "lifepilot-execution-ready" }]);

    const bench = { id: "bench", sets: [{ w: 34, r: 8, done: false }, { w: 34, r: 8, done: false }] };
    const closeGrip = { id: "close-grip", sets: [{ w: 22, r: 10, done: false }] };
    const state = { active: { entries: [bench, closeGrip], cur: 0 } };
    applyCanonicalExecutionSnapshot(
      {
        plan: [{ exerciseId: "bench" }, { exerciseId: "close-grip" }],
        performed: [
          {
            exerciseId: "bench",
            sets: [
              { setNumber: 1, weightKg: 34, reps: 8, completed: true },
              { setNumber: 2, weightKg: 34, reps: 8, completed: true },
            ],
          },
        ],
        cursor: {
          phase: "rest",
          exerciseIndex: 1,
          setIndex: 0,
          restEndsAt: "2026-10-03T10:03:00.000Z",
        },
      },
      {
        update: (mut) => mut(state),
        startRest: () => {},
        stopRest: () => {},
      },
    );
    expect(state.active.cur).toBe(1);
    expect(bench.sets[0].done).toBe(true);
    expect(bench.sets[1].done).toBe(true);
  });
});

function applyingFlagCheck() {
  expect(isApplyingRemoteSnapshot()).toBe(false);
}
