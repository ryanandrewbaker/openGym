import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { MOBILE } from './lib/mobile.js'
import { detectLifePilotEmbedParams, isLpEmbedRequest } from './lib/lifepilot.js'
import './index.css'

detectLifePilotEmbedParams()

if (isLpEmbedRequest() && navigator.serviceWorker) {
  navigator.serviceWorker.getRegistrations?.().then((regs) => {
    regs.forEach((reg) => { void reg.unregister() })
  }).catch(() => {})
}

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>
)

// Not in the mobile build: the native shell already serves everything from disk.
// LifePilot embeds must not reuse a cached shell — WKWebView kept serving an old plan.
if (!MOBILE && !isLpEmbedRequest() && 'serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {})
}
