//! SQL for habits and checks. Implemented in T1 (see docs/PLAN.md).
#![allow(dead_code, unused_variables)] // TODO(T5): remove once commands call into the repo.

use std::collections::{HashMap, HashSet};

use chrono::NaiveDate;
use rusqlite::Connection;

use super::model::{Habit, HabitPatch, NewHabit};
use crate::error::AppResult;

/// Habits ordered by `sort_order`; archived habits only when `include_archived`.
pub fn list(conn: &Connection, include_archived: bool) -> AppResult<Vec<Habit>> {
    unimplemented!("T1")
}

/// `NotFound` if the id doesn't exist.
pub fn get(conn: &Connection, id: i64) -> AppResult<Habit> {
    unimplemented!("T1")
}

/// Validates input; new habits go to the end (`sort_order = max + 1`).
pub fn create(conn: &Connection, input: &NewHabit) -> AppResult<Habit> {
    unimplemented!("T1")
}

/// Applies only the fields present in `patch`; bumps `updated_at`.
pub fn update(conn: &Connection, id: i64, patch: &HabitPatch) -> AppResult<Habit> {
    unimplemented!("T1")
}

/// Archive (sets `archived_at`) or unarchive (clears it and moves the habit to the end).
pub fn set_archived(conn: &Connection, id: i64, archived: bool) -> AppResult<Habit> {
    unimplemented!("T1")
}

/// Permanently deletes the habit; checks cascade.
pub fn delete(conn: &Connection, id: i64) -> AppResult<()> {
    unimplemented!("T1")
}

/// `ids` must be exactly the set of active habit ids; runs in a transaction.
pub fn reorder(conn: &Connection, ids: &[i64]) -> AppResult<()> {
    unimplemented!("T1")
}

/// Idempotent check / un-check of `habit_id` on `date`.
pub fn set_check(conn: &Connection, habit_id: i64, date: NaiveDate, done: bool) -> AppResult<()> {
    unimplemented!("T1")
}

/// Checked dates per habit within `from..=to` (inclusive).
pub fn checks_between(
    conn: &Connection,
    habit_ids: &[i64],
    from: NaiveDate,
    to: NaiveDate,
) -> AppResult<HashMap<i64, HashSet<NaiveDate>>> {
    unimplemented!("T1")
}
