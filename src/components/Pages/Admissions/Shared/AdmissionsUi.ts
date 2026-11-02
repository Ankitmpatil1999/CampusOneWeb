/**
 * The building blocks of the public admission pages, emitting the prototype's markup (01_ui.js) so
 * the ported stylesheet applies unchanged: the field (ui.field / ui.select wrapper), the file picker
 * with the 2 MB ceiling and a camera (ui.upload, CR-07; client 2026-10-12), the radio card (ui.choice), the segmented control
 * (ui.seg), the timeline (ui.timeline), the result mark (.res-mark), the checkout QR (ui.qr) and the
 * page skeleton (ui.skel 'detail').
 */
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { Mark } from '../../../Shared/Mark';
import type { IconName } from '../../../Utils/icons';
import { fileSize } from '../admissions.store';
import { PaCamera, nativeCamera, shrinkPhoto } from './CameraCapture';

/** ui.field: label, the control (projected; inside `.fld-in` unless `bare`), the error and a hint. */
@Component({
  selector: 'rp-pa-fld',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="fld" [class]="cls()" [class.invalid]="!!error()">
    @if (label()) {
      @if (labelFor() === null) {
        <span class="fld-l"
          >{{ label() }}
          @if (req()) {
            <span class="req">*</span>
          }
          @if (opt()) {
            <span class="opt">(optional)</span>
          }
        </span>
      } @else {
        <label class="fld-l" [for]="labelFor() || fid()"
          >{{ label() }}
          @if (req()) {
            <span class="req">*</span>
          }
          @if (opt()) {
            <span class="opt">(optional)</span>
          }
        </label>
      }
    }
    <div [class.fld-in]="!bare()" [style.display]="bare() ? 'contents' : null">
      <ng-content />
    </div>
    <div class="fld-e" [id]="fid() + '-e'" role="alert">
      <rp-icon name="alertc" [size]="14" /><span>{{ error() }}</span>
    </div>
    @if (hint()) {
      <div class="fld-h">{{ hint() }}</div>
    }
  </div>`,
})
export class PaField {
  readonly fid = input.required<string>();
  readonly label = input('');
  /** The id the label points at ('' = the field id; null = a plain span, e.g. a group). */
  readonly labelFor = input<string | null>('');
  readonly req = input(false);
  readonly opt = input(false);
  readonly error = input<string | null | undefined>('');
  readonly hint = input('');
  /** The control is not wrapped in `.fld-in` (a dropdown, an upload, a group of choices). */
  readonly bare = input(false);
  readonly cls = input('');
}

export interface PickedFile {
  readonly name: string;
  readonly size: number;
}

/** ui.upload: the dashed picker; a chosen file turns it green (`.upl.done`). */
@Component({
  selector: 'rp-pa-upl',
  imports: [Icon, PaCamera],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="fld" [class.invalid]="!!error()" [attr.data-upload]="fid()">
      @if (label()) {
        <span class="fld-l"
          >{{ label() }}
          @if (req()) {
            <span class="req">*</span>
          }
          @if (opt()) {
            <span class="opt">(optional)</span>
          }
        </span>
      }
      <label class="upl" [class.done]="!!file() && progress() === null" [for]="fid()"
        ><span class="upl-ic"
          ><rp-icon [name]="file() && progress() === null ? 'checkc' : icon()" [size]="20" /></span
        ><span class="grow" style="min-width: 0"
          ><span class="t-h4 t-clip" style="display: block">{{ file()?.name ?? cta() }}</span
          ><span class="t-xs t-muted">{{ meta() }}</span>
          <div class="upl-prog" [hidden]="progress() === null">
            <i [style.width.%]="progress() ?? 0"></i></div></span
        ><input
          type="file"
          [id]="fid()"
          [attr.accept]="accept()"
          [attr.aria-describedby]="fid() + '-e'"
          [disabled]="disabled()"
          (change)="choose($event)"
      /></label>
      @if (
        progress() === null &&
        !disabled() &&
        (cameraOk() || (file() && (viewable() || removable())))
      ) {
        <div class="row g8 wrap" style="margin-top: 8px">
          @if (cameraOk()) {
            <button
              type="button"
              class="btn btn-sec btn-sm"
              [id]="fid() + '-cam'"
              (click)="camera(capture)"
            >
              <rp-icon name="camera" [size]="15" /><span>Take a photo</span>
            </button>
          }
          @if (file() && viewable()) {
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              [id]="fid() + '-view'"
              (click)="viewed.emit()"
            >
              <rp-icon name="eye" [size]="15" /><span>View</span>
            </button>
          }
          @if (file() && removable()) {
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              [id]="fid() + '-remove'"
              [attr.aria-label]="'Remove ' + (label() || 'the file')"
              (click)="removed.emit()"
            >
              <rp-icon name="trash" [size]="15" /><span>Remove</span>
            </button>
          }
        </div>
      }
      <!-- The formats and the size every upload takes (client 2026-10-13). -->
      <div class="fld-h" [id]="fid() + '-formats'">Accepted: {{ formats() }}</div>
      <input
        #capture
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        [attr.aria-label]="'Take a photo for ' + (label() || 'this upload')"
        (change)="captured($event)"
      />
      <div class="fld-e" [id]="fid() + '-e'" role="alert">
        <rp-icon name="alertc" [size]="14" /><span>{{ error() }}</span>
      </div>
    </div>
    @if (cameraOpen()) {
      <rp-pa-camera
        [title]="label() ? 'Take a photo — ' + label() : 'Take a photo'"
        [name]="fid()"
        (taken)="cameraOpen.set(false); picked.emit($event)"
        (closed)="cameraOpen.set(false)"
      />
    }`,
})
export class PaUpload {
  readonly fid = input.required<string>();
  readonly label = input('');
  readonly req = input(false);
  readonly opt = input(false);
  readonly file = input<PickedFile | null>(null);
  readonly accept = input('.pdf,.jpg,.jpeg,.png');
  /** What to upload (shown in the box until a file is chosen). */
  readonly hint = input('');
  /** The formats and size accepted, always shown under the box (client 2026-10-13). */
  readonly formats = input('PDF, JPG or PNG · up to 2 MB');
  readonly cta = input('Choose a file');
  readonly icon = input<IconName>('upload');
  readonly error = input<string | null | undefined>('');
  /** Upload progress in per cent while sending; null when idle. */
  readonly progress = input<number | null>(null);
  readonly disabled = input(false);
  /** An uploaded file can be opened and removed (client 2026-10-13). */
  readonly viewable = input(true);
  readonly removable = input(true);
  readonly picked = output<File>();
  readonly viewed = output<void>();
  readonly removed = output<void>();

