use git2::{Oid, Repository, Signature, Sort, Time};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

// ─── Data types ──────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CommitInfo {
    pub sha: String,
    pub short_sha: String,
    pub message: String,
    pub title: String,
    pub body: Option<String>,
    pub author_name: String,
    pub author_email: String,
    pub author_time: i64,
    pub author_offset: i32,
    pub committer_name: String,
    pub committer_email: String,
    pub committer_time: i64,
    pub committer_offset: i32,
    pub is_pushed: bool,
    pub parent_shas: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RepositoryInfo {
    pub path: String,
    pub name: String,
    pub current_branch: String,
    pub head_sha: Option<String>,
    pub has_remote: bool,
    pub remote_name: Option<String>,
    pub unpushed_count: usize,
}

#[derive(Deserialize, Clone, Debug)]
pub struct DateEditOperation {
    pub sha: String,
    pub author_time: Option<i64>,
    pub author_offset: Option<i32>,
    pub committer_time: Option<i64>,
    pub committer_offset: Option<i32>,
}

// ─── Repository info ──────────────────────────────────────────────────────────

pub fn open_repository(path: &str) -> Result<RepositoryInfo, String> {
    let repo = Repository::discover(path)
        .map_err(|e| format!("Not a git repository: {}", e))?;

    let workdir = repo
        .workdir()
        .map(|p| p.to_string_lossy().into_owned())
        .or_else(|| repo.path().parent().map(|p| p.to_string_lossy().into_owned()))
        .unwrap_or_else(|| path.to_string());

    let name = std::path::Path::new(&workdir)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "repo".to_string());

    let head = repo.head().map_err(|e| format!("No HEAD: {}", e))?;
    let current_branch = head.shorthand().unwrap_or("HEAD").to_string();
    let head_sha = head.peel_to_commit().ok().map(|c| c.id().to_string());

    let (has_remote, remote_name, unpushed_count) =
        count_unpushed(&repo, &current_branch);

    Ok(RepositoryInfo {
        path: workdir,
        name,
        current_branch,
        head_sha,
        has_remote,
        remote_name,
        unpushed_count,
    })
}

fn count_unpushed(repo: &Repository, branch: &str) -> (bool, Option<String>, usize) {
    let candidates = ["origin", "upstream"];
    for remote in candidates {
        let ref_name = format!("refs/remotes/{}/{}", remote, branch);
        if let Ok(r) = repo.find_reference(&ref_name) {
            if let Ok(remote_commit) = r.peel_to_commit() {
                let count = repo
                    .revwalk()
                    .and_then(|mut w| {
                        w.push_head()?;
                        w.hide(remote_commit.id())?;
                        w.set_sorting(Sort::TOPOLOGICAL)?;
                        Ok(w.count())
                    })
                    .unwrap_or(0);
                return (true, Some(remote.to_string()), count);
            }
        }
    }
    (false, None, 0)
}

// ─── Get commits ─────────────────────────────────────────────────────────────

pub fn get_commits(
    repo_path: &str,
    limit: usize,
    offset: usize,
) -> Result<Vec<CommitInfo>, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.to_string())?;

    let head = repo.head().map_err(|e| e.to_string())?;
    let branch = head.shorthand().unwrap_or("HEAD").to_string();
    let pushed_boundary = pushed_boundary_oid(&repo, &branch);

    let mut walk = repo.revwalk().map_err(|e| e.to_string())?;
    walk.push_head().map_err(|e| e.to_string())?;
    walk.set_sorting(Sort::TIME).map_err(|e| e.to_string())?;

    let commits: Vec<CommitInfo> = walk
        .skip(offset)
        .take(limit)
        .filter_map(|r| {
            let oid = r.ok()?;
            let c = repo.find_commit(oid).ok()?;
            Some(commit_to_info(&c, &repo, &pushed_boundary))
        })
        .collect();

    Ok(commits)
}

