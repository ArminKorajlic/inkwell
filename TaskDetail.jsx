import React, { useEffect, useRef, useState } from 'react'
import { Check, XCrossed, PlayTriangle, Trash, Flag, Notepad } from '@openai/apps-sdk-ui/components/Icon'
import * as TM from './task-model.js'
import { projectColor } from './cal-model.js'
import { uid, dateKey } from './util.js'

// The details panel beside the task list (a side sheet on narrow screens, a
// bottom sheet on phones). Every change saves as it's made; typed text saves
// after a short pause, on blur, and when the panel closes.

const CSS = `
.td { width: 360px; flex: 0 0 360px; border-left: 1px solid var(--border); background: var(--surface); overflow-y: auto; padding: 14px 16px 22px; min-height: 0; }
.td-top { display: flex; gap: 10px; align-items: flex-start; }
.td-title { flex: 1; min-width: 0; border: none; background: none; outline: none; resize: none; color: var(--text); font: inherit; font-size: 18px; font-weight: 650; line-height: 1.3; padding: 2px 0; field-sizing: content; min-height: 28px; }
.td-title:focus-visible { box-shadow: 0 2px 0 var(--accent); }
.td .tk-ck { width: 24px; height: 24px; margin-top: 2px; }
.td-sec { margin-top: 18px; }
.td-lbl { display: flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; }
.td-lbl span { margin-left: auto; text-transform: none; letter-spacing: 0; font-weight: 600; }
.td-when { display: flex; gap: 6px; }
.td-inp { border: 1px solid var(--border); background: var(--bg); color: var(--text); border-radius: 9px; min-height: 38px; padding: 0 10px; font: inherit; font-size: 13.5px; min-width: 0; }
.td-inp:focus-visible { outline: 2px solid var(--accent); outline-offset: 0; }
.td-inp:disabled { opacity: .5; }
.td-when .td-inp:first-child { flex: 1; }
.td-quick { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
.td-quick button { border: 1px solid var(--border); background: var(--bg); color: var(--text); font: inherit; border-radius: 999px; padding: 3px 11px; font-size: 12.5px; cursor: pointer; min-height: 30px; }
.td-quick button:hover { background: var(--surface-2); }
.td-quick button.on { border-color: var(--accent); color: var(--accent); font-weight: 600; }
.td-grid { display: grid; grid-template-columns: 84px 1fr; gap: 8px 10px; align-items: center; margin-top: 18px; }
.td-grid .td-lbl { margin: 0; }
.td-grid select.td-inp { width: 100%; cursor: pointer; }
.td-pri { display: flex; background: var(--surface-2); border-radius: 9px; padding: 3px; gap: 2px; }
.td-pri button { flex: 1; border: none; background: none; color: var(--muted); font: inherit; border-radius: 7px; padding: 5px 0; font-size: 12.5px; font-weight: 600; cursor: pointer; min-height: 30px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; }
.td-pri button.on { background: var(--bg); color: var(--text); box-shadow: 0 1px 3px rgba(0,0,0,.14); }
.td-bar { height: 4px; border-radius: 2px; background: var(--surface-2); overflow: hidden; margin: 2px 0 6px; }
.td-bar i { display: block; height: 100%; background: #30a46c; transition: width .25s; }
.td-step { display: flex; align-items: center; gap: 9px; padding: 3px 2px; border-radius: 7px; }
.td-step .tk-ck { width: 18px; height: 18px; border-width: 1.5px; margin: 0; }
.td-step input { flex: 1; min-width: 0; border: none; background: none; color: var(--text); font: inherit; font-size: 14px; padding: 4px 0; outline: none; }
.td-step input:focus-visible { box-shadow: 0 1.5px 0 var(--accent); }
.td-step.done input { color: var(--muted); text-decoration: line-through; }
.td-x { opacity: 0; border: none; background: none; color: var(--muted); cursor: pointer; width: 28px; height: 28px; border-radius: 7px; display: grid; place-items: center; }
.td-step:hover .td-x, .td-x:focus-visible { opacity: 1; }
.td-x:hover { background: var(--surface-2); color: #e5484d; }
.td-add { width: 100%; margin-top: 4px; }
textarea.td-inp { width: 100%; padding: 9px 10px; resize: vertical; min-height: 92px; line-height: 1.45; }
.td-link { display: flex; gap: 6px; align-items: center; }
.td-link select { flex: 1; }
.td-foot { display: flex; gap: 8px; align-items: center; margin-top: 20px; flex-wrap: wrap; }
.td-meta { color: var(--muted); font-size: 12px; margin-top: 12px; }
.td-close { border: none; background: none; color: var(--muted); cursor: pointer; width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; flex: 0 0 auto; margin-top: -3px; }
.td-close:hover { background: var(--surface-2); color: var(--text); }
@media (max-width: 1000px) {
  .td { position: absolute; right: 0; top: 0; bottom: 0; z-index: 20; box-shadow: -12px 0 40px rgba(0,0,0,.22); }
}
@media (max-width: 720px) {
  .td { left: 0; top: auto; width: auto; max-height: 86%; border-left: none; border-top: 1px solid var(--border); border-radius: 18px 18px 0 0; box-shadow: 0 -12px 40px rgba(0,0,0,.25); }
  .td-x { opacity: .7; }
}
`

