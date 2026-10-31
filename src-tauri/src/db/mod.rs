//! SQLite connection setup and migrations. Implemented in T1 (see docs/PLAN.md).
#![allow(dead_code)] // TODO(T5): remove once setup in lib.rs opens the database.

use std::path::Path;
use std::sync::Mutex;

use rusqlite::Connection;
use rusqlite_migration::Migrations;

use crate::error::AppResult;

/// Managed Tauri state: the single app-wide connection.
pub struct Db(pub Mutex<Connection>);

/// Ordered list of embedded migrations (SPEC §5).
pub fn migrations() -> Migrations<'static> {
    unimplemented!("T1")
}

/// Open (creating parent dirs if needed), set pragmas, and run migrations.
pub fn open(path: &Path) -> AppResult<Connection> {
    let _ = path;
    unimplemented!("T1")
}

/// In-memory database with migrations applied, for tests.
pub fn open_in_memory() -> AppResult<Connection> {
    unimplemented!("T1")
}
