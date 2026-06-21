import { Component, signal } from '@angular/core';
import { IconComponent } from '../../shared/icon/icon.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  protected commitLimit = signal(200);
  protected confirmEdits = signal(true);
  protected autoBackup   = signal(true);
}
