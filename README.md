# LOCK IN

A private command center for SAT prep, AP coursework, homework, projects, and the record of what
you actually finish. Dark-only, mobile-first, and backed entirely by your own Cloud Firestore
workspace.

No accounts, no demo data, and no fake success states. Every completed activity, scheduled block,
score, and streak is derived from data persisted in Firestore.

## What is in the app

| Area | What it does |
| --- | --- |
| **Today** | Next best task, schedule, daily check-in, real streak, weekly goals, deadlines, SAT countdown, capacity, and an optional in-app nudge. |
| **Calendar** | Month, week, day, and agenda views; capacity bars; rest days; drag-and-drop moves; recurrence with a bounded materialized horizon; plan-week and rebalance tools. |
| **Study** | Subject cards, weekly session goals, mission queue, topic mastery stages, SAT practice logs, score charts, and a mistake journal with review actions. |
| **Assignments** | Separate due date and target-finish date, statuses, priorities, checklists, links, focus sessions, bulk complete/defer, and archive. |
| **Projects** | Derived milestone progress, risk signals, milestone reordering, focus sessions, and project completion. |
| **Progress** | Streak stats, 18-week heatmap, weekly subject mix, SAT trends, mistake mastery, and achievements. |
| **Weekly review** | Live week stats, completed/unfinished work, goal outcomes, written reflection, workload choice, next-week capacity, and saved review snapshots. |
| **Inbox** | Frictionless capture, editing, and conversion into a mission, homework item, or project. |
| **Settings** | Workspace identity and dates, capacity/rhythm, subject management, streak rules, calendar defaults, reminders, backup/import, Firestore rules, and reset. |

Also included: global quick add (`N`), command palette (`⌘K` or `/`), focus timer with Screen Wake
Lock where supported, offline Firestore persistence, live sync indicators, and a full first-run
setup wizard.

## Stack

- React 19 + TypeScript (strict) + Vite 8
- Tailwind CSS 4 with a custom dark design system
- Radix UI primitives, Lucide icons, Sonner toasts
- React Router 7
- date-fns and Zod
- Recharts
- Firebase 13: Firestore with persistent multi-tab cache and Firebase Hosting
- Vitest, Testing Library, and oxlint

## Quick start

Requirements: Node.js 20+ (developed on Node 25), npm, and a Firebase project with Firestore
enabled.

```bash
npm install
cp .env.example .env.local
```

Create a Firebase Web App in the Firebase console and copy its config into `.env.local`:

```dotenv
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_WORKSPACE_ID=lock-in-personal
```

`VITE_WORKSPACE_ID` defines the only Firestore workspace the client can touch. Keep the default, or
use a different id and update `firestore.rules` to match. The app stores everything under:

```text
workspaces/{VITE_WORKSPACE_ID}/settings/main
workspaces/{VITE_WORKSPACE_ID}/{collection}/{documentId}
```

Publish the rules before opening the app:

```bash
firebase login
firebase use lock-in-ap     # or your own project
firebase deploy --only firestore:rules
npm run dev
```

The first load shows the setup wizard. Saving it writes your first real workspace document and the
four starter subjects/topics. Nothing is seeded until you finish onboarding.

### Local emulator (optional)

The client can connect to the Firestore emulator instead of the live project. This is useful for
trying destructive flows such as import/replace or reset without touching real data.

```bash
# Requires Java (the Firebase emulator is JVM-based).
npx firebase emulators:start --only firestore --project lock-in-ap
# In a second terminal:
VITE_USE_FIREBASE_EMULATOR=true npm run dev
```

The emulator runs at `127.0.0.1:8080` and reads `firestore.rules`. The flag is opt-in and must never
be enabled in a production build. Emulator data is discarded when the process exits unless you
export it.

## Security model — read this

This app intentionally has **no authentication**. Read and write access is controlled only by
Firestore rules:

```javascript
match /workspaces/lock-in-personal/{document=**} {
  allow read, write: if true;
}
```

The workspace id is included in the client bundle. "Private by URL" is therefore **not real
security**. Anyone who can load the deployed app can discover the project config and workspace id
and, with these rules, read or edit the data.

This is an acceptable tradeoff only if you keep the project unshared and treat the deployed URL as
private. If you ever expose the app publicly, add authentication and scope the rules to your UID
before sharing it. Consider Firebase App Check as an additional layer. The in-app Settings → Data
tab repeats this warning and lets you copy the current rules.

