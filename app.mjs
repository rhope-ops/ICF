import { previewCards, startCards, moveCards, restoreCardSets, removeSavedCard, cardsInSet, ALL_BLOCKS, setsBlockValue, cardKey, MANUAL_ID, MISSED_ID, questionSaveBox, writeSetCard, manualHas, setHasCard, addCardToSet, cardForQuestion } from './flashcards.mjs';
import { restoreStats, inspectStats, recordSession, prioritize, studyScores, toPoolKind, POOL_KINDS } from './analytics.mjs';
import { EXAM, blueprint, standardPool, formsFor, formStatus, countExam, restoreCycles, startExam, examEvent, examLive, examCounts, examResults, examSession, withStudySnapshot, historyEntry, addHistory, restoreHistory, restoreExam, settleExam, remainingMs, REVIEW_FILTERS } from './exam.mjs';
import { ICON, escape, toolsMenu, assistanceTimer, poolShortfall, answersHtml, saveButton, sourceRow, flagButton, sourceVisible } from './presentation.mjs';
import { APP_VERSION, diagnosticReport } from './diagnostics.mjs';
import { eligible, sample, shuffle, start, transition, questionsForMode } from './engine.mjs';
import { restoreUnderstanding, markMissed, assessUnderstanding, understandingRecord, notUnderstoodQuestions, sessionMissedIds, newMissedIds, reviewIds, restoreReview } from './learning.mjs';
import { persistence, validateBank, restoreSession, sessionSnapshot, reviewFlag, cardFlag, updateFlags, savedBoolean, migrateSession, migrateLearning, migrateReview } from './storage.mjs';
import * as screens from './screens.mjs';
import { restoreGlossary, entryForCard, stemLinks, popover, keyTerms, searchEntries, restoreBookmarks } from './glossary.mjs';
import { restoreScholar, addScholarBlock, blockLoaded, restoreScholarState, refitScholarState, scholarStateShape, newScholarState, moveScholar, unitsOf, itemsFor, itemById, itemForEntry, neighbours, contextTarget, resolved, right, typeOf, triesOf, pickKey, reviewDeck, draftOf, picMs, progressOf, listModel, nextUnit } from './scholar.mjs';
import { pictureHtml, stepKey, moveFrom } from './pictures.mjs';
const $ = s => document.querySelector(s);
const main = $('#main'), dialog = $('#dialog');
let local;
try { local = window.localStorage; } catch { local = { getItem(){throw Error();}, setItem(){throw Error();}, removeItem(){throw Error();} }; }
const store = persistence(local);
function read(key, fallback) { const r = store.read(key, fallback); if (r.error) notice(r.error); return r.value; }
function notice(message) { $('#storage-notice').textContent = message || ''; }
// Write one saved value. A failed write shows the storage notice and returns false; success leaves other notices in place.
function persist(key, value) { const error = store.write(key, value); if (error) notice(error); return !error; }
let theme=window.icfTheme.choice;
// Dark theme switch: a row of the gear menu (the light/dark toggle sits with the other settings).
const themeSwitch=document.querySelector('#settings-dark');
const syncThemeSwitch=()=>{if(themeSwitch)themeSwitch.checked=document.documentElement.dataset.theme==='dark';};
if(themeSwitch){syncThemeSwitch();themeSwitch.onchange=()=>{theme=themeSwitch.checked?'dark':'light';window.icfTheme.set(theme);syncThemeSwitch();persist('theme',theme);};
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>setTimeout(syncThemeSwitch));}
let pinQuestion=savedBoolean(read('pinQuestion',true),true);
document.documentElement.dataset.pinQuestion=String(pinQuestion);
const updateHeaderHeight=()=>document.documentElement.style.setProperty('--header-height',`${Math.ceil($('header').getBoundingClientRect().height)}px`);
updateHeaderHeight();
if('ResizeObserver' in window)new ResizeObserver(updateHeaderHeight).observe($('header'));
else window.addEventListener('resize',updateHeaderHeight);
const rawProfile = read('profile', {});
let profile = { nickname: typeof rawProfile?.nickname === 'string' ? rawProfile.nickname.slice(0,40) : '', visited: rawProfile?.visited === true };
let flags = read('flags', {});
if (!flags || typeof flags !== 'object' || Array.isArray(flags) || Object.values(flags).some(f => !f || typeof f.questionId !== 'string' || typeof f.version !== 'string' || !Array.isArray(f.answerIds) || f.answerIds.some(id => typeof id !== 'string') || typeof f.note !== 'string' || !f.assessment)) { flags = {}; notice('Review notes could not be restored.'); }
let understanding;
try { understanding=restoreUnderstanding(read('understanding',{})); } catch { understanding={};notice('Understanding history could not be restored. New decisions will be kept on this device.'); }
// Question pool: Random or Smart in icf:poolKind; an older save kept Smart Mode as a boolean in icf:smart.
let stats,poolKind;
{ const r=inspectStats(read('stats',null));stats=r.stats;
  if(r.reset)notice('Question stats could not be read and were reset. Other progress is unchanged.');
  else if(r.dropped)notice(`${r.dropped} damaged question stats record${r.dropped===1?' was':'s were'} removed. The other stats are unchanged.`); }
poolKind=toPoolKind(read('poolKind',null),read('smart',false));
// Glossary (glossary.json, loaded after the first screen; the app works without it): screen state and the open term popover.
// glossReturn: 'flash-card' when the entry was opened from a card, so the Glossary offers the way back to that card.
let examNavOpen=false;
let glossary=null,glossQuery='',glossUnit=0,glossEntry=null,termPop=null,glossGroup='unit',glossReturn=null;
let targetedPoolSize='all';
// Scholar (the index scholar.json loads after the first screen, a block's file when its Scholar opens; the app works without them). scholarState: the saved place (icf:scholar).
// scholarReturn: {to:'glossary', entry} or {to:'flash-card'} when an item was opened from there (a way back).
// lastPlace: 'quiz' | 'scholar', the one the user was in last (the nav context button).
let scholar=null,scholarState=null,scholarReturn=null,lastPlace=null;
// The term picture's step or chosen part, for the term on screen only (not saved).
// prev: the state before the last picture move, so that one render animates (then null: other re-renders do not replay it).
let scholarPic={item:null,index:0,prev:null};
// The picture is open or collapsed for every term until the page closes (not saved).
// Open or closed term-page sections (picture, deeper, analogy, scenario, example, questions), until the page closes.
let scholarOpen={};
// Guided-question hints shown (question ids), until the page closes; a hint is help, not a score.
const scholarHints=new Set();
// Unit review: {block, unit, deck: [{item, q}], k, picks}; in memory only (practice; never saved or scored).
let scholarReview=null;const reviewHints=new Set(),reviewDraft=new Map();
// Order and sort tasks: the arrangement being built, per question id (not saved; a check is saved as a try).
const scholarDraft=new Map();
// The term whose section state was set: on a term's first visit every section is open, on later visits the reading
// sections start closed so the guided question sits near the top.
let scholarOpenFor=null;
let scholarPicOpen=null;  // an umbrella opened for a covered entry: its picture section opens even on a return visit
// scholarSay: set by a pick, so that the next render announces the answer line once. scholarQuery: the term list's search text (not saved).
let scholarSay=false,scholarQuery='';
// Picture loop: on unless the
// reader paused it with the button (kept for every term until the page closes) or asked for reduced motion. A manual step
// or part pauses only the term on screen (scholarPic.manual). picMs per step (caption length).
let scholarPlay=!window.matchMedia('(prefers-reduced-motion: reduce)').matches,picTimer=null;
let flashPreview = null, flashSetId = null, flashMessage = '', cardSets;
// Card source on setup, Saved-sets screen state and Dynamic Flash Cards.
let pickSetId = null, setsReturn = 'blocks', pendingCard = null, cardCatalog = null;
// Saved sets block filter: the current block by default; a choice holds while that block stays current.
let setsView = null;
const setsBlock = () => setsView && setsView.for === blockId ? setsView.value : blockId ?? ALL_BLOCKS;
function bindSetsBlock(id) { const select = $(`#${id}`); if (!select) return;
  select.onchange = () => { setsView = {for:blockId, value:setsBlockValue(select.value)}; keepScroll(render); $(`#${id}`)?.focus({preventScroll:true}); }; }
let dynamicCards = read('dynamicCards', true) !== false;
// Card sets: Missed Questions and Manual. An older library (schema 1 or 2) migrates on load and is saved at once
// as schema 3; damaged data is left in storage untouched until the next card change.
let cardSetsRead = false;
{ const raw = read('cardSets', null);
  try { cardSets = restoreCardSets(raw ?? undefined); cardSetsRead = true; if (raw && raw.schema !== cardSets.schema) persist('cardSets', cardSets); }
  catch { cardSets = restoreCardSets(); notice('Saved card sets could not be read. Other progress is unchanged.'); } }
