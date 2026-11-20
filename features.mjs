// Course features that settings.mjs can switch off: what each switch leaves out of the loaded question file, and the
// help levels the setup screens offer. Pure functions: the switches come in as an argument (settings.FEATURES by
// default), so tests can try every combination. The other gates sit where each feature starts: data-load.mjs (source
// excerpts, card file), app.mjs (save migrations), session.mjs (bookmark move) and screens.mjs (Cards tile).
// Inputs: the parsed question file. Outputs: the file with switched-off parts left out; the list of help levels.
// Run: loaded by the browser as part of the app; tests import it in Node.
// Network: none. Writes: none. Credentials: none.
import { STUDY_MODES } from './engine.mjs';
import { FEATURES } from './settings.mjs';

/** The question file with what a switched-off feature brings in left out: Hard questions (hard), the exam forms
 * (examForms: every exam is then a Standard draw), and a missing source group read as slides (sourceFilter: a course
 * without the Slides/Text split). With every feature on, the same object comes back unchanged.
 * @param {object} raw the parsed question file (before validateBank, which reports a broken file)
 * @param {object} features the switches (settings.FEATURES by default)
 * @returns {object} the question file to validate and use
 */
export function withFeatures(raw, features = FEATURES) {
  if (!raw || !Array.isArray(raw.questions)) return raw;
  let questions = raw.questions;
  if (!features.hard) questions = questions.filter(q => q.studyMode !== 'Hard');
  if (!features.sourceFilter) questions = questions.map(q => q.sourceGroup ? q : { ...q, sourceGroup: 'slides' });
  const out = questions === raw.questions ? raw : { ...raw, questions };
  if (features.examForms || out.examForms === undefined) return out;
  const { examForms, ...rest } = out;
  return rest;
}

// The help levels the setup screens offer: Hard only while the hard feature is on.
export const studyModes = (features = FEATURES) => features.hard ? STUDY_MODES : STUDY_MODES.filter(m => m !== 'Hard');
