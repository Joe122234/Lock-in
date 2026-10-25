import { useEffect, useRef, useState } from 'react'
import { Check, Pause, Play, Plus, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { formatDuration } from '@/lib/dates'
import { notifyError } from '@/components/status'
import { cn, errorMessage } from '@/lib/utils'

export interface FocusTarget {
  title: string
  subtitle: string
  plannedMinutes: number
  color: string
  onComplete: (elapsedMinutes: number) => Promise<void>
}

export function FocusSessionDialog({
  open,
  onOpenChange,
  target,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: FocusTarget | null
}) {
  const plannedSeconds = Math.max(5, target?.plannedMinutes ?? 25) * 60
  const [remaining, setRemaining] = useState(plannedSeconds)
  const [running, setRunning] = useState(true)
  const [saving, setSaving] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null)

  useEffect(() => {
    if (!open) return
    setRemaining(plannedSeconds)
    setRunning(true)
    setSaving(false)
    setCompleted(false)
    setError(null)
  }, [open, plannedSeconds, target?.title])

  useEffect(() => {
    if (!open || !running || completed) return
    const interval = window.setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          window.clearInterval(interval)
          setRunning(false)
          return 0
        }
        return value - 1
      })
    }, 1000)
    return () => window.clearInterval(interval)
  }, [open, running, completed])

  useEffect(() => {
    if (!open) return
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> }
    }
    if (!nav.wakeLock) return
    let disposed = false
    void nav.wakeLock
      .request('screen')
      .then((lock) => {
        if (disposed) {
          void lock.release()
        } else {
          wakeLock.current = lock
        }
      })
      .catch(() => undefined)
    return () => {
      disposed = true
      if (wakeLock.current) {
        void wakeLock.current.release().catch(() => undefined)
        wakeLock.current = null
      }
    }
  }, [open])

  if (!target) return null

  const total = plannedSeconds
  const elapsed = Math.min(total, Math.max(0, total - remaining))
  const progress = total > 0 ? elapsed / total : 0
  const radius = 84
  const circumference = 2 * Math.PI * radius
  const minutesLabel = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(
    remaining % 60,
  ).padStart(2, '0')}`

  const complete = async () => {
    setSaving(true)
    setError(null)
    try {
      const elapsedMinutes = Math.max(1, Math.round(elapsed / 60))
      await target.onComplete(elapsedMinutes)
      setCompleted(true)
      setRunning(false)
      window.setTimeout(() => onOpenChange(false), 900)
    } catch (err) {
      setError(errorMessage(err))
      notifyError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" showClose={false} className="sm:max-w-lg">
        <div className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full opacity-25 blur-3xl"
            style={{ backgroundColor: target.color }}
          />
          <div className="relative px-5 pb-8 pt-5 sm:px-8 sm:pb-9 sm:pt-7">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="mono-label" style={{ color: target.color }}>
                  Focus session
                </p>
                <h2 className="mt-2 text-balance text-[19px] font-semibold leading-snug tracking-[-0.02em] sm:text-[22px]">
                  {target.title}
                </h2>
                <p className="mt-1 text-[11.5px] text-muted">{target.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-faint hover:bg-white/5 hover:text-fg"
                aria-label="Close focus session"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="relative mx-auto mt-7 flex size-52 items-center justify-center sm:size-60">
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 200 200" aria-hidden>
                <circle cx="100" cy="100" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
                <circle
                  cx="100"
                  cy="100"
                  r={radius}
                  fill="none"
                  stroke={target.color}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - progress)}
                  className="transition-[stroke-dashoffset] duration-700 ease-linear"
                  style={{ filter: `drop-shadow(0 0 10px ${target.color}55)` }}
                />
              </svg>
              <div className="text-center">
                <div className="font-num text-[43px] font-semibold leading-none tracking-[-0.05em] text-fg sm:text-[48px]">
                  {minutesLabel}
                </div>
                <p className="mono-label mt-3">
                  {completed ? 'Logged' : running ? 'In progress' : remaining === 0 ? 'Block finished' : 'Paused'}
                </p>
                <p className="mt-2 font-mono text-[10px] text-faint">
                  {formatDuration(Math.round(elapsed / 60))} focused
                </p>
              </div>
            </div>

            <div className="mt-7 flex items-center justify-center gap-2">
              <Button
                variant="secondary"
                size="iconLg"
                onClick={() => setRemaining((value) => Math.min(total + 300, value + 300))}
                aria-label="Add five minutes"
                disabled={completed}
              >
                <Plus className="size-4" />
              </Button>
              <Button
                variant={running ? 'outline' : 'primary'}
                onClick={() => setRunning((value) => !value)}
                className="h-11 min-w-32"
                disabled={completed || remaining === 0}
              >
                {running ? (
                  <>
                    <Pause className="size-4" /> Pause
                  </>
                ) : (
                  <>
                    <Play className="size-4" /> {remaining === total ? 'Start' : 'Resume'}
                  </>
                )}
              </Button>
              <Button
                variant="secondary"
                size="iconLg"
                onClick={() => {
                  setRemaining(plannedSeconds)
                  setRunning(false)
                }}
                aria-label="Reset timer"
                disabled={completed}
              >
                <RotateCcw className="size-4" />
              </Button>
            </div>

            {error ? (
              <p className="mt-4 rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-[11.5px] text-danger">
                {error}
              </p>
            ) : null}

            <div className="mt-6 space-y-2">
              <Button
                variant={completed ? 'secondary' : 'limeGhost'}
                className={cn('w-full', completed && 'pointer-events-none')}
                onClick={complete}
                disabled={saving || completed}
              >
                {completed ? (
                  <>
                    <Check className="size-4" /> Session logged
                  </>
                ) : (
                  <>
                    <Check className="size-4" />
                    {saving ? 'Saving…' : 'Log session & mark done'}
                  </>
                )}
              </Button>
              <p className="text-center text-[10px] leading-relaxed text-faint">
                Logging uses your actual focused minutes and updates the streak from real work.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
