use chrono::{Days, NaiveDate, Utc};
use rusqlite::{Connection, params};

use super::logic::{self, ImportedEvent};
use super::model::{Calendar, CalendarEvent, ImportCalendarResult};
use crate::error::{AppError, AppResult};

#[derive(Debug)]
struct StoredEvent {
    id: i64,
    calendar_id: i64,
    calendar_name: String,
    event: ImportedEvent,
}

fn validate_name(name: &str) -> AppResult<String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 100 {
        return Err(AppError::Validation(
            "Calendar name must be 1–100 characters.".into(),
        ));
    }
    Ok(name.to_owned())
}

fn now() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn calendar_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Calendar> {
    Ok(Calendar {
        id: row.get(0)?,
        name: row.get(1)?,
        imported_at: row.get(2)?,
        event_count: row.get(3)?,
    })
}

pub fn list(conn: &Connection) -> AppResult<Vec<Calendar>> {
    let mut stmt = conn.prepare(
        "SELECT c.id, c.name, c.imported_at, COUNT(e.id)
         FROM calendars c LEFT JOIN events e ON e.calendar_id = c.id
         GROUP BY c.id ORDER BY c.name COLLATE NOCASE, c.id",
    )?;
    let rows = stmt.query_map([], calendar_row)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn import(conn: &mut Connection, name: &str, content: &str) -> AppResult<ImportCalendarResult> {
    let name = validate_name(name)?;
    let parsed = logic::parse_calendar(content)?;
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO calendars(name, imported_at) VALUES (?1, ?2)
         ON CONFLICT(name) DO UPDATE SET imported_at = excluded.imported_at",
        params![name, now()],
    )?;
    let calendar_id: i64 = tx.query_row(
        "SELECT id FROM calendars WHERE name = ?1 COLLATE NOCASE",
        [&name],
        |row| row.get(0),
    )?;
    tx.execute("DELETE FROM events WHERE calendar_id = ?1", [calendar_id])?;
    for event in &parsed {
        tx.execute(
            "INSERT INTO events(calendar_id, uid, summary, start_date, start_time, end_time,
                                all_day, yearly, timezone)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                calendar_id,
                event.uid,
                event.summary,
                event.start_date,
                event.start_time,
                event.end_time,
                event.all_day,
                event.yearly,
                event.timezone,
            ],
        )?;
    }
    let calendar = tx.query_row(
        "SELECT c.id, c.name, c.imported_at, COUNT(e.id)
         FROM calendars c LEFT JOIN events e ON e.calendar_id = c.id
         WHERE c.id = ?1 GROUP BY c.id",
        [calendar_id],
        calendar_row,
    )?;
    tx.commit()?;
    Ok(ImportCalendarResult {
        calendar,
        imported_event_count: parsed.len() as i64,
    })
}

pub fn delete(conn: &Connection, id: i64) -> AppResult<()> {
    let changed = conn.execute("DELETE FROM calendars WHERE id = ?1", [id])?;
    if changed == 0 {
        return Err(AppError::NotFound(format!("Calendar {id} not found")));
    }
    Ok(())
}

