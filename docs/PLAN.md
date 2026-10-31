# Lifelogging v0.1 (Habits): Implementation Plan

This plan implements [`SPEC.md`](./SPEC.md). Agents can pick up tasks on their own. Each task lists
which files it **owns**. Agents that run at the same time must not edit files owned by another
task. If a task needs a change outside its files, it notes that in its hand-off summary and doesn't
make the change.

## How to run this plan

```
Phase 0 (1 agent, serial)        T0  Scaffold + IPC contract
                                   │
Phase 1 (4 agents, parallel)  ┌────┼────────┬──────────┐
                              T1   T2       T3         T4
                            DB/repo logic  Habits UI  Today UI
                              └────┴────────┴──────────┘
                                   │
Phase 2 (1 agent, serial)        T5  Wire-up + integration + QA
```

- **T0 must be merged before Phase 1 starts.** It freezes the contract (types, command signatures,
  `api.ts`) so the other four tasks can work in parallel without waiting on each other.
- Phase 1 agents should each work in their own git worktree/branch (`task/t1-repo` etc.) and merge
  back into `main` in this order: T2 → T1 → T3 → T4. If a merge conflicts, it should only be in
  shared registration files, and those are trivial to fix.
- Every agent must read `docs/SPEC.md` first. The spec is the source of truth. If the spec is
  ambiguous, the agent picks the simplest reading and writes down the choice in its summary.
- Every agent finishes by running its task's **Verify** commands and reporting the results.

### Prompt template for spawning an agent
> You are implementing task **T\<n\>** of `docs/PLAN.md` in `/Users/jeremywong/personal-apps/lifelogging`.
> Read `docs/SPEC.md` and the T\<n\> section of `docs/PLAN.md`. Edit only the files that task owns.
> Use Context7 for current Tauri v2 / rusqlite / React docs. When you're done, run the Verify
> commands. Then report: what you built, any choices you made where the spec was unclear, any
> changes needed outside your files, and the verify output.

---

## T0: Scaffold and freeze the contract (serial, blocking)

**Goal:** a Tauri v2 app that runs, with tooling in place and every type and command signature
defined. Command bodies are stubbed.

**Steps**
1. Scaffold with `npm create tauri-app@latest` (React + TypeScript + Vite, npm) **into the existing
   repo root**. Keep `ideas.md`, `README.md`, and `docs/`. Set `productName` to `Lifelogging` and
   `identifier` to `com.jermspeaks.lifelogging`.
2. Frontend tooling: Tailwind v4 (`@tailwindcss/vite`), shadcn/ui init (add `button`, `checkbox`,
   `dialog`, `input`, `textarea`, `label`, `toggle-group`, `sonner`, `alert-dialog`, `collapsible`),
   TanStack Query, `react-router` (memory or hash router, since there are no server routes), ESLint
   and Prettier, Vitest with `@testing-library/react` and jsdom.
3. `package.json` scripts: `dev`, `build`, `tauri`, `lint`, `typecheck` (`tsc --noEmit`), `test`
   (`vitest run`), `bindings` (`cargo test --manifest-path src-tauri/Cargo.toml export_bindings`,
   which is how ts-rs exports).
4. Rust deps: `rusqlite` (features `bundled`), `rusqlite_migration`, `serde`, `serde_json`,
   `thiserror`, `chrono` (with `serde`), `ts-rs` (with `chrono-impl`). Set the ts-rs export dir to
   `src/lib/bindings/` (`TS_RS_EXPORT_DIR`, configured in `src-tauri/.cargo/config.toml`).
5. Create the module layout from SPEC §4. Fill in:
   - `error.rs`: the `AppError` enum (`NotFound`, `Validation`, `Database`) with a `Serialize` impl
     that produces `{kind, message}`, plus `From<rusqlite::Error>`.
   - `habits/model.rs`: `Habit`, `NewHabit`, `HabitPatch`, `HabitColor` enum, `DayStatus`,
     `DayEntry`, `TodayHabit`, all `#[derive(Serialize, Deserialize, TS)]` with
     `#[serde(rename_all = "camelCase")]` and `#[ts(export)]`.
   - `habits/commands.rs`: all 10 commands from SPEC §7 with their final signatures. Bodies are
     `todo!()` or return `Err(AppError::Validation("not implemented"))`. Register them all in
     `lib.rs` with `generate_handler!`.
   - `habits/repo.rs` and `habits/logic.rs`: function **signatures only**. See the stubs in the
     T1 and T2 sections. Use `unimplemented!()` bodies.
   - `db/mod.rs`: a stub `open(path) -> Result<Connection>` and `migrations()`.
6. Generate the bindings and commit them under `src/lib/bindings/`.
7. `src/lib/api.ts`: one typed async function per command, wrapping `invoke`, plus
   `src/lib/queries.ts` with TanStack Query hooks and keys (`['habits', {includeArchived}]`,
   `['today', date]`). Mutations invalidate both keys.
