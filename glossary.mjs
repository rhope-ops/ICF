// Glossary (v1.2.0): pure lookups over glossary.json (built from the authored
// flash cards and the course excerpts). No DOM, storage or network access. Every text shown comes from that file.

// Block scope (the owner, 2026-11-11, decision 7 "All blocks"): each block is self-contained. Links, answer terms and
// related lists name entries of the question's own block; an acronym carries {expansion, blocks: {"<block>": {entry, see}}},
// and a lookup takes the block from the question (q.block) or an explicit {block}.
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
export function restoreGlossary(raw) {
  const ok = raw && raw.schema === 1 && Array.isArray(raw.entries) && isObj(raw.acronyms) && raw.questionLinks && raw.answerTerms && raw.docs &&
    raw.entries.every(e => typeof e.id === 'string' && typeof e.term === 'string' && typeof e.short === 'string' && Array.isArray(e.excerpts) && Array.isArray(e.questionIds) &&
      Array.isArray(e.aliases) && e.aliases.every(a => typeof a === 'string') && Array.isArray(e.related) && e.related.every(r => typeof r === 'string') && Number.isInteger(e.unit) && Number.isInteger(e.block));
  if (!ok) return null;
  const byId = new Map(raw.entries.map(e => [e.id, e]));
  // An acronym's entry and See entries exist and belong to the block they are listed under.
  const own = (id, b) => byId.get(id)?.block === Number(b);
  const acrOk = Object.values(raw.acronyms).every(a => isObj(a) && typeof a.expansion === 'string' && isObj(a.blocks) &&
    Object.entries(a.blocks).every(([b, v]) => /^[1-9]\d*$/.test(b) && isObj(v) && (v.entry === null || own(v.entry, b)) && Array.isArray(v.see) && v.see.every(id => own(id, b))));
  if (!acrOk) return null;
  return { ...raw, byId };
}
// One block's view of an acronym: {expansion, entry, see} or null when the block's questions do not use it.
export const acronymOf = (g, acr, block) => {
  const a = Object.hasOwn(g.acronyms, acr) ? g.acronyms[acr] : null, b = a && Object.hasOwn(a.blocks, String(block)) ? a.blocks[block] : null;
  return b ? { expansion: a.expansion, entry: b.entry, see: b.see } : null;
};
export const entryOf = (g, id) => g.byId.get(id) || null;
// A flash card's glossary entry: the entry built from that card (same term, same source question).
export const entryForCard = (g, card) => card && card.kind !== 'highlight' ? g.entries.find(e => e.sourceId === card.questionId) || null : null;
const refEntry = (g, ref, block) => ref.startsWith('acr:') ? acronymOf(g, ref.slice(4), block)?.entry || null : ref;

// Exposure rule. phase: 'live' (question not resolved yet) | 'resolved' | 'review' | 'exam' (exam not submitted).
// mode: Assisted | Unassisted | Hard | Exam.
// - Live exam: nothing. Live Hard: nothing (no help before the answer).
// - Live Assisted / Unassisted: acronym expansions only, in the stem only, and only for acronyms that are not answer
//   choices (no choice contains the acronym, and no choice maps to its entry), so no answer's term leaks, and only
//   where the stem does not already spell the acronym out (the owner, 2026-11-10: "VM ... doesn't need to be explained in
//   its own sentence where it's spelled out"; the first-occurrence rule writes "Expansion (ACR)" in every stem).
// - Resolved / review: every stem link, full entries.
// Returns stem spans [{start, end, ref, limited}] for the question.
export function stemLinks(g, q, { phase, mode }) {
  const spans = g.questionLinks[q.id]?.stem || [];
  if (phase === 'exam') return [];
  if (phase === 'resolved' || phase === 'review') return spans.map(([start, end, ref]) => ({ start, end, ref, limited: false }));
  if (mode === 'Hard' || mode === 'Exam') return [];
  const choiceTerms = new Set(Object.values(g.answerTerms[q.id] || {}));
  return spans.filter(([, , ref]) => {
    if (!ref.startsWith('acr:')) return false;
    const acr = ref.slice(4), a = acronymOf(g, acr, q.block);
    if (!a || q.stem.toLowerCase().includes(a.expansion.toLowerCase())) return false;
    const inChoice = q.answers.some(x => new RegExp(`(?<![\\w-])${acr}s?(?![\\w-])`).test(x.text) || x.text.toLowerCase().includes(a.expansion.toLowerCase()));
    return !inChoice && !(a.entry && choiceTerms.has(a.entry)) && !(a.see || []).some(id => choiceTerms.has(id));
  }).map(([start, end, ref]) => ({ start, end, ref, limited: true }));
}