fn stored_events(conn: &Connection) -> AppResult<Vec<StoredEvent>> {
    let mut stmt = conn.prepare(
        "SELECT e.id, c.id, c.name, e.uid, e.summary, e.start_date, e.start_time,
                e.end_time, e.all_day, e.yearly, e.timezone
         FROM events e JOIN calendars c ON c.id = e.calendar_id",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(StoredEvent {
            id: row.get(0)?,
            calendar_id: row.get(1)?,
            calendar_name: row.get(2)?,
            event: ImportedEvent {
                uid: row.get(3)?,
                summary: row.get(4)?,
                start_date: row.get(5)?,
                start_time: row.get(6)?,
                end_time: row.get(7)?,
                all_day: row.get(8)?,
                yearly: row.get(9)?,
                timezone: row.get(10)?,
            },
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn upcoming(conn: &Connection, today: NaiveDate) -> AppResult<Vec<CalendarEvent>> {
    let mut results = Vec::new();
    for stored in stored_events(conn)? {
        for offset in 0..4 {
            let Some(date) = today.checked_add_days(Days::new(offset)) else {
                continue;
            };
            let Some(occurrence) = logic::occurrence_on(&stored.event, date)? else {
                continue;
            };
            results.push(CalendarEvent {
                id: stored.id,
                calendar_id: stored.calendar_id,
                calendar_name: stored.calendar_name.clone(),
                uid: stored.event.uid.clone(),
                summary: stored.event.summary.clone(),
                start_date: occurrence.date.format("%Y-%m-%d").to_string(),
                start_time: occurrence.start_time,
                end_time: occurrence.end_time,
                all_day: stored.event.all_day,
            });
        }
    }
    results.sort_by(|a, b| {
        a.start_date
            .cmp(&b.start_date)
            .then_with(|| b.all_day.cmp(&a.all_day))
            .then_with(|| a.start_time.cmp(&b.start_time))
            .then_with(|| a.summary.to_lowercase().cmp(&b.summary.to_lowercase()))
    });
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    const ONE: &str = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:one\nDTSTART;VALUE=DATE:20261031\nSUMMARY:Birthday\nEND:VEVENT\nEND:VCALENDAR";
    const TWO: &str = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:two\nDTSTART;VALUE=DATE:20261101\nSUMMARY:Walk\nEND:VEVENT\nEND:VCALENDAR";

    #[test]
    fn import_replaces_by_calendar_name_and_list_counts_events() {
        let mut conn = db::open_in_memory().unwrap();
        let first = import(&mut conn, " Personal ", ONE).unwrap();
        assert_eq!(first.calendar.name, "Personal");
        assert_eq!(first.imported_event_count, 1);
        let replaced = import(&mut conn, "personal", TWO).unwrap();
        assert_eq!(replaced.calendar.id, first.calendar.id);
        assert_eq!(replaced.imported_event_count, 1);
        assert_eq!(list(&conn).unwrap()[0].event_count, 1);
        assert_eq!(
            upcoming(
                &conn,
                NaiveDate::parse_from_str("2026-11-01", "%Y-%m-%d").unwrap()
            )
            .unwrap()[0]
                .summary,
            "Walk"
        );
    }

    #[test]
    fn failed_parse_does_not_replace_existing_calendar() {
        let mut conn = db::open_in_memory().unwrap();
        import(&mut conn, "Personal", ONE).unwrap();
        let bad = import(&mut conn, "Personal", "not a calendar");
        assert!(matches!(bad, Err(AppError::Validation(_))));
        assert_eq!(
            upcoming(
                &conn,
                NaiveDate::parse_from_str("2026-10-31", "%Y-%m-%d").unwrap()
            )
            .unwrap()[0]
                .summary,
            "Birthday"
        );
    }

    #[test]
    fn deleting_calendar_cascades_to_events() {
        let mut conn = db::open_in_memory().unwrap();
        let imported = import(&mut conn, "Personal", ONE).unwrap();
        delete(&conn, imported.calendar.id).unwrap();
        assert!(list(&conn).unwrap().is_empty());
        assert!(
            upcoming(
                &conn,
                NaiveDate::parse_from_str("2026-10-31", "%Y-%m-%d").unwrap()
            )
            .unwrap()
            .is_empty()
        );
        assert!(matches!(
            delete(&conn, imported.calendar.id),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn yearly_birthday_occurs_in_lookahead() {
        let mut conn = db::open_in_memory().unwrap();
        let input = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:birthday\nDTSTART;VALUE=DATE:19901103\nRRULE:FREQ=YEARLY\nSUMMARY:Birthday\nEND:VEVENT\nEND:VCALENDAR";
        import(&mut conn, "Family", input).unwrap();
        let rows = upcoming(
            &conn,
            NaiveDate::parse_from_str("2026-11-01", "%Y-%m-%d").unwrap(),
        )
        .unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].start_date, "2026-11-03");
    }
}
