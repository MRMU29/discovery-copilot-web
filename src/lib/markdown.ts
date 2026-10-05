import DOMPurify from 'dompurify'
import { marked } from 'marked'

/**
 * Report / AI output rendering. Both sources are untrusted (the model can
 * emit HTML), so every render goes marked → DOMPurify before it may touch
 * innerHTML — in-app AND in the shared .html export file.
 */
const ALLOWED_URI_REGEXP = /^(?:https?:|mailto:|#|\/)/i

export function renderMarkdown(markdown: string): string {
  const html = marked.parse(markdown, { async: false })
  return DOMPurify.sanitize(html, { ALLOWED_URI_REGEXP })
}
