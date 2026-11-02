use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Reminder {
    #[ts(type = "number")]
    pub id: i64,
    pub title: String,
    pub notes: Option<String>,
    pub due_date: String,
    pub due_time: Option<String>,
    pub completed_on: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NewReminder {
    pub title: String,
    #[serde(default)]
    #[ts(optional)]
    pub notes: Option<String>,
    pub due_date: String,
    #[serde(default)]
    #[ts(optional)]
    pub due_time: Option<String>,
}

/// Partial update. Empty strings clear optional `notes` and `dueTime` fields.
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ReminderPatch {
    #[serde(default)]
    #[ts(optional)]
    pub title: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub notes: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub due_date: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub due_time: Option<String>,
}
