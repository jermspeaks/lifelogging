use rusqlite::Connection;

use crate::error::AppResult;
use crate::quotes::model::{ImportQuotesResult, NewQuote, Quote, QuotePatch};

#[allow(dead_code)] // TODO(T10)
pub fn list(_conn: &Connection) -> AppResult<Vec<Quote>> {
    unimplemented!("TODO(T10): implement quote listing")
}

#[allow(dead_code)] // TODO(T10)
pub fn create(_conn: &Connection, _input: &NewQuote) -> AppResult<Quote> {
    unimplemented!("TODO(T10): implement quote creation")
}

#[allow(dead_code)] // TODO(T10)
pub fn update(_conn: &Connection, _id: i64, _patch: &QuotePatch) -> AppResult<Quote> {
    unimplemented!("TODO(T10): implement quote update")
}

#[allow(dead_code)] // TODO(T10)
pub fn delete(_conn: &Connection, _id: i64) -> AppResult<()> {
    unimplemented!("TODO(T10): implement quote deletion")
}

#[allow(dead_code)] // TODO(T10)
pub fn import(_conn: &mut Connection, _text: &str) -> AppResult<ImportQuotesResult> {
    unimplemented!("TODO(T10): implement transactional quote import")
}

#[allow(dead_code)] // TODO(T10)
pub fn daily(_conn: &Connection, _date: chrono::NaiveDate) -> AppResult<Option<Quote>> {
    unimplemented!("TODO(T10): implement daily quote lookup")
}
