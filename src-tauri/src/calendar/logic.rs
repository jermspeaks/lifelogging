//! Bounded RFC 5545 subset used by the calendar import path.

use chrono::{Datelike, Local, LocalResult, NaiveDate, NaiveTime, TimeZone, Utc};
use chrono_tz::Tz;

use crate::error::{AppError, AppResult};

pub const MAX_IMPORT_BYTES: usize = 10 * 1024 * 1024;
pub const MAX_EVENTS: usize = 10_000;

#[derive(Debug, Clone, PartialEq)]
pub struct ImportedEvent {
    pub uid: String,
    pub summary: String,
    pub start_date: String,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub all_day: bool,
    pub yearly: bool,
    pub timezone: Option<String>,
}

#[derive(Debug, Clone)]
struct Property {
    name: String,
    params: Vec<(String, String)>,
    value: String,
}

#[derive(Debug, Clone)]
struct ParsedDateTime {
    date: NaiveDate,
    time: Option<NaiveTime>,
    all_day: bool,
    timezone: Option<String>,
    source_date: NaiveDate,
    source_time: Option<NaiveTime>,
}

fn validation(message: impl Into<String>) -> AppError {
    AppError::Validation(message.into())
}

pub fn parse_date(value: &str) -> AppResult<NaiveDate> {
    let bytes = value.as_bytes();
    if bytes.len() != 10
        || !bytes.iter().enumerate().all(|(index, byte)| match index {
            4 | 7 => *byte == b'-',
            _ => byte.is_ascii_digit(),
        })
    {
        return Err(validation(format!(
            "invalid date '{value}': expected YYYY-MM-DD"
        )));
    }
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| validation(format!("invalid date '{value}': expected YYYY-MM-DD")))
}

fn unfold(text: &str) -> AppResult<Vec<String>> {
    if text.len() > MAX_IMPORT_BYTES {
        return Err(validation("Calendar file exceeds the 10 MiB import limit."));
    }
    if text.contains('\0') {
        return Err(validation("Calendar file contains a NUL character."));
    }
    let mut lines: Vec<String> = Vec::new();
    for raw in text.replace("\r\n", "\n").replace('\r', "\n").split('\n') {
        if raw.starts_with(' ') || raw.starts_with('\t') {
            let Some(previous) = lines.last_mut() else {
                return Err(validation("Calendar file starts with a folded line."));
            };
            previous.push_str(&raw[1..]);
        } else if !raw.is_empty() {
            lines.push(raw.to_owned());
        }
    }
    Ok(lines)
}

fn parse_property(line: &str) -> AppResult<Property> {
    let Some((lhs, value)) = line.split_once(':') else {
        return Err(validation(format!("Invalid calendar line: {line}")));
    };
    let mut parts = lhs.split(';');
    let name = parts.next().unwrap_or_default().to_ascii_uppercase();
    if name.is_empty() {
        return Err(validation("Calendar property name is empty."));
    }
    let mut params = Vec::new();
    for part in parts {
        let Some((key, value)) = part.split_once('=') else {
            return Err(validation(format!(
                "Invalid parameter in calendar line: {line}"
            )));
        };
        params.push((key.to_ascii_uppercase(), value.trim_matches('"').to_owned()));
    }
    Ok(Property {
        name,
        params,
        value: value.to_owned(),
    })
}

fn param<'a>(property: &'a Property, name: &str) -> Option<&'a str> {
    property
        .params
        .iter()
        .find(|(key, _)| key == name)
        .map(|(_, value)| value.as_str())
}

fn decode_text(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut chars = value.chars();
    while let Some(ch) = chars.next() {
        if ch == '\\' {
            match chars.next() {
                Some('n' | 'N') => output.push('\n'),
                Some(',') => output.push(','),
                Some(';') => output.push(';'),
                Some('\\') => output.push('\\'),
                Some(other) => {
                    output.push('\\');
                    output.push(other);
                }
                None => output.push('\\'),
            }
        } else {
            output.push(ch);
        }
    }
    output.trim().to_owned()
}

