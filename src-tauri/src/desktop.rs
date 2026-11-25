use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::{HashMap, HashSet}, fs, io::Write, path::{Path, PathBuf}, sync::{atomic::{AtomicBool, Ordering}, Mutex}};
use tauri::{Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_shell::{process::{CommandChild, CommandEvent}, ShellExt};

#[derive(Default)]
pub struct AppState {
    running: AtomicBool,
    cancelled: AtomicBool,
    child: Mutex<Option<CommandChild>>,
    active: Mutex<Option<ActiveSession>>,
}

struct ActiveSession { id: String, path: PathBuf, allowed: HashSet<String>, review: Review }

#[derive(Clone, Copy, Deserialize, Serialize, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Decision { Unreviewed, Keep, Reject }

#[derive(Deserialize, Serialize)]
struct Review { version: u32, input_dir: String, decisions: HashMap<String, Decision> }

pub fn stop_job(state: &AppState) {
    state.cancelled.store(true, Ordering::SeqCst);
    if let Ok(mut slot) = state.child.lock() {
        if let Some(child) = slot.take() { let _ = child.kill(); }
    }
}

struct JobGuard<'a>(&'a AppState);
impl Drop for JobGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut slot) = self.0.child.lock() {
            if let Some(child) = slot.take() { let _ = child.kill(); }
        }
        self.0.running.store(false, Ordering::SeqCst);
    }
}

fn session_id(path: &str) -> String { format!("{:x}", Sha256::digest(path.as_bytes())) }

fn write_review(path: &Path, review: &Review) -> Result<(), String> {
    let data = serde_json::to_vec_pretty(review).map_err(|e| e.to_string())?;
    let temporary = path.with_extension("json.part");
    let result = (|| -> Result<(), String> {
        let mut file = fs::File::create(&temporary).map_err(|e| e.to_string())?;
        file.write_all(&data).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        drop(file);
        fs::rename(&temporary, path).map_err(|e| e.to_string())
    })();
    if result.is_err() { let _ = fs::remove_file(&temporary); }
    result
}

#[tauri::command]
pub async fn choose_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog().file().set_title("Scegli una cartella RAW").blocking_pick_folder()
            .map(|value| value.into_path().map(|p| p.to_string_lossy().into_owned()).map_err(|e| e.to_string()))
            .transpose()
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn cancel_analysis(state: State<'_, AppState>) -> Result<(), String> {
    stop_job(&state);
    Ok(())
}

