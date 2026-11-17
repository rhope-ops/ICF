// Scholar (2.2.0, the owner 2026-11-16): pure lookups over scholar.json and the saved Scholar place. No DOM, storage or
// network access. Every text shown comes from scholar.json, one item per glossary entry.
// Sample answers are practice only: they never enter stats, Results, missed cards or exam cycles.

import { pictureProblem } from './pictures.mjs';

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = v => typeof v === 'string' && v.trim() !== '';
const PARTS = ['summary', 'deeper', 'analogy', 'scenario', 'example'];
const citesOk = c => Array.isArray(c) && c.length > 0 && c.every(x => isObj(x) && isText(x.doc) && Number.isInteger(x.page));
const questionOk = q => isObj(q) && isText(q.id) && isText(q.stem) && Array.isArray(q.answers) && q.answers.length === 4 &&
  q.answers.every(a => isObj(a) && isText(a.text) && isText(a.why)) && Number.isInteger(q.key) && q.key >= 0 && q.key < 4 && citesOk(q.cites);
const itemOk = (it, block, unit) => isObj(it) && isText(it.id) && isText(it.entry) && isText(it.term) && it.block === block && it.unit === unit &&
  PARTS.every(p => isText(it[p])) && citesOk(it.cites) && (it.picture === undefined || pictureProblem(it.picture) === null) && Array.isArray(it.questions) && it.questions.length > 0 && it.questions.every(questionOk);

// The checked file with lookups, or null when it is missing, unknown or damaged (the app then hides Scholar).
export function restoreScholar(raw) {
  if (!isObj(raw) || raw.schema !== 1 || !isObj(raw.blocks) || !isObj(raw.docs)) return null;
  const byId = new Map(), byEntry = new Map();
  for (const [b, units] of Object.entries(raw.blocks)) {
    if (!/^[1-9]\d*$/.test(b) || !isObj(units)) return null;
    for (const [u, items] of Object.entries(units)) {
      if (!/^[1-9]\d*$/.test(u) || !Array.isArray(items) || !items.length) return null;
      for (const it of items) {
        if (!itemOk(it, Number(b), Number(u)) || byId.has(it.id)) return null;
        byId.set(it.id, it); byEntry.set(`${b}/${it.entry}`, it);
      }
    }
  }
  return { ...raw, byId, byEntry };
}
// Units of a block that have Scholar items, in unit order.
export const unitsOf = (s, block) => Object.keys(s?.blocks[String(block)] || {}).map(Number).sort((a, b) => a - b);
export const itemsFor = (s, block, unit) => s?.blocks[String(block)]?.[String(unit)] || [];
export const itemById = (s, id) => s?.byId.get(id) || null;
// The Scholar item of a glossary entry (Open in Scholar from the Glossary and the card back), or null.
export const itemForEntry = (s, block, entryId) => (entryId && s?.byEntry.get(`${block}/${entryId}`)) || null;

