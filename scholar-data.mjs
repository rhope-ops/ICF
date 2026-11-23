// Scholar data: checks of the index and block files, lookups over loaded blocks, the saved Scholar place.
// Inputs: the index, block files and a saved place. Outputs: checked copies, lookups and new places.
// Run: imported through scholar.mjs, which re-exports its public names.
// Network: none.
// Writes: none (the caller saves the place).
// Credentials: none.
import { pictureProblem } from './pictures.mjs';

// True when the value is a plain object (not null, not an array).
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
// True when the value is a string with something other than spaces in it.
const isText = v => typeof v === 'string' && v.trim() !== '';
const PARTS = ['summary', 'deeper', 'analogy', 'scenario', 'example'];
// True when the value is a non-empty list of citations, each with a document and a whole page number.
const citesOk = c => Array.isArray(c) && c.length > 0 && c.every(x => isObj(x) && isText(x.doc) && Number.isInteger(x.page));
// Guided question types: the file has the A-D question (no type) first and a hands-on one
// second; the app shows the hands-on one first. Hands-on: tap (the 4 answers
// are parts of the term's picture, answer.at), order (steps shown out of order, key = the shown indices in the right order),
// sort (items into 2 groups, key = the group of each item) or branch (2-3 linked decisions, each with its own key).
export const isIdx = (v, n) => Number.isInteger(v) && v >= 0 && v < n;
// True when the value is an answer or step with its text and its why (explanation) text.
const why = x => isObj(x) && isText(x.text) && isText(x.why);
// The type of a guided question: 'choose' (the A-D question) when it has none.
export const typeOf = q => q.type || 'choose';
const SHAPES = {
  choose: q => Array.isArray(q.answers) && q.answers.length === 4 && q.answers.every(why) && isIdx(q.key, 4),
  tap: q => SHAPES.choose(q) && q.answers.every(a => isText(a.at)),
  order: q => Array.isArray(q.steps) && q.steps.length >= 3 && q.steps.length <= 5 && q.steps.every(why) && isPerm(q.key, q.steps.length),
  sort: q => Array.isArray(q.groups) && q.groups.length === 2 && q.groups.every(isText) && Array.isArray(q.items) && q.items.length >= 4 && q.items.length <= 6 && q.items.every(why) && Array.isArray(q.key) && q.key.length === q.items.length && q.key.every(g => g === 0 || g === 1),
  branch: q => Array.isArray(q.steps) && q.steps.length >= 2 && q.steps.length <= 3 && q.steps.every(d => isObj(d) && isText(d.prompt) && Array.isArray(d.choices) && d.choices.length >= 2 && d.choices.length <= 3 && d.choices.every(why) && isIdx(d.key, d.choices.length)),
};
// True when the list is a permutation of 0 to n-1: n distinct valid indexes.
export const isPerm = (v, n) => Array.isArray(v) && v.length === n && new Set(v).size === n && v.every(i => isIdx(i, n));
// True when the value is a well-formed guided question of a known type, with its key and citations.
const questionOk = q => isObj(q) && isText(q.id) && isText(q.v) && isText(q.stem) && (q.type === undefined || ['tap', 'order', 'sort', 'branch'].includes(q.type)) && SHAPES[typeOf(q)](q) && citesOk(q.cites);
// True when the value is a well-formed Scholar item of the given block and unit.
const itemOk = (it, block, unit) => isObj(it) && isText(it.id) && isText(it.entry) && isText(it.term) && it.block === block && it.unit === unit &&
  PARTS.every(p => isText(it[p])) && citesOk(it.cites) && coversOk(it) && (it.picture === undefined || pictureProblem(it.picture) === null) && Array.isArray(it.questions) && it.questions.length > 0 && it.questions.every(questionOk);

// scholar.json is an index (schema 2): per block its file, content version and the entry ids of
// each unit. A block's items come from its own file (scholar-B<n>.json), loaded when that block's Scholar opens and added
// with addScholarBlock. Before that, itemForEntry answers from the index (id, block, unit, entry) so the Glossary and the
// cards can offer "Open in Scholar".
// Umbrella terms: an item's covers are other entries of its unit, each shown by one picture step or part.
const coversOk = it => it.covers === undefined || (Array.isArray(it.covers) && it.covers.length > 0 && it.covers.every(c => isObj(c) && isText(c.entry) && isText(c.term)
  && Number.isInteger(c.part) && c.part >= 0 && c.part < ((it.picture?.steps || it.picture?.parts || []).length)));
