import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Star, Calendar, Tasks as TasksIcon, CheckCircle, Check, PlayTriangle, Loop, Text, Notepad, Bell, Timer,
  Flag, Plus, Sparkles, SidebarLeft, ChevronRight, ChevronDown,
} from '@openai/apps-sdk-ui/components/Icon'
import * as TM from './task-model.js'
import { projectColor } from './cal-model.js'
import { dateKey } from './util.js'
import TaskDetail from './TaskDetail.jsx'

// Tasks: smart lists (Today, Upcoming, All, Completed) + project lists, a
// plain-words quick-add box, grouped rows, and a details panel. All data
// changes go through the parent's handlers; this component owns only view
// state (list, selection, the brief "just ticked" fade, drag).

export const TASK_DRAG = 'application/x-inkwell-task'
const isTaskDrag = (e) => [...(e.dataTransfer?.types || [])].includes(TASK_DRAG)

const CSS = `
.tk { flex: 1; display: flex; min-height: 0; min-width: 0; position: relative; }
.tk-lists { width: 210px; flex: 0 0 210px; border-right: 1px solid var(--border); padding: 12px 8px; overflow-y: auto; }
.tk-lbl { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); padding: 12px 10px 4px; }
.tk-lbl:first-child { padding-top: 4px; }
.tk-nav { display: flex; align-items: center; gap: 10px; width: 100%; border: none; background: none; color: var(--text); font: inherit; font-size: 14px; padding: 7px 10px; border-radius: 9px; cursor: pointer; text-align: left; min-height: 38px; }
.tk-nav:hover { background: color-mix(in srgb, var(--text) 5%, transparent); }
.tk-nav:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.tk-nav.on { background: color-mix(in srgb, var(--accent) 14%, transparent); font-weight: 600; }
.tk-nav.drop { background: color-mix(in srgb, var(--accent) 22%, transparent); outline: 2px dashed var(--accent); outline-offset: -2px; }
.tk-nav-ic { width: 22px; height: 22px; border-radius: 7px; display: grid; place-items: center; color: #fff; flex: 0 0 auto; }
.tk-nav-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tk-n { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.tk-n.od { color: #fff; background: #e5484d; border-radius: 999px; padding: 0 7px; font-weight: 700; }
.tk-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex: 0 0 auto; }
.tk-nav .tk-dot { margin: 0 6px; }

.tk-main { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; }
.tk-head { display: flex; align-items: center; gap: 10px; padding: 16px 22px 6px; }
.tk-title { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.2; display: flex; align-items: center; gap: 9px; }
.tk-sub { color: var(--muted); font-size: 13px; }
.tk-qa { margin: 6px 22px 0; display: flex; align-items: center; gap: 9px; background: color-mix(in srgb, var(--text) 5%, transparent); border: 1px solid transparent; border-radius: 11px; padding: 0 12px; min-height: 44px; color: var(--accent); }
.tk-qa:focus-within { border-color: color-mix(in srgb, var(--accent) 55%, transparent); background: var(--surface); }
.tk-qa input { flex: 1; min-width: 0; border: none; background: none; outline: none; color: var(--text); font: inherit; font-size: 14.5px; }
.tk-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 7px 22px 2px; min-height: 34px; font-size: 12.5px; color: var(--muted); }
.tk-chip { display: inline-flex; align-items: center; gap: 5px; background: var(--surface-2); color: var(--text); border-radius: 999px; padding: 2px 10px; white-space: nowrap; }
.tk-chip.def { background: none; border: 1px dashed var(--border); color: var(--muted); }
.tk-chips .grow { flex: 1; }
.tk-scroll { flex: 1; overflow-y: auto; min-height: 0; padding: 2px 14px 80px; }
.tk-grp { margin-top: 10px; border-radius: 12px; transition: background .12s; }
.tk-grp.drop { background: color-mix(in srgb, var(--accent) 10%, transparent); outline: 2px dashed color-mix(in srgb, var(--accent) 55%, transparent); }
.tk-gh { display: flex; align-items: baseline; gap: 8px; padding: 8px 8px 5px; border-bottom: 1px solid var(--border); margin-bottom: 2px; }
.tk-gh b { font-size: 15px; display: inline-flex; align-items: center; gap: 7px; }
.tk-gh.od b { color: #e5484d; }
.tk-gh .s { color: var(--muted); font-size: 12.5px; }
.tk-ga { margin-left: auto; border: none; background: none; color: var(--accent); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; padding: 4px 8px; border-radius: 7px; }
.tk-ga:hover { background: color-mix(in srgb, var(--accent) 10%, transparent); }
.tk-empty { color: var(--muted); font-size: 13px; padding: 7px 10px 9px; }
.tk-grp.compact .tk-empty { padding: 4px 10px 6px; font-size: 12.5px; }
.tk-collapse { border: none; background: none; color: var(--muted); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; padding: 10px 8px; display: inline-flex; gap: 6px; align-items: center; border-radius: 8px; }
.tk-collapse:hover { color: var(--text); }

.tk-row { display: flex; align-items: flex-start; gap: 11px; padding: 8px 10px; border-radius: 10px; cursor: pointer; transition: opacity .3s, transform .3s, background .12s; outline: none; }
.tk-row:hover { background: color-mix(in srgb, var(--text) 4%, transparent); }
.tk-row:focus-visible { box-shadow: inset 0 0 0 2px var(--accent); }
.tk-row.sel { background: color-mix(in srgb, var(--accent) 13%, transparent); }
.tk-row.flash { animation: tk-flash 1.4s ease-out; }
@keyframes tk-flash { from { background: color-mix(in srgb, var(--accent) 30%, transparent); } to { background: transparent; } }
.tk-row.leaving { opacity: .3; transform: translateX(6px); }
.tk-row.dragging { opacity: .4; }
.tk-ck { flex: 0 0 auto; width: 22px; height: 22px; margin-top: 1px; border-radius: 50%; border: 2px solid color-mix(in srgb, var(--muted) 65%, transparent); background: none; color: transparent; display: grid; place-items: center; cursor: pointer; padding: 0; transition: background .15s, border-color .15s; position: relative; }
.tk-ck::before { content: ""; position: absolute; inset: -11px; }
.tk-ck:hover { color: var(--muted); }
.tk-ck.p1 { border-color: #0090ff; background: color-mix(in srgb, #0090ff 10%, transparent); }
.tk-ck.p2 { border-color: #f5a524; background: color-mix(in srgb, #f5a524 12%, transparent); }
.tk-ck.p3 { border-color: #e5484d; background: color-mix(in srgb, #e5484d 12%, transparent); }
.tk-ck.done { background: var(--accent); border-color: var(--accent); color: #fff; animation: tk-pop .3s ease-out; }
.tk-ck:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@keyframes tk-pop { 0% { transform: scale(.7); } 60% { transform: scale(1.15); } 100% { transform: scale(1); } }
.tk-rb { flex: 1; min-width: 0; }
.tk-rt { font-size: 14.5px; line-height: 1.35; overflow-wrap: anywhere; }
.tk-row.done .tk-rt { color: var(--muted); text-decoration: line-through; text-decoration-color: color-mix(in srgb, var(--muted) 60%, transparent); }
.tk-rm { display: flex; flex-wrap: wrap; gap: 3px 12px; margin-top: 2px; font-size: 12px; color: var(--muted); }
.tk-rm span { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.tk-rm .is-od { color: #e5484d; font-weight: 600; }
.tk-rm .is-today { color: var(--accent); font-weight: 600; }
.tk-rf { opacity: 0; border: none; background: none; color: var(--muted); cursor: pointer; width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; flex: 0 0 auto; margin-top: -4px; }
.tk-row:hover .tk-rf, .tk-row.sel .tk-rf, .tk-rf:focus-visible { opacity: 1; }
.tk-rf:hover { background: var(--surface-2); color: var(--accent); }
.tk-keys { color: var(--muted); font-size: 12px; padding: 18px 10px 0; }
.tk-keys kbd { font: 600 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--surface-2); border: 1px solid var(--border); border-bottom-width: 2px; border-radius: 5px; padding: 2px 5px; }
.tk-scrim { display: none; }

@media (max-width: 1180px) {
  .tk { flex-direction: column; }
  .tk-lists { width: auto; flex: 0 0 auto; display: flex; gap: 4px; overflow-x: auto; padding: 8px 10px; border-right: none; border-bottom: 1px solid var(--border); }
  .tk-lbl { display: none; }
  .tk-nav { width: auto; flex: 0 0 auto; white-space: nowrap; padding: 6px 10px; }
  .tk-nav-name { overflow: visible; }
  .tk-nav .tk-dot { margin: 0 2px; }
  .tk-keys { display: none; }
}
@media (max-width: 1000px) {
  .tk-scrim { display: block; position: absolute; inset: 0; background: rgba(0,0,0,.25); z-index: 19; }
}
@media (max-width: 860px) {
  .tk-head { padding: 12px 14px 4px; }
  .tk-qa { margin: 4px 14px 0; }
  .tk-chips { padding: 6px 14px 2px; }
  .tk-scroll { padding: 2px 6px 80px; }
  .tk-rf { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .tk-row, .tk-ck { transition: none; }
  .tk-row.flash, .tk-ck.done { animation: none; }
}
`

