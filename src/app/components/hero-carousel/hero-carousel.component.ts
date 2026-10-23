import { Component, Input, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface HeroSlide {
  tag: string;
  title: string;
  subtitle: string;
  photo?: string;
}

@Component({
  selector: 'app-hero-carousel',
  templateUrl: './hero-carousel.component.html',
  styleUrls: ['./hero-carousel.component.css'],
  standalone: true,
  imports: [CommonModule],
})
export class HeroCarouselComponent implements OnInit, OnDestroy {
  @Input() slides: HeroSlide[] = [];
  @Input() intervalMs: number = 5000;

  // A signal so the view updates when the timer changes it (the app is zoneless).
  activeIndex = signal(0);
  readonly paused = signal(false);
  private motionQuery?: MediaQueryList;
  private readonly motionChanged = (event: MediaQueryListEvent) => {
    if (event.matches) { this.paused.set(true); this.stopTimer(); }
  };
  private timer: ReturnType<typeof setInterval> | null = null;
  private touchStartX: number | null = null;

  ngOnInit() {
    this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.paused.set(this.motionQuery.matches);
    this.motionQuery.addEventListener('change', this.motionChanged);
    this.startTimer();
  }

  ngOnDestroy() {
    this.stopTimer();
    this.motionQuery?.removeEventListener('change', this.motionChanged);
  }

  goTo(index: number) {
    if (!this.slides.length) return;
    this.activeIndex.set((index + this.slides.length) % this.slides.length);
    this.paused.set(true);
    this.stopTimer();
  }

  togglePlayback(): void {
    this.paused.update((paused) => !paused);
    this.startTimer();
  }

  handleTouchStart(e: TouchEvent) {
    this.touchStartX = e.touches[0].clientX;
  }

  handleTouchEnd(e: TouchEvent) {
    if (this.touchStartX === null) return;
    const deltaX = e.changedTouches[0].clientX - this.touchStartX;
    if (deltaX > 50) {
      this.goTo(this.activeIndex() - 1);
    } else if (deltaX < -50) {
      this.goTo(this.activeIndex() + 1);
    }
    this.touchStartX = null;
  }

  private startTimer() {
    this.stopTimer();
    if (this.slides.length > 1 && !this.paused()) {
      this.timer = setInterval(() => {
        this.activeIndex.update((i) => (i + 1) % this.slides.length);
      }, this.intervalMs);
    }
  }

  private stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
