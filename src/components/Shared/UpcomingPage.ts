import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { Card, Empty, PageHead } from './Blocks';
import { findItem, type StaffSurface } from '../Utils/navigation';
import type { IconName } from '../Utils/icons';

/** Pages reached from the top bar rather than the menu. */
const EXTRA: Record<string, { title: string; icon: IconName; phase: number; about: string }> = {
  search: {
    title: 'Search',
    icon: 'search',
    phase: 2,
    about: 'Search members and references across the institution.',
  },
  notifications: {
    title: 'Notifications',
    icon: 'bell',
    phase: 2,
    about: 'Approval requests and alerts addressed to you.',
  },
};

/**
 * A menu page whose module is built in a later increment or phase: the prototype's page head and an
 * empty state that says what the page is for and when it arrives. The server refuses its API until
 * then (deny by default), so nothing here pretends to work.
 */
@Component({
  selector: 'rp-upcoming-page',
  imports: [Card, Empty, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head [title]="page().title" [sub]="page().about" />
      <rp-card [title]="page().title" [icon]="page().icon">
        <rp-empty [icon]="page().icon" [title]="arrives()" [text]="page().about" />
      </rp-card>
    </div>
  `,
})
export class UpcomingPage {
  private readonly route = inject(ActivatedRoute);
  private readonly surface: StaffSurface =
    this.route.parent?.snapshot.data['surface'] === 'ops' ? 'ops' : 'console';
  private readonly segment = toSignal(this.route.paramMap.pipe(map((p) => p.get('page') ?? '')), {
    initialValue: '',
  });

  protected readonly page = computed(() => {
    const path = this.segment();
    const found = findItem(this.surface, path);
    if (found) {
      return {
        title: found.item.title,
        icon: found.item.icon,
        phase: found.item.phase,
        about: found.item.about,
      };
    }
    return (
      EXTRA[path] ?? { title: 'Page not found', icon: 'search' as IconName, phase: 0, about: '' }
    );
  });

  protected readonly arrives = computed(() => {
    const p = this.page().phase;
    if (p === 0) return 'This page does not exist';
    return p === 2 ? 'Arrives later in Phase 2' : `Arrives in Phase ${p}`;
  });
}