The Firebase web config is not a secret, but it should still live in `.env.local`. That file is
ignored by git. Committed `.env.example` values are placeholders.

## Scripts

```bash
npm run dev        # Vite dev server
npm run build      # TypeScript project build + production bundle
npm run preview    # Preview the production bundle
npm test           # Unit tests (dates, recurrence, streaks, planner, backup import)
npm run test:watch # Watch mode
npm run coverage   # Vitest coverage
npm run lint       # oxlint
```

## Data and behavior notes

- **Date-only values** are stored as `YYYY-MM-DD`; wall-clock times as `HH:mm`; true instants use
  Firestore timestamps. Formatting uses the workspace timezone and locale.
- **Streaks come from activity events**, not page visits. Completed missions, study blocks,
  practice, homework, and milestones create events. Reopening a task appends a reversal instead of
  erasing history.
- **Rest days preserve continuity.** A scheduled rest day, a rest check-in, or a `rest` calendar
  event neither adds a day nor breaks the streak, depending on the streak rules.
- **Recurrence is bounded.** Rules materialize at most 84 days ahead with deterministic occurrence
  ids. Edits can target one occurrence or the series.
- **Planner logic is pure.** Capacity, priority ranking, plan-week, and rebalance live in
  `src/lib/scheduler/` and are unit tested. Capacity is a ceiling, not a target.
- **Minutes are honest.** Quick completion leaves actual minutes unknown; only a focused session
  records elapsed minutes, and estimates are never silently reported as actuals.
- **No browser push.** Notifications are in-app only. There is no service worker, no closed-tab
  delivery, and the UI does not claim otherwise.
- **No file uploads.** Firebase Storage is not used.
- **Single workspace.** There is no multi-user collaboration, sharing, or per-user authorization.
- **Offline edits** queue in the browser through Firestore's persistent cache and sync when the
  connection returns. The header shows offline, saving, synced, and error states.

## Backup and restore

Settings → Data can export the raw workspace as versioned JSON (`lock-in-backup-YYYY-MM-DD.json`)
and import it back after validation. Merge keeps existing documents and overwrites matching ids;
Replace deletes current workspace collections first. The settings document is preserved until the
replacement settings are written, so live subscribers do not flash the onboarding screen mid-import.

Export before a replace. Reset requires typing `RESET` and permanently deletes every workspace
document, including settings. There is no server-side trash.

## Deployment

`firebase.json` is configured for Firebase Hosting with SPA rewrites, long-lived caching for hashed
assets, and no-cache for `index.html`. `.firebaserc` points at `lock-in-ap`; change it if you deploy
elsewhere.

```bash
npm run build
firebase deploy --only firestore:rules,hosting
```

If your Firebase CLI account is not a member of the project, either switch accounts or deploy from
the project owner's session. Firestore rules deployment is required; the app shows an access-denied
screen with copyable rules when permission is missing.

Firestore indexes are not required for the current client-side queries. `firestore.indexes.json` is
included for future composite queries.

## Project structure

```text
src/
  components/          Shared design-system primitives and status UI
  features/
    today/ calendar/ study/ assignments/ projects/
    progress/ review/ inbox/ settings/ onboarding/ shell/ focus/
  hooks/               Derived workspace data
  lib/
    backup/            Export, validation, import, reset
    dates/             Date keys, timezones, formatting, smart dates
    firebase/          Client, typed subscriptions, paths, repositories
    recurrence/        Bounded recurrence generation
    scheduler/         Capacity, priority, planner, rebalance
    streaks/           Streak, heatmap, and achievement derivation
    workspace/         Selectors, empty state, completion helpers
  providers/           Live workspace subscriptions and sync
  test/                Vitest setup
  types/               Authoritative domain model
```

Design tokens live in `src/index.css`: near-black `#080a09` / `#0e110f` surfaces with electric-lime
`#c6f74a` as the action accent. Subject colors are SAT lime, Comparative blue, World amber, and Macro
violet. Dark mode is the only mode by design.

## Testing

The unit suite covers the logic most likely to lie to the user:

- date keys, timezones, week boundaries, local times, smart-date parsing, deadline labels
- daily/weekly recurrence, intervals, custom week starts, horizon bounds
- streak continuity, rest days, reversals, qualifying minutes/completions, homework toggles
- planner capacity math, priority order, deadlines, no-capacity warnings, goal sessions
- backup envelope/version checks, record normalization, unsafe ids, invalid dates/times, summaries

Run `npm test` before deploying.
