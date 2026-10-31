//! SQLite connection setup and migrations (SPEC §5).
#![allow(dead_code)] // TODO(T5): remove once setup in lib.rs opens the database.

use std::path::Path;
use std::sync::Mutex;

use rusqlite::Connection;
use rusqlite_migration::{M, Migrations};

use crate::error::{AppError, AppResult};

/// Managed Tauri state: the single app-wide connection.
pub struct Db(pub Mutex<Connection>);

/// Migration 001, exactly as in SPEC §5.
const MIGRATION_001: &str = "
CREATE TABLE habits (
  id            INTEGER PRIMARY KEY,
  name          TEXT    NOT NULL,
  description   TEXT,
  color         TEXT    NOT NULL DEFAULT 'slate',
  schedule_days INTEGER NOT NULL DEFAULT 127 CHECK (schedule_days BETWEEN 1 AND 127),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  archived_at   TEXT,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL
);

CREATE TABLE habit_checks (
  habit_id   INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date       TEXT    NOT NULL,
  created_at TEXT    NOT NULL,
  PRIMARY KEY (habit_id, date)
);

CREATE INDEX idx_habit_checks_date ON habit_checks(date);
";

const MIGRATION_ARRAY: &[M<'static>] = &[M::up(MIGRATION_001)];

/// Ordered list of embedded migrations (SPEC §5).
pub fn migrations() -> Migrations<'static> {
    Migrations::from_slice(MIGRATION_ARRAY)
}

/// Open (creating parent dirs if needed), set pragmas, and run migrations.
pub fn open(path: &Path) -> AppResult<Connection> {
    if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
        std::fs::create_dir_all(parent).map_err(|e| {
            AppError::Database(format!(
                "could not create database directory {}: {e}",
                parent.display()
            ))
        })?;
    }
    init(Connection::open(path)?)
}

/// In-memory database with migrations applied, for tests.
pub fn open_in_memory() -> AppResult<Connection> {
    init(Connection::open_in_memory()?)
}

fn init(mut conn: Connection) -> AppResult<Connection> {
    conn.pragma_update(None, "foreign_keys", "ON")?;
    // `journal_mode` returns the resulting mode (in-memory DBs report "memory").
    let _mode: String =
        conn.pragma_update_and_check(None, "journal_mode", "WAL", |row| row.get(0))?;
    migrations().to_latest(&mut conn)?;
    Ok(conn)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_are_valid() {
        assert!(migrations().validate().is_ok());
    }

    #[test]
    fn in_memory_has_schema_and_foreign_keys() {
        let conn = open_in_memory().unwrap();
        let fk: i64 = conn
            .pragma_query_value(None, "foreign_keys", |r| r.get(0))
            .unwrap();
        assert_eq!(fk, 1);
        let tables: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('habits', 'habit_checks')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(tables, 2);
    }

    #[test]
    fn open_creates_parent_dirs_uses_wal_and_reopens() {
        let dir = std::env::temp_dir().join(format!(
            "lifelogging-db-test-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let path = dir.join("nested").join("lifelogging.db");
        {
            let conn = open(&path).unwrap();
            let mode: String = conn
                .pragma_query_value(None, "journal_mode", |r| r.get(0))
                .unwrap();
            assert_eq!(mode.to_lowercase(), "wal");
        }
        // Re-opening an already-migrated DB is a no-op migration.
        open(&path).unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }
}
