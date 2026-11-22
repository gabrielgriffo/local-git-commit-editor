mod git_ops;
mod backup;
#[cfg(test)]
mod test_support;

use git_ops::{CommitInfo, DateEditOperation, RepositoryInfo, RewriteImpact, RewriteMap};
use backup::BackupInfo;
use std::sync::Mutex;

static WRITE_LOCK: Mutex<()> = Mutex::new(());

async fn blocking<T, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

async fn blocking_write<T, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    blocking(move || {
        let _guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        f()
    })
    .await
}

// ─── Repository commands ──────────────────────────────────────────────────────

#[tauri::command]
async fn open_repository(path: String) -> Result<RepositoryInfo, String> {
    blocking(move || git_ops::open_repository(&path)).await
}

#[tauri::command]
async fn get_commits(repo_path: String, limit: usize, offset: usize) -> Result<Vec<CommitInfo>, String> {
    blocking(move || git_ops::get_commits(&repo_path, limit, offset)).await
}

#[tauri::command]
async fn get_unpushed_commits(repo_path: String) -> Result<Vec<CommitInfo>, String> {
    blocking(move || git_ops::get_unpushed_commits(&repo_path)).await
}

// ─── Edit commands ────────────────────────────────────────────────────────────

#[tauri::command]
async fn rewrite_impact(repo_path: String, sha_list: Vec<String>) -> Result<RewriteImpact, String> {
    blocking(move || git_ops::rewrite_impact(&repo_path, &sha_list)).await
}

#[tauri::command]
async fn apply_message_edit(repo_path: String, sha: String, new_message: String) -> Result<RewriteMap, String> {
    blocking_write(move || git_ops::apply_message_edit(&repo_path, &sha, &new_message)).await
}

#[tauri::command]
async fn apply_batch_date_shift(
    repo_path: String,
    sha_list: Vec<String>,
    delta_seconds: i64,
) -> Result<RewriteMap, String> {
    blocking_write(move || git_ops::apply_batch_date_shift(&repo_path, &sha_list, delta_seconds)).await
}

#[tauri::command]
async fn apply_absolute_date_edits(
    repo_path: String,
    operations: Vec<DateEditOperation>,
) -> Result<RewriteMap, String> {
    blocking_write(move || git_ops::apply_absolute_date_edits(&repo_path, &operations)).await
}

// ─── Backup commands ──────────────────────────────────────────────────────────

#[tauri::command]
async fn create_backup(repo_path: String) -> Result<BackupInfo, String> {
    blocking_write(move || backup::create_backup(&repo_path)).await
}

#[tauri::command]
async fn list_backups(repo_path: String) -> Result<Vec<BackupInfo>, String> {
    blocking(move || backup::list_backups(&repo_path)).await
}

#[tauri::command]
async fn restore_backup(repo_path: String, backup_id: String) -> Result<BackupInfo, String> {
    blocking_write(move || backup::restore_backup(&repo_path, &backup_id)).await
}

#[tauri::command]
async fn delete_backup(repo_path: String, backup_id: String) -> Result<(), String> {
    blocking_write(move || backup::delete_backup(&repo_path, &backup_id)).await
}

// ─── App entry point ──────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init());

    #[cfg(desktop)]
    let builder = builder.plugin(
        tauri_plugin_window_state::Builder::default()
            .with_state_flags(
                tauri_plugin_window_state::StateFlags::POSITION
                    | tauri_plugin_window_state::StateFlags::SIZE
                    | tauri_plugin_window_state::StateFlags::MAXIMIZED,
            )
            .build(),
    );

    builder
        .invoke_handler(tauri::generate_handler![
            open_repository,
            get_commits,
            get_unpushed_commits,
            rewrite_impact,
            apply_message_edit,
            apply_batch_date_shift,
            apply_absolute_date_edits,
            create_backup,
            list_backups,
            restore_backup,
            delete_backup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
