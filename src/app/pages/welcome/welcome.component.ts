import { Component, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RepositoryService } from '../../core/services/repository.service';
import { GitService } from '../../core/services/git.service';
import { IconComponent } from '../../shared/icon/icon.component';

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [FormsModule, IconComponent],
  templateUrl: './welcome.component.html',
  styleUrl: './welcome.component.scss',
})
export class WelcomeComponent implements OnDestroy {
  private router = inject(Router);
  private repo   = inject(RepositoryService);
  private git    = inject(GitService);

  protected path        = signal('');
  protected isLoading   = signal(false);
  protected error       = signal<string | null>(null);
  protected recentRepos = this.repo.recentRepos;

  private errorTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnDestroy(): void {
    if (this.errorTimer) clearTimeout(this.errorTimer);
  }

  protected baseName(p: string): string {
    return p.split(/[\\/]/).filter(Boolean).at(-1) ?? p;
  }

  private showError(raw: string): void {
    if (this.errorTimer) clearTimeout(this.errorTimer);
    this.error.set(this.friendlyError(raw));
    this.errorTimer = setTimeout(() => this.error.set(null), 10_000);
  }

  private clearError(): void {
    if (this.errorTimer) { clearTimeout(this.errorTimer); this.errorTimer = null; }
    this.error.set(null);
  }

  private friendlyError(raw: string): string {
    const s = raw.toLowerCase();
    if (s.includes('not a git repository') || s.includes('could not find repository'))
      return 'No Git repository found at this path. Make sure the folder contains a .git directory.';
    if (s.includes('permission denied') || s.includes('access is denied'))
      return 'Access denied — check that the folder is readable.';
    if (s.includes('no such file') || s.includes('not found') || s.includes('notfound'))
      return 'Folder not found — check the path and try again.';
    if (s.includes('bare repository'))
      return 'Bare repositories are not supported.';
    // strip git2 technical suffix: "; class=Repository (6); code=NotFound (-3)"
    const stripped = raw.replace(/\s*;?\s*class=\S.*$/i, '').trim();
    return stripped || 'Failed to open repository.';
  }

  protected async browse(): Promise<void> {
    const selected = await this.git.openFolderDialog();
    if (selected) {
      this.clearError();
      this.path.set(selected);
    }
  }

  protected async open(pathOverride?: string): Promise<void> {
    const p = pathOverride ?? this.path().trim();
    if (!p) { this.showError('Please enter a repository path.'); return; }

    this.isLoading.set(true);
    this.clearError();
    try {
      await this.repo.openRepository(p);
      this.router.navigate(['/repo/commits']);
    } catch (e: unknown) {
      this.showError(e instanceof Error ? e.message : String(e));
    } finally {
      this.isLoading.set(false);
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.open();
  }
}
