//! SQLite persistence for reminders (SPEC §17).

use chrono::{Days, NaiveDate};
use rusqlite::{Connection, OptionalExtension, Row, params};

use super::logic;
use super::model::{NewReminder, Reminder, ReminderPatch};
use crate::dates;
use crate::error::{AppError, AppResult};

const REMINDER_COLUMNS: &str =
    "id, title, notes, due_date, due_time, completed_on, created_at, updated_at";
const DATE_FMT: &str = "%Y-%m-%d";

fn date_str(date: NaiveDate) -> String {
    date.format(DATE_FMT).to_string()
}

fn row_to_reminder(row: &Row<'_>) -> rusqlite::Result<Reminder> {
    Ok(Reminder {
        id: row.get("id")?,
        title: row.get("title")?,
        notes: row.get("notes")?,
        due_date: row.get("due_date")?,
        due_time: row.get("due_time")?,
        completed_on: row.get("completed_on")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn not_found(id: i64) -> AppError {
    AppError::NotFound(format!("Reminder {id} not found."))
}

fn clean_optional(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

pub fn get(conn: &Connection, id: i64) -> AppResult<Reminder> {
    conn.query_row(
        &format!("SELECT {REMINDER_COLUMNS} FROM reminders WHERE id = ?1"),
        [id],
        row_to_reminder,
    )
    .optional()?
    .ok_or_else(|| not_found(id))
}

/// Incomplete reminders plus completed reminders from the inclusive 30-day
/// window ending today, ordered by the shared reminder comparator.
pub fn list(conn: &Connection, today: &str, include_completed: bool) -> AppResult<Vec<Reminder>> {
    let today_date = dates::parse_date(today)?;
    let first_completed_date = date_str(
        today_date
            .checked_sub_days(Days::new(29))
            .unwrap_or(today_date),
    );
    let sql = format!(
        "SELECT {REMINDER_COLUMNS} FROM reminders
         WHERE completed_on IS NULL
            OR (?1 = 1 AND completed_on >= ?2 AND completed_on <= ?3)
         ORDER BY due_date, due_time IS NOT NULL, due_time, id"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(
        params![include_completed, first_completed_date, today],
        row_to_reminder,
    )?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// The dashboard due set: incomplete items whose date has arrived, plus items
/// completed today, in the same stable order as the management list.
pub fn due(conn: &Connection, today: &str) -> AppResult<Vec<Reminder>> {
    dates::parse_date(today)?;
    let mut reminders = list(conn, today, true)?;
    reminders.retain(|reminder| logic::is_due(reminder, today));
    reminders.sort_by(logic::compare_order);
    Ok(reminders)
}

pub fn create(conn: &Connection, input: &NewReminder) -> AppResult<Reminder> {
    let title = input.title.trim();
    let notes = clean_optional(input.notes.as_deref());
    let due_time = clean_optional(input.due_time.as_deref());
    logic::validate_input(
        title,
        notes.as_deref(),
        &input.due_date,
        due_time.as_deref(),
    )?;

    let timestamp = dates::now_rfc3339();
    conn.execute(
        "INSERT INTO reminders (title, notes, due_date, due_time, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        params![title, notes, input.due_date, due_time, timestamp],
    )?;
    get(conn, conn.last_insert_rowid())
}

pub fn update(conn: &Connection, id: i64, patch: &ReminderPatch) -> AppResult<Reminder> {
    let current = get(conn, id)?;
    let title = patch
        .title
        .as_deref()
        .map(str::trim)
        .unwrap_or(&current.title)
        .to_owned();
    let notes = patch
        .notes
        .as_deref()
        .map(|value| clean_optional(Some(value)))
        .unwrap_or(current.notes);
    let due_date = patch
        .due_date
        .as_deref()
        .unwrap_or(&current.due_date)
        .to_owned();
    let due_time = patch
        .due_time
        .as_deref()
        .map(|value| clean_optional(Some(value)))
        .unwrap_or(current.due_time);
    logic::validate_input(&title, notes.as_deref(), &due_date, due_time.as_deref())?;

    conn.execute(
        "UPDATE reminders SET title = ?1, notes = ?2, due_date = ?3, due_time = ?4, updated_at = ?5
         WHERE id = ?6",
        params![title, notes, due_date, due_time, dates::now_rfc3339(), id],
    )?;
    get(conn, id)
}

pub fn set_done(conn: &Connection, id: i64, today: &str, done: bool) -> AppResult<Reminder> {
    dates::parse_date(today)?;
    let current = get(conn, id)?;
    let completed_on = if done { Some(today) } else { None };
    if current.completed_on.as_deref() == completed_on {
        return Ok(current);
    }
    conn.execute(
        "UPDATE reminders SET completed_on = ?1, updated_at = ?2 WHERE id = ?3",
        params![completed_on, dates::now_rfc3339(), id],
    )?;
    get(conn, id)
}

pub fn delete(conn: &Connection, id: i64) -> AppResult<()> {
    match conn.execute("DELETE FROM reminders WHERE id = ?1", [id])? {
        0 => Err(not_found(id)),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::error::AppError;

    fn input(title: &str, due_date: &str, due_time: Option<&str>) -> NewReminder {
        NewReminder {
            title: title.into(),
            notes: None,
            due_date: due_date.into(),
            due_time: due_time.map(str::to_owned),
        }
    }

    #[test]
    fn create_list_update_clear_time_and_delete() {
        let conn = db::open_in_memory().unwrap();
        let created = create(
            &conn,
            &NewReminder {
                title: "  Call dentist  ".into(),
                notes: Some("  Bring card  ".into()),
                due_date: "2026-11-02".into(),
                due_time: Some("09:30".into()),
            },
        )
        .unwrap();
        assert_eq!(created.title, "Call dentist");
        assert_eq!(created.notes.as_deref(), Some("Bring card"));
        assert_eq!(created.due_time.as_deref(), Some("09:30"));

        let updated = update(
            &conn,
            created.id,
            &ReminderPatch {
                title: Some("Dentist".into()),
                notes: Some("  ".into()),
                due_time: Some(String::new()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(updated.title, "Dentist");
        assert_eq!(updated.notes, None);
        assert_eq!(updated.due_time, None);
        assert_eq!(list(&conn, "2026-11-02", false).unwrap(), [updated]);
        delete(&conn, created.id).unwrap();
        assert!(list(&conn, "2026-11-02", false).unwrap().is_empty());
        assert!(matches!(
            delete(&conn, created.id),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn completion_is_idempotent_and_due_today_uses_completion_date() {
        let conn = db::open_in_memory().unwrap();
        let future = create(&conn, &input("Future", "2026-11-05", None)).unwrap();
        let completed = set_done(&conn, future.id, "2026-10-31", true).unwrap();
        assert_eq!(completed.completed_on.as_deref(), Some("2026-10-31"));
        assert_eq!(
            due(&conn, "2026-10-31")
                .unwrap()
                .iter()
                .map(|item| item.id)
                .collect::<Vec<_>>(),
            [future.id]
        );
        assert_eq!(
            set_done(&conn, future.id, "2026-10-31", true).unwrap(),
            completed
        );
        let undone = set_done(&conn, future.id, "2026-10-31", false).unwrap();
        assert_eq!(undone.completed_on, None);
        assert!(due(&conn, "2026-10-31").unwrap().is_empty());
        assert_eq!(
            set_done(&conn, future.id, "2026-10-31", false).unwrap(),
            undone
        );
    }

    #[test]
    fn completed_list_is_limited_to_the_inclusive_last_30_days() {
        let conn = db::open_in_memory().unwrap();
        let old = create(&conn, &input("Old", "2026-09-01", None)).unwrap();
        let edge = create(&conn, &input("Edge", "2026-09-01", None)).unwrap();
        let today = create(&conn, &input("Today", "2026-09-01", None)).unwrap();
        set_done(&conn, old.id, "2026-10-01", true).unwrap();
        set_done(&conn, edge.id, "2026-10-02", true).unwrap();
        set_done(&conn, today.id, "2026-10-31", true).unwrap();
        let result = list(&conn, "2026-10-31", true).unwrap();
        assert_eq!(
            result.iter().map(|item| item.id).collect::<Vec<_>>(),
            [edge.id, today.id]
        );
        assert!(list(&conn, "2026-10-31", false).unwrap().is_empty());
    }

    #[test]
    fn validates_all_input_dates_times_and_text_limits() {
        let conn = db::open_in_memory().unwrap();
        for invalid in [
            input("", "2026-10-31", None),
            input(&"x".repeat(logic::TITLE_MAX + 1), "2026-10-31", None),
            input("Valid", "2026-2-1", None),
            input("Valid", "2026-10-31", Some("24:00")),
        ] {
            assert!(matches!(
                create(&conn, &invalid),
                Err(AppError::Validation(_))
            ));
        }
        let item = create(&conn, &input("Valid", "2026-10-31", None)).unwrap();
        assert!(matches!(
            update(
                &conn,
                item.id,
                &ReminderPatch {
                    notes: Some("x".repeat(logic::NOTES_MAX + 1)),
                    ..Default::default()
                }
            ),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            list(&conn, "tomorrow", false),
            Err(AppError::Validation(_))
        ));
    }
}
