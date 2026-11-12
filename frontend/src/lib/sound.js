// WebAudio beeps + haptics (ported from the vanilla app). `enabled` gates sound.
let audioCtx = null

/** LifePilot embed shares the audio route with native Apple Music — avoid WebAudio there. */
function embedDefersAudio() {
  if (typeof window === 'undefined') return false
  try {
    const ctx = JSON.parse(sessionStorage.getItem('lp_context') || 'null')
    return !!ctx && ctx.mode !== 'manage'
  } catch {
    return false
  }
}

export function beep(enabled, freq, dur, when) {
  if (!enabled || embedDefersAudio()) return
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)()
    const o = audioCtx.createOscillator(), g = audioCtx.createGain()
    o.connect(g); g.connect(audioCtx.destination)
    o.frequency.value = freq || 880; o.type = 'sine'
    const t0 = audioCtx.currentTime + (when || 0)
    g.gain.setValueAtTime(0.001, t0)
    g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + (dur || 0.18))
    o.start(t0); o.stop(t0 + (dur || 0.18) + 0.05)
  } catch (e) { /* */ }
}
export function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p) } catch (e) { /* */ } }
