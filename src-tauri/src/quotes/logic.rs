//! Pure quote validation, daily selection and bulk-import parsing (SPEC §15).

use chrono::NaiveDate;

use crate::error::{AppError, AppResult};
use crate::quotes::model::NewQuote;

const QUOTE_MAX: usize = 1_000;
const ATTRIBUTION_MAX: usize = 200;

pub fn validate_quote(input: &NewQuote) -> AppResult<()> {
    let text = input.text.trim();
    if text.is_empty() || text.chars().count() > QUOTE_MAX {
        return Err(AppError::Validation(
            "Quote text must be 1–1,000 characters".into(),
        ));
    }
    for (name, value) in [("Author", &input.author), ("Source", &input.source)] {
        if value.as_deref().unwrap_or_default().trim().chars().count() > ATTRIBUTION_MAX {
            return Err(AppError::Validation(format!(
                "{name} must be at most 200 characters"
            )));
        }
    }
    Ok(())
}

/// Select a stable quote using signed whole days from the Unix epoch and Euclidean modulo.
pub fn daily_index(date: NaiveDate, count: usize) -> Option<usize> {
    if count == 0 {
        return None;
    }
    let epoch = NaiveDate::from_ymd_opt(1970, 1, 1)?;
    let days = date.signed_duration_since(epoch).num_days() as i128;
    Some(days.rem_euclid(count as i128) as usize)
}

/// Parse nonblank physical lines, preserving their line numbers in validation failures.
pub fn parse_import(text: &str) -> AppResult<Vec<NewQuote>> {
    let lines: Vec<&str> = text.lines().collect();
    if lines.len() > 1_000 {
        return Err(AppError::Validation(
            "Import may contain at most 1,000 lines".into(),
        ));
    }

    let mut quotes = Vec::new();
    for (line_index, raw_line) in lines.iter().enumerate() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }

        let split = [" — ", " -- ", " ~ "]
            .iter()
            .filter_map(|delimiter| line.rfind(delimiter).map(|index| (index, delimiter.len())))
            .max_by_key(|(index, _)| *index);
        let (raw_quote, author) = match split {
            Some((index, delimiter_len)) => (
                &line[..index],
                Some(line[index + delimiter_len..].trim().to_owned()),
            ),
            None => (line, None),
        };
        let quote_text = strip_wrapping_quotes(raw_quote.trim());
        let input = NewQuote {
            text: quote_text.trim().to_owned(),
            author,
            source: None,
        };
        validate_quote(&input)
            .map_err(|error| AppError::Validation(format!("Line {}: {error}", line_index + 1)))?;
        quotes.push(input);
    }
    Ok(quotes)
}

fn strip_wrapping_quotes(text: &str) -> &str {
    let pairs = [("\"", "\""), ("'", "'"), ("“", "”"), ("‘", "’")];
    for (open, close) in pairs {
        if text.starts_with(open) && text.ends_with(close) && text.len() >= open.len() + close.len()
        {
            return &text[open.len()..text.len() - close.len()];
        }
    }
    text
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(value: &str) -> NaiveDate {
        NaiveDate::parse_from_str(value, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn daily_index_handles_empty_epoch_and_signed_dates() {
        assert_eq!(daily_index(d("1970-01-01"), 0), None);
        assert_eq!(daily_index(d("1970-01-01"), 1), Some(0));
        assert_eq!(daily_index(d("1970-01-03"), 7), Some(2));
        assert_eq!(daily_index(d("1969-12-31"), 7), Some(6));
        assert_eq!(daily_index(d("0001-01-01"), 13), Some(11));
        assert_eq!(daily_index(d("9999-12-31"), 97), Some(4));
    }

    #[test]
    fn validates_trimmed_character_lengths_and_optional_fields() {
        assert!(
            validate_quote(&NewQuote {
                text: "  hello  ".into(),
                author: Some("  ".into()),
                source: None,
            })
            .is_ok()
        );
        for text in ["", "  ", &"a".repeat(1_001)] {
            assert!(matches!(
                validate_quote(&NewQuote {
                    text: text.into(),
                    author: None,
                    source: None,
                }),
                Err(AppError::Validation(_))
            ));
        }
        assert!(
            validate_quote(&NewQuote {
                text: "é".repeat(1_000),
                author: Some("a".repeat(200)),
                source: None,
            })
            .is_ok()
        );
        assert!(
            validate_quote(&NewQuote {
                text: "quote".into(),
                author: Some("a".repeat(201)),
                source: None,
            })
            .is_err()
        );
    }

    #[test]
    fn parses_delimiters_at_the_last_occurrence_and_strips_wrapping_quotes() {
        let parsed = parse_import(
            "\"First — thought\" — Author\r\nFirst — Middle — Last\n“Second” -- Writer\n‘Third’ ~ Source\nNo author\n\n",
        )
        .unwrap();
        assert_eq!(parsed.len(), 5);
        assert_eq!(parsed[0].text, "First — thought");
        assert_eq!(parsed[0].author.as_deref(), Some("Author"));
        assert_eq!(parsed[1].text, "First — Middle");
        assert_eq!(parsed[1].author.as_deref(), Some("Last"));
        assert_eq!(parsed[2].text, "Second");
        assert_eq!(parsed[2].author.as_deref(), Some("Writer"));
        assert_eq!(parsed[3].text, "Third");
        assert_eq!(parsed[3].author.as_deref(), Some("Source"));
        assert_eq!(parsed[4].author, None);
    }

    #[test]
    fn rejects_bad_lines_with_physical_line_number_and_too_many_lines() {
        let error = parse_import("Good — Author\n   \n  \"\"  ").unwrap_err();
        assert!(error.to_string().contains("Line 3"));
        let too_many = (0..1_001).map(|_| "\n").collect::<String>();
        assert!(parse_import(&too_many).is_err());
    }

    #[test]
    fn parser_does_not_strip_unbalanced_wrapping_quotes() {
        assert_eq!(
            parse_import("\"Unbalanced").unwrap()[0].text,
            "\"Unbalanced"
        );
    }
}
