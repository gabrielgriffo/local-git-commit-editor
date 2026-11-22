use git2::{ObjectType, Oid, Repository, Sort};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

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

pub type RewriteMap = HashMap<String, String>;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct RewriteImpact {
    pub commit_count: usize,
    pub signed_count: usize,
    pub affected_refs: Vec<String>,
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

    let has_remote = has_remote_refs(&repo);
    let remote_name = if has_remote { remote_name_for(&repo, head.name()) } else { None };
    let unpushed_count = if has_remote {
        unpushed_set(&repo).map(|s| s.len()).unwrap_or(0)
    } else {
        0
    };

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

fn has_remote_refs(repo: &Repository) -> bool {
    repo.references_glob("refs/remotes/*")
        .map(|mut it| it.next().is_some())
        .unwrap_or(false)
}

fn remote_name_for(repo: &Repository, head_ref: Option<&str>) -> Option<String> {
    if let Some(name) = head_ref.filter(|n| n.starts_with("refs/heads/")) {
        if let Ok(buf) = repo.branch_upstream_remote(name) {
            if let Some(s) = buf.as_str() {
                return Some(s.to_string());
            }
        }
    }
    let remotes = repo.remotes().ok()?;
    let first = remotes.iter().flatten().next().map(str::to_string);
    first
}

fn unpushed_set(repo: &Repository) -> Result<HashSet<Oid>, String> {
    let mut walk = repo.revwalk().map_err(|e| e.to_string())?;
    walk.push_head().map_err(|e| e.to_string())?;
    walk.hide_glob("refs/remotes/*").map_err(|e| e.to_string())?;
    let mut set = HashSet::new();
    for oid in walk {
        set.insert(oid.map_err(|e| e.to_string())?);
    }
    Ok(set)
}

// ─── Get commits ─────────────────────────────────────────────────────────────

pub fn get_commits(
    repo_path: &str,
    limit: usize,
    offset: usize,
) -> Result<Vec<CommitInfo>, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.to_string())?;
    let unpushed = unpushed_set(&repo)?;

    let mut walk = repo.revwalk().map_err(|e| e.to_string())?;
    walk.push_head().map_err(|e| e.to_string())?;
    walk.set_sorting(Sort::TIME).map_err(|e| e.to_string())?;

    let commits: Vec<CommitInfo> = walk
        .skip(offset)
        .take(limit)
        .filter_map(|r| {
            let oid = r.ok()?;
            let c = repo.find_commit(oid).ok()?;
            Some(commit_to_info(&c, !unpushed.contains(&oid)))
        })
        .collect();

    Ok(commits)
}

pub fn get_unpushed_commits(repo_path: &str) -> Result<Vec<CommitInfo>, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.to_string())?;

    let mut walk = repo.revwalk().map_err(|e| e.to_string())?;
    walk.push_head().map_err(|e| e.to_string())?;
    walk.hide_glob("refs/remotes/*").map_err(|e| e.to_string())?;
    walk.set_sorting(Sort::TIME).map_err(|e| e.to_string())?;

    let commits: Vec<CommitInfo> = walk
        .filter_map(|r| {
            let oid = r.ok()?;
            let c = repo.find_commit(oid).ok()?;
            Some(commit_to_info(&c, false))
        })
        .collect();

    Ok(commits)
}

fn commit_to_info(commit: &git2::Commit, is_pushed: bool) -> CommitInfo {
    let sha = commit.id().to_string();
    let short_sha = sha[..7.min(sha.len())].to_string();
    let raw_message = String::from_utf8_lossy(commit.message_bytes()).into_owned();
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
    let author = commit.author();
    let committer = commit.committer();

    CommitInfo {
        is_pushed,
        sha,
        short_sha,
        message: raw_message,
        title,
        body,
        author_name: String::from_utf8_lossy(author.name_bytes()).into_owned(),
        author_email: String::from_utf8_lossy(author.email_bytes()).into_owned(),
        author_time: author.when().seconds(),
        author_offset: author.when().offset_minutes(),
        committer_name: String::from_utf8_lossy(committer.name_bytes()).into_owned(),
        committer_email: String::from_utf8_lossy(committer.email_bytes()).into_owned(),
        committer_time: committer.when().seconds(),
        committer_offset: committer.when().offset_minutes(),
        parent_shas: commit.parent_ids().map(|id| id.to_string()).collect(),
    }
}

