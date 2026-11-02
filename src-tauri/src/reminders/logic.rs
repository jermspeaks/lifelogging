//! Pure reminder validation, ordering, and due-set rules (SPEC §17).

use std::cmp::Ordering;

use crate::dates;
use crate::error::{AppError, AppResult};
use crate::reminders::model::Reminder;

pub const TITLE_MAX: usize = 200;
pub const NOTES_MAX: usize = 1_000;

/// Sort by date, untimed first, then time, then stable ID.
pub fn compare_order(left: &Reminder, right: &Reminder) -> Ordering {
    left.due_date
        .cmp(&right.due_date)
        .then_with(|| left.due_time.is_some().cmp(&right.due_time.is_some()))
        .then_with(|| left.due_time.cmp(&right.due_time))
        .then_with(|| left.id.cmp(&right.id))
}

/// An incomplete reminder is due when its due date has arrived. A reminder
/// completed today also belongs to today's set, even if its due date is later.
pub fn is_due(reminder: &Reminder, today: &str) -> bool {
    reminder.completed_on.as_deref() == Some(today)
        || (reminder.completed_on.is_none() && reminder.due_date.as_str() <= today)
}

pub fn validate_input(
    title: &str,
    notes: Option<&str>,
    due_date: &str,
    due_time: Option<&str>,
) -> AppResult<()> {
    let title_len = title.trim().chars().count();
    if title_len == 0 {
        return Err(AppError::Validation("Title is required.".into()));
    }
    if title_len > TITLE_MAX {
        return Err(AppError::Validation(format!(
            "Title must be at most {TITLE_MAX} characters."
        )));
    }
    if notes.is_some_and(|value| value.chars().count() > NOTES_MAX) {
        return Err(AppError::Validation(format!(
            "Notes must be at most {NOTES_MAX} characters."
        )));
    }
    dates::parse_date(due_date)?;
    if let Some(time) = due_time {
        dates::parse_time(time)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reminder(
        id: i64,
        due_date: &str,
        due_time: Option<&str>,
        completed_on: Option<&str>,
    ) -> Reminder {
        Reminder {
            id,
            title: format!("Reminder {id}"),
            notes: None,
            due_date: due_date.into(),
            due_time: due_time.map(str::to_owned),
            completed_on: completed_on.map(str::to_owned),
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn sorts_date_then_untimed_then_time_then_id() {
        let mut reminders = [
            reminder(4, "2026-11-02", Some("09:00"), None),
            reminder(3, "2026-11-01", Some("12:00"), None),
            reminder(2, "2026-11-01", None, None),
            reminder(1, "2026-11-01", Some("09:00"), None),
            reminder(5, "2026-11-01", Some("09:00"), None),
        ];
        reminders.sort_by(compare_order);
        assert_eq!(
            reminders.iter().map(|item| item.id).collect::<Vec<_>>(),
            [2, 1, 5, 3, 4]
        );
    }

    #[test]
    fn due_set_contains_overdue_and_due_today_incomplete_and_done_today() {
        let cases = [
            (reminder(1, "2026-10-30", None, None), true),
            (reminder(2, "2026-10-31", Some("23:59"), None), true),
            (reminder(3, "2026-11-01", None, None), false),
            (reminder(4, "2026-10-30", None, Some("2026-10-30")), false),
            (reminder(5, "2026-11-03", None, Some("2026-10-31")), true),
        ];
        for (item, expected) in cases {
            assert_eq!(is_due(&item, "2026-10-31"), expected, "id {}", item.id);
        }
    }

    #[test]
    fn validates_limits_and_strict_date_and_time() {
        assert!(validate_input("a", None, "2026-10-31", Some("23:59")).is_ok());
        assert!(validate_input("  ", None, "2026-10-31", None).is_err());
        assert!(validate_input(&"x".repeat(TITLE_MAX + 1), None, "2026-10-31", None).is_err());
        assert!(
            validate_input("ok", Some(&"x".repeat(NOTES_MAX + 1)), "2026-10-31", None).is_err()
        );
        assert!(validate_input("ok", None, "2026-2-1", None).is_err());
        assert!(validate_input("ok", None, "2026-10-31", Some("24:00")).is_err());
    }
}