let missedReview=null, quizScope='all';
// Exam Mode: the live or last submitted exam (icf:exam), its history (icf:examHistory) and the form cycle (icf:examCycle).
// The old question mix (icf:examMix, icf:examHard) is no longer read: exams are drawn by form.
// resultsKind: which results the Results tab opens (the latest finished study session or exam).
let reviewOpen=new Set(), exam=null, examOpen=new Set(), examHistory=[], examCycles={schema:1,blocks:{}}, examFilter='missed', resultsKind='study', examAnnounced=null;
// Source excerpts: modules and the excerpt asset load only on demand (a resolved question or a review).
let excerptKit=null, excerptKitLoad=null, linkData=null, linkLoad=null, linkFailed=false;const EXCERPT_SCREENS=['study','results','missed-review','exam-results','flash-card'];  // screens that can show a source excerpt or key terms
let lastStudy = null;
let bank, session = null, step = profile.visited ? 'blocks' : 'welcome', blockId = null, units = [], poolSize = 30, filter = 'Slides and Text', mode = 'Assisted';
let last = performance.now(), modalWasRunning = false, hiddenWasRunning = false, lastSaved = 0;
const currentBlock = () => bank.blocks.find(block => block.id === blockId);
// Last studied block: saved when a question session, a block's flash cards, an exam or a
// marked review starts. Opening a block's Mode screen or the Glossary does not count. The Blocks list
// opens this block; an unknown block or one without questions falls back to the first block.
let lastBlock = null;
// The block whose Previous Attempts the For Review box opened; null shows every block.
let attemptsBlock = null;
const servedBlock = id => Number.isInteger(id) && bank.questions.some(q => q.block === id);
function noteBlock(id){ if (servedBlock(id) && id !== lastBlock) { lastBlock = id; persist('lastBlock', id); } }
const allUnits = () => currentBlock().units.map(unit => unit.id);
// An open gear menu pauses the question; closing it resumes.
let menuWasRunning=false;
const tools=toolsMenu({toggle:$('#tools-toggle'),panel:$('#tools-panel'),onChange:open=>{
  if(open&&!menuWasRunning&&step==='study'&&session&&!session.paused){menuWasRunning=true;send({type:'pause'},false);}
  else if(!open&&menuWasRunning){menuWasRunning=false;if(step==='study'&&session&&!session.ended)send({type:'resume'},false);}
}});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&tools.isOpen()){tools.close();$('#tools-toggle').focus({preventScroll:true});}});
// Exam keys (exam screen only, never while typing, in a dialog or the gear menu): 1–4 answer, F flag, Left/Right move.
document.addEventListener('keydown',event=>{
  if(step!=='exam'||!examLive(exam)||dialog.open||tools.isOpen()||event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||event.repeat&&!/^Arrow/.test(event.key))return;
  if(event.target?.closest?.('input,textarea,select,[contenteditable=""],[contenteditable="true"]'))return;
  let ev=null;
  if(/^[1-9]$/.test(event.key)){const id=exam.orders[exam.pool[exam.index]][Number(event.key)-1];if(!id)return;ev={type:'answer',id};}
  else if(event.key==='f'||event.key==='F')ev={type:'flag'};
  else if(event.key==='ArrowLeft')ev={type:'previous'};
  else if(event.key==='ArrowRight')ev={type:'next'};
  else return;
  event.preventDefault();
  const index=exam.index;sendExam(ev);
  if(step==='exam'&&exam.index!==index){$('#exam-stem')?.focus({preventScroll:true});showExamQuestion();}
});
document.addEventListener('pointerdown',event=>{if(tools.isOpen()&&!event.target.closest('header'))tools.close();});
$('#tools-panel').addEventListener('click',event=>{if(event.target.closest('button'))tools.close();});
// A new quiz session gets its own stats identity, an empty save box and an immediate save.
function startSession(pool,options,kind='random'){session={...start(pool,options),id:crypto.randomUUID(),poolKind:kind};noteBlock(session.questions[0]?.block??blockId);pendingCard=null;resultsKind='study';updateStats();save();last=performance.now();}
function selectQuestions(pool,size,kind=poolKind){
  if(kind!=='smart')return sample(pool,Math.random,size);
  // Smart Mode orders only this eligible pool: All Units includes the whole block.
  const count=size==='all'?pool.length:Math.min(size,pool.length);
  return prioritize(pool,stats).slice(0,count);
}
function updateStats(){
  if(!session)return;
  session.id ||= crypto.randomUUID();
  stats=recordSession(stats,session);persist('stats',stats);
}
// Redraws the pool chips for the current selection count and rebinds them.
function syncPool(fieldset,name,current,n,pick,empty=''){
  fieldset.querySelector('.pool-row')?.remove();
  fieldset.insertAdjacentHTML('beforeend',screens.poolSeg(name,current,n,empty));
  fieldset.querySelectorAll(`[name="${name}"]`).forEach(r=>r.onchange=()=>pick(r.value==='all'?'all':Number(r.value)));
}
// Pool choice: saved at once; the screen redraws (the help line and pool notes) and focus returns to the choice.
let keepEmptyUnits=false;
function bindPoolKind(){main.querySelectorAll('[name="pool-kind"]').forEach(r=>r.onchange=()=>{poolKind=toPoolKind(r.value);persist('poolKind',poolKind);keepEmptyUnits=!units.length;keepScroll(render);main.querySelector(`[name="pool-kind"][value="${poolKind}"]`)?.focus({preventScroll:true});});}
function bindDynamic(){if($('#dynamic-cards'))$('#dynamic-cards').onchange=event=>{dynamicCards=event.target.checked;persist('dynamicCards',dynamicCards);};}
const catalogCards=()=>cardCatalog||=previewCards(bank.questions);
// Card writes go through this store (see flashcards.mjs, Saving cards).
const cardStore={library:()=>cardSets,commit:next=>persistCardSets(next),fail:notice};
function persistCardSets(next) {
  if (!persist('cardSets',next)) return false;
  cardSets = next; return true;
}
// The question screen's SAVE state once the answer is known; null before it. An earlier question (after Back) shows
// SAVE too; only the live question runs the Dynamic Flash Cards write to Missed Questions, once per appearance.
// missed: the card is in Missed Questions (the In Missed tag; SAVE itself shows Manual only).
function questionCard(c,q,reviewing){
  if(!c.resolved)return null;
  const card=cardForQuestion(catalogCards(),q.id);if(!card)return null;
  if(!reviewing){
    const missed=c.resolved!=='correct'||session.attempts.some(a=>a.questionId===q.id&&a.appearance===c.appearance&&!a.correct);
    pendingCard=questionSaveBox(cardStore,pendingCard,{key:`${session.id}:${q.id}:${c.appearance}`,card,missed,dynamic:dynamicCards});
  }
  return {key:cardKey(card),saved:manualHas(cardSets,card),missed:inMissed(card),card};
}
const inMissed=card=>setHasCard(cardSets.sets.find(s=>s.id===MISSED_ID),card);
// SAVE: the button toggles the card in Manual. The polite status line announces the change; a short
// viewport toast shows it (aria-hidden, fixed near the bottom, so it covers no content beside the button) and hides after 2 s.
let saveNoteTimer=0;
// One Manual toggle for every Save button. The screen re-renders and every Save button of the card on the page, the term
// pop-up's included, shows the new state at once (the pop-up and question Save share one state).
// Returns the announced line, or null when the write failed.
function toggleManual(card){
  const on=!manualHas(cardSets,card);
  if(!writeSetCard(cardStore,MANUAL_ID,card,on))return null;
  const text=on?'Saved as a Flash Card':'Removed from flash cards',status=$('#answer-status');
  status.textContent='';requestAnimationFrame(()=>{status.textContent=text;});
  keepScroll(render);
  const saved=manualHas(cardSets,card);
  document.querySelectorAll(`[data-save-card="${CSS.escape(cardKey(card))}"]`).forEach(b=>{b.setAttribute('aria-pressed',String(saved));b.setAttribute('aria-label',saved?'Saved as a flash card':'Save as a flash card');});
  return text;
}
function bindSave(card,scope=main){
  const button=scope.querySelector(`[data-save-card="${CSS.escape(cardKey(card))}"]`);if(!button)return;
  button.onclick=()=>{
    const text=toggleManual(card);if(!text)return;
    const again=main.querySelector(`[data-save-card="${CSS.escape(cardKey(card))}"]`);again?.focus({preventScroll:true});
    const row=again?.closest('.source-row');if(!row)return;
    flashToast(text,row);
  };
}
// A toast fixed near the bottom of the viewport (above the safe area), so it never covers the card above
// the tools row. The polite status line carries the announcement; the toast is aria-hidden. Also the exam flag.
function flashToast(text,row){
  document.querySelectorAll('.save-toast').forEach(n=>n.remove());clearTimeout(saveNoteTimer);
  document.body.insertAdjacentHTML('beforeend',`<div class="save-toast" aria-hidden="true"><span class="tag">${escape(text)}</span></div>`);
  // If the pressed row sits at the bottom of the viewport, the toast moves under the header instead, so it never covers it.
  if(row){ const toast=document.querySelector('.save-toast'),t=toast.getBoundingClientRect(),r=row.getBoundingClientRect();
    if(r.bottom>t.top&&r.top<t.bottom)toast.classList.add('at-top'); }
  saveNoteTimer=setTimeout(()=>document.querySelectorAll('.save-toast').forEach(n=>n.remove()),2000);
}
function save() { if (session) persist('session',sessionSnapshot(session)); }
// SAVE replaced the glossary bookmark. Saved bookmarks (icf:glossaryBookmarks, a list of entry ids) move once into
// Manual as the cards of their source questions, then the key is removed. Damaged card sets or a failed write keep the key.
function migrateBookmarks(){
  const raw=read('glossaryBookmarks',null);if(raw===null||!glossary||!cardSetsRead)return;
  let next=cardSets;
  try{for(const id of restoreBookmarks(raw,glossary)){const card=cardForQuestion(catalogCards(),glossary.byId.get(id).sourceId);if(card)next=addCardToSet(next,MANUAL_ID,card);}}
  catch(error){notice(error.message);return;}
  if(next!==cardSets&&!persistCardSets(next))return;
  try{local.removeItem('icf:glossaryBookmarks');}catch{}
}
function saveUnderstanding() { persist('understanding',understanding); }
function updateStudy(next) {
  const missed=newMissedIds(session,next),changed=!session||next.attempts.length!==session.attempts.length||next.appearances!==session.appearances||next.reveals!==session.reveals||next.ended!==session.ended||next.finished!==session.finished;session=next;
  if(changed)updateStats();
  if(missed.length){understanding=markMissed(understanding,session.version,missed,new Date().toISOString());saveUnderstanding();}
}
function saveMissedReview(){persist('missedReview',missedReview);}
function beginReview(ids){if(!ids.length)return;noteBlock(bank.questions.find(q=>q.id===ids[0])?.block??blockId);missedReview={version:bank.version,ids:[...ids],index:0};saveMissedReview();navigate('missed-review');}
function send(event, redraw = true) {
  const attempts=session.attempts.length;
  updateStudy(transition(session, event)); save(); last = performance.now(); if (redraw) render();
  const line=screens.answerAnnouncement(event,attempts,session);
  if(line!==null)$('#answer-status').textContent=line;
}
const mobileNavigation = () => window.matchMedia('(max-width: 760px)').matches;
function resetNavigationView() {
  if (!mobileNavigation()) return;
  if (step === 'study') { positionStudyQuestion(); return; }
  const target = main.querySelector('#flash-card, #review-stem, h1') || main;
  target.focus({preventScroll:true});
  window.scrollTo({top:0,behavior:'instant'});
}
function mountNavigationBar() {
  const action = main.querySelector('#units-next, #mode-next, #practice-confirm, #review-next');
  const bar = main.querySelector('.question-actions') || action?.closest('.actions');
  bar?.setAttribute('role','group');
  bar?.setAttribute('aria-label','Screen navigation');
}
// Wide screens: centre the sheet (first) through its navigation row (last) under the sticky bars. Phones and short
// windows use resetNavigationView and positionQuestion instead.
// instant: no smooth scroll (entering a quiz replaces the whole screen, so there is nothing to follow).
function centreSheet(first, last, {cover = headerHeight(), instant = false} = {}) {
  if (window.matchMedia('(max-width: 760px), (max-height: 500px)').matches) return;
  const a = main.querySelector(first), b = main.querySelector(last) || a; if (!a) return;
  const top = screens.centredScroll({top:a.getBoundingClientRect().top, bottom:b.getBoundingClientRect().bottom, scrollY:window.scrollY, coverTop:cover, viewHeight:window.innerHeight, maxScroll:document.documentElement.scrollHeight-window.innerHeight});
  window.scrollTo({top, behavior:instant||window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}
// Programmatic focus target: a heading takes tabindex=-1 so screen readers hear the screen or entry name.
function focusHeading(h) { if (!h) return false; h.tabIndex = -1; h.focus({preventScroll:true}); return true; }
function navigate(next) { step = next; render(); if (!focusHeading(main.querySelector('h1'))) main.focus({preventScroll:true}); resetNavigationView(); }
const available = (selectedMode=mode) => eligible(questionsForMode(bank.questions,selectedMode), units, filter, blockId);
// Dialogs use the panel head (mono label over the title) and one action row: Close joins the body's last .actions row.
function showDialog(title, body, bind = () => {}, {label = '', closeFirst = false, tone = ''} = {}) {
  modalWasRunning = modalWasRunning || step === 'study' && session && !session.paused;
  if (modalWasRunning) send({type:'pause'}, false);
  dialog.dataset.tone = tone;
  dialog.innerHTML = `<div class="step-head dialog-head">${label ? `<span class="num">${escape(label)}</span>` : ''}<h2 id="dialog-title">${escape(title)}</h2></div>${body}`;
  const last = dialog.lastElementChild, row = last?.classList.contains('actions') ? last : dialog.appendChild(Object.assign(document.createElement('div'), {className:'actions'}));
  // closeFirst: Close at the left and the action at the right (the exam submit check).
  row.insertAdjacentHTML(closeFirst ? 'afterbegin' : 'beforeend', '<button id="close-dialog" class="dialog-close">Close</button>');
  $('#close-dialog').onclick = () => dialog.close(); bind();
  // A content swap in an open dialog (Diagnostics -> Edit) moves focus to its first field; a fresh dialog lets showModal choose.
  if (!dialog.open) dialog.showModal(); else (dialog.querySelector('input,textarea,select') || $('#close-dialog')).focus();
}
// In-app confirmation (replaces the browser confirm box): one red action, then Close.
// Focus starts on Close, never on the red action: one stray Enter must not delete anything.
function confirmDialog(title, text, action, run, label = '') {
  showDialog(title, `<p>${text}</p><div class="actions"><button class="danger fill" id="confirm-action">${escape(action)}</button></div>`, () => { $('#confirm-action').onclick = () => { dialog.close(); run(); }; }, {label});
  $('#close-dialog').focus();
}
dialog.addEventListener('close', () => { if (modalWasRunning && step === 'study' && !session.ended) send({type:'resume'}); modalWasRunning = false; });
const flagKey = id => `${session?.version || bank.version}/${id}`;
const isFlagged = id => Boolean(flags[flagKey(id)]);
const syncFlagButtons = id => main.querySelectorAll('[data-flag-question]').forEach(b => { if (b.dataset.flagQuestion === id) b.setAttribute('aria-pressed', String(isFlagged(id))); });
function flagQuestion(q) {
  const key = flagKey(q.id), old = flags[key] || {};
  const done = entry => { if (writeFlags(key, entry)) { syncFlagButtons(q.id); dialog.close(); } };
  showDialog('Flag Question', screens.questionFlagHtml(q, old, Boolean(flags[key])), () => {
    $('#save-flag').onclick = () => {
      const selected = [...dialog.querySelectorAll('[name=answer-flag]:checked')].map(e => e.value), questionFlag = $('#question-flag').checked, note = $('#flag-note').value;
      done(!selected.length && !questionFlag && !note.trim() ? null : reviewFlag({version:session?.version || bank.version,question:q,answerIds:selected,questionFlag,note}));
    };
    if ($('#clear-flag')) $('#clear-flag').onclick = () => done(null);
  }, {label:q.id});
}
const syncCardFlag = key => $('#flag-card')?.setAttribute('aria-pressed', String(Boolean(flags[key])));
function flagCard(q, context) {
  const key = `${bank.version}/${q.id}/card`, old = flags[key] || {};
  showDialog('Flag Card', screens.cardFlagHtml(context, old, Boolean(flags[key])), () => {
    $('#save-flag').onclick = () => {
      const checked = $('#card-flag').checked, note = $('#flag-note').value;
      if (writeFlags(key, cardFlag({version:bank.version,question:q,note,cardFlag:checked,card:context}))) { syncCardFlag(key); dialog.close(); }
    };
    if ($('#clear-flag')) $('#clear-flag').onclick = () => { if (writeFlags(key, null)) { syncCardFlag(key); dialog.close(); } };
  }, {label:`Card · ${q.id}`});
}
// A failed flag write keeps the dialog open with the error and the saved notes unchanged.
function writeFlags(key, entry) {
  const result = updateFlags(store, flags, key, entry);
  flags = result.flags;
  if (result.error) notice(result.error);
  if ($('#flag-error')) $('#flag-error').textContent = result.error || '';
  return !result.error;
}
function download(text, filename) { const url = URL.createObjectURL(new Blob([text],{type:'application/json'})); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); }
function diagnostics() {
  let deviceId=read('device');
  if(typeof deviceId!=='string'||!/^[a-f0-9-]{36}$/.test(deviceId)){deviceId=crypto.randomUUID();persist('device',deviceId);}
  const ua=navigator.userAgent;
  const platform=/Android/i.test(ua)?'Android':/iPhone|iPad/i.test(ua)?'iOS':/Windows/i.test(ua)?'Windows':/Mac/i.test(ua)?'macOS':'Linux or other';
  const browser=/Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'Other';
  return diagnosticReport({deviceId,platform,browser,version:bank.version,flags,session});
}
$('#help').onclick = () => showDialog('How to use', screens.helpHtml());
$('#reviews').onclick = () => {
  if (!bank) { notice('Diagnostics needs the study content. Reload the page.'); return; }
  const n = Object.keys(flags).length;
  showDialog('Diagnostics', screens.diagnosticsHtml(flags, bank), () => {
    $('#download-flags').onclick=()=>download(JSON.stringify(diagnostics(),null,2),'icf-diagnostics.json');
    $('#copy-flags').onclick=async()=>{try{await navigator.clipboard.writeText(JSON.stringify(diagnostics(),null,2));$('#copy-status').textContent='Copied.';}catch{$('#copy-status').textContent='Copy is unavailable. Use Download.';}};
    dialog.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{
      const f=flags[b.dataset.edit],q=bank.questions.find(q=>q.id===f.questionId);
      if(q&&f.version===bank.version) { if(f.target==='card')flagCard(q,f.card);else flagQuestion(q); }
      else showDialog('Saved diagnostic note',screens.oldNoteHtml(f),()=>{$('#clear-old-note').onclick=()=>{if(writeFlags(b.dataset.edit,null))dialog.close();};},{label:f.questionId});
    });
  }, {label:`${n} saved ${n===1?'note':'notes'}`});
};
// Settings live in the gear menu: the pin switch saves when toggled; Delete Local Data asks first.
$('#settings-pin-question').checked=pinQuestion;
$('#settings-pin-question').onchange=event=>{pinQuestion=event.target.checked;document.documentElement.dataset.pinQuestion=String(pinQuestion);persist('pinQuestion',pinQuestion);};
$('#reset').onclick = () => { tools.close(); confirmDialog('Delete local data', 'Deletes your nickname, sessions, exams and exam history, scores, settings, saved card sets and review notes on this device. Export notes first: Diagnostics, then Download.', 'Delete', resetLocalData, 'This device'); };
// Delete Local Data: clear storage, then return every saved setting and record to its fresh-device value.
function resetLocalData() {
  // A failed clear stops here: the data is still on the device, so the app must not look reset.
  const failed = store.clear(); if (failed) { notice(failed); return; }
  theme=window.icfTheme.defaultChoice;window.icfTheme.set(theme);syncThemeSwitch();
  pinQuestion=true;document.documentElement.dataset.pinQuestion='true';$('#settings-pin-question').checked=true;
  profile={nickname:'',visited:false};flags={};session=null;understanding={};stats=restoreStats(null);poolKind='random';missedReview=null;modalWasRunning=false;
  cardSets=restoreCardSets();flashPreview=null;flashSetId=null;flashMessage='';dynamicCards=true;pickSetId=null;pendingCard=null;glossReturn=null;glossEntry=null;glossQuery='';glossUnit=0;closeTermPop();scholarState=null;scholarPending=null;scholarReturn=null;lastPlace=null;scholarDraft.clear();scholarOpenFor=null;
  exam=null;examHistory=[];examCycles={schema:1,blocks:{}};lastBlock=null;examFilter='missed';resultsKind='study';
  navigate('welcome');
}
$('#home').onclick = e => { e.preventDefault(); tools.close(); if(examLive(exam)){if(step!=='exam')navigate('exam');return;} pauseStudy(); navigate('welcome'); };
function bindUnitChoices(name, onChange) {
  const all = main.querySelector('[data-all-units]');
  const choices = [...main.querySelectorAll(`[name="${name}"]`)];
  const update = () => {
    units = choices.filter(input => input.checked).map(input => Number(input.value));
    all.checked = units.length === allUnits().length;
    all.indeterminate = units.length > 0 && !all.checked;
    onChange();
  };
  all.onchange = () => { choices.forEach(input => { input.checked = all.checked; }); update(); };
  choices.forEach(input => { input.onchange = update; });
  update();
}
function chooseBlock(id, next = 'units') {
  blockId = id;
  units = allUnits();
  if (next === 'not-understood-setup') quizScope = 'all';
  navigate(next);
}
// Nav bar: Blocks · Mode · Study · Results. Unavailable items stay visible and disabled. Study is one link for Questions,
// Cards and Glossary: it opens the one used last. A lit item on a sub-screen (a setup, Saved card sets, Previous
// Attempts) opens its section's main screen; only on the main screen itself does a tap do nothing.
const SCREEN_OF={blocks:'blocks','saved-card-sets':'blocks',units:'units','not-understood-setup':'units',mode:'units','cards-setup':'units','exam-setup':'units',exam:'units',scholar:'units',glossary:'study',study:'study','flash-card':'study','missed-review':'results',results:'results','exam-results':'results','previous-attempts':'results'};
// Saved card sets belongs to the section it was opened from (Blocks, or Mode through the Cards setup).
const sectionOf = at => at === 'saved-card-sets' ? (setsReturn === 'units' ? 'units' : 'blocks') : SCREEN_OF[at];
const MAIN_SCREEN = {blocks:['blocks'], units:['units'], results:['results','exam-results']};
const studyTarget=()=>{const ok={study:sessionOpen(),'flash-card':Boolean(flashPreview),glossary:Boolean(glossary&&blockId)};if(lastStudy&&ok[lastStudy])return lastStudy;return ['study','flash-card','glossary'].find(k=>ok[k])||null;};
function screenAvailable(id) {
  if (id === 'study') return Boolean(studyTarget());
  if (id === 'results') return sessionDone() || Boolean(exam?.submitted);
  return true;
}
function syncScreens() {
  // A live exam hides the screen links (the theme switch stays) and locks the home link: no way out but Submit.
  document.documentElement.dataset.exam = examLive(exam) ? 'live' : '';
  document.querySelectorAll('[data-screen-link]').forEach(link => {
    const id = link.dataset.screenLink, here = sectionOf(step) === id, open = screenAvailable(id);
    if (here) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
    link.setAttribute('aria-disabled',String(!open));link.title=open?'':({study:'Choose Questions, Cards or Glossary in Mode',results:'No finished session'})[id]||'';
  });
  // Context button: Resume Quiz / Resume Scholar, whichever was left last.
  const ctx=$('#context-link');if(!ctx)return;
  const to=contextTarget({quiz:sessionOpen(),scholar:Boolean(scholar&&scholarState),last:lastPlace,here:step==='study'?'quiz':step==='scholar'?'scholar':null});
  ctx.hidden=!to;ctx.dataset.context=to||'';if(to==='scholar')ctx.dataset.tone='scholar';else delete ctx.dataset.tone;
  ctx.innerHTML=to==='quiz'?`<span class="ctx-arrow">${ICON.swap}</span>`+'<span class="ctx-long">Resume </span>Quiz':to==='scholar'?`<span class="ctx-arrow">${ICON.swap}</span>`+'<span class="ctx-long">Resume </span>Scholar':'';
  ctx.setAttribute('aria-label',to==='quiz'?'Resume Quiz':to==='scholar'?'Resume Scholar':'');
}
$('#context-link')?.addEventListener('click',()=>{
  const to=$('#context-link').dataset.context;if(!bank||!to||examLive(exam))return;tools.close();
  if(to==='quiz'&&sessionOpen()){resumeStudy();positionStudyQuestion();return;}
  if(to==='scholar'&&scholarState)openScholar(null,scholarReturn,scholarState.block,pauseStudy);  // loads the place's block file first
});
document.querySelectorAll('[data-screen-link]').forEach(link => link.addEventListener('click', () => {
  const id = link.dataset.screenLink;
  if (!bank || !screenAvailable(id) || MAIN_SCREEN[id]?.includes(step) || examLive(exam)) return;
  if (id === 'study') { const to = studyTarget(); if (!to || step === to) return; tools.close(); pauseStudy();
    if (to === 'study') { resumeStudy(); positionStudyQuestion(); } else navigate(to); return; }
  tools.close();
  pauseStudy();
  if (id === 'results' && (exam?.submitted && (resultsKind === 'exam' || !sessionDone()))) { if (step !== 'exam-results') navigate('exam-results'); return; }
  if (!blockId) blockId = bank.blocks[0].id;
  navigate(id);
}));
// Phones: the screen row (Blocks, Mode, Study, Results) is the header's
// second row and is always visible. Any scroll down slides the first row (logo, theme, settings) away. Only an
// intentional scroll up brings it back: 48 px or more of upward scroll that follows a finger dragging down, a wheel
// turned up or an up scroll key, within 1 s. A tap, the app's own scrolls (Next, Back), layout jumps and the bounce at
// the bottom of the page are not intent. The first row also shows at the top of the page, with the gear menu or a term
// sheet open, and during a live exam (the clock bar must stay in view). Sticky offsets read --header-cover (styles.css).
const TOP_REVEAL = 48, INTENT_MS = 1000;
let lastScrollY = 0, upRun = 0, intentUpAt = 0, touchY = null;
const phoneBars = () => window.matchMedia('(max-width: 640px)').matches;
const intent = up => { intentUpAt = up ? Date.now() : 0; if (!up) upRun = 0; };
window.addEventListener('touchstart', e => { touchY = e.touches[0]?.clientY ?? null; }, {passive:true});
window.addEventListener('touchmove', e => { const y = e.touches[0]?.clientY; if (touchY === null || y === undefined) return; if (Math.abs(y - touchY) >= 2) { intent(y > touchY); touchY = y; } }, {passive:true});
window.addEventListener('wheel', e => { if (e.deltaY) intent(e.deltaY < 0); }, {passive:true});
window.addEventListener('keydown', e => { if (e.target.closest?.('input, textarea, select, button, [contenteditable]')) return;
  if (['ArrowUp','PageUp','Home'].includes(e.key) || e.key === ' ' && e.shiftKey) intent(true); else if (['ArrowDown','PageDown','End',' '].includes(e.key)) intent(false); });