// ─── History rewriting ────────────────────────────────────────────────────────

#[derive(Default)]
struct CommitEdit {
    message: Option<String>,
    author: Option<(i64, i32)>,
    committer: Option<(i64, i32)>,
}

impl CommitEdit {
    fn is_noop(&self) -> bool {
        self.message.is_none() && self.author.is_none() && self.committer.is_none()
    }
}

pub fn apply_message_edit(
    repo_path: &str,
    sha: &str,
    new_message: &str,
) -> Result<RewriteMap, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.to_string())?;
    let target_oid = Oid::from_str(sha).map_err(|e| e.to_string())?;

    let commits = collect_range(&repo, target_oid)?;
    ensure_unpushed(&repo, &commits)?;
    rewrite_commits(&repo, &commits, |c| CommitEdit {
        message: (c.id() == target_oid).then(|| new_message.to_string()),
        ..Default::default()
    })
}

pub fn apply_batch_date_shift(
    repo_path: &str,
    sha_list: &[String],
    delta_seconds: i64,
) -> Result<RewriteMap, String> {
    if sha_list.is_empty() {
        return Ok(RewriteMap::new());
    }
    let repo = Repository::open(repo_path).map_err(|e| e.to_string())?;
    let target_set: HashSet<&str> = sha_list.iter().map(String::as_str).collect();

    let earliest = find_earliest_target(&repo, &target_set)?;
    let commits = collect_range(&repo, earliest)?;
    ensure_unpushed(&repo, &commits)?;

    rewrite_commits(&repo, &commits, |c| {
        if !matches_target(&target_set, c.id()) {
            return CommitEdit::default();
        }
        let (a, cm) = (c.author().when(), c.committer().when());
        CommitEdit {
            message: None,
            author: Some((a.seconds() + delta_seconds, a.offset_minutes())),
            committer: Some((cm.seconds() + delta_seconds, cm.offset_minutes())),
        }
    })
}

pub fn apply_absolute_date_edits(
    repo_path: &str,
    operations: &[DateEditOperation],
) -> Result<RewriteMap, String> {
    if operations.is_empty() {
        return Ok(RewriteMap::new());
    }
    let repo = Repository::open(repo_path).map_err(|e| e.to_string())?;

    let sha_map: HashMap<String, &DateEditOperation> = operations
        .iter()
        .map(|op| (op.sha.clone(), op))
        .collect();

    let target_set: HashSet<&str> = sha_map.keys().map(String::as_str).collect();
    let earliest = find_earliest_target(&repo, &target_set)?;
    let commits = collect_range(&repo, earliest)?;
    ensure_unpushed(&repo, &commits)?;

    rewrite_commits(&repo, &commits, |c| {
        let Some(op) = sha_map.get(&c.id().to_string()) else {
            return CommitEdit::default();
        };
        let (a, cm) = (c.author().when(), c.committer().when());
        CommitEdit {
            message: None,
            author: Some((
                op.author_time.unwrap_or(a.seconds()),
                op.author_offset.unwrap_or(a.offset_minutes()),
            )),
            committer: Some((
                op.committer_time.unwrap_or(cm.seconds()),
                op.committer_offset.unwrap_or(cm.offset_minutes()),
            )),
        }
    })
}

pub fn rewrite_impact(repo_path: &str, sha_list: &[String]) -> Result<RewriteImpact, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.to_string())?;
    if sha_list.is_empty() {
        return Ok(RewriteImpact { commit_count: 0, signed_count: 0, affected_refs: Vec::new() });
    }
    let target_set: HashSet<&str> = sha_list.iter().map(String::as_str).collect();
    let earliest = find_earliest_target(&repo, &target_set)?;
    let commits = collect_range(&repo, earliest)?;
    let in_range: HashSet<Oid> = commits.iter().copied().collect();

    let signed_count = commits
        .iter()
        .filter_map(|oid| repo.find_commit(*oid).ok())
        .filter(|c| {
            c.header_field_bytes("gpgsig").is_ok() || c.header_field_bytes("gpgsig-sha256").is_ok()
        })
        .count();

    let head_ref = repo.head().ok().and_then(|h| h.name().map(str::to_string));
    let mut affected_refs: Vec<String> = repo
        .references()
        .map_err(|e| e.to_string())?
        .flatten()
        .filter(|r| {
            let name = r.name().unwrap_or("");
            Some(name) != head_ref.as_deref()
                && !name.starts_with("refs/remotes/")
                && !name.starts_with("refs/lge-backups/")
        })
        .filter(|r| r.peel_to_commit().map(|c| in_range.contains(&c.id())).unwrap_or(false))
        .map(|r| r.shorthand().unwrap_or("").to_string())
        .collect();
    affected_refs.sort();

    Ok(RewriteImpact { commit_count: commits.len(), signed_count, affected_refs })
}

