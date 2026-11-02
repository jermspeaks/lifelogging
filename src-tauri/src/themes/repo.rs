use rusqlite::Connection;

use crate::error::AppResult;
use crate::themes::model::{AnnualTheme, ThemeInput};

#[allow(dead_code)] // TODO(T9)
pub fn list(_conn: &Connection) -> AppResult<Vec<AnnualTheme>> {
    unimplemented!("TODO(T9): implement theme listing")
}

#[allow(dead_code)] // TODO(T9)
pub fn get(_conn: &Connection, _year: i32) -> AppResult<Option<AnnualTheme>> {
    unimplemented!("TODO(T9): implement theme lookup")
}

#[allow(dead_code)] // TODO(T9)
pub fn set(_conn: &Connection, _year: i32, _input: &ThemeInput) -> AppResult<AnnualTheme> {
    unimplemented!("TODO(T9): implement theme upsert")
}

#[allow(dead_code)] // TODO(T9)
pub fn delete(_conn: &Connection, _year: i32) -> AppResult<()> {
    unimplemented!("TODO(T9): implement theme deletion")
}
