import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Filter,
  LayoutGrid,
  List,
  Moon,
  Plus,
  Rows3,
  TriangleAlert,
  Wand2,
} from 'lucide-react'
import type { CalendarEvent, CalendarView, DateKey, Weekday } from '@/types/domain'
import { useWorkspaceData } from '@/hooks/use-workspace-data'
import {
  addDaysKey,
  addMonthsKey,
  formatDateKey,
  formatDateLong,
  formatMonthYear,
  formatTimeRange,
  formatWeekRange,
  getWeekday,
  monthGridDates,
  startOfWeekKey,
  weekDateKeys,
} from '@/lib/dates'
import { plannedCapacityForDay } from '@/lib/scheduler/planner'
import { moveCalendarEvents } from '@/lib/firebase/repositories/calendarEvents'
import { EVENT_TYPE_LABELS, WEEKDAY_SHORT } from '@/lib/constants'
import { PageHeader } from '@/components/ui/page'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/controls'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown'
import { SegmentedControl } from '@/components/ui/page'
import { notifyError, notifySaved } from '@/components/status'
import { cn, percent } from '@/lib/utils'
import { EventEditor } from './event-editor'
import { PlanWeekDialog } from './plan-week-dialog'
import { eventColor } from './colors'

interface DayCapacity {
  dateKey: DateKey
  capacity: number
  planned: number
  over: boolean
  rest: boolean
  isToday: boolean
}

interface EditorState {
  event: CalendarEvent | null
  date: DateKey
  startTime: string
}

