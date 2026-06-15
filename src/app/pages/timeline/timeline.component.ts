import { Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { CommitInfo } from '../../core/models/commit.model';
import { RepositoryService } from '../../core/services/repository.service';
import { FormatDatePipe } from '../../core/pipes/format-date.pipe';
import { RelativeTimePipe } from '../../core/pipes/relative-time.pipe';
import { Router } from '@angular/router';

interface TimelineNode {
  commit: CommitInfo;
  gapPx: number;      // pixel height of space above this node (0 for first)
  gapMinutes: number; // minutes since previous commit
}

@Component({
  selector: 'app-timeline',
  standalone: true,
  imports: [DecimalPipe, FormatDatePipe, RelativeTimePipe],
  templateUrl: './timeline.component.html',
  styleUrl: './timeline.component.scss',
})
export class TimelineComponent {
  private router = inject(Router);
  protected repo = inject(RepositoryService);

  // Minimum px gap between consecutive node centers — ensures readability even
  // when commits are densely clustered relative to the overall history span.
  private static readonly MIN_GAP_PX = 44;
  private static readonly TARGET_HEIGHT_PX = 1800;

  protected nodes = computed<TimelineNode[]>(() => {
    const commits = this.repo.commits();
    if (commits.length === 0) return [];

    const totalSpan = Math.max(
      commits[0].author_time - commits[commits.length - 1].author_time,
      1
    );

    return commits.map((c, i) => {
      if (i === 0) return { commit: c, gapPx: 0, gapMinutes: 0 };
      const gapSecs = commits[i - 1].author_time - c.author_time;
      const proportionalPx = (gapSecs / totalSpan) * TimelineComponent.TARGET_HEIGHT_PX;
      return {
        commit: c,
        gapPx: Math.max(proportionalPx, TimelineComponent.MIN_GAP_PX),
        gapMinutes: Math.round(gapSecs / 60),
      };
    });
  });

  protected oldest = computed(() => {
    const c = this.repo.commits();
    return c[c.length - 1]?.author_time ?? 0;
  });

  protected newest = computed(() => this.repo.commits()[0]?.author_time ?? 0);

  protected totalCommits = computed(() => this.repo.commits().length);

  protected openDetail(sha: string): void {
    this.router.navigate(['/repo/commits', sha]);
  }
}
