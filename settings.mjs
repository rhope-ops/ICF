// App settings in one place: the names, defaults, limits and feature switches that another course would change to reuse
// this app. The code reads each value from here; nothing else holds a copy. Not here: the release version
// (diagnostics.mjs, set by the release steps), the theme key read by index.html before the modules load, and the
// offline cache names in sw.js (both are outside the modules).
// Inputs: none. Outputs: the constants below. Run: loaded by the browser as part of the app; tests import it in Node.
// Network: none. Writes: none. Credentials: none.

// The app's name and the prefix of every key it keeps in browser storage (a new prefix starts with empty progress).
export const APP = Object.freeze({ name: 'ICF Companion', storagePrefix: 'icf:' });

// The two levels that group the questions, as the screens name them. The code calls them group and section; the course
// calls them Block and Unit. Saved data and question IDs keep their own field names (block, units) unchanged.
export const LABEL = Object.freeze({ Group: 'Block', Groups: 'Blocks', group: 'block', groups: 'blocks',
  Section: 'Unit', Sections: 'Units', section: 'unit', sections: 'units' });

// The Questions setup's first choices: 30 questions, every source group, the Assisted help level.
export const DEFAULTS = Object.freeze({ poolSize: 30, filter: 'Slides and Text', mode: 'Assisted' });
// The question-count chips of the setup screens (plus All).
export const POOL_SIZES = Object.freeze([30, 45, 60]);
// The exam format: 30 questions, 60:00 on a wall-clock deadline, pass at 70% (21 of 30).
export const EXAM_FORMAT = Object.freeze({ size: 30, limitMs: 60 * 60 * 1000, passRatio: 0.7 });

// Course features that another course can switch off. Off: the feature's module is not loaded and its controls are
// not drawn. This course has all of them on.
// hard: the Hard help level and its questions. sourceExcerpts: source pages under an answered question.
// sourceFilter: the Slides/Text source filter of the question pool. examForms: fixed exam forms (else a Standard draw).
// cardCatalog: authored flash cards (cards.json) and the SAVE button. legacyMigrations: saves of older app versions are
// carried over by the save migrations file; off, such a save is not restored.
export const FEATURES = Object.freeze({ hard: true, sourceExcerpts: true, sourceFilter: true, examForms: true,
  cardCatalog: true, legacyMigrations: true });
