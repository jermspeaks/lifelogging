use std::sync::MutexGuard;

use rusqlite::Connection;
use tauri::State;

use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::reminders::model::{NewReminder, Reminder, ReminderPatch};
use crate::reminders::repo;

fn lock<'a>(db: &'a State<'_, Db>) -> AppResult<MutexGuard<'a, Connection>> {
    db.0.lock()
        .map_err(|_| AppError::Database("database lock poisoned".into()))
}

#[tauri::command]
pub fn list_reminders(
    db: State<'_, Db>,
    today: String,
    include_completed: bool,
) -> AppResult<Vec<Reminder>> {
    repo::list(&*lock(&db)?, &today, include_completed)
}

#[tauri::command]
pub fn get_due_reminders(db: State<'_, Db>, today: String) -> AppResult<Vec<Reminder>> {
    repo::due(&*lock(&db)?, &today)
}

#[tauri::command]
pub fn create_reminder(db: State<'_, Db>, input: NewReminder) -> AppResult<Reminder> {
    repo::create(&*lock(&db)?, &input)
}

#[tauri::command]
pub fn update_reminder(db: State<'_, Db>, id: i64, patch: ReminderPatch) -> AppResult<Reminder> {
    repo::update(&*lock(&db)?, id, &patch)
}

#[tauri::command]
pub fn set_reminder_done(
    db: State<'_, Db>,
    id: i64,
    today: String,
    done: bool,
) -> AppResult<Reminder> {
    repo::set_done(&*lock(&db)?, id, &today, done)
}

#[tauri::command]
pub fn delete_reminder(db: State<'_, Db>, id: i64) -> AppResult<()> {
    repo::delete(&*lock(&db)?, id)
}
