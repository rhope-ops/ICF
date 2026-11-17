// Screen markup: pure functions of the state they receive. app.mjs owns state, storage, events and timers,
// so tests import these screens directly. Every value comes in as an argument; nothing here reads the DOM,
// except the layout helpers at the end, which receive their elements.
import { escape, reviewNumber, answersHtml, highlightedStem, unitChoices, poolShortfall, plural, commBadge, questionUnitLabel, answerReviewHtml, reviewItem, tryLabel, studyToolbar, sourceVisible, backLabel, nextLabel, ICON, flagButton, sourceRow, dropHtml, assistanceTimer, saveButton, excerptBody } from './presentation.mjs';
import { progress, results, questionsForMode, keywordHighlightEnabled, STUDY_MODES } from './engine.mjs';
import { understandingRecord, notUnderstoodQuestions, sessionMissedIds, reviewIds } from './learning.mjs';
import { unitScores, missedUnits, scoreTone, POOL_LABEL } from './analytics.mjs';
import { EXAM, passMark, examCounts, reviewItems, REVIEW_FILTERS, examLabel, formsFor } from './exam.mjs';
import { cardHtml, cardsInSet, savedSetsHtml, setsBlockHtml, cardKey, MISSED_ID } from './flashcards.mjs';
import { pictureHtml, tapBoardHtml } from './pictures.mjs';
import { typeOf, resolved as scholarResolved, right as scholarRight, currentDecision, decisionDone, checkMarks } from './scholar.mjs';

// m:ss, or h:mm:ss from one hour.
export const duration = ms => { const n = Math.floor(ms/1000); return n >= 3600 ? `${Math.floor(n/3600)}:${String(Math.floor(n/60)%60).padStart(2,'0')}:${String(n%60).padStart(2,'0')}` : `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`; };

// ---- Shared setup controls ----
// Question pool (v1.2.0): one choice, Random / Smart; it replaces the Smart Mode checkbox.
export const POOL_HELP={random:'A random mix from the selected units.',smart:'Unseen questions first, then missed ones.'};
export function poolKindControl({kind}) {
  return `<fieldset class="pool-kind" id="pool-kind"><legend class="sr-only">Question pool</legend><div class="seg pool-kind-seg">${['random','smart'].map(k=>`<label><input type="radio" name="pool-kind" value="${k}" ${kind===k?'checked':''}>${POOL_LABEL[k]}</label>`).join('')}</div><em class="pool-help" id="pool-help">${POOL_HELP[kind]}</em></fieldset>`;
}
const dynamicControl = on => `<label class="card row" id="dynamic-choice"><input id="dynamic-cards" type="checkbox" aria-describedby="dynamic-help" ${on?'checked':''}><span><strong>Dynamic Flash Cards</strong><em id="dynamic-help">Automatically save missed questions as flash cards.</em></span></label>`;
// Mode cards: the Mode screen and Marked practice use the same cards.
const MODE_HELP={Assisted:'Timed key terms, then removes wrong choices.',Unassisted:'No timed help. Hint is available.',Hard:'Professional questions. No help. Gamers only.'};
// Mode is the help level only (v1.2.0): Exam has its own entry under the study setup.
export const modeCards=(name,current)=>STUDY_MODES.map(m=>`<label class="card" data-tone="${m==='Hard'?'gold':'blue'}"><input type="radio" name="${name}" value="${m}" ${current===m?'checked':''}><strong>${m}</strong><span>${MODE_HELP[m]}</span></label>`).join('');
// Pool chips. A selection smaller than the first size shows its own count in that
// slot (gold) and a note at the right; sizes larger than the selection are disabled.
// empty: the note at the right when nothing is available (Setup: no unit selected).
export const NO_UNITS='You must select at least 1 unit.';
const POOL_SIZES=[30,45,60];
export const poolSeg=(name,current,n=Infinity,empty='')=>{
  const short=n<POOL_SIZES[0], shown=current!=='all'&&current>n?(short?POOL_SIZES[0]:'all'):current;
  const chip=size=>{const fit=short&&size===POOL_SIZES[0], over=!fit&&size!=='all'&&size>n;
    return `<label class="${fit?'pool-fit':''}"><input type="radio" name="${name}" value="${size}" ${shown===size?'checked':''} ${over?'disabled':''}>${size==='all'?'All':fit?n:size}</label>`;};
  return `<div class="pool-row"><div class="seg">${[...POOL_SIZES,'all'].map(chip).join('')}</div>${short&&n&&shown!=='all'?`<p class="pool-note">${poolShortfall(n,POOL_SIZES[0])}</p>`:!n&&empty?`<p class="pool-note">${escape(empty)}</p>`:''}</div>`;
};

// ---- Welcome and Blocks ----
export const welcomeHtml = ({nickname, open}) => `<section class="hero welcome-copy">${commBadge}<h1>Cyber <em>Fundamentals</em></h1><p class="label">Learn · Practice · Master</p><p class="lede">Pick a block and lock in.</p></section><form class="panel welcome-form" id="welcome"><div class="field"><label for="nickname">Nickname <span class="muted">(optional)</span></label><input id="nickname" maxlength="40" placeholder="Your nickname" autocomplete="nickname" value="${escape(nickname)}"></div><div class="welcome-actions"><button class="${open?'':'primary'}">Start</button>${open?'<button type="button" class="primary" id="welcome-resume">Resume</button>':''}</div><p class="privacy-note">Your nickname and progress stay on this device.</p></form>`;

// For Review (2.1.28, the owner, 2026-11-10): the box shows only the open block: its marked questions (Review, Practice quiz; "Practice test" until 2.2.0, the owner 2026-11-16)
// and its past results (Exam results when the last submitted exam is this block's; History (the owner, 2026-11-10; was Attempts) when this block has answered
// questions). No open block: the box keeps only its title and one line. Layout is the 2.1.24 option C box.
export function forReviewHtml({bank, block = null, understanding, stats, examBlock = null}) {
  const b = bank.blocks.find(x => x.id === block);
  if (!b) return `<section class="panel practice-section for-review is-empty"><div class="step-head"><h2>For Review</h2></div><p class="muted">Open a block to see its marked questions and results.</p></section>`;
  const n = notUnderstoodQuestions(bank, understanding, null, b.id).length;
  const asked = bank.questions.some(q => q.block === b.id && stats.questions[q.id]?.asked);
  const extra = `${examBlock === b.id ? '<button id="exam-results-link">Exam results</button>' : ''}${asked ? '<button id="saved-results">History</button>' : ''}`;
  const groups = `${n ? `<div class="review-group"><p class="label">Marked questions</p><button class="primary" data-review-block="${b.id}">Review (${n})</button><button data-practice-units="${b.id}">Practice quiz</button></div>` : ''}${extra ? `<div class="review-group"><p class="label">Past results</p>${extra}</div>` : ''}`;
  return `<section class="panel practice-section for-review" data-review-for="${b.id}"><div class="step-head"><span class="num">Block ${b.id} · ${n ? `${n} marked` : 'Nothing marked'}</span><h2>For Review</h2></div>
    ${groups ? `<div class="review-groups">${groups}</div>` : `<p class="muted">No marked questions or results for this block yet.</p>`}</section>`;
}

export function blocksHtml({bank, nickname, open, understanding, missedReview, stats, examBlock = null, current = null}) {
  const shown = bank.blocks.some(b => b.id === current) ? current : bank.blocks[0]?.id;
  const normal = questionsForMode(bank.questions,'Unassisted'), hardBank = questionsForMode(bank.questions,'Hard');
  const forReview = forReviewHtml({bank, block:shown, understanding, stats, examBlock});
  return `<div class="page-head hub-head"><p class="label">${escape(nickname ? `Welcome, ${nickname}` : 'Cyber Fundamentals')}</p><h1>Choose a block</h1>${commBadge}</div>
    ${open ? `<section class="panel resume-panel" data-tone="blue"><div><h2>Continue your session</h2><p class="muted">Your progress and answer order are saved.</p></div><button class="primary" id="resume">Resume</button></section>` : ''}
    ${bank.blocks.map(block => {
      const count = normal.filter(q => q.block === block.id).length, hard = hardBank.filter(q => q.block === block.id).length;
      const exams = formsFor(bank, block.id)?.order.length || 0;
      // Collapsible blocks (the owner, 2026-11-10): each block is one row (Block N, title, chevron). One block is open at a time
      // (details name="block-list"): the last studied block, else the first block. Only blocks with questions are listed
      // (the app drops the others at load).
      const open = block.id === shown ? ' open' : '';
      const head = `<summary><span class="step-head"><span class="num">Block ${block.id}</span><h2>${escape(block.title)}</h2></span></summary>`;
      return `<details class="panel block-card" data-tone="blue" name="block-list"${open}>${head}
        <dl class="block-figures"><div><dt>Units</dt><dd>${block.units.length}</dd></div><div><dt>Standard</dt><dd>${count}</dd></div><div data-tone="gold"><dt>Hard</dt><dd>${hard}</dd></div>${exams?`<div data-tone="violet"><dt>Exams</dt><dd>${exams}</dd></div>`:''}</dl>
        <div class="block-actions"><button data-block="${block.id}" class="primary" ${count ? '' : 'disabled'}>${nextLabel('Mode')}</button></div></details>
`;
    }).join('')}
    ${forReview}`;
}

