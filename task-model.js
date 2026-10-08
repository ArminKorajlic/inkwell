// Pure task logic (no React, no storage): normalization, smart-list grouping,
// repeat rollover, reminders, labels, and the plain-words quick-add parser.
//
// Task shape (tasks.json):
//   { id, text, done, projectId, createdAt (ms), completedAt (ms|null),
//     due: 'YYYY-MM-DD'|null, time: 'HH:MM'|null, priority: 0-3, notes,
//     steps: [{id,text,done}], repeat: null|'daily'|'weekdays'|'weekly'|'monthly',
//     reminder: null|'at'|'m10'|'h1'|'morning', firedAt (ms|null),
//     noteId: string|null, focus: number (completed focus sessions) }
// Tasks written before dates existed load as undated tasks with no priority.

import { dateKey, parseKey, addDays, startOfDay, dayDiff, relDay } from './util.js'
import { toHM, readDate, readClock, readProject } from './cal-model.js'

export const PRIORITIES = [
  { v: 0, label: 'None', short: 'None' },
  { v: 1, label: 'Low', short: 'Low' },
  { v: 2, label: 'Medium', short: 'Med' },
  { v: 3, label: 'High', short: 'High' },
]
export const PRIORITY_COLOR = { 1: '#0090ff', 2: '#f5a524', 3: '#e5484d' }
export const REPEATS = { daily: 'Every day', weekdays: 'Every weekday', weekly: 'Every week', monthly: 'Every month' }
export const REMINDERS = { at: 'At the task’s time', m10: '10 min before', h1: '1 hour before', morning: '9:00 that morning' }
export const LISTS = ['today', 'upcoming', 'all', 'done']

/* ---------------- shape ---------------- */
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
let stepSeq = 0
export function normalizeTask(t) {
  const due = typeof t.due === 'string' && DAY_RE.test(t.due) ? t.due : null
  const repeat = REPEATS[t.repeat] ? t.repeat : null
  return {
    id: t.id, text: String(t.text || ''), done: !!t.done, projectId: t.projectId || null,
    createdAt: t.createdAt || Date.now(), completedAt: t.completedAt || null,
    due, time: due && typeof t.time === 'string' && TIME_RE.test(t.time) ? t.time : null,
    priority: [0, 1, 2, 3].includes(t.priority) ? t.priority : 0,
    notes: String(t.notes || ''),
    // Steps are objects with stable ids (rows are keyed by id).
    steps: Array.isArray(t.steps) ? t.steps.filter((x) => x && typeof x === 'object')
      .map((x) => ({ id: x.id || 'st-' + (t.id || '') + '-' + (stepSeq++), text: String(x.text || ''), done: !!x.done })) : [],
    repeat,
    // Monthly repeats remember their day of the month, so the 31st doesn't drift to the 28th after February.
    repeatDay: repeat === 'monthly' ? (Number.isInteger(t.repeatDay) ? t.repeatDay : due ? +due.slice(8) : null) : null,
    reminder: due && REMINDERS[t.reminder] ? t.reminder : null,
    firedAt: t.firedAt || null, noteId: t.noteId || null, focus: Number.isFinite(t.focus) ? t.focus : 0,
    // The occurrence that completing this repeating task created (removed again if it is reopened).
    spawnedId: t.spawnedId || null,
  }
}
export const normalizeTasks = (list) => (Array.isArray(list) ? list.filter((t) => t && t.id).map(normalizeTask) : [])

// Edits that change when a task is due re-arm its reminder.
export function applyPatch(t, patch) {
  const merged = { ...t, ...patch }
  // Choosing a new date or turning a monthly repeat on sets the day it repeats on.
  if ('due' in patch || ('repeat' in patch && patch.repeat !== t.repeat)) merged.repeatDay = null
  const next = normalizeTask(merged)
  if (next.due !== t.due || next.time !== t.time || next.reminder !== t.reminder) next.firedAt = null
  return next
}

