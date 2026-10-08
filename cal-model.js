// Pure calendar logic (no React, no storage): event normalization, time math,
// overlap layout for the time grid, and the plain-language quick-add parser.
//
// Event shape: { id, title, date: 'YYYY-MM-DD', allDay, time: 'HH:MM' (start),
//   end: 'HH:MM', details, projectId, noteId, remind, remindLead, firedAt, attachments }

export const PALETTE = ['#7c5cf5', '#f5a524', '#30a46c', '#0090ff', '#e5484d', '#8e4ec6', '#12a594', '#d6409f']
export const NO_PROJECT_COLOR = '#8e8e93'
export const DAY_END = 24 * 60 - 1

import { pad2, dateKey, parseKey, addDays, startOfDay } from './util.js'
export { dateKey, parseKey, addDays, startOfDay }
export const startOfWeek = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7)) // Monday
export const toMin = (t) => { if (!t) return null; const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0) }
export const toHM = (m) => pad2(Math.floor(m / 60)) + ':' + pad2(m % 60)
export const snap = (m, step = 15) => Math.round(m / step) * step

/* ---------------- colours ---------------- */
export function projectColor(projects, projectId) {
  const i = projects.findIndex((p) => p.id === projectId)
  if (i < 0) return NO_PROJECT_COLOR
  return projects[i].color || PALETTE[i % PALETTE.length]
}

/* ---------------- normalization ---------------- */
// Older events only had a start time. Timed events get an end (1 hour by
// default); events without a time become all-day.
const validMin = (t) => { const m = toMin(t); return Number.isFinite(m) && m >= 0 && m < 1440 ? m : null }
export function normalizeEvent(e) {
  const allDay = e.allDay != null ? !!e.allDay : !e.time
  if (allDay) return { ...e, allDay: true, time: '', end: '' }
  const s = Math.min(validMin(e.time) ?? 9 * 60, DAY_END - 15)   // a start at 23:59 still gets some length
  const en = validMin(e.end)
  return { ...e, allDay: false, time: toHM(s), end: en == null || en <= s ? toHM(Math.min(s + 60, DAY_END)) : e.end }
}
export function normalizeEvents(list) {
  let changed = false
  const out = (Array.isArray(list) ? list : []).filter((e) => e && typeof e === 'object' && e.id && /^\d{4}-\d{2}-\d{2}$/.test(e.date || '')).map((e) => {
    const n = normalizeEvent(e)
    if (n.allDay !== e.allDay || n.end !== e.end || n.time !== e.time) changed = true
    return n
  })
  return { list: out, changed: changed || out.length !== (Array.isArray(list) ? list.length : 0) }
}

export function validateEvent(e) {
  if (!e.date) return 'Pick a date.'
  if (!e.allDay) {
    if (!e.time) return 'Add a start time, or make it all-day.'
    if (!e.end) return 'Add an end time.'
    if (toMin(e.end) <= toMin(e.time)) return 'The end time must be after the start time.'
  }
  return null
}

/* ---------------- reminders ---------------- */
// When an event starts (all-day events count from 09:00), and when its reminder is due.
export function eventStart(ev) {
  if (!ev?.date) return 0
  const [y, m, d] = ev.date.split('-').map(Number)
  const [hh, mm] = (ev.allDay || !ev.time ? '09:00' : ev.time).split(':').map(Number)
  return new Date(y, (m || 1) - 1, d, Number.isFinite(hh) ? hh : 9, Number.isFinite(mm) ? mm : 0).getTime()
}
export const eventReminderAt = (ev) => eventStart(ev) - (ev.remindLead || 0) * 60000
// The next upcoming events that have a reminder, soonest first.
export const upcomingReminders = (events, now = Date.now(), limit = 4) =>
  events.filter((e) => e.remind && eventStart(e) >= now).sort((a, b) => eventStart(a) - eventStart(b)).slice(0, limit)
// An event whose reminder is due now (and that hasn't started more than an hour ago).
const isDueEvent = (e, now) => e.remind && !e.firedAt && eventReminderAt(e) <= now && eventStart(e) >= now - 3600000
export const dueEventReminder = (events, now = Date.now()) => events.find((e) => isDueEvent(e, now))
export const dueEventReminders = (events, now = Date.now()) => events.filter((e) => isDueEvent(e, now))

/* ---------------- formatting ---------------- */
export const durationMin = (e) => (e.allDay ? 0 : toMin(e.end) - toMin(e.time))
export function fmtDuration(min) {
  if (min < 60) return min + ' min'
  const h = Math.floor(min / 60), m = min % 60
  return m ? `${h} h ${m} min` : `${h} hour${h === 1 ? '' : 's'}`
}
export const fmtRange = (e) => (e.allDay ? 'All day' : `${e.time}–${e.end}`)
export function fmtLead(min) {
  if (!min) return 'At the time of the event'
  if (min < 60) return min + ' min before'
  if (min < 1440) return (min / 60) + ' hour' + (min === 60 ? '' : 's') + ' before'
  return (min / 1440) + ' day' + (min === 1440 ? '' : 's') + ' before'
}

