mod git_ops;
mod backup;

use git_ops::{CommitInfo, DateEditOperation, RepositoryInfo};
use backup::BackupInfo;

// ─── Repository commands ──────────────────────────────────────────────────────

#[tauri::command]
fn open_repository(path: &str) -> Result<RepositoryInfo, String> {
    git_ops::open_repository(path)
}

#[tauri::command]
fn get_commits(repo_path: &str, limit: usize, offset: usize) -> Result<Vec<CommitInfo>, String> {
    git_ops::get_commits(repo_path, limit, offset)
}

#[tauri::command]
fn get_unpushed_commits(repo_path: &str) -> Result<Vec<CommitInfo>, String> {
    git_ops::get_unpushed_commits(repo_path)
}

// ─── Edit commands ────────────────────────────────────────────────────────────

#[tauri::command]
fn apply_message_edit(repo_path: &str, sha: &str, new_message: &str) -> Result<(), String> {
    git_ops::apply_message_edit(repo_path, sha, new_message)
}

#[tauri::command]
fn apply_batch_date_shift(
    repo_path: &str,
    sha_list: Vec<String>,
    delta_seconds: i64,
) -> Result<(), String> {
    git_ops::apply_batch_date_shift(repo_path, &sha_list, delta_seconds)
}

#[tauri::command]
fn apply_absolute_date_edits(
    repo_path: &str,
    operations: Vec<DateEditOperation>,
) -> Result<(), String> {
    git_ops::apply_absolute_date_edits(repo_path, &operations)
}

// ─── Backup commands ──────────────────────────────────────────────────────────

#[tauri::command]
fn create_backup(repo_path: &str) -> Result<BackupInfo, String> {
    backup::create_backup(repo_path)
}

#[tauri::command]
fn list_backups(repo_path: &str) -> Result<Vec<BackupInfo>, String> {
    backup::list_backups(repo_path)
}

#[tauri::command]
fn restore_backup(repo_path: &str, backup_id: &str) -> Result<(), String> {
    backup::restore_backup(repo_path, backup_id)
}

#[tauri::command]
fn delete_backup(repo_path: &str, backup_id: &str) -> Result<(), String> {
    backup::delete_backup(repo_path, backup_id)
}

// ─── App entry point ──────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            open_repository,
            get_commits,
            get_unpushed_commits,
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
