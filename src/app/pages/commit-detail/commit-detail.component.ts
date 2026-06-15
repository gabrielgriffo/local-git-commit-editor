import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CommitInfo, commitStatus } from '../../core/models/commit.model';
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

  ngOnInit(): void {
    const sha = this.route.snapshot.paramMap.get('sha');
    if (!sha) { this.router.navigate(['/repo/commits']); return; }
    const found = this.repo.commits().find(c => c.sha === sha || c.short_sha === sha);
    if (!found) { this.router.navigate(['/repo/commits']); return; }
    this.commit.set(found);
    this.newMsg.set(found.message);
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
    this.router.navigate(['/repo/commits']);
  }

  protected back(): void {
    this.router.navigate(['/repo/commits']);
  }
}
