import { Component } from '@angular/core';
import { IonSpinner } from '@ionic/angular';

@Component({
  selector: 'app-splash-screen',
  standalone: true,
  imports: [IonSpinner],
  templateUrl: './splash-screen.component.html',
  styleUrl: './splash-screen.component.css',
})
export class SplashScreenComponent {}