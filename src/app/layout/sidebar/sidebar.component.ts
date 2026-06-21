import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { RepositoryService } from '../../core/services/repository.service';
import { IconComponent } from '../../shared/icon/icon.component';

interface NavItem { label: string; route: string; icon: string; }

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, IconComponent],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  private router = inject(Router);
  protected repo  = inject(RepositoryService);

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

  protected closeRepo(): void {
    this.repo.closeRepository();
    this.router.navigate(['/welcome']);
  }
}
