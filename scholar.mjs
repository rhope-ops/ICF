// Scholar: pure lookups over scholar.json, the block files and the saved Scholar place. No DOM, storage or
// network access. Every text shown comes from a block file, one item per concept entry (no facets).
// Sample answers are practice only: they never enter stats, Results, missed cards or exam cycles.
// Inputs: scholar.json (the index), the block files, a saved Scholar place and the user's moves. Outputs: new place and
// lookup objects and lists. Run: imported as an ES module by the app and the tests; it is not run on its own.
// Network: none.
// Writes: none (the caller saves the place that moveScholar and restoreScholarState return).
// Credentials: none.

import { typeOf, isIdx, isPerm, unitsOf, itemsFor, itemById, pickKey, triesOf, same, decisionDone } from './scholar-data.mjs';
export { typeOf, restoreScholar, addScholarBlock, blockLoaded, unitsOf, itemsFor, itemById, itemForEntry, SCHOLAR_STATE_SCHEMA, pickKey, triesOf, newScholarState, triesFit, scholarStateShape, restoreScholarState, refitScholarState } from './scholar-data.mjs';
import { shuffle } from './engine.mjs';

// ---- Row order of sort and order tasks (readers saw sort rows always alternate left-right-left) ----
// The app shows the rows of a sort task and the cards of an order task in an order shuffled once per question: the
// same question id always gives the same order, so a return visit looks the same. Rows keep their item index, so
// saved picks, the key and the blind ledger do not change. ROW_TRIES: seeds tried before the authored order is kept.
const ROW_TRIES = 64;
// A seeded random source (mulberry32) from a text: the same text always gives the same numbers.
function seededRandom(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => { h = (h + 0x6D2B79F5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// True when a sequence of groups (0/1) gives the answer away by its pattern: all of one group first, strict
// alternation over 4 or more rows, or more than 3 of one group in a row.
function patterned(groups) {
  const asc = groups.join() === [...groups].sort().join(), desc = groups.join() === [...groups].sort().reverse().join();
  let run = 1, longest = 1, flips = 0;
  for (let i = 1; i < groups.length; i++) { if (groups[i] === groups[i - 1]) run++; else { run = 1; flips++; } longest = Math.max(longest, run); }
  return asc || desc || (groups.length >= 4 && flips === groups.length - 1) || longest > 3;
}
/**
 * The display order of a sort task's rows or an order task's cards: item indexes, top to bottom.
 * @param {object} qn a sort or order question (with its id)
 * @returns {number[]|null} the order, or null for other question types
 */
export function rowOrder(qn) {
  const t = typeOf(qn);
  if (t !== 'sort' && t !== 'order') return null;
  const n = t === 'sort' ? qn.items.length : qn.steps.length, authored = [...Array(n).keys()], random = seededRandom(qn.id);
  // An order task never starts solved, nor with more than half its cards already in place.
  const bad = p => t === 'sort' ? patterned(p.map(i => qn.key[i])) : p.filter((v, i) => v === qn.key[i]).length > n / 2;
  for (let k = 0; k < ROW_TRIES; k++) { const p = shuffle(authored, random); if (!bad(p)) return p; }
  return authored;
}

// Scholar question in the shape of a bank question, so its answers are the same tiles as in the other modes (answersHtml).
export const scholarQuestion = qn => ({ id: qn.id, correctAnswerId: String(qn.key), answers: qn.answers.map((a, i) => ({ id: String(i), text: a.text, rationale: a.why })) });
// tries: this question's picks in order. As in the other modes, a wrong pick flips with its own why (the Assisted flip);
// the right pick or a second wrong one resolves the question and shows every why.
export const scholarAnswerState = (qn, tries = [], max = 2) => {
  const wrong = tries.filter(i => i !== qn.key).map(String);
  return { order: qn.answers.map((_, i) => String(i)), resolved: tries.includes(qn.key) ? 'correct' : tries.length >= max ? 'revealed' : null, stage: 0, eliminated: [], flippedWrong: wrong, wrongIds: wrong };
};
// One branch decision in the answer-tile shape (2-3 choices; it ends after min(2, choices - 1) wrong picks).
export const decisionQuestion = (qn, k) => ({ id: `${qn.id}-D${k}`, key: qn.steps[k].key, answers: qn.steps[k].choices });
// The arrangement on screen of an order or sort task: the one being built (drafts, by question id), else the last
// check, else the shuffled display order (order) or no groups (sort); null for other types.
export function draftOf(qn, tries = [], drafts = new Map()) {
  const t = typeOf(qn);
  if (t !== 'order' && t !== 'sort') return null;
  return drafts.get(qn.id) || (tries.length ? [...tries[tries.length - 1]] : t === 'order' ? rowOrder(qn) : qn.items.map(() => null));
}

// ---- Picture timing, progress, next unit and term search (pure helpers of the Scholar screens) ----
// Limits of a picture step's time in ms: reading at about 200 words a minute (0.3 s a word after 1.2 s to look at the drawing).
const PIC_MS = { min: 4000, max: 10000, base: 1200, perWord: 300 };
// Time per picture step or part: long enough to read its caption, never under 4 s or over 10 s.
export const picMs = caption => Math.min(PIC_MS.max, Math.max(PIC_MS.min, PIC_MS.base + PIC_MS.perWord * String(caption || '').split(/\s+/).filter(Boolean).length));
/**
 * Terms of a block with every guided question right, per unit and in all.
 * @param {object} s the Scholar lookup; @param {object} state the saved place (its picks); @param {number} block the block
 * @returns {{units: Object<number, {done: number, total: number}>, all: {done: number, total: number}}}
 */
export function progressOf(s, state, block) {
  const units = {}, all = { done: 0, total: 0 };
  for (const u of unitsOf(s, block)) {
    const its = itemsFor(s, block, u), done = its.filter(it => it.questions.every(q => right(q, triesOf(state, q)))).length;
    units[u] = { done, total: its.length }; all.done += done; all.total += its.length;
  }
  return { units, all };
}
/**
 * What the Scholar term list shows for the saved place: its units and items, right answers per item, the next term to
 * study, progress per unit, the first term of the next unit, and the term search matches.
 * @param {object} s the Scholar lookup; @param {object} state the saved place; @param {string} query the search text
 * @param {Function} shortOf entry id to its glossary short definition
 * @returns {{units: number[], items: object[], done: Object<string, number>, todo: object|null, unitDone: object, nextUnit: number|null, matches: object[]}}
 */
export function listModel(s, state, query = '', shortOf = () => '') {
  const units = unitsOf(s, state.block), items = itemsFor(s, state.block, state.unit);
  const done = Object.fromEntries(units.flatMap(u => itemsFor(s, state.block, u)).map(it => [it.id, it.questions.filter(q => right(q, triesOf(state, q))).length]));
  return { units, items, done, todo: items.find(it => done[it.id] < it.questions.length) || null, unitDone: progressOf(s, state, state.block).units,
    nextUnit: nextUnit(s, state), matches: matchItems(s, state.block, query, shortOf) };
}
// The unit after the place's unit in its block, or null on the last unit.
export const nextUnit = (s, state) => { const us = unitsOf(s, state.block); return us[us.indexOf(state.unit) + 1] ?? null; };
// Term search: the items of a block whose term, covered terms, short definition (shortOf(entry)) or summary hold every
// word of the query, case aside; [] for an empty query.
function matchItems(s, block, query, shortOf = () => '') {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return unitsOf(s, block).flatMap(u => itemsFor(s, block, u)).filter(it => {
    const text = [it.term, ...(it.covers || []).map(c => c.term), shortOf(it.entry) || '', it.summary].join(' ').toLowerCase();
    return words.every(w => text.includes(w));
  });
}

/**
 * Apply one move to the saved place and return the new place (the same place when the move does nothing). Moves: open a
 * unit, open an item, answer the shown question, go to a question, leave the item. For an answer, the event carries
 * {index} for choose / tap and the current branch decision, or {value: array} for an order or sort check.
 * @param {object} state the saved place.
 * @param {object} event an object with a `type` (unit, item, list, reset, seen, answer or question) and its data.
 * @param {object} s the Scholar lookup.
 * @returns {object} the new place.
 */
export function moveScholar(state, event, s) {
  const next = { ...state, seen: [...(state.seen || [])], picks: Object.fromEntries(Object.entries(state.picks).map(([k, v]) => [k, v.map(x => Array.isArray(x) ? [...x] : x)])) };
  if (event.type === 'unit') return { ...next, unit: event.unit, item: null, q: 0 };
  if (event.type === 'item') { const it = itemById(s, event.id); return it ? { ...next, block: it.block, unit: it.unit, item: it.id, q: 0 } : state; }
  if (event.type === 'list') return { ...next, item: null, q: 0 };
  // seen: the term was read (its reading sections start closed on later visits).
  // reset: clear the picks of one term;
  // the place moves to its question 1.
  if (event.type === 'reset') {
    const it = itemById(s, event.item); if (!it) return state;
    for (const x of it.questions) delete next.picks[pickKey(x)];
    return { ...next, q: 0 };
  }
  if (event.type === 'seen') return next.seen.includes(event.id) || !itemById(s, event.id) ? state : { ...next, seen: [...next.seen, event.id] };
  const it = itemById(s, state.item); if (!it) return state;
  if (event.type === 'answer') {
    const qn = it.questions[state.q];
    const pk = qn && pickKey(qn);
    if (!qn || resolved(qn, next.picks[pk])) return state;
    const t = typeOf(qn), tries = next.picks[pk] || [];
    if (t === 'choose' || t === 'tap') {
      if (tries.includes(event.index) || !isIdx(event.index, 4)) return state;
      next.picks[pk] = [...tries, event.index];
    } else if (t === 'order' || t === 'sort') {
      const ok = t === 'order' ? isPerm(event.value, qn.steps.length) : Array.isArray(event.value) && event.value.length === qn.items.length && event.value.every(g => g === 0 || g === 1);
      if (!ok || tries.some(x => same(x, event.value))) return state;
      next.picks[pk] = [...tries, [...event.value]];
    } else {
      const k = currentDecision(qn, tries), d = qn.steps[k], now = tries[k] || [];
      if (!isIdx(event.index, d.choices.length) || now.includes(event.index)) return state;
      next.picks[pk] = [...tries.slice(0, k), [...now, event.index]];
    }
    return next;
  }
  if (event.type === 'question') return { ...next, q: Math.min(Math.max(event.index, 0), it.questions.length - 1) };
  return state;
}
// The branch decision on screen: the first one not over, or the last one.
export function currentDecision(qn, tries = []) {
  for (let k = 0; k < qn.steps.length; k++) if (!decisionDone(qn.steps[k], tries[k])) return k;
  return qn.steps.length - 1;
}
export { decisionDone };
// A question is done after the right answer or the last allowed try. right: the right answer was found (for a branch, every
// decision's key was found).
export function resolved(qn, tries = []) {
  const t = typeOf(qn);
  if (t === 'choose' || t === 'tap') return tries.includes(qn.key) || tries.length >= 2;
  if (t === 'order' || t === 'sort') return tries.some(x => same(x, qn.key)) || tries.length >= 2;
  return tries.length === qn.steps.length && qn.steps.every((d, k) => decisionDone(d, tries[k]));
}
// True when the question was answered right (for a branch, every decision's key was found).
export function right(qn, tries = []) {
  const t = typeOf(qn);
  if (t === 'choose' || t === 'tap') return tries.includes(qn.key);
  if (t === 'order' || t === 'sort') return tries.some(x => same(x, qn.key));
  return resolved(qn, tries) && qn.steps.every((d, k) => tries[k].includes(d.key));
}
// Per element of an order or sort check: true where it matches the key (the marks after a wrong check).
export const checkMarks = (qn, value) => value.map((x, i) => x === qn.key[i]);

// Neighbour items in the unit list (Previous / Next term).
export function neighbours(s, state) {
  const list = itemsFor(s, state.block, state.unit), i = list.findIndex(it => it.id === state.item);
  return { previous: i > 0 ? list[i - 1] : null, next: i >= 0 && i < list.length - 1 ? list[i + 1] : null, index: i, count: list.length };
}

// Nav context button: "Resume Quiz" when a paused quiz was left, "Resume Scholar" when Scholar
// was left. When both apply, the one left last; none on the screen it would return to.
// quiz/scholar: that place is open. last: 'quiz' | 'scholar' | null, the place the user was in most recently. here: the
// current section ('quiz' on the question screen, 'scholar' on a Scholar screen, else null).
export function contextTarget({ quiz, scholar, last, here }) {
  const open = { quiz, scholar };
  const order = last === 'scholar' ? ['scholar', 'quiz'] : ['quiz', 'scholar'];
  return order.find(k => open[k] && here !== k) || null;
}

// Unit review deck (interleaved practice): up to n questions, at most one per term, terms
// and questions drawn at random (rnd: a function returning [0, 1)). Practice only: its picks are not saved.
export function reviewDeck(items, n = 10, rnd = Math.random) {
  const pool = items.filter(it => it.questions?.length).map(it => ({ it, r: rnd() })).sort((a, b) => a.r - b.r).slice(0, n);
  return pool.map(({ it }) => ({ item: it.id, q: Math.floor(rnd() * it.questions.length) }));
}
