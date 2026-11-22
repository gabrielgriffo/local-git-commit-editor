import { Injectable, inject, signal } from '@angular/core';
import { GitService } from './git.service';
import { SettingsService } from './settings.service';
import { BackupInfo } from '../models/repository.model';

@Injectable({ providedIn: 'root' })
export class BackupService {
  private git      = inject(GitService);
  private settings = inject(SettingsService);

  readonly backups    = signal<BackupInfo[]>([]);
  readonly isLoading  = signal(false);

  async loadBackups(repoPath: string): Promise<void> {
    this.isLoading.set(true);
    try {
      this.backups.set([]);
      const list = await this.git.listBackups(repoPath);
      this.backups.set(list);
    } finally {
      this.isLoading.set(false);
    }
  }

  async createBackup(repoPath: string): Promise<BackupInfo> {
    const info = await this.git.createBackup(repoPath);
    this.prepend(info);
    return info;
  }

  async restoreBackup(repoPath: string, backupId: string): Promise<BackupInfo> {
    const safety = await this.git.restoreBackup(repoPath, backupId);
    this.prepend(safety);
    return safety;
  }

  async deleteBackup(repoPath: string, backupId: string): Promise<void> {
    await this.git.deleteBackup(repoPath, backupId);
    this.backups.update(list => list.filter(b => b.id !== backupId));
  }

  async autoBackup(repoPath: string): Promise<void> {
    if (!this.settings.autoBackup()) return;
    await this.createBackup(repoPath);
  }

  private prepend(info: BackupInfo): void {
    this.backups.update(list => [info, ...list.filter(b => b.id !== info.id)]);
  }
}
