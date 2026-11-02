/**
 * The English text of the web pages (Phase 10, stage 2: every page in the chosen language).
 *
 * Reads every component's inline template with Angular's template parser — text, readable
 * attributes (placeholder, title, aria-label…) and quoted words inside bindings — and the strings
 * in component code (toasts, confirmations, labels kept in arrays). Writes
 * `public/i18n/ui-text.en.json`: key → English, where a text with values in it becomes a pattern
 * ("{0} students"). The key is a hash of the English (`ui.web.x.<hash>`), so a reworded text gets a
 * new key and is translated again. The backend's `scripts/translation-source.ts` lists these texts
 * for translation; the web loads the file only for a language other than English and swaps the
 * page's English for the language's text as it is drawn (`Utils/dom-translate.ts`).
 *
 *   npm run ui-text          write the file
 *   npm run ui-text:check    fail when the file is out of date (CI)
 *   npm run ui-text -- --stats   counts per page area, nothing written
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import * as ng from '@angular/compiler';
import ts from 'typescript';

const ROOT = join(import.meta.dirname, '..');
const SRC = join(ROOT, 'src', 'components');
const OUT = join(ROOT, 'public', 'i18n', 'ui-text.en.json');
/** Already translated by key (t() / translate()), or not page text. */
const SKIP_DIRS = new Set(['Utils', 'texts']);
/** Files in skipped folders that hold page text (the menus and page titles). */
const EXTRA = ['Utils/navigation.ts', 'Utils/greeting.ts'];

/** Attributes whose value is shown or read out. */
const TEXT_ATTRS = new Set([
  'title',
  'sub',
  'label',
  'placeholder',
  'text',
  'aria-label',
  'alt',
  'hint',
  'heading',
  'description',
  'empty',
  'emptyText',
  'ok',
  'cancel',
  'small',
  'note',
  'caption',
  'subtitle',
  'delta',
  'recLabel',
  'linkLabel',
  'cta',
  'aria',
]);

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const letters = (s: string) => (s.replace(/\{\d+\}/g, '').match(/\p{L}/gu) ?? []).length;

/** Text from a template's text node: anything with a word in it. */
function okTemplateText(s: string) {
  return letters(s) >= 2 && /[a-z]/.test(s.replace(/\{\d+\}/g, ''));
}

