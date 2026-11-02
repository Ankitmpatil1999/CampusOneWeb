/**
 * Copies text for a "Copy" button. The Clipboard API exists only on secure pages (HTTPS,
 * localhost); on a plain-HTTP LAN address the text is copied through a hidden text box instead
 * (client 2026-10-06: LAN test servers). Rejects when the browser refuses both.
 */
export async function copyText(text: string): Promise<void> {
  // Typed as always present, but undefined on an insecure page.
  const clipboard = (globalThis.navigator as Navigator | undefined)?.clipboard as
    Clipboard | undefined;
  if (clipboard) {
    await clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  // The older copy command is the only one a plain-HTTP page may use.
  const ok = document.execCommand('copy');
  area.remove();
  if (!ok) throw new Error('copy refused');
}
