# Lifelogging: Plan

This file covers **open and upcoming work only**. Finished tasks, with their decisions and
verification notes, are in [`COMPLETED.md`](./COMPLETED.md). Conventions, commands, and gotchas
are in [`AGENTS.md`](../AGENTS.md). The product spec is [`SPEC.md`](./SPEC.md).

## Status

| Milestone | State |
|---|---|
| **v0.1: Habits** (shell + habit CRUD + Today checklist) | ✅ Built and committed (T0–T5, 2026-10-31). Manual QA is partly complete; remaining checks are below. |
| v0.2: Calendar and event lookahead | ✅ Implemented; real-window mouse QA remains open below. |
| v0.3: Reflect (Journal, Annual theme, Quotes, Export) | S3 scaffold implemented; T7, T9, T10, and T15 are ready after the scaffold is committed. |
| v0.4: Plan (Reminders, Notes review, Goals) | 📝 Specced (SPEC §17–§19); not started. |
| v0.5: Look back (Recap, Puzzle) | 📝 Specced (SPEC §20–§21); not started. |

## Open items

### 1. v0.1 manual QA in the real window (needs a human)

Run `npm run tauri dev`. Use a scratch database (`LIFELOGGING_DB_PATH=/tmp/qa.db`) if you don't want
test data in your real one. Each flow is already covered by the IPC tests and the mock click-through.
What's left is confirming the remaining flows with a real mouse in the real webview.

- [x] Fresh start shows the empty state. The DB file is created in
      `~/Library/Application Support/com.jermspeaks.lifelogging/`.
- [x] Today groups habits correctly by schedule.
- [x] A DB seeded with old checks shows sensible streaks and 7-day strips, and they survive a
      restart.
- [x] Create four habits (two daily, one weekdays, one weekends only). They appear correctly on
      Habits and Today.
- [x] Checking and unchecking works, and the changes survive an app restart.
- [ ] Editing name, color, or schedule shows up on Today.
- [ ] Reorder persists across a restart.
- [ ] Archive hides a habit from Today. Unarchive restores it with its history intact.
- [ ] Permanent delete asks for confirmation and removes the habit and its history.
- [ ] Invalid input (an empty name) shows an inline error, and the app doesn't crash.

If something fails, add a task below with the failing step and fix it before starting the next module.

### 2. T6 real-window calendar QA (needs a human)

Run `npm run tauri dev` and use the real file chooser and mouse interactions. Test with a scratch DB if desired.

- [ ] Import a `.ics` file with an all-day event, a timed event, and a yearly birthday.
- [ ] Confirm the events appear under the correct local dates in Today, including the next three days.
- [ ] Re-import the same calendar name with changed content; confirm it replaces, rather than duplicates, events.
- [ ] Try a malformed or unsupported recurrence file; confirm the error is visible and the previous import remains intact.
- [ ] Delete a calendar after confirmation; confirm its events disappear from Today.
- [ ] Restart the app and confirm imported calendars and events persist.

The backend IPC and mock UI flows are automated; this checklist specifically covers the real macOS webview and file chooser.

## Roadmap: v0.3–v0.5

The remaining Daily View ideas in [`ideas.md`](../ideas.md) (T7–T15) are specified in `SPEC.md`
§12–§21. **Read §12 "Product decisions to confirm" before starting a milestone.** Once a milestone's
scaffold is committed, its contract is frozen.

| Milestone | Scaffold (serial) | Parallel tasks | Wire-up (serial) | Migrations |
|---|---|---|---|---|
| **v0.3: Reflect** | S3 | T7 Journal · T9 Annual theme · T10 Quotes · T15 Export and backup | W3 | 003 journal, 004 annual_themes, 005 quotes |
| **v0.4: Plan** | S4 | T12 Reminders · T11 Notes review · T14 Goals | W4 | 006 reminders, 007 notes, 008 goals |
| **v0.5: Look back** | S5 | T8 Recap · T13 Puzzle | W5 | 009 puzzles |

