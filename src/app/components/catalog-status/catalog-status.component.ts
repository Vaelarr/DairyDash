import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProductService } from '../../services/product.service';

@Component({
  selector: 'app-catalog-status',
  standalone: true,
  imports: [CommonModule],
  template: `
    <p class="api-status" *ngIf="service.loading()" role="status">Loading products…</p>
    <div class="api-status api-status-error" *ngIf="service.error()" role="alert">
      <p>{{ service.error() }}</p>
      <button type="button" (click)="service.refresh()" [disabled]="service.loading()">Try again</button>
    </div>
  `,
})
export class CatalogStatusComponent {
  readonly service = inject(ProductService);
}
