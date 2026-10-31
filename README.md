# Lifelogging

A local-first desktop daily dashboard (Tauri v2 + Rust + SQLite + React). See
[`docs/SPEC.md`](docs/SPEC.md) and [`docs/PLAN.md`](docs/PLAN.md).

## Develop

```bash
npm install
npm run tauri dev     # desktop app
npm run dev:mock      # UI only, in a browser, against an in-memory mock backend
```

> On this Mac, Rust builds currently need
> `SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk` (see PLAN.md → Environment notes).

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
