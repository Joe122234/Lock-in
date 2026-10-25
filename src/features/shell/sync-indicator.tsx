import { CloudOff, CircleAlert, RefreshCw, Check, Loader2 } from 'lucide-react'
import { useWorkspace } from '@/providers/workspace-provider'
import { Tooltip } from '@/components/ui/controls'
import { formatInstant, relativeInstant } from '@/lib/dates'
import { cn } from '@/lib/utils'

export function SyncIndicator({ compact = false }: { compact?: boolean }) {
  const { sync, settings } = useWorkspace()
  const locale = settings?.locale ?? 'en-US'
  const timezone = settings?.timezone ?? 'UTC'

  const meta = {
    idle: { label: 'Connecting', color: 'bg-faint', icon: Loader2, spin: true },
    loading: { label: 'Loading', color: 'bg-faint', icon: Loader2, spin: true },
    saving: { label: 'Saving', color: 'bg-warning', icon: Loader2, spin: true },
    synced: { label: 'Live', color: 'bg-lime', icon: Check, spin: false },
    offline: { label: 'Offline', color: 'bg-warning', icon: CloudOff, spin: false },
    error: { label: 'Sync issue', color: 'bg-danger', icon: CircleAlert, spin: false },
  }[sync.phase]
  const Icon = meta.icon

  return (
    <Tooltip
      content={
        <div className="space-y-1">
          <p className="font-medium">
            {sync.phase === 'offline'
              ? 'Offline — edits are queued locally'
              : sync.phase === 'saving'
                ? 'Saving to Firestore'
                : sync.phase === 'error'
                  ? sync.errorMessage ?? 'Firestore reported an error'
                  : sync.phase === 'synced'
                    ? 'Synced with Firestore'
                    : 'Connecting to Firestore'}
          </p>
          {sync.lastSyncedAt ? (
            <p className="text-muted">
              Last sync {relativeInstant(sync.lastSyncedAt, locale)} ·{' '}
              {formatInstant(sync.lastSyncedAt, timezone, locale, true)}
            </p>
          ) : null}
          {!sync.online ? (
            <p className="text-warning">Your browser reports no network connection.</p>
          ) : null}
        </div>
      }
    >
      <span
        className={cn(
          'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-line bg-surface-2/50 px-2 text-[10px] font-medium text-muted',
          compact && 'border-0 bg-transparent px-1',
        )}
        aria-label={`Firestore status: ${meta.label}`}
      >
        <span className={cn('relative flex size-1.5 rounded-full', meta.color)}>
          {sync.phase === 'synced' ? (
            <span className="absolute inset-0 rounded-full bg-lime/60 pulse-dot" />
          ) : null}
        </span>
        {compact ? (
          <Icon className={cn('size-3.5 text-faint', meta.spin && 'animate-spin')} />
        ) : (
          <span>{meta.label}</span>
        )}
      </span>
    </Tooltip>
  )
}

export function SyncErrorBanner() {
  const { error, sync, reload } = useWorkspace()
  if (!error || sync.phase !== 'error') return null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-danger/20 bg-danger/[0.07] px-4 py-2 text-[11px] text-danger/90 sm:px-6 lg:px-8">
      <span className="font-medium">Sync issue</span>
      <span className="min-w-0 flex-1 truncate opacity-80">{error}</span>
      <button
        type="button"
        onClick={reload}
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium hover:bg-danger/10"
      >
        <RefreshCw className="size-3" />
        Reload
      </button>
    </div>
  )
}