fn localize(
    date: NaiveDate,
    time: NaiveTime,
    timezone: Option<&str>,
) -> AppResult<(NaiveDate, NaiveTime)> {
    let naive = date.and_time(time);
    let local = match timezone {
        Some("UTC") | Some("Etc/UTC") | Some("GMT") => Utc
            .from_local_datetime(&naive)
            .single()
            .expect("UTC local datetime is unique")
            .with_timezone(&Local),
        Some(zone) => {
            let tz: Tz = zone.parse().map_err(|_| {
                validation(format!(
                    "Unsupported time zone '{zone}'. Use an IANA time zone."
                ))
            })?;
            match tz.from_local_datetime(&naive) {
                LocalResult::Single(value) => value.with_timezone(&Local),
                LocalResult::Ambiguous(first, second) => {
                    let earlier = if first.timestamp() <= second.timestamp() {
                        first
                    } else {
                        second
                    };
                    earlier.with_timezone(&Local)
                }
                LocalResult::None => {
                    return Err(validation(format!(
                        "Calendar contains a nonexistent local time in '{zone}'."
                    )));
                }
            }
        }
        None => match Local.from_local_datetime(&naive) {
            LocalResult::Single(value) => value,
            LocalResult::Ambiguous(first, second) => {
                if first.timestamp() <= second.timestamp() {
                    first
                } else {
                    second
                }
            }
            LocalResult::None => {
                return Err(validation(
                    "Calendar contains a nonexistent local time in the local time zone.",
                ));
            }
        },
    };
    Ok((local.date_naive(), local.time()))
}

fn parse_datetime(property: &Property) -> AppResult<ParsedDateTime> {
    let value_type = param(property, "VALUE");
    let tzid = param(property, "TZID");
    if value_type.is_some_and(|value| value.eq_ignore_ascii_case("DATE"))
        || (value_type.is_none() && property.value.len() == 8)
    {
        if tzid.is_some() || property.value.len() != 8 {
            return Err(validation("Invalid date-only calendar value."));
        }
        let date = NaiveDate::parse_from_str(&property.value, "%Y%m%d")
            .map_err(|_| validation(format!("Invalid calendar date '{}'.", property.value)))?;
        return Ok(ParsedDateTime {
            date,
            time: None,
            all_day: true,
            timezone: None,
            source_date: date,
            source_time: None,
        });
    }
    if value_type.is_some_and(|value| value.eq_ignore_ascii_case("DATE-TIME"))
        || value_type.is_none()
    {
        let utc = property.value.ends_with('Z');
        let raw = property.value.trim_end_matches('Z');
        let time = NaiveTime::parse_from_str(raw.get(9..).unwrap_or_default(), "%H%M%S")
            .or_else(|_| NaiveTime::parse_from_str(raw.get(9..).unwrap_or_default(), "%H%M"))
            .map_err(|_| validation(format!("Invalid calendar time '{}'.", property.value)))?;
        let date = NaiveDate::parse_from_str(raw.get(..8).unwrap_or_default(), "%Y%m%d")
            .map_err(|_| validation(format!("Invalid calendar date-time '{}'.", property.value)))?;
        if utc && tzid.is_some() {
            return Err(validation("A UTC date-time cannot also specify TZID."));
        }
        let timezone = if utc {
            Some("UTC".to_owned())
        } else {
            tzid.map(str::to_owned)
        };
        let source_date = date;
        let source_time = time;
        let (date, time) = localize(source_date, source_time, timezone.as_deref())?;
        return Ok(ParsedDateTime {
            date,
            time: Some(time),
            all_day: false,
            timezone,
            source_date,
            source_time: Some(source_time),
        });
    }
    Err(validation(format!(
        "Unsupported calendar value type '{}'.",
        value_type.unwrap_or("")
    )))
}

fn parse_rrule(property: Option<&Property>) -> AppResult<bool> {
    let Some(property) = property else {
        return Ok(false);
    };
    let parts: Vec<_> = property.value.split(';').collect();
    if parts.len() != 1 || !parts[0].eq_ignore_ascii_case("FREQ=YEARLY") {
        return Err(validation(
            "Only simple yearly recurrence (RRULE:FREQ=YEARLY) is supported.",
        ));
    }
    Ok(true)
}

