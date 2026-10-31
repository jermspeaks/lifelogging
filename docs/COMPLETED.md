# Completed Work

Finished tasks from [`PLAN.md`](./PLAN.md), newest first. Each entry records what was built, the
decisions made where [`SPEC.md`](./SPEC.md) was ambiguous, and how the work was verified. Open work
stays in `PLAN.md`. Ongoing conventions live in [`AGENTS.md`](../AGENTS.md).

## T6: Calendar and event lookahead (2026-10-31)

**Built**
- Added SQLite migration 002 for calendars and imported event records, with a case-insensitive unique calendar name and cascading deletion.
- Added the typed `list_calendars`, `import_calendar`, `delete_calendar`, and `get_upcoming_events` commands, generated TypeScript bindings, React Query hooks, and mock API parity.
- Added `/calendar` for local `.ics` selection, source naming, import feedback, calendar inventory, and confirmed deletion.
- Added the Today Events widget with local-date groups for today and the next three days, all-day/timed presentation, and loading/error/empty states.

**Decisions**
- A calendar's trimmed source name (case-insensitive) is its identity. Re-importing that name atomically replaces its events; distinct names remain independent even when UIDs match. Failed validation does not change the existing import.
- Imported events are read-only; edits happen in the source calendar followed by re-import. The original file contents are not retained.
- Supported event values are date-only, floating local time, UTC, and IANA `TZID`; UTC and IANA times are converted to the machine's local zone. Ambiguous times choose the earlier instant; nonexistent source times are rejected.
- Supports one-time events and simple `RRULE:FREQ=YEARLY` recurrence for birthdays. Other recurrence rules, `RDATE`, `EXDATE`, overrides, `DURATION`, custom time zones, and unsupported constructs fail rather than being guessed. February 29 yearly events do not get a synthetic non-leap-year occurrence.
- The lookahead includes the local `today` and following three dates. Multi-day events appear only on their start date; all-day `DTEND` is treated as exclusive. Imports are bounded to 10 MiB and 10,000 events.
- No dialog plugin was added; the browser file input reads the chosen file and sends UTF-8 content through typed IPC.

**Verified**
- `cargo test`: 49 passed, including calendar migration/repository/parser and IPC coverage.
- `cargo clippy --all-targets -- -D warnings` and `cargo fmt --check` passed.
- `npm run typecheck`, `npm run lint`, `npm test` (25 passed), `npx prettier --check .`, and `npm run build` passed. Vite reports a bundle-size advisory (>500 kB minified output); the build succeeds.
- Generated bindings were produced by `npm run bindings`.
- **Not verified in the real window:** file chooser/mouse QA, persistence across an actual restart, replacement UX, and delete flow. Checklist remains open in `PLAN.md` and requires human confirmation.

---

## v0.1: Habits (2026-10-30 → 2026-10-31)

v0.1 delivered the dashboard shell and the first widget: full CRUD for habits, a Today checklist
with streaks and a 7-day strip, and SQLite persistence. It was built in three phases: one
contract-first scaffold task, four parallel agents in git worktrees, and one serial integration task.

| Task | Scope | Commit on `main` |
|---|---|---|
| T0 | Scaffold and frozen IPC contract | `7760309` |
| T2 | Domain logic | `789b457` (merge) |
| T1 | Database and repository | `cb45e7a` (merge) |
| T4 | Today dashboard | `5b1c96a` (merge) |
| T3 | Habits management UI | `f73e39b` (merge) |
| T5 | Wire-up, integration, QA | `7df4712` |

Final state: 36 Rust tests and 21 frontend tests pass. Clippy (`-D warnings`), fmt, ESLint,
Prettier, `tsc`, and the production build are clean.

### Follow-up: manual QA and macOS toolchain (2026-10-31)

**Verified**
- In the real app, four habits (two daily, one weekday, one weekend-only) appeared correctly. Checking
  and unchecking worked and persisted across an app restart. Other manual QA flows remain open in
  `PLAN.md`.
- `env -u SDKROOT cargo build` succeeded in `src-tauri/`, so the obsolete SDK workaround was removed
  from `AGENTS.md` and `README.md`.

---

### T5: Wire-up, integration, and QA (2026-10-31)

**Built**
- `lib.rs` `setup` opens the database from `LIFELOGGING_DB_PATH`, or by default from
  `app_data_dir()/lifelogging.db`. It runs the migrations and manages `Db(Mutex<Connection>)`. It
  also prints the DB path on startup.
- The 10 commands in `habits/commands.rs` are thin wrappers. `set_check` and `today_habits` take a
  `&Connection`, so they can be tested.
- `build_rows` builds every `TodayHabit` from **one** `checks_between` query, starting at the earlier
  of the strip start and the oldest creation date.
- All the `TODO(T5)` `#[allow(dead_code)]` markers are gone. `db::open_in_memory` is now `#[cfg(test)]`.
- The README covers the DB location, the scratch-DB override, backup, and reset.

