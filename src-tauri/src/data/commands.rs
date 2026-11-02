use crate::data::model::{DataInfo, ExportResult};
use crate::error::{AppError, AppResult};

fn not_implemented<T>() -> AppResult<T> {
    Err(AppError::Validation("not implemented".into()))
}

#[tauri::command]
pub fn get_data_info() -> AppResult<DataInfo> {
    not_implemented()
}

#[tauri::command]
pub fn export_database(path: String) -> AppResult<ExportResult> {
    let _ = path;
    not_implemented()
}

#[tauri::command]
pub fn export_json(path: String) -> AppResult<ExportResult> {
    let _ = path;
    not_implemented()
}
