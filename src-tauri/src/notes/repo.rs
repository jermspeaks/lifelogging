//! SQLite persistence and validation for saved notes (SPEC §18).

use chrono::NaiveDate;
use rusqlite::{Connection, OptionalExtension, Row, params};

use super::logic;
use super::model::{NewNote, Note, NotePatch, ReviewAction, ReviewQueue};
use crate::dates;
use crate::error::{AppError, AppResult};

const TITLE_MAX: usize = 200;
const BODY_MAX: usize = 5_000;
const URL_MAX: usize = 2_000;
const QUEUE_MAX: i64 = 50;
const NOTE_COLUMNS: &str = "id, title, body, url, review_stage, next_review_date, last_reviewed_on, archived_at, created_at, updated_at";

fn now() -> String {
    dates::now_rfc3339()
}

fn date_string(date: NaiveDate) -> String {
    date.format("%Y-%m-%d").to_string()
}

fn clean_optional(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn validate(title: &str, body: Option<&str>, url: Option<&str>) -> AppResult<()> {
    let title_len = title.chars().count();
    if title_len == 0 {
        return Err(AppError::Validation("Title is required.".into()));
    }
    if title_len > TITLE_MAX {
        return Err(AppError::Validation(format!(
            "Title must be at most {TITLE_MAX} characters."
        )));
    }
    if body.is_some_and(|value| value.chars().count() > BODY_MAX) {
        return Err(AppError::Validation(format!(
            "Body must be at most {BODY_MAX} characters."
        )));
    }
    if let Some(url) = url {
        if url.chars().count() > URL_MAX {
            return Err(AppError::Validation(format!(
                "URL must be at most {URL_MAX} characters."
            )));
        }
        let authority = url
            .strip_prefix("https://")
            .or_else(|| url.strip_prefix("http://"));
        let host = authority.map(|rest| rest.split(['/', '?', '#']).next().unwrap_or_default());
        if url.chars().any(char::is_whitespace) || !host.is_some_and(|host| !host.is_empty()) {
            return Err(AppError::Validation(
                "URL must be an absolute http or https URL with a host.".into(),
            ));
        }
    }
    Ok(())
}

fn row_to_note(row: &Row<'_>) -> rusqlite::Result<Note> {
    Ok(Note {
        id: row.get("id")?,
        title: row.get("title")?,
        body: row.get("body")?,
        url: row.get("url")?,
        review_stage: row.get("review_stage")?,
        next_review_date: row.get("next_review_date")?,
        last_reviewed_on: row.get("last_reviewed_on")?,
        archived_at: row.get("archived_at")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn not_found(id: i64) -> AppError {
    AppError::NotFound(format!("Note {id} not found."))
}

pub fn get(conn: &Connection, id: i64) -> AppResult<Note> {
    conn.query_row(
        &format!("SELECT {NOTE_COLUMNS} FROM notes WHERE id = ?1"),
        [id],
        row_to_note,
    )
    .optional()?
    .ok_or_else(|| not_found(id))
}

/// Notes are newest first; archived records are included only on request.
pub fn list(
    conn: &Connection,
    query: Option<&str>,
    include_archived: bool,
) -> AppResult<Vec<Note>> {
    let sql = format!(
        "SELECT {NOTE_COLUMNS} FROM notes {} ORDER BY id DESC",
        if include_archived {
            ""
        } else {
            "WHERE archived_at IS NULL"
        }
    );
    let needle = query
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_lowercase);
    let mut stmt = conn.prepare(&sql)?;
    let notes = stmt
        .query_map([], row_to_note)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(notes
        .into_iter()
        .filter(|note| {
            needle.as_ref().is_none_or(|needle| {
                note.title.to_lowercase().contains(needle)
                    || note
                        .body
                        .as_deref()
                        .unwrap_or_default()
                        .to_lowercase()
                        .contains(needle)
                    || note
                        .url
                        .as_deref()
                        .unwrap_or_default()
                        .to_lowercase()
                        .contains(needle)
            })
        })
        .collect())
}

pub fn create(conn: &Connection, input: &NewNote, today: &str) -> AppResult<Note> {
    let today = dates::parse_date(today)?;
    let title = input.title.trim();
    let body = clean_optional(input.body.as_deref());
    let url = clean_optional(input.url.as_deref());
    validate(title, body.as_deref(), url.as_deref())?;
    let timestamp = now();
    let next_review_date = date_string(logic::review_date(today, 0)?);
    conn.execute(
        "INSERT INTO notes (title, body, url, review_stage, next_review_date, created_at, updated_at)
         VALUES (?1, ?2, ?3, 0, ?4, ?5, ?5)",
        params![title, body, url, next_review_date, timestamp],
    )?;
    get(conn, conn.last_insert_rowid())
}

/// Applies only present patch fields. Empty optional strings clear the field; edits preserve schedule.
pub fn update(conn: &Connection, id: i64, patch: &NotePatch) -> AppResult<Note> {
    let current = get(conn, id)?;
    let title = patch
        .title
        .as_deref()
        .map(str::trim)
        .unwrap_or(&current.title)
        .to_owned();
    let body = match patch.body.as_deref() {
        Some(value) => clean_optional(Some(value)),
        None => current.body,
    };
    let url = match patch.url.as_deref() {
        Some(value) => clean_optional(Some(value)),
        None => current.url,
    };
    validate(&title, body.as_deref(), url.as_deref())?;
    conn.execute(
        "UPDATE notes SET title = ?1, body = ?2, url = ?3, updated_at = ?4 WHERE id = ?5",
        params![title, body, url, now(), id],
    )?;
    get(conn, id)
}

pub fn review(conn: &Connection, id: i64, today: &str, action: ReviewAction) -> AppResult<Note> {
    let today = dates::parse_date(today)?;
    let current = get(conn, id)?;
    if current.archived_at.is_some() {
        return Err(AppError::Validation(
            "Archived notes cannot be reviewed.".into(),
        ));
    }
    let today_string = date_string(today);
    match action {
        ReviewAction::Keep => {
            let (stage, next_date) = logic::keep(current.review_stage, today)?;
            conn.execute(
                "UPDATE notes SET review_stage = ?1, next_review_date = ?2, last_reviewed_on = ?3, updated_at = ?4 WHERE id = ?5",
                params![stage, date_string(next_date), today_string, now(), id],
            )?;
        }
        ReviewAction::Snooze => {
            conn.execute(
                "UPDATE notes SET next_review_date = ?1, updated_at = ?2 WHERE id = ?3",
                params![date_string(logic::snooze(today)?), now(), id],
            )?;
        }
    }
    get(conn, id)
}

pub fn set_archived(conn: &Connection, id: i64, archived: bool, today: &str) -> AppResult<Note> {
    let today = dates::parse_date(today)?;
    let current = get(conn, id)?;
    if current.archived_at.is_some() == archived {
        return Ok(current);
    }
    if archived {
        let timestamp = now();
        conn.execute(
            "UPDATE notes SET archived_at = ?1, next_review_date = NULL, updated_at = ?1 WHERE id = ?2",
            params![timestamp, id],
        )?;
    } else {
        let next_date = date_string(logic::unarchive(today)?);
        conn.execute(
            "UPDATE notes SET archived_at = NULL, review_stage = 0, next_review_date = ?1, updated_at = ?2 WHERE id = ?3",
            params![next_date, now(), id],
        )?;
    }
    get(conn, id)
}

pub fn delete(conn: &Connection, id: i64) -> AppResult<()> {
    match conn.execute("DELETE FROM notes WHERE id = ?1", [id])? {
        0 => Err(not_found(id)),
        _ => Ok(()),
    }
}

pub fn queue(conn: &Connection, today: &str, limit: i64) -> AppResult<ReviewQueue> {
    dates::parse_date(today)?;
    if !(1..=QUEUE_MAX).contains(&limit) {
        return Err(AppError::Validation(format!(
            "Review queue limit must be between 1 and {QUEUE_MAX}."
        )));
    }
    let due_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM notes WHERE archived_at IS NULL AND next_review_date <= ?1",
        [today],
        |row| row.get(0),
    )?;
    let sql = format!(
        "SELECT {NOTE_COLUMNS} FROM notes WHERE archived_at IS NULL AND next_review_date <= ?1 ORDER BY next_review_date, id LIMIT ?2"
    );
    let mut stmt = conn.prepare(&sql)?;
    let due = stmt
        .query_map(params![today, limit], row_to_note)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(ReviewQueue { due, due_count })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    const TODAY: &str = "2026-10-31";

    fn create_note(conn: &Connection, title: &str) -> Note {
        create(
            conn,
            &NewNote {
                title: title.into(),
                body: None,
                url: None,
            },
            TODAY,
        )
        .unwrap()
    }

    #[test]
    fn creates_and_lists_newest_first_with_initial_review_date() {
        let conn = db::open_in_memory().unwrap();
        let first = create_note(&conn, "First");
        let second = create_note(&conn, "Second");
        assert_eq!(first.next_review_date.as_deref(), Some("2026-11-01"));
        assert_eq!(first.review_stage, 0);
        assert_eq!(first.created_at, first.updated_at);
        assert_eq!(
            list(&conn, None, false)
                .unwrap()
                .iter()
                .map(|n| n.id)
                .collect::<Vec<_>>(),
            [second.id, first.id]
        );
    }

    #[test]
    fn validates_fields_and_url_authority_without_accepting_non_http_schemes() {
        let conn = db::open_in_memory().unwrap();
        for url in [
            "ftp://example.com",
            "https:///path",
            "http://?q=x",
            "https://has space.test",
        ] {
            assert!(
                matches!(
                    create(
                        &conn,
                        &NewNote {
                            title: "x".into(),
                            body: None,
                            url: Some(url.into())
                        },
                        TODAY
                    ),
                    Err(AppError::Validation(_))
                ),
                "{url}"
            );
        }
        for url in ["http://example.test", "https://example.test/path?q=1"] {
            assert!(
                create(
                    &conn,
                    &NewNote {
                        title: "x".into(),
                        body: None,
                        url: Some(url.into())
                    },
                    TODAY
                )
                .is_ok()
            );
        }
        assert!(matches!(
            create(
                &conn,
                &NewNote {
                    title: "  ".into(),
                    body: None,
                    url: None
                },
                TODAY
            ),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            create(
                &conn,
                &NewNote {
                    title: "x".into(),
                    body: Some("x".repeat(BODY_MAX + 1)),
                    url: None
                },
                TODAY
            ),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            create(
                &conn,
                &NewNote {
                    title: "x".repeat(TITLE_MAX + 1),
                    body: None,
                    url: None
                },
                TODAY
            ),
            Err(AppError::Validation(_))
        ));
    }

    #[test]
    fn trims_and_clears_optional_fields_with_empty_patch_values() {
        let conn = db::open_in_memory().unwrap();
        let note = create(
            &conn,
            &NewNote {
                title: "  Title  ".into(),
                body: Some("  text  ".into()),
                url: Some(" https://example.test ".into()),
            },
            TODAY,
        )
        .unwrap();
        assert_eq!(note.title, "Title");
        assert_eq!(note.body.as_deref(), Some("text"));
        assert_eq!(note.url.as_deref(), Some("https://example.test"));
        let updated = update(
            &conn,
            note.id,
            &NotePatch {
                title: Some(" New title ".into()),
                body: Some(" ".into()),
                url: Some("".into()),
            },
        )
        .unwrap();
        assert_eq!(updated.title, "New title");
        assert_eq!(updated.body, None);
        assert_eq!(updated.url, None);
        assert_eq!(updated.next_review_date, note.next_review_date);
        assert_eq!(updated.review_stage, note.review_stage);
        let unchanged = update(&conn, note.id, &NotePatch::default()).unwrap();
        assert_eq!(unchanged.next_review_date, note.next_review_date);
    }

    #[test]
    fn search_matches_title_body_and_url_case_insensitively() {
        let conn = db::open_in_memory().unwrap();
        create(
            &conn,
            &NewNote {
                title: "Ada Lovelace".into(),
                body: Some("Engine notes".into()),
                url: Some("https://Example.test/Path".into()),
            },
            TODAY,
        )
        .unwrap();
        assert_eq!(list(&conn, Some("ENGINE"), false).unwrap().len(), 1);
        assert_eq!(list(&conn, Some("example.TEST"), false).unwrap().len(), 1);
        assert_eq!(list(&conn, Some(" ada "), false).unwrap().len(), 1);
        assert!(list(&conn, Some("missing"), false).unwrap().is_empty());
        assert_eq!(list(&conn, Some("  "), false).unwrap().len(), 1);
    }

    #[test]
    fn keep_and_snooze_update_the_expected_review_fields() {
        let conn = db::open_in_memory().unwrap();
        let note = create_note(&conn, "Review me");
        let kept = review(&conn, note.id, TODAY, ReviewAction::Keep).unwrap();
        assert_eq!(kept.review_stage, 1);
        assert_eq!(kept.next_review_date.as_deref(), Some("2026-11-03"));
        assert_eq!(kept.last_reviewed_on.as_deref(), Some(TODAY));
        let snoozed = review(&conn, note.id, TODAY, ReviewAction::Snooze).unwrap();
        assert_eq!(snoozed.review_stage, 1);
        assert_eq!(snoozed.next_review_date.as_deref(), Some("2026-11-01"));
        assert_eq!(snoozed.last_reviewed_on.as_deref(), Some(TODAY));
    }

    #[test]
    fn archive_unarchive_and_delete_preserve_contract() {
        let conn = db::open_in_memory().unwrap();
        let note = create_note(&conn, "Archive me");
        let kept = review(&conn, note.id, TODAY, ReviewAction::Keep).unwrap();
        let archived = set_archived(&conn, note.id, true, TODAY).unwrap();
        assert!(archived.archived_at.is_some());
        assert_eq!(archived.next_review_date, None);
        assert!(matches!(
            review(&conn, note.id, TODAY, ReviewAction::Keep),
            Err(AppError::Validation(_))
        ));
        assert!(list(&conn, None, false).unwrap().is_empty());
        assert_eq!(list(&conn, None, true).unwrap().len(), 1);
        let active = set_archived(&conn, note.id, false, TODAY).unwrap();
        assert_eq!(active.review_stage, 0);
        assert_eq!(active.next_review_date.as_deref(), Some("2026-11-01"));
        assert_eq!(active.last_reviewed_on, kept.last_reviewed_on);
        delete(&conn, note.id).unwrap();
        assert!(matches!(get(&conn, note.id), Err(AppError::NotFound(_))));
    }

    #[test]
    fn queue_orders_by_due_date_then_id_and_reports_uncapped_due_count() {
        let conn = db::open_in_memory().unwrap();
        let first = create_note(&conn, "First");
        let second = create_note(&conn, "Second");
        let third = create_note(&conn, "Third");
        conn.execute(
            "UPDATE notes SET next_review_date = ?1 WHERE id IN (?2, ?3)",
            params![TODAY, first.id, second.id],
        )
        .unwrap();
        conn.execute(
            "UPDATE notes SET next_review_date = '2026-10-30' WHERE id = ?1",
            [third.id],
        )
        .unwrap();
        let limited = queue(&conn, TODAY, 1).unwrap();
        assert_eq!(limited.due_count, 3);
        assert_eq!(limited.due[0].id, third.id);
        assert_eq!(
            queue(&conn, TODAY, 50)
                .unwrap()
                .due
                .iter()
                .map(|n| n.id)
                .collect::<Vec<_>>(),
            [third.id, first.id, second.id]
        );
        assert!(matches!(
            queue(&conn, TODAY, 0),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            queue(&conn, "2026-2-1", 5),
            Err(AppError::Validation(_))
        ));
    }

    #[test]
    fn due_notes_exclude_future_and_archived_items() {
        let conn = db::open_in_memory().unwrap();
        let due = create_note(&conn, "Due");
        conn.execute(
            "UPDATE notes SET next_review_date = ?1 WHERE id = ?2",
            params![TODAY, due.id],
        )
        .unwrap();
        let future = create_note(&conn, "Future");
        conn.execute(
            "UPDATE notes SET next_review_date = '2026-11-10' WHERE id = ?1",
            [future.id],
        )
        .unwrap();
        let archived = create_note(&conn, "Archived");
        set_archived(&conn, archived.id, true, TODAY).unwrap();
        let queue = queue(&conn, TODAY, 50).unwrap();
        assert_eq!(queue.due_count, 1);
        assert_eq!(queue.due[0].id, due.id);
    }

    #[test]
    fn timestamps_are_utc_rfc3339() {
        let timestamp = now();
        assert!(timestamp.ends_with('Z'));
        let parsed = chrono::DateTime::parse_from_rfc3339(&timestamp).unwrap();
        assert_eq!(parsed.offset().local_minus_utc(), 0);
        assert_eq!(
            timestamp
                .split('.')
                .nth(1)
                .unwrap()
                .trim_end_matches('Z')
                .len(),
            3
        );
    }
}