/* ---------------- grouping + layout ---------------- */
export function compareEvents(a, b) {
  if (!!a.allDay !== !!b.allDay) return a.allDay ? -1 : 1
  return (toMin(a.time) || 0) - (toMin(b.time) || 0) || durationMin(b) - durationMin(a) || String(a.title).localeCompare(String(b.title))
}
export function eventsByDate(events) {
  const m = {}
  for (const e of events) (m[e.date] = m[e.date] || []).push(e)
  for (const k in m) m[k].sort(compareEvents)
  return m
}

// Overlapping timed events share the width side by side (Apple/Google style):
// group into clusters of mutually-overlapping events, then give each event the
// first free column. Returns [{ e, s, t, col, cols }].
// minLen: the shortest an event is drawn (TimeGrid's 20px minimum = 25 min at 48px/h).
export function layoutDay(events, minLen = 25) {
  const items = events.filter((e) => !e.allDay)
    .map((e) => ({ e, s: toMin(e.time), t: Math.max(toMin(e.end), toMin(e.time) + minLen) }))
    .sort((a, b) => a.s - b.s || b.t - a.t)
  const out = []
  let cluster = []
  let clusterEnd = -1
  const flush = () => {
    const colEnds = []
    for (const x of cluster) {
      let c = colEnds.findIndex((end) => end <= x.s)
      if (c < 0) { c = colEnds.length; colEnds.push(0) }
      colEnds[c] = x.t
      x.col = c
    }
    for (const x of cluster) x.cols = colEnds.length
    out.push(...cluster)
    cluster = []
  }
  for (const x of items) {
    if (cluster.length && x.s >= clusterEnd) flush()
    cluster.push(x)
    clusterEnd = Math.max(clusterEnd, x.t)
  }
  if (cluster.length) flush()
  return out
}

/* ---------------- plain-language quick add ---------------- */
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const SHORT_DAYS = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 }
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
// Whole month words only, so "decorations" or "marshmallows" are never dates.
const MONTH_WORD = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate()
const to24 = (h, ampm) => {
  if (!ampm) return h
  const pm = /p/i.test(ampm)
  return (h % 12) + (pm ? 12 : 0)
}

/* Shared readers for the event and task quick-add boxes. Each takes the text
 * padded with spaces (' like this '), removes what it understood, and returns
 * the rest, so the two boxes read dates, times and #projects the same way. */
