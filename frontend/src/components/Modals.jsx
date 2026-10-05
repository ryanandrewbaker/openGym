import { useEffect, useLayoutEffect, useRef } from 'react'
import { useUI } from '../store/useUI.js'

function activeScroller(panel) {
  const body = panel?.querySelector(':scope > .sheet-body')
  if (!body) return panel
  if (getComputedStyle(body).overflowY === 'hidden') {
    const list = body.querySelector(':scope > .list')
    if (list) return list
  }
  return body
}

// Confirm dialogs wrap title, message and buttons in one div. List sheets
// render those as direct children of the scroll body.
function contentRoot(body) {
  const kids = [...body.children]
  if (kids.length === 1 && kids[0].tagName === 'DIV' && !kids[0].classList.contains('list')) return kids[0]
  return body
}

function clearPins(body) {
  body.querySelectorAll('[data-sheet-pin]').forEach(el => {
    el.removeAttribute('data-sheet-pin')
    el.style.removeProperty('--sheet-pin-bottom')
  })
  body.style.paddingBottom = ''
  const root = contentRoot(body)
  if (root !== body) root.style.paddingBottom = ''
}

function isSpacer(el) {
  return el.tagName === 'DIV' && el.childElementCount === 0 && !el.textContent.trim()
}

function isAction(el) {
  if (el.matches('button.btn, a.btn') || el.classList.contains('btn')) return true
  if (!el.classList.contains('row')) return false
  const kids = [...el.children]
  return kids.length > 0 && kids.every(c => c.classList.contains('btn') || c.tagName === 'BUTTON')
}

function trailingActions(root) {
  const kids = [...root.children]
  const out = []
  for (let i = kids.length - 1; i >= 0; i--) {
    const el = kids[i]
    if (isAction(el) || (out.length && isSpacer(el))) { out.unshift(el); continue }
    break
  }
  return out.filter(isAction)
}

// Keep Save/Cancel/Done on screen when a form (no .list) is taller than the sheet.
// Buttons stay in React's tree; only presentation changes. List sheets pin their
// trailing actions with flex instead, so this bails out when a direct list exists.
function layoutSheet(panel, body) {
  clearPins(body)
  const list = body.querySelector(':scope > .list')
  if (list) return { mode: 'list', scroller: list }
  const root = contentRoot(body)
  const actions = trailingActions(root)
  const overflows = body.scrollHeight > body.clientHeight + 1
  if (!overflows || !actions.length) return { mode: overflows ? 'scroll' : 'fit', scroller: body, actions: actions.length }
  const cs = getComputedStyle(panel)
  const padB = parseFloat(cs.paddingBottom) || 0
  panel.style.setProperty('--sheet-pin-left', (parseFloat(cs.paddingLeft) || 0) + 'px')
  panel.style.setProperty('--sheet-pin-right', (parseFloat(cs.paddingRight) || 0) + 'px')
  let stack = 0
  for (let i = actions.length - 1; i >= 0; i--) {
    const el = actions[i]
    el.dataset.sheetPin = '1'
    el.style.setProperty('--sheet-pin-bottom', (padB + stack) + 'px')
    stack += el.getBoundingClientRect().height + 8
  }
  root.style.paddingBottom = stack + 'px'
  return { mode: 'pin', scroller: body, actions: actions.length }
}

