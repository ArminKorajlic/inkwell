import React, { useMemo } from 'react'
import { Plus, Bell, Paperclip, Notepad } from '@openai/apps-sdk-ui/components/Icon'
import { dateKey, addDays, projectColor, fmtRange, fmtLead } from './cal-model.js'
import CalTask from './CalTask.jsx'
import { relDay } from './util.js'

// Month grid + a side panel listing the selected day's events (below the grid
// on narrow screens). Clicking an event anywhere opens the same peek card.

export default function MonthView({ cursor, byDate, projects, now, selectedId, reminders, onSelectDay, onEventClick, onAdd, onReminderClick, taskDays = {}, onToggleTask, onOpenTask }) {
  const todayK = dateKey(now)
  const selK = dateKey(cursor)
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const start = addDays(first, -((first.getDay() + 6) % 7))
    return Array.from({ length: 42 }, (_, i) => addDays(start, i))
  }, [cursor.getFullYear(), cursor.getMonth()])
  const dayEvents = byDate[selK] || []
  const dayTasks = taskDays[selK] || []
  const projName = (id) => projects.find((p) => p.id === id)?.name

  return (
    <div className="mv">
      <div className="mv-main">
        <div className="mv-dow" aria-hidden="true">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d}>{d}</span>)}</div>
        <div className="mv-grid" role="grid">
          {cells.map((d) => {
            const k = dateKey(d)
            const list = byDate[k] || []
            const tl = taskDays[k] || []
            const room = Math.max(0, 3 - list.length)
            const total = list.length + tl.length
            return (
              <button key={k} data-day={k} role="gridcell" aria-selected={k === selK}
                className={'mv-day' + (d.getMonth() !== cursor.getMonth() ? ' other' : '') + (k === todayK ? ' today' : '') + (k === selK ? ' sel' : '')}
                aria-label={d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }) + (list.length ? `, ${list.length} event${list.length > 1 ? 's' : ''}` : '') + (tl.length ? `, ${tl.length} task${tl.length > 1 ? 's' : ''}` : '')}
                onClick={() => onSelectDay(d)}>
                <span className="mv-n">{d.getDate()}</span>
                {list.slice(0, 3).map((e) => (
                  <span key={e.id} className="mv-chip" data-evchip={e.id}>
                    <span className="cal-dot" style={{ background: projectColor(projects, e.projectId) }} />
                    {!e.allDay && <i>{e.time}</i>}{e.title}
                  </span>
                ))}
                {tl.slice(0, room).map((t) => (
                  <span key={t.id} className={'mv-chip' + (t.done ? ' done' : '')}><span className={'mv-tick p' + t.priority} />{t.text}</span>
                ))}
                {total > 3 && <span className="mv-more">+{total - 3} more</span>}
              </button>
            )
          })}
        </div>
      </div>

      <aside className="mv-panel" aria-label="Selected day">
        <div className="mv-dayblock">
        <h3>{cursor.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
        <div className="mv-sub">
          {[dayEvents.length && `${dayEvents.length} event${dayEvents.length > 1 ? 's' : ''}`, dayTasks.length && `${dayTasks.length} task${dayTasks.length > 1 ? 's' : ''}`].filter(Boolean).join(' · ') || 'Nothing planned'}
        </div>
        {dayEvents.length === 0 && dayTasks.length === 0 && <div className="mv-empty">A free day.</div>}
        {dayEvents.map((e) => (
          <button key={e.id} data-ev={e.id} className={'mv-item' + (e.id === selectedId ? ' sel' : '')}
            style={{ '--c': projectColor(projects, e.projectId) }}
            onClick={(x) => onEventClick(e, x.currentTarget.getBoundingClientRect())}>
            <span className="mv-bar" />
            <span className="mv-time">{fmtRange(e)}</span>
            <span style={{ minWidth: 0 }}>
              <b>{e.title}</b>
              <small>
                {projName(e.projectId) || 'No project'}
                {e.remind && <> · <Bell width={11} height={11} /></>}
                {e.noteId && <> · <Notepad width={11} height={11} /></>}
                {e.attachments?.length > 0 && <> · <Paperclip width={11} height={11} /> {e.attachments.length}</>}
              </small>
            </span>
          </button>
        ))}
        {dayTasks.length > 0 && (
          <div className="mv-tasks" aria-label="Tasks due this day">
            <h4>Tasks</h4>
            {dayTasks.map((t) => <CalTask key={t.id} t={t} onToggle={onToggleTask} onOpen={onOpenTask} />)}
          </div>
        )}
        <button className="nm-btn-primary nm-small" style={{ marginTop: 10 }} onClick={() => onAdd(cursor)}>
          <Plus width={14} height={14} /> Add event
        </button>
        </div>

        {reminders.length > 0 && (
          <section className="mv-rem" aria-label="Next reminders, from now, across all days">
            <div className="mv-rem-head">
              <Bell width={13} height={13} /> Next reminders
              <span>from now · all days</span>
            </div>
            {reminders.map((e) => (
              <button key={e.id} className="mv-item" style={{ '--c': projectColor(projects, e.projectId) }} onClick={() => onReminderClick(e)}>
                <span className="mv-bar" />
                <span className="mv-time">{relDay(e.date, now, 'short')}{e.allDay ? '' : ' · ' + e.time}</span>
                <span style={{ minWidth: 0 }}><b>{e.title}</b><small>{fmtLead(e.remindLead || 0)}</small></span>
              </button>
            ))}
          </section>
        )}
      </aside>
    </div>
  )
}
