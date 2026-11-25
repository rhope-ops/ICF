// Screen markup: pure functions of the state they receive (the app modules own state, storage, events and timers), so tests
// import these screens directly. Every value comes in as an argument; only the layout helpers at the end touch the DOM.
// Inputs: the arguments of each function. Outputs: HTML strings; positionQuestion scrolls the window it receives.
// Run: imported by the app modules and the tests (screens.*); the Scholar, Exam, setup and Glossary groups are
// re-exported from screens-scholar.mjs, screens-exam.mjs, screens-setup.mjs and screens-glossary.mjs.
// Network: none.
// Writes: none (positionQuestion changes only the scroll position of the window and answers it receives).
// Credentials: none.
import { LABEL, NARROW_OR_SHORT_QUERY } from './settings.mjs';
import { escape, answersHtml, highlightedStem, plural, commBadge, questionUnitLabel, answerReviewHtml, reviewItem, tryLabel, studyToolbar, sourceVisible, backLabel, nextLabel, ICON, flagButton, sourceRow, assistanceTimer, saveButton } from './presentation.mjs';
import { progress, results, questionsForMode, keywordHighlightEnabled } from './engine.mjs';
import { understandingRecord, notUnderstoodQuestions, sessionMissedIds, reviewIds } from './learning.mjs';
import { unitScores, missedUnits, scoreTone, shine } from './analytics.mjs';
import { formsFor } from './exam.mjs';
import { cardHtml, savedSetsHtml, cardKey } from './flashcards.mjs';
// The Scholar and Exam screens live in their own modules; screens.mjs re-exports their public functions, so callers and
// tests keep one import (screens.*).
export { scholarListHtml, seeLabel, exampleHtml, scholarRowProbes, scholarReviewHtml, scholarItemHtml } from './screens-scholar.mjs';
export { examSetupHtml, examClock, examHtml, submitCheckHtml, examResultsHtml } from './screens-exam.mjs';
import { examHistoryHtml } from './screens-exam.mjs';
export { POOL_HELP, poolKindControl, modeCards, NO_UNITS, poolSeg, studyHubHtml, REPLACING_NOTE, questionsSetupHtml, cardsSetupHtml, cardCountText, examSetupScreenHtml, modeAvailability, practiceSetupHtml } from './screens-setup.mjs';
import { linkedStem, keyTermsHtml, IN_MISSED, entryTerms } from './screens-glossary.mjs';
export { linkedStem, linkedText, keyTermsHtml, entryTerms, IN_MISSED, glossaryHtml, splitSummary, termPopoverHtml } from './screens-glossary.mjs';

// m:ss, or h:mm:ss from one hour.
export const duration = ms => { const n = Math.floor(ms/1000); return n >= 3600 ? `${Math.floor(n/3600)}:${String(Math.floor(n/60)%60).padStart(2,'0')}:${String(n%60).padStart(2,'0')}` : `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`; };

// ---- Welcome and Blocks ----
// The Welcome screen: title, a nickname field and the Start button (a continue button too when a session is open).
export const welcomeHtml = ({nickname, open}) => `<section class="hero welcome-copy">${commBadge}<h1>Cyber <em>Fundamentals</em></h1><p class="label">Learn · Practice · Master</p><p class="lede">Pick a ${LABEL.group} and lock in.</p></section><form class="panel welcome-form" id="welcome"><div class="field"><label for="nickname">Nickname <span class="muted">(optional)</span></label><input id="nickname" maxlength="40" placeholder="Your nickname" autocomplete="nickname" value="${escape(nickname)}"></div><div class="welcome-actions"><button class="${open?'':'primary'}">Start</button>${open?'<button type="button" class="primary" id="welcome-resume">Resume</button>':''}</div><p class="privacy-note">Your nickname and progress stay on this device.</p></form>`;

