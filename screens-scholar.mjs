// Scholar screen markup: the term list of a unit, the guided questions of a term (tap, order, sort, scenario) and the
// unit review. Pure functions of the state they receive; scholar.mjs holds the rules, scholar-ui.mjs the events and state.
// Inputs: the arguments of each function (Scholar items, glossary entries, tries, drafts). Outputs: HTML strings.
// Run: imported through screens.mjs, which re-exports its public functions; tests import them as screens.*.
// Network: none.
// Writes: none.
// Credentials: none.
import { LABEL } from './settings.mjs';
import { escape, answersHtml, plural, backLabel, nextLabel, ICON } from './presentation.mjs';
import { pictureHtml, tapBoardHtml } from './pictures.mjs';
import { typeOf, resolved as scholarResolved, right as scholarRight, currentDecision, decisionDone, checkMarks, rowOrder, draftOf, scholarAnswerState, decisionQuestion, scholarQuestion } from './scholar.mjs';

// ---- Scholar ----
// Term list of one unit: unit choice (a segmented row), then each term with its summary. done: {itemId: right answers}.
// todo: the first term of the unit whose guided questions are not all right, or null; review: show "Review this
// unit" (G4: the unit's guided questions in a shuffled order, practice only).
// each entry reuses its glossary entry (glossOf: entry id -> glossary entry or null): the
// one-line glossary definition instead of the Scholar summary, and a term longer than SHORT_NAME characters shows its glossary
// short form (an all-capital alias such as CMOS) with the full name for screen readers. The term page keeps the full texts.
const SHORT_NAME = 24;
// The term as the list shows it: a long term with an all-capital glossary alias shows the alias, the full name for screen readers.
const listName = (term, g) => { const alias = term.length > SHORT_NAME && g?.aliases.find(a => /^[A-Z][A-Z0-9&]{1,9}$/.test(a));
  return alias ? `${escape(alias)}<span class="sr-only"> (${escape(term)})</span>` : escape(term); };
/** The Scholar term list of one unit, or the term search matches of every unit while a search is set.
 * @param {object} o block, units, unit, items, done (right answers by item), todo, review, glossOf; unitDone {unit: {done, total}}; nextUnit (or null); query; matches
 * @returns {string} the screen markup */
