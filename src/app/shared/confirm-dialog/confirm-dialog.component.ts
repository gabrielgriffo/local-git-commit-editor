import { Component, input, output } from '@angular/core';
import { FormatDatePipe } from '../../core/pipes/format-date.pipe';

export interface ConfirmDialogItem {
  sha: string;
  title: string;
  oldTime: number;
  newTime: number;
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [FormatDatePipe],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
})
export class ConfirmDialogComponent {
  title        = input.required<string>();
  subtitle     = input.required<string>();
  warning      = input<string | null>(null);
  items        = input.required<ConfirmDialogItem[]>();
  confirmLabel = input<string>('Apply');
  isSaving     = input<boolean>(false);
  error        = input<string | null>(null);

  confirmed = output<void>();
  cancelled = output<void>();

  protected timeDiff(oldTime: number, newTime: number): string {
    const diff = newTime - oldTime;
    if (diff === 0) return '';
    const abs = Math.abs(diff);
    const sign = diff > 0 ? '+' : '-';
    if (abs < 3600) return `${sign}${Math.round(abs / 60)}m`;
    if (abs < 86400) return `${sign}${Math.round(abs / 3600)}h`;
    if (abs < 86400 * 7) return `${sign}${Math.round(abs / 86400)}d`;
    return `${sign}${Math.round(abs / 86400 / 7)}w`;
  }
}
