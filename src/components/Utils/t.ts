/**
 * A web screen text (Phase 10): the language in use when it has the key, else the web's own English
 * (`strings.en.ts`), else the registers' English. Register keys (messages, statuses) work too.
 */
import { WEB_STRINGS_EN } from './strings.en';
import { activeBundle, translate } from './translate';

export function t(key: string, params: Readonly<Record<string, string | number>> = {}): string {
  const bundle = activeBundle();
  return translate(key, params, key in bundle ? bundle : WEB_STRINGS_EN);
}