// Typed text: local while typing, saved after a pause, on blur, and on close.
function useDraft(value, save, delay = 500) {
  const [draft, setDraft] = useState(value)
  const timer = useRef(null)
  const latest = useRef({ draft: value, saved: value, save })
  latest.current.save = save
  useEffect(() => { if (value !== latest.current.saved) { latest.current.saved = value; latest.current.draft = value; setDraft(value) } }, [value])
  const flush = () => {
    clearTimeout(timer.current)
    const L = latest.current
    if (L.draft !== L.saved) { L.saved = L.draft; L.save(L.draft) }
  }
  useEffect(() => () => flush(), []) // eslint-disable-line
  const change = (v) => { setDraft(v); latest.current.draft = v; clearTimeout(timer.current); timer.current = setTimeout(flush, delay) }
  return [draft, change, flush]
}

export default function TaskDetail({ task: t, projects, notes, now, onClose, onUpdate, onComplete, onDelete, onFocus, onOpenNote }) {
  const [title, setTitle, flushTitle] = useDraft(t.text, (v) => onUpdate({ text: v.replace(/\n/g, ' ').trim() || 'Untitled task' }))
  const [body, setBody, flushBody] = useDraft(t.notes, (v) => onUpdate({ notes: v }))
  const [step, setStep] = useState('')
  const stepRef = useRef(null)
  const stepsDone = t.steps.filter((s) => s.done).length
  const today = dateKey(now)
  const liveNotes = (notes || []).filter((n) => !n.deletedAt).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  const linked = t.noteId && (notes || []).find((n) => n.id === t.noteId)

  const setDue = (due) => onUpdate(due ? { due } : { due: null, time: null, reminder: null })
  const setSteps = (steps) => onUpdate({ steps })
  const addStep = () => {
    const v = step.trim()
    if (!v) return
    setSteps([...t.steps, { id: uid(), text: v, done: false }])
    setStep('')
    stepRef.current?.focus()
  }
  // Esc is handled by TasksView (which also respects open dialogs).

  return (
    <aside className="td" aria-label="Task details">
      <style>{CSS}</style>
      <div className="td-top">
        <button className={'tk-ck' + (t.done ? ' done' : ' p' + t.priority)} onClick={onComplete} aria-label={t.done ? 'Mark not done' : 'Complete task'}>
          <Check width={13} height={13} />
        </button>
        <textarea className="td-title" rows={1} value={title} aria-label="Task title"
          onChange={(e) => setTitle(e.target.value)} onBlur={flushTitle}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }} />
        <button className="td-close" onClick={() => { flushTitle(); flushBody(); onClose() }} aria-label="Close details" title="Close (Esc)"><XCrossed width={16} height={16} /></button>
      </div>

      <div className="td-sec">
        <div className="td-lbl">When</div>
        <div className="td-when">
          <input className="td-inp" type="date" value={t.due || ''} aria-label="Due date" onChange={(e) => setDue(e.target.value || null)} />
          <input className="td-inp" type="time" value={t.time || ''} aria-label="Time" disabled={!t.due} title={t.due ? '' : 'Pick a day first'}
            onChange={(e) => onUpdate({ time: e.target.value || null })} />
        </div>
        <div className="td-quick">
          <button className={t.due === today ? 'on' : ''} onClick={() => setDue(today)}>Today</button>
          <button className={t.due === TM.shiftKey(today, 1) ? 'on' : ''} onClick={() => setDue(TM.shiftKey(today, 1))}>Tomorrow</button>
          <button className={t.due === TM.nextMonday(now) ? 'on' : ''} onClick={() => setDue(TM.nextMonday(now))}>Next week</button>
          {t.due && <button onClick={() => setDue(null)}>No date</button>}
        </div>
      </div>

      <div className="td-grid">
        <span className="td-lbl">Priority</span>
        <div className="td-pri" role="radiogroup" aria-label="Priority">
          {TM.PRIORITIES.map((p) => (
            <button key={p.v} role="radio" aria-checked={t.priority === p.v} className={t.priority === p.v ? 'on' : ''} onClick={() => onUpdate({ priority: p.v })}>
              {p.v > 0 && <Flag width={11} height={11} style={{ color: TM.PRIORITY_COLOR[p.v] }} />}{p.short}
            </button>
          ))}
        </div>
        <span className="td-lbl">Project</span>
        <select className="td-inp" value={t.projectId || ''} aria-label="Project" onChange={(e) => onUpdate({ projectId: e.target.value || null })}
          style={{ borderLeft: `4px solid ${projectColor(projects, t.projectId)}` }}>
          <option value="">No project</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <span className="td-lbl">Repeat</span>
        <select className="td-inp" value={t.repeat || ''} aria-label="Repeat"
          onChange={(e) => onUpdate(e.target.value ? { repeat: e.target.value, due: t.due || today } : { repeat: null })}>
          <option value="">Never</option>
          {Object.entries(TM.REPEATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="td-lbl">Remind</span>
        <select className="td-inp" value={t.reminder || ''} aria-label="Reminder" disabled={!t.due} title={t.due ? '' : 'Give the task a day first'}
          onChange={(e) => onUpdate({ reminder: e.target.value || null })}>
          <option value="">No reminder</option>
          {Object.entries(TM.REMINDERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="td-sec">
        <div className="td-lbl">Steps {t.steps.length > 0 && <span>{stepsDone} of {t.steps.length}</span>}</div>
        {t.steps.length > 0 && <div className="td-bar"><i style={{ width: Math.round(100 * stepsDone / t.steps.length) + '%' }} /></div>}
        {t.steps.map((s, i) => (
          <div key={s.id || i} className={'td-step' + (s.done ? ' done' : '')}>
            <button className={'tk-ck' + (s.done ? ' done' : '')} aria-label={(s.done ? 'Untick ' : 'Tick ') + s.text}
              onClick={() => setSteps(t.steps.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}><Check width={11} height={11} /></button>
            <input defaultValue={s.text} aria-label="Step"
              onBlur={(e) => { const v = e.target.value.trim(); if (!v) setSteps(t.steps.filter((_, j) => j !== i)); else if (v !== s.text) setSteps(t.steps.map((x, j) => (j === i ? { ...x, text: v } : x))) }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); stepRef.current?.focus() } }} />
            <button className="td-x" aria-label={'Remove step ' + s.text} onClick={() => setSteps(t.steps.filter((_, j) => j !== i))}><XCrossed width={13} height={13} /></button>
          </div>
        ))}
        <input ref={stepRef} className="td-inp td-add" value={step} placeholder="+ Add a step, press Enter" aria-label="Add a step"
          onChange={(e) => setStep(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStep() } }} />
      </div>

      <div className="td-sec">
        <div className="td-lbl">Notes</div>
        <textarea className="td-inp" value={body} placeholder="Details, links, anything…" aria-label="Notes"
          onChange={(e) => setBody(e.target.value)} onBlur={flushBody} />
      </div>

      <div className="td-sec">
        <div className="td-lbl">Linked note</div>
        <div className="td-link">
          <select className="td-inp" value={t.noteId || ''} aria-label="Linked note" onChange={(e) => onUpdate({ noteId: e.target.value || null })}>
            <option value="">No linked note</option>
            {t.noteId && (!linked || linked.deletedAt) && <option value={t.noteId}>{linked ? (linked.title?.trim() || 'Untitled') + ' (in Recently Deleted)' : '(note no longer exists)'}</option>}
            {liveNotes.map((n) => <option key={n.id} value={n.id}>{n.title?.trim() || 'Untitled'}</option>)}
          </select>
          {linked && !linked.deletedAt && (
            <button className="nm-btn-ghost nm-small" onClick={() => { flushTitle(); flushBody(); onOpenNote(linked.id) }}><Notepad width={14} height={14} /> Open</button>
          )}
        </div>
      </div>

      <div className="td-foot">
        {!t.done && <button className="nm-btn-primary nm-small" onClick={onFocus}><PlayTriangle width={13} height={13} /> Focus on this</button>}
        <span style={{ flex: 1 }} />
        <button className="nm-btn-ghost nm-small nm-tbtn-danger" onClick={onDelete}><Trash width={14} height={14} /> Delete</button>
      </div>
      <div className="td-meta">
        Created {new Date(t.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short' })}
        {t.completedAt ? ' · completed ' + new Date(t.completedAt).toLocaleDateString([], { day: 'numeric', month: 'short' }) : ''}
        {t.focus ? ` · ${t.focus} focus session${t.focus > 1 ? 's' : ''}` : ''}
      </div>
    </aside>
  )
}
