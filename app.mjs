// App start-up and wiring: reads the saved data, sets the shared state (app-state.mjs), binds the page-wide controls
// (header, gear menu, keys, scroll), loads questions.json and the save migrations, restores the session and exam, and
// draws the first screen. Each screen and concern lives in its own module (session, nav, setup-ui, study-ui, cards-ui,
// scholar-ui, glossary-ui, exam-ui, flags, data-load).
// Inputs: browser storage and the site's own files. Outputs: the running app. Run: index.html loads it as a module.
// Network: the site's own files only (the question file and the save migrations; the rest through data-load.mjs) and
// the offline worker sw.js. Writes: browser storage through persist() and the page DOM. Credentials: none.
import { withFeatures } from './features.mjs';
import { APP, DEFAULTS, FEATURES } from './settings.mjs';
import { shared } from './app-state.mjs';
import { POOL_KINDS, inspectStats, toPoolKind } from './analytics.mjs';
import { persistCardSets } from './cards-ui.mjs';
import { fetchJson, loadExtras } from './data-load.mjs';
import { APP_VERSION } from './diagnostics.mjs';
import { transition } from './engine.mjs';
import { examTick, finalizeExam, sendExam, showExamQuestion } from './exam-ui.mjs';
import { examLive, restoreCycles, restoreExam, restoreHistory, settleExam } from './exam.mjs';
import { installStudyKeys } from './faststart.mjs';
import { diagnostics, download, flagCard, flagQuestion, resetLocalData, writeFlags } from './flags.mjs';
import { restoreCardSets } from './flashcards.mjs';
import { closeTermPop, placeTermPop } from './glossary-ui.mjs';
import { markMissed, restoreReview, restoreUnderstanding, sessionMissedIds, understandingRecord } from './learning.mjs';
import { INTENT_MS, MAIN_SCREEN, TOP_REVEAL, confirmDialog, dropKey, returnDialogFocus, intent, keepTopBar, navOnly, navigate, openDrops, phoneBars, render, screenAvailable, setDrop, showDialog, studyTarget, topRow, updateTopRow } from './nav.mjs';
import { toolsMenu } from './presentation.mjs';
import { openScholar } from './scholar-ui.mjs';
import { itemById } from './scholar.mjs';
import * as screens from './screens.mjs';
import { allSections, noteGroup, pauseStudy, resumeStudy, save, saveUnderstanding, send, servedGroup, sessionDone, sessionOpen, updateStats, updateStudy } from './session.mjs';
import { migrateLearning, migrateReview, migrateSession, persistence, restoreSession, savedBoolean, validateBank, withMigrations } from './storage.mjs';
import { holdScholarHeights, positionStudyQuestion, scholarHold, updateTrack } from './study-ui.mjs';
// Short for document.querySelector: return the first page element that matches the selector.
export const $ = s => document.querySelector(s);
export const main = $('#main'), dialog = $('#dialog');

