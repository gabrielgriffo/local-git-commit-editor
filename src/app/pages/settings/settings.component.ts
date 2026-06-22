import { Component, inject } from '@angular/core';
import { IconComponent } from '../../shared/icon/icon.component';
import { SettingsService } from '../../core/services/settings.service';
import { RepositoryService } from '../../core/services/repository.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  protected settings = inject(SettingsService);
  private   repo     = inject(RepositoryService);

  protected get commitLimit()  { return this.settings.commitLimit; }
  protected get confirmEdits() { return this.settings.confirmEdits; }
  protected get autoBackup()   { return this.settings.autoBackup; }

  protected onCommitLimitChange(value: number): void {
    this.settings.setCommitLimit(value);
    this.repo.loadCommits();
  }
}
