use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CalendarSource {
    #[ts(type = "number")]
    pub id: i64,
    pub name: String,
    pub imported_at: String,
    #[ts(type = "number")]
    pub event_count: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct EventOccurrence {
    #[ts(type = "number")]
    pub id: i64,
    #[ts(type = "number")]
    pub source_id: i64,
    pub source_name: String,
    pub uid: String,
    pub summary: String,
    pub description: Option<String>,
    pub location: Option<String>,
    /// Local calendar date, `YYYY-MM-DD`.
    pub date: String,
    pub all_day: bool,
    /// Local `HH:MM`; absent for all-day events.
    pub start_time: Option<String>,
    /// Local `HH:MM`; absent for all-day or open-ended events.
    pub end_time: Option<String>,
}