// For Review: the box shows only the open block: its marked questions (Review, Practice quiz)
// and its past results (Exam results when the last submitted exam is this block's; History when this block has answered
// questions). No open block: the box keeps only its title and one line.
export function forReviewHtml({bank, block = null, understanding, stats, examBlock = null}) {
  const b = bank.blocks.find(x => x.id === block);
  if (!b) return `<section class="panel practice-section for-review is-empty"><div class="step-head"><h2>For Review</h2></div><p class="muted">Open a ${LABEL.group} to see its marked questions and results.</p></section>`;
  const n = notUnderstoodQuestions(bank, understanding, null, b.id).length;
  const asked = bank.questions.some(q => q.block === b.id && stats.questions[q.id]?.asked);
  const extra = `${examBlock === b.id ? '<button id="exam-results-link">Exam results</button>' : ''}${asked ? '<button id="saved-results">History</button>' : ''}`;
  const groups = `${n ? `<div class="review-group"><p class="label">Marked questions</p><button class="primary" data-review-block="${b.id}">Review (${n})</button><button data-practice-units="${b.id}">Practice quiz</button></div>` : ''}${extra ? `<div class="review-group"><p class="label">Past results</p>${extra}</div>` : ''}`;
  return `<section class="panel practice-section for-review" data-review-for="${b.id}"><div class="step-head"><span class="num">${LABEL.Group} ${b.id} · ${n ? `${n} marked` : 'Nothing marked'}</span><h2>For Review</h2></div>
    ${groups ? `<div class="review-groups">${groups}</div>` : `<p class="muted">No marked questions or results for this ${LABEL.group} yet.</p>`}</section>`;
}

/**
 * The Blocks screen: a Continue panel when a session is open, one collapsible card per block with its figures and
 * actions, and the For Review box of the open block.
 * @param {object} args bank, nickname, open (a saved session exists), understanding, missedReview, stats, examBlock,
 * current (the block to open) and extra(block) (more HTML for a block card).
 * @returns {string} the HTML.
 */
export function blocksHtml({bank, nickname, open, understanding, missedReview, stats, examBlock = null, current = null, extra = () => ({facts:'', button:''})}) {  // extra(block): more HTML for a block card (its facts, a button for its actions row)
  const shown = bank.blocks.some(b => b.id === current) ? current : bank.blocks[0]?.id;
  const normal = questionsForMode(bank.questions,'Unassisted'), hardBank = questionsForMode(bank.questions,'Hard');
  const forReview = forReviewHtml({bank, block:shown, understanding, stats, examBlock});
  return `<div class="page-head hub-head"><p class="label">${escape(nickname ? `Welcome, ${nickname}` : 'Cyber Fundamentals')}</p><h1>Choose a ${LABEL.group}</h1>${commBadge}</div>
    ${open ? `<section class="panel resume-panel" data-tone="blue"><div><h2>Continue your session</h2><p class="muted">Your progress and answer order are saved.</p></div><button class="primary" id="resume">Resume</button></section>` : ''}
    ${bank.blocks.map(block => {
      const count = normal.filter(q => q.block === block.id).length, hard = hardBank.filter(q => q.block === block.id).length;
      const exams = formsFor(bank, block.id)?.order.length || 0;
      // Collapsible blocks: each block is one row (Block N, title, chevron). One block is open at a time
      // (details name="block-list"): the last studied block, else the first block. Only blocks with questions are listed
      // (the app drops the others at load).
      const open = block.id === shown ? ' open' : '';
      const head = `<summary><span class="step-head"><span class="num">${LABEL.Group} ${block.id}</span><h2>${escape(block.title)}</h2></span></summary>`;
      return `<details class="panel block-card" data-tone="blue" name="block-list"${open}>${head}
        <dl class="block-figures"><div><dt>${LABEL.Sections}</dt><dd>${block.units.length}</dd></div><div><dt>Standard</dt><dd>${count}</dd></div><div data-tone="gold"><dt>Hard</dt><dd>${hard}</dd></div>${exams?`<div data-tone="violet"><dt>Exams</dt><dd>${exams}</dd></div>`:''}</dl>
        ${(more => `${more.facts}<div class="block-actions">${more.button}<button data-block="${block.id}" class="primary" ${count ? '' : 'disabled'}>${nextLabel('Mode')}</button></div>`)(extra(block))}</details>
`;
    }).join('')}
    ${forReview}`;
}

// ---- Question screen ----
// The appearance on screen: a history entry while reviewing, otherwise the live one.
export const viewedAppearance = session => session.viewIndex != null ? session.history[session.viewIndex] : session.current;

