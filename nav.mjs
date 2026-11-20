// Navigation: moving between screens, the header screen links, the dialogs and the phone header rows.
// Why: every screen change goes through navigate() and render(), which pick the screen module to draw.
// Inputs: the step and other fields of the shared state, the page DOM. Outputs: the drawn screen, dialogs, header state.
// Run: loaded by the browser as part of the app; the screens call it, and render() calls them back.
// Network: none.
// Writes: the page DOM and the shared state; the profile name in browser storage through persist(); no other storage.
// Credentials: none.
import { shared } from './app-state.mjs';
import { $, dialog, main, persist, tools } from './app.mjs';
import { renderFlashCards, renderSavedCardSets } from './cards-ui.mjs';
import { eligible, questionsForMode } from './engine.mjs';
import { renderExam, renderExamResults } from './exam-ui.mjs';
import { examLive } from './exam.mjs';
import { FIRST_SESSION_MODE, FIRST_SESSION_ORDER, FIRST_SESSION_SIZE, firstRun, renderFirstBlock } from './faststart.mjs';
import { renderGlossary } from './glossary-ui.mjs';
import { ICON, escape } from './presentation.mjs';
import { renderScholar } from './scholar-ui.mjs';
import { contextTarget } from './scholar.mjs';
import * as screens from './screens.mjs';
import { allSections, resumeStudy, selectQuestions, send, sessionDone, sessionOpen, startSession, viewed } from './session.mjs';
import { renderGroups, renderCardsSetup, renderExamSetup, renderHub, renderMode, renderNotUnderstoodSetup } from './setup-ui.mjs';
import { positionStudyQuestion, renderMissedReview, renderPreviousAttempts, renderResults, renderStudy } from './study-ui.mjs';

