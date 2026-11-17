// Scholar (2.2.0, the owner 2026-11-16): pure lookups over scholar.json, the block files and the saved Scholar place. No DOM, storage or
// network access. Every text shown comes from a block file, one item per concept entry (no facets; the owner, 2026-11-16).
// Sample answers are practice only: they never enter stats, Results, missed cards or exam cycles.

import { pictureProblem } from './pictures.mjs';

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = v => typeof v === 'string' && v.trim() !== '';
const PARTS = ['summary', 'deeper', 'analogy', 'scenario', 'example'];
const citesOk = c => Array.isArray(c) && c.length > 0 && c.every(x => isObj(x) && isText(x.doc) && Number.isInteger(x.page));
// Guided question types (2.3.0, the owner 2026-11-16): the file has the A-D question (no type) first and a hands-on one
// second; the app shows the hands-on one first (2.4.2, the owner 2026-11-16). Hands-on: tap (the 4 answers
// are parts of the term's picture, answer.at), order (steps shown out of order, key = the shown indices in the right order),
// sort (items into 2 groups, key = the group of each item) or branch (2-3 linked decisions, each with its own key).
const isIdx = (v, n) => Number.isInteger(v) && v >= 0 && v < n;
const why = x => isObj(x) && isText(x.text) && isText(x.why);
export const typeOf = q => q.type || 'choose';
const SHAPES = {
  choose: q => Array.isArray(q.answers) && q.answers.length === 4 && q.answers.every(why) && isIdx(q.key, 4),
  tap: q => SHAPES.choose(q) && q.answers.every(a => isText(a.at)),
  order: q => Array.isArray(q.steps) && q.steps.length >= 3 && q.steps.length <= 5 && q.steps.every(why) && isPerm(q.key, q.steps.length),
  sort: q => Array.isArray(q.groups) && q.groups.length === 2 && q.groups.every(isText) && Array.isArray(q.items) && q.items.length >= 4 && q.items.length <= 6 && q.items.every(why) && Array.isArray(q.key) && q.key.length === q.items.length && q.key.every(g => g === 0 || g === 1),
  branch: q => Array.isArray(q.steps) && q.steps.length >= 2 && q.steps.length <= 3 && q.steps.every(d => isObj(d) && isText(d.prompt) && Array.isArray(d.choices) && d.choices.length >= 2 && d.choices.length <= 3 && d.choices.every(why) && isIdx(d.key, d.choices.length)),
};
const isPerm = (v, n) => Array.isArray(v) && v.length === n && new Set(v).size === n && v.every(i => isIdx(i, n));
const questionOk = q => isObj(q) && isText(q.id) && isText(q.v) && isText(q.stem) && (q.type === undefined || ['tap', 'order', 'sort', 'branch'].includes(q.type)) && SHAPES[typeOf(q)](q) && citesOk(q.cites);
const itemOk = (it, block, unit) => isObj(it) && isText(it.id) && isText(it.entry) && isText(it.term) && it.block === block && it.unit === unit &&
  PARTS.every(p => isText(it[p])) && citesOk(it.cites) && coversOk(it) && (it.picture === undefined || pictureProblem(it.picture) === null) && Array.isArray(it.questions) && it.questions.length > 0 && it.questions.every(questionOk);

// scholar.json is an index (schema 2; the owner, 2026-11-16, "2 a"): per block its file, content version and the entry ids of
// each unit. A block's items come from its own file (scholar-B<n>.json), loaded when that block's Scholar opens and added
// with addScholarBlock. Before that, itemForEntry answers from the index (id, block, unit, entry) so the Glossary and the
// cards can offer "Open in Scholar".
// Umbrella terms (2.5.3): an item's covers are other entries of its unit, each shown by one picture step or part.
const coversOk = it => it.covers === undefined || (Array.isArray(it.covers) && it.covers.length > 0 && it.covers.every(c => isObj(c) && isText(c.entry) && isText(c.term)
  && Number.isInteger(c.part) && c.part >= 0 && c.part < ((it.picture?.steps || it.picture?.parts || []).length)));
