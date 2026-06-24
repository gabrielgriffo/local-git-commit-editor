import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommitInfo, commitStatus } from '../../core/models/commit.model';
import { DateEditOperation } from '../../core/models/edit-operation.model';
import { CommitEditService } from '../../core/services/commit-edit.service';
import { RepositoryService } from '../../core/services/repository.service';
import { FormatDatePipe } from '../../core/pipes/format-date.pipe';
import { IconComponent } from '../../shared/icon/icon.component';
import { ConfirmDialogComponent, ConfirmDialogItem } from '../../shared/confirm-dialog/confirm-dialog.component';

interface CommitDateEdit {
  commit: CommitInfo;
  newAuthorTime: number;
  newCommitterTime: number;
  changed: boolean;
}

interface TimelineItem {
  sha: string;
  status: 'local' | 'unpushed' | 'pushed';
  origPct: number;
  newPct: number;
  lineLeft: number;
  lineWidth: number;
  changed: boolean;
  active: boolean;
}

@Component({
  selector: 'app-date-editor',
  standalone: true,
  imports: [FormsModule, FormatDatePipe, IconComponent, ConfirmDialogComponent],
  templateUrl: './date-editor.component.html',
  styleUrl: './date-editor.component.scss',
})
export class DateEditorComponent implements OnInit {
  private repo   = inject(RepositoryService);
  private edit   = inject(CommitEditService);

  protected rows        = signal<CommitDateEdit[]>([]);
  protected activeIdx   = signal<number>(0);
  protected showConfirm = signal(false);
  protected isSaving    = computed(() => this.edit.isApplying());
  protected error       = computed(() => this.edit.lastError());
  protected anyChanged   = computed(() => this.rows().some(r => r.changed));
  protected changedCount = computed(() => this.rows().filter(r => r.changed).length);

  protected confirmItems = computed<ConfirmDialogItem[]>(() =>
    this.rows()
      .filter(r => r.changed)
      .map(r => ({
        sha: r.commit.short_sha,
        title: r.commit.title,
        oldTime: r.commit.author_time,
        newTime: r.newAuthorTime,
      }))
  );

  protected confirmSubtitle = computed(() =>
    `${this.changedCount()} commit(s) will be rewritten.`
  );
  protected activeRow    = computed(() => this.rows()[this.activeIdx()] ?? null);
  protected activeIsPushed = computed(() => this.activeRow()?.commit.is_pushed ?? false);
  protected commitStatus = commitStatus;

  protected dateInput = signal('');
  protected timeInput = signal('');

  protected utcPreview = computed(() => {
    const row = this.activeRow();
    if (!row) return '';
    return new Date(row.newAuthorTime * 1000).toISOString()
      .replace('T', ' ').slice(0, 19) + ' UTC';
  });

  protected timelineItems = computed((): TimelineItem[] => {
    const rows = this.rows();
    if (rows.length === 0) return [];
    const activeIdx = this.activeIdx();

    const times = rows.map(r => r.newAuthorTime);
    const origTimes = rows.map(r => r.commit.author_time);
    const allTimes = [...times, ...origTimes];
    let min = Math.min(...allTimes);
    let max = Math.max(...allTimes);

    const pct = (t: number) => {
      if (max === min) return 50;
      // Commits are newest-first; invert so oldest is left
      return ((t - min) / (max - min)) * 96 + 2;
    };

    return rows.map((r, i) => {
      const op = pct(r.commit.author_time);
      const np = pct(r.newAuthorTime);
      return {
        sha: r.commit.sha,
        status: commitStatus(r.commit),
        origPct: op,
        newPct: np,
        lineLeft: Math.min(op, np),
        lineWidth: Math.abs(np - op),
        changed: r.changed,
        active: i === activeIdx,
      };
    });
  });

  ngOnInit(): void {
    const selected = this.repo.selectedList();
    const source = selected.length > 0 ? selected : this.repo.commits();
    this.rows.set(source.map(c => ({
      commit: c,
      newAuthorTime: c.author_time,
      newCommitterTime: c.committer_time,
      changed: false,
    })));
    if (this.rows().length > 0) {
      this.activateRow(0);
    }
  }

  protected activateRow(idx: number): void {
    this.activeIdx.set(idx);
    const row = this.rows()[idx];
    if (!row) return;
    const d = new Date(row.newAuthorTime * 1000);
    this.dateInput.set(this.toDateString(d));
    this.timeInput.set(this.toTimeString(d));
  }

  protected applyInputToRow(): void {
    const idx = this.activeIdx();
    const rows = [...this.rows()];
    const row = { ...rows[idx] };
    if (row.commit.is_pushed) return;
    const dateStr = this.dateInput();
    const timeStr = this.timeInput();
    if (!dateStr && !timeStr) return;

    const orig = new Date(row.commit.author_time * 1000);
    const [y, mo, d] = (dateStr || this.toDateString(orig)).split('-').map(Number);
    const [h, mi] = (timeStr || this.toTimeString(orig)).split(':').map(Number);

    const parsed = new Date(y, mo - 1, d, h, mi, orig.getSeconds());
    if (isNaN(parsed.getTime())) return;

    const newSecs = Math.floor(parsed.getTime() / 1000);
    row.newAuthorTime = newSecs;
    row.newCommitterTime = newSecs;
    row.changed = newSecs !== row.commit.author_time;
    rows[idx] = row;
    this.rows.set(rows);
  }

  protected shiftActive(deltaSecs: number): void {
    const idx = this.activeIdx();
    const rows = [...this.rows()];
    const row = rows[idx];
    if (!row || row.commit.is_pushed) return;
    rows[idx] = {
      ...row,
      newAuthorTime: row.newAuthorTime + deltaSecs,
      newCommitterTime: row.newCommitterTime + deltaSecs,
      changed: true,
    };
    this.rows.set(rows);
    this.activateRow(idx);
  }

  protected resetAll(): void {
    this.rows.set(this.rows().map(r => ({
      ...r,
      newAuthorTime: r.commit.author_time,
      newCommitterTime: r.commit.committer_time,
      changed: false,
    })));
    this.activateRow(this.activeIdx());
  }

  protected resetRow(idx: number): void {
    const rows = [...this.rows()];
    const r = rows[idx];
    rows[idx] = { ...r, newAuthorTime: r.commit.author_time, newCommitterTime: r.commit.committer_time, changed: false };
    this.rows.set(rows);
    if (idx === this.activeIdx()) this.activateRow(idx);
  }

  protected async apply(): Promise<void> {
    const ops: DateEditOperation[] = this.rows()
      .filter(r => r.changed)
      .map(r => ({
        sha: r.commit.sha,
        author_time: r.newAuthorTime,
        author_offset: r.commit.author_offset,
        committer_time: r.newCommitterTime,
        committer_offset: r.commit.committer_offset,
      }));
    if (ops.length === 0) return;
    try {
      await this.edit.applyAbsoluteDateEdits(ops);
      this.showConfirm.set(false);
      await this.refresh();
    } catch { /* error shown via computed */ }
  }

  protected timeDiff(orig: number, next: number): string {
    const diff = next - orig;
    if (diff === 0) return '';
    const abs = Math.abs(diff);
    const sign = diff > 0 ? '+' : '-';
    if (abs < 3600) return `${sign}${Math.round(abs / 60)}m`;
    if (abs < 86400) return `${sign}${Math.round(abs / 3600)}h`;
    return `${sign}${Math.round(abs / 86400)}d`;
  }

  protected async refresh(): Promise<void> {
    await this.repo.loadCommits();
    this.ngOnInit();
  }

  private toDateString(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private toTimeString(d: Date): string {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}