fn parse_event(properties: &[Property]) -> AppResult<Option<ImportedEvent>> {
    for name in ["UID", "DTSTART", "DTEND", "RRULE", "SUMMARY", "STATUS"] {
        if properties
            .iter()
            .filter(|property| property.name == name)
            .count()
            > 1
        {
            return Err(validation(format!(
                "Event has duplicate {name} properties."
            )));
        }
    }
    let first = |name: &str| properties.iter().find(|p| p.name == name);
    let status = first("STATUS").map(|p| p.value.as_str());
    if status.is_some_and(|value| value.eq_ignore_ascii_case("CANCELLED")) {
        return Ok(None);
    }
    if properties.iter().any(|p| {
        matches!(
            p.name.as_str(),
            "RDATE" | "EXDATE" | "RECURRENCE-ID" | "DURATION"
        )
    }) {
        return Err(validation(
            "DURATION, RDATE, EXDATE, and recurrence overrides are not supported; use DTSTART/DTEND.",
        ));
    }
    let uid = first("UID")
        .map(|p| p.value.trim())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| validation("Every event must have a UID."))?
        .to_owned();
    let start_prop =
        first("DTSTART").ok_or_else(|| validation(format!("Event '{uid}' is missing DTSTART.")))?;
    let start = parse_datetime(start_prop)?;
    let summary = first("SUMMARY")
        .map(|p| decode_text(&p.value))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "Untitled event".to_owned());
    let yearly = parse_rrule(first("RRULE"))?;
    let end = match first("DTEND") {
        Some(end_prop) => {
            let value = parse_datetime(end_prop)?;
            if value.all_day != start.all_day {
                return Err(validation(format!(
                    "Event '{uid}' mixes date and date-time boundaries."
                )));
            }
            Some(value)
        }
        None => None,
    };
    if start.all_day {
        if let Some(end) = &end
            && end.date < start.date
        {
            return Err(validation(format!("Event '{uid}' ends before it starts.")));
        }
    } else if let (Some(start_time), Some(end)) = (start.time, end.as_ref()) {
        if end.date < start.date || (end.date == start.date && end.time < Some(start_time)) {
            return Err(validation(format!("Event '{uid}' ends before it starts.")));
        }
        if yearly && (end.source_date != start.source_date || end.timezone != start.timezone) {
            return Err(validation(format!(
                "Yearly timed event '{uid}' must have same-day start/end in one time zone."
            )));
        }
    }
    let end_time = end
        .as_ref()
        .and_then(|e| if yearly { e.source_time } else { e.time })
        .map(|t| t.format("%H:%M").to_string());
    let start_time = if yearly {
        start.source_time
    } else {
        start.time
    }
    .map(|t| t.format("%H:%M").to_string());
    let timezone = if yearly { start.timezone.clone() } else { None };
    let stored_date = if yearly {
        start.source_date
    } else {
        start.date
    };
    Ok(Some(ImportedEvent {
        uid,
        summary,
        start_date: stored_date.format("%Y-%m-%d").to_string(),
        start_time,
        end_time,
        all_day: start.all_day,
        yearly,
        timezone,
    }))
}

/// Parse and validate the supported VCALENDAR subset before any database writes happen.
pub fn parse_calendar(text: &str) -> AppResult<Vec<ImportedEvent>> {
    if text.trim().is_empty() {
        return Err(validation("Calendar file is empty."));
    }
    let lines = unfold(text)?;
    let mut in_calendar = false;
    let mut in_event = false;
    let mut saw_calendar = false;
    let mut props = Vec::new();
    let mut events = Vec::new();
    let mut event_count = 0;
    for line in lines {
        let upper = line.to_ascii_uppercase();
        match upper.as_str() {
            "BEGIN:VCALENDAR" if !in_calendar && !in_event => {
                in_calendar = true;
                saw_calendar = true;
            }
            "END:VCALENDAR" if in_calendar && !in_event => in_calendar = false,
            "BEGIN:VEVENT" if in_calendar && !in_event => {
                in_event = true;
                props.clear();
            }
            "END:VEVENT" if in_calendar && in_event => {
                event_count += 1;
                if event_count > MAX_EVENTS {
                    return Err(validation("Calendar contains more than 10,000 events."));
                }
                if let Some(event) = parse_event(&props)? {
                    events.push(event);
                }
                in_event = false;
            }
            _ if in_event => props.push(parse_property(&line)?),
            _ if upper.starts_with("BEGIN:") && upper != "BEGIN:VTIMEZONE" && in_calendar => {
                // Other components are ignored unless nested inside a VEVENT.
            }
            _ => {}
        }
    }
    if !saw_calendar || in_calendar || in_event {
        return Err(validation(
            "Calendar file has an incomplete or missing VCALENDAR component.",
        ));
    }
    let mut uids = std::collections::HashSet::new();
    for event in &events {
        if !uids.insert(&event.uid) {
            return Err(validation(format!(
                "Calendar contains duplicate event UID '{}'.",
                event.uid
            )));
        }
    }
    Ok(events)
}