const topRow = () => { const s = $('header .screens'); return s && phoneBars() ? Math.max(0, Math.round(s.offsetTop + s.clientTop)) : 0; }; // the row's top rule slides away too
const updateTopRow = () => document.documentElement.style.setProperty('--top-row', `${topRow()}px`);
const navOnly = on => { if (on) updateTopRow(); $('header').classList.toggle('nav-only', on); };
const keepTopBar = () => !phoneBars() || tools.isOpen() || termPop || examLive(exam);
updateTopRow(); window.addEventListener('resize', () => { updateTopRow(); if (!phoneBars()) navOnly(false); });
window.addEventListener('scroll', () => {
  const y = window.scrollY;
  // At the top the first row shows: below its height a hidden first row would leave a gap over the page.
  if (keepTopBar() || y <= topRow()) { navOnly(false); lastScrollY = y; upRun = 0; return; }
  const dy = y - lastScrollY;
  if (Math.abs(dy) < 4) return;
  lastScrollY = y;
  if (dy > 0) { navOnly(true); upRun = 0; return; }
  if (Date.now() - intentUpAt > INTENT_MS) { upRun = 0; return; }
  upRun -= dy;
  if (upRun >= TOP_REVEAL) navOnly(false);
}, {passive:true});
// The header height that covers the page: the screen row alone once the first row has slid away.
const headerHeight = () => $('header').getBoundingClientRect().height - ($('header').classList.contains('nav-only') ? topRow() : 0);
function renderBlocks() {
  main.innerHTML = screens.blocksHtml({bank, nickname:profile.nickname, open:sessionOpen(), understanding, missedReview, stats, examBlock:exam?.submitted ? exam.block : null, current:lastBlock});
  main.querySelectorAll('[data-block]').forEach(button => button.onclick = () => chooseBlock(Number(button.dataset.block)));
  // One open block at a time: opening a block closes the others, also where a browser
  // ignores details name=; For Review then shows the open block only, or stays empty when no block is open.
  const cards = [...main.querySelectorAll('details.block-card')];
  cards.forEach(card => card.addEventListener('toggle', () => {
    if (card.open) cards.forEach(other => { if (other !== card && other.open) other.open = false; });
    const openCard = cards.find(c => c.open), id = openCard ? Number(openCard.querySelector('[data-block]').dataset.block) : null;
    const box = main.querySelector('.for-review');
    if (!box || (box.dataset.reviewFor ?? '') === String(id ?? '')) return;
    box.outerHTML = screens.forReviewHtml({bank, block:id, understanding, stats, examBlock:exam?.submitted ? exam.block : null});
    bindForReview();
  }));
  bindForReview();
  if ($('#resume')) $('#resume').onclick = resumeStudy;
}
// The For Review buttons; every one acts on the block the box shows.
function bindForReview() {
  const box = main.querySelector('.for-review'); if (!box) return;
  const shown = Number(box.dataset.reviewFor);
  if ($('#exam-results-link')) $('#exam-results-link').onclick = () => navigate('exam-results');
  // Marked for review: Review opens the one-by-one review at once (as on Results) and continues a started one;
  // Practice quiz is the marked-question test, with its unit choice (every unit selected first).
  box.querySelectorAll('[data-review-block]').forEach(button => button.onclick = () => {
    const id = Number(button.dataset.reviewBlock), marked = notUnderstoodQuestions(bank, understanding, null, id).map(q => q.id);
    blockId = id; units = allUnits();
    const open = missedReview && missedReview.ids.every(x => bank.questions.find(q => q.id === x)?.block === id) && missedReview.ids.some(x => marked.includes(x));
    if (open) navigate('missed-review'); else beginReview(marked);
  });
  box.querySelectorAll('[data-practice-units]').forEach(button => button.onclick = () => {
    blockId = Number(button.dataset.practiceUnits); quizScope = 'units'; units = allUnits(); navigate('not-understood-setup');
  });
  if ($('#saved-results')) $('#saved-results').onclick = () => { attemptsBlock = shown; navigate('previous-attempts'); };
}
// Per-unit counts for the setup list: questions of the chosen help level (Assisted and Unassisted share the Standard pool;
// Hard has its own), or the flash cards the Standard questions supply.
function unitCounts(cards, selectedMode = 'Unassisted') {
  const pool = questionsForMode(bank.questions, cards ? 'Unassisted' : selectedMode), measure = list => cards ? previewCards(list).length : list.length;
  const all = measure(eligible(pool, allUnits(), filter, blockId));
  return {all:`${all} ${cards?'cards':'questions'}`,units:Object.fromEntries(allUnits().map(id=>[id,measure(eligible(pool,[id],filter,blockId))]))};
}
// Answer tools drop-downs (Key terms, Source): one listener for every screen. An open panel stays open while the same
// screen and question re-render (a loaded excerpt, a saved card, a review filter), keyed by question and kind.
const openDrops = new Set(); let dropScope = '';
const dropKey = toggle => { const f = toggle.closest('.source-row')?.querySelector('[data-flag-question],[data-flag-card]'); return `${f?.dataset.flagQuestion || f?.dataset.flagCard || main.dataset.question || ''}:${toggle.dataset.drop}`; };
const setDrop = (toggle, open) => { toggle.setAttribute('aria-expanded', String(open)); toggle.nextElementSibling.hidden = !open; };
document.addEventListener('click', e => {
  const toggle = e.target.closest?.('[data-drop]'); if (!toggle || !main.contains(toggle)) return;
  const open = toggle.getAttribute('aria-expanded') !== 'true', key = dropKey(toggle);
  setDrop(toggle, open); if (open) openDrops.add(key); else openDrops.delete(key);
});
function render() {if(['study','flash-card','glossary'].includes(step))lastStudy=step;if(step!=='scholar')scholarOpenFor=null;if(step==='study')lastPlace='quiz';else if(step==='scholar')lastPlace='scholar';
  if (!bank) return;
  syncScreens();
  const oldScreen=main.dataset.screen;
  main.dataset.screen=step;
  const savedScroll = window.scrollY;
  const focusId = document.activeElement?.id, focusAnswer = document.activeElement?.dataset?.answer;
  const focusDrop = document.activeElement?.dataset?.drop && main.contains(document.activeElement) ? dropKey(document.activeElement) : null;
  const visibleAnswers=[...main.querySelectorAll('[data-answer]')];
  const anchor=visibleAnswers.find(tile=>tile.dataset.answer===focusAnswer)||visibleAnswers.find(tile=>{const rect=tile.getBoundingClientRect();return rect.bottom>Math.max(100,main.querySelector('.question-focus')?.getBoundingClientRect().bottom||0)&&rect.top<window.innerHeight;});
  const anchorId=anchor?.dataset.answer, anchorTop=anchor?.getBoundingClientRect().top;
  const shown = step === 'study' && session ? viewed() : null;
  const oldAppearance = main.dataset.appearance, appearance = shown ? String(shown.appearance) : '';
  const oldQuestion = main.dataset.question, nextQuestion = shown?.id || null;
  main.dataset.question = nextQuestion || '';
  main.dataset.appearance = appearance;
  if (dropScope !== `${step}:${appearance}`) { openDrops.clear(); dropScope = `${step}:${appearance}`; }
  if (step === 'welcome') {
    main.innerHTML = screens.welcomeHtml({nickname:profile.nickname, open:sessionOpen()});
    const keepName = () => { profile={nickname:$('#nickname').value.trim(),visited:true}; persist('profile',profile); };
    $('#welcome').onsubmit = e => { e.preventDefault(); keepName(); navigate('blocks'); };
    if ($('#welcome-resume')) $('#welcome-resume').onclick = () => { keepName(); resumeStudy(); };
  } else if (step === 'blocks') {
    renderBlocks();
  } else if (step === 'units') renderHub();
  else if (step === 'cards-setup') renderCardsSetup();
  else if (step === 'exam-setup') renderExamSetup();
  else if (step === 'glossary') renderGlossary();
  else if (step === 'scholar') renderScholar();
  else if (step === 'mode') renderMode();
  else if (step === 'not-understood-setup') renderNotUnderstoodSetup();
  else if (step === 'missed-review') renderMissedReview();
  else if (step === 'study') renderStudy();
  else if (step === 'exam') renderExam();
  else if (step === 'exam-results') renderExamResults();
  else if (step === 'flash-card') renderFlashCards();
  else if (step === 'saved-card-sets') renderSavedCardSets();
  else if (step === 'results') renderResults();
  else if (step === 'previous-attempts') renderPreviousAttempts();

  mountNavigationBar();
  main.querySelectorAll('[data-drop]').forEach(toggle => { const key = dropKey(toggle); if (openDrops.has(key)) setDrop(toggle, true); if (key === focusDrop) toggle.focus({preventScroll:true}); });
  if (oldQuestion === nextQuestion) {
    const target = focusId ? document.getElementById(focusId) : focusAnswer ? main.querySelector(`[data-answer="${CSS.escape(focusAnswer)}"]`) : null;
    if (target) (target.disabled ? main.querySelector('[data-answer]:not(:disabled)') || $('#stem') : target)?.focus({preventScroll:true});
  }

  // Entering the question screen (Start, Retry, Practice, a Glossary pool, Study resume) places the question as Next and
  // Back do: phones put it under the header, wide screens centre the sheet through Back/Next.
  if (screens.repositionStudy({screen:oldScreen,question:oldQuestion,appearance:oldAppearance},{step,question:nextQuestion,appearance})) {
    positionStudyQuestion();
    if (oldScreen !== 'study') centreSheet('.q-sheet','.question-actions',{instant:true});
  }
  if (nextQuestion && oldQuestion === nextQuestion && oldAppearance === appearance) {const tile=anchorId?main.querySelector(`[data-answer="${CSS.escape(anchorId)}"]`):null;window.scrollTo({top:Math.max(0,savedScroll+(tile&&Number.isFinite(anchorTop)?tile.getBoundingClientRect().top-anchorTop:0)),behavior:'instant'});}
}
function renderSavedCardSets() {
  const catalog = catalogCards();
  main.innerHTML = screens.savedSetsScreenHtml({library:cardSets, catalog, back:setsReturn==='units'?'Flash cards':'Blocks', blocks:bank.blocks, block:setsBlock()});
  bindSetsBlock('sets-block');
  $('#cards-home').onclick = () => navigate(setsReturn === 'units' && blockId ? 'cards-setup' : 'blocks');
  main.querySelectorAll('[data-open-set]').forEach(button => button.onclick = () => {
    const set = cardSets.sets.find(s => s.id === button.dataset.openSet);
    const cards = cardsInSet(set,catalog,setsBlock());
    if (!cards.length) return;
    flashSetId = set.id; flashPreview = startCards(cards); flashMessage = ''; navigate('flash-card');
  });
  main.querySelectorAll('[data-remove-card]').forEach(button => button.onclick = () => {
    const setId = button.dataset.set, index = [...button.closest('details').querySelectorAll('[data-remove-card]')].indexOf(button);
    if (!persistCardSets(removeSavedCard(cardSets,setId,button.dataset.removeCard))) return;
    render();
    // Keep the editor open and focus the next Remove button (or the set's summary).
    const details = [...main.querySelectorAll('[data-open-set]')].find(b => b.dataset.openSet === setId)?.closest('section')?.querySelector('details');
    if (!details) { const open = main.querySelector(`[data-open-set="${CSS.escape(setId)}"]`); if (open && !open.disabled) open.focus(); else focusHeading(main.querySelector('h1')); return; }
    details.open = true;
    const buttons = details.querySelectorAll('[data-remove-card]');
    (buttons[Math.min(index, buttons.length - 1)] || details.querySelector('summary')).focus();
  });
}
function renderFlashCards() {
  const set = cardSets.sets.find(s => s.id === flashSetId);
  const card = flashPreview.cards[flashPreview.index];
  const source = card.kind === 'highlight' ? null : bank.questions.find(q => q.id === card.questionId);
  // Card back (after the first flip): glossary entry, Source row with the card Flag.
  const entry = glossary ? entryForCard(glossary, card) : null, seen = Boolean(card.seenBack);
  const back = seen && (entry || source) ? screens.cardBackHtml({entry, g:glossary, source:source ? sourceExcerpt(source) : '', flagged:Boolean(source && flags[`${bank.version}/${source.id}/card`]), questionId:source?.id || null, save:'<!--save-->'}) : '';
  main.innerHTML = screens.flashScreenHtml({preview:flashPreview, set, bank, saved:manualHas(cardSets,card), missed:inMissed(card), message:flashMessage, source, back, glossEntry:seen && entry ? entry : null, scholar:Boolean(seen && entry && itemForEntry(scholar,entry.block,entry.id))});
  // Open in Glossary (under Back): the Glossary then offers "Card N" back to this card, on the same side.
  if ($('#card-open-gloss')) $('#card-open-gloss').onclick = () => { glossEntry = entry.id; glossReturn = 'flash-card'; navigate('glossary'); };
  if ($('#card-open-scholar')) $('#card-open-scholar').onclick = () => { const it = itemForEntry(scholar,entry.block,entry.id); openScholar(it.id,{to:'flash-card'},it.block,null,it.part); };
  main.querySelectorAll('.card-back .term-link').forEach(b => b.onclick = () => openTermPop(b, {phase:'resolved', block:entry?.block ?? blockId}));
  const move = event => { flashMessage='';flashPreview = moveCards(flashPreview,event); if(event==='flip')flashPreview.cards[flashPreview.index].seenBack=true; render(); if(['next','previous'].includes(event)){resetNavigationView();centreSheet('#flash-card','.question-actions');} };
  $('#flash-exit').onclick = () => navigate(flashSetId ? 'saved-card-sets' : 'cards-setup');
  if (flipIn) { flipIn = false; $('#flash-card').classList?.add('flip-in'); }
  bindSave(card);
  if ($('#flag-card')) $('#flag-card').onclick = () => flagCard(source, screens.cardFlagContext(card));
  $('#flash-card').onclick = () => {
    const el = $('#flash-card'), still = typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still || !el.classList?.contains) { move('flip'); $('#flash-card').focus({preventScroll:true}); return; }
    if (el.classList.contains('flip-out')) return;
    el.classList.add('flip-out');
    setTimeout(() => { flipIn = true; move('flip'); const card = $('#flash-card'); card?.focus({preventScroll:true}); requestAnimationFrame(() => requestAnimationFrame(() => card?.classList.remove('flip-in'))); }, 180);
  };
  $('#flash-hint').onclick = () => { move('hint'); $('#flash-card').focus({preventScroll:true}); };
  $('#flash-previous').onclick = () => { move('previous'); $('#flash-card').focus({preventScroll:true}); };
  $('#flash-next').onclick = () => {
    if (flashPreview.index === flashPreview.cards.length - 1) navigate(flashSetId ? 'saved-card-sets' : 'cards-setup');
    else { move('next'); $('#flash-card').focus({preventScroll:true}); }
  };
}
// Set by a flip click so the next card render starts edge-on and turns into view.
let flipIn = false;
// Phones and short windows put the question under the header, then focus it.
function positionStudyQuestion() {
  // Phones: the first row slides away first, so the question sits under the screen row alone; it returns if the page
  // stays at the top.
  if (!keepTopBar()) navOnly(true);
  const placed = screens.positionQuestion({main, win:window, headerHeight:headerHeight()});
  if (window.scrollY <= topRow()) navOnly(false);
  if (placed) $('#stem')?.focus({preventScroll:true});
}
function countdown() { return assistanceTimer(session?.current,session?.mode); }
// Glossary context for the question on screen (exposure rule in glossary.stemLinks).
function studyGloss(c,q,reviewing){
  if(!glossary)return null;
  const phase=reviewing?'review':sourceVisible(c)?'resolved':c.resolved?'missed':'live';
  const links=stemLinks(glossary,q,{phase});
  if(phase==='live')return {phase,links};
  const terms=keyTerms(glossary,q).map(id=>glossary.byId.get(id)).filter(Boolean);
  return {phase,links,keyTerms:terms};
}
function renderStudy() {
  if(session.finished){step='results';syncScreens();renderResults();return;}
  const reviewing=session.viewIndex!=null,c=viewed(),q=session.questions.find(q=>q.id===c.id),assisted=(c.mode||session.mode)==='Assisted';
  const gloss=studyGloss(c,q,reviewing);
  const box=questionCard(c,q,reviewing);
  main.innerHTML=screens.studyHtml({session, bank, box, library:cardSets, source:sourceExcerpt, isFlagged, gloss});
  if($('#study-mode')?.dataset?.mode)$('#study-mode').onclick=e=>{send({type:'mode',mode:e.currentTarget.dataset.mode});$('#study-mode')?.focus({preventScroll:true});};
  main.querySelectorAll('[data-answer]:not([aria-disabled="true"])').forEach(b=>b.onclick=()=>{if(reviewing)return;const id=b.dataset.answer;
    if(assisted&&c.flippedWrong.includes(id))send({type:'flipWrong',id});else{send({type:'answer',id});if(session.current.resolved)$('#next')?.focus({preventScroll:true});}});
  main.querySelectorAll('.term-link').forEach(b=>b.onclick=()=>openTermPop(b,{phase:gloss?.phase||'live',block:q.block}));
  if($('#hint'))$('#hint').onclick=()=>{send({type:'hint'});$('#stem')?.focus({preventScroll:true});};
  if($('#show-answer'))$('#show-answer').onclick=()=>{send({type:'reveal'});$('#next')?.focus({preventScroll:true});};
  if($('#flag-question'))$('#flag-question').onclick=()=>flagQuestion(q);
  if($('#save-question')&&box)bindSave(box.card);
  $('#previous').onclick=()=>{send({type:'previous'});$('#stem')?.focus({preventScroll:true});resetNavigationView();centreSheet('.q-sheet','.question-actions');};
  $('#next').onclick=()=>{send({type:'next'});$('#stem')?.focus({preventScroll:true});resetNavigationView();centreSheet('.q-sheet','.question-actions');};
  // End Session goes straight to results (Retry there restarts the same questions).
  $('#end').onclick=()=>{send({type:'end'},false);navigate('results');};
}
// The appearance on screen: a history entry while reviewing, otherwise the live one.
const viewed=()=>screens.viewedAppearance(session);
// An open session can resume; a done one (ended or finished) has results.
function sessionOpen(){return Boolean(session&&!session.ended&&!session.finished);}
function sessionDone(){return Boolean(session&&(session.ended||session.finished));}
function pauseStudy(){if(step==='study'&&sessionOpen()&&!session.paused)send({type:'pause'},false);}
function resumeStudy(){step='study';send({type:'resume'});main.focus({preventScroll:true});}
// Scholar order and sort rows: before an answer, every row of a list already has the tallest answered row height, on every
// width, so a reveal moves nothing. Answer tiles hold by CSS (answersHtml, .answers:has(.back)).
const scholarHold=new Map();
const probeAt=(width,cls,html)=>{const probe=document.createElement('div');probe.className=cls;probe.setAttribute('aria-hidden','true');probe.inert=true;
  Object.assign(probe.style,{position:'absolute',left:'0',top:'0',width:`${width}px`,visibility:'hidden',pointerEvents:'none'});
  probe.innerHTML=html;probe.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));probe.querySelectorAll('input[name]').forEach(el=>el.removeAttribute('name'));return probe;};