export function CalendarPage() {
  const { settings, collections, today, derived, updateSettings } = useWorkspaceData()
  const [searchParams, setSearchParams] = useSearchParams()
  const [view, setView] = useState<CalendarView>(settings?.calendar.defaultView ?? 'month')
  const [anchor, setAnchor] = useState<DateKey>(today)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [planOpen, setPlanOpen] = useState(false)
  const [planTab, setPlanTab] = useState<'plan' | 'rebalance'>('plan')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(settings?.calendar.showCompleted ?? true)
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DateKey | null>(null)

  useEffect(() => {
    if (searchParams.get('plan') === '1' || searchParams.get('rebalance') === '1') {
      setPlanTab(searchParams.get('rebalance') === '1' ? 'rebalance' : 'plan')
      setPlanOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete('plan')
      next.delete('rebalance')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  useEffect(() => {
    const date = searchParams.get('date')
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setAnchor(date)
      setView('day')
      const next = new URLSearchParams(searchParams)
      next.delete('date')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const visibleEvents = collections.calendarEvents.filter((event) => {
    if (!showCompleted && event.status === 'completed') return false
    if (subjectFilter && event.subjectId !== subjectFilter) return false
    return true
  })
  const eventsByDate = useMemo(() => {
    const map = new Map<DateKey, CalendarEvent[]>()
    for (const event of visibleEvents) {
      if (event.status === 'canceled') continue
      const list = map.get(event.dateKey) ?? []
      list.push(event)
      map.set(event.dateKey, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime)
        if (a.startTime) return -1
        if (b.startTime) return 1
        return a.title.localeCompare(b.title)
      })
    }
    return map
  }, [visibleEvents])

  if (!settings) return null
  const locale = settings.locale
  const weekStartsOn = settings.weekStartsOn
  const checkInsByDate = new Map(collections.checkIns.map((checkIn) => [checkIn.dateKey, checkIn]))

  const capacityFor = (dateKey: DateKey): DayCapacity => {
    const checkIn = checkInsByDate.get(dateKey)
    const mode = checkIn?.workloadMode === 'lowEnergy' || checkIn?.workloadMode === 'rest' ? 'light' : 'normal'
    const day = plannedCapacityForDay(dateKey, settings, mode)
    const planned = (eventsByDate.get(dateKey) ?? [])
      .filter(
        (event) =>
          event.countsTowardCapacity &&
          event.status !== 'canceled' &&
          event.status !== 'skipped',
      )
      .reduce((sum, event) => sum + event.estimatedMinutes, 0)
    return {
      dateKey,
      capacity: day.plannedCapacityMinutes,
      planned,
      over: planned > 0 && (day.plannedCapacityMinutes === 0 || planned > day.plannedCapacityMinutes),
      rest: day.isRest || checkIn?.workloadMode === 'rest',
      isToday: dateKey === today,
    }
  }

  const weekStart = startOfWeekKey(anchor, weekStartsOn)
  const weekDates = weekDateKeys(weekStart)
  const weekCapacity = weekDates.map(capacityFor)
  const weekPlanned = weekCapacity.reduce((sum, day) => sum + day.planned, 0)
  const weekCapacityTotal = weekCapacity.reduce((sum, day) => sum + day.capacity, 0)
  const overDays = weekCapacity.filter((day) => day.over)

  const visibleWeekDates = settings.calendar.showWeekends
    ? weekDates
    : weekDates.filter((date) => {
        const day = getWeekday(date)
        return day !== 0 && day !== 6
      })
  const monthDates = monthGridDates(anchor, weekStartsOn)
  const visibleMonthDates = settings.calendar.showWeekends
    ? monthDates
    : monthDates.filter((date) => {
        const day = getWeekday(date)
        return day !== 0 && day !== 6
      })
  const monthColumnCount = settings.calendar.showWeekends ? 7 : 5
  const monthWeekdayHeaders = Array.from(
    { length: 7 },
    (_, offset) => ((weekStartsOn + offset) % 7) as Weekday,
  ).filter(
    (day) => settings.calendar.showWeekends || (day !== 0 && day !== 6),
  )
  const selectedDayCapacity = capacityFor(anchor)

  const navigate = (direction: -1 | 1) => {
    if (view === 'month') setAnchor((current) => addMonthsKey(current, direction))
    else if (view === 'week') setAnchor((current) => addDaysKey(current, direction * 7))
    else if (view === 'day') setAnchor((current) => addDaysKey(current, direction))
    else setAnchor((current) => addDaysKey(current, direction * 14))
  }

  const changeView = (next: CalendarView) => {
    setView(next)
    void updateSettings({ calendar: { ...settings.calendar, defaultView: next } }).catch(() => undefined)
  }

  const openNew = (date: DateKey, startTime = '') => setEditor({ event: null, date, startTime })
  const openEvent = (event: CalendarEvent) =>
    setEditor({ event, date: event.dateKey, startTime: event.startTime ?? '' })

  const moveEvent = async (eventId: string, toDate: DateKey) => {
    const event = collections.calendarEvents.find((item) => item.id === eventId)
    setDraggingId(null)
    setDropTarget(null)
    if (!event || event.dateKey === toDate) return
    try {
      await moveCalendarEvents([{ eventId, fromDate: event.dateKey, toDate }])
      notifySaved('Block moved', formatDateLong(toDate, locale))
    } catch (error) {
      notifyError(error)
    }
  }

  const headerLabel =
    view === 'month'
      ? formatMonthYear(anchor, locale)
      : view === 'week'
        ? formatWeekRange(weekStart, addDaysKey(weekStart, 6), locale)
        : view === 'day'
          ? formatDateLong(anchor, locale)
          : `${formatDateKey(anchor, locale)} – ${formatDateKey(addDaysKey(anchor, 13), locale)}`

  const nextLabel =
    view === 'month' ? 'Next month' : view === 'week' ? 'Next week' : view === 'day' ? 'Next day' : 'Next 14 days'

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        eyebrow="Time is the real constraint"
        title="Calendar"
        description="A realistic week beats an ambitious list. Plan into capacity, protect rest, and keep every block movable."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => { setPlanTab('rebalance'); setPlanOpen(true) }}>
              <Wand2 className="size-3.5" />
              <span className="hidden sm:inline">Rebalance week</span>
              <span className="sm:hidden">Rebalance</span>
            </Button>
            <Button variant="primary" size="sm" onClick={() => { setPlanTab('plan'); setPlanOpen(true) }}>
              <CalendarDays className="size-3.5" />
              Plan week
            </Button>
          </>
        }
      />

      <div className="rounded-2xl border border-line bg-surface/80 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="iconSm" onClick={() => navigate(-1)} aria-label="Previous period">
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="ghost" size="iconSm" onClick={() => navigate(1)} aria-label={nextLabel}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[16px] font-semibold tracking-[-0.02em] text-fg sm:text-[18px]">
              {headerLabel}
            </h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-faint">
              <span>{formatWeekRange(weekStart, addDaysKey(weekStart, 6), locale)}</span>
              <span className="size-0.5 rounded-full bg-line-strong" />
              <span>{weekPlanned} of {weekCapacityTotal} min planned this week</span>
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAnchor(today)}
            className="hidden sm:inline-flex"
          >
            Today
          </Button>
          <SegmentedControl
            value={view}
            onChange={changeView}
            size="sm"
            className="order-last w-full sm:order-none sm:w-auto"
            ariaLabel="Calendar view"
            options={([
              ['month', 'Month', LayoutGrid],
              ['week', 'Week', Rows3],
              ['day', 'Day', CalendarDays],
              ['agenda', 'Agenda', List],
            ] as const).map(([value, label, Icon]) => ({
              value,
              label: (
                <>
                  <Icon className="size-3" />
                  <span className="hidden xs:inline sm:inline">{label}</span>
                </>
              ),
            }))}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="iconSm" aria-label="Calendar filters" className="relative">
                <Filter className="size-4" />
                {subjectFilter || !showCompleted ? (
                  <span className="absolute right-1 top-1 size-1.5 rounded-full bg-lime" />
                ) : null}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuLabel>Filters</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={showCompleted} onCheckedChange={setShowCompleted}>
                Show completed blocks
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Subject</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => setSubjectFilter(null)}>
                All subjects
                {subjectFilter === null ? <Check className="ml-auto size-3.5 text-lime" /> : null}
              </DropdownMenuItem>
              {derived?.subjects.map((subject) => (
                <DropdownMenuItem key={subject.id} onSelect={() => setSubjectFilter(subject.id)}>
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: subject.color }} />
                  {subject.name}
                  {subjectFilter === subject.id ? <Check className="ml-auto size-3.5 text-lime" /> : null}
                </DropdownMenuItem>
              ))}
              {subjectFilter || !showCompleted ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      setSubjectFilter(null)
                      setShowCompleted(true)
                    }}
                  >
                    Clear filters
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="primary" size="sm" onClick={() => openNew(anchor)}>
            <Plus className="size-3.5" />
            <span className="hidden sm:inline">Add block</span>
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-2.5">
          <CapacityBar label="Week capacity" planned={weekPlanned} capacity={weekCapacityTotal} />
          {overDays.length > 0 ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-danger">
              <TriangleAlert className="size-3" />
              {overDays.length} {overDays.length === 1 ? 'day is' : 'days are'} over capacity
            </span>
          ) : (
            <span className="text-[10px] text-faint">Every day fits inside its set capacity.</span>
          )}
          <div className="ml-auto flex items-center gap-3">
            {derived?.subjects.slice(0, 4).map((subject) => (
              <span key={subject.id} className="inline-flex items-center gap-1 text-[9px] text-faint">
                <span className="size-1.5 rounded-full" style={{ backgroundColor: subject.color }} />
                {subject.name.split(' ').slice(-1)[0]}
              </span>
            ))}
          </div>
        </div>
      </div>

      {view === 'month' ? (
        <MonthView
          dates={visibleMonthDates}
          columnCount={monthColumnCount}
          weekdays={monthWeekdayHeaders}
          anchorMonth={anchor.slice(0, 7)}
          eventsByDate={eventsByDate}
          capacityFor={capacityFor}
          subjects={collections.subjects}
          today={today}
          onSelectDay={(date) => {
            setAnchor(date)
            setView('day')
          }}
          onOpenEvent={openEvent}
          onNew={(date) => openNew(date)}
          onMove={moveEvent}
          draggingId={draggingId}
          setDraggingId={setDraggingId}
          dropTarget={dropTarget}
          setDropTarget={setDropTarget}
        />
      ) : null}

      {view === 'week' ? (
        <WeekView
          dates={visibleWeekDates}
          eventsByDate={eventsByDate}
          capacityFor={capacityFor}
          subjects={collections.subjects}
          locale={locale}
          onOpenEvent={openEvent}
          onNew={openNew}
          onMove={moveEvent}
          draggingId={draggingId}
          setDraggingId={setDraggingId}
          dropTarget={dropTarget}
          setDropTarget={setDropTarget}
        />
      ) : null}

      {view === 'day' ? (
        <DayView
          date={anchor}
          capacity={selectedDayCapacity}
          events={eventsByDate.get(anchor) ?? []}
          subjects={collections.subjects}
          locale={locale}
          onOpenEvent={openEvent}
          onNew={() => openNew(anchor)}
          onMove={moveEvent}
          onPrev={() => setAnchor((current) => addDaysKey(current, -1))}
          onNext={() => setAnchor((current) => addDaysKey(current, 1))}
        />
      ) : null}

      {view === 'agenda' ? (
        <AgendaView
          start={anchor}
          dates={Array.from({ length: 14 }, (_, index) => addDaysKey(anchor, index))}
          eventsByDate={eventsByDate}
          capacityFor={capacityFor}
          subjects={collections.subjects}
          locale={locale}
          onOpenEvent={openEvent}
          onNew={openNew}
          onOpenDay={(date) => {
            setAnchor(date)
            setView('day')
          }}
          unscheduled={derived?.openAssignments.slice(0, 4) ?? []}
          onPlan={() => { setPlanTab('plan'); setPlanOpen(true) }}
        />
      ) : null}

      <EventEditor
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) setEditor(null)
        }}
        event={editor?.event ?? null}
        defaultDate={editor?.date ?? anchor}
        defaultStartTime={editor?.startTime ?? ''}
      />
      <PlanWeekDialog
        open={planOpen}
        onOpenChange={setPlanOpen}
        initialWeekStart={weekStart}
        initialTab={planTab}
      />
    </div>
  )
}

