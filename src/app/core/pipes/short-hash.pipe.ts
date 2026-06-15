import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'shortHash', standalone: true })
export class ShortHashPipe implements PipeTransform {
  transform(sha: string, length = 7): string {
    return sha.slice(0, length);
  }
}
