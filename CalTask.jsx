import React from 'react'
import { Check } from '@openai/apps-sdk-ui/components/Icon'

// A task as it appears inside the calendar: tick it off, or open it in Tasks.
export default function CalTask({ t, onToggle, onOpen }) {
  return (
    <div className={'cal-task' + (t.done ? ' done' : '')} data-task={t.id}>
      <button className={'cal-task-ck' + (t.done ? ' done' : ' p' + t.priority)} aria-label={(t.done ? 'Mark not done: ' : 'Complete: ') + t.text}
        onClick={(e) => { e.stopPropagation(); onToggle?.(t.id) }}><Check width={9} height={9} /></button>
      <button className="cal-task-t" title={t.text} onClick={(e) => { e.stopPropagation(); onOpen?.(t.id) }}>
        {t.time && <i>{t.time}</i>}{t.text}
      </button>
    </div>
  )
}
