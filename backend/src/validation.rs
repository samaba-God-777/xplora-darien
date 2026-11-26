//! Validadores reutilizables.
use validator::ValidationError;

/// Slug en minúsculas: `cascada-arenal`.
pub fn slug(s: &str) -> Result<(), ValidationError> {
    let ok = !s.is_empty()
        && !s.starts_with('-')
        && !s.ends_with('-')
        && !s.contains("--")
        && s.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if ok { Ok(()) } else { Err(ValidationError::new("slug")) }
}

/// Código de país ISO 3166-1 alfa-2 en mayúsculas.
pub fn country(s: &str) -> Result<(), ValidationError> {
    if s.len() == 2 && s.chars().all(|c| c.is_ascii_uppercase()) { Ok(()) } else { Err(ValidationError::new("country")) }
}

#[cfg(test)]
mod tests {
    #[test]
    fn slugs() {
        assert!(super::slug("cascada-arenal").is_ok());
        for bad in ["", "-a", "a-", "a--b", "Cascada", "á", "a b"] {
            assert!(super::slug(bad).is_err(), "{bad}");
        }
        assert!(super::country("PA").is_ok());
        assert!(super::country("pa").is_err());
    }
}