const entriesOk = v => Array.isArray(v) && v.length > 0 && v.every(isText) && new Set(v).size === v.length;
const itemId = (b, u, e) => `S-B${b}-U${u}-${e}`;
// The checked index with lookups, or null when it is missing, unknown or damaged (the app then hides Scholar).
export function restoreScholar(raw) {
  if (!isObj(raw) || raw.schema !== 2 || !isText(raw.contentVersion) || !isObj(raw.blocks) || !isObj(raw.docs)) return null;
  const byEntry = new Map();
  for (const [b, ix] of Object.entries(raw.blocks)) {
    if (!/^[1-9]\d*$/.test(b) || !isObj(ix) || ix.file !== `scholar-B${b}.json` || !isText(ix.v) || !isObj(ix.units) || !Object.keys(ix.units).length) return null;
    for (const [u, entries] of Object.entries(ix.units)) {
      if (!/^[1-9]\d*$/.test(u) || !entriesOk(entries)) return null;
      for (const e of entries) {
        if (byEntry.has(`${b}/${e}`)) return null;
        byEntry.set(`${b}/${e}`, { id: itemId(b, u, e), block: Number(b), unit: Number(u), entry: e });
      }
    }
    // covers: {covered entry: [umbrella entry, picture part]}; a covered entry opens its umbrella at that part.
    if (ix.covers !== undefined) {
      if (!isObj(ix.covers)) return null;
      for (const [e, v] of Object.entries(ix.covers)) {
        const host = Array.isArray(v) && v.length === 2 && isText(v[0]) && Number.isInteger(v[1]) && v[1] >= 0 && byEntry.get(`${b}/${v[0]}`);
        if (!host || byEntry.has(`${b}/${e}`) || host.part !== undefined) return null;
        byEntry.set(`${b}/${e}`, { ...host, part: v[1] });
      }
    }
  }
  return { docs: raw.docs, contentVersion: raw.contentVersion, index: raw.blocks, blocks: {}, byId: new Map(), byEntry };
}
// The block file named by the index, checked against it: the same version and exactly the units and entries the index lists.
// Returns a new Scholar value with the block's items, or null when the file is damaged or does not match the index.
export function addScholarBlock(s, raw) {
  const ix = isObj(raw) && s?.index[String(raw.block)];
  if (!ix || raw.schema !== 1 || raw.v !== ix.v || !isObj(raw.units)) return null;
  const units = Object.keys(raw.units).sort().join();
  if (units !== Object.keys(ix.units).sort().join()) return null;
  const b = String(raw.block), byId = new Map(s.byId), byEntry = new Map(s.byEntry), shown = {};
  for (const [u, items] of Object.entries(raw.units)) {
    if (!Array.isArray(items) || items.map(it => it?.entry).join() !== ix.units[u].join()) return null;
    shown[u] = [];
    for (const raw0 of items) {
      if (!itemOk(raw0, raw.block, Number(u)) || raw0.id !== itemId(b, u, raw0.entry) || byId.has(raw0.id)) return null;
      const it = { ...raw0, questions: handsOnFirst(raw0.questions) };
      shown[u].push(it); byId.set(it.id, it); byEntry.set(`${b}/${it.entry}`, it);
      for (const c of it.covers || []) { if (ix.covers?.[c.entry]?.join() !== [it.entry, c.part].join()) return null; byEntry.set(`${b}/${c.entry}`, { ...it, part: c.part }); }
    }
  }
  // Every cover the index names was set by an item of this file, and every item cover is in the index (fresh review 2.5.3).
  const fileCovers = Object.values(raw.units).flat().flatMap(it => (it.covers || []).map(c => c.entry));
  if (new Set(fileCovers).size !== fileCovers.length || fileCovers.length !== Object.keys(ix.covers || {}).length || fileCovers.some(e => !ix.covers[e])) return null;
  return { ...s, blocks: { ...s.blocks, [b]: shown }, byId, byEntry };
}
// Display order of a term's questions: hands-on (tap, order, sort, branch) before A-D, file order kept inside each kind.
// Picks are keyed by question id and version, so the order change keeps every saved pick.
const handsOnFirst = qs => [...qs.filter(q => typeOf(q) !== 'choose'), ...qs.filter(q => typeOf(q) === 'choose')];
export const blockLoaded = (s, block) => Boolean(s?.blocks[String(block)]);
// Units of a block that have Scholar items, in unit order (from the index).
export const unitsOf = (s, block) => Object.keys(s?.index[String(block)]?.units || {}).map(Number).sort((a, b) => a - b);
export const itemsFor = (s, block, unit) => s?.blocks[String(block)]?.[String(unit)] || [];
export const itemById = (s, id) => s?.byId.get(id) || null;
// The Scholar item of a glossary entry (Open in Scholar from the Glossary and the card back), or null. Before its block is
// loaded this is the index's {id, block, unit, entry}. For an entry an umbrella covers it carries part: the picture step or
// part that shows the entry.
export const itemForEntry = (s, block, entryId) => (entryId && s?.byEntry.get(`${block}/${entryId}`)) || null;