// True when the value is a non-empty list of distinct entry ids.
const entriesOk = v => Array.isArray(v) && v.length > 0 && v.every(isText) && new Set(v).size === v.length;
// The id of a Scholar item: block, unit and entry.
const itemId = (b, u, e) => `S-B${b}-U${u}-${e}`;
/**
 * Check the Scholar index (scholar.json) and build its lookups.
 * @param {*} raw the parsed index.
 * @returns {object|null} the checked index with lookups, or null when it is missing, unknown or damaged (the app then hides Scholar).
 */
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
/**
 * Add one block file to the Scholar lookup. The file is checked against the index: the same version and exactly the
 * units and entries the index lists.
 * @param {object} s the Scholar lookup.
 * @param {*} raw the parsed block file.
 * @returns {object|null} a new Scholar lookup with the block's items, or null when the file is damaged or does not match the index.
 */
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
  // Every cover the index names was set by an item of this file, and every item cover is in the index.
  const fileCovers = Object.values(raw.units).flat().flatMap(it => (it.covers || []).map(c => c.entry));
  if (new Set(fileCovers).size !== fileCovers.length || fileCovers.length !== Object.keys(ix.covers || {}).length || fileCovers.some(e => !ix.covers[e])) return null;
  return { ...s, blocks: { ...s.blocks, [b]: shown }, byId, byEntry };
}
// Display order of a term's questions: hands-on (tap, order, sort, branch) before A-D, file order kept inside each kind.
// Picks are keyed by question id and version, so the order change keeps every saved pick.
const handsOnFirst = qs => [...qs.filter(q => typeOf(q) !== 'choose'), ...qs.filter(q => typeOf(q) === 'choose')];
// True when the items of the block have been loaded.
export const blockLoaded = (s, block) => Boolean(s?.blocks[String(block)]);
// Units of a block that have Scholar items, in unit order (from the index).
export const unitsOf = (s, block) => Object.keys(s?.index[String(block)]?.units || {}).map(Number).sort((a, b) => a - b);
// The items of a unit of a block; an empty list when none are loaded.
export const itemsFor = (s, block, unit) => s?.blocks[String(block)]?.[String(unit)] || [];
// The item with the given id, or null.
export const itemById = (s, id) => s?.byId.get(id) || null;
// The Scholar item of a glossary entry (Open in Scholar from the Glossary and the card back), or null. Before its block is
// loaded this is the index's {id, block, unit, entry}. For an entry an umbrella covers it carries part: the picture step or
// part that shows the entry.
export const itemForEntry = (s, block, entryId) => (entryId && s?.byEntry.get(`${block}/${entryId}`)) || null;

// ---- Saved place (storage key "scholar") ----
// Schema 2: {schema: 2, block, unit, item: item id | null, q: question index, picks: {questionId: tries}, seen: [item id]}.
// tries per type: choose / tap = the answer indexes picked, in order, at most 2 (a wrong pick
// shows only its own why; the right pick or a second wrong one reveals all); order / sort = the arrangements checked, at
// most 2 (each an array: shown indexes in order, or a group per item); branch = per decision reached, the choice indexes
// picked (a decision ends on its key or after min(2, choices - 1) wrong picks). seen: terms opened before (their reading
// sections open on a term's first visit and start closed later).
// Exact-version restore: schema 1 (the first saved form) is migrated exactly: its place is kept, seen is [], and its picks are dropped
// (they were keyed by question id only and cannot be matched to the content they were made on; Scholar picks are practice
// and never entered stats). An unknown schema or a damaged value is rejected.
export const SCHOLAR_STATE_SCHEMA = 2;
// Saved picks are keyed by question id and content version (id@v), so a question whose content changed never shows
// picks made on its old content: its key is unknown and its picks are dropped.
export const pickKey = qn => `${qn.id}@${qn.v}`;
// The picks (tries) saved for a question, or an empty list.
export const triesOf = (state, qn) => state?.picks[pickKey(qn)] || [];
// A new saved place at the start of a unit: no item open, no picks, no terms seen.
export function newScholarState(block, unit) { return { schema: SCHOLAR_STATE_SCHEMA, block, unit, item: null, q: 0, picks: {}, seen: [] }; }
const KEYS = { 1: 'block,item,picks,q,schema,unit', 2: 'block,item,picks,q,schema,seen,unit' };
// True when the value is a list of at most 6 valid pick indexes (a sort task has up to 6 items).
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
/**
 * The stored place, checked by shape only (exact keys and types; schema 1 is migrated exactly: picks dropped, seen []).
 * It does not need any content, so a place whose block file is not loaded can keep its progress.
 * @param {*} raw the parsed saved place.
 * @returns {object|null} the place in the current schema, or null when damaged.
 */
