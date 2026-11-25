use serde::Deserialize;
use tauri_plugin_shell::ShellExt;
mod desktop;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PingResponse {
    protocol_version: u32,
    message: String,
}

fn parse_response(bytes: &[u8]) -> Result<String, String> {
    let response: PingResponse = serde_json::from_slice(bytes)
        .map_err(|error| format!("Risposta Python non valida: {error}"))?;
    if response.protocol_version != 1 {
        return Err("Versione protocollo Python non supportata".into());
    }
    Ok(response.message)
}

#[tauri::command]
async fn ping_python(app: tauri::AppHandle, name: String) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 100 {
        return Err("Inserisci un nome da 1 a 100 caratteri".into());
    }

    // Un eseguibile fisso, con argomenti separati: nessuna shell di sistema.
    let output = app
        .shell()
        .sidecar("photo-engine")
        .map_err(|error| format!("Sidecar non disponibile: {error}"))?
        .args([format!("--ping={name}")])
        .output()
        .await
        .map_err(|error| format!("Avvio Python fallito: {error}"))?;

    if !output.status.success() {
        return Err(format!(
            "Python ha restituito un errore: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    parse_response(&output.stdout)
}

pub fn run() {
    tauri::Builder::default()
        .manage(desktop::AppState::default())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                use tauri::Manager;
                desktop::stop_job(&window.state::<desktop::AppState>());
            }
        })
        .invoke_handler(tauri::generate_handler![ping_python, desktop::choose_folder,
            desktop::run_analysis, desktop::cancel_analysis, desktop::save_review])
        .run(tauri::generate_context!())
        .expect("Errore durante l’avvio di Photo Cull");
}

#[cfg(test)]
mod tests {
    use super::parse_response;

    #[test]
    fn accepts_protocol_and_unicode() {
        assert_eq!(parse_response("{\"protocol_version\":1,\"message\":\"Ciao José\"}".as_bytes()).unwrap(), "Ciao José");
    }

    #[test]
    fn rejects_broken_or_incompatible_protocol() {
        assert!(parse_response(b"not json").is_err());
        assert!(parse_response(br#"{"protocol_version":2,"message":"ciao"}"#).is_err());
    }
}
