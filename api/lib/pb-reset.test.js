import assert from 'node:assert/strict'
import test from 'node:test'
import { applyPbReset, rollbackPbReset } from './pb-reset.js'

const resetAt = '2026-10-18T10:00:00.000Z'
const at = Date.parse(resetAt)
const base = () => ({ _ts: at - 500, workouts: [{ start: at - 3000, end: at - 1000, entries: [{ id: 'bench', sets: [{ w: 25, r: 10, done: true }] }] }], exWeights: { bench: { w: 25 } }, routines: [{ id: 'routine' }], prs: ['old'], active: null })

test('reset preserves workout and working-load data, and retry is idempotent', () => {
  const before = base()
  const first = applyPbReset(before, { resetId: 'op-1', resetAt, expectedStateTs: before._ts }, at)
  assert.equal(first.error, undefined)
  assert.equal(first.state.pbResetAt, resetAt)
  assert.deepEqual(first.state.workouts, before.workouts)
  assert.deepEqual(first.state.exWeights, before.exWeights)
  assert.deepEqual(first.state.routines, before.routines)
  assert.deepEqual(first.state.prs, before.prs)
  const again = applyPbReset(first.state, { resetId: 'op-1', resetAt, expectedStateTs: before._ts }, at + 1)
  assert.equal(again.unchanged, true)
  assert.equal(again.state.pbResetAudit.length, 1)
  const rolled = rollbackPbReset(first.state, { resetId: 'op-1', expectedResetAt: resetAt }, at + 1)
  assert.equal(rolled.state.pbResetAt, null)
  assert.deepEqual(rolled.state.workouts, before.workouts)
  assert.equal(applyPbReset(rolled.state, { resetId: 'op-1', resetAt, expectedStateTs: rolled.state._ts }, at + 2).error, 'reset_id_reused')
})

test('rejects concurrent activity, noncompleted records, stale state and wrong rollback ID', () => {
  assert.equal(applyPbReset({ ...base(), active: { id: 'live' } }, { resetId: 'op', resetAt, expectedStateTs: base()._ts }, at).error, 'active_workout')
  assert.equal(applyPbReset({ ...base(), workouts: [{ start: at - 10 }] }, { resetId: 'op', resetAt, expectedStateTs: base()._ts }, at).error, 'reset_before_existing_workout')
  assert.equal(applyPbReset(base(), { resetId: 'op', resetAt, expectedStateTs: 1 }, at).error, 'state_changed')
  const applied = applyPbReset(base(), { resetId: 'op', resetAt, expectedStateTs: base()._ts }, at)
  assert.equal(rollbackPbReset(applied.state, { resetId: 'someone-else', expectedResetAt: resetAt }, at).error, 'reset_conflict')
  assert.equal(rollbackPbReset({ ...applied.state, workouts: [...applied.state.workouts, { start: at + 1, end: at + 10 }] }, { resetId: 'op', expectedResetAt: resetAt }, at + 20).error, 'post_reset_training_exists')
})
