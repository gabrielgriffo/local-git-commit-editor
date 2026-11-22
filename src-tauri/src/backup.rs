use chrono::Utc;
use git2::{Oid, Repository};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BackupInfo {
    pub id: String,
    pub created_at: i64,
    pub branch: String,
    pub head_sha: String,
    pub description: String,
    #[serde(default)]
    pub head_ref: Option<String>,
}

const BACKUP_REF_PREFIX: &str = "refs/lge-backups/";

fn common_dir(repo: &Repository) -> PathBuf {
    let git_dir = repo.path().to_path_buf();
    match fs::read_to_string(git_dir.join("commondir")) {
        Ok(rel) => git_dir.join(rel.trim()),
        Err(_) => git_dir,
    }
}

fn backup_dir(repo: &Repository) -> PathBuf {
    common_dir(repo).join("lge-backups")
}

fn validate_id(backup_id: &str) -> Result<(), String> {
    let valid = !backup_id.is_empty()
        && backup_id.len() <= 64
        && backup_id.bytes().all(|b| b.is_ascii_digit() || b == b'_' || b == b'-');
    if valid { Ok(()) } else { Err(format!("Invalid backup id: {}", backup_id)) }
}

fn backup_file(repo: &Repository, backup_id: &str) -> Result<PathBuf, String> {
    validate_id(backup_id)?;
    Ok(backup_dir(repo).join(format!("{}.json", backup_id)))
}

pub fn create_backup(repo_path: &str) -> Result<BackupInfo, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.to_string())?;
    create_backup_in(&repo)
}

fn create_backup_in(repo: &Repository) -> Result<BackupInfo, String> {
    let head = repo.head().map_err(|e| e.to_string())?;
    let branch = head.shorthand().unwrap_or("HEAD").to_string();
    let head_ref = head.name().unwrap_or("HEAD").to_string();
    let head_oid = head.peel_to_commit().map_err(|e| e.to_string())?.id();
    let head_sha = head_oid.to_string();

    let dir = backup_dir(repo);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let now = Utc::now();
    let base_id = now.format("%Y%m%d_%H%M%S_%3f").to_string();
    let mut id = base_id.clone();
    let mut n = 1;
    while dir.join(format!("{}.json", id)).exists()
        || repo.find_reference(&format!("{}{}", BACKUP_REF_PREFIX, id)).is_ok()
    {
        id = format!("{}-{}", base_id, n);
        n += 1;
    }

    let info = BackupInfo {
        id: id.clone(),
        created_at: now.timestamp(),
        branch: branch.clone(),
        head_sha: head_sha.clone(),
        description: format!("{} @ {}", branch, &head_sha[..7]),
        head_ref: Some(head_ref),
    };

    repo.reference(&format!("{}{}", BACKUP_REF_PREFIX, id), head_oid, false, "lge: backup")
        .map_err(|e| e.to_string())?;

    let path = dir.join(format!("{}.json", id));
    let json = serde_json::to_string_pretty(&info).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;

    Ok(info)
}

pub fn list_backups(repo_path: &str) -> Result<Vec<BackupInfo>, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.to_string())?;
    let dir = backup_dir(&repo);
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

    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at).then_with(|| b.id.cmp(&a.id)));
    Ok(backups)
}

fn has_staged_changes(repo: &Repository) -> Result<bool, String> {
    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(false).include_ignored(false);
    let statuses = repo.statuses(Some(&mut opts)).map_err(|e| e.to_string())?;
    let staged = git2::Status::INDEX_NEW
        | git2::Status::INDEX_MODIFIED
        | git2::Status::INDEX_DELETED
        | git2::Status::INDEX_RENAMED
        | git2::Status::INDEX_TYPECHANGE;
    Ok(statuses.iter().any(|s| s.status().intersects(staged)))
}

pub fn restore_backup(repo_path: &str, backup_id: &str) -> Result<BackupInfo, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.to_string())?;
    let path = backup_file(&repo, backup_id)?;

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Backup not found: {}", e))?;
    let info: BackupInfo = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    let target_oid = Oid::from_str(&info.head_sha).map_err(|e| e.to_string())?;
    let target = repo.find_commit(target_oid)
        .map_err(|e| format!("Backup commit {} no longer exists: {}", &info.head_sha[..7], e))?;

    let target_ref = match info.head_ref.as_deref() {
        Some(r) => r.to_string(),
        None if info.branch == "HEAD" => "HEAD".to_string(),
        None => format!("refs/heads/{}", info.branch),
    };
    let detached = target_ref == "HEAD";

    let head = repo.head().map_err(|e| e.to_string())?;
    let affects_checkout = detached || head.name() == Some(target_ref.as_str());
    let current_tree = head.peel_to_tree().map_err(|e| e.to_string())?.id();
    let tree_changes = affects_checkout && current_tree != target.tree_id();

    if tree_changes && has_staged_changes(&repo)? {
        return Err("Unstage or commit your staged changes before restoring this backup".to_string());
    }

    let safety = create_backup_in(&repo)?;

    if detached {
        repo.set_head_detached(target_oid).map_err(|e| e.to_string())?;
    } else {
        repo.reference(&target_ref, target_oid, true, "lge: restore backup")
            .map_err(|e| e.to_string())?;
    }

    if tree_changes {
        let tree = target.tree().map_err(|e| e.to_string())?;
        let mut index = repo.index().map_err(|e| e.to_string())?;
        index.read_tree(&tree).map_err(|e| e.to_string())?;
        index.write().map_err(|e| e.to_string())?;
    }

    Ok(safety)
}