export function scholarListHtml({block, units, unit, items, done = {}, todo = null, review = false, glossOf = () => null, unitDone = {}, nextUnit = null, query = '', matches = []}) {
  const seg = units.map(u => { const c = unitDone[u];
    return `<label><input type="radio" name="scholar-unit" value="${u}" ${u === unit ? 'checked' : ''}><span aria-hidden="true">U${u}</span><span class="sr-only">${LABEL.Section} ${u}${c ? `, ${c.done} of ${c.total} done` : ''}</span>${c ? `<small class="scholar-unit-done" aria-hidden="true">${c.done}/${c.total}</small>` : ''}</label>`; }).join('');
  const title = escape(block.units.find(u => u.id === unit)?.title || ''), searching = query.trim() !== '';
  // One term row: the term, its section while searching, the terms it also covers, its one-line definition (or
  // summary) and its progress.
  const row = it => { const n = done[it.id] || 0, all = it.questions.length, g = glossOf(it.entry);
    return `<li><button type="button" class="card" data-scholar-item="${escape(it.id)}"><strong>${listName(it.term, g)}</strong>${searching && it.unit !== unit ? `<span class="scholar-also">${LABEL.Section} ${it.unit}</span>` : ''}${it.covers ? `<span class="scholar-also">Also: ${it.covers.map(c => escape(c.term)).join(' · ')}</span>` : ''}<span>${escape(g?.short || it.summary)}</span>${n ? `<span class="tag" data-tone="scholar">${n === all ? 'Done' : `${n} of ${all} right`}</span>` : ''}</button></li>`; };
  const lead = searching ? (matches.length ? '' : '<p class="muted scholar-empty">No term matches. Try fewer words, or clear the search.</p>') : `${items.length && !todo ? `
    <p class="muted scholar-unit-complete">${LABEL.Section} ${unit} done.</p>${nextUnit ? `<div class="actions scholar-todo"><button type="button" id="scholar-next-unit" class="primary" data-tone="scholar" data-unit="${nextUnit}">${nextLabel(`Next ${LABEL.section}: ${LABEL.Section} ${nextUnit}`)}</button></div>` : ''}` : ''}${todo ? `
    <div class="actions scholar-todo"><button type="button" id="scholar-todo" class="primary" data-tone="scholar" data-scholar-next="${escape(todo.id)}">${nextLabel(`Study next: ${todo.term}`)}</button></div>` : ''}${review ? `
    <div class="actions scholar-review-start"><button type="button" id="scholar-review" data-tone="scholar">Review this ${LABEL.section}</button></div>` : ''}`;
  return `<div class="page-head"><p class="label">${LABEL.Group} ${block.id} · Scholar</p><h1>Scholar</h1></div>
    <section class="panel scholar-units" data-tone="scholar"><fieldset><legend class="label">${LABEL.Section}</legend><div class="seg scholar-unit-seg">${seg}</div></fieldset>
      <div class="step-head"><span class="num">${LABEL.Section} ${unit}</span><h2>${title}</h2></div></section>
    <div class="panel gloss-tools scholar-find"><label class="field" for="scholar-search">Find a term<input id="scholar-search" type="search" value="${escape(query)}" placeholder="Term or words, all ${LABEL.sections}" autocomplete="off"></label></div>
    <p class="status count" role="status">${searching ? `${plural(matches.length, 'match', 'matches')} in ${LABEL.Group} ${block.id}` : `${plural(items.length,'term')} · ${items.filter(it => (done[it.id] || 0) === it.questions.length).length} done`}</p>${lead}
    <ul class="scholar-list">${(searching ? matches : items).map(row).join('')}</ul>
    <div class="navrow actions"><button id="back">${backLabel('Mode')}</button></div>`;
}
// The tiles of a Scholar question: the other modes' tiles, except that after the reveal a choice nobody picked stays neutral
// and keeps its why.
const scholarTiles = (qn, st) => answersHtml(scholarQuestion(qn), st, { assisted: true, neutralUnpicked: true });
// One term. The sections form one connected accordion (linked together rather than as separate
// pills), each open unless the reader closed it (open: {section: false}). The guided question mirrors the question
// screen (q-sheet, #N heading, stem, answers, navrow with Next at the right, tool-row with Hint) and teaches: a Hint before
// the pick, a "Look again" pointer to the section or picture step that explains it after a wrong pick, and a Takeaway when
// the question is over (hint, nudge, takeaway). No course-page lines.
// tries: this question's picks; hint: the hint is shown; done(question): it is over; pic: {index, motion, playing}.
// back: 'Glossary' | 'Card N' | '' when the term was opened from the Glossary or a card.
const SEE_LABEL = { deeper: 'Deeper explanation', analogy: 'Analogy', scenario: 'Sample scenario', example: 'Everyday example' };
// The name of the part a "Look again" pointer opens: a reading section, or the picture's step or labelled part.
export const seeLabel = (see, picture) => { const [part, n] = see.split(':'); return part !== 'picture' ? SEE_LABEL[part] : picture?.kind === 'steps' ? `Picture, step ${Number(n) + 1}` : `Picture: ${picture?.parts?.[Number(n)]?.label ?? `part ${Number(n) + 1}`}`; };
// Everyday example: the "In the course: <definition>" line stays in the text; its source goes under it in the app's
// attribution style (.excerpt figcaption, "Block Text · p. 15").
// Only the "In the course" line goes into the attribution figure; the illustration before it stays plain text.
export const exampleHtml = text => { const m = /^(.*?)\s*(In the course: .*), ([^,]+) p\.(\d+)\.$/s.exec(text);
  return m ? `${m[1] ? `<p>${escape(m[1])}</p>` : ''}<div class="excerpt scholar-example"><figure><p>${escape(m[2])}.</p><figcaption>${escape(m[3])} · p. ${m[4]}</figcaption></figure></div>` : `<p>${escape(text)}</p>`; };
