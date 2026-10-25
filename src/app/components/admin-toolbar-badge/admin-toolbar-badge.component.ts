import { Component, inject } from '@angular/core';
import { IonIcon, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { notificationsOutline, shieldCheckmarkOutline } from 'ionicons/icons';

/**
 * The "ADMIN" pill + notification bell shown in every admin page's toolbar. Project it into
 * `app-page-layout` with `<app-admin-toolbar-badge toolbar-end>`.
 */
@Component({
  selector: 'app-admin-toolbar-badge',
  standalone: true,
  imports: [IonIcon],
  templateUrl: './admin-toolbar-badge.component.html',
  styleUrl: './admin-toolbar-badge.component.css',
})
export class AdminToolbarBadgeComponent {
  private readonly toastCtrl = inject(ToastController);

  constructor() {
    addIcons({
      'notifications-outline': notificationsOutline,
      'shield-checkmark-outline': shieldCheckmarkOutline,
    });
  }

  async onBellClick(): Promise<void> {
    const toast = await this.toastCtrl.create({
      message: 'No new notifications.',
      duration: 2000,
      position: 'bottom',
    });
    await toast.present();
  }
}

