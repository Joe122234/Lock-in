import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type BadgeTone =
  | 'neutral'
  | 'lime'
  | 'info'
  | 'warning'
  | 'danger'
  | 'success'
  | 'violet'
  | 'outline'

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-white/[0.055] text-muted border-transparent',
  lime: 'bg-lime/12 text-lime border-lime/20',
  info: 'bg-info/12 text-info border-info/20',
  warning: 'bg-warning/12 text-warning border-warning/20',
  danger: 'bg-danger/12 text-danger border-danger/20',
  success: 'bg-teal/12 text-teal border-teal/20',
  violet: 'bg-violet/12 text-violet border-violet/20',
  outline: 'bg-transparent text-muted border-line-strong',
}

export function Badge({
  children,
  tone = 'neutral',
  className,
  dot,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone; dot?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-md border px-2 text-[10.5px] font-medium tracking-[0.01em]',
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current opacity-80" /> : null}
      {children}
    </span>
  )
}

export function SubjectDot({
  color,
  size = 7,
  className,
}: {
  color: string
  size?: number
  className?: string
}) {
  return (
    <span
      className={cn('inline-block shrink-0 rounded-full', className)}
      style={{ width: size, height: size, backgroundColor: color }}
    />
  )
}

export function SubjectBadge({
  name,
  color,
  className,
}: {
  name: string
  color: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-md border px-2 text-[10.5px] font-medium',
        className,
      )}
      style={{
        color,
        backgroundColor: `${color}14`,
        borderColor: `${color}2e`,
      }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
      {name}
    </span>
  )
}

export function KeyHint({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong bg-surface-2 px-1.5 font-mono text-[10px] text-muted">
      {children}
    </kbd>
  )
}
