import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  readonly commitLimit  = signal<number>(this.load('lge_commit_limit', 200));
  readonly confirmEdits = signal<boolean>(this.load('lge_confirm_edits', true));
  readonly autoBackup   = signal<boolean>(this.load('lge_auto_backup', true));

  setCommitLimit(value: number): void {
    this.commitLimit.set(value);
    localStorage.setItem('lge_commit_limit', String(value));
  }

  setConfirmEdits(value: boolean): void {
    this.confirmEdits.set(value);
    localStorage.setItem('lge_confirm_edits', JSON.stringify(value));
  }

  setAutoBackup(value: boolean): void {
    this.autoBackup.set(value);
    localStorage.setItem('lge_auto_backup', JSON.stringify(value));
  }

  private load<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : fallback;
    } catch { return fallback; }
  }
}