// ---- Study hub and setups (v1.2.0) ----
// Study hub: three tiles (Questions, Flash cards, Glossary; on phones Glossary takes the full second row), then the
// Scholar entry and the Exam entry, each after an "Or" divider. The 1.2 Scholar was removed in 1.2.3 (the owner,
// 2026-11-08); Scholar returned in 2.2.0 as term study (the owner, 2026-11-16). scholar: the
// block has Scholar content (a block without it shows no Scholar entry).
const TILES=[['questions','Questions','Answer, score and retry.'],['cards','Flash cards','Terms and definitions.'],['glossary','Glossary','Course terms with their sources.']];
export function studyHubHtml({block, scholar = false}) {
  const tile = ([v,t,d]) => `<button type="button" class="card" data-study="${v}"><strong>${t}</strong><span>${d}</span></button>`;
  const divider = '<div class="exam-divider" aria-hidden="true"><span>Or</span></div>';
  return `<div class="page-head"><p class="label">Block ${block.id} · ${escape(block.title)}</p><h1>Mode</h1></div>
    <div class="type-grid study-tiles" role="group" aria-label="Study type">${TILES.map(tile).join('')}</div>
    ${scholar ? `${divider}<section class="card exam-entry scholar-entry" data-tone="scholar" aria-labelledby="scholar-entry-title"><div class="exam-entry-text"><h2 id="scholar-entry-title">Scholar</h2><p class="exam-entry-sub">Go deeper on each term: examples, scenarios and guided questions.</p></div><button id="scholar-open" class="primary" data-tone="scholar">${nextLabel('Open Scholar')}</button></section>` : ''}
    ${divider}
    <section class="card exam-entry" data-tone="violet" aria-labelledby="exam-entry-title"><div class="exam-entry-text"><h2 id="exam-entry-title">Exam</h2><p class="exam-entry-sub">As close to the real thing as you’re going to get.</p></div><button id="exam-open" class="primary" data-tone="violet">${nextLabel('Take exam')}</button></section>`;
}

// One note on every path that starts a new Questions session over a paused one (UX review 2026-11-11, H2).
export const REPLACING_NOTE = '<p class="muted replacing-note">Starting replaces your paused study session; understanding choices and notes are kept.</p>';
// Questions setup: help level, units, question pool (Random / Smart and size), Dynamic Flash Cards.
// counts: {all: 'label', units: {unitId: n}}; pool: {kind, size, n, empty}.
export function questionsSetupHtml({block, mode, units, counts, pool, dynamic, replacing = false}) {
  return `<div class="page-head"><p class="label">Block ${block.id} · Questions</p><h1>Questions</h1></div>
    <fieldset class="modes mode-options"><legend class="sr-only">Help level</legend>${modeCards('mode',mode)}</fieldset>
    <section class="panel unit-panel"><div class="step-head"><span class="num">Block ${block.id}</span><h2>${escape(block.title)}</h2></div><fieldset><legend class="sr-only">Units</legend>${unitChoices(block,units,'unit',counts)}</fieldset></section>
    <section class="panel pool-panel" aria-labelledby="pool-title"><div class="step-head"><span class="num">Pool</span><h2 id="pool-title">Questions</h2></div>${poolKindControl({kind:pool.kind})}<fieldset id="pool-size" class="pool-size"><legend class="sr-only">Number of questions</legend>${poolSeg('pool-size',pool.size,pool.n,pool.empty||'')}</fieldset></section>
    ${dynamicControl(dynamic)}<p id="mode-availability" class="status" role="status"></p>${replacing ? REPLACING_NOTE : ''}
    <div class="navrow actions"><button id="back">${backLabel('Mode')}</button><button class="primary"${mode==='Hard'?' data-tone="gold"':''} id="mode-next">${nextLabel('Study')}</button></div>`;
}

// Flash card setup: saved sets and units (the card path of v1.1.1).
// setsBlock: the saved sets' block filter (this block by default, or ALL_BLOCKS); blocks: every block, for the filter.
export function cardsSetupHtml({block, blocks = [block], library, pickSetId, catalog, units, counts, setsBlock = block.id}) {
  const setRows = library.sets.map(set => { const n = cardsInSet(set,catalog,setsBlock).length; return `<label class="card row"><input type="radio" name="card-set" value="${escape(set.id)}" ${set.id===pickSetId?'checked':''} ${n?'':'disabled'}><span><strong>${escape(set.name)}</strong>${set.id===MISSED_ID?' <span class="tag">Auto</span>':''}</span><span class="set-pick-count mono">${plural(n,'card')}</span></label>`; }).join('');
  return `<div class="page-head"><p class="label">Block ${block.id} · Flash cards</p><h1>Flash cards</h1></div>
      <section class="panel card-set-pick"><div class="step-head"><span class="num">Saved</span><h2>Card sets</h2><button class="small" id="manage-sets">Manage sets</button></div>${setsBlockHtml(blocks, setsBlock, 'setup-sets-block')}<div class="setlist" role="radiogroup" aria-label="Saved card sets">${setRows}</div></section>
      <section class="panel unit-panel${pickSetId?' is-dimmed':''}"><div class="step-head"><span class="num">Block ${block.id}</span><h2>${escape(block.title)}</h2></div><fieldset><legend class="sr-only">Units</legend>${unitChoices(block,pickSetId?[]:units,'unit',counts)}</fieldset><p id="eligible-count" class="status count" role="status"></p></section>
      <div class="navrow actions"><button id="back">${backLabel('Mode')}</button><button class="primary" id="units-next">${nextLabel('Study')}</button></div>`;
}

// Status line under the units: the card count or the saved set in use.
export function cardCountText({pickName, n}) {
  return pickName ? `Using saved set “${pickName}”. Choose a unit to switch back.` : n ? `${plural(n,'card')} in this selection.` : 'No cards match these units.';
}

// Exam setup (from the hub's Take exam): the Exam panel, Back to study, Start exam.
export function examSetupScreenHtml({blockId, examSetup}) {
  return `<div class="page-head"><p class="label">Block ${blockId} · Exam</p><h1>Take exam</h1></div>${examSetup}<p id="mode-availability" class="status" role="status"></p><div class="navrow actions"><button id="back">${backLabel('Mode')}</button><button class="primary" data-tone="violet" id="mode-next">${nextLabel('Start exam')}</button></div>`;
}

// The line under the mode cards: only Hard can lack questions for these units.
export function modeAvailability({mode, count, poolSize, hardPending}) {
  if (mode !== 'Hard') return '';
  return count ? poolShortfall(count,poolSize) : hardPending ? 'Hard questions are awaiting review.' : 'No Hard questions match these units.';
}

// counts (optional): {all, units: {unitId: n}} marked questions available per unit for this mode, shown in red (bad tone).
export function practiceSetupHtml({block, quizScope, units, mode, poolKind = 'random', poolSize, available, replacing, counts = null}) {
  return `<div class="page-head"><p class="label">Block ${block.id} · Marked for review${quizScope === 'all' ? ` · All ${block.units.length} units` : ''}</p><h1>${quizScope === 'all' ? 'Practice all units' : 'Choose practice units'}</h1></div>
    ${quizScope === 'units' ? `<section class="panel unit-panel"><div class="step-head"><span class="num">Block ${block.id}</span><h2>${escape(block.title)}</h2></div><fieldset><legend class="sr-only">Units</legend>${unitChoices(block,units,'review-unit',counts,'bad')}</fieldset></section>` : ''}
    <fieldset class="modes mode-options" id="practice-mode"><legend class="sr-only">Study mode</legend>${modeCards('practice-mode',mode)}</fieldset>
    <section class="panel pool-panel"><div class="step-head"><span class="num">Pool</span><h2>Questions</h2></div>${poolKindControl({kind:poolKind==='smart'?'smart':'random'})}<fieldset id="practice-pool-size"><legend class="sr-only">Number of questions</legend>${poolSeg('practice-pool',poolSize,available)}</fieldset><p id="practice-count" class="status" role="status"></p></section>
    ${replacing ? REPLACING_NOTE : ''}
    <div class="navrow actions"><button id="practice-cancel">${backLabel('Blocks')}</button><button class="primary"${mode==='Hard'?' data-tone="gold"':''} id="practice-confirm">${nextLabel('Study')}</button></div>`;
}

// ---- Question screen ----
// The appearance on screen: a history entry while reviewing, otherwise the live one.
export const viewedAppearance = session => session.viewIndex != null ? session.history[session.viewIndex] : session.current;

// Pool ledger: one cell per pool question, in pool order.
function ledgerHtml(session) {
  const p=progress(session),missedIds=new Set(session.attempts.filter(a=>!a.correct).map(a=>a.questionId)),current=viewedAppearance(session)?.id;
  const cell=id=>{const queued=session.queue.includes(id)&&(session.attempts.some(a=>a.questionId===id)||session.current?.id===id&&session.current.resolved);
    const done=session.correctIds.includes(id)&&!queued;return `cell${done?missedIds.has(id)?' miss':' ok':''}${queued?' retry':''}${id===current?' now':''}`;};
  return `<section class="panel ledger question-counter" aria-label="Pool progress"><dl class="track-row ledger-figures"><div><dt>Pool</dt><dd>${p.pool}</dd></div><div><dt>Cleared</dt><dd>${p.completed}<small>/${p.pool}</small></dd></div><div><dt>${p.pendingRetries===1?'Retry':'Retries'}</dt><dd>${p.pendingRetries}</dd></div></dl><div class="cells${p.pool>30?' dense':''}" aria-hidden="true">${session.pool.map(id=>`<span class="${cell(id)}"></span>`).join('')}</div><div class="legend" aria-hidden="true"><span><i class="ok"></i>Correct</span><span><i class="miss"></i>Missed</span><span><i class="retry"></i>Retry queued</span><span><i class="now"></i>Now</span></div><progress class="session-progress sr-only" value="${p.completed}" max="${p.pool}" aria-label="Pool questions completed">${p.completed} of ${p.pool}</progress></section>`;
}

