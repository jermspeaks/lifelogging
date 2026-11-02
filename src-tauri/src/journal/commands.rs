use std::sync::MutexGuard;

use rusqlite::Connection;
use tauri::State;

use crate::dates;
use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::journal::model::{JournalEntry, JournalSummary};
use crate::journal::{logic, repo};

fn lock<'a>(db: &'a State<'_, Db>) -> AppResult<MutexGuard<'a, Connection>> {
    db.0.lock()
        .map_err(|_| AppError::Database("database lock poisoned".into()))
}

fn validate_date_not_future(date: &str, today: &str) -> AppResult<()> {
    let date = dates::parse_date(date)?;
    let today = dates::parse_date(today)?;
    if date > today {
        return Err(AppError::Validation(
            "Journal date cannot be in the future.".into(),
        ));
    }
    Ok(())
}

fn get_entry(conn: &Connection, date: &str, today: &str) -> AppResult<Option<JournalEntry>> {
    validate_date_not_future(date, today)?;
    repo::get(conn, date)
}

fn save_entry(
    conn: &Connection,
    date: &str,
    today: &str,
    body: &str,
) -> AppResult<Option<JournalEntry>> {
    validate_date_not_future(date, today)?;
    logic::validate_body(body)?;
    repo::save(conn, date, body)
}

fn delete_entry(conn: &Connection, date: &str) -> AppResult<()> {
    dates::parse_date(date)?;
    repo::delete(conn, date)
}

fn list_entries(
    conn: &Connection,
    query: Option<&str>,
    before: Option<&str>,
    limit: Option<i64>,
) -> AppResult<Vec<JournalSummary>> {
    repo::list(conn, query, before, limit.unwrap_or(50))
}

#[tauri::command]
pub fn get_journal_entry(
    db: State<'_, Db>,
    date: String,
    today: String,
) -> AppResult<Option<JournalEntry>> {
    get_entry(&*lock(&db)?, &date, &today)
}

#[tauri::command]
pub fn save_journal_entry(
    db: State<'_, Db>,
    date: String,
    today: String,
    body: String,
) -> AppResult<Option<JournalEntry>> {
    save_entry(&*lock(&db)?, &date, &today, &body)
}

#[tauri::command]
pub fn delete_journal_entry(db: State<'_, Db>, date: String) -> AppResult<()> {
    delete_entry(&*lock(&db)?, &date)
}

#[tauri::command]
pub fn list_journal_entries(
    db: State<'_, Db>,
    query: Option<String>,
    before: Option<String>,
    limit: Option<i64>,
) -> AppResult<Vec<JournalSummary>> {
    list_entries(&*lock(&db)?, query.as_deref(), before.as_deref(), limit)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    #[test]
    fn rejects_future_dates_and_bad_date_shapes() {
        let conn = db::open_in_memory().unwrap();
        assert!(matches!(
            get_entry(&conn, "2026-11-01", "2026-10-31"),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            save_entry(&conn, "2026-2-1", "2026-10-31", "note"),
            Err(AppError::Validation(_))
        ));
        assert!(get_entry(&conn, "2026-10-31", "2026-10-31").is_ok());
    }

    #[test]
    fn validates_dates_and_defaults_list_limit() {
        let conn = db::open_in_memory().unwrap();
        save_entry(&conn, "2026-10-30", "2026-10-31", "a note").unwrap();
        assert_eq!(list_entries(&conn, None, None, None).unwrap().len(), 1);
        assert!(matches!(
            delete_entry(&conn, "tomorrow"),
            Err(AppError::Validation(_))
        ));
        assert!(delete_entry(&conn, "2026-10-30").is_ok());
        assert!(list_entries(&conn, None, None, Some(0)).is_err());
    }
}