pub fn get_unpushed_commits(repo_path: &str) -> Result<Vec<CommitInfo>, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.to_string())?;

    let head = repo.head().map_err(|e| e.to_string())?;
    let branch = head.shorthand().unwrap_or("HEAD").to_string();
    let boundary = pushed_boundary_oid(&repo, &branch);

    let mut walk = repo.revwalk().map_err(|e| e.to_string())?;
    walk.push_head().map_err(|e| e.to_string())?;
    if let Some(b) = boundary {
        walk.hide(b).ok();
    }
    walk.set_sorting(Sort::TIME).map_err(|e| e.to_string())?;

    let commits: Vec<CommitInfo> = walk
        .filter_map(|r| {
            let oid = r.ok()?;
            let c = repo.find_commit(oid).ok()?;
            Some(commit_to_info(&c, &repo, &None))
        })
        .collect();

    Ok(commits)
}

fn pushed_boundary_oid(repo: &Repository, branch: &str) -> Option<Oid> {
    for remote in ["origin", "upstream"] {
        let ref_name = format!("refs/remotes/{}/{}", remote, branch);
        if let Ok(r) = repo.find_reference(&ref_name) {
            if let Ok(c) = r.peel_to_commit() {
                return Some(c.id());
            }
        }
    }
    None
}

fn is_pushed(repo: &Repository, oid: Oid, boundary: &Option<Oid>) -> bool {
    match boundary {
        None => false,
        Some(b) => {
            *b == oid || repo.graph_descendant_of(*b, oid).unwrap_or(false)
        }
    }
}

fn commit_to_info(
    commit: &git2::Commit,
    repo: &Repository,
    boundary: &Option<Oid>,
) -> CommitInfo {
    let sha = commit.id().to_string();
    let short_sha = sha[..7.min(sha.len())].to_string();
    let raw_message = commit.message().unwrap_or("").to_string();
    let title = raw_message.lines().next().unwrap_or("").to_string();
    let body = {
        let rest = raw_message
            .lines()
            .skip(1)
            .skip_while(|l| l.trim().is_empty())
            .collect::<Vec<_>>()
            .join("\n");
        if rest.is_empty() { None } else { Some(rest) }
    };

    CommitInfo {
        is_pushed: is_pushed(repo, commit.id(), boundary),
        sha,
        short_sha,
        message: raw_message,
        title,
        body,
        author_name: commit.author().name().unwrap_or("").to_string(),
        author_email: commit.author().email().unwrap_or("").to_string(),
        author_time: commit.author().when().seconds(),
        author_offset: commit.author().when().offset_minutes(),
        committer_name: commit.committer().name().unwrap_or("").to_string(),
        committer_email: commit.committer().email().unwrap_or("").to_string(),
        committer_time: commit.committer().when().seconds(),
        committer_offset: commit.committer().when().offset_minutes(),
        parent_shas: commit.parent_ids().map(|id| id.to_string()).collect(),
    }
}

// ─── History rewriting ────────────────────────────────────────────────────────

pub fn apply_message_edit(
    repo_path: &str,
    sha: &str,
    new_message: &str,
) -> Result<(), String> {
    let repo = Repository::open(repo_path).map_err(|e| e.to_string())?;
    let target_oid = Oid::from_str(sha).map_err(|e| e.to_string())?;

    let commits = collect_range(&repo, target_oid)?;
    rewrite_commits(&repo, &commits, |oid, _author, _committer, msg, _tree| {
        if oid == target_oid {
            Some(new_message.to_string())
        } else {
            Some(msg.to_string())
        }
    }, |_oid, is_target, orig_author, orig_committer| {
        let _ = is_target;
        (orig_author, orig_committer)
    })
}

