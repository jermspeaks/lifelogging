use crate::error::{AppError, AppResult};

pub const BODY_MAX: usize = 100_000;
pub const PREVIEW_MAX: usize = 160;

pub fn validate_body(body: &str) -> AppResult<()> {
    if body.chars().count() > BODY_MAX {
        return Err(AppError::Validation(format!(
            "Journal entry must be at most {BODY_MAX} characters."
        )));
    }
    Ok(())
}

pub fn preview(body: &str) -> String {
    let collapsed = body.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut chars = collapsed.chars();
    let prefix = chars.by_ref().take(PREVIEW_MAX).collect::<String>();
    if chars.next().is_some() {
        let mut shortened = prefix.chars().take(PREVIEW_MAX - 1).collect::<String>();
        shortened.push('…');
        shortened
    } else {
        prefix
    }
}

pub fn word_count(body: &str) -> i64 {
    body.split_whitespace().count() as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_character_limit() {
        assert!(validate_body(&"x".repeat(BODY_MAX)).is_ok());
        assert!(matches!(
            validate_body(&"x".repeat(BODY_MAX + 1)),
            Err(AppError::Validation(_))
        ));
        assert!(validate_body(&"é".repeat(BODY_MAX)).is_ok());
    }

    #[test]
    fn preview_collapses_whitespace_trims_and_truncates() {
        assert_eq!(preview("  one\n\t two  "), "one two");
        assert_eq!(preview(&"x".repeat(PREVIEW_MAX)), "x".repeat(PREVIEW_MAX));
        assert_eq!(
            preview(&"x".repeat(PREVIEW_MAX + 1)),
            format!("{}…", "x".repeat(159))
        );
        assert_eq!(preview("  \n\t "), "");
    }

    #[test]
    fn word_count_uses_whitespace_separated_tokens() {
        for (body, expected) in [("", 0), (" \n\t", 0), ("one", 1), (" one\ntwo  three ", 3)] {
            assert_eq!(word_count(body), expected);
        }
    }
}
