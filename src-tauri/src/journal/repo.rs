use rusqlite::Connection;

use crate::error::AppResult;
use crate::journal::model::{JournalEntry, JournalSummary};

#[allow(dead_code)] // TODO(T7)
pub fn get(_conn: &Connection, _date: &str) -> AppResult<Option<JournalEntry>> {
    unimplemented!("TODO(T7): implement journal lookup")
}

#[allow(dead_code)] // TODO(T7)
pub fn save(_conn: &Connection, _date: &str, _body: &str) -> AppResult<Option<JournalEntry>> {
    unimplemented!("TODO(T7): implement journal save")
}

#[allow(dead_code)] // TODO(T7)
pub fn delete(_conn: &Connection, _date: &str) -> AppResult<()> {
    unimplemented!("TODO(T7): implement journal deletion")
}

#[allow(dead_code)] // TODO(T7)
pub fn list(
    _conn: &Connection,
    _query: Option<&str>,
    _before: Option<&str>,
    _limit: i64,
) -> AppResult<Vec<JournalSummary>> {
    unimplemented!("TODO(T7): implement journal listing")
}
