import { Component } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import {
  AlertController,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonMenuButton,
  IonRouterLink,
  IonThumbnail,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { addIcons } from 'ionicons';
import {
  cartOutline,
  addOutline,
  removeOutline,
  trashOutline,
  bagCheckOutline,
} from 'ionicons/icons';

import { CartService } from '../../services/cart.service';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [
    RouterLink,
    IonRouterLink,
    CurrencyPipe,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonMenuButton,
    IonTitle,
    IonContent,
    IonThumbnail,
    IonButton,
    IonIcon,
  ],
  templateUrl: './cart.page.html',
  styleUrl: './cart.page.css',
})
export class CartPage {
  constructor(
    public cart: CartService,
    private alertController: AlertController
  ) {
    addIcons({
      cartOutline,
      addOutline,
      removeOutline,
      trashOutline,
      bagCheckOutline,
    });
  }

  async checkout(): Promise<void> {
    if (this.cart.items().length === 0) {
      return;
    }

    const alert = await this.alertController.create({
      header: 'Confirm Order',
      message: `Your total is ₱${this.cart.total().toFixed(2)}.`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Place Order',
          handler: () => {
            this.cart.clearCart();
          },
        },
      ],
    });

    await alert.present();
  }
}