// One bottom sheet (or centered dialog) with swipe-to-dismiss.
function Sheet({ sheet }) {
  const { closeSheet } = useUI()
  const ref = useRef(null)
  const bodyRef = useRef(null)
  const drag = useRef({ startY: null, delta: 0 })
  const lockedRef = useRef(sheet.locked)
  lockedRef.current = sheet.locked
  const moveRef = useRef(null)

  const onTouchStart = e => {
    const panel = ref.current
    if (!panel) return
    // a gesture that begins on a slider (or opted-out control) belongs to that control,
    // not to the sheet's swipe-to-dismiss — so it keeps working while you drag
    if (e.target.closest && e.target.closest('input[type=range], [data-nodrag]')) {
      drag.current = { startY: null, delta: 0 }
      return
    }
    const scroller = activeScroller(panel)
    drag.current = { startY: scroller && scroller.scrollTop <= 0 ? e.touches[0].clientY : null, delta: 0 }
  }
  const onTouchMove = e => {
    const panel = ref.current, d = drag.current
    if (!panel || d.startY === null) return
    const scroller = activeScroller(panel)
    d.delta = e.touches[0].clientY - d.startY
    if (d.delta > 0 && scroller && scroller.scrollTop <= 0) {
      e.preventDefault()
      panel.style.transition = 'none'
      panel.style.transform = `translateY(${d.delta}px)`
    } else d.delta = 0
  }
  moveRef.current = onTouchMove
  const onTouchEnd = () => {
    const panel = ref.current, d = drag.current
    if (!panel || d.startY === null) return
    panel.style.transition = 'transform .2s'
    if (d.delta > 90 && !lockedRef.current) { panel.style.transform = 'translateY(110%)'; setTimeout(() => closeSheet(sheet.id), 180) }
    else panel.style.transform = ''
    d.startY = null
  }

  // non-passive touchmove so preventDefault works (bottom sheets only; centered dialogs have no ref)
  useEffect(() => {
    const el = ref.current
    if (!el || sheet.kind === 'center') return
    const fn = e => moveRef.current(e)
    el.addEventListener('touchmove', fn, { passive: false })
    return () => el.removeEventListener('touchmove', fn)
  }, [sheet.kind])

  useLayoutEffect(() => {
    const panel = ref.current
    const body = bodyRef.current
    if (!panel || !body) return
    let mo = null
    const run = () => {
      if (mo) mo.disconnect()
      layoutSheet(panel, body)
      if (mo) mo.observe(body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] })
    }
    run()
    mo = new MutationObserver(() => run())
    mo.observe(body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] })
    const onResize = () => run()
    window.addEventListener('resize', onResize)
    window.visualViewport?.addEventListener('resize', onResize)
    return () => {
      mo.disconnect()
      window.removeEventListener('resize', onResize)
      window.visualViewport?.removeEventListener('resize', onResize)
    }
  }, [])

  const close = () => closeSheet(sheet.id)
  if (sheet.kind === 'center') {
    return (
      <div>
        <div className="mback" onClick={() => { if (!sheet.locked) close() }} />
        <div className="center" ref={ref}>
          <div className="sheet-body" ref={bodyRef}>{sheet.render(close)}</div>
        </div>
      </div>
    )
  }
  return (
    <div>
      <div className="mback" onClick={() => { if (!sheet.locked) close() }} />
      <div className="sheet" ref={ref} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="grab" />
        <div className="sheet-body" ref={bodyRef}>{sheet.render(close)}</div>
      </div>
    </div>
  )
}

export default function Modals() {
  const sheets = useUI(s => s.sheets)
  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7575/ingest/9476189c-770c-4271-a33c-60163e3d6c7e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3bd55b'},body:JSON.stringify({sessionId:'3bd55b',hypothesisId:'D',location:'Modals.jsx:sheets',message:'modal sheet count',data:{sheetCount:sheets.length,kinds:sheets.map(s=>s.kind)},timestamp:Date.now()})}).catch(()=>{})
  }, [sheets])
  // #endregion

  // lock the page behind any open sheet (iOS-safe)
  useEffect(() => {
    if (!sheets.length) return
    const y = window.scrollY || 0
    const b = document.body.style
    b.position = 'fixed'; b.top = -y + 'px'; b.left = '0'; b.right = '0'; b.width = '100%'
    return () => {
      b.position = b.top = b.left = b.right = b.width = ''
      window.scrollTo(0, y)
    }
  }, [sheets.length > 0])

  if (!sheets.length) return null
  return (
    <div id="modal-root" className="open">
      {sheets.map(s => <Sheet key={s.id} sheet={s} />)}
    </div>
  )
}