**Decisions and fixes**
- **Local creation date (bug fix):** a habit's creation day is now `created_at` converted to the
  machine's local time zone. Using the UTC date marked a habit created in the evening as
  "before creation" for its first local day.
- **IPC-level tests:** `lib.rs` → `ipc_tests` sends every command through Tauri's mock runtime using
  the exact camelCase argument names `api.ts` sends. It also checks that errors arrive as
  `{kind, message}`. The test setup needed:
  - `tauri` as a dev-dependency with the `test` feature;
  - the request origin set to `tauri://localhost`, because other origins are treated as remote and
    denied with "not allowed. Plugin not found";
  - one shared `context()` function, because `generate_context!` can only expand once per crate.
- **Module visibility:** the modules stay private, so integration tests live inside the crate, not
  in `src-tauri/tests/`.

**Verified**
- `cargo test`: 36 passed, including the 3 command-level tests and the 2 IPC tests.
- **Real app with a seeded `LIFELOGGING_DB_PATH` DB:**
  - The daily habit with a miss 6 days ago shows a streak of 5.
  - The weekends-only habit shows a streak of 0, with the dot statuses correct.
  - The weekday habit is grouped under "Not scheduled today".
  - Data persists across a restart.
- **Real app at the default path:** the DB is created in
  `~/Library/Application Support/com.jermspeaks.lifelogging/` and the empty state renders.
- **Not verified in the real window:** mouse-driven mutations. This machine has no UI automation,
  so they are still open in `PLAN.md`.

---

### T3: Habits management UI (2026-10-31)

**Built**
- **`/habits` page:** a single `useHabits(true)` query split into active and archived habits, plus
  empty, loading, and error states. ⌘N or Ctrl+N opens "New habit".
- **`HabitFormDialog`:** one dialog for both create and edit.
  - Fields: name, description (with a 0/500 counter), `ColorPicker` (a radio group navigable with
    arrow keys), and `WeekdayPicker` (7 toggles plus the "Every day" = 127 and "Weekdays" = 31
    presets).
  - Validation runs client-side and mirrors SPEC §6. Backend `Validation` errors appear inline and
    keep the dialog open. Other errors show a toast.
- **`HabitList`:** each row shows a color dot, the name, a schedule label ("Every day" / "Weekdays" /
  "Weekends" / "Mon, Wed, Fri"), and the description. Each row has up/down, edit, and archive
  buttons.
- **`ArchivedHabits`:** a collapsed section with Unarchive and Delete. Delete asks for confirmation
  in an AlertDialog.

**Decisions**
- **Reorder** uses up/down buttons instead of drag-and-drop, so no new dependency. Both `habits`
  caches update optimistically, then the full active id list goes to `reorderHabits`.
- **Edit** always sends the full patch, and an emptied description is sent as `""` (which clears it).
  **Create** omits a blank description.
- **Toasts:** archiving shows an "Undo" toast that unarchives. Delete shows a success toast.

**Verified:** 11 new tests, covering:
- the weekday mask ↔ toggles round trip and the presets;
- blocking an empty or whitespace-only name and an empty schedule;
- that the create payload is trimmed;
- that edit is prefilled and clears the description with `""`;
- that inline backend errors render;
- that delete is called only after confirmation;
- that the reorder payload is correct.

There was also a scripted headless-Chrome click-through against the mock. It covered create, edit
(including the over-80-character name rejection), reorder, archive and unarchive, delete, and ⌘N,
with no console errors.

---

### T4: Today dashboard and habits checklist widget (2026-10-31)

**Built**
- **`WidgetCard`:** a generic frame for every future widget, with a title, optional icon, optional
  action, body, and `className` for grid spans.
- **`Today`:** a header with the date ("Saturday, October 31") and an "n of m habits done" summary
  that counts only habits scheduled today. Below it is a responsive widget grid.
- **`HabitChecklist`:**
  - Habits scheduled today come first, followed by a collapsed "Not scheduled today (n)" group.
  - Each row has a checkbox, a color dot, the name (struck through when done), a `StreakBadge`, and
    a `WeekStrip`.
  - There's a "Manage" link, and an empty state with an "Add a habit" button.
- **`WeekStrip`:** 7 dots, each with `data-status` and a tooltip.
  - Done: filled with the habit's color.
  - Pending: a ring in the habit's color.
  - Missed: muted fill.
  - Skipped: a faint outline.

**Decisions**
- The dashboard owns `today` (from `useToday()`) and passes it down as a prop. Future widgets should
  take `today` the same way, so every widget agrees on the date.
- Habits that aren't scheduled today can still be checked as a bonus (SPEC §6.2). Those checks don't
  count in the summary.
- The "skipped" outline uses `ring-muted-foreground/30`, so it stays visible in dark mode.

**Verified:** `WeekStrip` and `Today` tests cover:
- the dot classes and tooltips;
- the header date;
- that the summary ignores unscheduled habits;
- that the unscheduled group starts collapsed;
- that toggling calls `setHabitCheck(id, TODAY, TODAY, true)` and is optimistic;
- the empty state.

