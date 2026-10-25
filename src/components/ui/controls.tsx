import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { Check, Info, Minus } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Checkbox({
  checked,
  onCheckedChange,
  className,
  disabled,
  label,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  className?: string
  disabled?: boolean
  label?: string
}) {
  return (
    <CheckboxPrimitive.Root
      checked={checked}
      disabled={disabled}
      onCheckedChange={(value) => onCheckedChange(value === true)}
      aria-label={label}
      className={cn(
        'flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border border-line-strong bg-surface-2/70 outline-none transition-colors hover:border-lime/50 data-[state=checked]:border-lime data-[state=checked]:bg-lime data-[state=checked]:text-[#0a0d08]',
        className,
      )}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="check-pop size-3.5" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  label,
  className,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
  className?: string
}) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'relative h-[22px] w-[38px] shrink-0 rounded-full border border-line-strong bg-surface-3 outline-none transition-colors data-[state=checked]:border-lime/40 data-[state=checked]:bg-lime',
        className,
      )}
    >
      <SwitchPrimitive.Thumb className="block size-4 translate-x-[3px] rounded-full bg-muted transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-[#0a0d08]" />
    </SwitchPrimitive.Root>
  )
}

export function Progress({
  value,
  max = 100,
  className,
  tone = 'lime',
  size = 'md',
}: {
  value: number
  max?: number
  className?: string
  tone?: 'lime' | 'info' | 'warning' | 'danger' | 'violet' | 'teal'
  size?: 'sm' | 'md' | 'lg'
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  const colors = {
    lime: 'bg-lime',
    info: 'bg-info',
    warning: 'bg-warning',
    danger: 'bg-danger',
    violet: 'bg-violet',
    teal: 'bg-teal',
  }
  const sizes = { sm: 'h-1', md: 'h-1.5', lg: 'h-2.5' }
  return (
    <div
      className={cn('w-full overflow-hidden rounded-full bg-white/[0.07]', sizes[size], className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-500 ease-out', colors[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={350} skipDelayDuration={100}>
      {children}
    </TooltipPrimitive.Provider>
  )
}

export function Tooltip({
  children,
  content,
  side = 'top',
}: {
  children: ReactNode
  content: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-[80] max-w-64 rounded-lg border border-line bg-[#181c18] px-2.5 py-1.5 text-[11.5px] leading-snug text-fg shadow-panel"
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-[#181c18]" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

export function InfoTip({ content }: { content: ReactNode }) {
  return (
    <Tooltip content={content}>
      <button
        type="button"
        className="inline-flex size-4 items-center justify-center rounded-full text-faint transition-colors hover:text-muted"
        aria-label="More information"
      >
        <Info className="size-3.5" />
      </button>
    </Tooltip>
  )
}

export function IndeterminateMark({ className }: { className?: string }) {
  return <Minus className={cn('size-3', className)} />
}