pub fn occurrence_on(
    event: &ImportedEvent,
    date: NaiveDate,
) -> AppResult<Option<CalendarEventOccurrence>> {
    let base = NaiveDate::parse_from_str(&event.start_date, "%Y-%m-%d")
        .map_err(|e| AppError::Database(format!("invalid stored event date: {e}")))?;
    let start_time = if event.all_day {
        None
    } else {
        Some(
            event
                .start_time
                .as_deref()
                .and_then(|s| NaiveTime::parse_from_str(s, "%H:%M").ok())
                .ok_or_else(|| AppError::Database("invalid stored event start time".into()))?,
        )
    };
    let occurrence = if !event.yearly {
        if base != date {
            return Ok(None);
        }
        base
    } else if event.all_day {
        if date < base || (date.month(), date.day()) != (base.month(), base.day()) {
            return Ok(None);
        }
        date
    } else {
        let start_time = start_time.expect("timed events have a start time");
        let years = [
            date.year().saturating_sub(1),
            date.year(),
            date.year().saturating_add(1),
        ];
        let mut matching_source_date = None;
        for year in years {
            let Some(candidate) = NaiveDate::from_ymd_opt(year, base.month(), base.day()) else {
                continue;
            };
            if candidate < base {
                continue;
            }
            if let Ok((local_date, _)) = localize(candidate, start_time, event.timezone.as_deref())
                && local_date == date
            {
                matching_source_date = Some(candidate);
                break;
            }
        }
        let Some(candidate) = matching_source_date else {
            return Ok(None);
        };
        candidate
    };
    if event.all_day {
        return Ok(Some(CalendarEventOccurrence {
            date: occurrence,
            start_time: None,
            end_time: None,
        }));
    }
    let start_time = start_time.expect("timed events have a start time");
    let (local_date, local_time) = if event.yearly {
        localize(occurrence, start_time, event.timezone.as_deref())?
    } else {
        (occurrence, start_time)
    };
    let end_time = if event.yearly {
        event
            .end_time
            .as_deref()
            .map(|raw| {
                NaiveTime::parse_from_str(raw, "%H:%M")
                    .map_err(|_| AppError::Database("invalid stored event end time".into()))
                    .and_then(|time| {
                        localize(occurrence, time, event.timezone.as_deref())
                            .map(|(_, time)| time.format("%H:%M").to_string())
                    })
            })
            .transpose()?
    } else {
        event.end_time.clone()
    };
    Ok(Some(CalendarEventOccurrence {
        date: local_date,
        start_time: Some(local_time.format("%H:%M").to_string()),
        end_time,
    }))
}

#[derive(Debug, Clone, PartialEq)]
pub struct CalendarEventOccurrence {
    pub date: NaiveDate,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_all_day_and_yearly_birthday_and_unfolds_summary() {
        let events = parse_calendar("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:bday\r\nDTSTART;VALUE=DATE:19900228\r\nRRULE:FREQ=YEARLY\r\nSUMMARY:Mom's birthday\\, \r\n party\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n").unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].summary, "Mom's birthday, party");
        assert!(events[0].yearly);
        assert!(events[0].all_day);
    }

    #[test]
    fn rejects_unsupported_recurrence_and_duplicate_uid() {
        let weekly = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:a\nDTSTART;VALUE=DATE:20260101\nRRULE:FREQ=WEEKLY\nEND:VEVENT\nEND:VCALENDAR";
        assert!(matches!(
            parse_calendar(weekly),
            Err(AppError::Validation(_))
        ));
        let duplicate = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:a\nDTSTART;VALUE=DATE:20260101\nEND:VEVENT\nBEGIN:VEVENT\nUID:a\nDTSTART;VALUE=DATE:20260102\nEND:VEVENT\nEND:VCALENDAR";
        assert!(matches!(
            parse_calendar(duplicate),
            Err(AppError::Validation(_))
        ));
    }

    #[test]
    fn yearly_timed_event_repeats_on_its_local_machine_date() {
        let input = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:annual\nDTSTART;TZID=Pacific/Kiritimati:20240101T003000\nDTEND;TZID=Pacific/Kiritimati:20240101T013000\nRRULE:FREQ=YEARLY\nSUMMARY:Annual event\nEND:VEVENT\nEND:VCALENDAR";
        let event = parse_calendar(input).unwrap().remove(0);
        let base = NaiveDate::parse_from_str("2024-01-01", "%Y-%m-%d").unwrap();
        let source_time = NaiveTime::parse_from_str("00:30", "%H:%M").unwrap();
        let local_date = localize(base, source_time, Some("Pacific/Kiritimati"))
            .unwrap()
            .0;
        let occurrence = occurrence_on(&event, local_date).unwrap().unwrap();
        assert_eq!(occurrence.date, local_date);
        assert!(occurrence.start_time.is_some());
    }

    #[test]
    fn rejects_unknown_iana_timezone() {
        let input = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:bad-zone\nDTSTART;TZID=Not/AZone:20260101T120000\nEND:VEVENT\nEND:VCALENDAR";
        assert!(matches!(
            parse_calendar(input),
            Err(AppError::Validation(_))
        ));
    }

    #[test]
    fn cancels_are_skipped_and_missing_summary_gets_default() {
        let input = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:a\nDTSTART;VALUE=DATE:20260101\nEND:VEVENT\nBEGIN:VEVENT\nUID:b\nDTSTART;VALUE=DATE:20260101\nSTATUS:CANCELLED\nEND:VEVENT\nEND:VCALENDAR";
        let events = parse_calendar(input).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].summary, "Untitled event");
    }
}
