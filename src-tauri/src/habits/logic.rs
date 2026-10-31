//! Pure domain rules: schedules, streaks, 7-day strip (SPEC §6 rules 1, 4, 5).

use std::collections::HashSet;

use chrono::{Datelike, Days, NaiveDate};

use super::model::{DayEntry, DayStatus};
use crate::error::{AppError, AppResult};

/// Strict `YYYY-MM-DD`; `Validation` error otherwise.
///
/// chrono's `%Y-%m-%d` alone accepts non-padded fields (`2026-2-1`), so the
/// exact shape is checked first; chrono then rejects impossible dates.
pub fn parse_date(s: &str) -> AppResult<NaiveDate> {
    let invalid = || AppError::Validation(format!("invalid date '{s}': expected YYYY-MM-DD"));
    let b = s.as_bytes();
    let well_formed = b.len() == 10
        && b.iter().enumerate().all(|(i, c)| match i {
            4 | 7 => *c == b'-',
            _ => c.is_ascii_digit(),
        });
    if !well_formed {
        return Err(invalid());
    }
    NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|_| invalid())
}

/// SPEC §6 rule 1. Bit 0 = Monday … bit 6 = Sunday.
pub fn is_scheduled(schedule_days: u8, date: NaiveDate) -> bool {
    (schedule_days >> date.weekday().num_days_from_monday()) & 1 == 1
}

/// SPEC §6 rule 4.
///
/// Walks backwards from `today` over scheduled days only, never past `created`.
/// A scheduled-but-unchecked `today` is not counted and does not break the streak.
/// Checks on unscheduled days (bonus) are ignored. Returns 0 if `today < created`.
pub fn current_streak(
    schedule_days: u8,
    created: NaiveDate,
    today: NaiveDate,
    checks: &HashSet<NaiveDate>,
) -> u32 {
    let mut streak = 0;
    let mut day = today;
    while day >= created {
        if is_scheduled(schedule_days, day) {
            if checks.contains(&day) {
                streak += 1;
            } else if day != today {
                break;
            }
        }
        match day.pred_opt() {
            Some(prev) => day = prev,
            None => break,
        }
    }
    streak
}

