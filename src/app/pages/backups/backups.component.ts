import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BackupInfo } from '../../core/models/repository.model';
import { BackupService } from '../../core/services/backup.service';
import { RepositoryService } from '../../core/services/repository.service';
import { FormatDatePipe } from '../../core/pipes/format-date.pipe';
import { RelativeTimePipe } from '../../core/pipes/relative-time.pipe';
import { IconComponent } from '../../shared/icon/icon.component';

@Component({
  selector: 'app-backups',
  standalone: true,
  imports: [FormatDatePipe, RelativeTimePipe, IconComponent],
  templateUrl: './backups.component.html',
  styleUrl: './backups.component.scss',
})
export class BackupsComponent implements OnInit {
  private router  = inject(Router);
  private repo    = inject(RepositoryService);
  private backup  = inject(BackupService);

  protected backups     = computed(() => this.backup.backups());
  protected isLoading   = computed(() => this.backup.isLoading());
  protected restoringId = signal<string | null>(null);
  protected error       = signal<string | null>(null);
  protected successMsg  = signal<string | null>(null);

  ngOnInit(): void {
    const path = this.repo.repoPath();
    if (path) this.backup.loadBackups(path);
  }

  protected async createBackup(): Promise<void> {
    const path = this.repo.repoPath();
    if (!path) return;
    try {
      await this.backup.createBackup(path);
      this.successMsg.set('Backup created successfully.');
      setTimeout(() => this.successMsg.set(null), 3000);
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }

  protected async restore(b: BackupInfo): Promise<void> {
    const path = this.repo.repoPath();
    if (!path) return;
    this.restoringId.set(b.id);
    this.error.set(null);
    try {
      await this.backup.restoreBackup(path, b.id);
      await this.repo.loadCommits();
      this.successMsg.set(`Restored to ${b.description}`);
      setTimeout(() => this.successMsg.set(null), 3000);
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.restoringId.set(null);
    }
  }

  protected async deleteBackup(b: BackupInfo): Promise<void> {
    const path = this.repo.repoPath();
    if (!path) return;
    try {
      await this.backup.deleteBackup(path, b.id);
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }
}
