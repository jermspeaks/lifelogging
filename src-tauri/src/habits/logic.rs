//! Pure domain rules: schedules, streaks, 7-day strip. Implemented in T2 (see docs/PLAN.md).
#![allow(dead_code, unused_variables)] // TODO(T5): remove once commands call into logic.

use std::collections::HashSet;

use chrono::NaiveDate;

use super::model::DayEntry;
use crate::error::AppResult;

/// Strict `YYYY-MM-DD`; `Validation` error otherwise.
pub fn parse_date(s: &str) -> AppResult<NaiveDate> {
    unimplemented!("T2")
}

/// SPEC §6 rule 1. Bit 0 = Monday … bit 6 = Sunday.
pub fn is_scheduled(schedule_days: u8, date: NaiveDate) -> bool {
    unimplemented!("T2")
}

/// SPEC §6 rule 4.
pub fn current_streak(
    schedule_days: u8,
    created: NaiveDate,
    today: NaiveDate,
    checks: &HashSet<NaiveDate>,
) -> u32 {
    unimplemented!("T2")
}

/// SPEC §6 rule 5. `n` entries, oldest → newest, ending at `today`.
pub fn last_n_days(
    schedule_days: u8,
    created: NaiveDate,
    today: NaiveDate,
    checks: &HashSet<NaiveDate>,
    n: u32,
) -> Vec<DayEntry> {
    unimplemented!("T2")
}