try { shared.local = window.localStorage; } catch { shared.local = { getItem(){throw Error();}, setItem(){throw Error();}, removeItem(){throw Error();} }; }
export const store = persistence(shared.local);
// Read one saved value through the storage layer; show the storage notice when the read fails and return the value or fallback.
export function read(key, fallback) { const r = store.read(key, fallback); if (r.error) notice(r.error); return r.value; }
// Show a message in the page's storage notice area; an empty message clears it.
export function notice(message) { $('#storage-notice').textContent = message || ''; }
// Write one saved value. A failed write shows the storage notice and returns false; success leaves other notices in place.
export function persist(key, value) { const error = store.write(key, value); if (error) notice(error); return !error; }
shared.theme=window.icfTheme.choice;
// Dark theme switch: a row of the gear menu (the light/dark toggle sits with the other settings).
const themeSwitch=document.querySelector('#settings-dark');
// Set the dark theme switch in the gear menu to match the theme that is active on the page.
export const syncThemeSwitch=()=>{if(themeSwitch)themeSwitch.checked=document.documentElement.dataset.theme==='dark';};
if(themeSwitch){syncThemeSwitch();themeSwitch.onchange=()=>{shared.theme=themeSwitch.checked?'dark':'light';window.icfTheme.set(shared.theme);syncThemeSwitch();persist('theme',shared.theme);};
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>setTimeout(syncThemeSwitch));}
shared.pinQuestion=savedBoolean(read('pinQuestion',true),true);
document.documentElement.dataset.pinQuestion=String(shared.pinQuestion);
// Copy the current header height into the --header-height CSS variable so the page layout can use it.
const updateHeaderHeight=()=>document.documentElement.style.setProperty('--header-height',`${Math.ceil($('header').getBoundingClientRect().height)}px`);
updateHeaderHeight();
if('ResizeObserver' in window)new ResizeObserver(updateHeaderHeight).observe($('header'));
else window.addEventListener('resize',updateHeaderHeight);
const rawProfile = read('profile', {});
shared.profile={ nickname: typeof rawProfile?.nickname === 'string' ? rawProfile.nickname.slice(0,40) : '', visited: rawProfile?.visited === true };
shared.flags=read('flags', {});
if (!shared.flags || typeof shared.flags !== 'object' || Array.isArray(shared.flags) || Object.values(shared.flags).some(f => !f || typeof f.questionId !== 'string' || typeof f.version !== 'string' || !Array.isArray(f.answerIds) || f.answerIds.some(id => typeof id !== 'string') || typeof f.note !== 'string' || !f.assessment)) { shared.flags = {}; notice('Review notes could not be restored.'); }

try { shared.understanding=restoreUnderstanding(read('understanding',{})); } catch { shared.understanding={};notice('Understanding history could not be restored. New decisions will be kept on this device.'); }
// Question pool: Random or Smart in icf:poolKind; an older save kept Smart Mode as a boolean in icf:smart.

{ const r=inspectStats(read('stats',null));shared.stats=r.stats;
  if(r.reset)notice('Question stats could not be read and were reset. Other progress is unchanged.');
  else if(r.dropped)notice(`${r.dropped} damaged question stats record${r.dropped===1?' was':'s were'} removed. The other stats are unchanged.`); }
shared.poolKind=toPoolKind(read('poolKind',null),read('smart',false));
// Glossary (glossary.json, loaded after the first screen; the app works without it): screen state and the open term popover.
// glossReturn: 'flash-card' when the entry was opened from a card, so the Glossary offers the way back to that card.
shared.examNavOpen=false;
shared.glossary=null;shared.glossQuery='';shared.glossSection=0;shared.glossEntry=null;shared.termPop=null;shared.glossGroup='unit';shared.glossReturn=null;
shared.targetedPoolSize='all';
// Scholar (the index scholar.json loads after the first screen, a block's file when its Scholar opens; the app works without them). scholarState: the saved place (icf:scholar).
// scholarReturn: {to:'glossary', entry} or {to:'flash-card'} when an item was opened from there (a way back).
// lastPlace: 'quiz' | 'scholar', the one the user was in last (the nav context button).
shared.scholar=null;shared.scholarState=null;shared.scholarReturn=null;shared.lastPlace=null;
// The term picture's step or chosen part, for the term on screen only (not saved).
// prev: the state before the last picture move, so that one render animates (then null: other re-renders do not replay it).
shared.scholarPic={item:null,index:0,prev:null};
// The picture is open or collapsed for every term until the page closes (not saved).
// Open or closed term-page sections (picture, deeper, analogy, scenario, example, questions), until the page closes.
shared.scholarOpen={};
// Guided-question hints shown (question ids), until the page closes; a hint is help, not a score.
export const scholarHints=new Set();
// Unit review: {block, unit, deck: [{item, q}], k, picks}; in memory only (practice; never saved or scored).
shared.scholarReview=null;export const reviewHints=new Set(),reviewDraft=new Map();
// Order and sort tasks: the arrangement being built, per question id (not saved; a check is saved as a try).
export const scholarDraft=new Map();
// The term whose section state was set: on a term's first visit every section is open, on later visits the reading
// sections start closed so the guided question sits near the top.
shared.scholarOpenFor=null;
shared.scholarPicOpen=null;  // an umbrella opened for a covered entry: its picture section opens even on a return visit
// scholarSay: set by a pick, so that the next render announces the answer line once. scholarQuery: the term list's search text (not saved).
shared.scholarSay=false;shared.scholarQuery='';
// Picture loop: on unless the
// reader paused it with the button (kept for every term until the page closes) or asked for reduced motion. A manual step
// or part pauses only the term on screen (scholarPic.manual). picMs per step (caption length).
shared.scholarPlay=!window.matchMedia('(prefers-reduced-motion: reduce)').matches;shared.picTimer=null;
shared.flashPreview=null;shared.flashSetId=null;shared.flashMessage='';
// Card source on setup, Saved-sets screen state and Dynamic Flash Cards.
shared.pickSetId=null;shared.setsReturn='blocks';shared.pendingCard=null;shared.cardCatalog=null;
// The card file (cards.json, data-load.loadCards): its cards once in (cardData), its load in flight (cardLoad), and the
// missed questions that wait for it to reach Missed Questions (missedWaiting: question ID to its answer's SAVE key; this
// page only).
shared.cardData=null;shared.cardLoad=null;shared.missedWaiting=new Map();
// Saved sets block filter: the current block by default; a choice holds while that block stays current.
shared.setsView=null;
shared.dynamicCards=read('dynamicCards', true) !== false;
// Card sets: Missed Questions and Manual. An older library (schema 1 or 2) migrates on load and is saved at once
// as schema 3; damaged data is left in storage untouched until the next card change.
shared.cardSetsRead=false;
{ const raw = read('cardSets', null);
  try { shared.cardSets = restoreCardSets(raw ?? undefined); shared.cardSetsRead = true; if (raw && raw.schema !== shared.cardSets.schema) persist('cardSets', shared.cardSets); }
  catch { shared.cardSets = restoreCardSets(); notice('Saved card sets could not be read. Other progress is unchanged.'); } }
