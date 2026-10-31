# Lifelogging

A local-first desktop daily dashboard (Tauri v2 + Rust + SQLite + React).

- [`docs/SPEC.md`](docs/SPEC.md): what we're building
- [`docs/PLAN.md`](docs/PLAN.md): open and upcoming work
- [`docs/COMPLETED.md`](docs/COMPLETED.md): finished work and the decisions made
- [`AGENTS.md`](AGENTS.md): conventions, commands, and gotchas for coding agents (also loaded by
  `CLAUDE.md`)

## Develop

```bash
npm install
npm run tauri dev     # desktop app
npm run dev:mock      # UI only, in a browser, against an in-memory mock backend
```


## Data

Habits live in a single SQLite file:

```
~/Library/Application Support/com.jermspeaks.lifelogging/lifelogging.db
```

- **Use a different database:** `LIFELOGGING_DB_PATH=/tmp/scratch.db npm run tauri dev`. Handy for
  testing with seeded data.
- **Back up:** quit the app, then copy `lifelogging.db`.
- **Reset:** quit the app, then delete `lifelogging.db` and its `-wal` and `-shm` siblings. Migrations
  recreate the schema on the next launch.

## Checks

```bash
npm run typecheck && npm run lint && npm test
npm run bindings      # regenerate src/lib/bindings from Rust types
(cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings && cargo fmt --check)
```