/* ---------------- dates ---------------- */
export { dayDiff }
export const shiftKey = (key, n) => dateKey(addDays(parseKey(key), n))

export const dayLabel = (key, now = new Date()) => relDay(key, now, 'long')
// Fits a narrow time column: Today, Tmrw, Mon, 12 Oct.
export const compactDay = (key, now = new Date()) => relDay(key, now, 'compact')
export const shortDate = (key) => parseKey(key).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
export const longDate = (key) => parseKey(key).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })
export function nextMonday(now = new Date()) {
  const a = (1 - now.getDay() + 7) % 7 || 7
  return dateKey(addDays(startOfDay(now), a))
}

/* ---------------- repeats ---------------- */
function stepRepeat(key, repeat, day) {
  const d = parseKey(key)
  if (repeat === 'daily') return dateKey(addDays(d, 1))
  if (repeat === 'weekly') return dateKey(addDays(d, 7))
  if (repeat === 'weekdays') {
    let x = addDays(d, 1)
    while (x.getDay() === 0 || x.getDay() === 6) x = addDays(x, 1)
    return dateKey(x)
  }
  if (repeat === 'monthly') {
    const n = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    const last = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate()
    n.setDate(Math.min(day || d.getDate(), last))
    return dateKey(n)
  }
  return null
}
// The next date after `due`, never in the past (an overdue daily task comes back today).
// `day` is a monthly repeat's day of the month.
export function nextDue(due, repeat, now = new Date(), day = null) {
  const today = dateKey(now)
  let k = stepRepeat(due || today, repeat, day)
  for (let i = 0; k && k < today && i < 1000; i++) k = stepRepeat(k, repeat, day)
  return k
}
// Completing a repeating task finishes this one and creates the next occurrence.
export function nextOccurrence(t, newId, now = new Date()) {
  if (!t.repeat) return null
  return normalizeTask({
    ...t, id: newId, done: false, completedAt: null, firedAt: null, focus: 0,
    due: nextDue(t.due, t.repeat, now, t.repeatDay), createdAt: now.getTime(), spawnedId: null,
    steps: t.steps.map((s, i) => ({ ...s, id: newId + '-s' + i, done: false })),
  })
}

/* ---------------- reminders ---------------- */
export function reminderAt(t) {
  if (!t.due || !t.reminder) return null
  const [y, m, d] = t.due.split('-').map(Number)
  const [hh, mm] = (t.reminder === 'morning' ? '09:00' : t.time || '09:00').split(':').map(Number)
  const at = new Date(y, m - 1, d, hh, mm).getTime()
  if (t.reminder === 'm10') return at - 10 * 60000
  if (t.reminder === 'h1') return at - 60 * 60000
  return at
}
// Fire reminders that came due in the last hour and haven't fired yet.
const isDueTask = (t, now) => { const at = reminderAt(t); return !t.done && !t.firedAt && at != null && at <= now && at > now - 3600000 }
export const dueReminder = (tasks, now = Date.now()) => tasks.find((t) => isDueTask(t, now))
export const dueReminders = (tasks, now = Date.now()) => tasks.filter((t) => isDueTask(t, now))

/* ---------------- sorting + grouping ---------------- */
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
// Timed tasks in time order, then untimed by priority, then oldest first.
export const byDay = (a, b) =>
  (a.time && b.time ? cmp(a.time, b.time) : a.time ? -1 : b.time ? 1 : 0) || (b.priority - a.priority) || (a.createdAt - b.createdAt)
export const byDue = (a, b) => cmp(a.due || '9999', b.due || '9999') || byDay(a, b)

export const isOverdue = (t, today) => !t.done && !!t.due && t.due < today

export function counts(tasks, now = new Date()) {
  const today = dateKey(now)
  const open = tasks.filter((t) => !t.done)
  const proj = {}
  for (const t of open) proj[t.projectId || ''] = (proj[t.projectId || ''] || 0) + 1
  return {
    today: open.filter((t) => t.due && t.due <= today).length,
    overdue: open.filter((t) => t.due && t.due < today).length,
    upcoming: open.filter((t) => t.due && t.due > today).length,
    all: open.length,
    done: tasks.length - open.length,
    proj,
  }
}

