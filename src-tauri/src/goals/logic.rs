#![allow(dead_code)] // TODO(T14): implement goal progress and due-date calculations.

pub fn percent(_current: f64, _target: Option<f64>) -> Option<i64> {
    unimplemented!()
}

pub fn days_left(_due_date: Option<&str>, _today: &str) -> crate::error::AppResult<Option<i64>> {
    unimplemented!()
}