pub fn delete_backup(repo_path: &str, backup_id: &str) -> Result<(), String> {
    let repo = Repository::open(repo_path).map_err(|e| e.to_string())?;
    let path = backup_file(&repo, backup_id)?;
    fs::remove_file(&path).map_err(|e| e.to_string())?;
    if let Ok(mut r) = repo.find_reference(&format!("{}{}", BACKUP_REF_PREFIX, backup_id)) {
        r.delete().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TestRepo;

    #[test]
    fn backup_works_in_linked_worktree() {
        let t = TestRepo::new();
        let a = t.commit("a");
        t.set_ref("refs/heads/wtb", a);
        let wt_parent = tempfile::tempdir().unwrap();
        let wt_path = wt_parent.path().join("wt");
        let branch = t.repo.find_reference("refs/heads/wtb").unwrap();
        let mut opts = git2::WorktreeAddOptions::new();
        opts.reference(Some(&branch));
        t.repo.worktree("wt", &wt_path, Some(&opts)).unwrap();

        let info = create_backup(&wt_path.to_string_lossy()).unwrap();
        let list = list_backups(&wt_path.to_string_lossy()).unwrap();
        assert!(list.iter().any(|b| b.id == info.id));
    }

    #[test]
    fn backup_keeps_commit_reachable_by_ref() {
        let t = TestRepo::new();
        t.commit("a");
        let info = create_backup(&t.path()).unwrap();
        let r = t.repo.find_reference(&format!("refs/lge-backups/{}", info.id)).unwrap();
        assert_eq!(r.target().unwrap().to_string(), info.head_sha);

        delete_backup(&t.path(), &info.id).unwrap();
        assert!(t.repo.find_reference(&format!("refs/lge-backups/{}", info.id)).is_err());
    }

    #[test]
    fn restore_of_detached_backup_detaches_head() {
        let t = TestRepo::new();
        let a = t.commit("a");
        t.commit("b");
        t.repo.set_head_detached(a).unwrap();
        let info = create_backup(&t.path()).unwrap();
        t.repo.set_head("refs/heads/main").unwrap();

        restore_backup(&t.path(), &info.id).unwrap();

        assert!(t.repo.find_reference("refs/heads/HEAD").is_err());
        assert!(t.repo.head_detached().unwrap());
        assert_eq!(t.head(), a);
    }

    #[test]
    fn restore_keeps_newer_work_recoverable_and_index_consistent() {
        let t = TestRepo::new();
        t.commit("a");
        let info = create_backup(&t.path()).unwrap();
        let newer = t.commit("newer work");

        restore_backup(&t.path(), &info.id).unwrap();

        let all = list_backups(&t.path()).unwrap();
        assert!(all.iter().any(|b| b.head_sha == newer.to_string()), "pre-restore backup missing");

        let mut so = git2::StatusOptions::new();
        so.include_untracked(false);
        let staged = t.repo.statuses(Some(&mut so)).unwrap().iter()
            .filter(|s| s.status().intersects(
                git2::Status::INDEX_NEW | git2::Status::INDEX_MODIFIED | git2::Status::INDEX_DELETED))
            .count();
        assert_eq!(staged, 0);
    }

    #[test]
    fn backups_in_same_second_get_distinct_ids() {
        let t = TestRepo::new();
        t.commit("a");
        let b1 = create_backup(&t.path()).unwrap();
        let b2 = create_backup(&t.path()).unwrap();
        assert_ne!(b1.id, b2.id);
        assert_eq!(list_backups(&t.path()).unwrap().len(), 2);
    }

    #[test]
    fn rejects_backup_id_with_path_components() {
        let t = TestRepo::new();
        t.commit("a");
        let victim = t.workdir().join("victim.json");
        std::fs::write(&victim, "{}").unwrap();

        assert!(delete_backup(&t.path(), "../../victim").is_err());
        assert!(delete_backup(&t.path(), &victim.to_string_lossy().replace(".json", "")).is_err());
        assert!(victim.exists());
    }

    #[test]
    fn restore_refuses_when_staged_changes_would_be_lost() {
        let t = TestRepo::new();
        t.commit("a");
        let info = create_backup(&t.path()).unwrap();
        let newer = t.commit("b");
        std::fs::write(t.workdir().join("staged.txt"), "x").unwrap();
        let mut index = t.repo.index().unwrap();
        index.add_path(std::path::Path::new("staged.txt")).unwrap();
        index.write().unwrap();

        assert!(restore_backup(&t.path(), &info.id).is_err());
        assert_eq!(t.head(), newer);
    }

    #[test]
    fn restore_accepts_legacy_backup_without_ref() {
        let t = TestRepo::new();
        let a = t.commit("a");
        t.commit("b");
        let dir = t.repo.path().join("lge-backups");
        std::fs::create_dir_all(&dir).unwrap();
        let legacy = format!(
            "{{\"id\":\"20240101_000000\",\"created_at\":1,\"branch\":\"main\",\"head_sha\":\"{}\",\"description\":\"x\"}}",
            a
        );
        std::fs::write(dir.join("20240101_000000.json"), legacy).unwrap();

        restore_backup(&t.path(), "20240101_000000").unwrap();

        assert_eq!(t.repo.find_reference("refs/heads/main").unwrap().target(), Some(a));
        assert!(!t.repo.head_detached().unwrap());
    }
}
