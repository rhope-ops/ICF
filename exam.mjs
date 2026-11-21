// Exam Mode: pure exam logic. The caller supplies the clock (now, in ms since the epoch)
// and randomness, so tests can drive every transition. No DOM, storage or network access here.
// Fixed format: 30 questions, 60:00 on a wall-clock deadline, no pause, pass at 70% (21 of 30).
// Inputs: question banks, exam state objects, events and the current time. Outputs: new exam states, results,
// history rows and cycle records. Run: imported as an ES module by the app and the tests; not run on its own.
// Network: none.
// Writes: none (it only returns new objects; storage.mjs and the exam screens do the saving and drawing).
// Credentials: none.
import { EXAM_FORMAT, LABEL } from './settings.mjs';
import { shuffle } from './engine.mjs';
import { servedIn } from './storage.mjs';

// The exam format (size, time limit, pass ratio) is a setting; this module's name for it is EXAM.
export const EXAM = EXAM_FORMAT;
// 21 of 30. The small epsilon keeps 0.7 * 30 from rounding to 22.
export const passMark = size => Math.ceil(size * EXAM.passRatio - 1e-9);
// A question with two units counts toward its first unit for per-unit exam scores.
const examUnit = q => q.units[0];
const DIFFICULTIES = Object.freeze(['Easy', 'Medium', 'Hard']);

// Question mix: exams made before forms existed drew by mix (Standard, Hard or Hybrid). The mix names are kept to
// label and resume those exams. A block without exam forms draws a Standard exam (see standardPool).
export const MIXES = Object.freeze(['standard', 'hard', 'hybrid']);
export const MIX_LABEL = Object.freeze({ standard: 'Standard', hard: 'Hard', hybrid: 'Hybrid' });
// Turn a stored mix value into a known mix name: an old boolean true means Hybrid, anything unknown means Standard.
export const toMix = value => MIXES.includes(value) ? value : value === true ? 'hybrid' : 'standard';
// The questions of a block that an old mix-based exam could draw: no Exam-tier items; Hard mix takes only Hard ones.
const legacyPool = (questions, block, mix) => questions.filter(q => q.block === block && q.studyMode !== 'Exam' &&
  (mix === 'hybrid' || (mix === 'hard') === (q.difficulty === 'Hard')));

// ---- Standard draw: used when the bank has no exam forms for the block ----
// The Standard draw: 30 Easy and Medium questions of the block, unit-proportional, no Hard and no Exam-tier item.
export const standardPool = (questions, block) => legacyPool(questions, block, 'standard');

/**
 * Largest-remainder apportionment of `size` across rows in proportion to their `n`. Ties go to the larger group,
 * then to the earlier row, so the result is deterministic. A row never gets more than its own `n`.
 * @param {{key: *, n: number}[]} rows the groups and how many questions each has.
 * @param {number} size the total to share out.
 * @returns {object[]} the rows with a `count` added.
 */
function largestRemainder(rows, size) {
  const total = rows.reduce((sum, r) => sum + r.n, 0);
  if (!total || size <= 0) return rows.map(r => ({ ...r, count: 0 }));
  const out = rows.map((r, i) => { const exact = r.n * size / total; return { ...r, i, count: Math.floor(exact), rest: exact - Math.floor(exact) }; });
  let left = size - out.reduce((sum, r) => sum + r.count, 0);
  for (const r of [...out].sort((a, b) => b.rest - a.rest || b.n - a.n || a.i - b.i)) {
    if (left <= 0) break;
    if (r.count < r.n) { r.count++; left--; }
  }
  return out.map(({ i, rest, ...r }) => r);
}

// The blueprint shown on the exam setup: questions per unit and per difficulty for this pool.
export function blueprint(pool, size = EXAM.size) {
  const n = Math.min(size, pool.length);
  const unitIds = [...new Set(pool.map(examUnit))].sort((a, b) => a - b);
  const units = largestRemainder(unitIds.map(id => ({ key: id, n: pool.filter(q => examUnit(q) === id).length })), n)
    .map(r => ({ id: r.key, available: r.n, count: r.count }));
  const difficulty = Object.fromEntries(largestRemainder(DIFFICULTIES.map(d => ({ key: d, n: pool.filter(q => q.difficulty === d).length })), n)
    .map(r => [r.key, { available: r.n, count: r.count }]));
  return { size: n, pool: pool.length, units, difficulty };
}

