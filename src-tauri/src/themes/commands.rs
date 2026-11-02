use std::sync::MutexGuard;

use rusqlite::Connection;
use tauri::State;

use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::themes::model::{AnnualTheme, ThemeInput};
use crate::themes::repo;

fn lock<'a>(db: &'a State<'_, Db>) -> AppResult<MutexGuard<'a, Connection>> {
    db.0.lock()
        .map_err(|_| AppError::Database("database lock poisoned".into()))
}

#[tauri::command]
pub fn list_themes(db: State<'_, Db>) -> AppResult<Vec<AnnualTheme>> {
    repo::list(&*lock(&db)?)
}

#[tauri::command]
pub fn get_theme(db: State<'_, Db>, year: i32) -> AppResult<Option<AnnualTheme>> {
    repo::get(&*lock(&db)?, year)
}

#[tauri::command]
pub fn set_theme(db: State<'_, Db>, year: i32, input: ThemeInput) -> AppResult<AnnualTheme> {
    repo::set(&*lock(&db)?, year, &input)
}

#[tauri::command]
pub fn delete_theme(db: State<'_, Db>, year: i32) -> AppResult<()> {
    repo::delete(&*lock(&db)?, year)
}
