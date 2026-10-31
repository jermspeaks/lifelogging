# Lifelogging: Plan

This file covers **open and upcoming work only**. Finished tasks, with their decisions and
verification notes, are in [`COMPLETED.md`](./COMPLETED.md). Conventions, commands, and gotchas
are in [`AGENTS.md`](../AGENTS.md). The product spec is [`SPEC.md`](./SPEC.md).

## Status

| Milestone | State |
|---|---|
| **v0.1: Habits** (shell + habit CRUD + Today checklist) | ✅ Built and committed (T0–T5, 2026-10-31). Manual QA is partly complete; remaining checks are below. |
| v0.2: second dashboard module | Not started. Pick from the [candidates](#next-candidate-tasks). |

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

If something fails, add a task below with the failing step and fix it before starting v0.2.

## Next: candidate tasks

These aren't specced yet. Before splitting one into agent tasks, add a section for it to `SPEC.md`
covering its data model, rules, IPC contract, and UI. Then plan it here with the same phases as v0.1:
a contract-first scaffold task, parallel tasks with explicit file ownership, then wire-up. See
"Running a plan with parallel agents" below. Habit tracking from `ideas.md` is delivered in v0.1.

- **T6: Today Calendar and event lookahead.** Import `.ics` calendars (including birthdays and other
  events) into an `events` table; show today's events and the next three days on the dashboard.
- **T7: Journal widget.** Create and edit one journal entry per local date, keyed by `date` like
  `habit_checks`.
- **T8: Recap of Yesterday.** Summarize the prior local day's activity across available modules.
- **T9: Annual theme.** Set and display a yearly theme, such as a year of practice.
- **T10: Quote widget.** Define how quotes are selected and whether they come from a local collection
  or an external source.
- **T11: Notes review.** Save items for later and surface them for review on the dashboard.
- **T12: Today's reminders.** Define reminder creation, date/time behavior, and presentation.
- **T13: Puzzle widget.** Define the puzzle experience and its content source.
- **T14: Goals.** Define goal tracking and how goals appear in the daily dashboard.
- **T15: Data export and backup.** Provide a user-selected SQLite backup or JSON export.

These candidates cover the remaining ideas in [`ideas.md`](../ideas.md); implementation still requires
specifying each feature in `SPEC.md` first.

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

> You are implementing task **T\<n\>** of `docs/PLAN.md` in `/Users/jeremywong/personal-apps/lifelogging`.
> Read `AGENTS.md`, `docs/SPEC.md`, and the T\<n\> section of `docs/PLAN.md`. Edit only the files that
> task owns. Use Context7 for current Tauri v2, rusqlite, and React docs. When you're done, run the
> Verify commands and commit on your branch (don't merge). Then report: the branch and commit, what
> you built, any choices you made where the spec was unclear, any changes needed outside your files,
> and the verify output.
