// Pure markup shared by study/review screens; no grading or storage effects.
import { LABEL } from './settings.mjs';
export const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

// Counts in running text: plural(3,'card') is "3 cards"; plural(1,'card') is "1 card".
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
// 1st, 2nd, 3rd, 4th … for attempt and try labels.
export const ordinal = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({1:'st',2:'nd',3:'rd'}[n % 10] || 'th')}`;
// Excerpt and highlight-card source line: "Block Text · p. 37".
export const pageLabel = (label, n) => `${label} · p. ${n}`;
// COMM badge, one flat accent colour (flat, not a duotone): Welcome and the Blocks screen head.
export const commBadge = '<span class="comm-badge" role="img" aria-label="USAF Communications and Information badge"></span>';

export function highlightedStem(question) {
  let cursor = 0, output = '';
  for (const term of [...question.keywords].sort((a, b) => a.start - b.start)) {
    output += escape(question.stem.slice(cursor, term.start));
    output += `<mark>${escape(question.stem.slice(term.start, term.end))}</mark>`;
    cursor = term.end;
  }
  return output + escape(question.stem.slice(cursor));
}

// counts (optional): {all: 'label', units: {unitId: n}} for the right-hand count column.
// tone (optional): 'bad' colours the counts red (marked-for-review questions on the practice screen).
export function unitChoices(block, selected, name = 'unit', counts = null, tone = '') {
  const cls = `mono${tone ? ' unit-count' : ''}`, attr = tone ? ` data-tone="${escape(tone)}"` : '';
  return `<div class="all-row"><label class="card row">
    <input data-all-units type="checkbox" ${selected.length === block.units.length ? 'checked' : ''}><strong>All ${LABEL.sections}</strong>${counts ? `<span class="${cls}"${attr} data-count="all">${escape(counts.all)}</span>` : ''}</label></div>
    <div class="units">${block.units.map(unit => `<label class="card row"><input type="checkbox" name="${escape(name)}" value="${unit.id}" ${selected.includes(unit.id) ? 'checked' : ''}>
      <span><span class="unit-number">U${unit.id}</span>${escape(unit.title)}</span>${counts ? `<span class="${cls}"${attr} data-count="${unit.id}">${counts.units[unit.id] ?? 0}</span>` : ''}</label>`).join('')}</div>`;
}

// Drawn button icons: 1 cap tall on the text baseline, so the icon midpoint is the capital-letter midpoint.
const ICON_STROKE = 'fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"';
export const ICON = {
  back: `<svg class="ico" viewBox="1 1 14 14" aria-hidden="true" focusable="false"><path d="M14.5 8H2M7.5 2.5 2 8l5.5 5.5" ${ICON_STROKE}/></svg>`,
  next: `<svg class="ico" viewBox="1 1 14 14" aria-hidden="true" focusable="false"><path d="M1.5 8H14M8.5 2.5 14 8l-5.5 5.5" ${ICON_STROKE}/></svg>`,
  // Up / down: move a step in a Scholar order task (buttons, no drag; WCAG 2.5.7).
  up: `<svg class="ico" viewBox="1 1 14 14" aria-hidden="true" focusable="false"><path d="M8 14.5V2M2.5 7.5 8 2l5.5 5.5" ${ICON_STROKE}/></svg>`,
  down: `<svg class="ico" viewBox="1 1 14 14" aria-hidden="true" focusable="false"><path d="M8 1.5V14M2.5 8.5 8 14l5.5-5.5" ${ICON_STROKE}/></svg>`,
  // Swap: a right arrow over a left arrow, before "Quiz" / "Scholar" on the nav context button.
  swap: `<svg class="ico" viewBox="1 1 14 14" aria-hidden="true" focusable="false"><path d="M2 4.75H14M11 1.75 14 4.75 11 7.75M14 11.25H2M5 8.25 2 11.25 5 14.25" ${ICON_STROKE}/></svg>`,
  // Play / pause of the Scholar picture loop: Flag-sized button, filled triangle or two bars.
  play: `<svg class="flag-ico" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M6.5 4.5v11l9-5.5Z" ${ICON_STROKE}/></svg>`,
  pause: `<svg class="flag-ico" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M7 4.5v11M13 4.5v11" ${ICON_STROKE}/></svg>`,
  // Rewind / forward of a Scholar picture: two triangles, as on a media player.
  rewind: `<svg class="flag-ico" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 5 4 10l6 5ZM16.5 5l-6 5 6 5Z" ${ICON_STROKE}/></svg>`,
  forward: `<svg class="flag-ico" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 5l6 5-6 5ZM3.5 5l6 5-6 5Z" ${ICON_STROKE}/></svg>`,
  retry: `<svg class="ico" viewBox="1 0.2 14 14" aria-hidden="true" focusable="false"><path d="M12.6 5.4A5.3 5.3 0 1 1 8 2.8M6.2 1 8.2 2.8 6.2 4.6" ${ICON_STROKE}/></svg>`,
  flag: `<svg class="flag-ico" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path class="flag-cloth" d="M5 3.5 16 7.75 5 12Z" ${ICON_STROKE}/><path d="M5 2.5V17.5" ${ICON_STROKE}/></svg>`,
  // Floppy disk: the body fills when pressed (as the flag cloth); shutter and label then show in the sheet colour.
  save: `<svg class="flag-ico" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path class="flag-cloth" d="M3.5 3.5h10l3 3v10h-13Z" ${ICON_STROKE}/><path class="save-slot" d="M6.5 3.5v3.5h6V3.5M6.5 16.5v-4.5h7v4.5" ${ICON_STROKE}/></svg>`,
};
// Flag: a square icon button beside the Source row. A saved flag fills the pennant.
// card: the card Flag carries data-flag-card, so question-flag updates never touch it.
export const flagButton = ({id = '', question, label = 'Flag question', flagged = false, card = false}) =>
  `<button type="button" class="flag-btn" ${id ? `id="${escape(id)}" ` : ''}data-flag-${card ? 'card' : 'question'}="${escape(question)}" aria-label="${escape(label)}" title="${escape(label)}" aria-pressed="${flagged}">${ICON.flag}</button>`;
