import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CommitInfo, commitStatus } from '../../core/models/commit.model';
import { DateEditOperation } from '../../core/models/edit-operation.model';
import { CommitEditService } from '../../core/services/commit-edit.service';
import { RepositoryService } from '../../core/services/repository.service';
import { RelativeTimePipe } from '../../core/pipes/relative-time.pipe';
import { FormatDatePipe } from '../../core/pipes/format-date.pipe';

@Component({
  selector: 'app-commit-detail',
  standalone: true,
  imports: [FormsModule, TitleCasePipe, RelativeTimePipe, FormatDatePipe],
  templateUrl: './commit-detail.component.html',
  styleUrl: './commit-detail.component.scss',
  host: { '(document:keydown.escape)': 'onEscape()' },
})
export class CommitDetailComponent implements OnInit {
  private route  = inject(ActivatedRoute);
  private router = inject(Router);
  private repo   = inject(RepositoryService);
  private edit   = inject(CommitEditService);

  protected commit   = signal<CommitInfo | null>(null);
  protected newMsg   = signal('');
  protected editing  = signal(false);
  protected confirm  = signal(false);
  protected isSaving = computed(() => this.edit.isApplying());
  protected error    = computed(() => this.edit.lastError());

  protected isPushed = computed(() => this.commit()?.is_pushed ?? false);
  protected status   = computed(() => {
    const c = this.commit();
    return c ? commitStatus(c) : 'local';
  });

  protected isDirty = computed(() => {
    const c = this.commit();
    return c ? this.newMsg().trim() !== c.message.trim() : false;
  });

  // ── Date editing ────────────────────────────────────────────────
  protected editingDate  = signal(false);
  protected confirmDate  = signal(false);
  protected dateInput    = signal('');
  protected timeInput    = signal('');
  protected newAuthorTime = signal(0);

  protected utcPreview = computed(() =>
    new Date(this.newAuthorTime() * 1000).toISOString()
      .replace('T', ' ').slice(0, 19) + ' UTC'
  );

  protected isDateDirty = computed(() => {
    const c = this.commit();
    return c ? this.newAuthorTime() !== c.author_time : false;
  });

  ngOnInit(): void {
    const sha = this.route.snapshot.paramMap.get('sha');
    if (!sha) { this.router.navigate(['/repo/commits']); return; }
    const found = this.repo.commits().find(c => c.sha === sha || c.short_sha === sha);
    if (!found) { this.router.navigate(['/repo/commits']); return; }
    this.commit.set(found);
    this.newMsg.set(found.message);
    this.newAuthorTime.set(found.author_time);
    const d = new Date(found.author_time * 1000);
    this.dateInput.set(this.toDateString(d));
    this.timeInput.set(this.toTimeString(d));
  }

  protected startEditing(): void {
    if (this.isPushed()) return;
    this.editing.set(true);
  }

  protected cancelEdit(): void {
    this.editing.set(false);
    this.confirm.set(false);
    this.newMsg.set(this.commit()?.message ?? '');
  }

  protected requestConfirm(): void {
    if (!this.isDirty()) return;
    this.confirm.set(true);
  }

  protected async applyEdit(): Promise<void> {
    const c = this.commit();
    if (!c || !this.isDirty()) return;
    try {
      await this.edit.applyMessageEdit(c.sha, this.newMsg().trim());
      this.editing.set(false);
      this.confirm.set(false);
      this.router.navigate(['/repo/commits']);
    } catch { /* error shown via computed */ }
  }

  protected onEscape(): void {
    if (this.confirm()) { this.confirm.set(false); return; }
    if (this.editing()) { this.cancelEdit(); return; }
    if (this.confirmDate()) { this.confirmDate.set(false); return; }
    if (this.editingDate()) { this.cancelDateEdit(); return; }
    this.router.navigate(['/repo/commits']);
  }

  protected back(): void {
    this.router.navigate(['/repo/commits']);
  }

  // ── Date editing methods ─────────────────────────────────────────
  protected startEditingDate(): void {
    if (this.isPushed()) return;
    this.editingDate.set(true);
  }

  protected cancelDateEdit(): void {
    const c = this.commit();
    this.editingDate.set(false);
    this.confirmDate.set(false);
    if (c) {
      this.newAuthorTime.set(c.author_time);
      const d = new Date(c.author_time * 1000);
      this.dateInput.set(this.toDateString(d));
      this.timeInput.set(this.toTimeString(d));
    }
  }

  protected applyDateInputToSignal(): void {
    const c = this.commit();
    if (!c) return;
    const orig = new Date(c.author_time * 1000);
    const [y, mo, day] = (this.dateInput() || this.toDateString(orig)).split('-').map(Number);
    const [h, mi] = (this.timeInput() || this.toTimeString(orig)).split(':').map(Number);
    const parsed = new Date(y, mo - 1, day, h, mi, orig.getSeconds());
    if (isNaN(parsed.getTime())) return;
    this.newAuthorTime.set(Math.floor(parsed.getTime() / 1000));
  }

  protected requestDateConfirm(): void {
    if (!this.isDateDirty()) return;
    this.confirmDate.set(true);
  }

  protected async applyDateEdit(): Promise<void> {
    const c = this.commit();
    if (!c || !this.isDateDirty()) return;
    const newTime = this.newAuthorTime();
    const op: DateEditOperation = {
      sha: c.sha,
      author_time: newTime,
      author_offset: c.author_offset,
      committer_time: newTime,
      committer_offset: c.committer_offset,
    };
    try {
      await this.edit.applyAbsoluteDateEdits([op]);
      this.editingDate.set(false);
      this.confirmDate.set(false);
      this.router.navigate(['/repo/commits']);
    } catch { /* error shown via computed */ }
  }

  private toDateString(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private toTimeString(d: Date): string {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}
