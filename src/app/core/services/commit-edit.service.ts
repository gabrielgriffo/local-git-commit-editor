import { Injectable, inject, signal } from '@angular/core';
import { GitService } from './git.service';
import { RepositoryService } from './repository.service';
import { DateEditOperation } from '../models/edit-operation.model';
import { BackupService } from './backup.service';

@Injectable({ providedIn: 'root' })
export class CommitEditService {
  private git  = inject(GitService);
  private repo = inject(RepositoryService);
  private backup = inject(BackupService);

  readonly isApplying = signal(false);
  readonly lastError  = signal<string | null>(null);

  async applyMessageEdit(sha: string, newMessage: string): Promise<void> {
    const path = this.requirePath();
    this.isApplying.set(true);
    this.lastError.set(null);
    try {
      await this.backup.autoBackup(path);
      await this.git.applyMessageEdit(path, sha, newMessage);
      await this.repo.loadCommits();
      await this.repo.refreshInfo();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.lastError.set(msg);
      throw e;
    } finally {
      this.isApplying.set(false);
    }
  }

  async applyBatchDateShift(shaList: string[], deltaSeconds: number): Promise<void> {
    const path = this.requirePath();
    this.isApplying.set(true);
    this.lastError.set(null);
    try {
      await this.backup.autoBackup(path);
      await this.git.applyBatchDateShift(path, shaList, deltaSeconds);
      await this.repo.loadCommits();
      this.repo.clearSelection();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.lastError.set(msg);
      throw e;
    } finally {
      this.isApplying.set(false);
    }
  }

  async applyAbsoluteDateEdits(operations: DateEditOperation[]): Promise<void> {
    const path = this.requirePath();
    this.isApplying.set(true);
    this.lastError.set(null);
    try {
      await this.backup.autoBackup(path);
      await this.git.applyAbsoluteDateEdits(path, operations);
      await this.repo.loadCommits();
      this.repo.clearSelection();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.lastError.set(msg);
      throw e;
    } finally {
      this.isApplying.set(false);
    }
  }

  private requirePath(): string {
    const p = this.repo.repoPath();
    if (!p) throw new Error('No repository open');
    return p;
  }
}
