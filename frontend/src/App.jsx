import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { bindUI } from './components/ui.jsx'
import { ACCENTS } from './lib/format.js'
import { setLang, useLang } from './lib/i18n.js'
import { setNav } from './lib/nav.js'
import { useWakeLock } from './lib/wakelock.js'
import { startFlow } from './sheets.jsx'
import Icon from './components/Icon.jsx'
import TabBar from './components/TabBar.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Modals from './components/Modals.jsx'
import Toast from './components/Toast.jsx'
import RestTimer from './components/RestTimer.jsx'
import Login from './views/Login.jsx'
import Home from './views/Home.jsx'
import Plan from './views/Plan.jsx'
import RoutineEdit from './views/RoutineEdit.jsx'
import Workout from './views/Workout.jsx'
import Stats from './views/Stats.jsx'
import History from './views/History.jsx'
import Library from './views/Library.jsx'
import Settings from './views/Settings.jsx'
import Admin from './views/Admin.jsx'
import { exchangeLifePilotTokenIfPresent, getLpContext, isLpEmbedRequest, isLpManageMode, isLpWorkoutMode, applyLifePilotEmbedChrome, applyNativeEmbedBridge, restoreHostedChromeFromContext } from './lib/lifepilot.js'
import { beginWorkout } from './sheets.jsx'

bindUI(useUI)   // lets the shared controls open sheets without importing the store at module scope

function applyPrefs(theme, accent) {
  const de = document.documentElement
  de.dataset.theme = theme === 'light' ? 'light' : 'dark'
  de.dataset.accent = ACCENTS[accent] ? accent : 'lime'
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.content = de.dataset.theme === 'light' ? '#f2f2f7' : '#000000'
}

function Shell() {
  const navigate = useNavigate()
  const loc = useLocation()
  const { S, user, ready } = useStore()
  const isGuest = useStore(s => s.isGuest())
  const langV = useLang()   // re-renders the whole shell when the language (pack) changes
  const lpWorkout = isLpWorkoutMode()
  const lpManage = isLpManageMode()
  const lpEmbed = lpWorkout || lpManage
  const lpEmbedRequest = isLpEmbedRequest()
  useEffect(() => { setNav(navigate) }, [navigate])
  useEffect(() => {
    if (lpEmbed) applyLifePilotEmbedChrome()
    else applyPrefs(S.theme, S.accent)
  }, [S.theme, S.accent, lpEmbed])
  useEffect(() => { setLang(S.lang || 'en') }, [S.lang])
  useEffect(() => { document.documentElement.lang = S.lang || 'en' }, [langV, S.lang])
  // every tab/route change starts at the top of the page
  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])
  // bound to the workout, not to the route — checking Stats mid-session keeps the screen on
  useWakeLock(!!S.active && S.keepAwake !== false)

  const authed = user || isGuest

  useEffect(() => {
    restoreHostedChromeFromContext()
  }, [lpWorkout, lpManage])

  useEffect(() => {
    if (lpWorkout && loc.pathname !== '/workout') navigate('/workout', { replace: true })
  }, [lpWorkout, loc.pathname, navigate])

  useEffect(() => {
    if (!lpManage) return
    const allowed = loc.pathname === '/plan' || loc.pathname.startsWith('/plan/r/')
    if (!allowed) navigate('/plan', { replace: true })
  }, [lpManage, loc.pathname, navigate])

  if (!ready && !authed) return (
    <div id="app">
      <div style={{ paddingTop: '44vh', display: 'flex', justifyContent: 'center', fontSize: 34, color: 'var(--label-3)' }}>
        <Icon name="dumbbell" />
      </div>
    </div>
  )

  return (
    <>
      {/* keyed on the route: a view that throws is contained, and switching tabs
          re-mounts the boundary, so the tab bar is always a way out */}
      <div id="app" className={'vfade' + (lpEmbed ? ' lp-embed-app' : '')} key={lpEmbed ? (lpManage ? 'manage' : 'workout') : loc.pathname}>
        <ErrorBoundary>
          {!authed ? (
            lpEmbedRequest ? (
              <div className="center" style={{ padding: '2rem 1.25rem', textAlign: 'center' }}>
                <p className="sub" style={{ marginBottom: '0.75rem' }}>
                  LifePilot could not sign you in to this workout session.
                </p>
                <p className="sub">Close this screen and try Resume again.</p>
              </div>
            ) : <Login />
          ) : lpWorkout ? (
            <Routes>
              <Route path="/workout" element={<Workout />} />
              <Route path="*" element={<Navigate to="/workout" replace />} />
            </Routes>
          ) : lpManage ? (
            <Routes>
              <Route path="/plan" element={<Plan />} />
              <Route path="/plan/r/:id" element={<RoutineEdit />} />
              <Route path="*" element={<Navigate to="/plan" replace />} />
            </Routes>
          ) : (
            <Routes>
              <Route path="/home" element={<Home />} />
              <Route path="/plan" element={<Plan />} />
              <Route path="/plan/r/:id" element={<RoutineEdit />} />
              <Route path="/workout" element={<Workout />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/history" element={<History />} />
              <Route path="/library" element={<Library />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/admin" element={user?.admin ? <Admin /> : <Navigate to="/home" replace />} />
              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
          )}
        </ErrorBoundary>
      </div>
      {!lpEmbed && <TabBar onStart={startFlow} />}
      <RestTimer />
      <Modals />
      <Toast />
    </>
  )
}

export default function App() {
  const boot = useStore(s => s.boot)
  useEffect(() => {
    async function init() {
      if (!applyNativeEmbedBridge()) {
        try {
          await exchangeLifePilotTokenIfPresent()
        } catch (e) {
          console.error('LifePilot token exchange failed', e)
        }
      }
      await boot()
      const ctx = getLpContext()
      if (ctx?.mode !== 'manage' && ctx?.routineId && !useStore.getState().S.active) {
        beginWorkout(ctx.routineId, ctx.bodyweightKg ?? null, { sessionId: ctx.externalSessionId })
      }
    }
    void init()
  }, [boot])
  return <HashRouter><Shell /></HashRouter>
}
