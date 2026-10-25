import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-[background,color,border-color,box-shadow,transform] duration-150 select-none disabled:opacity-45 disabled:pointer-events-none active:translate-y-px',
  {
    variants: {
      variant: {
        primary:
          'bg-lime text-[#0a0d08] font-semibold hover:bg-lime-soft shadow-[0_0_0_1px_rgba(198,247,74,0.15),0_6px_24px_rgba(198,247,74,0.12)]',
        secondary:
          'bg-surface-2 text-fg border border-line hover:bg-surface-3 hover:border-line-strong',
        outline:
          'bg-transparent text-fg border border-line-strong hover:bg-surface-2',
        ghost: 'bg-transparent text-muted hover:text-fg hover:bg-white/[0.05]',
        danger:
          'bg-danger/12 text-danger border border-danger/25 hover:bg-danger/20',
        limeGhost: 'bg-lime/10 text-lime border border-lime/20 hover:bg-lime/16',
      },
      size: {
        xs: 'h-7 px-2.5 text-[11px] rounded-lg gap-1.5',
        sm: 'h-8 px-3 text-xs rounded-lg',
        md: 'h-10 px-4 text-sm',
        lg: 'h-11 px-5 text-sm',
        xl: 'h-12 px-6 text-[15px] rounded-xl',
        icon: 'size-9 p-0 rounded-lg',
        iconSm: 'size-8 p-0 rounded-lg',
        iconLg: 'size-11 p-0 rounded-xl',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <span
              className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
              aria-hidden
            />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    )
  },
)
Button.displayName = 'Button'

export { buttonVariants }