// Pool ledger: one cell per pool question, in pool order.
function ledgerHtml(session) {
  const p=progress(session),missedIds=new Set(session.attempts.filter(a=>!a.correct).map(a=>a.questionId)),current=viewedAppearance(session)?.id;
  // The CSS classes of one ledger cell: done (ok or miss), retry queued and the one being viewed now.
  const cell=id=>{const queued=session.queue.includes(id)&&(session.attempts.some(a=>a.questionId===id)||session.current?.id===id&&session.current.resolved);
    const done=session.correctIds.includes(id)&&!queued;return `cell${done?missedIds.has(id)?' miss':' ok':''}${queued?' retry':''}${id===current?' now':''}`;};
  return `<section class="panel ledger question-counter" aria-label="Pool progress"><dl class="track-row ledger-figures"><div><dt>Pool</dt><dd>${p.pool}</dd></div><div><dt>Cleared</dt><dd>${p.completed}<small>/${p.pool}</small></dd></div><div><dt>${p.pendingRetries===1?'Retry':'Retries'}</dt><dd>${p.pendingRetries}</dd></div></dl><div class="cells${p.pool>30?' dense':''}" aria-hidden="true">${session.pool.map(id=>`<span class="${cell(id)}"></span>`).join('')}</div><div class="legend" aria-hidden="true"><span><i class="ok"></i>Correct</span><span><i class="miss"></i>Missed</span><span><i class="retry"></i>Retry queued</span><span><i class="now"></i>Now</span></div><progress class="session-progress sr-only" value="${p.completed}" max="${p.pool}" aria-label="Pool questions completed">${p.completed} of ${p.pool}</progress></section>`;
}

// Assisted track: key terms at 20 s, a wrong choice removed at 30 s and 40 s, the answer at 50 s.
export const TRACK_MARKS=[[20000,'mk-terms','Terms'],[30000,'mk-x','✕'],[40000,'mk-x','✕'],[50000,'mk-ok','✓']];
// The Assisted track: the clock and a bar that fills over the 50 s of the Assisted steps, with the marks of TRACK_MARKS.
function trackHtml(c, mode) {
  const ms=c.assistedMs,fill=Math.min(100,ms/500);
  return `<div class="track" id="track"><span class="mono clock" id="clock" aria-hidden="true">${duration(ms)}</span><div class="track-body"><div class="track-bar"><div class="track-fill" id="track-fill" style="width:${fill}%"></div>${TRACK_MARKS.map(([at])=>`<i class="tick" style="left:${at/500}%"></i>`).join('')}</div><div class="marks" aria-hidden="true">${TRACK_MARKS.map(([at,kind,text])=>`<span class="${kind}${ms>=at?' hit':''}" style="left:${at/500}%">${text}</span>`).join('')}</div></div>${c.resolved?'':`<span id="countdown" class="countdown sr-only" role="timer" aria-live="off">${assistanceTimer(c,mode)}</span>`}</div>`;
}

/**
 * The study question screen: the stem, the answer tiles, the tools row and the buttons for the viewed appearance.
 * @param {object} args session, bank, box (the SAVE button state {key, saved} once the answer is known, or null),
 * source(q) (the excerpt markup), isFlagged, and gloss (optional: {links, keyTerms}, the stem links allowed now and
 * the Key terms drop-down).
 * @returns {string} the HTML.
 */
