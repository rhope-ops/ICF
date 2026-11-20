// Setup screens: the block list and its For Review box, the Questions setup (Mode), the study hub, the card setup, the
// exam setup and the marked-question practice setup. Inputs: the shared state (app-state.mjs), the bank, the card
// catalog and the Scholar index. Outputs: the setup screens in the page; a started session through session.mjs.
// Run: loaded by the browser as part of the app (site/dist/index.html).
// Network: none. Writes: browser storage through persist() (poolKind) and session.mjs, and the page DOM. Credentials: none.
import { shared } from './app-state.mjs';
import { toPoolKind } from './analytics.mjs';
import { $, main, persist } from './app.mjs';
import { bindSetsGroup, cardsFor, catalogCards, setsGroup } from './cards-ui.mjs';
import { eligible, questionsForMode } from './engine.mjs';
import { beginExam, examSetupMarkup } from './exam-ui.mjs';
import { EXAM, formStatus, formsFor, standardPool } from './exam.mjs';
import { cardsInSet, startCards } from './flashcards.mjs';
import { notUnderstoodQuestions } from './learning.mjs';
import { available, navigate, render } from './nav.mjs';
import { poolShortfall } from './presentation.mjs';
import { WEAK_SESSION_SIZE, bindWeakButtons, readiness, readinessHtml, weakButtonHtml } from './readiness.mjs';
import { openScholar } from './scholar-ui.mjs';
import { blockLoaded, progressOf, unitsOf } from './scholar.mjs';
import * as screens from './screens.mjs';
import { allSections, beginReview, bindDynamic, bindPoolKind, currentGroup, noteGroup, resumeStudy, selectQuestions, sessionOpen, startSession, syncPool } from './session.mjs';

/** Bind a unit checkbox list and its All units box: the checked units become the selection, then onChange runs.
 * @param {string} name the name of the unit checkboxes
 * @param {Function} onChange called after each change and once at the start
 */
