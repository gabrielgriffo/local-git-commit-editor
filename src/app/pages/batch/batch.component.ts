import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommitInfo } from '../../core/models/commit.model';
import { CommitEditService } from '../../core/services/commit-edit.service';
import { RepositoryService } from '../../core/services/repository.service';
import { SettingsService } from '../../core/services/settings.service';
import { formatDelta } from '../../core/utils/time';
import { FormatDatePipe } from '../../core/pipes/format-date.pipe';
import { IconComponent } from '../../shared/icon/icon.component';
import { ConfirmDialogComponent, ConfirmDialogItem } from '../../shared/confirm-dialog/confirm-dialog.component';

interface BatchRow {
  commit: CommitInfo;
  selected: boolean;
  previewTime: number | null;
}

@Component({
  selector: 'app-batch',
  standalone: true,
  imports: [FormsModule, FormatDatePipe, IconComponent, ConfirmDialogComponent],
  templateUrl: './batch.component.html',
  styleUrl: './batch.component.scss',
  host: {
    '(document:keydown.control.a)': 'selectAll($event)',
    '(document:keydown.escape)': 'clearPreview()',
  }
})
export class BatchComponent implements OnInit {
  private repo   = inject(RepositoryService);
  private edit   = inject(CommitEditService);
  private settings = inject(SettingsService);

  protected rows       = signal<BatchRow[]>([]);
  protected pendingDelta = signal<number>(0);
  protected showConfirm  = signal(false);
  protected notices      = signal<string[]>([]);
  protected isSaving     = computed(() => this.edit.isApplying());
  protected error        = computed(() => this.edit.lastError());

  protected selectedRows    = computed(() => this.rows().filter(r => r.selected && !r.commit.is_pushed));
  protected selectedCount   = computed(() => this.selectedRows().length);
  protected hasPreview      = computed(() => this.pendingDelta() !== 0 && this.selectedCount() > 0);
  protected editableRows    = computed(() => this.rows().filter(r => !r.commit.is_pushed));
  protected allSelected     = computed(() => this.editableRows().length > 0 && this.editableRows().every(r => r.selected));

  protected confirmItems = computed<ConfirmDialogItem[]>(() =>
    this.selectedRows().map(r => ({
      sha: r.commit.short_sha,
      title: r.commit.title,
      oldTime: r.commit.author_time,
      newTime: r.commit.author_time + this.pendingDelta(),
      offset: r.commit.author_offset,
    }))
  );

  protected confirmSubtitle = computed(() =>
    `${this.selectedCount()} commit(s) will be shifted by ${this.formatDelta(this.pendingDelta())}.`
  );

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
    if (this.showConfirm()) {
      if (!this.isSaving()) this.showConfirm.set(false);
      return;
    }
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
    return formatDelta(delta) || '+0m';
  }

  protected async requestApply(): Promise<void> {
    if (!this.hasPreview()) return;
    if (!this.settings.confirmEdits()) {
      await this.apply();
      return;
    }
    this.edit.clearError();
    this.notices.set([]);
    this.showConfirm.set(true);
    this.notices.set(await this.edit.impactNotices(this.selectedRows().map(r => r.commit.sha)));
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
      this.pendingDelta.set(0);
      await this.refresh();
    } catch { /* error via computed */ }
  }
}
