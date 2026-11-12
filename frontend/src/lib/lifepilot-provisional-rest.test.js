import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  estimateProvisionalRestSeconds,
  getLpRestReconcileState,
  onLpLocalSetCompletion,
  onLpUserSkippedRest,
  reconcileRestFromSnapshot,
  resetLpProvisionalRestState,
} from "./lifepilot-provisional-rest.js";
describe("lifepilot provisional rest (unit)", () => {
  const sessionStore = {};

  beforeEach(() => {
    resetLpProvisionalRestState();
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
    ({ applyCanonicalExecutionSnapshot } = await import("./lifepilot-workout-bridge.js"));
  });

  beforeEach(() => {
    resetLpProvisionalRestState();
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

  const apply = (snapshot, state) => {
    applyCanonicalExecutionSnapshot(snapshot, {
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
      cursor: { phase: "rest", restEndsAt: "2026-11-12T10:01:30.000Z" },
    }, state);
    expect(useUI.getState().timer).not.toBeNull();
    apply({
      cursor: { phase: "setReady", restEndsAt: null },
    }, state);
    expect(useUI.getState().timer).toBeNull();
    apply({
      cursor: { phase: "rest", restEndsAt: "2026-11-12T10:05:00.000Z" },
    }, state);
    expect(useUI.getState().timer?.left).toBe(300);
  });
});
