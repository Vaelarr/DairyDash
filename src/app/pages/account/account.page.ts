import { Component, inject, signal } from '@angular/core';
import { FormsModule, type NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PageLayoutComponent } from '../../components/page-layout/page-layout.component';
import { SupabaseService } from '../../supabase.service';

@Component({
  selector: 'app-account', standalone: true,
  imports: [FormsModule, RouterLink, PageLayoutComponent],
  templateUrl: './account.page.html', styleUrl: './account.page.css',
})
export class AccountPage {
  readonly auth = inject(SupabaseService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly busy = signal(false);
  readonly feedback = signal('');
  readonly adminRequired = this.route.snapshot.queryParamMap.get('adminRequired') === 'true';
  registering = false;
  name = '';
  email = '';
  password = '';

  async submit(form: NgForm): Promise<void> {
    form.form.markAllAsTouched();
    if (form.invalid || this.busy()) return;
    this.busy.set(true);
    this.feedback.set('');
    try {
      let signedIn = true;
      if (this.registering) signedIn = await this.auth.signUp(this.email, this.password, this.name);
      else await this.auth.signIn(this.email, this.password);
      this.password = '';
      if (!signedIn) {
        this.feedback.set('Check your email to confirm your account, then sign in.');
        this.registering = false;
        return;
      }
      const destination = this.route.snapshot.queryParamMap.get('returnUrl');
      if (destination?.startsWith('/') && !destination.startsWith('//')) await this.router.navigateByUrl(destination);
    } catch (error) {
      this.feedback.set(error instanceof Error ? error.message : 'Could not complete the account request. Try again.');
    } finally {
      this.busy.set(false);
    }
  }

  async signOut(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.feedback.set('');
    try { await this.auth.signOut(); }
    catch (error) { this.feedback.set(error instanceof Error ? error.message : 'Could not sign out. Try again.'); }
    finally { this.busy.set(false); }
  }
}
