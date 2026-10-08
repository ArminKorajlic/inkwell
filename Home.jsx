import React from 'react'
import { Plus, Stopwatch, Check, ChevronRight, Pin, SidebarLeft } from '@openai/apps-sdk-ui/components/Icon'
import * as TM from './task-model.js'
import { dateKey } from './util.js'
import Logo, { APP_NAME, APP_TAGLINE } from './Logo.jsx'

const CSS = `
.nm-home { flex: 1; overflow-y: auto; min-height: 0; }
.nm-home-inner { max-width: 980px; margin: 0 auto; padding: 34px 28px 120px; }
.nm-home-hero { display: flex; align-items: center; gap: 20px; }
.nm-home-hero svg { filter: drop-shadow(0 6px 18px rgba(46,108,246,.28)); border-radius: 16px; }
.nm-home-id h1 { margin: 0; font-size: 34px; letter-spacing: -0.025em; line-height: 1.1; }
.nm-home-id p { margin: 6px 0 0; color: var(--muted); font-size: 15.5px; }
.nm-home-date { margin: 22px 0 14px; color: var(--muted); font-size: 14px; }
.nm-home-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 22px; }
.nm-home-actions button { display: inline-flex; align-items: center; gap: 7px; min-height: 40px; }
.nm-home-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }
@media (min-width: 900px) { .nm-home-card.wide { grid-column: span 2; } }
.nm-home-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 14px 16px 10px; min-width: 0; }
.nm-home-card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.nm-home-card-head h2 { margin: 0; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); font-weight: 700; }
.nm-home-link { border: none; background: none; color: var(--accent); font: inherit; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 2px; padding: 6px 4px; border-radius: 8px; }
.nm-home-link:hover { background: color-mix(in srgb, var(--accent) 10%, transparent); }
.nm-home-row { width: 100%; display: flex; align-items: center; gap: 10px; border: none; background: none; color: inherit; font: inherit; text-align: left; padding: 9px 8px; border-radius: 10px; cursor: pointer; border-top: 1px solid var(--border); min-height: 44px; }
.nm-home-card-head + .nm-home-row, .nm-home-card-head + .nm-home-task { border-top: none; }
.nm-home-row:hover { background: color-mix(in srgb, var(--text) 5%, transparent); }
.nm-home-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.nm-home-row-main b { font-weight: 600; font-size: 14.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 5px; }
.nm-home-row-main small { color: var(--muted); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nm-home-meta { color: var(--muted); font-size: 12.5px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.nm-home-time { color: var(--accent); font-weight: 600; font-size: 13px; min-width: 48px; font-variant-numeric: tabular-nums; }
.nm-home-check { flex: 0 0 auto; width: 20px; height: 20px; border-radius: 50%; border: 2px solid color-mix(in srgb, var(--muted) 65%, transparent); background: none; color: transparent; cursor: pointer; padding: 0; display: grid; place-items: center; position: relative; }
.nm-home-check::before { content: ""; position: absolute; inset: -12px; }
.nm-home-check:hover { color: var(--muted); }
.nm-home-check.p1 { border-color: #0090ff; } .nm-home-check.p2 { border-color: #f5a524; } .nm-home-check.p3 { border-color: #e5484d; }
.nm-home-time.od { color: #e5484d; }
.nm-home-bar { width: 3px; height: 18px; border-radius: 2px; flex: 0 0 auto; }
.nm-home-task button.nm-home-tt { flex: 1; min-width: 0; border: none; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; padding: 6px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nm-home-task small { color: var(--muted); font-size: 12.5px; white-space: nowrap; }
.nm-home-task { display: flex; align-items: center; gap: 8px; padding: 6px 4px; border-top: 1px solid var(--border); min-height: 44px; font-size: 14.5px; }
.nm-home-task span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nm-home-empty { color: var(--muted); font-size: 14px; padding: 12px 8px 14px; }
.nm-home-focus { display: flex; align-items: baseline; gap: 8px; padding: 6px 8px 2px; }
.nm-home-focus b { font-size: 34px; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.nm-home-focus span { color: var(--muted); font-size: 14px; }
.nm-home-focus-sub { color: var(--muted); font-size: 13px; padding: 0 8px 10px; }
@media (max-width: 860px) {
  .nm-home-inner { padding: 22px 18px 120px; }
  .nm-home-id h1 { font-size: 28px; }
}
`