// Hands-on task labels: the type tag above the stem of the hands-on question (shown first).
const TASK_LABEL = { tap: 'Tap the picture', order: 'Put in order', sort: 'Sort', branch: 'Scenario' };
/** The body of the guided question by type.
 * @param {object} item the Scholar item (its picture is the tap board)
 * @param {object} qn the guided question
 * @param {Array} tries this question's picks or checks
 * @param {Array|null} draft the arrangement being built (order: shown indexes in the current order; sort: a group 0/1
 *   or null per item); null: built from the tries
 * @returns {object} {body, over, feedback, wrongNow, check} */
function guidedBody(item, qn, tries, draft) {
  const t = typeOf(qn);
  draft ??= draftOf(qn, tries);
  const over = scholarResolved(qn, tries), ok = scholarRight(qn, tries);
  const end = over ? (ok ? 'Correct.' : 'Answer revealed. Read why each part is right or wrong.') : '';
  if (t === 'choose' || t === 'tap') {
    const st = scholarAnswerState(qn, tries);
    const board = t === 'tap' && item.picture ? tapBoardHtml(item.picture, qn.answers, { wrong: tries.filter(i => i !== qn.key), right: over ? qn.key : null, done: over }) + '<p class="muted scholar-tap-help">Tap the picture, or choose below.</p>' : '';
    return { body: `${board}<div class="answers scholar-answers" role="group" aria-label="Answers">${scholarTiles(qn, st)}</div>`, over, wrongNow: tries.length > 0 && !over,
      feedback: !tries.length ? '' : over ? end : 'Incorrect. Read why, then pick again.' };
  }
  if (t === 'order' || t === 'sort') {
    const last = tries[tries.length - 1], shown = over ? (t === 'order' ? qn.key : qn.key) : draft;
    // Over: solved = every row green; revealed (two wrong checks) = the right arrangement in neutral rows under a visible
    // "Answer revealed" line, never green.
    const marks = over ? null : last && same(last, draft) ? checkMarks(qn, last) : null, done = over ? (ok ? 'right' : 'revealed') : '';
    // The state of row i: 'right' or 'wrong' after a check, else the end state ('right', 'revealed' or '').
    const mark = i => marks ? (marks[i] ? 'right' : 'wrong') : done;
    // The line under row i after a check: 'In the right place' (none at the end) or 'Not here'.
    const markText = i => mark(i) === 'right' ? (over ? '' : 'In the right place') : mark(i) === 'wrong' ? 'Not here' : '';
    let rows;
    if (t === 'order') {
      rows = shown.map((si, pos) => { const s0 = qn.steps[si], m = mark(pos);
        return `<li class="scholar-row${m ? ` is-${m}` : ''}" data-step="${si}"><span class="scholar-pos" aria-hidden="true">${pos + 1}</span><span class="scholar-row-text"><span>${escape(s0.text)}</span>${marks && !over ? `<span class="feedback-label">${markText(pos)}</span>` : ''}${over ? `<span class="back"><em>${escape(s0.why)}</em></span>` : ''}</span>${over ? '' : `<span class="scholar-move"><button type="button" class="small" data-move="${pos}" data-dir="-1" aria-label="Move up: ${escape(s0.text)}"${pos === 0 ? ' disabled' : ''}>${ICON.up}</button><button type="button" class="small" data-move="${pos}" data-dir="1" aria-label="Move down: ${escape(s0.text)}"${pos === shown.length - 1 ? ' disabled' : ''}>${ICON.down}</button></span>`}</li>`; }).join('');
      rows = `<ol class="scholar-rows scholar-order" aria-label="Steps, first to last">${rows}</ol>`;
    } else {
      // Rows in the shuffled display order; each keeps its item index i (the radio name and the pick).
      rows = rowOrder(qn).map(i => { const x = qn.items[i], g = shown[i], m = mark(i);
        const seg = qn.groups.map((name, k) => `<label><input type="radio" name="sort-${i}" value="${k}"${g === k ? ' checked' : ''}${over ? ' disabled' : ''}>${escape(name)}</label>`).join('');
        return `<li class="scholar-row${m ? ` is-${m}` : ''}"><fieldset><legend class="scholar-row-text"><span>${escape(x.text)}</span>${marks && !over ? `<span class="feedback-label">${m === 'right' ? 'Right group' : 'Wrong group'}</span>` : ''}${over ? `<span class="feedback-label">${escape(qn.groups[qn.key[i]])}</span><span class="back"><em>${escape(x.why)}</em></span>` : ''}</legend><div class="seg scholar-sort-seg" data-sort="${i}">${seg}</div></fieldset></li>`; }).join('');
      rows = `<ul class="scholar-rows scholar-sort">${rows}</ul>`;
    }
    const ready = !over && (t === 'order' || draft.every(g => g === 0 || g === 1)) && !tries.some(x => same(x, draft));
    if (done === 'revealed') rows = `<p class="feedback-label scholar-revealed">Answer revealed: ${t === 'order' ? 'the right order' : 'the right groups'}</p>` + rows;
    return { body: rows, over, wrongNow: tries.length > 0 && !over, check: over ? '' : `<button id="scholar-check" class="primary" data-tone="scholar"${ready ? '' : ' disabled'}>${t === 'order' ? 'Check order' : 'Check'}</button>`,
      feedback: !tries.length ? '' : over ? end : `${checkMarks(qn, last).filter(Boolean).length} of ${qn.key.length} right. Change the ones marked, then check again.` };
  }
  // Branch: decisions so far, each with the picks made; the current one takes answers.
  const k = currentDecision(qn, tries);
  const parts = qn.steps.slice(0, Math.min(k + 1, qn.steps.length)).map((d, j) => {
    const dq = decisionQuestion(qn, j), picks = tries[j] || [], st = scholarAnswerState(dq, picks, Math.min(2, d.choices.length - 1));
    return `<div class="scholar-decision${j < k || over ? ' is-done' : ''}" data-decision="${j}"><p class="scholar-prompt"><span class="label">Decision ${j + 1} of ${qn.steps.length}</span> ${escape(d.prompt)}</p><div class="answers scholar-answers" role="group" aria-label="Choices for decision ${j + 1}">${scholarTiles(dq, st)}</div></div>`; }).join('');
  const now = tries[k] || [], d = qn.steps[k];
  return { body: parts, over, wrongNow: now.length > 0 && !decisionDone(d, now),
    feedback: !tries.length ? '' : over ? end : now.length ? 'Incorrect. Read why, then pick again.' : `${(tries[k - 1] || []).includes(qn.steps[k - 1]?.key) ? 'Correct.' : 'Answer revealed.'} Decision ${k + 1} of ${qn.steps.length}.` };
}
// True when two arrays hold the same values in the same order.
const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);
// Row height probes of an order or sort question (answer heights as in quizzes): its rows in their two
// tallest states, after a wrong check (a mark line on each row) and at the end (the why on each row).
export function scholarRowProbes(item, qn) {
  const wrong = typeOf(qn) === 'order' ? [...qn.key].reverse() : qn.key.map(g => 1 - g);
  return [guidedBody(item, qn, [wrong], wrong).body, guidedBody(item, qn, [qn.key]).body];
}

