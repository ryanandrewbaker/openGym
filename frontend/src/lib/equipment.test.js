import { describe, it, expect } from 'vitest'
import {
  DEFAULT_ADJUSTABLE_DUMBBELL_LOADS,
  LEGACY_ADJUSTABLE_DUMBBELL_LOADS,
  applyDumbbellLadderMigration,
  convertLoad,
  getNextAvailableLoad,
  getPreviousAvailableLoad,
  getLoadJumpPercent,
  ladderAppliesToLoad,
  parseLoadList,
  climbLadder,
  dropLadder,
  stepAvailableLoad,
  equipmentForExercise,
  loadsInUnit,
  defaultEquipment
} from './equipment.js'

const LADDER = DEFAULT_ADJUSTABLE_DUMBBELL_LOADS

describe('load ladder helpers', () => {
  it('9 → 11 kg', () => {
    expect(getNextAvailableLoad(9, LADDER)).toBe(11)
    expect(getLoadJumpPercent(9, 11)).toBe(22.2)
  })

  it('15 → 18 kg', () => {
    expect(getNextAvailableLoad(15, LADDER)).toBe(18)
    expect(getLoadJumpPercent(15, 18)).toBe(20)
  })

  it('29 → 32 kg', () => {
    expect(getNextAvailableLoad(29, LADDER)).toBe(32)
    expect(getPreviousAvailableLoad(29, LADDER)).toBe(27)
  })

  it('32 → 34 kg', () => {
    expect(getNextAvailableLoad(32, LADDER)).toBe(34)
    expect(getLoadJumpPercent(32, 34)).toBe(6.3)
  })

  it('stays at 40 kg maximum', () => {
    expect(getNextAvailableLoad(40, LADDER)).toBeNull()
    expect(getPreviousAvailableLoad(40, LADDER)).toBe(38)
  })

  it('current load not exactly on the ladder', () => {
    expect(getNextAvailableLoad(30, LADDER)).toBe(32)
    expect(getPreviousAvailableLoad(30, LADDER)).toBe(29)
    expect(getNextAvailableLoad(10, LADDER)).toBe(11)
  })

  it('no equipment ladder configured', () => {
    expect(getNextAvailableLoad(29, [])).toBeNull()
    expect(getNextAvailableLoad(29, null)).toBeNull()
    expect(ladderAppliesToLoad(29, [])).toBe(false)
  })

  it('parses an ordered unique list', () => {
    expect(parseLoadList('40, 5, 5, 7, 9')).toEqual([5, 7, 9, 40])
  })

  it('converts kg/lb consistently', () => {
    expect(convertLoad(10, 'kg', 'kg')).toBe(10)
    expect(convertLoad(10, 'lb', 'kg')).toBe(4.5)
    expect(convertLoad(4.5, 'kg', 'lb')).toBe(9.9)
  })

  it('does not apply the ladder to a load heavier than the kit', () => {
    expect(ladderAppliesToLoad(60, LADDER)).toBe(false)
    expect(ladderAppliesToLoad(40, LADDER)).toBe(true)
  })

  it('climbs more than one rung for a double jump', () => {
    expect(climbLadder(29, LADDER, 2)).toBe(34)
  })

  it('drops toward a 10% deload onto a real rung', () => {
    expect(dropLadder(40, LADDER, 36)).toBe(36)
  })

  it('is the adjustable dumbbell kit: 22 kg is a rung and 23 kg is not', () => {
    expect([...LADDER]).toEqual([5, 7, 9, 11, 13, 15, 18, 20, 22, 25, 27, 29, 32, 34, 36, 38, 40])
    expect(LADDER).not.toContain(23)
  })

  it('steps the non-uniform rungs in both directions', () => {
    const up = [
      [20, 22],
      [22, 25],
      [29, 32],
      [38, 40],
    ]
    for (const [current, next] of up) {
      expect(getNextAvailableLoad(current, LADDER)).toBe(next)
      expect(stepAvailableLoad(current, 1, LADDER)).toBe(next)
      expect(getPreviousAvailableLoad(next, LADDER)).toBe(current)
      expect(stepAvailableLoad(next, -1, LADDER)).toBe(current)
    }
  })

  it('replaces a stored 23 kg default ladder and leaves logged sets unchanged', () => {
    const state = {
      equipment: [{
        id: 'adjustable-dumbbells',
        name: 'Adjustable dumbbells',
        eq: 'dumbbell',
        unit: 'kg',
        loads: [...LEGACY_ADJUSTABLE_DUMBBELL_LOADS],
      }],
      workouts: [{ entries: [{ sets: [{ w: 23, r: 8, done: true }] }] }],
    }
    const before = JSON.stringify(state.workouts)
    const loads = loadsInUnit(equipmentForExercise(state, { id: '0334' }), 'kg')
    expect(loads).toEqual([...DEFAULT_ADJUSTABLE_DUMBBELL_LOADS])
    expect(loads).not.toContain(23)
    applyDumbbellLadderMigration(state)
    expect(state.equipment[0].loads).toEqual([...DEFAULT_ADJUSTABLE_DUMBBELL_LOADS])
    expect(JSON.stringify(state.workouts)).toBe(before)
    expect(state.workouts[0].entries[0].sets[0].w).toBe(23)
  })

  it('leaves a hand-edited ladder that still lists 23 kg', () => {
    const custom = [5, 10, 15, 23, 30]
    const state = {
      equipment: [{
        id: 'adjustable-dumbbells',
        name: 'Adjustable dumbbells',
        eq: 'dumbbell',
        unit: 'kg',
        loads: custom,
      }],
    }
    applyDumbbellLadderMigration(state)
    expect(state.equipment[0].loads).toEqual(custom)
  })
})

describe('equipmentForExercise', () => {
  const S = { equipment: defaultEquipment() }

  it('matches dumbbell catalogue equipment to the default ladder', () => {
    const eq = equipmentForExercise(S, { id: '0334' })
    expect(eq.id).toBe('adjustable-dumbbells')
  })

  it('does not attach the dumbbell ladder to a barbell lift', () => {
    expect(equipmentForExercise(S, { id: '0025' })).toBeNull()
  })

  it('honours an explicit equipment id', () => {
    const S2 = {
      equipment: [
        ...defaultEquipment(),
        { id: 'plates', name: 'Plates', eq: 'barbell', unit: 'kg', loads: [20, 25, 30] }
      ]
    }
    expect(equipmentForExercise(S2, { id: '0025', equipmentId: 'plates' }).id).toBe('plates')
  })

  it('returns nothing when the profile cleared every ladder', () => {
    expect(equipmentForExercise({ equipment: [] }, { id: '0334' })).toBeNull()
  })
})