function bindSectionChoices(name, onChange) {
  const all = main.querySelector('[data-all-units]');
  const choices = [...main.querySelectorAll(`[name="${name}"]`)];
  // Take the checked units, set the All units box (checked, mixed or clear) and report the change.
  const update = () => {
    shared.sections = choices.filter(input => input.checked).map(input => Number(input.value));
    all.checked = shared.sections.length === allSections().length;
    all.indeterminate = shared.sections.length > 0 && !all.checked;
    onChange();
  };
  all.onchange = () => { choices.forEach(input => { input.checked = all.checked; }); update(); };
  choices.forEach(input => { input.onchange = update; });
  update();
}
// Open a block with every unit selected, then go to the next screen (the Study hub by default).
function chooseGroup(id, next = 'units') {
  shared.groupId = id;
  shared.sections = allSections();
  if (next === 'not-understood-setup') shared.quizScope = 'all';
  navigate(next);
}
/** Draw the Blocks screen and bind it: open a block, the readiness buttons, one open block at a time, For Review and Resume. */
export function renderGroups() {
  main.innerHTML = screens.blocksHtml({bank:shared.bank, nickname:shared.profile.nickname, open:sessionOpen(), understanding:shared.understanding, missedReview:shared.missedReview, stats:shared.stats, examBlock:shared.exam?.submitted ? shared.exam.block : null, extra:b=>{const r=readiness({stats:shared.stats,bank:shared.bank,examHistory:shared.examHistory,block:b.id});return {facts:readinessHtml(r),button:weakButtonHtml(r,sessionOpen())};}, current:shared.lastGroup});
  main.querySelectorAll('[data-block]').forEach(button => button.onclick = () => chooseGroup(Number(button.dataset.block)));  bindWeakButtons(main, b=>readiness({stats:shared.stats,bank:shared.bank,examHistory:shared.examHistory,block:b}), (b,targets)=>{ if(sessionOpen())return; const help=shared.mode==='Hard'?'Unassisted':shared.mode; shared.groupId=b; shared.sections=targets; const pool=selectQuestions(available(help),WEAK_SESSION_SIZE,'smart'); shared.sections=allSections(); if(pool.length){startSession(pool,{version:shared.bank.version,mode:help},'smart');navigate('study');} });  // Study weak units: the help level used last (Hard has its own questions: Unassisted); the setup's unit choice is not kept narrowed
  // One open block at a time: opening a block closes the others, also where a browser
  // ignores details name=; For Review then shows the open block only, or stays empty when no block is open.
  const cards = [...main.querySelectorAll('details.block-card')];
  cards.forEach(card => card.addEventListener('toggle', () => {
    if (card.open) cards.forEach(other => { if (other !== card && other.open) other.open = false; });
    const openCard = cards.find(c => c.open), id = openCard ? Number(openCard.querySelector('[data-block]').dataset.block) : null;
    const box = main.querySelector('.for-review');
    if (!box || (box.dataset.reviewFor ?? '') === String(id ?? '')) return;
    box.outerHTML = screens.forReviewHtml({bank:shared.bank, block:id, understanding:shared.understanding, stats:shared.stats, examBlock:shared.exam?.submitted ? shared.exam.block : null});
    bindForReview();
  }));
  bindForReview();
  if ($('#resume')) $('#resume').onclick = resumeStudy;
}
/** Bind the For Review buttons; every one acts on the block the box shows (exam results, marked review, practice, attempts). */
function bindForReview() {
  const box = main.querySelector('.for-review'); if (!box) return;
  const shown = Number(box.dataset.reviewFor);
  if ($('#exam-results-link')) $('#exam-results-link').onclick = () => navigate('exam-results');
  // Marked for review: Review opens the one-by-one review at once (as on Results) and continues a started one;
  // Practice quiz is the marked-question test, with its unit choice (every unit selected first).
  box.querySelectorAll('[data-review-block]').forEach(button => button.onclick = () => {
    const id = Number(button.dataset.reviewBlock), marked = notUnderstoodQuestions(shared.bank, shared.understanding, null, id).map(q => q.id);
    shared.groupId = id; shared.sections = allSections();
    const open = shared.missedReview && shared.missedReview.ids.every(x => shared.bank.questions.find(q => q.id === x)?.block === id) && shared.missedReview.ids.some(x => marked.includes(x));
    if (open) navigate('missed-review'); else beginReview(marked);
  });
  box.querySelectorAll('[data-practice-units]').forEach(button => button.onclick = () => {
    shared.groupId = Number(button.dataset.practiceUnits); shared.quizScope = 'units'; shared.sections = allSections(); navigate('not-understood-setup');
  });
  if ($('#saved-results')) $('#saved-results').onclick = () => { shared.attemptsGroup = shown; navigate('previous-attempts'); };
}
/** Per-unit counts for the setup list: questions of the chosen help level (Assisted and Unassisted share the Standard pool;
 * Hard has its own), or the flash cards the Standard questions supply.
 * @param {boolean} cards true: count flash cards; false: count questions
 * @param {string} selectedMode the help level whose questions are counted
 * @returns {{all: string, units: object}} the line for All units and the count per unit ID
 */
function sectionCounts(cards, selectedMode = 'Unassisted') {
  const pool = questionsForMode(shared.bank.questions, cards ? 'Unassisted' : selectedMode), measure = list => cards ? cardsFor(list).length : list.length;
  const all = measure(eligible(pool, allSections(), shared.filter, shared.groupId));
  return {all:`${all} ${cards?'cards':'questions'}`,units:Object.fromEntries(allSections().map(id=>[id,measure(eligible(pool,[id],shared.filter,shared.groupId))]))};
}
/** Mode screen: help level, question pool (Random / Smart) and size, Dynamic Flash Cards,
 * and the separate Exam entry. Exam ignores the Setup units and pool size: it always samples the whole block.
 */