const measure=(probe,read)=>{main.append(probe);try{return read(probe);}finally{probe.remove();}};
function holdScholarHeights(item,qn){
  if(!qn)return;
  const list=main.querySelector('.scholar-rows');if(!list)return;
  const width=list.getBoundingClientRect().width,key=`rows|${qn.id}@${qn.v}|${width}|${document.documentElement.dataset.theme}`;
  if(!scholarHold.has(key))scholarHold.set(key,measure(probeAt(width,'scholar-q',screens.scholarRowProbes(item,qn).join('')),
    p=>Math.max(0,...[...p.querySelectorAll('.scholar-rows > li')].map(li=>{li.style.minHeight='0';return Math.ceil(li.getBoundingClientRect().height);}))));
  for(const li of list.children)li.style.setProperty('--row-hold',`${scholarHold.get(key)}px`);
}
function updateTrack() {
  const c=session?.current;if(!c||!$('#track-fill'))return;
  $('#track-fill').style.width=`${Math.min(100,c.assistedMs/500)}%`;$('#clock').textContent=screens.duration(c.assistedMs);
  main.querySelectorAll('.marks span').forEach((mark,i)=>mark.classList.toggle('hit',c.assistedMs>=screens.TRACK_MARKS[i][0]));
  if($('#countdown'))$('#countdown').textContent=countdown();
}
// Retry: the same questions in a new order (a different order whenever more than one question exists).
function retrySession() {
  const before=session.questions.map(q=>q.id).join();let order=shuffle(session.questions);
  for(let i=0;i<5&&order.length>1&&order.map(q=>q.id).join()===before;i++)order=shuffle(session.questions);
  startSession(order,{version:session.version,mode:session.nextMode||session.mode,kind:session.kind},session.poolKind||'random');
}
function renderResults() {
  main.dataset.screen='results';
  const toReview=reviewIds(session,understanding);
  // Quiz review SAVE: the question screen's button, writing to Manual only (Missed is a separate set). Open compact rows
  // stay open across the re-render a press causes.
  const cardOf=q=>cardForQuestion(catalogCards(),q.id),save=q=>{const card=cardOf(q);return card?saveButton({key:cardKey(card),saved:manualHas(cardSets,card)}):'';};
  const openKey=id=>`${session.id}:${id}`;
  main.innerHTML=screens.resultsHtml({session, bank, blockId, stats, understanding, source:sourceExcerpt, isFlagged, gloss:reviewGloss(), save, isOpen:id=>reviewOpen.has(openKey(id))});
  main.querySelectorAll('[data-review-item]').forEach(item=>item.addEventListener('toggle',()=>{const k=openKey(item.dataset.reviewItem);if(item.open)reviewOpen.add(k);else reviewOpen.delete(k);}));
  main.querySelectorAll('.answer-review .review-item').forEach(item=>{const button=item.querySelector('[data-save-card]');if(!button)return;
    const card=catalogCards().find(c=>cardKey(c)===button.dataset.saveCard);if(card)bindSave(card,item);});
  main.querySelectorAll('.answer-review .term-link').forEach(b=>b.onclick=()=>openTermPop(b,{phase:'review',block:session.questions.find(q=>q.id===b.closest('[data-review-item]')?.dataset.reviewItem)?.block??blockId}));
  if($('#review-missed'))$('#review-missed').onclick=()=>beginReview(toReview);
  $('#retry-session').onclick=()=>{retrySession();navigate('study');};
  $('#again').onclick=()=>navigate('blocks');main.querySelectorAll('[data-flag-question]').forEach(b=>b.onclick=()=>flagQuestion(session.questions.find(q=>q.id===b.dataset.flagQuestion)));
}
function renderPreviousAttempts(){
  const sessionBlock=session?.questions?.[0]?.block??null;
  main.innerHTML=screens.previousAttemptsHtml({bank, stats, hasResults:sessionDone()&&(attemptsBlock===null||sessionBlock===attemptsBlock), history:examHistory, block:attemptsBlock});
  $('#attempts-back').onclick=()=>navigate('blocks');if($('#last-results'))$('#last-results').onclick=()=>navigate('results');
}
function renderMissedReview(){
  main.dataset.screen='missed-review';
  if(!missedReview){navigate('blocks');return;}
  const q=bank.questions.find(q=>q.id===missedReview.ids[missedReview.index]);
  const card=cardForQuestion(catalogCards(),q.id),g=reviewGloss();
  main.innerHTML=screens.missedReviewHtml({bank, review:missedReview, understanding, source:sourceExcerpt, isFlagged,
    save:card?saveButton({id:'review-save',key:cardKey(card),saved:manualHas(cardSets,card)}):'', terms:g?g.terms(q):''});
  if(card)bindSave(card);
  main.querySelectorAll('.review-sheet .term-link').forEach(b=>b.onclick=()=>openTermPop(b,{phase:'review',block:q.block}));
  $('#leave-review').onclick=()=>navigate('blocks');
  main.querySelectorAll('[name=understood]').forEach(input=>input.onchange=()=>{understanding=assessUnderstanding(understanding,bank.version,q.id,input.value==='yes',new Date().toISOString());saveUnderstanding();$('#review-next').disabled=false;});
  $('#review-previous').onclick=()=>{missedReview.index--;saveMissedReview();render();$('#review-stem').focus({preventScroll:true});resetNavigationView();centreSheet('.review-sheet','.review-actions');};
  $('#review-next').onclick=()=>{if(!understandingRecord(understanding,bank.version,q.id)?.decision)return;if(missedReview.index+1===missedReview.ids.length){missedReview=null;saveMissedReview();navigate('blocks');}else{missedReview.index++;saveMissedReview();render();$('#review-stem').focus({preventScroll:true});resetNavigationView();centreSheet('.review-sheet','.review-actions');}};
  $('#review-flag').onclick=()=>flagQuestion(q);
}
// Mode screen: help level, question pool (Random / Smart) and size, Dynamic Flash Cards,
// and the separate Exam entry. Exam ignores the Setup units and pool size: it always samples the whole block.
function renderMode() {
  // An empty selection the user made survives a Random/Smart redraw.
  if (!units.length && !keepEmptyUnits) units = allUnits();
  keepEmptyUnits = false;
  const count=()=>available().length;
  main.innerHTML=screens.questionsSetupHtml({block:currentBlock(), mode, units, replacing:sessionOpen(), counts:unitCounts(false,mode), dynamic:dynamicCards, pool:{kind:poolKind, size:poolSize, n:count(), empty:!units.length?screens.NO_UNITS:mode==='Hard'?'':poolShortfall(count(),poolSize)}});
  const update=()=>{
    const n=count();
    // The unit counts follow the help level (Hard counts Hard questions).
    const c=unitCounts(false,mode);main.querySelectorAll('.unit-panel [data-count]').forEach(e=>{e.textContent=e.dataset.count==='all'?c.all:String(c.units[e.dataset.count]??0);});
    $('#mode-next').disabled=!n;
    $('#mode-availability').textContent=screens.modeAvailability({mode,count:n,poolSize,hardPending:bank.hardMode?.status==='pending_review'});
    // one warning, always under the size toggle (no longer also under the units).
    syncPool($('#pool-size'),'pool-size',poolSize,n,size=>{poolSize=size;update();},!units.length?screens.NO_UNITS:mode==='Hard'?'':poolShortfall(n,poolSize));
  };
  bindUnitChoices('unit',update);
  // Hard: the Study button takes the gold tone.
  main.querySelectorAll('[name=mode]').forEach(e=>e.onchange=()=>{mode=e.value;if(mode==='Hard')$('#mode-next').dataset.tone='gold';else delete $('#mode-next').dataset.tone;update();});
  bindPoolKind();bindDynamic();
  $('#mode-next').onclick=()=>{const pool=selectQuestions(available(),poolSize,poolKind);if(!pool.length)return;startSession(pool,{version:bank.version,mode},poolKind);navigate('study');};
  $('#back').onclick=()=>navigate('units');
}
// Study hub: Questions, Cards, Glossary, and the separate Take exam.
function renderHub() {
  main.innerHTML=screens.studyHubHtml({block:currentBlock(),scholar:unitsOf(scholar,blockId).length>0,scholarDone:blockLoaded(scholar,blockId)?progressOf(scholar,scholarState,blockId).all:null});
  const go={questions:'mode',cards:'cards-setup',glossary:'glossary'};
  main.querySelectorAll('[data-study]').forEach(b=>b.onclick=()=>{if(b.dataset.study==='glossary'){glossEntry=null;glossReturn=null;}navigate(go[b.dataset.study]);});
  if(!glossary)main.querySelector('[data-study="glossary"]')?.setAttribute('disabled','');
  $('#exam-open').onclick=()=>navigate('exam-setup');
  if($('#scholar-open'))$('#scholar-open').onclick=()=>openScholar(null,null,blockId,null,null,true);  // Open Scholar shows the term list, never the last term
}
function renderCardsSetup() {
  const pick = cardSets.sets.find(set => set.id === pickSetId) || null;
  // A set with no cards in the chosen block cannot stay picked (its radio is disabled).
  if (!pick || !cardsInSet(pick,catalogCards(),setsBlock()).length) pickSetId = null;
  if (pickSetId) units = []; else if (!units.length) units = allUnits();
  main.innerHTML = screens.cardsSetupHtml({block:currentBlock(), blocks:bank.blocks, library:cardSets, pickSetId, catalog:catalogCards(), units, counts:unitCounts(true), setsBlock:setsBlock()});
  bindSetsBlock('setup-sets-block');
  const cardPool = () => pickSetId ? cardsInSet(cardSets.sets.find(set => set.id === pickSetId),catalogCards(),setsBlock()) : previewCards(available('Unassisted'));
  const count = () => {
    if (units.length && pickSetId) { pickSetId = null; main.querySelectorAll('[name="card-set"]').forEach(r => { r.checked = false; }); }
    const n = cardPool().length;
    $('#eligible-count').textContent = screens.cardCountText({pickName: pickSetId && cardSets.sets.find(set => set.id === pickSetId).name, n});
    $('#eligible-count').classList.toggle('warn',!n); $('#units-next').disabled = !n;
  };
  bindUnitChoices('unit',count);
  main.querySelectorAll('[name="card-set"]').forEach(r => r.onchange = () => { pickSetId = r.value; units = []; render(); main.querySelector(`[name="card-set"][value="${CSS.escape(pickSetId)}"]`)?.focus(); });
  $('#manage-sets').onclick = () => { setsReturn = 'units'; navigate('saved-card-sets'); };
  $('#units-next').onclick = () => { const pool = cardPool(); if (!pool.length) return; flashSetId = pickSetId; flashPreview = startCards(pool); flashMessage = ''; noteBlock(blockId); navigate('flash-card'); };
  $('#back').onclick = () => navigate('units');
}
function renderExamSetup() {
  // Exam questions are their own set, drawn by form when the bank has forms, otherwise the Standard draw.
  main.innerHTML=screens.examSetupScreenHtml({blockId, examSetup:examSetupMarkup()});
  const next=formStatus(examCycles,formsFor(bank,blockId),blockId).next,enough=next||standardPool(bank.questions,blockId).length>=EXAM.size;
  $('#mode-next').disabled=!enough;$('#mode-availability').textContent=enough?'':'Not enough questions for an exam.';
  $('#back').onclick=()=>{navigate('units');main.querySelector('#exam-open')?.focus({preventScroll:true});};
  $('#mode-next').onclick=beginExam;
}
// ---- Scholar ----
// Open Scholar for the current block: at an item (from the Glossary or a card) or at the saved place of this block, else
// at the first unit's term list. ret: the way back ({to:'glossary', entry} | {to:'flash-card'}) or none (from Mode).
// A block's Scholar file: fetched once, when that block's Scholar opens. true when loaded.
const scholarLoads={};let scholarPending=null;  // a saved place whose block file is not here yet (still loading, or it failed at an offline start)
function loadScholarBlock(b){
  if(!scholar)return Promise.resolve(false);if(blockLoaded(scholar,b))return Promise.resolve(true);
  const ix=scholar.index[String(b)];if(!ix)return Promise.resolve(false);
  return scholarLoads[b]||=fetchJson(`./${ix.file}`).then(raw=>{const next=addScholarBlock(scholar,raw);if(!next)throw Error(`${ix.file} damaged`);scholar=next;
    // The saved picks and seen terms of this block are checked now that its content is here.
    if(scholarState){const fit=refitScholarState(scholarState,scholar);if(JSON.stringify(fit)!==JSON.stringify(scholarState))saveScholar(fit);}
    return true;}).catch(()=>{delete scholarLoads[b];return false;});
}
function scholarFailed(){const text='Scholar could not load. Check the connection and try again.';flashToast(text);const say=$('#answer-status');if(say)say.textContent=text;}
// block: the block to open (a card may open a term of another block); the current block changes only once its file loads.
// before: run once the file is here, just before Scholar opens (Resume pauses the quiz only then).
// A newer open, or a move to another screen while the file loads, cancels this one (no late jump into Scholar).
let scholarOpenSeq=0;
async function openScholar(itemId=null,ret=null,block=blockId,before=null,part=null,list=false){
  const us=unitsOf(scholar,block);if(!us.length)return;
  const seq=++scholarOpenSeq,from=step;
  if(!await loadScholarBlock(block)){if(seq===scholarOpenSeq)scholarFailed();return;}
  // A place held at start (its block file was not here yet, or could not load) is checked before another block's place replaces it.
  // If its block still cannot load, its picks and seen terms (shape checked) carry into the new place and are checked when
  // that block loads (an empty place used to overwrite it).
  if(scholarPending){const held=scholarPending;scholarPending=null;
    if(!scholarState){
      if(held.block===block||await loadScholarBlock(held.block)){scholarState=restoreScholarState(held,scholar);if(!scholarState)persist('scholar',null);}
      else scholarState=refitScholarState(scholarStateShape(held),scholar);}}  // loaded blocks' picks are checked now
  if(seq!==scholarOpenSeq||step!==from)return;
  before?.();
  if(blockId!==block){blockId=block;units=allUnits();}
  let st=scholarState&&scholarState.block===blockId?scholarState:{...newScholarState(blockId,us[0]),picks:{...scholarState?.picks},seen:[...(scholarState?.seen||[])]};
  if(itemId)st=moveScholar(st,{type:'item',id:itemId},scholar);
  else if(list)st=moveScholar(st,{type:'list'},scholar);  // picks and seen terms stay
  // A covered entry (umbrella) opens its umbrella with the picture at the part that shows it.
  if(Number.isInteger(part)&&st.item===itemId){scholarPicOpen=itemId;scholarPic={item:itemId,index:part,prev:null,manual:true};}
  scholarReturn=ret;saveScholar(st);navigate('scholar');
}
function saveScholar(st){scholarState=st;persist('scholar',st);}
// A message in the guided question's live region, after the render (so it is heard as a change).
function sayScholar(text){setTimeout(()=>{const say=main.querySelector('.scholar-q [data-say]');if(say&&say.isConnected)say.textContent=text;},150);}
function renderScholar(){
  clearTimeout(picTimer);
  if(!scholar||!scholarState){navigate('units');return;}
  if(scholarReturn?.to==='flash-card'&&!flashPreview)scholarReturn=null;
  const st=scholarState,block=bank.blocks.find(b=>b.id===st.block)||currentBlock(),item=itemById(scholar,st.item);
  const open=id=>{saveScholar(moveScholar(scholarState,{type:'item',id},scholar));render();window.scrollTo({top:0,behavior:'instant'});focusHeading($('#scholar-term'));};
  if(scholarReview&&(scholarReview.block!==st.block||scholarReview.unit!==st.unit||item))scholarReview=null;
  if(scholarReview){renderScholarReview(block);return;}
  if(!item){scholarOpenFor=null;
    const m=listModel(scholar,st,scholarQuery,id=>glossary?.byId.get(id)?.short),items=m.items;
    main.innerHTML=screens.scholarListHtml({...m,block,unit:st.unit,review:items.length>=2,glossOf:id=>glossary?.byId.get(id)||null,query:scholarQuery});
    const search=$('#scholar-search');
    search.oninput=()=>{scholarQuery=search.value;const pos=search.selectionStart;render();const again=$('#scholar-search');again.focus();again.setSelectionRange(pos,pos);};
    if($('#scholar-next-unit'))$('#scholar-next-unit').onclick=()=>{scholarQuery='';saveScholar(moveScholar(scholarState,{type:'unit',unit:Number($('#scholar-next-unit').dataset.unit)},scholar));render();window.scrollTo({top:0,behavior:'instant'});focusHeading(main.querySelector('h1'));};
    if($('#scholar-todo'))$('#scholar-todo').onclick=()=>open($('#scholar-todo').dataset.scholarNext);
    if($('#scholar-review'))$('#scholar-review').onclick=()=>{scholarReview={block:st.block,unit:st.unit,deck:reviewDeck(items),k:0,picks:{}};reviewHints.clear();reviewDraft.clear();render();window.scrollTo({top:0,behavior:'instant'});focusHeading($('#scholar-review-title'));};
    main.querySelectorAll('[name="scholar-unit"]').forEach(r=>r.onchange=()=>{scholarQuery='';saveScholar(moveScholar(scholarState,{type:'unit',unit:Number(r.value)},scholar));keepScroll(render);main.querySelector(`[name="scholar-unit"][value="${r.value}"]`)?.focus({preventScroll:true});});
    main.querySelectorAll('[data-scholar-item]').forEach(b=>b.onclick=()=>open(b.dataset.scholarItem));
    $('#back').onclick=()=>navigate('units');
    return;
  }
  if(scholarPic.item!==item.id)scholarPic={item:item.id,index:item.picture?.kind==='explore'?-1:0,prev:null,manual:false};
  if(scholarOpenFor!==item.id){scholarOpenFor=item.id;const seen=(st.seen||[]).includes(item.id);
    scholarOpen=seen?{picture:false,deeper:false,analogy:false,scenario:false,example:false}:{};if(!seen)saveScholar(moveScholar(st,{type:'seen',id:item.id},scholar));}
  if(scholarPicOpen===item.id){scholarOpen={...scholarOpen,picture:true};scholarPicOpen=null;}
  const back=scholarReturn?.to==='glossary'?'Glossary':scholarReturn?.to==='flash-card'?`Card ${flashPreview.index+1}`:'';
  const qn=item.questions[st.q],tries=triesOf(scholarState,qn);
  const related=(glossary?.byId.get(item.entry)?.related||[]).map(id=>glossary.byId.get(id)).filter(e=>e&&e.block===item.block).map(e=>{const it=itemForEntry(scholar,e.block,e.id);return {id:e.id,term:e.term,item:it&&it.id!==item.id?it.id:null,part:it?.part};}).filter(r=>r.item||!itemForEntry(scholar,item.block,r.id));
  main.innerHTML=screens.scholarItemHtml({block,item,q:st.q,tries,started:item.questions.some(x=>triesOf(scholarState,x).length),hint:scholarHints.has(qn.id),nav:{...neighbours(scholar,st),nextUnit:itemsFor(scholar,st.block,nextUnit(scholar,st))[0]||null},done:x=>resolved(x,triesOf(scholarState,x)),back,pic:picOptions(),open:scholarOpen,draft:draftOf(qn,tries,scholarDraft),related});
  main.querySelectorAll('.scholar-related [data-scholar-item]').forEach(b=>b.onclick=()=>{const part=b.dataset.part===undefined?null:Number(b.dataset.part);  // the part first, so one render keeps focus on the heading
    if(Number.isInteger(part)){scholarPicOpen=b.dataset.scholarItem;scholarPic={item:b.dataset.scholarItem,index:part,prev:null,manual:true};}open(b.dataset.scholarItem);});
  main.querySelectorAll('.scholar-related .term-link').forEach(b=>b.onclick=()=>openTermPop(b,{phase:'review',block:item.block}));
  scholarPic.prev=null;
  main.querySelectorAll('.scholar-drop').forEach(d=>d.ontoggle=()=>{scholarOpen[d.dataset.section]=d.open;if(d.dataset.section==='picture')picLoop(item);});
  const move=(event,focus)=>{saveScholar(moveScholar(scholarState,event,scholar));keepScroll(render);(focus?.()||$('#scholar-stem'))?.focus({preventScroll:true});};
  // A pick: a tile (A-D, tap, the current branch decision) or a tap on the picture's target (tap).
  // Focus after a pick: the tile just picked; in a branch, a new decision takes focus on its first tile.
  const pick=id=>{scholarSay=true;const n0=main.querySelectorAll('.scholar-decision').length;move({type:'answer',index:Number(id)},()=>{const ds=main.querySelectorAll('.scholar-decision'),last=ds[ds.length-1];
    if(last)return (ds.length>n0?last.querySelector('[data-answer]:not([aria-disabled="true"])'):null)||last.querySelector(`[data-answer="${id}"]`);
    return main.querySelector(`.scholar-answers [data-answer="${id}"]`)||$('#scholar-stem');});};
  main.querySelectorAll('.scholar-answers [data-answer]').forEach(b=>b.onclick=()=>{if(b.getAttribute('aria-disabled')==='true'||b.closest('.scholar-decision.is-done'))return;pick(b.dataset.answer);});
  { const board=main.querySelector('.scholar-tap:not(.is-done) svg');if(board)board.onclick=e=>{const t=e.target.closest('[data-tap]');if(t&&!t.dataset.tapState)pick(t.dataset.tap);}; }
  bindArrange(qn,tries,scholarDraft);  // Check saves the arrangement as a try.
  if($('#scholar-reset'))$('#scholar-reset').onclick=()=>{for(const x of item.questions){scholarHints.delete(x.id);scholarDraft.delete(x.id);}
    saveScholar(moveScholar(scholarState,{type:'reset',item:item.id},scholar));keepScroll(render);$('#scholar-stem')?.focus({preventScroll:true});sayScholar('This term\'s questions start over.');};
  if($('#scholar-check'))$('#scholar-check').onclick=()=>{scholarSay=true;move({type:'answer',value:draftOf(qn,tries,scholarDraft)},()=>main.querySelector('.scholar-row.is-wrong :is(button:not(:disabled),input)')||$('#scholar-stem'));};
  bindPicture(item);picLoop(item);holdScholarHeights(item,qn);
  main.querySelectorAll('[data-scholar-q]').forEach(b=>b.onclick=()=>move({type:'question',index:Number(b.dataset.scholarQ)}));
  if($('#scholar-next-q'))$('#scholar-next-q').onclick=()=>move({type:'question',index:st.q+1});
  if($('#scholar-prev-q'))$('#scholar-prev-q').onclick=()=>move({type:'question',index:st.q-1});
  if($('#scholar-hint'))$('#scholar-hint').onclick=()=>{scholarHints.add(item.questions[st.q].id);keepScroll(render);$('#scholar-hint-text')?.focus({preventScroll:true});};
  // The answer line is announced after the render, so a screen reader hears a change in an existing live region.
  // Only the render that follows a pick speaks; a Hint or Look again render stays quiet.
  { const say=main.querySelector('.scholar-q [data-say]');if(scholarSay&&say?.dataset.say)setTimeout(()=>{if(say.isConnected)say.textContent=say.dataset.say;},150);scholarSay=false; }
  // Look again: open the section that explains the question (a picture step is shown and its loop paused), then go there.
  // The same for an umbrella's "Also covers" links: each opens the picture at the part that shows that term.
  main.querySelectorAll('#scholar-see, .scholar-also [data-see]').forEach(b=>b.onclick=()=>{const [part,n]=b.dataset.see.split(':');scholarOpen[part]=true;
    if(part==='picture'){scholarPic={item:item.id,index:Number(n),prev:scholarPic.index,manual:true};}
    render();const box=main.querySelector(`[data-section="${part}"]`);box?.scrollIntoView({block:'start'});box?.querySelector('summary')?.focus({preventScroll:true});});
  main.querySelectorAll('.scholar-nav [data-scholar-item]').forEach(b=>b.onclick=()=>open(b.dataset.scholarItem));
  $('#scholar-list').onclick=()=>{const id=item.id;scholarReturn=null;saveScholar(moveScholar(scholarState,{type:'list'},scholar));render();window.scrollTo({top:0,behavior:'instant'});main.querySelector(`[data-scholar-item="${CSS.escape(id)}"]`)?.focus({preventScroll:false});};
  if($('#scholar-return'))$('#scholar-return').onclick=()=>{const r=scholarReturn;scholarReturn=null;if(r.to==='glossary'){glossEntry=r.entry;navigate('glossary');}else navigate('flash-card');};
}
// Unit review screen: the term page's guided-question handlers on a practice state that is never saved.
function renderScholarReview(block){
  const rv=scholarReview,d=rv.deck[rv.k],item=itemById(scholar,d.item),qn=item?.questions[d.q];
  if(!qn){scholarReview=null;render();return;}
  const tries=rv.picks[pickKey(qn)]||[];
  main.innerHTML=screens.scholarReviewHtml({block,unit:rv.unit,item,qn,k:rv.k,total:rv.deck.length,tries,hint:reviewHints.has(qn.id),draft:draftOf(qn,tries,reviewDraft)});
  const apply=(event,focus)=>{const temp={...scholarState,item:item.id,q:d.q,picks:rv.picks};rv.picks=moveScholar(temp,event,scholar).picks;scholarSay=true;keepScroll(render);(focus?.()||$('#scholar-stem'))?.focus({preventScroll:true});};
  const pick=id=>{const n0=main.querySelectorAll('.scholar-decision').length;apply({type:'answer',index:Number(id)},()=>{const ds=main.querySelectorAll('.scholar-decision'),last=ds[ds.length-1];
    if(last)return (ds.length>n0?last.querySelector('[data-answer]:not([aria-disabled="true"])'):null)||last.querySelector(`[data-answer="${id}"]`);
    return main.querySelector(`.scholar-answers [data-answer="${id}"]`);});};
  main.querySelectorAll('.scholar-answers [data-answer]').forEach(b=>b.onclick=()=>{if(b.getAttribute('aria-disabled')==='true'||b.closest('.scholar-decision.is-done'))return;pick(b.dataset.answer);});
  { const board=main.querySelector('.scholar-tap:not(.is-done) svg');if(board)board.onclick=e=>{const t=e.target.closest('[data-tap]');if(t&&!t.dataset.tapState)pick(t.dataset.tap);}; }
  bindArrange(qn,tries,reviewDraft);
  if($('#scholar-check'))$('#scholar-check').onclick=()=>apply({type:'answer',value:draftOf(qn,tries,reviewDraft)},()=>main.querySelector('.scholar-row.is-wrong :is(button:not(:disabled),input)'));
  if($('#scholar-hint'))$('#scholar-hint').onclick=()=>{reviewHints.add(qn.id);keepScroll(render);$('#scholar-hint-text')?.focus({preventScroll:true});};
  holdScholarHeights(item,qn);
  { const say=main.querySelector('.scholar-q [data-say]');if(scholarSay&&say?.dataset.say)setTimeout(()=>{if(say.isConnected)say.textContent=say.dataset.say;},150);scholarSay=false; }
  const go=k=>{rv.k=k;render();window.scrollTo({top:0,behavior:'instant'});focusHeading($('#scholar-review-title'));};
  if($('#scholar-review-prev'))$('#scholar-review-prev').onclick=()=>go(rv.k-1);
  if($('#scholar-review-next'))$('#scholar-review-next').onclick=()=>go(rv.k+1);
  const exit=(say)=>{scholarReview=null;saveScholar(moveScholar(scholarState,{type:'list'},scholar));render();window.scrollTo({top:0,behavior:'instant'});focusHeading(main.querySelector('h1'));if(say)sayList(say);};
  if($('#scholar-review-end'))$('#scholar-review-end').onclick=()=>{const right_=rv.deck.filter(x=>{const it=itemById(scholar,x.item),q=it.questions[x.q];return right(q,rv.picks[pickKey(q)]||[]);}).length;exit(`Review done: ${right_} of ${rv.deck.length} right.`);};
  $('#scholar-review-exit').onclick=()=>exit('');
  $('#scholar-review-term').onclick=()=>{scholarReview=null;saveScholar(moveScholar(scholarState,{type:'item',id:item.id},scholar));render();window.scrollTo({top:0,behavior:'instant'});focusHeading($('#scholar-term'));};
}
// Order: Move up / Move down (buttons, no drag); sort: one radio group per item. drafts: the arrangements being built.
function bindArrange(qn,tries,drafts){
  main.querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>{const d=[...draftOf(qn,tries,drafts)],i=Number(b.dataset.move),j=i+Number(b.dataset.dir);[d[i],d[j]]=[d[j],d[i]];drafts.set(qn.id,d);keepScroll(render);
    const again=main.querySelector(`[data-move="${j}"][data-dir="${b.dataset.dir}"]`);(again&&!again.disabled?again:main.querySelector(`[data-move="${j}"]:not(:disabled)`))?.focus({preventScroll:true});
    sayScholar(`${qn.steps[d[j]].text} Moved to place ${j+1} of ${d.length}.`);});  // the place number is drawn for sight only
  main.querySelectorAll('.scholar-sort-seg input').forEach(r=>r.onchange=()=>{const d=[...draftOf(qn,tries,drafts)],i=Number(r.closest('[data-sort]').dataset.sort);d[i]=Number(r.value);drafts.set(qn.id,d);keepScroll(render);main.querySelector(`[name="sort-${i}"][value="${r.value}"]`)?.focus({preventScroll:true});});}