Run the milestones in order. Recap (T8) reads data from the v0.3 and v0.4 modules, so it comes last.
Within a milestone, the parallel tasks own disjoint files and can run at the same time.

### How the shared files are split

The files that every module touches (`db/mod.rs`, `lib.rs`, `api.ts`, `queries.ts`, `types.ts`,
`App.tsx`, `AppLayout.tsx`, `Today.tsx`, `Cargo.toml`, `package.json`, `capabilities/`) are owned
**only** by the scaffold and wire-up tasks. The scaffold freezes everything a parallel agent needs:

- the migrations, in their final SQL from the spec;
- each module's `model.rs`, with the final types and the bindings generated and committed;
- each module's `commands.rs` with final signatures, registered in `with_commands()`, and with
  stubbed bodies that return `Err(AppError::Validation("not implemented".into()))`;
- stub `repo.rs` and `logic.rs` files containing signatures with `unimplemented!()` bodies, marked
  `#[allow(dead_code)] // TODO(<task>)`;
- `api.ts` entries, `types.ts` re-exports, and the `queries.ts` hooks with their final keys and
  invalidation;
- `src/lib/mock/<module>.ts` stubs that are spread into `createMockApi()`, and that return empty
  data or throw `Validation: not implemented`;
- routes, nav entries, and Today grid slots that render placeholder components from files the
  parallel tasks own.

Parallel tasks then fill in the module's `repo.rs`, `logic.rs`, `commands.rs`, mock file, widgets,
and route, with tests. The wire-up task adds an IPC test per command, runs the real app against a
seeded database, writes the human QA checklist, and closes the milestone in `COMPLETED.md`.

---

### T7: Journal (parallel, after S3)

**Spec:** SPEC §13.

**Owns:** `src-tauri/src/journal/{repo,logic,commands}.rs`, `src/lib/mock/journal.ts`,
`src/widgets/journal/**`, `src/routes/Journal.tsx`, and tests next to them.

**Implement:** the repo and rules 1–5, the command bodies (with command-level tests against
`&Connection` helpers), the mock with 3 seeded past entries, the Today widget with debounced
autosave and the rollover flush, and the `/journal` page with search, paging, a date jump, delete,
and the `?date=` parameter.

**Tests:** the list in SPEC §13 "Verification".

**Verify:** `cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings && cargo fmt --check`,
then `npm run typecheck && npm run lint && npm test && npx prettier --check .`, then click through
with `npm run dev:mock`.

---

### T9: Annual theme (parallel, after S3)

**Spec:** SPEC §14.

**Owns:** `src-tauri/src/themes/{repo,logic,commands}.rs`, `src/lib/mock/themes.ts`,
`src/widgets/themes/**` (`ThemeBanner`, `ThemeDialog`), `src/routes/Themes.tsx`, and tests.

