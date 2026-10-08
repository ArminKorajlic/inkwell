// DOM operations for the contentEditable note editor. No React, no storage —
// every function takes the editor element (`ed`) so it can be tested on its own.
//
// Note-body conventions:
//   checklist  -> a real <ul class="nm-check"> (native list behaviour), items
//                 carry data-checked="true" when ticked
//   image      -> <div class="nm-media" contenteditable="false"><img data-img="<ref>"></div>
//                 drawings add data-drawing="1"; saved HTML never contains the
//                 image bytes (src is stripped), they are re-hydrated on open.
//   note link  -> <a class="nm-nlink" data-note="<id>" contenteditable="false">Title</a>
//                 (the text is refreshed from the note's current title on open)
//   task line  -> checklist <li data-task="<taskId>"> mirrors that task's done state
//   highlight  -> <mark>; quote <blockquote>; code <pre>; divider <hr>
//   folding    -> .nm-fold on a heading, .nm-hid on what it hides (never saved)

export function caretElement() {
  const sel = window.getSelection()
  let n = sel && sel.anchorNode
  if (n && n.nodeType === 3) n = n.parentNode
  return n && n.nodeType === 1 ? n : null
}

// The direct child of the editor that holds the caret (or null).
export function topLevelBlockAtCaret(ed) {
  const sel = window.getSelection()
  if (!ed || !sel || !sel.rangeCount) return null
  const range = sel.getRangeAt(0)
  let n = range.startContainer
  if (!ed.contains(n)) return null
  if (n === ed) return ed.childNodes[Math.min(range.startOffset, ed.childNodes.length - 1)] || null
  if (n.nodeType === 3) n = n.parentNode
  while (n && n.parentNode !== ed) n = n.parentNode
  return n && n.parentNode === ed ? n : null
}

function isEmptyBlock(node) {
  if (!node) return false
  if (node.nodeType === 3) return !node.textContent.trim()
  if (node.nodeType !== 1) return false
  if (node.tagName === 'BR') return true
  if (!/^(P|DIV|H1|H2)$/.test(node.tagName) || node.classList.contains('nm-media')) return false
  return !node.textContent.replace(/ /g, ' ').trim() && !node.querySelector('img,table,ul,ol')
}

function needsTrailingLine(node) {
  return !!node && node.nodeType === 1 &&
    (/^(TABLE|UL|OL)$/.test(node.tagName) || node.classList.contains('nm-media'))
}

export function placeCaret(target) {
  if (!target) return
  const sel = window.getSelection()
  const r = document.createRange()
  if (target.nodeType === 3) r.setStart(target, 0)
  else r.selectNodeContents(target)
  r.collapse(true)
  sel.removeAllRanges()
  sel.addRange(r)
}

// Insert block nodes as top-level children: after `anchor` (or the caret's
// block, or at the end). An empty anchor line is replaced instead of leaving a
// blank line above. A trailing line is only added when the inserted block would
// otherwise be the last thing in the note (so you can keep typing after it).
export function insertBlocks(ed, nodes, { anchor, caretTarget } = {}) {
  if (!ed || !nodes.length) return
  const ref = anchor && anchor.parentNode === ed ? anchor : topLevelBlockAtCaret(ed)
  const last = nodes[nodes.length - 1]
  const frag = document.createDocumentFragment()
  nodes.forEach((x) => frag.appendChild(x))
  if (ref && isEmptyBlock(ref)) ed.replaceChild(frag, ref)
  else if (ref) ed.insertBefore(frag, ref.nextSibling)
  else ed.appendChild(frag)
  if (ed.lastChild === last && needsTrailingLine(last)) {
    const p = document.createElement('p'); p.innerHTML = '<br>'
    ed.appendChild(p)
  }
  ed.focus()
  placeCaret(caretTarget || last.nextSibling || last)
}

export function buildTable(rows = 3, cols = 3) {
  const table = document.createElement('table')
  const tbody = document.createElement('tbody')
  table.appendChild(tbody)
  let firstCell = null
  for (let r = 0; r < rows; r++) {
    const tr = document.createElement('tr')
    for (let c = 0; c < cols; c++) {
      const td = document.createElement('td')
      td.innerHTML = '<br>'
      if (!firstCell) firstCell = td
      tr.appendChild(td)
    }
    tbody.appendChild(tr)
  }
  return { table, firstCell }
}