const LIST_META = {
  today: { name: 'Today', icon: Star, color: '#f5a524' },
  upcoming: { name: 'Upcoming', icon: Calendar, color: '#e5484d' },
  all: { name: 'All tasks', icon: TasksIcon, color: '#0090ff' },
  done: { name: 'Completed', icon: CheckCircle, color: '#8e8e93' },
}

function Meta({ t, group, projects, list, now }) {
  const bits = []
  if (t.due) {
    const n = TM.dayDiff(t.due, now)
    const cls = t.done ? '' : n < 0 ? 'is-od' : n === 0 ? 'is-today' : ''
    const label = group.sameDay ? (t.time || '') : TM.dayLabel(t.due, now) + (t.time ? ' ' + t.time : '')
    if (label) bits.push(<span key="d" className={cls}>{!group.sameDay && <Calendar width={12} height={12} />}{label}</span>)
  }
  if (t.repeat) bits.push(<span key="r" title={TM.REPEATS[t.repeat]}><Loop width={12} height={12} />{TM.REPEATS[t.repeat].replace('Every ', '')}</span>)
  if (t.steps.length) bits.push(<span key="s" title="Steps done"><TasksIcon width={12} height={12} />{t.steps.filter((s) => s.done).length}/{t.steps.length}</span>)
  if (t.notes) bits.push(<span key="n" title="Has notes"><Text width={12} height={12} /></span>)
  if (t.noteId) bits.push(<span key="l" title="Linked note"><Notepad width={12} height={12} /></span>)
  if (t.reminder && t.due && !t.done) bits.push(<span key="b" title={TM.REMINDERS[t.reminder]}><Bell width={12} height={12} /></span>)
  if (t.focus) bits.push(<span key="f" title="Focus sessions"><Timer width={12} height={12} />{t.focus}</span>)
  const p = !group.hideProject && t.projectId && projects.find((x) => x.id === t.projectId)
  if (p) bits.push(<span key="p"><i className="tk-dot" style={{ background: projectColor(projects, p.id), width: 7, height: 7 }} />{p.name}</span>)
  if (list === 'done' && t.due) bits.push(<span key="w">was due {TM.dayLabel(t.due, now).toLowerCase()}</span>)
  return bits.length ? <div className="tk-rm">{bits}</div> : null
}

