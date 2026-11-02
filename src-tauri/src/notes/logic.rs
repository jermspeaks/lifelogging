#![allow(dead_code)] // TODO(T11): implement the spaced-review schedule and transitions.

use chrono::NaiveDate;

pub const INTERVALS: [i64; 7] = [1, 3, 7, 14, 30, 60, 120];

pub fn next_stage(_stage: i64) -> i64 {
    unimplemented!()
}

pub fn review_date(_today: NaiveDate, _stage: i64) -> NaiveDate {
    unimplemented!()
}