export function buildMedia(ref, { drawing = false, src } = {}) {
  const wrap = document.createElement('div')
  wrap.className = 'nm-media'
  wrap.setAttribute('contenteditable', 'false')
  wrap.setAttribute('aria-label', drawing ? 'Drawing' : 'Image')
  wrap.title = drawing ? 'Double-click to edit the drawing' : 'Double-click to view full size'
  if (drawing) wrap.setAttribute('data-drawing', '1')
  const img = document.createElement('img')
  img.setAttribute('data-img', ref)
  img.alt = ''
  img.draggable = false
  if (src) img.src = src
  wrap.appendChild(img)
  return wrap
}

/* ---------------- caret preservation ---------------- */

const LINE_TAGS = /^(LI|P|DIV|H1|H2|TD|BLOCKQUOTE|PRE)$/
function lineOf(ed, node) {
  let n = node && (node.nodeType === 3 ? node.parentNode : node)
  while (n && n !== ed) {
    if (n.nodeType === 1 && LINE_TAGS.test(n.tagName) && !n.classList.contains('nm-media')) return n
    n = n.parentNode
  }
  return null
}
function textOffsetIn(line, node, offset) {
  const r = document.createRange()
  r.selectNodeContents(line)
  try { r.setEnd(node, offset) } catch { return null }
  return r.toString().length
}
function caretToTextOffset(line, target) {
  const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
  let remaining = target
  let last = null
  let t
  const put = (node, o) => {
    const r = document.createRange(); r.setStart(node, o); r.collapse(true)
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r)
  }
  while ((t = walker.nextNode())) {
    last = t
    if (remaining <= t.length) { put(t, remaining); return }
    remaining -= t.length
  }
  if (last) put(last, last.length)
}

// Run a structural command (list/heading toggle) and keep the caret at the same
// character position within its line — browsers often reset it to the line start.
export function preserveCaret(ed, fn) {
  const sel = window.getSelection()
  let off = null
  if (ed && sel && sel.isCollapsed && sel.rangeCount && ed.contains(sel.anchorNode)) {
    const line = lineOf(ed, sel.anchorNode)
    if (line) off = textOffsetIn(line, sel.anchorNode, sel.anchorOffset)
  }
  const out = fn()
  if (off == null) return out
  const s2 = window.getSelection()
  const line = s2 && s2.rangeCount ? lineOf(ed, s2.anchorNode) : null
  if (!line) return out
  if (textOffsetIn(line, s2.anchorNode, s2.anchorOffset) !== off) {
    caretToTextOffset(line, Math.min(off, line.textContent.length))
  }
  return out
}

/* ---------------- structure normalization ---------------- */

const BLOCK_TAGS = /^(UL|OL|TABLE|DIV|H1|H2|P|BLOCKQUOTE|PRE|HR)$/

// Browsers create lists *inside* a <p> (e.g. <p><ul>…</ul></p>). That's invalid
// HTML: on reload the parser splits it and leaves stray empty lines. Lift block
// children out of paragraphs (inline runs keep their own <p>) and drop truly
// empty paragraphs — preserving the caret, since the text nodes are only moved.
export function normalizeBlocks(ed) {
  if (!ed) return false
  const sel = window.getSelection()
  const saved = sel && sel.rangeCount && ed.contains(sel.anchorNode)
    ? { an: sel.anchorNode, ao: sel.anchorOffset, fn: sel.focusNode, fo: sel.focusOffset }
    : null
  let changed = false
  let firstMoved = null
  ed.querySelectorAll('p').forEach((p) => {
    if (![...p.children].some((c) => BLOCK_TAGS.test(c.tagName))) return
    let run = null
    for (const child of [...p.childNodes]) {
      const isBlock = child.nodeType === 1 && BLOCK_TAGS.test(child.tagName)
      if (isBlock) { run = null; p.before(child); firstMoved = firstMoved || child; continue }
      const blank = (child.nodeType === 3 && !child.textContent.trim()) || (child.nodeType === 1 && child.tagName === 'BR')
      if (blank && !run) { child.remove(); continue }
      if (!run) { run = document.createElement('p'); p.before(run) }
      run.appendChild(child)
    }
    p.remove()
    changed = true
  })
  // Parser leftovers: paragraphs with no content at all (not even <br>) are invisible caret traps.
  ed.querySelectorAll('p').forEach((p) => { if (!p.childNodes.length) { p.remove(); changed = true } })
  if (changed && sel) {
    if (saved && ed.contains(saved.an) && ed.contains(saved.fn)) {
      try { sel.setBaseAndExtent(saved.an, saved.ao, saved.fn, saved.fo) } catch { /* keep browser caret */ }
    } else if (firstMoved) {
      const target = firstMoved.querySelector('li,td') || firstMoved
      placeCaret(target)
    }
  }
  return changed
}

