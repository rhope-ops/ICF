// Setup screen markup: mode and pool controls, study hub, and the Questions, card, exam and practice setups.
// Inputs: the arguments of each function. Outputs: HTML strings.
// Run: imported through screens.mjs, which re-exports its public functions.
// Network: none.
// Writes: none.
// Credentials: none.
import { studyModes } from './features.mjs';
import { FEATURES, LABEL, POOL_SIZES } from './settings.mjs';
import { escape, unitChoices, poolShortfall, plural, backLabel, nextLabel } from './presentation.mjs';
import { POOL_LABEL } from './analytics.mjs';
import { cardsInSet, setsBlockHtml, MISSED_ID, ALL_BLOCKS } from './flashcards.mjs';

// ---- Shared setup controls ----
// Question pool: one choice, Random / Smart; it replaces the Smart Mode checkbox.
export const POOL_HELP={random:`A random mix from the selected ${LABEL.sections}.`,smart:'Unseen questions first, then missed ones.'};
// The Random / Smart choice of the question pool (radio buttons) with the help line of the chosen kind.
export function poolKindControl({kind}) {
  return `<fieldset class="pool-kind" id="pool-kind"><legend class="sr-only">Question pool</legend><div class="seg pool-kind-seg">${['random','smart'].map(k=>`<label><input aria-describedby="pool-help" type="radio" name="pool-kind" value="${k}" ${kind===k?'checked':''}>${POOL_LABEL[k]}</label>`).join('')}</div><em class="pool-help" id="pool-help">${POOL_HELP[kind]}</em></fieldset>`;
}
// The Dynamic Flash Cards check box row; `on` sets it checked.
const dynamicControl = on => `<label class="card row" id="dynamic-choice"><input id="dynamic-cards" type="checkbox" aria-describedby="dynamic-help" ${on?'checked':''}><span><strong>Dynamic Flash Cards</strong><em id="dynamic-help">Automatically save missed questions as flash cards.</em></span></label>`;
// Mode cards: the Mode screen and Marked practice use the same cards.
const MODE_HELP={Assisted:'Timed key terms, then removes wrong choices.',Unassisted:'No timed help. Hint is available.',Hard:'Harder scenario questions. No help.'};
// Mode is the help level only: Exam has its own entry under the study setup.
export const modeCards=(name,current)=>studyModes().map(m=>`<label class="card" data-tone="${m==='Hard'?'gold':'blue'}"><input type="radio" name="${name}" value="${m}" ${current===m?'checked':''}><strong>${m}</strong><span>${MODE_HELP[m]}</span></label>`).join('');
// Pool chips. A selection smaller than the first size shows its own count in that
// slot (gold) and a note at the right; sizes larger than the selection are disabled.
// empty: the note at the right when nothing is available (Setup: no unit selected).
export const NO_UNITS=`You must select at least 1 ${LABEL.section}.`;
// The pool size chips (radio buttons) for a form field `name`; n is how many questions are available, `empty` the note when none are.
export const poolSeg=(name,current,n=Infinity,empty='')=>{
  const short=n<POOL_SIZES[0], shown=current!=='all'&&current>n?(short?POOL_SIZES[0]:'all'):current;
  // One pool size chip: gold with the available count when the selection is smaller than the first size, disabled when larger than the selection.
  const chip=size=>{const fit=short&&size===POOL_SIZES[0], over=!fit&&size!=='all'&&size>n;
    return `<label class="${fit?'pool-fit':''}"><input type="radio" name="${name}" value="${size}" ${shown===size?'checked':''} ${over?'disabled':''}>${size==='all'?'All':fit?n:size}</label>`;};
  return `<div class="pool-row"><div class="seg">${[...POOL_SIZES,'all'].map(chip).join('')}</div>${short&&n&&shown!=='all'?`<p class="pool-note">${poolShortfall(n,POOL_SIZES[0])}</p>`:!n&&empty?`<p class="pool-note">${escape(empty)}</p>`:''}</div>`;
};