export function studyHtml({session, bank, box, source, isFlagged, gloss = null}) {
  const reviewing=session.viewIndex!=null,c=viewedAppearance(session);
  const q=session.questions.find(q=>q.id===c.id),p=progress(session),assisted=(c.mode||session.mode)==='Assisted',hard=session.mode==='Hard',locked=hard;
  const revealed=['correct','revealed','missed'].includes(c.resolved);
  const repeat=(session.history||[]).some(h=>h.id===q.id&&h.appearance<c.appearance)||session.attempts.some(a=>a.questionId===q.id&&a.appearance<c.appearance);
  const stem=linkedStem(q,{marks:keywordHighlightEnabled(session,c),links:gloss?.links||[]});
  const number=session.pool.indexOf(q.id)+1,tries=tryLabel(session,c),retry=(c.wrongIds.length>0||c.resolved==='revealed')&&!reviewing;
  const status=retry&&!hard?'Retry queued':tries,tone=retry||!tries.startsWith('1st')?'try':'';
  // The Flag pennant shows only with the Source cell, at the row's right: the excerpts once the answer
  // is known (correct or revealed) or the dashed held row after a miss. Before the answer neither shows. Back to an earlier
  // appearance keeps the same row as the live view: a missed one shows the held row and Flag.
  const sourceCell=sourceVisible(c)?source(q):c.resolved?'<p class="excerpt-held"><span class="label">Source · held<span class="held-more"> until review</span></span></p>':'';
  const answers=answersHtml(q,c,{assisted,reviewing,neutralUnpicked:true});  // red marks only the wrong answers you picked
  return `<h1 class="sr-only">Question ${number} of ${p.pool}</h1>${studyToolbar({mode:session.nextMode||c.mode||session.mode,modes:locked?[session.mode]:['Assisted','Unassisted'],locked:reviewing||locked,status,statusTone:tone})}${ledgerHtml(session)}<article class="panel q-sheet"><section class="question-focus" aria-label="Current question"><div class="question-heading qhead"><p class="qnum">#${number} <small>of ${p.pool}${repeat?' · Repeat':''}</small><span class="sr-only">Question ${number} of ${p.pool}</span></p><span class="unit-label${box?.missed?' with-tag':''}">${box?.missed?`${IN_MISSED}<span class="unit-text">${escape(questionUnitLabel(q,bank.blocks))}</span>`:escape(questionUnitLabel(q,bank.blocks))}</span></div><h2 id="stem" class="stem" tabindex="-1">${stem}</h2>${assisted&&!reviewing&&!hard?trackHtml(c,session.mode):''}</section><div class="answers">${answers}</div>${sourceRow(sourceCell,sourceCell?flagButton({id:'flag-question',question:q.id,flagged:isFlagged(q.id)}):'',revealed&&gloss?.keyTerms?keyTermsHtml(gloss.keyTerms):'',box?saveButton({id:'save-question',key:box.key,saved:box.saved}):'')}</article><div class="navrow actions question-actions"><button id="previous" ${!session.history?.length||session.viewIndex===0?'disabled':''}>${backLabel('Back')}</button><button id="next" class="primary" ${!reviewing&&!revealed?'disabled':''}>${nextLabel('Next')}</button></div><div class="tool-row">${!reviewing&&!assisted&&!locked?`<button id="hint" aria-controls="stem" ${c.hintUsed||c.resolved?'disabled':''}>${c.hintUsed?'Hint shown':'Hint'}</button>`:''}${!reviewing&&!locked?`<button id="show-answer" ${c.resolved?'disabled':''}>Show Answer</button>`:''}</div>`.replace('<div class="tool-row"></div>','');
}

// Screen-reader line after an answer: only accepted grading is announced, never another option or rationale.
// Returns null when the line should stay as it is.
export function answerAnnouncement(event, attemptsBefore, session) {
  if (event.type === 'answer' && session.attempts.length > attemptsBefore) return session.current.resolved === 'correct' ? 'Correct. Continue with Next.' : 'Incorrect. Review the selected answer feedback.';
  return event.type === 'next' ? '' : null;
}