export function renderMode() {
  // An empty selection the user made survives a Random/Smart redraw.
  if (!shared.sections.length && !shared.keepEmptySections) shared.sections = allSections();
  shared.keepEmptySections = false;
  // The number of questions the current choices make available.
  const count=()=>available().length;
  main.innerHTML=screens.questionsSetupHtml({block:currentGroup(), mode:shared.mode, units:shared.sections, replacing:sessionOpen(), counts:sectionCounts(false,shared.mode), dynamic:shared.dynamicCards, pool:{kind:shared.poolKind, size:shared.poolSize, n:count(), empty:!shared.sections.length?screens.NO_UNITS:shared.mode==='Hard'?'':poolShortfall(count(),shared.poolSize)}});
  // Refresh the unit counts, the Study button, the availability line and the pool size chips.
  const update=()=>{
    const n=count();
    // The unit counts follow the help level (Hard counts Hard questions).
    const c=sectionCounts(false,shared.mode);main.querySelectorAll('.unit-panel [data-count]').forEach(e=>{e.textContent=e.dataset.count==='all'?c.all:String(c.units[e.dataset.count]??0);});
    $('#mode-next').disabled=!n;
    $('#mode-availability').textContent=screens.modeAvailability({mode:shared.mode,count:n,poolSize:shared.poolSize,hardPending:shared.bank.hardMode?.status==='pending_review'});
    // one warning, always under the size toggle (no longer also under the units).
    syncPool($('#pool-size'),'pool-size',shared.poolSize,n,size=>{shared.poolSize=size;update();},!shared.sections.length?screens.NO_UNITS:shared.mode==='Hard'?'':poolShortfall(n,shared.poolSize));
  };
  bindSectionChoices('unit',update);
  // Hard: the Study button takes the gold tone.
  main.querySelectorAll('[name=mode]').forEach(e=>e.onchange=()=>{shared.mode=e.value;if(shared.mode==='Hard')$('#mode-next').dataset.tone='gold';else delete $('#mode-next').dataset.tone;update();});
  bindPoolKind();bindDynamic();
  $('#mode-next').onclick=()=>{const pool=selectQuestions(available(),shared.poolSize,shared.poolKind);if(!pool.length)return;startSession(pool,{version:shared.bank.version,mode:shared.mode},shared.poolKind);navigate('study');};
  $('#back').onclick=()=>navigate('units');
}
// Study hub: Questions, Cards, Glossary, and the separate Take exam.
export function renderHub() {
  main.innerHTML=screens.studyHubHtml({block:currentGroup(),scholar:unitsOf(shared.scholar,shared.groupId).length>0,scholarDone:blockLoaded(shared.scholar,shared.groupId)?progressOf(shared.scholar,shared.scholarState,shared.groupId).all:null});
  const go={questions:'mode',cards:'cards-setup',glossary:'glossary'};
  main.querySelectorAll('[data-study]').forEach(b=>b.onclick=()=>{if(b.dataset.study==='glossary'){shared.glossEntry=null;shared.glossReturn=null;}navigate(go[b.dataset.study]);});
  if(!shared.glossary)main.querySelector('[data-study="glossary"]')?.setAttribute('disabled','');
  $('#exam-open').onclick=()=>navigate('exam-setup');
  if($('#scholar-open'))$('#scholar-open').onclick=()=>openScholar(null,null,shared.groupId,null,null,true);  // Open Scholar shows the term list, never the last term
}
/** Draw the card setup (units or a saved set) and bind it: set choice, unit choice, Manage sets, Study and Back. */
export function renderCardsSetup() {
  const pick = shared.cardSets.sets.find(set => set.id === shared.pickSetId) || null;
  // A set with no cards in the chosen block cannot stay picked (its radio is disabled).
  if (!pick || !cardsInSet(pick,catalogCards(),setsGroup()).length) shared.pickSetId = null;
  if (shared.pickSetId) shared.sections = []; else if (!shared.sections.length) shared.sections = allSections();
  main.innerHTML = screens.cardsSetupHtml({block:currentGroup(), blocks:shared.bank.blocks, library:shared.cardSets, pickSetId:shared.pickSetId, catalog:catalogCards(), units:shared.sections, counts:sectionCounts(true), setsBlock:setsGroup()});
  bindSetsGroup('setup-sets-block');
  // The cards to study: the picked set's cards in the block filter, or the cards of the selected units.
  const cardPool = () => shared.pickSetId ? cardsInSet(shared.cardSets.sets.find(set => set.id === shared.pickSetId),catalogCards(),setsGroup()) : cardsFor(available('Unassisted'));
  // Clear a set pick when units are chosen, then show the card count and enable Study when there are cards.
  const count = () => {
    if (shared.sections.length && shared.pickSetId) { shared.pickSetId = null; main.querySelectorAll('[name="card-set"]').forEach(r => { r.checked = false; }); }
    const n = cardPool().length;
    $('#eligible-count').textContent = screens.cardCountText({pickName: shared.pickSetId && shared.cardSets.sets.find(set => set.id === shared.pickSetId).name, n});
    $('#eligible-count').classList.toggle('warn',!n); $('#units-next').disabled = !n;
  };
  bindSectionChoices('unit',count);
  main.querySelectorAll('[name="card-set"]').forEach(r => r.onchange = () => { shared.pickSetId = r.value; shared.sections = []; render(); main.querySelector(`[name="card-set"][value="${CSS.escape(shared.pickSetId)}"]`)?.focus(); });
  $('#manage-sets').onclick = () => { shared.setsReturn = 'units'; navigate('saved-card-sets'); };
  $('#units-next').onclick = () => { const pool = cardPool(); if (!pool.length) return; shared.flashSetId = shared.pickSetId; shared.flashPreview = startCards(pool); shared.flashMessage = ''; noteGroup(shared.groupId); navigate('flash-card'); };
  $('#back').onclick = () => navigate('units');
}
export function renderExamSetup() {
  // Exam questions are their own set, drawn by form when the bank has forms, otherwise the Standard draw.
  main.innerHTML=screens.examSetupScreenHtml({blockId:shared.groupId, examSetup:examSetupMarkup()});
  const next=formStatus(shared.examCycles,formsFor(shared.bank,shared.groupId),shared.groupId).next,enough=next||standardPool(shared.bank.questions,shared.groupId).length>=EXAM.size;
  $('#mode-next').disabled=!enough;$('#mode-availability').textContent=enough?'':'Not enough questions for an exam.';
  $('#back').onclick=()=>{navigate('units');main.querySelector('#exam-open')?.focus({preventScroll:true});};
  $('#mode-next').onclick=beginExam;
}
/** Draw the marked-question practice setup and bind it: units, help level, pool kind and size, Cancel and Start. */
export function renderNotUnderstoodSetup() {
  // The units in scope: every unit of the block, or the chosen ones.
  const selected = () => shared.quizScope === 'all' ? allSections() : shared.sections;
  // The marked questions of those units for the chosen help level.
  const candidates = () => questionsForMode(notUnderstoodQuestions(shared.bank,shared.understanding,selected(),shared.groupId),shared.mode);
  // Marked questions available per unit for the chosen mode (red counts beside the units).
  const unitAvailable = () => { const per = Object.fromEntries(allSections().map(id => [id, questionsForMode(notUnderstoodQuestions(shared.bank,shared.understanding,[id],shared.groupId),shared.mode).length]));
    return {all:String(questionsForMode(notUnderstoodQuestions(shared.bank,shared.understanding,allSections(),shared.groupId),shared.mode).length),units:per}; };
  main.innerHTML = screens.practiceSetupHtml({block:currentGroup(), quizScope:shared.quizScope, units:shared.sections, mode:shared.mode, poolKind:shared.poolKind, poolSize:shared.targetedPoolSize, available:candidates().length, replacing:sessionOpen(), counts:unitAvailable()});
  // Refresh the per-unit counts, the shortfall line, the Start button and the pool size chips.
  const count = () => {
    const n = candidates().length;
    const per = unitAvailable(); main.querySelectorAll('.unit-count[data-count]').forEach(e => { e.textContent = e.dataset.count === 'all' ? per.all : per.units[e.dataset.count] ?? 0; });
    $('#practice-count').textContent = n ? '' : poolShortfall(n,shared.targetedPoolSize);
    $('#practice-confirm').disabled = !n;
    syncPool($('#practice-pool-size'),'practice-pool',shared.targetedPoolSize,n,size=>{ shared.targetedPoolSize = size; count(); });
  };
  if (shared.quizScope === 'units') bindSectionChoices('review-unit',count); else count();
  // Marked practice uses the same Random / Smart choice as the Mode screen.
  main.querySelectorAll('[name="pool-kind"]').forEach(r=>r.onchange=()=>{shared.poolKind=toPoolKind(r.value);persist('poolKind',shared.poolKind);main.querySelector('#pool-help').textContent=screens.POOL_HELP[shared.poolKind];});
  // Hard: the Study button takes the gold tone, as on the Questions setup.
  main.querySelectorAll('[name="practice-mode"]').forEach(r => r.onchange = () => { shared.mode = r.value; if (shared.mode === 'Hard') $('#practice-confirm').dataset.tone = 'gold'; else delete $('#practice-confirm').dataset.tone; count(); });
  $('#practice-cancel').onclick = () => navigate('blocks');
  $('#practice-confirm').onclick = () => {
    const pool = candidates(); if (!pool.length) return;
    const kind=shared.poolKind;
    startSession(selectQuestions(pool,shared.targetedPoolSize,kind),{version:shared.bank.version,mode:shared.mode,kind:'not_understood'},kind);
    navigate('study');
  };
}
