//! SQL for habits and checks (SPEC §5, §6).
#![allow(dead_code)] // TODO(T5): remove once commands call into the repo.

use std::collections::{HashMap, HashSet};

use chrono::{NaiveDate, SecondsFormat, Utc};
use rusqlite::{Connection, OptionalExtension, Row, params, params_from_iter};

use super::model::{EVERY_DAY, Habit, HabitColor, HabitPatch, NewHabit};
use crate::error::{AppError, AppResult};

const NAME_MAX: usize = 80;
const DESCRIPTION_MAX: usize = 500;
const DATE_FMT: &str = "%Y-%m-%d";

const HABIT_COLUMNS: &str = "id, name, description, color, schedule_days, sort_order, \
     archived_at, created_at, updated_at";

/// Current time as an RFC 3339 UTC string, e.g. `2026-10-31T12:34:56.789Z`.
fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn date_str(date: NaiveDate) -> String {
    date.format(DATE_FMT).to_string()
}

/// Trims a description; blank becomes `None`.
fn normalize_description(description: Option<&str>) -> Option<String> {
    description
        .map(str::trim)
        .filter(|d| !d.is_empty())
        .map(str::to_owned)
}

/// Single place for habit field validation. Expects already-trimmed `name`/`description`.
fn validate(name: &str, description: Option<&str>, schedule_days: u8) -> AppResult<()> {
    let name_len = name.chars().count();
    if name_len == 0 {
        return Err(AppError::Validation("Name is required.".into()));
    }
    if name_len > NAME_MAX {
        return Err(AppError::Validation(format!(
            "Name must be at most {NAME_MAX} characters."
        )));
    }
    if description.is_some_and(|d| d.chars().count() > DESCRIPTION_MAX) {
        return Err(AppError::Validation(format!(
            "Description must be at most {DESCRIPTION_MAX} characters."
        )));
    }
    if !(1..=EVERY_DAY).contains(&schedule_days) {
        return Err(AppError::Validation(
            "Schedule must include at least one day of the week.".into(),
        ));
    }
    Ok(())
}

fn row_to_habit(row: &Row<'_>) -> rusqlite::Result<Habit> {
    let color: String = row.get("color")?;
    let color = HabitColor::parse(&color).ok_or_else(|| {
        rusqlite::Error::FromSqlConversionFailure(
            3,
            rusqlite::types::Type::Text,
            format!("unknown habit color {color:?}").into(),
        )
    })?;
    let schedule_days: i64 = row.get("schedule_days")?;
    let schedule_days = u8::try_from(schedule_days).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(4, rusqlite::types::Type::Integer, e.into())
    })?;
    Ok(Habit {
        id: row.get("id")?,
        name: row.get("name")?,
        description: row.get("description")?,
        color,
        schedule_days,
        sort_order: row.get("sort_order")?,
        archived_at: row.get("archived_at")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn not_found(id: i64) -> AppError {
    AppError::NotFound(format!("Habit {id} not found."))
}

fn next_sort_order(conn: &Connection) -> AppResult<i64> {
    Ok(conn.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM habits",
        [],
        |r| r.get(0),
    )?)
}

fn ensure_exists(conn: &Connection, id: i64) -> AppResult<()> {
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM habits WHERE id = ?1)",
        [id],
        |r| r.get(0),
    )?;
    if exists { Ok(()) } else { Err(not_found(id)) }
}

/// Habits ordered by `sort_order`; archived habits only when `include_archived`.
pub fn list(conn: &Connection, include_archived: bool) -> AppResult<Vec<Habit>> {
    let sql = format!(
        "SELECT {HABIT_COLUMNS} FROM habits {} ORDER BY sort_order, id",
        if include_archived {
            ""
        } else {
            "WHERE archived_at IS NULL"
        }
    );
    let mut stmt = conn.prepare(&sql)?;
    let habits = stmt
        .query_map([], row_to_habit)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(habits)
}

/// `NotFound` if the id doesn't exist.
pub fn get(conn: &Connection, id: i64) -> AppResult<Habit> {
    conn.query_row(
        &format!("SELECT {HABIT_COLUMNS} FROM habits WHERE id = ?1"),
        [id],
        row_to_habit,
    )
    .optional()?
    .ok_or_else(|| not_found(id))
}

