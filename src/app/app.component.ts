import { Component, Injector, afterNextRender, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, take } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100vh;
      overflow: hidden;
    }
  `],
})
export class AppComponent {
  private readonly injector = inject(Injector);

  constructor() {
    inject(Router)
      .events.pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        take(1),
      )
      .subscribe(() => {
        afterNextRender(() => void this.revealWindow(), { injector: this.injector });
      });
  }

  private async revealWindow(): Promise<void> {
    if (!('__TAURI_INTERNALS__' in window)) {
      return;
    }

    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const appWindow = getCurrentWindow();

    if (await appWindow.isVisible()) {
      return;
    }

    await appWindow.show();
    await appWindow.setFocus();
  }
}
