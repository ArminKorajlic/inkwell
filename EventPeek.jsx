import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { XCrossed, Bell, Clock, Folder, Paperclip, Notepad, Text } from '@openai/apps-sdk-ui/components/Icon'
import { projectColor, fmtRange, fmtDuration, durationMin, fmtLead, parseKey } from './cal-model.js'
import { attachmentDataUrl, downloadAttachment } from './media.js'

// Place a floating card next to an anchor rect (fixed position); on phones it
// becomes a bottom sheet.
function usePlacement(ref, rect) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const W = window.innerWidth, H = window.innerHeight
    if (W < 720 || !rect) {
      if (W < 720) { el.classList.add('sheet'); el.style.left = ''; el.style.top = ''; return }
      el.classList.remove('sheet')
      el.style.left = Math.max(12, (W - el.offsetWidth) / 2) + 'px'
      el.style.top = Math.max(12, (H - el.offsetHeight) / 3) + 'px'
      return
    }
    el.classList.remove('sheet')
    const pw = el.offsetWidth, ph = el.offsetHeight
    let left = rect.right + 10
    if (left + pw > W - 12) left = rect.left - pw - 10
    if (left < 12) left = Math.min(Math.max(12, rect.left), W - pw - 12)
    let top = rect.top - 8
    if (left === Math.min(Math.max(12, rect.left), W - pw - 12)) {
      if (rect.bottom + ph + 20 < H) top = rect.bottom + 8
      else if (rect.top - ph - 8 >= 12) top = rect.top - ph - 8
    }
    top = Math.min(Math.max(12, top), H - ph - 12)
    el.style.left = left + 'px'
    el.style.top = top + 'px'
  })
}

const whenLabel = (e) => {
  const d = parseKey(e.date).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })
  return e.allDay ? `${d} · All day` : `${d} · ${fmtRange(e)} (${fmtDuration(durationMin(e))})`
}

export function EventPeek({ ev, projects, notes, rect, onClose, onEdit, onDelete, onOpenNote, loadNoteExcerpt, onViewImage, onError }) {
  const ref = useRef(null)
  const [note, setNote] = useState(null)
  usePlacement(ref, rect)
  useEffect(() => { ref.current?.focus() }, [ev.id])
  useEffect(() => {
    let alive = true
    setNote(null)
    if (ev.noteId) loadNoteExcerpt(ev.noteId).then((n) => { if (alive) setNote(n) }).catch(() => {})
    return () => { alive = false }
  }, [ev.noteId])
  const color = projectColor(projects, ev.projectId)
  const project = projects.find((p) => p.id === ev.projectId)
  const linked = ev.noteId && notes.find((n) => n.id === ev.noteId && !n.deletedAt)
  const openFile = async (att) => {
    try {
      if (att.isImage) {
        const url = await attachmentDataUrl(att.ref)
        if (!url) throw new Error('That file is no longer available')
        onViewImage(url, att.name)
      } else await downloadAttachment(att)
    } catch (err) { onError?.(err.message) }
  }
  return (
    <div ref={ref} className="pk" role="dialog" aria-label={ev.title} tabIndex={-1} style={{ '--c': color }}>
      <div className="pk-head">
        <span className="pk-sw" />
        <div className="pk-title">{ev.title}</div>
        <button className="nm-iconbtn" aria-label="Close" onClick={onClose}><XCrossed width={16} height={16} /></button>
      </div>
      <div className="pk-when">{whenLabel(ev)}</div>
      <div className="pk-rows">
        <div className="pk-row"><span className="k"><Folder width={15} height={15} /></span><span>{project ? project.name : 'No project'}</span></div>
        {ev.remind && <div className="pk-row"><span className="k"><Bell width={15} height={15} /></span><span>{fmtLead(ev.remindLead || 0)}</span></div>}
        {ev.details && <div className="pk-row"><span className="k"><Text width={15} height={15} /></span><span className="pk-details">{ev.details}</span></div>}
        {linked && (
          <div className="pk-row">
            <span className="k"><Notepad width={15} height={15} /></span>
            <button className="pk-note" onClick={() => onOpenNote(ev.noteId)} title="Open note">
              <b>{note?.title || linked.title || 'Untitled'}</b>
              <span>{note ? (note.text || 'This note is empty.') : 'Loading…'}</span>
            </button>
          </div>
        )}
        {ev.attachments?.length > 0 && (
          <div className="pk-row">
            <span className="k"><Paperclip width={15} height={15} /></span>
            <div className="pk-files">
              {ev.attachments.map((a) => (
                <button key={a.id} className="pk-file" onClick={() => openFile(a)} title={a.isImage ? 'View' : 'Download'}>{a.name}</button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="pk-actions">
        <button className="nm-btn-ghost nm-small nm-tbtn-danger" onClick={() => onDelete(ev)}>Delete</button>
        <button className="nm-btn-primary nm-small" onClick={() => onEdit(ev)}>Edit</button>
      </div>
    </div>
  )
}

export function QuickCard({ draft, projects, rect, onCancel, onSave, onMore }) {
  const ref = useRef(null)
  const inputRef = useRef(null)
  const [title, setTitle] = useState(draft.title || '')
  const [projectId, setProjectId] = useState(draft.projectId || null)
  usePlacement(ref, rect)
  useEffect(() => { inputRef.current?.focus() }, [])
  const when = parseKey(draft.date).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }) +
    (draft.allDay ? ' · All day' : ` · ${draft.time}–${draft.end}`)
  const color = projectColor(projects, projectId)
  return (
    <div ref={ref} className="pk qc" role="dialog" aria-label="New event" style={{ '--c': color }}>
      <div className="pk-head">
        <span className="pk-sw" />
        <div className="pk-title">New event</div>
        <button className="nm-iconbtn" aria-label="Close" onClick={onCancel}><XCrossed width={16} height={16} /></button>
      </div>
      <div className="pk-when"><Clock width={13} height={13} /> {when}</div>
      <input ref={inputRef} className="qc-title" placeholder="Add a title" value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSave(title, projectId) } }} />
      <div className="qc-projects" role="radiogroup" aria-label="Project">
        {[{ id: null, name: 'No project' }, ...projects].map((p) => (
          <button key={p.id || 'none'} role="radio" aria-checked={projectId === p.id}
            className={'qc-proj' + (projectId === p.id ? ' on' : '')} style={{ '--c': projectColor(projects, p.id) }}
            onClick={() => setProjectId(p.id)}>
            <span className="cal-dot" style={{ background: projectColor(projects, p.id) }} />{p.name}
          </button>
        ))}
      </div>
      <div className="pk-actions">
        <button className="nm-btn-ghost nm-small" onClick={() => onMore(title, projectId)}>More options</button>
        <button className="nm-btn-primary nm-small" onClick={() => onSave(title, projectId)}>Save</button>
      </div>
    </div>
  )
}
