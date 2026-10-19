import { Component } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { notificationsOutline, shieldCheckmarkOutline } from 'ionicons/icons';

/**
 * The "ADMIN" pill + notification bell shown in every admin page's toolbar. Project it into
 * `app-page-layout` with `<app-admin-toolbar-badge toolbar-end>`.
 * The bell isn't wired to anything yet — there's no notifications feature behind it.
 */
@Component({
  selector: 'app-admin-toolbar-badge',
  standalone: true,
  imports: [IonIcon],
  templateUrl: './admin-toolbar-badge.component.html',
  styleUrl: './admin-toolbar-badge.component.css',
})
export class AdminToolbarBadgeComponent {
  constructor() {
    addIcons({
      'notifications-outline': notificationsOutline,
      'shield-checkmark-outline': shieldCheckmarkOutline,
    });
  }
}