Light-mode and dark-mode screenshots were checked against the mock.

---

### T1: Database and repository layer (2026-10-31)

**Built**
- **`db::open`:** creates parent directories, sets `foreign_keys=ON` and `journal_mode=WAL`, and
  runs migration 001 (SPEC §5) through `rusqlite_migration`. Reopening an existing DB is a no-op.
- **`repo.rs`:** the 9 functions are implemented with their stub signatures unchanged.
  - Validation lives in one `validate()`.
  - Timestamps are RFC 3339 UTC with milliseconds (`…T12:34:56.789Z`). Dates are `YYYY-MM-DD` text.
  - Unknown ids return `NotFound`.

**Decisions**
- A description that's blank after trimming is stored as `NULL`, on both create and patch.
- `sort_order = max + 1` counts archived habits too. Unarchiving moves a habit to the end.
- `set_archived` is a no-op when the habit is already in the requested state, so re-archiving keeps
  the original `archived_at`.
- `reorder` runs in a transaction and rejects duplicate, unknown, archived, or missing ids. It
  doesn't bump `updated_at`.
- `set_check` returns `NotFound` for a missing habit. The future-date rule is enforced in the command
  layer (T5).
- `checks_between` returns an entry for every requested id, even if the set is empty.

**Verified:** 14 tests (3 for db and 11 for repo), covering everything in the T1 test list.

---

### T2: Domain logic (2026-10-31)

**Built:** pure functions in `habits/logic.rs`.
- `parse_date` checks the shape strictly before chrono parses it, because chrono's `%Y-%m-%d`
  accepts `2026-2-1`.
- `is_scheduled` reads the weekday bitmask.
- `current_streak` is bounded by `created`, so it can't loop forever.
- `last_n_days` builds the 7-day strip.

**Decisions**
- Each strip day gets the first status that applies:
  1. checked → `Done`;
  2. before creation → `Skipped`;
  3. unscheduled → `Skipped`;
  4. today → `Pending`;
  5. otherwise → `Missed`.
- Checks dated before creation still show as `Done`, so history is never hidden. They don't count
  toward the streak.
- Bonus checks on unscheduled days show as `Done` but never extend or bridge a streak.
- Today, when unscheduled and unchecked, is `Skipped`. A weekday habit keeps its streak over the
  weekend.

**Verified:** 7 table-driven tests covering every case in the T2 list, plus these edge cases:
- `today < created`;
- an empty schedule;
- `NaiveDate::MIN`;
- `n` = 0, 1, and 30;
- leap days;
- full-width digits.

---

### T0: Scaffold and frozen contract (2026-10-30)

**Built**
- A Tauri v2 app (`com.jermspeaks.lifelogging`) scaffolded into the repo root, with this tooling:
  - React 19 + Vite 8 + TypeScript 6;
  - Tailwind v4 and shadcn/ui (new-york, radix);
  - TanStack Query and react-router v8 (hash router);
  - ESLint 10, Prettier, and Vitest 5 with Testing Library.
- Rust: rusqlite 0.40 (bundled), rusqlite_migration 2.6, chrono, thiserror, and ts-rs 12 (bindings
  go to `src/lib/bindings/` through `src-tauri/.cargo/config.toml`).
- The full IPC contract:
  - the types in `habits/model.rs` and `error.rs` (`ErrorPayload {kind, message}`);
  - all 10 commands registered with their final signatures;
  - stub signatures for `db`, `repo`, and `logic`.
- The frontend data layer:
  - `api.ts`: the `Api` interface and the Tauri implementation;
  - `mock-api.ts`: an in-memory implementation seeded with history, enabled with
    `VITE_MOCK_API=1` / `npm run dev:mock`;
  - `queries.ts`: query and mutation hooks. `useSetHabitCheck` does the optimistic update, rollback,
    and error toast;
  - `date.ts`: `useToday()` re-evaluates the date when the window regains focus or becomes visible.
- The app shell (sidebar plus `/` and `/habits`), and `colors.ts`. Dark mode follows the OS through
  `prefers-color-scheme`. `next-themes` was removed.

**Decisions:** these change the spec or plan as originally written.
- The Rust edition is 2024, as the scaffold produced (the spec said 2021).
- `rusqlite` is pinned to 0.40, because `rusqlite_migration` 2.6 requires `^0.40`.
- `colors.ts` and the optimistic check toggle were built in T0 instead of T3 and T4. That removed the
  only cross-dependency between the two parallel UI tasks.
- `HabitPatch.description = ""` clears the description.
- `npm run bindings` runs from `src-tauri/`. Run from the repo root with `--manifest-path`, Cargo
  ignores `.cargo/config.toml` and writes stray bindings.

**Follow-up (2026-10-31, `78b715c`):** ESLint and Vitest were scanning agent worktrees under
`.claude/worktrees/`. That path is now ignored by git, ESLint, Vitest, and Prettier.
