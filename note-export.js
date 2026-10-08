// Export a note as Markdown or a printable page (Save as PDF).
//
// The app runs in a sandbox that blocks the print dialog and direct downloads,
// but pop-up windows are allowed to leave the sandbox. So export opens a clean
// window showing the note, with Print / Save as PDF, Download Markdown and
// Copy buttons that run there.

const inline = (el) => [...el.childNodes].map((n) => {
  if (n.nodeType === 3) return n.textContent.replace(/ /g, ' ')
  if (n.nodeType !== 1) return ''
  const t = n.tagName
  const c = inline(n)
  if (t === 'B' || t === 'STRONG') return c.trim() ? '**' + c + '**' : c
  if (t === 'I' || t === 'EM') return c.trim() ? '*' + c + '*' : c
  if (t === 'S' || t === 'STRIKE' || t === 'DEL') return c.trim() ? '~~' + c + '~~' : c
  if (t === 'MARK') return c.trim() ? '==' + c + '==' : c
  if (t === 'CODE') return '`' + c + '`'
  if (t === 'A') return n.classList.contains('nm-nlink') ? '[[' + c + ']]' : '[' + c + '](' + (n.getAttribute('href') || '') + ')'
  if (t === 'BR') return '  \n'
  if (t === 'IMG') return ''
  return c
}).join('')

function listLines(list, depth, out) {
  const check = list.classList.contains('nm-check')
  ;[...list.children].forEach((li, i) => {
    if (li.tagName !== 'LI') return
    const nested = [...li.children].filter((c) => c.tagName === 'UL' || c.tagName === 'OL')
    const clone = li.cloneNode(true)
    clone.querySelectorAll(':scope > ul, :scope > ol').forEach((x) => x.remove())
    const mark = check ? '- [' + (li.getAttribute('data-checked') === 'true' ? 'x' : ' ') + '] ' : list.tagName === 'OL' ? (i + 1) + '. ' : '- '
    out.push('  '.repeat(depth) + mark + inline(clone).trim())
    nested.forEach((n) => listLines(n, depth + 1, out))
  })
}

export function htmlToMarkdown(title, html) {
  const div = document.createElement('div')
  div.innerHTML = html || ''
  const out = ['# ' + (title || 'Untitled'), '']
  for (const b of div.childNodes) {
    if (b.nodeType === 3) { if (b.textContent.trim()) out.push(b.textContent.trim(), ''); continue }
    if (b.nodeType !== 1) continue
    const t = b.tagName
    if (t === 'H1') out.push('## ' + inline(b).trim(), '')
    else if (t === 'H2') out.push('### ' + inline(b).trim(), '')
    else if (t === 'UL' || t === 'OL') { listLines(b, 0, out); out.push('') }
    else if (t === 'BLOCKQUOTE') out.push(inline(b).trim().split('\n').map((l) => '> ' + l).join('\n'), '')
    else if (t === 'PRE') out.push('```', b.textContent.replace(/\n$/, ''), '```', '')
    else if (t === 'HR') out.push('---', '')
    else if (t === 'TABLE') {
      const trs = [...b.querySelectorAll('tr')]
      const cols = Math.max(1, ...trs.map((r) => r.children.length))
      const rows = trs.map((r) => '| ' + [...r.children].map((c) => inline(c).replace(/\s*\n\s*/g, ' ').trim().replace(/\|/g, '\\|')).join(' | ') + ' |')
      if (rows.length) out.push(rows[0], '|' + ' --- |'.repeat(cols), ...rows.slice(1), '')
    } else if (b.classList.contains('nm-media')) out.push(b.hasAttribute('data-drawing') ? '*(drawing)*' : '*(image)*', '')
    else { const s = inline(b).trim(); if (s) out.push(s, '') }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const fileName = (title) => (String(title || 'Untitled').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Untitled').slice(0, 80)

// Open the window straight from the click (browsers only allow pop-ups during
// a click), then fill it once the note is ready. Returns null when blocked.
export function openExportWindow() {
  const w = window.open('', '_blank')
  if (w) { try { w.document.title = 'Preparing export…'; w.document.body.textContent = 'Preparing export…' } catch { /* filled below */ } }
  return w
}

// `html` should already have images filled in.
export function fillExportWindow(w, { title, html, markdown, print = false }) {
  const doc = w.document
  doc.open()
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title || 'Untitled')}</title>
<style>
body{margin:0;background:#f4f3f0;color:#1d1d1f;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.bar{position:sticky;top:0;display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:10px 16px;background:#fff;border-bottom:1px solid #e6e3dd}
.bar span{flex:1;color:#6e6e73;font-size:13px}
.bar button{border:1px solid #e6e3dd;background:#fff;border-radius:9px;padding:7px 13px;font:inherit;font-size:14px;cursor:pointer}
.bar button.primary{background:#7c5cf5;border-color:#7c5cf5;color:#fff;font-weight:600}
article{max-width:720px;margin:24px auto;background:#fff;padding:40px 48px;border-radius:14px;box-shadow:0 6px 30px rgba(0,0,0,.06)}
h1.t{font-size:30px;margin:0 0 18px;letter-spacing:-.02em}
article h1{font-size:23px;margin:22px 0 6px}article h2{font-size:19px;margin:18px 0 4px}article p{margin:0 0 6px}
ul.nm-check{list-style:none;padding-left:4px}ul.nm-check li::before{content:"☐ ";color:#888}ul.nm-check li[data-checked="true"]::before{content:"☑ "}
ul.nm-check li[data-checked="true"]{color:#888;text-decoration:line-through}
blockquote{margin:10px 0;padding:4px 16px;border-left:3px solid #7c5cf5;color:#555}
pre{background:#f4f3f0;border-radius:8px;padding:10px 12px;white-space:pre-wrap;font:13.5px/1.5 ui-monospace,Menlo,monospace}
mark{background:#fff2a8;border-radius:3px;padding:0 2px}hr{border:none;border-top:1px solid #ddd;margin:18px 0}
table{border-collapse:collapse;margin:10px 0}td,th{border:1px solid #ddd;padding:6px 10px}
img{max-width:100%;border-radius:8px}a{color:#5b3fd6}a.nm-nlink{text-decoration:none;font-weight:600}
@media print{.bar{display:none}body{background:#fff}article{box-shadow:none;margin:0;padding:0;max-width:none}}
</style></head><body>
<div class="bar"><span>Inkwell export</span><button id="md">Download Markdown</button><button id="cp">Copy Markdown</button><button class="primary" id="pr">Print / Save as PDF</button></div>
<article><h1 class="t">${esc(title || 'Untitled')}</h1>${html || ''}</article>
</body></html>`)
  doc.close()
  const md = markdown || ''
  doc.getElementById('pr').onclick = () => w.print()
  doc.getElementById('md').onclick = () => {
    const url = w.URL.createObjectURL(new w.Blob([md], { type: 'text/markdown' }))
    const a = doc.createElement('a'); a.href = url; a.download = fileName(title) + '.md'
    doc.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => w.URL.revokeObjectURL(url), 30000)
  }
  doc.getElementById('cp').onclick = async () => {
    const b = doc.getElementById('cp')
    try { await w.navigator.clipboard.writeText(md); b.textContent = 'Copied' } catch { b.textContent = 'Copy blocked' }
    setTimeout(() => { b.textContent = 'Copy Markdown' }, 1800)
  }
  doc.querySelectorAll('[contenteditable]').forEach((n) => n.removeAttribute('contenteditable'))
  if (print) setTimeout(() => { try { w.print() } catch { /* the Print button stays */ } }, 300)
}
