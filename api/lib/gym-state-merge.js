/**
 * Full-state sync used to drop `active` so an in-progress workout stayed on one device.
 * That copy dies with the LifePilot web view, so the newer write now keeps it.
 * A missing `active` key (older client) must not wipe a workout the server already has.
 * `active: null` is an explicit finish or discard.
 */
export function mergeGymState(existing, incoming) {
  if (!incoming || typeof incoming !== "object") return incoming
  const next = { ...incoming }
  const incomingHasActive = Object.prototype.hasOwnProperty.call(incoming, "active")
  if (!incomingHasActive && existing?.active) {
    next.active = existing.active
  }
  return next
}
