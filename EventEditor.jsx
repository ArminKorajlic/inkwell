import React, { useEffect, useRef, useState } from 'react'
import { XCrossed, Trash, Link } from '@openai/apps-sdk-ui/components/Icon'
import * as CM from './cal-model.js'
import Attachments from './Attachments.jsx'
import { saveAttachment, removeAttachment } from './media.js'

// The full event editor (a modal). It owns the draft while open; the app saves
// or deletes. Attachment files are written as soon as they're picked, so this
// editing session remembers what it uploaded and removed: Cancel deletes the
// new uploads, Save deletes the removed ones.

const REMIND_OPTIONS = [
  ['0', 'At the time of the event'], ['5', '5 minutes before'], ['10', '10 minutes before'],
  ['30', '30 minutes before'], ['60', '1 hour before'], ['1440', '1 day before'],
]

export default function EventEditor({ initial, projects, notes, onSave, onDelete, onClose, onOpenNote, loadNotePreview, onError }) {
  const [draft, setDraft] = useState(initial)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null)       // inline linked-note preview
  const uploaded = useRef([])                        // refs uploaded in this session
  const removed = useRef([])                         // previously saved refs removed in this session
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))

  useEffect(() => { setPreview(null) }, [draft.noteId])

  const closed = useRef(false)
  const close = (saved) => {
    closed.current = true
    ;(saved ? removed.current : uploaded.current).forEach((r) => removeAttachment(r))
    uploaded.current = []
    removed.current = []
    onClose()
  }
  const save = () => {
    const err = CM.validateEvent(draft)
    if (err) { setError(err); return false }
    onSave(draft)
    close(true)
    return true
  }

  // Moving the start keeps the event's length.
  const setStart = (v) => setDraft((prev) => {
    const s = CM.toMin(v)
    if (s == null) return { ...prev, time: v }
    const len = Math.max(15, (CM.toMin(prev.end) ?? 0) - (CM.toMin(prev.time) ?? 0) || 60)
    return { ...prev, time: v, end: CM.toHM(Math.min(s + len, CM.DAY_END)) }
  })
  const toggleAllDay = () => setDraft((prev) => (prev.allDay
    ? { ...prev, allDay: false, time: prev.time || '09:00', end: prev.end || '10:00' }
    : { ...prev, allDay: true }))

  const addFiles = async (files) => {
    setBusy(true)
    for (const f of files) {
      try {
        const att = await saveAttachment(f)
        if (closed.current) { removeAttachment(att.ref); continue }   // the editor closed mid-upload
        uploaded.current.push(att.ref)
        setDraft((prev) => ({ ...prev, attachments: [...(prev.attachments || []), att] }))
      } catch (err) {
        onError('Couldn’t attach ' + (f.name || 'file'), err)
      }
    }
    setBusy(false)
  }
  const removeFile = (att) => {
    setDraft((prev) => ({ ...prev, attachments: (prev.attachments || []).filter((a) => a.id !== att.id) }))
    if (uploaded.current.includes(att.ref)) {
      uploaded.current = uploaded.current.filter((r) => r !== att.ref)
      removeAttachment(att.ref)                    // never saved: drop it now
    } else {
      removed.current.push(att.ref)                // saved before: drop it only if this edit is saved
    }
  }
  const togglePreview = async () => {
    const id = draft.noteId
    if (!id) return
    if (preview && preview.id === id) { setPreview(null); return }
    const { file, meta, title, html } = await loadNotePreview(id)
    setPreview({ id, title, html, missing: !file && !meta })
  }

  const liveNotes = notes.filter((n) => !n.deletedAt)
  const showing = preview && preview.id === draft.noteId
  return (
    <div className="nm-modal-scrim" onClick={() => close(false)}>
      <div className="nm-modal nm-ev-editor" role="dialog" aria-modal="true" aria-label={draft.id ? 'Edit event' : 'New event'} onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape' && !document.querySelector('.nm-lightbox')) close(false) }}>
        <div className="nm-modal-head">
          <span className="nm-modal-title">{draft.id ? 'Edit event' : 'New event'}</span>
          <button className="nm-iconbtn" aria-label="Close" onClick={() => close(false)}><XCrossed width={18} height={18} /></button>
        </div>
        <div className="nm-modal-body">
          <div className="nm-field">
            <label htmlFor="nm-ev-title">Title</label>
            <input id="nm-ev-title" autoFocus value={draft.title} placeholder="What’s happening?"
              onChange={(e) => set({ title: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') save() }} />
          </div>
          <div className="nm-ev-toggle">
            <span>All-day</span>
            <button type="button" role="switch" aria-checked={!!draft.allDay} aria-label="All-day"
              className={'nm-switch' + (draft.allDay ? ' on' : '')} onClick={toggleAllDay} />
          </div>
          <div className="nm-field">
            <label htmlFor="nm-ev-date">Date</label>
            <input id="nm-ev-date" type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} />
          </div>
          {!draft.allDay && (
            <div className="nm-field-row">
              <div className="nm-field">
                <label htmlFor="nm-ev-start">Starts</label>
                <input id="nm-ev-start" type="time" value={draft.time} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="nm-field">
                <label htmlFor="nm-ev-end">Ends</label>
                <input id="nm-ev-end" type="time" value={draft.end} onChange={(e) => set({ end: e.target.value })} />
              </div>
            </div>
          )}
          {!draft.allDay && CM.toMin(draft.end) > CM.toMin(draft.time) && (
            <div className="nm-ev-len">{CM.fmtDuration(CM.toMin(draft.end) - CM.toMin(draft.time))}</div>
          )}
          <div className="nm-field">
            <label htmlFor="nm-ev-remind">Reminder</label>
            <select id="nm-ev-remind" value={draft.remind ? String(draft.remindLead ?? 0) : 'none'}
              onChange={(e) => set({ remind: e.target.value !== 'none', remindLead: e.target.value === 'none' ? (draft.remindLead ?? 10) : Number(e.target.value), firedAt: null })}>
              <option value="none">None</option>
              {REMIND_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </div>
          <div className="nm-field">
            <label>Project</label>
            <div className="nm-ev-projects" role="radiogroup" aria-label="Project">
              {[{ id: null, name: 'No project' }, ...projects].map((p) => {
                const c = CM.projectColor(projects, p.id)
                const on = (draft.projectId || null) === p.id
                return (
                  <button key={p.id || 'none'} type="button" role="radio" aria-checked={on}
                    className={'nm-ev-proj' + (on ? ' on' : '')} style={{ '--c': c }}
                    onClick={() => set({ projectId: p.id })}>
                    <span className="nm-ev-dot" style={{ background: c }} />{p.name}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="nm-field">
            <label htmlFor="nm-ev-details">Details</label>
            <textarea id="nm-ev-details" value={draft.details || ''} onChange={(e) => set({ details: e.target.value })} placeholder="Notes, location, links…" />
          </div>
          <div className="nm-field">
            <label htmlFor="nm-ev-note">Linked note</label>
            <select id="nm-ev-note" value={draft.noteId || ''} onChange={(e) => set({ noteId: e.target.value || null })}>
              <option value="">None</option>
              {liveNotes.map((n) => <option key={n.id} value={n.id}>{n.title?.trim() || 'Untitled'}</option>)}
            </select>
          </div>
          {draft.noteId && notes.some((n) => n.id === draft.noteId) && (
            <div className="nm-field">
              <button className="nm-btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={togglePreview}>
                <Link width={14} height={14} /> {showing ? 'Hide linked note' : 'Show linked note'}
              </button>
              {showing && (
                <div className="nm-note-preview">
                  <div className="nm-note-preview-head">
                    <span className="nm-note-preview-title">{preview.title?.trim() || 'Untitled'}</span>
                    <button className="nm-btn-ghost" style={{ padding: '4px 10px', fontSize: 12.5 }}
                      onClick={() => { const id = draft.noteId; if (save()) onOpenNote(id) }}>Save &amp; open note</button>
                  </div>
                  {preview.missing ? (
                    <div style={{ color: 'var(--muted)', fontSize: 13.5 }}>Could not load this note.</div>
                  ) : (
                    <div className="nm-note-preview-body" dangerouslySetInnerHTML={{ __html: preview.html || '<p style="color:var(--muted)">This note is empty.</p>' }} />
                  )}
                </div>
              )}
            </div>
          )}
          <Attachments items={draft.attachments || []} busy={busy}
            onAdd={addFiles} onRemove={removeFile}
            onError={(m) => onError('Attachment problem', new Error(m))} />
          {error && <div className="nm-ev-error" role="alert">{error}</div>}
        </div>
        <div className="nm-modal-foot">
          {draft.id && <button className="nm-btn-ghost nm-tbtn-danger" onClick={() => onDelete(draft, () => close(false))}><Trash width={15} height={15} /> Delete</button>}
          <div className="nm-spacer" />
          <button className="nm-btn-ghost" onClick={() => close(false)}>Cancel</button>
          <button className="nm-btn-primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  )
}
