import { Component, computed, inject } from '@angular/core';
import { SupabaseService } from '../../supabase.service';
import { accountErrorMessage } from '../../services/account-validation';

@Component({
  selector: 'app-email-confirmation', standalone: true,
  templateUrl: './email-confirmation.component.html',
  styleUrl: './email-confirmation.component.css',
})
export class EmailConfirmationComponent {
  readonly auth = inject(SupabaseService);
  readonly errorMessage = computed(() => this.auth.callbackError()
    ? accountErrorMessage(this.auth.callbackError())
    : 'The confirmation link could not be verified. Please request a new confirmation email.');

  returnToAccount(): void {
    this.auth.callbackError.set(null);
    this.auth.emailConfirmation.set('none');
  }
}
