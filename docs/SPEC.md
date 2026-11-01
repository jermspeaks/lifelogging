# Lifelogging — Daily Dashboard: Spec (v0.1 Habits, v0.2 Calendar, v0.3–v0.5 planned)

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
- Next widgets, in likely order: Journal, Recap of Yesterday, Annual theme, Quote.
- "How is my life going" scoring: rollups across modules — keep per-day data keyed by local `date` everywhere so modules can be joined by day.
- Quantity habits: add `target_count` to habits and `count` to checks (additive migration).
- Export/backup: copy the SQLite file; later JSON export.
- Agent layer (MCP server over the same Rust repo layer) — another reason logic lives in Rust, not the webview.

## 11. v0.2: Calendar and event lookahead (T6)

### Goals and decisions
- Import local `.ics` files, including birthdays and ordinary events, without a network connection.
- Show events for the local `today` and the next three local dates (four dates inclusive) on the Today dashboard.
- `/calendar` manages imported calendars. Events are read-only in the app; change them in the source calendar and re-import.
- Each calendar is identified by its trimmed source name, compared case-insensitively (the selected file name by default). Importing again with the same name replaces that calendar's events; calendars with different names are independent, even if they contain matching UIDs.
- Import is one atomic operation: a malformed or unsupported file leaves the existing calendar untouched. Duplicate non-cancelled UIDs within one file are rejected. A successful re-import replaces, rather than merges, events.
- Deleting a calendar removes that calendar and its events. There is no event-level delete, edit, or sync.
- The frontend passes `today` as local `YYYY-MM-DD`; the backend returns occurrences whose local start date is within `today…today+3`. Multi-day events appear on their start date only. All-day `DTEND` follows RFC 5545's exclusive end-date convention.

### ICS subset
- Accept UTF-8 iCalendar files with `VCALENDAR` and `VEVENT` components; unfold RFC 5545 continuation lines and decode standard escaped text in `SUMMARY`.
- `UID` and `DTSTART` are required; a missing `SUMMARY` becomes `Untitled event`. `DTEND` is optional (a date-only event defaults to one day; a timed event defaults to zero duration).
- Support date-only events, floating local date-times, UTC date-times, and IANA `TZID` date-times. UTC and IANA values are converted to the app machine's local time zone for display. Floating values are interpreted in the app machine's local time zone. Ambiguous local times choose the earlier occurrence; nonexistent local times fail import.
- Support non-recurring events and simple yearly `RRULE:FREQ=YEARLY` events (including common all-day birthdays). Other recurrence rules, `RDATE`/`EXDATE`, recurrence overrides, and unknown/custom `TZID` definitions are rejected rather than silently approximated. Non-leap years do not synthesize a February 29 occurrence.
- Cancelled events (`STATUS:CANCELLED`) are ignored. Unsupported components/properties that change occurrence identity or timing fail the import; unrelated calendar metadata is ignored.
- Limit each import to 10 MiB of UTF-8 text and 10,000 VEVENTs. The import screen reports the imported event count and actionable parse/validation errors.

### Data model and migration 002
- `calendars`: integer `id`, unique trimmed `name`, `imported_at` RFC 3339 UTC.
- `events`: integer `id`, `calendar_id` FK with `ON DELETE CASCADE`, source `uid`, `summary`, start date, optional start/end time, `all_day`, optional supported recurrence marker, and recurrence time zone. `(calendar_id, uid)` is unique.
- Imported source text is not retained. `DTEND` is validated and timed end values are retained for display; all-day exclusive end dates are not stored because this widget places multi-day events on their start date only. Yearly events retain their source date/time zone so each instance can be converted to local time for display.

### IPC contract

All commands return `Result<T, AppError>`.

| Command | Args | Returns |
|---|---|---|
| `list_calendars` | `{}` | `Calendar[]`, ordered by name |
| `import_calendar` | `{ name, content }` | `ImportCalendarResult` (`calendar`, `importedEventCount`) |
| `delete_calendar` | `{ id }` | `null` |
| `get_upcoming_events` | `{ today }` | `CalendarEvent[]`, sorted by local start date, all-day first, then time and summary |

`Calendar` contains `id`, `name`, `importedAt`, and `eventCount`. `CalendarEvent` contains `id`, `calendarId`, `calendarName`, `uid`, `summary`, local `startDate`, optional local `startTime`/`endTime`, and `allDay`. `ImportCalendarResult` contains `calendar` and `importedEventCount`.

### UI
- Today adds an Events widget with separate date headings for today and the next three days. Events show their summary, source calendar, and either an all-day label or local start/end time. Empty/loading/error states are explicit; an action links to Calendar when no calendars exist.
- `/calendar` accepts `.ics` via a native file input, uses the filename as the default calendar name, and displays imported calendars, event counts, last-import time, and a confirmed delete action. Import feedback includes the number of events imported.
- The app does not launch a separate file dialog plugin. File bytes are read from the browser's selected `File` and sent over typed IPC.

### Verification
- Rust tests cover migration, transactional replacement/rollback, parsing, date/time conversion, yearly recurrence and event ordering; IPC tests exercise all four commands.
- Frontend tests cover calendar management/import and the four-day Today widget; mock API behavior mirrors the Rust contract.
- Real-window mouse QA is required for selecting/importing an `.ics`, re-import replacement, deleting a calendar, and inspecting the Today lookahead. Automated tests do not replace this manual check.

