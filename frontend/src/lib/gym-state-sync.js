const LP_EMBED_FLAG_KEY = "lp_embed_request"

export function isLifePilotEmbedBoot() {
  try {
    if (typeof window === "undefined") return false
    if (window.__LIFEPILOT_EMBED__) return true
    if (sessionStorage.getItem(LP_EMBED_FLAG_KEY) === "1") return true
    return new URLSearchParams(window.location.search).get("embed") === "lifepilot"
  } catch {
    return false
  }
}

/**
 * LifePilot embed always takes the server plan. Standalone openGym keeps last-write-wins,
 * including keeping a dirty local copy that has not been pushed yet.
 */
export function shouldApplyRemoteGymState({
  embed,
  dirty,
  hasLocalData,
  hasRemote,
  localTs,
  remoteTs,
}) {
  if (!hasRemote) return false
  if (embed) return true
  if (!hasLocalData) return true
  if (dirty) return false
  return (remoteTs || 0) >= (localTs || 0)
}

/** Embedded LifePilot starts from the live plan, not a leftover phone snapshot. */
export function shouldKeepLocalActiveWorkout(embed) {
  return !embed
}
