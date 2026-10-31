//! Tauri commands (SPEC §7). Thin wrappers over `repo` + `logic`.
//! Arguments arrive camelCase from JS (`includeArchived`) and Tauri maps them to snake_case.

use std::collections::HashSet;
use std::sync::MutexGuard;

use chrono::{DateTime, Days, Local, NaiveDate};
use rusqlite::Connection;
use tauri::State;

use super::logic;
use super::model::{Habit, HabitPatch, NewHabit, TodayHabit};
use super::repo;
use crate::db::Db;
use crate::error::{AppError, AppResult};

/// Days shown in the Today strip (SPEC §6 rule 5).
const STRIP_DAYS: u32 = 7;

fn lock<'a>(db: &'a State<'_, Db>) -> AppResult<MutexGuard<'a, Connection>> {
    db.0.lock()
        .map_err(|_| AppError::Database("database lock poisoned".into()))
}

#[tauri::command]
pub fn list_habits(db: State<'_, Db>, include_archived: bool) -> AppResult<Vec<Habit>> {
    repo::list(&*lock(&db)?, include_archived)
}

#[tauri::command]
pub fn get_habit(db: State<'_, Db>, id: i64) -> AppResult<Habit> {
    repo::get(&*lock(&db)?, id)
}

#[tauri::command]
pub fn create_habit(db: State<'_, Db>, input: NewHabit) -> AppResult<Habit> {
    repo::create(&*lock(&db)?, &input)
}

#[tauri::command]
pub fn update_habit(db: State<'_, Db>, id: i64, patch: HabitPatch) -> AppResult<Habit> {
    repo::update(&*lock(&db)?, id, &patch)
}

#[tauri::command]
pub fn archive_habit(db: State<'_, Db>, id: i64) -> AppResult<Habit> {
    repo::set_archived(&*lock(&db)?, id, true)
}

#[tauri::command]
pub fn unarchive_habit(db: State<'_, Db>, id: i64) -> AppResult<Habit> {
    repo::set_archived(&*lock(&db)?, id, false)
}

#[tauri::command]
pub fn delete_habit(db: State<'_, Db>, id: i64) -> AppResult<()> {
    repo::delete(&*lock(&db)?, id)
}

#[tauri::command]
pub fn reorder_habits(db: State<'_, Db>, ids: Vec<i64>) -> AppResult<()> {
    repo::reorder(&*lock(&db)?, &ids)
}

/// `date` and `today` are local `YYYY-MM-DD`; rejects `date > today`.
#[tauri::command]
pub fn set_habit_check(
    db: State<'_, Db>,
    habit_id: i64,
    date: String,
    today: String,
    done: bool,
) -> AppResult<TodayHabit> {
    set_check(&*lock(&db)?, habit_id, &date, &today, done)
}

/// Active habits in order, with today's status, streak and last 7 days.
#[tauri::command]
pub fn get_today(db: State<'_, Db>, today: String) -> AppResult<Vec<TodayHabit>> {
    today_habits(&*lock(&db)?, &today)
}

pub(crate) fn set_check(
    conn: &Connection,
    habit_id: i64,
    date: &str,
    today: &str,
    done: bool,
) -> AppResult<TodayHabit> {
    let date = logic::parse_date(date)?;
    let today = logic::parse_date(today)?;
    if date > today {
        return Err(AppError::Validation(
            "Can't check off a habit for a future date.".into(),
        ));
    }
    repo::set_check(conn, habit_id, date, done)?;
    let habit = repo::get(conn, habit_id)?;
    Ok(build_rows(conn, vec![habit], today)?.remove(0))
}

pub(crate) fn today_habits(conn: &Connection, today: &str) -> AppResult<Vec<TodayHabit>> {
    let today = logic::parse_date(today)?;
    build_rows(conn, repo::list(conn, false)?, today)
}

/// The calendar day a habit was created, in the machine's local time zone (the same zone the
/// webview uses for "today"). Using the UTC date would mark an evening-created habit's first
/// day as "before creation".
fn created_local_date(habit: &Habit) -> AppResult<NaiveDate> {
    DateTime::parse_from_rfc3339(&habit.created_at)
        .map(|ts| ts.with_timezone(&Local).date_naive())
        .map_err(|e| AppError::Database(format!("bad created_at for habit {}: {e}", habit.id)))
}