// After typing: a new checklist item created with Enter must start unticked
// (browsers copy the ticked item's attributes onto the new line).
export function afterInput(ed, inputType) {
  if (inputType !== 'insertParagraph') return false
  const li = caretElement()?.closest('ul.nm-check > li')
  const ul = li && li.parentElement
  if (!ul || !ed.contains(ul)) return false
  let changed = false
  ul.querySelectorAll(':scope > li[data-checked]').forEach((x) => {
    if (!x.textContent.replace(/ /g, ' ').trim()) { x.removeAttribute('data-checked'); changed = true }
  })
  // The browser also copies data-task: only the first of two neighbouring lines keeps the task link.
  ul.querySelectorAll(':scope > li[data-task]').forEach((x) => {
    const prev = x.previousElementSibling
    if (prev && prev.getAttribute('data-task') === x.getAttribute('data-task')) { x.removeAttribute('data-task'); x.removeAttribute('data-checked'); changed = true }
  })
  return changed
}

/* ---------------- lists ---------------- */

// Checklist toggles like the native lists: paragraph -> checklist, plain
// bullet list -> checklist (converted in place), checklist -> paragraphs.
export function toggleChecklist(ed) {
  ed.focus()
  preserveCaret(ed, () => {
    const el = caretElement()
    const inEd = (n) => n && ed.contains(n)
    const check = el && el.closest('ul.nm-check')
    if (inEd(check)) { document.execCommand('insertUnorderedList'); normalizeBlocks(ed); return }
    const plain = el && el.closest('ul')
    if (inEd(plain)) { plain.classList.add('nm-check'); return }
    if (window.getSelection().isCollapsed && !(el && el.closest('ol')) && lineToList(ed, 'check')) return   // one line: a new list, never merged
    document.execCommand('insertUnorderedList')
    const li = caretElement()?.closest('li')
    const ul = li && li.closest('ul')
    if (inEd(ul)) ul.classList.add('nm-check')
    normalizeBlocks(ed)
  })
}

// Bullet button: checklist -> plain bullets (in place); otherwise native toggle.
export function toggleBullets(ed) {
  ed.focus()
  preserveCaret(ed, () => {
    const el = caretElement()
    const check = el && el.closest('ul.nm-check')
    if (check && ed.contains(check)) {
      check.classList.remove('nm-check')
      check.querySelectorAll('li[data-checked]').forEach((li) => li.removeAttribute('data-checked'))
      return
    }
    if (window.getSelection().isCollapsed && !(el && el.closest('ul, ol')) && lineToList(ed, 'ul')) return   // one line: a new list, never merged
    document.execCommand('insertUnorderedList')
    normalizeBlocks(ed)
  })
}

// Click in a checklist item's checkbox (the list's left padding) ticks it.
export function handleChecklistClick(e) {
  const li = e.target.closest && e.target.closest('ul.nm-check > li')
  if (!li) return false
  const dx = e.clientX - li.getBoundingClientRect().left
  if (dx < 2 && dx > -30) {
    li.setAttribute('data-checked', li.getAttribute('data-checked') === 'true' ? 'false' : 'true')
    e.preventDefault()
    return true
  }
  return false
}

