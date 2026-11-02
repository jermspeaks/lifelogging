//! Pure goal calculations (SPEC §19).

use chrono::NaiveDate;

use crate::error::{AppError, AppResult};

/// Rounded whole-percent progress, capped at 100; milestone goals have no percentage.
pub fn percent(current: f64, target: Option<f64>) -> Option<i64> {
    target.map(|target| ((current / target * 100.0).round()).clamp(0.0, 100.0) as i64)
}

/// Days from `today` until the due date. Negative values indicate overdue goals.
pub fn days_left(due_date: Option<&str>, today: &str) -> AppResult<Option<i64>> {
    let today = parse_date(today)?;
    due_date
        .map(|due_date| {
            let due_date = parse_date(due_date)?;
            Ok(due_date.signed_duration_since(today).num_days())
        })
        .transpose()
}

/// Strict `YYYY-MM-DD`; rejects non-padded or impossible calendar dates.
pub fn parse_date(value: &str) -> AppResult<NaiveDate> {
    let bytes = value.as_bytes();
    if bytes.len() != 10
        || bytes.iter().enumerate().any(|(index, byte)| match index {
            4 | 7 => *byte != b'-',
            _ => !byte.is_ascii_digit(),
        })
    {
        return Err(AppError::Validation(format!(
            "invalid date '{value}': expected YYYY-MM-DD"
        )));
    }
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| AppError::Validation(format!("invalid date '{value}'")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percent_rounds_and_caps_progress() {
        for (current, target, expected) in [
            (0.0, 10.0, 0),
            (1.24, 10.0, 12),
            (1.25, 10.0, 13),
            (14.0, 24.0, 58),
            (11.0, 10.0, 100),
        ] {
            assert_eq!(percent(current, Some(target)), Some(expected));
        }
        assert_eq!(percent(10.0, None), None);
    }

    #[test]
    fn days_left_handles_due_today_future_overdue_and_milestone() {
        let today = "2026-10-31";
        assert_eq!(days_left(None, today).unwrap(), None);
        assert_eq!(days_left(Some(today), today).unwrap(), Some(0));
        assert_eq!(days_left(Some("2026-11-12"), today).unwrap(), Some(12));
        assert_eq!(days_left(Some("2026-10-28"), today).unwrap(), Some(-3));
    }

    #[test]
    fn days_left_rejects_invalid_dates() {
        assert!(matches!(
            days_left(Some("2026-02-30"), "2026-02-01"),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            days_left(None, "2026-2-1"),
            Err(AppError::Validation(_))
        ));
    }
}