// True on a phone-width window (760 px or narrower).
const mobileNavigation = () => window.matchMedia('(max-width: 760px)').matches;
// On phones, moves focus and scroll to the top of the new screen, or to the question on the study screen.
export function resetNavigationView() {
  if (!mobileNavigation()) return;
  if (shared.step === 'study') { positionStudyQuestion(); return; }
  const target = main.querySelector('#flash-card, #review-stem, h1') || main;
  target.focus({preventScroll:true});
  window.scrollTo({top:0,behavior:'instant'});
}
// Labels the screen's bottom action row as a group named "Screen navigation".
function mountNavigationBar() {
  const action = main.querySelector('#units-next, #mode-next, #practice-confirm, #review-next');
  const bar = main.querySelector('.question-actions') || action?.closest('.actions');
  bar?.setAttribute('role','group');
  bar?.setAttribute('aria-label','Screen navigation');
}
// Wide screens: centre the sheet (first) through its navigation row (last) under the sticky bars. Phones and short
// windows use resetNavigationView and positionQuestion instead.
// instant: no smooth scroll (entering a quiz replaces the whole screen, so there is nothing to follow).
export function centreSheet(first, last, {cover = headerHeight(), instant = false} = {}) {
  if (window.matchMedia('(max-width: 760px), (max-height: 500px)').matches) return;
  const a = main.querySelector(first), b = main.querySelector(last) || a; if (!a) return;
  const top = screens.centredScroll({top:a.getBoundingClientRect().top, bottom:b.getBoundingClientRect().bottom, scrollY:window.scrollY, coverTop:cover, viewHeight:window.innerHeight, maxScroll:document.documentElement.scrollHeight-window.innerHeight});
  window.scrollTo({top, behavior:instant||window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}
// Programmatic focus target: a heading takes tabindex=-1 so screen readers hear the screen or entry name.
export function focusHeading(h) { if (!h) return false; h.tabIndex = -1; h.focus({preventScroll:true}); return true; }
// Shows the screen named next, focuses its heading and resets the view position on phones.
export function navigate(next) { shared.step = next; render(); if (!focusHeading(main.querySelector('h1'))) main.focus({preventScroll:true}); resetNavigationView(); }
// The questions that can be studied now: the mode, units, filter and block applied to the bank.
export const available = (selectedMode=shared.mode) => eligible(questionsForMode(shared.bank.questions,selectedMode), shared.sections, shared.filter, shared.groupId);
/**
 * Opens the dialog with the panel head (mono label over the title) and one action row; Close joins the body's last .actions row.
 * @param {string} title the dialog title
 * @param {string} body the HTML of the dialog body
 * @param {Function} bind called after the HTML is in place, to attach handlers
 * @param {object} [options] the options object
 * @param {string} [options.label] a small label above the title
 * @param {boolean} [options.closeFirst] put Close at the left and the action at the right
 * @param {string} [options.tone] a tone name set on the dialog
 */
export function showDialog(title, body, bind = () => {}, {label = '', closeFirst = false, tone = ''} = {}) {
  shared.modalWasRunning = shared.modalWasRunning || shared.step === 'study' && shared.session && !shared.session.paused;
  if (shared.modalWasRunning) send({type:'pause'}, false);
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
export function confirmDialog(title, text, action, run, label = '') {
  showDialog(title, `<p>${text}</p><div class="actions"><button class="danger fill" id="confirm-action">${escape(action)}</button></div>`, () => { $('#confirm-action').onclick = () => { dialog.close(); run(); }; }, {label});
  $('#close-dialog').focus();
}
// Nav bar: Blocks · Mode · Study · Results. Unavailable items stay visible and disabled. Study is one link for Questions,
// Cards and Glossary: it opens the one used last. A lit item on a sub-screen (a setup, Saved card sets, Previous
// Attempts) opens its section's main screen; only on the main screen itself does a tap do nothing.
const SCREEN_OF={blocks:'blocks','first-block':'blocks','saved-card-sets':'blocks',units:'units','not-understood-setup':'units',mode:'units','cards-setup':'units','exam-setup':'units',exam:'units',scholar:'units',glossary:'study',study:'study','flash-card':'study','missed-review':'results',results:'results','exam-results':'results','previous-attempts':'results'};
// Saved card sets belongs to the section it was opened from (Blocks, or Mode through the Cards setup).
const sectionOf = at => at === 'saved-card-sets' ? (shared.setsReturn === 'units' ? 'units' : 'blocks') : SCREEN_OF[at];
export const MAIN_SCREEN = {blocks:['blocks'], units:['units'], results:['results','exam-results']};
// The screen the Study link opens: the one used last if it is open, else the first open one, else null.
export const studyTarget=()=>{const ok={study:sessionOpen(),'flash-card':Boolean(shared.flashPreview),glossary:Boolean(shared.glossary&&shared.groupId)};if(shared.lastStudy&&ok[shared.lastStudy])return shared.lastStudy;return ['study','flash-card','glossary'].find(k=>ok[k])||null;};
// True when the header link for this screen can be used now.
export function screenAvailable(id) {
  if (id === 'study') return Boolean(studyTarget());
  if (id === 'results') return sessionDone() || Boolean(shared.exam?.submitted);
  return true;
}
/**
 * Updates the header screen links (current, disabled), the live-exam lock and the Resume button.
 */
export function syncScreens() {
  // A live exam hides the screen links (the theme switch stays) and locks the home link: no way out but Submit.
  document.documentElement.dataset.exam = examLive(shared.exam) ? 'live' : '';
  document.querySelectorAll('[data-screen-link]').forEach(link => {
    const id = link.dataset.screenLink, here = sectionOf(shared.step) === id, open = screenAvailable(id);
    if (here) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
    link.setAttribute('aria-disabled',String(!open));link.title=open?'':({study:'Choose Questions, Cards or Glossary in Mode',results:'No finished session'})[id]||'';
  });
  // Context button: Resume Quiz / Resume Scholar, whichever was left last.
  const ctx=$('#context-link');if(!ctx)return;
  const to=contextTarget({quiz:sessionOpen(),scholar:Boolean(shared.scholar&&shared.scholarState),last:shared.lastPlace,here:shared.step==='study'?'quiz':shared.step==='scholar'?'scholar':null});
  ctx.hidden=!to;ctx.dataset.context=to||'';if(to)ctx.dataset.tone=to==='scholar'?'scholar':'blue';else delete ctx.dataset.tone;
  ctx.innerHTML=to?`<span class="ctx-arrow">${ICON.swap}</span>Resume`:'';  // one label on every width; the tone says what resumes
  ctx.setAttribute('aria-label',to==='quiz'?'Resume Quiz':to==='scholar'?'Resume Scholar':'');
}
// Phones: the screen row (Blocks, Mode, Study, Results) is the header's
// second row and is always visible. Any scroll down slides the first row (logo, theme, settings) away. Only an
// intentional scroll up brings it back: 48 px or more of upward scroll that follows a finger dragging down, a wheel
// turned up or an up scroll key, within 1 s. A tap, the app's own scrolls (Next, Back), layout jumps and the bounce at
// the bottom of the page are not intent. The first row also shows at the top of the page, with the gear menu or a term
// sheet open, and during a live exam (the clock bar must stay in view). Sticky offsets read --header-cover (styles.css).
export const TOP_REVEAL = 48, INTENT_MS = 1000;
// True on a phone-width window (640 px or narrower).
export const phoneBars = () => window.matchMedia('(max-width: 640px)').matches;
// Notes that the reader scrolled up on purpose (up is true) or clears that note.
export const intent = up => { shared.intentUpAt = up ? Date.now() : 0; if (!up) shared.upRun = 0; };
// How far the header's first row reaches: the offset of the screen row on phones, 0 elsewhere.
export const topRow = () => { const s = $('header .screens'); return s && phoneBars() ? Math.max(0, Math.round(s.offsetTop + s.clientTop)) : 0; }; // the row's top rule slides away too
// Writes the first row's height into the --top-row style variable.
export const updateTopRow = () => document.documentElement.style.setProperty('--top-row', `${topRow()}px`);
// Slides the header's first row away (on is true) or brings it back.
export const navOnly = on => { if (on) updateTopRow(); $('header').classList.toggle('nav-only', on); };
// True when the header's first row must stay in view: not a phone, the gear menu or a term sheet open, or a live exam.
export const keepTopBar = () => !phoneBars() || tools.isOpen() || shared.termPop || examLive(shared.exam);
// The header height that covers the page: the screen row alone once the first row has slid away.
export const headerHeight = () => $('header').getBoundingClientRect().height - ($('header').classList.contains('nav-only') ? topRow() : 0);
// Answer tools drop-downs (Key terms, Source): one listener for every screen. An open panel stays open while the same
// screen and question re-render (a loaded excerpt, a saved card, a review filter), keyed by question and kind.
export const openDrops = new Set();
// The key of an answer tools drop-down: the question, then the drop-down kind.
export const dropKey = toggle => { const f = toggle.closest('.source-row')?.querySelector('[data-flag-question],[data-flag-card]'); return `${f?.dataset.flagQuestion || f?.dataset.flagCard || main.dataset.question || ''}:${toggle.dataset.drop}`; };
// Opens or closes a drop-down and sets its expanded state.
export const setDrop = (toggle, open) => { toggle.setAttribute('aria-expanded', String(open)); toggle.nextElementSibling.hidden = !open; };
/**
 * Draws the screen named by shared.step, keeping the focus, scroll position and open drop-downs the same when the question has not changed.
 */
export function render() {if(['study','flash-card','glossary'].includes(shared.step))shared.lastStudy=shared.step;if(shared.step!=='scholar')shared.scholarOpenFor=null;if(shared.step==='study')shared.lastPlace='quiz';else if(shared.step==='scholar')shared.lastPlace='scholar';
  if (!shared.bank) return;
  syncScreens();
  const oldScreen=main.dataset.screen;
  main.dataset.screen=shared.step;
  const savedScroll = window.scrollY;
  const focusId = document.activeElement?.id, focusAnswer = document.activeElement?.dataset?.answer;
  const focusDrop = document.activeElement?.dataset?.drop && main.contains(document.activeElement) ? dropKey(document.activeElement) : null;
  const visibleAnswers=[...main.querySelectorAll('[data-answer]')];
  const anchor=visibleAnswers.find(tile=>tile.dataset.answer===focusAnswer)||visibleAnswers.find(tile=>{const rect=tile.getBoundingClientRect();return rect.bottom>Math.max(100,main.querySelector('.question-focus')?.getBoundingClientRect().bottom||0)&&rect.top<window.innerHeight;});
  const anchorId=anchor?.dataset.answer, anchorTop=anchor?.getBoundingClientRect().top;
  const shown = shared.step === 'study' && shared.session ? viewed() : null;
  const oldAppearance = main.dataset.appearance, appearance = shown ? String(shown.appearance) : '';
  const oldQuestion = main.dataset.question, nextQuestion = shown?.id || null;
  main.dataset.question = nextQuestion || '';
  main.dataset.appearance = appearance;
  if (shared.dropScope !== `${shared.step}:${appearance}`) { openDrops.clear(); shared.dropScope = `${shared.step}:${appearance}`; }
  if (shared.step === 'welcome') {
    main.innerHTML = screens.welcomeHtml({nickname:shared.profile.nickname, open:sessionOpen()});
    // Saves the typed nickname and marks the device as visited.
    const keepName = () => { shared.profile={nickname:$('#nickname').value.trim(),visited:true}; persist('profile',shared.profile); };
    $('#welcome').onsubmit = e => { e.preventDefault(); const visited=shared.profile.visited; keepName(); navigate(firstRun({visited,answered:Object.keys(shared.stats.questions).length,session:shared.session,exams:shared.examHistory.length,lastBlock:shared.lastGroup})?'first-block':'blocks'); };  // Fast start: only the first Start on this device asks for the block
    if ($('#welcome-resume')) $('#welcome-resume').onclick = () => { keepName(); resumeStudy(); };
  } else if (shared.step === 'first-block') renderFirstBlock(main,{blocks:shared.bank.blocks,nickname:shared.profile.nickname,setup:()=>navigate('blocks'),help:()=>$('#help').click(),start:b=>{shared.groupId=b;shared.sections=allSections();shared.mode=FIRST_SESSION_MODE;const pool=selectQuestions(available(),FIRST_SESSION_SIZE,FIRST_SESSION_ORDER);if(!pool.length)return navigate('blocks');startSession(pool,{version:shared.bank.version,mode:shared.mode},FIRST_SESSION_ORDER);navigate('study');}}); else if (shared.step === 'blocks') {
    renderGroups();
  } else if (shared.step === 'units') renderHub();
  else if (shared.step === 'cards-setup') renderCardsSetup();
  else if (shared.step === 'exam-setup') renderExamSetup();
  else if (shared.step === 'glossary') renderGlossary();
  else if (shared.step === 'scholar') renderScholar();
  else if (shared.step === 'mode') renderMode();
  else if (shared.step === 'not-understood-setup') renderNotUnderstoodSetup();
  else if (shared.step === 'missed-review') renderMissedReview();
  else if (shared.step === 'study') renderStudy();
  else if (shared.step === 'exam') renderExam();
  else if (shared.step === 'exam-results') renderExamResults();
  else if (shared.step === 'flash-card') renderFlashCards();
  else if (shared.step === 'saved-card-sets') renderSavedCardSets();
  else if (shared.step === 'results') renderResults();
  else if (shared.step === 'previous-attempts') renderPreviousAttempts();

  mountNavigationBar();
  main.querySelectorAll('[data-drop]').forEach(toggle => { const key = dropKey(toggle); if (openDrops.has(key)) setDrop(toggle, true); if (key === focusDrop) toggle.focus({preventScroll:true}); });
  if (oldQuestion === nextQuestion) {
    const target = focusId ? document.getElementById(focusId) : focusAnswer ? main.querySelector(`[data-answer="${CSS.escape(focusAnswer)}"]`) : null;
    if (target) (target.disabled ? main.querySelector('[data-answer]:not(:disabled)') || $('#stem') : target)?.focus({preventScroll:true});
  }

  // Entering the question screen (Start, Retry, Practice, a Glossary pool, Study resume) places the question as Next and
  // Back do: phones put it under the header, wide screens centre the sheet through Back/Next.
  if (screens.repositionStudy({screen:oldScreen,question:oldQuestion,appearance:oldAppearance},{step:shared.step,question:nextQuestion,appearance})) {
    positionStudyQuestion();
    if (oldScreen !== 'study') centreSheet('.q-sheet','.question-actions',{instant:true});
  }
  if (nextQuestion && oldQuestion === nextQuestion && oldAppearance === appearance) {const tile=anchorId?main.querySelector(`[data-answer="${CSS.escape(anchorId)}"]`):null;window.scrollTo({top:Math.max(0,savedScroll+(tile&&Number.isFinite(anchorTop)?tile.getBoundingClientRect().top-anchorTop:0)),behavior:'instant'});}
}
