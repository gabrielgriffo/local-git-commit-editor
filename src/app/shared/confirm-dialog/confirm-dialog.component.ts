import { Component, input, output } from '@angular/core';
import { FormatDatePipe } from '../../core/pipes/format-date.pipe';
import { formatDelta } from '../../core/utils/time';

export interface ConfirmDialogItem {
  sha: string;
  title: string;
  oldTime: number;
  newTime: number;
  offset: number | null;
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [FormatDatePipe],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
  host: { '(document:keydown.escape)': 'onEscape()' },
})
export class ConfirmDialogComponent {
  title        = input.required<string>();
  subtitle     = input.required<string>();
  warning      = input<string | null>(null);
  notices      = input<string[]>([]);
  items        = input.required<ConfirmDialogItem[]>();
  confirmLabel = input<string>('Apply');
  isSaving     = input<boolean>(false);
  error        = input<string | null>(null);

  confirmed = output<void>();
  cancelled = output<void>();

  protected timeDiff(oldTime: number, newTime: number): string {
    return formatDelta(newTime - oldTime);
  }

  protected onEscape(): void {
    if (!this.isSaving()) this.cancelled.emit();
  }
}
