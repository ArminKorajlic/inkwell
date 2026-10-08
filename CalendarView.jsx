import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, SidebarLeft, Sparkles } from '@openai/apps-sdk-ui/components/Icon'
import { dateKey, parseKey, addDays, startOfDay, startOfWeek, eventsByDate, parseQuickAdd, projectColor, fmtRange } from './cal-model.js'
import { tasksByDate } from './task-model.js'
import TimeGrid from './TimeGrid.jsx'
import MonthView from './MonthView.jsx'
import { EventPeek, QuickCard } from './EventPeek.jsx'
import { Lightbox } from './Attachments.jsx'

const CSS = `
.cal { flex: 1; display: flex; flex-direction: column; min-height: 0; min-width: 0; position: relative; }
.cal-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 12px 16px; border-bottom: 1px solid var(--border); }
.cal-title { font-size: 20px; font-weight: 700; letter-spacing: -0.015em; min-width: 170px; margin-right: 4px; }
.cal-btn { height: 34px; padding: 0 12px; border-radius: 9px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font: inherit; font-size: 13.5px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.cal-btn:hover { background: var(--surface-2); }
.cal-btn.icon { width: 34px; padding: 0; }
.cal-btn:focus-visible, .cal-seg button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.cal-seg { display: inline-flex; background: var(--surface-2); border-radius: 10px; padding: 3px; gap: 2px; }
.cal-seg button { border: none; background: none; color: var(--muted); font: inherit; font-size: 13px; font-weight: 600; padding: 5px 12px; border-radius: 8px; cursor: pointer; min-height: 28px; }
.cal-seg button.on { background: var(--bg); color: var(--text); box-shadow: 0 1px 3px rgba(0,0,0,.15); }
.cal-qa { flex: 1 1 300px; min-width: 220px; display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 10px; border-radius: 9px; background: color-mix(in srgb, var(--text) 6%, transparent); color: var(--muted); }
.cal-qa:focus-within { box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent); }
.cal-qa input { flex: 1; border: none; background: none; outline: none; color: var(--text); font: inherit; font-size: 14px; min-width: 0; }
.cal-qa-preview { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 7px 16px; border-bottom: 1px solid var(--border); font-size: 12.5px; color: var(--muted); }
.cal-chip { display: inline-flex; align-items: center; gap: 5px; background: var(--surface-2); color: var(--text); border-radius: 999px; padding: 2px 10px; }
.cal-dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; display: inline-block; }
.cal-hint { color: var(--muted); font-size: 12px; }

/* time grid */
.tg { flex: 1; display: flex; flex-direction: column; min-height: 0; --hh: 48px; --g: 56px; }
.tg-head, .tg-all { display: grid; grid-template-columns: var(--g) repeat(var(--n), minmax(0, 1fr)); border-bottom: 1px solid var(--border); }
/* The hour area has a scrollbar; reserve the same gutter above it so the day columns line up exactly. */
.tg-head, .tg-all { overflow-y: hidden; scrollbar-gutter: stable; }
.tg-dayhead { padding: 6px 2px 8px; text-align: center; font-size: 11.5px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); border: none; background: none; font-family: inherit; cursor: pointer; min-width: 0; }
.tg-dayhead:hover b { background: color-mix(in srgb, var(--text) 8%, transparent); }
.tg-dayhead b { display: block; margin: 2px auto 0; font-size: 20px; letter-spacing: 0; color: var(--text); width: 34px; height: 34px; line-height: 34px; border-radius: 50%; text-transform: none; font-weight: 600; }
.tg-dayhead.today { color: #e5484d; }
.tg-dayhead.today b, .tg-dayhead.today:hover b { background: #e5484d; color: #fff; }
.tg-all .lbl { font-size: 11px; color: var(--muted); text-align: right; padding: 7px 8px 0 0; }
.tg-allcell { border-left: 1px solid var(--border); padding: 3px; display: flex; flex-direction: column; gap: 3px; min-height: 30px; cursor: cell; min-width: 0; }
.tg-allday { border: none; text-align: left; font: inherit; font-size: 12px; font-weight: 600; color: #fff; border-radius: 6px; padding: 3px 7px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: var(--c); }
.tg-allday.sel { outline: 2px solid var(--c); outline-offset: 1px; }
.tg-allday.ghost { background: color-mix(in srgb, var(--accent) 25%, transparent); color: var(--text); outline: 1.5px dashed var(--accent); }
.tg-scroll { flex: 1; overflow-y: auto; min-height: 0; position: relative; scrollbar-gutter: stable; }
.tg-body { display: grid; grid-template-columns: var(--g) repeat(var(--n), minmax(0, 1fr)); position: relative; }
.tg-gutter div { height: var(--hh); font-size: 11px; color: var(--muted); text-align: right; padding-right: 8px; position: relative; top: -7px; font-variant-numeric: tabular-nums; }
.tg-col { position: relative; border-left: 1px solid var(--border); background-image: repeating-linear-gradient(to bottom, transparent 0, transparent calc(var(--hh) - 1px), var(--border) calc(var(--hh) - 1px), var(--border) var(--hh)); cursor: cell; touch-action: pan-y; min-width: 0; }
.tg-col.today { background-color: color-mix(in srgb, var(--accent) 5%, transparent); }
.tg-ev { position: absolute; border-radius: 7px; padding: 3px 7px 3px 8px; font-size: 12px; line-height: 1.3; overflow: hidden; cursor: pointer; border-left: 3px solid var(--c); background: color-mix(in srgb, var(--c) 22%, var(--bg)); color: var(--text); box-shadow: 0 1px 2px rgba(0,0,0,.14); user-select: none; touch-action: pan-y; }
.tg-ev:hover { background: color-mix(in srgb, var(--c) 32%, var(--bg)); }
.tg-ev:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.tg-ev.sel { outline: 2px solid var(--c); outline-offset: 1px; z-index: 2; }
.tg-ev.dragging { z-index: 6; box-shadow: 0 10px 28px rgba(0,0,0,.35); cursor: grabbing; opacity: .92; }
.tg-ev b { display: block; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tg-ev span { color: var(--muted); font-size: 11.5px; white-space: nowrap; }
.tg-ev.ghost { background: color-mix(in srgb, var(--accent) 18%, var(--bg)); outline: 1.5px dashed var(--accent); outline-offset: -1.5px; pointer-events: none; z-index: 3; }
.tg-resize { position: absolute; left: 0; right: 0; bottom: 0; height: 7px; cursor: ns-resize; }
.tg-now { position: absolute; left: 0; right: 0; height: 2px; background: #e5484d; z-index: 4; pointer-events: none; }
.tg-now::before { content: ""; position: absolute; left: -5px; top: -4px; width: 10px; height: 10px; border-radius: 50%; background: #e5484d; }

/* month */
.mv { flex: 1; display: flex; min-height: 0; }
.mv-main { flex: 1; overflow-y: auto; padding: 10px 14px 30px; min-width: 0; }
.mv-dow, .mv-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
.mv-dow { margin-bottom: 6px; }
.mv-dow span { text-align: center; font-size: 11.5px; font-weight: 600; color: var(--muted); text-transform: uppercase; }
.mv-day { min-height: 96px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); padding: 5px 6px; display: flex; flex-direction: column; gap: 3px; cursor: pointer; text-align: left; font: inherit; color: inherit; overflow: hidden; min-width: 0; }
.mv-day:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); }
.mv-day:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.mv-day.other { opacity: .45; }
.mv-day.sel { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent); }
.mv-n { font-size: 13px; font-weight: 600; width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; }
.mv-day.today .mv-n { background: #e5484d; color: #fff; }
.mv-chip { font-size: 11.5px; display: flex; align-items: center; gap: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mv-chip i { font-style: normal; color: var(--muted); font-variant-numeric: tabular-nums; }
.mv-more { font-size: 11px; color: var(--muted); }
.mv-panel { width: 320px; flex: 0 0 320px; border-left: 1px solid var(--border); background: var(--surface); overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 18px; }
.mv-rem { margin-top: auto; border: 1px solid var(--border); border-radius: 12px; background: var(--bg); padding: 10px 8px 6px; }
.mv-rem-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); padding: 0 8px 4px; }
.mv-rem-head span { text-transform: none; letter-spacing: 0; font-weight: 500; margin-left: auto; }
.mv-panel h3 { margin: 0; font-size: 17px; }
.mv-sub { color: var(--muted); font-size: 13px; margin: 2px 0 10px; }
.mv-item { width: 100%; display: flex; gap: 10px; align-items: stretch; border: none; background: none; color: inherit; font: inherit; text-align: left; padding: 9px 8px; border-radius: 10px; cursor: pointer; min-height: 44px; }
.mv-item:hover, .mv-item.sel { background: color-mix(in srgb, var(--text) 6%, transparent); }
.mv-item:focus-visible { outline: 2px solid var(--accent); }
.mv-bar { width: 4px; border-radius: 3px; background: var(--c); flex: 0 0 auto; }
.mv-time { font-size: 12.5px; color: var(--muted); min-width: 84px; font-variant-numeric: tabular-nums; padding-top: 1px; }
.mv-item b { display: block; font-size: 14.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mv-item small { color: var(--muted); font-size: 12.5px; display: inline-flex; align-items: center; gap: 3px; flex-wrap: wrap; }
.mv-empty { color: var(--muted); font-size: 14px; padding: 4px 8px 6px; }
/* tasks shown in the calendar: an outlined row with a tick circle, so they never look like events */
.cal-task { display: flex; align-items: center; gap: 6px; min-width: 0; border: 1px solid var(--border); background: var(--bg); border-radius: 6px; padding: 2px 6px; font-size: 12px; }
.cal-task-ck { flex: 0 0 auto; width: 13px; height: 13px; border-radius: 50%; border: 1.5px solid color-mix(in srgb, var(--muted) 70%, transparent); background: none; padding: 0; cursor: pointer; color: transparent; display: grid; place-items: center; position: relative; }
.cal-task-ck::before { content: ""; position: absolute; inset: -8px; }
.cal-task-ck.p1 { border-color: #0090ff; } .cal-task-ck.p2 { border-color: #f5a524; } .cal-task-ck.p3 { border-color: #e5484d; }
.cal-task-ck.done { background: var(--accent); border-color: var(--accent); color: #fff; }
.cal-task-t { flex: 1; min-width: 0; border: none; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; padding: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cal-task.done .cal-task-t { text-decoration: line-through; color: var(--muted); }
.cal-task-t i { font-style: normal; color: var(--muted); margin-right: 4px; font-variant-numeric: tabular-nums; }
.mv-tick { width: 9px; height: 9px; border-radius: 50%; border: 1.5px solid var(--muted); flex: 0 0 auto; display: inline-block; }
.mv-tick.p1 { border-color: #0090ff; } .mv-tick.p2 { border-color: #f5a524; } .mv-tick.p3 { border-color: #e5484d; }
.mv-chip.done { color: var(--muted); text-decoration: line-through; }
.mv-chip.done .mv-tick { background: var(--muted); }
.mv-tasks { margin-top: 14px; }
.mv-tasks h4 { margin: 0 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
.mv-tasks .cal-task { border: none; background: none; padding: 7px 8px; font-size: 14px; border-radius: 9px; min-height: 40px; gap: 10px; }
.mv-tasks .cal-task:hover { background: color-mix(in srgb, var(--text) 6%, transparent); }
.mv-tasks .cal-task-ck { width: 18px; height: 18px; border-width: 2px; }

/* peek + quick card */
.pk { position: fixed; z-index: 45; width: 350px; max-width: calc(100vw - 24px); max-height: calc(100vh - 24px); overflow-y: auto; background: var(--bg); border: 1px solid var(--border); border-radius: 16px; box-shadow: 0 18px 50px rgba(0,0,0,.35); padding: 12px 14px 12px 16px; outline: none; animation: pk-in .14s ease-out; }
@keyframes pk-in { from { opacity: 0; transform: translateY(4px) scale(.985); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .pk { animation: none; } }
.pk.sheet { left: 0 !important; right: 0; top: auto !important; bottom: 0; width: auto; max-width: none; border-radius: 18px 18px 0 0; max-height: 78vh; }
.pk-head { display: flex; gap: 10px; align-items: flex-start; }
.pk-sw { width: 12px; height: 12px; border-radius: 4px; margin-top: 8px; flex: 0 0 auto; background: var(--c); }
.pk-title { flex: 1; font-size: 18px; font-weight: 700; letter-spacing: -0.01em; line-height: 1.35; word-break: break-word; padding-top: 2px; }
.pk-when { color: var(--muted); font-size: 13.5px; margin: 2px 0 12px 22px; display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.pk-rows { display: flex; flex-direction: column; gap: 10px; margin-left: 22px; font-size: 14px; }
.pk-row { display: flex; gap: 9px; align-items: flex-start; min-width: 0; }
.pk-row .k { color: var(--muted); display: inline-flex; margin-top: 2px; flex: 0 0 auto; }
.pk-details { white-space: pre-wrap; word-break: break-word; }
.pk-note { border: 1px solid var(--border); border-radius: 10px; padding: 8px 10px; background: var(--surface); font-size: 13px; cursor: pointer; text-align: left; color: inherit; font-family: inherit; width: 100%; min-width: 0; }
.pk-note:hover { border-color: var(--accent); }
.pk-note b { display: block; font-size: 13.5px; }
.pk-note span { color: var(--muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pk-files { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.pk-file { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); border-radius: 8px; padding: 3px 9px; font-size: 12.5px; background: var(--surface); color: var(--text); cursor: pointer; font-family: inherit; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pk-file:hover { border-color: var(--accent); }
.pk-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 14px; }
.qc-title { width: 100%; border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 10px; padding: 9px 11px; font: inherit; font-size: 15px; outline: none; }
.qc-title:focus { border-color: var(--accent); }
.qc-projects { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.qc-proj { border: 1px solid var(--border); background: none; color: var(--text); border-radius: 999px; padding: 4px 10px; font: inherit; font-size: 12.5px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; min-height: 30px; }
.qc-proj.on { border-color: var(--c); background: color-mix(in srgb, var(--c) 18%, transparent); }

@media (max-width: 1000px) {
  .mv { flex-direction: column; overflow-y: auto; }
  .mv-main { overflow: visible; flex: none; }
  .mv-panel { width: auto; flex: none; border-left: none; border-top: 1px solid var(--border); }
  .mv-day { min-height: 64px; }
}
@media (max-width: 720px) {
  .tg { --g: 40px; }
  .cal-title { min-width: 0; font-size: 17px; flex: 1; }
  .mv-chip i { display: none; }
}
`

