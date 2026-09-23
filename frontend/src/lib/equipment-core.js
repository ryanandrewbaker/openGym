// Equipment load ladders (selectable discrete weights). Catalogue-free so the API
// image can copy this file without the exercise dataset or i18n.

export const KG_PER_LB = 0.45359237
export const DEFAULT_MAX_LOAD_JUMP_PERCENT = 12

export const DEFAULT_ADJUSTABLE_DUMBBELL_LOADS = Object.freeze([
  5, 7, 9, 11, 13, 15, 18, 20, 23, 25, 27, 29, 32, 34, 36, 38, 40
])

export function defaultEquipment() {
  return [{
    id: 'adjustable-dumbbells',
    name: 'Adjustable dumbbells',
    eq: 'dumbbell',
    unit: 'kg',
    loads: DEFAULT_ADJUSTABLE_DUMBBELL_LOADS.slice(),
    maxLoadJumpPercent: DEFAULT_MAX_LOAD_JUMP_PERCENT
  }]
}

const round1 = v => Math.round(v * 10) / 10

export function convertLoad(value, fromUnit, toUnit) {
  if (value == null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const from = fromUnit === 'lb' ? 'lb' : 'kg'
  const to = toUnit === 'lb' ? 'lb' : 'kg'
  if (from === to) return round1(n)
  if (from === 'lb') return round1(n * KG_PER_LB)
  return round1(n / KG_PER_LB)
}

export function normalizeLadder(loads) {
  const seen = new Set()
  const out = []
  for (const raw of loads || []) {
    const n = round1(Number(raw))
    if (!Number.isFinite(n) || n <= 0) continue
    const key = String(n)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(n)
  }
  out.sort((a, b) => a - b)
  return out
}

export function parseLoadList(text) {
  return normalizeLadder(String(text || '').split(/[\s,;]+/))
}

export function formatLoadList(loads) {
  return normalizeLadder(loads).join(', ')
}

export function getNextAvailableLoad(currentLoad, loads) {
  const ladder = normalizeLadder(loads)
  if (!ladder.length) return null
  const cur = round1(Number(currentLoad))
  if (!Number.isFinite(cur)) return ladder[0]
  for (const load of ladder) {
    if (load > cur + 0.05) return load
  }
  return null
}

export function getPreviousAvailableLoad(currentLoad, loads) {
  const ladder = normalizeLadder(loads)
  if (!ladder.length) return null
  const cur = round1(Number(currentLoad))
  if (!Number.isFinite(cur)) return null
  for (let i = ladder.length - 1; i >= 0; i--) {
    if (ladder[i] < cur - 0.05) return ladder[i]
  }
  return null
}

export function getLoadJumpPercent(currentLoad, nextLoad) {
  const cur = Number(currentLoad)
  const next = Number(nextLoad)
  if (!(cur > 0) || !Number.isFinite(next)) return null
  return round1(((next - cur) / cur) * 100)
}

export function ladderAppliesToLoad(currentLoad, loads) {
  const ladder = normalizeLadder(loads)
  if (!ladder.length) return false
  const cur = round1(Number(currentLoad))
  if (!Number.isFinite(cur) || cur <= 0) return false
  const max = ladder[ladder.length - 1]
  return cur <= max + 0.05
}

export function stepAvailableLoad(currentLoad, dir, loads, fallbackStep = 2.5) {
  const ladder = normalizeLadder(loads)
  const cur = Math.max(0, Number(currentLoad) || 0)
  if (!ladder.length) {
    return round1(Math.max(0, cur + (dir > 0 ? 1 : -1) * fallbackStep))
  }
  if (dir > 0) {
    const next = getNextAvailableLoad(cur, ladder)
    return next == null ? cur : next
  }
  const prev = getPreviousAvailableLoad(cur, ladder)
  return prev == null ? cur : prev
}

export function loadsInUnit(equipment, unit) {
  if (!equipment) return []
  const from = equipment.unit === 'lb' ? 'lb' : 'kg'
  const to = unit === 'lb' ? 'lb' : 'kg'
  return normalizeLadder(equipment.loads).map(load => convertLoad(load, from, to)).filter(v => v != null)
}

export function equipmentList(S) {
  const list = S && Array.isArray(S.equipment) ? S.equipment : null
  if (list && list.length) return list
  if (list && list.length === 0) return []
  return defaultEquipment()
}

export function equipmentById(S, id) {
  if (!id) return null
  return equipmentList(S).find(eq => eq && eq.id === id) || null
}

export function equipmentForCatalogue(S, cfg, eqKind) {
  const list = equipmentList(S)
  if (!list.length) return null
  if (cfg && cfg.equipmentId) {
    const named = list.find(eq => eq && eq.id === cfg.equipmentId)
    if (named && normalizeLadder(named.loads).length) return named
    return null
  }
  const kind = eqKind || (cfg && cfg.eq) || ''
  if (!kind) return null
  return list.find(eq => eq && eq.eq && eq.eq === kind && normalizeLadder(eq.loads).length) || null
}

export function maxLoadJumpPercent(equipment) {
  const n = Number(equipment && equipment.maxLoadJumpPercent)
  return n > 0 ? n : DEFAULT_MAX_LOAD_JUMP_PERCENT
}

export function climbLadder(currentLoad, loads, rungs = 1) {
  let cur = Number(currentLoad)
  if (!Number.isFinite(cur)) return null
  let next = null
  for (let i = 0; i < Math.max(1, rungs); i++) {
    const step = getNextAvailableLoad(cur, loads)
    if (step == null) return next
    next = step
    cur = step
  }
  return next
}

export function dropLadder(currentLoad, loads, toward) {
  const ladder = normalizeLadder(loads)
  if (!ladder.length) return null
  const cur = Number(currentLoad)
  if (!Number.isFinite(cur)) return null
  const floor = toward == null ? cur : Math.min(cur, Number(toward))
  let dw = cur
  let prev = getPreviousAvailableLoad(dw, ladder)
  if (prev == null) return ladder[0] < cur ? ladder[0] : null
  while (prev != null) {
    dw = prev
    if (dw <= floor + 0.05) break
    prev = getPreviousAvailableLoad(dw, ladder)
  }
  return dw < cur - 0.05 ? dw : null
}
