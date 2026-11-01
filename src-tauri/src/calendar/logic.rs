use std::collections::HashSet;
use std::str::FromStr;

use chrono::{DateTime, Days, Local, NaiveDate, NaiveDateTime, TimeZone};
use icalendar::{
    Calendar, CalendarDateTime, Component, DatePerhapsTime, EventLike, EventStatus, Tz,
};

use super::model::EventOccurrence;
use crate::error::{AppError, AppResult};

pub const MAX_ICS_BYTES: usize = 5 * 1024 * 1024;
pub const MAX_EVENTS: usize = 5_000;
const MAX_OCCURRENCES_PER_QUERY: u16 = 20_000;

#[derive(Debug, Clone)]
pub struct ParsedEvent {
    pub uid: String,
    pub summary: String,
    pub description: Option<String>,
    pub location: Option<String>,
    pub start_date: NaiveDate,
    pub all_day: bool,
    pub event_ical: String,
}

#[derive(Debug, Clone)]
pub struct ParsedCalendar {
    pub name: String,
    pub timezone: Option<String>,
    pub events: Vec<ParsedEvent>,
}

/// Parse and validate a complete iCalendar import before a repository transaction starts.
pub fn parse_calendar(name: &str, content: &str) -> AppResult<ParsedCalendar> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 255 || name.contains(['\r', '\n', '\0']) {
        return Err(AppError::Validation(
            "Calendar name must be 1–255 characters.".into(),
        ));
    }
    if content.len() > MAX_ICS_BYTES {
        return Err(AppError::Validation(format!(
            "Calendar file exceeds the {} MiB import limit.",
            MAX_ICS_BYTES / (1024 * 1024)
        )));
    }

    let calendar = Calendar::from_str(content)
        .map_err(|e| AppError::Validation(format!("Couldn't read calendar file: {e}")))?;
    if contains_vtimezone_component(content) {
        return Err(AppError::Validation(
            "Custom VTIMEZONE definitions aren't supported.".into(),
        ));
    }
    let timezone = calendar.get_timezone().map(str::to_owned);
    if let Some(tzid) = timezone.as_deref() {
        chrono_tz::Tz::from_str(tzid).map_err(|_| {
            AppError::Validation(format!("Unsupported calendar time zone '{tzid}'."))
        })?;
    }

    let calendar_events: Vec<_> = calendar.events().collect();
    if calendar_events.len() > MAX_EVENTS {
        return Err(AppError::Validation(format!(
            "Calendar contains more than {MAX_EVENTS} events."
        )));
    }
    let mut seen_uids = HashSet::new();
    let mut events = Vec::new();
    for event in calendar_events {
        if event.get_status() == Some(EventStatus::Cancelled) {
            continue;
        }
        if event.property_value("RECURRENCE-ID").is_some() {
            return Err(AppError::Validation(
                "Calendar recurrence overrides (RECURRENCE-ID) aren't supported.".into(),
            ));
        }

        let uid = event
            .get_uid()
            .filter(|uid| !uid.trim().is_empty())
            .ok_or_else(|| AppError::Validation("Every event needs a UID.".into()))?
            .to_owned();
        if !seen_uids.insert(uid.clone()) {
            return Err(AppError::Validation(format!(
                "Calendar contains duplicate event UID '{uid}'."
            )));
        }
        let summary = event
            .get_summary()
            .map(str::trim)
            .filter(|summary| !summary.is_empty())
            .ok_or_else(|| AppError::Validation("Every event needs a summary.".into()))?
            .to_owned();
        let start = event
            .get_start()
            .ok_or_else(|| AppError::Validation(format!("Event '{summary}' needs DTSTART.")))?;
        let all_day = matches!(start, DatePerhapsTime::Date(_));

        // This validates DTSTART, RRULE, RDATE, EXDATE, and IANA time-zone values now,
        // rather than allowing a broken series to fail only when it appears on the dashboard.
        let recurrence = event.get_recurrence().map_err(|e| {
            AppError::Validation(format!("Couldn't read recurrence for '{summary}': {e}"))
        })?;
        let start_date = recurrence.get_dt_start().with_timezone(&Local).date_naive();

        events.push(ParsedEvent {
            uid,
            summary,
            description: event
                .get_description()
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .map(str::to_owned),
            location: event
                .get_location()
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .map(str::to_owned),
            start_date,
            all_day,
            event_ical: event.to_string(),
        });
    }

    Ok(ParsedCalendar {
        name: name.to_owned(),
        timezone,
        events,
    })
}

fn contains_vtimezone_component(content: &str) -> bool {
    let mut unfolded: Vec<String> = Vec::new();
    for line in content.lines() {
        let line = line.trim_end_matches('\r');
        if line.starts_with([' ', '\t']) {
            if let Some(previous) = unfolded.last_mut() {
                previous.push_str(line.trim_start_matches([' ', '\t']));
            }
        } else {
            unfolded.push(line.to_owned());
        }
    }
    unfolded
        .iter()
        .any(|line| line.eq_ignore_ascii_case("BEGIN:VTIMEZONE"))
}

