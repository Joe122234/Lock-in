import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { Check, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

export function DropdownMenuContent({
  children,
  className,
  align = 'end',
  sideOffset = 6,
}: {
  children: ReactNode
  className?: string
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
}) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-[70] min-w-44 overflow-hidden rounded-xl border border-line-strong bg-[#141714] p-1.5 shadow-panel outline-none',
          'data-[state=open]:animate-[rise-in_160ms_ease-out_both]',
          className,
        )}
      >
        {children}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  )
}

export function DropdownMenuItem({
  children,
  onSelect,
  icon,
  danger,
  disabled,
  shortcut,
}: {
  children: ReactNode
  onSelect?: (event: Event) => void
  icon?: ReactNode
  danger?: boolean
  disabled?: boolean
  shortcut?: string
}) {
  return (
    <DropdownMenuPrimitive.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] outline-none transition-colors data-[highlighted]:bg-white/[0.06] data-[disabled]:opacity-40',
        danger ? 'text-danger data-[highlighted]:bg-danger/10' : 'text-fg/90',
      )}
    >
      {icon ? <span className="shrink-0 text-faint [.text-danger_&]:text-danger">{icon}</span> : null}
      <span className="flex-1">{children}</span>
      {shortcut ? (
        <span className="font-mono text-[10px] uppercase tracking-wider text-faint">
          {shortcut}
        </span>
      ) : null}
    </DropdownMenuPrimitive.Item>
  )
}

export function DropdownMenuLabel({ children }: { children: ReactNode }) {
  return (
    <DropdownMenuPrimitive.Label className="mono-label px-2.5 pb-1.5 pt-2">
      {children}
    </DropdownMenuPrimitive.Label>
  )
}

export function DropdownMenuSeparator() {
  return <DropdownMenuPrimitive.Separator className="my-1 h-px bg-line" />
}

export function DropdownMenuCheckboxItem({
  children,
  checked,
  onCheckedChange,
}: {
  children: ReactNode
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      checked={checked}
      onCheckedChange={onCheckedChange}
      className="flex cursor-pointer select-none items-center gap-2 rounded-lg py-2 pl-8 pr-2.5 text-[12.5px] text-fg/90 outline-none transition-colors data-[highlighted]:bg-white/[0.06]"
    >
      <span className="absolute left-2.5 flex size-4 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="size-3.5 text-lime" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

export function DropdownSubTrigger({ children }: { children: ReactNode }) {
  return (
    <DropdownMenuPrimitive.SubTrigger className="flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] outline-none data-[highlighted]:bg-white/[0.06]">
      {children}
      <ChevronRight className="ml-auto size-3.5 text-faint" />
    </DropdownMenuPrimitive.SubTrigger>
  )
}
