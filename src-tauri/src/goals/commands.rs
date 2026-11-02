use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::goals::model::{Goal, GoalPatch, GoalStatus, GoalSummary, NewGoal};
use tauri::State;

#[tauri::command]
pub fn list_goals(
    _db: State<'_, Db>,
    _today: String,
    _include_closed: bool,
) -> AppResult<Vec<GoalSummary>> {
    Err(AppError::Validation("not implemented".into()))
}

#[tauri::command]
pub fn create_goal(_db: State<'_, Db>, _input: NewGoal) -> AppResult<Goal> {
    Err(AppError::Validation("not implemented".into()))
}

#[tauri::command]
pub fn update_goal(_db: State<'_, Db>, _id: i64, _patch: GoalPatch) -> AppResult<Goal> {
    Err(AppError::Validation("not implemented".into()))
}

#[tauri::command]
pub fn set_goal_status(
    _db: State<'_, Db>,
    _id: i64,
    _status: GoalStatus,
    _today: String,
) -> AppResult<Goal> {
    Err(AppError::Validation("not implemented".into()))
}

#[tauri::command]
pub fn delete_goal(_db: State<'_, Db>, _id: i64) -> AppResult<()> {
    Err(AppError::Validation("not implemented".into()))
}

#[tauri::command]
pub fn reorder_goals(_db: State<'_, Db>, _ids: Vec<i64>) -> AppResult<()> {
    Err(AppError::Validation("not implemented".into()))
}

#[tauri::command]
pub fn log_goal_progress(
    _db: State<'_, Db>,
    _goal_id: i64,
    _date: String,
    _today: String,
    _amount: f64,
) -> AppResult<GoalSummary> {
    Err(AppError::Validation("not implemented".into()))
}