**Implement:** the upsert, validation, list, and delete. The banner shows the day-of-year progress,
computed in a small pure helper in `src/widgets/themes/` (not in `date.ts`, which isn't owned). Add
the dialog and the `/themes` page. Seed the mock with the current year's theme.

**Tests and verify:** as in SPEC §14, plus the same Verify commands as T7.

---

### T10: Quotes (parallel, after S3)

**Spec:** SPEC §15.

**Owns:** `src-tauri/src/quotes/{repo,logic,commands}.rs`, `src/lib/mock/quotes.ts`,
`src/widgets/quotes/**`, `src/routes/Quotes.tsx`, and tests.

**Implement:** CRUD, the daily-selection function and import-line parser in `logic.rs`, and an
all-or-nothing import in one transaction. Build the widget and the `/quotes` page with the "Add"
and "Paste many" dialogs. Seed the mock with a few public-domain quotes.

**Tests and verify:** as in SPEC §15, plus the same Verify commands as T7.

---

### T15: Data export and backup (parallel, after S3)

**Spec:** SPEC §16.

**Owns:** `src-tauri/src/data/**` (except `model.rs`), `src/lib/mock/data.ts`,
`src/routes/Settings.tsx`, `src/widgets/settings/**` (if needed), and tests. `README.md` gets a
"Restore from a backup" note in the Data section.

**Implement:** path validation, the `VACUUM INTO` snapshot with an atomic rename, and the generic
JSON dump inside a read transaction. Build the Settings "Data" section using `chooseSavePath`
from `src/lib/dialog.ts`. Format the size with a local helper.

**Tests:** as in SPEC §16. The Rust tests use a temporary directory; `std::env::temp_dir()` plus a
unique subfolder is fine, so you don't need a new dev-dependency.

**Verify:** the same commands as T7, plus a manual `npm run tauri dev` check that the real save
dialog writes a snapshot that `sqlite3 <file> .tables` can read. If you can't do that, report it as
not verified.

---

### W3: v0.3 wire-up and QA (serial, after T7, T9, T10, and T15 are merged)

**Owns:** `src-tauri/src/lib.rs` (`ipc_tests`), small integration fixes (list each one in the
summary), `docs/PLAN.md`, `docs/COMPLETED.md`, and `README.md`.

**Implement**
- IPC tests for all 17 new commands, using the exact JSON that `api.ts` sends.
- Remove every `TODO(T7|T9|T10|T15)` `allow(dead_code)` marker.
- Run the real app with a seeded `LIFELOGGING_DB_PATH` database and take screenshots of Today
  (banner, journal, quote) and of the new pages.
- Add a "v0.3 manual QA" checklist under Open items for the mouse-driven flows: autosave typing,
  the rollover flush, the theme dialog, the paste import, both export dialogs, and persistence
  across a restart.
- Move S3, T7, T9, T10, T15, and W3 to `COMPLETED.md` with their decisions.

**Verify:** the full Definition of Done in `AGENTS.md`.

---

### S4: v0.4 scaffold (serial, after W3)

**Goal:** freeze the contracts for SPEC §17–§19.

**Owns:** everything.

**Implement**
- Migrations 006 `reminders`, 007 `notes`, and 008 `goals` plus `goal_progress`.
- Modules `reminders`, `notes`, and `goals` with final models, stubbed repo, logic, and commands,
  and all 20 commands registered.
  - For `NotePatch` and `ReviewAction`, the action serializes as lowercase `"keep"` or `"snooze"`.
  - For `GoalStatus`, use lowercase values.
  - For `GoalPatch.targetValue`, decide on the double-option representation (SPEC §19) and
    document it in `model.rs`.
- Add `tauri-plugin-opener` (Rust crate and `@tauri-apps/plugin-opener`) and grant
  `opener:allow-open-url`. Add `src/lib/open.ts` (`openExternal`), working in both modes.
- Bindings, `types.ts`, `api.ts`, and `queries.ts` (keys `["reminders", …]`, `["notes", …]`, and
  `["goals", …]`). Put each module's optimistic toggle (`useSetReminderDone`) in `queries.ts` here,
  as v0.1 did for the habit check.
- Mock stubs in `src/lib/mock/{reminders,notes,goals}.ts`.
- Routes `/reminders`, `/goals`, and `/notes` with stub pages, and nav entries in SPEC §12 order.
  Today slots for `RemindersWidget`, `GoalsWidget`, and `ReviewWidget` in SPEC §12 order.

**Verify:** the full Definition of Done, and the mock app shows the new placeholders.

---

### T12: Reminders (parallel, after S4)

**Spec:** SPEC §17.

**Owns:** `src-tauri/src/reminders/{repo,logic,commands}.rs`, `src/lib/mock/reminders.ts`,
`src/widgets/reminders/**`, `src/routes/Reminders.tsx`, and tests.

**Implement:** the sort and due-set predicates in `logic.rs`; CRUD, done/undone, and the 30-day
completed window in `repo.rs`; the widget with its groups, quick add, and snooze; and the
`/reminders` page with date grouping and the dialog. Seed the mock with overdue, today, and future
reminders.

**Tests and verify:** as in SPEC §17, plus the T7 Verify commands.

---

### T11: Notes review (parallel, after S4)

**Spec:** SPEC §18.

**Owns:** `src-tauri/src/notes/{repo,logic,commands}.rs`, `src/lib/mock/notes.ts`,
`src/widgets/notes/**`, `src/routes/Notes.tsx`, and tests.

**Implement:** the interval ladder and the keep, snooze, archive, and unarchive transitions as pure
functions in `logic.rs`. Validate URLs without a new crate: check the `http://` or `https://` prefix
and a non-empty host with no whitespace. Build CRUD, search, and the queue, then the widget and the
`/notes` page. Seed the mock with some notes that are due and some that aren't.

**Tests and verify:** as in SPEC §18, plus the T7 Verify commands.

---

### T14: Goals (parallel, after S4)

**Spec:** SPEC §19.

**Owns:** `src-tauri/src/goals/{repo,logic,commands}.rs`, `src/lib/mock/goals.ts`,
`src/widgets/goals/**`, `src/routes/Goals.tsx`, and tests.

**Implement:** `percent` and `daysLeft` in `logic.rs`; CRUD, status, reorder, and progress logging
(set, replace, or delete) in `repo.rs`; `GoalSummary` assembly in one query plus a progress
aggregate; the widget with inline "Today" logging; and the `/goals` page with its dialog and the
closed section. Seed the mock with one numeric goal and one milestone goal.

**Tests and verify:** as in SPEC §19, plus the T7 Verify commands.

---

### W4: v0.4 wire-up and QA (serial, after T11, T12, and T14 are merged)

Same shape as W3: IPC tests for all 20 commands, removing the TODO markers, a seeded real-app run
with screenshots, a "v0.4 manual QA" checklist (reminder toggles and snooze, the note Keep, Snooze,
and Done flow, an external link opening in the browser, goal logging and completion, and
persistence across a restart), and closing the milestone in `COMPLETED.md`.

---

### S5: v0.5 scaffold (serial, after W4)

**Goal:** freeze the contracts for SPEC §20–§21.

**Owns:** everything.

**Implement**
- Migration 009 `puzzles`.
- Module `recap` (model, a stub `repo.rs`, and `commands.rs` with `get_recap`) and module `puzzle`
  (model, stubs, and its 3 commands).
- `RecapDay` reuses the existing `CalendarEvent`, `JournalSummary`, and `Reminder` types and the
  `HabitColor` enum.
- Bindings, `types.ts`, `api.ts`, and `queries.ts`. Recap uses the key `["recap", date]`. **Add
  `["recap"]` invalidation** to the habits, calendar, journal, reminders, goals, and notes mutations
  (SPEC §20). Puzzle uses the key `["puzzle", date]`.
- Mock stubs in `src/lib/mock/{recap,puzzle}.ts`. The recap mock may read from the other mock
  modules' state; it's fine to expose read helpers from `createMockApi()` for this.
- Today slots: `RecapWidget` first in the grid, and `PuzzleWidget` last (SPEC §12). There are no
  new routes.

**Verify:** the full Definition of Done.

---

### T8: Recap of yesterday (parallel, after S5)

**Spec:** SPEC §20.

**Owns:** `src-tauri/src/recap/{repo,commands}.rs`, `src/lib/mock/recap.ts`,
`src/widgets/recap/**`, and tests. As the one exception, it may also add
`calendar::repo::occurrences_between` and have `upcoming` call it, without changing behavior.

**Implement:** one function per section in `recap/repo.rs`, each taking `&Connection` and the date.
Reuse the public `habits` and `calendar` logic. Write SQL directly against the journal, reminders,
goals, and notes tables, rather than editing those modules. Then build the widget.

**Tests and verify:** as in SPEC §20 (the fixture DB covers every section), plus the T7 Verify
commands. The existing calendar tests must still pass unchanged.

---

### T13: Daily puzzle (parallel, after S5)

**Spec:** SPEC §21.

**Owns:** `src-tauri/src/puzzle/{repo,logic,commands}.rs`, `src/lib/mock/puzzle.ts`,
`src/widgets/puzzle/**`, and tests.

**Implement:** FNV-1a, SplitMix64, the generator, and the uniqueness-counting solver in `logic.rs`;
store on first request, plus progress, completion, lock, and reset, in `repo.rs`; and the grid
widget with keyboard and number-pad input, conflict tinting, and debounced saves. The mock can use
a hard-coded puzzle and solution.

**Tests and verify:** as in SPEC §21, plus the T7 Verify commands. Report the generator's run time
in debug and release builds.

---

### W5: v0.5 wire-up and QA (serial, after T8 and T13 are merged)

Same shape as W3: IPC tests for `get_recap` and the 3 puzzle commands, a real-app run with a seeded
database that covers yesterday in every module, a "v0.5 manual QA" checklist (the recap matches what
was entered, the journal link from the recap, solving and locking the puzzle, and persistence across
a restart), and closing the milestone in `COMPLETED.md`. Update `SPEC.md` §10 and the
`AGENTS.md` layout if the module list changed.

---

## Running a plan with parallel agents

This is the process that delivered v0.1. Reuse it for each milestone.

```
Phase 0 (1 agent, serial)       Scaffold + freeze the contract (types, command signatures,
                                api.ts / queries.ts, mock-api.ts), with stubbed bodies
                                  │
Phase 1 (N agents, parallel)    One task per layer/screen, each owning disjoint files
                                  │
Phase 2 (1 agent, serial)       Wire stubs to real code, IPC tests, real-app QA
```

- **Phase 0 must be committed to `main` before Phase 1 starts.** Agents branch from it.
- **Each task lists the files it owns.** Parallel agents edit only their own files. If a task needs
  a change elsewhere, the agent reports it in its summary and doesn't make the change. If two tasks
  would both touch a shared helper (like `colors.ts` in v0.1), build that helper in Phase 0.
- **Worktrees:** spawn agents with worktree isolation (they land in `.claude/worktrees/`, which is
  ignored). A fresh worktree has no `node_modules` and no Rust `target/`, so the agent runs
  `npm install` first. Its first `cargo build` takes a few minutes.
- **Merging:** each agent commits on its own branch and does not merge. The orchestrator reviews each
  diff (`git diff --stat main...<branch>` should list only owned files), merges with `--no-ff`, and
  reruns the full checks after each merge. Afterwards it deletes the merged worktrees and branches.
- **The spec is the source of truth.** Where it's ambiguous, the agent picks the simplest reading and
  reports the choice. Record those choices in `COMPLETED.md` when the task closes.
- **When a task finishes,** move its section from this file to `COMPLETED.md`, including what was
  built, the decisions, and how it was verified.

### Prompt template for spawning an agent

> You are implementing task **\<id\>** (for example S3, T7, or W3) of `docs/PLAN.md` in `/Users/jeremywong/personal-apps/lifelogging`.
> Read `AGENTS.md`, `docs/SPEC.md` (§12 plus the section your task cites), and the \<id\> section of `docs/PLAN.md`. Edit only the files that
> task owns. The scaffold froze the contract (`model.rs`, `api.ts`, `queries.ts`); if it needs to change, report it instead of editing it. Use Context7 for current Tauri v2, rusqlite, and React docs. When you're done, run the
> Verify commands and commit on your branch (don't merge). Then report: the branch and commit, what
> you built, any choices you made where the spec was unclear, any changes needed outside your files,
> and the verify output.
