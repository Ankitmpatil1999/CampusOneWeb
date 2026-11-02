import { computed, signal } from '@angular/core';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { cleanTyped, onlyDigits, panText } from '../../../Utils/typing';
import type {
  AdmissionsApi,
  Application,
  ContactCodeSent,
  DocType,
  Landing,
} from '../admissions.api';
import { asProblem, fileSize, msg, problemText, tokenFor } from '../admissions.store';
import type { PickedFile } from '../Shared/AdmissionsUi';
import { blank, contactOf, type Draft, type Facts, orderOf, savedContactOf } from './form.state';

/** The form's side of the primary contact's verification (client 2026-10-27). */
export interface ContactCode {
  /** Saves a changed Parents & guardians step, then sends the code; null when it couldn't. */
  send(): Promise<ContactCodeSent | null>;
  confirm(challengeId: string, otp: string): Promise<unknown>;
}
import type { FamilyLookup } from '../../../Shared/FamilyFound';

type Sub = 'res' | 'corr' | 'prev' | 'father' | 'mother' | 'guardian' | 'lg' | 'tc' | 'docs';

/**
 * Where the form's attachments go: the public API with the family's resume token, or the console's
 * for a counsellor filling the same form (client 2026-10-15).
 */
export interface FormFiles {
  upload(
    appId: string,
    type: DocType,
    file: File,
    progress: (pct: number) => void,
  ): Promise<Application>;
  remove(appId: string, type: DocType): Promise<Application>;
  link(
    appId: string,
    type: DocType,
  ): Promise<{ readonly url: string; readonly name: string; readonly mimeType: string }>;
  file(url: string): Promise<Blob>;
}

/** The family's resume token for an application; a lost one is the register's "not found". */
export function familyToken(appId: string): string {
  const t = tokenFor(appId);
  if (!t) throw new ApiProblem(404, 'ADM.NOT_FOUND', translate('ADM.NOT_FOUND'), null);
  return t;
}

/** The public form's attachments (ADM-006, ADM-033, ADM-034). */
export function publicFiles(api: AdmissionsApi): FormFiles {
  return {
    upload: (id, type, file, progress) => api.document(id, familyToken(id), type, file, progress),
    remove: (id, type) => api.removeDocument(id, familyToken(id), type),
    link: (id, type) => api.documentLink(id, familyToken(id), type),
    file: (url) => api.documentFile(url),
  };
}

/**
 * The form's working state shared by the page and its steps: the draft, the landing it is checked
 * against, the field errors and the uploads in progress. Every change makes a new draft object so
 * the OnPush views redraw.
 */
export class FormState {
  readonly d = signal<Draft>(blank(null));
  readonly landing = signal<Landing | null>(null);
  readonly errors = signal<Record<string, string>>({});
  /** Upload progress (per cent) by field id while a document is on its way. */
  readonly progress = signal<Record<string, number>>({});
  /** The application as the server last returned it (fees, declaration). */
  readonly view = signal<Application | null>(null);
  /** An attached picture in a pop-up (client 2026-10-14): its name, and the picture once loaded. */
  readonly shown = signal<{ name: string; url: string | null; failed: boolean } | null>(null);
  /** Counts the opens, so a picture that arrives after another was asked for is dropped. */
  private asked = 0;

  readonly year = computed(() => this.landing()?.years.find((y) => y.id === this.d().year) ?? null);
  readonly cls = computed(
    () => this.landing()?.classes.find((c) => c.id === this.d().classId) ?? null,
  );
  readonly mid = computed(() => this.year()?.kind === 'MID_TERM');
  readonly order = computed(() => {
    const l = this.landing();
    return l ? orderOf(l, this.cls()) : -1;
  });
  readonly facts = computed<Facts | null>(() => {
    const l = this.landing();
    return l ? { landing: l, year: this.year(), cls: this.cls(), mid: this.mid() } : null;
  });

  /**
   * The counsellor collects the fees on submitting (client 2026-10-23: the in-app form as the public
   * form): their role takes fees at the desk, so the review offers the public form's fees — the
   * application fee with the form, the admission fee now or later — and submitting goes on to
   * collect them. Without it the accounts desk collects them later.
   */
  readonly collects = signal(false);

  /**
   * The primary contact's mobile is verified (client 2026-10-27): the server says so, and neither
   * the primary contact nor their mobile has changed on the form since it was saved.
   */
  readonly contactVerified = computed(() => {
    const v = this.view();
    return !!v?.contactVerified && contactOf(this.d()) === savedContactOf(v);
  });
  /** Sends and confirms the code; set by the form, which saves the step first. */
  contact: ContactCode | null = null;

  /**
   * @param counsellor the school's counsellor fills the form for the family (the console): the fees
   *   are collected at the desk and the family's declaration is recorded for them.
   */
  constructor(
    private readonly files: FormFiles,
    readonly counsellor = false,
    /** Who a mobile belongs to at the school (the counsellor's console, client 2026-10-22). */
    readonly lookup: ((mobile: string) => Promise<FamilyLookup>) | null = null,
  ) {}

  /** Changes the draft through a copy. */
  edit(fn: (d: Draft) => void) {
    this.d.update((x) => {
      const n = structuredClone(x);
      fn(n);
      return n;
    });
  }