/**
 * Unit x difficulty targets whose row sums are the unit blueprint and whose column sums are the difficulty
 * blueprint. Each cell starts at the floor of its proportional share; the remaining slots are placed by
 * augmenting paths (a small max-flow), tried in a random order weighted toward the larger remainders.
 * @param {object[]} pool the exam pool questions.
 * @param {object} plan the blueprint from blueprint().
 * @param {function} random the random source.
 * @returns {{rows: number[], cols: string[], t: number[][]}} the unit ids, the difficulties and the target count per cell.
 */
function cellTargets(pool, plan, random) {
  const total = pool.length, rows = plan.units.map(u => u.id), cols = DIFFICULTIES;
  const cap = rows.map(u => cols.map(d => pool.filter(q => examUnit(q) === u && q.difficulty === d).length));
  const exact = cap.map(row => row.map(n => n * plan.size / total));
  const t = exact.map(row => row.map(Math.floor));
  const rowNeed = rows.map((_, i) => plan.units[i].count - t[i].reduce((a, b) => a + b, 0));
  const colNeed = cols.map((d, j) => plan.difficulty[d].count - t.reduce((a, row) => a + row[j], 0));
  if (rowNeed.some(n => n < 0) || colNeed.some(n => n < 0)) throw Error('Exam blueprint could not be met');
  // Edge preference: remainder plus jitter, so sampling varies between exams but follows the shares.
  const pref = exact.map(row => row.map(x => x - Math.floor(x) + random() * 0.5));
  // The column order to try for row i: highest preference first.
  const order = i => cols.map((_, j) => j).sort((a, b) => pref[i][b] - pref[i][a]);
  // add[i][j]: slots placed above the floor. Re-routing moves only these, so floors stay proportional.
  const add = rows.map(() => cols.map(() => 0));
  /**
   * Place one more slot in row i, moving an earlier added slot of another row when the column is full.
   * @param {number} i the row to place a slot for.
   * @param {Set<number>} seen the columns already tried on this path.
   * @returns {boolean} true when a slot was placed.
   */
  const augment = (i, seen) => {
    for (const j of order(i)) {
      if (t[i][j] >= cap[i][j] || seen.has(j)) continue;
      seen.add(j);
      if (colNeed[j] > 0) { t[i][j]++; add[i][j]++; colNeed[j]--; return true; }
      // Column j is full: let another row k give up one added slot in j and place it in another column.
      for (let k = 0; k < rows.length; k++) {
        if (k === i || !add[k][j]) continue;
        t[k][j]--; add[k][j]--; colNeed[j]++;
        if (augment(k, seen)) { colNeed[j]--; t[i][j]++; add[i][j]++; return true; }
        t[k][j]++; add[k][j]++; colNeed[j]--;
      }
    }
    return false;
  };
  for (const i of shuffle(rows.map((_, i) => i), random)) {
    while (rowNeed[i] > 0) {
      if (!augment(i, new Set())) throw Error('Exam blueprint could not be met');
      rowNeed[i]--;
    }
  }
  return { rows, cols, t };
}

/**
 * Stratified sample: exactly the unit and difficulty blueprint, no duplicates, in a shuffled order. A pool smaller than
 * the exam size is returned whole. Throws on duplicate question ids.
 * @param {object[]} pool the questions to draw from.
 * @param {function} [random] the random source.
 * @param {number} [size] the number of questions to draw.
 * @returns {object[]} the chosen questions.
 */
