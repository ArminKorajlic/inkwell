// Pure note-list logic (no React, no storage) so it can be tested on its own.
// Index entries: { id, title, projectId, snippet, createdAt, updatedAt, pinned?, deletedAt? }

export const TRASH_DAYS = 30
const DAY = 86400000

export const liveNotes = (index) => index.filter((r) => !r.deletedAt)
export const trashedNotes = (index) => index.filter((r) => r.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt)
export const expiredTrash = (index, now = Date.now()) =>
  index.filter((r) => r.deletedAt && now - r.deletedAt > TRASH_DAYS * DAY)
export const daysLeft = (r, now = Date.now()) =>
  Math.max(0, Math.ceil((r.deletedAt + TRASH_DAYS * DAY - now) / DAY))

const collator = typeof Intl !== 'undefined' ? new Intl.Collator(undefined, { sensitivity: 'base', numeric: true }) : null
const titleKey = (r) => (r.title || '').trim()

export const SORTS = [
  { id: 'edited', label: 'Date edited' },
  { id: 'created', label: 'Date created' },
  { id: 'title', label: 'Title' },
]

export function sortNotes(rows, sort = 'edited') {
  let by
  if (sort === 'created') by = (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
  else if (sort === 'title') {
    by = (a, b) => {
      const ta = titleKey(a), tb = titleKey(b)
      if (!ta !== !tb) return ta ? -1 : 1          // untitled notes go last
      return collator ? collator.compare(ta, tb) : ta.localeCompare(tb)
    }
  } else by = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
  return [...rows].sort(by)
}

// What the note list shows. Without a query: pinned section + the rest, both in
// the chosen order. With a query: one result list, title matches first, matching
// title or body text (texts: { [id]: plainText }).
export function listNotes(index, { sel = 'all', query = '', sort = 'edited', texts = null } = {}) {
  let rows = liveNotes(index)
  if (sel !== 'all') rows = rows.filter((r) => r.projectId === sel)
  const q = query.trim().toLowerCase()
  if (!q) {
    const sorted = sortNotes(rows, sort)
    return { pinned: sorted.filter((r) => r.pinned), others: sorted.filter((r) => !r.pinned), matches: null }
  }
  const matches = new Map()
  for (const r of rows) {
    const inTitle = (r.title || 'Untitled').toLowerCase().includes(q)
    const text = (texts && texts[r.id]) || r.snippet || ''
    const inBody = text.toLowerCase().includes(q)
    if (inTitle || inBody) matches.set(r.id, { inTitle, inBody })
  }
  const results = sortNotes(rows.filter((r) => matches.has(r.id)), sort)
  results.sort((a, b) => Number(matches.get(b.id).inTitle) - Number(matches.get(a.id).inTitle)) // stable
  return { pinned: [], others: results, matches }
}

// A short excerpt around the first match, split so the UI can highlight it.
export function matchSnippet(text, query, radius = 36) {
  const q = (query || '').trim()
  if (!text || !q) return null
  const at = text.toLowerCase().indexOf(q.toLowerCase())
  if (at < 0) return null
  const start = Math.max(0, at - radius)
  const end = Math.min(text.length, at + q.length + radius)
  return {
    before: (start > 0 ? '…' : '') + text.slice(start, at),
    match: text.slice(at, at + q.length),
    after: text.slice(at + q.length, end) + (end < text.length ? '…' : ''),
  }
}

// Plain text of a note body, with spaces between blocks so words don't merge.
export function htmlToText(html, max = 5000) {
  if (!html) return ''
  const div = document.createElement('div')
  div.innerHTML = String(html).replace(/<\/(p|div|li|h1|h2|td|th|tr|blockquote|pre)>|<br\s*\/?>/gi, ' $&')
  return (div.textContent || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

/* ---------------- focus log: { 'YYYY-MM-DD': { sessions, minutes } } ---------------- */
export const focusOn = (log, key) => (log && log[key]) || { sessions: 0, minutes: 0 }
export function addFocusSession(log, key, minutes, keepDays = 120) {
  const next = { ...(log || {}) }
  const e = next[key] || { sessions: 0, minutes: 0 }
  next[key] = { sessions: e.sessions + 1, minutes: e.minutes + minutes }
  const keys = Object.keys(next).sort()
  while (keys.length > keepDays) delete next[keys.shift()]
  return next
}

/* ---------------- list metadata (kept in index.json, so the list never opens bodies) ---------------- */
// Bump when noteMeta gains fields; older entries are refreshed in the background.
export const META_VERSION = 1

// From a note body: first image (thumbnail), checklist progress, linked note ids, word count.
export function noteMeta(html) {
  const div = document.createElement('div')
  div.innerHTML = html || ''
  const img = div.querySelector('img[data-img]')
  const items = div.querySelectorAll('ul.nm-check > li')
  const done = div.querySelectorAll('ul.nm-check > li[data-checked="true"]').length
  const links = [...new Set([...div.querySelectorAll('a.nm-nlink[data-note]')].map((a) => a.getAttribute('data-note')))]
  const text = htmlToText(html, 1e6)
  return {
    thumb: img ? img.getAttribute('data-img') : null,
    checks: items.length ? [done, items.length] : null,
    links,
    words: text ? text.split(' ').length : 0,
    mv: META_VERSION,
  }
}

// Notes that link to `id`.
export const backlinks = (index, id) => liveNotes(index).filter((r) => r.id !== id && (r.links || []).includes(id))

// Date sections like Apple Notes: Today, Yesterday, Previous 7 days, Previous 30
// days, then month names (with the year when it isn't this year). `rows` must
// already be sorted newest first by `field`.
export function dateSections(rows, field, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const label = (ts) => {
    if (!ts) return 'Older'
    const days = Math.floor((start - new Date(ts).setHours(0, 0, 0, 0)) / DAY) // 0 = today
    if (days <= 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days <= 7) return 'Previous 7 days'
    if (days <= 30) return 'Previous 30 days'
    const d = new Date(ts)
    return d.toLocaleDateString([], d.getFullYear() === now.getFullYear() ? { month: 'long' } : { month: 'long', year: 'numeric' })
  }
  const out = []
  for (const r of rows) {
    const t = label(r[field])
    if (!out.length || out[out.length - 1].title !== t) out.push({ title: t, items: [] })
    out[out.length - 1].items.push(r)
  }
  return out
}
