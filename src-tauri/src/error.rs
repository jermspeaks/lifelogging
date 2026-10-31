use serde::{Serialize, Serializer};
use ts_rs::TS;

/// Every command returns `Result<T, AppError>`. Serialized to the webview as `ErrorPayload`.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    Validation(String),
    #[error("database error: {0}")]
    Database(String),
}

impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        AppError::Database(err.to_string())
    }
}

impl From<rusqlite_migration::Error> for AppError {
    fn from(err: rusqlite_migration::Error) -> Self {
        AppError::Database(err.to_string())
    }
}

#[derive(Debug, Clone, Copy, Serialize, TS)]
#[ts(export)]
pub enum ErrorKind {
    NotFound,
    Validation,
    Database,
}

/// Wire shape of an error: `{ kind, message }`.
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct ErrorPayload {
    pub kind: ErrorKind,
    pub message: String,
}

impl AppError {
    pub fn kind(&self) -> ErrorKind {
        match self {
            AppError::NotFound(_) => ErrorKind::NotFound,
            AppError::Validation(_) => ErrorKind::Validation,
            AppError::Database(_) => ErrorKind::Database,
        }
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        ErrorPayload {
            kind: self.kind(),
            message: self.to_string(),
        }
        .serialize(serializer)
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_as_kind_and_message() {
        let json = serde_json::to_value(AppError::Validation("name is required".into())).unwrap();
        assert_eq!(
            json,
            serde_json::json!({ "kind": "Validation", "message": "name is required" })
        );
    }
}
