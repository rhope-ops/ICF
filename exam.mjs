// Exam Mode: pure exam logic. The caller supplies the clock (now, in ms since the epoch)
// and randomness, so tests can drive every transition. No DOM, storage or network access here.
// Fixed format: 30 questions, 60:00 on a wall-clock deadline, no pause, pass at 70% (21 of 30).
// Inputs: question banks, exam state objects, events and the current time. Outputs: new exam states, results,
// history rows and cycle records. Run: imported as an ES module by the app and the tests; not run on its own.
// Network: none.
// Writes: none (it only returns new objects; storage.mjs and the exam screens do the saving and drawing).
// Credentials: none.
import { LABEL } from './settings.mjs';
import { shuffle } from './engine.mjs';
import { servedIn } from './storage.mjs';
import { EXAM, passMark, examUnit, MIXES, MIX_LABEL, toMix, legacyPool, standardPool, sampleExam, formsFor } from './exam-draw.mjs';
export { EXAM, passMark, MIXES, MIX_LABEL, toMix, standardPool, blueprint, sampleExam, formsFor, CYCLE_SCHEMA, formStatus, countExam, restoreCycles } from './exam-draw.mjs';

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
