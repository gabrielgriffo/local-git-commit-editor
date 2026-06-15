import { Injectable, computed, inject, signal } from '@angular/core';
import { CommitInfo } from '../models/commit.model';
import { RepositoryInfo } from '../models/repository.model';
import { GitService } from './git.service';

@Injectable({ providedIn: 'root' })
export class RepositoryService {
  private git = inject(GitService);

  readonly repoPath   = signal<string | null>(null);
  readonly repoInfo   = signal<RepositoryInfo | null>(null);
  readonly commits    = signal<CommitInfo[]>([]);
  readonly selected   = signal<Set<string>>(new Set());
  readonly search     = signal('');
  readonly isLoading  = signal(false);
  readonly error      = signal<string | null>(null);

  readonly filteredCommits = computed(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.commits();
    return this.commits().filter(c =>
      c.message.toLowerCase().includes(q) ||
      c.author_name.toLowerCase().includes(q) ||
      c.sha.startsWith(q) ||
      c.short_sha.startsWith(q)
    );
  });

  readonly selectedList = computed(() => {
    const sel = this.selected();
    return this.commits().filter(c => sel.has(c.sha));
  });

  readonly selectedCount = computed(() => this.selected().size);

  readonly unpushedCount = computed(() =>
    this.repoInfo()?.unpushed_count ?? 0
  );

  readonly recentRepos = signal<string[]>(this.loadRecent());

  private loadRecent(): string[] {
    try { return JSON.parse(localStorage.getItem('lge_recent_repos') ?? '[]'); }
    catch { return []; }
  }

  private saveRecent(path: string): void {
    const next = [path, ...this.recentRepos().filter(p => p !== path)].slice(0, 3);
    this.recentRepos.set(next);
    localStorage.setItem('lge_recent_repos', JSON.stringify(next));
  }

  async openRepository(path: string): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const info = await this.git.openRepository(path);
      this.repoPath.set(info.path);
      this.repoInfo.set(info);
      this.saveRecent(info.path);
      await this.loadCommits();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.error.set(msg);
      throw e;
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadCommits(limit = 200, offset = 0): Promise<void> {
    const path = this.repoPath();
    if (!path) return;
    this.isLoading.set(true);
    try {
      const list = await this.git.getCommits(path, limit, offset);
      this.commits.set(list);
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.isLoading.set(false);
    }
  }

  async refreshInfo(): Promise<void> {
    const path = this.repoPath();
    if (!path) return;
    try {
      const info = await this.git.openRepository(path);
      this.repoInfo.set(info);
    } catch { /* silent */ }
  }

  toggleSelect(sha: string): void {
    const next = new Set(this.selected());
    next.has(sha) ? next.delete(sha) : next.add(sha);
    this.selected.set(next);
  }

  selectAll(): void {
    this.selected.set(new Set(this.commits().map(c => c.sha)));
  }

  clearSelection(): void {
    this.selected.set(new Set());
  }

  isSelected(sha: string): boolean {
    return this.selected().has(sha);
  }

  closeRepository(): void {
    this.repoPath.set(null);
    this.repoInfo.set(null);
    this.commits.set([]);
    this.selected.set(new Set());
    this.error.set(null);
    // recent list is intentionally preserved so the welcome screen can show it
  }
}
