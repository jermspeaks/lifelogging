use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Fixed palette; the UI maps each key to Tailwind classes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum HabitColor {
    #[default]
    Slate,
    Red,
    Amber,
    Green,
    Blue,
    Violet,
    Pink,
}

#[allow(dead_code)] // TODO(T5): used by repo once wired up.
impl HabitColor {
    pub fn as_str(self) -> &'static str {
        match self {
            HabitColor::Slate => "slate",
            HabitColor::Red => "red",
            HabitColor::Amber => "amber",
            HabitColor::Green => "green",
            HabitColor::Blue => "blue",
            HabitColor::Violet => "violet",
            HabitColor::Pink => "pink",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        Some(match s {
            "slate" => HabitColor::Slate,
            "red" => HabitColor::Red,
            "amber" => HabitColor::Amber,
            "green" => HabitColor::Green,
            "blue" => HabitColor::Blue,
            "violet" => HabitColor::Violet,
            "pink" => HabitColor::Pink,
            _ => return None,
        })
    }
}

/// Weekday mask: bit 0 = Monday … bit 6 = Sunday.
#[allow(dead_code)] // TODO(T5): used by repo once wired up.
pub const EVERY_DAY: u8 = 0b111_1111;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Habit {
    #[ts(type = "number")]
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub color: HabitColor,
    pub schedule_days: u8,
    #[ts(type = "number")]
    pub sort_order: i64,
    /// RFC 3339 timestamp; `null` when active.
    pub archived_at: Option<String>,
    /// RFC 3339 UTC.
    pub created_at: String,
    /// RFC 3339 UTC.
    pub updated_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NewHabit {
    pub name: String,
    #[serde(default)]
    #[ts(optional)]
    pub description: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub color: Option<HabitColor>,
    /// Defaults to every day (127).
    #[serde(default)]
    #[ts(optional)]
    pub schedule_days: Option<u8>,
}

/// Partial update: omitted fields are left unchanged.
/// `description: ""` clears the description.
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct HabitPatch {
    #[serde(default)]
    #[ts(optional)]
    pub name: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub description: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub color: Option<HabitColor>,
    #[serde(default)]
    #[ts(optional)]
    pub schedule_days: Option<u8>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum DayStatus {
    /// Checked on this date.
    Done,
    /// Scheduled, in the past, not checked.
    Missed,
    /// Not scheduled (or before the habit existed), not checked.
    Skipped,
    /// Today, scheduled, not checked yet.
    Pending,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DayEntry {
    /// Local calendar date, `YYYY-MM-DD`.
    pub date: NaiveDate,
    pub status: DayStatus,
}

/// One row of the Today dashboard.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TodayHabit {
    pub habit: Habit,
    pub scheduled_today: bool,
    pub done_today: bool,
    pub current_streak: u32,
    /// Oldest → newest, ending at today.
    pub last7: Vec<DayEntry>,
}