// ---- Study hub and setups ----
// Study hub: three tiles (Questions, Flash cards, Glossary; on phones Glossary takes the full second row), then the
// Scholar entry and the Exam entry, each after an "Or" divider. Scholar is term study. scholar: the
// block has Scholar content (a block without it shows no Scholar entry).
const TILES=[['questions','Questions','Answer, score and retry.'],['cards','Flash cards','Terms and definitions.'],['glossary','Glossary','Course terms with their sources.']];
// The Mode screen. scholar: the block has Scholar; scholarDone: {done, total} terms once its Scholar file is loaded.
export function studyHubHtml({block, scholar = false, scholarDone = null}) {
  // One study-type tile (a button with its title and one line of help).
  const tile = ([v,t,d]) => `<button type="button" class="card" data-study="${v}"><strong>${t}</strong><span>${d}</span></button>`;
  const divider = '<div class="exam-divider" aria-hidden="true"><span>Or</span></div>';
  return `<div class="page-head"><p class="label">${LABEL.Group} ${block.id} · ${escape(block.title)}</p><h1>Mode</h1></div>
    <div class="type-grid study-tiles" role="group" aria-label="Study type">${TILES.filter(([v])=>v!=='cards'||FEATURES.cardCatalog).map(tile).join('')}</div>
    ${scholar ? `${divider}<section class="card exam-entry scholar-entry" data-tone="scholar" aria-labelledby="scholar-entry-title"><div class="exam-entry-text"><h2 id="scholar-entry-title">Scholar</h2><p class="exam-entry-sub">Go deeper with interactive lessons.</p>${scholarDone ? `<p class="exam-entry-sub scholar-entry-done">${scholarDone.done} of ${plural(scholarDone.total, 'term')} done</p>` : ''}</div><button id="scholar-open" class="primary" data-tone="scholar">${nextLabel('Open Scholar')}</button></section>` : ''}
    ${divider}
    <section class="card exam-entry" data-tone="violet" aria-labelledby="exam-entry-title"><div class="exam-entry-text"><h2 id="exam-entry-title">Exam</h2><p class="exam-entry-sub">Prove your mastery of the material.</p></div><button id="exam-open" class="primary" data-tone="violet">${nextLabel('Take exam')}</button></section>`;
}

// One note on every path that starts a new Questions session over a paused one.
export const REPLACING_NOTE = '<p class="muted replacing-note">Starting replaces your paused study session; understanding choices and notes are kept.</p>';
// Questions setup: help level, units, question pool (Random / Smart and size), Dynamic Flash Cards.
// counts: {all: 'label', units: {unitId: n}}; pool: {kind, size, n, empty}.
export function questionsSetupHtml({block, mode, units, counts, pool, dynamic, replacing = false}) {
  return `<div class="page-head"><p class="label">${LABEL.Group} ${block.id} · Questions</p><h1>Questions</h1></div>
    <fieldset class="modes mode-options"><legend class="sr-only">Help level</legend>${modeCards('mode',mode)}</fieldset>
    <section class="panel unit-panel"><div class="step-head"><span class="num">${LABEL.Group} ${block.id}</span><h2>${escape(block.title)}</h2></div><fieldset><legend class="sr-only">${LABEL.Sections}</legend>${unitChoices(block,units,'unit',counts)}</fieldset></section>
    <section class="panel pool-panel" aria-labelledby="pool-title"><div class="step-head"><span class="num">Pool</span><h2 id="pool-title">Questions</h2></div>${poolKindControl({kind:pool.kind})}<fieldset id="pool-size" class="pool-size"><legend class="sr-only">Number of questions</legend>${poolSeg('pool-size',pool.size,pool.n,pool.empty||'')}</fieldset></section>
    ${FEATURES.cardCatalog?dynamicControl(dynamic):''}<p id="mode-availability" class="status" role="status"></p>${replacing ? REPLACING_NOTE : ''}
    <div class="navrow actions"><button id="back">${backLabel('Mode')}</button><button class="primary"${mode==='Hard'?' data-tone="gold"':''} id="mode-next">${nextLabel('Study')}</button></div>`;
}

