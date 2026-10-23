import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule, type NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  personOutline,
  mailOutline,
  lockClosedOutline,
  eyeOutline,
  eyeOffOutline,
  receiptOutline,
  heartOutline,
  cartOutline,
  gridOutline,
  cubeOutline,
  clipboardOutline,
  chatbubbleEllipsesOutline,
  informationCircleOutline,
  timeOutline,
  logOutOutline,
  chevronForwardOutline,
  shieldCheckmarkOutline,
  checkmarkCircle,
  time,
  sparkles,
  arrowBackOutline,
  calendarOutline,
} from 'ionicons/icons';
import { PageLayoutComponent } from '../../components/page-layout/page-layout.component';
import { EmailConfirmationComponent } from '../../components/email-confirmation/email-confirmation.component';
import { SupabaseService } from '../../supabase.service';
import { Account } from '../../models/account';
import { AccountService } from '../../services/account.service';
import { CartService } from '../../services/cart.service';
import { OrderService } from '../../services/order.service';
import { WishlistService } from '../../services/wishlist.service';
import { apiErrorMessage } from '../../services/product.service';
import {
  AccountValidationError,
  accountErrorMessage,
  normalizeEmail,
  safeAccountReturnUrl,
  validateAccount,
  type AccountErrors,
  type AccountField,
  type AccountMode,
} from '../../services/account-validation';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    FormsModule,
    RouterLink,
    IonIcon,
    PageLayoutComponent,
    EmailConfirmationComponent,
  ],
  templateUrl: './account.page.html',
  styleUrl: './account.page.css',
})
export class AccountPage {
  readonly auth = inject(SupabaseService);
  readonly cart = inject(CartService);
  private readonly accounts = inject(AccountService);
  private readonly orderService = inject(OrderService);
  private readonly wishlistService = inject(WishlistService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly selectedMode = signal<AccountMode>('signin');
  readonly mode = computed(() => (this.auth.recoveringPassword() ? 'reset' : this.selectedMode()));
  readonly busy = signal(false);
  readonly feedback = signal('');
  readonly error = signal('');
  readonly errors = signal<AccountErrors>({});
  readonly account = signal<Account | null>(null);
  readonly accountLoading = signal(false);
  readonly accountError = signal('');
  readonly emailCooldown = signal(0);
  readonly callbackMessage = computed(() =>
    this.auth.callbackError() ? accountErrorMessage(this.auth.callbackError()) : ''
  );
  readonly adminRequired = this.route.snapshot.queryParamMap.get('adminRequired') === 'true';

  readonly orderCount = signal<number>(0);
  readonly wishlistCount = signal<number>(0);

  readonly userInitials = computed(() => {
    const name = this.account()?.displayName || this.auth.user()?.user_metadata?.['display_name'];
    if (name?.trim()) {
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return parts[0].slice(0, 2).toUpperCase();
    }
    const email = this.account()?.email || this.auth.user()?.email || '';
    return email ? email.slice(0, 2).toUpperCase() : 'DD';
  });

  name = '';
  email = '';
  password = '';
  confirmPassword = '';
  showPassword = false;
  capsLock = false;
  private active = false;
  private currentUserId: string | undefined;
  private revision = 0;
  private accountRequest: { userId: string; promise: Promise<Account | null> } | null = null;
  private cooldownTimer?: ReturnType<typeof setInterval>;

  constructor() {
    addIcons({
      'person-outline': personOutline,
      'mail-outline': mailOutline,
      'lock-closed-outline': lockClosedOutline,
      'eye-outline': eyeOutline,
      'eye-off-outline': eyeOffOutline,
      'receipt-outline': receiptOutline,
      'heart-outline': heartOutline,
      'cart-outline': cartOutline,
      'grid-outline': gridOutline,
      'cube-outline': cubeOutline,
      'clipboard-outline': clipboardOutline,
      'chatbubble-ellipses-outline': chatbubbleEllipsesOutline,
      'information-circle-outline': informationCircleOutline,
      'time-outline': timeOutline,
      'log-out-outline': logOutOutline,
      'chevron-forward-outline': chevronForwardOutline,
      'shield-checkmark-outline': shieldCheckmarkOutline,
      'checkmark-circle': checkmarkCircle,
      'time': time,
      'sparkles': sparkles,
      'arrow-back-outline': arrowBackOutline,
      'calendar-outline': calendarOutline,
    });

    effect(() => {
      const userId = this.auth.user()?.id;
      if (userId !== this.currentUserId) {
        this.currentUserId = userId;
        this.revision++;
        this.account.set(null);
        this.accountError.set('');
        this.accountRequest = null;
      }
      if (this.active && userId && this.auth.emailConfirmation() === 'none') {
        void this.loadAccount();
        void this.loadStats();
      }
    });
  }

  ionViewWillEnter(): void {
    this.active = true;
    void this.loadAccount();
    void this.loadStats();
  }

  ionViewDidLeave(): void {
    this.active = false;
    this.revision++;
    this.accountRequest = null;
    this.accountLoading.set(false);
    this.clearPasswords();
  }

  ngOnDestroy(): void {
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
  }

  private clearPasswords(): void {
    this.password = '';
    this.confirmPassword = '';
    this.showPassword = false;
    this.capsLock = false;
  }

  switchMode(mode: AccountMode): void {
    if (this.busy()) return;
    this.selectedMode.set(mode);
    this.clearPasswords();
    this.errors.set({});
    this.error.set('');
    this.feedback.set('');
  }

  validateField(field: AccountField): void {
    const errors = { ...this.errors() };
    delete errors[field];
    const message = validateAccount(this.mode(), this)[field];
    if (message) errors[field] = message;
    this.errors.set(errors);
  }

  checkCapsLock(event: KeyboardEvent): void {
    this.capsLock = event.getModifierState('CapsLock');
  }

  async loadAccount(): Promise<Account | null> {
    await this.auth.ready;
    if (this.auth.emailConfirmation() !== 'none') return null;
    const userId = this.auth.user()?.id;
    if (!userId || !this.active) return null;
    if (this.accountRequest?.userId === userId) return this.accountRequest.promise;
    const revision = this.revision;
    this.accountLoading.set(true);
    this.accountError.set('');
    const promise = this.accounts
      .get()
      .then((account) => {
        if (account.id !== userId) throw new Error('Account identity changed.');
        if (this.active && revision === this.revision && this.auth.user()?.id === userId) {
          this.account.set(account);
        }
        return account;
      })
      .catch((error: unknown) => {
        if (this.auth.isAdmin() && userId === '00000000-0000-0000-0000-000000000001') {
          const fallbackAdmin = {
            id: userId,
            email: 'admin@dairydash.com',
            displayName: 'DairyDash Admin',
            emailVerified: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            isAdmin: true,
          };
          if (this.active && revision === this.revision && this.auth.user()?.id === userId) {
            this.account.set(fallbackAdmin);
          }
          return fallbackAdmin;
        }
        if (this.active && revision === this.revision && this.auth.user()?.id === userId) {
          this.account.set(null);
          this.accountError.set(apiErrorMessage(error));
        }
        return null;
      })
      .finally(() => {
        if (this.accountRequest?.promise === promise) this.accountRequest = null;
        if (revision === this.revision) this.accountLoading.set(false);
      });
    this.accountRequest = { userId, promise };
    return promise;
  }

  async loadStats(): Promise<void> {
    if (!this.auth.user() || !this.active) return;
    try {
      const orders = await this.orderService.list().catch(() => []);
      if (this.active) this.orderCount.set(orders.length);
    } catch {}
    try {
      const wishlist = await this.wishlistService.list().catch(() => []);
      if (this.active) this.wishlistCount.set(wishlist.length);
    } catch {}
  }

  private startEmailCooldown(): void {
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
    this.emailCooldown.set(60);
    this.cooldownTimer = setInterval(() => {
      this.emailCooldown.update((seconds) => Math.max(0, seconds - 1));
      if (!this.emailCooldown() && this.cooldownTimer) clearInterval(this.cooldownTimer);
    }, 1000);
  }

  async submit(form: NgForm): Promise<void> {
    if (this.busy()) return;
    const mode = this.mode();
    if (mode === 'forgot' && this.emailCooldown()) return;
    form.form.markAllAsTouched();
    const errors = validateAccount(mode, this);
    this.errors.set(errors);
    this.error.set('');
    this.feedback.set('');
    if (Object.keys(errors).length) return;
    this.email = normalizeEmail(this.email);
    this.busy.set(true);
    try {
      if (mode === 'forgot') {
        await this.auth.requestPasswordReset(this.email);
        this.startEmailCooldown();
        this.feedback.set(
          'If an account exists for this email, a password reset link will arrive shortly. Check your inbox and spam folder.'
        );
        return;
      }
      if (mode === 'reset') {
        await this.auth.updatePassword(this.password);
        this.clearPasswords();
        this.selectedMode.set('signin');
        await this.router.navigate(['/account'], {
          queryParams: { action: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
        this.feedback.set(
          'Your password has been updated. Use the new password the next time you sign in.'
        );
        await this.loadAccount();
        return;
      }
      let signedIn = true;
      if (mode === 'signup') {
        signedIn = await this.auth.signUp(this.email, this.password, this.name);
      } else {
        await this.auth.signIn(this.email, this.password);
      }
      this.clearPasswords();
      if (!signedIn) {
        this.selectedMode.set('signin');
        this.errors.set({});
        this.startEmailCooldown();
        this.feedback.set(
          'Check your inbox and spam folder for a confirmation email. Confirm your address, then sign in. If you already have an account, sign in or reset your password.'
        );
        return;
      }
      const account = await this.loadAccount();
      void this.loadStats();
      if (!account || account.id !== this.auth.user()?.id) return;
      this.feedback.set(
        mode === 'signup' ? 'Your account has been created.' : 'You are signed in.'
      );
      const destination =
        safeAccountReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')) ||
        (this.auth.isAdmin() ? '/admin-dashboard' : null);
      if (destination) await this.router.navigateByUrl(destination);
    } catch (error) {
      if (error instanceof AccountValidationError) this.errors.set(error.fields);
      this.error.set(accountErrorMessage(error));
    } finally {
      if (mode !== 'forgot') this.clearPasswords();
      this.busy.set(false);
    }
  }

  async resendConfirmation(): Promise<void> {
    if (this.busy() || this.emailCooldown()) return;
    const errors = validateAccount('forgot', this);
    this.errors.set(errors);
    this.error.set('');
    this.feedback.set('');
    if (Object.keys(errors).length) return;
    this.email = normalizeEmail(this.email);
    this.busy.set(true);
    try {
      await this.auth.resendConfirmation(this.email);
      this.startEmailCooldown();
      this.feedback.set(
        'If this email has an account awaiting confirmation, a new confirmation link will arrive shortly. Check your inbox and spam folder.'
      );
    } catch (error) {
      this.error.set(accountErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  async signOut(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.feedback.set('');
    try {
      await this.auth.signOut();
      this.account.set(null);
      this.orderCount.set(0);
      this.wishlistCount.set(0);
      this.clearPasswords();
      this.errors.set({});
      this.selectedMode.set('signin');
      await this.router.navigate(['/account'], {
        queryParams: { action: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
      this.feedback.set('You have been signed out.');
    } catch (error) {
      this.error.set(accountErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