/// SPEC §6 rule 5. `n` entries, oldest → newest, ending at `today`.
///
/// Precedence per day:
/// 1. checked → `Done` (including bonus checks on unscheduled days, and checks
///    dated before `created`, so stored history is never hidden);
/// 2. before `created` → `Skipped`;
/// 3. unscheduled → `Skipped`;
/// 4. `today` → `Pending`;
/// 5. otherwise → `Missed`.
pub fn last_n_days(
    schedule_days: u8,
    created: NaiveDate,
    today: NaiveDate,
    checks: &HashSet<NaiveDate>,
    n: u32,
) -> Vec<DayEntry> {
    (0..u64::from(n))
        .rev()
        .filter_map(|back| today.checked_sub_days(Days::new(back)))
        .map(|date| {
            let status = if checks.contains(&date) {
                DayStatus::Done
            } else if date < created || !is_scheduled(schedule_days, date) {
                DayStatus::Skipped
            } else if date == today {
                DayStatus::Pending
            } else {
                DayStatus::Missed
            };
            DayEntry { date, status }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::habits::model::EVERY_DAY;

    const WEEKDAYS: u8 = 0b001_1111;

    fn d(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    fn set(dates: &[&str]) -> HashSet<NaiveDate> {
        dates.iter().map(|s| d(s)).collect()
    }

    // 2026-10-26 is a Monday; 2026-11-01 is a Sunday.

    #[test]
    fn parse_date_accepts_valid() {
        for (input, expected) in [
            ("2026-10-31", d("2026-10-31")),
            ("2024-02-29", d("2024-02-29")),
            ("0001-01-01", d("0001-01-01")),
        ] {
            assert_eq!(parse_date(input).unwrap(), expected, "{input}");
        }
    }

    #[test]
    fn parse_date_rejects_invalid() {
        for input in [
            "",
            "2026-2-1",
            "2026-02-1",
            "2026-2-01",
            "2026-02-30",
            "2025-02-29",
            "2026-13-01",
            "2026-00-10",
            "2026-10-31x",
            "2026-10-31 ",
            " 2026-10-31",
            "2026/10/31",
            "20261031",
            "+2026-10-31",
            "2026-1a-01",
            "\u{FF12}026-10-31",
        ] {
            assert!(
                matches!(parse_date(input), Err(AppError::Validation(_))),
                "expected Validation error for {input:?}"
            );
        }
    }

    #[test]
    fn is_scheduled_each_weekday_bit() {
        // (date, weekday bit index)
        let week = [
            ("2026-10-26", 0), // Mon
            ("2026-10-27", 1), // Tue
            ("2026-10-28", 2), // Wed
            ("2026-10-29", 3), // Thu
            ("2026-10-30", 4), // Fri
            ("2026-10-31", 5), // Sat
            ("2026-11-01", 6), // Sun
        ];
        for (date, bit) in week {
            let only = 1u8 << bit;
            assert!(is_scheduled(only, d(date)), "{date} with bit {bit}");
            assert!(
                !is_scheduled(!only & EVERY_DAY, d(date)),
                "{date} without bit {bit}"
            );
            assert!(is_scheduled(EVERY_DAY, d(date)));
            assert!(!is_scheduled(0, d(date)));
        }
        // Bit 7 is meaningless.
        assert!(!is_scheduled(0b1000_0000, d("2026-10-26")));
    }

    struct StreakCase {
        name: &'static str,
        schedule: u8,
        created: &'static str,
        today: &'static str,
        checks: &'static [&'static str],
        expected: u32,
    }

    #[test]
    fn current_streak_cases() {
        let cases = [
            StreakCase {
                name: "daily unbroken, today checked counts",
                schedule: EVERY_DAY,
                created: "2026-10-01",
                today: "2026-10-31",
                checks: &[
                    "2026-10-27",
                    "2026-10-28",
                    "2026-10-29",
                    "2026-10-30",
                    "2026-10-31",
                ],
                expected: 5,
            },
            StreakCase {
                name: "today unchecked does not break",
                schedule: EVERY_DAY,
                created: "2026-10-01",
                today: "2026-10-31",
                checks: &["2026-10-28", "2026-10-29", "2026-10-30"],
                expected: 3,
            },
            StreakCase {
                name: "yesterday missed -> 0",
                schedule: EVERY_DAY,
                created: "2026-10-01",
                today: "2026-10-31",
                checks: &["2026-10-28", "2026-10-29"],
                expected: 0,
            },
            StreakCase {
                name: "yesterday missed, today checked -> 1",
                schedule: EVERY_DAY,
                created: "2026-10-01",
                today: "2026-10-31",
                checks: &["2026-10-29", "2026-10-31"],
                expected: 1,
            },
            StreakCase {
                name: "weekday habit carries across weekend (today Mon unchecked)",
                schedule: WEEKDAYS,
                created: "2026-10-01",
                today: "2026-11-02",
                checks: &["2026-10-28", "2026-10-29", "2026-10-30"],
                expected: 3,
            },
            StreakCase {
                name: "weekday habit carries across weekend (today Mon checked)",
                schedule: WEEKDAYS,
                created: "2026-10-01",
                today: "2026-11-02",
                checks: &["2026-10-29", "2026-10-30", "2026-11-02"],
                expected: 3,
            },
            StreakCase {
                name: "weekday habit, today Sunday (unscheduled) unchecked",
                schedule: WEEKDAYS,
                created: "2026-10-01",
                today: "2026-11-01",
                checks: &["2026-10-29", "2026-10-30"],
                expected: 2,
            },
            StreakCase {
                name: "bonus checks on unscheduled days don't count",
                schedule: WEEKDAYS,
                created: "2026-10-01",
                today: "2026-11-02",
                checks: &["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"],
                expected: 2,
            },
            StreakCase {
                name: "bonus checks don't bridge a missed scheduled day",
                schedule: WEEKDAYS,
                created: "2026-10-01",
                today: "2026-11-03",
                checks: &["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-03"],
                expected: 1,
            },
            StreakCase {
                name: "stops at creation date",
                schedule: EVERY_DAY,
                created: "2026-10-29",
                today: "2026-10-31",
                checks: &[
                    "2026-10-25",
                    "2026-10-26",
                    "2026-10-27",
                    "2026-10-28",
                    "2026-10-29",
                    "2026-10-30",
                    "2026-10-31",
                ],
                expected: 3,
            },
            StreakCase {
                name: "created today, unchecked",
                schedule: EVERY_DAY,
                created: "2026-10-31",
                today: "2026-10-31",
                checks: &[],
                expected: 0,
            },
            StreakCase {
                name: "created today, checked",
                schedule: EVERY_DAY,
                created: "2026-10-31",
                today: "2026-10-31",
                checks: &["2026-10-31"],
                expected: 1,
            },
            StreakCase {
                name: "today before created -> 0",
                schedule: EVERY_DAY,
                created: "2026-11-05",
                today: "2026-10-31",
                checks: &["2026-10-31"],
                expected: 0,
            },
            StreakCase {
                name: "empty schedule -> 0 (terminates)",
                schedule: 0,
                created: "2020-01-01",
                today: "2026-10-31",
                checks: &["2026-10-30", "2026-10-31"],
                expected: 0,
            },
            StreakCase {
                name: "no checks -> 0",
                schedule: EVERY_DAY,
                created: "2026-10-01",
                today: "2026-10-31",
                checks: &[],
                expected: 0,
            },
        ];
        for c in cases {
            let got = current_streak(c.schedule, d(c.created), d(c.today), &set(c.checks));
            assert_eq!(got, c.expected, "{}", c.name);
        }
    }

    #[test]
    fn current_streak_terminates_at_min_date() {
        let min = NaiveDate::MIN;
        assert_eq!(current_streak(EVERY_DAY, min, min, &HashSet::new()), 0);
        let checks: HashSet<_> = [min].into_iter().collect();
        assert_eq!(current_streak(EVERY_DAY, min, min, &checks), 1);
    }

    struct StripCase {
        name: &'static str,
        schedule: u8,
        created: &'static str,
        checks: &'static [&'static str],
        expected: [DayStatus; 7],
    }

    #[test]
    fn last_n_days_cases() {
        use DayStatus::*;
        // Window for today = 2026-11-01 (Sun): Mon 10-26 … Sun 11-01.
        let today = d("2026-11-01");
        let cases = [
            StripCase {
                name: "daily: done/missed/pending",
                schedule: EVERY_DAY,
                created: "2026-10-01",
                checks: &["2026-10-26", "2026-10-28", "2026-10-31"],
                expected: [Done, Missed, Done, Missed, Missed, Done, Pending],
            },
            StripCase {
                name: "today checked is done",
                schedule: EVERY_DAY,
                created: "2026-10-01",
                checks: &["2026-11-01"],
                expected: [Missed, Missed, Missed, Missed, Missed, Missed, Done],
            },
            StripCase {
                name: "weekdays: weekend skipped, today unscheduled is skipped",
                schedule: WEEKDAYS,
                created: "2026-10-01",
                checks: &["2026-10-26", "2026-10-27"],
                expected: [Done, Done, Missed, Missed, Missed, Skipped, Skipped],
            },
            StripCase {
                name: "bonus check on unscheduled day is done",
                schedule: WEEKDAYS,
                created: "2026-10-01",
                checks: &["2026-10-31"],
                expected: [Missed, Missed, Missed, Missed, Missed, Done, Skipped],
            },
            StripCase {
                name: "pre-creation days skipped",
                schedule: EVERY_DAY,
                created: "2026-10-30",
                checks: &["2026-10-31"],
                expected: [Skipped, Skipped, Skipped, Skipped, Missed, Done, Pending],
            },
            StripCase {
                name: "pre-creation check still shows as done",
                schedule: EVERY_DAY,
                created: "2026-10-30",
                checks: &["2026-10-27"],
                expected: [Skipped, Done, Skipped, Skipped, Missed, Missed, Pending],
            },
        ];
        let expected_dates: Vec<_> = (0..7u64)
            .rev()
            .map(|back| today - Days::new(back))
            .collect();
        for c in cases {
            let got = last_n_days(c.schedule, d(c.created), today, &set(c.checks), 7);
            let dates: Vec<_> = got.iter().map(|e| e.date).collect();
            assert_eq!(dates, expected_dates, "{}: dates oldest → newest", c.name);
            let statuses: Vec<_> = got.iter().map(|e| e.status).collect();
            assert_eq!(statuses, c.expected, "{}", c.name);
        }
    }

    #[test]
    fn last_n_days_lengths() {
        let today = d("2026-10-31");
        let none = HashSet::new();
        assert!(last_n_days(EVERY_DAY, today, today, &none, 0).is_empty());
        assert_eq!(
            last_n_days(EVERY_DAY, today, today, &none, 1),
            vec![DayEntry {
                date: today,
                status: DayStatus::Pending
            }]
        );
        assert_eq!(last_n_days(EVERY_DAY, today, today, &none, 30).len(), 30);
    }
}