/// Strict local `YYYY-MM-DD` supplied by the frontend.
pub fn parse_date(input: &str) -> AppResult<NaiveDate> {
    let invalid = || AppError::Validation("Date must be a valid YYYY-MM-DD value.".into());
    let bytes = input.as_bytes();
    let shape_ok = bytes.len() == 10
        && bytes.iter().enumerate().all(|(index, byte)| match index {
            4 | 7 => *byte == b'-',
            _ => byte.is_ascii_digit(),
        });
    if !shape_ok {
        return Err(invalid());
    }
    NaiveDate::parse_from_str(input, "%Y-%m-%d").map_err(|_| invalid())
}

pub fn upcoming_range(today: &str) -> AppResult<(NaiveDate, NaiveDate)> {
    let start = parse_date(today)?;
    let end_exclusive = start
        .checked_add_days(Days::new(4))
        .ok_or_else(|| AppError::Validation("Date range is out of bounds.".into()))?;
    Ok((start, end_exclusive))
}

/// Expand one stored VEVENT for the four-local-day dashboard window.
#[allow(clippy::too_many_arguments)]
pub fn expand_event(
    id: i64,
    source_id: i64,
    source_name: &str,
    uid: &str,
    summary: &str,
    description: Option<&str>,
    location: Option<&str>,
    event_ical: &str,
    source_timezone: Option<&str>,
    start: NaiveDate,
    end_exclusive: NaiveDate,
) -> AppResult<Vec<EventOccurrence>> {
    let mut wrapped =
        String::from("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Lifelogging//EN\r\n");
    if let Some(timezone) = source_timezone {
        wrapped.push_str(&format!("X-WR-TIMEZONE:{timezone}\r\n"));
    }
    wrapped.push_str(event_ical);
    wrapped.push_str("\r\nEND:VCALENDAR\r\n");
    let calendar = Calendar::from_str(&wrapped)
        .map_err(|e| AppError::Database(format!("stored calendar event is invalid: {e}")))?;
    let calendar_event = calendar
        .calendar_events()
        .next()
        .ok_or_else(|| AppError::Database("stored calendar event is missing".into()))?;
    let event = calendar_event.event();
    let start_value = event
        .get_start()
        .ok_or_else(|| AppError::Database(format!("stored event '{uid}' has no DTSTART")))?;
    let start_local = date_time_to_local(start_value.clone())?;
    let end_local = event
        .get_end()
        .and_then(|value| date_time_to_local(value).ok())
        .flatten();
    let end_delta = end_local.zip(start_local).map(|(end, start)| end - start);
    let recurrence = calendar_event.get_recurrence().map_err(|e| {
        AppError::Database(format!("stored recurrence for '{uid}' is invalid: {e}"))
    })?;

    let start_midnight = local_midnight(start)?;
    let end_midnight = local_midnight(end_exclusive)?;
    let zone = recurrence.get_dt_start().timezone();
    let after = (start_midnight - chrono::Duration::nanoseconds(1)).with_timezone(&zone);
    let before = end_midnight.with_timezone(&zone);
    let result = recurrence
        .after(after)
        .before(before)
        .all(MAX_OCCURRENCES_PER_QUERY);
    if result.limited {
        return Err(AppError::Validation(
            "Calendar has too many event occurrences in the four-day window.".into(),
        ));
    }

    let mut occurrences = Vec::new();
    for instance in result.dates {
        let local = instance.with_timezone(&Local);
        let date = local.date_naive();
        if date < start || date >= end_exclusive {
            continue;
        }
        let end_time = if let Some(delta) = end_delta {
            let local_end = local.naive_local() + delta;
            (local_end.date() == date).then(|| local_end.format("%H:%M").to_string())
        } else {
            None
        };
        occurrences.push(EventOccurrence {
            id,
            source_id,
            source_name: source_name.to_owned(),
            uid: uid.to_owned(),
            summary: summary.to_owned(),
            description: description.map(str::to_owned),
            location: location.map(str::to_owned),
            date: date.format("%Y-%m-%d").to_string(),
            all_day: matches!(&start_value, DatePerhapsTime::Date(_)),
            start_time: if matches!(&start_value, DatePerhapsTime::Date(_)) {
                None
            } else {
                Some(local.format("%H:%M").to_string())
            },
            end_time: if matches!(&start_value, DatePerhapsTime::Date(_)) {
                None
            } else {
                end_time
            },
        });
    }
    Ok(occurrences)
}

fn local_midnight(date: NaiveDate) -> AppResult<DateTime<Local>> {
    let naive = date
        .and_hms_opt(0, 0, 0)
        .ok_or_else(|| AppError::Validation("Date is out of bounds.".into()))?;
    Local
        .from_local_datetime(&naive)
        .single()
        .or_else(|| Local.from_local_datetime(&naive).earliest())
        .or_else(|| Local.from_local_datetime(&naive).latest())
        .ok_or_else(|| AppError::Validation("Couldn't resolve local calendar date.".into()))
}