---

# Planned modules (v0.3–v0.5)

Sections 12–21 specify the remaining Daily View ideas from [`ideas.md`](../ideas.md) (tasks T7–T15).
They're planned in [`PLAN.md`](./PLAN.md) as three milestones. Section 12 applies to all of them.
Each module section gives its goals and decisions, data model, rules, IPC contract, UI, and
verification.

## 12. Shared conventions for new modules

### Product decisions to confirm

These choices were made when the specs were written. Change them here before a milestone's
scaffold task starts. After that, the contract is frozen.

| Module | Decision |
|---|---|
| Journal (§13) | Plain text, one entry per local date, autosaved. No Markdown rendering, mood, or tags. |
| Annual theme (§14) | One theme per calendar year, shown as a banner above the Today grid. |
| Quotes (§15) | Local collection only, added by hand or pasted in bulk. No network source and no bundled quotes. One quote per day, picked deterministically. |
| Export (§16) | User-chosen path through a native save dialog (`tauri-plugin-dialog`). SQLite snapshot and a full JSON dump. Restore is manual. |
| Reminders (§17) | Dated to-dos with an optional time. In-app only: no OS notifications and no recurrence. |
| Notes review (§18) | Saved items resurface on a fixed spaced schedule (1, 3, 7, 14, 30, 60, 120 days). |
| Goals (§19) | Milestone goals (done or not) or numeric goals (progress logged per date toward a target). |
| Recap (§20) | Read-only summary of yesterday: habits, events, journal, reminders, goal progress, notes reviewed. |
| Puzzle (§21) | A daily Sudoku generated offline from the date. No network content. |

### Conventions
- **Layout:** each module follows SPEC §4: `src-tauri/src/<module>/{mod,model,repo,logic,commands}.rs`
  and `src/widgets/<module>/`. A module with a management page gets a route and a sidebar entry.
- **Dates:** every date-sensitive command takes the local `today` (and `date` where relevant) as
  `YYYY-MM-DD`. A `date` after `today` is rejected with `Validation` unless the section says
  otherwise. Optional times are local wall-clock `HH:MM` (24-hour), with no time zone.
- **Shared date helpers:** the v0.3 scaffold adds `src-tauri/src/dates.rs` with `parse_date`
  (strict `YYYY-MM-DD`, same rules as `habits::logic::parse_date`), `parse_time` (strict `HH:MM`,
  `00:00`–`23:59`), and `now_rfc3339()` (RFC 3339 UTC with milliseconds). New modules use these.
  Existing modules may keep their own copies.
- **Text fields** are trimmed before validation and storage. An optional text field that is blank
  after trimming is stored as `NULL`. In a patch, `""` clears an optional field and an omitted field
  stays unchanged, as in `HabitPatch`.
- **Timestamps** (`created_at`, `updated_at`, `archived_at`) are RFC 3339 UTC. Anything that means
  "on which day" is stored as a local `date` column supplied by the frontend, so modules can be
  joined by day.
- **Deletes** that remove history need a confirmation dialog in the UI.
- **Migrations** are appended in milestone order. Each milestone's scaffold task assigns the
  numbers (see `PLAN.md`).
- **Mock API:** new modules put their mock in `src/lib/mock/<module>.ts`. Each file exports a
  factory that returns that module's slice of `Api`, and `createMockApi()` spreads it in. This lets
  parallel agents edit their own mock without touching a shared file. Seed each mock with a little
  sample data.
- **Query keys:** each module gets its own root key (`["journal", …]`, `["reminders", …]`, …).
  Mutations invalidate their module root, `["recap"]` when the module feeds the recap (§20), and
  nothing else unless stated.

### Today dashboard layout (final, after v0.5)

```
Header: date + habit summary
Annual theme banner (full width, §14)
┌──────────────────────────┬──────────────────────────┐
│ Yesterday (recap, §20)   │ Reminders (§17)          │
│ Habits                   │ Events                   │
│ Journal (spans both columns, §13)                   │
│ Goals (§19)              │ Review (notes, §18)      │
│ Quote (§15)              │ Puzzle (§21)             │
└──────────────────────────┴──────────────────────────┘
```

Sidebar order: Today, Habits, Calendar, Journal, Reminders, Goals, Notes, Quotes, Themes, and then
Settings pinned to the bottom. Each widget receives `today` as a prop from the Today page. Widgets
whose module hasn't shipped yet are simply absent.

---

## 13. Journal (T7, v0.3)

### Goals and decisions
- Write one free-form plain-text entry per local date. Today's entry is editable directly on the
  dashboard. Past entries are browsable, searchable, and editable on `/journal`.
- Autosave. There is no Save button.
- Out of scope: Markdown rendering, attachments, mood and tags, and multiple entries per day.