/* A list is 'today' | 'upcoming' | 'all' | 'done' | 'p:<projectId>'.
 * `keep` holds ids that were just ticked: they stay in place briefly (fading)
 * so the list doesn't jump under the pointer.
 * Each group: { id, title, sub?, tone?, items, drop?: {due}|{projectId}, sameDay?, empty?, action?, collapsed? } */
export function groupTasks(tasks, list, { now = new Date(), projects = [], keep = new Set(), showDone = false } = {}) {
  const today = dateKey(now)
  const open = tasks.filter((t) => !t.done || keep.has(t.id))
  if (list === 'today') {
    const od = open.filter((t) => t.due && t.due < today).sort(byDue)
    const td = open.filter((t) => t.due === today).sort(byDay)
    const g = []
    if (od.length) g.push({ id: 'overdue', title: 'Overdue', tone: 'od', items: od, action: 'movetoday' })
    g.push({ id: 'today', title: 'Today', sub: longDate(today), items: td, drop: { due: today }, sameDay: true,
      empty: od.length ? 'Nothing else is due today.' : 'Nothing due today. Pick something from All tasks, or enjoy the space.' })
    return g
  }
  if (list === 'upcoming') {
    const g = []
    for (let i = 1; i <= 7; i++) {
      const k = shiftKey(today, i)
      g.push({ id: k, title: dayLabel(k, now), sub: i < 7 ? shortDate(k) : '', items: open.filter((t) => t.due === k).sort(byDay),
        drop: { due: k }, sameDay: true, empty: 'No tasks', compact: true })
    }
    const later = shiftKey(today, 7)
    g.push({ id: 'later', title: 'Later', items: open.filter((t) => t.due && t.due > later).sort(byDue), empty: 'Nothing scheduled further out.', compact: true })
    return g
  }
  if (list === 'all') {
    return projects.map((p) => ({ id: p.id, title: p.name, project: p.id, items: open.filter((t) => t.projectId === p.id).sort(byDue),
      drop: { projectId: p.id }, hideProject: true, empty: 'No open tasks', compact: true }))
      .concat([{ id: 'none', title: 'No project', items: open.filter((t) => !t.projectId || !projects.some((p) => p.id === t.projectId)).sort(byDue),
        drop: { projectId: null }, hideProject: true, empty: 'No open tasks', compact: true }])
  }
  if (list === 'done') {
    const done = tasks.filter((t) => t.done || keep.has(t.id)).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
    const yest = shiftKey(today, -1)
    const bucket = (t) => { const k = t.completedAt ? dateKey(new Date(t.completedAt)) : today; return k === today ? 'Today' : k === yest ? 'Yesterday' : 'Earlier' }
    const g = ['Today', 'Yesterday', 'Earlier'].map((title) => ({ id: title, title, items: done.filter((t) => bucket(t) === title) })).filter((x) => x.items.length)
    return g.length ? g : [{ id: 'none', title: 'Completed', items: [], empty: 'Ticked-off tasks land here.' }]
  }
  const pid = list.slice(2)
  const mine = open.filter((t) => t.projectId === pid)
  const g = [
    { id: 'sched', title: 'Scheduled', items: mine.filter((t) => t.due).sort(byDue), hideProject: true, empty: 'No dated tasks.' },
    { id: 'any', title: 'Anytime', items: mine.filter((t) => !t.due).sort((a, b) => (b.priority - a.priority) || (a.createdAt - b.createdAt)), hideProject: true, empty: 'No undated tasks.' },
  ]
  const done = tasks.filter((t) => t.done && t.projectId === pid && !keep.has(t.id)).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
  if (done.length) g.push({ id: 'pdone', title: 'Completed', count: done.length, collapsed: !showDone, items: showDone ? done : [], hideProject: true })
  return g
}