/* ---------------- media selection ---------------- */

export function selectMedia(ed, media) {
  ed.querySelectorAll('.nm-media.sel').forEach((m) => { if (m !== media) m.classList.remove('sel') })
  if (media) media.classList.add('sel')
}
export const selectedMedia = (ed) => (ed ? ed.querySelector('.nm-media.sel') : null)

// Remove a media block and put the caret on the line that took its place.
export function removeMedia(ed, media) {
  const next = media.nextSibling || media.previousSibling
  media.remove()
  if (!ed.firstChild) { const p = document.createElement('p'); p.innerHTML = '<br>'; ed.appendChild(p) }
  ed.focus()
  placeCaret(next && next.parentNode === ed ? next : ed.lastChild)
}

/* ---------------- save / load ---------------- */

// HTML to persist: image bytes and transient UI state are stripped.
export function serializeEditor(ed) {
  const clone = ed.cloneNode(true)
  clone.querySelectorAll('img[data-img]').forEach((img) => img.removeAttribute('src'))
  clone.querySelectorAll('.nm-media.sel').forEach((m) => m.classList.remove('sel'))
  clone.querySelectorAll('.nm-media.missing').forEach((m) => m.classList.remove('missing'))
  clone.querySelectorAll('.nm-fold, .nm-hid').forEach((m) => { m.classList.remove('nm-fold', 'nm-hid'); if (!m.className) m.removeAttribute('class') })
  clone.querySelectorAll('a.nm-nlink.missing').forEach((m) => m.classList.remove('missing'))
  return clone.innerHTML
}

export function imageRefsInHtml(html) {
  const div = document.createElement('div')
  div.innerHTML = html || ''
  return [...div.querySelectorAll('img[data-img]')].map((i) => i.getAttribute('data-img')).filter(Boolean)
}

// Fill in image bytes (as data: URLs) for every unhydrated image under root.
export async function hydrateImages(root, loadUrl) {
  const imgs = [...root.querySelectorAll('img[data-img]')].filter((i) => !i.getAttribute('src'))
  await Promise.all(imgs.map(async (img) => {
    try {
      const url = await loadUrl(img.getAttribute('data-img'))
      if (url) img.src = url
      else img.closest('.nm-media')?.classList.add('missing')
    } catch {
      img.closest('.nm-media')?.classList.add('missing')
    }
  }))
}

export async function hydrateHtml(html, loadUrl) {
  const div = document.createElement('div')
  div.innerHTML = html || ''
  await hydrateImages(div, loadUrl)
  return div.innerHTML
}

/* ---------------- writing tools ---------------- */

// A brand-new note's first words sit directly in the editor, outside any
// paragraph. Wrap that run in a <p> (keeping the caret) so line tools work.
export function ensureLine(ed) {
  const sel = window.getSelection()
  if (!ed || !sel || !sel.rangeCount || !sel.isCollapsed) return
  const n = sel.anchorNode
  if (!n || !(n === ed || (n.nodeType === 3 && n.parentNode === ed))) return
  if (n === ed && ed.childNodes.length) return
  const off = sel.anchorOffset
  const p = document.createElement('p')
  if (n === ed) { p.innerHTML = '<br>'; ed.appendChild(p); placeCaret(p); return }
  n.before(p)
  p.appendChild(n)
  const r = document.createRange(); r.setStart(n, Math.min(off, n.length)); r.collapse(true)
  sel.removeAllRanges(); sel.addRange(r)
}

// Text of the caret's line from its start to the caret (non-breaking spaces as spaces).
export function textBeforeCaret(ed) {
  const sel = window.getSelection()
  if (!ed || !sel || !sel.rangeCount || !sel.isCollapsed || !ed.contains(sel.anchorNode)) return null
  const line = lineOf(ed, sel.anchorNode)
  if (!line) return null
  const r = document.createRange()
  r.selectNodeContents(line)
  try { r.setEnd(sel.anchorNode, sel.anchorOffset) } catch { return null }
  return { line, text: r.toString().replace(/\u00a0/g, ' ') }
}