shared.missedReview=null;shared.quizScope='all';
// Exam Mode: the live or last submitted exam (icf:exam), its history (icf:examHistory) and the form cycle (icf:examCycle).
// The old question mix (icf:examMix, icf:examHard) is no longer read: exams are drawn by form.
// resultsKind: which results the Results tab opens (the latest finished study session or exam).
shared.reviewOpen=new Set();shared.exam=null;shared.examOpen=new Set();shared.examHistory=[];shared.examCycles={schema:1,blocks:{}};shared.examFilter='missed';shared.resultsKind='study';shared.examAnnounced=null;
// Source excerpts: modules and the excerpt asset load only on demand (a resolved question or a review).
shared.excerptKit=null;shared.excerptKitLoad=null;shared.linkData=null;shared.linkLoad=null;shared.linkFailed=false;export const EXCERPT_SCREENS=['study','results','missed-review','exam-results','flash-card'];  // screens that can show a source excerpt or key terms
shared.lastStudy=null;
shared.session=null;shared.step=shared.profile.visited ? 'blocks' : 'welcome';shared.groupId=null;shared.sections=[];shared.poolSize=DEFAULTS.poolSize;shared.filter=DEFAULTS.filter;shared.mode=DEFAULTS.mode;
shared.last=performance.now();shared.modalWasRunning=false;shared.hiddenWasRunning=false;shared.lastSaved=0;
// Last studied block: saved when a question session, a block's flash cards, an exam or a
// marked review starts. Opening a block's Mode screen or the Glossary does not count. The Blocks list
// opens this block; an unknown block or one without questions falls back to the first block.
shared.lastGroup=null;
// The block whose Previous Attempts the For Review box opened; null shows every block.
shared.attemptsGroup=null;
// An open gear menu pauses the question; closing it resumes.
shared.menuWasRunning=false;
export const tools=toolsMenu({toggle:$('#tools-toggle'),panel:$('#tools-panel'),onChange:open=>{
  if(open&&!shared.menuWasRunning&&shared.step==='study'&&shared.session&&!shared.session.paused){shared.menuWasRunning=true;send({type:'pause'},false);}
  else if(!open&&shared.menuWasRunning){shared.menuWasRunning=false;if(shared.step==='study'&&shared.session&&!shared.session.ended)send({type:'resume'},false);}
}});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&tools.isOpen()){tools.close();$('#tools-toggle').focus({preventScroll:true});}});
// Exam keys (exam screen only, never while typing, in a dialog or the gear menu): 1–4 answer, F flag, Left/Right move.
document.addEventListener('keydown',event=>{
  if(shared.step!=='exam'||!examLive(shared.exam)||dialog.open||tools.isOpen()||event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||event.repeat&&!/^Arrow/.test(event.key))return;
  if(event.target?.closest?.('input,textarea,select,[contenteditable=""],[contenteditable="true"]'))return;
  let ev=null;
  if(/^[1-9]$/.test(event.key)){const id=shared.exam.orders[shared.exam.pool[shared.exam.index]][Number(event.key)-1];if(!id)return;ev={type:'answer',id};}
  else if(event.key==='f'||event.key==='F')ev={type:'flag'};
  else if(event.key==='ArrowLeft')ev={type:'previous'};
  else if(event.key==='ArrowRight')ev={type:'next'};
  else return;
  event.preventDefault();
  const index=shared.exam.index;sendExam(ev);
  if(shared.step==='exam'&&shared.exam.index!==index){$('#exam-stem')?.focus({preventScroll:true});showExamQuestion();}
});
document.addEventListener('pointerdown',event=>{if(tools.isOpen()&&!event.target.closest('header'))tools.close();}); installStudyKeys(()=>shared.step==='study'&&sessionOpen()&&!shared.session.paused&&shared.session.viewIndex==null&&!dialog.open&&!tools.isOpen(),()=>main.querySelectorAll('[data-answer]'));  // study keys 1-4
$('#tools-panel').addEventListener('click',event=>{if(event.target.closest('button'))tools.close();});
// An empty section choice the reader made survives one Random/Smart redraw of the Mode screen (setup-ui.renderMode).
shared.keepEmptySections=false;
// Card writes go through this store (see flashcards.mjs, Saving cards).
export const cardStore={library:()=>shared.cardSets,commit:next=>persistCardSets(next),fail:notice};
// SAVE: the button toggles the card in Manual. The polite status line announces the change; a short
// viewport toast shows it (aria-hidden, fixed near the bottom, so it covers no content beside the button) and hides after 2 s.
shared.saveNoteTimer=0;
dialog.addEventListener('close', () => { returnDialogFocus(); if (shared.modalWasRunning && shared.step === 'study' && !shared.session.ended) send({type:'resume'}); shared.modalWasRunning = false; });
$('#help').onclick = () => showDialog('How to use', screens.helpHtml());
$('#reviews').onclick = () => {
  if (!shared.bank) { notice('Diagnostics needs the study content. Reload the page.'); return; }
  const n = Object.keys(shared.flags).length;
  showDialog('Diagnostics', screens.diagnosticsHtml(shared.flags, shared.bank), () => {
    $('#download-flags').onclick=()=>download(JSON.stringify(diagnostics(),null,2),'icf-diagnostics.json');
    $('#copy-flags').onclick=async()=>{try{await navigator.clipboard.writeText(JSON.stringify(diagnostics(),null,2));$('#copy-status').textContent='Copied.';}catch{$('#copy-status').textContent='Copy is unavailable. Use Download.';}};
    dialog.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{
      const f=shared.flags[b.dataset.edit],q=shared.bank.questions.find(q=>q.id===f.questionId);
      if(q&&f.version===shared.bank.version) { if(f.target==='card')flagCard(q,f.card);else flagQuestion(q); }
      else showDialog('Saved diagnostic note',screens.oldNoteHtml(f),()=>{$('#clear-old-note').onclick=()=>{if(writeFlags(b.dataset.edit,null))dialog.close();};},{label:f.questionId});
    });
  }, {label:`${n} saved ${n===1?'note':'notes'}`});
};
// Settings live in the gear menu: the pin switch saves when toggled; Delete Local Data asks first.
$('#settings-pin-question').checked=shared.pinQuestion;
$('#settings-pin-question').onchange=event=>{shared.pinQuestion=event.target.checked;document.documentElement.dataset.pinQuestion=String(shared.pinQuestion);persist('pinQuestion',shared.pinQuestion);};
$('#reset').onclick = () => { tools.close(); confirmDialog('Delete local data', 'Deletes your nickname, sessions, exams and exam history, scores, settings, saved card sets and review notes on this device. Export notes first: Diagnostics, then Download.', 'Delete', resetLocalData, 'This device'); };
$('#home').onclick = e => { e.preventDefault(); tools.close(); if(examLive(shared.exam)){if(shared.step!=='exam')navigate('exam');return;} pauseStudy(); navigate('welcome'); };
$('#context-link')?.addEventListener('click',()=>{
  const to=$('#context-link').dataset.context;if(!shared.bank||!to||examLive(shared.exam))return;tools.close();
  if(to==='quiz'&&sessionOpen()){resumeStudy();positionStudyQuestion();return;}
  if(to==='scholar'&&shared.scholarState)openScholar(null,shared.scholarReturn,shared.scholarState.block,pauseStudy);  // loads the place's block file first
});
document.querySelectorAll('[data-screen-link]').forEach(link => link.addEventListener('click', () => {
  const id = link.dataset.screenLink;
  if (!shared.bank || !screenAvailable(id) || MAIN_SCREEN[id]?.includes(shared.step) || examLive(shared.exam)) return;
  if (id === 'study') { const to = studyTarget(); if (!to || shared.step === to) return; tools.close(); pauseStudy();
    if (to === 'study') { resumeStudy(); positionStudyQuestion(); } else navigate(to); return; }
  tools.close();
  pauseStudy();
  if (id === 'results' && (shared.exam?.submitted && (shared.resultsKind === 'exam' || !sessionDone()))) { if (shared.step !== 'exam-results') navigate('exam-results'); return; }
  if (!shared.groupId) shared.groupId = shared.bank.blocks[0].id;
  navigate(id);
}));
shared.lastScrollY=0;shared.upRun=0;shared.intentUpAt=0;shared.touchY=null;
window.addEventListener('touchstart', e => { shared.touchY = e.touches[0]?.clientY ?? null; }, {passive:true});
window.addEventListener('touchmove', e => { const y = e.touches[0]?.clientY; if (shared.touchY === null || y === undefined) return; if (Math.abs(y - shared.touchY) >= 2) { intent(y > shared.touchY); shared.touchY = y; } }, {passive:true});
window.addEventListener('wheel', e => { if (e.deltaY) intent(e.deltaY < 0); }, {passive:true});
window.addEventListener('keydown', e => { if (e.target.closest?.('input, textarea, select, button, [contenteditable]')) return;
  if (['ArrowUp','PageUp','Home'].includes(e.key) || e.key === ' ' && e.shiftKey) intent(true); else if (['ArrowDown','PageDown','End',' '].includes(e.key)) intent(false); });
