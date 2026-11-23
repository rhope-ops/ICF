// Glossary markup: term links in a stem, key terms and excerpts, the Glossary screen and the term pop-up.
// Inputs: the arguments of each function. Outputs: HTML strings.
// Run: imported through screens.mjs, which re-exports its public functions.
// Network: none.
// Writes: none.
// Credentials: none.
import { LABEL } from './settings.mjs';
import { escape, plural, backLabel, nextLabel, sourceRow, dropHtml, excerptBody } from './presentation.mjs';
import { REPLACING_NOTE } from './screens-setup.mjs';

// ---- Glossary in questions ----
// A term link inside running text (stem, answers, rationales) is an inline span with role="button": a <button>
// is always an atomic box, so a long term broke the sentence into centred lines on phones. Enter and Space open it
// (one keydown listener in app.mjs). Lists of terms (Key terms, Related) keep real buttons.
const TERM_SPAN = ref => `<span role="button" tabindex="0" class="term-link" data-term="${escape(ref)}" aria-haspopup="dialog">`;
/**
 * Stem with key-term marks and glossary links. A link that partly overlaps a key-term mark is split at the mark's edge
 * into two spans with the same term, so the markup always nests and the term still opens. Each link is an inline span
 * (dotted underline, no colour change).
 * @param {object} q the question.
 * @param {object} [options] marks (show the key-term marks) and links (the spans from glossary.stemLinks()).
 * @returns {string} the HTML.
 */
export function linkedStem(q, {marks = false, links = []} = {}) {
  const kw = marks ? [...q.keywords].sort((a, b) => a.start - b.start) : [];
  let ok = links;
  for (const k of kw) ok = ok.flatMap(l => l.start < k.start && l.end > k.start && l.end < k.end ? [{...l, end: k.start}, {...l, start: k.start}]
    : l.start > k.start && l.start < k.end && l.end > k.end ? [{...l, end: k.end}, {...l, start: k.end}] : [l]);
  const open = [], events = [];
  for (const k of kw) events.push([k.start, 1, 'm', k], [k.end, 0, 'm', k]);
  for (const l of ok) events.push([l.start, 1, 'l', l], [l.end, 0, 'l', l]);
  // At one position: closes first; on opens, the longer span opens first (outer).
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1] || (a[1] ? (b[3].end - b[3].start) - (a[3].end - a[3].start) : (a[3].end - a[3].start) - (b[3].end - b[3].start)));
  let out = '', at = 0;
  for (const [pos, isOpen, kind, x] of events) {
    out += escape(q.stem.slice(at, pos)); at = pos;
    if (isOpen) { out += kind === 'm' ? '<mark>' : TERM_SPAN(x.ref); open.push(kind); }
    else out += kind === 'm' ? '</mark>' : '</span>';
  }
  return out + escape(q.stem.slice(at));
}
// Any text block with its precomputed glossary spans ([start, end, ref]); used where everything is resolved.
export function linkedText(text, spans = []) {
  let out = '', at = 0;
  for (const [start, end, ref] of [...spans].sort((a, b) => a[0] - b[0])) { if (start < at) continue; out += escape(text.slice(at, start)) + `${TERM_SPAN(ref)}${escape(text.slice(start, end))}</span>`; at = end; }
  return out + escape(text.slice(at));
}
// Key terms drop-down for the answer tools row, once the answer is known: one term per line. terms: [{id, term}].
export const keyTermsHtml = terms => terms.length ? dropHtml('terms', 'Key terms', terms.length, terms.length === 1 ? 'term' : 'terms',
  `<ul class="term-list">${terms.map(t => `<li><button type="button" class="term-link" data-term="${escape(t.id)}" aria-haspopup="dialog">${escape(t.term)}</button></li>`).join('')}</ul>`) : '';