// Which smart list a task lives in, for "Added to Upcoming" messages.
export function homeList(t, now = new Date()) {
  const today = dateKey(now)
  if (t.done) return 'done'
  if (t.due && t.due <= today) return 'today'
  if (t.due) return 'upcoming'
  return 'all'
}
export function inList(t, list, now = new Date()) {
  if (list.startsWith('p:')) return t.projectId === list.slice(2)
  if (list === 'all') return !t.done
  return homeList(t, now) === list
}

// Dated tasks per day, for the calendar and Home.
export function tasksByDate(tasks) {
  const m = {}
  for (const t of tasks) if (t.due) (m[t.due] = m[t.due] || []).push(t)
  for (const k in m) m[k].sort((a, b) => (a.done - b.done) || byDay(a, b))
  return m
}

/* ---------------- quick add ---------------- */
// "Call Ana fri 18:00 !high #personal every week" ->
//   { text, due, time, priority, projectId, repeat } (only what was typed)
export function parseTaskQuickAdd(raw, now = new Date(), projects = []) {
  let t = ' ' + String(raw || '').replace(/\s+/g, ' ') + ' '
  const today = startOfDay(now)
  const o = {}
  let m
  const cut = (s) => { t = t.replace(s, ' ') }

  const p = readProject(t, projects)
  t = p.t
  if (p.projectId) o.projectId = p.projectId
  // priority: !high !med !low, or ! / !! / !!! (low / medium / high)
  if ((m = t.match(/\s!(high|hi|h|medium|med|m|low|lo|l|!!|!)?(?=\s)/i))) {
    const v = (m[1] || '').toLowerCase()
    o.priority = /^(high|hi|h|!!)$/.test(v) ? 3 : /^(medium|med|m|!)$/.test(v) ? 2 : 1
    cut(m[0])
  }
  // repeats
  if ((m = t.match(/\s(?:every\s+day|daily)(?=\s)/i))) { o.repeat = 'daily'; cut(m[0]) }
  else if ((m = t.match(/\s(?:every\s+weekday|weekdays)(?=\s)/i))) { o.repeat = 'weekdays'; cut(m[0]) }
  else if ((m = t.match(/\s(?:every\s+week|weekly)(?=\s)/i))) { o.repeat = 'weekly'; cut(m[0]) }
  else if ((m = t.match(/\s(?:every\s+month|monthly)(?=\s)/i))) { o.repeat = 'monthly'; cut(m[0]) }
  else if ((m = t.match(/\severy\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)(?=\s)/i))) {
    o.repeat = 'weekly'
    t = t.replace(m[0], ' on ' + m[1] + ' ')     // "every friday" also means "starting friday"
  }
  if ((m = t.match(/\stonight(?=\s)/i))) { o.due = dateKey(today); o.time = '20:00'; cut(m[0]) }
  if (!o.due) {
    const d = readDate(t, today)
    t = d.t
    if (d.date) o.due = dateKey(d.date)
  }
  if (!o.time) {
    const c = readClock(t)
    t = c.t
    if (c.min != null) o.time = toHM(c.min)
  }
  // A time with no day means the next time it comes round.
  if (o.time && !o.due) {
    const nowHM = toHM(now.getHours() * 60 + now.getMinutes())
    o.due = dateKey(o.time <= nowHM ? addDays(today, 1) : today)
  }
  if (o.repeat && !o.due) o.due = dateKey(today)
  // A dangling "at/on/by" is only dropped when a date or time was taken out after it.
  const took = o.due || o.time
  o.text = (took ? t.replace(/\s+(at|on|by)\s*$/i, ' ') : t).replace(/\s+/g, ' ').trim()
  return o
}

// What the current list fills in when the typed text doesn't say.
export function listDefaults(list, now = new Date()) {
  if (list === 'today') return { due: dateKey(now) }
  if (list === 'upcoming') return { due: dateKey(addDays(startOfDay(now), 1)) }
  if (list.startsWith('p:')) return { projectId: list.slice(2) }
  return {}
}
