//! SQLite persistence for user-curated quotes (SPEC §15).

use chrono::NaiveDate;
use rusqlite::{Connection, OptionalExtension, params};
use std::collections::HashSet;

use crate::dates::now_rfc3339;
use crate::error::{AppError, AppResult};
use crate::quotes::logic;
use crate::quotes::model::{ImportQuotesResult, NewQuote, Quote, QuotePatch};

const QUOTE_COLUMNS: &str = "id, text, author, source, created_at, updated_at";

fn row_to_quote(row: &rusqlite::Row<'_>) -> rusqlite::Result<Quote> {
    Ok(Quote {
        id: row.get(0)?,
        text: row.get(1)?,
        author: row.get(2)?,
        source: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

fn not_found(id: i64) -> AppError {
    AppError::NotFound(format!("Quote {id} not found"))
}

fn optional_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn normalized(input: &NewQuote) -> NewQuote {
    NewQuote {
        text: input.text.trim().to_owned(),
        author: optional_text(input.author.as_deref()),
        source: optional_text(input.source.as_deref()),
    }
}

fn insert(conn: &Connection, input: &NewQuote) -> AppResult<Quote> {
    logic::validate_quote(input)?;
    let input = normalized(input);
    let timestamp = now_rfc3339();
    conn.execute(
        "INSERT INTO quotes (text, author, source, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
        params![input.text, input.author, input.source, timestamp],
    )?;
    get(conn, conn.last_insert_rowid())
}

pub fn list(conn: &Connection) -> AppResult<Vec<Quote>> {
    let sql = format!("SELECT {QUOTE_COLUMNS} FROM quotes ORDER BY id DESC");
    let mut statement = conn.prepare(&sql)?;
    let rows = statement.query_map([], row_to_quote)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn get(conn: &Connection, id: i64) -> AppResult<Quote> {
    let sql = format!("SELECT {QUOTE_COLUMNS} FROM quotes WHERE id = ?1");
    conn.query_row(&sql, [id], row_to_quote)
        .optional()?
        .ok_or_else(|| not_found(id))
}

pub fn create(conn: &Connection, input: &NewQuote) -> AppResult<Quote> {
    insert(conn, input)
}

pub fn update(conn: &Connection, id: i64, patch: &QuotePatch) -> AppResult<Quote> {
    let current = get(conn, id)?;
    let next = NewQuote {
        text: patch.text.as_deref().unwrap_or(&current.text).to_owned(),
        author: patch
            .author
            .as_deref()
            .map(|value| optional_text(Some(value)))
            .unwrap_or(current.author.clone()),
        source: patch
            .source
            .as_deref()
            .map(|value| optional_text(Some(value)))
            .unwrap_or(current.source.clone()),
    };
    logic::validate_quote(&next)?;
    let next = normalized(&next);
    conn.execute(
        "UPDATE quotes SET text = ?1, author = ?2, source = ?3, updated_at = ?4 WHERE id = ?5",
        params![next.text, next.author, next.source, now_rfc3339(), id],
    )?;
    get(conn, id)
}

pub fn delete(conn: &Connection, id: i64) -> AppResult<()> {
    let affected = conn.execute("DELETE FROM quotes WHERE id = ?1", [id])?;
    if affected == 0 {
        return Err(not_found(id));
    }
    Ok(())
}

/// Parse before opening the transaction, then deduplicate and insert as one atomic batch.
pub fn import(conn: &mut Connection, text: &str) -> AppResult<ImportQuotesResult> {
    let inputs = logic::parse_import(text)?;
    let transaction = conn.transaction()?;
    let mut known = HashSet::new();
    {
        let mut statement = transaction.prepare("SELECT text, author FROM quotes")?;
        let rows = statement.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
        })?;
        for row in rows {
            let (quote_text, author) = row?;
            known.insert((
                quote_text.trim().to_lowercase(),
                author.unwrap_or_default().trim().to_lowercase(),
            ));
        }
    }

    let mut imported = 0_i64;
    let mut skipped = 0_i64;
    for input in inputs {
        logic::validate_quote(&input)?;
        let input = normalized(&input);
        let key = (
            input.text.trim().to_lowercase(),
            input
                .author
                .as_deref()
                .unwrap_or_default()
                .trim()
                .to_lowercase(),
        );
        if !known.insert(key) {
            skipped += 1;
            continue;
        }
        insert(&transaction, &input)?;
        imported += 1;
    }
    transaction.commit()?;
    Ok(ImportQuotesResult { imported, skipped })
}

pub fn daily(conn: &Connection, date: NaiveDate) -> AppResult<Option<Quote>> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM quotes", [], |row| row.get(0))?;
    let Some(index) = logic::daily_index(date, count as usize) else {
        return Ok(None);
    };
    let sql = format!("SELECT {QUOTE_COLUMNS} FROM quotes ORDER BY id ASC LIMIT 1 OFFSET ?1");
    conn.query_row(&sql, [index as i64], row_to_quote)
        .optional()
        .map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;

    fn input(text: &str, author: Option<&str>, source: Option<&str>) -> NewQuote {
        NewQuote {
            text: text.into(),
            author: author.map(str::to_owned),
            source: source.map(str::to_owned),
        }
    }

    fn is_validation(result: AppResult<impl Sized>) -> bool {
        matches!(result, Err(AppError::Validation(_)))
    }

    #[test]
    fn create_trims_optional_fields_and_list_is_newest_first() {
        let conn = open_in_memory().unwrap();
        let first = create(
            &conn,
            &input("  First  ", Some(" Author "), Some(" Source ")),
        )
        .unwrap();
        let second = create(&conn, &input("Second", Some("  "), None)).unwrap();
        assert_eq!(first.text, "First");
        assert_eq!(first.author.as_deref(), Some("Author"));
        assert_eq!(first.source.as_deref(), Some("Source"));
        assert_eq!(second.author, None);
        let rows = list(&conn).unwrap();
        assert_eq!(
            rows.iter().map(|quote| quote.id).collect::<Vec<_>>(),
            [second.id, first.id]
        );
    }

    #[test]
    fn create_and_update_validate_trimmed_character_lengths() {
        let conn = open_in_memory().unwrap();
        assert!(is_validation(create(&conn, &input("  ", None, None))));
        assert!(is_validation(create(
            &conn,
            &input(&"x".repeat(1_001), None, None)
        )));
        assert!(is_validation(create(
            &conn,
            &input("valid", Some(&"a".repeat(201)), None)
        )));

        let quote = create(&conn, &input("Before", Some("Someone"), Some("Book"))).unwrap();
        let updated = update(
            &conn,
            quote.id,
            &QuotePatch {
                text: Some(" After ".into()),
                author: Some("  ".into()),
                source: None,
            },
        )
        .unwrap();
        assert_eq!(updated.text, "After");
        assert_eq!(updated.author, None);
        assert_eq!(updated.source.as_deref(), Some("Book"));
        assert!(chrono::DateTime::parse_from_rfc3339(&updated.updated_at).is_ok());
        assert!(is_validation(update(
            &conn,
            quote.id,
            &QuotePatch {
                text: Some("  ".into()),
                ..QuotePatch::default()
            }
        )));
    }

    #[test]
    fn update_and_delete_missing_quotes_return_not_found() {
        let conn = open_in_memory().unwrap();
        assert!(matches!(get(&conn, 42), Err(AppError::NotFound(_))));
        assert!(matches!(
            update(&conn, 42, &QuotePatch::default()),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(delete(&conn, 42), Err(AppError::NotFound(_))));
    }

    #[test]
    fn import_is_atomic_and_skips_case_insensitive_duplicates() {
        let mut conn = open_in_memory().unwrap();
        create(&conn, &input("Existing", Some("Author"), None)).unwrap();
        let result = import(
            &mut conn,
            "existing — AUTHOR\nNew quote — Writer\nnew QUOTE — writer\n‘Another’ ~ Source",
        )
        .unwrap();
        assert_eq!(
            result,
            ImportQuotesResult {
                imported: 2,
                skipped: 2
            }
        );
        assert_eq!(list(&conn).unwrap().len(), 3);

        let before = list(&conn).unwrap();
        let error = import(&mut conn, "Would be valid\n\"\"").unwrap_err();
        assert!(matches!(error, AppError::Validation(message) if message.contains("Line 2")));
        assert_eq!(list(&conn).unwrap(), before);
    }

    #[test]
    fn daily_returns_none_for_empty_and_selects_in_ascending_id_order() {
        let conn = open_in_memory().unwrap();
        let date = NaiveDate::from_ymd_opt(1970, 1, 2).unwrap();
        assert_eq!(daily(&conn, date).unwrap(), None);
        let first = create(&conn, &input("First", None, None)).unwrap();
        let second = create(&conn, &input("Second", None, None)).unwrap();
        assert_eq!(daily(&conn, date).unwrap(), Some(second));
        assert_eq!(
            daily(&conn, NaiveDate::from_ymd_opt(1970, 1, 1).unwrap()).unwrap(),
            Some(first)
        );
    }
}
