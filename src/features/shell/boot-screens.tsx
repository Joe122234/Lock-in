import { useState } from 'react'
import { Copy, ExternalLink, LockKeyhole, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { LogoMark, Wordmark } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { useWorkspace } from '@/providers/workspace-provider'
import { WORKSPACE_ID } from '@/lib/firebase/paths'
import { cn } from '@/lib/utils'

export function BootScreen({ label = 'Opening your workspace' }: { label?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-ink px-6">
      <div className="relative">
        <LogoMark size={54} />
        <span className="absolute -inset-3 -z-10 rounded-2xl bg-lime/10 blur-xl" />
      </div>
      <div className="text-center">
        <p className="text-[14px] font-semibold tracking-[0.16em]">LOCK IN</p>
        <p className="mt-2 flex items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
          <span className="size-1.5 rounded-full bg-lime pulse-dot" />
          {label}
        </p>
      </div>
      <div className="mt-2 w-full max-w-xs space-y-2">
        <div className="shimmer h-2 rounded-full" />
        <div className="shimmer h-2 w-4/5 rounded-full" />
        <div className="shimmer h-2 w-2/3 rounded-full" />
      </div>
    </div>
  )
}

const RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /workspaces/${WORKSPACE_ID}/{document=**} {
      allow read, write: if true;
    }
  }
}`

export function SetupRequiredScreen() {
  const [copied, setCopied] = useState(false)
  const copyRules = async () => {
    try {
      if (!navigator.clipboard) {
        throw new Error('Clipboard access is unavailable in this browser context.')
      }
      await navigator.clipboard.writeText(RULES)
      setCopied(true)
      toast.success(copied ? 'Rules copied again' : 'Firestore rules copied')
    } catch (error) {
      toast.error('Rules could not be copied', {
        description: error instanceof Error ? error.message : 'Select the text manually.',
      })
    }
  }
  const envRows = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_APP_ID',
    'VITE_WORKSPACE_ID',
  ]
  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-xl">
        <Wordmark />
        <div className="mt-8 rounded-2xl border border-line bg-surface p-6 shadow-panel sm:p-8">
          <div className="flex size-10 items-center justify-center rounded-xl bg-lime/10 text-lime">
            <LockKeyhole className="size-5" />
          </div>
          <h1 className="mt-5 text-[24px] font-semibold tracking-[-0.03em]">
            Connect your Firebase project.
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            LOCK IN stores everything in your own Firestore database. Add the web app config to a
            local <code className="rounded bg-surface-2 px-1 font-mono text-[11px]">.env.local</code>{' '}
            file and restart the dev server.
          </p>
          <div className="mt-5 space-y-1.5 rounded-xl border border-line bg-ink/60 p-3.5">
            {envRows.map((key) => (
              <p key={key} className="font-mono text-[10.5px] text-faint">
                <span className="text-lime/70">{key}</span>=…
              </p>
            ))}
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-faint">
            See <span className="font-mono text-[10.5px] text-muted">README.md</span> for the
            Firebase console steps, security rules, and deployment. The app never falls back to
            mock data.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => window.location.reload()}>
              <RefreshCw className="size-4" />
              Reload after adding config
            </Button>
            <Button
              variant="ghost"
              onClick={() => void copyRules()}
            >
              <Copy className="size-4" />
              Copy starter rules
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function AccessDeniedScreen() {
  const { error, reload } = useWorkspace()
  const [copied, setCopied] = useState(false)
  const copyRules = async () => {
    try {
      if (!navigator.clipboard) {
        throw new Error('Clipboard access is unavailable in this browser context.')
      }
      await navigator.clipboard.writeText(RULES)
      setCopied(true)
      toast.success(copied ? 'Rules copied again' : 'Rules copied')
    } catch (caught) {
      toast.error('Rules could not be copied', {
        description: caught instanceof Error ? caught.message : 'Select the text manually.',
      })
    }
  }
  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-2xl">
        <Wordmark />
        <div className="mt-8 rounded-2xl border border-danger/20 bg-surface p-6 shadow-panel sm:p-8">
          <div className="flex size-10 items-center justify-center rounded-xl bg-danger/10 text-danger">
            <ShieldAlert className="size-5" />
          </div>
          <h1 className="mt-5 text-[24px] font-semibold tracking-[-0.03em]">
            Firestore is blocking this workspace.
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            Publish security rules that allow read and write on{' '}
            <code className="rounded bg-surface-2 px-1 font-mono text-[11px]">
              /workspaces/{WORKSPACE_ID}
            </code>
            . This app deliberately has no login, so access is controlled by these rules alone.
          </p>
          {error ? (
            <p className="mt-3 rounded-lg border border-line bg-ink/60 px-3 py-2 font-mono text-[10.5px] leading-relaxed text-danger/90">
              {error}
            </p>
          ) : null}
          <ol className="mt-5 space-y-2.5 text-[12px] leading-relaxed text-muted">
            <li className="flex gap-2.5">
              <span className="font-mono text-[10px] text-faint">01</span>
              Open Firebase Console → Firestore Database → Rules for project{' '}
              <span className="text-fg">lock-in-ap</span>.
            </li>
            <li className="flex gap-2.5">
              <span className="font-mono text-[10px] text-faint">02</span>
              Paste the rule below and click Publish.
            </li>
            <li className="flex gap-2.5">
              <span className="font-mono text-[10px] text-faint">03</span>
              Reload this page. Your first setup screen will appear.
            </li>
          </ol>
          <pre className="mt-5 overflow-x-auto rounded-xl border border-line bg-[#080a09] p-4 font-mono text-[10.5px] leading-relaxed text-lime/80">
            {RULES}
          </pre>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => void copyRules()}
            >
              <Copy className="size-4" />
              Copy rules
            </Button>
            <Button variant="secondary" onClick={reload}>
              <RefreshCw className="size-4" />
              Reload
            </Button>
            <a
              className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-[12px] text-muted hover:text-fg"
              href="https://console.firebase.google.com/project/lock-in-ap/firestore/rules"
              target="_blank"
              rel="noreferrer"
            >
              Firebase console
              <ExternalLink className="size-3.5" />
            </a>
          </div>
          <p className="mt-4 border-t border-line pt-4 text-[10.5px] leading-relaxed text-faint">
            Private-by-URL is not secure. Anyone with your project config and this workspace id
            could read or edit data. Keep the project unshared, and tighten these rules if you add
            authentication later.
          </p>
        </div>
      </div>
    </div>
  )
}

export function ConnectionErrorScreen() {
  const { error, reload } = useWorkspace()
  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className={cn('w-full max-w-lg rounded-2xl border border-line bg-surface p-7 shadow-panel')}>
        <div className="flex size-10 items-center justify-center rounded-xl bg-warning/10 text-warning">
          <WifiOff className="size-5" />
        </div>
        <h1 className="mt-5 text-[22px] font-semibold tracking-[-0.03em]">
          The workspace could not be reached.
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          {error ?? 'Firestore did not return a workspace. Check your connection and configuration.'}
        </p>
        <div className="mt-5 flex gap-2">
          <Button variant="primary" onClick={reload}>
            <RefreshCw className="size-4" />
            Try again
          </Button>
        </div>
      </div>
    </div>
  )
}
