#![allow(dead_code)] // TODO(T14): implement goal and daily-progress persistence.

use rusqlite::Connection;

use crate::error::AppResult;
use crate::goals::model::{Goal, GoalPatch, GoalStatus, GoalSummary, NewGoal};

pub fn list(
    _conn: &Connection,
    _today: &str,
    _include_closed: bool,
) -> AppResult<Vec<GoalSummary>> {
    unimplemented!()
}

pub fn create(_conn: &Connection, _input: &NewGoal) -> AppResult<Goal> {
    unimplemented!()
}

pub fn update(_conn: &Connection, _id: i64, _patch: &GoalPatch) -> AppResult<Goal> {
    unimplemented!()
}

pub fn set_status(
    _conn: &Connection,
    _id: i64,
    _status: GoalStatus,
    _today: &str,
) -> AppResult<Goal> {
    unimplemented!()
}

pub fn delete(_conn: &Connection, _id: i64) -> AppResult<()> {
    unimplemented!()
}

pub fn reorder(_conn: &Connection, _ids: &[i64]) -> AppResult<()> {
    unimplemented!()
}

pub fn log_progress(
    _conn: &Connection,
    _goal_id: i64,
    _date: &str,
    _today: &str,
    _amount: f64,
) -> AppResult<GoalSummary> {
    unimplemented!()
}
