use std::sync::MutexGuard;

use rusqlite::Connection;
use tauri::State;

use crate::data::model::{DataInfo, ExportResult};
use crate::data::repo;
use crate::db::{Db, DbPath};
use crate::error::{AppError, AppResult};

fn lock<'a>(db: &'a State<'_, Db>) -> AppResult<MutexGuard<'a, Connection>> {
    db.0.lock()
        .map_err(|_| AppError::Database("database lock poisoned".into()))
}

#[tauri::command]
pub fn get_data_info(db: State<'_, Db>, db_path: State<'_, DbPath>) -> AppResult<DataInfo> {
    let connection = lock(&db)?;
    repo::info(&connection, &db_path.0)
}

#[tauri::command]
pub fn export_database(
    db: State<'_, Db>,
    db_path: State<'_, DbPath>,
    path: String,
) -> AppResult<ExportResult> {
    let connection = lock(&db)?;
    repo::export_database(&connection, std::path::Path::new(&path), &db_path.0)
}

#[tauri::command]
pub fn export_json(
    db: State<'_, Db>,
    db_path: State<'_, DbPath>,
    path: String,
) -> AppResult<ExportResult> {
    let mut connection = lock(&db)?;
    repo::export_json(&mut connection, std::path::Path::new(&path), &db_path.0)
}