// ---- Flash cards ----
// saved: the card is in Manual (the SAVE button state). source: the card's question, or null for a highlight card.
// back (optional): the card back panel, shown only after the card has been flipped (cardBackHtml).
// Before the flip there is no Source row, Flag or glossary link, so nothing gives the hidden side away.
// back: cardBackHtml markup made with save:'<!--save-->', so SAVE takes the left cell of the card's tools row.
// Before the flip SAVE stands alone in that row.
// missed: the card is in Missed Questions (the Missed set tag). glossEntry: the card's glossary entry after the first flip,
// or null; it adds Open in Glossary to the row under Back (Hint stays under Next).
// scholar: the card's term has a Scholar item: Open in Scholar joins Open in Glossary after the first flip.
export function flashScreenHtml({preview, set, bank, saved, missed = false, message, source, back = '', glossEntry = null, scholar = false}) {
  const card = preview.cards[preview.index];
  const save = saveButton({id:'flash-save', key:cardKey(card), saved}), row = back ? back.replace('<!--save-->', save) : sourceRow('', '', '', save);
  return `<h1 class="sr-only">Flash cards</h1>${studyToolbar({mode:'Flash Card',locked:true,endId:'flash-exit',status:`Card ${preview.index+1} of ${preview.cards.length}`})}
    <section class="flash-study" aria-label="Flash card review">${set ? `<p class="flash-set-name label">Set · ${escape(set.name)}</p>` : ''}${cardHtml(preview,{unit:source ? questionUnitLabel(source,bank.blocks) : card.kind === 'highlight' ? 'Saved highlight' : '',flaggable:false,saveBox:row+`<p class="flash-message muted" role="status">${escape(message)}</p>`,missed,tools:glossEntry?`<button type="button" id="card-open-gloss" data-entry="${escape(glossEntry.id)}">Open in Glossary</button>${scholar?'<button type="button" id="card-open-scholar" data-tone="scholar">Open in Scholar</button>':''}`:''})}</section>`;
}
// Card back: Open in Glossary sits under Back; SAVE replaces the bookmark. The
// SAVE · KEY TERMS · SOURCE · FLAG row: the terms in the definition and the related terms are the Key terms drop-down,
// the question's course excerpts the Source drop-down, the card Flag at the right. Same order as the question screen.
// entry: glossary entry or null; source: excerpt markup or ''; flagged: the card flag is saved; save: the Save button.
export function cardBackHtml({entry, g, source = '', flagged = false, questionId = null, save = ''}) {
  const terms = entry ? entryTerms(entry, g) : [];
  return `<section class="card-back" aria-label="About this card">
    ${sourceRow(questionId ? source || '' : '', questionId ? flagButton({id:'flag-card', question:questionId, label:'Flag card', flagged, card:true}) : '', keyTermsHtml(terms), save)}</section>`;
}

// The Saved card sets screen: the sets with their block filter, and a Back button.
export const savedSetsScreenHtml = ({library, catalog, back, blocks = [], block}) => `${savedSetsHtml(library,catalog,{blocks,block})}<div class="navrow actions"><button id="cards-home">${backLabel(back)}</button></div>`;

// ---- Results, Previous Attempts, Marked review ----
// Unit accuracy bars (Results and Previous Attempts): one shared name column; tag(row) adds the right-hand note.
// Columns: name · tag · bar · %. The tag (missed count, or first-answer count) has its own column, empty when none.
function unitBarsHtml(rows,tag){return `<div class="bars">${rows.map(row=>{const v=row.asked?row.correct/row.asked:null;return `<div class="barrow"><span class="bar-name">${row.id?`<span class="unit-number">U${row.id}</span>`:''}<span class="bar-title">${escape(row.title)}</span></span><span class="bar-tag">${tag(row)}</span><span class="b" aria-hidden="true"><i style="width:${v===null?0:(v*100).toFixed(1)}%"></i></span><span class="mono ${scoreTone(v)}">${v===null?'—':shine(`${Math.round(v*100)}%`)}</span><span class="sr-only">${v===null?'Not attempted':`${row.correct} of ${row.asked} first answers correct`}</span></div>`;}).join('')}</div>`;}

