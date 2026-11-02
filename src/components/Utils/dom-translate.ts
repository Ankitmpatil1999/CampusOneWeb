/**
 * Page text in the chosen language (Phase 10 stage 2, ADR-0018). The pages are written in English;
 * `public/i18n/ui-text.en.json` (`npm run ui-text`) lists that English by key, and the language's
 * bundle holds the same keys. The translator swaps each English text node — and the readable
 * attributes — for the language's text as the page is drawn, and again whenever Angular writes
 * English into the page. A text with values in it ("{0} students") is matched as a pattern, and a
 * value that is itself a known text is translated too. Elements marked `translate="no"` keep their
 * text (names, codes, amounts), as do form fields, code and anything editable.
 */

export interface UiDictionary {
  /** English → the language's text. */
  readonly exact: ReadonlyMap<string, string>;
  /** Patterns by their longest word (lower case). */
  readonly patterns: ReadonlyMap<string, readonly Pattern[]>;
}
interface Pattern {
  readonly re: RegExp;
  /** For each capture, the placeholder number it fills. */
  readonly order: readonly number[];
  /** Placeholders glued to the end of an English word ("day{1}"): an English plural ending. */
  readonly suffixes: ReadonlySet<number>;
  readonly to: string;
  /** Letters of its own: the more, the more specific (tried first). */
  readonly weight: number;
}

