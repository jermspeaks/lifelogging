use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Calendar {
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
pub struct ImportCalendarResult {
    pub calendar: Calendar,
    #[ts(type = "number")]
    pub imported_event_count: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CalendarEvent {
    #[ts(type = "number")]
    pub id: i64,
    #[ts(type = "number")]
    pub calendar_id: i64,
    pub calendar_name: String,
    pub uid: String,
    pub summary: String,
    pub start_date: String,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub all_day: bool,
}
