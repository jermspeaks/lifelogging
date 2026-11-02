use serde::{Deserialize, Deserializer, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum GoalStatus {
    Active,
    Completed,
    Abandoned,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Goal {
    #[ts(type = "number")]
    pub id: i64,
    pub title: String,
    pub description: Option<String>,
    pub target_value: Option<f64>,
    pub unit: Option<String>,
    pub due_date: Option<String>,
    pub status: GoalStatus,
    pub closed_on: Option<String>,
    #[ts(type = "number")]
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NewGoal {
    pub title: String,
    #[serde(default)]
    #[ts(optional)]
    pub description: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub target_value: Option<f64>,
    #[serde(default)]
    #[ts(optional)]
    pub unit: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub due_date: Option<String>,
}

/// `targetValue` distinguishes an omitted field (unchanged) from `null` (milestone goal).
#[derive(Debug, Clone, Default, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct GoalPatch {
    #[ts(optional)]
    pub title: Option<String>,
    #[ts(optional)]
    pub description: Option<String>,
    #[ts(type = "number | null", optional)]
    pub target_value: Option<Option<f64>>,
    #[ts(optional)]
    pub unit: Option<String>,
    #[ts(optional)]
    pub due_date: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoalPatchInput {
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default, deserialize_with = "deserialize_double_option")]
    target_value: Option<Option<f64>>,
    #[serde(default)]
    unit: Option<String>,
    #[serde(default)]
    due_date: Option<String>,
}

impl<'de> Deserialize<'de> for GoalPatch {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let input = GoalPatchInput::deserialize(deserializer)?;
        Ok(Self {
            title: input.title,
            description: input.description,
            target_value: input.target_value,
            unit: input.unit,
            due_date: input.due_date,
        })
    }
}

fn deserialize_double_option<'de, D>(deserializer: D) -> Result<Option<Option<f64>>, D::Error>
where
    D: Deserializer<'de>,
{
    Option::<f64>::deserialize(deserializer).map(Some)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct GoalSummary {
    pub goal: Goal,
    pub current: f64,
    pub today_amount: f64,
    pub percent: Option<i64>,
    pub days_left: Option<i64>,
}

#[cfg(test)]
mod tests {
    use super::GoalPatch;

    #[test]
    fn target_value_patch_preserves_omitted_null_and_numeric_values() {
        let omitted: GoalPatch = serde_json::from_str("{}").unwrap();
        let cleared: GoalPatch = serde_json::from_str(r#"{"targetValue":null}"#).unwrap();
        let set: GoalPatch = serde_json::from_str(r#"{"targetValue":12.5}"#).unwrap();

        assert_eq!(omitted.target_value, None);
        assert_eq!(cleared.target_value, Some(None));
        assert_eq!(set.target_value, Some(Some(12.5)));
    }
}
