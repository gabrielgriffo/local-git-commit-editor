import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommitInfo } from '../../core/models/commit.model';
import { CommitEditService } from '../../core/services/commit-edit.service';
import { RepositoryService } from '../../core/services/repository.service';
import { FormatDatePipe } from '../../core/pipes/format-date.pipe';
import { IconComponent } from '../../shared/icon/icon.component';

interface BatchRow {
  commit: CommitInfo;
  selected: boolean;
  previewTime: number | null;
}

@Component({
  selector: 'app-batch',
  standalone: true,
  imports: [FormsModule, FormatDatePipe, IconComponent],
  templateUrl: './batch.component.html',
  styleUrl: './batch.component.scss',
  host: {
    '(document:keydown.control.a)': 'selectAll($event)',
    '(document:keydown.escape)': 'clearPreview()',
  }
})
export class BatchComponent implements OnInit {
  private router = inject(Router);
  private repo   = inject(RepositoryService);
  private edit   = inject(CommitEditService);

  protected rows       = signal<BatchRow[]>([]);
  protected pendingDelta = signal<number>(0);
  protected showConfirm  = signal(false);
  protected isSaving     = computed(() => this.edit.isApplying());
  protected error        = computed(() => this.edit.lastError());

  protected selectedRows    = computed(() => this.rows().filter(r => r.selected && !r.commit.is_pushed));
  protected selectedCount   = computed(() => this.selectedRows().length);
  protected hasPreview      = computed(() => this.pendingDelta() !== 0 && this.selectedCount() > 0);
  protected editableRows    = computed(() => this.rows().filter(r => !r.commit.is_pushed));
  protected allSelected     = computed(() => this.editableRows().length > 0 && this.editableRows().every(r => r.selected));

  ngOnInit(): void {
    const preselected = new Set(this.repo.selectedList().map(c => c.sha));
    this.rows.set(this.repo.commits().map(c => ({
      commit: c,
      selected: preselected.has(c.sha),
      previewTime: null,
    })));
  }

  protected toggleRow(sha: string): void {
    this.rows.update(rows => rows.map(r =>
      r.commit.sha === sha && !r.commit.is_pushed ? { ...r, selected: !r.selected } : r
    ));
    this.computePreview();
  }

  protected selectAll(event?: Event): void {
    event?.preventDefault();
    const allSel = this.allSelected();
    this.rows.update(rows => rows.map(r =>
      r.commit.is_pushed ? r : { ...r, selected: !allSel }
    ));
    this.computePreview();
  }

  protected setDelta(delta: number): void {
    this.pendingDelta.set(delta);
    this.computePreview();
  }

  protected addDelta(delta: number): void {
    this.pendingDelta.update(d => d + delta);
    this.computePreview();
  }

  protected clearPreview(): void {
    this.pendingDelta.set(0);
    this.rows.update(rows => rows.map(r => ({ ...r, previewTime: null })));
  }

  private computePreview(): void {
    const delta = this.pendingDelta();
    this.rows.update(rows => rows.map(r => ({
      ...r,
      previewTime: r.selected && !r.commit.is_pushed && delta !== 0 ? r.commit.author_time + delta : null,
    })));
  }

  protected formatDelta(delta: number): string {
    const abs = Math.abs(delta);
    const sign = delta >= 0 ? '+' : '-';
    if (abs < 3600) return `${sign}${Math.round(abs / 60)}m`;
    if (abs < 86400) return `${sign}${Math.round(abs / 3600)}h`;
    if (abs < 86400 * 7) return `${sign}${Math.round(abs / 86400)}d`;
    return `${sign}${Math.round(abs / 86400 / 7)}w`;
  }

  protected async refresh(): Promise<void> {
    await this.repo.loadCommits();
    this.ngOnInit();
  }

  protected async apply(): Promise<void> {
    const shaList = this.selectedRows().map(r => r.commit.sha);
    const delta = this.pendingDelta();
    if (shaList.length === 0 || delta === 0) return;
    try {
      await this.edit.applyBatchDateShift(shaList, delta);
      this.showConfirm.set(false);
      this.router.navigate(['/repo/commits']);
    } catch { /* error via computed */ }
  }
}
