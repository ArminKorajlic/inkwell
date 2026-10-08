import React, { useEffect, useRef, useState } from 'react'
import { Paperclip, Download, Trash, XCrossed, ImageSquare } from '@openai/apps-sdk-ui/components/Icon'
import { attachmentDataUrl, downloadAttachment, fmtBytes } from './media.js'

// Event attachments field + a shared full-screen image viewer (Lightbox).

const CSS = `
.nm-att-list { display: flex; flex-direction: column; gap: 6px; }
.nm-att { display: flex; align-items: center; gap: 4px; border: 1px solid var(--border); border-radius: 10px; padding: 6px 6px 6px 8px; background: var(--surface); }
.nm-att-main { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; border: none; background: none; color: var(--text); cursor: pointer; text-align: left; padding: 0; font-family: inherit; }
.nm-att-thumb { width: 40px; height: 40px; object-fit: cover; border-radius: 7px; flex: 0 0 auto; }
.nm-att-icon { width: 40px; height: 40px; border-radius: 7px; background: var(--surface-2); display: inline-flex; align-items: center; justify-content: center; color: var(--muted); flex: 0 0 auto; }
.nm-att-meta { display: flex; flex-direction: column; min-width: 0; }
.nm-att-name { font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nm-att-size { font-size: 12px; color: var(--muted); }
.nm-att-add { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; }
.nm-lightbox { position: fixed; inset: 0; z-index: 70; background: rgba(0,0,0,.82); display: flex; align-items: center; justify-content: center; padding: 28px; cursor: zoom-out; }
.nm-lightbox img { max-width: 100%; max-height: 100%; border-radius: 8px; box-shadow: 0 10px 40px rgba(0,0,0,.5); cursor: default; background: #fff; }
.nm-lightbox-close { position: absolute; top: 16px; right: 16px; width: 40px; height: 40px; border-radius: 50%; border: none; background: rgba(255,255,255,.15); color: #fff; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.nm-lightbox-close:hover { background: rgba(255,255,255,.25); }
`

export function Lightbox({ url, name, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="nm-lightbox" onClick={onClose} role="dialog" aria-label={name || 'Image'}>
      <style>{CSS}</style>
      <img src={url} alt={name || ''} onClick={(e) => e.stopPropagation()} />
      <button className="nm-lightbox-close" onClick={onClose} aria-label="Close"><XCrossed width={20} height={20} /></button>
    </div>
  )
}

function Thumb({ att }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let alive = true
    if (att.isImage) attachmentDataUrl(att.ref).then((u) => { if (alive) setUrl(u) }).catch(() => {})
    return () => { alive = false }
  }, [att.ref, att.isImage])
  if (att.isImage && url) return <img className="nm-att-thumb" src={url} alt="" />
  return (
    <span className="nm-att-icon">
      {att.isImage ? <ImageSquare width={18} height={18} /> : <Paperclip width={18} height={18} />}
    </span>
  )
}

export default function Attachments({ items, busy, onAdd, onRemove, onError }) {
  const inputRef = useRef(null)
  const [view, setView] = useState(null)

  const open = async (att) => {
    try {
      if (!att.isImage) { await downloadAttachment(att); return }
      const url = await attachmentDataUrl(att.ref)
      if (!url) throw new Error('That file is no longer available')
      setView({ url, name: att.name })
    } catch (err) { onError?.(err.message) }
  }
  const save = async (att) => {
    try { await downloadAttachment(att) } catch (err) { onError?.(err.message) }
  }

  return (
    <div className="nm-field">
      <style>{CSS}</style>
      <label>Attachments</label>
      {items.length > 0 && (
        <div className="nm-att-list">
          {items.map((att) => (
            <div key={att.id} className="nm-att">
              <button className="nm-att-main" onClick={() => open(att)} title={att.isImage ? 'View' : 'Download'}>
                <Thumb att={att} />
                <span className="nm-att-meta">
                  <span className="nm-att-name">{att.name}</span>
                  <span className="nm-att-size">{fmtBytes(att.size || 0)}</span>
                </span>
              </button>
              <button className="nm-iconbtn" title="Download" aria-label={'Download ' + att.name} onClick={() => save(att)}><Download width={16} height={16} /></button>
              <button className="nm-iconbtn nm-tbtn-danger" title="Remove" aria-label={'Remove ' + att.name} onClick={() => onRemove(att)}><Trash width={15} height={15} /></button>
            </div>
          ))}
        </div>
      )}
      <input ref={inputRef} type="file" multiple hidden
        onChange={(e) => { const files = [...(e.target.files || [])]; e.target.value = ''; if (files.length) onAdd(files) }} />
      <button className="nm-btn-ghost nm-att-add" onClick={() => inputRef.current?.click()} disabled={busy}>
        <Paperclip width={14} height={14} /> {busy ? 'Attaching…' : 'Attach files'}
      </button>
      {view && <Lightbox url={view.url} name={view.name} onClose={() => setView(null)} />}
    </div>
  )
}
