import { Component, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonMenuButton,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { addIcons } from 'ionicons';
import {
  callOutline,
  locationOutline,
  mailOutline,
  paperPlaneOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-contact-us',
  standalone: true,
  templateUrl: './contact-us.page.html',
  styleUrls: ['./contact-us.page.css'],
  imports: [
    FormsModule,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonMenuButton,
    IonTextarea,
    IonTitle,
    IonToolbar,
  ],
})
export class ContactUsPage {
  // Add your group's actual contact details inside these quotes.
  readonly business = {
    email: '',
    phone: '',
    address: '',
  };

  readonly feedback = signal('');

  message = {
    name: '',
    email: '',
    subject: '',
    body: '',
  };

  get phoneLink(): string {
    return 'tel:' + this.business.phone.replace(/[^\d+]/g, '');
  }

  constructor() {
    addIcons({
      'call-outline': callOutline,
      'location-outline': locationOutline,
      'mail-outline': mailOutline,
      'paper-plane-outline': paperPlaneOutline,
    });
  }

  openEmail(form: NgForm): void {
    this.feedback.set('');
    form.form.markAllAsTouched();

    const hasEmptyField = Object.values(this.message).some(
      (value) => !value.trim()
    );

    if (form.invalid || hasEmptyField) {
      this.feedback.set(
        'Please complete all fields and enter a valid email address.'
      );
      return;
    }

    const recipient = this.business.email.trim();

    if (!recipient) {
      this.feedback.set('The support email has not been configured yet.');
      return;
    }

    const subject = encodeURIComponent(
      `Dairy Dash: ${this.message.subject.trim()}`
    );

    const body = encodeURIComponent(
      [
        `Name: ${this.message.name.trim()}`,
        `Reply email: ${this.message.email.trim()}`,
        '',
        this.message.body.trim(),
      ].join('\r\n')
    );

    this.feedback.set(
      'Review and send your message in your email app. If nothing opens, check that an email app is configured.'
    );

    window.location.href =
      `mailto:${recipient}?subject=${subject}&body=${body}`;
  }
}