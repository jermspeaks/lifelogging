//! Shared strict date/time parsing and timestamp helpers (SPEC §12).

use chrono::{NaiveDate, NaiveTime, SecondsFormat, Utc};

use crate::error::{AppError, AppResult};

pub fn parse_date(value: &str) -> AppResult<NaiveDate> {
    if value.len() != 10
        || value.as_bytes()[4] != b'-'
        || value.as_bytes()[7] != b'-'
        || !value
            .bytes()
            .enumerate()
            .all(|(i, b)| matches!(i, 4 | 7) || b.is_ascii_digit())
    {
        return Err(AppError::Validation("Date must be YYYY-MM-DD".into()));
    }
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| AppError::Validation("Date must be a valid YYYY-MM-DD date".into()))
}

#[allow(dead_code)] // Retained for upcoming modules with local-time fields (SPEC §12).
pub fn parse_time(value: &str) -> AppResult<NaiveTime> {
    if value.len() != 5
        || value.as_bytes()[2] != b':'
        || !value
            .bytes()
            .enumerate()
            .all(|(i, b)| i == 2 || b.is_ascii_digit())
    {
        return Err(AppError::Validation("Time must be HH:MM".into()));
    }
    NaiveTime::parse_from_str(value, "%H:%M")
        .map_err(|_| AppError::Validation("Time must be between 00:00 and 23:59".into()))
}

pub fn now_rfc3339() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_only_strict_calendar_dates() {
        for value in ["2026-02-28", "0001-01-01"] {
            assert!(parse_date(value).is_ok(), "{value}");
        }
        for value in ["2026-2-1", "2026/02/01", "2026-02-30", "２０２６-02-01"] {
            assert!(
                matches!(parse_date(value), Err(AppError::Validation(_))),
                "{value}"
            );
        }
    }

    #[test]
    fn parses_only_valid_hh_mm_times() {
        for value in ["00:00", "09:05", "23:59"] {
            assert!(parse_time(value).is_ok(), "{value}");
        }
        for value in ["9:05", "24:00", "12:60", "12:30:00"] {
            assert!(
                matches!(parse_time(value), Err(AppError::Validation(_))),
                "{value}"
            );
        }
    }

    #[test]
    fn timestamp_is_utc_with_milliseconds() {
        let value = now_rfc3339();
        assert!(value.ends_with('Z'));
        assert_eq!(
            chrono::DateTime::parse_from_rfc3339(&value)
                .unwrap()
                .offset()
                .local_minus_utc(),
            0
        );
        assert_eq!(
            value.split('.').nth(1).unwrap().trim_end_matches('Z').len(),
            3
        );
    }
}
