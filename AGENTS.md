# Lifelogging: Agent Guide

A local-first desktop **daily dashboard** ("how is my life going?"). v0.1 ships the dashboard
shell and the first widget, habit tracking. More widgets (calendar, journal, …) come next.

**Tech stack:** Tauri v2 · Rust (edition 2024) · SQLite (`rusqlite` + `rusqlite_migration`) ·
React 19 + Vite + TypeScript · Tailwind CSS v4 + shadcn/ui · TanStack Query · npm

## Docs map

| File | Purpose |
|---|---|
| `docs/SPEC.md` | Product and technical spec, the source of truth for behaviour, data model, IPC contract, and UI |
| `docs/PLAN.md` | Open and upcoming work only, plus how to run parallel agent tasks |
| `docs/COMPLETED.md` | Finished tasks, with the decisions made and how they were verified |
| `ideas.md` | Long-term feature brainstorm |
| `README.md` | Human quick start: run, data location, backup and reset |

When you finish a planned task, move its section from `PLAN.md` to `COMPLETED.md`. Record the
choices you made where the spec was ambiguous.

## Environment (read before building)

- **Run `cargo` from inside `src-tauri/`.** `src-tauri/.cargo/config.toml` sets `TS_RS_EXPORT_DIR`,
  and Cargo only reads it from the working directory. If you use `--manifest-path` from the repo
  root, it silently writes bindings to a stray `src-tauri/bindings/`.
- This directory is its own git repo. The parent `personal-apps/` folder is **not** a repo.

## Commands

```bash
npm install
npm run tauri dev                 # desktop app
npm run dev:mock                  # UI only, in a browser, against src/lib/mock-api.ts
LIFELOGGING_DB_PATH=/tmp/x.db npm run tauri dev   # use a scratch database

npm run typecheck && npm run lint && npm test && npx prettier --check .
npm run build                     # tsc + vite production build
npm run bindings                  # regenerate src/lib/bindings/*.ts from Rust types

cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings && cargo fmt --check
```

**Definition of done for any change:** all of the above pass. If Rust types changed, the
regenerated bindings are committed. UI changes are checked in the browser with `npm run dev:mock`,
or in the real app.

## Layout

```
src-tauri/src/
  lib.rs              Builder: DB setup, command registration (with_commands), context(), ipc_tests
  error.rs            AppError {NotFound, Validation, Database} → serialized as {kind, message}
  db/mod.rs           open(), migrations (embedded SQL), Db(Mutex<Connection>) managed state
  habits/
    model.rs          serde + ts-rs types (the IPC contract)
    repo.rs           all SQL; validate()
    logic.rs          pure rules: parse_date, is_scheduled, current_streak, last_n_days
    commands.rs       #[tauri::command] thin wrappers + build_rows + command-level tests
src/
  App.tsx             QueryClient, hash router, Toaster
  components/         AppLayout (sidebar nav); ui/ = shadcn components (generated, lint-relaxed)
  lib/                api.ts · mock-api.ts · queries.ts · date.ts · types.ts · bindings/ (generated)
  routes/             Today.tsx (dashboard), Habits.tsx (manage)
  widgets/            WidgetCard.tsx (frame for every widget); habits/ (checklist, form, list, pickers)
```

## Architecture rules

- **The webview never touches SQL.** All data access goes through typed Tauri commands. Rust
  validates the input, owns the business rules, and returns typed results. Don't add
  `tauri-plugin-sql`.
- **One module per dashboard area.** Each one gets `src-tauri/src/<module>/{model,repo,logic,commands}.rs`
  plus `src/widgets/<module>/`. Register its commands in `with_commands()` in `lib.rs`, add its
  route in `App.tsx`, and add its nav entry in `AppLayout.tsx`. Widgets render inside `WidgetCard`
  on the Today grid.
