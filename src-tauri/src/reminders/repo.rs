#![allow(dead_code)] // TODO(T12): implement reminder persistence.

use rusqlite::Connection;

use crate::error::AppResult;
use crate::reminders::model::{NewReminder, Reminder, ReminderPatch};

pub fn list(
    _conn: &Connection,
    _today: &str,
    _include_completed: bool,
) -> AppResult<Vec<Reminder>> {
    unimplemented!()
}

pub fn due(_conn: &Connection, _today: &str) -> AppResult<Vec<Reminder>> {
    unimplemented!()
}

pub fn create(_conn: &Connection, _input: &NewReminder) -> AppResult<Reminder> {
    unimplemented!()
}

pub fn update(_conn: &Connection, _id: i64, _patch: &ReminderPatch) -> AppResult<Reminder> {
    unimplemented!()
}

pub fn set_done(_conn: &Connection, _id: i64, _today: &str, _done: bool) -> AppResult<Reminder> {
    unimplemented!()
}

pub fn delete(_conn: &Connection, _id: i64) -> AppResult<()> {
    unimplemented!()
}