// Excerpt body (the question Source drop-down, term pop-ups and glossary entries): the build's blocks, paragraphs
// ({p}) and real lists ({ul: [{t, sub?}]}), or the text as one paragraph. A short first line with no end punctuation
// right above a list is its heading ("Patch Management": bullets show as real lists).
const excerptHeading = (b, next) => next?.ul && b.p.length <= 60 && b.p.split(' ').length <= 8 && !/[.,;!?]$/.test(b.p);
export const excerptBody = x => { const blocks = x.blocks || [{p: x.text}];
  return blocks.map((b, i) => b.p !== undefined ? `<p${i === 0 && excerptHeading(b, blocks[1]) ? ' class="excerpt-head"' : ''}>${escape(b.p)}</p>`
    : `<ul>${b.ul.map(it => `<li>${escape(it.t)}${it.sub ? `<ul>${it.sub.map(t => `<li>${escape(t)}</li>`).join('')}</ul>` : ''}</li>`).join('')}</ul>`).join(''); };
// Save: the Flag button's twin at the left of the answer tools row. Pressed = the card is in Manual.
// key: the card key (question ID, or a highlight card ID).
export const saveButton = ({id = '', key, saved = false}) =>
  `<button type="button" class="flag-btn save-btn" ${id ? `id="${escape(id)}" ` : ''}data-save-card="${escape(key)}" aria-label="${saved ? 'Saved as a flash card' : 'Save as a flash card'}" title="Save as a flash card" aria-pressed="${saved}">${ICON.save}</button>`;
// Answer tools row: SAVE · KEY TERMS · SOURCE · FLAG on one row at every width (SAVE sits at the left). Each drop-down is a toggle
// button followed by its panel; the row is a grid, so the toggles and the Flag share line 1 and an open panel takes the
// full row width under them. DOM order (toggle, its panel, next toggle, Flag) is the keyboard and screen-reader order.
// count: the number on the toggle, in blue ("KEY TERMS 6"); unit: the screen-reader word after it ("excerpts", "terms").
export const dropHtml = (kind, label, count, unit, body) =>
  `<div class="drop drop-${escape(kind)}"><button type="button" class="drop-toggle" data-drop="${escape(kind)}" aria-expanded="false"><span class="label">${escape(label)} <span class="drop-count">${count}<span class="sr-only"> ${escape(unit)}</span></span></span></button><div class="drop-panel" hidden>${body}</div></div>`;
// source: the Source cell (drop-down, held or loading line) or ''; flag: the Flag button or ''; terms: the Key terms drop-down or '';
// save: the Save button or ''. DOM order is SAVE, KEY TERMS, SOURCE, FLAG.
export const sourceRow = (source, flag, terms = '', save = '') => source || terms || flag || save
  ? `<div class="source-row${terms ? '' : ' no-terms'}${source ? '' : ' no-source'}${flag ? '' : ' no-flag'}${save ? '' : ' no-save'}">${save}${terms}${source}${flag}</div>` : '';