- **The frontend decides what "today" is.** Every date-sensitive command takes a local `YYYY-MM-DD`
  `today` or `date` argument. The backend validates it with `logic::parse_date` and never derives
  the calendar day from its own clock. The only exception is turning `created_at` into a calendar
  day, which uses the **local** time zone (see `created_local_date`). Key every per-day record by
  local `date`, so modules can later be joined by day.
- **Commands are synchronous** (`fn`, not `async fn`) and lock the single `Mutex<Connection>`. Put
  logic in `&Connection` helpers so you can test them without Tauri.
- **Schema changes are new migrations.** Append to the migration list in `db/mod.rs`. Never edit a
  migration that has already shipped.

## Contract and type pipeline

1. Change or add the Rust types in `<module>/model.rs` with `#[derive(Serialize, Deserialize, TS)]`,
   `#[serde(rename_all = "camelCase")]`, and `#[ts(export)]`. Annotate `i64` fields with
   `#[ts(type = "number")]`, and optional input fields with `#[serde(default)] #[ts(optional)]`.
2. Run `npm run bindings` to regenerate `src/lib/bindings/`. Never hand-edit that folder. Re-export
   the new types through `src/lib/types.ts`.
3. Add the function to the `Api` interface and `tauriApi` in `api.ts`, using camelCase argument
   keys. Tauri maps them to the snake_case Rust parameters.
4. Mirror the behaviour in `mock-api.ts`, so `npm run dev:mock` keeps working.
5. Add hooks to `queries.ts`. Mutations invalidate every query key they can affect.

## Frontend conventions

- Read and write data only through the hooks in `src/lib/queries.ts`. Show errors with
  `errorMessage(e)`. Backend validation errors are `{kind: "Validation", message}`; check for them
  with `isApiError`.
- Get dates from `src/lib/date.ts`. `useToday()` rolls over when the window regains focus. Pages own
  `today` and pass it to widgets as a prop.
- Use shadcn/ui from `src/components/ui/` (add more with `npx shadcn@latest add <name>`) and icons
  from `lucide-react`. Toasts go through `sonner`.
- Dark mode follows the OS through `prefers-color-scheme`. There is **no** `.dark` class and no
  `next-themes`.
- Use `react-router` v8 with a hash router. Import from `"react-router"`.
- Habit colors come from `src/widgets/habits/colors.ts`. Write full Tailwind class names there,
  because Tailwind can't detect class names built at runtime.
- Prettier `printWidth` is 100. Markdown and `src-tauri/` are excluded from Prettier.

## Testing

- **Rust:**
  - `logic.rs` gets table-driven unit tests.
  - `repo.rs` and `db` tests run against `db::open_in_memory()`.
  - `commands.rs` tests call the `&Connection` helpers directly.
  - `lib.rs` → `ipc_tests` sends commands through Tauri's mock runtime with the same JSON that
    `api.ts` sends. **Add a case there for every new command.**
- **IPC test gotchas:**
  - Use the request URL `tauri://localhost`. Other origins are treated as remote and denied with
    "not allowed. Plugin not found".
  - Build with `context()`, not a second `generate_context!()`.
  - The Rust modules are private, so tests live inside the crate, not in `src-tauri/tests/`.
- **Frontend:** Vitest, Testing Library, and jsdom, with tests next to their components
  (`*.test.tsx`). Mock `@/lib/api` or `@/lib/queries`, and wrap components in `QueryClientProvider`
  and `MemoryRouter` as needed.
- **Real-app QA:** there's no UI automation on this machine. Seed a scratch DB with `sqlite3`, run
  with `LIFELOGGING_DB_PATH`, and inspect with `screencapture`. Headless Chrome works against
  `npm run dev:mock` for browser screenshots.

## Working with parallel agents

Follow "Running a plan with parallel agents" in `docs/PLAN.md`.

- Edit only the files your task owns.
- Work in your own worktree (under `.claude/worktrees/`, which git, ESLint, Vitest, and Prettier
  ignore).
- Commit on your branch, but don't merge or push.
- Report your branch and commit, your decisions, and the verify output.
