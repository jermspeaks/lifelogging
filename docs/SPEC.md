# Lifelogging — Daily Dashboard: Spec (v0.1 — Habits)

## 1. Vision

A local-first desktop app that, eventually, answers "how is my life going?" The first step is
much smaller: **a single daily view of the things I'm doing.** The Daily View in
[`ideas.md`](../ideas.md) lists many widgets (calendar, journal, reminders, goals, …). v0.1 builds
the **dashboard shell** plus the first widget: **habit tracking with full CRUD**.

Everything else in `ideas.md` is out of scope for v0.1, but the architecture must make adding the
next widget (e.g. Today Calendar, Journal) a matter of adding a module, not restructuring the app.

## 2. Goals / Non-goals

**Goals (v0.1)**
- Native desktop app (macOS first; nothing that blocks Windows/Linux later).
- Create, read, update, archive, and delete habits.
- Check habits off for today (and un-check them) from a "Today" dashboard.
- See a little history: current streak and the last 7 days per habit.
- All data stored locally in SQLite; works fully offline. No accounts, no sync.

**Non-goals (v0.1)**
- Quantity habits ("8 glasses of water"), timers, reminders/notifications.
- Calendar, journal, or any other `ideas.md` widget.
- Sync, cloud backup, mobile, multi-user.
- Analytics/charts beyond streak + 7-day strip.
- Auto-updates, code signing, installers (running via `npm run tauri dev` / a local build is fine).

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Desktop shell | **Tauri v2** | Rust backend + web UI, tiny binaries. The "Rust desktop app" model. |
| Backend | Rust (stable, edition 2024) | Owns all data access and business rules. |
| Database | **SQLite via `rusqlite`** (`bundled` feature) | Single file, zero setup, easy to back up. |
| Migrations | **`rusqlite_migration`** | Embedded, ordered SQL migrations run on startup. (Pins `rusqlite` to 0.40 — bump both together.) |
| Rust → TS types | **`ts-rs`** | Generate TS types from Rust structs so the IPC contract can't drift. |
| Frontend | React 19 + Vite + TypeScript | Same stack as my other apps. |
| Styling/UI | Tailwind CSS v4 + shadcn/ui | Same as blippy/hub. |
| Data fetching | TanStack Query | Caching + invalidation around `invoke()` calls. |
| Package manager | npm | Matches other apps in `personal-apps/`. |
| Tests | `cargo test` (backend), Vitest + Testing Library (frontend) | |

**Key decision: the frontend never touches SQL.** We deliberately do *not* use `tauri-plugin-sql`.
The webview calls typed Tauri commands; Rust validates input, runs queries, and returns typed
results. This keeps business logic (streaks, schedules) in one testable place.

## 4. Architecture

```
┌──────────────────────── Webview (React) ────────────────────────┐
│  routes/            Today (dashboard), Habits (manage)          │
│  widgets/habits/    HabitChecklist widget, HabitForm, etc.      │
│  lib/api.ts         typed wrappers around invoke()             │
│  lib/bindings/      ts-rs generated types (DO NOT EDIT)         │
└──────────────────────────────┬──────────────────────────────────┘
                               │ Tauri IPC (invoke)
┌──────────────────────────────▼──────────────────────────────────┐
│  src-tauri/src/                                                 │
│   lib.rs            builder, setup (open DB, run migrations)    │
│   error.rs          AppError (serializable)                     │
│   db/mod.rs         connection + migrations                     │
│   habits/                                                       │
│     model.rs        Habit, NewHabit, HabitPatch, TodayHabit …   │
│     repo.rs         SQL (CRUD, checks)                          │
│     logic.rs        pure fns: is_scheduled, streak, last-7      │
│     commands.rs     #[tauri::command] thin wrappers             │
└──────────────────────────────┬──────────────────────────────────┘
                               ▼
                 <app_data_dir>/lifelogging.db
```

Each future dashboard module follows the same shape: `src-tauri/src/<module>/{model,repo,logic,commands}.rs`
+ `src/widgets/<module>/`. The Today page renders a list of widgets; adding a module = adding a widget.

