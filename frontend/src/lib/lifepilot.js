import { api } from './api.js'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { exOr } from './exercises.js'

const LP_CTX_KEY = 'lp_context'
const LP_EMBED_FLAG_KEY = 'lp_embed_request'
const LP_TOKEN_STASH_KEY = 'lp_token_stash'

export function isLpMode() {
  return !!sessionStorage.getItem(LP_CTX_KEY)
}

export function isLpEmbedRequest() {
  if (isLpMode()) return true
  if (sessionStorage.getItem(LP_EMBED_FLAG_KEY) === '1') return true
  return new URLSearchParams(window.location.search).get('embed') === 'lifepilot'
}

export function getLpContext() {
  try {
    return JSON.parse(sessionStorage.getItem(LP_CTX_KEY) || 'null')
  } catch {
    return null
  }
}

export function getLpMode() {
  const context = getLpContext()
  if (!context) return null
  return context.mode === 'manage' ? 'manage' : 'workout'
}

export function isLpWorkoutMode() {
  return isLpMode() && getLpMode() === 'workout'
}

export function isLpManageMode() {
  return isLpMode() && getLpMode() === 'manage'
}

function setLpContext(context) {
  sessionStorage.setItem(LP_CTX_KEY, JSON.stringify(context))
}

function cleanEmbedUrlParams() {
  const url = new URL(window.location.href)
  url.searchParams.delete('lp_token')
  url.searchParams.delete('routineId')
  url.searchParams.delete('externalSessionId')
  url.searchParams.delete('lp_mode')
  window.history.replaceState({}, '', url.toString())
}

/** Sync document chrome for hosted LifePilot modes (iframe today, WebView later). */
export function syncHostedChrome(mode) {
  const root = document.documentElement
  if (mode === 'workout') {
    root.dataset.lpMode = 'workout'
    document.body.classList.add('lp-hosted-workout')
  } else if (mode === 'manage') {
    root.dataset.lpMode = 'manage'
    document.body.classList.remove('lp-hosted-workout')
  } else {
    delete root.dataset.lpMode
    document.body.classList.remove('lp-hosted-workout')
  }
}

export function restoreHostedChromeFromContext() {
  const mode = getLpMode()
  if (mode === 'manage') syncHostedChrome('manage')
  else if (mode) syncHostedChrome('workout')
}

export function prepareHostedWorkoutLayout() {
  syncHostedChrome('workout')
  useStore.getState().update((state) => {
    state.gifSize = 'mini'
  })
}

export function requestLifePilotExit() {
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'lifepilot-exit-workout' }, '*')
  }
  if (window.webkit?.messageHandlers?.lifepilot) {
    window.webkit.messageHandlers.lifepilot.postMessage({ type: 'lifepilot-exit-workout' })
  }
}

/** Apply before React boot when embed=lifepilot is in the URL (avoids theme flash). */
export function detectLifePilotEmbedParams() {
  return stashLifePilotEmbedParams()
}

export function stashLifePilotEmbedParams() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('embed') !== 'lifepilot') return false
  sessionStorage.setItem(LP_EMBED_FLAG_KEY, '1')
  const token = params.get('lp_token')
  if (token) sessionStorage.setItem(LP_TOKEN_STASH_KEY, token)
  applyLifePilotEmbedChrome()
  const hintedMode = params.get('lp_mode')
  if (hintedMode === 'workout' || hintedMode === 'manage') {
    syncHostedChrome(hintedMode)
  }
  return true
}

export function applyLifePilotEmbedChrome() {
  const root = document.documentElement
  root.dataset.embed = 'lifepilot'
  root.dataset.theme = 'light'
  root.dataset.accent = 'sky'
  document.body.classList.add('lp-embed')
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.content = '#f5f8fc'
}

export function applyNativeEmbedBridge() {
  const bridge = window.__LIFEPILOT_EMBED__
  if (!bridge?.user || !bridge?.context) return false

  useStore.getState().setUser(bridge.user)
  setLpContext(bridge.context)
  sessionStorage.setItem(LP_EMBED_FLAG_KEY, '1')
  sessionStorage.removeItem(LP_TOKEN_STASH_KEY)
  applyLifePilotEmbedChrome()
  if (bridge.context.mode === 'manage') {
    syncHostedChrome('manage')
  } else {
    prepareHostedWorkoutLayout()
  }
  cleanEmbedUrlParams()
  return true
}

export async function exchangeLifePilotTokenIfPresent() {
  if (applyNativeEmbedBridge()) return true

  const params = new URLSearchParams(window.location.search)
  const token = params.get('lp_token') || sessionStorage.getItem(LP_TOKEN_STASH_KEY)
  if (!token) return false

  const { user, context } = await api('/integrations/lifepilot/exchange-token', {
    method: 'POST',
    body: JSON.stringify({ token }),
  })

  useStore.getState().setUser(user)
  setLpContext(context)
  sessionStorage.setItem(LP_EMBED_FLAG_KEY, '1')
  sessionStorage.removeItem(LP_TOKEN_STASH_KEY)
  applyLifePilotEmbedChrome()
  if (context.mode === 'manage') {
    syncHostedChrome('manage')
  } else {
    prepareHostedWorkoutLayout()
  }

  cleanEmbedUrlParams()
  return true
}

export async function notifyLpCompletion(workout) {
  const context = getLpContext()
  if (!context || context.mode === 'manage') return

  const enrichedWorkout = {
    ...workout,
    entries: (workout.entries || []).map((entry) => ({
      ...entry,
      name: exOr(entry.id)?.n || entry.name || entry.id,
    })),
  }

  try {
    await api('/integrations/lifepilot/complete', {
      method: 'POST',
      body: JSON.stringify({ workout: enrichedWorkout, context }),
    })
  } catch {
    useUI.getState().toast('Workout saved locally; LifePilot sync failed')
  }
}
