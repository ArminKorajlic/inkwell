import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Plus, Search, Trash, Folder, Notepad, SidebarLeft, XCrossed,
  SquareCheckboxUnchecked, TableFilled, Text, Tasks, Stopwatch,
  PlayTriangle, Pause, ArrowRotateCcw, Check, Calendar, Bell,
  ImageSquare, Pencil, Warning, Pin, PinFilled, Home as HomeIcon, ChevronUpDown,
  Download, SidebarRight, Link, Quote, Code, Minus,
} from '@openai/apps-sdk-ui/components/Icon'
import * as ED from './editor-dom.js'
import { prepareImage, saveImage, imageDataUrl, removeImage, removeAttachment } from './media.js'
import DrawPad from './DrawPad.jsx'
import { playBell } from './sound.js'
import * as NM from './notes-model.js'
import Logo, { APP_NAME } from './Logo.jsx'
import Home from './Home.jsx'
import CalendarView from './CalendarView.jsx'
import TasksView from './TasksView.jsx'
import * as TM from './task-model.js'
import { uid, dateKey } from './util.js'
import { sget, sset, sremove, useSaved } from './store.js'
import * as CM from './cal-model.js'
import { Lightbox } from './Attachments.jsx'
import EventEditor from './EventEditor.jsx'
import { InsertMenu, LinkPrompt, FindBar, NotePanel, CSS as NOTE_TOOLS_CSS } from './NoteTools.jsx'
import { htmlToMarkdown, openExportWindow, fillExportWindow } from './note-export.js'
import { relDay } from './util.js'

/* ------------------------------------------------------------------ *
 * Workspace — Phase 1 (notes) + Phase 2 (tasks + pomodoro focus)
 * Panes: sidebar (views + projects) · note list · main (editor/tasks/focus)
 * Storage:
 *   projects.json  -> [{id,name,createdAt}]
 *   index.json     -> [{id,title,projectId,snippet,createdAt,updatedAt}]
 *   note-<id>      -> {id,title,html,projectId,createdAt,updatedAt}
 *   tasks.json     -> see task-model.js (dates, priority, notes, steps, repeat, reminder, focus)
 *   focus.json     -> {workMin,shortMin,longMin,rounds}
 * The note list + search read ONLY the index; a body loads lazily on open.
 * ------------------------------------------------------------------ */

