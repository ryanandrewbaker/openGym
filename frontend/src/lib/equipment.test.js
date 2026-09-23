import { describe, it, expect } from 'vitest'
import {
  DEFAULT_ADJUSTABLE_DUMBBELL_LOADS,
  convertLoad,
  getNextAvailableLoad,
  getPreviousAvailableLoad,
  getLoadJumpPercent,
  ladderAppliesToLoad,
  parseLoadList,
  climbLadder,
  dropLadder,
  equipmentForExercise,
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
