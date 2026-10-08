import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { XCrossed, ChevronUp, ChevronDown, Notepad, Calendar, Tasks as TasksIcon, Link } from '@openai/apps-sdk-ui/components/Icon'
import * as ED from './editor-dom.js'

// Small pieces of the note editor: the insert / note-link menu, the link box,
// find in note, and the side panel (Linked from, outline, word count).

// Named STYLE here so `CSS` below is the browser's CSS object (highlights).
const STYLE = `
.nt-pop { position: fixed; z-index: 70; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 14px 40px rgba(0,0,0,.28); padding: 6px; width: 260px; max-height: 320px; overflow-y: auto; }
.nt-pop-h { font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; padding: 4px 8px 6px; }
.nt-pop button { display: flex; align-items: center; gap: 10px; width: 100%; border: none; background: none; color: var(--text); font: inherit; font-size: 13.5px; text-align: left; padding: 7px 8px; border-radius: 8px; cursor: pointer; min-height: 36px; }
.nt-pop button.on, .nt-pop button:hover { background: color-mix(in srgb, var(--accent) 16%, transparent); }
.nt-pop .ic { width: 26px; height: 26px; border-radius: 7px; background: var(--surface-2); display: grid; place-items: center; font-weight: 700; font-size: 12px; flex: 0 0 auto; }
.nt-pop .hint { margin-left: auto; color: var(--muted); font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.nt-pop .empty { color: var(--muted); font-size: 13px; padding: 6px 8px 8px; }
.nt-link { position: fixed; z-index: 70; display: flex; gap: 6px; align-items: center; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 14px 40px rgba(0,0,0,.28); padding: 7px; }
.nt-link input { border: 1px solid var(--border); background: var(--bg); color: var(--text); border-radius: 8px; height: 34px; padding: 0 10px; font: inherit; font-size: 13.5px; width: 240px; }
.nt-find { position: absolute; top: 10px; right: 18px; z-index: 30; display: flex; align-items: center; gap: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.2); padding: 4px 4px 4px 10px; font-size: 13px; }
.nt-find input { border: none; outline: none; background: none; color: var(--text); font: inherit; width: 160px; height: 30px; }
.nt-find .n { color: var(--muted); min-width: 52px; text-align: right; font-variant-numeric: tabular-nums; }
.nt-panel { width: 260px; flex: 0 0 260px; border-left: 1px solid var(--border); background: var(--surface-2); overflow-y: auto; padding: 14px 14px 30px; font-size: 13.5px; min-height: 0; }
.nt-panel h4 { margin: 4px 0 8px; font-size: 11.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); display: flex; align-items: center; }
.nt-panel h4 button { margin-left: auto; }
.nt-bl { display: flex; flex-direction: column; gap: 6px; margin-bottom: 18px; }
.nt-bl button { display: flex; gap: 9px; align-items: flex-start; border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 10px; padding: 8px 10px; text-align: left; cursor: pointer; font: inherit; font-size: 13.5px; }
.nt-bl button:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); }
.nt-bl button svg { flex: 0 0 auto; margin-top: 2px; color: var(--accent); }
.nt-bl small { display: block; color: var(--muted); font-size: 12px; }
.nt-bl b { font-weight: 600; overflow-wrap: anywhere; }
.nt-ol button { display: block; width: 100%; text-align: left; border: none; background: none; color: var(--text); font: inherit; font-size: 13.5px; padding: 5px 8px; border-radius: 7px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nt-ol button.h2 { padding-left: 22px; color: var(--muted); }
.nt-ol button:hover { background: color-mix(in srgb, var(--text) 6%, transparent); }
.nt-empty { color: var(--muted); font-size: 13px; padding: 2px 2px 14px; }
.nt-stats { color: var(--muted); font-size: 12.5px; border-top: 1px solid var(--border); padding-top: 10px; margin-top: 8px; }
::highlight(nt-find) { background: #ffd60a; color: #000; }
::highlight(nt-find-cur) { background: #ff9f0a; color: #000; }
@media (max-width: 1100px) {
  .nt-panel { position: absolute; right: 0; top: 0; bottom: 0; z-index: 25; box-shadow: -12px 0 40px rgba(0,0,0,.22); }
}
`

export { STYLE as CSS }

// Places a fixed box under a caret rectangle, kept inside the window.
function usePlace(rect, width, height = 320) {
  const [pos, setPos] = useState({ top: -999, left: -999 })
  useLayoutEffect(() => {
    if (!rect) return
    const W = window.innerWidth, H = window.innerHeight
    const below = rect.bottom + 6 + height < H
    setPos({ top: below ? rect.bottom + 6 : Math.max(8, rect.top - height - 6), left: Math.max(8, Math.min(rect.left, W - width - 8)) })
  }, [rect && rect.top, rect && rect.left])
  return pos
}

export function InsertMenu({ title, items, active, rect, onPick, onHover }) {
  const pos = usePlace(rect, 260, Math.min(320, 40 + items.length * 40))
  const ref = useRef(null)
  useEffect(() => { ref.current?.querySelector('button.on')?.scrollIntoView?.({ block: 'nearest' }) }, [active])
  return (
    <div className="nt-pop" ref={ref} style={pos} role="listbox" aria-label={title} onMouseDown={(e) => e.preventDefault()}>
      <div className="nt-pop-h">{title}</div>
      {items.length === 0 && <div className="empty">No matches</div>}
      {items.map((it, i) => (
        <button key={it.id} role="option" aria-selected={i === active} className={i === active ? 'on' : ''}
          onMouseEnter={() => onHover(i)} onClick={() => onPick(i)}>
          <span className="ic">{it.icon}</span>{it.label}{it.hint && <span className="hint">{it.hint}</span>}
        </button>
      ))}
    </div>
  )
}

