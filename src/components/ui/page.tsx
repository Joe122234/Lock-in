import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? <div className="mono-label mb-2.5 text-lime/75">{eyebrow}</div> : null}
        <h1 className="text-balance text-[26px] font-semibold leading-[1.12] tracking-[-0.035em] text-fg sm:text-[32px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  )
}

export function SectionHeader({
  title,
  hint,
  action,
  className,
}: {
  title: ReactNode
  hint?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-3 flex items-end justify-between gap-3', className)}>
      <div className="flex items-baseline gap-2.5">
        <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-fg">{title}</h2>
        {hint ? <span className="text-[11.5px] text-faint">{hint}</span> : null}
      </div>
      {action}
    </div>
  )
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-line', className)} />
}

export function Stat({
  label,
  value,
  detail,
  icon,
  tone = 'default',
  className,
}: {
  label: string
  value: ReactNode
  detail?: ReactNode
  icon?: ReactNode
  tone?: 'default' | 'lime' | 'danger' | 'warning'
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-line bg-surface/90 p-4 sm:p-5',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="mono-label">{label}</span>
        {icon ? (
          <span
            className={cn(
              'text-faint',
              tone === 'lime' && 'text-lime',
              tone === 'danger' && 'text-danger',
              tone === 'warning' && 'text-warning',
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <div
        className={cn(
          'font-num mt-3 text-[28px] font-semibold leading-none text-fg',
          tone === 'lime' && 'text-lime',
          tone === 'danger' && 'text-danger',
          tone === 'warning' && 'text-warning',
        )}
      >
        {value}
      </div>
      {detail ? <div className="mt-2 text-[11.5px] text-muted">{detail}</div> : null}
    </div>
  )
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className,
  ariaLabel,
}: {
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T; label: ReactNode }>
  size?: 'sm' | 'md'
  className?: string
  ariaLabel?: string
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface-2/60 p-0.5',
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cn(
            'inline-flex items-center justify-center gap-1.5 rounded-[7px] font-medium transition-colors',
            size === 'sm' ? 'h-7 px-2.5 text-[11px]' : 'h-8 px-3 text-[12px]',
            value === option.value
              ? 'bg-surface-3 text-fg shadow-sm'
              : 'text-muted hover:text-fg',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Breadcrumb({
  items,
}: {
  items: Array<{ label: string; href?: string }>
}) {
  return (
    <nav className="flex flex-wrap items-center gap-1.5 text-[11px] text-faint">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="flex items-center gap-1.5">
          {index > 0 ? <span className="text-line-strong">/</span> : null}
          {item.href ? (
            <a href={item.href} className="transition-colors hover:text-muted">
              {item.label}
            </a>
          ) : (
            <span className="text-muted">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
