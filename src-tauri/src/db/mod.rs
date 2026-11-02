//! SQLite connection setup and migrations (SPEC §5).

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use rusqlite::Connection;
use rusqlite_migration::{M, Migrations};

use crate::error::{AppError, AppResult};

/// Managed Tauri state: the single app-wide connection.
pub struct Db(pub Mutex<Connection>);

/// Managed path to the live database, used by export commands.
pub struct DbPath(pub PathBuf);

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

/// Migration 002 adds imported calendars and their source events.
const MIGRATION_002: &str = "
CREATE TABLE calendars (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL COLLATE NOCASE UNIQUE,
  imported_at TEXT NOT NULL
);

CREATE TABLE events (
  id          INTEGER PRIMARY KEY,
  calendar_id INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  uid         TEXT NOT NULL,
  summary     TEXT NOT NULL,
  start_date  TEXT NOT NULL,
  start_time  TEXT,
  end_time    TEXT,
  all_day     INTEGER NOT NULL CHECK (all_day IN (0, 1)),
  yearly      INTEGER NOT NULL CHECK (yearly IN (0, 1)),
  timezone    TEXT,
  UNIQUE (calendar_id, uid)
);

CREATE INDEX idx_events_start_date ON events(start_date);
";

const MIGRATION_003: &str = "
CREATE TABLE journal_entries (
  date       TEXT PRIMARY KEY,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
";

const MIGRATION_004: &str = "
CREATE TABLE annual_themes (
  year        INTEGER PRIMARY KEY CHECK (year BETWEEN 1900 AND 9999),
  title       TEXT NOT NULL,
  description TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
";

const MIGRATION_005: &str = "
CREATE TABLE quotes (
  id         INTEGER PRIMARY KEY,
  text       TEXT NOT NULL,
  author     TEXT,
  source     TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
";

const MIGRATION_006: &str = "
CREATE TABLE reminders (
  id           INTEGER PRIMARY KEY,
  title        TEXT NOT NULL,
  notes        TEXT,
  due_date     TEXT NOT NULL,
  due_time     TEXT,
  completed_on TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX idx_reminders_due_date ON reminders(due_date);
CREATE INDEX idx_reminders_completed_on ON reminders(completed_on);
";

const MIGRATION_007: &str = "
CREATE TABLE notes (
  id               INTEGER PRIMARY KEY,
  title            TEXT NOT NULL,
  body             TEXT,
  url              TEXT,
  review_stage     INTEGER NOT NULL DEFAULT 0 CHECK (review_stage >= 0),
  next_review_date TEXT,
  last_reviewed_on TEXT,
  archived_at      TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX idx_notes_next_review ON notes(next_review_date);
";

const MIGRATION_008: &str = "
CREATE TABLE goals (
  id           INTEGER PRIMARY KEY,
  title        TEXT NOT NULL,
  description  TEXT,
  target_value REAL CHECK (target_value IS NULL OR target_value > 0),
  unit         TEXT,
  due_date     TEXT,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  closed_on    TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE goal_progress (
  goal_id    INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  date       TEXT    NOT NULL,
  amount     REAL    NOT NULL CHECK (amount > 0),
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL,
  PRIMARY KEY (goal_id, date)
);
CREATE INDEX idx_goal_progress_date ON goal_progress(date);
";

const MIGRATION_ARRAY: &[M<'static>] = &[
    M::up(MIGRATION_001),
    M::up(MIGRATION_002),
    M::up(MIGRATION_003),
    M::up(MIGRATION_004),
    M::up(MIGRATION_005),
    M::up(MIGRATION_006),
    M::up(MIGRATION_007),
    M::up(MIGRATION_008),
];

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
#[cfg(test)]
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
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('habits', 'habit_checks', 'calendars', 'events', 'journal_entries', 'annual_themes', 'quotes', 'reminders', 'notes', 'goals', 'goal_progress')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(tables, 11);
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