export const backLabel = text => `<span class="lbl">${ICON.back}${escape(text)}</span>`;
export const nextLabel = text => `<span class="lbl">${escape(text)}${ICON.next}</span>`;

// neutralUnpicked: after the reveal, a wrong choice nobody picked keeps its why but is not marked red.
// Every tile carries its why from the start; a pending why is hidden but keeps its space, so all tiles hold their answered
// height and a reveal moves nothing. The marker and tile colour show Correct / Incorrect.
export function answersHtml(q,c,{assisted,reviewing=false,neutralUnpicked=false}) {
  const revealed=['correct','revealed'].includes(c.resolved)||assisted&&c.stage>=4;
  return c.order.map((id,i)=>{
    const a=q.answers.find(a=>a.id===id),correct=revealed&&id===q.correctAnswerId;
    const eliminated=assisted&&(c.eliminated.includes(id)||c.stage===5&&id!==q.correctAnswerId);
    const wrong=assisted&&c.flippedWrong.includes(id)&&!correct&&!eliminated;
    const chosenWrong=c.wrongIds.includes(id);
    const incorrect=chosenWrong||(revealed&&!correct&&!neutralUnpicked);
    const marker=correct||incorrect?`<svg class="answer-marker" data-marker="${correct?'correct':'incorrect'}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${correct?'M5 12l4 4L19 8':'M7 7l10 10M17 7L7 17'}"/></svg>`:'ABCDEFGH'[i];
    const label=correct?(c.resolved==='revealed'?'Answer revealed':'Correct'):incorrect?'Incorrect':'';
    return `<button class="item${correct?' correct':''}${incorrect?' wrong':''}${eliminated&&!revealed?' eliminated':''}" data-answer="${escape(id)}" ${reviewing||c.resolved?'aria-disabled="true"':eliminated?'disabled':''}>
      <span class="letter ${correct?'correct-label':incorrect?'incorrect-label':''}" aria-hidden="true">${marker}</span>
      <span class="answer-body">${label?`<span class="sr-only">${label}: </span>`:''}<span class="answer-text"><span>${escape(a.text)}</span></span><span class="back${correct||wrong||revealed||c.resolved==='missed'&&chosenWrong?'':' pending'}"><em>${escape(a.rationale)}</em></span></span>
    </button>`;
  }).join('');
}

// Gear menu: the toggle opens and closes the panel; close() serves Escape, outside taps and menu actions.
export function toolsMenu({toggle, panel, onChange = () => {}}) {
  let open = false;
  const set = value => { open = value; panel.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); onChange(open); };
  toggle.addEventListener('click', () => set(!open));
  set(false);
  return {close: () => set(false), isOpen: () => open};
}

// Screen-reader text for the next Assisted step; empty when no step is pending.
export function assistanceTimer(current, mode) {
  if(!current||current.resolved||mode!=='Assisted')return '';
  const remaining=Math.max(0,(current.stage===0?20000:current.nextStageAt)-current.assistedMs);
  return `Next assistance in ${plural(Math.ceil(remaining/1000),'second')}`;
}

export function poolShortfall(available, requested) {
  if(!available)return `No questions match the selected ${LABEL.sections}.`;
  return requested!=='all'&&available<requested?`Your selection only has ${plural(available,'question')}.`:'';
}
export function questionUnitLabel(question, blocks) {
  const block=blocks.find(block=>block.id===question.block);
  return question.units.map(id=>`${LABEL.Section} ${id} · ${block?.units.find(unit=>unit.id===id)?.title||`Course ${LABEL.section}`}`).join(' / ');
}