// Retake Quiz: the circular-arrow icon (aria-hidden) and the text label.
const retakeLabel = `<span class="lbl">${ICON.retry}Retake Quiz</span>`;
// gloss (optional): the glossary linker for the Quiz review (see answerReviewHtml). Unit bars: only units with a first answer, the rest as one line.
export function resultsHtml({session, bank, blockId, stats, understanding, source, isFlagged, gloss = null, save = () => '', isOpen = () => false}) {
  const missed=sessionMissedIds(session),toReview=reviewIds(session,understanding);
  const r=results(session),pct=n=>n===null?'—':shine(`${Math.round(n*100)}%`);
  const missedBy=Object.fromEntries(missedUnits(session,bank.blocks).map(row=>[row.id,row.count]));
  const extras=[['Independent',r.independent],['Hints',r.hints],['Reveals',r.reveals],[r.retries===1?'Retry':'Retries',r.retries]].filter(([,n])=>n>0);
  const block=bank.blocks.find(b=>b.id===(session.questions[0]?.block??blockId))||bank.blocks[0],scores=unitScores(stats,block.id,block.units),tried=scores.rows.filter(row=>row.asked),untried=scores.rows.length-tried.length;
  // A session ended before any answer (or with only reveals) has nothing to review.
  const review=answerReviewHtml(session,missed,source,isFlagged,gloss,{save,isOpen})||'<p class="muted review-empty">There\'s nothing here yet. Answer a question in a session and it shows up here.</p>';
  return `<div class="page-head"><p class="label">Latest session results<span class="tag" data-tone="${session.mode==='Hard'?'gold':'blue'}">${escape(session.mode)}</span></p><h1>Results</h1></div><div class="stats"><div class="stat"><span class="label">Active time</span><strong>${duration(r.activeMs)}</strong><small>Pauses excluded</small></div><div class="stat"><span class="label">Avg / question</span><strong>${r.averageSeconds===null?'—':`${r.averageSeconds.toFixed(1)}s`}</strong><small>${plural(r.seen,'question')} answered</small></div><div class="stat"><span class="label">Accuracy</span><strong>${pct(r.accuracy)}</strong><small>${r.correct}/${r.correct+r.incorrect} answers</small></div><div class="stat"><div class="stat-split"><span class="label correct-label" aria-hidden="true">✓</span><span class="label stat-sep" aria-hidden="true">·</span><span class="label incorrect-label" aria-hidden="true">✕</span><strong class="correct-label">${r.correct}<span class="sr-only"> correct</span></strong><strong class="stat-sep" aria-hidden="true">·</strong><strong class="incorrect-label">${r.incorrect}<span class="sr-only"> incorrect</span></strong></div><small>First try ${pct(r.firstAccuracy)}</small></div></div>${extras.length?`<dl class="ledger-figures metrics" aria-label="Help used">${extras.map(([k,n])=>`<div><dt>${k}</dt><dd>${n}</dd></div>`).join('')}</dl>`:''}${toReview.length?`<div class="actions"><button class="primary" id="review-missed">Review ${session.kind==='not_understood'?'marked':'missed'} questions (${toReview.length})</button></div>`:''}<section class="panel unit-bars"><h2>First-answer accuracy by ${LABEL.section}</h2><p class="label">All sessions on this device · ${escape(block.title)}</p>${unitBarsHtml(tried.length?tried:scores.rows,row=>missedBy[row.id]?`<em class="tag" data-tone="bad">${missedBy[row.id]} missed</em>`:'')}${tried.length&&untried?`<p class="muted bars-rest">${plural(untried,'unit')} not practised yet</p>`:''}</section><section class="answer-review"><h2>Quiz review</h2>${review}</section><div class="navrow actions results-nav"><button id="again">${backLabel('Blocks')}</button><button id="retry-session">${retakeLabel}</button></div>`;
}

// block: the block chosen in For Review; only its units and exam history show. null shows every block.
export const previousAttemptsHtml = ({bank, stats, hasResults, history = [], block = null}) => `<div class="page-head"><p class="label">On this device${block === null ? '' : ` · ${LABEL.Group} ${block}`}</p><h1>Previous Attempts</h1></div><p class="muted">Reveals count as missed.</p>${bank.blocks.filter(b => block === null || b.id === block).map(block=>{
    const scores=unitScores(stats,block.id,block.units),rows=[{title:`All ${LABEL.sections}`,...scores},...scores.rows];
    return `<section class="panel attempts-panel"><h2>${escape(block.title)}</h2>${unitBarsHtml(rows,row=>row.asked?`<em class="tag">${row.correct}/${row.asked}</em>`:'')}</section>`;
  }).join('')}${examHistoryHtml(block === null ? history : history.filter(h => h.block === block))}<div class="navrow actions review-toolbar"><button id="attempts-back">${backLabel('Blocks')}</button>${hasResults?'<button id="last-results">Latest session results</button>':''}</div>`;