export function sampleExam(pool, random = Math.random, size = EXAM.size) {
  if (new Set(pool.map(q => q.id)).size !== pool.length) throw Error('Duplicate questions in the exam pool');
  const plan = blueprint(pool, size);
  if (plan.size < size) return shuffle(pool, random);
  // Walk a random permutation and keep a question while its unit and its difficulty both have room. Every question
  // gets a fair chance inside the quotas. A walk that ends short (rare) is retried; the cell plan is the fallback.
  for (let attempt = 0; attempt < 200; attempt++) {
    const unitLeft = new Map(plan.units.map(u => [u.id, u.count])), diffLeft = new Map(DIFFICULTIES.map(d => [d, plan.difficulty[d].count]));
    const picked = [];
    for (const q of shuffle(pool, random)) {
      const u = examUnit(q);
      if (unitLeft.get(u) > 0 && diffLeft.get(q.difficulty) > 0) { picked.push(q); unitLeft.set(u, unitLeft.get(u) - 1); diffLeft.set(q.difficulty, diffLeft.get(q.difficulty) - 1); }
    }
    if (picked.length === plan.size) return shuffle(picked, random);
  }
  return sampleByCells(pool, random, size);
}
// Fallback (and tested on its own): fixed unit x difficulty cell targets, then a random pick inside each cell.
function sampleByCells(pool, random = Math.random, size = EXAM.size) {
  const plan = blueprint(pool, size);
  const { rows, cols, t } = cellTargets(pool, plan, random), chosen = [];
  rows.forEach((u, i) => cols.forEach((d, j) => {
    chosen.push(...shuffle(pool.filter(q => examUnit(q) === u && q.difficulty === d), random).slice(0, t[i][j]));
  }));
  return shuffle(chosen, random);
}

// ---- Exam forms ----
// bank.examForms[block] = { order: ['A', 'B'], forms: { A: [ids], B: [ids] }, rules }. Forms are taken in order; any
// submitted exam counts (an automatic submit at 0:00 too). When every form is taken a new cycle starts with the same
// forms. Every exam has a random question order and random answer order. Exams without a form (the Standard draw, and
// every exam made before forms existed) do not count toward the cycle.
export const formsFor = (bank, block) => bank?.examForms?.[String(block)] || null;
// Cycle state (icf:examCycle, schema 1): per block { cycle, taken: [form names this cycle], counted: [exam ids] }.
// counted keeps a submitted exam from counting twice (results are finalized again on every load).
export const CYCLE_SCHEMA = 1;
const COUNTED_MAX = 50;
// The cycle record of a block, or a fresh one (cycle 1, nothing taken) when there is none.
const blockState = (cycles, block) => cycles?.blocks?.[String(block)] || { cycle: 1, taken: [], counted: [] };
// Report where a block stands: its cycle number, the forms taken in it and the next form to take (null when none).
export const formStatus = (cycles, forms, block) => {
  const st = blockState(cycles, block);
  return { cycle: st.cycle, taken: [...st.taken], next: forms ? forms.order.find(n => !st.taken.includes(n)) ?? null : null };
};
/**
 * Count a submitted form exam once: its form joins `taken`, and a full set of forms opens the next cycle.
 * @param {object} cycles the current cycle record.
 * @param {object} exam the exam.
 * @param {object} forms the block's forms (`order` and `forms`).
 * @returns {object} a new cycle record.
 */
export function countExam(cycles, exam, forms) {
  const next = { schema: CYCLE_SCHEMA, blocks: structuredClone(cycles?.blocks || {}) };
  if (!exam?.submitted || !exam.form || !forms?.order.includes(exam.form)) return next;
  const st = structuredClone(blockState(next, exam.block));
  if (st.counted.includes(exam.id)) return next;
  st.counted = [...st.counted, exam.id].slice(-COUNTED_MAX);
  if (!st.taken.includes(exam.form)) st.taken.push(exam.form);
  if (forms.order.every(n => st.taken.includes(n))) { st.cycle++; st.taken = []; }
  next.blocks[String(exam.block)] = st;
  return next;
}
/**
 * Restore the cycle record. Known version only: schema 1 with forms the bank knows. Missing (first run with forms) or
 * unreadable state is rebuilt from exam history, which records each form exam, so no taken form is lost.
 * @param {*} raw the saved record.
 * @param {object[]} history the exam history rows.
 * @param {object} bank the question bank with its exam forms.
 * @returns {object} a valid cycle record.
 */