const CSS = `
* { box-sizing: border-box; }
.nm-root {
  position: absolute; inset: 0;
  display: flex; color: var(--text); background: var(--bg);
  font-family: var(--font); font-size: 14px; overflow: hidden;
  -webkit-font-smoothing: antialiased;
}
.nm-root button { font-family: inherit; }

/* ---- Sidebar ---- */
.nm-side {
  width: 232px; flex: 0 0 232px; background: var(--surface-2);
  border-right: 1px solid var(--border);
  display: flex; flex-direction: column; min-height: 0;
}
.nm-side-head {
  padding: 16px 16px 8px; font-weight: 700; font-size: 17px;
  letter-spacing: -0.01em; display: flex; align-items: center; gap: 8px;
}
.nm-side-scroll { flex: 1; overflow-y: auto; padding: 4px 8px 12px; min-height: 0; }
.nm-side-label {
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.04em; color: var(--muted);
  padding: 12px 8px 4px; display: flex; align-items: center; justify-content: space-between;
}
.nm-row {
  display: flex; align-items: center; gap: 9px; padding: 7px 9px;
  border-radius: 8px; cursor: pointer; color: var(--text); border: none;
  background: none; width: 100%; text-align: left; font-size: 14px; line-height: 1.2;
}
.nm-row:hover { background: color-mix(in srgb, var(--text) 7%, transparent); }
.nm-row.sel { background: var(--accent); color: #fff; }
.nm-row.sel .nm-count { color: rgba(255,255,255,0.8); }
.nm-row .nm-ico { flex: 0 0 18px; display: inline-flex; opacity: .85; }
.nm-row-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nm-count { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.nm-count.nm-count-od { color: #fff; background: #e5484d; border-radius: 999px; padding: 0 6px; font-weight: 700; }
.nm-proj-name-input {
  flex: 1; border: none; background: transparent; color: inherit;
  font-size: 14px; font-family: inherit; outline: none; padding: 0;
}
.nm-iconbtn {
  border: none; background: none; cursor: pointer; color: var(--muted);
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 7px; flex: 0 0 auto;
}
.nm-iconbtn:hover { background: color-mix(in srgb, var(--text) 9%, transparent); color: var(--text); }

/* ---- Note list column ---- */
.nm-list {
  width: 312px; flex: 0 0 312px; background: var(--surface);
  border-right: 1px solid var(--border); display: flex; flex-direction: column; min-height: 0;
}
.nm-list-top {
  padding: 12px 14px 10px; display: flex; flex-direction: column; gap: 10px;
  border-bottom: 1px solid var(--border);
}
.nm-list-title-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.nm-list-title { font-weight: 700; font-size: 20px; letter-spacing: -0.015em; }
.nm-search {
  display: flex; align-items: center; gap: 8px;
  background: color-mix(in srgb, var(--text) 7%, transparent);
  border-radius: 9px; padding: 7px 10px; color: var(--muted);
}
.nm-search input { flex: 1; border: none; background: none; outline: none; color: var(--text); font-size: 14px; font-family: inherit; }
.nm-list-scroll { flex: 1; overflow-y: auto; padding: 6px; min-height: 0; }
.nm-card { padding: 10px 12px; border-radius: 10px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; margin-bottom: 2px; }
.nm-card:hover { background: color-mix(in srgb, var(--text) 5%, transparent); }
.nm-card.sel { background: var(--accent); }
.nm-card.sel .nm-card-title, .nm-card.sel .nm-card-sub { color: #fff; }
.nm-card.sel .nm-card-sub { opacity: .85; }
.nm-card-title { font-weight: 600; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nm-card-sub { font-size: 12.5px; color: var(--muted); display: flex; gap: 6px; overflow: hidden; }
.nm-card-sub .nm-snip { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ---- Main / editor ---- */
.nm-main { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.nm-toolbar { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; padding: 8px 14px; border-bottom: 1px solid var(--border); background: var(--bg); }
.nm-tgroup { display: flex; align-items: center; gap: 2px; }
.nm-tsep { width: 1px; height: 22px; background: var(--border); margin: 0 6px; }
.nm-tbtn {
  min-width: 32px; height: 32px; padding: 0 8px; border-radius: 7px; border: none;
  background: none; cursor: pointer; color: var(--text); display: inline-flex;
  align-items: center; justify-content: center; font-size: 14px; gap: 5px;
}
.nm-tbtn:hover { background: color-mix(in srgb, var(--text) 9%, transparent); }
.nm-tbtn.active { background: color-mix(in srgb, var(--accent) 22%, transparent); color: var(--accent); }
.nm-tbtn.b { font-weight: 800; }
.nm-tbtn.i { font-style: italic; font-family: Georgia, serif; }
.nm-tbtn.u { text-decoration: underline; }
.nm-tbtn.h { font-weight: 700; }
@media (max-width: 1100px) {
  .nm-toolbar { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
  .nm-toolbar::-webkit-scrollbar { display: none; }
  .nm-toolbar > * { flex-shrink: 0; }
}
.nm-tb-mark { background: color-mix(in srgb, #ffd60a 55%, transparent); border-radius: 3px; padding: 0 4px; font-weight: 700; }
.nm-tbtn-danger:hover { background: color-mix(in srgb, #e5484d 15%, transparent); color: #e5484d; }
.nm-spacer { flex: 1; }

.nm-doc-wrap { flex: 1; overflow-y: auto; min-height: 0; }
.nm-doc { max-width: 760px; margin: 0 auto; padding: 28px 40px 120px; }
.nm-title-input { width: 100%; border: none; background: none; outline: none; font-size: 28px; font-weight: 700; letter-spacing: -0.02em; color: var(--text); font-family: inherit; padding: 0 0 6px; }
.nm-title-input::placeholder { color: color-mix(in srgb, var(--muted) 70%, transparent); }
.nm-date { font-size: 12.5px; color: var(--muted); margin-bottom: 18px; }
.nm-editor { outline: none; font-size: 15.5px; line-height: 1.6; color: var(--text); min-height: 300px; }
.nm-editor:empty::before { content: attr(data-ph); color: color-mix(in srgb, var(--muted) 70%, transparent); }
.nm-editor h1 { font-size: 24px; font-weight: 700; margin: 18px 0 6px; letter-spacing: -0.01em; }
.nm-editor h2 { font-size: 19px; font-weight: 700; margin: 16px 0 4px; }
.nm-editor p { margin: 0 0 4px; }
.nm-editor ul, .nm-editor ol { margin: 4px 0; padding-left: 26px; }
.nm-editor li { margin: 2px 0; }
.nm-editor a { color: var(--accent); }
.nm-editor table { border-collapse: collapse; margin: 12px 0; width: 100%; max-width: 560px; table-layout: fixed; clear: both; float: none; }
.nm-editor td { border: 1px solid var(--border); padding: 7px 10px; vertical-align: top; word-break: break-word; }
.nm-editor tr:first-child td { background: color-mix(in srgb, var(--text) 5%, transparent); font-weight: 600; }
/* images + drawings */
.nm-editor .nm-media { margin: 10px 0; position: relative; line-height: 0; width: fit-content; max-width: 100%; border-radius: 10px; user-select: none; }
.nm-editor .nm-media img { max-width: 100%; max-height: 520px; height: auto; border-radius: 10px; display: block; border: 1px solid var(--border); cursor: pointer; }
.nm-editor .nm-media[data-drawing] img { background: #fff; }
.nm-editor .nm-media img:not([src]) { width: 260px; height: 160px; background: color-mix(in srgb, var(--text) 6%, transparent); }
.nm-editor .nm-media.sel img { outline: 3px solid var(--accent); outline-offset: 2px; }
.nm-editor .nm-media.missing img { display: none; }
.nm-editor .nm-media.missing::after { content: "Image unavailable"; display: block; line-height: 1.4; padding: 14px 16px; border: 1px dashed var(--border); border-radius: 10px; color: var(--muted); font-size: 13px; }
.nm-busy { position: absolute; left: 50%; bottom: 22px; transform: translateX(-50%); background: var(--surface); border: 1px solid var(--border); box-shadow: 0 6px 24px rgba(0,0,0,.25); border-radius: 999px; padding: 8px 16px; font-size: 13px; color: var(--text); z-index: 30; }
/* checklist = native <ul> tagged .nm-check, with a CSS checkbox you click to tick */
.nm-editor ul.nm-check { list-style: none; padding-left: 28px; }
.nm-editor ul.nm-check li { position: relative; margin: 3px 0; }
.nm-editor ul.nm-check li::before {
  content: ""; position: absolute; left: -24px; top: 2px; width: 19px; height: 19px;
  border: 1.6px solid color-mix(in srgb, var(--muted) 75%, transparent);
  border-radius: 50%; cursor: pointer; box-sizing: border-box;
}
.nm-editor ul.nm-check li[data-checked="true"]::before { background: var(--accent); border-color: var(--accent); }
.nm-editor ul.nm-check li[data-checked="true"]::after {
  content: ""; position: absolute; left: -18px; top: 5px; width: 4px; height: 9px;
  border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg); pointer-events: none;
}
.nm-editor ul.nm-check li[data-checked="true"] { text-decoration: line-through; color: var(--muted); }

/* ---- empty states ---- */
.nm-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: var(--muted); text-align: center; padding: 40px; }
.nm-empty-ico { opacity: .4; }
.nm-btn-primary { display: inline-flex; align-items: center; gap: 7px; background: var(--accent); color: #fff; border: none; cursor: pointer; padding: 9px 15px; border-radius: 9px; font-size: 14px; font-weight: 600; }
.nm-btn-primary:hover { filter: brightness(1.06); }
.nm-mobile-back { display: none; }

/* ---- Note body: quotes, code, dividers, highlights, links, folding, task lines ---- */
.nm-editor blockquote { margin: 6px 0; padding: 3px 14px; border-left: 3px solid var(--accent); color: var(--muted); }
.nm-editor blockquote + blockquote { margin-top: -6px; padding-top: 0; }
.nm-editor pre { background: color-mix(in srgb, var(--text) 7%, transparent); border-radius: 9px; padding: 10px 12px; font: 13.5px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; margin: 8px 0; }
.nm-editor hr { border: none; border-top: 1px solid var(--border); margin: 18px 0; }
.nm-editor mark { background: color-mix(in srgb, #ffd60a 45%, transparent); color: inherit; border-radius: 3px; padding: 0 2px; }
.nm-editor a { text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
.nm-editor a.nm-nlink { text-decoration: none; background: color-mix(in srgb, var(--accent) 13%, transparent); border-radius: 5px; padding: 0 4px; font-weight: 550; }
.nm-editor a.nm-nlink::before { content: "↗ "; font-size: .85em; }
.nm-editor a.nm-nlink.missing { color: var(--muted); text-decoration: line-through; background: none; }
.nm-editor h1, .nm-editor h2 { position: relative; }
.nm-editor > h1::before, .nm-editor > h2::before { content: ""; position: absolute; left: -24px; top: 50%; width: 18px; height: 18px; margin-top: -9px; opacity: 0; cursor: pointer; transition: opacity .12s, transform .15s;
  background: no-repeat center/12px url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5l3 3 3-3' fill='none' stroke='%23999' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); }
.nm-editor > h1:hover::before, .nm-editor > h2:hover::before, .nm-editor > .nm-fold::before { opacity: 1; }
.nm-editor > .nm-fold::before { transform: rotate(-90deg); }
.nm-editor > .nm-fold::after { content: " …"; color: var(--muted); font-weight: 400; }
.nm-editor .nm-hid { display: none !important; }
.nm-editor ul.nm-check li[data-task] { padding-right: 28px; background: no-repeat right 4px center/15px url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='6' fill='none' stroke='%237c5cf5' stroke-width='1.5'/%3E%3Cpath d='M5.6 8.2l1.7 1.7 3.2-3.4' fill='none' stroke='%237c5cf5' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); }
.nm-doc-row { flex: 1; display: flex; min-height: 0; min-width: 0; position: relative; }
.nm-doc-row .nm-doc-wrap { min-width: 0; }
.nm-doc { position: relative; }
.nm-mktask { position: absolute; z-index: 15; font-size: 12px; font-weight: 600; color: var(--accent); background: var(--surface); border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent); border-radius: 999px; padding: 2px 10px; cursor: pointer; display: inline-flex; gap: 5px; align-items: center; font-family: inherit; min-height: 26px; }
.nm-mktask:hover { background: color-mix(in srgb, var(--accent) 12%, var(--surface)); }
.nm-card.has-thumb { padding-right: 66px; position: relative; }
.nm-card-thumb { position: absolute; right: 10px; top: 50%; margin-top: -23px; width: 46px; height: 46px; border-radius: 8px; background: color-mix(in srgb, var(--text) 8%, transparent) center/cover no-repeat; border: 1px solid var(--border); }
.nm-card-prog { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--muted); margin-top: 2px; }
.nm-card-prog i { display: inline-block; width: 34px; height: 4px; border-radius: 2px; background: color-mix(in srgb, var(--text) 10%, transparent); overflow: hidden; position: relative; }
.nm-card-prog b { position: absolute; inset: 0 auto 0 0; background: #30a46c; }
.nm-card.sel .nm-card-prog { color: rgba(255,255,255,.85); }

/* ---- Message (top right) ---- */
.nm-toast-wrap { position: absolute; inset: 0; z-index: 60; display: flex; align-items: flex-start; justify-content: flex-end; pointer-events: none; }
.nm-toast { margin: 18px; pointer-events: auto; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,0.3); padding: 12px 14px; display: flex; align-items: center; gap: 10px; max-width: 320px; }
.nm-toast-ic { color: var(--accent); display: inline-flex; }
.nm-toast.warn .nm-toast-ic { color: #e5484d; }
.nm-toast-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.nm-toast-text b { font-weight: 600; font-size: 14px; }
.nm-toast-text small { font-size: 12.5px; color: var(--muted); }

/* ---- Shared view header ---- */
.nm-head-bar { display: flex; align-items: center; gap: 10px; padding: 16px 20px; border-bottom: 1px solid var(--border); }
.nm-head-title { font-size: 22px; font-weight: 700; letter-spacing: -0.015em; flex: 1; }

/* ---- Focus (pomodoro) view ---- */
.nm-focus { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; padding: 30px 20px 60px; overflow-y: auto; }
.nm-phase-tabs { display: inline-flex; gap: 4px; background: var(--surface-2); padding: 4px; border-radius: 11px; }
.nm-phase-tab { border: none; background: none; cursor: pointer; color: var(--muted); padding: 7px 16px; border-radius: 8px; font-size: 13.5px; font-weight: 600; font-family: inherit; }
.nm-phase-tab.on { background: var(--bg); color: var(--text); box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
.nm-ring-wrap { position: relative; width: 280px; height: 280px; }
.nm-ring-wrap svg { transform: rotate(-90deg); display: block; }
.nm-ring-time { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.nm-ring-big { font-size: 60px; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.nm-ring-sub { font-size: 13px; color: var(--muted); margin-top: 2px; }
.nm-focus-task { font-size: 14px; color: var(--muted); max-width: 360px; text-align: center; }
.nm-focus-task b { color: var(--text); font-weight: 600; }
.nm-focus-controls { display: flex; align-items: center; gap: 14px; }
.nm-bigbtn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  border: none; cursor: pointer; background: var(--accent); color: #fff;
  padding: 0 28px; height: 52px; border-radius: 26px; font-size: 16px; font-weight: 600;
}
.nm-bigbtn:hover { filter: brightness(1.06); }
.nm-circbtn { width: 52px; height: 52px; border-radius: 50%; border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.nm-circbtn:hover { background: var(--surface-2); }
.nm-focus-meta { display: flex; gap: 22px; color: var(--muted); font-size: 13px; }
.nm-focus-meta b { color: var(--text); font-variant-numeric: tabular-nums; }
.nm-focus-settings { display: flex; gap: 18px; align-items: center; flex-wrap: wrap; justify-content: center; }
.nm-bell-toggle { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); background: var(--surface); color: var(--muted); border-radius: 999px; padding: 6px 12px; font-size: 13px; font-family: inherit; cursor: pointer; min-height: 32px; }
.nm-bell-toggle.on { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 45%, transparent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
.nm-bell-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.nm-mini { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--muted); }
.nm-mini input { width: 52px; border: 1px solid var(--border); background: var(--bg); color: var(--text); border-radius: 7px; padding: 5px 7px; font-family: inherit; font-size: 13px; text-align: center; }
.nm-focus-select { border: 1px solid var(--border); background: var(--bg); color: var(--text); border-radius: 8px; padding: 7px 10px; font-family: inherit; font-size: 13.5px; max-width: 320px; }

/* Dropdown menus: transparent selects open with the browser's white list, so give
   every option the app's own surface + text colours (readable in light and dark). */
.nm-root select option, .nm-root select optgroup, .nm-draw select option { background-color: var(--surface); color: var(--text); }
.nm-root select option:checked { background-color: color-mix(in srgb, var(--accent) 30%, var(--surface)); color: var(--text); }

/* ---- brand, list extras, sidebar extras, dialogs ---- */
.nm-brand { border: none; background: none; color: var(--text); font: inherit; font-weight: 700; font-size: 17px; cursor: pointer; text-align: left; width: calc(100% - 12px); margin: 6px 6px 0; border-radius: 10px; padding: 10px 10px 8px; }
.nm-brand:hover { background: color-mix(in srgb, var(--text) 6%, transparent); }
.nm-brand:focus-visible, .nm-row:focus-visible, .nm-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.nm-sort { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--muted); }
.nm-sort select { border: none; background: none; color: var(--text); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; padding: 2px 0; }
.nm-list-section { font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); padding: 10px 12px 4px; }
.nm-list-empty { padding: 28px 16px; color: var(--muted); text-align: center; }
.nm-card mark { background: color-mix(in srgb, var(--accent) 30%, transparent); color: inherit; border-radius: 3px; padding: 0 1px; }
.nm-card.sel mark { background: rgba(255,255,255,.3); }
.nm-pin-ic { display: inline-flex; margin-right: 5px; vertical-align: -1px; color: var(--accent); }
.nm-card.sel .nm-pin-ic { color: #fff; }
.nm-trash-hint { font-size: 12.5px; color: var(--muted); }
.nm-small { padding: 5px 11px !important; font-size: 13px !important; display: inline-flex; align-items: center; gap: 6px; }
.nm-proj .nm-proj-del { width: 24px; height: 24px; opacity: 0; margin-left: -2px; }
.nm-proj:hover .nm-proj-del, .nm-proj .nm-proj-del:focus-visible { opacity: 1; }
.nm-row.sel .nm-proj-del { color: rgba(255,255,255,.85); }
.nm-row.drop { outline: 2px dashed var(--accent); outline-offset: -2px; background: color-mix(in srgb, var(--accent) 12%, transparent); }
@media (hover: none) { .nm-proj .nm-proj-del { opacity: .6; } }
.nm-move { display: inline-flex; align-items: center; gap: 5px; color: var(--muted); border: 1px solid var(--border); border-radius: 8px; padding: 3px 6px 3px 8px; margin-right: 4px; max-width: 180px; min-height: 32px; }
.nm-move select { border: none; background: none; color: var(--text); font: inherit; font-size: 13px; cursor: pointer; max-width: 140px; }
.nm-iconbtn.nm-pinned { color: var(--accent); }
.nm-btn-danger { display: inline-flex; align-items: center; gap: 6px; background: #e5484d; color: #fff; border: none; cursor: pointer; padding: 9px 15px; border-radius: 9px; font-size: 14px; font-weight: 600; font-family: inherit; }
.nm-btn-danger:hover { filter: brightness(1.06); }
.nm-confirm { max-width: 420px; }
.nm-trash-banner { font-size: 13px; color: var(--muted); padding-left: 6px; }
.nm-readonly { cursor: default; }

/* ---- Calendar (see CalendarView.jsx) + event editor ---- */
.nm-proj-color { border: none; background: none; padding: 0; cursor: pointer; border-radius: 5px; }
.nm-proj-color:hover { filter: brightness(1.15); }
.nm-row.sel .nm-proj-color { color: #fff !important; }
.nm-ev-editor { max-width: 480px; }
.nm-ev-toggle { display: flex; align-items: center; justify-content: space-between; font-size: 14px; }
.nm-switch { width: 42px; height: 26px; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--border); position: relative; cursor: pointer; padding: 0; flex: 0 0 auto; }
.nm-switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.3); transition: left .15s; }
.nm-switch.on { background: var(--accent); border-color: var(--accent); }
.nm-switch.on::after { left: 18px; }
.nm-switch:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .nm-switch::after { transition: none; } }
.nm-ev-len { font-size: 12.5px; color: var(--muted); margin-top: -6px; }
.nm-ev-projects { display: flex; flex-wrap: wrap; gap: 6px; }
.nm-ev-proj { border: 1px solid var(--border); background: none; color: var(--text); border-radius: 999px; padding: 4px 11px; font: inherit; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; min-height: 32px; }
.nm-ev-proj.on { border-color: var(--c); background: color-mix(in srgb, var(--c) 18%, transparent); }
.nm-ev-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.nm-ev-error { color: #e5484d; font-size: 13.5px; font-weight: 600; }

/* ---- Modal ---- */
.nm-modal-scrim { position: absolute; inset: 0; z-index: 40; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; padding: 20px; }
.nm-modal { width: 100%; max-width: 440px; background: var(--bg); border: 1px solid var(--border); border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.35); max-height: 90%; overflow-y: auto; }
.nm-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-bottom: 1px solid var(--border); }
.nm-modal-title { font-size: 17px; font-weight: 700; }
.nm-modal-body { padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; }
.nm-field { display: flex; flex-direction: column; gap: 5px; }
.nm-field label { font-size: 12px; font-weight: 600; color: var(--muted); }
.nm-field input, .nm-field textarea, .nm-field select {
  border: 1px solid var(--border); background: var(--surface); color: var(--text);
  border-radius: 9px; padding: 9px 11px; font-size: 14px; font-family: inherit; outline: none; width: 100%;
}
.nm-field input:focus, .nm-field textarea:focus, .nm-field select:focus { border-color: var(--accent); }
.nm-field textarea { resize: vertical; min-height: 72px; }
.nm-field-row { display: flex; gap: 10px; }
.nm-field-row .nm-field { flex: 1; }
.nm-check-line { display: flex; align-items: center; gap: 9px; font-size: 14px; cursor: pointer; }
.nm-check-line input { width: auto; }
.nm-modal-foot { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-top: 1px solid var(--border); }
.nm-modal-foot .nm-spacer { flex: 1; }
.nm-btn-ghost { border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 9px; padding: 9px 15px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; }
.nm-btn-ghost:hover { background: var(--surface-2); }

/* inline linked-note preview */
.nm-note-preview { border: 1px solid var(--border); border-radius: 10px; background: var(--surface); max-height: 240px; overflow-y: auto; padding: 12px 14px; margin-top: 8px; }
.nm-note-preview-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
.nm-note-preview-title { font-weight: 700; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nm-note-preview-body { font-size: 13.5px; line-height: 1.55; color: var(--text); }
.nm-note-preview-body h1 { font-size: 17px; font-weight: 700; margin: 8px 0 4px; }
.nm-note-preview-body h2 { font-size: 15px; font-weight: 700; margin: 8px 0 4px; }
.nm-note-preview-body p { margin: 0 0 4px; }
.nm-note-preview-body ul, .nm-note-preview-body ol { margin: 4px 0; padding-left: 22px; }
.nm-note-preview-body ul.nm-check { list-style: none; padding-left: 26px; }
.nm-note-preview-body ul.nm-check li { position: relative; margin: 2px 0; }
.nm-note-preview-body ul.nm-check li::before { content: ""; position: absolute; left: -22px; top: 2px; width: 16px; height: 16px; border: 1.5px solid color-mix(in srgb, var(--muted) 75%, transparent); border-radius: 50%; box-sizing: border-box; }
.nm-note-preview-body ul.nm-check li[data-checked="true"]::before { background: var(--accent); border-color: var(--accent); }
.nm-note-preview-body ul.nm-check li[data-checked="true"]::after { content: ""; position: absolute; left: -16.5px; top: 4.5px; width: 3.5px; height: 8px; border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg); }
.nm-note-preview-body ul.nm-check li[data-checked="true"] { text-decoration: line-through; color: var(--muted); }
.nm-note-preview-body table { border-collapse: collapse; margin: 6px 0; }
.nm-note-preview-body td { border: 1px solid var(--border); padding: 4px 8px; }
.nm-note-preview-body .nm-media { margin: 6px 0; line-height: 0; }
.nm-note-preview-body img { max-width: 100%; max-height: 220px; border-radius: 8px; border: 1px solid var(--border); }
.nm-note-preview-body .nm-media[data-drawing] img { background: #fff; }

@media (max-width: 860px) {
  .nm-side { position: absolute; z-index: 20; height: 100%; box-shadow: 0 0 40px rgba(0,0,0,0.2); transform: translateX(-100%); transition: transform .2s ease; }
  .nm-root.side-open .nm-side { transform: translateX(0); }
  .nm-scrim { display: none; position: absolute; inset: 0; z-index: 15; background: rgba(0,0,0,0.3); }
  .nm-root.side-open .nm-scrim { display: block; }
  .nm-list { width: 100%; flex: 1 1 auto; }
  .nm-main { display: none; }
  .nm-root.show-editor .nm-list { display: none; }
  .nm-root.show-editor .nm-main { display: flex; }
  .nm-root.mode-tasks .nm-list, .nm-root.mode-focus .nm-list, .nm-root.mode-calendar .nm-list, .nm-root.mode-home .nm-list { display: none; }
  .nm-root.mode-tasks .nm-main, .nm-root.mode-focus .nm-main, .nm-root.mode-calendar .nm-main, .nm-root.mode-home .nm-main { display: flex; }
  .nm-mobile-back { display: inline-flex; }
  .nm-doc { padding: 20px 20px 120px; }
}
`

