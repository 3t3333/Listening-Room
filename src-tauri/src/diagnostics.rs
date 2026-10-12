use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticPayload {
    pub source: String,
    pub version: String,
    pub platform: String,
    pub arch: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub os_version: Option<String>,
    pub error_message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_location: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stack_trace: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_note: Option<String>,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticResponse {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemDiagnostics {
    pub app_version: String,
    pub platform: String,
    pub arch: String,
    pub os_version: String,
    pub has_pending_crash_log: bool,
    pub crash_log_path: String,
    pub configured_proxy_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmitReportRequest {
    pub source: Option<String>,
    pub error_message: String,
    pub error_location: Option<String>,
    pub stack_trace: Option<String>,
    pub user_note: Option<String>,
    pub proxy_url: Option<String>,
}

/// Resolves the canonical path where fatal crash dumps are written.
pub fn get_crash_log_path() -> PathBuf {
    #[cfg(windows)]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let dir = PathBuf::from(local_app_data).join("com.listeningroom.player").join("logs");
            let _ = std::fs::create_dir_all(&dir);
            return dir.join("crash.log");
        }
    }
    #[cfg(not(windows))]
    {
        if let Ok(home) = std::env::var("HOME") {
            let dir = PathBuf::from(home).join(".local").join("share").join("com.listeningroom.player").join("logs");
            let _ = std::fs::create_dir_all(&dir);
            return dir.join("crash.log");
        }
    }
    PathBuf::from("listening-room-crash.log")
}

/// Redacts local usernames and sensitive file paths to preserve user privacy.
pub fn sanitize_text(input: &str) -> String {
    let mut sanitized = input.to_string();
    if let Ok(user) = std::env::var("USERNAME") {
        if !user.is_empty() {
            sanitized = sanitized.replace(&user, "<user>");
        }
    }
    if let Ok(user) = std::env::var("USER") {
        if !user.is_empty() {
            sanitized = sanitized.replace(&user, "<user>");
        }
    }
    sanitized
}

/// Returns a human-readable timestamp string.
pub fn current_timestamp_str() -> String {
    let duration = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    format!("Unix Epoch +{}s", duration.as_secs())
}

/// Configuration file structure for persisting diagnostics settings.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DiagnosticsConfig {
    pub proxy_url: Option<String>,
}

/// Resolves the canonical path where diagnostics settings are stored.
pub fn get_config_path() -> PathBuf {
    #[cfg(windows)]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let dir = PathBuf::from(local_app_data).join("com.listeningroom.player");
            let _ = std::fs::create_dir_all(&dir);
            return dir.join("diagnostics_config.json");
        }
    }
    #[cfg(not(windows))]
    {
        if let Ok(home) = std::env::var("HOME") {
            let dir = PathBuf::from(home).join(".local").join("share").join("com.listeningroom.player");
            let _ = std::fs::create_dir_all(&dir);
            return dir.join("diagnostics_config.json");
        }
    }
    PathBuf::from("diagnostics_config.json")
}