  protected readonly meta = computed(() => {
    const f = this.file();
    if (this.progress() !== null) return `Uploading… ${this.progress()}%`;
    return f ? `${fileSize(f.size)} · uploaded` : this.hint() || 'No file chosen yet';
  });

  protected choose(e: Event) {
    const el = e.target as HTMLInputElement;
    const f = el.files?.[0];
    el.value = '';
    if (f) this.picked.emit(f);
  }

  /** "Take a photo" (client 2026-10-12) where the upload takes images. */
  protected readonly cameraOk = computed(() => /image|\.jpe?g|\.png/i.test(this.accept()));
  protected readonly cameraOpen = signal(false);

  /** The phone's own camera; the computer's camera in the page. */
  protected camera(capture: HTMLInputElement) {
    if (nativeCamera()) capture.click();
    else this.cameraOpen.set(true);
  }

  protected async captured(e: Event) {
    const el = e.target as HTMLInputElement;
    const f = el.files?.[0];
    el.value = '';
    if (f) this.picked.emit(await shrinkPhoto(f));
  }
}

/** ui.choice: a radio card with an icon, a title and a line under it. */
@Component({
  selector: 'rp-pa-choice',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div
    class="choice"
    [class.on]="on()"
    [attr.data-group]="group()"
    tabindex="0"
    role="radio"
    [attr.aria-checked]="on()"
    (click)="pick.emit()"
    (keydown.enter)="$event.preventDefault(); pick.emit()"
    (keydown.space)="$event.preventDefault(); pick.emit()"
  >
    <span class="li-ic sm"><rp-icon [name]="icon()" [size]="17" /></span
    ><span class="grow"
      ><span class="t-h4" style="display: block">{{ title() }}</span
      ><span class="t-sm t-muted" style="display: block; margin-top: 1px">{{ sub() }}</span></span
    ><span class="radio"></span>
  </div>`,
})
export class PaChoice {
  readonly group = input('');
  readonly on = input(false);
  readonly icon = input.required<IconName>();
  readonly title = input.required<string>();
  readonly sub = input('');
  readonly pick = output<void>();
}

export interface SegOption {
  readonly v: string;
  readonly l: string;
  readonly icon?: IconName;
  /** Not available now; `title` says why. */
  readonly disabled?: boolean;
  readonly title?: string;
}

/** ui.seg: the segmented control with its sliding indicator. */
@Component({
  selector: 'rp-pa-seg',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="seg" [class]="cls()" role="radiogroup" [attr.aria-label]="aria()">
    <span class="seg-ind" [style.width]="width()" [style.left]="left()"></span>
    @for (o of options(); track o.v) {
      <button
        type="button"
        role="radio"
        [class.on]="o.v === value()"
        [attr.aria-checked]="o.v === value()"
        [disabled]="!!o.disabled"
        [attr.title]="o.title || null"
        (click)="changed.emit(o.v)"
      >
        @if (o.icon) {
          <rp-icon [name]="o.icon" [size]="14" />
        }
        {{ o.l }}
      </button>
    }
  </div>`,
})
export class PaSeg {
  readonly options = input.required<readonly SegOption[]>();
  readonly value = input.required<string>();
  readonly cls = input('');
  readonly aria = input('');
  readonly changed = output<string>();
  private readonly n = computed(() => Math.max(1, this.options().length));
  private readonly at = computed(() =>
    Math.max(
      0,
      this.options().findIndex((o) => o.v === this.value()),
    ),
  );
  protected readonly width = computed(
    () => `calc((100% - 6px - ${(this.n() - 1) * 2}px) / ${this.n()})`,
  );
  protected readonly left = computed(
    () => `calc(3px + ${this.at()} * ((100% - 6px - ${(this.n() - 1) * 2}px) / ${this.n()} + 2px))`,
  );
}

