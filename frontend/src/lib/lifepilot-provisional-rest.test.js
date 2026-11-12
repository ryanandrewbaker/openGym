import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  estimateProvisionalRestSeconds,
  getLpRestReconcileState,
  onLpLocalSetCompletion,
  onLpUserSkippedRest,
  reconcileRestFromSnapshot,
  resetLpProvisionalRestState,
} from "./lifepilot-provisional-rest.js";
import {
  applyCanonicalExecutionSnapshot,
  bindLpCanonicalExecutionSession,
  resetLpExecutionPaintState,
} from "./lifepilot-workout-bridge.js";
describe("lifepilot provisional rest (unit)", () => {
  const sessionStore = {};

  beforeEach(() => {
    resetLpProvisionalRestState();
    resetLpExecutionPaintState();
    vi.stubGlobal("sessionStorage", {
      getItem: (key) => sessionStore[key] ?? null,
      setItem: (key, value) => { sessionStore[key] = String(value); },
      removeItem: (key) => { delete sessionStore[key]; },
      clear: () => { Object.keys(sessionStore).forEach((key) => delete sessionStore[key]); },
    });
    sessionStorage.setItem("lp_context", JSON.stringify({ mode: "workout" }));
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Object.keys(sessionStore).forEach((key) => delete sessionStore[key]);
  });

  it("starts provisional rest immediately after a working set completes", () => {
    const startRest = vi.fn();
    const active = {
      entries: [{
        id: "bench",
        sets: [{ w: 34, r: 8, done: true }, { w: 34, r: 8, done: false }],
      }],
    };
    onLpLocalSetCompletion(active, {
      entryIdx: 0,
      setIdx: 0,
      completed: true,
      warmup: false,
    }, { startRest, stopRest: vi.fn() });
    expect(startRest).toHaveBeenCalledWith(90);
    expect(getLpRestReconcileState().provisionalActive).toBe(true);
  });

  it("reconciles provisional rest to authoritative restEndsAt when it arrives", () => {
    const startRest = vi.fn();
    const active = {
      entries: [{
        id: "bench",
        sets: [{ w: 34, r: 8, done: true }, { w: 34, r: 8, done: false }],
      }],
    };
    onLpLocalSetCompletion(active, {
      entryIdx: 0,
      setIdx: 0,
      completed: true,
      warmup: false,
    }, { startRest, stopRest: vi.fn() });
    startRest.mockClear();

    reconcileRestFromSnapshot({
      cursor: { phase: "rest", restEndsAt: "2026-11-12T10:01:15.000Z" },
    }, { startRest, stopRest: vi.fn() });
    expect(startRest).toHaveBeenCalledWith(75);
    expect(getLpRestReconcileState().provisionalActive).toBe(false);
  });

  it("does not restart the timer on duplicate identical authoritative snapshots", () => {
    const startRest = vi.fn();
    const snapshot = { cursor: { phase: "rest", restEndsAt: "2026-11-12T10:01:30.000Z" } };
    reconcileRestFromSnapshot(snapshot, { startRest, stopRest: vi.fn() });
    expect(startRest).toHaveBeenCalledTimes(1);
    startRest.mockClear();
    reconcileRestFromSnapshot(snapshot, { startRest, stopRest: vi.fn() });
    expect(startRest).not.toHaveBeenCalled();
  });

  it("suppresses late authoritative rest after the user skipped provisional rest", () => {
    const startRest = vi.fn();
    onLpLocalSetCompletion({
      entries: [{ id: "bench", sets: [{ done: true }, { done: false }] }],
    }, { entryIdx: 0, setIdx: 0, completed: true, warmup: false }, { startRest, stopRest: vi.fn() });
    onLpUserSkippedRest();
    startRest.mockClear();
    reconcileRestFromSnapshot({
      cursor: { phase: "rest", restEndsAt: "2026-11-12T10:01:30.000Z" },
    }, { startRest, stopRest: vi.fn() });
    expect(startRest).not.toHaveBeenCalled();
    expect(getLpRestReconcileState().dismissedRestEndsAt).toBe("2026-11-12T10:01:30.000Z");
  });

  it("posts lifepilot-skip-rest when the user explicitly skips rest", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("window", {
      parent: { postMessage: vi.fn() },
      webkit: { messageHandlers: { lifepilot: { postMessage } } },
    });
    onLpUserSkippedRest();
    expect(postMessage).toHaveBeenCalledWith({ type: "lifepilot-skip-rest" });
  });

  it("uses between-exercise rest when the current exercise is finished", () => {
    reconcileRestFromSnapshot({
      restBetweenSetsSeconds: 60,
      restAfterExerciseSeconds: 120,
      cursor: { phase: "setReady" },
    }, { startRest: vi.fn(), stopRest: vi.fn() });
    const active = {
      entries: [
        { id: "bench", sets: [{ w: 34, r: 8, done: true }] },
        { id: "row", sets: [{ w: 22, r: 10, done: false }] },
      ],
    };
    expect(estimateProvisionalRestSeconds(active, 0, 0)).toBe(120);
  });
});

