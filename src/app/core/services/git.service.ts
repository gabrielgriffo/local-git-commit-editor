import { Injectable } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { CommitInfo } from '../models/commit.model';
import { RepositoryInfo, BackupInfo } from '../models/repository.model';
import { DateEditOperation } from '../models/edit-operation.model';

@Injectable({ providedIn: 'root' })
export class GitService {
  openRepository(path: string): Promise<RepositoryInfo> {
    return invoke<RepositoryInfo>('open_repository', { path });
  }

  getCommits(repoPath: string, limit: number, offset: number): Promise<CommitInfo[]> {
    return invoke<CommitInfo[]>('get_commits', { repoPath, limit, offset });
  }

  getUnpushedCommits(repoPath: string): Promise<CommitInfo[]> {
    return invoke<CommitInfo[]>('get_unpushed_commits', { repoPath });
  }

  applyMessageEdit(repoPath: string, sha: string, newMessage: string): Promise<void> {
    return invoke<void>('apply_message_edit', { repoPath, sha, newMessage });
  }

  applyBatchDateShift(repoPath: string, shaList: string[], deltaSeconds: number): Promise<void> {
    return invoke<void>('apply_batch_date_shift', { repoPath, shaList, deltaSeconds });
  }

  applyAbsoluteDateEdits(repoPath: string, operations: DateEditOperation[]): Promise<void> {
    return invoke<void>('apply_absolute_date_edits', { repoPath, operations });
  }

  createBackup(repoPath: string): Promise<BackupInfo> {
    return invoke<BackupInfo>('create_backup', { repoPath });
  }

  listBackups(repoPath: string): Promise<BackupInfo[]> {
    return invoke<BackupInfo[]>('list_backups', { repoPath });
  }

  restoreBackup(repoPath: string, backupId: string): Promise<void> {
    return invoke<void>('restore_backup', { repoPath, backupId });
  }

  deleteBackup(repoPath: string, backupId: string): Promise<void> {
    return invoke<void>('delete_backup', { repoPath, backupId });
  }

  async openFolderDialog(): Promise<string | null> {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const result = await open({ directory: true, multiple: false, title: 'Select Git Repository' });
    return typeof result === 'string' ? result : null;
  }
}