### Data model (migration 003)
```sql
CREATE TABLE journal_entries (
  date       TEXT PRIMARY KEY,          -- local YYYY-MM-DD
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### Rules
1. `body` is stored as typed (not trimmed). It must be at most 100,000 characters.
2. Saving a body that is empty or only whitespace **deletes** the entry for that date. An entry
   exists only if it has content.
3. `date > today` is rejected. Any past date can be created or edited.
4. `preview` is the body with whitespace runs collapsed to single spaces, trimmed, and cut to 160
   characters (add `…` when cut). `wordCount` counts whitespace-separated tokens.
5. Search is a case-insensitive substring match on `body`. `%`, `_`, and `\` in the query are
   matched literally.

### IPC contract
| Command | Args | Returns |
|---|---|---|
| `get_journal_entry` | `{ date, today }` | `JournalEntry \| null` |
| `save_journal_entry` | `{ date, today, body }` | `JournalEntry \| null` (`null` when rule 2 deleted it) |
| `delete_journal_entry` | `{ date }` | `null` (no-op when the entry is missing) |
| `list_journal_entries` | `{ query?, before?, limit? }` | `JournalSummary[]`, newest date first |

`before` is an exclusive date used for paging. `limit` defaults to 50 and must be 1–200. A blank
`query` means no filter.

```ts
type JournalEntry = { date: string; body: string; wordCount: number; createdAt: string; updatedAt: string };
type JournalSummary = { date: string; preview: string; wordCount: number; updatedAt: string };
```

### UI
- **Today widget "Journal"** (spans both columns): a textarea of at least 6 rows for today's entry
  with the placeholder "How was today?".
  - Autosave runs 1 second after typing stops and on blur. A status line shows `Saving…`,
    `Saved 9:41 PM`, or an error with a Retry button.
  - When `today` rolls over while the widget has unsaved text, it flushes the pending save for the
    **old** date before loading the new one.
  - The header action "All entries" links to `/journal`.
- **`/journal`:**
  - The left column has a search box and the entry list (date, preview, word count) with
    "Load more" paging.
  - The right column has an editor for the selected date, defaulting to today. It uses the same
    autosave behavior.
  - A date input (`max = today`) jumps to any date. A missing entry shows an empty editor.
  - The editor has a "Delete entry" button with confirmation.
  - The route accepts `/journal?date=YYYY-MM-DD` so other widgets (Recap) can link to an entry.

### Verification
- Rust: repo tests cover the round trip, whitespace deletes, the future-date rejection, the length
  limit, search escaping, paging with `before` and `limit`, and preview truncation. Rule 4 has
  table-driven logic tests.
- Frontend: widget tests cover the debounced save call, the flush on date rollover, and the status
  states. Route tests cover the search filter and the date jump.

---

## 14. Annual theme (T9, v0.3)

### Goals and decisions
- Set one theme per calendar year (for example, "Year of Practice") with an optional longer
  description. Today shows the current year's theme as a banner.
- Themes can be written for any year, so next year's theme can be planned in December. Past years
  stay as a record.

### Data model (migration 004)
```sql
CREATE TABLE annual_themes (
  year        INTEGER PRIMARY KEY CHECK (year BETWEEN 1900 AND 9999),
  title       TEXT NOT NULL,
  description TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
```

### Rules
1. `title` is 1–80 characters after trimming. `description` is at most 2,000 characters.
2. `set_theme` is an upsert. It keeps `created_at` on update.
3. The year shown on Today is the year of the frontend's `today`.

### IPC contract
| Command | Args | Returns |
|---|---|---|
| `list_themes` | `{}` | `AnnualTheme[]`, newest year first |
| `get_theme` | `{ year }` | `AnnualTheme \| null` |
| `set_theme` | `{ year, input: ThemeInput }` | `AnnualTheme` |
| `delete_theme` | `{ year }` | `null` (`NotFound` when missing) |

```ts
type AnnualTheme = { year: number; title: string; description: string | null; createdAt: string; updatedAt: string };
type ThemeInput = { title: string; description?: string | null };
```

### UI
- **Today banner** (not a `WidgetCard`): it sits between the header and the grid.
  - It shows "2026 · Year of Practice", then the first line of the description (muted), then a
    thin progress bar labelled "Day 305 of 365". The frontend computes the day of year and handles
    leap years.
  - An edit icon opens the theme dialog.
  - With no theme, the banner shrinks to a small "Set a theme for 2026" button.
- **Theme dialog:** title and description fields, client-side validation that mirrors rule 1, and
  backend `Validation` errors shown inline.
- **`/themes`:** a list of years with title and description. Each row has Edit and Delete (with
  confirmation). "Add theme" opens the dialog with a year field that defaults to next year when no
  theme exists for it, and otherwise to the current year.

### Verification
- Rust: tests cover upsert keeping `created_at`, validation, ordering, and `NotFound` on delete.
- Frontend: banner tests cover the theme state, the empty state, and the day-of-year label in a
  leap and a non-leap year. Dialog tests cover create and edit.

---

## 15. Quotes (T10, v0.3)

### Goals and decisions
- Show one quote per day from the user's own local collection. There's no network fetch and no
  bundled quote set: the collection is curated by the user, and this avoids licensing questions.
- The quote of the day stays the same all day while the collection is unchanged, and changes the
  next day.
- Quotes can be added one at a time or pasted in bulk.

### Data model (migration 005)
```sql
CREATE TABLE quotes (
  id         INTEGER PRIMARY KEY,
  text       TEXT NOT NULL,
  author     TEXT,
  source     TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### Rules
1. `text` is 1–1,000 characters after trimming. `author` and `source` are each at most 200.
2. **Daily selection:** order quotes by `id`. With `n` quotes, the index is
   `days_since(1970-01-01, today) mod n`. With `n = 0`, the result is `null`. Put this in
   `logic.rs` as a pure function.
3. **Bulk import** takes pasted text. Each non-blank line is one quote.
   - A line may end with an attribution: the last ` — ` (em dash), ` -- `, or ` ~ ` splits it into
     `text` and `author`.
   - Wrapping straight or curly quotes around `text` are stripped.
   - At most 1,000 lines. If any line fails validation, nothing is imported and the error names
     the line number.
   - A quote whose text and author match an existing quote (case-insensitive, trimmed) is skipped
     and counted.

### IPC contract
| Command | Args | Returns |
|---|---|---|
| `list_quotes` | `{}` | `Quote[]`, newest first |
| `create_quote` | `{ input: NewQuote }` | `Quote` |
| `update_quote` | `{ id, patch: QuotePatch }` | `Quote` |
| `delete_quote` | `{ id }` | `null` |
| `import_quotes` | `{ text }` | `ImportQuotesResult` |
| `get_daily_quote` | `{ today }` | `Quote \| null` |

```ts
type Quote = { id: number; text: string; author: string | null; source: string | null; createdAt: string; updatedAt: string };
type NewQuote = { text: string; author?: string | null; source?: string | null };
type QuotePatch = Partial<NewQuote>;
type ImportQuotesResult = { imported: number; skipped: number };
```

### UI
- **Today widget "Quote":** the quote in a large serif or italic style with "— Author, *Source*"
  below. Empty state: "Add quotes you love" with a button that links to `/quotes`.
- **`/quotes`:**
  - An "Add quote" dialog (text, author, source).
  - A "Paste many" dialog: a textarea with a format hint and a result toast such as
    "Imported 12, skipped 2 duplicates".
  - The list shows edit and delete (with confirmation) per quote, plus a client-side filter box.

### Verification
- Rust: logic tests cover the selection index (including `n = 1`, a large day count, and a date
  before 1970 if `parse_date` allows one) and table-driven parsing of import lines. Repo tests cover
  CRUD, all-or-nothing import, and duplicate skipping.
- Frontend: the widget's empty and quote states, plus a test that the import dialog shows the
  result counts.

---

## 16. Data export and backup (T15, v0.3)

### Goals and decisions
- From a Settings page, save either a consistent **SQLite snapshot** or a **JSON export** of all
  data to a path the user picks.
- The native save dialog comes from `tauri-plugin-dialog`, called from the frontend. Rust receives
  the chosen path and writes the file. The dialog runs in the webview, not in a command, because
  synchronous commands must not block on UI.
- The JSON export dumps every user table generically, so modules added later are included without
  changes here.
- Out of scope: in-app restore or import, scheduled or automatic backups, and cloud destinations.
  The README documents manual restore (quit the app and replace `lifelogging.db`).

### Rules
1. The database path is managed state: `db::DbPath(PathBuf)`, registered in `setup` next to `Db`.
2. Every export target path must be absolute, its parent directory must exist, and it must not
   resolve to the live database file or its `-wal` or `-shm` siblings. Any of these failing is a
   `Validation` error.
3. **SQLite snapshot:** run `VACUUM INTO '<target>.partial'`, then rename it over `<target>`. This
   is atomic and safe while the app keeps running. Remove a leftover `.partial` before starting.
   The `.db` extension is suggested but not required.
4. **JSON export** has this shape:
   ```json
   { "format": "lifelogging-export", "formatVersion": 1, "exportedAt": "<RFC 3339>",
     "schemaVersion": <PRAGMA user_version>,
     "tables": { "<table>": [ { "<column>": <value>, … }, … ], … } }
   ```
   - Tables are every row of `sqlite_master` with `type = 'table'` and a name not starting with
     `sqlite_`, sorted by name. Rows are ordered by `rowid` (or by primary key for `WITHOUT ROWID`
     tables).
   - INTEGER and REAL values become numbers, TEXT becomes a string, NULL becomes `null`, and a BLOB
     becomes a lowercase hex string.
   - The output is pretty-printed with 2-space indentation and written atomically, the same way as
     rule 3.
   - Everything is read inside one read transaction, so the export is consistent.
5. Each export returns the path written and the file size in bytes.

### IPC contract
| Command | Args | Returns |
|---|---|---|
| `get_data_info` | `{}` | `DataInfo` |
| `export_database` | `{ path }` | `ExportResult` |
| `export_json` | `{ path }` | `ExportResult` |

```ts
type DataInfo = { dbPath: string; sizeBytes: number; schemaVersion: number };
type ExportResult = { path: string; bytes: number };
```

The frontend adds `src/lib/dialog.ts` with
`chooseSavePath(defaultName: string, filter: { name: string; extensions: string[] }): Promise<string | null>`.
In Tauri it wraps `save()` from `@tauri-apps/plugin-dialog`. In mock mode it returns
`/tmp/<defaultName>`. The capability file grants only `dialog:allow-save`.

### UI
- **`/settings`** (sidebar entry with a gear icon, pinned to the bottom), with a "Data" section:
  - The database location (selectable, monospace), its size (human readable), and the schema
    version.
  - "Back up database…" opens the save dialog with the default name
    `lifelogging-YYYY-MM-DD.db`. "Export JSON…" uses `lifelogging-YYYY-MM-DD.json`.
  - While an export runs, its button is disabled with a spinner. Success shows a toast
    "Saved to <path>". Cancelling the dialog does nothing. Errors show a toast.
  - A short note explains how to restore manually.

### Verification
- Rust (temporary directory on disk, not `:memory:`):
  - The snapshot opens with `db::open` and contains the same rows.
  - JSON parses and includes every table, including one created in the test, with the correct
    value types.
  - The live-DB path, a relative path, and a missing parent directory are rejected.
  - A leftover `.partial` file is handled.
- IPC tests run both exports to a temporary path.
- Frontend: Settings renders `DataInfo`, a cancelled dialog makes no API call, and success shows
  the toast.
- Manual: the real save dialog writes a backup that opens with `sqlite3`.

---

## 17. Today's reminders (T12, v0.4)

### Goals and decisions
- Reminders are lightweight dated to-dos: "Call the dentist" on a date, optionally at a time.
- The dashboard shows what's due today, what's overdue, and what was completed today.
- Out of scope: OS notifications, recurrence, and priorities. Notifications would need
  `tauri-plugin-notification` and a background scheduler; they're a possible later addition.

### Data model (migration 006)
```sql
CREATE TABLE reminders (
  id           INTEGER PRIMARY KEY,
  title        TEXT NOT NULL,
  notes        TEXT,
  due_date     TEXT NOT NULL,           -- local YYYY-MM-DD
  due_time     TEXT,                    -- local HH:MM, optional
  completed_on TEXT,                    -- local date it was completed
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX idx_reminders_due_date ON reminders(due_date);
CREATE INDEX idx_reminders_completed_on ON reminders(completed_on);
```

### Rules
1. `title` is 1–200 characters. `notes` is at most 1,000. `due_date` and `due_time` are validated
   with `dates::parse_date` and `dates::parse_time`. Any due date is allowed, past or future.
2. **Sort order:** `due_date`, then reminders without a time before timed ones, then `due_time`,
   then `id`.
3. **Due set** for `today`: incomplete reminders with `due_date <= today`, plus reminders with
   `completed_on = today`.
4. Completing a reminder sets `completed_on = today`, the frontend's date. Un-completing clears it.
   Both are idempotent.
5. "Snooze" is a frontend action: it patches `due_date` to tomorrow and clears `due_time`.

### IPC contract
| Command | Args | Returns |
|---|---|---|
| `list_reminders` | `{ today, includeCompleted }` | `Reminder[]`: all incomplete reminders (rule 2), plus those completed in the last 30 days when `includeCompleted` |
| `get_due_reminders` | `{ today }` | `Reminder[]`: the due set (rule 3), in rule 2 order |
| `create_reminder` | `{ input: NewReminder }` | `Reminder` |
| `update_reminder` | `{ id, patch: ReminderPatch }` | `Reminder` (`dueTime: ""` clears the time) |
| `set_reminder_done` | `{ id, today, done }` | `Reminder` |
| `delete_reminder` | `{ id }` | `null` |

```ts
type Reminder = { id: number; title: string; notes: string | null; dueDate: string; dueTime: string | null;
  completedOn: string | null; createdAt: string; updatedAt: string };
type NewReminder = { title: string; notes?: string | null; dueDate: string; dueTime?: string | null };
type ReminderPatch = Partial<NewReminder>;
```

### UI
- **Today widget "Reminders":**
  - Groups: "Overdue" (red date label, for example "Oct 29"), "Today" (time shown in the locale
    format when set), and "Done today" (struck through, collapsed when there are more than 3).
  - Each row has a checkbox that toggles optimistically, the title, and a hover menu with Snooze to
    tomorrow, Edit, and Delete.
  - A quick-add input at the bottom ("Add a reminder for today…", Enter submits) creates a
    reminder due today with no time.
  - Empty state: "Nothing due today".
- **`/reminders`:**
  - Upcoming reminders grouped by date ("Overdue", "Today", "Tomorrow", then weekday and date
    headings).
  - A "New reminder" dialog: title, notes, a date that defaults to today, and an optional time.
    Edit uses the same dialog.
  - A "Show completed" toggle includes the last 30 days of completed reminders. Delete asks for
    confirmation.

### Verification
- Rust: logic tests cover sort order and the due-set predicate. Repo tests cover CRUD, clearing the
  time with `""`, done/undone idempotence, and the 30-day window for completed reminders.
- Frontend: widget tests cover the grouping, the optimistic toggle with rollback, quick-add, and
  snooze sending tomorrow's date.

---

## 18. Notes review (T11, v0.4)

### Goals and decisions
- Save things for later (an idea, a link, a passage) and have them resurface on the dashboard on a
  spaced schedule, so they get reread instead of forgotten.
- The schedule is a fixed ladder with no grading: each "Keep" pushes the next review further out.
  "Done" archives the note so it stops resurfacing.
- Links open in the system browser through `tauri-plugin-opener`.

### Data model (migration 007)
```sql
CREATE TABLE notes (
  id               INTEGER PRIMARY KEY,
  title            TEXT NOT NULL,
  body             TEXT,
  url              TEXT,
  review_stage     INTEGER NOT NULL DEFAULT 0 CHECK (review_stage >= 0),
  next_review_date TEXT,                 -- local date; NULL while archived
  last_reviewed_on TEXT,                 -- local date
  archived_at      TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX idx_notes_next_review ON notes(next_review_date);
```

### Rules
1. `title` is 1–200 characters. `body` is at most 5,000. `url`, when present, must parse as an
   absolute `http` or `https` URL and be at most 2,000 characters. If `title` is blank and `url` is
   set, the frontend fills the title with the URL before sending.
2. `INTERVALS = [1, 3, 7, 14, 30, 60, 120]` days. `interval(stage)` is
   `INTERVALS[min(stage, 6)]`.
3. **Create:** `review_stage = 0` and `next_review_date = today + 1`.
4. **Keep** (reviewed, keep resurfacing): `review_stage += 1`,
   `next_review_date = today + interval(new stage)`, and `last_reviewed_on = today`.
5. **Snooze:** `next_review_date = today + 1`. The stage doesn't change and the note doesn't count
   as reviewed.
6. **Done (archive):** set `archived_at` and `next_review_date = NULL`. **Unarchive:** stage 0 and
   `next_review_date = today + 1`.
7. A note is **due** when it isn't archived and `next_review_date <= today`. The queue is sorted by
   `next_review_date`, then `id`.
8. Editing a note doesn't change its schedule.

### IPC contract
| Command | Args | Returns |
|---|---|---|
| `list_notes` | `{ query?, includeArchived }` | `Note[]`, newest first. The query is a case-insensitive substring match on title, body, and URL. |
| `create_note` | `{ input: NewNote, today }` | `Note` |
| `update_note` | `{ id, patch: NotePatch }` | `Note` |
| `review_note` | `{ id, today, action: "keep" \| "snooze" }` | `Note` (`Validation` if archived) |
| `set_note_archived` | `{ id, archived, today }` | `Note` |
| `delete_note` | `{ id }` | `null` |
| `get_review_queue` | `{ today, limit }` | `ReviewQueue` (`limit` is 1–50) |

```ts
type Note = { id: number; title: string; body: string | null; url: string | null; reviewStage: number;
  nextReviewDate: string | null; lastReviewedOn: string | null; archivedAt: string | null;
  createdAt: string; updatedAt: string };
type NewNote = { title: string; body?: string | null; url?: string | null };
type NotePatch = Partial<NewNote>;
type ReviewAction = "keep" | "snooze";
type ReviewQueue = { due: Note[]; dueCount: number };
```

### UI
- **Today widget "Review":**
  - Shows the first due note: the title (a link that opens externally when `url` is set), the body
    (clamped to 6 lines), and "Saved Oct 3 · reviewed 2×".
  - Buttons: **Keep** (rule 4), **Snooze** (rule 5), and **Done** (rule 6, with an Undo toast that
    unarchives).
  - A counter shows "3 more due". After an action, the next note appears.
  - Empty state: "Nothing to review today", with a link to `/notes`.
  - It requests `get_review_queue` with `limit: 5`.
- **`/notes`:**
  - Quick add at the top (one input that accepts a title or a pasted URL, plus an optional body
    that expands).
  - A search box, and a list with the next review date ("Due today", "in 6 days"), edit, archive,
    and delete with confirmation.
  - A collapsed "Archived" section with Unarchive.
- `src/lib/open.ts` exports `openExternal(url)`. It calls `openUrl` from
  `@tauri-apps/plugin-opener` in Tauri and `window.open` in mock mode. The capability grants
  `opener:allow-open-url`.

### Verification
- Rust: table-driven logic tests for rules 2–7, including the stage cap. Repo tests cover CRUD, URL
  validation, search, queue ordering and limit, and that `review_note` rejects archived notes.
- Frontend: widget tests check that Keep, Snooze, and Done call the right commands and advance to
  the next note, plus the empty state.

---

## 19. Goals (T14, v0.4)

### Goals and decisions
- Track a small number of active goals. There are two kinds, chosen by whether a target is set:
  - **Milestone goals:** "Run a half marathon". There's no target; the goal is either done or not.
  - **Numeric goals:** "Read 24 books" with `targetValue = 24` and `unit = "books"`. Progress is
    logged per local date and adds up toward the target.
- Goals can have an optional due date. Reaching the target doesn't complete a goal automatically;
  the UI suggests completing it.
- Out of scope: sub-goals and milestone checklists, links to habits, and charts.

### Data model (migration 008)
```sql
CREATE TABLE goals (
  id           INTEGER PRIMARY KEY,
  title        TEXT NOT NULL,
  description  TEXT,
  target_value REAL CHECK (target_value IS NULL OR target_value > 0),
  unit         TEXT,
  due_date     TEXT,                    -- local date, optional
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  closed_on    TEXT,                    -- local date it was completed or abandoned
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE goal_progress (
  goal_id    INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  date       TEXT    NOT NULL,          -- local date
  amount     REAL    NOT NULL CHECK (amount > 0),
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL,
  PRIMARY KEY (goal_id, date)
);
CREATE INDEX idx_goal_progress_date ON goal_progress(date);
```

### Rules
1. `title` is 1–120 characters. `description` is at most 1,000. `unit` is at most 20 and only
   allowed when `targetValue` is set. `targetValue` must be finite and greater than 0.
2. **Logging progress** sets the amount for `(goal, date)`. It replaces the day's amount rather
   than adding to it, so a typo can be fixed. An amount of `0` deletes that day's entry. Amounts
   must be finite and at least 0. `date > today` is rejected. Logging on a milestone goal (no
   target) or a closed goal is a `Validation` error.
3. `current` is the sum of all progress amounts. `percent` is
   `min(100, round(current / targetValue * 100))`, or `null` for milestone goals.
4. `daysLeft` is `dueDate - today` in days, or `null` without a due date. A negative value means
   overdue.
5. **Status:** `set_goal_status(active)` clears `closed_on`. `completed` or `abandoned` sets
   `closed_on = today`. Reopening a goal appends it to the end of the active order.
6. **Ordering:** new goals get `sort_order = max + 1`. Reorder takes exactly the set of active goal
   IDs, as in habits.

### IPC contract
| Command | Args | Returns |
|---|---|---|
| `list_goals` | `{ today, includeClosed }` | `GoalSummary[]`: active goals by `sort_order`, then closed goals by `closed_on` descending |
| `create_goal` | `{ input: NewGoal }` | `Goal` |
| `update_goal` | `{ id, patch: GoalPatch }` | `Goal` (`""` clears `unit`, `description`, `dueDate`. `targetValue: null` turns it into a milestone goal and keeps its logged progress.) |
| `set_goal_status` | `{ id, status, today }` | `Goal` |
| `delete_goal` | `{ id }` | `null` (cascades progress) |
| `reorder_goals` | `{ ids }` | `null` |
| `log_goal_progress` | `{ goalId, date, today, amount }` | `GoalSummary` |

```ts
type GoalStatus = "active" | "completed" | "abandoned";
type Goal = { id: number; title: string; description: string | null; targetValue: number | null;
  unit: string | null; dueDate: string | null; status: GoalStatus; closedOn: string | null;
  sortOrder: number; createdAt: string; updatedAt: string };
type NewGoal = { title: string; description?: string | null; targetValue?: number | null;
  unit?: string | null; dueDate?: string | null };
type GoalPatch = Partial<NewGoal>;
type GoalSummary = { goal: Goal; current: number; todayAmount: number; percent: number | null;
  daysLeft: number | null };
```

`GoalPatch.targetValue` needs to distinguish "omitted" from "set to null". In Rust, use
`Option<Option<f64>>` with `serde_with`-style double-option handling (or a custom deserializer) and
`#[ts(optional)]`. Document the choice in the scaffold.

### UI
- **Today widget "Goals":** active goals in order.
  - Each row shows the title and the due label ("12 days left", or "3 days overdue" in red).
  - Numeric goals add a progress bar with "14 / 24 books" and a small number input labelled
    "Today", prefilled with `todayAmount` and saved on Enter or blur.
  - Milestone goals show a "Mark complete" button.
  - When `percent` reaches 100, the row shows "Target reached · Complete?".
  - Empty state links to `/goals`.
- **`/goals`:**
  - Active goals with up/down reordering, edit, complete, and abandon.
  - A "New goal" dialog: title, description, a "Track a number" switch that reveals the target and
    unit fields, and an optional due date. Edit uses the same dialog.
  - A collapsed "Closed" section with Reopen and Delete (with confirmation).

### Verification
- Rust: logic tests cover `percent` and `daysLeft`, including overdue, values over 100%, and
  milestone goals. Repo tests cover CRUD, replace-not-add logging, amount 0 deleting the entry, the
  milestone and closed-goal rejections, status transitions, reorder validation, and the
  double-option patch.
- Frontend: widget tests cover a progress save, mark complete, and the due labels. Dialog tests
  cover the numeric switch.

---

## 20. Recap of yesterday (T8, v0.5)

### Goals and decisions
- A read-only "Yesterday" card that answers "how did yesterday go?" from data the other modules
  already store. It has no table of its own.
- The command takes any past `date`, so a future "browse a day" view can reuse it. The dashboard
  asks for `today - 1`.
- It covers habits, events, journal, reminders, goal progress, and notes reviewed. Puzzle, quotes,
  and themes aren't part of the recap.

### Rules
1. `date` must be before `today`.
2. **Habits:** use habits that aren't archived and whose local creation date is on or before
   `date`. `scheduled` counts those scheduled on `date` (`habits::logic::is_scheduled`). `done`
   counts scheduled habits checked on `date`. `missed` lists scheduled habits that weren't checked,
   in sort order. `bonus` counts checks on unscheduled habits.
3. **Events:** occurrences on `date`, using `calendar::logic::occurrence_on` and the same ordering
   as `get_upcoming_events`. Factor the existing loop into a reusable
   `calendar::repo::occurrences_between(conn, from, to)` (the one allowed change outside
   `recap/`; `upcoming` then calls it).
4. **Journal:** the `JournalSummary` for `date`, if there is one.
5. **Reminders:** reminders with `completed_on = date`, in rule 2 order of §17.
6. **Goals:** progress rows logged on `date`, with the goal title and unit.
7. **Notes:** the count of notes with `last_reviewed_on = date`. This is approximate: a note
   reviewed again later only records its latest review date.
8. `isEmpty` is true when every section is empty or zero.

### IPC contract
| Command | Args | Returns |
|---|---|---|
| `get_recap` | `{ date, today }` | `RecapDay` |

```ts
type RecapHabit = { id: number; name: string; color: HabitColor };
type RecapHabits = { scheduled: number; done: number; missed: RecapHabit[]; bonus: number };
type RecapGoalProgress = { goalId: number; title: string; amount: number; unit: string | null };
type RecapDay = { date: string; habits: RecapHabits; events: CalendarEvent[];
  journal: JournalSummary | null; remindersCompleted: Reminder[];
  goalProgress: RecapGoalProgress[]; notesReviewed: number; isEmpty: boolean };
```

The query key is `["recap", date]`. Mutations in habits, calendar, journal, reminders, goals, and
notes also invalidate `["recap"]`. The scaffold adds that to their existing invalidation helpers.

### UI
- **Today widget "Yesterday"** (titled with the weekday, for example "Yesterday · Saturday"). The
  compact sections appear only when non-empty:
  - **Habits:** "4 of 5 done", then "Missed: Read, Stretch" with color dots, and "+1 bonus".
  - **Events:** up to 3 summaries with times, then "+2 more".
  - **Journal:** a two-line preview and word count. Clicking it opens `/journal?date=<yesterday>`.
  - **Reminders:** "Completed 3 reminders" with titles in a tooltip or list.
  - **Goals:** "+2 books · Read 24 books".
  - **Notes:** "Reviewed 2 notes".
  - When `isEmpty`: "Nothing recorded yesterday."

### Verification
- Rust: build a fixture DB with every module's data around a date, then test each section,
  including the habit-creation cutoff, archived habits excluded, a yearly event occurrence, and
  `isEmpty`. Also test the `date >= today` rejection.
- Frontend: widget tests cover the full and empty recaps and the journal link target.

---

## 21. Daily puzzle (T13, v0.5)

### Goals and decisions
- One **Sudoku** per local date, playable directly on the dashboard. It's generated offline and
  deterministically from the date, so it needs no network and no content files.
- A puzzle is generated on first request and **stored**. Changing the generator later never alters
  a puzzle already shown.
- Progress autosaves. Solving stamps the date as completed. There's no timer, no hints, and no
  pencil marks.
- The widget is the whole UI: there's no route or sidebar entry.

### Data model (migration 009)
```sql
CREATE TABLE puzzles (
  date         TEXT PRIMARY KEY,         -- local date
  kind         TEXT NOT NULL DEFAULT 'sudoku' CHECK (kind = 'sudoku'),
  givens       TEXT NOT NULL,            -- 81 chars, '0' = blank, row-major
  solution     TEXT NOT NULL,            -- 81 chars
  progress     TEXT NOT NULL,            -- 81 chars, includes givens
  completed_at TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
```

### Rules
1. **Seed:** FNV-1a 64-bit hash of the `YYYY-MM-DD` string. **PRNG:** a hand-written SplitMix64 in
   `logic.rs`. Don't use the `rand` crate, so output can't drift when a dependency is upgraded.
2. **Generation:**
   - Fill a full valid grid by randomized backtracking (candidate order shuffled by the PRNG).
   - Visit cells in a PRNG-shuffled order and clear each one if the puzzle still has exactly one
     solution (a solver that stops counting at 2).
   - Stop when 32 givens remain or no further cell can be cleared.
   - Same date in, same puzzle out (test this with a fixed snapshot).
3. `get_puzzle` creates and stores the puzzle on first request. `date > today` is rejected.
4. **Saving progress:**
   - The input must be 81 integers from 0 to 9, and every given cell must keep its given value
     (`Validation` otherwise).
   - When the progress equals the solution, set `completed_at` (only the first time).
   - Saving a completed puzzle is a `Validation` error: the board locks once solved.
5. **Reset** sets `progress = givens` and is rejected for completed puzzles.
6. **The solution never crosses IPC.** Conflict highlighting (duplicates in a row, column, or box)
   is computed in the frontend from the progress alone.

### IPC contract
| Command | Args | Returns |
|---|---|---|
| `get_puzzle` | `{ date, today }` | `Puzzle` |
| `save_puzzle_progress` | `{ date, today, progress: number[] }` | `Puzzle` |
| `reset_puzzle` | `{ date, today }` | `Puzzle` |

```ts
type Puzzle = { date: string; kind: "sudoku"; givens: number[]; progress: number[];
  completedAt: string | null; solvedCount: number };   // solvedCount = all completed puzzles
```

### UI
- **Today widget "Puzzle":**
  - A 9×9 grid (square cells, thicker 3×3 box borders, fits a half-width card). Givens are bold and
    read-only.
  - Click or Tab selects a cell. Keys 1–9 fill it, Backspace, Delete, or 0 clears it, and arrow
    keys move. There's also a 1–9 number pad below the grid for mouse use.
  - Conflicting cells are tinted red.
  - Saves are debounced by 500 ms with optimistic local state.
  - Solved state: the grid is locked, with "Solved! · 23 puzzles solved". The header action is
    "Reset", with a confirmation, while the puzzle is unsolved.

### Verification
- Rust:
  - The generator is deterministic (snapshot the `givens` for two fixed dates).
  - Every generated puzzle has exactly one solution and at least 32 givens, across 50 consecutive
    dates. If this is slow in debug builds, use `#[ignore]` with a note and keep a 5-date version.
  - Tests cover the solver, progress validation (a changed given, out-of-range values, wrong
    length), completion stamping, locking, and reset.
- Frontend: tests cover keyboard entry and navigation, conflict highlighting, that givens are
  read-only, and the solved state.
