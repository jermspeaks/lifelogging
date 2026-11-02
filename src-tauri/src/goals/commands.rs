use std::sync::MutexGuard;

use rusqlite::Connection;
use tauri::State;

use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::goals::model::{Goal, GoalPatch, GoalStatus, GoalSummary, NewGoal};
use crate::goals::repo;

fn lock<'a>(db: &'a State<'_, Db>) -> AppResult<MutexGuard<'a, Connection>> {
    db.0.lock()
        .map_err(|_| AppError::Database("database lock poisoned".into()))
}

#[tauri::command]
pub fn list_goals(
    db: State<'_, Db>,
    today: String,
    include_closed: bool,
) -> AppResult<Vec<GoalSummary>> {
    repo::list(&*lock(&db)?, &today, include_closed)
}

#[tauri::command]
pub fn create_goal(db: State<'_, Db>, input: NewGoal) -> AppResult<Goal> {
    repo::create(&*lock(&db)?, &input)
}

#[tauri::command]
pub fn update_goal(db: State<'_, Db>, id: i64, patch: GoalPatch) -> AppResult<Goal> {
    repo::update(&*lock(&db)?, id, &patch)
}

#[tauri::command]
pub fn set_goal_status(
    db: State<'_, Db>,
    id: i64,
    status: GoalStatus,
    today: String,
) -> AppResult<Goal> {
    repo::set_status(&*lock(&db)?, id, status, &today)
}

#[tauri::command]
pub fn delete_goal(db: State<'_, Db>, id: i64) -> AppResult<()> {
    repo::delete(&*lock(&db)?, id)
}

#[tauri::command]
pub fn reorder_goals(db: State<'_, Db>, ids: Vec<i64>) -> AppResult<()> {
    repo::reorder(&*lock(&db)?, &ids)
}

#[tauri::command]
pub fn log_goal_progress(
    db: State<'_, Db>,
    goal_id: i64,
    date: String,
    today: String,
    amount: f64,
) -> AppResult<GoalSummary> {
    repo::log_progress(&*lock(&db)?, goal_id, &date, &today, amount)
}
