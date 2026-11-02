use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::notes::model::{NewNote, Note, NotePatch, ReviewAction, ReviewQueue};
use tauri::State;

#[tauri::command]
pub fn list_notes(
    _db: State<'_, Db>,
    _query: Option<String>,
    _include_archived: bool,
) -> AppResult<Vec<Note>> {
    Err(AppError::Validation("not implemented".into()))
}

#[tauri::command]
pub fn create_note(_db: State<'_, Db>, _input: NewNote, _today: String) -> AppResult<Note> {
    Err(AppError::Validation("not implemented".into()))
}

#[tauri::command]
pub fn update_note(_db: State<'_, Db>, _id: i64, _patch: NotePatch) -> AppResult<Note> {
    Err(AppError::Validation("not implemented".into()))
}

#[tauri::command]
pub fn review_note(
    _db: State<'_, Db>,
    _id: i64,
    _today: String,
    _action: ReviewAction,
) -> AppResult<Note> {
    Err(AppError::Validation("not implemented".into()))
}

#[tauri::command]
pub fn set_note_archived(
    _db: State<'_, Db>,
    _id: i64,
    _archived: bool,
    _today: String,
) -> AppResult<Note> {
    Err(AppError::Validation("not implemented".into()))
}

#[tauri::command]
pub fn delete_note(_db: State<'_, Db>, _id: i64) -> AppResult<()> {
    Err(AppError::Validation("not implemented".into()))
}

#[tauri::command]
pub fn get_review_queue(_db: State<'_, Db>, _today: String, _limit: i64) -> AppResult<ReviewQueue> {
    Err(AppError::Validation("not implemented".into()))
}
