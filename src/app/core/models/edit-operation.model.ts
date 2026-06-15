export interface MessageEditPreview {
  sha: string;
  short_sha: string;
  original_message: string;
  new_message: string;
}

export interface DateEditOperation {
  sha: string;
  author_time: number | null;
  author_offset: number | null;
  committer_time: number | null;
  committer_offset: number | null;
}

export interface DateShiftPreview {
  sha: string;
  short_sha: string;
  title: string;
  original_author_time: number;
  new_author_time: number;
  original_committer_time: number;
  new_committer_time: number;
}