// Assisted track: key terms at 20 s, a wrong choice removed at 30 s and 40 s, the answer at 50 s.
export const TRACK_MARKS=[[20000,'mk-terms','Terms'],[30000,'mk-x','✕'],[40000,'mk-x','✕'],[50000,'mk-ok','✓']];
function trackHtml(c, mode) {
  const ms=c.assistedMs,fill=Math.min(100,ms/500);
  return `<div class="track" id="track"><span class="mono clock" id="clock" aria-hidden="true">${duration(ms)}</span><div class="track-body"><div class="track-bar"><div class="track-fill" id="track-fill" style="width:${fill}%"></div>${TRACK_MARKS.map(([at])=>`<i class="tick" style="left:${at/500}%"></i>`).join('')}</div><div class="marks" aria-hidden="true">${TRACK_MARKS.map(([at,kind,text])=>`<span class="${kind}${ms>=at?' hit':''}" style="left:${at/500}%">${text}</span>`).join('')}</div></div>${c.resolved?'':`<span id="countdown" class="countdown sr-only" role="timer" aria-live="off">${assistanceTimer(c,mode)}</span>`}</div>`;
}

// ---- Glossary in questions (v1.2.0) ----
// A term link inside running text (stem, answers, rationales) is an inline span with role="button" (1.2.2): a <button>
// is always an atomic box, so a long term broke the sentence into centred lines on phones. Enter and Space open it
// (one keydown listener in app.mjs). Lists of terms (Key terms, Related) keep real buttons.
const TERM_SPAN = ref => `<span role="button" tabindex="0" class="term-link" data-term="${escape(ref)}" aria-haspopup="dialog">`;
// Stem with key-term marks and glossary links. links: glossary.stemLinks() spans; a link that partly overlaps a key-term
// mark is split at the mark's edge into two spans with the same term (2.1.7; it was dropped), so the markup always nests
// and the term still opens. Each link is an inline span (dotted underline, no colour change).
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
// Any text block with its precomputed glossary spans ([start, end, ref]); used where everything is resolved (reviews).
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
// box: the SAVE button state ({key, saved}) once the answer is known, or null. source(q): the excerpt markup.
// gloss (optional): {links, keyTerms} — the stem links allowed now and the Key terms drop-down.
export function studyHtml({session, bank, box, source, isFlagged, gloss = null}) {
  const reviewing=session.viewIndex!=null,c=viewedAppearance(session);
  const q=session.questions.find(q=>q.id===c.id),p=progress(session),assisted=(c.mode||session.mode)==='Assisted',hard=session.mode==='Hard',locked=hard;
  const revealed=['correct','revealed','missed'].includes(c.resolved);
  const repeat=(session.history||[]).some(h=>h.id===q.id&&h.appearance<c.appearance)||session.attempts.some(a=>a.questionId===q.id&&a.appearance<c.appearance);
  const stem=linkedStem(q,{marks:keywordHighlightEnabled(session,c),links:gloss?.links||[]});
  const number=session.pool.indexOf(q.id)+1,tries=tryLabel(session,c),retry=(c.wrongIds.length>0||c.resolved==='revealed')&&!reviewing;
  const status=retry&&!hard?'Retry queued':tries,tone=retry||!tries.startsWith('1st')?'try':'';
  // The Flag pennant shows only with the Source cell, at the row's right (the owner, 2026-11-08): the excerpts once the answer
  // is known (correct or revealed) or the dashed held row after a miss. Before the answer neither shows. Back to an earlier
  // appearance keeps the same row as the live view: a missed one shows the held row and Flag (the owner, 2026-11-16).
  const sourceCell=sourceVisible(c)?source(q):c.resolved?'<p class="excerpt-held"><span class="label">Source · held<span class="held-more"> until review</span></span></p>':'';
  const answers=answersHtml(q,c,{assisted,reviewing});
  return `<h1 class="sr-only">Question ${number} of ${p.pool}</h1>${studyToolbar({mode:session.nextMode||c.mode||session.mode,modes:locked?[session.mode]:['Assisted','Unassisted'],locked:reviewing||locked,status,statusTone:tone})}${ledgerHtml(session)}<article class="panel q-sheet"><section class="question-focus" aria-label="Current question"><div class="question-heading qhead"><p class="qnum">#${number} <small>of ${p.pool}${repeat?' · Repeat':''}</small><span class="sr-only">Question ${number} of ${p.pool}</span></p><span class="unit-label${box?.missed?' with-tag':''}">${box?.missed?`${IN_MISSED}<span class="unit-text">${escape(questionUnitLabel(q,bank.blocks))}</span>`:escape(questionUnitLabel(q,bank.blocks))}</span></div><h2 id="stem" class="stem" tabindex="-1">${stem}</h2>${assisted&&!reviewing&&!hard?trackHtml(c,session.mode):''}</section><div class="answers">${answers}</div>${sourceRow(sourceCell,sourceCell?flagButton({id:'flag-question',question:q.id,flagged:isFlagged(q.id)}):'',revealed&&gloss?.keyTerms?keyTermsHtml(gloss.keyTerms):'',box?saveButton({id:'save-question',key:box.key,saved:box.saved}):'')}</article><div class="navrow actions question-actions"><button id="previous" ${!session.history?.length||session.viewIndex===0?'disabled':''}>${backLabel('Back')}</button><button id="next" class="primary" ${!reviewing&&!revealed?'disabled':''}>${nextLabel('Next')}</button></div><div class="tool-row">${!reviewing&&!assisted&&!locked?`<button id="hint" aria-controls="stem" ${c.hintUsed||c.resolved?'disabled':''}>${c.hintUsed?'Hint shown':'Hint'}</button>`:''}${!reviewing&&!locked?`<button id="show-answer" ${c.resolved?'disabled':''}>Show Answer</button>`:''}</div>`.replace('<div class="tool-row"></div>','');
}

// ---- Glossary screen ----
// list: entries to show (search + unit filter); entry: the open entry or null; questionCount(e): {standard, hard} questions
// with the term (2.1.22, the owner: one button per pool; the Hard one in the Hard gold; a pool with none shows no button).
// Key terms of a glossary entry (card back and Glossary entry): the terms linked in its definition, then its related terms.
export function entryTerms(entry, g) {
  const termName = ref => { const p = ref.startsWith('acr:') ? ref.slice(4) : g.byId.get(ref)?.term; return p || ref; };
  const refs = [...(entry.defLinks || []).map(([, , ref]) => ref), ...entry.related.filter(id => g.byId.has(id))];
  return [...new Set(refs)].map(ref => ({id: ref, term: termName(ref)}));
}
// Source drop-down of a glossary entry: its course excerpts, verbatim, each with document and page (as the question Source).
const entrySource = (entry, docs) => entry.excerpts.length ? dropHtml('source', 'Source', entry.excerpts.length, entry.excerpts.length === 1 ? 'excerpt' : 'excerpts',
  `<div class="excerpt">${entry.excerpts.map(x => `<figure><blockquote>${excerptBody(x)}</blockquote><figcaption>${escape(docs[x.doc] || x.doc)} · p. ${x.page}</figcaption></figure>`).join('')}</div>`) : '';
// The In Missed tag: the card is in Missed Questions (SAVE shows Manual only). Bad tone = missed, as on Results.
export const IN_MISSED = '<span class="tag in-missed" data-tone="bad">In Missed</span>';
// save: the Save button for the entry's card or ''. toCard: 'Card N' when the entry was opened from a flash card
// (the back button to that card), else ''.
// group: 'unit' (Unit 1 ... Unit 8 headings, A-Z inside each) or 'az' (one A-Z list with the letter bar).
// flag: the entry card's Flag button (2.1.23, the owner: "put a flag ... on the far right side of source like it exists everywhere else").
// scholar: the entry has a Scholar item (2.2.0): an Open in Scholar button under the entry.
export function glossaryHtml({block, g, list, query, unit, entry, questionCount, save = '', flag = '', toCard = '', group = 'unit', replacing = false, scholar = false}) {
  const letter = e => (e.term.match(/[A-Za-z]/)?.[0] || '#').toUpperCase();
  const letters = [...new Set(list.map(letter))];
  const head = `<div class="page-head"><p class="label">Block ${block.id} · ${plural(g.entries.filter(e => e.block === block.id).length,'term')} from the course</p><h1>Glossary</h1></div>`;
  if (entry) {
    const n = questionCount(entry);
    const poolButton = (id, label, count, tone = '') => count ? `<button id="${id}" class="primary"${tone ? ` data-tone="${tone}"` : ''}>${label} questions with this term (${count})</button>` : '';
    const pools = poolButton('gloss-questions', 'Standard', n.standard) + poolButton('gloss-hard-questions', 'Hard', n.hard, 'gold');
    return `${head}
      <article class="panel gloss-entry" aria-labelledby="gloss-term"><div class="step-head"><span class="num">Unit ${entry.unit} · ${escape(block.units.find(u => u.id === entry.unit)?.title || '')}</span><h2 id="gloss-term">${escape(entry.term)}</h2></div>
      ${entry.aliases.length ? `<p class="label">${entry.aliases.map(escape).join(' · ')}</p>` : ''}<p class="gloss-short">${escape(entry.short)}</p>
      ${sourceRow(entrySource(entry, g.docs), flag, keyTermsHtml(entryTerms(entry, g)), save)}
      ${pools ? `<div class="actions gloss-pools">${pools}</div>${replacing ? REPLACING_NOTE : ''}` : ''}
      ${scholar ? `<div class="actions gloss-scholar"><button id="gloss-open-scholar" data-tone="scholar">${nextLabel('Open in Scholar')}</button></div>` : ''}</article>
      <div class="navrow actions">${toCard ? `<button id="gloss-card">${backLabel(toCard)}</button><button id="gloss-back">All terms</button>` : `<button id="gloss-back">${backLabel('All terms')}</button>`}</div>`;
  }
  const item = e => `<li><button type="button" class="card" data-entry="${escape(e.id)}"><strong>${escape(e.term)}</strong><span>${escape(e.short)}</span></button></li>`;
  const byTerm = (a, b) => a.term.toLowerCase() < b.term.toLowerCase() ? -1 : 1;
  const units = block.units.filter(u => list.some(e => e.unit === u.id));
  const sections = group === 'az'
    ? letters.map(l => `<section id="gloss-${l}" class="gloss-letter"><h2>${l}</h2><ul>${list.filter(e => letter(e) === l).map(item).join('')}</ul></section>`).join('')
    : units.map(u => `<section id="gloss-u${u.id}" class="gloss-letter gloss-unit"><h2><span class="unit-number">U${u.id}</span>${escape(u.title)}</h2><ul>${list.filter(e => e.unit === u.id).sort(byTerm).map(item).join('')}</ul></section>`).join('');
  const jump = group === 'az' ? `<nav class="az" aria-label="Jump to letter">${letters.map(l => `<a href="#gloss-${l}">${l}</a>`).join('')}</nav>`
    : `<nav class="az az-units" aria-label="Jump to unit">${units.map(u => `<a href="#gloss-u${u.id}">U${u.id}</a>`).join('')}</nav>`;
  return `${head}<div class="panel gloss-tools"><label class="field" for="gloss-search">Search<input id="gloss-search" type="search" value="${escape(query)}" placeholder="Term, acronym or words" autocomplete="off"></label>
    <label class="field" for="gloss-unit">Unit<span class="selwrap"><select id="gloss-unit"><option value="0">All units</option>${block.units.map(u => `<option value="${u.id}" ${u.id===unit?'selected':''}>U${u.id} · ${escape(u.title)}</option>`).join('')}</select></span></label>
    <fieldset class="gloss-group"><legend class="sr-only">Group terms</legend><div class="seg">${[['unit','By unit'],['az','A–Z']].map(([v,t]) => `<label><input type="radio" name="gloss-group" value="${v}" ${group===v?'checked':''}>${t}</label>`).join('')}</div></fieldset>
    ${jump}</div>
    <p class="status count" role="status">${plural(list.length,'term')}</p>
    <div class="gloss-list">${sections || `<p class="muted gloss-empty">No terms match. Try a shorter word${unit ? ', or set Unit to All units' : ''}.</p>`}</div>
    <div class="navrow actions">${toCard ? `<button id="gloss-card">${backLabel(toCard)}</button>` : `<button id="back">${backLabel('Mode')}</button>`}</div>`;
}

