import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonIcon, NavController, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { image } from 'ionicons/icons';
import { PageLayoutComponent } from '../../components/page-layout/page-layout.component';
import { Product } from '../../models/product';
import { PRODUCT_CATEGORIES, ProductService, priceValue } from '../../services/product.service';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_SIDE = 800;

/**
 * Downscales the picked image and re-encodes it as a JPEG data URL. A photo straight from a
 * phone camera would otherwise blow past the browser's storage limit (~5 MB) on its own.
 */
async function toStorableDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  ctx.fillStyle = '#ffffff'; // JPEG has no transparency
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}

/** One form for both routes: `/add-product` and `/edit-product/:id`. */
@Component({
  selector: 'app-product-form',
  templateUrl: './product-form.page.html',
  styleUrls: ['./product-form.page.css'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IonIcon, PageLayoutComponent],
})
export class ProductFormPage {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  // navigateBack (unlike router.navigateByUrl) pops this page off Ionic's stack instead of piling
  // another Products page on top, so the hardware/browser back button doesn't return to the form.
  private readonly nav = inject(NavController);
  private readonly toastCtrl = inject(ToastController);
  private readonly productService = inject(ProductService);

  private readonly productId = inject(ActivatedRoute).snapshot.paramMap.get('id');
  readonly isEdit = this.productId !== null;

  readonly categories = PRODUCT_CATEGORIES;

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(60)]],
    category: ['', Validators.required],
    price: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]),
    stock: this.fb.control<number | null>(null, Validators.pattern(/^\d+$/)),
    description: ['', Validators.maxLength(200)],
  });

  /** The product being edited, as it was when the page opened. */
  readonly original = signal<Product | null>(null);
  readonly description = computed(() =>
    this.isEdit
      ? `Update the information for ${this.original()?.name ?? 'this product'}.`
      : 'Enter the product details below.'
  );

  readonly imagePreview = signal<string | null>(null);
  readonly imageError = signal('');
  readonly imageBusy = signal(false);
  readonly dragging = signal(false);
  readonly saveError = signal('');

  constructor() {
    addIcons({ image });
    this.load();
  }

  /** Ionic keeps visited pages alive, so start from a clean form every time this one is shown. */
  ionViewWillEnter() {
    this.load();
  }

  showError(field: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[field];
    return control.invalid && (control.touched || control.dirty);
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // lets the same file be picked again after removing it
    if (file) this.setImage(file);
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.dragging.set(true);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.setImage(file);
  }

  removeImage() {
    this.imagePreview.set(null);
    this.imageError.set('');
  }

  async onSubmit() {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.imageBusy()) return;

    const value = this.form.getRawValue();
    const input = {
      name: value.name ?? '',
      category: value.category ?? '',
      price: value.price ?? 0,
      // A new product starts at 0; an existing one that never had a stock figure keeps having none.
      stock: value.stock ?? (this.isEdit ? undefined : 0),
      description: value.description ?? '',
      photo: this.imagePreview() ?? undefined,
    };

    const saved = this.isEdit
      ? this.productService.update(this.productId!, input)
      : this.productService.add(input);

    if (!saved) {
      this.saveError.set(
        "Couldn't save the product because the browser's storage is full. Try a smaller image or none at all."
      );
      return;
    }

    await this.nav.navigateBack('/manage-products', { replaceUrl: true });
    const toast = await this.toastCtrl.create({
      message: `"${input.name.trim()}" was ${this.isEdit ? 'updated' : 'added to your products'}.`,
      duration: 2500,
      position: 'bottom',
    });
    await toast.present();
  }

  cancel() {
    this.nav.navigateBack('/manage-products', { replaceUrl: true });
  }

  private load() {
    this.saveError.set('');
    this.imageError.set('');
    this.dragging.set(false);

    if (!this.isEdit) {
      this.form.reset({ name: '', category: '', price: null, stock: null, description: '' });
      this.imagePreview.set(null);
      return;
    }

    const product = this.productService.getById(this.productId!);
    if (!product) {
      this.router.navigateByUrl('/manage-products', { replaceUrl: true });
      return;
    }

    this.original.set(product);
    this.form.reset({
      name: product.name,
      category: product.category ?? '',
      price: priceValue(product),
      stock: product.stock ?? null,
      description: product.description,
    });
    // Built-in products have no category yet; don't block editing them on it.
    const category = this.form.controls.category;
    category.setValidators(product.category ? Validators.required : null);
    category.updateValueAndValidity();
    this.imagePreview.set(product.photo ?? null);
  }

  private async setImage(file: File) {
    this.imageError.set('');
    if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
      this.imageError.set('Please choose a PNG or JPG image.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      this.imageError.set('That image is larger than 5 MB.');
      return;
    }
    this.imageBusy.set(true);
    try {
      this.imagePreview.set(await toStorableDataUrl(file));
    } catch {
      this.imageError.set("Couldn't read that image. Try a different file.");
    } finally {
      this.imageBusy.set(false);
    }
  }
}
