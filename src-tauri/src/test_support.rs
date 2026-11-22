use git2::{ObjectType, Oid, Repository, Signature, Time};
use std::path::PathBuf;
use tempfile::TempDir;

pub struct TestRepo {
    pub dir: TempDir,
    pub repo: Repository,
    counter: std::cell::Cell<i64>,
}

impl TestRepo {
    pub fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        let mut opts = git2::RepositoryInitOptions::new();
        opts.initial_head("main");
        let repo = Repository::init_opts(dir.path(), &opts).unwrap();
        TestRepo { dir, repo, counter: std::cell::Cell::new(0) }
    }

    pub fn path(&self) -> String {
        self.dir.path().to_string_lossy().into_owned()
    }

    pub fn workdir(&self) -> PathBuf {
        self.dir.path().to_path_buf()
    }

    fn next_time(&self) -> i64 {
        let n = self.counter.get() + 1;
        self.counter.set(n);
        1_700_000_000 + n * 3600
    }

    fn tree_with(&self, file: &str, content: &str, parent: Option<Oid>) -> Oid {
        let mut builder = match parent {
            Some(p) => {
                let tree = self.repo.find_commit(p).unwrap().tree().unwrap();
                self.repo.treebuilder(Some(&tree)).unwrap()
            }
            None => self.repo.treebuilder(None).unwrap(),
        };
        let blob = self.repo.blob(content.as_bytes()).unwrap();
        builder.insert(file, blob, 0o100644).unwrap();
        builder.write().unwrap()
    }

    pub fn commit_on(&self, refname: Option<&str>, parents: &[Oid], msg: &str) -> Oid {
        let t = self.next_time();
        let sig = Signature::new("Tester", "tester@example.com", &Time::new(t, -180)).unwrap();
        let tree_id = self.tree_with(&format!("f{}.txt", t), msg, parents.first().copied());
        let tree = self.repo.find_tree(tree_id).unwrap();
        let parent_commits: Vec<git2::Commit> =
            parents.iter().map(|p| self.repo.find_commit(*p).unwrap()).collect();
        let refs: Vec<&git2::Commit> = parent_commits.iter().collect();
        self.repo.commit(refname, &sig, &sig, msg, &tree, &refs).unwrap()
    }

    pub fn commit(&self, msg: &str) -> Oid {
        let parent = self.repo.head().ok().and_then(|h| h.target());
        let parents: Vec<Oid> = parent.into_iter().collect();
        let oid = self.commit_on(Some("HEAD"), &parents, msg);
        self.checkout_head();
        oid
    }

    pub fn raw_commit(&self, parent: Oid, headers_after_committer: &str, author_line: &str, message: &[u8]) -> Oid {
        let tree_id = self.tree_with("raw.txt", &format!("{:?}", message), Some(parent));
        let t = self.next_time();
        let mut buf = Vec::new();
        buf.extend_from_slice(format!("tree {}\nparent {}\n", tree_id, parent).as_bytes());
        buf.extend_from_slice(format!("author {} {} -0300\n", author_line, t).as_bytes());
        buf.extend_from_slice(format!("committer {} {} -0300\n", author_line, t).as_bytes());
        buf.extend_from_slice(headers_after_committer.as_bytes());
        buf.extend_from_slice(b"\n");
        buf.extend_from_slice(message);
        let oid = self.repo.odb().unwrap().write(ObjectType::Commit, &buf).unwrap();
        let head = self.repo.head().unwrap();
        let name = head.name().unwrap().to_string();
        self.repo.reference(&name, oid, true, "test").unwrap();
        self.checkout_head();
        oid
    }

    pub fn checkout_head(&self) {
        let mut cb = git2::build::CheckoutBuilder::new();
        cb.force();
        self.repo.checkout_head(Some(&mut cb)).unwrap();
    }

    pub fn head(&self) -> Oid {
        self.repo.head().unwrap().target().unwrap()
    }

    pub fn set_ref(&self, name: &str, oid: Oid) {
        self.repo.reference(name, oid, true, "test").unwrap();
    }

    pub fn first_parent_chain(&self) -> Vec<Oid> {
        let mut out = Vec::new();
        let mut cur = Some(self.head());
        while let Some(oid) = cur {
            out.push(oid);
            let c = self.repo.find_commit(oid).unwrap();
            cur = c.parent_id(0).ok();
        }
        out
    }
}