// A short line in the term list's status (a finished review's score).
function sayList(text){setTimeout(()=>{const s=main.querySelector('p.status.count');if(s&&step==='scholar')s.textContent=`${s.textContent} · ${text}`;},150);}
const picOptions=()=>({index:scholarPic.index,motion:{prev:scholarPic.prev,still:window.matchMedia('(prefers-reduced-motion: reduce)').matches},playing:scholarPlay&&!scholarPic.manual&&scholarOpen.picture!==false});
// Redraw only the picture (a loop tick or a picture control), keeping focus on the control that had it.
function mountPicture(item){
  const panel=main.querySelector('[data-section="picture"] > .scholar-drop-body');if(!panel)return;
  const next=document.createElement('div');next.innerHTML=pictureHtml(item.picture,scholarPic.index,picOptions());scholarPic.prev=null;
  // Drawing and captions are replaced; the controls stay and take the new state, so focus and screen readers are not disturbed
  // on each loop tick.
  { const old=panel.querySelector('.pic-frame'),fresh=next.querySelector('.pic-frame');if(old&&fresh)old.replaceWith(fresh); }
  // The caption box is kept and its text changed, so a screen reader hears the new caption from the existing live region.
  // Attributes first: a box that was muted for the loop must be live again before its text changes.
  { const old=panel.querySelector('.pic-captions'),fresh=next.querySelector('.pic-captions');if(old&&fresh){
    for(const k of ['role','aria-live'])fresh.hasAttribute(k)?old.setAttribute(k,fresh.getAttribute(k)):old.removeAttribute(k);old.innerHTML=fresh.innerHTML;} }
  next.querySelectorAll('.pic-controls button').forEach(b=>{const old=b.id?panel.querySelector('#'+b.id):panel.querySelector(`[data-pic-part="${b.dataset.picPart}"]`);if(!old)return;
    for(const k of ['disabled','aria-pressed','aria-label','title','data-playing','data-replay'])b.hasAttribute(k)?old.setAttribute(k,b.getAttribute(k)):old.removeAttribute(k);
    if(old.id==='pic-play'||old.id==='pic-next')old.innerHTML=b.innerHTML;});
  if(panel.contains(document.activeElement)&&document.activeElement.disabled)panel.querySelector('.pic-controls button:not(:disabled)')?.focus({preventScroll:true});
  bindPicture(item);
}
function bindPicture(item){
  if(!item.picture)return;
  const go=(index,manual=scholarPic.manual)=>{scholarPic={item:item.id,index,prev:moveFrom(scholarPic.index,index),manual};mountPicture(item);};
  const manual=index=>{clearTimeout(picTimer);go(index,true);};
  if($('#pic-back'))$('#pic-back').onclick=()=>manual(scholarPic.index-1);
  if($('#pic-next'))$('#pic-next').onclick=()=>manual($('#pic-next').dataset.replay?0:scholarPic.index+1);
  // Left / Right step through the picture while focus is on one of its controls (steps stop at the ends; parts wrap).
  { const body=main.querySelector('[data-section="picture"] .pic-body');if(body)body.onkeydown=e=>{const to=e.target.closest('.pic-controls')?stepKey(item.picture,scholarPic.index,e.key):null;if(to===null)return;e.preventDefault();manual(to);main.querySelector(`[data-pic-part="${to}"]`)?.focus({preventScroll:true});}; }
  main.querySelectorAll('[data-pic-part]').forEach(b=>b.onclick=()=>manual(Number(b.dataset.picPart)));
  // Explore: a tap on a drawn part chooses the first part that lights it (the chips are the keyboard way).
  if(item.picture.kind==='explore')main.querySelector('.pic')?.addEventListener('click',e=>{const id=e.target.closest('[data-pic-id]')?.dataset.picId;const k=item.picture.parts.findIndex(p=>p.light.includes(id));if(k>=0)manual(k);});
  // Play / pause: the reader's choice for every term; Play also lifts this term's manual pause.
  if($('#pic-play'))$('#pic-play').onclick=()=>{const on=$('#pic-play').dataset.playing!=='true';scholarPlay=on;scholarPic.manual=false;mountPicture(item);picLoop(item);};
}
// One loop tick per step (picMs of its caption) while the term's picture is open, in view and its tab shown; it wraps to the first step or part.
function picLoop(item){
  clearTimeout(picTimer);
  if(!scholarPlay||scholarPic.manual||!item.picture||scholarOpen.picture===false)return;
  picTimer=setTimeout(()=>{
    if(step!=='scholar'||scholarPic.item!==item.id||!scholarPlay||scholarPic.manual)return;if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){scholarPlay=false;mountPicture(item);return;}
    const frame=main.querySelector('[data-section="picture"] .pic-frame')?.getBoundingClientRect(),inView=frame&&frame.bottom>0&&frame.top<window.innerHeight;
    if(!document.hidden&&inView){const next=(scholarPic.index+1)%(item.picture.steps||item.picture.parts).length;scholarPic={item:item.id,index:next,prev:moveFrom(scholarPic.index,next),manual:false};mountPicture(item);}
    picLoop(item);
  },picMs((item.picture.steps||item.picture.parts)[scholarPic.index]?.caption));
}
// ---- Glossary ----
const glossQuestions=e=>e.questionIds.map(id=>bank.questions.find(q=>q.id===id)).filter(q=>q&&q.block===blockId);
function renderGlossary() {
  if(!glossary){navigate('units');return;}
  const entry=glossEntry?glossary.byId.get(glossEntry):null;
  const card=entry&&cardForQuestion(catalogCards(),entry.sourceId);
  const save=card?saveButton({id:'gloss-save',key:cardKey(card),saved:manualHas(cardSets,card)}):'';
  // the entry's card Flag at the far right of the Source row, as on the card back (same flag key and dialog).
  const flagSource=card?bank.questions.find(q=>q.id===card.questionId):null;
  const flag=flagSource?flagButton({id:'flag-card',question:flagSource.id,label:'Flag card',card:true,flagged:Boolean(flags[`${bank.version}/${flagSource.id}/card`])}):'';
  // Back to the card the entry was opened from (Card N), while that card session is still open.
  if(glossReturn&&!flashPreview)glossReturn=null;
  const toCard=glossReturn?`Card ${flashPreview.index+1}`:'';
  main.innerHTML=screens.glossaryHtml({block:currentBlock(), replacing:sessionOpen(), g:glossary, list:searchEntries(glossary,{query:glossQuery,unit:glossUnit}).filter(e=>e.block===blockId), query:glossQuery, unit:glossUnit, entry, questionCount:e=>{const qs=glossQuestions(e);return {standard:questionsForMode(qs,'Unassisted').length,hard:questionsForMode(qs,'Hard').length};}, save, flag, toCard, group:glossGroup, scholar:Boolean(entry&&itemForEntry(scholar,blockId,entry.id))});
  const openEntry=id=>{glossEntry=id;render();window.scrollTo({top:0,behavior:'instant'});focusHeading($('#gloss-term'));};
  main.querySelectorAll('[data-entry]').forEach(b=>b.onclick=()=>openEntry(b.dataset.entry));
  if($('#gloss-card'))$('#gloss-card').onclick=()=>{glossEntry=null;glossReturn=null;navigate('flash-card');};
  if(entry){
    // Key terms: a glossary entry opens here; an acronym without an entry opens the term popover.
    main.querySelectorAll('.gloss-entry .term-link').forEach(b=>b.onclick=()=>glossary.byId.has(b.dataset.term)?openEntry(b.dataset.term):openTermPop(b,{phase:'review',block:entry.block}));
    $('#gloss-back').onclick=()=>{const id=glossEntry;glossEntry=null;render();main.querySelector(`[data-entry="${CSS.escape(id)}"]`)?.focus({preventScroll:false});};
    // A Questions session with this term's questions: Standard ones in the current help level, or the Hard ones.
    const studyPool=hard=>{const qs=glossQuestions(entry),pool=questionsForMode(qs,hard?'Hard':'Unassisted');if(!pool.length)return;
      const useMode=hard?'Hard':mode==='Hard'?'Unassisted':mode;mode=useMode;startSession(shuffle(pool),{version:bank.version,mode:useMode},'random');navigate('study');};
    if($('#gloss-questions'))$('#gloss-questions').onclick=()=>studyPool(false);
    if($('#gloss-open-scholar'))$('#gloss-open-scholar').onclick=()=>{const it=itemForEntry(scholar,blockId,entry.id);openScholar(it.id,{to:'glossary',entry:entry.id},blockId,null,it.part);};
    if($('#gloss-hard-questions'))$('#gloss-hard-questions').onclick=()=>studyPool(true);
    if(card)bindSave(card);
    if($('#flag-card')&&flagSource)$('#flag-card').onclick=()=>flagCard(flagSource,screens.cardFlagContext(card));
    return;
  }
  const search=$('#gloss-search');
  search.oninput=()=>{glossQuery=search.value;const pos=search.selectionStart;render();const again=$('#gloss-search');again.focus();again.setSelectionRange(pos,pos);};
  $('#gloss-unit').onchange=e=>{glossUnit=Number(e.target.value);render();$('#gloss-unit').focus();};
  main.querySelectorAll('[name="gloss-group"]').forEach(r=>r.onchange=()=>{glossGroup=r.value;keepScroll(render);main.querySelector(`[name="gloss-group"][value="${glossGroup}"]`)?.focus({preventScroll:true});});
  if($('#back'))$('#back').onclick=()=>navigate('units');
}
// Reviews (Quiz review, Exam review): every part is resolved, so stems, answers and rationales link in full.
function reviewGloss(){
  if(!glossary)return null;
  const spans=(q,part,id)=>{const L=glossary.questionLinks[q.id];if(!L)return [];return part==='stem'?L.stem:part==='answer'?L.answers[id]||[]:L.rationales[id]||[];};
  return {text:(q,part,id,text)=>screens.linkedText(text,spans(q,part,id)),terms:q=>screens.keyTermsHtml(keyTerms(glossary,q).map(x=>glossary.byId.get(x)).filter(Boolean))};
}
// Term popover (desktop) / bottom sheet (phone, 640px or less).
// A re-render (e.g. the 200 ms tick when an Assisted stage advances) replaces the link that opened the popover:
// follow the new copy of that link, or close when it is gone, so focus and position never use a detached element.
const termAnchor=from=>from?.isConnected?from:document.querySelector(`.term-link[data-term="${CSS.escape(from?.dataset?.term??'')}"]`);
// An open term popover pauses the question like the gear menu; Tab out of it closes it.
let termWasRunning=false;
function closeTermPop(){if(!termPop)return;const {el,from}=termPop;termPop=null;el.remove();termAnchor(from)?.focus?.({preventScroll:true});
  if(termWasRunning){termWasRunning=false;if(step==='study'&&session&&!session.ended&&!dialog.open&&!tools.isOpen())send({type:'resume'},false);}}