// Remove the last `n` characters before the caret on its line (a typed marker).
export function deleteBeforeCaret(ed, n) {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return
  const info = textBeforeCaret(ed)
  if (!info) return
  const end = info.text.length
  const r = document.createRange()
  r.selectNodeContents(info.line)
  const walker = document.createTreeWalker(info.line, NodeFilter.SHOW_TEXT)
  let pos = 0, t, startSet = false
  while ((t = walker.nextNode())) {
    const len = t.length
    if (!startSet && pos + len >= end - n) { r.setStart(t, end - n - pos); startSet = true }
    if (pos + len >= end) { r.setEnd(t, end - pos); break }
    pos += len
  }
  if (!startSet) return
  r.deleteContents()
  if (!info.line.textContent && !info.line.querySelector('br,img')) info.line.innerHTML = '<br>'
  const c = document.createRange()
  c.setStart(r.startContainer, r.startOffset)
  c.collapse(true)
  sel.removeAllRanges(); sel.addRange(c)
  if (!info.line.contains(sel.anchorNode)) placeCaret(info.line)
}

// What a marker typed at the start of a line turns into (followed by a space).
export const TYPING_SHORTCUTS = { '#': 'h1', '##': 'h2', '-': 'ul', '*': 'ul', '1.': 'ol', '[]': 'check', '[ ]': 'check', '>': 'quote' }
export function shortcutAtCaret(ed) {
  const info = textBeforeCaret(ed)
  if (!info) return null
  const kind = TYPING_SHORTCUTS[info.text]
  if (!kind) return null
  const tag = info.line.tagName
  if (tag === 'PRE' || tag === 'TD') return null
  if (tag === 'LI') {
    const list = info.line.parentElement
    // Inside a plain bullet list only "[] " (make it a checklist) applies.
    if (!(kind === 'check' && list.tagName === 'UL' && !list.classList.contains('nm-check'))) return null
  }
  return { kind, length: info.text.length }
}

// Turn the caret's line into a new list (bullets, numbers or checklist) of its
// own: unlike the browser's list command it never merges into a neighbouring
// list of another kind. Inside a plain bullet list, "check" converts that list.
export function lineToList(ed, kind) {
  ed.focus()
  const el = caretElement()
  const line = el && lineOf(ed, el)
  if (!line) return false
  if (line.tagName === 'LI') {
    if (kind === 'check' && line.parentElement.tagName === 'UL') { line.parentElement.classList.add('nm-check'); return true }
    return false
  }
  const list = document.createElement(kind === 'ol' ? 'ol' : 'ul')
  if (kind === 'check') list.className = 'nm-check'
  const li = document.createElement('li')
  while (line.firstChild) li.appendChild(line.firstChild)
  if (!li.textContent && !li.querySelector('br')) li.innerHTML = '<br>'
  list.appendChild(li)
  line.replaceWith(list)
  placeCaret(li)
  normalizeBlocks(ed)
  return true
}

// Turn the caret's line into a quote or code block (or back to a paragraph),
// keeping the caret where it was.
export function setLineTag(ed, tag) {
  ed.focus()
  return preserveCaret(ed, () => {
    const el = caretElement()
    const line = el && lineOf(ed, el)
    if (!line || line.tagName === 'LI' || line.tagName === 'TD') { document.execCommand('formatBlock', false, tag); normalizeBlocks(ed); return }
    const want = line.tagName === tag.toUpperCase() ? 'p' : tag
    const next = document.createElement(want)
    while (line.firstChild) next.appendChild(line.firstChild)
    if (!next.firstChild) next.innerHTML = '<br>'
    line.replaceWith(next)
    placeCaret(next)
  })
}

export function insertDivider(ed, anchor) {
  const hr = document.createElement('hr')
  const p = document.createElement('p'); p.innerHTML = '<br>'
  insertBlocks(ed, [hr, p], { anchor, caretTarget: p })
}

