export type CommitStatus = 'local' | 'unpushed' | 'pushed';

export interface CommitInfo {
  sha: string;
  short_sha: string;
  message: string;
  title: string;
  body: string | null;
  author_name: string;
  author_email: string;
  author_time: number;        // Unix timestamp seconds
  author_offset: number;      // Timezone offset in minutes
  committer_name: string;
  committer_email: string;
  committer_time: number;
  committer_offset: number;
  is_pushed: boolean;
  parent_shas: string[];
}

export function commitStatus(commit: CommitInfo): CommitStatus {
  if (commit.is_pushed) return 'pushed';
  return 'local';
}
