import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cacheCanonicalRestPolicy,
  estimateProvisionalRestSeconds,
  onLpLocalSetCompletion,
  onLpUserSkippedRest,
  reconcileRestFromSnapshot,
  resetLpProvisionalRestState,
} from "./lifepilot-provisional-rest.js";

describe("lifepilot provisional rest", () => {
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
    expect(startRest).toHaveBeenCalledWith(90);
    startRest.mockClear();

    cacheCanonicalRestPolicy({ restBetweenSetsSeconds: 75 });
    reconcileRestFromSnapshot({
      cursor: { phase: "rest", restEndsAt: "2026-11-12T10:01:15.000Z" },
    }, { startRest, stopRest: vi.fn() });
    expect(startRest).toHaveBeenCalledWith(75);
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

  it("stops rest when authoritative phase is not rest (skip / set ready / complete)", () => {
    const stopRest = vi.fn();
    reconcileRestFromSnapshot({
      cursor: { phase: "rest", restEndsAt: "2026-11-12T10:01:00.000Z" },
    }, { startRest: vi.fn(), stopRest });
    stopRest.mockClear();
    reconcileRestFromSnapshot({
      cursor: { phase: "setReady", restEndsAt: null },
    }, { startRest: vi.fn(), stopRest });
    expect(stopRest).toHaveBeenCalled();
  });

  it("cancels provisional rest when a set completion is undone", () => {
    const startRest = vi.fn();
    const stopRest = vi.fn();
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
    }, { startRest, stopRest });
    onLpLocalSetCompletion(active, {
      entryIdx: 0,
      setIdx: 0,
      completed: false,
      warmup: false,
    }, { startRest, stopRest });
    expect(stopRest).toHaveBeenCalled();
  });

  it("uses between-exercise rest when the current exercise is finished", () => {
    cacheCanonicalRestPolicy({ restBetweenSetsSeconds: 60, restAfterExerciseSeconds: 120 });
    const active = {
      entries: [
        {
          id: "bench",
          sets: [{ w: 34, r: 8, done: true }],
        },
        {
          id: "row",
          sets: [{ w: 22, r: 10, done: false }],
        },
      ],
    };
    expect(estimateProvisionalRestSeconds(active, 0, 0)).toBe(120);
  });

  it("does not offer provisional rest after the final working set", () => {
    const active = {
      entries: [{
        id: "bench",
        sets: [{ w: 34, r: 8, done: true }],
      }],
    };
    const startRest = vi.fn();
    const stopRest = vi.fn();
    onLpLocalSetCompletion(active, {
      entryIdx: 0,
      setIdx: 0,
      completed: true,
      warmup: false,
    }, { startRest, stopRest });
    expect(startRest).not.toHaveBeenCalled();
    expect(stopRest).toHaveBeenCalled();
  });

  it("clears provisional authority after the user skips rest", () => {
    const startRest = vi.fn();
    onLpLocalSetCompletion({
      entries: [{ id: "bench", sets: [{ done: true }, { done: false }] }],
    }, { entryIdx: 0, setIdx: 0, completed: true, warmup: false }, { startRest, stopRest: vi.fn() });
    onLpUserSkippedRest();
    reconcileRestFromSnapshot({
      cursor: { phase: "rest", restEndsAt: "2026-11-12T10:01:30.000Z" },
    }, { startRest, stopRest: vi.fn() });
    expect(startRest).toHaveBeenCalledWith(90);
  });
});
