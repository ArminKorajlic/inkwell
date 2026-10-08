// Small shared helpers: ids and calendar days. Days are 'YYYY-MM-DD' keys in
// local time, which is how notes, tasks, events and the focus log store them.

export const uid = () =>
  (globalThis.crypto?.randomUUID?.() || 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2))

export const pad2 = (n) => String(n).padStart(2, '0')
export const dateKey = (d = new Date()) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
export const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d) }
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
export const dayDiff = (key, now = new Date()) => Math.round((parseKey(key) - startOfDay(now)) / 86400000)

/* A day relative to today, in one of three widths:
 *   long:    Today · Tomorrow · Yesterday · Friday · Wed 14 Oct
 *   short:   Today · Tomorrow · Fri · 14 Oct            (side panels)
 *   compact: Today · Tmrw · Mon · 12 Oct                (narrow time columns, past days too) */
export function relDay(key, now = new Date(), style = 'long') {
  const n = dayDiff(key, now)
  const d = parseKey(key)
  if (n === 0) return 'Today'
  if (n === 1) return style === 'compact' ? 'Tmrw' : 'Tomorrow'
  if (style === 'long') {
    if (n === -1) return 'Yesterday'
    if (n > 1 && n < 7) return d.toLocaleDateString([], { weekday: 'long' })
    return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
  }
  const near = style === 'compact' ? n > -7 && n < 7 : n > 1 && n < 7
  if (near) return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' })
}