// Highlight the selection (or remove it when the selection is already highlighted).
export function toggleHighlight(ed) {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount || sel.isCollapsed || !ed.contains(sel.anchorNode)) return false
  const r = sel.getRangeAt(0)
  const host = r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer
  const mark = host.closest && host.closest('mark')
  if (mark && ed.contains(mark)) { mark.replaceWith(...mark.childNodes); return true }
  // Wrap each selected piece of text on its own, so a selection across lines
  // never moves whole paragraphs into a <mark>.
  const pieces = []
  const root = r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let t
  while ((t = walker.nextNode())) {
    if (!r.intersectsNode(t)) continue
    const a = t === r.startContainer ? r.startOffset : 0
    const b = t === r.endContainer ? r.endOffset : t.length
    if (b > a && t.textContent.slice(a, b).trim()) pieces.push([t, a, b])
  }
  let first = null, last = null
  for (const [node, a, b] of pieces) {
    let mid = node
    if (a > 0) mid = mid.splitText(a)
    if (b - a < mid.length) mid.splitText(b - a)
    const m = document.createElement('mark')
    mid.replaceWith(m); m.appendChild(mid)
    first = first || m; last = m
  }
  ed.querySelectorAll('mark mark').forEach((x) => x.replaceWith(...x.childNodes))
  if (!first) return false
  const s2 = document.createRange(); s2.setStartBefore(first); s2.setEndAfter(last)
  sel.removeAllRanges(); sel.addRange(s2)
  return true
}

// Pasted HTML keeps simple formatting only: bold, italic, underline,
// strikethrough, links, lists, headings (h3+ become headings), quotes, code.
const PASTE_KEEP = /^(B|STRONG|I|EM|U|S|STRIKE|DEL|A|UL|OL|LI|P|BR|H1|H2|H3|H4|BLOCKQUOTE|PRE|CODE|TABLE|TBODY|TR|TD|TH)$/
export function cleanPastedHtml(html) {
  // Parsed in an inert document: images don't load and no handlers can run.
  const div = new DOMParser().parseFromString(String(html || ''), 'text/html').body
  div.querySelectorAll('script,style,meta,link,title,img,svg,iframe,object').forEach((n) => n.remove())
  const walk = (el) => {
    for (const child of [...el.children]) {
      walk(child)
      if (!PASTE_KEEP.test(child.tagName)) { child.replaceWith(...child.childNodes); continue }
      for (const a of [...child.attributes]) {
        if (!(child.tagName === 'A' && a.name === 'href' && /^(https?:|mailto:)/i.test(a.value))) child.removeAttribute(a.name)
      }
      if (/^H[34]$/.test(child.tagName)) { const h = document.createElement('h2'); h.append(...child.childNodes); child.replaceWith(h) }
      if (child.tagName === 'TH') { const td = document.createElement('td'); td.append(...child.childNodes); child.replaceWith(td) }
    }
  }
  walk(div)
  return div.innerHTML.replace(/<!--[\s\S]*?-->/g, '')
}

/* ---------------- note links ---------------- */

export function buildNoteLink(id, title) {
  const a = document.createElement('a')
  a.className = 'nm-nlink'
  a.setAttribute('data-note', id)
  a.setAttribute('contenteditable', 'false')
  a.textContent = title || 'Untitled'
  return a
}

// Replace the "[[query" just typed before the caret with a link to a note.
export function insertNoteLinkAtCaret(ed, typedLength, id, title) {
  deleteBeforeCaret(ed, typedLength)
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return
  const r = sel.getRangeAt(0)
  const a = buildNoteLink(id, title)
  r.insertNode(a)
  const space = document.createTextNode('\u00a0')
  a.after(space)
  const c = document.createRange(); c.setStart(space, 1); c.collapse(true)
  sel.removeAllRanges(); sel.addRange(c)
}

// Show each link with its note's current title; mark links to deleted notes.
export function refreshNoteLinks(root, titleOf) {
  root.querySelectorAll('a.nm-nlink[data-note]').forEach((a) => {
    const t = titleOf(a.getAttribute('data-note'))
    if (t == null) a.classList.add('missing')
    else { a.classList.remove('missing'); if (a.textContent !== (t || 'Untitled')) a.textContent = t || 'Untitled' }
    a.setAttribute('contenteditable', 'false')
  })
}

/* ---------------- outline + folding ---------------- */

