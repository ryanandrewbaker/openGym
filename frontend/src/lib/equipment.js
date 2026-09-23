export * from './equipment-core.js'
import { EXIDX } from './exercises.js'
import { equipmentForCatalogue } from './equipment-core.js'

export function equipmentForExercise(S, cfg) {
  const ex = EXIDX[cfg && cfg.id]
  return equipmentForCatalogue(S, cfg, ex && ex.eq)
}
