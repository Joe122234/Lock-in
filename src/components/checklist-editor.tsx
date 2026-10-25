import { GripVertical, Plus, Trash2 } from 'lucide-react'
import type { ChecklistItem } from '@/types/domain'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/controls'
import { cn } from '@/lib/utils'

export function createChecklistItem(label = ''): ChecklistItem {
  return {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    done: false,
  }
}

export function ChecklistEditor({
  items,
  onChange,
  placeholder = 'Add a step…',
  compact,
}: {
  items: ChecklistItem[]
  onChange: (items: ChecklistItem[]) => void
  placeholder?: string
  compact?: boolean
}) {
  const update = (id: string, patch: Partial<ChecklistItem>) =>
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)))

  return (
    <div className="space-y-1.5">
      {items.map((item, index) => (
        <div key={item.id} className="group flex items-center gap-2">
          <GripVertical className="size-3.5 shrink-0 text-faint/50" aria-hidden />
          <Checkbox
            checked={item.done}
            onCheckedChange={(done) => update(item.id, { done })}
            label={item.label || 'Checklist item'}
          />
          <input
            value={item.label}
            onChange={(event) => update(item.id, { label: event.target.value })}
            placeholder={placeholder}
            className={cn(
              'min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[12px] text-fg placeholder:text-faint focus:border-line focus:bg-surface-2/60 focus:outline-none',
              item.done && 'text-faint line-through',
            )}
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((entry) => entry.id !== item.id))}
            className="flex size-6 shrink-0 items-center justify-center rounded text-faint/70 opacity-60 transition-opacity hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
            aria-label={`Remove step ${index + 1}`}
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size={compact ? 'xs' : 'sm'}
        onClick={() => onChange([...items, createChecklistItem()])}
        className="text-faint"
      >
        <Plus className="size-3.5" />
        {items.length === 0 ? 'Add steps' : 'Add another step'}
      </Button>
    </div>
  )
}

export function ChecklistProgress({
  items,
  className,
}: {
  items: ChecklistItem[]
  className?: string
}) {
  if (items.length === 0) return null
  const done = items.filter((item) => item.done).length
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-1 w-16 overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className="h-full rounded-full bg-lime"
          style={{ width: `${Math.round((done / items.length) * 100)}%` }}
        />
      </div>
      <span className="font-mono text-[9px] text-faint">
        {done}/{items.length} steps
      </span>
    </div>
  )
}
