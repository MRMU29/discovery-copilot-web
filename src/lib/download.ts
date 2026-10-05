/**
 * Blob download helpers shared by Prompt Relay (.txt/.json), report export
 * (.html) and PNG capture. Anchors are appended to <body> so the click works
 * on WebKit/Android; the object URL is revoked on a timer (safari quirk).
 */

export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  downloadBlobUrl(filename, URL.createObjectURL(blob))
}

export function downloadDataUrl(filename: string, dataUrl: string): void {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function downloadBlobUrl(filename: string, url: string): void {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
