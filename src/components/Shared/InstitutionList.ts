import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { CAMPUSONE_WEB_CONFIG } from '../../Config';
import type { InstitutionChoice } from '../../Context/SessionContext';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

/**
 * The institutions a person belongs to, one to open (client 2026-10-27: "someone associated with
 * several institutions is asked which institution to open when they sign in"): each with its logo
 * (else its initials), name and city. On the sign-in page and behind "Switch institution".
 */
@Component({
  selector: 'rp-inst-list',
  imports: [Avatar, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <div class="list" id="inst-list">
      @for (i of institutions(); track i.id) {
        <button
          type="button"
          class="li"
          [attr.data-inst]="i.id"
          [class.is-busy]="busy() === i.id"
          [disabled]="!!busy()"
          (click)="picked.emit(i)"
        >
          @if (i.logoUrl && !failed().includes(i.id)) {
            <img
              [src]="apiBase + i.logoUrl"
              [alt]="i.name + ' logo'"
              width="36"
              height="36"
              style="border-radius: 28%; object-fit: contain; background: #fff; flex: none"
              (error)="logoFailed(i.id)"
            />
          } @else {
            <rp-av [name]="i.name" [sq]="true" [px]="36" color="#0C6F7D" />
          }
          <span class="li-main"
            ><span class="li-t">{{ i.name }}</span
            ><span class="li-s">{{ i.city || i.shortName || '' }}</span></span
          >
          @if (i.id === current()) {
            <span class="chip dot tone-ok">Current</span>
          } @else {
            <rp-icon name="right" [size]="16" />
          }
        </button>
      }
    </div>
  `,
})
export class InstitutionList {
  readonly institutions = input<readonly InstitutionChoice[]>([]);
  /** The institution the session is at, if shown. */
  readonly current = input<string | null>(null);
  /** The one being opened. */
  readonly busy = input<string | null>(null);
  readonly picked = output<InstitutionChoice>();

  protected readonly apiBase = inject(CAMPUSONE_WEB_CONFIG, { optional: true })?.apiBaseUrl ?? '';
  /** Logos that didn't load show the initials instead. */
  protected readonly failed = signal<readonly string[]>([]);
  protected logoFailed(id: string) {
    this.failed.update((f) => [...f, id]);
  }
}