// Course excerpts of an entry, verbatim, each with its document and page.
// Layout comes from the build (blocks: paragraphs and real lists); the words are the course text.
const excerptsHtml = (entry, docs) => entry.excerpts.length ? `<ul class="term-excerpts">${entry.excerpts.map(x => `<li><blockquote>${excerptBody(x)}</blockquote><span class="label">${escape(docs[x.doc] || x.doc)} · p. ${x.page}</span></li>`).join('')}</ul>` : '';
// ---- Glossary screen ----
// list: entries to show (search + unit filter); entry: the open entry or null; questionCount(e): {standard, hard} questions
// with the term (one button per pool; the Hard one in the Hard gold; a pool with none shows no button).
// Key terms of a glossary entry (card back and Glossary entry): the terms linked in its definition, then its related terms.
export function entryTerms(entry, g) {
  // The name to show for a link reference: an acronym's text, or the entry's term, else the reference itself.
  const termName = ref => { const p = ref.startsWith('acr:') ? ref.slice(4) : g.byId.get(ref)?.term; return p || ref; };
  const refs = [...(entry.defLinks || []).map(([, , ref]) => ref), ...entry.related.filter(id => g.byId.has(id))];
  return [...new Set(refs)].map(ref => ({id: ref, term: termName(ref)}));
}
// Source drop-down of a glossary entry: its course excerpts, verbatim, each with document and page (as the question Source).
const entrySource = (entry, docs) => entry.excerpts.length ? dropHtml('source', 'Source', entry.excerpts.length, entry.excerpts.length === 1 ? 'excerpt' : 'excerpts',
  `<div class="excerpt">${entry.excerpts.map(x => `<figure><blockquote>${excerptBody(x)}</blockquote><figcaption>${escape(docs[x.doc] || x.doc)} · p. ${x.page}</figcaption></figure>`).join('')}</div>`) : '';
// The Missed set tag: the card is in Missed Questions (SAVE shows Manual only). Bad tone = missed, as on Results.
export const IN_MISSED = '<span class="tag in-missed" data-tone="bad">Missed set</span>';
/**
 * The Glossary screen: the open entry, or the term list with search, unit chips and the grouping choice.
 * @param {object} args block, g (the glossary), list (entries to show), query, unit (the unit filter), entry (the open
 * entry or null), questionCount(e) ({standard, hard} questions with the term: one button per pool, the Hard one in
 * gold; a pool with none shows no button), save (the Save button for the entry's card or ''), flag (the entry
 * card's Flag button), toCard ('Card N' when the entry was opened from a flash card, giving the back button to
 * that card, else ''), group ('unit': Unit 1 ... Unit 8 headings with A-Z inside each; or 'az': one A-Z list with the
 * letter bar), replacing (show the note about replacing the pool) and scholar (the entry has a Scholar item: an Open
 * in Scholar button under the entry).
 * @returns {string} the HTML.
 */