// The Marked for review screen: the current question with its answer, the understanding choice and its tools.
export function missedReviewHtml({bank, review, understanding, source, isFlagged, save = '', terms = ''}) {
  const q=bank.questions.find(q=>q.id===review.ids[review.index]);
  const record=understandingRecord(understanding,bank.version,q.id),answer=q.answers.find(a=>a.id===q.correctAnswerId);
  const n=review.ids.length,last=review.index+1===n;
  return `<div class="page-head"><p class="label">Marked for review</p><h1 class="sr-only">Marked review</h1></div><article class="panel q-sheet review-sheet"><section class="question-focus"><div class="question-heading qhead"><span class="qnum">#${review.index+1} <small>of ${n}</small></span><span class="unit-label">${escape(questionUnitLabel(q,bank.blocks))}</span></div><h2 class="stem review-question" tabindex="-1" id="review-stem">${q.studyMode==='Hard'?escape(q.stem):highlightedStem(q)}</h2></section>${reviewItem('correct','Correct answer',escape(answer.text),`<em class="review-explanation">${escape(q.reviewCue || answer.rationale)}</em>`)}${sourceRow(source(q),flagButton({id:'review-flag',question:q.id,flagged:isFlagged(q.id)}),terms,save)}</article><fieldset class="mastery"><legend class="label">Mastered this material?</legend><div class="types">${[['yes','Yes','Unmark this question.'],['no','No','Keep it marked.']].map(([v,t,d])=>`<label class="card"><input type="radio" name="understood" value="${v}" ${record?.decision===v?'checked':''}><strong>${t}</strong><span>${d}</span></label>`).join('')}</div></fieldset><div class="navrow actions review-actions"><button id="review-previous" ${review.index?'':'disabled'}>${backLabel('Back')}</button><button id="review-next" class="primary" ${record?.decision?'':'disabled'}>${nextLabel(last?'Finish':'Next')}</button></div><div class="tool-row review-exit"><button id="leave-review">${backLabel('Blocks')}</button></div>`;
}

// ---- Dialog bodies (the dialog adds the head and Close) ----
// The buttons of the flag dialog: Save flag, and Clear flag when a flag already exists.
const flagActions = exists => `<p id="flag-error" role="status"></p><div class="actions"><button class="primary" id="save-flag">Save flag</button>${exists ? '<button id="clear-flag">Clear flag</button>' : ''}</div>`;
// The optional note box of the flag dialog, filled with the saved note.
const noteField = old => `<label class="field">Optional note<textarea id="flag-note" maxlength="2000">${escape(old.note || '')}</textarea></label>`;
// old: the saved flag ({} when none); exists: a flag is saved, so Clear flag shows.
export const questionFlagHtml = (q, old, exists) => `<p class="muted">Select the question or answers to flag. Notes stay on this device.</p><p>${escape(q.stem)}</p><label class="card row"><input id="question-flag" type="checkbox" ${old.questionFlag ? 'checked' : ''}>Question</label>${q.answers.map(a => `<label class="card row"><input type="checkbox" name="answer-flag" value="${escape(a.id)}" ${(old.answerIds || []).includes(a.id) ? 'checked' : ''}>${escape(a.text)}</label>`).join('')}${noteField(old)}${flagActions(exists)}`;
// context: the visible face ({side, text}) and the cue only when the Hint was used.
export const cardFlagHtml = (context, old, exists) => `<p class="muted">Flag the card or its cue. Notes stay on this device.</p><p><strong>${escape(context.side === 'term' ? 'Term' : 'Definition')}</strong>: ${escape(context.text)}</p>${context.cue ? `<p><strong>Review cue</strong>: ${escape(context.cue)}</p>` : ''}<label class="card row"><input id="card-flag" type="checkbox" ${old.cardFlag ? 'checked' : ''}>Card</label>${noteField(old)}${flagActions(exists)}`;
// The card face a flag names: the side on view, and the cue only after the Hint.
export function cardFlagContext(card) {
  const side = card.flipped ? (card.initialSide === 'definition' ? 'term' : 'definition') : card.initialSide;
  return {side, text: side === 'term' ? card.term : card.definition, ...(card.hintUsed ? {cue: card.reviewCue} : {})};
}