// ─── Rewriting internals ─────────────────────────────────────────────────────

fn matches_target(targets: &HashSet<&str>, oid: Oid) -> bool {
    let sha = oid.to_string();
    targets.contains(sha.as_str()) || targets.contains(&sha[..7.min(sha.len())])
}

fn ensure_unpushed(repo: &Repository, commits: &[Oid]) -> Result<(), String> {
    let unpushed = unpushed_set(repo)?;
    match commits.iter().find(|oid| !unpushed.contains(oid)) {
        Some(oid) => Err(format!(
            "Commit {} is already on a remote branch and cannot be rewritten",
            &oid.to_string()[..7]
        )),
        None => Ok(()),
    }
}

// Collect the first-parent ancestry from `target` up to (and including) HEAD, in
// order [target, ..., HEAD]. Returns error if target is not in that line.
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

    chain.reverse();
    Ok(chain)
}

fn find_earliest_target(
    repo: &Repository,
    targets: &HashSet<&str>,
) -> Result<Oid, String> {
    let head = repo.head().map_err(|e| e.to_string())?;
    let mut cur = head.peel_to_commit().map_err(|e| e.to_string())?.id();

    let mut last_found: Option<Oid> = None;
    let mut found: HashSet<String> = HashSet::new();

    loop {
        let sha = cur.to_string();
        let short = &sha[..7.min(sha.len())];
        let key = if targets.contains(sha.as_str()) {
            Some(sha.clone())
        } else if targets.contains(short) {
            Some(short.to_string())
        } else {
            None
        };
        if let Some(k) = key {
            last_found = Some(cur);
            found.insert(k);
            if found.len() >= targets.len() {
                break;
            }
        }

        let c = repo.find_commit(cur).map_err(|e| e.to_string())?;
        if c.parent_count() == 0 {
            break;
        }
        cur = c.parent_id(0).map_err(|e| e.to_string())?;
    }

    if found.len() < targets.len() {
        let mut missing: Vec<String> = targets
            .iter()
            .filter(|t| !found.contains(**t))
            .map(|t| t[..7.min(t.len())].to_string())
            .collect();
        missing.sort();
        return Err(format!(
            "Commit(s) {} are not on the current branch's main line (e.g. they come from a merged branch) and cannot be rewritten",
            missing.join(", ")
        ));
    }

    last_found.ok_or_else(|| "No target commits found in branch history".to_string())
}

fn format_offset(minutes: i32) -> String {
    let sign = if minutes < 0 { '-' } else { '+' };
    let abs = minutes.unsigned_abs();
    format!("{}{:02}{:02}", sign, abs / 60, abs % 60)
}

fn signature_line(key: &[u8], sig: &git2::Signature, time: (i64, i32)) -> Vec<u8> {
    let mut line = Vec::new();
    line.extend_from_slice(key);
    line.push(b' ');
    line.extend_from_slice(sig.name_bytes());
    line.extend_from_slice(b" <");
    line.extend_from_slice(sig.email_bytes());
    line.extend_from_slice(format!("> {} {}", time.0, format_offset(time.1)).as_bytes());
    line
}

