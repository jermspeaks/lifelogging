//! Pure spaced-review rules (SPEC §18 rules 2–7).

use chrono::{Days, NaiveDate};

use crate::error::{AppError, AppResult};

pub const INTERVALS: [i64; 7] = [1, 3, 7, 14, 30, 60, 120];

/// Advances a review stage without overflowing; stages beyond the ladder stay capped at six.
pub fn next_stage(stage: i64) -> i64 {
    stage.saturating_add(1).max(0)
}

/// Returns the interval for a stage, clamped to the final ladder step.
pub fn interval(stage: i64) -> i64 {
    INTERVALS[stage.clamp(0, (INTERVALS.len() - 1) as i64) as usize]
}

/// Adds the interval for `stage`, reporting dates too close to year 9999 as validation errors.
pub fn review_date(today: NaiveDate, stage: i64) -> AppResult<NaiveDate> {
    today
        .checked_add_days(Days::new(interval(stage) as u64))
        .ok_or_else(|| {
            AppError::Validation("Review date is outside the supported date range.".into())
        })
}

/// Keep advances the stage and schedules from today using the new stage's interval.
pub fn keep(stage: i64, today: NaiveDate) -> AppResult<(i64, NaiveDate)> {
    let stage = next_stage(stage);
    Ok((stage, review_date(today, stage)?))
}

/// Snooze and unarchive both schedule one day from today without changing historical review data.
pub fn snooze(today: NaiveDate) -> AppResult<NaiveDate> {
    today.checked_add_days(Days::new(1)).ok_or_else(|| {
        AppError::Validation("Review date is outside the supported date range.".into())
    })
}

pub fn unarchive(today: NaiveDate) -> AppResult<NaiveDate> {
    snooze(today)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(value: &str) -> NaiveDate {
        NaiveDate::parse_from_str(value, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn interval_ladder_and_stage_cap() {
        for (stage, days) in INTERVALS.into_iter().enumerate() {
            assert_eq!(interval(stage as i64), days);
        }
        for stage in 6..100 {
            assert_eq!(interval(stage), 120);
        }
        assert_eq!(interval(100), 120);
        assert_eq!(interval(-1), 1);
        assert_eq!(next_stage(0), 1);
        assert_eq!(next_stage(5), 6);
        assert_eq!(next_stage(6), 7);
        assert_eq!(next_stage(i64::MAX), i64::MAX);
    }

    #[test]
    fn keep_uses_the_new_stage_and_caps_its_interval() {
        assert_eq!(keep(0, d("2026-10-31")).unwrap(), (1, d("2026-11-03")));
        assert_eq!(keep(5, d("2026-10-31")).unwrap(), (6, d("2027-02-28")));
        assert_eq!(keep(6, d("2026-10-31")).unwrap(), (7, d("2027-02-28")));
    }

    #[test]
    fn snooze_and_unarchive_schedule_tomorrow_without_stage_changes() {
        assert_eq!(snooze(d("2026-10-31")).unwrap(), d("2026-11-01"));
        assert_eq!(unarchive(d("2024-02-28")).unwrap(), d("2024-02-29"));
    }

    #[test]
    fn schedule_date_overflow_is_reported() {
        assert!(matches!(
            snooze(NaiveDate::MAX),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            review_date(NaiveDate::MAX, 0),
            Err(AppError::Validation(_))
        ));
    }
}