export function restoreCycles(raw, history, bank) {
  const valid = raw && raw.schema === CYCLE_SCHEMA && raw.blocks && typeof raw.blocks === 'object' && !Array.isArray(raw.blocks) &&
    Object.entries(raw.blocks).every(([key, st]) => { const f = formsFor(bank, key);
      return f && st && Number.isInteger(st.cycle) && st.cycle >= 1 && Array.isArray(st.taken) && new Set(st.taken).size === st.taken.length &&
        st.taken.length < f.order.length && st.taken.every(n => f.order.includes(n)) && Array.isArray(st.counted) && st.counted.length <= COUNTED_MAX &&
        st.counted.every(id => typeof id === 'string'); });
  if (valid) return { schema: CYCLE_SCHEMA, blocks: structuredClone(raw.blocks) };
  let cycles = { schema: CYCLE_SCHEMA, blocks: {} };
  for (const h of [...history].filter(h => h.form).sort((a, b) => a.at - b.at))
    cycles = countExam(cycles, { id: h.id, block: h.block, form: h.form, submitted: true }, formsFor(bank, h.block));
  return cycles;
}

/**
 * Start an exam. With a form (bank.examForms has forms for the block) the exam is that form in a random order; without
 * one it is the Standard draw. The caller passes form and formIds from formStatus, or neither. Throws on bad setup.
 * @param {object[]} questions the bank's questions.
 * @param {object} options version, block, form, formIds, cycle, now (ms), id and random.
 * @returns {object} the new exam state.
 */
export function startExam(questions, { version, block, form, formIds, cycle = 1, now, id, random = Math.random }) {
  if (!version || !Number.isFinite(now) || !id) throw Error('Invalid exam setup');
  let picked, kind;
  if (form !== undefined && form !== null) {
    if (!Array.isArray(formIds) || !Number.isInteger(cycle) || cycle < 1) throw Error('Invalid exam setup');
    const byId = new Map(questions.map(q => [q.id, q])), list = formIds.map(x => byId.get(x));
    if (list.length !== EXAM.size || list.some(q => !q || q.block !== block || q.studyMode !== 'Exam')) throw Error('This exam form is not available.');
    picked = shuffle(list, random); kind = { form, cycle };
  } else {
    const pool = standardPool(questions, block);
    if (pool.length < EXAM.size) throw Error('Not enough questions for an exam');
    picked = sampleExam(pool, random); kind = { mix: 'standard', includeHard: false };
  }
  return { schema: 1, kind: 'exam', id, version, block, ...kind, size: picked.length,
    startedAt: now, deadline: now + EXAM.limitMs, pool: picked.map(q => q.id),
    orders: Object.fromEntries(picked.map(q => [q.id, shuffle(q.answers.map(a => a.id), random)])),
    answers: Object.fromEntries(picked.map(q => [q.id, null])), changes: [], flagged: [], index: 0,
    submitted: false, submittedAt: null, timedOut: false, study: null };
}

// Time left in ms, never below 0.
export const remainingMs = (exam, now) => Math.max(0, exam.deadline - now);
// True when there is an exam that has not been submitted.
export const examLive = exam => Boolean(exam && !exam.submitted);
// Submit the exam state `s` at time `at` (not after the deadline); `timedOut` says whether the clock ended it.
const close = (s, at, timedOut) => { s.submitted = true; s.submittedAt = Math.min(at, s.deadline); s.timedOut = timedOut; s.index = 0; return s; };

/**
 * Apply one event to an exam and return the new state. Every event first checks the deadline: at or after 0:00 the exam
 * is submitted (blanks score wrong) and the event is dropped.
 * @param {object} exam the current exam, or null.
 * @param {object} event an object with a `type` (answer, goto, next, previous, nextBlank, flag, submit or tick) and its data.
 * @param {number} now the clock in ms.
 * @returns {object} the new exam, or the same exam when nothing changed.
 */
