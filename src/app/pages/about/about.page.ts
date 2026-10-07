import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular';
import { PageLayoutComponent } from '../../components/page-layout/page-layout.component';

@Component({
  selector: 'app-about',
  templateUrl: './about.page.html',
  styleUrls: ['./about.page.css'],
  standalone: true,
  imports: [CommonModule, IonIcon, PageLayoutComponent],
})
export class AboutPage {
  productPhoto = 'assets/Products/Miruku Suyu.webp';
}
