import { describe, expect, it } from "vitest"
import { shouldBeginEmbeddedWorkout } from "./lifepilot-embed-workout.js"
import {
  completedSetCount,
  durationSecondsFor,
  isStaleActiveWorkout,
  markInterrupted,
  resolveRestoredActive,
} from "./active-workout-session.js"

const startedAt = Date.parse("2026-09-26T00:31:00.000Z")
const lastSetAt = startedAt + 20 * 60 * 1000
const completedAt = Date.parse("2026-09-26T01:07:00.000Z")

function crashedWorkout() {
  return {
    id: "session-26",
    routineId: "push",
    d: "2026-09-26",
    start: startedAt,
    updatedAt: lastSetAt,
    status: "active",
    cur: 1,
    entries: [
      { id: "bench", sets: [{ done: true, w: 22, r: 8 }, { done: true, w: 22, r: 8 }] },
      { id: "incline", sets: [{ done: true, w: 18, r: 10 }, { done: false, w: 18, r: 10 }] },
    ],
  }
}

describe("crash after several completed sets", () => {
  it("restores the same session, sets, cursor, and original start", () => {
    const local = crashedWorkout()
    const restored = markInterrupted(resolveRestoredActive({
      localActive: local,
      remoteActive: null,
      remoteWorkoutIds: [],
    }))

    expect(restored.id).toBe("session-26")
    expect(restored.start).toBe(startedAt)
    expect(restored.cur).toBe(1)
    expect(restored.status).toBe("interrupted")
    expect(restored.entries[0].sets.every((set) => set.done)).toBe(true)
    expect(restored.entries[1].sets.map((set) => set.done)).toEqual([true, false])
    expect(completedSetCount(restored)).toBe(3)
    expect(shouldBeginEmbeddedWorkout({
      mode: "workout",
      routineId: "push",
      externalSessionId: "session-26",
    }, restored, "2026-09-26")).toBe(false)
  })

  it("keeps the local snapshot when the server copy is behind", () => {
    const local = crashedWorkout()
    const remote = {
      ...local,
      updatedAt: local.updatedAt - 1000,
      entries: [local.entries[0]],
      cur: 0,
    }
    const restored = resolveRestoredActive({ localActive: local, remoteActive: remote })
    expect(restored.cur).toBe(1)
    expect(completedSetCount(restored)).toBe(3)
    expect(restored.start).toBe(startedAt)
  })
})

describe("completion after a crash", () => {
  it("measures duration from the original start", () => {
    const restored = markInterrupted(resolveRestoredActive({ localActive: crashedWorkout() }))
    expect(durationSecondsFor(restored, completedAt)).toBe(36 * 60)
  })

  it("does not resurrect a session closed locally before the server push landed", () => {
    const remote = crashedWorkout()
    expect(resolveRestoredActive({
      localActive: { id: "session-26", start: startedAt, status: "completed" },
      remoteActive: remote,
    })).toBeNull()
  })

  it("does not resurrect a session that was already saved to history", () => {
    expect(resolveRestoredActive({
      localActive: crashedWorkout(),
      remoteActive: null,
      remoteWorkoutIds: ["session-26"],
    })).toBeNull()
  })
})

describe("stale sessions", () => {
  it("treats a session idle for 12 hours as stale and a live one as resumable", () => {
    const active = crashedWorkout()
    expect(isStaleActiveWorkout(active, lastSetAt + 60_000)).toBe(false)
    expect(isStaleActiveWorkout(active, lastSetAt + 12 * 60 * 60 * 1000)).toBe(true)
  })
})
