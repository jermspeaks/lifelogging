use std::sync::MutexGuard;

#[cfg(test)]
use chrono::NaiveDate;
use rusqlite::Connection;
use tauri::State;

use super::logic;
use super::model::{Calendar, CalendarEvent, ImportCalendarResult};
use super::repo;
use crate::db::Db;
use crate::error::{AppError, AppResult};

fn lock<'a>(db: &'a State<'_, Db>) -> AppResult<MutexGuard<'a, Connection>> {
    db.0.lock()
        .map_err(|_| AppError::Database("database lock poisoned".into()))
}

#[tauri::command]
pub fn list_calendars(db: State<'_, Db>) -> AppResult<Vec<Calendar>> {
    repo::list(&*lock(&db)?)
}

#[tauri::command]
pub fn import_calendar(
    db: State<'_, Db>,
    name: String,
    content: String,
) -> AppResult<ImportCalendarResult> {
    repo::import(&mut *lock(&db)?, &name, &content)
}

#[tauri::command]
pub fn delete_calendar(db: State<'_, Db>, id: i64) -> AppResult<()> {
    repo::delete(&*lock(&db)?, id)
}

#[tauri::command]
pub fn get_upcoming_events(db: State<'_, Db>, today: String) -> AppResult<Vec<CalendarEvent>> {
    let date = logic::parse_date(&today)?;
    repo::upcoming(&*lock(&db)?, date)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    #[test]
    fn upcoming_rejects_invalid_date() {
        let conn = db::open_in_memory().unwrap();
        assert!(repo::upcoming(&conn, NaiveDate::MIN).is_ok());
        assert!(matches!(
            logic::parse_date("2026-2-1"),
            Err(AppError::Validation(_))
        ));
    }
}
