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

  clearError(): void {
    this.lastError.set(null);
  }

  async impactNotices(shaList: string[]): Promise<string[]> {
    const path = this.repo.repoPath();
    if (!path || shaList.length === 0) return [];
    try {
      const impact = await this.git.rewriteImpact(path, shaList);
      const notices: string[] = [];
      if (impact.signed_count > 0) {
        notices.push(`${impact.signed_count} signed commit(s) in the rewritten range will lose their GPG/SSH signature.`);
      }
      if (impact.affected_refs.length > 0) {
        notices.push(`These refs will keep pointing to the old commits: ${impact.affected_refs.join(', ')}.`);
      }
      return notices;
    } catch (e: unknown) {
      return [e instanceof Error ? e.message : String(e)];
    }
  }

  applyMessageEdit(sha: string, newMessage: string): Promise<void> {
    return this.run(path => this.git.applyMessageEdit(path, sha, newMessage));
  }

  applyBatchDateShift(shaList: string[], deltaSeconds: number): Promise<void> {
    return this.run(path => this.git.applyBatchDateShift(path, shaList, deltaSeconds));
  }

  applyAbsoluteDateEdits(operations: DateEditOperation[]): Promise<void> {
    return this.run(path => this.git.applyAbsoluteDateEdits(path, operations));
  }

  private async run(rewrite: (path: string) => Promise<Record<string, string>>): Promise<void> {
    const path = this.requirePath();
    if (this.isApplying()) throw new Error('Another edit is still being applied');
    this.isApplying.set(true);
    this.lastError.set(null);
    try {
      await this.backup.autoBackup(path);
      const mapping = await rewrite(path);
      await this.repo.loadCommits();
      this.repo.remapSelection(mapping);
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
