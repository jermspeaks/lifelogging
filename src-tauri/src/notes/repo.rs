#![allow(dead_code)] // TODO(T11): implement note persistence and review queue queries.

use rusqlite::Connection;

use crate::error::AppResult;
use crate::notes::model::{NewNote, Note, NotePatch, ReviewAction, ReviewQueue};

pub fn list(
    _conn: &Connection,
    _query: Option<&str>,
    _include_archived: bool,
) -> AppResult<Vec<Note>> {
    unimplemented!()
}

pub fn create(_conn: &Connection, _input: &NewNote, _today: &str) -> AppResult<Note> {
    unimplemented!()
}

pub fn update(_conn: &Connection, _id: i64, _patch: &NotePatch) -> AppResult<Note> {
    unimplemented!()
}

pub fn review(
    _conn: &Connection,
    _id: i64,
    _today: &str,
    _action: ReviewAction,
) -> AppResult<Note> {
    unimplemented!()
}

pub fn set_archived(
    _conn: &Connection,
    _id: i64,
    _archived: bool,
    _today: &str,
) -> AppResult<Note> {
    unimplemented!()
}

pub fn delete(_conn: &Connection, _id: i64) -> AppResult<()> {
    unimplemented!()
}

pub fn queue(_conn: &Connection, _today: &str, _limit: i64) -> AppResult<ReviewQueue> {
    unimplemented!()
}
