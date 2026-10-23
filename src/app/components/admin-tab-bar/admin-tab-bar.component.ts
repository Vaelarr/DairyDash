import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { filter, map } from 'rxjs';
import { addIcons } from 'ionicons';
import { clipboardOutline, cubeOutline, gridOutline, settingsOutline } from 'ionicons/icons';
import { ADMIN_TABS, AdminTab, isPreviewAdminRoute } from './admin-tab-bar.config';

/**
 * Fixed bottom navigation for the admin area (Dashboard / Products / Orders / Settings).
 * Shown alongside the regular sidebar, not instead of it — it's a shortcut between the admin
 * pages, not the only way to get around, so the hamburger menu still reaches everything else.
 */
@Component({
  selector: 'app-admin-tab-bar',
  standalone: true,
  imports: [RouterLink, IonIcon],
  templateUrl: './admin-tab-bar.component.html',
  styleUrl: './admin-tab-bar.component.css',
})
export class AdminTabBarComponent {
  readonly tabs = ADMIN_TABS;

  private readonly router = inject(Router);

  /** The current URL, without query string or hash, kept in sync as the user navigates. */
  readonly currentPath = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects.split(/[?#]/)[0])
    ),
    { initialValue: this.router.url.split(/[?#]/)[0] }
  );

  constructor() {
    addIcons({
      'grid-outline': gridOutline,
      'cube-outline': cubeOutline,
      'clipboard-outline': clipboardOutline,
      'settings-outline': settingsOutline,
    });
  }

  isActive(match: (path: string) => boolean): boolean {
    return match(this.currentPath());
  }

  /** The preview build while previewing (if there is one), otherwise the real page. */
  hrefFor(tab: AdminTab): string {
    return isPreviewAdminRoute(this.currentPath()) && tab.previewUrl ? tab.previewUrl : tab.url;
  }
}
