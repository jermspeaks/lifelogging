use chrono::Utc;
use rusqlite::{Connection, params};

use super::logic::{self, ParsedCalendar, ParsedEvent};
use super::model::{CalendarSource, EventOccurrence};
use crate::error::{AppError, AppResult};

fn timestamp() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn source_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<CalendarSource> {
    Ok(CalendarSource {
        id: row.get(0)?,
        name: row.get(1)?,
        imported_at: row.get(2)?,
        event_count: row.get(3)?,
    })
}

fn insert_event(conn: &Connection, source_id: i64, event: &ParsedEvent) -> AppResult<()> {
    conn.execute(
        "INSERT INTO events (source_id, uid, summary, description, location, start_date, all_day, event_ical)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            source_id,
            event.uid,
            event.summary,
            event.description,
            event.location,
            event.start_date.format("%Y-%m-%d").to_string(),
            event.all_day,
            event.event_ical,
        ],
    )?;
    Ok(())
}

pub fn list_sources(conn: &Connection) -> AppResult<Vec<CalendarSource>> {
    let mut statement = conn.prepare(
        "SELECT s.id, s.name, s.imported_at, COUNT(e.id)
         FROM calendar_sources s LEFT JOIN events e ON e.source_id = s.id
         GROUP BY s.id ORDER BY s.name COLLATE NOCASE, s.id",
    )?;
    let rows = statement.query_map([], source_from_row)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

/// Import a parsed calendar in one transaction. A failed replacement retains all prior rows.
pub fn import(
    conn: &mut Connection,
    calendar: &ParsedCalendar,
    source_id: Option<i64>,
) -> AppResult<CalendarSource> {
    let tx = conn.transaction()?;
    let imported_at = timestamp();
    let id = if let Some(source_id) = source_id {
        let changed = tx.execute(
            "UPDATE calendar_sources SET name = ?1, imported_at = ?2, timezone = ?3 WHERE id = ?4",
            params![calendar.name, imported_at, calendar.timezone, source_id],
        )?;
        if changed == 0 {
            return Err(AppError::NotFound(format!(
                "Calendar source {source_id} not found."
            )));
        }
        tx.execute("DELETE FROM events WHERE source_id = ?1", [source_id])?;
        source_id
    } else {
        tx.execute(
            "INSERT INTO calendar_sources (name, imported_at, timezone) VALUES (?1, ?2, ?3)",
            params![calendar.name, imported_at, calendar.timezone],
        )?;
        tx.last_insert_rowid()
    };

    for event in &calendar.events {
        insert_event(&tx, id, event)?;
    }
    tx.commit()?;

    Ok(CalendarSource {
        id,
        name: calendar.name.clone(),
        imported_at,
        event_count: i64::try_from(calendar.events.len())
            .map_err(|_| AppError::Database("event count overflow".into()))?,
    })
}

pub fn delete_source(conn: &Connection, source_id: i64) -> AppResult<()> {
    let changed = conn.execute("DELETE FROM calendar_sources WHERE id = ?1", [source_id])?;
    if changed == 0 {
        return Err(AppError::NotFound(format!(
            "Calendar source {source_id} not found."
        )));
    }
    Ok(())
}

#[derive(Debug)]
struct StoredEvent {
    id: i64,
    source_id: i64,
    source_name: String,
    uid: String,
    summary: String,
    description: Option<String>,
    location: Option<String>,
    start_date: String,
    event_ical: String,
    source_timezone: Option<String>,
}

fn upcoming_rows(conn: &Connection) -> AppResult<Vec<StoredEvent>> {
    let mut statement = conn.prepare(
        "SELECT e.id, s.id, s.name, e.uid, e.summary, e.description, e.location,
                e.start_date, e.event_ical, s.timezone
         FROM events e JOIN calendar_sources s ON s.id = e.source_id",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(StoredEvent {
            id: row.get(0)?,
            source_id: row.get(1)?,
            source_name: row.get(2)?,
            uid: row.get(3)?,
            summary: row.get(4)?,
            description: row.get(5)?,
            location: row.get(6)?,
            start_date: row.get(7)?,
            event_ical: row.get(8)?,
            source_timezone: row.get(9)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

pub fn upcoming(conn: &Connection, today: &str) -> AppResult<Vec<EventOccurrence>> {
    let (start, end_exclusive) = logic::upcoming_range(today)?;
    let mut occurrences = Vec::new();
    for event in upcoming_rows(conn)? {
        let event_start = logic::parse_date(&event.start_date)
            .map_err(|e| AppError::Database(format!("invalid stored event start date: {e}")))?;
        if event_start >= end_exclusive {
            continue;
        }
        let mut expanded = logic::expand_event(
            event.id,
            event.source_id,
            &event.source_name,
            &event.uid,
            &event.summary,
            event.description.as_deref(),
            event.location.as_deref(),
            &event.event_ical,
            event.source_timezone.as_deref(),
            start,
            end_exclusive,
        )?;
        occurrences.append(&mut expanded);
    }
    occurrences.sort_by(|left, right| {
        left.date
            .cmp(&right.date)
            .then_with(|| right.all_day.cmp(&left.all_day))
            .then_with(|| left.start_time.cmp(&right.start_time))
            .then_with(|| {
                left.summary
                    .to_lowercase()
                    .cmp(&right.summary.to_lowercase())
            })
            .then_with(|| left.source_id.cmp(&right.source_id))
            .then_with(|| left.id.cmp(&right.id))
    });
    Ok(occurrences)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    const ONCE: &str = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:one\r\nSUMMARY:Coffee\r\nDTSTART:20261031T090000\r\nDTEND:20261031T093000\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";

    fn parsed(name: &str, content: &str) -> ParsedCalendar {
        logic::parse_calendar(name, content).unwrap()
    }

    #[test]
    fn import_list_replace_and_delete_are_consistent() {
        let mut conn = db::open_in_memory().unwrap();
        let source = import(&mut conn, &parsed("work.ics", ONCE), None).unwrap();
        assert_eq!(source.event_count, 1);
        assert_eq!(
            list_sources(&conn).unwrap().as_slice(),
            std::slice::from_ref(&source)
        );

        let replacement = ONCE.replace("Coffee", "Coffee with Sam");
        let updated = import(
            &mut conn,
            &parsed("work.ics", &replacement),
            Some(source.id),
        )
        .unwrap();
        assert_eq!(updated.id, source.id);
        assert_eq!(updated.event_count, 1);
        assert_eq!(
            upcoming(&conn, "2026-10-31").unwrap()[0].summary,
            "Coffee with Sam"
        );

        delete_source(&conn, source.id).unwrap();
        assert!(list_sources(&conn).unwrap().is_empty());
        assert!(upcoming(&conn, "2026-10-31").unwrap().is_empty());
    }

    #[test]
    fn empty_replacement_removes_previous_events_atomically() {
        let mut conn = db::open_in_memory().unwrap();
        let source = import(&mut conn, &parsed("work.ics", ONCE), None).unwrap();
        let no_events = ParsedCalendar {
            name: "replacement.ics".into(),
            timezone: None,
            events: vec![],
        };
        // A valid empty calendar is a successful replacement; the old event must disappear.
        import(&mut conn, &no_events, Some(source.id)).unwrap();
        assert!(upcoming(&conn, "2026-10-31").unwrap().is_empty());
    }

    #[test]
    fn upcoming_includes_events_on_each_boundary_date() {
        let mut conn = db::open_in_memory().unwrap();
        let calendar = ONCE
            .replace("20261031T090000", "20261103T090000")
            .replace("20261031T093000", "20261103T093000");
        import(&mut conn, &parsed("work.ics", &calendar), None).unwrap();
        assert_eq!(upcoming(&conn, "2026-10-31").unwrap()[0].date, "2026-11-03");
        assert!(upcoming(&conn, "2026-11-04").unwrap().is_empty());
    }
}