fn date_time_to_local(value: DatePerhapsTime) -> AppResult<Option<NaiveDateTime>> {
    let local = match value {
        DatePerhapsTime::Date(date) => date.and_hms_opt(0, 0, 0),
        DatePerhapsTime::DateTime(CalendarDateTime::Floating(date_time)) => Some(date_time),
        DatePerhapsTime::DateTime(CalendarDateTime::Utc(date_time)) => {
            Some(date_time.with_timezone(&Local).naive_local())
        }
        DatePerhapsTime::DateTime(CalendarDateTime::WithTimezone { date_time, tzid }) => {
            let timezone: chrono_tz::Tz = tzid.parse().map_err(|_| {
                AppError::Validation(format!("Unsupported event time zone '{tzid}'."))
            })?;
            let timezone: Tz = timezone.into();
            timezone
                .from_local_datetime(&date_time)
                .single()
                .map(|date_time| date_time.with_timezone(&Local).naive_local())
        }
    };
    Ok(local)
}

#[cfg(test)]
mod tests {
    use super::*;

    const ICS: &str = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:birthday-1\r\nSUMMARY:Mom's Birthday\r\nDTSTART;VALUE=DATE:19900115\r\nRRULE:FREQ=YEARLY\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";

    #[test]
    fn parses_annual_all_day_birthdays_and_text_escapes() {
        let parsed = parse_calendar("birthdays.ics", ICS).unwrap();
        assert_eq!(parsed.name, "birthdays.ics");
        assert_eq!(parsed.events.len(), 1);
        assert_eq!(parsed.events[0].summary, "Mom's Birthday");
        assert!(parsed.events[0].all_day);
        assert_eq!(
            parsed.events[0].start_date,
            NaiveDate::from_ymd_opt(1990, 1, 15).unwrap()
        );
    }

    #[test]
    fn rejects_bad_dates_and_invalid_imports() {
        for input in ["", "2026-1-01", "2026-02-30", "2026-10-31x"] {
            assert!(matches!(parse_date(input), Err(AppError::Validation(_))));
        }
        assert!(matches!(
            parse_calendar("bad.ics", "not an iCalendar"),
            Err(AppError::Validation(_))
        ));

        let custom_timezone = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VTIMEZONE\r\nTZID:Custom/Zone\r\nEND:VTIMEZONE\r\nEND:VCALENDAR\r\n";
        assert!(matches!(
            parse_calendar("custom-timezone.ics", custom_timezone),
            Err(AppError::Validation(_))
        ));

        let mut too_many = String::from("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n");
        for index in 0..=MAX_EVENTS {
            too_many.push_str(&format!(
                "BEGIN:VEVENT\r\nUID:event-{index}\r\nSTATUS:CANCELLED\r\nEND:VEVENT\r\n"
            ));
        }
        too_many.push_str("END:VCALENDAR\r\n");
        assert!(matches!(
            parse_calendar("too-many.ics", &too_many),
            Err(AppError::Validation(_))
        ));
    }

    #[test]
    fn rejects_duplicate_uids_and_recurrence_overrides() {
        let duplicate = ICS.replace(
            "END:VEVENT",
            "END:VEVENT\r\nBEGIN:VEVENT\r\nUID:birthday-1\r\nSUMMARY:Other\r\nDTSTART;VALUE=DATE:19900115\r\nEND:VEVENT",
        );
        assert!(matches!(
            parse_calendar("duplicate.ics", &duplicate),
            Err(AppError::Validation(_))
        ));

        let override_event = ICS.replace(
            "DTSTART;VALUE=DATE",
            "RECURRENCE-ID;VALUE=DATE:20260115\r\nDTSTART;VALUE=DATE",
        );
        assert!(matches!(
            parse_calendar("override.ics", &override_event),
            Err(AppError::Validation(_))
        ));
    }

    #[test]
    fn expands_recurring_all_day_events_inside_the_supplied_four_day_window() {
        let parsed = parse_calendar("birthdays.ics", ICS).unwrap();
        let event = &parsed.events[0];
        let occurrences = expand_event(
            1,
            1,
            "birthdays.ics",
            &event.uid,
            &event.summary,
            event.description.as_deref(),
            event.location.as_deref(),
            &event.event_ical,
            parsed.timezone.as_deref(),
            NaiveDate::from_ymd_opt(2026, 1, 14).unwrap(),
            NaiveDate::from_ymd_opt(2026, 1, 18).unwrap(),
        )
        .unwrap();
        assert_eq!(occurrences.len(), 1);
        assert_eq!(occurrences[0].date, "2026-01-15");
        assert!(occurrences[0].all_day);
        assert_eq!(occurrences[0].start_time, None);
    }
}