fn build_commit_buffer(c: &git2::Commit, new_parent: Option<Oid>, edit: &CommitEdit) -> Vec<u8> {
    let mut out = Vec::new();
    let mut skipping_continuation = false;
    let mut parent_index = 0usize;

    for line in c.raw_header_bytes().split(|b| *b == b'\n') {
        if line.is_empty() {
            continue;
        }
        if line[0] == b' ' {
            if !skipping_continuation {
                out.extend_from_slice(line);
                out.push(b'\n');
            }
            continue;
        }
        skipping_continuation = false;
        let key = line.split(|b| *b == b' ').next().unwrap_or(b"");
        let replaced: Option<Vec<u8>> = match key {
            b"parent" => {
                parent_index += 1;
                if parent_index == 1 {
                    new_parent.map(|p| format!("parent {}", p).into_bytes())
                } else {
                    None
                }
            }
            b"author" => edit.author.map(|t| signature_line(b"author", &c.author(), t)),
            b"committer" => edit.committer.map(|t| signature_line(b"committer", &c.committer(), t)),
            b"gpgsig" | b"gpgsig-sha256" => {
                skipping_continuation = true;
                continue;
            }
            b"encoding" if edit.message.is_some() => continue,
            _ => None,
        };
        out.extend_from_slice(replaced.as_deref().unwrap_or(line));
        out.push(b'\n');
    }

    out.push(b'\n');
    match &edit.message {
        Some(m) => out.extend_from_slice(m.as_bytes()),
        None => out.extend_from_slice(c.message_raw_bytes()),
    }
    out
}