function placeTermPop(){
  if(!termPop||termPop.el.classList.contains('sheet'))return;
  const anchor=termAnchor(termPop.from);if(!anchor){closeTermPop();return;}
  termPop.from=anchor;const {el}=termPop,r=anchor.getBoundingClientRect(),w=Math.min(360,window.innerWidth-24);
  el.style.width=`${w}px`;el.style.left=`${Math.max(12,Math.min(window.innerWidth-w-12,r.left))}px`;
  // open above the link when the window has no room below it and room above (a Key terms row near the bottom).
  const h=el.offsetHeight,below=r.bottom+6+h<=window.innerHeight,above=r.top-6-h>=0;
  el.style.top=`${(below||!above?r.bottom+6:r.top-6-h)+window.scrollY}px`;
}
// ref: an entry from the popover's own See row. The See button is removed with the old popover, so the new one
// stays anchored to the link that opened the first popover (desktop closed it at once: the anchor was detached).
// block: the block of the question, card or entry the link is in; a link opens only that block's entries.
function openTermPop(button,{phase,ref:seeRef=null,block=blockId}){
  if(!glossary)return;
  const ref=seeRef??button.dataset.term;
  const content=popover(glossary,ref,{block});if(!content)return;
  closeTermPop();
  const el=document.createElement('div');el.className='term-pop';el.setAttribute('role','dialog');el.setAttribute('aria-labelledby','term-pop-title');
  // Save beside the close button: the term's flash card in Manual. A glossary-only term has no card.
  const card=content.entry?cardForQuestion(catalogCards(),content.entry.sourceId):null;
  // Study in Scholar: not during a live exam (the nav hides Scholar there) and not from Scholar itself.
  const study=content.entry&&!examLive(exam)&&step!=='scholar'?itemForEntry(scholar,content.entry.block,content.entry.id):null;
  const draw=(more=false)=>{
    const save=card?saveButton({id:'term-pop-save',key:cardKey(card),saved:manualHas(cardSets,card)}):'';
    el.innerHTML=screens.termPopoverHtml(content,{more,docs:glossary.docs,save,scholar:Boolean(study)});
    el.querySelector('#term-pop-scholar')?.addEventListener('click',()=>{closeTermPop();openScholar(study.id,null,study.block,pauseStudy,study.part);});
    el.querySelector('#term-pop-close').onclick=closeTermPop;
    if(card)el.querySelector('#term-pop-save').onclick=()=>{const text=toggleManual(card);if(!text)return;el.querySelector('#term-pop-save').focus({preventScroll:true});flashToast(text,el);};
    el.querySelector('#term-pop-more')?.addEventListener('click',()=>{draw(true);el.querySelector('#term-pop-close').focus();});
    el.querySelectorAll('[data-term]').forEach(b=>b.onclick=()=>openTermPop(termAnchor(termPop?.from)||button,{phase,ref:b.dataset.term,block}));
  };
  draw();document.body.append(el);termPop={el,from:button};
  if(!termWasRunning&&step==='study'&&session&&!session.paused&&!session.ended){termWasRunning=true;send({type:'pause'},false);}
  el.addEventListener('focusout',e=>{if(termPop?.el===el&&e.relatedTarget&&!el.contains(e.relatedTarget))closeTermPop();});
  if(window.matchMedia('(max-width: 640px)').matches)el.classList.add('sheet');
  else placeTermPop();
  el.querySelector('#term-pop-close').focus({preventScroll:true});
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&termPop){e.preventDefault();closeTermPop();}});
// Term links in running text are spans with role="button": Enter and Space act like a click.
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches?.('span.term-link')){e.preventDefault();e.target.click();}});
document.addEventListener('pointerdown',e=>{if(termPop&&!termPop.el.contains(e.target)&&!e.target.closest('.term-link'))closeTermPop();});
function renderNotUnderstoodSetup() {
  const selected = () => quizScope === 'all' ? allUnits() : units;
  const candidates = () => questionsForMode(notUnderstoodQuestions(bank,understanding,selected(),blockId),mode);
  // Marked questions available per unit for the chosen mode (red counts beside the units).
  const unitAvailable = () => { const per = Object.fromEntries(allUnits().map(id => [id, questionsForMode(notUnderstoodQuestions(bank,understanding,[id],blockId),mode).length]));
    return {all:String(questionsForMode(notUnderstoodQuestions(bank,understanding,allUnits(),blockId),mode).length),units:per}; };
  main.innerHTML = screens.practiceSetupHtml({block:currentBlock(), quizScope, units, mode, poolKind, poolSize:targetedPoolSize, available:candidates().length, replacing:sessionOpen(), counts:unitAvailable()});
  const count = () => {
    const n = candidates().length;
    const per = unitAvailable(); main.querySelectorAll('.unit-count[data-count]').forEach(e => { e.textContent = e.dataset.count === 'all' ? per.all : per.units[e.dataset.count] ?? 0; });
    $('#practice-count').textContent = n ? '' : poolShortfall(n,targetedPoolSize);
    $('#practice-confirm').disabled = !n;
    syncPool($('#practice-pool-size'),'practice-pool',targetedPoolSize,n,size=>{ targetedPoolSize = size; count(); });
  };
  if (quizScope === 'units') bindUnitChoices('review-unit',count); else count();
  // Marked practice uses the same Random / Smart choice as the Mode screen.
  main.querySelectorAll('[name="pool-kind"]').forEach(r=>r.onchange=()=>{poolKind=toPoolKind(r.value);persist('poolKind',poolKind);main.querySelector('#pool-help').textContent=screens.POOL_HELP[poolKind];});
  // Hard: the Study button takes the gold tone, as on the Questions setup.
  main.querySelectorAll('[name="practice-mode"]').forEach(r => r.onchange = () => { mode = r.value; if (mode === 'Hard') $('#practice-confirm').dataset.tone = 'gold'; else delete $('#practice-confirm').dataset.tone; count(); });
  $('#practice-cancel').onclick = () => navigate('blocks');
  $('#practice-confirm').onclick = () => {
    const pool = candidates(); if (!pool.length) return;
    const kind=poolKind;
    startSession(selectQuestions(pool,targetedPoolSize,kind),{version:bank.version,mode,kind:'not_understood'},kind);
    navigate('study');
  };
}
// ---- Exam Mode. Pure logic in exam.mjs; this part owns the clock, storage and events. ----
// Re-render without moving the page (results filters, save boxes, marks).
function keepScroll(run){const y=window.scrollY;run();window.scrollTo({top:y,behavior:'instant'});}
function examSetupMarkup(){
  const block=currentBlock();
  const forms=formsFor(bank,block.id),status=formStatus(examCycles,forms,block.id);
  // No forms for this block: the Standard draw and its blueprint.
  return screens.examSetupHtml({block, forms, status, plan:status.next?null:blueprint(standardPool(bank.questions,block.id)),
    last:examHistory.filter(h=>h.block===block.id).at(-1)||null, studyOpen:sessionOpen()});
}
function beginExam(){
  const forms=formsFor(bank,blockId),{next,cycle}=formStatus(examCycles,forms,blockId);
  try{exam=startExam(bank.questions,{version:bank.version,block:blockId,...(next?{form:next,formIds:forms.forms[next],cycle}:{}),now:Date.now(),id:crypto.randomUUID()});}
  catch(error){$('#mode-availability').textContent=error.message;return;}
  examAnnounced=null;persist('exam',exam);noteBlock(exam.block);navigate('exam');$('#exam-stem')?.focus({preventScroll:true});
}
// Snapshot study accuracy (exam answers excluded), record the answers in stats with kind 'exam', add the history row.
// Safe to repeat: the snapshot is taken once, stats count each exam appearance once and history keeps one row per exam.
function finalizeExam(){
  if(!exam?.submitted)return;
  const block=bank.blocks.find(b=>b.id===exam.block);
  if(!exam.study&&block)exam=withStudySnapshot(exam,studyScores(stats,block.id,block.units));
  stats=recordSession(stats,examSession(exam,bank.questions));persist('stats',stats);
  examHistory=addHistory(examHistory,historyEntry(exam,examResults(exam,bank.questions,bank.blocks)));persist('examHistory',examHistory);
  // A submitted form exam (an automatic submit at 0:00 too) takes its form for this cycle; counted once per exam.
  const cycles=countExam(examCycles,exam,formsFor(bank,exam.block));
  if(JSON.stringify(cycles)!==JSON.stringify(examCycles)&&persist('examCycle',cycles))examCycles=cycles;
  persist('exam',exam);
}
function sendExam(event){
  if(!exam)return;
  const wasLive=examLive(exam),next=examEvent(exam,event,Date.now());
  if(next===exam)return;
  exam=next;persist('exam',exam);
  if(wasLive&&exam.submitted){examSubmitted();return;}
  render();
  // the flag (button or F) flashes a toast, as SAVE does. The button label carries the state for screen readers.
  if(event.type==='flag'&&step==='exam')flashToast(exam.flagged.includes(exam.pool[exam.index])?'Question flagged':'Flag removed',$('#exam-flag')?.closest('.exam-flag-row'));
  // The toast is aria-hidden; the status line tells screen readers what F and 1-9 changed.
  if(step==='exam'&&(event.type==='flag'||event.type==='answer')){const qid=exam.pool[exam.index];$('#answer-status').textContent=event.type==='flag'?(exam.flagged.includes(qid)?'Question flagged':'Flag removed'):`Answer ${'ABCDEFGH'[exam.orders[qid].indexOf(event.id)]||''} selected`;}
}
function examSubmitted(){
  if(dialog.open)dialog.close();
  finalizeExam();resultsKind='exam';
  const r=examResults(exam,bank.questions,bank.blocks);examFilter=r.correct<r.size?'missed':'all';
  navigate('exam-results');window.scrollTo({top:0,behavior:'instant'});
  $('#answer-status').textContent=`${exam.timedOut?'Time is up. The exam was submitted. ':''}Score ${Math.round(r.pct*100)} percent, ${r.pass?'pass':'fail'}.`;
}
// Wall-clock tick: 0:00 submits the exam wherever the app is; otherwise only the clock text and time bar change.
function examTick(){
  if(!examLive(exam))return;
  const now=Date.now();
  if(now>=exam.deadline){sendExam({type:'tick'});return;}
  if(step!=='exam')return;
  const left=remainingMs(exam,now),text=screens.examClock(left);
  if($('#exam-clock')&&$('#exam-clock').textContent!==text){
    $('#exam-clock').textContent=text;$('#exam-clock-box')?.classList.toggle('low',left<=300000);
    if($('#exam-time-fill'))$('#exam-time-fill').style.width=`${(100*(1-left/EXAM.limitMs)).toFixed(2)}%`;
  }
  // Spoken warnings at 10, 5 and 1 minute left (the timer itself is not live).
  const minute=[10,5,1].find(m=>left<=m*60000&&left>m*60000-1500);
  if(minute&&examAnnounced!==minute){examAnnounced=minute;$('#answer-status').textContent=`${minute} ${minute===1?'minute':'minutes'} left in the exam.`;}
}
// Bring the question sheet under the header after a jump (navigator, Previous/Next, next blank); wide screens centre it.
function showExamQuestion(){
  const sheet=main.querySelector('.exam-sheet');if(!sheet)return;
  // The clock bar is sticky under the top bar, so both cover the page.
  const bar=$('.exam-top'),head=headerHeight()+(bar?bar.getBoundingClientRect().height:0),top=sheet.getBoundingClientRect().top;
  if(!window.matchMedia('(max-width: 760px), (max-height: 500px)').matches){centreSheet('.exam-sheet','.question-actions',{cover:head});return;}
  if(top<head||top>window.innerHeight*0.5)window.scrollTo({top:Math.max(0,top+window.scrollY-head-8),behavior:'instant'});
}
function openSubmitCheck(){
  const c=examCounts(exam);
  showDialog('Submit exam',screens.submitCheckHtml(exam),()=>{
    dialog.querySelectorAll('[data-exam-jump]').forEach(b=>b.onclick=()=>{dialog.close();sendExam({type:'goto',index:Number(b.dataset.examJump)});$('#exam-stem')?.focus({preventScroll:true});showExamQuestion();});
    $('#exam-confirm-submit').onclick=()=>sendExam({type:'submit'});
  },{label:`${c.answered} of ${exam.pool.length} answered`,closeFirst:true,tone:'violet'});
}
function renderExam(){
  if(!exam){step='blocks';renderBlocks();return;}
  if(exam.submitted){step='exam-results';syncScreens();renderExamResults();return;}
  // Keep focus on the control that was used (an answer, a navigator cell, Flag) across the redraw.
  const active=document.activeElement,sameQuestion=main.dataset.examIndex===String(exam.index)&&main.dataset.examId===exam.id;
  const keep={id:active?.id,answer:active?.dataset?.examAnswer,go:active?.dataset?.examGo};
  main.innerHTML=screens.examHtml({exam,bank,now:Date.now(),navOpen:examNavOpen||!window.matchMedia('(max-width: 640px)').matches});
  main.querySelector('.exam-nav-box')?.addEventListener('toggle',e=>{if(window.matchMedia('(max-width: 640px)').matches)examNavOpen=e.target.open;});
  main.dataset.examIndex=String(exam.index);main.dataset.examId=exam.id;
  main.querySelectorAll('[data-exam-answer]').forEach(b=>b.onclick=()=>sendExam({type:'answer',id:b.dataset.examAnswer}));
  main.querySelectorAll('[data-exam-go]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.examGo);if(i===exam.index)return;sendExam({type:'goto',index:i});$('#exam-stem')?.focus({preventScroll:true});showExamQuestion();});
  $('#exam-flag').onclick=()=>sendExam({type:'flag'});
  $('#exam-previous').onclick=()=>{sendExam({type:'previous'});$('#exam-stem')?.focus({preventScroll:true});showExamQuestion();};
  $('#exam-next').onclick=()=>{if(exam.index===exam.pool.length-1){openSubmitCheck();return;}sendExam({type:'next'});$('#exam-stem')?.focus({preventScroll:true});showExamQuestion();};
  $('#exam-next-blank').onclick=()=>{sendExam({type:'nextBlank'});$('#exam-stem')?.focus({preventScroll:true});showExamQuestion();};
  $('#exam-submit').onclick=openSubmitCheck;
  const target=keep.go!=null?main.querySelector(`[data-exam-go="${CSS.escape(keep.go)}"]`):sameQuestion&&keep.answer?main.querySelector(`[data-exam-answer="${CSS.escape(keep.answer)}"]`):keep.id&&keep.id!=='main'?document.getElementById(keep.id):null;
  if(target&&main.contains(target)&&!target.disabled)target.focus({preventScroll:true});
}
function renderExamResults(){
  if(!exam?.submitted){if(examLive(exam)){step='exam';renderExam();}else{step='blocks';renderBlocks();}return;}
  main.dataset.screen='exam-results';
  const r=examResults(exam,bank.questions,bank.blocks);
  if(!REVIEW_FILTERS.includes(examFilter))examFilter='all';
  // SAVE per item (questions that supply a flash card): pressed when the card is in Manual.
  const boxFor=q=>{const card=cardForQuestion(catalogCards(),q.id);return card?saveButton({key:cardKey(card),saved:manualHas(cardSets,card)}):'';};
  const marked=id=>understandingRecord(understanding,bank.version,id)?.understood===false;
  const termsFor=q=>glossary?screens.keyTermsHtml(keyTerms(glossary,q).map(id=>glossary.byId.get(id)).filter(Boolean)):'';
  main.innerHTML=screens.examResultsHtml({exam,results:r,bank,history:examHistory.filter(h=>h.block===exam.block),filter:examFilter,boxFor,marked,source:sourceExcerpt,isFlagged,termsFor,link:reviewGloss()?.text||null,isOpen:id=>examOpen.has(`${exam.id}:${id}`)});
  // Exam glossary: none until submitted; in the review every term opens (phase 'review').
  main.querySelectorAll('.term-link').forEach(b=>b.onclick=()=>openTermPop(b,{phase:'review',block:exam.block}));
  $('#exam-blocks').onclick=()=>navigate('blocks');
  $('#exam-again').onclick=()=>{blockId=exam.block;units=allUnits();navigate('exam-setup');};
  main.querySelectorAll('[name="exam-filter"]').forEach(r=>r.onchange=()=>{examFilter=r.value;keepScroll(render);main.querySelector(`[name="exam-filter"][value="${examFilter}"]`)?.focus({preventScroll:true});});
  main.querySelectorAll('[data-exam-item]').forEach(item=>{
    const id=item.dataset.examItem,q=bank.questions.find(x=>x.id===id);
    // Open review rows stay open across re-renders (save, mark, flag).
    item.addEventListener('toggle',()=>{const k=`${exam.id}:${id}`;if(item.open)examOpen.add(k);else examOpen.delete(k);});
    const card=item.querySelector('[data-save-card]')&&cardForQuestion(catalogCards(),id);if(card)bindSave(card,item);
    item.querySelectorAll('[data-flag-question]').forEach(b=>b.onclick=()=>flagQuestion(q));
  });
}
// ---- Data files and source excerpts. The excerpt asset loads on demand. ----
// Each data URL carries this build's content hash (index.html, #release-files), so code and data always match and
// sw.js can keep a checked offline copy. Without the list (a host that serves the files as they are) the plain path is used.
const releaseFiles=(()=>{try{return JSON.parse(document.getElementById('release-files').textContent);}catch{return {};}})();
async function fetchJson(path){const tag=releaseFiles[path.slice(2)],response=await fetch(tag?`${path}?v=${tag}`:path,{cache:'no-store'});if(!response.ok)throw Error(`${path} ${response.status}`);return response.json();}
function loadExcerptKit(){
  return excerptKitLoad ||= Promise.all([import('./sources.mjs'),import('./reader.mjs')]).then(([logic,view])=>(excerptKit={logic,view})).catch(error=>{excerptKitLoad=null;throw error;});
}
function loadLinks(){return linkLoad ||= Promise.all([loadExcerptKit(),fetchJson('./source-links.json')]).then(([kit,raw])=>(linkData=kit.logic.validateLinks(raw))).catch(error=>{linkLoad=null;throw error;});}
// Callers decide visibility first; this never runs for an unresolved appearance.
function sourceExcerpt(q){
  if(linkData&&excerptKit)return excerptKit.view.excerptHtml(excerptKit.logic.excerptsFor(linkData,q.id));
  if(linkFailed)return '<section class="source-excerpt" aria-label="Source excerpt"><p class="muted">Source excerpt unavailable. Check the connection.</p></section>';
  loadLinks().then(()=>{if(EXCERPT_SCREENS.includes(step))keepScroll(render);}).catch(()=>{linkFailed=true;if(EXCERPT_SCREENS.includes(step))keepScroll(render);});
  return '<section class="source-excerpt" aria-label="Source excerpt" aria-busy="true"><p class="muted">Loading source…</p></section>';
}
// Draws the screen again for content that arrived late, where that content shows, and puts focus back on the same control; when focus could not be kept, the next render shows the content instead.
function redrawLate(){const at=document.activeElement||document.body,inMain=main.contains(at),find=at.id?`#${CSS.escape(at.id)}`:at.dataset?.study?`[data-study="${at.dataset.study}"]`:at.matches('h1')?'h1':null;if(['units',...EXCERPT_SCREENS].includes(step)&&(find||!inMain)){keepScroll(render);const to=inMain&&main.querySelector(find);if(find==='h1')focusHeading(to);else if(to)to.focus({preventScroll:true});}else syncScreens();}
// Glossary and Scholar index load after the first screen (optional; a quarter of the first download). Until then, or on a failure: Glossary tile off, no term links, no Scholar in Mode.
async function loadExtras(){
  [glossary,scholar]=await Promise.all([fetchJson('./glossary.json').then(restoreGlossary).catch(()=>null),fetchJson('./scholar.json').then(restoreScholar).catch(()=>null)]);migrateBookmarks();  // the bookmark move needs the glossary
  const raw=read('scholar',null),held=Number.isInteger(raw?.block)&&Boolean(scholar?.index[String(raw.block)]);  // held (as at an offline start) until its block file is here, so an Open Scholar in between carries the saved picks
  if(held)scholarPending=raw;else{scholarState=restoreScholarState(raw,scholar);if(raw!==null&&!scholarState&&scholar)persist('scholar',null);}
  redrawLate();
  if(held&&await loadScholarBlock(raw.block)&&scholarPending===raw){scholarPending=null;scholarState=restoreScholarState(raw,scholar);if(!scholarState)persist('scholar',null);}
  if(scholarState&&!blockLoaded(scholar,scholarState.block))await loadScholarBlock(scholarState.block);if(step==='units'&&blockLoaded(scholar,blockId))redrawLate();else syncScreens();  // Resume Scholar; the Mode card's Scholar progress
}
setInterval(()=>{
  examTick();
  const now=performance.now(),ms=now-last;last=now;
  if (!session || step!=='study' || session.paused || document.hidden || dialog.open) return;
  const before=session.current,signature=JSON.stringify([before?.appearance,before?.stage,before?.resolved]);
  updateStudy(transition(session,{type:'tick',ms}));
  const after=session.current,next=JSON.stringify([after?.appearance,after?.stage,after?.resolved]);
  if (signature!==next) {save();render(); if(before?.appearance!==after?.appearance){closeTermPop();$('#stem')?.focus({preventScroll:true});} else placeTermPop();}
  else updateTrack();
  if(now-lastSaved>=1000){save();lastSaved=now;}
},200);
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){hiddenWasRunning=step==='study'&&session&&!session.paused;if(hiddenWasRunning)send({type:'pause'},false);}
  else{last=performance.now();if(hiddenWasRunning&&step==='study'&&!dialog.open)send({type:'resume'});hiddenWasRunning=false;examTick();}
});
window.addEventListener('pagehide',()=>{if(session){session=transition(session,{type:'pause'});save();}});
try {
  // Offline copy: not awaited, never blocks or fails the start. Where workers are unavailable (an embedding
  // page, private modes) the app runs from the network as before.
  // A page that started without the worker (first visit, after the recovery page, a reload past the worker) tells
  // it which build runs here. When the network returns or the tab is shown again, the page asks the worker to
  // complete or repair its copy.
  try { const fresh=!navigator.serviceWorker.controller,tell=message=>navigator.serviceWorker.ready.then(r=>r.active?.postMessage(message)).catch(()=>{});
    navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(()=>{if(fresh)tell({type:'stage',files:releaseFiles});}).catch(()=>{});
    window.addEventListener('online',()=>tell({type:'fill'}));document.addEventListener('visibilitychange',()=>{if(!document.hidden)tell({type:'fill'});}); } catch {}
  bank=validateBank(await fetchJson('./questions.json'));
  // Only blocks with questions show anywhere in the app.
  bank.blocks=bank.blocks.filter(b=>bank.questions.some(q=>q.block===b.id));
  lastBlock=servedBlock(read('lastBlock',null))?read('lastBlock',null):null;
  blockId=lastBlock??bank.blocks[0].id; units=allUnits();
  const saved=read('session'), scholarSaved=saved?.mode==='Scholar';
  session=scholarSaved?null:restoreSession(await migrateSession(saved,bank),bank);
  if(lastBlock===null&&session)noteBlock(session.questions[0]?.block); // upgrade: an open session names the last block
  if(scholarSaved){persist('session',null);notice('Your session from an older Scholar mode was closed; its answers stay in your stats.');}
  if(session&&!POOL_KINDS.includes(session.poolKind))delete session.poolKind;
  understanding=migrateLearning(understanding,bank);saveUnderstanding();
  missedReview=restoreReview(migrateReview(read('missedReview'),bank),bank);
  if(session){updateStats();save();const missing=sessionMissedIds(session).filter(id=>!understandingRecord(understanding,session.version,id));if(missing.length){understanding=markMissed(understanding,session.version,missing,new Date().toISOString());saveUnderstanding();}}
  if(saved&&!session&&!scholarSaved)notice('The saved session is incompatible or damaged. Start a new session; review notes are kept.');
  // Exam: restore it; a deadline that passed while the app was closed submits it at 0:00 and opens its results.
  examHistory=restoreHistory(read('examHistory',[]));
  // Form cycle: schema 1 as saved, or rebuilt from history when missing or unreadable (then saved).
  { const raw=read('examCycle',null);examCycles=restoreCycles(raw,examHistory,bank);if(JSON.stringify(raw)!==JSON.stringify(examCycles))persist('examCycle',examCycles); }
  const savedExam=read('exam');exam=restoreExam(savedExam,bank);
  if(savedExam&&!exam){persist('exam',null);notice('The saved exam does not match this question set and was closed.');}
  if(exam){
    const wasLive=examLive(exam);exam=settleExam(exam,Date.now());
    if(exam.submitted){finalizeExam();resultsKind=sessionDone()&&!wasLive?'study':'exam';if(wasLive){step='exam-results';examFilter='missed';blockId=exam.block;units=allUnits();}}
    else{step='exam';blockId=exam.block;units=allUnits();}
  }
  $('#app-version').textContent=`ICF Companion v${APP_VERSION} · 18 Nov 2026`;
  render();loadExtras().catch(()=>{});  // optional data never stops the app
} catch (error) {
  // Offline is the likely cause only when the browser reports it; Diagnostics needs a bank.
  const offline=navigator.onLine===false;
  main.innerHTML=`<h1>Study content could not be opened.</h1><p>${offline?'You are offline. Connect to the Internet, then reload.':'Reload the page. If this message stays, your saved progress is still on this device.'}</p><div class="actions"><button class="primary" id="reload-app">Reload</button></div>`;
  $('#reload-app').onclick=()=>location.reload();
  document.querySelectorAll('[data-screen-link]').forEach(b=>b.setAttribute('aria-disabled','true'));
}

if('ResizeObserver' in window)new ResizeObserver(()=>{if(step==='scholar'&&scholarState?.item){const it=itemById(scholar,scholarState.item);holdScholarHeights(it,it?.questions[scholarState.q]);}}).observe(main);
document.fonts?.ready.then(()=>{scholarHold.clear();if(step==='scholar'&&scholarState?.item){const it=itemById(scholar,scholarState.item);holdScholarHeights(it,it?.questions[scholarState.q]);}});
