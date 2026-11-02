use chrono::{SecondsFormat, Utc};
use rusqlite::{Connection, OptionalExtension, Row, params};

use crate::error::{AppError, AppResult};
use crate::themes::logic;
use crate::themes::model::{AnnualTheme, ThemeInput};

const COLUMNS: &str = "year, title, description, created_at, updated_at";

fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn row_to_theme(row: &Row<'_>) -> rusqlite::Result<AnnualTheme> {
    Ok(AnnualTheme {
        year: row.get("year")?,
        title: row.get("title")?,
        description: row.get("description")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn list(conn: &Connection) -> AppResult<Vec<AnnualTheme>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLUMNS} FROM annual_themes ORDER BY year DESC"
    ))?;
    let themes = stmt
        .query_map([], row_to_theme)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(themes)
}

pub fn get(conn: &Connection, year: i32) -> AppResult<Option<AnnualTheme>> {
    logic::validate_year(year)?;
    Ok(conn
        .query_row(
            &format!("SELECT {COLUMNS} FROM annual_themes WHERE year = ?1"),
            [year],
            row_to_theme,
        )
        .optional()?)
}

pub fn set(conn: &Connection, year: i32, input: &ThemeInput) -> AppResult<AnnualTheme> {
    logic::validate_year(year)?;
    let (title, description) = logic::normalize_input(input)?;
    let timestamp = now();
    conn.execute(
        "INSERT INTO annual_themes (year, title, description, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)
         ON CONFLICT(year) DO UPDATE SET
           title = excluded.title,
           description = excluded.description,
           updated_at = excluded.updated_at",
        params![year, title, description, timestamp],
    )?;
    get(conn, year)?.ok_or_else(|| AppError::Database("theme disappeared after save".into()))
}

pub fn delete(conn: &Connection, year: i32) -> AppResult<()> {
    logic::validate_year(year)?;
    if conn.execute("DELETE FROM annual_themes WHERE year = ?1", [year])? == 0 {
        return Err(AppError::NotFound(format!("Theme for {year} not found.")));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        crate::db::open_in_memory().unwrap()
    }

    fn input(title: &str, description: Option<&str>) -> ThemeInput {
        ThemeInput {
            title: title.into(),
            description: description.map(str::to_owned),
        }
    }

    #[test]
    fn set_upserts_and_preserves_created_at() {
        let conn = db();
        let created = set(
            &conn,
            2026,
            &input("  Practice ", Some("  Be consistent  ")),
        )
        .unwrap();
        assert_eq!(created.title, "Practice");
        assert_eq!(created.description.as_deref(), Some("Be consistent"));

        let updated = set(&conn, 2026, &input("Focus", Some(" \n "))).unwrap();
        assert_eq!(updated.title, "Focus");
        assert_eq!(updated.description, None);
        assert_eq!(updated.created_at, created.created_at);
        assert_eq!(get(&conn, 2026).unwrap(), Some(updated));
    }

    #[test]
    fn lists_newest_year_first_and_get_is_nullable() {
        let conn = db();
        assert_eq!(get(&conn, 2026).unwrap(), None);
        set(&conn, 2024, &input("Earlier", None)).unwrap();
        set(&conn, 2028, &input("Later", None)).unwrap();
        set(&conn, 2026, &input("Current", None)).unwrap();

        let years: Vec<_> = list(&conn)
            .unwrap()
            .into_iter()
            .map(|theme| theme.year)
            .collect();
        assert_eq!(years, [2028, 2026, 2024]);
    }

    #[test]
    fn rejects_invalid_year_and_text() {
        let conn = db();
        assert!(matches!(
            set(&conn, 1899, &input("Valid", None)),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            set(&conn, 2026, &input("  ", None)),
            Err(AppError::Validation(_))
        ));
    }

    #[test]
    fn deleting_missing_theme_is_not_found() {
        let conn = db();
        assert!(matches!(delete(&conn, 2026), Err(AppError::NotFound(_))));
        set(&conn, 2026, &input("Theme", None)).unwrap();
        assert!(delete(&conn, 2026).is_ok());
        assert!(matches!(delete(&conn, 2026), Err(AppError::NotFound(_))));
    }
}
