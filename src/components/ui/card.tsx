import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Card({
  className,
  interactive,
  accent,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean; accent?: string }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-line bg-surface/95',
        interactive &&
          'transition-colors duration-200 hover:border-line-strong hover:bg-surface-2/80',
        className,
      )}
      style={accent ? ({ '--card-accent': accent } as CSSProperties) : undefined}
      {...props}
    />
  )
}

export function CardHeader({
  className,
  children,
  action,
}: {
  className?: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-5 pt-5', className)}>
      <div className="min-w-0">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function CardTitle({
  children,
  className,
  as: Tag = 'h2',
}: {
  children: ReactNode
  className?: string
  as?: 'h1' | 'h2' | 'h3'
}) {
  return (
    <Tag className={cn('text-[15px] font-semibold tracking-[-0.01em] text-fg', className)}>
      {children}
    </Tag>
  )
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center gap-2 border-t border-line px-5 py-3.5', className)}
      {...props}
    />
  )
}

export function PanelLabel({
  children,
  className,
  right,
}: {
  children: ReactNode
  className?: string
  right?: ReactNode
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <span className="mono-label">{children}</span>
      {right}
    </div>
  )
}