/** Attributes that are shown or read out. */
export const TRANSLATED_ATTRS = ['placeholder', 'title', 'aria-label', 'alt'] as const;
// Chart labels are SVG <text>: drawn text like any other (icons hold no text).
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'NOSCRIPT']);
const WORD = /\p{L}[\p{L}\p{M}'’-]*/gu;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The dictionary for a language: its bundle's text for each English page text. */
export function buildDictionary(
  english: Readonly<Record<string, string>>,
  bundle: Readonly<Record<string, string>>,
): UiDictionary {
  const exact = new Map<string, string>();
  const patterns = new Map<string, Pattern[]>();
  for (const [key, en] of Object.entries(english)) {
    const to = bundle[key];
    if (!to || to === en) continue;
    if (!/\{\d+\}/.test(en)) {
      exact.set(en, to);
      continue;
    }
    // A placeholder glued to the end of a word ("day{1}") is an English plural ending: maybe empty.
    const suffixes = new Set([...en.matchAll(/\p{L}\{(\d+)\}/gu)].map((x) => Number(x[1])));
    const order: number[] = [];
    let src = '^';
    for (const part of en.split(/(\{\d+\})/)) {
      const m = /^\{(\d+)\}$/.exec(part);
      if (m) {
        order.push(Number(m[1]));
        src += suffixes.has(Number(m[1])) ? '(.*?)' : '(.+?)';
      } else src += escapeRe(part);
    }
    const words = en.replace(/\{\d+\}/g, ' ').match(WORD) ?? [];
    const anchor = words.reduce((a, w) => (w.length > a.length ? w : a), '').toLowerCase();
    if (!anchor) continue;
    const list = patterns.get(anchor) ?? [];
    const weight = words.join('').length;
    list.push({ re: new RegExp(`${src}$`, 's'), order, suffixes, to, weight });
    patterns.set(anchor, list);
  }
  return { exact, patterns };
}

/**
 * One text in the language, or null when it isn't page text (names, numbers, data). Of the patterns
 * that fit, the most specific wins ("{0} inactive · {1} suspended" before "{0} inactive · {1}"), and
 * the values in it are translated in turn ("3 students" inside "{0} selected").
 */
export function translateText(d: UiDictionary, text: string, depth = 0): string | null {
  const hit = d.exact.get(text);
  if (hit !== undefined) return hit;
  if (depth > 2) return null;
  const candidates = new Set<Pattern>();
  for (const w of text.match(WORD) ?? []) {
    for (const p of d.patterns.get(w.toLowerCase()) ?? []) candidates.add(p);
  }
  const ordered = [...candidates].sort((a, b) => b.weight - a.weight);
  for (const p of ordered) {
    const m = p.re.exec(text);
    if (!m) continue;
    const values: string[] = [];
    p.order.forEach((n, i) => {
      const v = m[i + 1] ?? '';
      // An English plural ending ("s") or a verb chosen for the count ("is"/"are") means
      // nothing in the language: it is dropped.
      if (p.suffixes.has(n) && /^(s|es)$/i.test(v)) values[n] = '';
      else if (/^(is|are|was|were|has|have)$/i.test(v.trim())) values[n] = '';
      else {
        const core = v.trim();
        const inner = core && /\p{L}/u.test(core) ? translateText(d, core, depth + 1) : null;
        values[n] = inner === null ? v : v.replace(core, inner);
      }
    });
    return p.to.replace(/\{(\d+)\}/g, (_, n: string) => values[Number(n)] ?? '');
  }
  return null;
}

const skipEl = (el: Element) =>
  SKIP_TAGS.has(el.tagName.toUpperCase()) ||
  el.getAttribute('translate') === 'no' ||
  el.classList.contains('notranslate') ||
  (el as HTMLElement).isContentEditable === true;

function skippedUp(el: Element | null): boolean {
  for (let e = el; e; e = e.parentElement) if (skipEl(e)) return true;
  return false;
}

/** Watches a part of the page and keeps its English swapped for the language's text. */
export class DomTranslator {
  private readonly observer: MutationObserver;
  /** What this translator last wrote, so its own writes aren't looked up again. */
  private readonly wroteText = new WeakMap<Node, string>();
  private readonly wroteAttr = new WeakMap<Element, Map<string, string>>();
  /** Texts known not to be page text (names, numbers): looked up once. */
  private readonly misses = new Set<string>();

  constructor(private readonly dict: UiDictionary) {
    this.observer = new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'childList') m.addedNodes.forEach((n) => this.tree(n));
        else if (m.type === 'characterData') this.text(m.target as Text, true);
        else if (m.type === 'attributes' && m.attributeName)
          this.attr(m.target as Element, m.attributeName, true);
      }
    });
  }

  start(root: Node): void {
    this.tree(root);
    this.observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATED_ATTRS],
    });
  }

  stop(): void {
    this.observer.disconnect();
  }

  private lookup(core: string): string | null {
    if (this.misses.has(core)) return null;
    const out = translateText(this.dict, core);
    if (out === null) {
      if (this.misses.size > 20000) this.misses.clear();
      this.misses.add(core);
    }
    return out;
  }

  /** A whole subtree, skipping what must keep its text. */
  private tree(n: Node): void {
    if (n.nodeType === Node.TEXT_NODE) {
      this.text(n as Text, true);
      return;
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const root = n as Element;
    if (skippedUp(root)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (x) =>
        x.nodeType === Node.ELEMENT_NODE && skipEl(x as Element)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    });
    for (let x: Node | null = root; x; x = walker.nextNode()) {
      if (x.nodeType === Node.TEXT_NODE) this.text(x as Text, false);
      else for (const a of TRANSLATED_ATTRS) this.attr(x as Element, a, false);
    }
  }

  private text(node: Text, check: boolean): void {
    const raw = node.nodeValue ?? '';
    if (this.wroteText.get(node) === raw) return;
    const core = raw.replace(/\s+/g, ' ').trim();
    if (core.length < 2 || !/\p{L}/u.test(core)) return;
    if (check && skippedUp(node.parentElement)) return;
    const to = this.lookup(core);
    if (to === null || to === core) return;
    const lead = /^\s*/.exec(raw)![0];
    const trail = /\s*$/.exec(raw)![0];
    const next = `${lead}${to}${trail}`;
    this.wroteText.set(node, next);
    node.nodeValue = next;
  }

  private attr(el: Element, name: string, check: boolean): void {
    const raw = el.getAttribute(name);
    if (!raw || !/\p{L}/u.test(raw)) return;
    if (this.wroteAttr.get(el)?.get(name) === raw) return;
    if (check && skippedUp(el)) return;
    const to = this.lookup(raw.replace(/\s+/g, ' ').trim());
    if (to === null) return;
    const wrote = this.wroteAttr.get(el) ?? new Map<string, string>();
    wrote.set(name, to);
    this.wroteAttr.set(el, wrote);
    el.setAttribute(name, to);
  }
}
