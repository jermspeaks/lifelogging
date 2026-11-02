//! Synchronous Tauri wrappers for quote persistence (SPEC §15).

use std::sync::MutexGuard;

use chrono::NaiveDate;
use rusqlite::Connection;
use tauri::State;

use crate::dates::parse_date;
use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::quotes::model::{ImportQuotesResult, NewQuote, Quote, QuotePatch};

use super::repo;

fn lock<'a>(db: &'a State<'_, Db>) -> AppResult<MutexGuard<'a, Connection>> {
    db.0.lock()
        .map_err(|_| AppError::Database("database lock poisoned".into()))
}

#[tauri::command]
pub fn list_quotes(db: State<'_, Db>) -> AppResult<Vec<Quote>> {
    repo::list(&*lock(&db)?)
}

#[tauri::command]
pub fn create_quote(db: State<'_, Db>, input: NewQuote) -> AppResult<Quote> {
    repo::create(&*lock(&db)?, &input)
}

#[tauri::command]
pub fn update_quote(db: State<'_, Db>, id: i64, patch: QuotePatch) -> AppResult<Quote> {
    repo::update(&*lock(&db)?, id, &patch)
}

#[tauri::command]
pub fn delete_quote(db: State<'_, Db>, id: i64) -> AppResult<()> {
    repo::delete(&*lock(&db)?, id)
}

#[tauri::command]
pub fn import_quotes(db: State<'_, Db>, text: String) -> AppResult<ImportQuotesResult> {
    let mut connection = lock(&db)?;
    repo::import(&mut connection, &text)
}

#[tauri::command]
pub fn get_daily_quote(db: State<'_, Db>, today: String) -> AppResult<Option<Quote>> {
    let date: NaiveDate = parse_date(&today)?;

    repo::daily(&*lock(&db)?, date)
}
