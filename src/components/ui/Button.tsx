import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white shadow-xs hover:bg-accent-hover hover:shadow-sm',
  secondary: 'border border-hairline bg-surface-1 text-ink shadow-xs hover:border-hairline-strong hover:bg-surface-2',
  ghost: 'text-ink-muted hover:bg-surface-2 hover:text-ink',
  danger: 'border border-danger/30 bg-danger/5 text-danger hover:bg-danger/10',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

/** 44px min touch target (安卓优先, plan §3). */
export function Button({ variant = 'primary', className = '', type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 max-w-full items-center justify-center break-words rounded-btn px-4 py-2.5 text-center text-button transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  )
}
