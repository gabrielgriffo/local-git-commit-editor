import { Injectable, inject, signal } from '@angular/core';
import { GitService } from './git.service';
import { BackupInfo } from '../models/repository.model';

@Injectable({ providedIn: 'root' })
export class BackupService {
  private git = inject(GitService);

  readonly backups    = signal<BackupInfo[]>([]);
  readonly isLoading  = signal(false);
  private lastAutoBackup = 0;

  async loadBackups(repoPath: string): Promise<void> {
    this.isLoading.set(true);
    try {
      const list = await this.git.listBackups(repoPath);
      this.backups.set(list);
    } catch { /* silent */ } finally {
      this.isLoading.set(false);
    }
  }

  async createBackup(repoPath: string): Promise<BackupInfo> {
    const info = await this.git.createBackup(repoPath);
    this.backups.update(list => [info, ...list]);
    return info;
  }

  async restoreBackup(repoPath: string, backupId: string): Promise<void> {
    await this.git.restoreBackup(repoPath, backupId);
  }

  async deleteBackup(repoPath: string, backupId: string): Promise<void> {
    await this.git.deleteBackup(repoPath, backupId);
    this.backups.update(list => list.filter(b => b.id !== backupId));
  }

  async autoBackup(repoPath: string): Promise<void> {
    const now = Date.now();
    if (now - this.lastAutoBackup < 60_000) return;
    try {
      await this.createBackup(repoPath);
      this.lastAutoBackup = now;
    } catch { /* silent — don't block operation */ }
  }
}