export function examEvent(exam, event, now) {
  if (!exam || exam.submitted) return exam;
  if (!Number.isFinite(now)) throw Error('Invalid clock');
  const s = structuredClone(exam);
  if (now >= s.deadline) return close(s, s.deadline, true);
  const id = s.pool[s.index];
  switch (event.type) {
    case 'answer': {
      if (!s.orders[id].includes(event.id)) throw Error('Unknown answer');
      if (s.answers[id] === event.id) return exam;
      // Every selection is kept, the first one too (from: null), for right-to-wrong and wrong-to-right counts.
      s.changes.push({ questionId: id, from: s.answers[id], to: event.id, atMs: Math.max(0, now - s.startedAt) });
      s.answers[id] = event.id; return s;
    }
    case 'goto':
      if (!Number.isInteger(event.index) || event.index < 0 || event.index >= s.pool.length) throw Error('Invalid question');
      s.index = event.index; return s;
    case 'next': s.index = Math.min(s.pool.length - 1, s.index + 1); return s;
    case 'previous': s.index = Math.max(0, s.index - 1); return s;
    case 'nextBlank': {
      const n = s.pool.length;
      for (let step = 1; step <= n; step++) { const i = (s.index + step) % n; if (s.answers[s.pool[i]] === null) { s.index = i; break; } }
      return s;
    }
    case 'flag':
      s.flagged = s.flagged.includes(id) ? s.flagged.filter(x => x !== id) : [...s.flagged, id]; return s;
    case 'submit': return close(s, now, false);
    case 'tick': return exam;
    default: throw Error('Unknown exam event');
  }
}

// Count answered, blank and flagged questions of an exam, with the question numbers of the blank and flagged ones.
export function examCounts(exam) {
  const answered = exam.pool.filter(id => exam.answers[id] !== null).length;
  return { answered, blank: exam.pool.length - answered, flagged: exam.flagged.length,
    blankNumbers: exam.pool.map((id, i) => exam.answers[id] === null ? i + 1 : 0).filter(Boolean),
    flaggedNumbers: exam.pool.map((id, i) => exam.flagged.includes(id) ? i + 1 : 0).filter(Boolean) };
}

/**
 * Per question: the first selection and the final one. A question counts as changed when they differ.
 * @param {object} exam the exam.
 * @param {object[]} questions the bank's questions.
 * @returns {object} counts of changes (wrong to right, right to wrong, wrong to wrong), the net and the changed ids.
 */
function changeSummary(exam, questions) {
  const byId = new Map(questions.map(q => [q.id, q]));
  let changed = 0, wrongToRight = 0, rightToWrong = 0, wrongToWrong = 0;
  const changedIds = [];
  for (const id of exam.pool) {
    const picks = exam.changes.filter(c => c.questionId === id), first = picks[0]?.to ?? null, last = exam.answers[id];
    if (first === null || first === last) continue;
    const key = byId.get(id).correctAnswerId;
    changed++; changedIds.push(id);
    if (first !== key && last === key) wrongToRight++;
    else if (first === key && last !== key) rightToWrong++;
    else wrongToWrong++;
  }
  return { changed, wrongToRight, rightToWrong, wrongToWrong, net: wrongToRight - rightToWrong, changedIds,
    switches: exam.changes.filter(c => c.from !== null).length };
}

// Snapshot of study first-answer accuracy (exam answers excluded) taken at submit, so the practice gap stays fixed.
export const withStudySnapshot = (exam, study) => ({ ...structuredClone(exam), study: structuredClone(study) });

/**
 * Score an exam: per-question items, totals, pass or fail, time used, per-unit scores and the gap to study accuracy.
 * @param {object} exam the exam.
 * @param {object[]} questions the bank's questions.
 * @param {object[]} [blocks] the blocks, used for unit titles.
 * @returns {object} the results object.
 */
