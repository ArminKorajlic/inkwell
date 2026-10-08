import React, { useLayoutEffect, useRef, useState } from 'react'
import { dateKey, toMin, toHM, snap, layoutDay, projectColor, DAY_END } from './cal-model.js'
import CalTask from './CalTask.jsx'

// Week / day time grid: hours down the side, an all-day row, a "now" line,
// overlapping events side by side. Mouse: click or drag an empty slot to
// create, drag an event to move it (also across days), drag its bottom edge to
// resize. Touch: tap to create / open (no drag, so the grid scrolls normally).

const HH = 48 // pixels per hour

export default function TimeGrid({ days, byDate, projects, now, selectedId, ghost, onEventClick, onCreate, onChange, onDayHeader, onScroll, taskDays = {}, onToggleTask, onOpenTask }) {
  const scrollRef = useRef(null)
  const colRefs = useRef({})
  const dragRef = useRef(null)
  const lastPointer = useRef('mouse')
  const [drag, setDrag] = useState(null)
  const todayK = dateKey(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const daysKey = days.map(dateKey).join()

  // Open scrolled to something useful: now (if visible), the first event, or 07:00.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const timed = days.flatMap((d) => (byDate[dateKey(d)] || []).filter((e) => !e.allDay)).map((e) => toMin(e.time))
    const cands = [days.some((d) => dateKey(d) === todayK) ? nowMin - 90 : 7 * 60]
    if (timed.length) cands.push(Math.min(...timed) - 30)
    el.scrollTop = Math.max(0, Math.min(...cands)) / 60 * HH
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysKey])

  const minAt = (dk, clientY) => {
    const r = colRefs.current[dk].getBoundingClientRect()
    return Math.max(0, Math.min(DAY_END, ((clientY - r.top) / HH) * 60))
  }

  const onColPointerDown = (e, dk) => {
    lastPointer.current = e.pointerType
    if (e.pointerType === 'touch' || e.button !== 0 || e.target.closest('[data-ev]')) return
    const m = Math.min(snap(minAt(dk, e.clientY), 15), DAY_END + 1 - 15)   // never start at 24:00
    const d = { kind: 'create', date: dk, a: m, cur: m, x0: e.clientX, y0: e.clientY, moved: false }
    dragRef.current = d
    setDrag(d)
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* capture is best-effort */ }
    e.preventDefault()
  }
  const onEvPointerDown = (e, ev, kind) => {
    lastPointer.current = e.pointerType
    if (e.pointerType === 'touch' || e.button !== 0) return
    e.stopPropagation()
    const rects = Object.entries(colRefs.current).filter(([, el]) => el).map(([k, el]) => ({ k, r: el.getBoundingClientRect() }))
    const d = { kind, ev, x0: e.clientX, y0: e.clientY, moved: false, rects, s: toMin(ev.time), t: toMin(ev.end), el: e.currentTarget.closest('[data-ev]') }
    dragRef.current = d
    setDrag(d)
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* capture is best-effort */ }
  }
  const onPointerMove = (e) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0
    if (!d.moved && Math.hypot(dx, dy) < 5) return
    const next = { ...d, moved: true }
    if (d.kind === 'create') next.cur = Math.min(snap(minAt(d.date, e.clientY), 15), DAY_END + 1)
    else if (d.kind === 'move') {
      const len = d.t - d.s
      const s = Math.max(0, Math.min(DAY_END + 1 - len, d.s + snap((dy / HH) * 60, 15)))
      const hit = d.rects.find((c) => e.clientX >= c.r.left && e.clientX < c.r.right)
      next.date = hit ? hit.k : d.ev.date
      next.ns = s
      next.nt = s + len
    } else {
      next.ns = d.s
      next.nt = Math.max(d.s + 15, Math.min(DAY_END + 1, d.t + snap((dy / HH) * 60, 15)))
    }
    dragRef.current = next
    setDrag(next)
  }
  const onPointerUp = () => {
    const d = dragRef.current
    dragRef.current = null
    setDrag(null)
    if (!d) return
    if (d.kind === 'create') {
      let a = d.a, b = d.cur
      if (!d.moved) { a = Math.floor(d.a / 30) * 30; b = a + 60 }   // a click: that half hour, one hour long
      else { if (b < a) [a, b] = [b, a]; if (b - a < 15) b = a + 15 }
      onCreate({ date: d.date, allDay: false, time: toHM(a), end: toHM(Math.min(b, DAY_END)) })
      return
    }
    if (!d.moved) { onEventClick(d.ev, d.el.getBoundingClientRect()); return }
    const updated = { ...d.ev, date: d.date || d.ev.date, time: toHM(d.ns), end: toHM(Math.min(d.nt, DAY_END)) }
    if (updated.date !== d.ev.date || updated.time !== d.ev.time || updated.end !== d.ev.end) onChange(updated)
  }
  // An interrupted gesture (e.g. the browser took over to scroll) changes nothing.
  const onPointerCancel = () => { dragRef.current = null; setDrag(null) }
  // Touch (and keyboard-free taps): the click event does the work.
  const onColClick = (e, dk) => {
    if (lastPointer.current !== 'touch' || e.target.closest('[data-ev]')) return
    const a = Math.floor(minAt(dk, e.clientY) / 30) * 30
    onCreate({ date: dk, allDay: false, time: toHM(a), end: toHM(Math.min(a + 60, DAY_END)) })
  }
  const onEvClick = (e, ev) => {
    if (lastPointer.current !== 'touch') return
    e.stopPropagation()
    onEventClick(ev, e.currentTarget.getBoundingClientRect())
  }

  // Events per day, with the one being dragged shown at its new place.
  const moving = drag && drag.moved && drag.kind !== 'create' ? drag : null
  const listFor = (dk) => {
    let list = (byDate[dk] || []).filter((e) => !moving || e.id !== moving.ev.id)
    if (moving && (moving.date || moving.ev.date) === dk) list = [...list, { ...moving.ev, date: dk, time: toHM(moving.ns), end: toHM(Math.min(moving.nt, DAY_END)), _drag: true }]
    return list
  }
  // Same rule as onPointerUp: the earlier point starts it, at least 15 minutes long.
  const createGhost = drag && drag.kind === 'create' && drag.moved
    ? { date: drag.date, a: Math.min(drag.a, drag.cur), b: Math.max(Math.max(drag.a, drag.cur), Math.min(drag.a, drag.cur) + 15) }
    : ghost && !ghost.allDay ? { date: ghost.date, a: toMin(ghost.time), b: toMin(ghost.end) } : null

  return (
    <div className="tg" style={{ '--n': days.length }} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
      <div className="tg-head">
        <div />
        {days.map((d) => {
          const dk = dateKey(d)
          return (
            <button key={dk} className={'tg-dayhead' + (dk === todayK ? ' today' : '')} onClick={() => onDayHeader(d)}
              title={days.length > 1 ? 'Open this day' : undefined} aria-label={d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}>
              {d.toLocaleDateString([], { weekday: 'short' })}<b>{d.getDate()}</b>
            </button>
          )
        })}
      </div>
      <div className="tg-all">
        <div className="lbl">all-day</div>
        {days.map((d) => {
          const dk = dateKey(d)
          const all = (byDate[dk] || []).filter((e) => e.allDay)
          return (
            <div key={dk} className="tg-allcell" data-allday={dk}
              onClick={(e) => { if (!e.target.closest('[data-ev], [data-task]')) onCreate({ date: dk, allDay: true, time: '', end: '' }) }}>
              {all.map((e) => (
                <button key={e.id} data-ev={e.id} className={'tg-allday' + (e.id === selectedId ? ' sel' : '')}
                  style={{ '--c': projectColor(projects, e.projectId) }}
                  onClick={(x) => { x.stopPropagation(); onEventClick(e, x.currentTarget.getBoundingClientRect()) }}>{e.title}</button>
              ))}
              {ghost && ghost.allDay && ghost.date === dk && <div className="tg-allday ghost">New event</div>}
              {(taskDays[dk] || []).map((t) => <CalTask key={t.id} t={t} onToggle={onToggleTask} onOpen={onOpenTask} />)}
            </div>
          )
        })}
      </div>
      <div className="tg-scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="tg-body" style={{ height: 24 * HH }}>
          <div className="tg-gutter">
            {Array.from({ length: 24 }, (_, h) => <div key={h}>{h ? String(h).padStart(2, '0') + ':00' : ''}</div>)}
          </div>
          {days.map((d) => {
            const dk = dateKey(d)
            return (
              <div key={dk} ref={(el) => { colRefs.current[dk] = el }} data-col={dk}
                className={'tg-col' + (dk === todayK ? ' today' : '')} style={{ height: 24 * HH }}
                onPointerDown={(e) => onColPointerDown(e, dk)} onClick={(e) => onColClick(e, dk)}>
                {layoutDay(listFor(dk)).map(({ e, s, t, col, cols }) => {
                  const top = (s / 60) * HH
                  const height = Math.max(20, ((t - s) / 60) * HH - 2)
                  const w = 100 / cols
                  return (
                    <div key={e.id} data-ev={e.id} role="button" tabIndex={0}
                      className={'tg-ev' + (e.id === selectedId ? ' sel' : '') + (e._drag ? ' dragging' : '')}
                      style={{ '--c': projectColor(projects, e.projectId), top, height, left: `calc(${col * w}% + 2px)`, width: `calc(${w}% - 4px)` }}
                      onPointerDown={(x) => onEvPointerDown(x, e, 'move')} onClick={(x) => onEvClick(x, e)}
                      onKeyDown={(x) => { if (x.key === 'Enter' || x.key === ' ') { x.preventDefault(); onEventClick(e, x.currentTarget.getBoundingClientRect()) } }}
                      aria-label={`${e.title}, ${e.time} to ${e.end}`}>
                      <b>{e.title}</b>
                      {height > 30 && <span>{e.time}–{e.end}</span>}
                      <div className="tg-resize" onPointerDown={(x) => onEvPointerDown(x, e, 'resize')} aria-hidden="true" />
                    </div>
                  )
                })}
                {createGhost && createGhost.date === dk && (
                  <div className="tg-ev ghost" style={{ '--c': 'var(--accent)', top: (createGhost.a / 60) * HH, height: Math.max(20, ((createGhost.b - createGhost.a) / 60) * HH - 2), left: 2, width: 'calc(100% - 4px)' }}>
                    <b>New event</b><span>{toHM(createGhost.a)}–{toHM(Math.min(createGhost.b, DAY_END))}</span>
                  </div>
                )}
                {dk === todayK && <div className="tg-now" style={{ top: (nowMin / 60) * HH }} />}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