const VIEWS = ['day', 'week', 'month']
const sameMonth = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()

function titleFor(view, cursor) {
  if (view === 'month') return cursor.toLocaleDateString([], { month: 'long', year: 'numeric' })
  if (view === 'day') return cursor.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const a = startOfWeek(cursor), b = addDays(a, 6)
  const left = a.toLocaleDateString([], sameMonth(a, b) ? { day: 'numeric' } : { day: 'numeric', month: 'short' })
  return `${left} – ${b.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}`
}

export default function CalendarView({
  events, projects, notes, initialView = 'month', onViewChange, focus, onFocusHandled, suspendKeys, reminders = [],
  onCreate, onUpdate, onEdit, onDelete, onOpenNote, loadNoteExcerpt, onMenu, onError,
  tasks = [], onToggleTask, onOpenTask,
}) {
  const [view, setView] = useState(VIEWS.includes(initialView) ? initialView : 'month')
  const [cursor, setCursor] = useState(() => startOfDay(new Date()))
  const [now, setNow] = useState(() => new Date())
  const [peek, setPeek] = useState(null)      // { id, rect }
  const [quick, setQuick] = useState(null)    // { draft, rect }
  const [pending, setPending] = useState(null) // event id to open once it's on screen
  const [lightbox, setLightbox] = useState(null)
  const [qa, setQa] = useState('')
  const qaRef = useRef(null)

  useEffect(() => { const iv = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(iv) }, [])
  const byDate = useMemo(() => eventsByDate(events), [events])
  const taskDays = useMemo(() => tasksByDate(tasks), [tasks])
  const taskProps = { taskDays, onToggleTask, onOpenTask }
  const days = useMemo(() => (view === 'week'
    ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i))
    : [cursor]), [view, cursor])
  const peekEvent = peek && events.find((e) => e.id === peek.id)
  const qaParsed = useMemo(() => (qa.trim() ? parseQuickAdd(qa, new Date(), projects) : null), [qa, projects])

  const closeCards = () => { setPeek(null); setQuick(null) }
  const changeView = (v) => { setView(v); closeCards(); onViewChange?.(v) }
  const goToday = () => { setCursor(startOfDay(new Date())); closeCards() }
  const step = (dir) => {
    closeCards()
    setCursor((c) => {
      if (view === 'month') {
        const m = new Date(c.getFullYear(), c.getMonth() + dir, 1)
        return sameMonth(m, new Date()) ? startOfDay(new Date()) : m
      }
      return addDays(c, dir * (view === 'week' ? 7 : 1))
    })
  }
  const blankFor = (d) => ({ date: dateKey(d), allDay: false, time: '09:00', end: '10:00' })
  const openPeek = (ev, rect) => { setQuick(null); setPeek({ id: ev.id, rect }) }
  // Scrolls the calendar makes itself (to reveal an event) must not close the card it opens.
  const quietScroll = useRef(0)
  const showAfterRender = (ev) => {
    if (!ev) return
    quietScroll.current = Date.now() + 700
    setCursor(parseKey(ev.date))
    setQuick(null)
    setPending(ev.id)
  }

  // Requests from outside (Home, editor save) to show a specific event.
  useEffect(() => {
    if (!focus) return
    const ev = events.find((e) => e.id === focus.id)
    if (ev) showAfterRender(ev)
    onFocusHandled?.()   // one-shot: don't reopen it the next time the calendar mounts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus && focus.n])

  // Once a requested event is rendered, anchor its peek to it.
  useLayoutEffect(() => {
    if (!pending) return
    const el = document.querySelector(`.cal [data-ev="${pending}"]`)
    quietScroll.current = Date.now() + 700
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' })
    setPeek({ id: pending, rect: el ? el.getBoundingClientRect() : null })
    setPending(null)
  }, [pending, view, cursor])

  // Anchor a new quick card to its ghost block (or the all-day cell).
  useLayoutEffect(() => {
    if (!quick || quick.rect) return
    const el = quick.draft.allDay
      ? document.querySelector(`.cal [data-allday="${quick.draft.date}"]`)
      : document.querySelector('.cal .tg-ev.ghost')
    setQuick((q) => (q ? { ...q, rect: el ? el.getBoundingClientRect() : null } : q))
  }, [quick])

  // Click anywhere else closes the cards.
  useEffect(() => {
    if (!peek && !quick) return
    const onDown = (e) => {
      if (e.target.closest && e.target.closest('.pk, [data-ev], .nm-lightbox')) return
      closeCards()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [peek, quick])

  // Keyboard: D/W/M views, T today, ←/→ move, N new, / quick add, Esc close.
  useEffect(() => {
    const onKey = (e) => {
      if (suspendKeys || lightbox) return
      const el = e.target
      const typing = /^(input|textarea|select)$/i.test(el.tagName || '') || el.isContentEditable
      if (e.key === 'Escape') { if (peek || quick) { e.preventDefault(); closeCards() } return }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'd' || k === 'w' || k === 'm') changeView({ d: 'day', w: 'week', m: 'month' }[k])
      else if (k === 't') goToday()
      else if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'ArrowRight') step(1)
      else if (k === 'n') { closeCards(); onEdit(blankFor(cursor)) }
      else if (e.key === '/') qaRef.current?.focus()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const submitQuickAdd = () => {
    if (!qaParsed || !qaParsed.ok) return
    const { title, date, allDay, time, end, projectId } = qaParsed
    const ev = onCreate({ title, date, allDay, time, end, projectId })
    setQa('')
    showAfterRender(ev)
  }
  const saveQuick = (title, projectId) => {
    const ev = onCreate({ ...quick.draft, title: title.trim() || 'New event', projectId })
    showAfterRender(ev)
  }

  return (
    <div className="cal">
      <style>{CSS}</style>
      <div className="cal-bar">
        <button className="nm-iconbtn nm-mobile-back" onClick={onMenu} aria-label="Menu" title="Menu"><SidebarLeft width={20} height={20} /></button>
        <span className="cal-title" aria-live="polite">{titleFor(view, cursor)}</span>
        <button className="cal-btn" onClick={goToday} title="Today (T)">Today</button>
        <button className="cal-btn icon" onClick={() => step(-1)} aria-label="Previous" title="Previous (←)"><ChevronLeft width={16} height={16} /></button>
        <button className="cal-btn icon" onClick={() => step(1)} aria-label="Next" title="Next (→)"><ChevronRight width={16} height={16} /></button>
        <div className="cal-seg" role="tablist" aria-label="Calendar view">
          {VIEWS.map((v) => (
            <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => changeView(v)}
              title={`${v[0].toUpperCase() + v.slice(1)} (${v[0].toUpperCase()})`}>{v[0].toUpperCase() + v.slice(1)}</button>
          ))}
        </div>
        <label className="cal-qa" title="Quick add (/)">
          <Sparkles width={15} height={15} />
          <input ref={qaRef} value={qa} onChange={(e) => setQa(e.target.value)} aria-label="Quick add an event"
            placeholder="Quick add: Dentist tomorrow 14:30 for 45 min"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitQuickAdd() } else if (e.key === 'Escape') { setQa(''); e.currentTarget.blur() } }} />
        </label>
        <button className="nm-btn-primary nm-small" onClick={() => { closeCards(); onEdit(blankFor(cursor)) }} title="New event (N)">
          <Plus width={14} height={14} /> Event
        </button>
      </div>
      {qaParsed && (
        <div className="cal-qa-preview" aria-live="polite">
          {qaParsed.ok ? (
            <>
              <span className="cal-chip"><b>{qaParsed.title}</b></span>
              <span className="cal-chip">{parseKey(qaParsed.date).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              <span className="cal-chip">{fmtRange(qaParsed)}</span>
              <span className="cal-chip"><span className="cal-dot" style={{ background: projectColor(projects, qaParsed.projectId) }} />{projects.find((p) => p.id === qaParsed.projectId)?.name || 'No project'}</span>
              <span className="cal-hint">Enter to add · use #project to file it</span>
            </>
          ) : <span className="cal-hint">Add a title, for example “Lunch with Mia friday 1pm”.</span>}
        </div>
      )}

      {view === 'month' ? (
        <MonthView cursor={cursor} byDate={byDate} projects={projects} now={now} selectedId={peek?.id} reminders={reminders} {...taskProps}
          onSelectDay={(d) => { closeCards(); setCursor(startOfDay(d)) }}
          onEventClick={openPeek}
          onAdd={(d) => { closeCards(); onEdit(blankFor(d)) }}
          onReminderClick={(e) => showAfterRender(e)} />
      ) : (
        <TimeGrid days={days} byDate={byDate} projects={projects} now={now} selectedId={peek?.id} {...taskProps}
          ghost={quick ? quick.draft : null}
          onEventClick={openPeek}
          onCreate={(draft) => { setPeek(null); setQuick({ draft, rect: null }) }}
          onChange={(ev) => { closeCards(); onUpdate(ev) }}
          onDayHeader={(d) => { setCursor(startOfDay(d)); if (view !== 'day') changeView('day') }}
          onScroll={() => { if ((peek || quick) && Date.now() > quietScroll.current) closeCards() }} />
      )}

      {peekEvent && (
        <EventPeek ev={peekEvent} projects={projects} notes={notes} rect={peek.rect}
          onClose={() => setPeek(null)}
          onEdit={(ev) => { setPeek(null); onEdit(ev) }}
          onDelete={(ev) => { setPeek(null); onDelete(ev) }}
          onOpenNote={(id) => { setPeek(null); onOpenNote(id) }}
          loadNoteExcerpt={loadNoteExcerpt}
          onViewImage={(url, name) => setLightbox({ url, name })}
          onError={onError} />
      )}
      {quick && (
        <QuickCard key={quick.draft.date + quick.draft.time + quick.draft.allDay} draft={quick.draft} projects={projects} rect={quick.rect}
          onCancel={() => setQuick(null)}
          onSave={saveQuick}
          onMore={(title, projectId) => { const d = { ...quick.draft, title, projectId }; setQuick(null); onEdit(d) }} />
      )}
      {lightbox && <Lightbox url={lightbox.url} name={lightbox.name} onClose={() => setLightbox(null)} />}
    </div>
  )
}