export function glossaryHtml({block, g, list, query, unit, entry, questionCount, save = '', flag = '', toCard = '', group = 'unit', replacing = false, scholar = false}) {
  // The first letter of a term, capitalised, or # when it has no letter.
  const letter = e => (e.term.match(/[A-Za-z]/)?.[0] || '#').toUpperCase();
  const letters = [...new Set(list.map(letter))];
  const head = `<div class="page-head"><p class="label">${LABEL.Group} ${block.id} · ${plural(g.entries.filter(e => e.block === block.id).length,'term')} from the course</p><h1>Glossary</h1></div>`;
  if (entry) {
    const n = questionCount(entry);
    // A button that opens the questions with this term; nothing when the count is 0.
    const poolButton = (id, label, count, tone = '') => count ? `<button id="${id}" class="primary"${tone ? ` data-tone="${tone}"` : ''}>${label} questions with this term (${count})</button>` : '';
    const pools = poolButton('gloss-questions', 'Standard', n.standard) + poolButton('gloss-hard-questions', 'Hard', n.hard, 'gold');
    return `${head}
      <article class="panel gloss-entry" aria-labelledby="gloss-term"><div class="step-head"><span class="num">${LABEL.Section} ${entry.unit} · ${escape(block.units.find(u => u.id === entry.unit)?.title || '')}</span><h2 id="gloss-term">${escape(entry.term)}</h2></div>
      ${entry.aliases.length ? `<p class="label">${entry.aliases.map(escape).join(' · ')}</p>` : ''}<p class="gloss-short">${escape(entry.short)}</p>
      ${sourceRow(entrySource(entry, g.docs), flag, keyTermsHtml(entryTerms(entry, g)), save)}
      ${pools ? `<div class="actions gloss-pools">${pools}</div>${replacing ? REPLACING_NOTE : ''}` : ''}
      ${scholar ? `<div class="actions gloss-scholar"><button id="gloss-open-scholar" data-tone="scholar">${nextLabel('Open in Scholar')}</button></div>` : ''}</article>
      <div class="navrow actions">${toCard ? `<button id="gloss-card">${backLabel(toCard)}</button><button id="gloss-back">All terms</button>` : `<button id="gloss-back">${backLabel('All terms')}</button>`}</div>`;
  }
  // One entry of the term list: a card button with the term and its short definition.
  const item = e => `<li><button type="button" class="card" data-entry="${escape(e.id)}"><strong>${escape(e.term)}</strong><span>${escape(e.short)}</span></button></li>`;
  // Compare two entries by term, ignoring case, for sorting.
  const byTerm = (a, b) => a.term.toLowerCase() < b.term.toLowerCase() ? -1 : 1;
  const units = block.units.filter(u => list.some(e => e.unit === u.id));
  const sections = group === 'az'
    ? letters.map(l => `<section id="gloss-${l}" class="gloss-letter"><h2>${l}</h2><ul>${list.filter(e => letter(e) === l).map(item).join('')}</ul></section>`).join('')
    : units.map(u => `<section id="gloss-u${u.id}" class="gloss-letter gloss-unit"><h2><span class="unit-number">U${u.id}</span>${escape(u.title)}</h2><ul>${list.filter(e => e.unit === u.id).sort(byTerm).map(item).join('')}</ul></section>`).join('');
  // The Unit chips filter the list, so By unit has no jump row; A–Z keeps the letter row.
  const jump = group === 'az' ? `<nav class="az" aria-label="Jump to letter">${letters.map(l => `<a href="#gloss-${l}">${l}</a>`).join('')}</nav>` : '';
  return `${head}<div class="panel gloss-tools"><label class="field" for="gloss-search">Search<input id="gloss-search" type="search" value="${escape(query)}" placeholder="Term, acronym or words" autocomplete="off"></label>
    <fieldset class="unit-chips"><legend class="field">${LABEL.Section}</legend><div class="chips">${[{id: 0, title: `All ${LABEL.sections}`}, ...block.units].map(u => `<label title="${escape(u.title)}"><input type="radio" name="gloss-unit" value="${u.id}" ${u.id===unit?'checked':''}>${u.id ? `U${u.id}<span class="sr-only"> · ${escape(u.title)}</span>` : 'All'}</label>`).join('')}</div></fieldset>
    <fieldset class="gloss-group"><legend class="sr-only">Group terms</legend><div class="seg">${[['unit',`By ${LABEL.section}`],['az','A–Z']].map(([v,t]) => `<label><input type="radio" name="gloss-group" value="${v}" ${group===v?'checked':''}>${t}</label>`).join('')}</div></fieldset>
    ${jump}</div>
    <p class="status count" role="status">${plural(list.length,'term')}</p>
    <div class="gloss-list">${sections || `<p class="muted gloss-empty">No terms match. Try a shorter word${unit ? `, or choose All ${LABEL.sections}` : ''}.</p>`}</div>
    <div class="navrow actions">${toCard ? `<button id="gloss-card">${backLabel(toCard)}</button>` : `<button id="back">${backLabel('Mode')}</button>`}</div>`;
}

// A definition's first sentence and the rest ('' when it has one sentence). A dot after a capital letter (U.S.) does not end it.
export function splitSummary(text) {
  const m = /^(.*?[a-z0-9)\]][.!?])\s+(?=[A-Z0-9"(])/s.exec(text);
  return m ? [m[1], text.slice(m[0].length)] : [text, ''];
}
// Term popover (desktop) / bottom sheet (phone). content: glossary.popover(). It opens on a short summary, the first sentence
// of the definition; More expands the rest and the excerpts. save: the Save button for the term's
// flash card, beside the close button, or ''.
// scholar: the term has a Scholar item, so "Study in Scholar" opens it (one tap from a
// missed question's key term to its explanation).
export function termPopoverHtml(content, {more = false, docs = {}, save = '', scholar = false} = {}) {
  const e = content.entry, [summary, rest] = e ? splitSummary(e.short) : ['', ''];
  return `<div class="pop-head"><h2 id="term-pop-title">${escape(content.title)}</h2>${save}<button type="button" class="small" id="term-pop-close" aria-label="Close">✕</button></div>
    ${content.expansion ? `<p class="pop-expansion">${escape(content.expansion)}</p>` : ''}
    ${e ? `${content.expansion ? `<p class="label">${escape(e.term)}</p>` : ''}<p class="pop-summary">${escape(more ? e.short : summary)}</p>${more ? excerptsHtml(e, docs) : rest || e.excerpts.length ? '<button type="button" class="link-button" id="term-pop-more">More</button>' : ''}` : ''}
    ${content.see.length ? `<p class="pop-see"><span class="label">See</span> ${content.see.map(x => `<button type="button" class="link-button" data-term="${escape(x.id)}">${escape(x.term)}</button>`).join(' · ')}</p>` : ''}
    ${scholar ? '<p class="pop-scholar"><button type="button" class="link-button" id="term-pop-scholar" data-tone="scholar">Study in Scholar</button></p>' : ''}`;
}