export interface TimelineItem {
  readonly title: string;
  readonly sub?: string;
  readonly state?: 'done' | 'now' | 'bad' | '';
}

/** ui.timeline */
@Component({
  selector: 'rp-pa-tl',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="tl">
    @for (x of items(); track $index) {
      <div class="tl-i" [class]="x.state ?? ''">
        <span class="tl-dot"><rp-icon [name]="dot(x)" [size]="13" [stroke]="2.6" /></span>
        <div class="tl-c">
          <div class="tl-t">{{ x.title }}</div>
          @if (x.sub) {
            <div class="tl-s">{{ x.sub }}</div>
          }
        </div>
      </div>
    }
  </div>`,
})
export class PaTimeline {
  readonly items = input.required<readonly TimelineItem[]>();
  protected dot(x: TimelineItem): IconName {
    return x.state === 'done' ? 'check' : x.state === 'bad' ? 'x' : 'dot';
  }
}

/** The result mark (.res-mark): a tick, a cross, or a turning clock. */
@Component({
  selector: 'rp-pa-res',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="res-mark" [class.bad]="kind() === 'bad'" [class.warn]="kind() === 'warn'">
    <span class="rm-r"></span><span class="rm-r r2"></span
    ><span class="rm-core">
      @switch (kind()) {
        @case ('ok') {
          <svg
            width="38"
            height="38"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        }
        @case ('bad') {
          <svg
            width="38"
            height="38"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M17 7 7 17M7 7l10 10" />
          </svg>
        }
        @default {
          <rp-icon name="clock" [size]="34" [stroke]="2.4" />
        }
      }
    </span>
  </div>`,
})
export class ResultMark {
  readonly kind = input<'ok' | 'bad' | 'warn'>('ok');
}

