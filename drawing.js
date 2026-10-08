// Freehand pen engine for the drawing pad: smooth strokes, undo, clear, export.
// Coordinates are in logical units (width x height); the backing canvas is
// scaled by the device pixel ratio (capped at 2) so lines stay crisp.

export class Sketch {
  constructor(canvas, { width, height, background = '#ffffff', ratio } = {}) {
    this.canvas = canvas
    this.w = width
    this.h = height
    this.bg = background
    this.ratio = Math.min(ratio || (typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2)
    canvas.width = Math.round(width * this.ratio)
    canvas.height = Math.round(height * this.ratio)
    this.ctx = canvas.getContext('2d')
    this.strokes = []
    this.active = null
    this.base = null
    this.color = '#1d1d1f'
    this.size = 4
    this.redraw()
  }

  setBase(image) { this.base = image; this.redraw() }
  isEmpty() { return !this.base && this.strokes.length === 0 }

  pointFromEvent(e) {
    const r = this.canvas.getBoundingClientRect()
    return { x: (e.clientX - r.left) * (this.w / r.width), y: (e.clientY - r.top) * (this.h / r.height) }
  }

  begin(pt) {
    this.active = { color: this.color, size: this.size, points: [pt] }
    this.strokes.push(this.active)
    this._dot(this.active, pt)
  }

  extend(pt) {
    const s = this.active
    if (!s) return
    const pts = s.points
    const last = pts[pts.length - 1]
    if (Math.hypot(pt.x - last.x, pt.y - last.y) < 0.75) return
    pts.push(pt)
    this._segment(s, pts.length - 1)
  }

  end() {
    const s = this.active
    if (!s) return
    const pts = s.points
    if (pts.length > 1) this._tail(s)
    this.active = null
  }

  undo() { if (this.strokes.length) { this.strokes.pop(); this.redraw() } }
  clear() { this.strokes = []; this.base = null; this.active = null; this.redraw() }

  redraw() {
    const ctx = this.ctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = this.bg
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    if (this.base) ctx.drawImage(this.base, 0, 0, this.canvas.width, this.canvas.height)
    for (const s of this.strokes) this._full(s)
  }

  toBlob() {
    return new Promise((resolve, reject) =>
      this.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not save the drawing'))), 'image/png'))
  }

  /* ---- rendering: midpoint quadratic smoothing, identical live and on redraw ---- */
  _begin(s) {
    const ctx = this.ctx
    ctx.save()
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0)
    ctx.strokeStyle = s.color
    ctx.fillStyle = s.color
    ctx.lineWidth = s.size
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    return ctx
  }
  _dot(s, p) {
    const ctx = this._begin(s)
    ctx.beginPath()
    ctx.arc(p.x, p.y, s.size / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  _segment(s, i) {
    const pts = s.points
    const ctx = this._begin(s)
    ctx.beginPath()
    if (i === 1) {
      ctx.moveTo(pts[0].x, pts[0].y)
      ctx.lineTo((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2)
    } else {
      const a = pts[i - 2], b = pts[i - 1], c = pts[i]
      ctx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2)
      ctx.quadraticCurveTo(b.x, b.y, (b.x + c.x) / 2, (b.y + c.y) / 2)
    }
    ctx.stroke()
    ctx.restore()
  }
  _tail(s) {
    const pts = s.points
    const n = pts.length
    const ctx = this._begin(s)
    ctx.beginPath()
    ctx.moveTo((pts[n - 2].x + pts[n - 1].x) / 2, (pts[n - 2].y + pts[n - 1].y) / 2)
    ctx.lineTo(pts[n - 1].x, pts[n - 1].y)
    ctx.stroke()
    ctx.restore()
  }
  _full(s) {
    const pts = s.points
    this._dot(s, pts[0])
    if (pts.length === 1) return
    for (let i = 1; i < pts.length; i++) this._segment(s, i)
    this._tail(s)
  }
}
