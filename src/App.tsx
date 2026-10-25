import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from 'react'
import { BrowserRouter, Link, Outlet, Route, Routes } from 'react-router-dom'
import { ArrowLeft, RefreshCw, SearchX } from 'lucide-react'
import { Toaster } from 'sonner'
import { WorkspaceProvider, useWorkspace } from '@/providers/workspace-provider'
import { TooltipProvider } from '@/components/ui/controls'
import { Button } from '@/components/ui/button'
import { Wordmark } from '@/components/brand'
import { AppShell } from '@/features/shell/app-shell'
import {
  AccessDeniedScreen,
  BootScreen,
  ConnectionErrorScreen,
  SetupRequiredScreen,
} from '@/features/shell/boot-screens'
import { OnboardingWizard } from '@/features/onboarding/onboarding-wizard'

const TodayPage = lazy(() =>
  import('@/features/today/today-page').then((module) => ({ default: module.TodayPage })),
)
const CalendarPage = lazy(() =>
  import('@/features/calendar/calendar-page').then((module) => ({ default: module.CalendarPage })),
)
const StudyPage = lazy(() =>
  import('@/features/study/study-page').then((module) => ({ default: module.StudyPage })),
)
const SubjectDetailPage = lazy(() =>
  import('@/features/study/subject-detail-page').then((module) => ({
    default: module.SubjectDetailPage,
  })),
)
const AssignmentsPage = lazy(() =>
  import('@/features/assignments/assignments-page').then((module) => ({
    default: module.AssignmentsPage,
  })),
)
const ProjectsPage = lazy(() =>
  import('@/features/projects/projects-page').then((module) => ({ default: module.ProjectsPage })),
)
const ProjectDetailPage = lazy(() =>
  import('@/features/projects/project-detail-page').then((module) => ({
    default: module.ProjectDetailPage,
  })),
)
const ProgressPage = lazy(() =>
  import('@/features/progress/progress-page').then((module) => ({ default: module.ProgressPage })),
)
const WeeklyReviewPage = lazy(() =>
  import('@/features/review/weekly-review-page').then((module) => ({
    default: module.WeeklyReviewPage,
  })),
)
const InboxPage = lazy(() =>
  import('@/features/inbox/inbox-page').then((module) => ({ default: module.InboxPage })),
)
const SettingsPage = lazy(() =>
  import('@/features/settings/settings-page').then((module) => ({ default: module.SettingsPage })),
)

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('LOCK IN crashed while rendering.', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-dvh items-center justify-center px-5 py-12">
        <div className="w-full max-w-lg rounded-2xl border border-danger/20 bg-surface p-7 shadow-panel">
          <Wordmark />
          <h1 className="mt-8 text-[22px] font-semibold tracking-[-0.03em]">
            Something broke while rendering.
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            Your data is still in Firestore. Reload the app to pick up the last synced state. If this
            keeps happening, export a backup before making further changes.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl border border-line bg-ink/60 p-3 font-mono text-[10.5px] leading-relaxed text-danger/85">
            {this.state.error.message}
          </pre>
          <div className="mt-5 flex gap-2">
            <Button variant="primary" onClick={() => window.location.reload()}>
              <RefreshCw className="size-4" />
              Reload
            </Button>
            <Button variant="secondary" onClick={() => window.location.assign('/')}>
              <ArrowLeft className="size-4" />
              Back to Today
            </Button>
          </div>
        </div>
      </div>
    )
  }
}

function RouteFallback() {
  return (
    <div className="space-y-5 sm:space-y-6" aria-busy="true" aria-live="polite">
      <div className="space-y-2.5">
        <div className="shimmer h-2.5 w-24 rounded-full" />
        <div className="shimmer h-7 w-64 max-w-full rounded-lg" />
        <div className="shimmer h-3 w-full max-w-xl rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-[92px] rounded-2xl border border-line bg-surface/60 px-3.5 py-3">
            <div className="shimmer h-2 w-16 rounded-full" />
            <div className="shimmer mt-3 h-6 w-12 rounded-md" />
            <div className="shimmer mt-3 h-1.5 w-full rounded-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3 rounded-2xl border border-line bg-surface/50 p-4">
          <div className="shimmer h-3 w-32 rounded-full" />
          <div className="shimmer h-20 w-full rounded-xl" />
          <div className="shimmer h-14 w-full rounded-xl" />
          <div className="shimmer h-14 w-5/6 rounded-xl" />
        </div>
        <div className="space-y-3 rounded-2xl border border-line bg-surface/50 p-4">
          <div className="shimmer h-3 w-24 rounded-full" />
          <div className="shimmer h-16 w-full rounded-xl" />
          <div className="shimmer h-16 w-full rounded-xl" />
        </div>
      </div>
      <span className="sr-only">Loading page</span>
    </div>
  )
}

function PageBoundary() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Outlet />
    </Suspense>
  )
}

function NotFoundPage() {
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-lg flex-col items-center justify-center text-center">
      <span className="flex size-11 items-center justify-center rounded-xl border border-line bg-surface-2/60 text-faint">
        <SearchX className="size-5" />
      </span>
      <p className="mono-label mt-5">404 · Off the plan</p>
      <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.035em]">
        This page does not exist.
      </h1>
      <p className="mt-2 max-w-sm text-[12.5px] leading-relaxed text-muted">
        The link may be stale, or the record was archived. Nothing was deleted by opening it.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button asChild variant="primary" size="sm">
          <Link to="/">
            <ArrowLeft className="size-3.5" />
            Go to Today
          </Link>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <Link to="/settings?tab=data">Open data tools</Link>
        </Button>
      </div>
    </div>
  )
}

function WorkspaceGate() {
  const { configured, loading, permissionDenied, error, settings } = useWorkspace()

  if (!configured) return <SetupRequiredScreen />
  if (permissionDenied) return <AccessDeniedScreen />
  if (error && !settings) return <ConnectionErrorScreen />
  if (loading) return <BootScreen />
  if (!settings) return <OnboardingWizard />

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route element={<PageBoundary />}>
          <Route index element={<TodayPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="study" element={<StudyPage />} />
          <Route path="study/:subjectId" element={<SubjectDetailPage />} />
          <Route path="assignments" element={<AssignmentsPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="progress" element={<ProgressPage />} />
          <Route path="review" element={<WeeklyReviewPage />} />
          <Route path="inbox" element={<InboxPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <WorkspaceProvider>
          <TooltipProvider>
            <WorkspaceGate />
            <Toaster
              theme="dark"
              position="bottom-right"
              closeButton
              toastOptions={{
                style: {
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-line-strong)',
                  color: 'var(--color-fg)',
                },
              }}
            />
          </TooltipProvider>
        </WorkspaceProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  )
}
