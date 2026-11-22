import { Pipe, PipeTransform } from '@angular/core';
import { DateFormat, formatInOffset } from '../utils/time';

@Pipe({ name: 'formatDate', standalone: true })
export class FormatDatePipe implements PipeTransform {
  transform(unixSeconds: number, format: DateFormat = 'short', offsetMinutes: number | null = null): string {
    return formatInOffset(unixSeconds, offsetMinutes, format);
  }
}