/** The guided question without its navigation (shared by the term page and the unit review).
 * @param {object} item the Scholar item
 * @param {object} qn the guided question
 * @param {object} g the result of guidedBody (body, over, feedback, wrongNow, check)
 * @param {boolean} hint the hint is shown
 * @param {object} o see: false leaves out "Look again" (the unit review has no reading sections on screen; the
 *   takeaway and every why still show)
 * @returns {string} the section markup */
function guidedSection(item, qn, g, hint, {see = true} = {}) {
  const t = typeOf(qn), over = g.over;
  return `<section class="question-focus" aria-label="Guided question">${TASK_LABEL[t] ? `<p class="label scholar-task">${TASK_LABEL[t]}</p>` : ''}
      <h2 id="scholar-stem" class="stem" tabindex="-1">${escape(qn.stem)}</h2>
      ${hint ? `<p class="scholar-hint" id="scholar-hint-text" tabindex="-1"><span class="label">Hint</span> ${escape(qn.hint)}</p>` : ''}</section>
      ${g.body}
      <p class="sr-only" role="status" data-say="${escape(g.feedback)}"></p>
      ${see && g.wrongNow ? `<p class="scholar-see"><span class="label">Look again</span> <button type="button" class="link-button" id="scholar-see" data-see="${escape(qn.see)}">${escape(seeLabel(qn.see, item.picture))}</button></p>` : ''}
      ${over ? `<p class="scholar-takeaway"><span class="label">Takeaway</span> ${escape(qn.takeaway)}</p>` : ''}
      <div class="tool-row scholar-tools"><button id="scholar-hint" aria-controls="scholar-stem"${hint || over ? ' disabled' : ''}>${hint ? 'Hint shown' : 'Hint'}</button>${g.check || ''}</div>`;
}

