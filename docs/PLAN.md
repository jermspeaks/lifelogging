# Lifelogging: Plan

This file covers **open and upcoming work only**. Finished tasks, with their decisions and
verification notes, are in [`COMPLETED.md`](./COMPLETED.md). Conventions, commands, and gotchas
are in [`AGENTS.md`](../AGENTS.md). The product spec is [`SPEC.md`](./SPEC.md).

## Status

| Milestone | State |
|---|---|
| **v0.1: Habits** (shell + habit CRUD + Today checklist) | ✅ Built and committed (T0–T5, 2026-10-31). Manual QA in the real window is still open (below). |
| v0.2: second dashboard module | Not started. Pick from the [candidates](#next-candidate-tasks). |

## Open items

### 1. v0.1 manual QA in the real window (needs a human)

Run `npm run tauri dev` with the `SDKROOT` prefix (see AGENTS.md). Use a scratch database
(`LIFELOGGING_DB_PATH=/tmp/qa.db`) if you don't want test data in your real one. Each flow is already
covered by the IPC tests and the mock click-through. What's left is confirming it with a real mouse
in the real webview.

- [x] Fresh start shows the empty state. The DB file is created in
      `~/Library/Application Support/com.jermspeaks.lifelogging/`.
- [x] Today groups habits correctly by schedule.
- [x] A DB seeded with old checks shows sensible streaks and 7-day strips, and they survive a
      restart.
- [ ] Create 3 habits (daily, weekdays, weekends only). They appear on Habits and Today in order.
- [ ] Checking and unchecking updates the summary, streak, and strip instantly, and survives a
      restart.
- [ ] Editing name, color, or schedule shows up on Today.
- [ ] Reorder persists across a restart.
- [ ] Archive hides a habit from Today. Unarchive restores it with its history intact.
- [ ] Permanent delete asks for confirmation and removes the habit and its history.
- [ ] Invalid input (an empty name) shows an inline error, and the app doesn't crash.

If something fails, add a task below with the failing step and fix it before starting v0.2.

### 2. Fix the macOS toolchain (needs a human, outside the repo)

The Command Line Tools 26.6 linker can't read the default `MacOSX27.0.sdk`. Every Rust build needs
`SDKROOT=…/MacOSX26.5.sdk`, and rust-analyzer in the editor fails its build-script step. Update the
Command Line Tools (or Xcode). When a plain `cargo build` works in `src-tauri/`, remove the
workaround notes from AGENTS.md and README.md.

## Next: candidate tasks

These aren't specced yet. Before splitting one into agent tasks, add a section for it to `SPEC.md`
covering its data model, rules, IPC contract, and UI. Then plan it here with the same phases as
v0.1: a contract-first scaffold task, parallel tasks with explicit file ownership, then wire-up. See
"Running a plan with parallel agents" below.

- **T6: Today Calendar widget.** Import `.ics` files into an `events` table, and show today's events
  plus a 3-day lookahead (`ideas.md` → Daily View). This is the first test of the "new module = new
  folder + widget" pattern (SPEC §4).
- **T7: Journal widget.** One entry per local date, keyed by `date` like `habit_checks`.
- **T8: Data export and backup.** A command that copies the SQLite file, or exports JSON, to a
  location the user chooses.

Further ideas are in [`ideas.md`](../ideas.md) and SPEC §10.

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