export function LinkPrompt({ rect, onSubmit, onCancel }) {
  const pos = usePlace(rect, 330, 50)
  const [url, setUrl] = useState('')
  const go = () => { const v = url.trim(); if (v) onSubmit(/^(https?:|mailto:)/i.test(v) ? v : 'https://' + v); else onCancel() }
  return (
    <div className="nt-link" style={pos}>
      <Link width={15} height={15} />
      <input autoFocus value={url} placeholder="Paste or type a link" aria-label="Link address" onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); go() } else if (e.key === 'Escape') { e.preventDefault(); onCancel() } }} />
      <button className="nm-btn-primary nm-small" onMouseDown={(e) => e.preventDefault()} onClick={go}>Add link</button>
    </div>
  )
}

// Find in note: highlights every match (CSS Custom Highlight API where the
// browser has it), Enter / Shift+Enter step through, Esc closes.
export function FindBar({ getEditor, version, onClose }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState([])
  const [cur, setCur] = useState(0)
  const canPaint = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined'
  useEffect(() => {
    const r = ED.findRanges(getEditor(), q)
    setHits(r); setCur(0)
  }, [q, version]) // eslint-disable-line
  useEffect(() => {
    if (!canPaint) return
    CSS.highlights.delete('nt-find'); CSS.highlights.delete('nt-find-cur')
    if (hits.length) {
      CSS.highlights.set('nt-find', new Highlight(...hits))
      if (hits[cur]) CSS.highlights.set('nt-find-cur', new Highlight(hits[cur]))
    }
    const r = hits[cur]
    if (r) {
      const el = r.startContainer.parentElement
      el?.scrollIntoView?.({ block: 'center' })
    }
  }, [hits, cur, canPaint])
  useEffect(() => () => { if (canPaint) { CSS.highlights.delete('nt-find'); CSS.highlights.delete('nt-find-cur') } }, [canPaint])
  const step = (d) => setCur((c) => (hits.length ? (c + d + hits.length) % hits.length : 0))
  return (
    <div className="nt-find" role="search">
      <input autoFocus value={q} placeholder="Find in note" aria-label="Find in note" onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1) } else if (e.key === 'Escape') { e.preventDefault(); onClose() }
        }} />
      <span className="n" aria-live="polite">{hits.length ? `${cur + 1} / ${hits.length}` : q ? 'No match' : ''}</span>
      <button className="nm-iconbtn" aria-label="Previous match" onClick={() => step(-1)}><ChevronUp width={15} height={15} /></button>
      <button className="nm-iconbtn" aria-label="Next match" onClick={() => step(1)}><ChevronDown width={15} height={15} /></button>
      <button className="nm-iconbtn" aria-label="Close find" onClick={onClose}><XCrossed width={15} height={15} /></button>
    </div>
  )
}

export function NotePanel({ outline, linkedNotes, linkedTasks, linkedEvents, words, chars, onJump, onOpenNote, onOpenTask, onOpenEvent, onClose }) {
  const none = !linkedNotes.length && !linkedTasks.length && !linkedEvents.length
  return (
    <aside className="nt-panel" aria-label="Note details">
      <h4>Linked from <button className="nm-iconbtn" aria-label="Close panel" title="Close panel" onClick={onClose}><XCrossed width={14} height={14} /></button></h4>
      <div className="nt-bl">
        {linkedNotes.map((n) => (
          <button key={'n' + n.id} onClick={() => onOpenNote(n.id)}><Notepad width={15} height={15} /><span><b>{n.title?.trim() || 'Untitled'}</b><small>Note</small></span></button>
        ))}
        {linkedTasks.map((t) => (
          <button key={'t' + t.id} onClick={() => onOpenTask(t.id)}><TasksIcon width={15} height={15} /><span><b>{t.text}</b><small>Task{t.done ? ' · done' : t.due ? ' · ' + t.dueLabel : ''}</small></span></button>
        ))}
        {linkedEvents.map((e) => (
          <button key={'e' + e.id} onClick={() => onOpenEvent(e)}><Calendar width={15} height={15} /><span><b>{e.title}</b><small>Event · {e.when}</small></span></button>
        ))}
        {none && <div className="nt-empty">Nothing links here yet. Type [[ in another note to link it, or link it from a task or event.</div>}
      </div>
      <h4>Outline</h4>
      <div className="nt-ol">
        {outline.length ? outline.map((h) => (
          <button key={h.i} className={'h' + h.level} onClick={() => onJump(h.i)} title={h.text}>{h.text || 'Untitled heading'}</button>
        )) : <div className="nt-empty">Add headings (type # or ## and a space) to see an outline here.</div>}
      </div>
      <div className="nt-stats">{words} word{words === 1 ? '' : 's'} · {chars} characters · about {Math.max(1, Math.round(words / 220))} min read</div>
    </aside>
  )
}
