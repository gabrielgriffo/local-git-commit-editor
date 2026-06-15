use chrono::Utc;
use git2::Repository;
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BackupInfo {
    pub id: String,
    pub created_at: i64,
    pub branch: String,
    pub head_sha: String,
    pub description: String,
}

fn backup_dir(repo_path: &str) -> PathBuf {
    PathBuf::from(repo_path).join(".git").join("lge-backups")
}

pub fn create_backup(repo_path: &str) -> Result<BackupInfo, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.to_string())?;

    let head = repo.head().map_err(|e| e.to_string())?;
    let branch = head.shorthand().unwrap_or("HEAD").to_string();
    let head_sha = head.peel_to_commit().map_err(|e| e.to_string())?.id().to_string();

    let now = Utc::now();
    let id = now.format("%Y%m%d_%H%M%S").to_string();
    let created_at = now.timestamp();

    let info = BackupInfo {
        id: id.clone(),
        created_at,
        branch: branch.clone(),
        head_sha: head_sha.clone(),
        description: format!("{} @ {}", branch, head_sha[..7].to_string()),
    };

    let dir = backup_dir(repo_path);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let path = dir.join(format!("{}.json", id));
    let json = serde_json::to_string_pretty(&info).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;

    Ok(info)
}

pub fn list_backups(repo_path: &str) -> Result<Vec<BackupInfo>, String> {
    let dir = backup_dir(repo_path);
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut backups: Vec<BackupInfo> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| {
            let path = entry.ok()?.path();
            if path.extension()?.to_str()? != "json" {
                return None;
            }
            let content = fs::read_to_string(&path).ok()?;
            serde_json::from_str(&content).ok()
        })
        .collect();

    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(backups)
}

pub fn restore_backup(repo_path: &str, backup_id: &str) -> Result<(), String> {
    let dir = backup_dir(repo_path);
    let path = dir.join(format!("{}.json", backup_id));

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Backup not found: {}", e))?;
    let info: BackupInfo = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    let repo = Repository::open(repo_path).map_err(|e| e.to_string())?;
    let target_oid = git2::Oid::from_str(&info.head_sha).map_err(|e| e.to_string())?;
    let ref_name = format!("refs/heads/{}", info.branch);

    repo.reference(&ref_name, target_oid, true, "lge: restore backup")
        .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn delete_backup(repo_path: &str, backup_id: &str) -> Result<(), String> {
    let dir = backup_dir(repo_path);
    let path = dir.join(format!("{}.json", backup_id));
    fs::remove_file(&path).map_err(|e| e.to_string())
}