/// Validates input; new habits go to the end (`sort_order = max + 1`).
pub fn create(conn: &Connection, input: &NewHabit) -> AppResult<Habit> {
    let name = input.name.trim();
    let description = normalize_description(input.description.as_deref());
    let color = input.color.unwrap_or_default();
    let schedule_days = input.schedule_days.unwrap_or(EVERY_DAY);
    validate(name, description.as_deref(), schedule_days)?;

    let ts = now();
    conn.execute(
        "INSERT INTO habits (name, description, color, schedule_days, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![
            name,
            description,
            color.as_str(),
            schedule_days,
            next_sort_order(conn)?,
            ts
        ],
    )?;
    get(conn, conn.last_insert_rowid())
}

/// Applies only the fields present in `patch`; bumps `updated_at`.
pub fn update(conn: &Connection, id: i64, patch: &HabitPatch) -> AppResult<Habit> {
    let current = get(conn, id)?;
    let name = patch
        .name
        .as_deref()
        .map(str::trim)
        .unwrap_or(&current.name)
        .to_owned();
    // `Some("")` (or whitespace) clears; `None` leaves unchanged.
    let description = match &patch.description {
        Some(d) => normalize_description(Some(d)),
        None => current.description,
    };
    let color = patch.color.unwrap_or(current.color);
    let schedule_days = patch.schedule_days.unwrap_or(current.schedule_days);
    validate(&name, description.as_deref(), schedule_days)?;

    conn.execute(
        "UPDATE habits SET name = ?1, description = ?2, color = ?3, schedule_days = ?4, updated_at = ?5
         WHERE id = ?6",
        params![name, description, color.as_str(), schedule_days, now(), id],
    )?;
    get(conn, id)
}

/// Archive (sets `archived_at`) or unarchive (clears it and moves the habit to the end).
/// Idempotent: archiving an archived habit (or unarchiving an active one) changes nothing.
pub fn set_archived(conn: &Connection, id: i64, archived: bool) -> AppResult<Habit> {
    let current = get(conn, id)?;
    if current.archived_at.is_some() == archived {
        return Ok(current);
    }
    let ts = now();
    if archived {
        conn.execute(
            "UPDATE habits SET archived_at = ?1, updated_at = ?1 WHERE id = ?2",
            params![ts, id],
        )?;
    } else {
        conn.execute(
            "UPDATE habits SET archived_at = NULL, sort_order = ?1, updated_at = ?2 WHERE id = ?3",
            params![next_sort_order(conn)?, ts, id],
        )?;
    }
    get(conn, id)
}

/// Permanently deletes the habit; checks cascade.
pub fn delete(conn: &Connection, id: i64) -> AppResult<()> {
    match conn.execute("DELETE FROM habits WHERE id = ?1", [id])? {
        0 => Err(not_found(id)),
        _ => Ok(()),
    }
}

/// `ids` must be exactly the set of active habit ids; runs in a transaction.
pub fn reorder(conn: &Connection, ids: &[i64]) -> AppResult<()> {
    let tx = conn.unchecked_transaction()?;

    let requested: HashSet<i64> = ids.iter().copied().collect();
    if requested.len() != ids.len() {
        return Err(AppError::Validation(
            "Reorder list contains duplicate ids.".into(),
        ));
    }
    let active: HashSet<i64> = {
        let mut stmt = tx.prepare("SELECT id FROM habits WHERE archived_at IS NULL")?;
        stmt.query_map([], |r| r.get(0))?
            .collect::<rusqlite::Result<_>>()?
    };
    if requested != active {
        return Err(AppError::Validation(
            "Reorder list must contain exactly the active habits.".into(),
        ));
    }

    {
        let mut stmt = tx.prepare("UPDATE habits SET sort_order = ?1 WHERE id = ?2")?;
        for (position, id) in ids.iter().enumerate() {
            stmt.execute(params![position as i64, id])?;
        }
    }
    tx.commit()?;
    Ok(())
}

/// Idempotent check / un-check of `habit_id` on `date`.
pub fn set_check(conn: &Connection, habit_id: i64, date: NaiveDate, done: bool) -> AppResult<()> {
    ensure_exists(conn, habit_id)?;
    let date = date_str(date);
    if done {
        conn.execute(
            "INSERT OR IGNORE INTO habit_checks (habit_id, date, created_at) VALUES (?1, ?2, ?3)",
            params![habit_id, date, now()],
        )?;
    } else {
        conn.execute(
            "DELETE FROM habit_checks WHERE habit_id = ?1 AND date = ?2",
            params![habit_id, date],
        )?;
    }
    Ok(())
}

