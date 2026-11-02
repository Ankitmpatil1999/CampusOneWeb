/**
 * A merchant's static QR codes on the web (client 2026-10-13; PAY-008, PAY-030, PAY-013): each code
 * the school issued — for payments, allowances or coupons — shown to scan, its printable card as a
 * PDF, and its details e-mailed to the merchant's address or another one.
 */
import {
  ChangeDetectionStrategy,
  Component,
  type OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { SessionContext } from '../../../../Context/SessionContext';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { formatDate } from '../../../Utils/format';
import { PATTERNS } from '../../../Utils/patterns';
import { problemText } from '../Structure/academic-format';
import { BusinessApi, QR_KIND, saveBlob, type QrCode } from './business.api';


@Component({
  selector: 'rp-business-qr',
  imports: [Empty, Icon, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="c-page">
    <rp-page-head
      title="My QR codes"
      sub="Payers scan these with the CampusOne app and enter the amount. Print the card for your counter."
    />

    @if (error()) {
      <div class="note tone-bad" role="alert" id="bq-error">
        <rp-icon name="alert" [size]="17" />
        <div class="grow">{{ error() }}</div>
        <button type="button" class="btn btn-sec btn-sm" (click)="load()">Try again</button>
      </div>
    } @else if (!items()) {
      <div class="card pad"><div class="sk" style="height: 260px; border-radius: 16px"></div></div>
    } @else if (!items()!.length) {
      <rp-empty
        icon="qr"
        title="No QR codes yet"
        text="The school office issues your QR codes. They appear here once issued."
      />
    } @else {
      <div class="c-grid k3" id="bq-list">
        @for (q of items(); track q.id; let i = $index) {
          <div class="card pad stack g12" [id]="'bq-' + i" style="align-items: center">
            <div class="row between" style="width: 100%">
              <b>{{ kindLabel(q.kind) }}</b>
              <span
                class="chip dot"
                [class]="'chip dot tone-' + (q.status === 'ACTIVE' ? 'ok' : 'neutral')"
                >{{ q.status === 'ACTIVE' ? 'Active' : 'Inactive' }}</span
              >
            </div>
            <div class="qr" [innerHTML]="svg(q)"></div>
            @if (q.statusReason && q.status !== 'ACTIVE') {
              <div class="t-sm t-muted">{{ q.statusReason }}</div>
            }
            <div class="t-xs t-muted">Issued {{ formatDate(q.createdAt) }}</div>
            <div class="row g8 wrap" style="justify-content: center">
              <button
                type="button"
                class="btn btn-sec btn-sm"
                [id]="'bq-card-' + i"
                [class.is-busy]="busy() === q.id + ':card'"
                [disabled]="!!busy()"
                (click)="card(q)"
              >
                <rp-icon name="download" [size]="15" /><span>QR card (PDF)</span>
              </button>
              @if (canEmail()) {
                <button
                  type="button"
                  class="btn btn-sec btn-sm"
                  [id]="'bq-mail-' + i"
                  [class.is-busy]="busy() === q.id + ':mail'"
                  [disabled]="!!busy()"
                  (click)="email(q)"
                >
                  <rp-icon name="mail" [size]="15" /><span>E-mail</span>
                </button>
              }
            </div>
          </div>
        }
      </div>
    }
  </div>`,
})
export class BusinessQr implements OnInit {
  private readonly api = inject(BusinessApi);
  private readonly overlays = inject(Overlays);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly session = inject(SessionContext).console;
  protected readonly formatDate = formatDate;
  protected readonly items = signal<readonly QrCode[] | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal('');
  protected readonly canEmail = computed(
    () => this.session()?.subTasks.includes('business.collect') ?? false,
  );
  private readonly drawn = new Map<string, SafeHtml>();

  ngOnInit() {
    void this.load();
  }

  async load() {
    try {
      this.items.set((await this.api.qrCodes()).items);
      this.error.set('');
    } catch (e) {
      this.error.set(problemText(e));
    }
  }

  protected kindLabel(k: string) {
    return QR_KIND[k] ?? k;
  }

  /** Our own API draws the code (trusted markup); shown 168 px square. */
  protected svg(q: QrCode) {
    let s = this.drawn.get(q.id);
    if (!s) {
      s = this.sanitizer.bypassSecurityTrustHtml(
        q.svg.replace(
          /^\s*<svg\b/,
          `<svg width="168" height="168" role="img" aria-label="${this.kindLabel(q.kind)} QR code"`,
        ),
      );
      this.drawn.set(q.id, s);
    }
    return s;
  }

  protected async card(q: QrCode) {
    this.busy.set(`${q.id}:card`);
    try {
      saveBlob(await this.api.qrCard(q.id), `campusone-qr-${q.kind.toLowerCase()}.pdf`);
    } catch (e) {
      this.overlays.toast("Couldn't download the QR card", { sub: problemText(e), tone: 'bad' });
    } finally {
      this.busy.set('');
    }
  }

  /** PAY-013: to the merchant's e-mail, or another address given here. */
  protected async email(q: QrCode) {
    const ok = await this.overlays.confirm({
      title: 'E-mail this QR code?',
      text: 'Its details and the printable card go to your e-mail address, or to another address you enter.',
      ok: 'Send',
      icon: 'mail',
      reason: {
        label: 'Another e-mail address (optional)',
        placeholder: 'name@example.com',
        max: 254,
        required: false,
      },
    });
    if (!ok) return;
    const to = (ok.reason ?? '').trim();
    // The platform's one e-mail rule (client 2026-10-15).
    if (to && !PATTERNS.email.test(to.toLowerCase())) {
      this.overlays.toast('That e-mail address doesn’t look right', { sub: to, tone: 'bad' });
      return;
    }
    this.busy.set(`${q.id}:mail`);
    try {
      const r = await this.api.emailQr(q.id, to || null);
      this.overlays.toast('QR code e-mailed', { sub: r?.sentTo ?? to });
    } catch (e) {
      this.overlays.toast("Couldn't e-mail the QR code", { sub: problemText(e), tone: 'bad' });
    } finally {
      this.busy.set('');
    }
  }
}