/* ----------------------------- storage ----------------------------- */
// Storage only accepts raw JSON on keys ending in .json; note bodies MUST use it.
const noteKey = (id) => 'note-' + id + '.json'
function fmtDate(ts) {
  if (!ts) return ''
  const d = new Date(ts); const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const yr = d.getFullYear() === now.getFullYear() ? undefined : 'numeric'
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: yr })
}
function snippetFromHtml(html) {
  return NM.htmlToText(html, 90)
}
function mmss(secs) {
  const s = Math.max(0, Math.round(secs))
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
}
const DEFAULT_FOCUS = { workMin: 25, shortMin: 5, longMin: 15, rounds: 0 }
const NOTE_DRAG = 'application/x-inkwell-note'
const isNoteDrag = (e) => [...(e.dataTransfer?.types || [])].includes(NOTE_DRAG)

// A note card's image thumbnail (bytes load lazily, from cache when possible).
function Thumb({ refId }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let on = true
    imageDataUrl(refId).then((u) => { if (on) setUrl(u) }).catch(() => {})
    return () => { on = false }
  }, [refId])
  return <span className="nm-card-thumb" aria-hidden="true" style={url ? { backgroundImage: `url("${url}")` } : null} />
}

// What "/" on an empty line can insert.
const INSERT_ITEMS = [
  { id: 'h1', icon: 'H1', label: 'Title', hint: '#' },
  { id: 'h2', icon: 'H2', label: 'Heading', hint: '##' },
  { id: 'p', icon: <Text width={14} height={14} />, label: 'Body text' },
  { id: 'ul', icon: '•', label: 'Bulleted list', hint: '-' },
  { id: 'ol', icon: '1.', label: 'Numbered list', hint: '1.' },
  { id: 'check', icon: <SquareCheckboxUnchecked width={14} height={14} />, label: 'Checklist', hint: '[]' },
  { id: 'quote', icon: <Quote width={14} height={14} />, label: 'Quote', hint: '>' },
  { id: 'code', icon: <Code width={14} height={14} />, label: 'Code block', hint: '```' },
  { id: 'hr', icon: <Minus width={14} height={14} />, label: 'Divider', hint: '---' },
  { id: 'table', icon: <TableFilled width={14} height={14} />, label: 'Table' },
  { id: 'image', icon: <ImageSquare width={14} height={14} />, label: 'Image' },
  { id: 'draw', icon: <Pencil width={14} height={14} />, label: 'Drawing' },
  { id: 'notelink', icon: <Link width={14} height={14} />, label: 'Link to a note', hint: '[[' },
]

// Toolbar button that keeps the caret in the note (mousedown would otherwise take focus).
function TB({ on, title, className = '', onClick, children }) {
  return (
    <button className={'nm-tbtn' + (className ? ' ' + className : '') + (on ? ' active' : '')} title={title} aria-label={title}
      aria-pressed={on == null ? undefined : !!on} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>{children}</button>
  )
}