8. `src/lib/mock-api.ts`: an in-memory implementation of the same interface. When `VITE_MOCK_API=1`
   is set, `api.ts` uses the mock. This lets the UI tasks work in a plain browser (`npm run dev`)
   before the backend exists.
9. `src/lib/date.ts`: `todayLocal(): string` (YYYY-MM-DD in local time) and a `useToday()` hook
   that recomputes on window focus and `visibilitychange`.
10. An app shell with a sidebar and the routes `/` and `/habits`, each showing a placeholder.
    Owned file stubs: `src/routes/Today.tsx`, `src/routes/Habits.tsx`, and an empty
    `src/widgets/habits/` directory.

**Owns:** everything (it's the only agent running).

**Verify:** `npm run typecheck && npm run lint && npm test`, `cargo build` and `cargo clippy` in
`src-tauri/`, `npm run tauri dev` opens a window showing the shell, and
`VITE_MOCK_API=1 npm run dev` works in a browser.

---

## T1: Database and repository layer (parallel)

**Goal:** real SQLite persistence for habits and checks.

**Owns:** `src-tauri/src/db/**`, `src-tauri/src/habits/repo.rs`, `src-tauri/tests/repo_*.rs` (optional)

**Implement**
- `db::open(path: &Path) -> Result<Connection, AppError>`: creates parent dirs, sets the pragmas
  (`foreign_keys=ON`, `journal_mode=WAL`), and runs migrations. Also `db::open_in_memory()` for tests.
- Migration 001 exactly as in SPEC §5.
- `repo.rs` (all take `&Connection`):
  ```rust
  pub fn list(conn, include_archived: bool) -> Result<Vec<Habit>>
  pub fn get(conn, id: i64) -> Result<Habit>                       // NotFound
  pub fn create(conn, input: &NewHabit) -> Result<Habit>           // validates, sort_order = max+1
  pub fn update(conn, id: i64, patch: &HabitPatch) -> Result<Habit>// validates, bumps updated_at
  pub fn set_archived(conn, id: i64, archived: bool) -> Result<Habit>
  pub fn delete(conn, id: i64) -> Result<()>                       // cascades checks
  pub fn reorder(conn, ids: &[i64]) -> Result<()>                  // in a transaction; set must equal active ids
  pub fn set_check(conn, habit_id: i64, date: NaiveDate, done: bool) -> Result<()>
  pub fn checks_between(conn, habit_ids: &[i64], from: NaiveDate, to: NaiveDate)
      -> Result<HashMap<i64, HashSet<NaiveDate>>>
  ```
- Validation (name 1–80 chars after trimming, description ≤ 500, schedule 1–127) lives in one
  function, `validate(...)`, inside `repo.rs`.

**Tests (in-memory DB):** create/get/list ordering; archived habits excluded or included; update
patch semantics (omitted fields stay unchanged); validation errors; delete cascades checks;
reorder rejects incomplete sets; set_check is idempotent; un-checking a missing check is a no-op;
`checks_between` range bounds are inclusive.

**Verify:** `cargo test && cargo clippy -- -D warnings && cargo fmt --check` (in `src-tauri/`)

---

## T2: Domain logic (parallel)

**Goal:** pure functions for schedules, streaks, and the 7-day strip. No DB or Tauri code.

**Owns:** `src-tauri/src/habits/logic.rs`

**Implement**
```rust
pub fn parse_date(s: &str) -> Result<NaiveDate, AppError>          // strict YYYY-MM-DD
pub fn is_scheduled(schedule_days: u8, date: NaiveDate) -> bool    // bit0 = Monday
pub fn current_streak(schedule_days: u8, created: NaiveDate, today: NaiveDate,
                      checks: &HashSet<NaiveDate>) -> u32
pub fn last_n_days(schedule_days: u8, created: NaiveDate, today: NaiveDate,
                   checks: &HashSet<NaiveDate>, n: u32) -> Vec<DayEntry>   // oldest → newest
```
Follow SPEC §6 rules 1, 4, and 5 exactly.

**Tests:** table-driven unit tests in the same file. Cover: every weekday bit; a daily habit with
an unbroken streak; today unchecked doesn't break the streak; today checked counts; a weekday-only
habit carrying a streak across a weekend; bonus checks on unscheduled days don't count; the streak
stops at creation date; the streak is 0 when yesterday was missed; `last_n_days` statuses
including `pending` and pre-creation `skipped`; `parse_date` rejects `2026-2-1`, `2026-02-30`, and
an empty string.

**Verify:** `cargo test habits::logic && cargo clippy -- -D warnings`

---

## T3: Habits management UI (parallel)

**Goal:** the `/habits` page from SPEC §8, built against `api.ts` (use the mock while developing).

**Owns:** `src/routes/Habits.tsx`, `src/widgets/habits/HabitForm.tsx`,
`src/widgets/habits/HabitList.tsx`, `src/widgets/habits/WeekdayPicker.tsx`,
`src/widgets/habits/ColorPicker.tsx`, `src/widgets/habits/colors.ts`, and tests next to them
(`*.test.tsx`).

**Implement**
- Active list with edit, archive, and reorder actions.
- Create/edit dialog: name, description, color swatches, weekday toggles with "Every day" and
  "Weekdays" presets. Client-side validation matches SPEC §6. Backend `Validation` messages are
  shown inline.
- Collapsed archived section with unarchive and delete-permanently (AlertDialog confirm).
- `colors.ts` maps `HabitColor` to Tailwind classes. **T4 imports this, so ship it first.** The
  palette is fixed by the `HabitColor` enum from T0.
- Toasts (sonner) for mutation errors.

**Tests:** `WeekdayPicker` mask ↔ toggles round-trip (presets set 127 and 31); the form blocks an
empty name; the delete confirm calls `deleteHabit` only after confirmation.

**Verify:** `npm run typecheck && npm run lint && npm test`, then click through every flow with
`VITE_MOCK_API=1 npm run dev`.

---

## T4: Today dashboard and habits checklist widget (parallel)

**Goal:** the `/` page from SPEC §8.

**Owns:** `src/routes/Today.tsx`, `src/widgets/habits/HabitChecklist.tsx`,
`src/widgets/habits/StreakBadge.tsx`, `src/widgets/habits/WeekStrip.tsx`,
`src/widgets/WidgetCard.tsx`, and tests next to them.

**Implement**
- `WidgetCard`: the generic frame (title, optional action, body) that every future widget uses.
  Today renders a responsive grid of widgets. For now it has only `HabitChecklist`.
- Header with the formatted date and the "n of m done" summary (counts only habits scheduled today).
- `HabitChecklist`: habits scheduled today first, then a collapsed "Not scheduled today" group.
  Optimistic toggle through a TanStack `onMutate` cache update that rolls back on error and shows a
  toast. Shows the streak badge and the 7-day `WeekStrip` (each dot gets a title tooltip with its
  date and status).
- Empty state that links to `/habits`.
- Uses `useToday()` so the date rolls over when the window regains focus.
- If T3's `colors.ts` hasn't landed yet, import it anyway. The T0 stub path exists, so fill in the
  local usage and rebase.

**Tests:** `WeekStrip` renders 7 dots with the right status classes; the summary counts only
scheduled habits; a toggle calls `setHabitCheck` with the `today` from `useToday`.

**Verify:** `npm run typecheck && npm run lint && npm test`, then a manual run with
`VITE_MOCK_API=1 npm run dev`.

---

## T5: Wire-up, integration, and QA (serial, after T1–T4 are merged)

**Goal:** a working app end to end.

**Owns:** `src-tauri/src/habits/commands.rs`, `src-tauri/src/lib.rs`, `README.md`, plus any small
integration fixes (each one listed in the summary).

**Implement**
- In `lib.rs` `setup`: resolve the DB path (`LIFELOGGING_DB_PATH` or `app_data_dir/lifelogging.db`),
  call `db::open`, and `app.manage(Mutex::new(conn))`.
- Command bodies: lock, call into `repo`, and build `TodayHabit` with `logic` (one
  `checks_between` query covering `today-6 … today` plus enough history for streaks; loading checks
  since the habit's creation is fine at this scale).
- `set_habit_check` rejects `date > today` and returns the refreshed `TodayHabit`.
- A Rust integration test that drives the command functions (not IPC) against an in-memory DB:
  create, check, get_today, archive, delete.
- README: how to run, where the DB lives, and how to reset it.

**Manual QA checklist (macOS, `npm run tauri dev`)**
- [ ] Fresh start shows the empty state. The DB file is created in
      `~/Library/Application Support/com.jermspeaks.lifelogging/`.
- [ ] Create 3 habits (daily, weekdays, weekends only). They appear on Habits and Today in order.
- [ ] Today groups the habits correctly by schedule.
- [ ] Checking and unchecking updates the summary, streak, and strip instantly, and the changes
      survive a restart.
- [ ] Editing name, color, or schedule shows up on Today.
- [ ] Reorder persists across a restart.
- [ ] Archive hides a habit from Today. Unarchive restores it with its history intact.
- [ ] Permanent delete asks for confirmation and removes the habit and its history.
- [ ] Invalid input (an empty name) shows an inline error. The app doesn't crash.
- [ ] Changing the system date (or using a `LIFELOGGING_DB_PATH` DB seeded with old checks) shows
      sensible streaks.

**Verify:** the full Definition of Done in SPEC §9.

---

## After v0.1: candidate next tasks
- T6: Today Calendar widget (`.ics` import → `events` table) as the second module, to prove the
  module pattern.
- T7: Journal widget (one entry per local date).
- T8: Data export and backup command.
