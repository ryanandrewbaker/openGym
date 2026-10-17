import { describe, expect, it } from 'vitest'
import { bestTopLoad, classifyPerformance, pbEligibleWorkouts } from './pb.js'
import { best1RM, is1RMRecord, e1rmSeries } from './onerm.js'

const lift = (id, w, r, done = true) => ({ id, sets: [{ w, r, done }] })
const workout = (end, entries) => ({ start: end - 100, end, d: '2026-10-18', entries })

describe('meaningful PB windows', () => {
  it('keeps old history visible while resetting current records by completion time', () => {
    const S = { pbResetAt: new Date(2000).toISOString(), workouts: [
      workout(1000, [lift('bench', 90, 10)]),
      workout(3000, [lift('bench', 25, 10)]),
    ] }
    expect(e1rmSeries(S, 'bench').map(point => point.w)).toEqual([90, 25])
    expect(bestTopLoad(S, 'bench')).toBe(25)
    expect(best1RM(S, 'bench').est).toBe(33.3)
    expect(classifyPerformance(25, null)).toBe('baseline')
    expect(is1RMRecord({ ...S, workouts: S.workouts.slice(0, 1) }, 'bench', lift('bench', 25, 10))).toBeNull()
  })

  it('uses completion rather than start time and excludes unfinished workouts', () => {
    const S = { pbResetAt: new Date(2000).toISOString(), workouts: [
      { start: 1900, end: 2100, entries: [lift('bench', 20, 10)] },
      { start: 2500, entries: [lift('bench', 100, 10)] },
      workout(2000, [lift('bench', 200, 10)]),
    ] }
    expect(pbEligibleWorkouts(S)).toHaveLength(1)
    expect(bestTopLoad(S, 'bench')).toBe(20)
  })

  it('keeps exercise substitutions separate and ignores unfinished sets', () => {
    const S = { workouts: [workout(1000, [lift('bench', 25, 10), lift('incline', 20, 10), lift('bench', 100, 5, false)])] }
    expect(bestTopLoad(S, 'bench')).toBe(25)
    expect(bestTopLoad(S, 'incline')).toBe(20)
    expect(classifyPerformance(25, bestTopLoad(S, 'bench'))).toBe('none')
    expect(classifyPerformance(27, bestTopLoad(S, 'bench'))).toBe('improved')
    expect(classifyPerformance(22, bestTopLoad(S, 'incline'))).toBe('improved')
  })

  it('combines repeated entries for the same exercise within one completion', () => {
    const S = { workouts: [workout(1000, [lift('bench', 25, 8), lift('bench', 24, 12)])] }
    expect(bestTopLoad(S, 'bench')).toBe(25)
    expect(e1rmSeries(S, 'bench')).toHaveLength(1)
    expect(best1RM(S, 'bench').est).toBe(33.6)
  })

  it('tracks top load and estimated 1RM independently', () => {
    const S = { workouts: [workout(1000, [lift('bench', 25, 10)])] }
    expect(classifyPerformance(27, bestTopLoad(S, 'bench'))).toBe('improved')
    expect(is1RMRecord(S, 'bench', lift('bench', 27, 7))).toBeNull()
    expect(classifyPerformance(25, bestTopLoad(S, 'bench'))).toBe('none')
    expect(is1RMRecord(S, 'bench', lift('bench', 25, 12))?.est).toBe(35)
  })
})