describe("lifepilot provisional rest (useUI integration)", () => {
  const sessionStore = {};
  let useUI;
  let applyCanonicalExecutionSnapshot;
  let resetLpExecutionPaintState;

  beforeAll(async () => {
    vi.stubGlobal("document", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      body: { classList: { toggle: vi.fn(), remove: vi.fn() } },
      hidden: false,
      visibilityState: "visible",
    });
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
    ({ useUI } = await import("../store/useUI.js"));
    ({ applyCanonicalExecutionSnapshot, resetLpExecutionPaintState } = await import("./lifepilot-workout-bridge.js"));
  });

  beforeEach(() => {
    resetLpProvisionalRestState();
    resetLpExecutionPaintState();
    bindLpCanonicalExecutionSession("lp-sess-118");
    useUI.setState({ timer: null, work: null });
    vi.stubGlobal("sessionStorage", {
      getItem: (key) => sessionStore[key] ?? null,
      setItem: (key, value) => { sessionStore[key] = String(value); },
      removeItem: (key) => { delete sessionStore[key]; },
      clear: () => { Object.keys(sessionStore).forEach((key) => delete sessionStore[key]); },
    });
    sessionStorage.setItem("lp_context", JSON.stringify({ mode: "workout" }));
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T10:00:00.000Z"));
  });

  afterEach(() => {
    useUI.getState().stopRest({ reason: "internal" });
    vi.useRealTimers();
    Object.keys(sessionStore).forEach((key) => delete sessionStore[key]);
  });

  const timers = () => {
    const { startRest, stopRest } = useUI.getState();
    return { startRest, stopRest };
  };

  const benchActive = () => ({
    entries: [{
      id: "bench",
      sets: [{ w: 34, r: 8, done: true }, { w: 34, r: 8, done: false }],
    }],
  });

  const session = { sessionId: "engine-118", externalSessionId: "lp-sess-118" };

  const apply = (snapshot, state) => {
    applyCanonicalExecutionSnapshot({ ...session, ...snapshot }, {
      update: (mut) => mut(state),
      ...timers(),
    });
  };

  it("provisional start does not clear reconcile state when startRest replaces the timer", () => {
    const active = benchActive();
    active.entries[0].sets[0].done = true;
    onLpLocalSetCompletion(active, {
      entryIdx: 0,
      setIdx: 0,
      completed: true,
      warmup: false,
    }, timers());
    expect(useUI.getState().timer?.left).toBe(90);
    expect(getLpRestReconcileState().provisionalActive).toBe(true);
  });

  it("reconciles through the real timer store when authoritative rest arrives", () => {
    const state = { active: benchActive() };
    onLpLocalSetCompletion(state.active, {
      entryIdx: 0,
      setIdx: 0,
      completed: true,
      warmup: false,
    }, timers());
    apply({
      cursor: { phase: "rest", restEndsAt: "2026-11-12T10:01:20.000Z" },
    }, state);
    expect(useUI.getState().timer?.left).toBe(80);
    expect(getLpRestReconcileState().lastAuthoritativeRestEndsAt).toBe("2026-11-12T10:01:20.000Z");
  });

  it("duplicate snapshots do not reset the visible countdown", () => {
    const state = { active: benchActive() };
    apply({
      cursor: { phase: "rest", restEndsAt: "2026-11-12T10:01:30.000Z" },
    }, state);
    const endsAt = useUI.getState().timer?.endsAt;
    apply({
      cursor: { phase: "rest", restEndsAt: "2026-11-12T10:01:30.000Z" },
    }, state);
    expect(useUI.getState().timer?.endsAt).toBe(endsAt);
  });

  it("explicit skip prevents a delayed acknowledgement from reopening the same rest", () => {
    const state = { active: benchActive() };
    onLpLocalSetCompletion(state.active, {
      entryIdx: 0,
      setIdx: 0,
      completed: true,
      warmup: false,
    }, timers());
    useUI.getState().stopRest({ reason: "user" });
    expect(useUI.getState().timer).toBeNull();
    apply({
      cursor: { phase: "rest", restEndsAt: "2026-11-12T10:01:45.000Z" },
    }, state);
    expect(useUI.getState().timer).toBeNull();
    apply({
      cursor: { phase: "rest", restEndsAt: "2026-11-12T10:01:45.000Z" },
    }, state);
    expect(useUI.getState().timer).toBeNull();
  });

  it("allows the next rest period after a new set completion", () => {
    const state = {
      active: {
        entries: [{
          id: "bench",
          sets: [
            { w: 34, r: 8, done: true },
            { w: 34, r: 8, done: true },
            { w: 34, r: 8, done: false },
          ],
        }],
      },
    };
    onLpLocalSetCompletion(state.active, {
      entryIdx: 0,
      setIdx: 0,
      completed: true,
      warmup: false,
    }, timers());
    useUI.getState().stopRest({ reason: "user" });
    apply({ cursor: { phase: "rest", restEndsAt: "2026-11-12T10:01:00.000Z" } }, state);
    expect(useUI.getState().timer).toBeNull();

    onLpLocalSetCompletion(state.active, {
      entryIdx: 0,
      setIdx: 1,
      completed: true,
      warmup: false,
    }, timers());
    expect(useUI.getState().timer?.left).toBe(90);
    apply({
      cursor: { phase: "rest", restEndsAt: "2026-11-12T10:03:00.000Z" },
    }, state);
    expect(useUI.getState().timer?.left).toBe(180);
  });

  it("undoes set completion without treating it as an explicit skip", () => {
    const active = benchActive();
    onLpLocalSetCompletion(active, {
      entryIdx: 0,
      setIdx: 0,
      completed: true,
      warmup: false,
    }, timers());
    onLpLocalSetCompletion(active, {
      entryIdx: 0,
      setIdx: 0,
      completed: false,
      warmup: false,
    }, timers());
    expect(useUI.getState().timer).toBeNull();
    expect(getLpRestReconcileState().dismissedRestEndsAt).toBeNull();
  });

  it("timer expiry clears provisional state without a user skip", () => {
    onLpLocalSetCompletion(benchActive(), {
      entryIdx: 0,
      setIdx: 0,
      completed: true,
      warmup: false,
    }, timers());
    vi.advanceTimersByTime(91_000);
    expect(useUI.getState().timer).toBeNull();
    expect(getLpRestReconcileState().dismissedRestEndsAt).toBeNull();
  });

  it("out-of-order setReady stops rest before a later rest snapshot applies", () => {
    const state = { active: benchActive() };
    apply({
      cursor: { phase: "rest", restEndsAt: "2026-11-12T10:01:30.000Z", revision: 4 },
    }, state);
    expect(useUI.getState().timer).not.toBeNull();
    apply({
      cursor: { phase: "setReady", restEndsAt: null, revision: 5 },
    }, state);
    expect(useUI.getState().timer).toBeNull();
    apply({
      cursor: { phase: "rest", restEndsAt: "2026-11-12T10:05:00.000Z", revision: 8 },
    }, state);
    expect(useUI.getState().timer?.left).toBe(300);
  });

  it("user skip emits bridge skip and canonical setReady allows the next working set before restEndsAt", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("window", {
      parent: { postMessage: vi.fn() },
      webkit: { messageHandlers: { lifepilot: { postMessage } } },
    });
    const state = {
      active: {
        entries: [{
          id: "bench",
          sets: [
            { w: 34, r: 8, done: true },
            { w: 34, r: 8, done: false },
            { w: 34, r: 8, done: false },
          ],
        }],
      },
    };
    onLpLocalSetCompletion(state.active, {
      entryIdx: 0,
      setIdx: 0,
      completed: true,
      warmup: false,
    }, timers());
    apply({
      cursor: {
        phase: "rest",
        restEndsAt: "2026-11-12T10:01:30.000Z",
        revision: 3,
        exerciseIndex: 0,
        setIndex: 1,
      },
    }, state);
    useUI.getState().stopRest({ reason: "user" });
    expect(postMessage).toHaveBeenCalledWith({ type: "lifepilot-skip-rest" });
    expect(useUI.getState().timer).toBeNull();
    apply({
      cursor: {
        phase: "setReady",
        restEndsAt: null,
        revision: 4,
        exerciseIndex: 0,
        setIndex: 1,
      },
    }, state);
    expect(getLpRestReconcileState().dismissedRestEndsAt).toBeNull();
    vi.setSystemTime(new Date("2026-11-12T10:00:20.000Z"));
    state.active.entries[0].sets[1].done = true;
    onLpLocalSetCompletion(state.active, {
      entryIdx: 0,
      setIdx: 1,
      completed: true,
      warmup: false,
    }, timers());
    expect(useUI.getState().timer?.left).toBe(90);
  });

  it("rejects stale rest snapshots by revision after skipRest setReady was applied", () => {
    const state = { active: benchActive() };
    apply({
      cursor: { phase: "rest", restEndsAt: "2026-11-12T10:01:30.000Z", revision: 6 },
    }, state);
    useUI.getState().stopRest({ reason: "user" });
    apply({
      cursor: { phase: "setReady", restEndsAt: null, revision: 7 },
    }, state);
    expect(useUI.getState().timer).toBeNull();
    apply({
      cursor: { phase: "rest", restEndsAt: "2026-11-12T10:01:30.000Z", revision: 6 },
    }, state);
    expect(useUI.getState().timer).toBeNull();
  });

  it("duplicate setReady snapshots at the same revision do not regress paint state", () => {
    const state = { active: benchActive() };
    apply({
      cursor: { phase: "rest", restEndsAt: "2026-11-12T10:01:30.000Z", revision: 10 },
    }, state);
    apply({
      cursor: { phase: "setReady", restEndsAt: null, revision: 11 },
    }, state);
    apply({
      cursor: { phase: "setReady", restEndsAt: null, revision: 11 },
    }, state);
    expect(useUI.getState().timer).toBeNull();
    apply({
      cursor: { phase: "rest", restEndsAt: "2026-11-12T10:01:30.000Z", revision: 10 },
    }, state);
    expect(useUI.getState().timer).toBeNull();
  });
});

