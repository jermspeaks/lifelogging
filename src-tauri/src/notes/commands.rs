//! Synchronous Tauri command wrappers for Notes (SPEC §18).

use std::sync::MutexGuard;

use rusqlite::Connection;
use tauri::State;

use crate::dates;
use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::notes::model::{NewNote, Note, NotePatch, ReviewAction, ReviewQueue};
use crate::notes::repo;

fn lock<'a>(db: &'a State<'_, Db>) -> AppResult<MutexGuard<'a, Connection>> {
    db.0.lock()
        .map_err(|_| AppError::Database("database lock poisoned".into()))
}

fn list_notes_in(
    conn: &Connection,
    query: Option<&str>,
    include_archived: bool,
) -> AppResult<Vec<Note>> {
    repo::list(conn, query, include_archived)
}

fn create_note_in(conn: &Connection, input: &NewNote, today: &str) -> AppResult<Note> {
    dates::parse_date(today)?;
    repo::create(conn, input, today)
}

fn update_note_in(conn: &Connection, id: i64, patch: &NotePatch) -> AppResult<Note> {
    repo::update(conn, id, patch)
}

fn review_note_in(
    conn: &Connection,
    id: i64,
    today: &str,
    action: ReviewAction,
) -> AppResult<Note> {
    dates::parse_date(today)?;
    repo::review(conn, id, today, action)
}

fn set_note_archived_in(
    conn: &Connection,
    id: i64,
    archived: bool,
    today: &str,
) -> AppResult<Note> {
    dates::parse_date(today)?;
    repo::set_archived(conn, id, archived, today)
}

fn delete_note_in(conn: &Connection, id: i64) -> AppResult<()> {
    repo::delete(conn, id)
}

fn review_queue_in(conn: &Connection, today: &str, limit: i64) -> AppResult<ReviewQueue> {
    dates::parse_date(today)?;
    repo::queue(conn, today, limit)
}

#[tauri::command]
pub fn list_notes(
    db: State<'_, Db>,
    query: Option<String>,
    include_archived: bool,
) -> AppResult<Vec<Note>> {
    list_notes_in(&*lock(&db)?, query.as_deref(), include_archived)
}

#[tauri::command]
pub fn create_note(db: State<'_, Db>, input: NewNote, today: String) -> AppResult<Note> {
    create_note_in(&*lock(&db)?, &input, &today)
}

#[tauri::command]
pub fn update_note(db: State<'_, Db>, id: i64, patch: NotePatch) -> AppResult<Note> {
    update_note_in(&*lock(&db)?, id, &patch)
}

#[tauri::command]
pub fn review_note(
    db: State<'_, Db>,
    id: i64,
    today: String,
    action: ReviewAction,
) -> AppResult<Note> {
    review_note_in(&*lock(&db)?, id, &today, action)
}

#[tauri::command]
pub fn set_note_archived(
    db: State<'_, Db>,
    id: i64,
    archived: bool,
    today: String,
) -> AppResult<Note> {
    set_note_archived_in(&*lock(&db)?, id, archived, &today)
}

#[tauri::command]
pub fn delete_note(db: State<'_, Db>, id: i64) -> AppResult<()> {
    delete_note_in(&*lock(&db)?, id)
}

#[tauri::command]
pub fn get_review_queue(db: State<'_, Db>, today: String, limit: i64) -> AppResult<ReviewQueue> {
    review_queue_in(&*lock(&db)?, &today, limit)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    #[test]
    fn helper_paths_validate_frontend_supplied_today_and_delegate() {
        let conn = db::open_in_memory().unwrap();
        let input = NewNote {
            title: "Command test".into(),
            body: None,
            url: None,
        };
        assert!(matches!(
            create_note_in(&conn, &input, "2026-2-1"),
            Err(AppError::Validation(_))
        ));
        let note = create_note_in(&conn, &input, "2026-10-31").unwrap();
        let listed = list_notes_in(&conn, Some("command"), false).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, note.id);
        assert!(matches!(
            review_note_in(&conn, note.id, "2026-2-1", ReviewAction::Keep),
            Err(AppError::Validation(_))
        ));
        assert_eq!(
            review_note_in(&conn, note.id, "2026-10-31", ReviewAction::Keep)
                .unwrap()
                .review_stage,
            1
        );
        assert_eq!(
            review_queue_in(&conn, "2026-10-31", 5).unwrap().due_count,
            0
        );
        assert!(matches!(
            set_note_archived_in(&conn, note.id, true, "bad"),
            Err(AppError::Validation(_))
        ));
        update_note_in(
            &conn,
            note.id,
            &NotePatch {
                title: Some("Updated".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(delete_note_in(&conn, note.id).is_ok());
    }
}
