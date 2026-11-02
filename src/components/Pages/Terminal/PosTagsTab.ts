/**
 * t.pos — the Operator tags tab (FR-MER-04; MER-011, MER-021, MER-022): one active tag per
 * operator mobile; a lost or damaged tag is re-issued with a reason and the old one stops at once.
 * The token for the new tag is shown once, to write onto the tag.
 */
import { ChangeDetectionStrategy, Component, inject, signal, type OnInit } from '@angular/core';
import { Icon } from '../../Shared/Icon';
import { Modal, Overlays } from '../../Shared/Overlays';
import { formatDate } from '../../Utils/format';
import { cleanTyped, onlyDigits } from '../../Utils/typing';
import { PosState, problemText } from './pos.state';
import { TerminalApi, type PosTag } from './terminal.api';
import { avColor, initialsOf } from './terminal.format';
import {
  cardReader,
  ensureCardReader,
  readerProblem,
  writeCardToken,
} from '../../Utils/card-reader';

@Component({
  selector: 'rp-pos-tags',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="tm-tags">
      <div class="note tone-info">
        <rp-icon name="key" [size]="17" />
        <div class="grow">
          Each counter operator signs in with their own NFC tag.
          <b>One active tag per operator mobile.</b> A lost or damaged tag is re-issued with a
          reason, and the old tag stops working at once.
          <span class="srs" title="SRS reference">FR-MER-04</span>
        </div>
      </div>
      <div class="tm-sec">
        <div class="tm-h"><rp-icon name="plus" [size]="14" /> Register a tag</div>
        <form class="tm-tagform" (submit)="$event.preventDefault(); register()">
          <div class="fld" [class.invalid]="!!nameErr()">
            <label class="fld-l" for="tm-tname">Operator name<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="tm-tname"
                autocomplete="off"
                placeholder="e.g. Lakshmi Gowda"
                [value]="name()"
                (input)="name.set(v($event)); nameErr.set('')"
              />
            </div>
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ nameErr() }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="!!mobErr()">
            <label class="fld-l" for="tm-tmob">Operator mobile<span class="req">*</span></label>
            <div class="fld-in">
              <span class="pre">+91</span
              ><input
                id="tm-tmob"
                inputmode="numeric"
                maxlength="10"
                autocomplete="off"
                placeholder="10-digit mobile"
                [value]="mobile()"
                (input)="mobile.set(digits($event)); mobErr.set('')"
              />
            </div>
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ mobErr() }}</span>
            </div>
          </div>
          <div class="tm-tagbtn">
            <button type="submit" class="btn btn-accent btn-block" [disabled]="busy()">
              <rp-icon name="nfc" [size]="17" /><span>Tap the new tag &amp; register</span>
            </button>
          </div>
        </form>
      </div>
      <div class="tm-sec">
        <div class="tm-h">
          <rp-icon name="key" [size]="14" /> Operator tags
          <span class="tm-h-r">{{ activeCount() }} active</span>
        </div>
        @for (t of tags(); track t.id) {
          <div class="tm-orow" [class.dim]="t.status !== 'ACTIVE'">
            <div class="tm-orow-m">
              <b
                >{{ t.operatorName }}
                @if (t.signedInNow) {
                  <span class="tm-chip tm-info">Signed in now</span>
                }
              </b>
              <small
                >tag {{ t.tag }} · mobile {{ t.mobile }} · issued {{ date(t.issuedAt)
                }}{{ t.reissueCount ? ' · re-issue #' + t.reissueCount : ''
                }}{{
                  t.status !== 'ACTIVE' && t.endedAt ? ' · replaced ' + date(t.endedAt) : ''
                }}</small
              >
            </div>
            <span class="tm-orow-s"
              ><span
                class="chip dot"
                [class]="t.status === 'ACTIVE' ? 'tone-ok' : 'tone-neutral'"
                >{{ t.status === 'ACTIVE' ? 'Active' : 'Inactive' }}</span
              ></span
            >
            <span class="tm-orow-a">
              @if (t.status === 'ACTIVE') {
                <button type="button" class="btn btn-sec btn-sm" (click)="reissue(t)">
                  <rp-icon name="refresh" [size]="15" /><span>Re-issue</span>
                </button>
              }
            </span>
          </div>
        } @empty {
          <div class="tm-empty">
            <rp-icon name="key" [size]="16" /><span
              >No operator tags yet. Register the first one above.</span
            >
          </div>
        }
      </div>
    </div>
    @if (issued(); as x) {
      <rp-modal
        title="Write the token to the tag"
        [sub]="x.tag.operatorName + ' · shown once'"
        icon="key"
        [dismiss]="false"
        (closed)="issued.set(null)"
      >
        @if (reader()) {
          <p class="t-sm">
            Hold the new tag on the reader and click <b>Write to tag</b>. The token is written and
            read back to check it. It won't be shown again.
          </p>
        } @else {
          <p class="t-sm">
            Hold the new tag on the tag writer. If it isn't written automatically, write this token
            to it. It won't be shown again.
          </p>
        }
        <div class="demo-hint" style="margin-top: 12px">
          <rp-icon name="key" [size]="14" /><span>Tag token</span>
          <b translate="no">{{ x.tagToken }}</b>
        </div>
        @if (writeNote(); as n) {
          <div class="note" [class]="'note tone-' + n.tone" style="margin-top: 12px" role="status">
            <rp-icon [name]="n.tone === 'ok' ? 'checkc' : 'alertc'" [size]="17" />
            <div class="grow">{{ n.text }}</div>
          </div>
        }
        <div modal-foot>
          @if (writeNote()?.tone !== 'ok') {
            <button
              type="button"
              class="btn btn-sec"
              id="tm-tag-write"
              [class.is-busy]="writing()"
              (click)="writeTag(x.tagToken)"
            >
              <rp-icon name="nfc" [size]="15" /><span>Write to tag</span>
            </button>
          }
          <button type="button" class="btn btn-accent" (click)="done()">
            <span>The tag is written</span>
          </button>
        </div>
      </rp-modal>
    }`,
})
export class PosTagsTab implements OnInit {
  private readonly s = inject(PosState);
  private readonly api = inject(TerminalApi);
  private readonly overlays = inject(Overlays);

  protected readonly tags = signal<readonly PosTag[]>([]);
  protected readonly name = signal('');
  protected readonly mobile = signal('');
  protected readonly nameErr = signal('');
  protected readonly mobErr = signal('');
  protected readonly busy = signal(false);
  protected readonly issued = signal<{ tag: PosTag; tagToken: string } | null>(null);
  /** CampusOne Card Reader is running on this computer (client 2026-10-08). */
  protected readonly reader = cardReader();
  protected readonly writing = signal(false);
  protected readonly writeNote = signal<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  protected async writeTag(token: string) {
    if (this.writing()) return;
    this.writing.set(true);
    this.writeNote.set(null);
    try {
      // The action opens CampusOne Card Reader when it isn't running (client 2026-10-08).
      if (!(await ensureCardReader())) {
        this.writeNote.set({
          tone: 'bad',
          text: "CampusOne Card Reader didn't start. Install it on this computer, or allow the browser to open it, then try again.",
        });
        return;
      }
      await writeCardToken(token);
      this.writeNote.set({
        tone: 'ok',
        text: 'Tag written and checked. The operator can sign in.',
      });
    } catch (e) {
      this.writeNote.set({ tone: 'bad', text: readerProblem(e) });
    } finally {
      this.writing.set(false);
    }
  }

  protected done() {
    this.issued.set(null);
    this.writeNote.set(null);
  }
  protected readonly avColor = avColor;
  protected readonly initialsOf = initialsOf;

  protected v(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  /** A mobile: digits only, in the box too (client 2026-10-14). */
  protected digits(e: Event) {
    return cleanTyped(e.target as HTMLInputElement, onlyDigits);
  }
  protected date(v: string | null) {
    return v ? formatDate(v) : '—';
  }
  protected activeCount() {
    return this.tags().filter((t) => t.status === 'ACTIVE').length;
  }

  async ngOnInit() {
    await this.reload();
  }

  private async reload() {
    try {
      this.tags.set((await this.api.tags()).items);
    } catch (e) {
      this.overlays.toast(problemText(e), { tone: 'bad' });
    }
  }

  protected async register() {
    const name = this.name().trim();
    const mobile = this.mobile().trim();
    const nameErr = !name
      ? "Enter the operator's name"
      : !/^[\p{L} .'-]+$/u.test(name)
        ? 'Use letters only'
        : name.length < 3 || name.length > 40
          ? 'Use 3–40 characters'
          : '';
    const mobErr = !mobile
      ? "Enter the operator's mobile"
      : !/^[6-9]\d{9}$/.test(mobile)
        ? 'Enter a valid 10-digit mobile number'
        : '';
    this.nameErr.set(nameErr);
    this.mobErr.set(mobErr);
    if (nameErr || mobErr) return;
    this.busy.set(true);
    try {
      const out = await this.api.registerTag(name, mobile);
      this.name.set('');
      this.mobile.set('');
      this.issued.set(out);
      this.overlays.toast(`Tag registered for ${out.tag.operatorName}`, {
        sub: `tag ${out.tag.tag}`,
      });
      await this.reload();
      await this.s.load();
    } catch (e) {
      this.mobErr.set(problemText(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async reissue(t: PosTag) {
    const ok = await this.overlays.confirm({
      title: `Re-issue ${t.operatorName}'s tag?`,
      text: `Tag ${t.tag} stops working immediately. Tap the replacement tag on the reader after confirming.`,
      ok: 'Re-issue tag',
      tone: 'warn',
      icon: 'key',
      reason: {
        label: 'Reason for re-issue',
        placeholder: 'e.g. Tag lost, damaged or stolen',
        min: 3,
        max: 200,
      },
    });
    if (!ok) return;
    try {
      const out = await this.api.reissueTag(t.id, ok.reason ?? '');
      this.issued.set(out);
      this.overlays.toast(`New tag issued to ${t.operatorName}`, {
        sub: `re-issue #${out.tag.reissueCount}`,
      });
      await this.reload();
    } catch (e) {
      this.overlays.toast(problemText(e), { tone: 'bad' });
    }
  }
}