// How to use (Settings menu): one short line per feature, for a first-time player.
const HELP=[
  ['Start',`Pick a ${LABEL.group}, then the ${LABEL.sections}, how many questions and a mode.`],
  ['Modes','Assisted shows the key terms after a short wait, then removes wrong choices. Unassisted gives no timed help; Hint highlights the key terms. Hard asks harder scenario questions with no help.'],
  ['Random or Smart',`Random mixes the selected ${LABEL.sections}. Smart shows unseen questions first, then missed ones.`], ['Keys','In a question, press 1 to 4 to answer and Enter to continue.'],
  ['After you answer','Read the explanation. Source shows the course text it comes from. Outside Hard, tap a key term for its glossary definition.'],
  ['Flash cards','SAVE puts the question\u2019s card in your Manual set. With Dynamic Flash Cards on, missed questions go to the Missed Questions set.'],
  ['Marked for review',`Questions you miss in practice wait on the ${LABEL.Groups} screen until you say you mastered them.`],
  ['Exam','30 questions in 60 minutes, no pause. 21 correct (70%) passes.'],
  ['Scholar','Short lessons with a picture and two practice questions. They do not count in your results.'],
  ['Flag','Report a problem with a question or card. Settings \u203a Diagnostics downloads or copies your notes to send.'],
  ['Your data','Progress stays in this browser only. Settings \u203a Delete Local Data clears it.'],
];
// The Help list: a title and its text for each item of HELP.
export const helpHtml = () => `<ul class="help-list">${HELP.map(([t,d])=>`<li><strong>${t}</strong><span>${d}</span></li>`).join('')}</ul>`;

// Diagnostics: one row per saved note (ID, Question or Card tag, question text, note, Edit), then Download and Copy.
export function diagnosticsHtml(flags, bank) {
  const rows = Object.entries(flags).map(([key,f]) => {
    const q = bank.questions.find(x => x.id === f.questionId), current = q && f.version === bank.version;
    return `<li class="diag-row"><div class="diag-meta"><span class="mono">${escape(f.questionId)}</span><span class="tag">${f.target==='card'?'Card':'Question'}</span>${current?'':'<span class="tag" data-tone="warn">Earlier content</span>'}</div>${current?`<p class="diag-stem">${escape(q.stem)}</p>`:''}<p class="diag-note">${escape(f.note || 'Flagged without a note')}</p><button class="link-button" data-edit="${escape(key)}">Edit</button></li>`;
  }).join('');
  return `<p class="muted">Includes question flags, notes, answer attempts, content version and coarse device information. Nickname is excluded.</p>${rows?`<ul class="diag-list">${rows}</ul>`:'<p class="diag-empty">No review notes yet. Use Flag on a question or card to add one.</p>'}<p id="copy-status" class="status count" role="status"></p><div class="actions"><button class="primary" id="download-flags">Download</button><button id="copy-flags">Copy</button></div>`;
}
// The body for a flag note saved under earlier content: the note text and a line saying it stays in exports.
export const oldNoteHtml = f => `<p>${escape(f.note)}</p><p class="muted">This note belongs to earlier content and remains in exports.</p><div class="actions"><button class="danger" id="clear-old-note">Clear this note</button></div>`;

// ---- Layout (receives its elements) ----
// Scroll only on entry, history and question changes, never on answer feedback or timer ticks.
export const repositionStudy = (old, next) => next.step === 'study' && Boolean(next.question) && (old.screen !== 'study' || old.question !== next.question || old.appearance !== next.appearance);
// Wide screens: after Next or Back, centre the sheet and its navigation row in the space under the sticky bars
// (coverTop). A taller block starts just under the bars instead. The result stays inside the page's scroll range.
export function centredScroll({top, bottom, scrollY, coverTop, viewHeight, maxScroll, gap = 8}) {
  const space = viewHeight - coverTop, height = bottom - top;
  const offset = height + 2 * gap <= space ? coverTop + (space - height) / 2 : coverTop + gap;
  return Math.round(Math.min(Math.max(0, scrollY + top - offset), Math.max(0, maxScroll)));
}
// Phones and short windows: measure from the natural top, so a previously pinned question cannot keep
// the old answer's scroll position, then put the question under the header and reset every answer scroller.
// Returns true when it moved the page.
export function positionQuestion({main, win, headerHeight}) {
  if (!win.matchMedia?.(NARROW_OR_SHORT_QUERY).matches) return false;
  const question = main.querySelector('.question-focus'), answers = main.querySelector('.answers');
  if (!question || !answers) return false;
  win.scrollTo({top:0,behavior:'instant'});
  const top = question.getBoundingClientRect().top + win.scrollY;
  win.scrollTo({top:Math.max(0,top-headerHeight-12),behavior:'instant'});
  answers.querySelectorAll('.item').forEach(answer => { answer.scrollTop = 0; });
  return true;
}