pub fn apply_batch_date_shift(
    repo_path: &str,
    sha_list: &[String],
    delta_seconds: i64,
) -> Result<(), String> {
    if sha_list.is_empty() {
        return Ok(());
    }
    let repo = Repository::open(repo_path).map_err(|e| e.to_string())?;
    let target_set: HashSet<&str> = sha_list.iter().map(String::as_str).collect();

    let earliest = find_earliest_in_history(&repo, &target_set)?;
    let commits = collect_range(&repo, earliest)?;

    rewrite_commits(&repo, &commits,
        |_oid, _a, _c, msg, _t| Some(msg.to_string()),
        |oid, _is_target, author, committer| {
            let sha = oid.to_string();
            let is_t = target_set.contains(sha.as_str())
                    || target_set.contains(&sha[..7.min(sha.len())]);
            if is_t {
                let new_a_time = Time::new(author.1 + delta_seconds, author.2);
                let new_c_time = Time::new(committer.1 + delta_seconds, committer.2);
                ((author.0.clone(), author.1 + delta_seconds, new_a_time.offset_minutes()),
                 (committer.0.clone(), committer.1 + delta_seconds, new_c_time.offset_minutes()))
            } else {
                (author, committer)
            }
        }
    )
}

pub fn apply_absolute_date_edits(
    repo_path: &str,
    operations: &[DateEditOperation],
) -> Result<(), String> {
    if operations.is_empty() {
        return Ok(());
    }
    let repo = Repository::open(repo_path).map_err(|e| e.to_string())?;

    let sha_map: std::collections::HashMap<String, &DateEditOperation> = operations
        .iter()
        .map(|op| (op.sha.clone(), op))
        .collect();

    let target_set: HashSet<&str> = sha_map.keys().map(String::as_str).collect();
    let earliest = find_earliest_in_history(&repo, &target_set)?;
    let commits = collect_range(&repo, earliest)?;

    rewrite_commits(&repo, &commits,
        |_oid, _a, _c, msg, _t| Some(msg.to_string()),
        |oid, _is_target, author, committer| {
            let sha = oid.to_string();
            if let Some(op) = sha_map.get(&sha) {
                let new_a_secs   = op.author_time.unwrap_or(author.1);
                let new_a_offset = op.author_offset.unwrap_or(author.2);
                let new_c_secs   = op.committer_time.unwrap_or(committer.1);
                let new_c_offset = op.committer_offset.unwrap_or(committer.2);
                ((author.0, new_a_secs, new_a_offset), (committer.0, new_c_secs, new_c_offset))
            } else {
                (author, committer)
            }
        }
    )
}

// ─── Rewriting internals ─────────────────────────────────────────────────────

// Collect the linear ancestry from `target` up to (and including) HEAD, in
// order [target, ..., HEAD]. Returns error if target is not in current branch.
fn collect_range(repo: &Repository, target: Oid) -> Result<Vec<Oid>, String> {
    let head = repo.head().map_err(|e| e.to_string())?;
    let head_oid = head.peel_to_commit().map_err(|e| e.to_string())?.id();

    let mut chain: Vec<Oid> = Vec::new();
    let mut cur = head_oid;

    loop {
        chain.push(cur);
        if cur == target {
            break;
        }
        let c = repo.find_commit(cur).map_err(|e| e.to_string())?;
        if c.parent_count() == 0 {
            return Err(format!("Commit {} not found in current branch ancestry", target));
        }
        cur = c.parent_id(0).map_err(|e| e.to_string())?;
    }

    chain.reverse(); // [target, …, HEAD]
    Ok(chain)
}

// Walk from HEAD backwards, return the OID of the earliest commit in `targets`
// (i.e., the one furthest from HEAD in the linear ancestry).
fn find_earliest_in_history(
    repo: &Repository,
    targets: &HashSet<&str>,
) -> Result<Oid, String> {
    let head = repo.head().map_err(|e| e.to_string())?;
    let head_oid = head.peel_to_commit().map_err(|e| e.to_string())?.id();

    let mut last_found: Option<Oid> = None;
    let mut found_count = 0usize;
    let mut cur = head_oid;

    loop {
        let sha = cur.to_string();
        let matches = targets.contains(sha.as_str())
                   || targets.contains(&sha[..7.min(sha.len())]);
        if matches {
            last_found = Some(cur);
            found_count += 1;
            if found_count >= targets.len() {
                break;
            }
        }

        let c = repo.find_commit(cur).map_err(|e| e.to_string())?;
        if c.parent_count() == 0 {
            break;
        }
        cur = c.parent_id(0).map_err(|e| e.to_string())?;
    }

    last_found.ok_or_else(|| "No target commits found in branch history".to_string())
}