export function examResults(exam, questions, blocks = []) {
  const byId = new Map(questions.map(q => [q.id, q])), size = exam.pool.length, mark = passMark(size);
  const items = exam.pool.map((id, i) => {
    const q = byId.get(id), picked = exam.answers[id];
    return { id, number: i + 1, q, picked, blank: picked === null, correct: picked === q.correctAnswerId, flagged: exam.flagged.includes(id) };
  });
  const correct = items.filter(r => r.correct).length, blank = items.filter(r => r.blank).length;
  const changes = changeSummary(exam, questions);
  for (const r of items) r.changed = changes.changedIds.includes(r.id);
  const end = exam.submitted ? exam.submittedAt : exam.deadline, timeUsedMs = Math.max(0, Math.min(EXAM.limitMs, end - exam.startedAt));
  const block = blocks.find(b => b.id === exam.block);
  const unitIds = [...new Set(items.map(r => examUnit(r.q)))].sort((a, b) => a - b);
  const study = exam.study, studyRow = id => study?.rows?.find(r => r.id === id) || null;
  const units = unitIds.map(id => {
    const rows = items.filter(r => examUnit(r.q) === id), s = studyRow(id);
    return { id, title: block?.units.find(u => u.id === id)?.title || `${LABEL.Section} ${id}`, correct: rows.filter(r => r.correct).length, total: rows.length,
      lowConfidence: rows.length <= 3, study: s && s.asked ? s.correct / s.asked : null, studyAsked: s?.asked || 0 };
  });
  const pct = size ? correct / size : 0, studyAccuracy = study?.asked ? study.correct / study.asked : null;
  return { size, correct, wrong: size - correct - blank, blank, pct, pass: correct >= mark, passMark: mark, margin: correct - mark,
    timeUsedMs, secondsPerQuestion: size ? timeUsedMs / 1000 / size : 0, timedOut: exam.timedOut, changes, items, units,
    studyAccuracy, studyAsked: study?.asked || 0, gap: studyAccuracy === null ? null : pct - studyAccuracy };
}

// Review filters on the results screen.
export const REVIEW_FILTERS = Object.freeze(['missed', 'blank', 'changed', 'flagged', 'all']);
// Return the result items that match a review filter; throw for an unknown filter.
export function reviewItems(results, filter) {
  const test = { missed: r => !r.correct, blank: r => r.blank, changed: r => r.changed, flagged: r => r.flagged, all: () => true }[filter];
  if (!test) throw Error('Unknown review filter');
  return results.items.filter(test);
}

// Stats adapter: the submitted exam as a session that analytics.recordSession understands. Only answered
// questions are recorded (a blank is no answer); each has one appearance, so a change before submit is not a second try.
export function examSession(exam, questions) {
  const byId = new Map(questions.map(q => [q.id, q]));
  const answered = exam.pool.map((id, i) => ({ id, appearance: i + 1 })).filter(r => exam.answers[r.id] !== null);
  return { id: exam.id, kind: 'exam', questions: answered.map(r => byId.get(r.id)), history: answered, current: null,
    attempts: answered.map(r => ({ questionId: r.id, answerId: exam.answers[r.id], appearance: r.appearance, correct: exam.answers[r.id] === byId.get(r.id).correctAnswerId })),
    activeMs: Math.max(0, Math.min(EXAM.limitMs, (exam.submittedAt ?? exam.deadline) - exam.startedAt)), finished: true, ended: false };
}

// History: one compact row per submitted exam, newest last, at most 100. A form exam records its form and cycle;
// an older exam keeps its mix. The label is "Version A", or the mix name for an older exam.
export const examMix = exam => toMix(exam?.mix ?? exam?.includeHard);
// The label of an exam: its form name for a form exam, else the name of its mix.
export const examLabel = exam => exam?.form ? `Version ${exam.form}` : MIX_LABEL[examMix(exam)];
// Build the compact history row of a submitted exam from its results.
export const historyEntry = (exam, r) => ({ id: exam.id, at: exam.submittedAt, block: exam.block,
  ...(exam.form ? { form: exam.form, cycle: exam.cycle } : { includeHard: exam.includeHard, mix: examMix(exam) }),
  correct: r.correct, size: r.size, pass: r.pass, timedOut: exam.timedOut, timeUsedMs: r.timeUsedMs });