**State:** a single `rusqlite::Connection` wrapped in `std::sync::Mutex`, registered with
`app.manage()` in `setup`. Commands are synchronous (`fn`, not `async fn`) — SQLite calls are fast
and this avoids holding a std mutex across `.await`.

**DB location:** `app.path().app_data_dir()/lifelogging.db` (identifier `com.jermspeaks.lifelogging`).
Override with env var `LIFELOGGING_DB_PATH` for dev/testing.

## 5. Domain model

### Habit
| Field | Type | Notes |
|---|---|---|
| `id` | integer | PK |
| `name` | text | required, 1–80 chars, trimmed |
| `description` | text? | optional, ≤ 500 chars |
| `color` | text | one of a fixed palette key (e.g. `slate`, `red`, `amber`, `green`, `blue`, `violet`, `pink`); default `slate` |
| `schedule_days` | integer | 7-bit weekday mask, bit 0 = Monday … bit 6 = Sunday. `127` = every day (default). Must be 1–127. |
| `sort_order` | integer | for manual ordering on the dashboard |
| `archived_at` | text? | RFC 3339 timestamp; archived habits are hidden from Today but keep history |
| `created_at`, `updated_at` | text | RFC 3339 UTC |

### HabitCheck
| Field | Type | Notes |
|---|---|---|
| `habit_id` | integer | FK → habits.id, `ON DELETE CASCADE` |
| `date` | text | **local calendar date** `YYYY-MM-DD` |
| `created_at` | text | RFC 3339 UTC |
| PK | (`habit_id`, `date`) | a habit is either done or not on a date |

