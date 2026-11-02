use crate::error::{AppError, AppResult};
use crate::themes::model::ThemeInput;

pub const MIN_YEAR: i32 = 1900;
pub const MAX_YEAR: i32 = 9999;
pub const TITLE_MAX: usize = 80;
pub const DESCRIPTION_MAX: usize = 2_000;

pub fn validate_year(year: i32) -> AppResult<()> {
    if !(MIN_YEAR..=MAX_YEAR).contains(&year) {
        return Err(AppError::Validation(format!(
            "Year must be between {MIN_YEAR} and {MAX_YEAR}."
        )));
    }
    Ok(())
}

/// Trims and validates the input, treating a blank description as absent.
pub fn normalize_input(input: &ThemeInput) -> AppResult<(String, Option<String>)> {
    let title = input.title.trim();
    let title_len = title.chars().count();
    if title_len == 0 {
        return Err(AppError::Validation("Title is required.".into()));
    }
    if title_len > TITLE_MAX {
        return Err(AppError::Validation(format!(
            "Title must be at most {TITLE_MAX} characters."
        )));
    }

    let description = input
        .description
        .as_deref()
        .map(str::trim)
        .filter(|description| !description.is_empty())
        .map(str::to_owned);
    if description
        .as_deref()
        .is_some_and(|description| description.chars().count() > DESCRIPTION_MAX)
    {
        return Err(AppError::Validation(format!(
            "Description must be at most {DESCRIPTION_MAX} characters."
        )));
    }

    Ok((title.to_owned(), description))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn year_range_is_inclusive() {
        for year in [MIN_YEAR, 2026, MAX_YEAR] {
            assert!(validate_year(year).is_ok(), "year {year}");
        }
        for year in [MIN_YEAR - 1, MAX_YEAR + 1] {
            assert!(matches!(validate_year(year), Err(AppError::Validation(_))));
        }
    }

    #[test]
    fn trims_title_and_normalizes_blank_description() {
        let input = ThemeInput {
            title: "  Year of Practice  ".into(),
            description: Some(" \n ".into()),
        };
        assert_eq!(
            normalize_input(&input).unwrap(),
            ("Year of Practice".into(), None)
        );
    }

    #[test]
    fn validates_title_and_description_character_counts() {
        for input in [
            ThemeInput {
                title: " \t ".into(),
                description: None,
            },
            ThemeInput {
                title: "x".repeat(TITLE_MAX + 1),
                description: None,
            },
            ThemeInput {
                title: "Theme".into(),
                description: Some("x".repeat(DESCRIPTION_MAX + 1)),
            },
        ] {
            assert!(matches!(
                normalize_input(&input),
                Err(AppError::Validation(_))
            ));
        }

        let input = ThemeInput {
            title: "é".repeat(TITLE_MAX),
            description: Some("語".repeat(DESCRIPTION_MAX)),
        };
        assert!(normalize_input(&input).is_ok());
    }
}
