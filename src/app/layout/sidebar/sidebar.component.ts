import { Component, computed, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { RepositoryService } from '../../core/services/repository.service';

interface NavItem { label: string; route: string; icon: string; }

const ICONS: Record<string, string> = {
  commits: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="2.5" stroke="currentColor" stroke-width="1.3"/><line x1="7" y1="1" x2="7" y2="4.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="7" y1="9.5" x2="7" y2="13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  calendar: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="2.5" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/><line x1="1" y1="5.5" x2="13" y2="5.5" stroke="currentColor" stroke-width="1.3"/><line x1="4.5" y1="1" x2="4.5" y2="4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="9.5" y1="1" x2="9.5" y2="4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  batch:    `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="3" y1="4" x2="11" y2="4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="3" y1="7" x2="11" y2="7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="3" y1="10" x2="8" y2="10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  timeline: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="2" y1="2" x2="2" y2="12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="2" cy="3.5" r="1.5" fill="currentColor"/><circle cx="2" cy="7.5" r="1.5" fill="currentColor"/><circle cx="2" cy="11" r="1.5" fill="currentColor"/><line x1="4.5" y1="3.5" x2="12" y2="3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="4.5" y1="7.5" x2="10" y2="7.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="4.5" y1="11" x2="11" y2="11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  backup:   `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 10H3a2 2 0 010-4h.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M10 10h1a2 2 0 000-4h-.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="5" y1="12" x2="5" y2="6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="9" y1="12" x2="9" y2="6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="5" y1="9" x2="9" y2="9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  settings: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="2" stroke="currentColor" stroke-width="1.3"/><path d="M7 1.5V3M7 11v1.5M1.5 7H3M11 7h1.5M3.2 3.2l1.05 1.05M9.75 9.75l1.05 1.05M3.2 10.8l1.05-1.05M9.75 4.25l1.05-1.05" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  close:    `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 2H11.5a1 1 0 011 1v8a1 1 0 01-1 1H9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M5.5 9.5L3 7l2.5-2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><line x1="3" y1="7" x2="9.5" y2="7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
};

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  private router    = inject(Router);
  private sanitizer = inject(DomSanitizer);
  protected repo    = inject(RepositoryService);

  protected repoName = computed(() => this.repo.repoInfo()?.name ?? '—');
  protected branch   = computed(() => this.repo.repoInfo()?.current_branch ?? '—');
  protected unpushed = computed(() => this.repo.unpushedCount());

  protected nav: NavItem[] = [
    { label: 'Commits',     route: '/repo/commits',     icon: 'commits'  },
    { label: 'Date Editor', route: '/repo/date-editor', icon: 'calendar' },
    { label: 'Batch Ops',   route: '/repo/batch',       icon: 'batch'    },
  ];

  protected secondary: NavItem[] = [
    { label: 'Backups',  route: '/repo/backups',  icon: 'backup'   },
    { label: 'Settings', route: '/repo/settings', icon: 'settings' },
  ];

  protected getIcon(name: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(ICONS[name] ?? '');
  }

  protected closeRepo(): void {
    this.repo.closeRepository();
    this.router.navigate(['/welcome']);
  }
}
