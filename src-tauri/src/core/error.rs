use serde::Serialize;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("Zip extraction error: {0}")]
    Zip(#[from] zip::result::ZipError),

    #[error("JSON serialization error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Binary missing: {0} not found in AppData or PATH")]
    BinaryNotFound(String),

    #[error("Version check failed: {binary} version {found} does not meet minimum requirement {required}")]
    VersionTooLow {
        binary: String,
        found: String,
        required: String,
    },

    #[error("Subprocess execution error: {0}")]
    Process(String),

    #[error("Invalid URL: {0}")]
    InvalidUrl(String),

    #[error("Parsing error: {0}")]
    Parse(String),

    #[error("Download canceled")]
    Canceled,
}

// Enable serialization so Tauri IPC can send strongly typed errors to Javascript frontend
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
