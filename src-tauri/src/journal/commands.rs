use crate::error::{AppError, AppResult};
use crate::journal::model::{JournalEntry, JournalSummary};

fn not_implemented<T>() -> AppResult<T> {
    Err(AppError::Validation("not implemented".into()))
}

#[tauri::command]
pub fn get_journal_entry(date: String, today: String) -> AppResult<Option<JournalEntry>> {
    let _ = (date, today);
    not_implemented()
}

#[tauri::command]
pub fn save_journal_entry(
    date: String,
    today: String,
    body: String,
) -> AppResult<Option<JournalEntry>> {
    let _ = (date, today, body);
    not_implemented()
}

#[tauri::command]
pub fn delete_journal_entry(date: String) -> AppResult<()> {
    let _ = date;
    not_implemented()
}

#[tauri::command]
pub fn list_journal_entries(
    query: Option<String>,
    before: Option<String>,
    limit: Option<i64>,
) -> AppResult<Vec<JournalSummary>> {
    let _ = (query, before, limit);
    not_implemented()
}
