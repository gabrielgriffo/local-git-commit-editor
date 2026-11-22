import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { BackupInfo } from '../../core/models/repository.model';
import { BackupService } from '../../core/services/backup.service';
import { RepositoryService } from '../../core/services/repository.service';
import { FormatDatePipe } from '../../core/pipes/format-date.pipe';
import { RelativeTimePipe } from '../../core/pipes/relative-time.pipe';
import { IconComponent } from '../../shared/icon/icon.component';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-backups',
  standalone: true,
  imports: [FormatDatePipe, RelativeTimePipe, IconComponent, ConfirmDialogComponent],
  templateUrl: './backups.component.html',
  styleUrl: './backups.component.scss',
})
export class BackupsComponent implements OnInit {
  private repo    = inject(RepositoryService);
  private backup  = inject(BackupService);

  protected backups       = computed(() => this.backup.backups());
  protected isLoading     = computed(() => this.backup.isLoading());
  protected restoringId   = signal<string | null>(null);
  protected isCreating    = signal(false);
  protected isDeleting    = signal(false);
  protected pendingDelete = signal<BackupInfo | null>(null);
  protected error         = signal<string | null>(null);
  protected successMsg    = signal<string | null>(null);
  protected isBusy        = computed(() => this.restoringId() !== null || this.isCreating() || this.isDeleting());

  ngOnInit(): void {
    const path = this.repo.repoPath();
    if (!path) return;
    this.backup.loadBackups(path).catch((e: unknown) => this.showError(e));
  }

  protected async createBackup(): Promise<void> {
    const path = this.repo.repoPath();
    if (!path || this.isBusy()) return;
    this.isCreating.set(true);
    this.error.set(null);
    try {
      await this.backup.createBackup(path);
      this.showSuccess('Backup created successfully.');
    } catch (e: unknown) {
      this.showError(e);
    } finally {
      this.isCreating.set(false);
    }
  }

  protected async restore(b: BackupInfo): Promise<void> {
    const path = this.repo.repoPath();
    if (!path || this.isBusy()) return;
    this.restoringId.set(b.id);
    this.error.set(null);
    try {
      const safety = await this.backup.restoreBackup(path, b.id);
      this.repo.clearSelection();
      await this.repo.loadCommits();
      this.showSuccess(`Restored to ${b.description}. Previous state saved as ${safety.description}.`);
    } catch (e: unknown) {
      this.showError(e);
    } finally {
      this.restoringId.set(null);
    }
  }

  protected askDelete(b: BackupInfo): void {
    this.error.set(null);
    this.pendingDelete.set(b);
  }

  protected async confirmDelete(): Promise<void> {
    const b = this.pendingDelete();
    const path = this.repo.repoPath();
    if (!b || !path) return;
    this.isDeleting.set(true);
    try {
      await this.backup.deleteBackup(path, b.id);
      this.pendingDelete.set(null);
    } catch (e: unknown) {
      this.pendingDelete.set(null);
      this.showError(e);
    } finally {
      this.isDeleting.set(false);
    }
  }

  private showError(e: unknown): void {
    this.successMsg.set(null);
    this.error.set(e instanceof Error ? e.message : String(e));
  }

  private showSuccess(msg: string): void {
    this.successMsg.set(msg);
    setTimeout(() => {
      if (this.successMsg() === msg) this.successMsg.set(null);
    }, 4000);
  }
}