// Unit review: one guided question of a deck mixed across the unit's terms; practice only.
// deck: [{item, q}]; k: the place in it; tries, hint, draft as on the term page.
export function scholarReviewHtml({block, unit, item, qn, k, total, tries = [], hint = false, draft = null}) {
  const g = guidedBody(item, qn, tries, draft), over = g.over;
  return `<div class="page-head"><p class="label">${LABEL.Group} ${block.id} · Scholar · ${LABEL.Section} ${unit} review</p><h1 id="scholar-review-title">Review: question ${k + 1} of ${total}</h1></div>
    <article class="panel scholar-item scholar-review" data-tone="scholar" aria-labelledby="scholar-review-title">
      <p class="label scholar-review-term">Term · <button type="button" class="link-button" id="scholar-review-term" data-scholar-item="${escape(item.id)}">${escape(item.term)}</button></p>
      <div class="scholar-q" data-type="${typeOf(qn)}">${guidedSection(item, qn, g, hint, {see: false})}
      <div class="navrow actions scholar-q-nav">${k > 0 ? `<button id="scholar-review-prev">${backLabel('Previous question')}</button>` : ''}${k < total - 1 ? `<button id="scholar-review-next"${over ? ' class="primary" data-tone="scholar"' : ''}>${nextLabel('Next question')}</button>` : `<button id="scholar-review-end"${over ? ' class="primary" data-tone="scholar"' : ''}>${nextLabel('Finish review')}</button>`}</div></div>
    </article>
    <div class="navrow actions scholar-nav"><button id="scholar-review-exit">${backLabel('All terms')}</button></div>`;
}