**Dates rule:** the frontend decides what "today" is (user's local date) and passes `date` as
`YYYY-MM-DD` to every date-sensitive command. The backend validates the format but never calls
"now" to determine a calendar day. This makes history views and testing trivial.

### Migration 001
```sql
CREATE TABLE habits (
  id            INTEGER PRIMARY KEY,
  name          TEXT    NOT NULL,
  description   TEXT,
  color         TEXT    NOT NULL DEFAULT 'slate',
  schedule_days INTEGER NOT NULL DEFAULT 127 CHECK (schedule_days BETWEEN 1 AND 127),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  archived_at   TEXT,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL
);

CREATE TABLE habit_checks (
  habit_id   INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date       TEXT    NOT NULL,
  created_at TEXT    NOT NULL,
  PRIMARY KEY (habit_id, date)
);

CREATE INDEX idx_habit_checks_date ON habit_checks(date);
```
Connection setup must run `PRAGMA foreign_keys = ON;` and `PRAGMA journal_mode = WAL;`.

## 6. Business rules

1. **Scheduled:** a habit is scheduled on date `d` iff bit `(weekday(d) - Monday)` is set in `schedule_days`.
2. **Checking:** checking a habit on any date is allowed (even unscheduled days — counts as a bonus). Checking twice is idempotent; un-checking a non-existent check is a no-op.
3. **Future dates:** checking a date after the `today` passed by the client is rejected (`Validation` error).
4. **Current streak** (as of `today`): walk backwards from `today` over *scheduled* days only.
   - If `today` is scheduled and not yet checked, it does **not** break the streak (the day isn't over) — start from the previous scheduled day.
   - Count consecutive scheduled days that are checked; stop at the first scheduled, unchecked day.
   - Unscheduled days are skipped (neither extend nor break). Bonus checks on unscheduled days don't count.
   - Don't walk past the habit's `created_at` date.
5. **Last 7 days:** for `today-6 … today`, return one of `done | missed | skipped (unscheduled) | pending (today, scheduled, not done)`. Days before the habit's creation date are `skipped`.
6. **Archive vs delete:** archive is the default "remove" action (reversible, keeps history). Permanent delete removes the habit and all its checks, and requires confirmation in the UI.
7. **Ordering:** new habits get `sort_order = max + 1`. Reorder takes the full ordered list of active habit IDs.

## 7. IPC contract (Tauri commands)

All commands return `Result<T, AppError>`. `AppError` serializes as
`{ "kind": "NotFound" | "Validation" | "Database", "message": string }`.

| Command | Args | Returns |
|---|---|---|
| `list_habits` | `{ includeArchived: boolean }` | `Habit[]` ordered by `sort_order` |
| `get_habit` | `{ id }` | `Habit` |
| `create_habit` | `{ input: NewHabit }` | `Habit` |
| `update_habit` | `{ id, patch: HabitPatch }` | `Habit` (all `HabitPatch` fields optional) |
| `archive_habit` | `{ id }` | `Habit` |
| `unarchive_habit` | `{ id }` | `Habit` (appended to end of order) |
| `delete_habit` | `{ id }` | `null` |
| `reorder_habits` | `{ ids: number[] }` | `null` (must be exactly the set of active habits) |
| `set_habit_check` | `{ habitId, date, today, done: boolean }` | `TodayHabit` (refreshed row) |
| `get_today` | `{ today }` | `TodayHabit[]` (active habits, in order) |

```ts
// Generated by ts-rs from Rust; shown here for reference.
type Habit = { id: number; name: string; description: string | null; color: HabitColor;
  scheduleDays: number; sortOrder: number; archivedAt: string | null; createdAt: string; updatedAt: string };
type NewHabit = { name: string; description?: string | null; color?: HabitColor; scheduleDays?: number };
type HabitPatch = Partial<NewHabit>;
type DayStatus = "done" | "missed" | "skipped" | "pending";
type TodayHabit = { habit: Habit; scheduledToday: boolean; doneToday: boolean;
  currentStreak: number; last7: { date: string; status: DayStatus }[] };
```
Rust structs use `#[serde(rename_all = "camelCase")]` so the wire format matches the TS types.

## 8. UI

**App shell:** left sidebar (Today, Habits; future modules appear here), main content area.
Light/dark follows the OS.

**Today (dashboard) — `/`**
- Header: date ("Friday, October 30") + small summary ("3 of 5 habits done").
- Widget grid. v0.1 has one widget: **Habits checklist**.
  - Rows for habits scheduled today first, then a collapsed "Not scheduled today" group.
  - Each row: checkbox, name, color dot, streak (🔥 n), 7-day dot strip.
  - Clicking the checkbox toggles with an optimistic update; reverts + toast on error.
  - Empty state: "No habits yet" + button linking to Habits page.
- The "today" date is recomputed when the window regains focus (app left open overnight).

**Habits (manage) — `/habits`**
- List of active habits with drag-to-reorder (or up/down buttons — implementer's choice), edit, archive.
- "New habit" button → dialog form: name, description, color picker (palette swatches), weekday toggles (M T W T F S S, with "Every day" / "Weekdays" presets).
- Edit uses the same dialog, prefilled.
- "Archived" section (collapsed): unarchive, delete permanently (confirm dialog: "Delete *X* and all its history?").
- Form validation mirrors backend rules; backend `Validation` errors are shown inline.

**Keyboard:** `⌘N` new habit (on Habits page), `Esc` closes dialogs. Nice-to-have, not required.

## 9. Quality bar / Definition of done for v0.1
- `cargo test`, `cargo clippy -- -D warnings`, `cargo fmt --check` pass in `src-tauri/`.
- `npm run lint`, `npm run typecheck`, `npm test` pass.
- Generated TS bindings are committed and up to date (`npm run bindings` produces no diff).
- Manual QA checklist in `docs/PLAN.md` passes on macOS via `npm run tauri dev`.
- Data survives app restart; DB file lives in the app data dir.

## 10. Future (informs design, not built now)
- Next widgets, in likely order: Today Calendar (.ics import), Journal, Recap of Yesterday, 3-day lookahead, Annual theme, Quote.
- "How is my life going" scoring: rollups across modules — keep per-day data keyed by local `date` everywhere so modules can be joined by day.
- Quantity habits: add `target_count` to habits and `count` to checks (additive migration).
- Export/backup: copy the SQLite file; later JSON export.
- Agent layer (MCP server over the same Rust repo layer) — another reason logic lives in Rust, not the webview.

## 11. v0.2: Today Calendar and event lookahead

### Scope and decisions
- The Today dashboard adds a Calendar widget showing events whose local start date is today or one of the following three dates (four dates inclusive).
- Import one or more local `.ics` files from the widget. The webview reads the user-selected file and sends its name and UTF-8 contents to a synchronous Tauri command; it never accesses SQLite. Imported events remain local and work offline.
- A calendar source is one imported file. Importing a new file creates a source; choosing Replace on an existing source atomically replaces its events while preserving its source ID. Remove deletes the source and its events. The same filename may be used by multiple sources.
- Import is all-or-nothing. Accept at most 5 MiB of UTF-8 input and 5,000 VEVENTs. Reject malformed calendars or events that lack a UID, SUMMARY, or DTSTART; skip `STATUS:CANCELLED`. Duplicate UIDs within one source are invalid. A failed replacement must retain the previous data.
- Support one-time events and RFC 5545 recurrence using `RRULE`, `RDATE`, and `EXDATE`, including annual all-day birthdays. Recurrence overrides (`RECURRENCE-ID`) are not supported. Accept floating local times, UTC, and IANA `TZID` values; reject unknown time zones and custom `VTIMEZONE` definitions. Timed events are converted to the machine's local time for display. All-day events retain their local calendar date. Multi-day events appear only on their start date. `DTEND` follows the iCalendar exclusive-end convention for all-day events.
- Event summaries and descriptions use RFC 5545 text unescaping. Reminders/alarms, todos, invitations, remote subscriptions/sync, editing individual imported events, and multi-user sharing are out of scope.

### Data model and IPC contract

Migration 002 adds:

```sql
CREATE TABLE calendar_sources (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  timezone    TEXT
);
CREATE TABLE events (
  id           INTEGER PRIMARY KEY,
  source_id    INTEGER NOT NULL REFERENCES calendar_sources(id) ON DELETE CASCADE,
  uid          TEXT NOT NULL,
  summary      TEXT NOT NULL,
  description  TEXT,
  location     TEXT,
  start_date   TEXT NOT NULL,
  all_day      INTEGER NOT NULL,
  event_ical   TEXT NOT NULL,
  UNIQUE (source_id, uid)
);
CREATE INDEX idx_events_source ON events(source_id);
```

Each event row stores its parsed display fields and a canonical serialized VEVENT used by the RFC 5545 recurrence engine. `start_date` is the event's local start date (used only to skip definitions that begin after the requested window). Event rows are series definitions, not pre-expanded occurrences.

All commands return `Result<T, AppError>`:

| Command | Args | Returns |
|---|---|---|
| `list_calendar_sources` | `{}` | `CalendarSource[]` ordered by name then ID |
| `import_calendar` | `{ name, content, sourceId?: number }` | `CalendarSource` including the number of imported events; omit `sourceId` to create a source, provide it to atomically replace that source |
| `delete_calendar` | `{ sourceId }` | `null` |
| `get_upcoming_events` | `{ today }` | `EventOccurrence[]` for local dates `today…today+3`, sorted by date, all-day first, then local start time and summary |

```ts
type CalendarSource = { id: number; name: string; importedAt: string; eventCount: number };
type EventOccurrence = {
  id: number; sourceId: number; sourceName: string; uid: string;
  summary: string; description: string | null; location: string | null;
  date: string; allDay: boolean; startTime: string | null; endTime: string | null;
};
```

The client supplies `today` as local `YYYY-MM-DD`; Rust validates it and never chooses the calendar day from its own clock. The event query expands recurrence only across the requested four-day window. Invalid dates, future-range overflow, invalid ICS data, unsupported recurrence/time-zone values, and missing sources return typed errors.

### UI
- Add a Calendar widget to the Today grid, with a grouped four-day agenda, all-day/timed presentation, source name, and clear empty/loading/error states.
- An Import button opens a file input restricted to `.ics`. Show a clear inline error for unreadable or rejected files and success feedback after the backend confirms import.
- List imported sources in the widget. Each source has Replace and Remove actions; Remove requires confirmation. On replace, read a newly selected `.ics` file and retain the source ID.
- Refresh upcoming-event and source queries after import, replacement, or removal. The mock API mirrors the UI workflow with small in-memory sample events; the Rust implementation remains the source of truth.