#[tauri::command]
pub async fn run_analysis(app: tauri::AppHandle, state: State<'_, AppState>, input_dir: String,
                          similarity: f64, max_gap: f64) -> Result<Value, String> {
    if !similarity.is_finite() || !(0.0..=1.0).contains(&similarity) || !max_gap.is_finite() || !(0.0..=120.0).contains(&max_gap) {
        return Err("Parametri di raggruppamento non validi".into());
    }
    if state.running.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
        return Err("Un’analisi e' gia' in corso".into());
    }
    let _guard = JobGuard(&state);
    state.cancelled.store(false, Ordering::SeqCst);
    let folder = dunce::canonicalize(&input_dir).map_err(|e| format!("Cartella non accessibile: {e}"))?;
    if !folder.is_dir() { return Err("Il percorso non e' una cartella".into()); }
    let canonical = folder.to_str().ok_or("Percorso non rappresentabile in UTF-8")?.to_string();
    let id = session_id(&canonical);
    let cache = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("previews").join(&id);
    fs::create_dir_all(&cache).map_err(|e| e.to_string())?;
    let cache = dunce::canonicalize(cache).map_err(|e| e.to_string())?;
    let (mut receiver, child) = app.shell().sidecar("photo-engine").map_err(|e| e.to_string())?
        .args([format!("--input-dir={canonical}"), format!("--cache-dir={}", cache.to_string_lossy()),
               "--analyze".into(), "--progress".into(), format!("--similarity={similarity}"), format!("--max-gap={max_gap}")])
        .kill_on_drop(true).spawn().map_err(|e| format!("Avvio motore fallito: {e}"))?;
    *state.child.lock().map_err(|e| e.to_string())? = Some(child);
    if state.cancelled.load(Ordering::SeqCst) { stop_job(&state); return Err("Analisi annullata".into()); }
    let mut stdout = Vec::new();
    let mut stderr = String::new();
    let mut code = None;
    while let Some(event) = receiver.recv().await {
        match event {
            CommandEvent::Stdout(bytes) => {
                if stdout.len() + bytes.len() > 128 * 1024 * 1024 { return Err("Risposta del motore troppo grande".into()); }
                stdout.extend_from_slice(&bytes);
            }
            CommandEvent::Stderr(bytes) => {
                let line = String::from_utf8_lossy(&bytes);
                if let Some(payload) = line.strip_prefix("PHOTO_CULL_PROGRESS ") {
                    if let Ok(value) = serde_json::from_str::<Value>(payload.trim()) { let _ = app.emit("analysis-progress", value); }
                } else if stderr.len() < 16_384 { stderr.push_str(&line); stderr.push('\n'); }
            }
            CommandEvent::Terminated(payload) => { code = payload.code; break; }
            CommandEvent::Error(error) => return Err(error),
            _ => {}
        }
    }
    state.child.lock().map_err(|e| e.to_string())?.take();
    if state.cancelled.load(Ordering::SeqCst) { return Err("Analisi annullata".into()); }
    let mut report: Value = serde_json::from_slice(&stdout).map_err(|e| format!("JSON del motore non valido: {e}. {stderr}"))?;
    if code != Some(0) || report["status"] == "error" {
        return Err(report["error"]["message"].as_str().unwrap_or(&stderr).to_string());
    }
    if report["protocol_version"] != 1 || report["command"] != "analyze" { return Err("Protocollo analisi incompatibile".into()); }
    let photos = report["photos"].as_array().ok_or("Lista foto assente")?;
    let mut allowed = HashSet::new();
    for photo in photos {
        let photo_id = photo["id"].as_str().ok_or("ID fotografia assente")?;
        if !allowed.insert(photo_id.to_string()) { return Err("ID fotografia duplicato".into()); }
        for field in ["preview_path", "thumbnail_path"] {
            let path = dunce::canonicalize(photo[field].as_str().ok_or("Anteprima assente: ricostruire il sidecar")?).map_err(|e| e.to_string())?;
            if !path.starts_with(&cache) || path.extension().and_then(|s| s.to_str()) != Some("jpg") {
                return Err("Anteprima fuori dalla cache prevista".into());
            }
        }
    }
    app.asset_protocol_scope().allow_directory(&cache, false).map_err(|e| e.to_string())?;
    let reviews_dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("reviews");
    fs::create_dir_all(&reviews_dir).map_err(|e| e.to_string())?;
    let review_path = reviews_dir.join(format!("{id}.json"));
    let review = if review_path.exists() {
        let review: Review = serde_json::from_slice(&fs::read(&review_path).map_err(|e| e.to_string())?)
            .map_err(|e| format!("File decisioni non leggibile, conservarne una copia: {e}"))?;
        if review.version != 1 || review.input_dir != canonical { return Err("File decisioni incompatibile".into()); }
        review
    } else { Review { version: 1, input_dir: canonical, decisions: HashMap::new() } };
    let current: HashMap<_, _> = review.decisions.iter().filter(|(key, _)| allowed.contains(*key)).map(|(key, value)| (key.clone(), *value)).collect();
    report["session_id"] = json!(id);
    report["decisions"] = json!(current);
    report["review_path"] = json!(review_path.to_string_lossy());
    *state.active.lock().map_err(|e| e.to_string())? = Some(ActiveSession { id, path: review_path, allowed, review });
    Ok(report)
}

#[tauri::command]
pub async fn save_review(state: State<'_, AppState>, session_id: String, photo_id: String, decision: Decision) -> Result<(), String> {
    let mut active = state.active.lock().map_err(|e| e.to_string())?;
    let session = active.as_mut().ok_or("Nessuna sessione aperta")?;
    if session.id != session_id || !session.allowed.contains(&photo_id) { return Err("Foto estranea alla sessione corrente".into()); }
    let old = session.review.decisions.insert(photo_id.clone(), decision);
    if let Err(error) = write_review(&session.path, &session.review) {
        if let Some(previous) = old { session.review.decisions.insert(photo_id, previous); }
        else { session.review.decisions.remove(&photo_id); }
        return Err(format!("Salvataggio decisione fallito: {error}"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn session_keys_are_stable_and_separate_paths() {
        assert_eq!(session_id("a"), session_id("a"));
        assert_eq!(session_id("a").len(), 64);
        assert_ne!(session_id("a"), session_id("b"));
    }
    #[test]
    fn decision_rejects_unknown_states() {
        assert!(serde_json::from_str::<Decision>("\"delete\"").is_err());
        assert_eq!(serde_json::from_str::<Decision>("\"reject\"").unwrap(), Decision::Reject);
    }
    #[test]
    fn reviews_can_replace_existing_file() {
        let folder = std::env::temp_dir().join(format!("photo-cull-test-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        fs::create_dir(&folder).unwrap();
        let path = folder.join("review.json");
        let mut review = Review { version: 1, input_dir: "test".into(), decisions: HashMap::new() };
        write_review(&path, &review).unwrap();
        review.decisions.insert("photo".into(), Decision::Keep);
        write_review(&path, &review).unwrap();
        let loaded: Review = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(loaded.decisions["photo"], Decision::Keep);
        fs::remove_file(path).unwrap(); fs::remove_dir(folder).unwrap();
    }
}
