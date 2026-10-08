import React, { useEffect, useRef, useState } from 'react'
import { Undo, Trash } from '@openai/apps-sdk-ui/components/Icon'
import { Sketch } from './drawing.js'

// Drawing pad: one pen with a few colors and sizes, undo, clear.
// Saves a PNG blob through onSave; opens an existing drawing via baseUrl.

export const DRAW_W = 960
export const DRAW_H = 600

const COLORS = [
  { c: '#1d1d1f', n: 'Black' },
  { c: '#e5484d', n: 'Red' },
  { c: '#f5a524', n: 'Orange' },
  { c: '#30a46c', n: 'Green' },
  { c: '#0090ff', n: 'Blue' },
  { c: '#8e4ec6', n: 'Purple' },
]
const SIZES = [{ s: 2, n: 'Fine' }, { s: 4, n: 'Medium' }, { s: 9, n: 'Bold' }]

const CSS = `
.nm-draw-scrim { z-index: 50; }
.nm-draw {
  width: 100%; max-width: 1000px; background: var(--bg); border: 1px solid var(--border);
  border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,.35);
  display: flex; flex-direction: column; max-height: 96%; overflow: hidden;
}
.nm-draw-bar { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
.nm-draw-title { font-weight: 700; font-size: 16px; margin-right: 4px; }
.nm-draw-group { display: flex; gap: 6px; align-items: center; }
.nm-swatch { width: 26px; height: 26px; border-radius: 50%; border: 2px solid transparent; background: var(--sw); cursor: pointer; box-shadow: inset 0 0 0 2px var(--bg); padding: 0; }
.nm-swatch.on { border-color: var(--text); }
.nm-swatch:focus-visible, .nm-size:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.nm-size { width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0; }
.nm-size span { border-radius: 50%; background: var(--text); display: block; }
.nm-size.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 18%, transparent); }
.nm-draw-stage { padding: 14px; background: var(--surface-2); display: flex; justify-content: center; align-items: center; min-height: 0; flex: 1; overflow: auto; }
.nm-draw-canvas {
  width: min(100%, calc((100vh - 230px) * 1.6)); aspect-ratio: 960 / 600; height: auto;
  background: #fff; border-radius: 10px; box-shadow: 0 1px 4px rgba(0,0,0,.18);
  touch-action: none; cursor: crosshair; display: block;
}
.nm-draw-err { color: #e5484d; font-size: 13px; }
.nm-iconbtn:disabled { opacity: .35; cursor: default; }
.nm-iconbtn:disabled:hover { background: none; color: var(--muted); }
`

export default function DrawPad({ baseUrl, onCancel, onSave }) {
  const canvasRef = useRef(null)
  const sketchRef = useRef(null)
  const [color, setColor] = useState(COLORS[0].c)
  const [size, setSize] = useState(4)
  const [strokes, setStrokes] = useState(0)
  const [hasBase, setHasBase] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [baseReady, setBaseReady] = useState(false)   // an existing drawing must load before it can be saved over

  useEffect(() => {
    const s = new Sketch(canvasRef.current, { width: DRAW_W, height: DRAW_H })
    sketchRef.current = s
    if (baseUrl) {
      const img = new Image()
      img.onload = () => { s.setBase(img); setHasBase(true); setBaseReady(true) }
      img.onerror = () => setError('Couldn’t load this drawing, so it can’t be edited right now.')
      img.src = baseUrl
    }
  }, [baseUrl])

  const undo = () => { const s = sketchRef.current; if (!s) return; s.undo(); setStrokes(s.strokes.length) }
  const clear = () => { const s = sketchRef.current; if (!s) return; s.clear(); setStrokes(0); setHasBase(false) }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel()
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* capture is best-effort */ }
    const s = sketchRef.current
    s.color = color
    s.size = size
    s.begin(s.pointFromEvent(e))
  }
  const onMove = (e) => {
    const s = sketchRef.current
    if (!s || !s.active) return
    const coalesced = e.nativeEvent.getCoalescedEvents ? e.nativeEvent.getCoalescedEvents() : []
    for (const ev of coalesced.length ? coalesced : [e.nativeEvent]) s.extend(s.pointFromEvent(ev))
  }
  const onUp = () => {
    const s = sketchRef.current
    if (!s || !s.active) return
    s.end()
    setStrokes(s.strokes.length)
  }

  const save = async () => {
    const s = sketchRef.current
    if (!s || s.isEmpty()) { onCancel(); return }
    setSaving(true)
    setError('')
    try {
      await onSave(await s.toBlob())
    } catch (err) {
      setError(err?.message || 'Could not save the drawing')
      setSaving(false)
    }
  }

  return (
    <div className="nm-modal-scrim nm-draw-scrim">
      <style>{CSS}</style>
      <div className="nm-draw" role="dialog" aria-label={baseUrl ? 'Edit drawing' : 'New drawing'}>
        <div className="nm-draw-bar">
          <span className="nm-draw-title">{baseUrl ? 'Edit drawing' : 'New drawing'}</span>
          <div className="nm-draw-group" role="radiogroup" aria-label="Pen color">
            {COLORS.map((x) => (
              <button key={x.c} className={'nm-swatch' + (color === x.c ? ' on' : '')} style={{ '--sw': x.c }}
                title={x.n} aria-label={x.n} aria-checked={color === x.c} role="radio" onClick={() => setColor(x.c)} />
            ))}
          </div>
          <div className="nm-draw-group" role="radiogroup" aria-label="Pen size">
            {SIZES.map((x) => (
              <button key={x.s} className={'nm-size' + (size === x.s ? ' on' : '')} title={x.n}
                aria-label={x.n + ' pen'} aria-checked={size === x.s} role="radio" onClick={() => setSize(x.s)}>
                <span style={{ width: x.s + 3, height: x.s + 3 }} />
              </button>
            ))}
          </div>
          <div className="nm-spacer" />
          <button className="nm-iconbtn" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!strokes} onClick={undo}><Undo width={18} height={18} /></button>
          <button className="nm-iconbtn" title="Clear" aria-label="Clear drawing" disabled={!strokes && !hasBase} onClick={clear}><Trash width={17} height={17} /></button>
        </div>
        <div className="nm-draw-stage">
          <canvas ref={canvasRef} className="nm-draw-canvas"
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
            onPointerCancel={onUp} onLostPointerCapture={onUp} />
        </div>
        <div className="nm-modal-foot">
          {error && <span className="nm-draw-err">{error}</span>}
          <div className="nm-spacer" />
          <button className="nm-btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="nm-btn-primary" onClick={save} disabled={saving || (!!baseUrl && !baseReady)}
            title={baseUrl && !baseReady ? 'Waiting for the drawing to load' : undefined}>
            {saving ? 'Saving…' : baseUrl ? 'Save drawing' : 'Insert drawing'}
          </button>
        </div>
      </div>
    </div>
  )
}