// Popover content for one link. limited: the acronym expansion only. block: the block of the question (or card or
// entry) the link is in; an acronym opens only that block's entry and See entries.
export function popover(g, ref, { limited = false, block } = {}) {
  if (ref.startsWith('acr:')) {
    const acr = ref.slice(4), a = acronymOf(g, acr, block);
    if (!a) return null;
    if (limited) return { title: acr, expansion: a.expansion, entry: null, see: [] };
    return { title: acr, expansion: a.expansion, entry: a.entry ? entryOf(g, a.entry) : null, see: (a.see || []).map(id => entryOf(g, id)).filter(Boolean) };
  }
  const e = entryOf(g, ref);
  return e && (block === undefined || e.block === Number(block)) ? { title: e.term, expansion: null, entry: e, see: [] } : null;
}

// Terms of a question (stem, choices, rationales), in order of first appearance; acronyms count through their entry.
export function keyTerms(g, q, max = 6) {
  const L = g.questionLinks[q.id]; if (!L) return [];
  const ids = [];
  const add = list => { for (const [, , ref] of list) { const id = refEntry(g, ref, q.block); if (id && !ids.includes(id)) ids.push(id); } };
  add(L.stem); for (const a of q.answers) add(L.answers[a.id] || []);
  for (const id of Object.values(g.answerTerms[q.id] || {})) if (!ids.includes(id) && !g.generic.includes(id)) ids.push(id);
  // The question's own card entry (every question but an Exam item has one).
  const own = g.questionEntry?.[q.id]; if (own && !ids.includes(own)) ids.unshift(own);
  for (const a of q.answers) add(L.rationales[a.id] || []);
  // 2.1.7: the limit never cuts the own card entry or the key's own term (an entry already named past the limit was
  // cut, e.g. the MX Record card on its own Hard question); it moves to the front in place of the last other term.
  const out = ids.slice(0, max), key = (g.answerTerms[q.id] || {})[q.correctAnswerId];
  for (const id of [key, own]) if (id && !out.includes(id)) {
    if (out.length >= max) out.splice(out.findLastIndex(x => x !== own && x !== key), 1);
    out.unshift(id);
  }
  return out;
}
// Glossary screen: search (term, aliases, short), unit filter, A-Z.
export function searchEntries(g, { query = '', unit = 0 } = {}) {
  const t = query.trim().toLowerCase();
  return g.entries.filter(e => (!unit || e.unit === unit) && (!t || e.term.toLowerCase().includes(t) || e.aliases.some(a => a.toLowerCase().includes(t)) || e.short.toLowerCase().includes(t)));
}

// Bookmarks (until 2.1.3): one list of entry ids (icf:glossaryBookmarks). SAVE replaced them; app.migrateBookmarks moves a
// saved list once into Manual. Unknown or repeated ids are dropped.
// A card term change renames its entry id; a saved list naming the old id keeps the card (2026-11-09 bank follow-up:
// B4-U4-Q020's card "Domain Name System (DNS) name hierarchy example" became Subdomain).
// Owner decision 9a (2026-11-11): three Block 5 cards have their course terms back; Group Policy Object and Proxy Server are
// also Block 4 terms, so their Block 5 entries are "-b5" (build_glossary.assign_ids).
export const RENAMED_ENTRIES = Object.freeze({ 'domain-name-system-dns-name-hierarchy-example': 'third-level-domain',
  'subdomain': 'third-level-domain', 'security-technical-implementation-guide-stig-b1': 'security-technical-implementation-guide-stig',
  'group-policy-configuration-set': 'group-policy-object-b5', 'proxy-outbound-control': 'proxy-server-b5',
  'building-an-access-control-list-acl': 'access-control-list-acl' });
export const restoreBookmarks = (raw, g) => Array.isArray(raw) ? [...new Set(raw.map(id => typeof id === 'string' && Object.hasOwn(RENAMED_ENTRIES, id) ? RENAMED_ENTRIES[id] : id)
  .filter(id => typeof id === 'string' && g.byId.has(id)))] : [];
