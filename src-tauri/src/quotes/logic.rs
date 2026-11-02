use chrono::NaiveDate;

use crate::error::AppResult;
use crate::quotes::model::NewQuote;

#[allow(dead_code)] // TODO(T10)
pub fn validate_quote(_input: &NewQuote) -> AppResult<()> {
    unimplemented!("TODO(T10): implement quote validation")
}

#[allow(dead_code)] // TODO(T10)
pub fn daily_index(_date: NaiveDate, _count: usize) -> Option<usize> {
    unimplemented!("TODO(T10): implement deterministic daily quote selection")
}

#[allow(dead_code)] // TODO(T10)
pub fn parse_import(_text: &str) -> AppResult<Vec<NewQuote>> {
    unimplemented!("TODO(T10): implement quote import parser")
}
