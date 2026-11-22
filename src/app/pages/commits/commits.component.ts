import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommitInfo, commitStatus } from '../../core/models/commit.model';
import { RepositoryService } from '../../core/services/repository.service';
import { RelativeTimePipe } from '../../core/pipes/relative-time.pipe';
import { FormatDatePipe } from '../../core/pipes/format-date.pipe';
import { IconComponent } from '../../shared/icon/icon.component';
import { authorTimeRange } from '../../core/utils/time';

@Component({
  selector: 'app-commits',
  standalone: true,
  imports: [FormsModule, TitleCasePipe, RelativeTimePipe, FormatDatePipe, IconComponent],
  templateUrl: './commits.component.html',
  styleUrl: './commits.component.scss',
  host: {
    '(document:keydown.control.a)': 'onSelectAll($event)',
    '(document:keydown.meta.a)': 'onSelectAll($event)',
    '(document:keydown.escape)': 'clearSelection()',
  }
})
export class CommitsComponent implements OnInit {
  private router = inject(Router);
  protected repo = inject(RepositoryService);

  protected search = signal('');
  protected filter = signal<'all' | 'local' | 'unpushed' | 'pushed'>('all');

  protected displayedCommits = computed(() => {
    const base = this.repo.filteredCommits();
    const f = this.filter();
    if (f === 'all') return base;
    const hasRemote = this.repo.hasRemote();
    return base.filter(c => commitStatus(c, hasRemote) === f);
  });

  protected totalCount    = computed(() => this.repo.commits().length);
  protected selectedCount = computed(() => this.repo.selectedCount());
  protected isLoading     = computed(() => this.repo.isLoading());
  protected loadError     = computed(() => this.repo.error());

  protected localCount    = computed(() => this.countStatus('local'));
  protected unpushedCount = computed(() => this.countStatus('unpushed'));
  protected pushedCount   = computed(() => this.repo.commits().filter(c => c.is_pushed).length);

  private range = computed(() => authorTimeRange(this.repo.commits()));

  protected spanLabel = computed(() => {
    const range = this.range();
    if (!range || this.repo.commits().length < 2) return '—';
    const secs = range.newest - range.oldest;
    if (secs < 3600)      return `${Math.round(secs / 60)} min`;
    if (secs < 86400)     return `${(secs / 3600).toFixed(1)} hrs`;
    if (secs < 86400 * 7) return `${(secs / 86400).toFixed(1)} days`;
    return `${(secs / 86400 / 7).toFixed(1)} wks`;
  });

  protected newestLabel = computed(() => {
    const range = this.range();
    return range ? new Date(range.newest * 1000).toLocaleDateString() : '—';
  });

  protected oldestLabel = computed(() => {
    const range = this.range();
    return range ? new Date(range.oldest * 1000).toLocaleDateString() : '—';
  });

  private countStatus(status: 'local' | 'unpushed'): number {
    const hasRemote = this.repo.hasRemote();
    return this.repo.commits().filter(c => commitStatus(c, hasRemote) === status).length;
  }

  ngOnInit(): void {
    this.repo.search.set('');
    if (this.repo.commits().length === 0) {
      this.repo.loadCommits();
    }
  }

  protected onSearch(value: string): void {
    this.search.set(value);
    this.repo.search.set(value);
  }

  protected isSelected(commit: CommitInfo): boolean {
    return this.repo.isSelected(commit.sha);
  }

  protected toggleSelect(commit: CommitInfo, event: Event): void {
    event.stopPropagation();
    this.repo.toggleSelect(commit.sha);
  }

  protected openDetail(commit: CommitInfo): void {
    this.router.navigate(['/repo/commits', commit.sha]);
  }

  protected goToDateEditor(): void {
    this.router.navigate(['/repo/date-editor']);
  }

  protected goToBatch(): void {
    this.router.navigate(['/repo/batch']);
  }

  protected onSelectAll(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
    event.preventDefault();
    const shas = this.displayedCommits().map(c => c.sha);
    const allSelected = shas.length > 0
      && this.selectedCount() === shas.length
      && shas.every(sha => this.repo.isSelected(sha));
    if (allSelected) {
      this.repo.clearSelection();
    } else {
      this.repo.setSelection(shas);
    }
  }

  protected clearSelection(): void {
    this.repo.clearSelection();
  }

  protected refresh(): void {
    this.repo.loadCommits();
  }

  protected statusClass(commit: CommitInfo): string {
    return commitStatus(commit, this.repo.hasRemote());
  }

  protected statusLabel(commit: CommitInfo): string {
    const s = commitStatus(commit, this.repo.hasRemote());
    if (s === 'pushed') return 'Pushed';
    if (s === 'unpushed') return 'Unpushed';
    return 'Local';
  }

  protected trackBySha(_: number, c: CommitInfo): string {
    return c.sha;
  }

  protected isLastCommit(index: number): boolean {
    return index === this.displayedCommits().length - 1;
  }
}
