import assert from "node:assert/strict"
import test from "node:test"
import { mergeGymState } from "./gym-state-merge.js"

const active = {
  id: "session-26",
  start: 1,
  status: "active",
  entries: [{ id: "bench", sets: [{ done: true }] }],
}

test("keeps an in-progress workout on the newer write", () => {
  const merged = mergeGymState({ active: null, _ts: 1 }, { active, _ts: 2, routines: [] })
  assert.equal(merged.active.id, "session-26")
  assert.equal(merged.active.entries[0].sets[0].done, true)
})

test("does not wipe a stored workout when the client omits active", () => {
  const merged = mergeGymState({ active, _ts: 1 }, { _ts: 2, routines: [{ id: "push" }] })
  assert.equal(merged.active.id, "session-26")
  assert.equal(merged.routines[0].id, "push")
})

test("clears the workout when the client finishes or discards it", () => {
  const merged = mergeGymState({ active, _ts: 1 }, { active: null, _ts: 2, workouts: [{ id: "session-26" }] })
  assert.equal(merged.active, null)
  assert.equal(merged.workouts[0].id, "session-26")
})

test("a full-state client write cannot erase or resurrect a service-owned PB reset", () => {
  const metadata = { pbResetAt: '2026-10-18T10:00:00.000Z', pbResetOperation: { id: 'op' }, pbResetAudit: [{ action: 'apply' }] }
  const merged = mergeGymState({ _ts: 1, ...metadata }, { _ts: 2, workouts: [], pbResetAt: null, pbResetOperation: null, pbResetAudit: [] })
  assert.deepEqual({ pbResetAt: merged.pbResetAt, pbResetOperation: merged.pbResetOperation, pbResetAudit: merged.pbResetAudit }, metadata)
  const afterRollback = mergeGymState({ _ts: 3, pbResetAt: null, pbResetOperation: null, pbResetAudit: metadata.pbResetAudit }, { _ts: 4, ...metadata })
  assert.equal(afterRollback.pbResetAt, null)
  assert.equal(afterRollback.pbResetOperation, null)
})