// ---- Saved place (storage key "scholar") ----
// Schema 2 (2.3.0): {schema: 2, block, unit, item: item id | null, q: question index, picks: {questionId: tries}, seen: [item id]}.
// tries per type: choose / tap = the answer indexes picked, in order, at most 2 (the owner, 2026-11-16, "3b": a wrong pick
// shows only its own why; the right pick or a second wrong one reveals all); order / sort = the arrangements checked, at
// most 2 (each an array: shown indexes in order, or a group per item); branch = per decision reached, the choice indexes
// picked (a decision ends on its key or after min(2, choices - 1) wrong picks). seen: terms opened before (their reading
// sections start closed; the owner, 2026-11-16: "sections open on a term's first visit, closed later").
// Exact-version restore: schema 1 (2.2.x) is migrated exactly: its place is kept, seen is [], and its picks are dropped
// (they were keyed by question id only and cannot be matched to the content they were made on; Scholar picks are practice
// and never entered stats). An unknown schema or a damaged value is rejected.
export const SCHOLAR_STATE_SCHEMA = 2;
// Saved picks are keyed by question id and content version (id@v, 2.3.0), so a question whose content changed never shows
// picks made on its old content: its key is unknown and its picks are dropped.
export const pickKey = qn => `${qn.id}@${qn.v}`;
export const triesOf = (state, qn) => state?.picks[pickKey(qn)] || [];
export function newScholarState(block, unit) { return { schema: SCHOLAR_STATE_SCHEMA, block, unit, item: null, q: 0, picks: {}, seen: [] }; }
const KEYS = { 1: 'block,item,picks,q,schema,unit', 2: 'block,item,picks,q,schema,seen,unit' };
const ints = v => Array.isArray(v) && v.every(i => Number.isInteger(i) && i >= 0 && i < 6);  // indexes: at most 6 sort items
// The stored shape of one question's tries, without knowing the question: a list of ints or a list of int lists.
const triesShape = v => Array.isArray(v) && v.length >= 1 && v.length <= 3 && ((ints(v) && new Set(v).size === v.length) || v.every(x => ints(x) && x.length >= 1));
// Do these tries fit this question (a content update may have changed a question's type)?
export function triesFit(qn, v) {
  const t = typeOf(qn), uniq = a => new Set(a).size === a.length;
  if (t === 'choose' || t === 'tap') return ints(v) && v.length <= 2 && uniq(v) && v.every(i => i < 4) && (v.length < 2 || !v.slice(0, -1).includes(qn.key));
  if (t === 'order') return v.length <= 2 && v.every(x => isPerm(x, qn.steps.length)) && (v.length < 2 || (!same(v[0], qn.key) && !same(v[0], v[1])));
  if (t === 'sort') return v.length <= 2 && v.every(x => Array.isArray(x) && x.length === qn.items.length && x.every(g => g === 0 || g === 1)) && (v.length < 2 || (!same(v[0], qn.key) && !same(v[0], v[1])));
  // Branch: each decision's picks stop at its key; every decision before the last is over.
  return v.length <= qn.steps.length && v.every((x, k) => Array.isArray(x) && x.length >= 1 && uniq(x) && x.every(i => isIdx(i, qn.steps[k].choices.length)) && x.length <= limit(qn.steps[k]) && !x.slice(0, -1).includes(qn.steps[k].key) && (k === v.length - 1 || decisionDone(qn.steps[k], x)));
}
// The stored place, checked by shape only (exact keys and types; schema 1 is migrated exactly: picks dropped, seen []).
// null when damaged. It does not need any content, so a place whose block file is not loaded can keep its progress.
export function scholarStateShape(raw) {
  // Exact shape (review 2026-11-16): no unknown keys.
  if (!isObj(raw) || !(raw.schema === 1 || raw.schema === 2) || Object.keys(raw).sort().join() !== KEYS[raw.schema] || !Number.isInteger(raw.block) || !Number.isInteger(raw.unit) || !Number.isInteger(raw.q) || !isObj(raw.picks)) return null;
  if (raw.schema === 1 && !Object.values(raw.picks).every(v => ints(v) && v.length >= 1 && v.length <= 2 && new Set(v).size === v.length && v.every(i => i < 4))) return null;
  if (!Object.entries(raw.picks).every(([k, v]) => isText(k) && triesShape(v))) return null;
  if (raw.schema === 2 && !(Array.isArray(raw.seen) && raw.seen.every(isText))) return null;
  if (!(raw.item === null || isText(raw.item))) return null;
  // A negative q is damage, and so is a question number without a term.
  if (raw.q < 0 || (raw.item === null && raw.q !== 0)) return null;
  return { schema: SCHOLAR_STATE_SCHEMA, block: raw.block, unit: raw.unit, item: raw.item, q: raw.q,
    picks: raw.schema === 1 ? {} : { ...raw.picks }, seen: [...new Set(raw.schema === 2 ? raw.seen : [])] };
}
export function restoreScholarState(raw, s) {
  const sh = scholarStateShape(raw);
  if (!sh || !s) return null;
  const fit = fitPicks(sh.picks, sh.seen, s);
  // A saved item that moved to another unit (a content update) keeps the place in its new unit; a q past the end only
  // means the item lost a question: keep the place at its last question (review 2026-11-16, evening).
  const item = sh.item === null ? null : itemById(s, sh.item);
  if (item && item.block === sh.block) return { ...sh, unit: item.unit, item: item.id, q: Math.min(sh.q, item.questions.length - 1), ...fit };
  if (!item && sh.item === null && unitsOf(s, sh.block).includes(sh.unit)) return { ...sh, ...fit };
  // The place no longer fits (a content update removed or renamed its term or unit): a removed term keeps its unit, a removed
  // unit opens the block's first unit, a removed block the first block with Scholar; every pick and seen term is kept
  // (fresh reviews 2 and 3, 2026-11-16).
  const block = unitsOf(s, sh.block).length ? sh.block : Number(Object.keys(s.index)[0]);
  if (!Number.isInteger(block) || !unitsOf(s, block).length) return null;
  const unit = block === sh.block && unitsOf(s, block).includes(sh.unit) ? sh.unit : unitsOf(s, block)[0];
  return { ...sh, block, unit, item: null, q: 0, ...fit };
}
// Picks and seen terms are checked against the content of their own block. Picks of questions that no longer exist, or no
// longer fit their question (a content update changed it), are dropped. A block whose file is not loaded yet keeps its
// picks and seen terms as they are (shape checked above) until it loads: then refitScholarState checks them (fresh review
// 2026-11-16: at start only the saved place's block loads, and the other blocks' progress must survive).
const blockOf = id => Number((/^S-B(\d+)-/.exec(id) || [])[1]);
function fitPicks(picks, seen, s) {
  const byQ = new Map([...s.byId.values()].flatMap(it => it.questions.map(x => [pickKey(x), x])));
  const later = id => !blockLoaded(s, blockOf(id)) && Boolean(s.index[String(blockOf(id))]);
  return { picks: Object.fromEntries(Object.entries(picks).filter(([k, v]) => later(k) || (byQ.has(k) && triesFit(byQ.get(k), v)))),
    seen: seen.filter(id => later(id) || s.byId.has(id)) };
}
// The state after a block file loads: that block's picks and seen terms are checked against its content.
export const refitScholarState = (state, s) => state && { ...state, ...fitPicks(state.picks, state.seen, s) };
const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);
const limit = d => Math.min(2, d.choices.length - 1);
const decisionDone = (d, x = []) => x.includes(d.key) || x.length >= limit(d);
// Moves: open a unit, open an item, answer the shown question, go to a question, leave the item.
// answer: {index} for choose / tap and the current branch decision; {value: array} for an order or sort check.
export function moveScholar(state, event, s) {
  const next = { ...state, seen: [...(state.seen || [])], picks: Object.fromEntries(Object.entries(state.picks).map(([k, v]) => [k, v.map(x => Array.isArray(x) ? [...x] : x)])) };
  if (event.type === 'unit') return { ...next, unit: event.unit, item: null, q: 0 };
  if (event.type === 'item') { const it = itemById(s, event.id); return it ? { ...next, block: it.block, unit: it.unit, item: it.id, q: 0 } : state; }
  if (event.type === 'list') return { ...next, item: null, q: 0 };
  // seen: the term was read (its reading sections start closed on later visits).
  // reset (the owner, 2026-11-16: "an option to reset guided questions"; "per-term only"): clear the picks of one term;
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

// Nav context button (the owner, 2026-11-16): "Resume Quiz" (the owner's preview comment, 2026-11-16; was "Return to Quiz") when a paused quiz was left, "Resume Scholar" when Scholar
// was left. When both apply, the one left last; none on the screen it would return to.
// quiz/scholar: that place is open. last: 'quiz' | 'scholar' | null, the place the user was in most recently. here: the
// current section ('quiz' on the question screen, 'scholar' on a Scholar screen, else null).
export function contextTarget({ quiz, scholar, last, here }) {
  const open = { quiz, scholar };
  const order = last === 'scholar' ? ['scholar', 'quiz'] : ['quiz', 'scholar'];
  return order.find(k => open[k] && here !== k) || null;
}

// Unit review deck (2.6.0, G4 of the Scholar review: interleaved practice): up to n questions, at most one per term, terms
// and questions drawn at random (rnd: a function returning [0, 1)). Practice only: its picks are not saved.
export function reviewDeck(items, n = 10, rnd = Math.random) {
  const pool = items.filter(it => it.questions?.length).map(it => ({ it, r: rnd() })).sort((a, b) => a.r - b.r).slice(0, n);
  return pool.map(({ it }) => ({ item: it.id, q: Math.floor(rnd() * it.questions.length) }));
}