/// Checked dates per habit within `from..=to` (inclusive).
/// Every requested id gets an entry (possibly empty).
pub fn checks_between(
    conn: &Connection,
    habit_ids: &[i64],
    from: NaiveDate,
    to: NaiveDate,
) -> AppResult<HashMap<i64, HashSet<NaiveDate>>> {
    let mut out: HashMap<i64, HashSet<NaiveDate>> =
        habit_ids.iter().map(|&id| (id, HashSet::new())).collect();
    if habit_ids.is_empty() || from > to {
        return Ok(out);
    }

    let placeholders = vec!["?"; habit_ids.len()].join(", ");
    let sql = format!(
        "SELECT habit_id, date FROM habit_checks
         WHERE date >= ? AND date <= ? AND habit_id IN ({placeholders})"
    );
    let bounds = [date_str(from), date_str(to)];
    let args = bounds
        .iter()
        .map(|s| s as &dyn rusqlite::ToSql)
        .chain(habit_ids.iter().map(|id| id as &dyn rusqlite::ToSql));

    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query(params_from_iter(args))?;
    while let Some(row) = rows.next()? {
        let habit_id: i64 = row.get(0)?;
        let raw: String = row.get(1)?;
        let date = NaiveDate::parse_from_str(&raw, DATE_FMT)
            .map_err(|e| AppError::Database(format!("invalid check date {raw:?}: {e}")))?;
        out.entry(habit_id).or_default().insert(date);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;

    fn d(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, DATE_FMT).unwrap()
    }

    fn new(name: &str) -> NewHabit {
        NewHabit {
            name: name.into(),
            ..Default::default()
        }
    }

    fn is_validation<T: std::fmt::Debug>(r: AppResult<T>) -> bool {
        matches!(r, Err(AppError::Validation(_)))
    }

    fn check_count(conn: &Connection, habit_id: i64) -> i64 {
        conn.query_row(
            "SELECT COUNT(*) FROM habit_checks WHERE habit_id = ?1",
            [habit_id],
            |r| r.get(0),
        )
        .unwrap()
    }

    #[test]
    fn create_applies_defaults_and_trims() {
        let conn = open_in_memory().unwrap();
        let h = create(
            &conn,
            &NewHabit {
                name: "  Read  ".into(),
                description: Some("  20 pages ".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(h.name, "Read");
        assert_eq!(h.description.as_deref(), Some("20 pages"));
        assert_eq!(h.color, HabitColor::Slate);
        assert_eq!(h.schedule_days, EVERY_DAY);
        assert_eq!(h.sort_order, 0);
        assert!(h.archived_at.is_none());
        assert_eq!(h.created_at, h.updated_at);
        assert!(chrono::DateTime::parse_from_rfc3339(&h.created_at).is_ok());
        assert_eq!(get(&conn, h.id).unwrap(), h);

        let blank = create(
            &conn,
            &NewHabit {
                name: "Walk".into(),
                description: Some("   ".into()),
                color: Some(HabitColor::Green),
                schedule_days: Some(0b001_1111),
            },
        )
        .unwrap();
        assert_eq!(blank.description, None);
        assert_eq!(blank.color, HabitColor::Green);
        assert_eq!(blank.schedule_days, 31);
    }

    #[test]
    fn create_appends_and_list_is_ordered() {
        let conn = open_in_memory().unwrap();
        let a = create(&conn, &new("A")).unwrap();
        let b = create(&conn, &new("B")).unwrap();
        let c = create(&conn, &new("C")).unwrap();
        assert_eq!((a.sort_order, b.sort_order, c.sort_order), (0, 1, 2));
        let names: Vec<_> = list(&conn, false)
            .unwrap()
            .into_iter()
            .map(|h| h.name)
            .collect();
        assert_eq!(names, ["A", "B", "C"]);
    }

    #[test]
    fn get_missing_is_not_found() {
        let conn = open_in_memory().unwrap();
        assert!(matches!(get(&conn, 42), Err(AppError::NotFound(_))));
        assert!(matches!(
            update(&conn, 42, &HabitPatch::default()),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            set_archived(&conn, 42, true),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(delete(&conn, 42), Err(AppError::NotFound(_))));
        assert!(matches!(
            set_check(&conn, 42, d("2026-10-31"), true),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn validation_errors() {
        let conn = open_in_memory().unwrap();
        assert!(is_validation(create(&conn, &new(""))));
        assert!(is_validation(create(&conn, &new("   "))));
        assert!(is_validation(create(&conn, &new(&"x".repeat(81)))));
        assert!(create(&conn, &new(&"é".repeat(80))).is_ok()); // chars, not bytes
        assert!(is_validation(create(
            &conn,
            &NewHabit {
                name: "ok".into(),
                description: Some("d".repeat(501)),
                ..Default::default()
            }
        )));
        for bad in [0u8, 128, 255] {
            assert!(is_validation(create(
                &conn,
                &NewHabit {
                    name: "ok".into(),
                    schedule_days: Some(bad),
                    ..Default::default()
                }
            )));
        }

        let h = create(&conn, &new("Valid")).unwrap();
        assert!(is_validation(update(
            &conn,
            h.id,
            &HabitPatch {
                name: Some(" ".into()),
                ..Default::default()
            }
        )));
        assert!(is_validation(update(
            &conn,
            h.id,
            &HabitPatch {
                schedule_days: Some(0),
                ..Default::default()
            }
        )));
        assert_eq!(get(&conn, h.id).unwrap(), h); // failed updates change nothing
    }

    #[test]
    fn update_patch_semantics() {
        let conn = open_in_memory().unwrap();
        let h = create(
            &conn,
            &NewHabit {
                name: "Read".into(),
                description: Some("Books".into()),
                color: Some(HabitColor::Blue),
                schedule_days: Some(31),
            },
        )
        .unwrap();

        // Only name changes; everything else stays.
        let u = update(
            &conn,
            h.id,
            &HabitPatch {
                name: Some("  Read more ".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(u.name, "Read more");
        assert_eq!(u.description.as_deref(), Some("Books"));
        assert_eq!(u.color, HabitColor::Blue);
        assert_eq!(u.schedule_days, 31);
        assert_eq!(u.sort_order, h.sort_order);
        assert_eq!(u.created_at, h.created_at);
        assert!(u.updated_at >= h.updated_at);

        // Color + schedule only.
        let u = update(
            &conn,
            h.id,
            &HabitPatch {
                color: Some(HabitColor::Pink),
                schedule_days: Some(96),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(
            (u.name.as_str(), u.color, u.schedule_days),
            ("Read more", HabitColor::Pink, 96)
        );
        assert_eq!(u.description.as_deref(), Some("Books"));

        // Description: trimmed when set, cleared by "".
        let u = update(
            &conn,
            h.id,
            &HabitPatch {
                description: Some("  Novels ".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(u.description.as_deref(), Some("Novels"));
        let u = update(
            &conn,
            h.id,
            &HabitPatch {
                description: Some(String::new()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(u.description, None);
    }

    #[test]
    fn archive_and_unarchive() {
        let conn = open_in_memory().unwrap();
        let a = create(&conn, &new("A")).unwrap();
        let b = create(&conn, &new("B")).unwrap();
        let c = create(&conn, &new("C")).unwrap();
        set_check(&conn, a.id, d("2026-10-30"), true).unwrap();

        let archived = set_archived(&conn, a.id, true).unwrap();
        assert!(archived.archived_at.is_some());
        let active: Vec<_> = list(&conn, false)
            .unwrap()
            .into_iter()
            .map(|h| h.id)
            .collect();
        assert_eq!(active, [b.id, c.id]);
        let all: Vec<_> = list(&conn, true)
            .unwrap()
            .into_iter()
            .map(|h| h.id)
            .collect();
        assert_eq!(all, [a.id, b.id, c.id]);

        // Archiving again is a no-op.
        assert_eq!(set_archived(&conn, a.id, true).unwrap(), archived);

        // Unarchive moves to the end and keeps history.
        let restored = set_archived(&conn, a.id, false).unwrap();
        assert!(restored.archived_at.is_none());
        let active: Vec<_> = list(&conn, false)
            .unwrap()
            .into_iter()
            .map(|h| h.id)
            .collect();
        assert_eq!(active, [b.id, c.id, a.id]);
        assert_eq!(check_count(&conn, a.id), 1);
    }

    #[test]
    fn delete_cascades_checks() {
        let conn = open_in_memory().unwrap();
        let a = create(&conn, &new("A")).unwrap();
        let b = create(&conn, &new("B")).unwrap();
        set_check(&conn, a.id, d("2026-10-29"), true).unwrap();
        set_check(&conn, a.id, d("2026-10-30"), true).unwrap();
        set_check(&conn, b.id, d("2026-10-30"), true).unwrap();

        delete(&conn, a.id).unwrap();
        assert!(matches!(get(&conn, a.id), Err(AppError::NotFound(_))));
        assert_eq!(check_count(&conn, a.id), 0);
        assert_eq!(check_count(&conn, b.id), 1);
        assert!(matches!(delete(&conn, a.id), Err(AppError::NotFound(_))));
    }

    #[test]
    fn reorder_sets_order_and_rejects_bad_sets() {
        let conn = open_in_memory().unwrap();
        let a = create(&conn, &new("A")).unwrap();
        let b = create(&conn, &new("B")).unwrap();
        let c = create(&conn, &new("C")).unwrap();
        let x = create(&conn, &new("X")).unwrap();
        set_archived(&conn, x.id, true).unwrap();

        reorder(&conn, &[c.id, a.id, b.id]).unwrap();
        let ids: Vec<_> = list(&conn, false)
            .unwrap()
            .into_iter()
            .map(|h| h.id)
            .collect();
        assert_eq!(ids, [c.id, a.id, b.id]);

        let before = list(&conn, true).unwrap();
        assert!(is_validation(reorder(&conn, &[a.id, b.id]))); // incomplete
        assert!(is_validation(reorder(&conn, &[a.id, b.id, c.id, x.id]))); // includes archived
        assert!(is_validation(reorder(&conn, &[a.id, b.id, c.id, 999]))); // unknown id
        assert!(is_validation(reorder(&conn, &[a.id, a.id, b.id, c.id]))); // duplicate
        assert!(is_validation(reorder(&conn, &[])));
        assert_eq!(list(&conn, true).unwrap(), before); // nothing changed

        // New habits still append after a reorder.
        let d_ = create(&conn, &new("D")).unwrap();
        assert_eq!(list(&conn, false).unwrap().last().unwrap().id, d_.id);
    }

    #[test]
    fn reorder_empty_with_no_active_habits() {
        let conn = open_in_memory().unwrap();
        reorder(&conn, &[]).unwrap();
    }

    #[test]
    fn set_check_is_idempotent_and_uncheck_missing_is_noop() {
        let conn = open_in_memory().unwrap();
        let h = create(&conn, &new("A")).unwrap();
        let day = d("2026-10-31");

        set_check(&conn, h.id, day, false).unwrap(); // un-check nothing
        assert_eq!(check_count(&conn, h.id), 0);

        set_check(&conn, h.id, day, true).unwrap();
        set_check(&conn, h.id, day, true).unwrap();
        assert_eq!(check_count(&conn, h.id), 1);
        let stored: String = conn
            .query_row("SELECT date FROM habit_checks", [], |r| r.get(0))
            .unwrap();
        assert_eq!(stored, "2026-10-31");

        set_check(&conn, h.id, day, false).unwrap();
        set_check(&conn, h.id, day, false).unwrap();
        assert_eq!(check_count(&conn, h.id), 0);
    }

    #[test]
    fn checks_between_is_inclusive_and_filtered() {
        let conn = open_in_memory().unwrap();
        let a = create(&conn, &new("A")).unwrap();
        let b = create(&conn, &new("B")).unwrap();
        let c = create(&conn, &new("C")).unwrap();
        for s in [
            "2026-10-24",
            "2026-10-25",
            "2026-10-28",
            "2026-10-31",
            "2026-11-01",
        ] {
            set_check(&conn, a.id, d(s), true).unwrap();
        }
        set_check(&conn, b.id, d("2026-10-25"), true).unwrap();
        set_check(&conn, c.id, d("2026-10-26"), true).unwrap();

        let m = checks_between(&conn, &[a.id, b.id], d("2026-10-25"), d("2026-10-31")).unwrap();
        assert_eq!(m.len(), 2);
        assert_eq!(
            m[&a.id],
            HashSet::from([d("2026-10-25"), d("2026-10-28"), d("2026-10-31")])
        );
        assert_eq!(m[&b.id], HashSet::from([d("2026-10-25")]));
        assert!(!m.contains_key(&c.id));

        // Requested ids without checks get an empty set.
        let m = checks_between(&conn, &[c.id], d("2026-10-27"), d("2026-10-31")).unwrap();
        assert!(m[&c.id].is_empty());

        // Single-day range; empty id list; inverted range.
        let m = checks_between(&conn, &[a.id], d("2026-11-01"), d("2026-11-01")).unwrap();
        assert_eq!(m[&a.id], HashSet::from([d("2026-11-01")]));
        assert!(
            checks_between(&conn, &[], d("2026-01-01"), d("2026-12-31"))
                .unwrap()
                .is_empty()
        );
        let m = checks_between(&conn, &[a.id], d("2026-10-31"), d("2026-10-01")).unwrap();
        assert!(m[&a.id].is_empty());
    }
}