// started: some guided question of this term has a pick (the Reset questions link shows).
// related: the glossary's related terms [{id, term, item, part}]; item (a Scholar item id) opens that term in
// Scholar, else the term opens its glossary pop-up.
export function scholarItemHtml({block, item, q, tries = [], hint = false, nav, done, back = '', pic = {}, open = {}, draft = null, started = false, related = []}) {
  const qn = item.questions[q], n = item.questions.length, t = typeOf(qn);
  // One reading section as a disclosure, open unless the player closed it (open[kind] === false).
  const section = (kind, label, body) => `<details class="scholar-drop" data-section="${kind}"${open[kind] === false ? '' : ' open'}><summary><span class="label">${label}</span></summary><div class="scholar-drop-body">${body}</div></details>`;
  // A blank line starts a new paragraph (an umbrella's Deeper has one paragraph per covered term).
  const text = t0 => t0.split(/\n\s*\n/).map(x => `<p>${escape(x.trim())}</p>`).join('');
  const g = guidedBody(item, qn, tries, draft), over = g.over;
  // One counter: the section title says "Guided question N of M"; the sheet shows only the task type of a
  // hands-on question. The tiles show Correct / Incorrect; the status line is for screen readers only.
  const quiz = `<div class="scholar-q" data-type="${t}">${guidedSection(item, qn, g, hint)}
      <div class="navrow actions scholar-q-nav">${q > 0 ? `<button id="scholar-prev-q">${backLabel('Previous question')}</button>` : ''}${q < n - 1 ? `<button id="scholar-next-q"${over ? ' class="primary" data-tone="scholar"' : ''}>${nextLabel('Next question')}</button>` : ''}</div>
      ${started ? '<p class="scholar-reset"><button type="button" class="link-button" id="scholar-reset">Reset this term\'s questions</button></p>' : ''}</div>`;
  // Term nav: Next term always at the right (on a unit's last term: Next unit, its first term); All terms takes
  // Previous term's place on the first term; the way back (Glossary / Card N) under them.
  const first = nav.previous ? `<button id="scholar-prev" data-scholar-item="${escape(nav.previous.id)}">${backLabel('Previous term')}</button>` : `<button id="scholar-list">${backLabel('All terms')}</button>`;
  const second = [nav.previous ? `<button id="scholar-list">${backLabel('All terms')}</button>` : '', back ? `<button id="scholar-return">${backLabel(back)}</button>` : ''].join('');
  return `<div class="page-head"><p class="label">${LABEL.Group} ${block.id} · Scholar · ${LABEL.Section} ${item.unit}</p><h1 id="scholar-term">${escape(item.term)}</h1></div>
    <article class="panel scholar-item" data-tone="scholar" aria-labelledby="scholar-term">
      <p class="scholar-summary">${escape(item.summary)}</p>${item.covers ? `
      <p class="scholar-also"><span class="label">Also covers</span> ${item.covers.map(c => `<button type="button" class="link-button" data-see="picture:${c.part}">${escape(c.term)}</button>`).join('\u00a0· ')}</p>` : ''}${related.length ? `
      <p class="scholar-related"><span class="label">Related</span> ${related.map(r => r.item ? `<button type="button" class="link-button" data-scholar-item="${escape(r.item)}"${Number.isInteger(r.part) ? ` data-part="${r.part}"` : ''}>${escape(r.term)}</button>` : `<button type="button" class="link-button term-link" data-term="${escape(r.id)}" aria-haspopup="dialog">${escape(r.term)}</button>`).join('\u00a0· ')}</p>` : ''}
      <div class="scholar-accordion">${item.picture ? section('picture', `Picture · ${item.picture.kind === 'steps' ? 'step through' : 'tap a part'}`, pictureHtml(item.picture, pic.index ?? 0, pic)) : ''}${section('deeper', 'Deeper explanation', text(item.deeper))}${section('analogy', 'Analogy', text(item.analogy))}${section('scenario', 'Sample scenario', text(item.scenario))}${section('example', 'Everyday example', exampleHtml(item.example))}${section('questions', `Guided question ${q + 1} of ${n}`, quiz)}</div></article>
    <div class="navrow actions scholar-nav">${first}${nav.next ? `<button id="scholar-next" class="primary" data-tone="scholar" data-scholar-item="${escape(nav.next.id)}">${nextLabel('Next term')}</button>` : nav.nextUnit ? `<button id="scholar-next-unit" class="primary" data-tone="scholar" data-scholar-item="${escape(nav.nextUnit.id)}" aria-label="Next ${LABEL.section}: ${LABEL.Section} ${nav.nextUnit.unit}, ${escape(nav.nextUnit.term)}">${nextLabel(`Next ${LABEL.section}`)}</button>` : ''}${second}</div>`;
}
