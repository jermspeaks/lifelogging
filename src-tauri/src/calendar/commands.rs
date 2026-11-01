use std::sync::MutexGuard;

use rusqlite::Connection;
use tauri::State;

use super::logic;
use super::model::{CalendarSource, EventOccurrence};
use super::repo;
use crate::db::Db;
use crate::error::{AppError, AppResult};

fn lock<'a>(db: &'a State<'_, Db>) -> AppResult<MutexGuard<'a, Connection>> {
    db.0.lock()
        .map_err(|_| AppError::Database("database lock poisoned".into()))
}

#[tauri::command]
pub fn list_calendar_sources(db: State<'_, Db>) -> AppResult<Vec<CalendarSource>> {
    let conn = lock(&db)?;
    repo::list_sources(&conn)
}

#[tauri::command]
pub fn import_calendar(
    db: State<'_, Db>,
    name: String,
    content: String,
    source_id: Option<i64>,
) -> AppResult<CalendarSource> {
    let calendar = logic::parse_calendar(&name, &content)?;
    let mut conn = lock(&db)?;
    repo::import(&mut conn, &calendar, source_id)
}

#[tauri::command]
pub fn delete_calendar(db: State<'_, Db>, source_id: i64) -> AppResult<()> {
    let conn = lock(&db)?;
    repo::delete_source(&conn, source_id)
}

#[tauri::command]
pub fn get_upcoming_events(db: State<'_, Db>, today: String) -> AppResult<Vec<EventOccurrence>> {
    let conn = lock(&db)?;
    repo::upcoming(&conn, &today)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    #[test]
    fn imports_and_lists_a_calendar() {
        let mut conn = db::open_in_memory().unwrap();
        let ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:test\r\nSUMMARY:Test event\r\nDTSTART;VALUE=DATE:20261031\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
        let parsed = logic::parse_calendar("test.ics", ics).unwrap();
        let source = repo::import(&mut conn, &parsed, None).unwrap();
        assert_eq!(repo::list_sources(&conn).unwrap(), [source]);
    }
}
