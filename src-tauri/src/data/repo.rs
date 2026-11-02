use rusqlite::Connection;

use crate::data::model::{DataInfo, ExportResult};
use crate::error::AppResult;

#[allow(dead_code)] // TODO(T15)
pub fn info(_conn: &Connection, _db_path: &std::path::Path) -> AppResult<DataInfo> {
    unimplemented!("TODO(T15): implement database info")
}

#[allow(dead_code)] // TODO(T15)
pub fn export_database(_conn: &Connection, _path: &std::path::Path) -> AppResult<ExportResult> {
    unimplemented!("TODO(T15): implement SQLite snapshot")
}

#[allow(dead_code)] // TODO(T15)
pub fn export_json(_conn: &mut Connection, _path: &std::path::Path) -> AppResult<ExportResult> {
    unimplemented!("TODO(T15): implement generic JSON export")
}
