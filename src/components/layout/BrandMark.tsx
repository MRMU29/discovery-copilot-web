import { BRAND_ICON_URL } from '@/lib/brand'

/**
 * Brand icon rendered as a CSS mask so the glyph inherits `bg-ink` and stays
 * visible in both themes. The SVG file itself has a transparent background and
 * a fixed accent stroke for HTML export, where an `<img>` is used instead.
 * Decorative by default (`aria-hidden`) — the adjacent wordmark carries the name.
 */
export function BrandMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 bg-ink ${className}`}
      style={{
        WebkitMaskImage: `url("${BRAND_ICON_URL}")`,
        maskImage: `url("${BRAND_ICON_URL}")`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
      }}
    />
  )
}
