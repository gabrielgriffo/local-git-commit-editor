import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommitInfo, commitStatus } from '../../core/models/commit.model';
import { RepositoryService } from '../../core/services/repository.service';
import { RelativeTimePipe } from '../../core/pipes/relative-time.pipe';
import { FormatDatePipe } from '../../core/pipes/format-date.pipe';

@Component({
  selector: 'app-commits',
  standalone: true,
  imports: [FormsModule, TitleCasePipe, RelativeTimePipe, FormatDatePipe],
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
    return base.filter(c => {
      const s = commitStatus(c);
      if (f === 'local')    return s === 'local';
      if (f === 'unpushed') return s === 'unpushed' || s === 'local';
      if (f === 'pushed')   return s === 'pushed';
      return true;
    });
  });

  protected totalCount    = computed(() => this.repo.commits().length);
  protected selectedCount = computed(() => this.repo.selectedCount());
  protected isLoading     = computed(() => this.repo.isLoading());

  protected localCount    = computed(() => this.repo.commits().filter(c => commitStatus(c) === 'local').length);
  protected unpushedCount = computed(() => this.repo.commits().filter(c => commitStatus(c) === 'unpushed').length);
  protected pushedCount   = computed(() => this.repo.commits().filter(c => c.is_pushed).length);

  protected spanLabel = computed(() => {
    const commits = this.repo.commits();
    if (commits.length < 2) return '—';
    const secs = commits[0].author_time - commits[commits.length - 1].author_time;
    if (secs < 3600)      return `${Math.round(secs / 60)} min`;
    if (secs < 86400)     return `${(secs / 3600).toFixed(1)} hrs`;
    if (secs < 86400 * 7) return `${(secs / 86400).toFixed(1)} days`;
    return `${(secs / 86400 / 7).toFixed(1)} wks`;
  });

  protected newestLabel = computed(() => {
    const c = this.repo.commits()[0];
    return c ? new Date(c.author_time * 1000).toLocaleDateString() : '—';
  });

  protected oldestLabel = computed(() => {
    const commits = this.repo.commits();
    const c = commits[commits.length - 1];
    return c ? new Date(c.author_time * 1000).toLocaleDateString() : '—';
  });

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
    event.preventDefault();
    if (this.selectedCount() === this.displayedCommits().length) {
      this.repo.clearSelection();
    } else {
      this.repo.selectAll();
    }
  }

  protected clearSelection(): void {
    this.repo.clearSelection();
  }

  protected refresh(): void {
    this.repo.loadCommits();
  }

  protected statusClass(commit: CommitInfo): string {
    return commitStatus(commit);
  }

  protected statusLabel(commit: CommitInfo): string {
    const s = commitStatus(commit);
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