fn build_rows(
    conn: &Connection,
    habits: Vec<Habit>,
    today: NaiveDate,
) -> AppResult<Vec<TodayHabit>> {
    let created: Vec<NaiveDate> = habits
        .iter()
        .map(created_local_date)
        .collect::<AppResult<_>>()?;
    let strip_start = today
        .checked_sub_days(Days::new(u64::from(STRIP_DAYS - 1)))
        .unwrap_or(today);
    // Streaks never walk past creation, so one query from the earliest relevant day suffices.
    let from = created.iter().copied().fold(strip_start, NaiveDate::min);
    let ids: Vec<i64> = habits.iter().map(|h| h.id).collect();
    let mut checks = repo::checks_between(conn, &ids, from, today)?;

    Ok(habits
        .into_iter()
        .zip(created)
        .map(|(habit, created)| {
            let done: HashSet<NaiveDate> = checks.remove(&habit.id).unwrap_or_default();
            let days = habit.schedule_days;
            TodayHabit {
                scheduled_today: logic::is_scheduled(days, today),
                done_today: done.contains(&today),
                current_streak: logic::current_streak(days, created, today, &done),
                last7: logic::last_n_days(days, created, today, &done, STRIP_DAYS),
                habit,
            }
        })
        .collect())
}

/// End-to-end flow through the command layer against an in-memory database
/// (lives in-crate because the modules are private).
#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::error::ErrorKind;
    use crate::habits::model::DayStatus;

    fn new_habit(name: &str) -> NewHabit {
        NewHabit {
            name: name.into(),
            ..Default::default()
        }
    }

    fn local_today() -> NaiveDate {
        Local::now().date_naive()
    }

    fn iso(d: NaiveDate) -> String {
        d.format("%Y-%m-%d").to_string()
    }

    #[test]
    fn create_check_today_archive_delete() {
        let conn = db::open_in_memory().unwrap();
        let today = local_today();
        let read = repo::create(&conn, &new_habit("Read")).unwrap();
        let walk = repo::create(&conn, &new_habit("Walk")).unwrap();

        let rows = today_habits(&conn, &iso(today)).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].habit.id, read.id);
        assert!(rows[0].scheduled_today && !rows[0].done_today);
        assert_eq!(rows[0].last7.len(), 7);
        assert_eq!(rows[0].last7[6].status, DayStatus::Pending);
        // Habits created "today" (local) must not treat today as before-creation.
        assert_eq!(rows[0].last7[5].status, DayStatus::Skipped);

        let row = set_check(&conn, read.id, &iso(today), &iso(today), true).unwrap();
        assert!(row.done_today);
        assert_eq!(row.current_streak, 1);
        assert_eq!(row.last7[6].status, DayStatus::Done);

        let row = set_check(&conn, read.id, &iso(today), &iso(today), false).unwrap();
        assert!(!row.done_today);
        assert_eq!(row.current_streak, 0);

        repo::set_archived(&conn, walk.id, true).unwrap();
        let rows = today_habits(&conn, &iso(today)).unwrap();
        assert_eq!(
            rows.iter().map(|r| r.habit.id).collect::<Vec<_>>(),
            [read.id]
        );

        repo::delete(&conn, read.id).unwrap();
        assert!(today_habits(&conn, &iso(today)).unwrap().is_empty());
        let err = set_check(&conn, read.id, &iso(today), &iso(today), true).unwrap_err();
        assert!(matches!(err.kind(), ErrorKind::NotFound));
    }

    #[test]
    fn streak_counts_backfilled_days_since_creation() {
        let conn = db::open_in_memory().unwrap();
        let today = local_today();
        let habit = repo::create(&conn, &new_habit("Stretch")).unwrap();
        // Pretend the habit was created 10 days ago.
        let created = today - Days::new(10);
        conn.execute(
            "UPDATE habits SET created_at = ?1 WHERE id = ?2",
            rusqlite::params![
                created
                    .and_hms_opt(12, 0, 0)
                    .unwrap()
                    .and_local_timezone(Local)
                    .unwrap()
                    .to_rfc3339(),
                habit.id
            ],
        )
        .unwrap();
        for back in 1..=9 {
            set_check(
                &conn,
                habit.id,
                &iso(today - Days::new(back)),
                &iso(today),
                true,
            )
            .unwrap();
        }

        let rows = today_habits(&conn, &iso(today)).unwrap();
        assert_eq!(
            rows[0].current_streak, 9,
            "today pending does not break the streak"
        );
    }

    #[test]
    fn rejects_future_and_malformed_dates() {
        let conn = db::open_in_memory().unwrap();
        let today = local_today();
        let habit = repo::create(&conn, &new_habit("Read")).unwrap();

        let tomorrow = iso(today + Days::new(1));
        let err = set_check(&conn, habit.id, &tomorrow, &iso(today), true).unwrap_err();
        assert!(matches!(err.kind(), ErrorKind::Validation));

        let err = today_habits(&conn, "2026-2-1").unwrap_err();
        assert!(matches!(err.kind(), ErrorKind::Validation));
    }
}
