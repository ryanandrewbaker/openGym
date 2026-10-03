import assert from "node:assert/strict"
import test from "node:test"
import { DEFAULT_ADJUSTABLE_DUMBBELL_LOADS as apiLoads } from "./equipment-core.js"
import { DEFAULT_ADJUSTABLE_DUMBBELL_LOADS as webLoads } from "../../frontend/src/lib/equipment-core.js"

test("API and web copies of the adjustable dumbbell ladder match", () => {
  assert.deepEqual([...apiLoads], [...webLoads])
  assert.deepEqual([...apiLoads], [5, 7, 9, 11, 13, 15, 18, 20, 22, 25, 27, 29, 32, 34, 36, 38, 40])
  assert.equal(apiLoads.includes(23), false)
  assert.equal(apiLoads.includes(22), true)
})