export function scholarStateShape(raw) {
  // Exact shape: no unknown keys.
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
/**
 * Check a saved place against the loaded Scholar content, repairing it where a content update moved things.
 * @param {*} raw the parsed saved place.
 * @param {object} s the Scholar lookup.
 * @returns {object|null} the place, or null when it is damaged or Scholar has no content.
 */
export function restoreScholarState(raw, s) {
  const sh = scholarStateShape(raw);
  if (!sh || !s) return null;
  const fit = fitPicks(sh.picks, sh.seen, s);
  // A saved item that moved to another unit (a content update) keeps the place in its new unit; a q past the end only
  // means the item lost a question: keep the place at its last question.
  const item = sh.item === null ? null : itemById(s, sh.item);
  if (item && item.block === sh.block) return { ...sh, unit: item.unit, item: item.id, q: Math.min(sh.q, item.questions.length - 1), ...fit };
  if (!item && sh.item === null && unitsOf(s, sh.block).includes(sh.unit)) return { ...sh, ...fit };
  // The place no longer fits (a content update removed or renamed its term or unit): a removed term keeps its unit, a removed
  // unit opens the block's first unit, a removed block the first block with Scholar; every pick and seen term is kept
  //.
  const block = unitsOf(s, sh.block).length ? sh.block : Number(Object.keys(s.index)[0]);
  if (!Number.isInteger(block) || !unitsOf(s, block).length) return null;
  const unit = block === sh.block && unitsOf(s, block).includes(sh.unit) ? sh.unit : unitsOf(s, block)[0];
  return { ...sh, block, unit, item: null, q: 0, ...fit };
}
// Picks and seen terms are checked against the content of their own block. Picks of questions that no longer exist, or no
// longer fit their question (a content update changed it), are dropped. A block whose file is not loaded yet keeps its
// picks and seen terms as they are (shape checked above) until it loads: then refitScholarState checks them (at start only the saved place's block loads, and the other blocks' progress must survive).
const blockOf = id => Number((/^S-B(\d+)-/.exec(id) || [])[1]);
// Drop the picks and seen terms that no longer fit the loaded content; those of a block not loaded yet stay as they are.
function fitPicks(picks, seen, s) {
  const byQ = new Map([...s.byId.values()].flatMap(it => it.questions.map(x => [pickKey(x), x])));
  // True when the id belongs to a block that is in the index but not loaded yet.
  const later = id => !blockLoaded(s, blockOf(id)) && Boolean(s.index[String(blockOf(id))]);
  return { picks: Object.fromEntries(Object.entries(picks).filter(([k, v]) => later(k) || (byQ.has(k) && triesFit(byQ.get(k), v)))),
    seen: seen.filter(id => later(id) || s.byId.has(id)) };
}
// The state after a block file loads: that block's picks and seen terms are checked against its content.
export const refitScholarState = (state, s) => state && { ...state, ...fitPicks(state.picks, state.seen, s) };
// True when both values are lists with the same items in the same order.
export const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);
// The most wrong picks a branch decision allows: 2, or one fewer than its choices.
const limit = d => Math.min(2, d.choices.length - 1);
// True when a branch decision is over: its key was picked or the allowed tries are used.
export const decisionDone = (d, x = []) => x.includes(d.key) || x.length >= limit(d);