  put<K extends keyof Draft>(k: K, v: Draft[K], fid?: string) {
    this.edit((d) => {
      d[k] = v;
    });
    if (fid) this.clear(fid);
  }

  putIn(k: Sub, sub: string, v: unknown, fid?: string) {
    this.edit((d) => {
      (d[k] as unknown as Record<string, unknown>)[sub] = v;
    });
    if (fid) this.clear(fid);
  }

  err(id: string) {
    return this.errors()[id] ?? '';
  }

  clear(...ids: string[]) {
    if (!ids.some((id) => this.errors()[id])) return;
    this.errors.update((e) => {
      const n = { ...e };
      for (const id of ids) delete n[id];
      return n;
    });
  }

  fail(id: string, message: string) {
    this.errors.update((e) => ({ ...e, [id]: message }));
  }

  /**
   * ADM-006: checks the file here first (2 MB, PDF/JPG/PNG — CR-07), then sends it; the server
   * type-sniffs and scans it again.
   */
  async upload(fid: string, type: DocType, file: File, apply: (d: Draft, f: PickedFile) => void) {
    const d = this.d();
    const max = this.landing()?.rules.documents.maxBytes ?? 2 * 1024 * 1024;
    const ext = (file.name.split('.').pop() ?? '').toLowerCase();
    const allowed = type === 'PHOTO' ? ['jpg', 'jpeg', 'png'] : ['pdf', 'jpg', 'jpeg', 'png'];
    if (!allowed.includes(ext)) return this.fail(fid, translate('FILE.TYPE_NOT_ALLOWED'));
    if (file.size > max) {
      return this.fail(fid, msg('FILE.TOO_LARGE', { limit: fileSize(max).replace('.0 ', ' ') }));
    }
    if (!d.appId) return this.fail(fid, translate('ADM.NOT_FOUND'));
    this.clear(fid);
    this.progress.update((p) => ({ ...p, [fid]: 0 }));
    try {
      const view = await this.files.upload(d.appId, type, file, (pct) =>
        this.progress.update((p) => (fid in p ? { ...p, [fid]: pct } : p)),
      );
      this.view.set(view);
      this.edit((x) => {
        apply(x, { name: file.name, size: file.size });
        x.saved = view.updatedAt;
      });
    } catch (e) {
      const p = asProblem(e);
      this.fail(fid, p.errors[0]?.message ?? problemText(p));
    } finally {
      this.progress.update((p) => {
        const n = { ...p };
        delete n[fid];
        return n;
      });
    }
  }

  /** ADM-033: removes an attachment (client 2026-10-13); a required one is asked for again. */
  async remove(fid: string, type: DocType, apply: (d: Draft) => void) {
    const d = this.d();
    if (!d.appId) return this.fail(fid, translate('ADM.NOT_FOUND'));
    this.clear(fid);
    try {
      const view = await this.files.remove(d.appId, type);
      this.view.set(view);
      this.edit((x) => {
        apply(x);
        x.saved = view.updatedAt;
      });
    } catch (e) {
      this.fail(fid, problemText(e));
    }
  }

  /**
   * ADM-034: opens an attachment (client 2026-10-14). The file is fetched through its short-lived
   * link (the server sends it as a download) and shown from the page: a picture in a pop-up here, a
   * PDF in a new tab — opened at once, as a tab opened after the answer would be taken for a
   * pop-up — and any other file saved under its own name.
   */
  async open(type: DocType) {
    const d = this.d();
    if (!d.appId) return;
    const known = this.view()?.documents.find((x) => x.type === type);
    const mime = known?.mimeType ?? 'application/pdf';
    const image = mime.startsWith('image/');
    const tab = mime === 'application/pdf' ? window.open('', '_blank') : null;
    const ask = ++this.asked;
    if (image) this.shown.set({ name: known?.name ?? '', url: null, failed: false });
    try {
      const link = await this.files.link(d.appId, type);
      const blob = await this.files.file(link.url);
      const url = URL.createObjectURL(new Blob([blob], { type: link.mimeType || mime }));
      if (image) {
        if (ask !== this.asked || !this.shown()) return URL.revokeObjectURL(url);
        this.shown.set({ name: link.name, url, failed: false });
        return;
      }
      if (tab) tab.location.href = url;
      else {
        const a = document.createElement('a');
        a.href = url;
        a.download = link.name;
        a.click();
      }
      // The tab or the download has it by then.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      tab?.close();
      if (image && ask === this.asked && this.shown()) {
        this.shown.update((s) => (s ? { ...s, failed: true } : s));
      }
    }
  }

  /** Closes the picture's pop-up. */
  closeShown() {
    const url = this.shown()?.url;
    if (url) URL.revokeObjectURL(url);
    this.asked++;
    this.shown.set(null);
  }

  /** Upload progress of a field, or null when idle. */
  pct(fid: string): number | null {
    const v = this.progress()[fid];
    return v === undefined ? null : v;
  }
}

/** The value of an input event. */
export const val = (e: Event) => (e.target as HTMLInputElement).value;
/** Digits only (mobile, PIN, Aadhaar) — anything else is dropped from the box as it is typed. */
export const digits = (e: Event) => cleanTyped(e.target as HTMLInputElement, onlyDigits);
/** Letters and digits in capitals (PAN), in the box too. */
export const upper = (e: Event) => cleanTyped(e.target as HTMLInputElement, panText);