// Add an entry to the history, replacing one with the same id, sorted by time, keeping the latest 100.
export function addHistory(history, entry) {
  return [...history.filter(h => h.id !== entry.id), entry].sort((a, b) => a.at - b.at).slice(-100);
}
// Keep only the history rows that are well formed (at most 100); an old row gets its mix filled in.
export function restoreHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(h => h && typeof h.id === 'string' && Number.isFinite(h.at) && Number.isInteger(h.block) && Number.isInteger(h.size) && h.size > 0 &&
    Number.isInteger(h.correct) && h.correct >= 0 && h.correct <= h.size && typeof h.pass === 'boolean' &&
    (h.form !== undefined ? /^[A-Z]$/.test(h.form) && Number.isInteger(h.cycle) && h.cycle >= 1 : typeof h.includeHard === 'boolean' && (h.mix === undefined || MIXES.includes(h.mix))) &&
    typeof h.timedOut === 'boolean' && Number.isFinite(h.timeUsedMs)).slice(-100).map(h => h.form !== undefined ? { ...h } : { ...h, mix: toMix(h.mix ?? h.includeHard) });
}

/**
 * Restore a saved exam (in progress or the last submitted one). Anything that does not match the current bank is
 * dropped (null is returned). An exam saved under an earlier content version is kept (and moved to this version) when
 * that version is a pinned migration of the bank and every question in it is still served: the same rule as compact
 * study sessions. The migrations are those attached from migrations.json (storage.attachMigrations); without them an
 * older exam is not restored. A form exam must hold exactly its form; an older exam (no form) must hold questions its
 * mix allowed, so an exam in progress from before forms stays resumable and still counts in stats, but not toward the
 * form cycle. A form exam in progress whose form changed since it was saved keeps going (followForm, below).
 * @param {*} raw the saved exam.
 * @param {object} bank the current question bank.
 * @param {function} [random] the random source, used when answers must be reshuffled.
 * @returns {object|null} the valid exam, or null.
 */