describe("lifepilot skip-rest emissions (useUI)", () => {
  const sessionStore = {};
  let useUI;

  beforeAll(async () => {
    vi.stubGlobal("document", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      body: { classList: { toggle: vi.fn(), remove: vi.fn() } },
      hidden: false,
      visibilityState: "visible",
    });
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
    ({ useUI } = await import("../store/useUI.js"));
  });

  beforeEach(() => {
    resetLpProvisionalRestState();
    resetLpExecutionPaintState();
    useUI.setState({ timer: null, work: null });
    vi.stubGlobal("sessionStorage", {
      getItem: (key) => sessionStore[key] ?? null,
      setItem: (key, value) => { sessionStore[key] = String(value); },
      removeItem: (key) => { delete sessionStore[key]; },
      clear: () => { Object.keys(sessionStore).forEach((key) => delete sessionStore[key]); },
    });
    sessionStorage.setItem("lp_context", JSON.stringify({ mode: "workout" }));
  });

  afterEach(() => {
    useUI.getState().stopRest({ reason: "internal" });
    Object.keys(sessionStore).forEach((key) => delete sessionStore[key]);
  });

  const postMessage = () => {
    const handler = vi.fn();
    vi.stubGlobal("window", {
      parent: { postMessage: vi.fn() },
      webkit: { messageHandlers: { lifepilot: { postMessage: handler } } },
    });
    return handler;
  };

  it("does not emit skip-rest on default stopRest (workout start/finish/exit cleanup)", () => {
    const handler = postMessage();
    useUI.getState().startRest(90);
    handler.mockClear();
    useUI.getState().stopRest();
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not emit skip-rest on internal replacement or natural expiry", () => {
    const handler = postMessage();
    useUI.getState().startRest(90);
    expect(handler).not.toHaveBeenCalled();
    useUI.getState().startRest(60);
    expect(handler).not.toHaveBeenCalled();
    useUI.getState().stopRest({ reason: "expired" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("emits skip-rest for explicit user skip and subtract-to-zero", () => {
    const handler = postMessage();
    useUI.getState().startRest(10);
    handler.mockClear();
    useUI.getState().stopRest({ reason: "user" });
    expect(handler).toHaveBeenCalledWith({ type: "lifepilot-skip-rest" });
    useUI.getState().startRest(10);
    handler.mockClear();
    useUI.getState().addRest(-15);
    expect(handler).toHaveBeenCalledWith({ type: "lifepilot-skip-rest" });
  });
});

describe("lifepilot canonical paint session guard", () => {
  const sessionStore = {};
  let useUI;

  beforeAll(async () => {
    vi.stubGlobal("document", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      body: { classList: { toggle: vi.fn(), remove: vi.fn() } },
      hidden: false,
      visibilityState: "visible",
    });
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
    ({ useUI } = await import("../store/useUI.js"));
  });

  beforeEach(() => {
    resetLpProvisionalRestState();
    resetLpExecutionPaintState();
    useUI.setState({ timer: null, work: null });
    vi.stubGlobal("sessionStorage", {
      getItem: (key) => sessionStore[key] ?? null,
      setItem: (key, value) => { sessionStore[key] = String(value); },
      removeItem: (key) => { delete sessionStore[key]; },
      clear: () => { Object.keys(sessionStore).forEach((key) => delete sessionStore[key]); },
    });
    sessionStorage.setItem("lp_context", JSON.stringify({ mode: "workout" }));
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T10:00:00.000Z"));
  });

  afterEach(() => {
    useUI.getState().stopRest({ reason: "internal" });
    vi.useRealTimers();
    Object.keys(sessionStore).forEach((key) => delete sessionStore[key]);
  });

  it("ignores delayed snapshots from a prior session after binding to a new one", () => {
    const state = {
      active: {
        cur: 0,
        entries: [
          { id: "bench", sets: [{ w: 34, r: 8, done: false }, { w: 34, r: 8, done: false }] },
          { id: "row", sets: [{ w: 22, r: 10, done: false }] },
        ],
      },
    };
    const apply = (snapshot) => applyCanonicalExecutionSnapshot(snapshot, {
      update: (mut) => mut(state),
      ...useUI.getState(),
    });

    bindLpCanonicalExecutionSession({ sessionId: "engine-B", externalSessionId: "ext-B" });
    apply({
      sessionId: "engine-B",
      externalSessionId: "ext-B",
      plan: [{ exerciseId: "bench" }, { exerciseId: "row" }],
      performed: [{ exerciseId: "bench", sets: [{ setNumber: 1, weightKg: 34, reps: 8, completed: true }] }],
      cursor: { phase: "rest", restEndsAt: "2026-11-12T10:01:30.000Z", revision: 4, exerciseIndex: 0, setIndex: 1 },
    });
    expect(state.active.entries[0].sets[0].done).toBe(true);
    expect(state.active.cur).toBe(0);
    expect(useUI.getState().timer?.left).toBe(90);

    apply({
      sessionId: "engine-A",
      externalSessionId: "ext-A",
      plan: [{ exerciseId: "bench" }, { exerciseId: "row" }],
      performed: [{ exerciseId: "row", sets: [{ setNumber: 1, weightKg: 99, reps: 5, completed: true }] }],
      cursor: { phase: "setReady", exerciseIndex: 1, setIndex: 0, revision: 99 },
    });
    expect(state.active.cur).toBe(0);
    expect(state.active.entries[1].sets[0].done).toBe(false);
    expect(state.active.entries[1].sets[0].w).not.toBe(99);
    expect(useUI.getState().timer?.left).toBe(90);
  });

  it("rebinds paint state when beginWorkout switches external session id", () => {
    bindLpCanonicalExecutionSession("ext-A");
    bindLpCanonicalExecutionSession("ext-B");
    const state = { active: { cur: 0, entries: [{ id: "bench", sets: [{ w: 34, r: 8, done: false }] }] } };
    applyCanonicalExecutionSnapshot({
      sessionId: "engine-A",
      externalSessionId: "ext-A",
      cursor: { phase: "rest", restEndsAt: "2026-11-12T10:05:00.000Z", revision: 50 },
    }, {
      update: (mut) => mut(state),
      ...useUI.getState(),
    });
    expect(useUI.getState().timer).toBeNull();
    applyCanonicalExecutionSnapshot({
      sessionId: "engine-B",
      externalSessionId: "ext-B",
      cursor: { phase: "rest", restEndsAt: "2026-11-12T10:01:00.000Z", revision: 1 },
    }, {
      update: (mut) => mut(state),
      ...useUI.getState(),
    });
    expect(useUI.getState().timer?.left).toBe(60);
  });
});