fn rewrite_commits<EditFn>(repo: &Repository, commits: &[Oid], edit_fn: EditFn) -> Result<RewriteMap, String>
where
    EditFn: Fn(&git2::Commit) -> CommitEdit,
{
    let target_oid = *commits.first().ok_or("Empty commit range")?;
    let first_commit = repo.find_commit(target_oid).map_err(|e| e.to_string())?;
    let mut prev: Option<Oid> = first_commit.parent_id(0).ok();

    let head = repo.head().map_err(|e| e.to_string())?;
    let head_ref = head.name().unwrap_or("HEAD").to_string();
    let odb = repo.odb().map_err(|e| e.to_string())?;
    let mut mapping = RewriteMap::new();

    for &oid in commits {
        let c = repo.find_commit(oid).map_err(|e| e.to_string())?;
        let edit = edit_fn(&c);

        if edit.is_noop() && prev == c.parent_id(0).ok() {
            prev = Some(oid);
            continue;
        }

        let buf = build_commit_buffer(&c, prev, &edit);
        let new_oid = odb.write(ObjectType::Commit, &buf).map_err(|e| e.to_string())?;
        repo.find_commit(new_oid).map_err(|e| format!("Rewritten commit is invalid: {}", e))?;
        mapping.insert(oid.to_string(), new_oid.to_string());
        prev = Some(new_oid);
    }

    if let Some(new_head) = prev {
        repo.reference(&head_ref, new_head, true, "lge: rewrite history")
            .map_err(|e| e.to_string())?;
    }

    Ok(mapping)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TestRepo;

    #[test]
    fn pushed_detection_uses_any_remote_ref() {
        let t = TestRepo::new();
        let a = t.commit("a");
        let b = t.commit("b");
        t.set_ref("refs/remotes/origin/main", b);
        t.set_ref("refs/heads/nova", b);
        t.repo.set_head("refs/heads/nova").unwrap();
        let c = t.commit("c");

        let commits = get_commits(&t.path(), 100, 0).unwrap();
        let pushed = |oid: Oid| commits.iter().find(|x| x.sha == oid.to_string()).unwrap().is_pushed;
        assert!(pushed(a));
        assert!(pushed(b));
        assert!(!pushed(c));

        let info = open_repository(&t.path()).unwrap();
        assert!(info.has_remote);
        assert_eq!(info.unpushed_count, 1);
    }

    #[test]
    fn rewrite_refuses_pushed_commits() {
        let t = TestRepo::new();
        let a = t.commit("a");
        t.set_ref("refs/remotes/origin/other", a);
        t.commit("b");
        let before = t.head();

        assert!(apply_message_edit(&t.path(), &a.to_string(), "x").is_err());
        assert!(apply_batch_date_shift(&t.path(), &[a.to_string()], 60).is_err());
        assert_eq!(t.head(), before);
    }

    #[test]
    fn batch_errors_when_target_is_off_first_parent() {
        let t = TestRepo::new();
        let base = t.commit("base");
        let side = t.commit_on(None, &[base], "side");
        let main2 = t.commit("main2");
        let merge = t.commit_on(Some("HEAD"), &[main2, side], "merge");
        t.checkout_head();
        assert_eq!(t.head(), merge);

        let res = apply_batch_date_shift(&t.path(), &[side.to_string(), main2.to_string()], 3600);
        assert!(res.is_err(), "expected error, got {:?}", res);
        assert_eq!(t.head(), merge);
    }

    #[test]
    fn rewrite_preserves_non_utf8_descendant_message() {
        let t = TestRepo::new();
        let a = t.commit("a");
        let latin1: &[u8] = b"Ol\xe1 mundo\n";
        let raw = t.raw_commit(a, "encoding ISO-8859-1\n", "Tester <tester@example.com>", latin1);
        let _ = raw;

        apply_message_edit(&t.path(), &a.to_string(), "a editado\n").unwrap();

        let head = t.repo.find_commit(t.head()).unwrap();
        assert_eq!(head.message_raw_bytes(), latin1);
        assert_eq!(head.message_encoding(), Some("ISO-8859-1"));
        let first = t.repo.find_commit(head.parent_id(0).unwrap()).unwrap();
        assert_eq!(first.message(), Some("a editado\n"));
    }

    #[test]
    fn rewrite_handles_descendant_with_empty_email() {
        let t = TestRepo::new();
        let a = t.commit("a");
        t.raw_commit(a, "", "Bot <>", b"bot commit\n");

        apply_message_edit(&t.path(), &a.to_string(), "a editado\n").unwrap();

        let head = t.repo.find_commit(t.head()).unwrap();
        assert_eq!(head.author().name_bytes(), b"Bot");
        assert_eq!(head.author().email_bytes(), b"");
        assert_eq!(head.message(), Some("bot commit\n"));
    }

    #[test]
    fn batch_shift_moves_author_and_committer() {
        let t = TestRepo::new();
        let a = t.commit("a");
        t.commit("b");
        let orig = t.repo.find_commit(a).unwrap();
        let (at, ct) = (orig.author().when().seconds(), orig.committer().when().seconds());

        apply_batch_date_shift(&t.path(), &[a.to_string()], 120).unwrap();

        let chain = t.first_parent_chain();
        let new_a = t.repo.find_commit(*chain.last().unwrap()).unwrap();
        assert_eq!(new_a.author().when().seconds(), at + 120);
        assert_eq!(new_a.committer().when().seconds(), ct + 120);
        assert_eq!(new_a.author().when().offset_minutes(), -180);
        assert_eq!(chain.len(), 2);
    }

    const SIG_HEADER: &str =
        "gpgsig -----BEGIN PGP SIGNATURE-----\n abc\n -----END PGP SIGNATURE-----\n";

    #[test]
    fn rewrite_impact_reports_signed_commits_and_refs() {
        let t = TestRepo::new();
        let a = t.commit("a");
        let signed = t.raw_commit(a, SIG_HEADER, "Tester <tester@example.com>", b"signed\n");
        t.set_ref("refs/tags/v1", signed);
        t.set_ref("refs/heads/feature", a);
        t.commit("c");

        let impact = rewrite_impact(&t.path(), &[a.to_string()]).unwrap();
        assert_eq!(impact.commit_count, 3);
        assert_eq!(impact.signed_count, 1);
        assert_eq!(impact.affected_refs, vec!["feature".to_string(), "v1".to_string()]);
    }

    #[test]
    fn rewrite_drops_signature_and_keeps_other_headers() {
        let t = TestRepo::new();
        let a = t.commit("a");
        let headers = format!("{}x-custom keep me\n", SIG_HEADER);
        t.raw_commit(a, &headers, "Tester <tester@example.com>", b"signed\n");

        apply_message_edit(&t.path(), &a.to_string(), "a2\n").unwrap();

        let head = t.repo.find_commit(t.head()).unwrap();
        assert!(head.header_field_bytes("gpgsig").is_err());
        assert_eq!(head.header_field_bytes("x-custom").unwrap().as_str(), Some("keep me"));
        assert_eq!(head.message(), Some("signed\n"));
    }

    #[test]
    fn absolute_edit_sets_times_and_offsets() {
        let t = TestRepo::new();
        let a = t.commit("a");
        let b = t.commit("b");
        let op = DateEditOperation {
            sha: a.to_string(),
            author_time: Some(1_600_000_000),
            author_offset: Some(330),
            committer_time: Some(1_600_000_500),
            committer_offset: None,
        };

        apply_absolute_date_edits(&t.path(), &[op]).unwrap();

        let chain = t.first_parent_chain();
        let new_a = t.repo.find_commit(chain[1]).unwrap();
        assert_eq!(new_a.author().when().seconds(), 1_600_000_000);
        assert_eq!(new_a.author().when().offset_minutes(), 330);
        assert_eq!(new_a.committer().when().seconds(), 1_600_000_500);
        assert_eq!(new_a.committer().when().offset_minutes(), -180);
        let new_b = t.repo.find_commit(chain[0]).unwrap();
        let old_b = t.repo.find_commit(b).unwrap();
        assert_eq!(new_b.tree_id(), old_b.tree_id());
        assert_eq!(new_b.author().when().seconds(), old_b.author().when().seconds());
    }

    #[test]
    fn message_edit_on_root_commit_works() {
        let t = TestRepo::new();
        let root = t.commit("root");
        t.commit("child");

        apply_message_edit(&t.path(), &root.to_string(), "new root\n").unwrap();

        let chain = t.first_parent_chain();
        assert_eq!(chain.len(), 2);
        let new_root = t.repo.find_commit(chain[1]).unwrap();
        assert_eq!(new_root.parent_count(), 0);
        assert_eq!(new_root.message(), Some("new root\n"));
    }

    #[test]
    fn rewrite_works_with_detached_head() {
        let t = TestRepo::new();
        let a = t.commit("a");
        let b = t.commit("b");
        t.repo.set_head_detached(b).unwrap();

        apply_message_edit(&t.path(), &a.to_string(), "a2\n").unwrap();

        assert!(t.repo.head_detached().unwrap());
        assert_eq!(t.repo.find_reference("refs/heads/main").unwrap().target(), Some(b));
        let chain = t.first_parent_chain();
        assert_eq!(t.repo.find_commit(chain[1]).unwrap().message(), Some("a2\n"));
    }

    #[test]
    fn rewrite_returns_old_to_new_mapping() {
        let t = TestRepo::new();
        let a = t.commit("a");
        let b = t.commit("b");

        let map = apply_message_edit(&t.path(), &a.to_string(), "a2\n").unwrap();

        let chain = t.first_parent_chain();
        assert_eq!(map.len(), 2);
        assert_eq!(map[&a.to_string()], chain[1].to_string());
        assert_eq!(map[&b.to_string()], chain[0].to_string());
    }

    #[test]
    fn non_utf8_message_is_listed_lossily() {
        let t = TestRepo::new();
        let a = t.commit("a");
        t.raw_commit(a, "encoding ISO-8859-1\n", "Tester <tester@example.com>", b"Ol\xe1\n");
        let commits = get_commits(&t.path(), 10, 0).unwrap();
        assert!(commits[0].title.starts_with("Ol"));
    }

    #[test]
    fn rewritten_objects_pass_git_fsck() {
        let t = TestRepo::new();
        let a = t.commit("a");
        t.raw_commit(a, "encoding ISO-8859-1\n", "Tester <tester@example.com>", b"Ol\xe1\n");
        t.raw_commit(t.head(), SIG_HEADER, "Bot <bot@example.com>", b"signed\n");
        t.commit("d");

        apply_message_edit(&t.path(), &a.to_string(), "a2\n").unwrap();
        apply_batch_date_shift(&t.path(), &[t.first_parent_chain()[1].to_string()], -7200).unwrap();

        let out = std::process::Command::new("git")
            .args(["fsck", "--strict", "--no-dangling"])
            .current_dir(t.workdir())
            .output();
        let Ok(out) = out else { return };
        assert!(out.status.success(), "fsck: {}", String::from_utf8_lossy(&out.stderr));
        let log = std::process::Command::new("git")
            .args(["log", "--format=%s"])
            .current_dir(t.workdir())
            .output()
            .unwrap();
        assert_eq!(String::from_utf8_lossy(&log.stdout).lines().count(), 4);
    }
}
