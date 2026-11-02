#![allow(dead_code)] // TODO(T12): implement reminder ordering and due-set rules.

use std::cmp::Ordering;

use crate::reminders::model::Reminder;

pub fn compare_order(_left: &Reminder, _right: &Reminder) -> Ordering {
    unimplemented!()
}

pub fn is_due(_reminder: &Reminder, _today: &str) -> bool {
    unimplemented!()
}