// Flash card setup: saved sets and units; with no saved card in any block the sets panel is one line.
// setsBlock: the saved sets' block filter (this block by default, or ALL_BLOCKS); blocks: every block, for the filter.
export function cardsSetupHtml({block, blocks = [block], library, pickSetId, catalog, units, counts, setsBlock = block.id}) {
  const setRows = library.sets.map(set => { const n = cardsInSet(set,catalog,setsBlock).length; return `<label class="card row"><input type="radio" name="card-set" value="${escape(set.id)}" ${set.id===pickSetId?'checked':''} ${n?'':'disabled'}><span><strong>${escape(set.name)}</strong>${set.id===MISSED_ID?' <span class="tag">Auto</span>':''}</span><span class="set-pick-count mono">${plural(n,'card')}</span></label>`; }).join('');
  return `<div class="page-head"><p class="label">${LABEL.Group} ${block.id} · Flash cards</p><h1>Flash cards</h1></div>
      ${library.sets.every(set => !cardsInSet(set, catalog, ALL_BLOCKS).length) ? `<section class="panel card-set-pick card-set-none"><p class="muted">No saved cards yet. Missed questions and cards you SAVE show up here.</p><button class="small" id="manage-sets">Manage sets</button></section>` : `<section class="panel card-set-pick"><div class="step-head"><span class="num">Saved</span><h2>Card sets</h2><button class="small" id="manage-sets">Manage sets</button></div>${setsBlockHtml(blocks, setsBlock, 'setup-sets-block')}<div class="setlist" role="radiogroup" aria-label="Saved card sets">${setRows}</div></section>`}
      <section class="panel unit-panel${pickSetId?' is-dimmed':''}"><div class="step-head"><span class="num">${LABEL.Group} ${block.id}</span><h2>${escape(block.title)}</h2></div><fieldset><legend class="sr-only">${LABEL.Sections}</legend>${unitChoices(block,pickSetId?[]:units,'unit',counts)}</fieldset><p id="eligible-count" class="status count" role="status"></p></section>
      <div class="navrow actions"><button id="back">${backLabel('Mode')}</button><button class="primary" id="units-next">${nextLabel('Study')}</button></div>`;
}

// Status line under the units: the card count or the saved set in use.
export function cardCountText({pickName, n}) {
  return pickName ? `Using saved set “${pickName}”. Choose a ${LABEL.section} to switch back.` : n ? `${plural(n,'card')} in this selection.` : `No cards match these ${LABEL.sections}.`;
}

// Exam setup (from the hub's Take exam): the Exam panel, Back to study, Start exam.
export function examSetupScreenHtml({blockId, examSetup}) {
  return `<div class="page-head"><p class="label">${LABEL.Group} ${blockId} · Exam</p><h1>Take exam</h1></div>${examSetup}<p id="mode-availability" class="status" role="status"></p><div class="navrow actions"><button id="back">${backLabel('Mode')}</button><button class="primary" data-tone="violet" id="mode-next">${nextLabel('Start exam')}</button></div>`;
}

// The line under the mode cards: only Hard can lack questions for these units.
export function modeAvailability({mode, count, poolSize, hardPending}) {
  if (mode !== 'Hard') return '';
  return count ? poolShortfall(count,poolSize) : hardPending ? 'Hard questions are awaiting review.' : `No Hard questions match these ${LABEL.sections}.`;
}

// counts (optional): {all, units: {unitId: n}} marked questions available per unit for this mode, shown in red (bad tone).
export function practiceSetupHtml({block, quizScope, units, mode, poolKind = 'random', poolSize, available, replacing, counts = null}) {
  return `<div class="page-head"><p class="label">${LABEL.Group} ${block.id} · Marked for review${quizScope === 'all' ? ` · All ${block.units.length} ${LABEL.sections}` : ''}</p><h1>${quizScope === 'all' ? `Practice all ${LABEL.sections}` : `Choose practice ${LABEL.sections}`}</h1></div>
    ${quizScope === 'units' ? `<section class="panel unit-panel"><div class="step-head"><span class="num">${LABEL.Group} ${block.id}</span><h2>${escape(block.title)}</h2></div><fieldset><legend class="sr-only">${LABEL.Sections}</legend>${unitChoices(block,units,'review-unit',counts,'bad')}</fieldset></section>` : ''}
    <fieldset class="modes mode-options" id="practice-mode"><legend class="sr-only">Study mode</legend>${modeCards('practice-mode',mode)}</fieldset>
    <section class="panel pool-panel"><div class="step-head"><span class="num">Pool</span><h2>Questions</h2></div>${poolKindControl({kind:poolKind==='smart'?'smart':'random'})}<fieldset id="practice-pool-size"><legend class="sr-only">Number of questions</legend>${poolSeg('practice-pool',poolSize,available)}</fieldset><p id="practice-count" class="status" role="status"></p></section>
    ${replacing ? REPLACING_NOTE : ''}
    <div class="navrow actions"><button id="practice-cancel">${backLabel('Blocks')}</button><button class="primary"${mode==='Hard'?' data-tone="gold"':''} id="practice-confirm">${nextLabel('Study')}</button></div>`;
}
