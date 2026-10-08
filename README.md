# Inkwell

*Write it down, draw it out, get it done.* A fast, Apple Notes–style personal
workspace (app id `workspace`, shown as **Inkwell**).

## Features
- **Home**: logo, name, recent notes, a Today plan (overdue tasks, events and due tasks in time order),
  coming-up tasks, focus time today.
- **Notes**: rich text (headings, bold/italic/underline/strikethrough, highlight,
  web links, bullet/numbered lists, checklists, quotes, code blocks, dividers,
  tables), images (insert/paste/drop, downscaled), drawings (pen pad, editable
  later), projects, pinning, sort (edited/created/title), full-text search with
  highlighted matches, move notes between projects (menu or drag).
  - Typing shortcuts at the start of a line: `# ` `## ` `- ` `1. ` `[] ` `> `, and
    `---` / ```` ``` ```` + Enter; `/` on an empty line opens an insert menu.
  - Keys: ⌘/Ctrl+B/I/U, ⌘⇧X strike, ⌘⇧H highlight, ⌘K link, ⌘⇧7/8/9 lists, ⌘F find.
  - `[[` links another note; the side panel shows **Linked from** (notes, tasks,
    events), an outline you can jump through, and word count.
  - Headings fold (click left of them; folding is never saved). Find in note.
  - Checklist line → **Make task**: the line and the task stay in sync both ways.
  - Paste keeps simple formatting; export opens a window with Print / Save as
    PDF, Download Markdown and Copy (the app sandbox blocks print and downloads).
  - The list groups notes by date (Pinned, Today, Yesterday, Previous 7/30 days,
    months) and cards show an image thumbnail and checklist progress.
- **Recently Deleted**: deleted notes are kept for 30 days (Undo, restore, delete
  forever); deleting a project moves its notes there.
- **Tasks**: smart lists (Today with Overdue, Upcoming by day, All by project,
  Completed) and project lists; plain-words quick add (`Call Ana fri 18:00 !high
  #work every week`); a details panel (date/time, priority, project, repeat,
  reminder, steps, notes, linked note); complete/delete with Undo; repeating
  tasks roll forward; drag to reschedule or move; keys N, ↑/↓, X, T, 0–3, Delete, Esc.
- **Pomodoro focus** timer with a bell (scheduled on the audio clock so it rings
  on time in background tabs); finished sessions count on the focused task.
- **Calendar** with events, in-app reminders, linked notes, and attachments (downloads
  open a small tab that starts the download, because the app sandbox blocks direct downloads); dated
  tasks appear in the all-day row and the month day panel, where they can be ticked.

## Modules
- `index.jsx`: app shell, state, and views
- `util.js`: ids and calendar-day helpers (`dateKey`, `relDay` in long/short/compact widths) used everywhere
- `store.js`: forgiving storage reads/writes and `useSaved(key)`, state that saves itself to one storage file
- `EventEditor.jsx`: the full event editor (owns its draft and attachment session)
- `Home.jsx`, `Logo.jsx`: Home screen and brand mark
- `notes-model.js`: pure list/sort/search/trash/focus-log logic
- `editor-dom.js`: contentEditable operations (lists, tables, media, normalization,
  typing shortcuts, quotes/code/dividers, highlight, paste cleanup, note links, folding, find)
- `NoteTools.jsx`: insert / note-link menu, link box, find bar, side panel
- `note-export.js`: Markdown conversion and the export window
- `media.js`: image downscaling, image/attachment blobs, data-URL cache
- `drawing.js`, `DrawPad.jsx`: drawing engine and pad
- `Attachments.jsx`: event attachments and image viewer
- `sound.js`: synthesized bell
- `task-model.js`: pure task logic (shape, smart-list grouping, repeats, reminders, quick add)
- `TasksView.jsx`, `TaskDetail.jsx`: Tasks screen and details panel; `CalTask.jsx`: a task inside the calendar
- `cal-model.js` also holds the shared date/time/#project readers used by both quick-add boxes

## Storage
`projects.json`, `index.json` (note metadata incl. `pinned`, `deletedAt`, and list metadata `thumb`,
`checks`, `links`, `words`, `mv` from `NM.noteMeta`; older notes are filled in the background),
`note-<id>.json` (bodies), `search.json` (plain text for search), `settings.json`
(sort, calView, taskList), `tasks.json` (shape in task-model.js), `events.json`, `focus.json` (durations, sound, daily log),
`img/` (note images and drawings), `att/` (event attachments).
