use crate::error::{AppError, AppResult};
use crate::themes::model::{AnnualTheme, ThemeInput};

fn not_implemented<T>() -> AppResult<T> {
    Err(AppError::Validation("not implemented".into()))
}

#[tauri::command]
pub fn list_themes() -> AppResult<Vec<AnnualTheme>> {
    not_implemented()
}

#[tauri::command]
pub fn get_theme(year: i32) -> AppResult<Option<AnnualTheme>> {
    let _ = year;
    not_implemented()
}

#[tauri::command]
pub fn set_theme(year: i32, input: ThemeInput) -> AppResult<AnnualTheme> {
    let _ = (year, input);
    not_implemented()
}

#[tauri::command]
pub fn delete_theme(year: i32) -> AppResult<()> {
    let _ = year;
    not_implemented()
}
