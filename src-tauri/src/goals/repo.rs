//! SQL persistence for goals and per-day numeric progress (SPEC §19).

use std::collections::HashSet;

use chrono::{SecondsFormat, Utc};
use rusqlite::{Connection, OptionalExtension, Row, params};

use crate::error::{AppError, AppResult};
use crate::goals::logic;
use crate::goals::model::{Goal, GoalPatch, GoalStatus, GoalSummary, NewGoal};

const TITLE_MAX: usize = 120;
const DESCRIPTION_MAX: usize = 1_000;
const UNIT_MAX: usize = 20;
const GOAL_COLUMNS: &str = "g.id, g.title, g.description, g.target_value, g.unit, g.due_date, \
    g.status, g.closed_on, g.sort_order, g.created_at, g.updated_at";

fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn normalize_optional(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn validate(
    title: &str,
    description: Option<&str>,
    target_value: Option<f64>,
    unit: Option<&str>,
    due_date: Option<&str>,
) -> AppResult<()> {
    let title_len = title.chars().count();
    if title_len == 0 || title_len > TITLE_MAX {
        return Err(AppError::Validation(format!(
            "Title must be 1–{TITLE_MAX} characters."
        )));
    }
    if description.is_some_and(|value| value.chars().count() > DESCRIPTION_MAX) {
        return Err(AppError::Validation(format!(
            "Description must be at most {DESCRIPTION_MAX} characters."
        )));
    }
    if let Some(target) = target_value
        && (!target.is_finite() || target <= 0.0)
    {
        return Err(AppError::Validation(
            "Target must be a finite number greater than 0.".into(),
        ));
    }
    if unit.is_some_and(|value| value.chars().count() > UNIT_MAX) {
        return Err(AppError::Validation(format!(
            "Unit must be at most {UNIT_MAX} characters."
        )));
    }
    if target_value.is_none() && unit.is_some() {
        return Err(AppError::Validation(
            "A unit can only be set for a numeric goal.".into(),
        ));
    }
    if let Some(date) = due_date {
        logic::parse_date(date)?;
    }
    Ok(())
}

fn row_to_goal(row: &Row<'_>) -> rusqlite::Result<Goal> {
    let status: String = row.get("status")?;
    let status = match status.as_str() {
        "active" => GoalStatus::Active,
        "completed" => GoalStatus::Completed,
        "abandoned" => GoalStatus::Abandoned,
        _ => {
            return Err(rusqlite::Error::FromSqlConversionFailure(
                6,
                rusqlite::types::Type::Text,
                format!("unknown goal status {status:?}").into(),
            ));
        }
    };
    Ok(Goal {
        id: row.get("id")?,
        title: row.get("title")?,
        description: row.get("description")?,
        target_value: row.get("target_value")?,
        unit: row.get("unit")?,
        due_date: row.get("due_date")?,
        status,
        closed_on: row.get("closed_on")?,
        sort_order: row.get("sort_order")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn not_found(id: i64) -> AppError {
    AppError::NotFound(format!("Goal {id} not found."))
}

fn get(conn: &Connection, id: i64) -> AppResult<Goal> {
    conn.query_row(
        &format!("SELECT {GOAL_COLUMNS} FROM goals g WHERE g.id = ?1"),
        [id],
        row_to_goal,
    )
    .optional()?
    .ok_or_else(|| not_found(id))
}

fn next_sort_order(conn: &Connection) -> AppResult<i64> {
    Ok(conn.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM goals WHERE status = 'active'",
        [],
        |row| row.get(0),
    )?)
}

/// One grouped query returns goal rows alongside total and today's progress aggregates.
pub fn list(conn: &Connection, today: &str, include_closed: bool) -> AppResult<Vec<GoalSummary>> {
    logic::parse_date(today)?;
    let mut stmt = conn.prepare(&format!(
        "SELECT {GOAL_COLUMNS},
                COALESCE(SUM(p.amount), 0.0) AS current,
                COALESCE(SUM(CASE WHEN p.date = ?1 THEN p.amount ELSE 0.0 END), 0.0) AS today_amount
         FROM goals g
         LEFT JOIN goal_progress p ON p.goal_id = g.id
         {}
         GROUP BY g.id
         ORDER BY CASE WHEN g.status = 'active' THEN 0 ELSE 1 END,
                  CASE WHEN g.status = 'active' THEN g.sort_order END,
                  CASE WHEN g.status <> 'active' THEN g.closed_on END DESC,
                  g.id",
        if include_closed {
            ""
        } else {
            "WHERE g.status = 'active'"
        }
    ))?;
    let rows = stmt.query_map([today], |row| {
        let goal = row_to_goal(row)?;
        let current: f64 = row.get("current")?;
        let today_amount: f64 = row.get("today_amount")?;
        Ok((goal, current, today_amount))
    })?;

    rows.map(|result| {
        let (goal, current, today_amount) = result?;
        let percent = logic::percent(current, goal.target_value);
        let days_left =
            logic::days_left(goal.due_date.as_deref(), today).map_err(|error| match error {
                AppError::Validation(message) => rusqlite::Error::FromSqlConversionFailure(
                    5,
                    rusqlite::types::Type::Text,
                    message.into(),
                ),
                _ => rusqlite::Error::InvalidQuery,
            })?;
        Ok(GoalSummary {
            goal,
            current,
            today_amount,
            percent,
            days_left,
        })
    })
    .collect::<rusqlite::Result<Vec<_>>>()
    .map_err(AppError::from)
}

pub fn create(conn: &Connection, input: &NewGoal) -> AppResult<Goal> {
    let title = input.title.trim();
    let description = normalize_optional(input.description.as_deref());
    let target_value = input.target_value;
    let unit = normalize_optional(input.unit.as_deref());
    let due_date = normalize_optional(input.due_date.as_deref());
    validate(
        title,
        description.as_deref(),
        target_value,
        unit.as_deref(),
        due_date.as_deref(),
    )?;

    let timestamp = now();
    conn.execute(
        "INSERT INTO goals (title, description, target_value, unit, due_date, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        params![title, description, target_value, unit, due_date, next_sort_order(conn)?, timestamp],
    )?;
    get(conn, conn.last_insert_rowid())
}

/// Applies only fields supplied by the patch. `Some(None)` for target is a milestone conversion.
pub fn update(conn: &Connection, id: i64, patch: &GoalPatch) -> AppResult<Goal> {
    let current = get(conn, id)?;
    let title = patch
        .title
        .as_deref()
        .map(str::trim)
        .unwrap_or(&current.title)
        .to_owned();
    let description = patch
        .description
        .as_deref()
        .map(|value| normalize_optional(Some(value)))
        .unwrap_or(current.description);
    let target_value = patch.target_value.unwrap_or(current.target_value);
    let unit = if matches!(patch.target_value, Some(None)) {
        None
    } else {
        patch
            .unit
            .as_deref()
            .map(|value| normalize_optional(Some(value)))
            .unwrap_or(current.unit)
    };
    let due_date = patch
        .due_date
        .as_deref()
        .map(|value| normalize_optional(Some(value)))
        .unwrap_or(current.due_date);

    validate(
        &title,
        description.as_deref(),
        target_value,
        unit.as_deref(),
        due_date.as_deref(),
    )?;
    conn.execute(
        "UPDATE goals SET title = ?1, description = ?2, target_value = ?3, unit = ?4,
             due_date = ?5, updated_at = ?6 WHERE id = ?7",
        params![title, description, target_value, unit, due_date, now(), id],
    )?;
    get(conn, id)
}

pub fn set_status(conn: &Connection, id: i64, status: GoalStatus, today: &str) -> AppResult<Goal> {
    let today = logic::parse_date(today)?.format("%Y-%m-%d").to_string();
    let current = get(conn, id)?;
    let status_value = match status {
        GoalStatus::Active => "active",
        GoalStatus::Completed => "completed",
        GoalStatus::Abandoned => "abandoned",
    };
    if status == GoalStatus::Active {
        let order = if current.status == GoalStatus::Active {
            current.sort_order
        } else {
            next_sort_order(conn)?
        };
        conn.execute(
            "UPDATE goals SET status = 'active', closed_on = NULL, sort_order = ?1, updated_at = ?2 WHERE id = ?3",
            params![order, now(), id],
        )?;
    } else {
        conn.execute(
            "UPDATE goals SET status = ?1, closed_on = ?2, updated_at = ?2 WHERE id = ?3",
            params![status_value, today, id],
        )?;
    }
    get(conn, id)
}

pub fn delete(conn: &Connection, id: i64) -> AppResult<()> {
    if conn.execute("DELETE FROM goals WHERE id = ?1", [id])? == 0 {
        return Err(not_found(id));
    }
    Ok(())
}

/// `ids` must contain every active goal exactly once; closed goals cannot be reordered.
pub fn reorder(conn: &Connection, ids: &[i64]) -> AppResult<()> {
    let tx = conn.unchecked_transaction()?;
    let requested: HashSet<i64> = ids.iter().copied().collect();
    if requested.len() != ids.len() {
        return Err(AppError::Validation(
            "Reorder list contains duplicate ids.".into(),
        ));
    }
    let active: HashSet<i64> = {
        let mut stmt = tx.prepare("SELECT id FROM goals WHERE status = 'active'")?;
        stmt.query_map([], |row| row.get(0))?
            .collect::<rusqlite::Result<_>>()?
    };
    if requested != active {
        return Err(AppError::Validation(
            "Reorder list must contain exactly the active goals.".into(),
        ));
    }
    {
        let mut stmt = tx.prepare("UPDATE goals SET sort_order = ?1 WHERE id = ?2")?;
        for (position, id) in ids.iter().enumerate() {
            stmt.execute(params![position as i64, id])?;
        }
    }
    tx.commit()?;
    Ok(())
}

/// Set or replace one day's amount. Zero removes the date's row.
pub fn log_progress(
    conn: &Connection,
    goal_id: i64,
    date: &str,
    today: &str,
    amount: f64,
) -> AppResult<GoalSummary> {
    let date_value = logic::parse_date(date)?;
    let today_value = logic::parse_date(today)?;
    if date_value > today_value {
        return Err(AppError::Validation(
            "Progress date cannot be in the future.".into(),
        ));
    }
    if !amount.is_finite() || amount < 0.0 {
        return Err(AppError::Validation(
            "Progress amount must be finite and at least 0.".into(),
        ));
    }
    let goal = get(conn, goal_id)?;
    if goal.status != GoalStatus::Active {
        return Err(AppError::Validation(
            "Cannot log progress for a closed goal.".into(),
        ));
    }
    if goal.target_value.is_none() {
        return Err(AppError::Validation(
            "Milestone goals do not track numeric progress.".into(),
        ));
    }

    let timestamp = now();
    let date = date_value.format("%Y-%m-%d").to_string();
    if amount == 0.0 {
        conn.execute(
            "DELETE FROM goal_progress WHERE goal_id = ?1 AND date = ?2",
            params![goal_id, date],
        )?;
    } else {
        conn.execute(
            "INSERT INTO goal_progress (goal_id, date, amount, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?4)
             ON CONFLICT(goal_id, date) DO UPDATE SET amount = excluded.amount, updated_at = excluded.updated_at",
            params![goal_id, date, amount, timestamp],
        )?;
    }
    list(conn, today, false)?
        .into_iter()
        .find(|summary| summary.goal.id == goal_id)
        .ok_or_else(|| AppError::Database("goal disappeared after progress update".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        crate::db::open_in_memory().unwrap()
    }

    fn numeric_goal(title: &str) -> NewGoal {
        NewGoal {
            title: title.into(),
            description: None,
            target_value: Some(24.0),
            unit: Some("books".into()),
            due_date: Some("2026-12-31".into()),
        }
    }

    fn milestone(title: &str) -> NewGoal {
        NewGoal {
            title: title.into(),
            description: None,
            target_value: None,
            unit: None,
            due_date: None,
        }
    }

    #[test]
    fn create_normalizes_fields_and_assigns_active_order() {
        let conn = db();
        let first = create(
            &conn,
            &NewGoal {
                title: "  Read 24 books  ".into(),
                description: Some("  Keep a list  ".into()),
                ..numeric_goal("unused")
            },
        )
        .unwrap();
        let second = create(&conn, &milestone("Run a half marathon")).unwrap();
        assert_eq!(first.title, "Read 24 books");
        assert_eq!(first.description.as_deref(), Some("Keep a list"));
        assert_eq!(first.sort_order, 0);
        assert_eq!(second.sort_order, 1);
    }

    #[test]
    fn create_rejects_invalid_title_target_unit_and_date() {
        let conn = db();
        for input in [
            NewGoal {
                title: "  ".into(),
                ..milestone("unused")
            },
            NewGoal {
                title: "x".repeat(TITLE_MAX + 1),
                ..milestone("unused")
            },
            NewGoal {
                target_value: Some(0.0),
                unit: Some("books".into()),
                ..numeric_goal("x")
            },
            NewGoal {
                target_value: Some(f64::INFINITY),
                ..numeric_goal("x")
            },
            NewGoal {
                target_value: None,
                unit: Some("steps".into()),
                ..milestone("x")
            },
            NewGoal {
                due_date: Some("2026-02-30".into()),
                ..milestone("x")
            },
        ] {
            assert!(matches!(
                create(&conn, &input),
                Err(AppError::Validation(_))
            ));
        }
    }

    #[test]
    fn list_aggregates_progress_and_orders_active_before_closed() {
        let conn = db();
        let first = create(&conn, &numeric_goal("Read")).unwrap();
        let second = create(&conn, &numeric_goal("Exercise")).unwrap();
        log_progress(&conn, first.id, "2026-10-31", "2026-10-31", 5.0).unwrap();
        log_progress(&conn, first.id, "2026-10-30", "2026-10-31", 3.0).unwrap();
        set_status(&conn, first.id, GoalStatus::Completed, "2026-10-31").unwrap();

        let active = list(&conn, "2026-10-31", false).unwrap();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].goal.id, second.id);
        let all = list(&conn, "2026-10-31", true).unwrap();
        assert_eq!(all[0].goal.id, second.id);
        assert_eq!(all[1].goal.id, first.id);
        assert_eq!(all[1].current, 8.0);
        assert_eq!(all[1].today_amount, 5.0);
        assert_eq!(all[1].percent, Some(33));
        assert_eq!(all[1].days_left, Some(61));
    }

    #[test]
    fn update_supports_double_option_and_clears_unit_on_milestone_conversion() {
        let conn = db();
        let goal = create(&conn, &numeric_goal("Read")).unwrap();
        log_progress(&conn, goal.id, "2026-10-31", "2026-10-31", 2.0).unwrap();

        let unchanged = update(&conn, goal.id, &GoalPatch::default()).unwrap();
        assert_eq!(unchanged.target_value, Some(24.0));
        let to_milestone: GoalPatch =
            serde_json::from_value(serde_json::json!({"targetValue": null})).unwrap();
        let updated = update(&conn, goal.id, &to_milestone).unwrap();
        assert_eq!(updated.target_value, None);
        assert_eq!(updated.unit, None);
        assert_eq!(list(&conn, "2026-10-31", false).unwrap()[0].current, 2.0);

        let to_numeric: GoalPatch =
            serde_json::from_value(serde_json::json!({"targetValue": 10})).unwrap();
        assert_eq!(
            update(&conn, goal.id, &to_numeric).unwrap().target_value,
            Some(10.0)
        );
    }

    #[test]
    fn progress_replaces_existing_amount_zero_deletes_and_rejects_bad_inputs() {
        let conn = db();
        let goal = create(&conn, &numeric_goal("Read")).unwrap();
        log_progress(&conn, goal.id, "2026-10-31", "2026-10-31", 2.0).unwrap();
        let replaced = log_progress(&conn, goal.id, "2026-10-31", "2026-10-31", 4.0).unwrap();
        assert_eq!(replaced.current, 4.0);
        assert_eq!(replaced.today_amount, 4.0);
        let deleted = log_progress(&conn, goal.id, "2026-10-31", "2026-10-31", 0.0).unwrap();
        assert_eq!(deleted.current, 0.0);
        for (date, today, amount) in [
            ("2026-11-01", "2026-10-31", 1.0),
            ("invalid", "2026-10-31", 1.0),
            ("2026-10-31", "2026-10-31", -1.0),
            ("2026-10-31", "2026-10-31", f64::NAN),
        ] {
            assert!(matches!(
                log_progress(&conn, goal.id, date, today, amount),
                Err(AppError::Validation(_))
            ));
        }
    }

    #[test]
    fn progress_rejects_milestones_and_closed_goals() {
        let conn = db();
        let milestone = create(&conn, &milestone("Run a half marathon")).unwrap();
        assert!(matches!(
            log_progress(&conn, milestone.id, "2026-10-31", "2026-10-31", 1.0),
            Err(AppError::Validation(_))
        ));
        let numeric = create(&conn, &numeric_goal("Read")).unwrap();
        set_status(&conn, numeric.id, GoalStatus::Abandoned, "2026-10-31").unwrap();
        assert!(matches!(
            log_progress(&conn, numeric.id, "2026-10-31", "2026-10-31", 1.0),
            Err(AppError::Validation(_))
        ));
    }

    #[test]
    fn status_reopen_moves_to_end_and_delete_cascades_history() {
        let conn = db();
        let first = create(&conn, &numeric_goal("First")).unwrap();
        let second = create(&conn, &numeric_goal("Second")).unwrap();
        log_progress(&conn, first.id, "2026-10-31", "2026-10-31", 1.0).unwrap();
        let closed = set_status(&conn, first.id, GoalStatus::Completed, "2026-10-31").unwrap();
        assert_eq!(closed.closed_on.as_deref(), Some("2026-10-31"));
        let reopened = set_status(&conn, first.id, GoalStatus::Active, "2026-11-01").unwrap();
        assert_eq!(reopened.closed_on, None);
        let active = list(&conn, "2026-11-01", false).unwrap();
        assert_eq!(
            active.iter().map(|row| row.goal.id).collect::<Vec<_>>(),
            [second.id, first.id]
        );
        delete(&conn, first.id).unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM goal_progress WHERE goal_id = ?1",
                [first.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn reorder_requires_exact_active_id_set_and_delete_requires_existing_goal() {
        let conn = db();
        let one = create(&conn, &milestone("One")).unwrap();
        let two = create(&conn, &milestone("Two")).unwrap();
        assert!(matches!(
            reorder(&conn, &[one.id, one.id]),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            reorder(&conn, &[one.id]),
            Err(AppError::Validation(_))
        ));
        reorder(&conn, &[two.id, one.id]).unwrap();
        assert_eq!(list(&conn, "2026-10-31", false).unwrap()[0].goal.id, two.id);
        set_status(&conn, two.id, GoalStatus::Abandoned, "2026-10-31").unwrap();
        assert!(matches!(
            reorder(&conn, &[two.id, one.id]),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(delete(&conn, 999), Err(AppError::NotFound(_))));
    }
}
