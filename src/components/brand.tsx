import { cn } from '@/lib/utils'

export function LogoMark({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-lime text-[#0a0d08]',
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62} fill="none">
        <path
          d="M6 4.5v13.2c0 .72.58 1.3 1.3 1.3H18"
          stroke="currentColor"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="17.2" cy="6.4" r="1.7" fill="currentColor" />
      </svg>
      <span className="pointer-events-none absolute inset-0 rounded-[10px] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]" />
    </span>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark size={29} />
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-bold tracking-[0.08em] text-fg">LOCK IN</span>
        <span className="mt-1 font-mono text-[8px] uppercase tracking-[0.22em] text-faint">
          Personal command
        </span>
      </span>
    </span>
  )
}