function CapacityBar({
  label,
  planned,
  capacity,
}: {
  label: string
  planned: number
  capacity: number
}) {
  const pct = percent(planned, capacity)
  const over = planned > capacity && capacity > 0
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-faint">{label}</span>
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-white/[0.07] sm:w-28">
        <span
          className={cn('block h-full rounded-full', over ? 'bg-danger' : pct > 85 ? 'bg-warning' : 'bg-lime')}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </span>
      <span className={cn('font-mono text-[9px]', over ? 'text-danger' : 'text-muted')}>
        {planned}/{capacity}m
      </span>
    </span>
  )
}

function MonthView({
  dates,
  columnCount,
  weekdays,
  anchorMonth,
  eventsByDate,
  capacityFor,
  subjects,
  today,
  onSelectDay,
  onOpenEvent,
  onNew,
  onMove,
  draggingId,
  setDraggingId,
  dropTarget,
  setDropTarget,
}: {
  dates: DateKey[]
  columnCount: number
  weekdays: Weekday[]
  anchorMonth: string
  eventsByDate: Map<DateKey, CalendarEvent[]>
  capacityFor: (date: DateKey) => DayCapacity
  subjects: Array<{ id: string; color: string }>
  today: DateKey
  onSelectDay: (date: DateKey) => void
  onOpenEvent: (event: CalendarEvent) => void
  onNew: (date: DateKey) => void
  onMove: (eventId: string, date: DateKey) => void
  draggingId: string | null
  setDraggingId: (id: string | null) => void
  dropTarget: DateKey | null
  setDropTarget: (date: DateKey | null) => void
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface/70">
      <div
        className="grid border-b border-line bg-surface-2/30"
        style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
      >
        {weekdays.map((weekday) => (
          <div key={weekday} className="px-2 py-2 text-center sm:py-2.5">
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
              <span className="sm:hidden">{WEEKDAY_SHORT[weekday].slice(0, 1)}</span>
              <span className="hidden sm:inline">{WEEKDAY_SHORT[weekday]}</span>
            </span>
          </div>
        ))}
      </div>
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
      >
        {dates.map((date) => {
          const inMonth = date.slice(0, 7) === anchorMonth
          const capacity = capacityFor(date)
          const events = eventsByDate.get(date) ?? []
          const isToday = date === today
          return (
            <div
              key={date}
              onDragOver={(dragEvent) => {
                dragEvent.preventDefault()
                setDropTarget(date)
              }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(dragEvent) => {
                dragEvent.preventDefault()
                if (draggingId) onMove(draggingId, date)
              }}
              className={cn(
                'calendar-cell group relative cursor-pointer border-b border-r border-line p-1 sm:p-1.5',
                !inMonth && 'bg-black/15',
                dropTarget === date && 'is-drop-target',
              )}
              onClick={() => onNew(date)}
            >
              <div className="flex items-center justify-between gap-1">
                <button
                  type="button"
                  onClick={(clickEvent) => {
                    clickEvent.stopPropagation()
                    onSelectDay(date)
                  }}
                  className={cn(
                    'flex size-6 items-center justify-center rounded-md font-mono text-[10.5px] tabular-nums transition-colors hover:bg-white/[0.07]',
                    isToday
                      ? 'bg-lime font-semibold text-[#0a0d08]'
                      : inMonth
                        ? 'text-muted'
                        : 'text-faint/45',
                  )}
                  aria-label={`Open ${date}`}
                >
                  {Number(date.slice(8, 10))}
                </button>
                <div className="flex items-center gap-0.5">
                  {capacity.over ? (
                    <span className="size-1.5 rounded-full bg-danger" title="Over capacity" />
                  ) : capacity.planned > 0 ? (
                    <span
                      className="h-1 w-4 overflow-hidden rounded-full bg-white/[0.08]"
                      title={`${capacity.planned}/${capacity.capacity} min`}
                    >
                      <span
                        className="block h-full rounded-full bg-lime/70"
                        style={{ width: `${percent(capacity.planned, capacity.capacity || 1)}%` }}
                      />
                    </span>
                  ) : null}
                  <span className="hidden font-mono text-[7.5px] text-faint group-hover:inline">
                    {capacity.planned > 0 ? `${capacity.planned}m` : ''}
                  </span>
                </div>
              </div>
              <div className="mt-0.5 space-y-0.5">
                {events.slice(0, 3).map((event) => (
                  <div
                    key={event.id}
                    role="button"
                    tabIndex={0}
                    draggable
                    onDragStart={() => setDraggingId(event.id)}
                    onDragEnd={() => {
                      setDraggingId(null)
                      setDropTarget(null)
                    }}
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation()
                      onOpenEvent(event)
                    }}
                    onKeyDown={(keyEvent) => {
                      if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                        keyEvent.preventDefault()
                        onOpenEvent(event)
                      }
                    }}
                    className={cn(
                      'flex cursor-grab items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[9px] font-medium leading-tight transition-opacity active:cursor-grabbing sm:text-[10px]',
                      event.status === 'completed' && 'opacity-50 line-through',
                      draggingId === event.id && 'opacity-30',
                    )}
                    style={{
                      backgroundColor: `${eventColor(event, subjects)}16`,
                      color: eventColor(event, subjects),
                    }}
                  >
                    {event.startTime ? (
                      <span className="shrink-0 font-mono text-[8px] opacity-60">
                        {event.startTime}
                      </span>
                    ) : null}
                    <span className="truncate">{event.title}</span>
                  </div>
                ))}
                {events.length > 3 ? (
                  <p className="px-1 font-mono text-[8px] text-faint">+{events.length - 3} more</p>
                ) : null}
                {events.length === 0 && inMonth ? (
                  <button
                    type="button"
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation()
                      onNew(date)
                    }}
                    className="hidden items-center gap-1 rounded px-1 py-0.5 text-[9px] text-faint/60 opacity-0 transition-opacity hover:text-lime focus-visible:opacity-100 group-hover:opacity-100 sm:flex"
                  >
                    <Plus className="size-2.5" /> block
                  </button>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeekView({
  dates,
  eventsByDate,
  capacityFor,
  subjects,
  locale,
  onOpenEvent,
  onNew,
  onMove,
  draggingId,
  setDraggingId,
  dropTarget,
  setDropTarget,
}: {
  dates: DateKey[]
  eventsByDate: Map<DateKey, CalendarEvent[]>
  capacityFor: (date: DateKey) => DayCapacity
  subjects: Array<{ id: string; color: string }>
  locale: string
  onOpenEvent: (event: CalendarEvent) => void
  onNew: (date: DateKey, startTime?: string) => void
  onMove: (eventId: string, date: DateKey) => void
  draggingId: string | null
  setDraggingId: (id: string | null) => void
  dropTarget: DateKey | null
  setDropTarget: (date: DateKey | null) => void
}) {
  return (
    <div className="no-scrollbar overflow-x-auto rounded-2xl border border-line bg-surface/60">
      <div
        className="grid min-w-[46rem]"
        style={{ gridTemplateColumns: `repeat(${dates.length}, minmax(0, 1fr))` }}
      >
        {dates.map((date) => {
          const capacity = capacityFor(date)
          const events = eventsByDate.get(date) ?? []
          const isToday = capacity.isToday
          return (
            <div
              key={date}
              onDragOver={(dragEvent) => {
                dragEvent.preventDefault()
                setDropTarget(date)
              }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(dragEvent) => {
                dragEvent.preventDefault()
                if (draggingId) onMove(draggingId, date)
              }}
              className={cn(
                'min-h-[28rem] border-r border-line last:border-r-0',
                isToday && 'bg-lime/[0.015]',
                dropTarget === date && 'is-drop-target',
              )}
            >
              <div className={cn('border-b border-line px-2.5 py-2', isToday && 'bg-lime/[0.04]')}>
                <div className="flex items-center justify-between">
                  <p className={cn('font-mono text-[9px] uppercase tracking-[0.12em]', isToday ? 'text-lime' : 'text-faint')}>
                    {formatDateKey(date, locale, { weekday: 'short' })}
                  </p>
                  <span className={cn('font-num text-[16px] font-semibold leading-none', isToday ? 'text-lime' : 'text-fg')}>
                    {Number(date.slice(8, 10))}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <Progress
                    value={Math.min(100, percent(capacity.planned, capacity.capacity || 1))}
                    tone={capacity.over ? 'danger' : capacity.rest ? 'teal' : 'lime'}
                    size="sm"
                    className="flex-1"
                  />
                  <span className={cn('font-mono text-[8px]', capacity.over ? 'text-danger' : 'text-faint')}>
                    {capacity.planned}/{capacity.capacity}
                  </span>
                </div>
                {capacity.rest ? (
                  <p className="mt-1 flex items-center gap-1 font-mono text-[8px] uppercase tracking-wider text-teal/80">
                    <Moon className="size-2.5" /> Rest
                  </p>
                ) : null}
              </div>
              <div className="space-y-1 p-1.5">
                {events.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    draggable
                    onDragStart={() => setDraggingId(event.id)}
                    onDragEnd={() => {
                      setDraggingId(null)
                      setDropTarget(null)
                    }}
                    onClick={() => onOpenEvent(event)}
                    className={cn(
                      'w-full rounded-md border-l-2 bg-surface-2/60 px-1.5 py-1.5 text-left transition-colors hover:bg-surface-3',
                      event.status === 'completed' && 'opacity-45',
                      draggingId === event.id && 'opacity-30',
                    )}
                    style={{ borderLeftColor: eventColor(event, subjects) }}
                  >
                    <p className={cn('truncate text-[9.5px] font-medium leading-tight text-fg', event.status === 'completed' && 'line-through')}>
                      {event.title}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[8px] text-faint">
                      {event.startTime ? formatTimeRange(event.startTime, event.endTime, locale) : `${event.estimatedMinutes}m`}
                    </p>
                  </button>
                ))}
                {events.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => onNew(date)}
                    className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-line/70 py-2 text-[9px] text-faint hover:border-lime/30 hover:text-lime"
                  >
                    <Plus className="size-2.5" /> Add
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onNew(date)}
                    className="flex w-full items-center justify-center gap-1 rounded-md py-1.5 text-[9px] text-faint hover:bg-white/[0.03] hover:text-lime"
                  >
                    <Plus className="size-2.5" /> Add block
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DayView({
  date,
  capacity,
  events,
  subjects,
  locale,
  onOpenEvent,
  onNew,
  onMove,
  onPrev,
  onNext,
}: {
  date: DateKey
  capacity: DayCapacity
  events: CalendarEvent[]
  subjects: Array<{ id: string; color: string }>
  locale: string
  onOpenEvent: (event: CalendarEvent) => void
  onNew: () => void
  onMove: (eventId: string, date: DateKey) => void
  onPrev: () => void
  onNext: () => void
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="rounded-2xl border border-line bg-surface/70">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5">
          <div>
            <p className="text-[13px] font-semibold text-fg">
              {formatDateKey(date, locale, { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <p className="mt-0.5 text-[10.5px] text-faint">
              {events.length} {events.length === 1 ? 'block' : 'blocks'} · {capacity.planned} of{' '}
              {capacity.capacity} min
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="iconSm" onClick={onPrev} aria-label="Previous day">
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="ghost" size="iconSm" onClick={onNext} aria-label="Next day">
              <ChevronRight className="size-4" />
            </Button>
            <Button variant="secondary" size="sm" onClick={onNew}>
              <Plus className="size-3.5" /> Block
            </Button>
          </div>
        </div>

        {capacity.over ? (
          <div className="flex items-center gap-2 border-b border-danger/15 bg-danger/[0.055] px-4 py-2 text-[10.5px] text-danger/90">
            <TriangleAlert className="size-3.5 shrink-0" />
            {capacity.planned - capacity.capacity} minutes over this day’s capacity. Move or shorten a
            block rather than borrowing from sleep.
          </div>
        ) : null}
        {capacity.rest && events.some((event) => event.countsTowardCapacity) ? (
          <div className="flex items-center gap-2 border-b border-warning/15 bg-warning/[0.05] px-4 py-2 text-[10.5px] text-warning/90">
            <Moon className="size-3.5 shrink-0" />
            This is a scheduled rest day. These blocks will not lower your streak, but protect the
            recovery you planned.
          </div>
        ) : null}

        <div className="p-3 sm:p-4">
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line py-16 text-center">
              <span className="flex size-11 items-center justify-center rounded-xl border border-line bg-surface-2 text-faint">
                <CalendarPlus className="size-5" />
              </span>
              <div>
                <p className="text-[13px] font-medium">Nothing scheduled.</p>
                <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-faint">
                  {capacity.rest
                    ? 'Rest is the plan. Leave it empty.'
                    : 'A clear day is fine. If it should carry work, add one realistic block.'}
                </p>
              </div>
              {!capacity.rest ? (
                <Button variant="secondary" size="sm" onClick={onNew}>
                  <Plus className="size-3.5" /> Add a block
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-1.5">
              {events.map((event) => {
                const color = eventColor(event, subjects)
                return (
                  <button
                    key={event.id}
                    type="button"
                    draggable
                    onDragStart={() => setDraggingId(event.id)}
                    onDragEnd={() => setDraggingId(null)}
                    onClick={() => onOpenEvent(event)}
                    onDragOver={(dragEvent) => dragEvent.preventDefault()}
                    onDrop={(dragEvent) => {
                      dragEvent.preventDefault()
                      if (draggingId) onMove(draggingId, date)
                    }}
                    className={cn(
                      'group flex w-full items-center gap-3 rounded-xl border border-transparent px-2.5 py-2.5 text-left transition-colors hover:border-line hover:bg-white/[0.025]',
                      event.status === 'completed' && 'opacity-50',
                    )}
                  >
                    <span className="w-12 shrink-0 text-right font-mono text-[10px] text-faint">
                      {event.startTime ?? '—'}
                    </span>
                    <span className="h-9 w-[2px] shrink-0 rounded-full" style={{ backgroundColor: color }} />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-[12.5px] font-medium text-fg', event.status === 'completed' && 'line-through')}>
                        {event.title}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-faint">
                        <span>{formatTimeRange(event.startTime, event.endTime, locale)}</span>
                        <span className="size-0.5 rounded-full bg-line-strong" />
                        <span>{EVENT_TYPE_LABELS[event.eventType]}</span>
                        {event.recurrenceRule ? <Badge tone="outline" className="h-4 px-1.5 text-[8px]">Repeats</Badge> : null}
                      </span>
                    </span>
                    <span className="hidden font-mono text-[9px] text-faint sm:block">
                      {event.estimatedMinutes}m
                    </span>
                    <ChevronRight className="size-3.5 text-faint opacity-0 group-hover:opacity-100" />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="rounded-2xl border border-line bg-surface/70 p-4">
          <p className="mono-label">Day capacity</p>
          <div className="mt-3 flex items-end justify-between">
            <span className={cn('font-num text-[30px] font-semibold leading-none', capacity.over ? 'text-danger' : 'text-fg')}>
              {capacity.planned}
            </span>
            <span className="pb-0.5 font-mono text-[10px] text-faint">/ {capacity.capacity} min</span>
          </div>
          <Progress
            value={Math.min(100, percent(capacity.planned, capacity.capacity || 1))}
            tone={capacity.over ? 'danger' : capacity.rest ? 'teal' : 'lime'}
            className="mt-3"
          />
          <p className="mt-2.5 text-[10px] leading-relaxed text-faint">
            {capacity.over
              ? `${capacity.planned - capacity.capacity} minutes beyond this day's plan.`
              : `${Math.max(0, capacity.capacity - capacity.planned)} minutes still unclaimed.`}
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-surface/70 p-4">
          <p className="mono-label">Block breakdown</p>
          <div className="mt-3 space-y-2">
            {events.length === 0 ? (
              <p className="text-[10.5px] text-faint">No blocks to break down.</p>
            ) : (
              events.map((event) => (
                <div key={event.id} className="flex items-center gap-2">
                  <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: eventColor(event, subjects) }} />
                  <span className="min-w-0 flex-1 truncate text-[10.5px] text-muted">{event.title}</span>
                  <span className="font-mono text-[9px] text-faint">{event.estimatedMinutes}m</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function AgendaView({
  start,
  dates,
  eventsByDate,
  capacityFor,
  subjects,
  locale,
  onOpenEvent,
  onNew,
  onOpenDay,
  unscheduled,
  onPlan,
}: {
  start: DateKey
  dates: DateKey[]
  eventsByDate: Map<DateKey, CalendarEvent[]>
  capacityFor: (date: DateKey) => DayCapacity
  subjects: Array<{ id: string; color: string }>
  locale: string
  onOpenEvent: (event: CalendarEvent) => void
  onNew: (date: DateKey) => void
  onOpenDay: (date: DateKey) => void
  unscheduled: Array<{ id: string; title: string; estimatedMinutes: number; course: string }>
  onPlan: () => void
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-2">
        {dates.map((date) => {
          const events = eventsByDate.get(date) ?? []
          const capacity = capacityFor(date)
          const highlight = capacity.over || capacity.rest
          if (events.length === 0 && !capacity.rest && date !== start) {
            return null
          }
          return (
            <div
              key={date}
              className={cn(
                'rounded-xl border bg-surface/60',
                capacity.over
                  ? 'border-danger/20'
                  : capacity.rest
                    ? 'border-teal/15'
                    : 'border-line',
              )}
            >
              <button
                type="button"
                onClick={() => onOpenDay(date)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left"
              >
                <span
                  className={cn(
                    'flex size-8 shrink-0 flex-col items-center justify-center rounded-lg font-mono',
                    capacity.isToday ? 'bg-lime text-[#0a0d08]' : 'bg-surface-2 text-muted',
                  )}
                >
                  <span className="text-[8px] uppercase leading-none opacity-70">
                    {formatDateKey(date, locale, { weekday: 'narrow' })}
                  </span>
                  <span className="mt-0.5 text-[12px] font-semibold leading-none">
                    {Number(date.slice(8, 10))}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11.5px] font-medium text-fg">
                    {formatDateKey(date, locale, { weekday: 'long', month: 'short', day: 'numeric' })}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-faint">
                    {events.length} {events.length === 1 ? 'block' : 'blocks'}
                    {capacity.capacity > 0 ? ` · ${capacity.planned}/${capacity.capacity} min` : ' · rest'}
                  </span>
                </span>
                {highlight ? (
                  <Badge tone={capacity.over ? 'danger' : 'success'} className="h-5 px-1.5 text-[8.5px]">
                    {capacity.over ? 'Over capacity' : 'Rest'}
                  </Badge>
                ) : null}
                <ChevronRight className="size-3.5 text-faint" />
              </button>
              {events.length > 0 ? (
                <div className="border-t border-line px-2 py-1.5">
                  {events.map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => onOpenEvent(event)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.03]"
                    >
                      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: eventColor(event, subjects) }} />
                      <span className="min-w-0 flex-1 truncate text-[11px] text-fg/90">{event.title}</span>
                      <span className="font-mono text-[9px] text-faint">
                        {event.startTime ?? `${event.estimatedMinutes}m`}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="border-t border-line px-4 py-2">
                  <button type="button" onClick={() => onNew(date)} className="text-[10px] text-faint hover:text-lime">
                    + Add block
                  </button>
                </div>
              )}
            </div>
          )
        })}
        {dates.every((date) => (eventsByDate.get(date) ?? []).length === 0 && !capacityFor(date).rest) ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line py-16 text-center">
            <CalendarDays className="size-6 text-faint" />
            <div>
              <p className="text-[12.5px] font-medium">A clear two weeks.</p>
              <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-faint">
                No events are scheduled. Plan the week instead of waiting for it to fill itself.
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={onPlan}>
              <Plus className="size-3.5" /> Plan week
            </Button>
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        <div className="rounded-2xl border border-line bg-surface/70 p-4">
          <div className="flex items-center justify-between">
            <p className="mono-label">Unscheduled work</p>
            <Badge tone="outline">{unscheduled.length}</Badge>
          </div>
          <div className="mt-3 space-y-2">
            {unscheduled.length === 0 ? (
              <p className="text-[10.5px] leading-relaxed text-faint">
                Nothing open without a date. The queue is clear.
              </p>
            ) : (
              unscheduled.map((assignment) => (
                <div key={assignment.id} className="flex items-start gap-2">
                  <CircleDashed className="mt-0.5 size-3 shrink-0 text-faint" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10.5px] text-fg/85">{assignment.title}</p>
                    <p className="mt-0.5 font-mono text-[8.5px] text-faint">
                      {assignment.course} · {assignment.estimatedMinutes}m
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
          <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={onPlan}>
            <Wand2 className="size-3.5" /> Fit work into the week
          </Button>
        </div>

        <div className="rounded-2xl border border-line bg-surface/60 p-4">
          <div className="flex items-center gap-2">
            <ArrowRight className="size-3.5 text-lime" />
            <p className="text-[11px] font-medium">Agenda is read-only</p>
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-faint">
            Open a day to move, shorten, or complete blocks. Agenda is for seeing the shape of the
            next two weeks without editing by accident.
          </p>
        </div>
      </div>
    </div>
  )
}