export const headingsOf = (ed) => (ed ? [...ed.querySelectorAll(':scope > h1, :scope > h2')] : [])

// Fold or unfold everything under a heading, up to the next heading of the same or higher level.
export function toggleFold(ed, h) {
  const level = +h.tagName[1]
  const fold = !h.classList.contains('nm-fold')
  h.classList.toggle('nm-fold', fold)
  let n = h.nextElementSibling
  while (n && !(/^H[12]$/.test(n.tagName) && +n.tagName[1] <= level)) {
    if (fold) n.classList.add('nm-hid')
    else {
      n.classList.remove('nm-hid')
      if (/^H[12]$/.test(n.tagName) && n.classList.contains('nm-fold')) {   // keep inner folds folded
        const inner = +n.tagName[1]
        let m = n.nextElementSibling
        while (m && !(/^H[12]$/.test(m.tagName) && +m.tagName[1] <= inner)) m = m.nextElementSibling
        n = m
        continue
      }
    }
    n = n.nextElementSibling
  }
}
export function unfoldAll(ed) {
  ed.querySelectorAll('.nm-hid').forEach((n) => n.classList.remove('nm-hid'))
  ed.querySelectorAll('.nm-fold').forEach((n) => n.classList.remove('nm-fold'))
}
// A click in the margin just left of a heading is a fold toggle.
export function foldTargetAt(ed, e) {
  const h = e.target.closest && e.target.closest('h1, h2')
  if (!h || h.parentNode !== ed) return null
  const dx = e.clientX - h.getBoundingClientRect().left
  return dx < 0 && dx > -26 ? h : null
}

/* ---------------- find in note ---------------- */

export function findRanges(ed, query) {
  const q = (query || '').toLowerCase()
  const out = []
  if (!ed || !q) return out
  const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT)
  let t
  while ((t = walker.nextNode())) {
    const text = t.textContent.toLowerCase()
    let i = text.indexOf(q)
    while (i >= 0) {
      const r = document.createRange()
      r.setStart(t, i); r.setEnd(t, i + q.length)
      out.push(r)
      i = text.indexOf(q, i + q.length)
    }
  }
  return out
}

/* ---------------- Enter inside special blocks ---------------- */
// Returns true when it handled Enter:
//   "---" + Enter -> divider, "```" + Enter -> code block,
//   Enter on an empty quote line -> back to normal text,
//   Enter on an empty last line of a code block -> leave the code block.
export function handleBlockEnter(ed) {
  const sel = window.getSelection()
  if (!ed || !sel || !sel.rangeCount || !sel.isCollapsed || !ed.contains(sel.anchorNode)) return false
  const top = lineOf(ed, sel.anchorNode)
  if (!top || top.nodeType !== 1 || top.tagName === 'LI' || top.tagName === 'TD') return false
  const text = top.textContent.replace(/ /g, ' ').trim()
  const line = () => { const p = document.createElement('p'); p.innerHTML = '<br>'; return p }
  if (top.tagName === 'P' || top.tagName === 'DIV') {
    if (text === '---') { const hr = document.createElement('hr'); const p = line(); top.replaceWith(hr); hr.after(p); placeCaret(p); return true }
    if (text === '```') { const pre = document.createElement('pre'); pre.innerHTML = '<br>'; top.replaceWith(pre); placeCaret(pre); return true }
    return false
  }
  if (top.tagName === 'BLOCKQUOTE' && !text) { const p = line(); top.replaceWith(p); placeCaret(p); return true }
  if (top.tagName === 'PRE') {
    if (!text) { const p = line(); top.replaceWith(p); placeCaret(p); return true }
    const rest = document.createRange()
    rest.selectNodeContents(top)
    try { rest.setStart(sel.anchorNode, sel.anchorOffset) } catch { return false }
    if (!rest.toString() && /(<br>\s*){2}$/i.test(top.innerHTML)) {
      top.innerHTML = top.innerHTML.replace(/(<br>\s*){2}$/i, '')
      const p = line(); top.after(p); placeCaret(p)
      return true
    }
    document.execCommand('insertLineBreak')
    return true
  }
  return false
}
