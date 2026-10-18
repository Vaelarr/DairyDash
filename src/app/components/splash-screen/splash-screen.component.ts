import {
  Component,
  EventEmitter,
  OnInit,
  OnDestroy,
  Output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-splash-screen',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './splash-screen.component.html',
  styleUrl: './splash-screen.component.css',
})
export class SplashScreenComponent implements OnInit, OnDestroy {
  @Output() dismissed = new EventEmitter<void>();

  readonly isClosing = signal(false);

  private autoDismissTimer?: ReturnType<typeof setTimeout>;
  private exitTimer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    // Automatically trigger exit animation after a pleasant presentation duration
    this.autoDismissTimer = setTimeout(() => {
      this.dismiss();
    }, 2500);
  }

  dismiss(): void {
    if (this.isClosing()) return;
    this.isClosing.set(true);

    if (this.autoDismissTimer !== undefined) {
      clearTimeout(this.autoDismissTimer);
      this.autoDismissTimer = undefined;
    }

    // Allow the fade/scale exit animation to finish before notifying parent
    this.exitTimer = setTimeout(() => {
      this.dismissed.emit();
    }, 450);
  }

  ngOnDestroy(): void {
    if (this.autoDismissTimer !== undefined) {
      clearTimeout(this.autoDismissTimer);
    }
    if (this.exitTimer !== undefined) {
      clearTimeout(this.exitTimer);
    }
  }
}