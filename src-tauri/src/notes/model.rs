use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Note {
    #[ts(type = "number")]
    pub id: i64,
    pub title: String,
    pub body: Option<String>,
    pub url: Option<String>,
    #[ts(type = "number")]
    pub review_stage: i64,
    pub next_review_date: Option<String>,
    pub last_reviewed_on: Option<String>,
    pub archived_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NewNote {
    pub title: String,
    #[serde(default)]
    #[ts(optional)]
    pub body: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub url: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NotePatch {
    #[serde(default)]
    #[ts(optional)]
    pub title: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub body: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub url: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum ReviewAction {
    Keep,
    Snooze,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ReviewQueue {
    pub due: Vec<Note>,
    #[ts(type = "number")]
    pub due_count: i64,
}
