/**
 * Speech to text (client 2026-10-12): a "Speak" button beside a text field. While it listens, what
 * is said shows below it as it is recognised, and each finished phrase is handed to the field
 * (`heard`). It uses the browser's own speech recognition (Chrome, Edge, Safari), in the language
 * the page is shown in (Indian English for English); the browser may send the audio to its
 * provider to recognise it. Where there is none (Firefox), the button is off and says why.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { I18n } from '../Utils/i18n';
import { t as tr } from '../Utils/t';
import { Icon } from './Icon';

/** The parts of the Web Speech API used here (not in TypeScript's DOM library everywhere). */
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: ArrayLike<{ readonly isFinal: boolean; readonly 0: { transcript: string } }>;
}
type RecognitionCtor = new () => Recognition;

/** The browser's speech recognition, or null when it has none. */
export function speechRecognition(): RecognitionCtor | null {
  const w = globalThis as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** The recognition language for a page language: Indian English, Kannada, Hindi … */
export const speechLang = (code: string) => `${code || 'en'}-IN`;

/** `cur` with a spoken phrase added: a space between, and a capital letter to start a sentence. */
export function withPhrase(cur: string, text: string): string {
  const sep = cur && !/\s$/.test(cur) ? ' ' : '';
  const phrase =
    !cur.trim() || /[.!?]\s*$/.test(cur) ? text[0]!.toUpperCase() + text.slice(1) : text;
  return `${cur}${sep}${phrase}`;
}

const ERRORS: Readonly<Record<string, string>> = {
  'not-allowed': 'ui.web.dictate.denied',
  'service-not-allowed': 'ui.web.dictate.denied',
  'audio-capture': 'ui.web.dictate.noMic',
  'no-speech': 'ui.web.dictate.noSpeech',
  network: 'ui.web.dictate.network',
};

@Component({
  selector: 'rp-dictate',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="dictate" [class.on]="listening()">
    <span class="cp-why" [attr.title]="supported ? null : t('ui.web.dictate.unsupported')"
      ><button
        type="button"
        class="btn btn-sm"
        [class.btn-soft]="!listening()"
        [class.btn-pri]="listening()"
        [id]="fid()"
        [attr.aria-pressed]="listening()"
        [attr.aria-label]="listening() ? t('ui.web.dictate.stop') : t('ui.web.dictate.startAria')"
        [disabled]="!supported || disabled()"
        (click)="toggle()"
      >
        <rp-icon [name]="listening() ? 'stop' : 'mic'" [size]="15" /><span>{{
          listening() ? t('ui.web.dictate.stop') : t('ui.web.dictate.start')
        }}</span>
      </button></span
    >
    <span class="dictate-s" [class.t-bad]="!!problem()" aria-live="polite">{{ status() }}</span>
  </div>`,
})
export class Dictation {
  private readonly i18n = inject(I18n);
  protected readonly t = tr;
  /** The button's id. */
  readonly fid = input('dictate');
  readonly disabled = input(false);
  /** A phrase recognised and finished, to add to the field. */
  readonly heard = output<string>();

  protected readonly supported = !!speechRecognition();
  protected readonly listening = signal(false);
  protected readonly interim = signal('');
  protected readonly problem = signal('');
  protected readonly status = computed(() =>
    this.problem()
      ? this.problem()
      : this.listening()
        ? this.interim() || tr('ui.web.dictate.listening')
        : '',
  );
  private rec: Recognition | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.rec?.abort());
  }

  /** Shows a problem from the field (e.g. it is full) under the button. */
  note(message: string) {
    this.problem.set(message);
  }

  protected toggle() {
    if (this.listening()) {
      this.rec?.stop();
      return;
    }
    const Ctor = speechRecognition();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = speechLang(this.i18n.lang());
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        const text = r[0].transcript.trim();
        if (!text) continue;
        if (r.isFinal) this.heard.emit(text);
        else interim += `${interim ? ' ' : ''}${text}`;
      }
      this.interim.set(interim);
    };
    rec.onerror = (e) => {
      if (e.error === 'aborted') return;
      this.problem.set(tr(ERRORS[e.error] ?? 'ui.web.dictate.failed'));
    };
    rec.onend = () => {
      this.listening.set(false);
      this.interim.set('');
      this.rec = null;
    };
    this.problem.set('');
    this.interim.set('');
    try {
      rec.start();
      this.rec = rec;
      this.listening.set(true);
    } catch {
      this.problem.set(tr('ui.web.dictate.failed'));
    }
  }
}
