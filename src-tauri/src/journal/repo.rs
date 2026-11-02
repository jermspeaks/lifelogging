use rusqlite::{Connection, OptionalExtension, Row, params};

use super::logic;
use super::model::{JournalEntry, JournalSummary};
use crate::dates;
use crate::error::{AppError, AppResult};

const MAX_LIMIT: i64 = 200;

fn now() -> String {
    dates::now_rfc3339()
}

fn entry_from_row(row: &Row<'_>) -> rusqlite::Result<JournalEntry> {
    let body: String = row.get("body")?;
    Ok(JournalEntry {
        date: row.get("date")?,
        word_count: logic::word_count(&body),
        body,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn get(conn: &Connection, date: &str) -> AppResult<Option<JournalEntry>> {
    Ok(conn
        .query_row(
            "SELECT date, body, created_at, updated_at FROM journal_entries WHERE date = ?1",
            [date],
            entry_from_row,
        )
        .optional()?)
}

pub fn save(conn: &Connection, date: &str, body: &str) -> AppResult<Option<JournalEntry>> {
    logic::validate_body(body)?;
    if body.trim().is_empty() {
        delete(conn, date)?;
        return Ok(None);
    }

    let timestamp = now();
    conn.execute(
        "INSERT INTO journal_entries(date, body, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?3)
         ON CONFLICT(date) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at",
        params![date, body, timestamp],
    )?;
    get(conn, date)
}

pub fn delete(conn: &Connection, date: &str) -> AppResult<()> {
    conn.execute("DELETE FROM journal_entries WHERE date = ?1", [date])?;
    Ok(())
}

pub fn list(
    conn: &Connection,
    query: Option<&str>,
    before: Option<&str>,
    limit: i64,
) -> AppResult<Vec<JournalSummary>> {
    if !(1..=MAX_LIMIT).contains(&limit) {
        return Err(AppError::Validation(format!(
            "Journal list limit must be between 1 and {MAX_LIMIT}."
        )));
    }
    if let Some(before) = before {
        dates::parse_date(before)?;
    }
    let query = query
        .filter(|value| !value.trim().is_empty())
        .map(str::to_lowercase);

    let mut stmt = conn.prepare(
        "SELECT date, body, updated_at FROM journal_entries
         WHERE (?1 IS NULL OR date < ?1) ORDER BY date DESC",
    )?;
    let rows = stmt.query_map([before], |row| {
        let body: String = row.get("body")?;
        Ok((
            row.get::<_, String>("date")?,
            body,
            row.get::<_, String>("updated_at")?,
        ))
    })?;

    let mut summaries = Vec::new();
    for row in rows {
        let (date, body, updated_at) = row?;
        if query
            .as_ref()
            .is_some_and(|needle| !body.to_lowercase().contains(needle))
        {
            continue;
        }
        summaries.push(JournalSummary {
            date,
            preview: logic::preview(&body),
            word_count: logic::word_count(&body),
            updated_at,
        });
        if summaries.len() == limit as usize {
            break;
        }
    }
    Ok(summaries)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    #[test]
    fn saves_updates_and_reads_an_entry_without_trimming_body() {
        let conn = db::open_in_memory().unwrap();
        let first = save(&conn, "2026-10-30", "  hello\nworld  ")
            .unwrap()
            .unwrap();
        assert_eq!(first.body, "  hello\nworld  ");
        assert_eq!(first.word_count, 2);
        let updated = save(&conn, "2026-10-30", "updated").unwrap().unwrap();
        assert_eq!(updated.created_at, first.created_at);
        assert_eq!(updated.body, "updated");
        assert_eq!(get(&conn, "2026-10-30").unwrap(), Some(updated));
    }

    #[test]
    fn empty_or_whitespace_saves_delete_the_entry() {
        let conn = db::open_in_memory().unwrap();
        save(&conn, "2026-10-30", "content").unwrap();
        assert_eq!(save(&conn, "2026-10-30", " \n\t ").unwrap(), None);
        assert!(get(&conn, "2026-10-30").unwrap().is_none());
        assert_eq!(save(&conn, "2026-10-30", "").unwrap(), None);
    }

    #[test]
    fn rejects_body_over_the_limit() {
        let conn = db::open_in_memory().unwrap();
        assert!(matches!(
            save(&conn, "2026-10-30", &"x".repeat(logic::BODY_MAX + 1)),
            Err(AppError::Validation(_))
        ));
    }

    #[test]
    fn search_is_case_insensitive_and_matches_like_metacharacters_literally() {
        let conn = db::open_in_memory().unwrap();
        save(&conn, "2026-10-28", "A 100%_\u{005c} literal word").unwrap();
        save(&conn, "2026-10-29", "ordinary note").unwrap();
        assert_eq!(list(&conn, Some("100%_\\"), None, 50).unwrap().len(), 1);
        assert_eq!(list(&conn, Some("LITERAL"), None, 50).unwrap().len(), 1);
        assert!(list(&conn, Some("100xx"), None, 50).unwrap().is_empty());
        assert_eq!(list(&conn, Some("  \t "), None, 50).unwrap().len(), 2);
    }

    #[test]
    fn pages_newest_first_with_an_exclusive_before_and_validated_limit() {
        let conn = db::open_in_memory().unwrap();
        for date in ["2026-10-28", "2026-10-29", "2026-10-30"] {
            save(&conn, date, date).unwrap();
        }
        assert_eq!(
            list(&conn, None, None, 2)
                .unwrap()
                .iter()
                .map(|entry| entry.date.as_str())
                .collect::<Vec<_>>(),
            ["2026-10-30", "2026-10-29"]
        );
        assert_eq!(
            list(&conn, None, Some("2026-10-29"), 50).unwrap()[0].date,
            "2026-10-28"
        );
        assert!(matches!(
            list(&conn, None, None, 0),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            list(&conn, None, None, 201),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            list(&conn, None, Some("2026-2-1"), 50),
            Err(AppError::Validation(_))
        ));
    }
}
