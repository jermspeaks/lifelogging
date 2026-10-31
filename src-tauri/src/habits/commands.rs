//! Tauri commands (SPEC §7). Thin wrappers over `repo` + `logic`; bodies wired up in T5.
//! Arguments arrive camelCase from JS (`includeArchived`) and Tauri maps them to snake_case.

use tauri::State;

use super::model::{Habit, HabitPatch, NewHabit, TodayHabit};
use crate::db::Db;
use crate::error::{AppError, AppResult};

fn not_implemented<T>() -> AppResult<T> {
    Err(AppError::Validation("not implemented yet".into()))
}

#[tauri::command]
pub fn list_habits(db: State<'_, Db>, include_archived: bool) -> AppResult<Vec<Habit>> {
    let _ = (db, include_archived);
    not_implemented()
}

#[tauri::command]
pub fn get_habit(db: State<'_, Db>, id: i64) -> AppResult<Habit> {
    let _ = (db, id);
    not_implemented()
}

#[tauri::command]
pub fn create_habit(db: State<'_, Db>, input: NewHabit) -> AppResult<Habit> {
    let _ = (db, input);
    not_implemented()
}

#[tauri::command]
pub fn update_habit(db: State<'_, Db>, id: i64, patch: HabitPatch) -> AppResult<Habit> {
    let _ = (db, id, patch);
    not_implemented()
}

#[tauri::command]
pub fn archive_habit(db: State<'_, Db>, id: i64) -> AppResult<Habit> {
    let _ = (db, id);
    not_implemented()
}

#[tauri::command]
pub fn unarchive_habit(db: State<'_, Db>, id: i64) -> AppResult<Habit> {
    let _ = (db, id);
    not_implemented()
}

#[tauri::command]
pub fn delete_habit(db: State<'_, Db>, id: i64) -> AppResult<()> {
    let _ = (db, id);
    not_implemented()
}

#[tauri::command]
pub fn reorder_habits(db: State<'_, Db>, ids: Vec<i64>) -> AppResult<()> {
    let _ = (db, ids);
    not_implemented()
}

/// `date` and `today` are local `YYYY-MM-DD`; rejects `date > today`.
#[tauri::command]
pub fn set_habit_check(
    db: State<'_, Db>,
    habit_id: i64,
    date: String,
    today: String,
    done: bool,
) -> AppResult<TodayHabit> {
    let _ = (db, habit_id, date, today, done);
    not_implemented()
}

/// Active habits in order, with today's status, streak and last 7 days.
#[tauri::command]
pub fn get_today(db: State<'_, Db>, today: String) -> AppResult<Vec<TodayHabit>> {
    let _ = (db, today);
    not_implemented()
}
