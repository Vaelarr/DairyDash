import { CommonModule } from '@angular/common';
import { Component, Input, booleanAttribute } from '@angular/core';
import {
  IonBackButton,
  IonHeader,
  IonToolbar,
  IonButtons,
  IonMenuButton,
  IonTitle,
  IonContent,
} from '@ionic/angular';

@Component({
  selector: 'app-page-layout',
  templateUrl: './page-layout.component.html',
  styleUrls: ['./page-layout.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    IonBackButton,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonMenuButton,
    IonTitle,
    IonContent,
  ],
})
export class PageLayoutComponent {
  @Input() title: string = '';
  /** Big heading in the page body; defaults to `title` (which is also the toolbar text). */
  @Input() heading: string = '';
  @Input() eyebrow: string = '';
  @Input() description: string = '';
  /** Narrower, centered content column (for form pages). */
  @Input({ transform: booleanAttribute }) narrow = false;
  /** When set, the toolbar shows a back arrow to this route instead of the menu button. */
  @Input() backHref: string = '';
}
