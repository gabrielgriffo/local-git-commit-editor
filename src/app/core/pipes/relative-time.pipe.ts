import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'relativeTime', standalone: true, pure: false })
export class RelativeTimePipe implements PipeTransform {
  transform(unixSeconds: number): string {
    const now = Date.now() / 1000;
    const diff = now - unixSeconds;

    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
    if (diff < 86400 * 30) return `${Math.floor(diff / 86400 / 7)}w ago`;
    if (diff < 86400 * 365) return `${Math.floor(diff / 86400 / 30)}mo ago`;
    return `${Math.floor(diff / 86400 / 365)}y ago`;
  }
}