export function readProject(t, projects) {
  const m = t.match(/\s#([^\s#]+)/)
  if (!m) return { t, projectId: null }
  const want = m[1].toLowerCase()
  const p = projects.find((x) => x.name.toLowerCase().replace(/\s+/g, '').startsWith(want))
  return p ? { t: t.replace(m[0], ' '), projectId: p.id } : { t, projectId: null }
}

// Day words: today, tomorrow, day after tomorrow, next week, in 3 days / 2 weeks,
// 12.10. / 12/10/2026, 12 oct / oct 12, friday, on/next/this fri. Bare short
// weekdays work for mon–fri; "sun" and "sat" need on/next/this ("sun cream").
export function readDate(t, today) {
  let m
  const done = (date) => ({ t: t.replace(m[0], ' '), date })
  if ((m = t.match(/\s(day after tomorrow)(?=\s)/i))) return done(addDays(today, 2))
  if ((m = t.match(/\s(?:tomorrow|tmrw|tmr)(?=\s)/i))) return done(addDays(today, 1))
  if ((m = t.match(/\stoday(?=\s)/i))) return done(today)
  if ((m = t.match(/\snext\s+week(?=\s)/i))) { const a = (1 - today.getDay() + 7) % 7 || 7; return done(addDays(today, a)) }
  if ((m = t.match(/\sin\s+(\d{1,3})\s+days?(?=\s)/i))) return done(addDays(today, +m[1]))
  if ((m = t.match(/\sin\s+(\d{1,2})\s+weeks?(?=\s)/i))) return done(addDays(today, 7 * m[1]))
  if ((m = t.match(/\s(on\s+)?(\d{1,2})([./])(\d{1,2})(\.)?(?:[./](\d{2,4}))?(?=\s)/)) && (m[1] || m[6] || (m[3] === '.' && m[5]))) {
    // European day.month: "12.10." or "12.10.2026" or "on 12/10"; bare "1.2" or "3/4" stay text.
    m = [m[0], m[2], m[4], m[6]]
    const d = +m[1], mo = +m[2] - 1
    const y = m[3] ? +m[3] + (m[3].length === 2 ? 2000 : 0) : today.getFullYear()
    if (mo >= 0 && mo < 12 && d >= 1 && d <= daysIn(y, mo)) {
      let cand = new Date(y, mo, d)
      if (!m[3] && cand < today) cand = new Date(y + 1, mo, d)
      return done(cand)
    }
    return { t, date: null }
  }
  if ((m = t.match(new RegExp('\\s(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+' + MONTH_WORD + '\\.?(?=\\s)', 'i')))
    || (m = t.match(new RegExp('\\s(?:on\\s+)?' + MONTH_WORD + '\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?=\\s)', 'i')))) {
    const monFirst = isNaN(+m[1])
    const d = +(monFirst ? m[2] : m[1])
    const mo = MONTHS.indexOf((monFirst ? m[1] : m[2]).slice(0, 3).toLowerCase())
    if (d >= 1 && d <= daysIn(today.getFullYear(), mo)) {
      let cand = new Date(today.getFullYear(), mo, d)
      if (cand < today) cand = new Date(today.getFullYear() + 1, mo, d)
      return done(cand)
    }
    return { t, date: null }
  }
  if ((m = t.match(new RegExp('\\s(?:(on|next|this)\\s+)?(' + WEEKDAYS.join('|') + ')(?=\\s)', 'i')))
    || (m = t.match(/\s(on|next|this)\s+(sun|mon|tues?|wed|thu(?:rs?)?|fri|sat)\.?(?=\s)/i))
    || (m = t.match(/\s()(mon|tues?|wed|thu(?:rs?)?|fri)\.?(?=\s)/i))) {
    const word = m[2].toLowerCase()
    const target = WEEKDAYS.indexOf(word) >= 0 ? WEEKDAYS.indexOf(word) : SHORT_DAYS[word.replace('.', '')]
    let ahead = (target - today.getDay() + 7) % 7
    if (m[1] && m[1].toLowerCase() === 'next' && ahead === 0) ahead = 7
    return done(addDays(today, ahead))
  }
  return { t, date: null }
}

// One clock time: 6pm, 6:30 pm, 18:00, at 18. Returns minutes after midnight.
export function readClock(t) {
  let m
  if ((m = t.match(/\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?=\s)/i)) && +m[1] >= 1 && +m[1] <= 12) {
    return { t: t.replace(m[0], ' '), min: to24(+m[1], m[3]) * 60 + (+m[2] || 0) }
  }
  if ((m = t.match(/\s(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)(?=\s)/))) return { t: t.replace(m[0], ' '), min: +m[1] * 60 + +m[2] }
  if ((m = t.match(/\sat\s+([01]?\d|2[0-3])(?=\s)/i))) return { t: t.replace(m[0], ' '), min: +m[1] * 60 }
  return { t, min: null }
}

// "Dentist tomorrow 14:30 for 45 min #health" -> { title, date, time, end, allDay, projectId }
export function parseQuickAdd(text, now = new Date(), projects = []) {
  let t = ' ' + String(text || '').replace(/\s+/g, ' ') + ' '
  const today = startOfDay(now)
  let start = null
  let end = null
  let len = 60
  let m
  const cut = (s) => { t = t.replace(s, ' ') }

  const proj = readProject(t, projects)
  t = proj.t
  const projectId = proj.projectId
  // duration: "for 45 min", "for 1.5h"
  if ((m = t.match(/\sfor\s+(\d+(?:[.,]\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?)(?=\s)/i))) {
    const v = parseFloat(m[1].replace(',', '.'))
    len = Math.max(5, Math.round(/^h/i.test(m[2]) ? v * 60 : v))
    cut(m[0])
  }
  const when = readDate(t, today)
  t = when.t
  const date = when.date || today
  // time range: "14:00-15:30", "2-3pm", "9am to 11am"
  if ((m = t.match(/\s(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?=\s)/i))
    && (m[2] || m[5] || m[3] || m[6])) {
    const ap2 = m[6] || m[3]
    const ap1 = m[3] || (m[6] && +m[1] <= +m[4] ? m[6] : null)
    const s = to24(+m[1], ap1) * 60 + (+m[2] || 0)
    const e = to24(+m[4], ap2) * 60 + (+m[5] || 0)
    if (s < 1440 && e < 1440 && e > s) { start = s; end = e; cut(m[0]) }
  }
  if (start == null) {
    const c = readClock(t)
    t = c.t
    start = c.min
  }
  if (start != null && end == null) end = Math.min(start + len, DAY_END)

  const title = t.replace(/\s+(at|on|for|from|in)\s*$/i, ' ').replace(/\s+/g, ' ').trim()
  return {
    ok: !!title,
    title,
    date: dateKey(date),
    allDay: start == null,
    time: start == null ? '' : toHM(start),
    end: start == null ? '' : toHM(end),
    projectId,
  }
}