/**
 * ui.qr: the prototype's checkout QR (finder and timing patterns, the CampusOne mark in the middle).
 * Test checkout only — it carries the order id as its seed, not a payable UPI request.
 */
@Component({
  selector: 'rp-pa-qr',
  imports: [Mark],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="qr">
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      [attr.viewBox]="'0 0 ' + size() + ' ' + size()"
      fill="#0B1D21"
      role="img"
      aria-label="QR code"
    >
      @for (r of rects(); track $index) {
        <rect [attr.x]="r[0]" [attr.y]="r[1]" [attr.width]="r[2]" [attr.height]="r[2]" />
      }
    </svg>
    <span class="qr-logo"><rp-mark [size]="logo()" /></span>
  </div>`,
})
export class PaQr {
  readonly seed = input.required<string>();
  readonly size = input(108);
  protected readonly logo = computed(() => Math.round(this.size() * 0.16));
  protected readonly rects = computed(() => qrRects(this.seed(), this.size()));
}

function qrRects(seed: string, size: number): [string, string, string][] {
  const N = 29;
  let h = 2166136261;
  for (const c of seed) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const rand = () => {
    h ^= h << 13;
    h >>>= 0;
    h ^= h >> 17;
    h ^= h << 5;
    h >>>= 0;
    return h / 4294967296;
  };
  const m = Array.from({ length: N }, () => Array<number>(N).fill(0));
  const finder = (x: number, y: number) => {
    for (let i = -1; i <= 7; i++)
      for (let j = -1; j <= 7; j++) {
        const X = x + i;
        const Y = y + j;
        if (X < 0 || Y < 0 || X >= N || Y >= N) continue;
        const on =
          (i >= 0 && i <= 6 && (j === 0 || j === 6)) ||
          (j >= 0 && j <= 6 && (i === 0 || i === 6)) ||
          (i >= 2 && i <= 4 && j >= 2 && j <= 4);
        m[Y]![X] = on ? 1 : 2;
      }
  };
  finder(0, 0);
  finder(N - 7, 0);
  finder(0, N - 7);
  for (let i = 8; i < N - 8; i++) {
    m[6]![i] = i % 2 === 0 ? 1 : 2;
    m[i]![6] = i % 2 === 0 ? 1 : 2;
  }
  for (let i = -2; i <= 2; i++)
    for (let j = -2; j <= 2; j++)
      m[N - 9 + j]![N - 9 + i] = Math.max(Math.abs(i), Math.abs(j)) !== 1 ? 1 : 2;
  const out: [string, string, string][] = [];
  const u = size / N;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let v = m[y]![x]!;
      if (v === 0) {
        if (x >= 11 && x <= 17 && y >= 11 && y <= 17) continue;
        v = rand() < 0.47 ? 1 : 2;
      }
      if (v === 1) out.push([(x * u).toFixed(2), (y * u).toFixed(2), (u + 0.3).toFixed(2)]);
    }
  return out;
}

/** ui.skel('detail'): the loading placeholder of a page. */
@Component({
  selector: 'rp-pa-skel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="stack g16" aria-busy="true" aria-label="Loading">
    <div class="stack g8" style="align-items: center; padding: 16px 0">
      <div class="sk sk-circle" style="width: 64px; height: 64px"></div>
      <div class="sk sk-line" style="width: 50%; height: 16px"></div>
      <div class="sk sk-line" style="width: 30%"></div>
    </div>
    <div class="sk" style="height: 200px; border-radius: 16px"></div>
    <div class="sk" style="height: 100px; border-radius: 16px"></div>
  </div>`,
})
export class PaSkeleton {}
