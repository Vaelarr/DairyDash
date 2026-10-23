import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProductService } from '../../services/product.service';

@Component({
  selector: 'app-catalog-status',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './catalog-status.component.html',
  styleUrl: './catalog-status.component.css',
})
export class CatalogStatusComponent {
  readonly service = inject(ProductService);
}