export function restoreExam(raw, bank, random = Math.random) {
  try {
    if (!raw || raw.schema !== 1 || raw.kind !== 'exam' || typeof raw.id !== 'string' || !raw.id) return null;
    if (raw.version !== bank.version) {
      const pinned = bank.migrations?.find(m => m.version === raw.version);
      if (!pinned || !Array.isArray(raw.pool) || raw.pool.some(id => !servedIn(pinned, bank, id))) return null;
      raw = followForm(raw, bank, random);
    }
    const byId = new Map(bank.questions.map(q => [q.id, q]));
    const { pool, orders, answers, changes, flagged } = raw;
    if (!Array.isArray(pool) || !pool.length || pool.length > EXAM.size || new Set(pool).size !== pool.length || pool.some(id => !byId.has(id))) return null;
    let extra;
    if (raw.form !== undefined) {
      const ids = formsFor(bank, raw.block)?.forms?.[raw.form];
      if (!Array.isArray(ids) || ids.length !== pool.length || pool.some(id => !ids.includes(id)) || !Number.isInteger(raw.cycle) || raw.cycle < 1) return null;
      extra = {};
    } else {
      if (typeof raw.includeHard !== 'boolean' || raw.mix !== undefined && !MIXES.includes(raw.mix)) return null;
      const mix = toMix(raw.mix ?? raw.includeHard), allowed = new Set(legacyPool(bank.questions, raw.block, mix).map(q => q.id));
      if (pool.some(id => !allowed.has(id))) return null;
      extra = { mix };
    }
    if (raw.size !== pool.length) return null;
    if (!Number.isFinite(raw.startedAt) || raw.deadline !== raw.startedAt + EXAM.limitMs) return null;
    if (!orders || !answers || pool.some(id => {
      const q = byId.get(id), order = orders[id], ids = q.answers.map(a => a.id);
      return !Array.isArray(order) || order.length !== ids.length || new Set(order).size !== order.length || order.some(a => !ids.includes(a)) ||
        !(answers[id] === null || ids.includes(answers[id]));
    })) return null;
    if (!Array.isArray(flagged) || new Set(flagged).size !== flagged.length || flagged.some(id => !pool.includes(id))) return null;
    if (!Array.isArray(changes) || changes.some(c => !c || !pool.includes(c.questionId) || !orders[c.questionId].includes(c.to) ||
      !(c.from === null || orders[c.questionId].includes(c.from)) || !Number.isFinite(c.atMs))) return null;
    // The last recorded selection must be the saved answer.
    if (pool.some(id => { const last = changes.filter(c => c.questionId === id).at(-1); return (last?.to ?? null) !== answers[id]; })) return null;
    if (!Number.isInteger(raw.index) || raw.index < 0 || raw.index >= pool.length || typeof raw.submitted !== 'boolean' || typeof raw.timedOut !== 'boolean') return null;
    if (raw.submitted && (!Number.isFinite(raw.submittedAt) || raw.submittedAt < raw.startedAt || raw.submittedAt > raw.deadline)) return null;
    if (!raw.submitted && raw.submittedAt !== null) return null;
    return { ...structuredClone(raw), ...extra, version: bank.version };
  } catch { return null; }
}
/**
 * Follow a form change. A served-bank migration may map, per block and form, each item that left a form (withdrawn,
 * or moved to the other form) to the item that took its place (examFormChanges). A form exam in progress saved under a
 * pinned earlier version keeps its answers, flags and changes; each item that left its form becomes the item that took
 * its place, in the same position, unanswered, with a new answer order. A submitted exam is never rewritten (its
 * score is already in history): it goes to the usual checks.
 * @param {object} raw the saved exam.
 * @param {object} bank the current question bank.
 * @param {function} random the random source for the new answer orders.
 * @returns {object} the updated copy, or the exam as it was when nothing applies.
 */
function followForm(raw, bank, random) {
  if (raw.submitted !== false || raw.form === undefined || !Array.isArray(raw.pool)) return raw;
  const form = formsFor(bank, raw.block)?.forms?.[raw.form];
  if (!Array.isArray(form) || raw.pool.every(id => form.includes(id))) return raw;
  const map = Object.assign({}, ...(bank.migrations || []).map(m => m.examFormChanges?.[String(raw.block)]?.[raw.form] || {}));
  // Follow the replacement map from an old item to the item now in the form (at most 8 steps).
  const follow = id => { let next = id; for (let n = 0; n < 8 && !form.includes(next) && typeof map[next] === 'string'; n++) next = map[next]; return next; };
  const byId = new Map(bank.questions.map(q => [q.id, q]));
  const pool = raw.pool.map(follow), left = raw.pool.filter((id, i) => pool[i] !== id);
  if (!left.length || pool.some(id => !form.includes(id) || !byId.has(id)) || new Set(pool).size !== pool.length ||
    !raw.orders || !raw.answers || !Array.isArray(raw.changes) || !Array.isArray(raw.flagged)) return raw;
  const s = structuredClone(raw);
  s.pool = pool;
  raw.pool.forEach((id, i) => {
    if (pool[i] === id) return;
    delete s.orders[id]; delete s.answers[id];
    s.orders[pool[i]] = shuffle(byId.get(pool[i]).answers.map(a => a.id), random); s.answers[pool[i]] = null;
  });
  s.changes = s.changes.filter(c => !left.includes(c?.questionId));
  s.flagged = s.flagged.filter(id => !left.includes(id));
  return s;
}
// After a reload: an exam whose deadline passed while the app was closed is submitted at the deadline.
export const settleExam = (exam, now) => exam && !exam.submitted && now >= exam.deadline ? close(structuredClone(exam), exam.deadline, true) : exam;
