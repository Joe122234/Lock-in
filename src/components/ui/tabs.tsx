import * as TabsPrimitive from '@radix-ui/react-tabs'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export const Tabs = TabsPrimitive.Root

export function TabsList({
  children,
  className,
  ariaLabel,
}: {
  children: ReactNode
  className?: string
  ariaLabel?: string
}) {
  return (
    <TabsPrimitive.List
      aria-label={ariaLabel}
      className={cn(
        'no-scrollbar flex w-full items-center gap-1 overflow-x-auto rounded-xl border border-line bg-surface-2/50 p-1',
        className,
      )}
    >
      {children}
    </TabsPrimitive.List>
  )
}

export function TabsTrigger({
  value,
  children,
  className,
  count,
}: {
  value: string
  children: ReactNode
  className?: string
  count?: number
}) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[12px] font-medium text-muted outline-none transition-all data-[state=active]:bg-surface-3 data-[state=active]:text-fg data-[state=active]:shadow-sm',
        className,
      )}
    >
      {children}
      {typeof count === 'number' ? (
        <span className="rounded bg-black/25 px-1 font-mono text-[9.5px] text-muted">
          {count}
        </span>
      ) : null}
    </TabsPrimitive.Trigger>
  )
}

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string
  children: ReactNode
  className?: string
}) {
  return (
    <TabsPrimitive.Content value={value} className={cn('outline-none', className)}>
      {children}
    </TabsPrimitive.Content>
  )
}
