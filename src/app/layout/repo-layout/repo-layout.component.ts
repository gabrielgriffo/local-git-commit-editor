import { Component, OnInit, effect, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { RepositoryService } from '../../core/services/repository.service';
import { SidebarComponent } from '../sidebar/sidebar.component';

@Component({
  selector: 'app-repo-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent],
  templateUrl: './repo-layout.component.html',
  styleUrl: './repo-layout.component.scss',
})
export class RepoLayoutComponent implements OnInit {
  private router = inject(Router);
  protected repo = inject(RepositoryService);

  constructor() {
    effect(() => {
      if (!this.repo.repoPath()) {
        this.router.navigate(['/welcome']);
      }
    });
  }

  ngOnInit(): void {
    if (!this.repo.repoPath()) {
      this.router.navigate(['/welcome']);
    } else if (this.repo.commits().length === 0) {
      this.repo.loadCommits();
    }
  }
}