/* =================================================================== */
export default function App() {
  const [mode, setMode] = useState('home')           // 'home' | 'notes' | 'tasks' | 'focus' | 'calendar'
  // Each of these is state that saves itself to its storage file (see store.js).
  const [projects, saveProjects, setProjects] = useSaved('projects.json', [])
  const [index, saveIndex, setIndex] = useSaved('index.json', [])
  const [tasks, saveTasks, setTasks] = useSaved('tasks.json', [])
  const [events, saveEvents, setEvents] = useSaved('events.json', [])
  const [focus, saveFocus, setFocus] = useSaved('focus.json', DEFAULT_FOCUS)
  const [settings, writeSettings, setSettings] = useSaved('settings.json', {})   // sort, calView, taskList
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState('all')
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState(null)
  const [active, setActive] = useState(null)
  const [editingProj, setEditingProj] = useState(null)
  const [sideOpen, setSideOpen] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [sort, setSort] = useState('edited')         // note list order
  const [texts, setTexts] = useState(null)           // full-text search: { noteId: plain text }
  const textsRef = useRef({})
  const textsTimer = useRef(null)
  const [confirm, setConfirm] = useState(null)       // { title, body, confirmLabel, onConfirm }
  const [trashPreview, setTrashPreview] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)

  const editorRef = useRef(null)
  const loadHtmlRef = useRef('')     // html to fill into the editor whenever it (re)mounts
  const saveTimer = useRef(null)
  const dirtyRef = useRef(false)
  const [fmt, setFmt] = useState({}) // active formatting state for toolbar highlighting

  /* ---------- initial load ---------- */
  useEffect(() => {
    let alive = true
    ;(async () => {
      let projs = await sget('projects.json', null)
      if (!Array.isArray(projs) || projs.length === 0) {
        projs = [{ id: uid(), name: 'Notes', createdAt: Date.now() }]
        await sset('projects.json', projs)
      }
      const [idx, tk, ev, fc, st] = await Promise.all([
        sget('index.json', []), sget('tasks.json', []), sget('events.json', []), sget('focus.json', DEFAULT_FOCUS), sget('settings.json', {}),
      ])
      if (!alive) return
      setProjects(projs)
      setIndex(Array.isArray(idx) ? idx : [])
      setTasks(TM.normalizeTasks(tk))
      const nev = CM.normalizeEvents(Array.isArray(ev) ? ev : [])
      setEvents(nev.list)
      if (nev.changed) sset('events.json', nev.list)
      setFocus({ ...DEFAULT_FOCUS, ...(fc || {}) })
      if (st && typeof st === 'object') setSettings(st)
      if (st && NM.SORTS.some((x) => x.id === st.sort)) setSort(st.sort)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [])

  const saveSettings = (patch) => writeSettings((prev) => ({ ...prev, ...patch }))
  const changeSort = (value) => { setSort(value); saveSettings({ sort: value }) }

  /* ---------- full-text search (search.json, loaded after first paint) ---------- */
  const saveTextsSoon = () => {
    clearTimeout(textsTimer.current)
    textsTimer.current = setTimeout(() => sset('search.json', textsRef.current), 1500)
  }
  const setNoteText = useCallback((id, text) => {
    if (textsRef.current[id] === text) return
    textsRef.current = { ...textsRef.current, [id]: text }
    setTexts(textsRef.current)
    saveTextsSoon()
  }, [])
  const dropNoteText = useCallback((id) => {
    if (!(id in textsRef.current)) return
    const next = { ...textsRef.current }
    delete next[id]
    textsRef.current = next
    setTexts(next)
    saveTextsSoon()
  }, [])
  useEffect(() => {
    if (loading) return
    let alive = true
    const t = setTimeout(async () => {
      const saved = await sget('search.json', {})
      if (!alive) return
      textsRef.current = { ...(saved && typeof saved === 'object' ? saved : {}), ...textsRef.current }
      setTexts(textsRef.current)
      // Background backfill for notes saved before full-text search or list
      // metadata (thumbnail, checklist progress, links, words) existed.
      const missing = index.filter((r) => !(r.id in textsRef.current) || r.mv !== NM.META_VERSION).map((r) => r.id)
      const startTexts = textsRef.current
      const metas = {}
      for (let i = 0; i < missing.length && alive; i += 4) {
        const batch = await Promise.all(missing.slice(i, i + 4).map(async (id) => [id, (await sget(noteKey(id), null))?.html || '']))
        for (const [id, html] of batch) {
          if (textsRef.current[id] === startTexts[id]) textsRef.current = { ...textsRef.current, [id]: NM.htmlToText(html) }   // a save meanwhile wins
          metas[id] = NM.noteMeta(html)
        }
      }
      if (alive && missing.length) {
        setTexts(textsRef.current); sset('search.json', textsRef.current)
        saveIndex((prev) => prev.map((r) => (metas[r.id] && r.mv !== NM.META_VERSION ? { ...r, ...metas[r.id] } : r)))
      }
    }, 400)
    return () => { alive = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  /* ---------- derived ---------- */
  const list = useMemo(() => NM.listNotes(index, { sel, query, sort, texts }), [index, sel, query, sort, texts])
  const visibleCount = list.pinned.length + list.others.length
  const liveCount = useMemo(() => NM.liveNotes(index).length, [index])
  const trash = useMemo(() => NM.trashedNotes(index), [index])
  const counts = useMemo(() => {
    const m = {}
    for (const r of index) if (!r.deletedAt) m[r.projectId] = (m[r.projectId] || 0) + 1
    return m
  }, [index])

  const [clock, setClock] = useState(() => new Date())   // ticks each minute so day-based lists roll over
  useEffect(() => { const iv = setInterval(() => setClock(new Date()), 60000); return () => clearInterval(iv) }, [])
  const taskCounts = useMemo(() => TM.counts(tasks, clock), [tasks, clock])
  const currentProjectName = sel === 'all' ? 'All Notes' : sel === 'trash' ? 'Recently Deleted' : (projects.find((p) => p.id === sel)?.name || 'Notes')
  const projName = (id) => projects.find((p) => p.id === id)?.name

  /* ---------- open-note info: outline, word count (refreshed shortly after edits) ---------- */
  const [docInfo, setDocInfo] = useState({ outline: [], words: 0, chars: 0, v: 0 })
  const docInfoTimer = useRef(null)
  const refreshDocInfo = useCallback(() => {
    clearTimeout(docInfoTimer.current)
    docInfoTimer.current = setTimeout(() => {
      const ed = editorRef.current
      if (!ed) return
      const text = (ed.innerText || '').replace(/\s+/g, ' ').trim()
      setDocInfo((p) => ({
        outline: ED.headingsOf(ed).map((h, i) => ({ i, level: +h.tagName[1], text: h.textContent.trim() })),
        words: text ? text.split(' ').length : 0, chars: text.length, v: p.v + 1,
      }))
    }, 200)
  }, [])
  const indexRef = useRef(index)
  indexRef.current = index
  const noteTitleOf = (id) => { const r = indexRef.current.find((x) => x.id === id && !x.deletedAt); return r ? (r.title || '') : null }
  const beforeInputRef = useRef(null)

  /* ---------- note save (debounced) ---------- */
  const flushSave = useCallback(async () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    if (!dirtyRef.current || !activeId) return
    // Only ever save the note the editor is showing: an older save (from before a
    // note switch) must not write the new note's text into the previous note.
    const ed = editorRef.current
    const titleEl = document.getElementById('nm-title-input')
    if ((ed && ed.getAttribute('data-note') !== activeId) || (titleEl && titleEl.getAttribute('data-note') !== activeId)) return
    dirtyRef.current = false
    const html = ed ? ED.serializeEditor(ed) : (active?.html || '')
    const title = titleEl ? titleEl.value : (active?.title || '')
    const now = Date.now()
    const note = {
      id: activeId, title, html,
      projectId: active?.projectId || ((sel !== 'all' && sel !== 'trash') ? sel : projects[0]?.id),
      createdAt: active?.createdAt || now, updatedAt: now,
    }
    setNoteText(activeId, NM.htmlToText(html))
    if (!(await sset(noteKey(activeId), note))) {
      // Keep the change and try again shortly, and say so (never lose an edit silently).
      dirtyRef.current = true
      setToast({ title: 'Couldn’t save your note', body: 'Your changes are kept and will be saved again in a few seconds.', icon: 'warn' })
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => flushSaveRef.current?.(), 4000)
      return
    }
    setActive((a) => (a && a.id === note.id ? note : a))
    saveIndex((prev) => {
      const old = prev.find((r) => r.id === note.id) || {}   // keep pinned / other flags
      const meta = { ...old, id: note.id, title, projectId: note.projectId, snippet: snippetFromHtml(html), createdAt: note.createdAt, updatedAt: now, ...NM.noteMeta(html) }
      return prev.some((r) => r.id === note.id) ? prev.map((r) => (r.id === note.id ? meta : r)) : [...prev, meta]
    })
  }, [activeId, active, sel, projects])

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true
    refreshDocInfo()
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { flushSave() }, 500)
  }, [flushSave, refreshDocInfo])

  useEffect(() => () => { flushSave() }, [flushSave])
  // Save right away when the app is hidden or closed (otherwise the last half second of typing could be lost).
  const flushSaveRef = useRef(null)
  flushSaveRef.current = flushSave
  useEffect(() => {
    const now = () => flushSaveRef.current?.()
    const onVis = () => { if (document.visibilityState === 'hidden') now() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', now)
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', now) }
  }, [])

  /* ---------- note actions ---------- */
  // A note's saved file plus its list entry; title falls back to the list so a note never shows blank.
  const readNote = async (id, { hydrate = false } = {}) => {
    const file = await sget(noteKey(id), null)
    const meta = index.find((r) => r.id === id)
    const html = file?.html ? (hydrate ? await ED.hydrateHtml(file.html, imageDataUrl) : file.html) : ''
    return { file, meta, title: file?.title || meta?.title || '', html }
  }
  // Change fields in a note's saved file (e.g. its project) without opening it.
  const patchNoteFile = async (id, patch) => {
    const file = await sget(noteKey(id), null)
    if (file && Object.keys(patch).some((k) => file[k] !== patch[k])) await sset(noteKey(id), { ...file, ...patch })
  }
  const closeNote = () => { setActiveId(null); setActive(null); setShowEditor(false) }
  const openNote = useCallback(async (id) => {
    await flushSave()
    const note = await sget(noteKey(id), null)
    const meta = index.find((r) => r.id === id)
    // Fall back to index metadata so a note never opens blank (incl. bodies lost to the old key bug).
    const resolved = note || (meta
      ? { id, title: meta.title || '', html: '', projectId: meta.projectId, createdAt: meta.createdAt, updatedAt: meta.updatedAt }
      : { id, title: '', html: '', projectId: null, createdAt: Date.now(), updatedAt: Date.now() })
    loadHtmlRef.current = resolved.html || ''
    setMode('notes'); setActive(resolved); setActiveId(id); setShowEditor(true)
  }, [flushSave, index])

  // Fill the editor whenever it mounts for a note (stable callback → runs only on real mount/unmount).
  const setEditorEl = useCallback((el) => {
    editorRef.current = el
    if (el) {
      el.innerHTML = loadHtmlRef.current || ''
      ED.normalizeBlocks(el)               // tidy structure saved by older versions (stray empty lines)
      ED.hydrateImages(el, imageDataUrl)   // image bytes load after the text, from cache when possible
      ED.refreshNoteLinks(el, noteTitleOf) // links show their note's current title
      syncTaskLines(el)                    // checklist lines made into tasks mirror the task
      el.addEventListener('beforeinput', (e) => beforeInputRef.current?.(e))
      refreshDocInfo()
    }
  }, [])
  // Keep the pending html current so a re-mount (e.g. returning from Tasks/Calendar) restores the latest body.
  useEffect(() => { loadHtmlRef.current = active?.html || '' }, [active])

  const newNote = useCallback(async () => {
    await flushSave()
    const now = Date.now(); const projectId = (sel !== 'all' && sel !== 'trash') ? sel : projects[0]?.id; const id = uid()
    const note = { id, title: '', html: '', projectId, createdAt: now, updatedAt: now }
    await sset(noteKey(id), note)
    saveIndex((prev) => [{ id, title: '', projectId, snippet: '', createdAt: now, updatedAt: now, ...NM.noteMeta('') }, ...prev])
    loadHtmlRef.current = ''
    setMode('notes'); if (sel === 'trash') setSel('all'); setTrashPreview(null); setActiveId(id); setActive(note); setShowEditor(true)
    requestAnimationFrame(() => { document.getElementById('nm-title-input')?.focus() })
  }, [flushSave, sel, projects, saveIndex])

  /* ---------- delete / restore / pin / move ---------- */
  // Permanent delete: note file, its images, its search text.
  const deleteForever = useCallback(async (id) => {
    if (activeId === id) {
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
      dirtyRef.current = false
    }
    const saved = await sget(noteKey(id), null)
    const refs = new Set(ED.imageRefsInHtml(saved?.html || ''))
    if (activeId === id && editorRef.current) ED.imageRefsInHtml(ED.serializeEditor(editorRef.current)).forEach((r) => refs.add(r))
    refs.forEach((r) => removeImage(r))
    await sremove(noteKey(id))
    saveIndex((prev) => prev.filter((r) => r.id !== id))
    dropNoteText(id)
    if (activeId === id) closeNote()
    setTrashPreview((p) => (p && p.id === id ? null : p))
  }, [activeId, saveIndex, dropNoteText])

  // Restore from Recently Deleted (back into its project, or the first one if that project is gone).
  const restoreNote = useCallback(async (id) => {
    const r = index.find((x) => x.id === id)
    const home = r && projects.some((p) => p.id === r.projectId) ? r.projectId : projects[0]?.id
    if (r && home && home !== r.projectId) await patchNoteFile(id, { projectId: home })
    saveIndex((prev) => prev.map((x) => {
      if (x.id !== id) return x
      const { deletedAt, ...rest } = x
      return { ...rest, projectId: home || rest.projectId }
    }))
    setTrashPreview((p) => (p && p.id === id ? null : p))
  }, [index, projects, saveIndex])

  // Delete = move to Recently Deleted for 30 days, with Undo.
  const trashNote = useCallback(async (id) => {
    if (activeId === id) { await flushSave(); closeNote() }
    const now = Date.now()
    saveIndex((prev) => prev.map((r) => (r.id === id ? { ...r, deletedAt: now } : r)))
    setToast({ title: 'Moved to Recently Deleted', body: 'You can restore it for 30 days.', icon: 'trash',
      action: { label: 'Undo', run: () => restoreNote(id) } })
  }, [activeId, flushSave, saveIndex, restoreNote])

  const togglePin = useCallback((id) => {
    saveIndex((prev) => prev.map((r) => (r.id === id ? { ...r, pinned: !r.pinned } : r)))
  }, [saveIndex])

  const moveNote = useCallback(async (id, projectId) => {
    if (!id || !projectId) return
    if (id === activeId) await flushSave()
    await patchNoteFile(id, { projectId })
    if (id === activeId) setActive((a) => (a ? { ...a, projectId } : a))
    saveIndex((prev) => prev.map((r) => (r.id === id ? { ...r, projectId } : r)))
  }, [activeId, flushSave, saveIndex])

  const openTrashPreview = useCallback(async (id) => {
    const { title, html } = await readNote(id, { hydrate: true })
    setTrashPreview({ id, title, html })
    setShowEditor(true)
  }, [index])

  const emptyTrash = () => {
    const ids = NM.trashedNotes(index).map((r) => r.id)
    if (!ids.length) return
    setConfirm({
      title: `Delete ${ids.length} note${ids.length === 1 ? '' : 's'} forever?`,
      body: 'They’ll be removed together with their images. This can’t be undone.',
      confirmLabel: 'Delete forever',
      onConfirm: () => ids.forEach((id) => deleteForever(id)),
    })
  }

  // Notes older than 30 days in Recently Deleted are removed for good.
  useEffect(() => {
    if (loading) return
    NM.expiredTrash(index).forEach((r) => deleteForever(r.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  /* ---------- project actions ---------- */
  const addProject = useCallback(() => {
    const p = { id: uid(), name: 'New Project', createdAt: Date.now() }
    saveProjects((prev) => [...prev, p]); setMode('notes'); setSel(p.id); setEditingProj(p.id)
  }, [saveProjects])
  const renameProject = useCallback((id, name) => {
    saveProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)))
  }, [saveProjects])
  // Deleting a project moves its notes to Recently Deleted; its tasks/events stay (without a project).
  const deleteProject = useCallback(async (pid) => {
    if (projects.length <= 1) return
    if (active && active.projectId === pid) { await flushSave(); closeNote() }
    const now = Date.now()
    saveIndex((prev) => prev.map((r) => (r.projectId === pid && !r.deletedAt ? { ...r, deletedAt: now } : r)))
    saveProjects((prev) => prev.filter((p) => p.id !== pid))
    saveTasks((list) => (list.some((t) => t.projectId === pid) ? list.map((t) => (t.projectId === pid ? { ...t, projectId: null } : t)) : list))
    saveEvents((list) => (list.some((e) => e.projectId === pid) ? list.map((e) => (e.projectId === pid ? { ...e, projectId: null } : e)) : list))
    if (sel === pid) setSel('all')
  }, [projects, active, flushSave, saveIndex, saveProjects, saveTasks, saveEvents, sel])
  const askDeleteProject = (p) => {
    const n = NM.liveNotes(index).filter((r) => r.projectId === p.id).length
    setConfirm({
      title: `Delete “${p.name}”?`,
      body: n
        ? `Its ${n} note${n === 1 ? '' : 's'} will move to Recently Deleted, where you can restore them for 30 days. Tasks and events in this project are kept.`
        : 'This project has no notes. Tasks and events in it are kept.',
      confirmLabel: 'Delete project',
      onConfirm: () => deleteProject(p.id),
    })
  }

  /* ---------- rich-text commands ---------- */
  const focusEditor = () => editorRef.current?.focus()
  // Reflect the caret's current formatting in the toolbar.
  const refreshFmt = useCallback(() => {
    const ed = editorRef.current
    const sel = window.getSelection()
    if (!ed || !sel || !sel.anchorNode || !ed.contains(sel.anchorNode)) return
    let block = sel.anchorNode; if (block.nodeType === 3) block = block.parentNode
    const inChecklist = !!(block.closest && block.closest('ul.nm-check'))
    showTaskChipFor(block.closest && block.closest('ul.nm-check > li'))
    let heading = ''
    const h = block.closest && block.closest('h1,h2')
    if (h) heading = h.tagName.toLowerCase()
    let state = {}
    try {
      state = {
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        ul: document.queryCommandState('insertUnorderedList') && !inChecklist,
        ol: document.queryCommandState('insertOrderedList'),
        check: inChecklist,
        h1: heading === 'h1',
        h2: heading === 'h2',
        strike: document.queryCommandState('strikeThrough'),
        mark: !!(block.closest && block.closest('mark')),
        quote: !!(block.closest && block.closest('blockquote')),
        code: !!(block.closest && block.closest('pre')),
      }
    } catch { state = {} }
    setFmt((prev) => {
      const keys = ['bold', 'italic', 'underline', 'ul', 'ol', 'check', 'h1', 'h2', 'strike', 'mark', 'quote', 'code']
      if (keys.every((k) => !!prev[k] === !!state[k])) return prev
      return state
    })
  }, [])
  const exec = (cmd, val = null) => {
    const ed = editorRef.current
    focusEditor()
    ED.preserveCaret(ed, () => { document.execCommand(cmd, false, val); ED.normalizeBlocks(ed) })
    scheduleSave(); refreshFmt()
  }
  const setBlock = (tag) => {
    const ed = editorRef.current
    focusEditor()
    ED.preserveCaret(ed, () => { document.execCommand('formatBlock', false, tag); ED.normalizeBlocks(ed) })
    scheduleSave(); refreshFmt()
  }
  // Enter can change structure: untick new checklist items, keep lists out of paragraphs.
  const onEditorInput = (e) => {
    const ed = editorRef.current
    const type = e.nativeEvent && e.nativeEvent.inputType
    if (ed && type === 'insertParagraph') { ED.afterInput(ed, type); ED.normalizeBlocks(ed) }
    if (type === 'insertText' || type === 'insertCompositionText' || (type && type.startsWith('delete'))) updateTriggers()
    else setPopup(null)
    scheduleSave()
    refreshFmt()
  }
  // Keep the toolbar in sync as the caret moves.
  useEffect(() => {
    const h = () => {
      const sel = window.getSelection()
      if (editorRef.current && sel && sel.anchorNode && editorRef.current.contains(sel.anchorNode)) refreshFmt()
    }
    document.addEventListener('selectionchange', h)
    return () => document.removeEventListener('selectionchange', h)
  }, [refreshFmt])
  // Block inserts (table / image / drawing) always land as their own top-level
  // block, never nested inside a list — see editor-dom.js.
  const insertTable = () => {
    const ed = editorRef.current
    if (!ed) return
    const { table, firstCell } = ED.buildTable(3, 3)
    ED.insertBlocks(ed, [table], { caretTarget: firstCell })
    scheduleSave()
  }
  const toggleChecklist = () => { const ed = editorRef.current; if (!ed) return; ED.toggleChecklist(ed); scheduleSave(); refreshFmt() }
  const toggleBullets = () => { const ed = editorRef.current; if (!ed) return; ED.toggleBullets(ed); scheduleSave(); refreshFmt() }

  /* ---------- images + drawing ---------- */
  const imgInputRef = useRef(null)
  const insertAnchorRef = useRef(null)               // block to insert after, captured before focus leaves the editor
  const [busy, setBusy] = useState('')
  const [drawState, setDrawState] = useState(null)   // { target, baseUrl } while the drawing pad is open
  const [lightbox, setLightbox] = useState(null)     // { url, name }
  const captureAnchor = () => {
    const ed = editorRef.current
    insertAnchorRef.current = ed ? ED.topLevelBlockAtCaret(ed) : null
  }
  const showError = (title, err) => setToast({ title, body: err?.message || String(err || ''), icon: 'warn' })

  const insertImageFiles = async (files) => {
    const ed = editorRef.current
    const list = [...files].filter((f) => /^image\//.test(f.type))
    if (!ed || !list.length) return
    setBusy(list.length > 1 ? `Adding ${list.length} images…` : 'Adding image…')
    let anchor = insertAnchorRef.current
    try {
      for (const f of list) {
        const { blob, ext } = await prepareImage(f)
        const ref = await saveImage(blob, ext)
        if (editorRef.current !== ed) break          // switched notes mid-upload
        const node = ED.buildMedia(ref, { src: await imageDataUrl(ref) })
        ED.insertBlocks(ed, [node], { anchor })
        anchor = node
        scheduleSave()
      }
    } catch (err) {
      showError('Couldn’t add image', err)
    } finally {
      setBusy('')
      insertAnchorRef.current = null
    }
  }

  const openDrawPad = async (target) => {
    if (!target) { captureAnchor(); setDrawState({ target: null, baseUrl: null }); return }
    // Editing: the original must be loaded first, or saving would replace it with only the new strokes.
    const img = target.querySelector('img')
    let url = img && img.getAttribute('src')
    if (!url && img) { try { url = await imageDataUrl(img.getAttribute('data-img')) } catch { url = null } }
    if (!url) { setToast({ title: 'Couldn’t open this drawing', body: 'Its image isn’t available right now.', icon: 'warn' }); return }
    setDrawState({ target, baseUrl: url })
  }
  const closeDrawPad = () => { setDrawState(null); insertAnchorRef.current = null }
  const saveDrawing = async (blob) => {
    const ed = editorRef.current
    const ref = await saveImage(blob, 'png')
    const url = await imageDataUrl(ref)
    const target = drawState?.target
    if (ed && target && ed.contains(target)) {
      const img = target.querySelector('img')
      const oldRef = img.getAttribute('data-img')
      img.setAttribute('data-img', ref)
      img.src = url
      dirtyRef.current = true
      await flushSave()                               // persist the new reference before dropping the old file
      if (oldRef && oldRef !== ref) removeImage(oldRef)
    } else if (ed) {
      ED.insertBlocks(ed, [ED.buildMedia(ref, { drawing: true, src: url })], { anchor: insertAnchorRef.current })
      scheduleSave()
    }
    closeDrawPad()
  }

  // Clicks: select an image, or tick a checklist box.
  const onEditorClick = (e) => {
    const ed = editorRef.current
    if (!ed) return
    const media = e.target.closest && e.target.closest('.nm-media')
    if (media && ed.contains(media)) { ED.selectMedia(ed, media); return }
    ED.selectMedia(ed, null)
    const link = e.target.closest && e.target.closest('a')
    if (link && ed.contains(link)) {
      e.preventDefault()
      if (link.classList.contains('nm-nlink')) {
        const id = link.getAttribute('data-note')
        if (noteTitleOf(id) != null) openNote(id)
        else setToast({ title: 'That note no longer exists', body: 'It may be in Recently Deleted.', icon: 'warn' })
      } else if (/^(https?:|mailto:)/i.test(link.getAttribute('href') || '')) window.open(link.getAttribute('href'), '_blank', 'noopener')
      return
    }
    const fold = ED.foldTargetAt(ed, e)
    if (fold) { e.preventDefault(); ED.toggleFold(ed, fold); return }
    const taskLi = e.target.closest && e.target.closest('ul.nm-check > li[data-task]')
    if (taskLi && taskLi.getBoundingClientRect().right - e.clientX < 26) { e.preventDefault(); openTask(taskLi.getAttribute('data-task')); return }
    if (ED.handleChecklistClick(e)) {
      const li = e.target.closest('li')
      const tid = li && li.getAttribute('data-task')
      const t = tid && tasks.find((x) => x.id === tid)
      if (t && t.done !== (li.getAttribute('data-checked') === 'true')) toggleTask(tid)
      scheduleSave()
    }
  }
  // Double-click: edit a drawing, or view an image full size.
  const onEditorDoubleClick = (e) => {
    const ed = editorRef.current
    const media = e.target.closest && e.target.closest('.nm-media')
    if (!ed || !media || !ed.contains(media)) return
    e.preventDefault()
    if (media.hasAttribute('data-drawing')) openDrawPad(media)
    else {
      const src = media.querySelector('img')?.getAttribute('src')
      if (src) setLightbox({ url: src, name: 'Image' })
    }
  }
  // Keys: insert-menu navigation, formatting shortcuts, Enter in quotes/code/dividers,
  // and with an image selected: Delete/Backspace removes it, Enter adds a line after it.
  const onEditorKeyDown = (e) => {
    const ed = editorRef.current
    if (popup) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const n = popup.items.length
        if (n) setPopup({ ...popup, active: (popup.active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n })
        return
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && popup.items.length) { e.preventDefault(); pickPopup(popup.active); return }
      if (e.key === 'Escape') { e.preventDefault(); setPopup(null); return }
    }
    const mod = e.metaKey || e.ctrlKey
    const k = e.key.toLowerCase()
    if (mod && e.shiftKey && k === 'x') { e.preventDefault(); exec('strikeThrough'); return }
    if (mod && e.shiftKey && k === 'h') { e.preventDefault(); if (ED.toggleHighlight(ed)) afterEdit(); return }
    if (mod && !e.shiftKey && k === 'k') { e.preventDefault(); openLinkPrompt(); return }
    if (mod && e.shiftKey && e.code === 'Digit7') { e.preventDefault(); exec('insertOrderedList'); return }
    if (mod && e.shiftKey && e.code === 'Digit8') { e.preventDefault(); toggleBullets(); return }
    if (mod && e.shiftKey && e.code === 'Digit9') { e.preventDefault(); toggleChecklist(); return }
    if (e.key === 'Enter' && !e.shiftKey && !mod && !ED.selectedMedia(ed) && ED.handleBlockEnter(ed)) { e.preventDefault(); afterEdit(); return }
    const media = ED.selectedMedia(ed)
    if (!media) return
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault(); ED.removeMedia(ed, media); scheduleSave()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const p = document.createElement('p'); p.innerHTML = '<br>'
      media.after(p); ED.selectMedia(ed, null); ED.placeCaret(p); scheduleSave()
    } else if (e.key !== 'Shift' && e.key !== 'Control' && e.key !== 'Meta' && e.key !== 'Alt') {
      ED.selectMedia(ed, null)
    }
  }
  // Paste: images become image blocks; a link over selected text links it; HTML keeps
  // simple formatting only (see ED.cleanPastedHtml); everything else is plain text.
  const onPaste = (e) => {
    const cd = e.clipboardData || window.clipboardData
    const files = [...(cd?.files || [])].filter((f) => /^image\//.test(f.type))
    e.preventDefault()
    if (files.length) { captureAnchor(); insertImageFiles(files); return }
    const ed = editorRef.current
    const html = cd ? cd.getData('text/html') : ''
    const text = cd ? cd.getData('text/plain') : ''
    const sel = window.getSelection()
    if (/^(https?:\/\/|mailto:)\S+$/i.test(text.trim()) && sel && !sel.isCollapsed) {
      document.execCommand('createLink', false, text.trim())        // paste a link over selected text
    } else if (html && !ED.caretElement()?.closest('pre')) {
      document.execCommand('insertHTML', false, ED.cleanPastedHtml(html))
      ED.normalizeBlocks(ed)
    } else {
      document.execCommand('insertText', false, text)
    }
    afterEdit()
  }
  const internalDrag = useRef(false)                 // text being moved within the note
  const onDragOver = (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault() }
  const onDrop = (e) => {
    const files = [...(e.dataTransfer?.files || [])].filter((f) => /^image\//.test(f.type))
    if (internalDrag.current && !files.length) return
    const html = files.length ? '' : e.dataTransfer?.getData('text/html')
    const text = files.length ? '' : e.dataTransfer?.getData('text/plain')
    if (!files.length && !html && !text) return
    e.preventDefault()
    const at = document.caretRangeFromPoint?.(e.clientX, e.clientY)
    if (at) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(at) }
    if (files.length) { captureAnchor(); insertImageFiles(files); return }
    editorRef.current?.focus()
    if (html) { document.execCommand('insertHTML', false, ED.cleanPastedHtml(html)); ED.normalizeBlocks(editorRef.current) }
    else document.execCommand('insertText', false, text)
    afterEdit()
  }

  /* ---------- writing tools: "/" menu, [[ links, shortcuts, links, find, export ---------- */
  const [popup, setPopup] = useState(null)            // { kind: 'slash' | 'note', typed, items, active, rect }
  const [linkPrompt, setLinkPrompt] = useState(null)  // { rect, range }
  const [findOpen, setFindOpen] = useState(false)
  const [taskChip, setTaskChip] = useState(null)      // { top, left } of the "Make task" chip
  const taskChipLi = useRef(null)
  const panelOpen = settings.notePanel ?? (typeof window !== 'undefined' && window.innerWidth > 1100)
  const afterEdit = () => { scheduleSave(); refreshFmt() }

  const caretRect = () => {
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return null
    let r = sel.getRangeAt(0).getBoundingClientRect()
    if (!r || (!r.top && !r.left)) r = ED.caretElement()?.getBoundingClientRect()
    return r ? { top: r.top, bottom: r.bottom, left: r.left } : null
  }
  // Insert one kind of block (from the "/" menu or a typing shortcut).
  const runBlock = (id) => {
    const ed = editorRef.current
    if (!ed) return
    if (id === 'h1' || id === 'h2' || id === 'p') setBlock(id)
    else if (id === 'ul') toggleBullets()
    else if (id === 'ol') exec('insertOrderedList')
    else if (id === 'check') toggleChecklist()
    else if (id === 'quote') { ED.setLineTag(ed, 'blockquote'); afterEdit() }
    else if (id === 'code') { ED.setLineTag(ed, 'pre'); afterEdit() }
    else if (id === 'hr') { ED.insertDivider(ed); afterEdit() }
    else if (id === 'table') insertTable()
    else if (id === 'image') { captureAnchor(); imgInputRef.current?.click() }
    else if (id === 'draw') openDrawPad(null)
    else if (id === 'notelink') { document.execCommand('insertText', false, '[['); updateTriggers() }
  }
  // After typing: "/" alone on a line opens the insert menu; "[[" opens the note picker.
  const updateTriggers = () => {
    const ed = editorRef.current
    ED.ensureLine(ed)
    const info = ED.textBeforeCaret(ed)
    if (!info || info.line.tagName === 'PRE') { setPopup(null); return }
    const whole = info.line.textContent.replace(/ /g, ' ').trim()
    let m
    if ((m = info.text.match(/^\/([^\s/]*)$/)) && whole === info.text.trim()) {
      const q = m[1].toLowerCase()
      const items = INSERT_ITEMS.filter((x) => !q || x.label.toLowerCase().includes(q) || x.id.startsWith(q))
      setPopup((p) => ({ kind: 'slash', typed: info.text.length, items, active: p && p.kind === 'slash' ? Math.min(p.active, Math.max(0, items.length - 1)) : 0, rect: p && p.kind === 'slash' ? p.rect : caretRect() }))
    } else if ((m = info.text.match(/\[\[([^\][]{0,60})$/))) {
      const q = m[1].toLowerCase().trim()
      const items = NM.sortNotes(NM.liveNotes(index).filter((r) => r.id !== activeId && (r.title?.trim() || 'Untitled').toLowerCase().includes(q)), 'edited')
        .slice(0, 8).map((r) => ({ id: r.id, icon: <Notepad width={14} height={14} />, label: r.title?.trim() || 'Untitled' }))
      setPopup((p) => ({ kind: 'note', typed: m[0].length, items, active: p && p.kind === 'note' ? Math.min(p.active, Math.max(0, items.length - 1)) : 0, rect: p && p.kind === 'note' ? p.rect : caretRect() }))
    } else setPopup(null)
  }
  const pickPopup = (i) => {
    const p = popup
    const it = p && p.items[i]
    setPopup(null)
    const ed = editorRef.current
    if (!it || !ed) return
    ed.focus()
    if (p.kind === 'slash') { ED.deleteBeforeCaret(ed, p.typed); runBlock(it.id) }
    else { ED.insertNoteLinkAtCaret(ed, p.typed, it.id, it.label); afterEdit() }
  }
  // "# ", "- ", "[] " … at the start of a line (the space completes the shortcut).
  beforeInputRef.current = (e) => {
    if (e.inputType !== 'insertText' || e.data !== ' ') return
    const ed = editorRef.current
    ED.ensureLine(ed)
    const sc = ED.shortcutAtCaret(ed)
    if (!sc) return
    e.preventDefault()
    ED.deleteBeforeCaret(ed, sc.length)
    if (sc.kind === 'ul' || sc.kind === 'ol' || sc.kind === 'check') { if (ED.lineToList(ed, sc.kind)) afterEdit() }
    else runBlock(sc.kind)
  }
  const openLinkPrompt = () => {
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount || !editorRef.current?.contains(sel.anchorNode)) return
    setLinkPrompt({ rect: caretRect(), range: sel.getRangeAt(0).cloneRange() })
  }
  const applyLink = (url) => {
    const { range } = linkPrompt
    setLinkPrompt(null)
    const ed = editorRef.current
    if (!ed) return
    ed.focus()
    const sel = window.getSelection()
    sel.removeAllRanges(); sel.addRange(range)
    if (range.collapsed) document.execCommand('insertHTML', false, `<a href="${url.replace(/"/g, '&quot;')}">${url.replace(/</g, '&lt;')}</a>&nbsp;`)
    else document.execCommand('createLink', false, url)
    afterEdit()
  }

  // Checklist line -> task. The line keeps data-task and mirrors the task's done state.
  const syncTaskLines = (root) => {
    if (!root) return false
    let changed = false
    root.querySelectorAll('ul.nm-check > li[data-task]').forEach((li) => {
      const t = tasksRef.current.find((x) => x.id === li.getAttribute('data-task'))
      if (!t) { li.removeAttribute('data-task'); changed = true; return }
      const want = t.done ? 'true' : 'false'
      if ((li.getAttribute('data-checked') === 'true' ? 'true' : 'false') !== want) { li.setAttribute('data-checked', want); changed = true }
    })
    return changed
  }
  const showTaskChipFor = (li) => {
    const ed = editorRef.current
    const ok = li && ed && ed.contains(li) && !li.hasAttribute('data-task') && li.getAttribute('data-checked') !== 'true' && li.textContent.trim()
    if (!ok) { if (taskChipLi.current) { taskChipLi.current = null; setTaskChip(null) } return }
    if (taskChipLi.current === li) return
    taskChipLi.current = li
    const doc = li.closest('.nm-doc')
    const dr = doc.getBoundingClientRect()
    const r = document.createRange(); r.selectNodeContents(li)
    const tr = r.getBoundingClientRect()
    setTaskChip({ top: tr.top - dr.top - 2, left: Math.min(tr.right - dr.left + 10, dr.width - 104) })
  }
  const makeTaskFromLine = () => {
    const li = taskChipLi.current
    if (!li || !activeId) return
    const text = li.textContent.replace(/\s+/g, ' ').trim()
    const t = addTask({ text, noteId: activeId, projectId: active?.projectId || null })
    li.setAttribute('data-task', t.id)
    taskChipLi.current = null; setTaskChip(null)
    scheduleSave()
    setToast({ title: 'Task created', body: text, icon: 'check', action: { label: 'Open', run: () => openTask(t.id) } })
  }
  // A task changed elsewhere: update its checklist line, in the open note or in its saved file.
  const syncNoteTaskLine = async (noteId, taskId, done) => {
    if (!noteId) return
    if (noteId === activeId && editorRef.current) return   // the open note syncs from the tasks effect below
    const file = await sget(noteKey(noteId), null)
    if (!file?.html || !file.html.includes(taskId)) return
    const div = document.createElement('div')
    div.innerHTML = file.html
    const li = div.querySelector(`li[data-task="${taskId}"]`)
    if (!li || (li.getAttribute('data-checked') === 'true') === done) return
    li.setAttribute('data-checked', done ? 'true' : 'false')
    await sset(noteKey(noteId), { ...file, html: div.innerHTML })
    const meta = NM.noteMeta(div.innerHTML)
    saveIndex((prev) => prev.map((r) => (r.id === noteId ? { ...r, checks: meta.checks } : r)))
  }
  useEffect(() => {
    const ed = editorRef.current
    if (ed && syncTaskLines(ed)) scheduleSave()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks])
  useEffect(() => { const ed = editorRef.current; if (ed) ED.refreshNoteLinks(ed, noteTitleOf) }, [index]) // eslint-disable-line
  useEffect(() => { setPopup(null); setLinkPrompt(null); setFindOpen(false); taskChipLi.current = null; setTaskChip(null) }, [activeId])
  // ⌘F / Ctrl+F finds in the open note.
  useEffect(() => {
    if (mode !== 'notes' || !activeId) return
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); setFindOpen(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, activeId])

  const exportNote = async () => {
    const w = openExportWindow()             // must open during the click
    if (!w) { setToast({ title: 'The export window was blocked', body: 'Allow pop-ups for Möbius, then try again.', icon: 'warn' }); return }
    await flushSave()
    const ed = editorRef.current
    const title = document.getElementById('nm-title-input')?.value || active?.title || ''
    const raw = ed ? ED.serializeEditor(ed) : (active?.html || '')
    fillExportWindow(w, { title, html: await ED.hydrateHtml(raw, imageDataUrl), markdown: htmlToMarkdown(title, raw) })
  }
  const jumpToHeading = (i) => {
    const ed = editorRef.current
    const h = ED.headingsOf(ed)[i]
    if (!h) return
    if (h.classList.contains('nm-hid')) ED.unfoldAll(ed)
    h.scrollIntoView({ block: 'start', behavior: 'smooth' })
    ED.placeCaret(h)
  }
  const linkedTasks = useMemo(() => (activeId ? tasks.filter((t) => t.noteId === activeId).map((t) => ({ ...t, dueLabel: t.due ? TM.dayLabel(t.due, clock) : '' })) : []), [tasks, activeId, clock])
  const linkedEvents = useMemo(() => (activeId ? events.filter((e) => e.noteId === activeId).map((e) => ({ ...e, when: relDay(e.date, clock, 'short') + (e.allDay ? '' : ' · ' + e.time) })) : []), [events, activeId, clock])
  const linkedNotes = useMemo(() => (activeId ? NM.backlinks(index, activeId) : []), [index, activeId])

  /* ---------- tasks ---------- */
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks
  const [taskFocus, setTaskFocus] = useState(null)     // { id, n }: ask Tasks to show a task
  // Undo puts the touched tasks back as they were and drops any it created.
  const offerUndo = (title, body, before, added = []) => setToast({
    title, body, icon: 'check',
    action: {
      label: 'Undo',
      run: () => {
        saveTasks((list) => {
          const old = new Map(before.map((t) => [t.id, t]))
          const kept = list.filter((t) => !added.includes(t.id)).map((t) => old.get(t.id) || t)
          return [...kept, ...before.filter((t) => !kept.some((k) => k.id === t.id))]
        })
        before.forEach((t) => syncNoteTaskLine(t.noteId, t.id, t.done))
      },
    },
  })
  const addTask = (fields) => {
    const t = TM.normalizeTask({ ...fields, id: uid(), done: false, createdAt: Date.now() })
    saveTasks((list) => [...list, t])
    return t
  }
  const updateTask = (id, patch, opts) => {
    const before = tasksRef.current.find((t) => t.id === id)
    if (!before) return
    saveTasks((list) => list.map((t) => (t.id === id ? TM.applyPatch(t, patch) : t)))
    if (opts?.undo) offerUndo(opts.undo, before.text, [before])
  }
  const toggleTask = (id) => {
    const t = tasksRef.current.find((x) => x.id === id)
    if (!t) return
    if (t.done) {
      // Reopening a repeating task takes back the next occurrence it created, if that is still untouched.
      const spawned = t.spawnedId && tasksRef.current.find((x) => x.id === t.spawnedId && !x.done && x.steps.every((s) => !s.done))
      saveTasks((list) => list.filter((x) => !spawned || x.id !== spawned.id).map((x) => (x.id === id ? { ...x, done: false, completedAt: null, spawnedId: null } : x)))
      syncNoteTaskLine(t.noteId, t.id, false)
      offerUndo('Moved back to open tasks', t.text, spawned ? [t, spawned] : [t])
      return
    }
    const next = TM.nextOccurrence(t, uid())
    saveTasks((list) => [...list.map((x) => (x.id === id ? { ...x, done: true, completedAt: Date.now(), spawnedId: next ? next.id : null } : x)), ...(next ? [next] : [])])
    syncNoteTaskLine(t.noteId, t.id, true)
    offerUndo('Completed', next ? `${t.text} · next one ${TM.dayLabel(next.due).toLowerCase()}` : t.text, [t], next ? [next.id] : [])
  }
  const deleteTask = (id) => {
    const t = tasksRef.current.find((x) => x.id === id)
    if (!t) return
    saveTasks((list) => list.filter((x) => x.id !== id))
    offerUndo('Task deleted', t.text, [t])
  }
  const moveOverdueToToday = () => {
    const today = dateKey()
    const before = tasksRef.current.filter((t) => TM.isOverdue(t, today))
    if (!before.length) return
    const ids = before.map((t) => t.id)
    saveTasks((list) => list.map((t) => (ids.includes(t.id) ? TM.applyPatch(t, { due: today }) : t)))
    offerUndo(`Moved ${ids.length} task${ids.length > 1 ? 's' : ''} to today`, null, before)
  }
  const openTask = (id) => { flushSave(); setMode('tasks'); setSideOpen(false); setTaskFocus({ id, n: Date.now() }) }

  const activeTasks = useMemo(() => tasks.filter((t) => !t.done).sort(TM.byDue), [tasks])
  const dueTasks = useMemo(() => {
    const today = dateKey(clock)
    return tasks.filter((t) => !t.done && t.due && t.due <= today).sort(TM.byDue)
  }, [tasks, clock])
  const nextTasks = useMemo(() => {
    const today = dateKey(clock)
    return tasks.filter((t) => !t.done && t.due && t.due > today).sort(TM.byDue).slice(0, 5)
  }, [tasks, clock])

  /* ---------- pomodoro ---------- */
  const [phase, setPhase] = useState('work')         // 'work' | 'short' | 'long'
  const [running, setRunning] = useState(false)
  const [secsLeft, setSecsLeft] = useState(DEFAULT_FOCUS.workMin * 60)
  const [focusTaskId, setFocusTaskId] = useState('')
  const endRef = useRef(0)
  const audioRef = useRef(null)
  const phaseMin = (p) => (p === 'work' ? focus.workMin : p === 'short' ? focus.shortMin : focus.longMin)
  const totalSecs = phaseMin(phase) * 60

  // keep secsLeft in sync with duration when idle
  useEffect(() => { if (!running) setSecsLeft(phaseMin(phase) * 60) /* eslint-disable-next-line */ }, [phase, focus.workMin, focus.shortMin, focus.longMin])

  // Bell: scheduled on the audio clock at Start so it rings on time even when
  // the tab is in the background (browser timers get throttled there).
  const bellRef = useRef(null)                 // { endsAt, cancel } for the pending end-of-phase bell
  const soundOn = focus.sound !== false
  const getAudio = () => {
    try {
      const C = window.AudioContext || window.webkitAudioContext
      if (!C) return null
      if (!audioRef.current) audioRef.current = new C()
      audioRef.current.resume?.()
      return audioRef.current
    } catch { return null }
  }
  const cancelBell = () => { bellRef.current?.cancel(); bellRef.current = null }
  const ring = useCallback((strikes = 1) => {
    if (focus.sound === false) return
    const ctx = getAudio()
    if (ctx) { try { playBell(ctx, { strikes }) } catch { /* audio unavailable */ } }
  }, [focus.sound])
  const beep = useCallback(() => ring(1), [ring])  // calendar reminders

  const onPhaseEnd = useCallback(() => {
    // If the scheduled bell couldn't play (audio was blocked), ring now instead.
    const scheduled = bellRef.current
    const ctx = audioRef.current
    if (!scheduled || !ctx || ctx.state !== 'running') { scheduled?.cancel(); ring(phase === 'work' ? 2 : 1) }
    bellRef.current = null
    setRunning(false)
    if (phase === 'work') {
      if (focusTaskId) saveTasks((list) => list.map((t) => (t.id === focusTaskId && !t.done ? { ...t, focus: (t.focus || 0) + 1 } : t)))
      const nextRounds = (focus.rounds || 0) + 1
      saveFocus((f) => ({ ...f, rounds: (f.rounds || 0) + 1, log: NM.addFocusSession(f.log, dateKey(), f.workMin) }))
      setPhase(nextRounds % 4 === 0 ? 'long' : 'short')
    } else setPhase('work')
  }, [ring, phase, focus, saveFocus, focusTaskId, saveTasks])

  useEffect(() => {
    if (!running) return
    const tick = () => {
      const left = Math.round((endRef.current - Date.now()) / 1000)
      if (left <= 0) { setSecsLeft(0); onPhaseEnd() } else setSecsLeft(left)
    }
    tick()
    const iv = setInterval(tick, 250)
    return () => clearInterval(iv)
  }, [running, onPhaseEnd])

  const startPause = () => {
    if (running) { setRunning(false); cancelBell(); return }
    const ctx = getAudio()                      // created/resumed inside the click, so audio is allowed
    endRef.current = Date.now() + secsLeft * 1000
    cancelBell()
    if (ctx && soundOn) {
      try { bellRef.current = playBell(ctx, { strikes: phase === 'work' ? 2 : 1, delay: secsLeft }) } catch { bellRef.current = null }
    }
    setRunning(true)
  }
  const resetTimer = () => { cancelBell(); setRunning(false); setSecsLeft(phaseMin(phase) * 60) }
  const switchPhase = (p) => { cancelBell(); setRunning(false); setPhase(p); setSecsLeft(phaseMin(p) * 60) }
  const toggleSound = () => {
    const next = !soundOn
    saveFocus({ ...focus, sound: next })
    if (!next) cancelBell()
    else {
      const ctx = getAudio()
      if (ctx) {
        try {
          playBell(ctx, { strikes: 1 })        // preview
          if (running) { cancelBell(); bellRef.current = playBell(ctx, { strikes: phase === 'work' ? 2 : 1, delay: Math.max(0, (endRef.current - Date.now()) / 1000) }) }
        } catch { /* audio unavailable */ }
      }
    }
  }
  const setFocusNum = (key, val) => {
    const n = parseInt(val, 10)
    if (!Number.isFinite(n)) return                       // field cleared while typing
    const max = key === 'workMin' ? 120 : 60
    saveFocus((f) => ({ ...f, [key]: Math.max(1, Math.min(max, n)) }))
  }

  const focusTask = tasks.find((t) => t.id === focusTaskId && !t.done)
  const ringC = 2 * Math.PI * 130
  const progress = totalSecs > 0 ? secsLeft / totalSecs : 0

  /* ---------- calendar + events ---------- */
  const todayKey = dateKey(clock)

  const [eventEdit, setEventEdit] = useState(null)    // the event open in the editor (its starting draft), or null
  const [toast, setToast] = useState(null)

  const eventsByDay = useMemo(() => CM.eventsByDate(events), [events])
  const [calFocus, setCalFocus] = useState(null)      // { id, n }: ask the calendar to show an event

  const createEvent = (draft) => {
    const ev = CM.normalizeEvent({ ...blankEvent(draft.date), ...draft, title: (draft.title || '').trim() || 'New event', id: uid() })
    saveEvents((list) => [...list, ev])
    return ev
  }
  const updateEventItem = (ev) => {
    const clean = CM.normalizeEvent(ev)
    saveEvents((list) => list.map((e) => (e.id === clean.id ? { ...clean, firedAt: (e.date !== clean.date || e.time !== clean.time) ? null : e.firedAt } : e)))
  }
  const removeEvent = (id) => {
    const stored = events.find((e) => e.id === id)
    ;(stored?.attachments || []).forEach((a) => removeAttachment(a.ref))
    saveEvents((list) => list.filter((e) => e.id !== id))
  }
  const askDeleteEvent = (ev, after) => {
    setConfirm({
      title: `Delete “${ev.title || 'Untitled event'}”?`,
      body: ev.attachments?.length ? 'Its attachments will be deleted too. This can’t be undone.' : 'This can’t be undone.',
      confirmLabel: 'Delete event',
      onConfirm: () => { removeEvent(ev.id); after?.() },
    })
  }
  const loadNoteExcerpt = async (id) => {
    const { title, html } = await readNote(id)
    return { title: title || 'Untitled', text: NM.htmlToText(html, 220) }
  }
  const openEventEditor = (d) => setEventEdit({ ...blankEvent(d.date), ...d, attachments: d.attachments || [] })
  const cycleProjectColor = (p) => {
    const cur = CM.projectColor(projects, p.id)
    const next = CM.PALETTE[(CM.PALETTE.indexOf(cur) + 1) % CM.PALETTE.length]
    saveProjects((prev) => prev.map((x) => (x.id === p.id ? { ...x, color: next } : x)))
  }

  function blankEvent(date) { return { id: null, title: '', date: date || todayKey, allDay: false, time: '09:00', end: '10:00', details: '', projectId: null, noteId: null, remind: false, remindLead: 10, firedAt: null, attachments: [] } }

  // Called by the editor once the draft is valid.
  const saveEvent = (draft) => {
    const stored = draft.id ? events.find((e) => e.id === draft.id) : null
    const clean = CM.normalizeEvent({ ...draft, title: (draft.title || '').trim() || 'Untitled event', attachments: draft.attachments || [] })
    if (stored) clean.firedAt = (stored.date !== clean.date || stored.time !== clean.time || stored.remind !== clean.remind || stored.remindLead !== clean.remindLead) ? null : stored.firedAt
    let id = clean.id
    if (id) saveEvents((list) => list.map((e) => (e.id === id ? clean : e)))
    else { id = uid(); saveEvents((list) => [...list, { ...clean, id }]) }
    setCalFocus({ id, n: Date.now() })
  }

  const upcomingReminders = useMemo(() => CM.upcomingReminders(events, clock.getTime()), [events, clock])

  // In-app reminders for events and tasks while Inkwell is open: one message (and one
  // bell) for everything that came due together, then all of them are marked fired.
  useEffect(() => {
    const check = () => {
      const now = Date.now()
      const evs = CM.dueEventReminders(events, now)
      const tks = TM.dueReminders(tasks, now)
      const n = evs.length + tks.length
      if (!n) return
      const lines = [
        ...evs.map((e) => e.title + ' · ' + relDay(e.date, new Date(now), 'short') + (e.allDay ? '' : ' ' + e.time)),
        ...tks.map((t) => t.text + ' · ' + TM.dayLabel(t.due) + (t.time ? ' ' + t.time : '')),
      ]
      const only = n === 1 ? (evs[0] ? { kind: 'event', it: evs[0] } : { kind: 'task', it: tks[0] }) : null
      setToast({
        title: only ? 'Reminder: ' + (only.kind === 'event' ? only.it.title : only.it.text) : `${n} reminders`,
        body: only ? lines[0].split(' · ').slice(1).join(' · ') : lines.join(' · '),
        icon: 'bell',
        action: only ? (only.kind === 'task'
          ? { label: 'Open', run: () => openTask(only.it.id) }
          : { label: 'Open', run: () => { flushSave(); setMode('calendar'); setCalFocus({ id: only.it.id, n: Date.now() }) } }) : null,
      })
      beep()
      if (evs.length) { const ids = new Set(evs.map((e) => e.id)); saveEvents((list) => list.map((e) => (ids.has(e.id) ? { ...e, firedAt: now } : e))) }
      if (tks.length) { const ids = new Set(tks.map((t) => t.id)); saveTasks((list) => list.map((x) => (ids.has(x.id) ? { ...x, firedAt: now } : x))) }
    }
    check()
    const iv = setInterval(check, 30000)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, tasks, beep, saveEvents, saveTasks])

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 8000); return () => clearTimeout(t) }, [toast])


  /* ---------- view switch ---------- */
  const goMode = (m) => { flushSave(); setMode(m); setSideOpen(false) }
  // Switching to All Notes or a project deselects the open note → "No note selected".
  const selectProject = (id) => { flushSave(); setMode('notes'); setSel(id); setActiveId(null); setActive(null); setTrashPreview(null); setShowEditor(false); setSideOpen(false) }

  const activeMeta = index.find((r) => r.id === activeId)
  const recentNotes = useMemo(() => NM.sortNotes(NM.liveNotes(index), 'edited').slice(0, 5), [index])
  // Pinned first; then date sections when sorted by date (Apple Notes style).
  const listSections = useMemo(() => {
    if (query) return [{ title: null, items: list.others }]
    const field = sort === 'created' ? 'createdAt' : sort === 'edited' ? 'updatedAt' : null
    const rest = field ? NM.dateSections(list.others, field, clock) : [{ title: list.pinned.length ? 'Notes' : null, items: list.others }]
    return [...(list.pinned.length ? [{ title: 'Pinned', items: list.pinned }] : []), ...rest.filter((x) => x.items.length)]
  }, [list, sort, query, clock])
  const renderCard = (r) => {
    const m = query && list.matches ? list.matches.get(r.id) : null
    const snip = m && m.inBody && !m.inTitle ? NM.matchSnippet((texts && texts[r.id]) || r.snippet || '', query) : null
    return (
      <div key={r.id} className={'nm-card' + (activeId === r.id ? ' sel' : '') + (r.thumb ? ' has-thumb' : '')} role="button" tabIndex={0}
        draggable onDragStart={(e) => { e.dataTransfer.setData(NOTE_DRAG, r.id); e.dataTransfer.effectAllowed = 'move' }}
        onClick={() => openNote(r.id)} onKeyDown={(e) => { if (e.key === 'Enter') openNote(r.id) }}>
        <div className="nm-card-title">
          {r.pinned && <span className="nm-pin-ic"><PinFilled width={12} height={12} /></span>}
          {r.title?.trim() || 'Untitled'}
        </div>
        <div className="nm-card-sub">
          <span>{fmtDate(sort === 'created' ? r.createdAt : r.updatedAt)}</span>
          <span className="nm-snip">{snip ? <>{snip.before}<mark>{snip.match}</mark>{snip.after}</> : (r.snippet || 'No additional text')}</span>
        </div>
        {r.checks && (
          <div className="nm-card-prog" aria-label={`${r.checks[0]} of ${r.checks[1]} checklist items done`}>
            <i><b style={{ width: Math.round((100 * r.checks[0]) / r.checks[1]) + '%' }} /></i>{r.checks[0]}/{r.checks[1]}
          </div>
        )}
        {r.thumb && <Thumb refId={r.thumb} />}
      </div>
    )
  }
  const rootClass =
    'nm-root mode-' + mode + (sideOpen ? ' side-open' : '') + (showEditor && mode === 'notes' ? ' show-editor' : '')

  return (
    <>
      <style>{CSS}</style>
      <style>{NOTE_TOOLS_CSS}</style>
      <div className={rootClass}>
        <div className="nm-scrim" onClick={() => setSideOpen(false)} />

        {/* ----------------- SIDEBAR ----------------- */}
        <aside className="nm-side">
          <button className="nm-side-head nm-brand" onClick={() => goMode('home')} title="Home" aria-label={APP_NAME + ' home'}>
            <Logo size={24} /> {APP_NAME}
          </button>
          <div className="nm-side-scroll">
            <button className={'nm-row' + (mode === 'home' ? ' sel' : '')} onClick={() => goMode('home')}>
              <span className="nm-ico"><HomeIcon width={18} height={18} /></span>
              <span className="nm-row-name">Home</span>
            </button>
            <button className={'nm-row' + (mode === 'notes' && sel === 'all' ? ' sel' : '')} onClick={() => selectProject('all')}>
              <span className="nm-ico"><Notepad width={18} height={18} /></span>
              <span className="nm-row-name">All Notes</span>
              <span className="nm-count">{liveCount}</span>
            </button>
            <button className={'nm-row' + (mode === 'tasks' ? ' sel' : '')} onClick={() => goMode('tasks')}>
              <span className="nm-ico"><Tasks width={18} height={18} /></span>
              <span className="nm-row-name">Tasks</span>
              {taskCounts.today > 0 && <span className={'nm-count' + (taskCounts.overdue ? ' nm-count-od' : '')} title={`${taskCounts.today} due today${taskCounts.overdue ? `, ${taskCounts.overdue} overdue` : ''}`}>{taskCounts.today}</span>}
            </button>
            <button className={'nm-row' + (mode === 'calendar' ? ' sel' : '')} onClick={() => goMode('calendar')}>
              <span className="nm-ico"><Calendar width={18} height={18} /></span>
              <span className="nm-row-name">Calendar</span>
              {upcomingReminders.length > 0 && <span className="nm-count">{upcomingReminders.length}</span>}
            </button>
            <button className={'nm-row' + (mode === 'focus' ? ' sel' : '')} onClick={() => goMode('focus')}>
              <span className="nm-ico"><Stopwatch width={18} height={18} /></span>
              <span className="nm-row-name">Focus</span>
            </button>

            <div className="nm-side-label">
              Projects
              <button className="nm-iconbtn" title="New project" aria-label="New project" onClick={addProject}><Plus width={16} height={16} /></button>
            </div>
            {projects.map((p) => (
              <div key={p.id} role="button" tabIndex={0}
                className={'nm-row nm-proj' + (mode === 'notes' && sel === p.id ? ' sel' : '') + (dropTarget === p.id ? ' drop' : '')}
                onClick={() => selectProject(p.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' && editingProj !== p.id) selectProject(p.id) }}
                onDoubleClick={() => setEditingProj(p.id)}
                onDragOver={(e) => { if (isNoteDrag(e)) { e.preventDefault(); setDropTarget(p.id) } }}
                onDragLeave={() => setDropTarget((t) => (t === p.id ? null : t))}
                onDrop={(e) => { const id = e.dataTransfer.getData(NOTE_DRAG); setDropTarget(null); if (id) { e.preventDefault(); moveNote(id, p.id) } }}>
                <button className="nm-ico nm-proj-color" style={{ color: CM.projectColor(projects, p.id) }}
                  title="Change colour" aria-label={'Change colour of ' + p.name}
                  onClick={(e) => { e.stopPropagation(); cycleProjectColor(p) }}><Folder width={18} height={18} /></button>
                {editingProj === p.id ? (
                  <input className="nm-proj-name-input" autoFocus defaultValue={p.name}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => { renameProject(p.id, e.target.value.trim() || 'Untitled'); setEditingProj(null) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }} />
                ) : (<span className="nm-row-name">{p.name}</span>)}
                <span className="nm-count">{counts[p.id] || 0}</span>
                {projects.length > 1 && editingProj !== p.id && (
                  <button className="nm-iconbtn nm-proj-del" title={'Delete “' + p.name + '”'} aria-label={'Delete project ' + p.name}
                    onClick={(e) => { e.stopPropagation(); askDeleteProject(p) }}><Trash width={14} height={14} /></button>
                )}
              </div>
            ))}

            <div role="button" tabIndex={0} style={{ marginTop: 10 }}
              className={'nm-row' + (mode === 'notes' && sel === 'trash' ? ' sel' : '') + (dropTarget === 'trash' ? ' drop' : '')}
              onClick={() => selectProject('trash')}
              onKeyDown={(e) => { if (e.key === 'Enter') selectProject('trash') }}
              onDragOver={(e) => { if (isNoteDrag(e)) { e.preventDefault(); setDropTarget('trash') } }}
              onDragLeave={() => setDropTarget((t) => (t === 'trash' ? null : t))}
              onDrop={(e) => { const id = e.dataTransfer.getData(NOTE_DRAG); setDropTarget(null); if (id) { e.preventDefault(); trashNote(id) } }}>
              <span className="nm-ico"><Trash width={18} height={18} /></span>
              <span className="nm-row-name">Recently Deleted</span>
              {trash.length > 0 && <span className="nm-count">{trash.length}</span>}
            </div>
          </div>
        </aside>

        {/* ----------------- NOTE LIST (notes mode only) ----------------- */}
        {mode === 'notes' && (
          <section className="nm-list">
            <div className="nm-list-top">
              <div className="nm-list-title-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <button className="nm-iconbtn nm-mobile-back" onClick={() => setSideOpen(true)} title="Menu" aria-label="Menu"><SidebarLeft width={20} height={20} /></button>
                  <span className="nm-list-title">{currentProjectName}</span>
                </div>
                {sel === 'trash'
                  ? (trash.length > 0 && <button className="nm-btn-ghost nm-small" onClick={emptyTrash}>Empty</button>)
                  : <button className="nm-iconbtn" title="New note" aria-label="New note" onClick={newNote}><Plus width={20} height={20} /></button>}
              </div>
              {sel === 'trash' ? (
                <div className="nm-trash-hint">Deleted notes are removed for good after 30 days.</div>
              ) : (
                <>
                  <div className="nm-search">
                    <Search width={16} height={16} />
                    <input placeholder="Search notes" aria-label="Search notes" value={query} onChange={(e) => setQuery(e.target.value)} />
                    {query && <button className="nm-iconbtn" style={{ width: 22, height: 22 }} aria-label="Clear search" onClick={() => setQuery('')}><XCrossed width={14} height={14} /></button>}
                  </div>
                  <label className="nm-sort">
                    <ChevronUpDown width={14} height={14} />
                    <span>Sort by</span>
                    <select value={sort} onChange={(e) => changeSort(e.target.value)} aria-label="Sort notes">
                      {NM.SORTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </label>
                </>
              )}
            </div>
            <div className="nm-list-scroll">
              {loading ? (<div style={{ padding: 24, color: 'var(--muted)' }}>Loading…</div>)
                : sel === 'trash' ? (
                  trash.length === 0 ? <div className="nm-list-empty">Nothing here. Notes you delete stay here for 30 days.</div>
                  : trash.map((r) => (
                    <div key={r.id} className={'nm-card' + (trashPreview?.id === r.id ? ' sel' : '')} role="button" tabIndex={0}
                      onClick={() => openTrashPreview(r.id)} onKeyDown={(e) => { if (e.key === 'Enter') openTrashPreview(r.id) }}>
                      <div className="nm-card-title">{r.title?.trim() || 'Untitled'}</div>
                      <div className="nm-card-sub">
                        <span>{NM.daysLeft(r)} day{NM.daysLeft(r) === 1 ? '' : 's'} left</span>
                        <span className="nm-snip">{projName(r.projectId) || 'Project deleted'}</span>
                      </div>
                    </div>
                  ))
                ) : visibleCount === 0 ? (
                  <div className="nm-list-empty">{query ? 'No notes match your search.' : 'No notes yet.'}</div>
                ) : (
                  <>
                    {listSections.map((sec, i) => (
                      <React.Fragment key={(sec.title || '') + i}>
                        {sec.title && <div className="nm-list-section">{sec.title}</div>}
                        {sec.items.map(renderCard)}
                      </React.Fragment>
                    ))}
                  </>
                )}
            </div>
          </section>
        )}

        {/* ----------------- MAIN AREA ----------------- */}
        <main className="nm-main">
          {mode === 'home' && !loading && (
            <Home now={clock} recent={recentNotes} today={eventsByDay[todayKey] || []} dueTasks={dueTasks} nextTasks={nextTasks}
              openTaskCount={taskCounts.all} focusToday={NM.focusOn(focus.log, dateKey())} onOpenTask={openTask}
              onOpenNote={openNote} onOpenEvent={(e) => { setMode('calendar'); setCalFocus({ id: e.id, n: Date.now() }) }}
              onToggleTask={toggleTask} onNewNote={newNote}
              onGo={(m) => (m === 'notes' ? selectProject('all') : goMode(m))}
              onMenu={() => setSideOpen(true)} fmtDate={fmtDate} />
          )}

          {mode === 'notes' && sel === 'trash' && (
            !trashPreview ? (
              <div className="nm-empty">
                <span className="nm-empty-ico"><Trash width={52} height={52} /></span>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Recently Deleted</div>
                <div>Pick a note to look at it, restore it, or delete it for good.</div>
              </div>
            ) : (
              <>
                <div className="nm-toolbar">
                  <button className="nm-iconbtn nm-mobile-back" onClick={() => { setTrashPreview(null); setShowEditor(false) }} title="Back" aria-label="Back"><SidebarLeft width={20} height={20} /></button>
                  <span className="nm-trash-banner">In Recently Deleted · read-only</span>
                  <div className="nm-spacer" />
                  <button className="nm-btn-ghost nm-small" onClick={() => restoreNote(trashPreview.id)}><ArrowRotateCcw width={14} height={14} /> Restore</button>
                  <button className="nm-btn-danger nm-small" onClick={() => setConfirm({ title: 'Delete this note forever?', body: 'It will be removed together with its images. This can’t be undone.', confirmLabel: 'Delete forever', onConfirm: () => deleteForever(trashPreview.id) })}><Trash width={14} height={14} /> Delete forever</button>
                </div>
                <div className="nm-doc-wrap">
                  <div className="nm-doc">
                    <div className="nm-title-input nm-readonly">{trashPreview.title?.trim() || 'Untitled'}</div>
                    <div className="nm-editor nm-readonly" dangerouslySetInnerHTML={{ __html: trashPreview.html || '<p style="color:var(--muted)">This note is empty.</p>' }} />
                  </div>
                </div>
              </>
            )
          )}

          {mode === 'notes' && sel !== 'trash' && (
            !activeId ? (
              <div className="nm-empty">
                <span className="nm-empty-ico"><Notepad width={56} height={56} /></span>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>No note selected</div>
                <div>Pick a note from the list, or start a new one.</div>
                <button className="nm-btn-primary" onClick={newNote}><Plus width={16} height={16} /> New Note</button>
              </div>
            ) : (
              <>
                <div className="nm-toolbar">
                  <button className="nm-iconbtn nm-mobile-back" onClick={() => { flushSave(); setShowEditor(false) }} title="Back"><SidebarLeft width={20} height={20} /></button>
                  <div className="nm-tgroup">
                    <TB className="h" on={!!fmt.h1} title="Title" onClick={() => setBlock(fmt.h1 ? 'p' : 'h1')}>H1</TB>
                    <TB className="h" on={!!fmt.h2} title="Heading" onClick={() => setBlock(fmt.h2 ? 'p' : 'h2')}>H2</TB>
                    <TB title="Body text" onClick={() => setBlock('p')}><Text width={17} height={17} /></TB>
                  </div>
                  <div className="nm-tsep" />
                  <div className="nm-tgroup">
                    <TB className="b" on={!!fmt.bold} title="Bold" onClick={() => exec('bold')}>B</TB>
                    <TB className="i" on={!!fmt.italic} title="Italic" onClick={() => exec('italic')}>I</TB>
                    <TB className="u" on={!!fmt.underline} title="Underline" onClick={() => exec('underline')}>U</TB>
                    <TB on={!!fmt.strike} title="Strikethrough (⌘⇧X)" onClick={() => exec('strikeThrough')}><s>S</s></TB>
                    <TB on={!!fmt.mark} title="Highlight (⌘⇧H)" onClick={() => { if (ED.toggleHighlight(editorRef.current)) afterEdit() }}><span className="nm-tb-mark">H</span></TB>
                    <TB title="Link (⌘K)" onClick={openLinkPrompt}><Link width={16} height={16} /></TB>
                  </div>
                  <div className="nm-tsep" />
                  <div className="nm-tgroup">
                    <TB on={!!fmt.ul} title="Bulleted list" onClick={toggleBullets}>•</TB>
                    <TB on={!!fmt.ol} title="Numbered list" onClick={() => exec('insertOrderedList')}>1.</TB>
                    <TB on={!!fmt.check} title="Checklist" onClick={toggleChecklist}><SquareCheckboxUnchecked width={17} height={17} /></TB>
                    <TB on={!!fmt.quote} title="Quote (> )" onClick={() => runBlock('quote')}><Quote width={16} height={16} /></TB>
                    <TB on={!!fmt.code} title="Code block (```)" onClick={() => runBlock('code')}><Code width={16} height={16} /></TB>
                    <TB title="Divider (---)" onClick={() => runBlock('hr')}><Minus width={16} height={16} /></TB>
                    <TB title="Table" onClick={insertTable}><TableFilled width={17} height={17} /></TB>
                  </div>
                  <div className="nm-tsep" />
                  <div className="nm-tgroup">
                    <button className="nm-tbtn" title="Insert image" aria-label="Insert image" onMouseDown={(e) => { e.preventDefault(); captureAnchor() }} onClick={() => imgInputRef.current?.click()}><ImageSquare width={17} height={17} /></button>
                    <TB title="Draw" onClick={() => openDrawPad(null)}><Pencil width={17} height={17} /></TB>
                    <input ref={imgInputRef} type="file" accept="image/*" multiple hidden
                      onChange={(e) => { const f = [...(e.target.files || [])]; e.target.value = ''; if (f.length) insertImageFiles(f) }} />
                  </div>
                  <div className="nm-spacer" />
                  <TB on={findOpen} title="Find in note (⌘F)" onClick={() => setFindOpen((v) => !v)}><Search width={16} height={16} /></TB>
                  <TB title="Export: Markdown or PDF" onClick={exportNote}><Download width={16} height={16} /></TB>
                  <TB on={panelOpen} title="Outline and links" onClick={() => saveSettings({ notePanel: !panelOpen })}><SidebarRight width={17} height={17} /></TB>
                  <label className="nm-move" title="Move to project">
                    <Folder width={15} height={15} />
                    <select aria-label="Move note to project" value={active?.projectId || ''} onChange={(e) => moveNote(activeId, e.target.value)}>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                  <button className={'nm-iconbtn' + (activeMeta?.pinned ? ' nm-pinned' : '')} title={activeMeta?.pinned ? 'Unpin note' : 'Pin note to the top'}
                    aria-label={activeMeta?.pinned ? 'Unpin note' : 'Pin note'} aria-pressed={!!activeMeta?.pinned} onClick={() => togglePin(activeId)}>
                    {activeMeta?.pinned ? <PinFilled width={17} height={17} /> : <Pin width={17} height={17} />}
                  </button>
                  <button className="nm-iconbtn nm-tbtn-danger" title="Delete note (kept 30 days in Recently Deleted)" aria-label="Delete note" onClick={() => trashNote(activeId)}><Trash width={18} height={18} /></button>
                </div>
                <div className="nm-doc-row">
                {findOpen && <FindBar getEditor={() => editorRef.current} version={docInfo.v} onClose={() => { setFindOpen(false); editorRef.current?.focus() }} />}
                <div className="nm-doc-wrap">
                  <div className="nm-doc" onMouseMove={(e) => { if (e.target.closest && !e.target.closest('.nm-mktask')) showTaskChipFor(e.target.closest('ul.nm-check > li')) }}>
                    <input id="nm-title-input" data-note={activeId} className="nm-title-input" placeholder="Title" defaultValue={active?.title || ''} key={'title-' + activeId} onChange={scheduleSave} />
                    <div className="nm-date">{fmtDate(active?.updatedAt || activeMeta?.updatedAt)}{docInfo.words ? ` · ${docInfo.words} word${docInfo.words === 1 ? '' : 's'}` : ''}</div>
                    <div key={'ed-' + activeId} data-note={activeId} ref={setEditorEl} className="nm-editor" contentEditable suppressContentEditableWarning data-ph="Start writing…" onInput={onEditorInput} onKeyUp={refreshFmt} onKeyDown={onEditorKeyDown}
                      onClick={(e) => { onEditorClick(e); refreshFmt() }} onDoubleClick={onEditorDoubleClick}
                      onPaste={onPaste} onDragOver={onDragOver} onDrop={onDrop} onBlur={flushSave}
                      onDragStart={() => { internalDrag.current = true }} onDragEnd={() => { internalDrag.current = false }} />
                    {taskChip && (
                      <button className="nm-mktask" style={{ top: taskChip.top, left: taskChip.left }} title="Turn this line into a task in Tasks"
                        onMouseDown={(e) => e.preventDefault()} onClick={makeTaskFromLine}><Tasks width={13} height={13} /> Make task</button>
                    )}
                  </div>
                </div>
                {panelOpen && (
                  <NotePanel outline={docInfo.outline} words={docInfo.words} chars={docInfo.chars}
                    linkedNotes={linkedNotes} linkedTasks={linkedTasks} linkedEvents={linkedEvents}
                    onJump={jumpToHeading} onOpenNote={openNote} onOpenTask={openTask}
                    onOpenEvent={(e) => { flushSave(); setMode('calendar'); setCalFocus({ id: e.id, n: Date.now() }) }}
                    onClose={() => saveSettings({ notePanel: false })} />
                )}
                </div>
                {popup && (
                  <InsertMenu title={popup.kind === 'slash' ? 'Insert' : 'Link to note'} items={popup.items} active={popup.active} rect={popup.rect}
                    onHover={(i) => setPopup((p) => (p ? { ...p, active: i } : p))} onPick={pickPopup} />
                )}
                {linkPrompt && <LinkPrompt rect={linkPrompt.rect} onSubmit={applyLink} onCancel={() => { setLinkPrompt(null); editorRef.current?.focus() }} />}
              </>
            )
          )}

          {mode === 'tasks' && !loading && (
            <TasksView tasks={tasks} projects={projects} notes={index} now={clock}
              initialList={settings.taskList} onListChange={(l) => saveSettings({ taskList: l })}
              select={taskFocus} onSelectHandled={() => setTaskFocus(null)}
              suspendKeys={!!eventEdit || !!confirm || !!drawState}
              onAdd={addTask} onUpdate={updateTask} onComplete={toggleTask} onDelete={deleteTask}
              onMoveOverdue={moveOverdueToToday}
              onFocus={(id) => { setFocusTaskId(id); goMode('focus') }}
              onOpenNote={openNote} onMenu={() => setSideOpen(true)} onToast={setToast} />
          )}

          {mode === 'focus' && (
            <>
              <div className="nm-head-bar">
                <button className="nm-iconbtn nm-mobile-back" onClick={() => setSideOpen(true)} title="Menu"><SidebarLeft width={20} height={20} /></button>
                <span className="nm-head-title">Focus</span>
              </div>
              <div className="nm-focus">
                <div className="nm-phase-tabs">
                  <button className={'nm-phase-tab' + (phase === 'work' ? ' on' : '')} onClick={() => switchPhase('work')}>Focus</button>
                  <button className={'nm-phase-tab' + (phase === 'short' ? ' on' : '')} onClick={() => switchPhase('short')}>Short Break</button>
                  <button className={'nm-phase-tab' + (phase === 'long' ? ' on' : '')} onClick={() => switchPhase('long')}>Long Break</button>
                </div>

                <div className="nm-ring-wrap">
                  <svg width="280" height="280" viewBox="0 0 280 280">
                    <circle cx="140" cy="140" r="130" fill="none" stroke="var(--border)" strokeWidth="12" />
                    <circle cx="140" cy="140" r="130" fill="none" stroke="var(--accent)" strokeWidth="12"
                      strokeLinecap="round" strokeDasharray={ringC}
                      strokeDashoffset={ringC * (1 - progress)}
                      style={{ transition: running ? 'stroke-dashoffset 0.3s linear' : 'none' }} />
                  </svg>
                  <div className="nm-ring-time">
                    <div className="nm-ring-big">{mmss(secsLeft)}</div>
                    <div className="nm-ring-sub">{phase === 'work' ? 'Time to focus' : 'Take a break'}</div>
                  </div>
                </div>

                {focusTask && <div className="nm-focus-task">Focusing on: <b>{focusTask.text}</b></div>}

                <div className="nm-focus-controls">
                  <button className="nm-bigbtn" onClick={startPause}>
                    {running ? <Pause width={20} height={20} /> : <PlayTriangle width={20} height={20} />}
                    {running ? 'Pause' : 'Start'}
                  </button>
                  <button className="nm-circbtn" onClick={resetTimer} title="Reset"><ArrowRotateCcw width={20} height={20} /></button>
                </div>

                <div className="nm-focus-meta">
                  <span>Rounds completed: <b>{focus.rounds || 0}</b></span>
                </div>

                <select className="nm-focus-select" value={focusTaskId} onChange={(e) => setFocusTaskId(e.target.value)}>
                  <option value="">Focus on a task (optional)</option>
                  {activeTasks.map((t) => <option key={t.id} value={t.id}>{t.text}</option>)}
                </select>

                <div className="nm-focus-settings">
                  <label className="nm-mini">Focus <input type="number" min="1" max="120" value={focus.workMin} onChange={(e) => setFocusNum('workMin', e.target.value)} /> min</label>
                  <label className="nm-mini">Short <input type="number" min="1" max="60" value={focus.shortMin} onChange={(e) => setFocusNum('shortMin', e.target.value)} /> min</label>
                  <label className="nm-mini">Long <input type="number" min="1" max="60" value={focus.longMin} onChange={(e) => setFocusNum('longMin', e.target.value)} /> min</label>
                  <button className={'nm-bell-toggle' + (soundOn ? ' on' : '')} onClick={toggleSound}
                    aria-pressed={soundOn} title={soundOn ? 'Bell on — click to mute' : 'Bell off — click to turn on (plays a preview)'}>
                    <Bell width={14} height={14} /> Bell {soundOn ? 'on' : 'off'}
                  </button>
                </div>
              </div>
            </>
          )}

          {mode === 'calendar' && !loading && (
            <CalendarView events={events} projects={projects} notes={index}
              initialView={settings.calView || 'month'} onViewChange={(v) => saveSettings({ calView: v })}
              focus={calFocus} onFocusHandled={() => setCalFocus(null)}
              suspendKeys={!!eventEdit || !!confirm || !!drawState}
              reminders={upcomingReminders}
              onCreate={createEvent} onUpdate={updateEventItem}
              onEdit={openEventEditor} onDelete={(ev) => askDeleteEvent(ev)}
              onOpenNote={openNote} loadNoteExcerpt={loadNoteExcerpt}
              onMenu={() => setSideOpen(true)} onError={(m) => showError('Couldn’t open file', new Error(m))}
              tasks={tasks} onToggleTask={toggleTask} onOpenTask={openTask} />
          )}
        </main>

        {/* ----------------- EVENT EDITOR ----------------- */}
        {eventEdit && (
          <EventEditor initial={eventEdit} projects={projects} notes={index}
            onSave={saveEvent} onClose={() => setEventEdit(null)}
            onDelete={(draft, after) => askDeleteEvent(draft, after)}
            onOpenNote={openNote} loadNotePreview={(id) => readNote(id, { hydrate: true })}
            onError={showError} />
        )}

        {/* ----------------- MESSAGE (reminders, Undo, errors) ----------------- */}
        {toast && (
          <div className="nm-toast-wrap">
            <div className={'nm-toast' + (toast.icon === 'warn' ? ' warn' : '')}>
              <span className="nm-toast-ic">
                {toast.icon === 'warn' ? <Warning width={18} height={18} /> : toast.icon === 'trash' ? <Trash width={18} height={18} /> : toast.icon === 'check' ? <Check width={18} height={18} /> : <Bell width={18} height={18} />}
              </span>
              <div className="nm-toast-text" role="status">
                <b>{toast.title}</b>
                {toast.body && <small>{toast.body}</small>}
              </div>
              {toast.action && <button className="nm-btn-ghost nm-small" onClick={() => { const a = toast.action; setToast(null); a.run() }}>{toast.action.label}</button>}
              <button className="nm-iconbtn" aria-label="Dismiss" onClick={() => setToast(null)}><XCrossed width={16} height={16} /></button>
            </div>
          </div>
        )}

        {/* ----------------- CONFIRM DIALOG ----------------- */}
        {confirm && (
          <div className="nm-modal-scrim" onClick={() => setConfirm(null)}>
            <div className="nm-modal nm-confirm" role="alertdialog" aria-modal="true" aria-labelledby="nm-confirm-title" onClick={(e) => e.stopPropagation()}>
              <div className="nm-modal-body">
                <div id="nm-confirm-title" className="nm-modal-title">{confirm.title}</div>
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>{confirm.body}</p>
              </div>
              <div className="nm-modal-foot">
                <div className="nm-spacer" />
                <button className="nm-btn-ghost" autoFocus onClick={() => setConfirm(null)}>Cancel</button>
                <button className="nm-btn-danger" onClick={() => { const run = confirm.onConfirm; setConfirm(null); run() }}>{confirm.confirmLabel}</button>
              </div>
            </div>
          </div>
        )}

        {/* ----------------- DRAWING PAD / IMAGE VIEWER / BUSY ----------------- */}
        {drawState && <DrawPad baseUrl={drawState.baseUrl} onCancel={closeDrawPad} onSave={saveDrawing} />}
        {lightbox && <Lightbox url={lightbox.url} name={lightbox.name} onClose={() => setLightbox(null)} />}
        {busy && <div className="nm-busy" role="status">{busy}</div>}
      </div>
    </>
  )
}
