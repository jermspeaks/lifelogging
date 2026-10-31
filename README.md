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

## Checks

```bash
npm run typecheck && npm run lint && npm test
npm run bindings      # regenerate src/lib/bindings from Rust types
(cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings && cargo fmt --check)
```
