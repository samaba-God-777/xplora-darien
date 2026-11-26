//! Resolución de rutas y URLs de recursos multimedia.
//!
//! - Originales de pageWeb (`imagen/…`, `instagram/…`): solo lectura, servidos por el frontend en `/media`.
//! - Archivos propios (`uploads/…`, `generated/…`, `posters/…`): en `STORAGE_DIR`, servidos por la API en `/files`.
use std::path::{Component, Path, PathBuf};

use crate::config::Config;

const STORAGE_PREFIXES: [&str; 3] = ["uploads/", "generated/", "posters/"];

pub fn is_storage_path(path: &str) -> bool {
    STORAGE_PREFIXES.iter().any(|p| path.starts_with(p))
}

/// Ruta en disco de un recurso. Rechaza `..` y rutas absolutas.
pub fn fs_path(config: &Config, path: &str) -> Option<PathBuf> {
    let rel = Path::new(path);
    if rel.components().any(|c| !matches!(c, Component::Normal(_))) {
        return None;
    }
    if is_storage_path(path) {
        Some(config.storage_dir.join(rel))
    } else if let Some(rest) = path.strip_prefix("instagram/") {
        Some(config.pageweb_dir.join("review/instagram").join(rest))
    } else if path.starts_with("imagen/") {
        Some(config.pageweb_dir.join(rel))
    } else {
        None
    }
}

/// Codifica cada segmento de la ruta para usarla en una URL (los nombres originales tienen espacios).
pub fn encode_path(path: &str) -> String {
    path.split('/')
        .map(|seg| {
            seg.bytes()
                .map(|b| match b {
                    b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
                    _ => format!("%{b:02X}"),
                })
                .collect::<String>()
        })
        .collect::<Vec<_>>()
        .join("/")
}

/// Fotos originales (imagen/, instagram/) que tienen versión HD con el mismo nombre en storage/media-hd.
fn has_hd_version(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    (lower.starts_with("imagen/") || lower.starts_with("instagram/"))
        && [".jpg", ".jpeg", ".png", ".webp"].iter().any(|e| lower.ends_with(e))
}

pub fn public_url(config: &Config, path: &str) -> String {
    let base = if is_storage_path(path) {
        &config.public_files_url
    } else if has_hd_version(path) {
        &config.media_hd_base_url
    } else {
        &config.media_base_url
    };
    format!("{}/{}", base.trim_end_matches('/'), encode_path(path))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn photos_use_hd_and_videos_keep_originals() {
        assert!(has_hd_version("imagen/img3.webp"));
        assert!(has_hd_version("instagram/slides/a.JPG"));
        assert!(!has_hd_version("instagram/videos/a.mp4"));
        assert!(!has_hd_version("uploads/a.jpg"));
    }

    #[test]
    fn encodes_spaces_and_accents() {
        assert_eq!(encode_path("imagen/playa mueto2.jpeg"), "imagen/playa%20mueto2.jpeg");
        assert_eq!(encode_path("imagen/añ.jpg"), "imagen/a%C3%B1.jpg");
    }

    #[test]
    fn rejects_traversal() {
        let c = crate::config::tests_support::config();
        assert!(fs_path(&c, "../etc/passwd").is_none());
        assert!(fs_path(&c, "uploads/../../x").is_none());
        assert!(fs_path(&c, "/etc/passwd").is_none());
        assert!(fs_path(&c, "otra/x.jpg").is_none());
        assert_eq!(fs_path(&c, "instagram/videos/a.mp4").unwrap(), PathBuf::from("/pw/review/instagram/videos/a.mp4"));
        assert_eq!(fs_path(&c, "uploads/a.jpg").unwrap(), PathBuf::from("/st/uploads/a.jpg"));
        assert_eq!(public_url(&c, "uploads/a b.jpg"), "http://api/files/uploads/a%20b.jpg");
        assert_eq!(public_url(&c, "imagen/a b.jpg"), "/media-hd/imagen/a%20b.jpg");
        assert_eq!(public_url(&c, "instagram/videos/a.mp4"), "/media/instagram/videos/a.mp4");
    }
}