type SigTuple = (String, i64, i32); // (email, seconds, offset_minutes)

// Generic commit rewriter.
// `msg_fn`  — returns Some(new_message) for each commit OID
// `time_fn` — returns (new_author_sig, new_committer_sig) as tuples
fn rewrite_commits<MsgFn, TimeFn>(
    repo: &Repository,
    commits: &[Oid],
    msg_fn: MsgFn,
    time_fn: TimeFn,
) -> Result<(), String>
where
    MsgFn: Fn(Oid, SigTuple, SigTuple, &str, &git2::Tree) -> Option<String>,
    TimeFn: Fn(Oid, bool, SigTuple, SigTuple) -> (SigTuple, SigTuple),
{
    let target_oid = *commits.first().ok_or("Empty commit range")?;

    let first_commit = repo.find_commit(target_oid).map_err(|e| e.to_string())?;
    let base_parent: Option<Oid> = if first_commit.parent_count() > 0 {
        Some(first_commit.parent_id(0).map_err(|e| e.to_string())?)
    } else {
        None
    };

    let head = repo.head().map_err(|e| e.to_string())?;
    let head_ref = head.name().unwrap_or("HEAD").to_string();

    let mut prev: Option<Oid> = base_parent;

    for (i, &oid) in commits.iter().enumerate() {
        let c = repo.find_commit(oid).map_err(|e| e.to_string())?;
        let is_target = i == 0;

        let a_name  = c.author().name().unwrap_or("").to_string();
        let a_email = c.author().email().unwrap_or("").to_string();
        let a_secs  = c.author().when().seconds();
        let a_off   = c.author().when().offset_minutes();
        let cm_name  = c.committer().name().unwrap_or("").to_string();
        let cm_email = c.committer().email().unwrap_or("").to_string();
        let cm_secs  = c.committer().when().seconds();
        let cm_off   = c.committer().when().offset_minutes();
        let raw_msg  = c.message().unwrap_or("").to_string();
        let tree     = c.tree().map_err(|e| e.to_string())?;

        let author_tuple    = (a_email.clone(),  a_secs,  a_off);
        let committer_tuple = (cm_email.clone(), cm_secs, cm_off);

        let msg = msg_fn(oid, author_tuple.clone(), committer_tuple.clone(), &raw_msg, &tree)
            .ok_or("msg_fn returned None")?;

        let (new_a, new_c) = time_fn(oid, is_target, author_tuple, committer_tuple);

        let new_author = Signature::new(
            &a_name, &new_a.0,
            &Time::new(new_a.1, new_a.2),
        ).map_err(|e| e.to_string())?;
        let new_committer = Signature::new(
            &cm_name, &new_c.0,
            &Time::new(new_c.1, new_c.2),
        ).map_err(|e| e.to_string())?;

        let mut parents = Vec::new();
        if let Some(p) = prev {
            parents.push(repo.find_commit(p).map_err(|e| e.to_string())?);
        }
        for j in 1..c.parent_count() {
            parents.push(c.parent(j).map_err(|e| e.to_string())?);
        }
        let parent_refs: Vec<&git2::Commit> = parents.iter().collect();

        let new_oid = repo
            .commit(None, &new_author, &new_committer, &msg, &tree, &parent_refs)
            .map_err(|e| e.to_string())?;

        prev = Some(new_oid);
    }

    if let Some(new_head) = prev {
        repo.reference(&head_ref, new_head, true, "lge: rewrite history")
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}