export default function TasksView({
  tasks, projects, notes, now, initialList = 'today', onListChange, select, onSelectHandled, suspendKeys,
  onAdd, onUpdate, onComplete, onDelete, onMoveOverdue, onFocus, onOpenNote, onMenu, onToast,
}) {
  const validList = (l) => TM.LISTS.includes(l) || (typeof l === 'string' && l.startsWith('p:') && projects.some((p) => 'p:' + p.id === l))
  const [list, setListState] = useState(validList(initialList) ? initialList : 'today')
  const [sel, setSel] = useState(null)
  const [keep, setKeep] = useState(() => new Set())
  const [flash, setFlash] = useState(null)
  const [showDone, setShowDone] = useState(false)
  const [qa, setQa] = useState('')
  const [dropAt, setDropAt] = useState(null)
  const [dragId, setDragId] = useState(null)
  const qaRef = useRef(null)
  const scrollRef = useRef(null)

  const setList = (l) => { setListState(l); setSel(null); setShowDone(false); onListChange?.(l) }
  useEffect(() => { if (!validList(list)) setList('today') /* project deleted */ }, [projects]) // eslint-disable-line

  const groups = useMemo(() => TM.groupTasks(tasks, list, { now, projects, keep, showDone }), [tasks, list, now, projects, keep, showDone])
  const c = useMemo(() => TM.counts(tasks, now), [tasks, now])
  const selTask = sel && tasks.find((t) => t.id === sel)
  const parsed = useMemo(() => (qa.trim() ? TM.parseTaskQuickAdd(qa, now, projects) : null), [qa, now, projects])
  const defaults = TM.listDefaults(list, now)

  // Selected task disappeared (deleted, or ticked and gone) -> close details.
  useEffect(() => { if (sel && !tasks.some((t) => t.id === sel)) setSel(null) }, [tasks, sel])
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(null), 1500); return () => clearTimeout(t) }, [flash])

  // Requests from elsewhere (Home, Calendar) to show a task.
  useEffect(() => {
    if (!select) return
    const t = tasks.find((x) => x.id === select.id)
    if (t) {
      const home = TM.homeList(t, now)
      if (!TM.inList(t, list, now)) { setListState(home); onListChange?.(home) }
      setSel(t.id); setFlash(t.id)
    }
    onSelectHandled?.()
  }, [select && select.n]) // eslint-disable-line
  useEffect(() => {
    if (!flash) return
    const el = scrollRef.current?.querySelector(`[data-task="${flash}"]`)
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [flash, list])

  const tick = (t) => {
    if (!t.done && list !== 'done') {
      setKeep((k) => new Set(k).add(t.id))
      setTimeout(() => setKeep((k) => { const n = new Set(k); n.delete(t.id); return n }), 900)
    } else if (t.done && list === 'done') {
      setKeep((k) => new Set(k).add(t.id))
      setTimeout(() => setKeep((k) => { const n = new Set(k); n.delete(t.id); return n }), 900)
    }
    if (sel === t.id && !t.done) setSel(null)
    onComplete(t.id)
  }

  const submit = () => {
    if (!parsed || !parsed.text) return
    const fields = { ...defaults, ...parsed }
    const t = onAdd(fields)
    setQa('')
    if (!t) return
    setFlash(t.id)
    if (!TM.inList(t, list, now)) {
      const home = TM.homeList(t, now)
      onToast({
        title: 'Added to ' + LIST_META[home].name + (home === 'upcoming' ? ' · ' + TM.dayLabel(t.due, now) : ''),
        body: t.text, icon: 'check',
        action: { label: 'Show', run: () => { setListState(home); onListChange?.(home); setSel(t.id); setFlash(t.id) } },
      })
    }
  }

  const applyDrop = (id, target) => {
    const t = tasks.find((x) => x.id === id)
    if (!t || !target) return
    if ('due' in target && t.due !== target.due) {
      onUpdate(id, { due: target.due }, { undo: 'Moved to ' + TM.dayLabel(target.due, now) })
      setFlash(id)
    } else if ('projectId' in target && t.projectId !== target.projectId) {
      const p = projects.find((x) => x.id === target.projectId)
      onUpdate(id, { projectId: target.projectId }, { undo: p ? 'Moved to ' + p.name : 'Removed from its project' })
      setFlash(id)
    }
  }
  const dropProps = (key, target) => (target ? {
    onDragOver: (e) => { if (isTaskDrag(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropAt(key) } },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropAt((d) => (d === key ? null : d)) },
    onDrop: (e) => { if (!isTaskDrag(e)) return; e.preventDefault(); setDropAt(null); applyDrop(e.dataTransfer.getData(TASK_DRAG), target) },
  } : {})

  // Keyboard: N new, ↑/↓ move, X or Space complete, T due today, 0–3 priority, Delete, Esc.
  useEffect(() => {
    const onKey = (e) => {
      if (suspendKeys || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target
      if (/^(input|textarea|select)$/i.test(el.tagName || '') || el.isContentEditable) return
      const k = e.key
      // A focused button, link or option keeps its own keys (Space/Enter press it); only Esc passes through.
      if (k !== 'Escape' && el.closest && el.closest('button, a, [role="radio"], [role="switch"], [role="option"]')) return
      // Keys act on the row that has focus, else on the selected task.
      const focusedRow = el.closest && el.closest('[data-task]')
      if (k === 'n' || k === 'N') { e.preventDefault(); qaRef.current?.focus(); return }
      if (k === 'ArrowDown' || k === 'ArrowUp') {
        const ids = [...(scrollRef.current?.querySelectorAll('[data-task]:not(.leaving)') || [])].map((r) => r.dataset.task)
        if (!ids.length) return
        e.preventDefault()
        let i = ids.indexOf(sel)
        i = k === 'ArrowDown' ? Math.min(ids.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1)
        setSel(ids[i])
        const row = scrollRef.current?.querySelector(`[data-task="${ids[i]}"]`)
        row?.focus?.({ preventScroll: true })
        row?.scrollIntoView?.({ block: 'nearest' })
        return
      }
      if (k === 'Escape' && sel) { e.preventDefault(); setSel(null); return }
      const target = focusedRow ? focusedRow.dataset.task : sel
      const t = target && tasks.find((x) => x.id === target)
      if (!t) return
      if (k === 'x' || k === 'X' || k === ' ') { e.preventDefault(); tick(t) }
      else if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); onDelete(t.id) }
      else if (k === 't' || k === 'T') { e.preventDefault(); onUpdate(t.id, { due: dateKey(now) }, { undo: 'Due today' }) }
      else if (/^[0-3]$/.test(k)) { e.preventDefault(); onUpdate(t.id, { priority: +k }) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const head = (() => {
    if (LIST_META[list]) {
      const m = LIST_META[list]
      const sub = list === 'today' ? TM.longDate(dateKey(now)) + (c.overdue ? ` · ${c.overdue} overdue` : '')
        : list === 'upcoming' ? 'The next 7 days, then later'
          : list === 'all' ? `${c.all} open, by project`
            : 'Newest first. Tick a circle to bring a task back.'
      return { title: m.name, sub, color: null }
    }
    const p = projects.find((x) => 'p:' + x.id === list)
    const done = tasks.filter((t) => t.done && t.projectId === p?.id).length
    return { title: p?.name || 'Project', sub: `${c.proj[p?.id] || 0} open · ${done} done`, color: p ? projectColor(projects, p.id) : null }
  })()

  const nav = (id, label, icon, color, n, od) => {
    const Icon = icon
    const target = id === 'today' ? { due: dateKey(now) } : id.startsWith('p:') ? { projectId: id.slice(2) } : null
    return (
      <button key={id} className={'tk-nav' + (list === id ? ' on' : '') + (dropAt === 'nav:' + id ? ' drop' : '')}
        onClick={() => setList(id)} aria-current={list === id ? 'page' : undefined} {...dropProps('nav:' + id, target)}>
        {Icon ? <span className="tk-nav-ic" style={{ background: color }}><Icon width={13} height={13} /></span> : <i className="tk-dot" style={{ background: color }} />}
        <span className="tk-nav-name">{label}</span>
        {n ? <span className={'tk-n' + (od ? ' od' : '')}>{n}</span> : null}
      </button>
    )
  }

  return (
    <div className="tk">
      <style>{CSS}</style>
      <nav className="tk-lists" aria-label="Task lists">
        <div className="tk-lbl">Lists</div>
        {nav('today', 'Today', Star, LIST_META.today.color, c.today, c.overdue > 0)}
        {nav('upcoming', 'Upcoming', Calendar, LIST_META.upcoming.color, c.upcoming)}
        {nav('all', 'All tasks', TasksIcon, LIST_META.all.color, c.all)}
        {nav('done', 'Completed', CheckCircle, LIST_META.done.color, 0)}
        {projects.length > 0 && <div className="tk-lbl">Projects</div>}
        {projects.map((p) => nav('p:' + p.id, p.name, null, projectColor(projects, p.id), c.proj[p.id]))}
        <div className="tk-keys">
          <div><kbd>N</kbd> new · <kbd>↑</kbd><kbd>↓</kbd> move</div>
          <div style={{ marginTop: 6 }}><kbd>X</kbd> done · <kbd>T</kbd> today</div>
          <div style={{ marginTop: 6 }}><kbd>0</kbd>–<kbd>3</kbd> priority</div>
        </div>
      </nav>

      <section className="tk-main">
        <div className="tk-head">
          <button className="nm-iconbtn nm-mobile-back" onClick={onMenu} aria-label="Menu" title="Menu"><SidebarLeft width={20} height={20} /></button>
          <div>
            <h2 className="tk-title">{head.color && <i className="tk-dot" style={{ background: head.color, width: 12, height: 12 }} />}{head.title}</h2>
            <div className="tk-sub">{head.sub}</div>
          </div>
        </div>
        <label className="tk-qa" title="Add a task (N)">
          <Plus width={18} height={18} />
          <input ref={qaRef} value={qa} onChange={(e) => setQa(e.target.value)} aria-label="Add a task"
            placeholder="Add a task. Try: Call Ana fri 18:00 !high #project"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } else if (e.key === 'Escape') { setQa(''); e.currentTarget.blur() } }} />
        </label>
        <div className="tk-chips" aria-live="polite">
          {!parsed ? (
            <><Sparkles width={13} height={13} /><span>Understands</span>
              {['tomorrow', 'fri 16:00', '12.10.', '!high', '#project', 'every week'].map((x) => <span key={x} className="tk-chip">{x}</span>)}</>
          ) : (
            <>
              <span className="tk-chip">{parsed.text ? <b style={{ fontWeight: 600 }}>{parsed.text}</b> : <i>type a title</i>}</span>
              {(parsed.due || defaults.due) && (
                <span className={'tk-chip' + (parsed.due ? '' : ' def')}><Calendar width={12} height={12} />
                  {TM.dayLabel(parsed.due || defaults.due, now)}{parsed.time ? ' ' + parsed.time : ''}{parsed.due ? '' : ' (this list)'}</span>
              )}
              {parsed.priority > 0 && <span className="tk-chip"><Flag width={12} height={12} style={{ color: TM.PRIORITY_COLOR[parsed.priority] }} />{TM.PRIORITIES[parsed.priority].label}</span>}
              {(parsed.projectId || defaults.projectId) && (() => {
                const pid = parsed.projectId || defaults.projectId
                return <span className={'tk-chip' + (parsed.projectId ? '' : ' def')}><i className="tk-dot" style={{ background: projectColor(projects, pid), width: 7, height: 7 }} />{projects.find((p) => p.id === pid)?.name}</span>
              })()}
              {parsed.repeat && <span className="tk-chip"><Loop width={12} height={12} />{TM.REPEATS[parsed.repeat]}</span>}
              <span className="grow" />
              <span>Enter to add</span>
            </>
          )}
        </div>

        <div className="tk-scroll" ref={scrollRef}>
          {groups.map((g) => (
            <div key={g.id} className={'tk-grp' + (g.compact ? ' compact' : '') + (dropAt === 'g:' + g.id ? ' drop' : '')} {...dropProps('g:' + g.id, g.drop)}>
              {g.count != null ? (
                <button className="tk-collapse" onClick={() => setShowDone((v) => !v)} aria-expanded={!g.collapsed}>
                  {g.collapsed ? <ChevronRight width={14} height={14} /> : <ChevronDown width={14} height={14} />} Completed · {g.count}
                </button>
              ) : (
                <div className={'tk-gh' + (g.tone ? ' ' + g.tone : '')}>
                  <b>{g.project && <i className="tk-dot" style={{ background: projectColor(projects, g.project) }} />}{g.title}</b>
                  {g.sub && <span className="s">{g.sub}</span>}
                  {g.action === 'movetoday' && <button className="tk-ga" onClick={onMoveOverdue}>Move all to today</button>}
                </div>
              )}
              {g.items.length === 0 && g.empty && <div className="tk-empty">{g.empty}</div>}
              {g.items.map((t) => (
                <div key={t.id} data-task={t.id} tabIndex={0} draggable
                  className={'tk-row' + (t.done ? ' done' : '') + (sel === t.id ? ' sel' : '') + (keep.has(t.id) ? ' leaving' : '') + (flash === t.id ? ' flash' : '') + (dragId === t.id ? ' dragging' : '')}
                  onClick={() => setSel(sel === t.id ? null : t.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) setSel(t.id) }}
                  onDragStart={(e) => { e.dataTransfer.setData(TASK_DRAG, t.id); e.dataTransfer.effectAllowed = 'move'; setDragId(t.id) }}
                  onDragEnd={() => { setDragId(null); setDropAt(null) }}>
                  <button className={'tk-ck' + (t.done ? ' done' : ' p' + t.priority)} aria-label={(t.done ? 'Mark not done: ' : 'Complete: ') + t.text}
                    onClick={(e) => { e.stopPropagation(); tick(t) }}><Check width={13} height={13} /></button>
                  <div className="tk-rb">
                    <div className="tk-rt">{t.text || 'Untitled task'}</div>
                    <Meta t={t} group={g} projects={projects} list={list} now={now} />
                  </div>
                  {!t.done && (
                    <button className="tk-rf" title="Focus on this" aria-label={'Focus on ' + t.text} onClick={(e) => { e.stopPropagation(); onFocus(t.id) }}>
                      <PlayTriangle width={14} height={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {selTask && <div className="tk-scrim" onClick={() => setSel(null)} />}
      {selTask && (
        <TaskDetail key={selTask.id} task={selTask} projects={projects} notes={notes} now={now}
          onClose={() => setSel(null)}
          onUpdate={(patch) => onUpdate(selTask.id, patch)}
          onComplete={() => tick(selTask)}
          onDelete={() => onDelete(selTask.id)}
          onFocus={() => onFocus(selTask.id)}
          onOpenNote={onOpenNote} />
      )}
    </div>
  )
}
