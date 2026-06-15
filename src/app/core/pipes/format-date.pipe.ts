import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'formatDate', standalone: true })
export class FormatDatePipe implements PipeTransform {
  transform(unixSeconds: number, format: 'short' | 'long' | 'time' | 'datetime' = 'short'): string {
    const date = new Date(unixSeconds * 1000);
    switch (format) {
      case 'time':
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      case 'long':
        return date.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });
      case 'datetime':
        return `${date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      default:
        return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    }
  }
}