function greeting(d) {
  const h = d.getHours()
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function Home({
  recent, today, dueTasks = [], nextTasks = [], openTaskCount, focusToday,
  onOpenNote, onOpenEvent, onToggleTask, onOpenTask, onNewNote, onGo, onMenu, fmtDate, now = new Date(),
}) {
  const todayK = dateKey(now)
  // Today = overdue tasks, then all-day events, then timed events and tasks by time, then untimed tasks.
  const plan = [
    ...dueTasks.filter((t) => t.due < todayK).map((t) => ({ kind: 'task', t, od: true })),
    ...today.filter((e) => e.allDay).map((e) => ({ kind: 'event', e })),
    ...[...today.filter((e) => !e.allDay).map((e) => ({ kind: 'event', e, at: e.time })),
      ...dueTasks.filter((t) => t.due === todayK && t.time).map((t) => ({ kind: 'task', t, at: t.time }))]
      .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)),
    ...dueTasks.filter((t) => t.due === todayK && !t.time).map((t) => ({ kind: 'task', t })),
  ]
  const taskRow = (t, label, od) => (
    <div key={t.id} className="nm-home-task">
      <span className={'nm-home-time' + (od ? ' od' : '')}>{label}</span>
      <button className={'nm-home-check p' + t.priority} title="Complete" aria-label={'Complete ' + t.text} onClick={() => onToggleTask(t.id)}>
        <Check width={11} height={11} />
      </button>
      <button className="nm-home-tt" onClick={() => onOpenTask(t.id)}>{t.text}</button>
    </div>
  )
  return (
    <div className="nm-home">
      <style>{CSS}</style>
      <div className="nm-home-inner">
        <button className="nm-iconbtn nm-mobile-back" style={{ marginBottom: 10 }} onClick={onMenu} aria-label="Menu" title="Menu"><SidebarLeft width={20} height={20} /></button>
        <header className="nm-home-hero">
          <Logo size={72} />
          <div className="nm-home-id">
            <h1>{APP_NAME}</h1>
            <p>{APP_TAGLINE}</p>
          </div>
        </header>
        <div className="nm-home-date">
          {greeting(now)} · {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        <div className="nm-home-actions">
          <button className="nm-btn-primary" onClick={onNewNote}><Plus width={16} height={16} /> New note</button>
          <button className="nm-btn-ghost" onClick={() => onGo('focus')}><Stopwatch width={16} height={16} /> Start focus</button>
        </div>

        <div className="nm-home-grid">
          <section className="nm-home-card wide" aria-label="Recent notes">
            <div className="nm-home-card-head">
              <h2>Recent notes</h2>
              <button className="nm-home-link" onClick={() => onGo('notes')}>All notes <ChevronRight width={14} height={14} /></button>
            </div>
            {recent.length === 0 ? (
              <div className="nm-home-empty">No notes yet. Start one with “New note”.</div>
            ) : recent.map((n) => (
              <button key={n.id} className="nm-home-row" onClick={() => onOpenNote(n.id)}>
                <span className="nm-home-row-main">
                  <b>{n.pinned && <Pin width={12} height={12} />}{n.title?.trim() || 'Untitled'}</b>
                  <small>{n.snippet || 'No additional text'}</small>
                </span>
                <span className="nm-home-meta">{fmtDate(n.updatedAt)}</span>
              </button>
            ))}
          </section>

          <section className="nm-home-card" aria-label="Today">
            <div className="nm-home-card-head">
              <h2>Today</h2>
              <button className="nm-home-link" onClick={() => onGo('calendar')}>Calendar <ChevronRight width={14} height={14} /></button>
            </div>
            {plan.length === 0 ? (
              <div className="nm-home-empty">Nothing planned or due today.</div>
            ) : plan.map((x) => (x.kind === 'task'
              ? taskRow(x.t, x.od ? TM.compactDay(x.t.due, now) : (x.t.time || ''), x.od)
              : (
                <button key={x.e.id} className="nm-home-row" onClick={() => onOpenEvent(x.e)}>
                  <span className="nm-home-time">{x.e.allDay ? 'All day' : x.e.time}</span>
                  <span className="nm-home-row-main"><b>{x.e.title}</b></span>
                </button>
              )))}
          </section>

          <section className="nm-home-card" aria-label="Coming up">
            <div className="nm-home-card-head">
              <h2>Coming up{openTaskCount ? ` · ${openTaskCount} open` : ''}</h2>
              <button className="nm-home-link" onClick={() => onGo('tasks')}>Tasks <ChevronRight width={14} height={14} /></button>
            </div>
            {nextTasks.length === 0 ? (
              <div className="nm-home-empty">{openTaskCount ? 'Nothing scheduled after today.' : 'All clear.'}</div>
            ) : nextTasks.map((t) => taskRow(t, TM.compactDay(t.due, now)))}
          </section>

          <section className="nm-home-card" aria-label="Focus today">
            <div className="nm-home-card-head">
              <h2>Focus today</h2>
              <button className="nm-home-link" onClick={() => onGo('focus')}>Focus <ChevronRight width={14} height={14} /></button>
            </div>
            <div className="nm-home-focus"><b>{focusToday.minutes}</b><span>min</span></div>
            <div className="nm-home-focus-sub">
              {focusToday.sessions === 0 ? 'No sessions yet today.' : `${focusToday.sessions} session${focusToday.sessions === 1 ? '' : 's'} completed`}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
