import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const fieldBase =
  'w-full rounded-xl border border-line bg-surface-2/70 text-fg placeholder:text-faint transition-colors focus:border-lime/50 focus:bg-surface-2 focus:outline-none disabled:opacity-50'

export function Field({
  label,
  hint,
  error,
  optional,
  children,
  className,
  htmlFor,
}: {
  label?: ReactNode
  hint?: ReactNode
  error?: string | null
  optional?: boolean
  children: ReactNode
  className?: string
  htmlFor?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <div className="flex items-baseline justify-between gap-3">
          <label
            htmlFor={htmlFor}
            className="text-[11.5px] font-medium tracking-[0.01em] text-muted"
          >
            {label}
            {optional ? <span className="ml-1 text-faint">optional</span> : null}
          </label>
        </div>
      ) : null}
      {children}
      {error ? (
        <p className="text-[11px] leading-snug text-danger">{error}</p>
      ) : hint ? (
        <p className="text-[11px] leading-snug text-faint">{hint}</p>
      ) : null}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(fieldBase, 'h-10 px-3 text-sm', className)} {...props} />
  ),
)
Input.displayName = 'Input'

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(fieldBase, 'min-h-24 resize-y px-3 py-2.5 text-sm leading-relaxed', className)}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  children: ReactNode
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          fieldBase,
          'h-10 cursor-pointer appearance-none pl-3 pr-9 text-sm',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-faint"
        aria-hidden
      />
    </div>
  ),
)
Select.displayName = 'Select'

export function NumberInput({
  className,
  suffix,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { suffix?: string }) {
  return (
    <div className="relative">
      <input
        type="number"
        inputMode="numeric"
        className={cn(fieldBase, 'h-10 px-3 text-sm', suffix && 'pr-14', className)}
        {...props}
      />
      {suffix ? (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-wider text-faint">
          {suffix}
        </span>
      ) : null}
    </div>
  )
}

export function SearchInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <div className={cn('relative', className)}>
      <svg
        className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-faint"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden
      >
        <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <input
        id={id}
        className={cn(fieldBase, 'h-9 pl-9 pr-3 text-[13px]', className)}
        {...props}
      />
    </div>
  )
}

export function FormGrid({
  children,
  className,
  cols = 2,
}: {
  children: ReactNode
  className?: string
  cols?: 2 | 3
}) {
  return (
    <div
      className={cn(
        'grid gap-3',
        cols === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {children}
    </div>
  )
}