/** A string from code or an attribute value: reads like a sentence or a label, not a code. */
function okCodeText(s: string) {
  if (s.length < 2 || s.length > 400 || letters(s) < 2) return false;
  const plain = s.replace(/\{\d+\}/g, '');
  if (!/[a-z]/.test(plain)) return false; // codes: PENDING, GET, CSV
  if (/^(https?:|\/|\.|#|@|data:)/.test(s)) return false; // URLs, paths, selectors
  if (/[<>{};\\`]|=>|\$\{/.test(plain)) return false; // markup, code, CSS
  if (!/\s/.test(s)) {
    // One word: a label ("Close", "Active"), never an identifier, key or file name.
    if (!/^[A-Z][a-z]+(['’][a-z]+)?$/.test(s) && !/^[A-Z][a-z]*[A-Z]?[a-z]*$/.test(s)) return false;
    if (/^[A-Z][a-z]+[A-Z]/.test(s)) return false; // PascalCase identifiers
  }
  // A sentence starts with a capital, a number or a value; lower-case starts are code ("0 0 auto"),
  // except a phrase around a value ("announced “{0}”", "{0} members suspended").
  const phrase =
    /\{\d+\}/.test(s) &&
    /^[a-z]+[ ,]/.test(s) &&
    letters(s) >= 4 &&
    // not a class list or a style value ("chip tone-{0}", "fade .5s {0}s both")
    !/\d|[a-z]-|\.\S|\{\d+\}[a-z]/.test(s.replace(/\{\d+\}(?=\s|$|[,.;:!?”"’)])/g, ''));
  if (!phrase && !/^(\{\d+\}|[A-Z0-9₹"“'(‘]|e\.g\.)/.test(s)) return false;
  if (/^[a-z-]+(\s[a-z-]+)*$/.test(s)) return false; // css-ish lists of words
  return true;
}

const found = new Map<string, Set<string>>(); // English → files
function add(text: string, file: string, strict: boolean) {
  const s = norm(text);
  if (!s || /^\{\d+\}$/.test(s)) return;
  if (strict ? !okCodeText(s) : !okTemplateText(s)) return;
  // A pattern needs words of its own, or it would match any value ("{0} · {1}").
  if (/\{\d+\}/.test(s) && letters(s) < 3) return;
  // Media queries ("(max-width: 980px)") are CSS too.
  if (/^\((min|max)-(width|height)\s*:/.test(s)) return;
  // Style values built from numbers ("{0}px {1}px", "{0}%") are CSS, not text.
  if (/^(\s*-?(\{\d+\}|\d+(\.\d+)?)(px|em|rem|%|deg|ms|s|vh|vw)?\s*,?)+$/.test(s)) return;
  if (!found.has(s)) found.set(s, new Set());
  found.get(s)!.add(file);
}

/**
 * plural(n, 'student'[, 'children']) shows "1 student" / "3 students" (the format helpers): both
 * forms as patterns.
 */
function pluralPatterns(args: readonly (string | null)[]): string[] {
  const one = args[1];
  if (!one || !/^[a-z][a-z -]*$/i.test(one)) return [];
  const many = args[2] ?? `${one}${one.endsWith('ch') ? 'es' : 's'}`;
  return [`{0} ${one}`, `{0} ${many}`];
}
const literalOf = (a: ng.AST) =>
  a instanceof ng.LiteralPrimitive && typeof a.value === 'string' ? a.value : null;

// --- template expressions: quoted words in bindings ({{ x ? 'Never' : 'Today' }}) -------------
class Literals extends ng.RecursiveAstVisitor {
  readonly out: string[] = [];
  override visitLiteralPrimitive(ast: ng.LiteralPrimitive, context: unknown) {
    if (typeof ast.value === 'string') this.out.push(ast.value);
    return super.visitLiteralPrimitive(ast, context);
  }
  override visitBinary(ast: ng.Binary, context: unknown) {
    if (ast.operation !== '+') return super.visitBinary(ast, context);
    // 'Console role ' + r.name → "Console role {0}": the whole join, not its pieces.
    const parts: (string | null)[] = [];
    const values: ng.AST[] = [];
    const flat = (a: ng.AST): void => {
      if (a instanceof ng.Binary && a.operation === '+') {
        flat(a.left);
        flat(a.right);
      } else if (a instanceof ng.LiteralPrimitive && typeof a.value === 'string')
        parts.push(a.value);
      else {
        parts.push(null);
        values.push(a);
      }
    };
    flat(ast);
    if (parts.some((p) => p !== null) && values.length) {
      let n = 0;
      this.out.push(parts.map((p) => p ?? `{${n++}}`).join(''));
    } else for (const p of parts) if (p !== null) this.out.push(p);
    for (const v of values) v.visit(this, context);
    return null;
  }
  override visitCall(ast: ng.Call, context: unknown) {
    // t('ui.web…') and translate('KEY') are translated by key already.
    const name = ast.receiver instanceof ng.PropertyRead ? ast.receiver.name : '';
    if (name === 't' || name === 'translate' || name === 'tr') return null;
    if (name === 'plural') this.out.push(...pluralPatterns(ast.args.map(literalOf)));
    return super.visitCall(ast, context);
  }
}
function exprLiterals(ast: ng.AST | null | undefined): string[] {
  if (!ast) return [];
  const v = new Literals();
  (ast instanceof ng.ASTWithSource ? ast.ast : ast).visit(v, null);
  return v.out;
}

class TemplateText extends ng.TmplAstRecursiveVisitor {
  constructor(private readonly file: string) {
    super();
  }
  override visitText(text: ng.TmplAstText) {
    add(text.value, this.file, false);
  }
  override visitBoundText(text: ng.TmplAstBoundText) {
    const ast = text.value instanceof ng.ASTWithSource ? text.value.ast : text.value;
    if (ast instanceof ng.Interpolation) {
      let pattern = '';
      ast.strings.forEach((s, i) => {
        pattern += s;
        if (i < ast.expressions.length) pattern += `{${i}}`;
      });
      add(pattern, this.file, false);
      for (const e of ast.expressions) for (const l of exprLiterals(e)) add(l, this.file, true);
    }
  }
  private attrs(node: ng.TmplAstElement | ng.TmplAstTemplate | ng.TmplAstComponent) {
    for (const a of node.attributes) if (TEXT_ATTRS.has(a.name)) add(a.value, this.file, true);
    for (const i of node.inputs) {
      const literals = exprLiterals(i.value);
      // [class.x]="…" and [attr.id] hold codes; shown text comes through other inputs.
      if (i.name.startsWith('class') || i.name === 'id' || i.name === 'style') continue;
      for (const l of literals) add(l, this.file, true);
    }
  }
  override visitElement(el: ng.TmplAstElement) {
    this.attrs(el);
    super.visitElement(el);
  }
  override visitTemplate(t: ng.TmplAstTemplate) {
    this.attrs(t);
    super.visitTemplate(t);
  }
  override visitComponent(c: ng.TmplAstComponent) {
    this.attrs(c);
    super.visitComponent(c);
  }
}

// --- component code ------------------------------------------------------------------------------
const KEYED_CALLS = new Set(['t', 'tr', 'translate', 'inject', 'viewChild', 'input', 'output']);
/** Calls whose string arguments are selectors, storage keys or media queries, never page text. */
const NOT_TEXT_CALLS = new Set([
  'querySelector',
  'querySelectorAll',
  'closest',
  'getItem',
  'setItem',
  'matchMedia',
]);
function codeStrings(file: string, rel: string) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    // @Component({...}): only the template is page text (handled by the parser).
    if (ts.isDecorator(node)) {
      const call = node.expression;
      if (
        ts.isCallExpression(call) &&
        call.arguments[0] &&
        ts.isObjectLiteralExpression(call.arguments[0])
      ) {
        for (const p of call.arguments[0].properties) {
          if (
            ts.isPropertyAssignment(p) &&
            ts.isIdentifier(p.name) &&
            p.name.text === 'template' &&
            (ts.isNoSubstitutionTemplateLiteral(p.initializer) || ts.isStringLiteral(p.initializer))
          ) {
            const parsed = ng.parseTemplate(p.initializer.text, rel, {
              preserveWhitespaces: false,
            });
            ng.tmplAstVisitAll(new TemplateText(rel), parsed.nodes);
          }
        }
      }
      return;
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : '';
      if (KEYED_CALLS.has(name) || NOT_TEXT_CALLS.has(name)) return;
      if (name === 'plural') {
        const args = node.arguments.map((a) =>
          ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a) ? a.text : null,
        );
        for (const p of pluralPatterns(args)) add(p, rel, true);
      }
    }
    // Object keys, enum members and type positions are code.
    if (ts.isLiteralTypeNode(node) || ts.isTypeNode(node)) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const parent = node.parent;
      if (parent && ts.isPropertyAssignment(parent) && parent.name === node) return;
      if (parent && ts.isElementAccessExpression(parent)) return;
      if (
        parent &&
        (ts.isBinaryExpression(parent) || ts.isCaseClause(parent) || ts.isSwitchStatement(parent))
      ) {
        // x === 'CODE' comparisons hold codes; a ?: or ?? may still hold text.
        if (ts.isBinaryExpression(parent) && /^[=!]==?$/.test(parent.operatorToken.getText()))
          return;
        if (ts.isCaseClause(parent)) return;
      }
      add(node.text, rel, true);
      return;
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      // 'Couldn't load ' + name → "Couldn't load {0}": the whole join, not its pieces.
      const parts: (string | null)[] = [];
      const values: ts.Expression[] = [];
      const flat = (e: ts.Expression): void => {
        if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken) {
          flat(e.left);
          flat(e.right);
        } else if (ts.isParenthesizedExpression(e)) flat(e.expression);
        else if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) parts.push(e.text);
        else {
          parts.push(null);
          values.push(e);
        }
      };
      flat(node);
      if (parts.some((p) => p !== null) && values.length) {
        let n = 0;
        add(parts.map((p) => p ?? `{${n++}}`).join(''), rel, true);
      } else for (const p of parts) if (p !== null) add(p, rel, true);
      values.forEach(visit);
      return;
    }
    if (ts.isTemplateExpression(node)) {
      let pattern = node.head.text;
      node.templateSpans.forEach((span, i) => {
        pattern += `{${i}}` + span.literal.text;
      });
      add(pattern, rel, true);
      node.templateSpans.forEach((span) => visit(span.expression));
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return SKIP_DIRS.has(name) ? [] : walk(p);
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') && !name.endsWith('.api.ts')
      ? [p]
      : [];
  });
}

const files = [...walk(SRC), ...EXTRA.map((f) => join(SRC, f))];
for (const f of files) codeStrings(f, relative(SRC, f).split(sep).join('/'));

const key = (s: string) => `ui.web.x.${createHash('sha1').update(s).digest('hex').slice(0, 10)}`;
const entries = [...found.keys()].sort((a, b) => a.localeCompare(b));
const out: Record<string, string> = {};
for (const s of entries) out[key(s)] = s;
const json = `${JSON.stringify(out, null, 1)}\n`;

const args = process.argv.slice(2);
if (args.includes('--stats')) {
  const byArea = new Map<string, number>();
  for (const [s, fs] of found) {
    const area = [...fs][0]!.split('/').slice(0, 2).join('/');
    byArea.set(area, (byArea.get(area) ?? 0) + 1);
    void s;
  }
  console.log(
    [...byArea]
      .sort((a, b) => b[1] - a[1])
      .map(([a, n]) => `${n}\t${a}`)
      .join('\n'),
  );
  console.log(
    `${entries.length} texts (${entries.filter((s) => /\{\d+\}/.test(s)).length} patterns), ${entries.reduce((n, s) => n + s.length, 0)} characters, from ${files.length} files`,
  );
} else if (args.includes('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (current !== json) {
    console.error('public/i18n/ui-text.en.json is out of date: run npm run ui-text');
    process.exit(1);
  }
  console.log(`ui-text up to date (${entries.length} texts)`);
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, json);
  console.log(`${entries.length} texts -> ${relative(ROOT, OUT)}`);
}
