import { Component, effect, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

const cache = new Map<string, string>();

@Component({
  selector: 'app-icon',
  standalone: true,
  template: ``,
  host: { '[innerHTML]': 'svg()' },
  styles: [`:host { display: inline-flex; align-items: center; justify-content: center; }`],
})
export class IconComponent {
  name = input.required<string>();

  private http      = inject(HttpClient);
  private sanitizer = inject(DomSanitizer);
  protected svg     = signal<SafeHtml>('');

  constructor() {
    effect(() => {
      const name = this.name();
      if (cache.has(name)) {
        this.svg.set(this.sanitizer.bypassSecurityTrustHtml(cache.get(name)!));
        return;
      }
      this.http.get(`assets/icons/${name}.svg`, { responseType: 'text' }).subscribe(content => {
        cache.set(name, content);
        this.svg.set(this.sanitizer.bypassSecurityTrustHtml(content));
      });
    });
  }
}