// Review answer card: the quiz .item in its correct or wrong state, with the ✓ / ✕ marker in the letter box.
// Review row numbers: two digits (#01–#09) so every row's number and stem line up.
export const reviewNumber = n => `#${String(n).padStart(2, '0')}`;
export const reviewItem = (tone, label, text, why = '') => `<div class="item ${tone}"><span class="letter" aria-hidden="true">${tone === 'correct' ? '✓' : '✕'}</span><span class="answer-body"><span class="feedback-label">${label}</span><span class="answer-text"><span>${text}</span></span>${why}</span></div>`;
// Only answered questions appear in the answer review, in pool order; wrong attempts keep their order.
// gloss (optional): {text(q, part, answerId, text) -> linked html, terms(q) -> Key terms drop-down}.
// save(q): the SAVE button for the question's card, or '' where it has none; isOpen(id): a compact row was open.
export function answerReviewHtml(session, missed = [], source = () => '', isFlagged = () => false, gloss = null, {save = () => '', isOpen = () => false} = {}) {
  // The correct answer appears once, with its memory cue and its explanation. Wrong attempts follow in order.
  const T = (q, part, id, text) => gloss ? gloss.text(q, part, id, text) : escape(text);
  return session.questions.filter(q=>session.attempts.some(a=>a.questionId===q.id)).map(q=>{
    const right=q.answers.find(a=>a.id===q.correctAnswerId), wrong=session.attempts.filter(a=>a.questionId===q.id&&!a.correct);
    const why=(text,id=null)=>`<em class="review-explanation">${id?T(q,'rationale',id,text):escape(text)}</em>`;
    const n=session.pool.indexOf(q.id)+1, compact=!wrong.length&&!missed.includes(q.id);
    const body=`${missed.includes(q.id)&&!wrong.length?'<p><span class="tag" data-tone="bad">Missed in this session</span></p>':''}${reviewItem('correct','Correct answer',T(q,'answer',right.id,right.text),(q.reviewCue&&q.reviewCue!==right.rationale?why(q.reviewCue):'')+why(right.rationale,right.id))}${wrong.length?`<div class="answer-attempts">${wrong.map((a,i)=>{const pick=q.answers.find(x=>x.id===a.answerId);return reviewItem('wrong',wrong.length===1?'Your answer':`${ordinal(i+1)} answer`,T(q,'answer',pick.id,pick.text),why(pick.rationale,pick.id));}).join('')}</div>`:''}${sourceRow(source(q),flagButton({question:q.id,label:`Flag question ${n}`,flagged:isFlagged(q.id)}),gloss?gloss.terms(q):'',save(q))}`;
    // First-try correct: one line that opens to the full item; the flag shows when it is open.
    if(compact)return `<details class="review-item review-compact" data-review-item="${escape(q.id)}"${isOpen(q.id)?' open':''}><summary><strong class="review-number">${reviewNumber(n)}</strong><span class="correct-label" aria-hidden="true">✓</span><span class="review-compact-stem">${escape(q.stem)}</span><span class="sr-only">Correct on the first try</span></summary>${body}</details>`;
    // Not first-try correct: the same ✕ as the Exam review rows (✓ rows have a mark, so missed rows have one too).
    // Header: number · mark · stem in three grid columns, 8 px apart, as the compact rows; the stem keeps its own span.
    return `<article class="review-item"><h3 class="review-head"><strong class="review-number">${reviewNumber(n)}</strong><span class="incorrect-label review-mark" aria-hidden="true">✕</span><span class="review-stem"><span class="sr-only">Missed on the first try. </span>${T(q,'stem',null,q.stem)}</span></h3>${body}</article>`;
  }).join('');
}

// A source excerpt names the supporting text, so it appears only once the
// correct answer is known: a correct selection or a reveal. A missed
// appearance (including Hard) keeps the answer hidden until review.
export function sourceVisible(appearance) {
  return ['correct','revealed'].includes(appearance?.resolved);
}

// Count appearances, including automatic reveals; manual wrong taps within one appearance stay one try.
export function tryLabel(session, current) {
  return `${ordinal(1 + (session.history || []).filter(h => h.id === current.id && h.appearance < current.appearance).length)} Try`;
}

// One top row across quiz and card sessions: End Session, a centered status pill,
// and the mode control. Assisted/Unassisted toggles in place; locked modes stay
// visible (disabled) without suggesting the current pool can convert. Hard wears the gold gleam.
export function studyToolbar({mode, modes = [mode], locked = false, endId = 'end', status = '', statusTone = ''}) {
  const other = modes.find(value => value !== mode);
  const control = `<button class="small study-mode" data-tone="${mode === 'Hard' ? 'gold' : 'blue'}" id="study-mode" ${locked || !other ? 'disabled' : `data-mode="${escape(other)}" title="Switch to ${escape(other)}" aria-label="Study mode: ${escape(mode)}. Switch to ${escape(other)}"`}>${escape(mode)}</button>`;
  return `<div class="toolbar study-toolbar study-top"><button class="small study-end" id="${escape(endId)}">End Session</button><span class="tag study-status">${escape(status)}</span><div class="meta">${control}</div></div>`;
}