// A definition's first sentence and the rest ('' when it has one sentence). A dot after a capital letter (U.S.) does not end it.
export function splitSummary(text) {
  const m = /^(.*?[a-z0-9)\]][.!?])\s+(?=[A-Z0-9"(])/s.exec(text);
  return m ? [m[1], text.slice(m[0].length)] : [text, ''];
}
// Term popover (desktop) / bottom sheet (phone). content: glossary.popover(). It opens on a short summary, the first sentence
// of the definition; More expands the rest and the excerpts (the owner, 2026-11-16). save: the Save button for the term's
// flash card, beside the close button, or ''.
export function termPopoverHtml(content, {more = false, docs = {}, save = ''} = {}) {
  const e = content.entry, [summary, rest] = e ? splitSummary(e.short) : ['', ''];
  return `<div class="pop-head"><h2 id="term-pop-title">${escape(content.title)}</h2>${save}<button type="button" class="small" id="term-pop-close" aria-label="Close">✕</button></div>
    ${content.expansion ? `<p class="pop-expansion">${escape(content.expansion)}</p>` : ''}
    ${e ? `${content.expansion ? `<p class="label">${escape(e.term)}</p>` : ''}<p class="pop-summary">${escape(more ? e.short : summary)}</p>${more ? excerptsHtml(e, docs) : rest || e.excerpts.length ? '<button type="button" class="link-button" id="term-pop-more">More</button>' : ''}` : ''}
    ${content.see.length ? `<p class="pop-see"><span class="label">See</span> ${content.see.map(x => `<button type="button" class="link-button" data-term="${escape(x.id)}">${escape(x.term)}</button>`).join(' · ')}</p>` : ''}`;
}

// Screen-reader line after an answer: only accepted grading is announced, never another option or rationale.
// Returns null when the line should stay as it is.
export function answerAnnouncement(event, attemptsBefore, session) {
  if (event.type === 'answer' && session.attempts.length > attemptsBefore) return session.current.resolved === 'correct' ? 'Correct. Continue with Next.' : 'Incorrect. Review the selected answer feedback.';
  return event.type === 'next' ? '' : null;
}

// ---- Scholar (2.2.0) ----
// Term list of one unit: unit choice (a segmented row), then each term with its summary. done: {itemId: right answers}.
export function scholarListHtml({block, units, unit, items, done = {}}) {
  const seg = units.map(u => `<label><input type="radio" name="scholar-unit" value="${u}" ${u === unit ? 'checked' : ''}>U${u}</label>`).join('');
  const title = escape(block.units.find(u => u.id === unit)?.title || '');
  const row = it => { const n = done[it.id] || 0, all = it.questions.length;
    return `<li><button type="button" class="card" data-scholar-item="${escape(it.id)}"><strong>${escape(it.term)}</strong><span>${escape(it.summary)}</span>${n ? `<span class="tag" data-tone="scholar">${n === all ? 'Done' : `${n} of ${all} right`}</span>` : ''}</button></li>`; };
  return `<div class="page-head"><p class="label">Block ${block.id} · Scholar</p><h1>Scholar</h1></div>
    <section class="panel scholar-units" data-tone="scholar"><fieldset><legend class="label">Unit</legend><div class="seg scholar-unit-seg">${seg}</div></fieldset>
      <div class="step-head"><span class="num">Unit ${unit}</span><h2>${title}</h2></div></section>
    <p class="status count" role="status">${plural(items.length,'term')}</p>
    <ul class="scholar-list">${items.map(row).join('')}</ul>
    <div class="navrow actions"><button id="back">${backLabel('Mode')}</button></div>`;
}
// Scholar question in the shape of a bank question, so its answers are the same tiles as in the other modes (answersHtml).
export const scholarQuestion = qn => ({ id: qn.id, correctAnswerId: String(qn.key), answers: qn.answers.map((a, i) => ({ id: String(i), text: a.text, rationale: a.why })) });
// The tiles of a Scholar question: the other modes' tiles, except that after the reveal a choice nobody picked stays neutral
// (2.3.0 polish, the owner 2026-11-16) and keeps its why.
const scholarTiles = (qn, st) => answersHtml(scholarQuestion(qn), st, { assisted: true, neutralUnpicked: true });
// tries: this question's picks in order. As in the other modes, a wrong pick flips with its own why (the Assisted flip);
// the right pick or a second wrong one resolves the question and shows every why (the owner, 2026-11-16, "3b").
export const scholarAnswerState = (qn, tries = [], max = 2) => {
  const wrong = tries.filter(i => i !== qn.key).map(String);
  return { order: qn.answers.map((_, i) => String(i)), resolved: tries.includes(qn.key) ? 'correct' : tries.length >= max ? 'revealed' : null, stage: 0, eliminated: [], flippedWrong: wrong, wrongIds: wrong };
};
// One branch decision in the answer-tile shape (2-3 choices; it ends after min(2, choices - 1) wrong picks).
export const decisionQuestion = (qn, k) => ({ id: `${qn.id}-D${k}`, key: qn.steps[k].key, answers: qn.steps[k].choices });
// One term. The sections form one connected accordion (the owner, 2026-11-16: "linked together rather than ... separate
// pills"), each open unless the reader closed it (open: {section: false}). The guided question mirrors the question
// screen (q-sheet, #N heading, stem, answers, navrow with Next at the right, tool-row with Hint) and teaches: a Hint before
// the pick, a "Look again" pointer to the section or picture step that explains it after a wrong pick, and a Takeaway when
// the question is over (the owner, 2026-11-16: hint, nudge, takeaway). No course-page lines.
// tries: this question's picks; hint: the hint is shown; done(question): it is over; pic: {index, motion, playing}.
// back: 'Glossary' | 'Card N' | '' when the term was opened from the Glossary or a card.
const SEE_LABEL = { deeper: 'Deeper explanation', analogy: 'Analogy', scenario: 'Sample scenario', example: 'Everyday example' };
export const seeLabel = (see, picture) => { const [part, n] = see.split(':'); return part !== 'picture' ? SEE_LABEL[part] : picture?.kind === 'steps' ? `Picture, step ${Number(n) + 1}` : `Picture: ${picture?.parts?.[Number(n)]?.label ?? `part ${Number(n) + 1}`}`; };
// Everyday example: the "In the course: <definition>" line stays in the text; its source goes under it in the app's
// attribution style (.excerpt figcaption, "Block Text · p. 15"; the owner, 2026-11-16).
// Only the "In the course" line goes into the attribution figure; the illustration before it stays plain text (review 2026-11-16).
export const exampleHtml = text => { const m = /^(.*?)\s*(In the course: .*), ([^,]+) p\.(\d+)\.$/s.exec(text);
  return m ? `${m[1] ? `<p>${escape(m[1])}</p>` : ''}<div class="excerpt scholar-example"><figure><p>${escape(m[2])}.</p><figcaption>${escape(m[3])} · p. ${m[4]}</figcaption></figure></div>` : `<p>${escape(text)}</p>`; };
// Hands-on task labels (2.3.0): the type tag above the stem of the hands-on question (shown first since 2.4.2).
const TASK_LABEL = { tap: 'Tap the picture', order: 'Put in order', sort: 'Sort', branch: 'Scenario' };
// The body of the guided question by type. draft: the arrangement being built (order: shown indexes in the current order;
// sort: a group 0/1 or null per item). Returns {body, over, feedback, wrongNow, check}.
function guidedBody(item, qn, tries, draft) {
  const t = typeOf(qn);
  draft ??= tries.length ? tries[tries.length - 1] : t === 'order' ? (qn.steps || []).map((_, i) => i) : t === 'sort' ? qn.items.map(() => null) : null;
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
    // "Answer revealed" line, never green (fresh review 2026-11-16, MAJOR 2).
    const marks = over ? null : last && same(last, draft) ? checkMarks(qn, last) : null, done = over ? (ok ? 'right' : 'revealed') : '';
    const mark = i => marks ? (marks[i] ? 'right' : 'wrong') : done;
    const markText = i => mark(i) === 'right' ? (over ? '' : 'In the right place') : mark(i) === 'wrong' ? 'Not here' : '';
    let rows;
    if (t === 'order') {
      rows = shown.map((si, pos) => { const s0 = qn.steps[si], m = mark(pos);
        return `<li class="scholar-row${m ? ` is-${m}` : ''}" data-step="${si}"><span class="scholar-pos" aria-hidden="true">${pos + 1}</span><span class="scholar-row-text"><span>${escape(s0.text)}</span>${marks && !over ? `<span class="feedback-label">${markText(pos)}</span>` : ''}${over ? `<span class="back"><em>${escape(s0.why)}</em></span>` : ''}</span>${over ? '' : `<span class="scholar-move"><button type="button" class="small" data-move="${pos}" data-dir="-1" aria-label="Move up: ${escape(s0.text)}"${pos === 0 ? ' disabled' : ''}>${ICON.up}</button><button type="button" class="small" data-move="${pos}" data-dir="1" aria-label="Move down: ${escape(s0.text)}"${pos === shown.length - 1 ? ' disabled' : ''}>${ICON.down}</button></span>`}</li>`; }).join('');
      rows = `<ol class="scholar-rows scholar-order" aria-label="Steps, first to last">${rows}</ol>`;
    } else {
      rows = qn.items.map((x, i) => { const g = shown[i], m = mark(i);
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
const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);
// Row height probes of an order or sort question (the owner, 2026-11-16: answer heights as in quizzes): its rows in their two
// tallest states, after a wrong check (a mark line on each row) and at the end (the why on each row).
export function scholarRowProbes(item, qn) {
  const wrong = typeOf(qn) === 'order' ? [...qn.key].reverse() : qn.key.map(g => 1 - g);
  return [guidedBody(item, qn, [wrong], wrong).body, guidedBody(item, qn, [qn.key]).body];
}

// started: some guided question of this term has a pick (the Reset questions link shows).
export function scholarItemHtml({block, item, q, tries = [], hint = false, nav, done, back = '', pic = {}, open = {}, draft = null, started = false}) {
  const qn = item.questions[q], n = item.questions.length, t = typeOf(qn);
  const section = (kind, label, body) => `<details class="scholar-drop" data-section="${kind}"${open[kind] === false ? '' : ' open'}><summary><span class="label">${label}</span></summary><div class="scholar-drop-body">${body}</div></details>`;
  const text = t0 => `<p>${escape(t0)}</p>`;
  const g = guidedBody(item, qn, tries, draft), over = g.over;
  // One counter (2.3.0 polish): the section title says "Guided question N of M"; the sheet shows only the task type of a
  // hands-on question. The tiles show Correct / Incorrect; the status line is for screen readers only.
  const quiz = `<div class="scholar-q" data-type="${t}"><section class="question-focus" aria-label="Guided question">${TASK_LABEL[t] ? `<p class="label scholar-task">${TASK_LABEL[t]}</p>` : ''}
      <h2 id="scholar-stem" class="stem" tabindex="-1">${escape(qn.stem)}</h2>
      ${hint ? `<p class="scholar-hint" id="scholar-hint-text" tabindex="-1"><span class="label">Hint</span> ${escape(qn.hint)}</p>` : ''}</section>
      ${g.body}
      <p class="sr-only" role="status" data-say="${escape(g.feedback)}"></p>
      ${g.wrongNow ? `<p class="scholar-see"><span class="label">Look again</span> <button type="button" class="link-button" id="scholar-see" data-see="${escape(qn.see)}">${escape(seeLabel(qn.see, item.picture))}</button></p>` : ''}
      ${over ? `<p class="scholar-takeaway"><span class="label">Takeaway</span> ${escape(qn.takeaway)}</p>` : ''}
      <div class="tool-row scholar-tools"><button id="scholar-hint" aria-controls="scholar-stem"${hint || over ? ' disabled' : ''}>${hint ? 'Hint shown' : 'Hint'}</button>${g.check || ''}</div>
      <div class="navrow actions scholar-q-nav">${q > 0 ? `<button id="scholar-prev-q">${backLabel('Previous question')}</button>` : ''}${q < n - 1 ? `<button id="scholar-next-q"${over ? ' class="primary" data-tone="scholar"' : ''}>${nextLabel('Next question')}</button>` : ''}</div>
      ${started ? '<p class="scholar-reset"><button type="button" class="link-button" id="scholar-reset">Reset this term\'s questions</button></p>' : ''}</div>`;
  // Term nav (the owner, 2026-11-16): Next term always at the right; All terms takes Previous term's place on the first
  // term; the way back (Glossary / Card N) under them.
  const first = nav.previous ? `<button id="scholar-prev" data-scholar-item="${escape(nav.previous.id)}">${backLabel('Previous term')}</button>` : `<button id="scholar-list">${backLabel('All terms')}</button>`;
  const second = [nav.previous ? `<button id="scholar-list">${backLabel('All terms')}</button>` : '', back ? `<button id="scholar-return">${backLabel(back)}</button>` : ''].join('');
  return `<div class="page-head"><p class="label">Block ${block.id} · Scholar · Unit ${item.unit}</p><h1 id="scholar-term">${escape(item.term)}</h1></div>
    <article class="panel scholar-item" data-tone="scholar" aria-labelledby="scholar-term">
      <p class="scholar-summary">${escape(item.summary)}</p>
      <div class="scholar-accordion">${item.picture ? section('picture', `Picture · ${item.picture.kind === 'steps' ? 'step through' : 'tap a part'}`, pictureHtml(item.picture, pic.index ?? 0, pic)) : ''}${section('deeper', 'Deeper explanation', text(item.deeper))}${section('analogy', 'Analogy', text(item.analogy))}${section('scenario', 'Sample scenario', text(item.scenario))}${section('example', 'Everyday example', exampleHtml(item.example))}${section('questions', `Guided question ${q + 1} of ${n}`, quiz)}</div></article>
    <div class="navrow actions scholar-nav">${first}${nav.next ? `<button id="scholar-next" class="primary" data-tone="scholar" data-scholar-item="${escape(nav.next.id)}">${nextLabel('Next term')}</button>` : ''}${second}</div>`;
}

// ---- Flash cards ----
// saved: the card is in Manual (the SAVE button state). source: the card's question, or null for a highlight card.
// back (optional, v1.2.0): the card back panel, shown only after the card has been flipped (cardBackHtml).
// Before the flip there is no Source row, Flag or glossary link, so nothing gives the hidden side away.
// back: cardBackHtml markup made with save:'<!--save-->', so SAVE takes the left cell of the card's tools row.
// Before the flip SAVE stands alone in that row.
// missed: the card is in Missed Questions (the In Missed tag). glossEntry: the card's glossary entry after the first flip,
// or null; it adds Open in Glossary to the row under Back (Hint stays under Next).
// scholar: the card's term has a Scholar item (2.2.0): Open in Scholar joins Open in Glossary after the first flip.
export function flashScreenHtml({preview, set, bank, saved, missed = false, message, source, back = '', glossEntry = null, scholar = false}) {
  const card = preview.cards[preview.index];
  const save = saveButton({id:'flash-save', key:cardKey(card), saved}), row = back ? back.replace('<!--save-->', save) : sourceRow('', '', '', save);
  return `<h1 class="sr-only">Flash cards</h1>${studyToolbar({mode:'Flash Card',locked:true,endId:'flash-exit',status:`Card ${preview.index+1} of ${preview.cards.length}`})}
    <section class="flash-study" aria-label="Flash card review">${set ? `<p class="flash-set-name label">Set · ${escape(set.name)}</p>` : ''}${cardHtml(preview,{unit:source ? questionUnitLabel(source,bank.blocks) : card.kind === 'highlight' ? 'Saved highlight' : '',flaggable:false,saveBox:row+`<p class="flash-message muted" role="status">${escape(message)}</p>`,missed,tools:glossEntry?`<button type="button" id="card-open-gloss" data-entry="${escape(glossEntry.id)}">Open in Glossary</button>${scholar?'<button type="button" id="card-open-scholar" data-tone="scholar">Open in Scholar</button>':''}`:''})}</section>`;
}
// Card back (2.1.3: Open in Glossary moved under Back; the bookmark was replaced by SAVE): the
// SAVE · KEY TERMS · SOURCE · FLAG row (1.2.2; SAVE added in 2.0.0): the terms in the definition and the related terms are the Key terms drop-down,
// the question's course excerpts the Source drop-down, the card Flag at the right. Same order as the question screen.
// entry: glossary entry or null; source: excerpt markup or ''; flagged: the card flag is saved; save: the Save button.
export function cardBackHtml({entry, g, source = '', flagged = false, questionId = null, save = ''}) {
  const terms = entry ? entryTerms(entry, g) : [];
  return `<section class="card-back" aria-label="About this card">
    ${sourceRow(questionId ? source || '' : '', questionId ? flagButton({id:'flag-card', question:questionId, label:'Flag card', flagged, card:true}) : '', keyTermsHtml(terms), save)}</section>`;
}

export const savedSetsScreenHtml = ({library, catalog, back, blocks = [], block}) => `${savedSetsHtml(library,catalog,{blocks,block})}<div class="navrow actions"><button id="cards-home">${backLabel(back)}</button></div>`;

// ---- Results, Previous Attempts, Marked review ----
// Unit accuracy bars (Results and Previous Attempts): one shared name column; tag(row) adds the right-hand note.
// Columns (2.0.0): name · tag · bar · %. The tag (missed count, or first-answer count) has its own column, empty when none.
function unitBarsHtml(rows,tag){return `<div class="bars">${rows.map(row=>{const v=row.asked?row.correct/row.asked:null;return `<div class="barrow"><span class="bar-name">${row.id?`<span class="unit-number">U${row.id}</span>`:''}<span class="bar-title">${escape(row.title)}</span></span><span class="bar-tag">${tag(row)}</span><span class="b" aria-hidden="true"><i style="width:${v===null?0:(v*100).toFixed(1)}%"></i></span><span class="mono ${scoreTone(v)}">${v===null?'—':`${Math.round(v*100)}%`}</span><span class="sr-only">${v===null?'Not attempted':`${row.correct} of ${row.asked} first answers correct`}</span></div>`;}).join('')}</div>`;}

// Retake Quiz: the circular-arrow icon (aria-hidden) and the text label.
const retakeLabel = `<span class="lbl">${ICON.retry}Retake Quiz</span>`;
// gloss (optional): the glossary linker for the Quiz review (see answerReviewHtml).
export function resultsHtml({session, bank, blockId, stats, understanding, source, isFlagged, gloss = null, save = () => '', isOpen = () => false}) {
  const missed=sessionMissedIds(session),toReview=reviewIds(session,understanding);
  const r=results(session),pct=n=>n===null?'—':`${Math.round(n*100)}%`;
  const missedBy=Object.fromEntries(missedUnits(session,bank.blocks).map(row=>[row.id,row.count]));
  const extras=[['Independent',r.independent],['Hints',r.hints],['Reveals',r.reveals],[r.retries===1?'Retry':'Retries',r.retries]].filter(([,n])=>n>0);
  const block=bank.blocks.find(b=>b.id===(session.questions[0]?.block??blockId))||bank.blocks[0],scores=unitScores(stats,block.id,block.units);
  // A session ended before any answer (or with only reveals) has nothing to review.
  const review=answerReviewHtml(session,missed,source,isFlagged,gloss,{save,isOpen})||'<p class="muted review-empty">There\'s nothing here yet. Answer a question in a session and it shows up here.</p>';
  return `<div class="page-head"><p class="label">Latest session results<span class="tag" data-tone="${session.mode==='Hard'?'gold':'blue'}">${escape(session.mode)}</span></p><h1>Stats</h1></div><div class="stats"><div class="stat"><span class="label">Active time</span><strong>${duration(r.activeMs)}</strong><small>Pauses excluded</small></div><div class="stat"><span class="label">Avg / question</span><strong>${r.averageSeconds===null?'—':`${r.averageSeconds.toFixed(1)}s`}</strong><small>${plural(r.seen,'question')} answered</small></div><div class="stat"><span class="label">Accuracy</span><strong>${pct(r.accuracy)}</strong><small>${r.correct}/${r.correct+r.incorrect} answers</small></div><div class="stat"><div class="stat-split"><span class="label correct-label" aria-hidden="true">✓</span><span class="label stat-sep" aria-hidden="true">·</span><span class="label incorrect-label" aria-hidden="true">✕</span><strong class="correct-label">${r.correct}<span class="sr-only"> correct</span></strong><strong class="stat-sep" aria-hidden="true">·</strong><strong class="incorrect-label">${r.incorrect}<span class="sr-only"> incorrect</span></strong></div><small>First try ${pct(r.firstAccuracy)}</small></div></div>${extras.length?`<dl class="ledger-figures metrics" aria-label="Help used">${extras.map(([k,n])=>`<div><dt>${k}</dt><dd>${n}</dd></div>`).join('')}</dl>`:''}${toReview.length?`<div class="actions"><button class="primary" id="review-missed">Review ${session.kind==='not_understood'?'marked':'missed'} questions (${toReview.length})</button></div>`:''}<section class="panel unit-bars"><h2>First-answer accuracy by unit</h2><p class="label">All sessions on this device · ${escape(block.title)}</p>${unitBarsHtml(scores.rows,row=>missedBy[row.id]?`<em class="tag" data-tone="bad">${missedBy[row.id]} missed</em>`:'')}</section><section class="answer-review"><h2>Quiz review</h2>${review}</section><div class="navrow actions results-nav"><button id="again">${backLabel('Blocks')}</button><button id="retry-session">${retakeLabel}</button></div>`;
}

// block (2.1.28): the block chosen in For Review; only its units and exam history show. null shows every block.
export const previousAttemptsHtml = ({bank, stats, hasResults, history = [], block = null}) => `<div class="page-head"><p class="label">On this device${block === null ? '' : ` · Block ${block}`}</p><h1>Previous Attempts</h1></div><p class="muted">Reveals count as missed.</p>${bank.blocks.filter(b => block === null || b.id === block).map(block=>{
    const scores=unitScores(stats,block.id,block.units),rows=[{title:'All units',...scores},...scores.rows];
    return `<section class="panel attempts-panel"><h2>${escape(block.title)}</h2>${unitBarsHtml(rows,row=>row.asked?`<em class="tag">${row.correct}/${row.asked}</em>`:'')}</section>`;
  }).join('')}${examHistoryHtml(block === null ? history : history.filter(h => h.block === block))}<div class="navrow actions review-toolbar"><button id="attempts-back">${backLabel('Blocks')}</button>${hasResults?'<button id="last-results">Latest session results</button>':''}</div>`;

export function missedReviewHtml({bank, review, understanding, source, isFlagged, save = '', terms = ''}) {
  const q=bank.questions.find(q=>q.id===review.ids[review.index]);
  const record=understandingRecord(understanding,bank.version,q.id),answer=q.answers.find(a=>a.id===q.correctAnswerId);
  const n=review.ids.length,last=review.index+1===n;
  return `<div class="page-head"><p class="label">Marked for review</p><h1 class="sr-only">Marked review</h1></div><article class="panel q-sheet review-sheet"><section class="question-focus"><div class="question-heading qhead"><span class="qnum">#${review.index+1} <small>of ${n}</small></span><span class="unit-label">${escape(questionUnitLabel(q,bank.blocks))}</span></div><h2 class="stem review-question" tabindex="-1" id="review-stem">${q.studyMode==='Hard'?escape(q.stem):highlightedStem(q)}</h2></section>${reviewItem('correct','Correct answer',escape(answer.text),`<em class="review-explanation">${escape(q.reviewCue || answer.rationale)}</em>`)}${sourceRow(source(q),flagButton({id:'review-flag',question:q.id,flagged:isFlagged(q.id)}),terms,save)}</article><fieldset class="mastery"><legend class="label">Mastered this material?</legend><div class="types">${[['yes','Yes','Unmark this question.'],['no','No','Keep it marked.']].map(([v,t,d])=>`<label class="card"><input type="radio" name="understood" value="${v}" ${record?.decision===v?'checked':''}><strong>${t}</strong><span>${d}</span></label>`).join('')}</div></fieldset><div class="navrow actions review-actions"><button id="review-previous" ${review.index?'':'disabled'}>${backLabel('Back')}</button><button id="review-next" class="primary" ${record?.decision?'':'disabled'}>${nextLabel(last?'Finish':'Next')}</button></div><div class="tool-row review-exit"><button id="leave-review">${backLabel('Blocks')}</button></div>`;
}

// ---- Exam (v1.1.0): setup panel, exam screen, submit check, results and review ----
const pct0 = ratio => `${Math.round(ratio * 100)}%`;
const shortDate = ms => new Date(ms).toLocaleDateString(undefined, {day:'numeric', month:'short'});
// The Exam panel on the Mode screen. forms: bank.examForms for the block or null; status: {cycle, taken, next}
// (exam.formStatus); plan: the Standard-draw blueprint (exam.blueprint), shown when the block has no forms;
// last: the latest history row.
export function examSetupHtml({block, forms, status, plan = null, last, studyOpen}) {
  const mark = passMark(EXAM.size), order = forms?.order || [], next = status?.next;
  const size = next ? forms.forms[next].length : EXAM.size;
  const state = n => status.taken.includes(n) ? 'Taken this cycle' : n === next ? 'Next' : 'Not taken yet';
  return `<section class="panel exam-setup" data-tone="violet" aria-labelledby="exam-setup-title"><div class="step-head"><span class="num">Block ${block.id} · All ${block.units.length} units</span><h2 id="exam-setup-title">Exam</h2></div>
    <dl class="block-figures exam-figures"><div><dt>Questions</dt><dd>${size}</dd></div><div><dt>Time limit</dt><dd>${examTime(EXAM.limitMs)}</dd></div><div><dt>Pass</dt><dd>${Math.round(EXAM.passRatio*100)}%<small> · ${mark} of ${EXAM.size}</small></dd></div></dl>
    ${next ? `<div class="exam-form">${status.cycle > 1 ? `<p class="label">Cycle ${status.cycle}</p>` : ''}
      <ul class="form-status" aria-label="Exam forms">${order.map(n => `<li><span class="tag"${n === next ? ' data-tone="violet"' : ''}>Form ${n}</span><span class="muted">${state(n)}</span></li>`).join('')}</ul></div>` : plan ? `<div class="exam-blueprint"><p class="label">Blueprint · ${plan.size} questions from ${plan.pool}</p>
      <div class="score-list blueprint-list">${plan.units.map(u => `<div><span><span class="unit-number">U${u.id}</span>${escape(block.units.find(x => x.id === u.id)?.title || `Unit ${u.id}`)}</span><strong>${u.count}</strong></div>`).join('')}</div>
      <dl class="ledger-figures metrics blueprint-difficulty" aria-label="Difficulty">${['Easy','Medium'].map(k => `<div><dt>${k}</dt><dd>${plan.difficulty[k].count}</dd></div>`).join('')}</dl></div>` : ''}
    <ul class="exam-rules"><li>No feedback, hints, reveal or retry until you submit.</li><li>No pause. The clock runs on real time, also when the app is closed.</li><li>Change any answer before you submit. Flag a question to come back to it later.</li><li>At 0:00 the app submits. A blank answer scores 0.</li><li>Submitted answers count in your unit stats.</li></ul>
    ${last ? `<p class="muted exam-last">Last exam: <strong class="${last.pass?'correct-label':'incorrect-label'}">${pct0(last.correct/last.size)} · ${last.pass?'Pass':'Fail'}</strong> · ${escape(shortDate(last.at))}</p>` : ''}
    ${studyOpen ? '<p class="muted exam-note">Your paused study session stays saved.</p>' : ''}</section>`;
}

// Exam answers: the selected-state rule (blue border and fill), no grading marks until submit.
function examAnswersHtml(q, order, picked) {
  return order.map((id, i) => {
    const a = q.answers.find(x => x.id === id), on = id === picked;
    return `<button type="button" class="item${on?' picked':''}" data-exam-answer="${escape(id)}" aria-pressed="${on}" aria-keyshortcuts="${i+1}"><span class="letter" aria-hidden="true">${'ABCDEFGH'[i]}</span><span class="answer-body"><span class="answer-text"><span>${escape(a.text)}</span></span><span class="feedback-label" aria-hidden="true">Your answer</span></span></button>`;
  }).join('');
}
// Exam times read in minutes, so the limit shows as 60:00 (duration() would show 1:00:00). Countdown rounds up.
const examTime = ms => { const n = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`; };
export const examClock = ms => examTime(Math.ceil(ms / 1000) * 1000);
// The exam screen: top bar (Submit, pill, live clock), navigator, question sheet, Previous/Next and tools.
// navOpen: phones fold the 30 cells under a Questions disclosure so the question shows first (UX review 2026-11-11, M9).
export function examHtml({exam, bank, now, navOpen = true}) {
  const id = exam.pool[exam.index], q = bank.questions.find(x => x.id === id), counts = examCounts(exam), n = exam.pool.length;
  const left = Math.max(0, exam.deadline - now), last = exam.index === n - 1, flagged = exam.flagged.includes(id);
  const otherBlank = exam.pool.some((x, i) => i !== exam.index && exam.answers[x] === null);
  const cell = (qid, i) => { const answered = exam.answers[qid] !== null, flag = exam.flagged.includes(qid), here = i === exam.index;
    return `<button type="button" class="exam-cell${answered?' answered':''}${flag?' flagged':''}${here?' now':''}" data-exam-go="${i}" aria-label="Question ${i+1}, ${answered?'answered':'blank'}${flag?', flagged':''}"${here?' aria-current="step"':''}>${i+1}</button>`; };
  // Clock at the left, Submit at the right (the owner, 2026-11-08), as Next sits at the right of Previous.
  return `<h1 class="sr-only">Exam · Block ${exam.block}</h1><div class="toolbar study-toolbar study-top exam-top"><div class="meta exam-clock-cell"><span class="exam-clock${left<=300000?' low':''}" id="exam-clock-box" role="timer" aria-label="Time left"><span id="exam-clock">${examClock(left)}</span></span></div><span class="tag" data-tone="violet">Exam · Block ${exam.block}</span><button class="small" data-tone="violet" id="exam-submit">Submit</button></div>
    <section class="panel ledger exam-ledger" data-tone="violet" aria-label="Question navigator"><dl class="track-row ledger-figures"><div><dt>Answered</dt><dd>${counts.answered}<small>/${n}</small></dd></div><div><dt>Blank</dt><dd>${counts.blank}</dd></div><div><dt>Flagged</dt><dd>${counts.flagged}</dd></div></dl>
    <div class="exam-time" aria-hidden="true"><i id="exam-time-fill" style="width:${(100*(1-left/EXAM.limitMs)).toFixed(2)}%"></i></div>
    <details class="exam-nav-box"${navOpen ? ' open' : ''}><summary>Questions</summary><div class="exam-nav" role="group" aria-label="Go to question">${exam.pool.map(cell).join('')}</div>
    <div class="legend" aria-hidden="true"><span><i class="answered"></i>Answered</span><span><i class="blank"></i>Blank</span><span><i class="flagged"></i>Flagged</span><span><i class="now"></i>Current</span></div></details></section>
    <article class="panel q-sheet exam-sheet"><section class="question-focus" aria-label="Current question"><div class="question-heading qhead"><p class="qnum">#${exam.index+1} <small>of ${n}</small><span class="sr-only">Question ${exam.index+1} of ${n}</span></p><span class="unit-label">${escape(questionUnitLabel(q,bank.blocks))}</span></div><h2 id="exam-stem" class="stem" tabindex="-1">${escape(q.stem)}</h2></section>
    <div class="answers" role="group" aria-label="Answer choices">${examAnswersHtml(q, exam.orders[id], exam.answers[id])}</div>
    <div class="exam-flag-row"><button type="button" class="small exam-flag" id="exam-flag" aria-pressed="${flagged}" aria-keyshortcuts="F">${ICON.flag}<span>${flagged?'Flagged for later':'Flag for later'}</span></button></div></article>
    <div class="navrow actions question-actions"><button id="exam-previous" ${exam.index?'':'disabled'} aria-keyshortcuts="ArrowLeft">${backLabel('Previous')}</button><button id="exam-next" class="primary" data-tone="violet" aria-keyshortcuts="ArrowRight">${nextLabel(last?'Review and submit':'Next')}</button></div>
    <div class="tool-row exam-tools"><button id="exam-next-blank" ${otherBlank?'':'disabled'}>Go to next blank</button></div>`;
}

// Submit check (dialog body; the dialog adds the head and Close).
export function submitCheckHtml(exam) {
  const c = examCounts(exam), jumps = list => list.map(n => `<button type="button" class="link-button exam-jump" data-exam-jump="${n-1}">#${n}</button>`).join('');
  return `<dl class="ledger-figures metrics submit-figures"><div><dt>Answered</dt><dd>${c.answered}<small>/${exam.pool.length}</small></dd></div><div><dt>Blank</dt><dd>${c.blank}</dd></div><div><dt>Flagged</dt><dd>${c.flagged}</dd></div></dl>
    ${c.blank ? `<div class="jump-row"><span class="label incorrect-label">Blank</span><span class="jump-list">${jumps(c.blankNumbers)}</span></div>` : ''}
    ${c.flagged ? `<div class="jump-row"><span class="label">Flagged</span><span class="jump-list">${jumps(c.flaggedNumbers)}</span></div>` : ''}
    <p class="muted">${c.blank ? `${plural(c.blank,'blank answer')} will score 0. ` : ''}After you submit, answers cannot change.</p>
    <div class="actions"><button class="primary" id="exam-confirm-submit">Submit exam</button></div>`;
}

// Exam history: score columns against the 70% line (newest at the right), then the latest rows as text.
function examHistoryHtml(history, currentId = null) {
  if (!history.length) return '';
  const shown = history.slice(-12), line = Math.round(EXAM.passRatio * 100);
  const label = shown.map(h => `${shortDate(h.at)} ${pct0(h.correct/h.size)} ${h.pass?'pass':'fail'}`).join(', ');
  return `<section class="panel exam-history"><h2>Exam history</h2><p class="label">On this device · ${plural(history.length,'exam')}</p>
    <div class="exam-chart" role="img" aria-label="Exam scores, oldest first: ${escape(label)}. Pass line at ${line}%."><div class="exam-plot"><span class="pass-line" style="bottom:${line}%"><span>${line}%</span></span>${shown.map(h => `<span class="exam-col${h.pass?' pass':' fail'}${h.id===currentId?' current':''}" style="height:${Math.max(2,100*h.correct/h.size).toFixed(1)}%"></span>`).join('')}</div>
    <div class="exam-axis" aria-hidden="true">${shown.map(h => `<span>${pct0(h.correct/h.size)}</span>`).join('')}</div></div>
    <div class="score-list exam-history-list">${[...history].reverse().slice(0,5).map(h => `<div><span>${escape(shortDate(h.at))} · ${examLabel(h)}${h.timedOut?' · timed out':''}</span><strong class="${h.pass?'correct-label':'incorrect-label'}">${pct0(h.correct/h.size)} · ${h.pass?'Pass':'Fail'}</strong></div>`).join('')}</div></section>`;
}

const FILTER_NAMES = {missed:'Missed', blank:'Blank', changed:'Changed', flagged:'Flagged', all:'All'};
// One review item: your answer against the correct one, the rationale, then the Save · Key terms · Source · Flag row. Exam reviews never offer Mark for review (the owner, 2026-11-08), old or new exams alike.
function examReviewItem(item, {box, marked, source, isFlagged, termsFor = () => '', link = null, open = false}) {
  const T = (part, id, text) => link ? link(item.q, part, id, text) : escape(text);
  const q = item.q, right = q.answers.find(a => a.id === q.correctAnswerId), pick = item.picked && q.answers.find(a => a.id === item.picked);
  const why = (text, id) => `<em class="review-explanation">${T('rationale', id, text)}</em>`;
  const status = item.correct ? '<span class="tag" data-tone="good">Correct</span>' : item.blank ? '<span class="tag" data-tone="bad">Blank</span>' : '<span class="tag" data-tone="bad">Missed</span>';
  // One row per question (number, ✓ or ✕, stem) that opens to the full item, as first-try-correct rows in Quiz review
  // (the owner, 2026-11-08: a 30-item review was about 15 screens long). Open: the summary shows the status tags in place of the
  // clipped stem, and the full stem shows once below it (the owner, 2026-11-08: the open row was cramped).
  const mark = item.correct ? '<span class="correct-label" aria-hidden="true">✓</span>' : '<span class="incorrect-label" aria-hidden="true">✕</span>';
  const said = item.correct ? 'Correct' : item.blank ? 'Blank' : 'Missed';
  return `<details class="review-item review-compact exam-item" data-exam-item="${escape(q.id)}"${open?' open':''}><summary><strong class="review-number">${reviewNumber(item.number)}</strong>${mark}<span class="review-compact-stem">${escape(q.stem)}</span><span class="review-status" aria-hidden="true">${status}${item.changed?'<span class="tag">Changed</span>':''}${item.flagged?'<span class="tag">Flagged</span>':''}</span><span class="sr-only">${said}${item.changed?', changed':''}${item.flagged?', flagged':''}</span></summary>
    <p class="review-question">${T('stem', null, q.stem)}</p>
    ${reviewItem(item.correct?'correct':'wrong','Your answer',pick?T('answer', pick.id, pick.text):'<span class="muted">No answer</span>',pick&&!item.correct?why(pick.rationale, pick.id):'')}
    ${reviewItem('correct','Correct answer',T('answer', right.id, right.text),why(right.rationale, right.id))}
    ${sourceRow(source(q),flagButton({question:q.id,label:`Flag question ${item.number}`,flagged:isFlagged(q.id)}),termsFor(q),box||'')}</details>`;
}

// results: examResults(); boxFor(q) → Save button markup or ''; marked(id) → already marked not understood.
export function examResultsHtml({exam, results: r, bank, history, filter, boxFor, marked, source, isFlagged, termsFor = () => '', link = null, isOpen = () => false}) {
  const sign = n => n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0', mark = r.passMark;
  const gap = r.gap === null ? null : Math.round(r.gap * 100);
  const counts = Object.fromEntries(REVIEW_FILTERS.map(f => [f, reviewItems(r, f).length])), items = reviewItems(r, filter);
  const unitRow = u => { const v = u.total ? u.correct / u.total : null;
    return `<div class="barrow"><span class="bar-name"><span class="unit-number">U${u.id}</span><span class="bar-title">${escape(u.title)}</span>${u.lowConfidence?'<span class="tag" title="3 or fewer questions">Low confidence</span>':''}</span><span class="b" aria-hidden="true"><i style="width:${(v*100).toFixed(1)}%"></i>${u.study===null?'':`<b class="study-tick" style="left:${(u.study*100).toFixed(1)}%"></b>`}</span><span class="mono ${scoreTone(v)}">${u.correct}/${u.total}</span><span class="mono muted">${u.study===null?'—':pct0(u.study)}</span><span class="sr-only">${u.correct} of ${u.total} correct in this exam; study first-answer accuracy ${u.study===null?'not available':pct0(u.study)}</span></div>`; };
  return `<div class="page-head"><p class="label">Exam results · Block ${exam.block} · ${examLabel(exam)}<span class="tag" data-tone="violet">Exam</span></p><h1>Exam</h1></div>
    <section class="panel exam-verdict" data-tone="violet" aria-label="Exam score"><div class="verdict-row"><strong class="verdict-score">${pct0(r.pct)}</strong><span class="tag verdict-tag" data-tone="${r.pass?'good':'bad'}">${r.pass?'Pass':'Fail'}</span></div>
      <p><strong>${r.correct} of ${r.size}</strong> correct · pass mark ${Math.round(EXAM.passRatio*100)}% (${mark} of ${r.size})</p>
      <p class="muted">${r.margin >= 0 ? `${r.margin ? plural(r.margin,'question') : 'Exactly'} ${r.margin ? 'above' : 'at'} the pass mark` : `${plural(-r.margin,'question')} short of the pass mark`}${r.timedOut?' · Time ran out, so the app submitted.':''}</p></section>
    <div class="stats"><div class="stat"><span class="label">Time used</span><strong>${examTime(r.timeUsedMs)}</strong><small>of ${examTime(EXAM.limitMs)}</small></div><div class="stat"><span class="label">Per question</span><strong>${r.secondsPerQuestion<10?r.secondsPerQuestion.toFixed(1):Math.round(r.secondsPerQuestion)}s</strong><small>${plural(r.size,'question')}</small></div><div class="stat"><span class="label">Blank</span><strong class="${r.blank?'incorrect-label':''}">${r.blank}</strong><small>Scored as wrong</small></div><div class="stat"><span class="label">Practice gap</span><strong class="${gap===null?'':gap<0?'incorrect-label':'correct-label'}">${gap===null?'—':`${sign(gap)} pts`}</strong><small>${r.studyAccuracy===null?'No study answers yet':`Study first answers ${pct0(r.studyAccuracy)}`}</small></div></div>
    <dl class="ledger-figures metrics exam-changes" aria-label="Changed answers"><div><dt>Changed</dt><dd>${r.changes.changed}</dd></div><div><dt>Wrong → right</dt><dd class="correct-label">${r.changes.wrongToRight}</dd></div><div><dt>Right → wrong</dt><dd class="incorrect-label">${r.changes.rightToWrong}</dd></div><div><dt>Net</dt><dd>${sign(r.changes.net)}</dd></div></dl>
    <section class="panel unit-bars exam-units"><h2>Score by unit</h2><p class="label">This exam vs study first-answer accuracy · ${escape(bank.blocks.find(b=>b.id===exam.block)?.title||'')}</p>
      <div class="bars exam-bars"><div class="barrow bar-head" aria-hidden="true"><span class="bar-key"><i class="key-exam"></i>Exam bar <i class="key-study"></i>Study mark</span><span></span><span class="label">Exam</span><span class="label">Study</span></div>${r.units.map(unitRow).join('')}</div>
      <p class="muted exam-note">Units with 3 or fewer questions in this exam are low confidence: one answer moves the score by 33 points or more.</p></section>
    ${examHistoryHtml(history, exam.id)}
    <section class="answer-review exam-review" data-tone="violet" aria-labelledby="exam-review-title"><h2 id="exam-review-title">Exam review</h2>
      <fieldset class="review-filter"><legend class="sr-only">Show</legend><div class="seg">${REVIEW_FILTERS.map(f => `<label><input type="radio" name="exam-filter" value="${f}" ${f===filter?'checked':''}>${FILTER_NAMES[f]} ${counts[f]}</label>`).join('')}</div></fieldset>
      ${items.length ? items.map(item => examReviewItem(item, {box:boxFor(item.q), marked:marked(item.q.id), source, isFlagged, termsFor, link, open:isOpen(item.q.id)})).join('') : `<p class="muted review-empty">No ${FILTER_NAMES[filter].toLowerCase()} questions in this exam.</p>`}</section>
    <div class="navrow actions results-nav"><button id="exam-blocks">${backLabel('Blocks')}</button><button id="exam-again" data-tone="violet"><span class="lbl">${ICON.retry}New exam</span></button></div>`;
}

// ---- Dialog bodies (the dialog adds the head and Close) ----
const flagActions = exists => `<p id="flag-error" role="status"></p><div class="actions"><button class="primary" id="save-flag">Save flag</button>${exists ? '<button id="clear-flag">Clear flag</button>' : ''}</div>`;
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

// Diagnostics: one row per saved note (ID, Question or Card tag, question text, note, Edit), then Download and Copy.
export function diagnosticsHtml(flags, bank) {
  const rows = Object.entries(flags).map(([key,f]) => {
    const q = bank.questions.find(x => x.id === f.questionId), current = q && f.version === bank.version;
    return `<li class="diag-row"><div class="diag-meta"><span class="mono">${escape(f.questionId)}</span><span class="tag">${f.target==='card'?'Card':'Question'}</span>${current?'':'<span class="tag" data-tone="warn">Earlier content</span>'}</div>${current?`<p class="diag-stem">${escape(q.stem)}</p>`:''}<p class="diag-note">${escape(f.note || 'Flagged without a note')}</p><button class="link-button" data-edit="${escape(key)}">Edit</button></li>`;
  }).join('');
  return `<p class="muted">Includes question flags, notes, answer attempts, content version and coarse device information. Nickname is excluded.</p>${rows?`<ul class="diag-list">${rows}</ul>`:'<p class="diag-empty">No review notes yet. Use Flag on a question or card to add one.</p>'}<p id="copy-status" class="status count" role="status"></p><div class="actions"><button class="primary" id="download-flags">Download</button><button id="copy-flags">Copy</button></div>`;
}
export const oldNoteHtml = f => `<p>${escape(f.note)}</p><p class="muted">This note belongs to earlier content and remains in exports.</p><div class="actions"><button class="danger" id="clear-old-note">Clear this note</button></div>`;

// ---- Layout (receives its elements) ----
// Scroll only on entry, history and question changes, never on answer feedback or timer ticks.
export const repositionStudy = (old, next) => next.step === 'study' && Boolean(next.question) && (old.screen !== 'study' || old.question !== next.question || old.appearance !== next.appearance);
// Wide screens (2.1.8): after Next or Back, centre the sheet and its navigation row in the space under the sticky bars
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
  if (!win.matchMedia?.('(max-width: 760px), (max-height: 500px)').matches) return false;
  const question = main.querySelector('.question-focus'), answers = main.querySelector('.answers');
  if (!question || !answers) return false;
  win.scrollTo({top:0,behavior:'instant'});
  const top = question.getBoundingClientRect().top + win.scrollY;
  win.scrollTo({top:Math.max(0,top-headerHeight-12),behavior:'instant'});
  answers.querySelectorAll('.item').forEach(answer => { answer.scrollTop = 0; });
  return true;
}