// ---- Saved place (storage key "scholar") ----
// {schema: 1, block, unit, item: item id | null, q: question index, picks: {questionId: [answer index, ...]}}: the tries in order,
// at most 2 (the owner, 2026-11-16, "3b": a wrong pick shows only its own why; the right pick or a second wrong one reveals all).
// Exact-version restore: an unknown schema or a damaged value is rejected (null), never guessed.
export const SCHOLAR_STATE_SCHEMA = 1;
export function newScholarState(block, unit) { return { schema: SCHOLAR_STATE_SCHEMA, block, unit, item: null, q: 0, picks: {} }; }
export function restoreScholarState(raw, s) {
  // Exact shape (review 2026-11-16): no unknown keys, and q must name a question of the saved item.
  if (!isObj(raw) || Object.keys(raw).sort().join() !== 'block,item,picks,q,schema,unit' || raw.schema !== SCHOLAR_STATE_SCHEMA || !Number.isInteger(raw.block) || !Number.isInteger(raw.unit) || !Number.isInteger(raw.q) || !isObj(raw.picks)) return null;
  if (!Object.entries(raw.picks).every(([k, v]) => isText(k) && Array.isArray(v) && v.length >= 1 && v.length <= 2 && new Set(v).size === v.length && v.every(i => Number.isInteger(i) && i >= 0 && i < 4))) return null;
  if (!s) return null;
  // A saved item that moved to another unit (a content update) keeps the place in its new unit.
  const item = raw.item === null ? null : itemById(s, raw.item);
  if (raw.item !== null && (!item || item.block !== raw.block)) return null;
  if (!item && !unitsOf(s, raw.block).includes(raw.unit)) return null;
  // A negative q is damage; a q past the end only means the item lost a question in a content update: keep the place
  // at its last question rather than dropping every saved pick (review 2026-11-16, evening).
  if (raw.q < 0 || (!item && raw.q !== 0)) return null;
  const q = item ? Math.min(raw.q, item.questions.length - 1) : 0;
  // Picks of questions that no longer exist are dropped (a content update); the place is kept.
  const picks = Object.fromEntries(Object.entries(raw.picks).filter(([k]) => [...s.byId.values()].some(it => it.questions.some(x => x.id === k))));
  return { schema: SCHOLAR_STATE_SCHEMA, block: raw.block, unit: item ? item.unit : raw.unit, item: item ? item.id : null, q, picks };
}
// Moves: open a unit, open an item, answer the shown question, go to a question, leave the item.
export function moveScholar(state, event, s) {
  const next = { ...state, picks: Object.fromEntries(Object.entries(state.picks).map(([k, v]) => [k, [...v]])) };
  if (event.type === 'unit') return { ...next, unit: event.unit, item: null, q: 0 };
  if (event.type === 'item') { const it = itemById(s, event.id); return it ? { ...next, block: it.block, unit: it.unit, item: it.id, q: 0 } : state; }
  if (event.type === 'list') return { ...next, item: null, q: 0 };
  const it = itemById(s, state.item); if (!it) return state;
  if (event.type === 'answer') {
    const qn = it.questions[state.q], tries = next.picks[qn?.id] || [];
    if (qn && !resolved(qn, tries) && !tries.includes(event.index) && Number.isInteger(event.index) && event.index >= 0 && event.index < 4) next.picks[qn.id] = [...tries, event.index];
    return next;
  }
  if (event.type === 'question') return { ...next, q: Math.min(Math.max(event.index, 0), it.questions.length - 1) };
  return state;
}
// A question is done after the right pick or a second wrong one. right: the right answer was found.
export const resolved = (qn, tries = []) => tries.includes(qn.key) || tries.length >= 2;
export const right = (qn, tries = []) => tries.includes(qn.key);

// Neighbour items in the unit list (Previous / Next term).
export function neighbours(s, state) {
  const list = itemsFor(s, state.block, state.unit), i = list.findIndex(it => it.id === state.item);
  return { previous: i > 0 ? list[i - 1] : null, next: i >= 0 && i < list.length - 1 ? list[i + 1] : null, index: i, count: list.length };
}

// Nav context button (the owner, 2026-11-16): "Resume Quiz" (the owner's preview comment, 2026-11-16; was "Return to Quiz") when a paused quiz was left, "Resume Scholar" when Scholar
// was left. When both apply, the one left last; none on the screen it would return to.
// quiz/scholar: that place is open. last: 'quiz' | 'scholar' | null, the place the user was in most recently. here: the
// current section ('quiz' on the question screen, 'scholar' on a Scholar screen, else null).
export function contextTarget({ quiz, scholar, last, here }) {
  const open = { quiz, scholar };
  const order = last === 'scholar' ? ['scholar', 'quiz'] : ['quiz', 'scholar'];
  return order.find(k => open[k] && here !== k) || null;
}
