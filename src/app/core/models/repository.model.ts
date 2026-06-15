export interface RepositoryInfo {
  path: string;
  name: string;
  current_branch: string;
  head_sha: string | null;
  has_remote: boolean;
  remote_name: string | null;
  unpushed_count: number;
}

export interface BackupInfo {
  id: string;
  created_at: number;   // Unix timestamp
  branch: string;
  head_sha: string;
  description: string;
}