/// Reads the persisted diagnostics proxy URL from disk.
pub fn load_saved_proxy_url() -> Option<String> {
    let path = get_config_path();
    if let Ok(content) = std::fs::read_to_string(&path) {
        if let Ok(config) = serde_json::from_str::<DiagnosticsConfig>(&content) {
            if let Some(url) = config.proxy_url {
                let trimmed = url.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
    }
    None
}

/// Persists the diagnostics proxy URL to disk.
pub fn save_proxy_url(url: &str) -> Result<(), String> {
    let path = get_config_path();
    let config = DiagnosticsConfig {
        proxy_url: Some(url.trim().to_string()),
    };
    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Serialization error: {e}"))?;
    std::fs::write(&path, json)
        .map_err(|e| format!("Failed to write config to {:?}: {e}", path))?;
    Ok(())
}

/// Resolves the proxy URL from override, environment variables, or saved config.
pub fn resolve_proxy_url(override_url: Option<&str>) -> Option<String> {
    if let Some(url) = override_url {
        let trimmed = url.trim();
        if !trimmed.is_empty() {
            let _ = save_proxy_url(trimmed);
            return Some(trimmed.to_string());
        }
    }

    if let Ok(url) = std::env::var("DIAGNOSTICS_PROXY_URL") {
        let trimmed = url.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    if let Ok(url) = std::env::var("VITE_DIAGNOSTICS_PROXY_URL") {
        let trimmed = url.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    load_saved_proxy_url()
}

/// Asynchronously sends a diagnostic payload to the Cloudflare Worker proxy.
pub async fn send_payload_to_proxy(proxy_url: &str, payload: &DiagnosticPayload) -> Result<DiagnosticResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|e| format!("Failed to initialize HTTP client: {e}"))?;

    let response = client
        .post(proxy_url)
        .header("Content-Type", "application/json")
        .header("X-App-Version", &payload.version)
        .header("X-Report-Source", &payload.source)
        .json(payload)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to diagnostics proxy at {proxy_url}: {e}"))?;

    let status = response.status();
    let response_body = response.text().await.unwrap_or_default();

    if status.is_success() {
        Ok(DiagnosticResponse {
            success: true,
            message: format!("Delivered to diagnostics proxy (HTTP {status})"),
        })
    } else {
        Err(format!("Proxy returned error HTTP {status}: {response_body}"))
    }
}

/// Called during application startup: checks if an unsent crash log exists, and uploads it.
pub fn check_and_upload_pending_crash_reports() {
    let crash_file = get_crash_log_path();
    if !crash_file.exists() {
        return;
    }

    let Some(proxy_url) = resolve_proxy_url(None) else {
        log::info!("Crash log exists at {:?}, but no diagnostics proxy URL is configured.", crash_file);
        return;
    };

    tauri::async_runtime::spawn(async move {
        if let Ok(content) = std::fs::read_to_string(&crash_file) {
            if content.trim().is_empty() {
                let _ = std::fs::remove_file(&crash_file);
                return;
            }

            let sanitized = sanitize_text(&content);

            let mut message = "Previous application session terminated unexpectedly (crash).".to_string();
            let mut location = None;

            for line in sanitized.lines() {
                if let Some(rest) = line.strip_prefix("Error: ") {
                    message = rest.trim().to_string();
                } else if let Some(rest) = line.strip_prefix("Location: ") {
                    location = Some(rest.trim().to_string());
                }
            }

            let is_test = message.to_lowercase().contains("test crash");
            let payload = DiagnosticPayload {
                source: if is_test { "test-crash".to_string() } else { "rust-crash-log".to_string() },
                version: env!("CARGO_PKG_VERSION").to_string(),
                platform: std::env::consts::OS.to_string(),
                arch: std::env::consts::ARCH.to_string(),
                os_version: Some(format!("{} ({})", std::env::consts::OS, std::env::consts::ARCH)),
                error_message: message,
                error_location: location,
                stack_trace: Some(sanitized),
                user_note: Some("Reported upon application startup from crash sentinel.".to_string()),
                timestamp: current_timestamp_str(),
            };

            log::info!("Found previous crash dump at {:?}, transmitting to proxy...", crash_file);
            match send_payload_to_proxy(&proxy_url, &payload).await {
                Ok(resp) => {
                    log::info!("Successfully uploaded previous crash dump: {}. Rotating log.", resp.message);
                    let sent_file = crash_file.with_extension("log.sent");
                    let _ = std::fs::rename(&crash_file, sent_file);
                }
                Err(err) => {
                    log::warn!("Failed to transmit crash dump to proxy: {err}. Retrying next startup.");
                }
            }
        }
    });
}

// ---------------------------------------------------------------------------
// Tauri Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn submit_diagnostic_report(request: SubmitReportRequest) -> Result<DiagnosticResponse, String> {
    let proxy_url = resolve_proxy_url(request.proxy_url.as_deref())
        .ok_or_else(|| "Diagnostics proxy URL is not configured. Please specify a proxy URL.".to_string())?;

    let payload = DiagnosticPayload {
        source: request.source.unwrap_or_else(|| "manual-report".to_string()),
        version: env!("CARGO_PKG_VERSION").to_string(),
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        os_version: Some(format!("{} ({})", std::env::consts::OS, std::env::consts::ARCH)),
        error_message: sanitize_text(&request.error_message),
        error_location: request.error_location.map(|l| sanitize_text(&l)),
        stack_trace: request.stack_trace.map(|s| sanitize_text(&s)),
        user_note: request.user_note.map(|n| sanitize_text(&n)),
        timestamp: current_timestamp_str(),
    };

    send_payload_to_proxy(&proxy_url, &payload).await
}

#[tauri::command]
pub async fn test_diagnostic_webhook(proxy_url: Option<String>) -> Result<DiagnosticResponse, String> {
    let url = resolve_proxy_url(proxy_url.as_deref())
        .ok_or_else(|| "Diagnostics proxy URL is not configured. Please provide your Cloudflare Worker URL.".to_string())?;

    let payload = DiagnosticPayload {
        source: "test-ping".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        os_version: Some(format!("{} ({})", std::env::consts::OS, std::env::consts::ARCH)),
        error_message: "Test ping from Listening Room desktop application.".to_string(),
        error_location: None,
        stack_trace: None,
        user_note: Some("Testing end-to-end communication from Desktop Client -> Cloudflare Worker Proxy -> Discord Webhook.".to_string()),
        timestamp: current_timestamp_str(),
    };

    send_payload_to_proxy(&url, &payload).await
}

#[tauri::command]
pub async fn get_system_diagnostics(configured_url: Option<String>) -> Result<SystemDiagnostics, String> {
    let crash_file = get_crash_log_path();
    let has_pending = crash_file.exists();
    let active_url = resolve_proxy_url(configured_url.as_deref());

    Ok(SystemDiagnostics {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        os_version: format!("{} ({})", std::env::consts::OS, std::env::consts::ARCH),
        has_pending_crash_log: has_pending,
        crash_log_path: crash_file.to_string_lossy().to_string(),
        configured_proxy_url: active_url,
    })
}

#[tauri::command]
pub fn save_diagnostics_url(proxy_url: String) -> Result<(), String> {
    save_proxy_url(&proxy_url)
}

#[tauri::command]
pub fn trigger_test_crash(proxy_url: Option<String>) {
    if let Some(url) = proxy_url.as_deref() {
        let _ = save_proxy_url(url);
    }
    log::warn!("Manual diagnostic test crash triggered from Diagnostics tab");
    panic!("Manual diagnostic test crash triggered from Diagnostics tab");
}
