use crate::error::AppResult;

#[allow(dead_code)] // TODO(T7)
pub fn validate_body(_body: &str) -> AppResult<()> {
    unimplemented!("TODO(T7): implement journal validation")
}

#[allow(dead_code)] // TODO(T7)
pub fn preview(_body: &str) -> String {
    unimplemented!("TODO(T7): implement journal preview")
}

#[allow(dead_code)] // TODO(T7)
pub fn word_count(_body: &str) -> i64 {
    unimplemented!("TODO(T7): implement journal word count")
}