updateTopRow(); window.addEventListener('resize', () => { updateTopRow(); if (!phoneBars()) navOnly(false); });
window.addEventListener('scroll', () => {
  const y = window.scrollY;
  // At the top the first row shows: below its height a hidden first row would leave a gap over the page.
  if (keepTopBar() || y <= topRow()) { navOnly(false); shared.lastScrollY = y; shared.upRun = 0; return; }
  const dy = y - shared.lastScrollY;
  if (Math.abs(dy) < 4) return;
  shared.lastScrollY = y;
  if (dy > 0) { navOnly(true); shared.upRun = 0; return; }
  if (Date.now() - shared.intentUpAt > INTENT_MS) { shared.upRun = 0; return; }
  shared.upRun -= dy;
  if (shared.upRun >= TOP_REVEAL) navOnly(false);
}, {passive:true});
 shared.dropScope='';
document.addEventListener('click', e => {
  const toggle = e.target.closest?.('[data-drop]'); if (!toggle || !main.contains(toggle)) return;
  const open = toggle.getAttribute('aria-expanded') !== 'true', key = dropKey(toggle);
  setDrop(toggle, open); if (open) openDrops.add(key); else openDrops.delete(key);
});
// Set by a flip click so the next card render starts edge-on and turns into view.
shared.flipIn=false;
shared.scholarPending=null;  // a saved place whose block file is not here yet (still loading, or it failed at an offline start)
// Counts the Scholar opens (scholar-ui.openScholar): a newer open, or a move to another screen while a block file loads,
// cancels the older open, so there is no late jump into Scholar.
shared.scholarOpenSeq=0;
// An open term popover pauses the question like the gear menu; Tab out of it closes it.
shared.termWasRunning=false;
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&shared.termPop){e.preventDefault();closeTermPop();}});
// Term links in running text are spans with role="button": Enter and Space act like a click.
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches?.('span.term-link')){e.preventDefault();e.target.click();}});
document.addEventListener('pointerdown',e=>{if(shared.termPop&&!shared.termPop.el.contains(e.target)&&!e.target.closest('.term-link'))closeTermPop();});
// Each data URL carries this build's content hash (index.html, #release-files), so code and data always match and
// sw.js can keep a checked offline copy. Without the list (a host that serves the files as they are) the plain path is used.
export const releaseFiles=(()=>{try{return JSON.parse(document.getElementById('release-files').textContent);}catch{return {};}})();
setInterval(()=>{
  examTick();
  const now=performance.now(),ms=now-shared.last;shared.last=now;
  if (!shared.session || shared.step!=='study' || shared.session.paused || document.hidden || dialog.open) return;
  const before=shared.session.current,signature=JSON.stringify([before?.appearance,before?.stage,before?.resolved]);
  updateStudy(transition(shared.session,{type:'tick',ms}));
  const after=shared.session.current,next=JSON.stringify([after?.appearance,after?.stage,after?.resolved]);
  if (signature!==next) {save();render(); if(before?.appearance!==after?.appearance){closeTermPop();$('#stem')?.focus({preventScroll:true});} else placeTermPop();}
  else updateTrack();
  if(now-shared.lastSaved>=1000){save();shared.lastSaved=now;}
},200);
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){shared.hiddenWasRunning=shared.step==='study'&&shared.session&&!shared.session.paused;if(shared.hiddenWasRunning)send({type:'pause'},false);}
  else{shared.last=performance.now();if(shared.hiddenWasRunning&&shared.step==='study'&&!dialog.open)send({type:'resume'});shared.hiddenWasRunning=false;examTick();}
});
window.addEventListener('pagehide',()=>{if(shared.session){shared.session=transition(shared.session,{type:'pause'});save();}});
try {
  // Offline copy: not awaited, never blocks or fails the start; without workers (an embedding page, private modes) the app runs from the network.
  // A page that started without the worker (first visit, after the recovery page, a reload past the worker) tells
  // it which build runs here. When the network returns or the tab is shown again, the page asks the worker to
  // complete or repair its copy.
  try { const fresh=!navigator.serviceWorker.controller,tell=message=>navigator.serviceWorker.ready.then(r=>r.active?.postMessage(message)).catch(()=>{});
    // A new worker waits (sw.js rule 5): a page start is the safe point for it to take over (now, or once it is installed).
    const activate=worker=>{const go=()=>worker.state==='installed'&&(worker.postMessage({type:'activate'}),true);if(worker&&!go())worker.addEventListener('statechange',go);};navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>{activate(r.waiting||r.installing);if(fresh)tell({type:'stage',files:releaseFiles,build:Number(document.querySelector('meta[name="icf-build"]')?.content)||0});}).catch(()=>{});
    window.addEventListener('online',()=>tell({type:'fill'}));document.addEventListener('visibilitychange',()=>{if(!document.hidden)tell({type:'fill'});}); } catch {}
  shared.bank=validateBank(withFeatures(await fetchJson('./questions.json')));
  // Only blocks with questions show anywhere in the app.
  shared.bank.blocks=shared.bank.blocks.filter(b=>shared.bank.questions.some(q=>q.block===b.id));
  shared.lastGroup=servedGroup(read('lastBlock',null))?read('lastBlock',null):null;
  shared.groupId=shared.lastGroup??shared.bank.blocks[0].id; shared.sections=allSections();
  const saved=read('session'), scholarSaved=saved?.mode==='Scholar', savedExam=read('exam');
  // Save migrations load only for a session or exam saved on an older version. Held (offline, a failed or damaged file): both saves stay stored, nothing is restored, the next start tries again.
  // Save migrations switched off: an older save is not restored and nothing is held.
  const opened=FEATURES.legacyMigrations?await withMigrations(shared.bank,[scholarSaved?null:saved,savedExam],()=>fetchJson('./migrations.json')):{bank:shared.bank,held:false},held=opened.held;shared.bank=opened.bank;shared.session=scholarSaved||held?null:restoreSession(await migrateSession(saved,shared.bank),shared.bank);
  if(shared.lastGroup===null&&shared.session)noteGroup(shared.session.questions[0]?.block); // upgrade: an open session names the last block
  if(scholarSaved){persist('session',null);notice('Your session from an older Scholar mode was closed; its answers stay in your stats.');}
  if(shared.session&&!POOL_KINDS.includes(shared.session.poolKind))delete shared.session.poolKind;
  shared.understanding=migrateLearning(shared.understanding,shared.bank);saveUnderstanding();
  shared.missedReview=restoreReview(migrateReview(read('missedReview'),shared.bank),shared.bank);
  if(shared.session){updateStats();save();const missing=sessionMissedIds(shared.session).filter(id=>!understandingRecord(shared.understanding,shared.session.version,id));if(missing.length){shared.understanding=markMissed(shared.understanding,shared.session.version,missing,new Date().toISOString());saveUnderstanding();}}
  if(saved&&!shared.session&&!scholarSaved&&!held)notice('The saved session is incompatible or damaged. Start a new session; review notes are kept.');
  // Exam: restore it; a deadline that passed while the app was closed submits it at 0:00 and opens its results.
  shared.examHistory=restoreHistory(read('examHistory',[]));
  // Form cycle: schema 1 as saved, or rebuilt from history when missing or unreadable (then saved).
  { const raw=read('examCycle',null);shared.examCycles=restoreCycles(raw,shared.examHistory,shared.bank);if(JSON.stringify(raw)!==JSON.stringify(shared.examCycles))persist('examCycle',shared.examCycles); }
  shared.exam=held?null:restoreExam(savedExam,shared.bank);if(savedExam&&!shared.exam&&!held){persist('exam',null);notice('The saved exam does not match this question set and was closed.');}else if(held)notice('Your saved session or exam could not be opened yet. It stays on this device; reload when you are online.');
  if(shared.exam){
    const wasLive=examLive(shared.exam);shared.exam=settleExam(shared.exam,Date.now());
    if(shared.exam.submitted){finalizeExam();shared.resultsKind=sessionDone()&&!wasLive?'study':'exam';if(wasLive){shared.step='exam-results';shared.examFilter='missed';shared.groupId=shared.exam.block;shared.sections=allSections();}}
    else{shared.step='exam';shared.groupId=shared.exam.block;shared.sections=allSections();}
  }
  $('#app-version').textContent=`${APP.name} v${APP_VERSION} · 23 Nov 2026`;
  render();loadExtras().catch(()=>{});  // optional data never stops the app
} catch (error) {
  // Offline is the likely cause only when the browser reports it; Diagnostics needs a bank.
  const offline=navigator.onLine===false;
  main.innerHTML=`<h1>Study content could not be opened.</h1><p>${offline?'You are offline. Connect to the Internet, then reload.':'Reload the page. If this message stays, your saved progress is still on this device.'}</p><div class="actions"><button class="primary" id="reload-app">Reload</button></div>`;
  $('#reload-app').onclick=()=>location.reload();
  document.querySelectorAll('[data-screen-link]').forEach(b=>b.setAttribute('aria-disabled','true'));
}

if('ResizeObserver' in window)new ResizeObserver(()=>{if(shared.step==='scholar'&&shared.scholarState?.item){const it=itemById(shared.scholar,shared.scholarState.item);holdScholarHeights(it,it?.questions[shared.scholarState.q]);}}).observe(main);
document.fonts?.ready.then(()=>{scholarHold.clear();if(shared.step==='scholar'&&shared.scholarState?.item){const it=itemById(shared.scholar,shared.scholarState.item);holdScholarHeights(it,it?.questions[shared.scholarState.q]);}});
