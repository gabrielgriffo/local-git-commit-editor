import { Injectable, computed, inject, signal } from '@angular/core';
import { CommitInfo } from '../models/commit.model';
import { RepositoryInfo } from '../models/repository.model';
import { GitService } from './git.service';
import { SettingsService } from './settings.service';

@Injectable({ providedIn: 'root' })
export class RepositoryService {
  private git      = inject(GitService);
  private settings = inject(SettingsService);

  readonly repoPath   = signal<string | null>(null);
  readonly repoInfo   = signal<RepositoryInfo | null>(null);
  readonly commits    = signal<CommitInfo[]>([]);
  readonly selected   = signal<Set<string>>(new Set());
  readonly search     = signal('');
  readonly isLoading  = signal(false);
  readonly error      = signal<string | null>(null);

  private openSeq = 0;
  private loadSeq = 0;

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

  readonly selectedCount = computed(() => this.selectedList().length);

  readonly hasRemote = computed(() => this.repoInfo()?.has_remote ?? false);

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
    const seq = ++this.openSeq;
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const info = await this.git.openRepository(path);
      if (seq !== this.openSeq) return;
      this.repoPath.set(info.path);
      this.repoInfo.set(info);
      this.commits.set([]);
      this.selected.set(new Set());
      this.saveRecent(info.path);
      await this.loadCommits();
    } catch (e: unknown) {
      if (seq === this.openSeq) {
        this.error.set(e instanceof Error ? e.message : String(e));
      }
      throw e;
    } finally {
      if (seq === this.openSeq) this.isLoading.set(false);
    }
  }

  async loadCommits(offset = 0): Promise<void> {
    const path  = this.repoPath();
    const limit = this.settings.commitLimit();
    if (!path) return;
    const seq = ++this.loadSeq;
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const [list, info] = await Promise.all([
        this.git.getCommits(path, limit, offset),
        this.git.openRepository(path),
      ]);
      if (seq !== this.loadSeq || this.repoPath() !== path) return;
      this.commits.set(list);
      this.repoInfo.set(info);
    } catch (e: unknown) {
      if (seq === this.loadSeq && this.repoPath() === path) {
        this.error.set(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (seq === this.loadSeq) this.isLoading.set(false);
    }
  }

  async refreshInfo(): Promise<void> {
    const path = this.repoPath();
    if (!path) return;
    try {
      const info = await this.git.openRepository(path);
      if (this.repoPath() === path) this.repoInfo.set(info);
    } catch { /* silent */ }
  }

  toggleSelect(sha: string): void {
    const next = new Set(this.selected());
    next.has(sha) ? next.delete(sha) : next.add(sha);
    this.selected.set(next);
  }

  setSelection(shas: string[]): void {
    this.selected.set(new Set(shas));
  }

  remapSelection(mapping: Record<string, string>): void {
    const existing = new Set(this.commits().map(c => c.sha));
    const next = [...this.selected()]
      .map(sha => mapping[sha] ?? sha)
      .filter(sha => existing.has(sha));
    this.selected.set(new Set(next));
  }

  clearSelection(): void {
    this.selected.set(new Set());
  }

  isSelected(sha: string): boolean {
    return this.selected().has(sha);
  }

  closeRepository(): void {
    this.openSeq++;
    this.loadSeq++;
    this.repoPath.set(null);
    this.repoInfo.set(null);
    this.commits.set([]);
    this.selected.set(new Set());
    this.error.set(null);
    this.isLoading.set(false);
    // recent list is intentionally preserved so the welcome screen can show it
  }
}
