/**
 * Taking a photo for an upload (client 2026-10-12): the phone's own camera where there is one (a
 * touch screen), otherwise the computer's camera shown in the page. Either way the photo is made
 * small enough for the 2 MB upload limit (at most 1600 px on its long side, as a JPEG).
 */
import {
  type AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  type OnDestroy,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { Modal } from '../../../Shared/Overlays';

const MAX_SIDE = 1600;
const QUALITY = 0.85;
/** A photo this size or smaller, and no larger than MAX_SIDE, is sent as it is. */
const SMALL_ENOUGH = 1_500_000;

/** An image drawn at most MAX_SIDE on its long side, as a JPEG file; null when it can't be. */
async function toJpeg(
  source: CanvasImageSource,
  width: number,
  height: number,
  name: string,
): Promise<File | null> {
  const k = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * k);
  canvas.height = Math.round(height * k);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', QUALITY));
  return blob ? new File([blob], name, { type: 'image/jpeg' }) : null;
}

/** A photo from the phone's camera, made small enough to upload; unchanged when it can't be. */
export async function shrinkPhoto(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file);
    try {
      if (Math.max(bitmap.width, bitmap.height) <= MAX_SIDE && file.size <= SMALL_ENOUGH) {
        return file;
      }
      const name = `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.jpg`;
      return (await toJpeg(bitmap, bitmap.width, bitmap.height, name)) ?? file;
    } finally {
      bitmap.close();
    }
  } catch {
    return file;
  }
}

/** A touch screen (a phone or a tablet): its own camera opens from the file picker. */
export const nativeCamera = () =>
  typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/** The computer's camera in the page: preview, capture, retake, use. */
@Component({
  selector: 'rp-pa-camera',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<rp-modal [title]="title()" (closed)="closed.emit()">
    <div class="stack g12">
      @if (problem(); as p) {
        <div class="note tone-warn" role="alert" id="pa-cam-problem">
          <rp-icon name="alert" [size]="17" />
          <div class="grow">{{ p }}</div>
        </div>
      }
      <div
        style="position: relative; background: #0b0f14; border-radius: 12px; overflow: hidden; aspect-ratio: 4 / 3"
      >
        <video
          #video
          autoplay
          muted
          playsinline
          [hidden]="!!shot()"
          style="width: 100%; height: 100%; object-fit: contain"
        ></video>
        @if (shot(); as s) {
          <img
            [src]="s.url"
            alt="The photo just taken"
            style="width: 100%; height: 100%; object-fit: contain"
          />
        }
      </div>
      <p class="t-xs t-muted">Hold the document flat, in good light, so that it fills the frame.</p>
    </div>
    <ng-container modal-foot>
      <button type="button" class="btn btn-sec" (click)="closed.emit()">
        <span>Cancel</span>
      </button>
      @if (shot()) {
        <button type="button" class="btn btn-sec" id="pa-cam-retake" (click)="retake()">
          <span>Retake</span>
        </button>
        <button type="button" class="btn btn-pri" id="pa-cam-use" (click)="use()">
          <rp-icon name="checkc" [size]="17" /><span>Use this photo</span>
        </button>
      } @else {
        <button
          type="button"
          class="btn btn-pri"
          id="pa-cam-snap"
          [disabled]="!ready()"
          (click)="snap()"
        >
          <rp-icon name="camera" [size]="17" /><span>Capture</span>
        </button>
      }
    </ng-container>
  </rp-modal>`,
})
export class PaCamera implements AfterViewInit, OnDestroy {
  readonly title = input('Take a photo');
  /** The start of the photo's file name. */
  readonly name = input('photo');
  readonly taken = output<File>();
  readonly closed = output<void>();

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  protected readonly ready = signal(false);
  protected readonly problem = signal<string | null>(null);
  protected readonly shot = signal<{ readonly file: File; readonly url: string } | null>(null);
  private stream: MediaStream | null = null;
  private gone = false;

  async ngAfterViewInit() {
    const media = globalThis.navigator?.mediaDevices;
    if (!media?.getUserMedia) {
      this.problem.set(
        "This browser can't use a camera here. Close this and choose a file instead.",
      );
      return;
    }
    try {
      const stream = await media.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      // Closed while the browser asked for permission: let the camera go at once.
      if (this.gone) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      const v = this.video()?.nativeElement;
      if (!v) return;
      v.srcObject = stream;
      v.onloadedmetadata = () => {
        void v.play();
        this.ready.set(true);
      };
    } catch {
      this.problem.set(
        'No camera was found, or permission to use it was refused. Allow the camera in your browser, or close this and choose a file instead.',
      );
    }
  }

  protected async snap() {
    const v = this.video()?.nativeElement;
    if (!v?.videoWidth) return;
    const file = await toJpeg(v, v.videoWidth, v.videoHeight, `${this.name()}-${Date.now()}.jpg`);
    if (!file) {
      this.problem.set("The photo couldn't be taken. Try again, or choose a file instead.");
      return;
    }
    this.shot.set({ file, url: URL.createObjectURL(file) });
  }

  protected retake() {
    this.release();
    this.shot.set(null);
  }

  protected use() {
    const s = this.shot();
    if (s) this.taken.emit(s.file);
  }

  ngOnDestroy() {
    this.gone = true;
    this.release();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  private release() {
    const s = this.shot();
    if (s) URL.revokeObjectURL(s.url);
  }
}
