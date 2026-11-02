import { DomTranslator, buildDictionary, translateText } from './dom-translate';

const ENGLISH = {
  'ui.web.x.1': 'Save changes',
  'ui.web.x.2': '{0} students',
  'ui.web.x.3': 'Give {0} to {1}?',
  'ui.web.x.4': 'Teacher',
  'ui.web.x.5': 'Search name, admission no., mobile',
  'ui.web.x.6': 'Close',
  'ui.web.x.7': 'Not translated yet',
  'ui.web.x.8': '{0} day{1} left',
  'ui.web.x.9': '{0} inactive · {1}',
  'ui.web.x.10': '{0} inactive · {1} suspended',
  'ui.web.x.11': '{0} selected',
  'ui.web.x.12': '{0} value{1} {2} already captured',
};
const KANNADA = {
  'ui.web.x.1': 'ಬದಲಾವಣೆಗಳನ್ನು ಉಳಿಸಿ',
  'ui.web.x.2': '{0} ವಿದ್ಯಾರ್ಥಿಗಳು',
  'ui.web.x.3': '{1} ಅವರಿಗೆ {0} ನೀಡಬೇಕೇ?',
  'ui.web.x.4': 'ಶಿಕ್ಷಕ',
  'ui.web.x.5': 'ಹೆಸರು, ಪ್ರವೇಶ ಸಂಖ್ಯೆ, ಮೊಬೈಲ್ ಹುಡುಕಿ',
  'ui.web.x.6': 'ಮುಚ್ಚಿ',
  'ui.web.x.8': '{0} ದಿನ{1} ಬಾಕಿ',
  'ui.web.x.9': '{0} ನಿಷ್ಕ್ರಿಯ · {1}',
  'ui.web.x.10': '{0} ನಿಷ್ಕ್ರಿಯ · {1} ಅಮಾನತು',
  'ui.web.x.11': '{0} ಆಯ್ಕೆಯಾಗಿದೆ',
  'ui.web.x.12': '{0} ಮೌಲ್ಯ{1} ಈಗಾಗಲೇ ದಾಖಲಾಗಿದೆ{2}',
};
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('page text in the chosen language (ADR-0018)', () => {
  const dict = buildDictionary(ENGLISH, KANNADA);

  it('translates whole texts and texts with values, values included', () => {
    expect(translateText(dict, 'Save changes')).toBe('ಬದಲಾವಣೆಗಳನ್ನು ಉಳಿಸಿ');
    expect(translateText(dict, '61 students')).toBe('61 ವಿದ್ಯಾರ್ಥಿಗಳು');
    // Placeholders may change places; a value that is itself page text is translated.
    expect(translateText(dict, 'Give Teacher to Nandini Shenoy?')).toBe(
      'Nandini Shenoy ಅವರಿಗೆ ಶಿಕ್ಷಕ ನೀಡಬೇಕೇ?',
    );
    // The most specific pattern wins, and values inside a pattern are translated too.
    expect(translateText(dict, '0 inactive · 2 suspended')).toBe('0 ನಿಷ್ಕ್ರಿಯ · 2 ಅಮಾನತು');
    expect(translateText(dict, '61 students selected')).toBe('61 ವಿದ್ಯಾರ್ಥಿಗಳು ಆಯ್ಕೆಯಾಗಿದೆ');
    // A verb chosen for the count ("is"/"are") is dropped too.
    expect(translateText(dict, '3 values are already captured')).toBe('3 ಮೌಲ್ಯ ಈಗಾಗಲೇ ದಾಖಲಾಗಿದೆ');
    // An English plural ending glued to a word is dropped.
    expect(translateText(dict, '3 days left')).toBe('3 ದಿನ ಬಾಕಿ');
    expect(translateText(dict, '1 day left')).toBe('1 ದಿನ ಬಾಕಿ');
    // Data and texts without a translation stay as they are.
    expect(translateText(dict, 'Nandini Shenoy')).toBeNull();
    expect(translateText(dict, 'Not translated yet')).toBeNull();
  });

  it('swaps the page, keeps marked text, and follows what Angular writes later', async () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <h1>
        Save changes
      </h1>
      <input placeholder="Search name, admission no., mobile" value="Close">
      <span class="count">61 students</span>
      <span translate="no">Close</span>
      <textarea>Close</textarea>`;
    document.body.appendChild(root);
    const t = new DomTranslator(dict);
    t.start(root);
    expect(root.querySelector('h1')!.textContent).toBe('\n        ಬದಲಾವಣೆಗಳನ್ನು ಉಳಿಸಿ\n      ');
    const input = root.querySelector('input')!;
    expect(input.getAttribute('placeholder')).toBe('ಹೆಸರು, ಪ್ರವೇಶ ಸಂಖ್ಯೆ, ಮೊಬೈಲ್ ಹುಡುಕಿ');
    expect(input.value).toBe('Close');
    expect(root.querySelector('.count')!.textContent).toBe('61 ವಿದ್ಯಾರ್ಥಿಗಳು');
    expect(root.querySelector('[translate=no]')!.textContent).toBe('Close');
    expect(root.querySelector('textarea')!.value).toBe('Close');

    // Angular updates a bound text and adds a dialog.
    (root.querySelector('.count')!.firstChild as Text).nodeValue = '62 students';
    const dialog = document.createElement('div');
    dialog.innerHTML = '<button title="Close">Close</button>';
    root.appendChild(dialog);
    await tick();
    expect(root.querySelector('.count')!.textContent).toBe('62 ವಿದ್ಯಾರ್ಥಿಗಳು');
    expect(dialog.querySelector('button')!.textContent).toBe('ಮುಚ್ಚಿ');
    expect(dialog.querySelector('button')!.getAttribute('title')).toBe('ಮುಚ್ಚಿ');
    t.stop();
    root.remove();
  });
});
