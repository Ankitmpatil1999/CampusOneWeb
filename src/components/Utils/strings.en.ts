/**
 * The web application's own screen texts in English (keys `ui.web.*`), for the pages that are
 * translated (Phase 10). Their drafts in the other languages are in the API's translations and reach
 * the web in the language bundle; `npx tsx scripts/translation-source.ts` lists new or changed texts.
 * Register texts (messages, statuses) are not here: they come from the registers.
 */
import { TEACHING_CLASSES_EN } from '../Pages/Console/Teaching/texts/classes.en';
import { TEACHING_MARKS_EN } from '../Pages/Console/Teaching/texts/marks.en';
import { TEACHING_SELF_EN } from '../Pages/Console/Teaching/texts/self.en';
import { TEACHING_WORK_EN } from '../Pages/Console/Teaching/texts/work.en';

export const WEB_STRINGS_EN: Readonly<Record<string, string>> = {
  // The language menu (header, sign-in)
  'ui.web.lang.label': 'Language',
  'ui.web.lang.machine': 'Machine translation — some words may read oddly',

  // Speech to text (Shared/Dictation; client 2026-10-12)
  'ui.web.dictate.start': 'Speak',
  'ui.web.dictate.stop': 'Stop',
  'ui.web.dictate.startAria': 'Speak to type',
  'ui.web.dictate.listening': 'Listening… speak now',
  'ui.web.dictate.unsupported':
    'Speech to text isn’t available in this browser. Use Chrome, Edge or Safari.',
  'ui.web.dictate.denied': 'Allow the microphone for this site to speak to type.',
  'ui.web.dictate.noMic': 'No microphone was found.',
  'ui.web.dictate.noSpeech': 'Nothing was heard. Press Speak and try again.',
  'ui.web.dictate.network': 'Speech to text needs an internet connection.',
  'ui.web.dictate.failed': 'Speech to text stopped. Press Speak to try again.',
  'ui.web.dictate.full': 'The field is full: what was said after that was left out.',

  // The Teaching menu (console)
  'ui.web.nav.teaching': 'Teaching',
  'ui.web.nav.today': 'Today',
  'ui.web.nav.marks': 'Marks',
  'ui.web.nav.attendance': 'Attendance',
  'ui.web.nav.homework': 'Homework',
  'ui.web.nav.leave': 'Student leave',
  'ui.web.nav.timetable': 'Timetable',
  'ui.web.nav.announce': 'Class announcements',
  // The teacher's own pages (client 2026-10-12), the principal's too (2026-10-13).
  'ui.web.nav.personal': 'Personal',
  'ui.web.nav.myLeave': 'My leave',
  'ui.web.nav.notices': 'Notices',
  'ui.web.nav.messages': 'Messages',
  'ui.web.nav.myAttendance': 'My attendance',
  'ui.web.nav.calendar': 'Calendar',

  // The teaching pages' own texts, one file per page group.
  ...TEACHING_MARKS_EN,
  ...TEACHING_CLASSES_EN,
  ...TEACHING_WORK_EN,
  ...TEACHING_SELF_EN,
};
