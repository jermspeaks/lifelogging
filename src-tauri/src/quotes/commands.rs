use crate::error::{AppError, AppResult};
use crate::quotes::model::{ImportQuotesResult, NewQuote, Quote, QuotePatch};

fn not_implemented<T>() -> AppResult<T> {
    Err(AppError::Validation("not implemented".into()))
}

#[tauri::command]
pub fn list_quotes() -> AppResult<Vec<Quote>> {
    not_implemented()
}

#[tauri::command]
pub fn create_quote(input: NewQuote) -> AppResult<Quote> {
    let _ = input;
    not_implemented()
}

#[tauri::command]
pub fn update_quote(id: i64, patch: QuotePatch) -> AppResult<Quote> {
    let _ = (id, patch);
    not_implemented()
}

#[tauri::command]
pub fn delete_quote(id: i64) -> AppResult<()> {
    let _ = id;
    not_implemented()
}

#[tauri::command]
pub fn import_quotes(text: String) -> AppResult<ImportQuotesResult> {
    let _ = text;
    not_implemented()
}

#[tauri::command]
pub fn get_daily_quote(today: String) -> AppResult<Option<Quote>> {
    let _ = today;
    not_implemented()
}
