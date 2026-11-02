use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::reminders::model::{NewReminder, Reminder, ReminderPatch};
use tauri::State;

#[tauri::command]
pub fn list_reminders(
    _db: State<'_, Db>,
    _today: String,
    _include_completed: bool,
) -> AppResult<Vec<Reminder>> {
    Err(AppError::Validation("not implemented".into()))
}

#[tauri::command]
pub fn get_due_reminders(_db: State<'_, Db>, _today: String) -> AppResult<Vec<Reminder>> {
    Err(AppError::Validation("not implemented".into()))
}

#[tauri::command]
pub fn create_reminder(_db: State<'_, Db>, _input: NewReminder) -> AppResult<Reminder> {
    Err(AppError::Validation("not implemented".into()))
}

#[tauri::command]
pub fn update_reminder(_db: State<'_, Db>, _id: i64, _patch: ReminderPatch) -> AppResult<Reminder> {
    Err(AppError::Validation("not implemented".into()))
}

#[tauri::command]
pub fn set_reminder_done(
    _db: State<'_, Db>,
    _id: i64,
    _today: String,
    _done: bool,
) -> AppResult<Reminder> {
    Err(AppError::Validation("not implemented".into()))
}

#[tauri::command]
pub fn delete_reminder(_db: State<'_, Db>, _id: i64) -> AppResult<()> {
    Err(AppError::Validation("not implemented".into()))
}
