// Images and file attachments.
//   img/<id>.<ext>  note images and drawings
//   att/<id>.<ext>  calendar-event attachments
// Bytes live in app storage as blobs; they are shown as data: URLs because the
// app sandbox does not allow blob: images. Photos are downscaled before saving
// so notes stay fast to open.

import { store } from './store.js'
import { uid } from './util.js'

export const MAX_IMAGE_DIM = 1600
export const MAX_FILE_BYTES = 25 * 1024 * 1024

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error || new Error('Could not read file'))
    r.readAsDataURL(blob)
  })
}

async function decode(blob) {
  if (typeof createImageBitmap === 'function' && !/svg/i.test(blob.type || '')) {
    try { return await createImageBitmap(blob) } catch { /* fall through */ }
  }
  const url = await blobToDataUrl(blob)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('That file is not a readable image'))
    img.src = url
  })
}

// Fit within maxDim. PNG/GIF/SVG stay PNG (may be transparent); photos become JPEG.
export async function prepareImage(file, maxDim = MAX_IMAGE_DIM) {
  const type = file.type || ''
  const keepPng = /png|gif|svg/i.test(type)
  const src = await decode(file)
  const w0 = src.width || src.naturalWidth
  const h0 = src.height || src.naturalHeight
  if (!w0 || !h0) throw new Error('That file is not a readable image')
  const scale = Math.min(1, maxDim / Math.max(w0, h0))
  const w = Math.max(1, Math.round(w0 * scale))
  const h = Math.max(1, Math.round(h0 * scale))
  if (scale === 1 && /^image\/(jpeg|png)$/i.test(type) && file.size <= 600 * 1024) {
    src.close?.()
    return { blob: file, ext: /png/i.test(type) ? 'png' : 'jpg', width: w, height: h }
  }
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!keepPng) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h) }
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, w, h)
  src.close?.()
  const outType = keepPng ? 'image/png' : 'image/jpeg'
  const blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not process that image'))), outType, 0.85))
  return { blob, ext: keepPng ? 'png' : 'jpg', width: w, height: h }
}

/* ---------------- data-URL cache (keeps reopening notes instant) ---------------- */

const urlCache = new Map()
const CACHE_LIMIT = 80
function remember(path, url) {
  urlCache.delete(path)
  urlCache.set(path, url)
  while (urlCache.size > CACHE_LIMIT) urlCache.delete(urlCache.keys().next().value)
}
async function dataUrlFor(path) {
  if (urlCache.has(path)) return urlCache.get(path)
  const blob = await store()?.getBlob(path)
  if (!blob) return null
  const url = await blobToDataUrl(blob)
  remember(path, url)
  return url
}

/* ---------------- note images ---------------- */

export const imagePath = (ref) => 'img/' + ref

export async function saveImage(blob, ext) {
  const ref = uid() + '.' + ext
  await store().setBlob(imagePath(ref), blob)
  remember(imagePath(ref), await blobToDataUrl(blob))
  return ref
}
export const imageDataUrl = (ref) => dataUrlFor(imagePath(ref))
export async function removeImage(ref) {
  urlCache.delete(imagePath(ref))
  try { await store()?.remove(imagePath(ref)) } catch { /* already gone */ }
}

/* ---------------- event attachments ---------------- */

export const attachmentPath = (ref) => 'att/' + ref
const extOf = (name) => {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name || '')
  return m ? m[1].toLowerCase() : 'bin'
}

export async function saveAttachment(file) {
  const rawImage = /^image\/(jpeg|png|gif|webp|bmp)$/i.test(file.type || '')
  let blob = file
  let ext = extOf(file.name)
  let type = file.type || 'application/octet-stream'
  if (rawImage) {
    const p = await prepareImage(file)
    blob = p.blob
    ext = p.ext
    type = p.ext === 'png' ? 'image/png' : 'image/jpeg'
  } else {
    // Store other files as neutral bytes: storage applies JSON rules to some types
    // and to *.json paths. The real name and type stay in the event's metadata.
    blob = new Blob([file], { type: 'application/octet-stream' })
    ext = 'bin'
  }
  if (blob.size > MAX_FILE_BYTES) throw new Error(`${file.name || 'That file'} is larger than 25 MB`)
  const ref = uid() + '.' + ext
  await store().setBlob(attachmentPath(ref), blob)
  return { id: uid(), ref, name: file.name || 'file.' + ext, type, size: blob.size, isImage: rawImage }
}
export const attachmentDataUrl = (ref) => dataUrlFor(attachmentPath(ref))
export async function removeAttachment(ref) {
  urlCache.delete(attachmentPath(ref))
  try { await store()?.remove(attachmentPath(ref)) } catch { /* already gone */ }
}
// The app's sandbox blocks direct downloads, but pop-up windows are allowed and
// leave the sandbox. So: open a window during the click (browsers only allow
// pop-ups then), fetch the file, and start the download from that window.
export async function downloadAttachment(att) {
  const w = window.open('', '_blank')
  try {
    if (w) { w.document.title = 'Downloading…'; w.document.body.textContent = 'Preparing ' + (att.name || 'file') + '…' }
    const blob = await store()?.getBlob(attachmentPath(att.ref))
    if (!blob) throw new Error('That file is no longer available')
    const typed = att.type && blob.type !== att.type ? new Blob([blob], { type: att.type }) : blob
    downloadFrom(w || window, typed, att.name || 'download')
  } catch (err) {
    try { w?.close() } catch { /* already closed */ }
    throw err
  }
}
function downloadFrom(w, blob, name) {
  const doc = w.document
  const url = w.URL.createObjectURL(new w.Blob([blob], { type: blob.type }))
  if (w !== window) {
    doc.body.textContent = ''
    const p = doc.createElement('p')
    p.style.cssText = 'font:15px -apple-system,Segoe UI,Roboto,sans-serif;padding:24px'
    p.textContent = name + ' is downloading. If nothing happens, '
    const a = doc.createElement('a'); a.href = url; a.download = name; a.textContent = 'click here'
    p.appendChild(a); p.append('. You can close this tab afterwards.')
    doc.body.appendChild(p)
    a.click()
  } else {
    const a = doc.createElement('a'); a.href = url; a.download = name
    doc.body.appendChild(a); a.click(); a.remove()
  }
  setTimeout(() => w.URL.revokeObjectURL(url), 60000)
}

export const fmtBytes = (n) =>
  n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB'
