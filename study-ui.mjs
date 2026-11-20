// The question screen, its timer track, the quiz results, Previous Attempts and the missed-question review.
// Why: these screens show a session's questions and results and send the reader's choices to the session.
// Inputs: the session, bank, stats and understanding in the shared state. Outputs: the drawn screens and sent events.
// Run: loaded by the browser as part of the app; render() in nav.mjs calls the render functions.
// Network: none (source excerpts come from data-load.mjs).
// Writes: the page DOM and the shared state; saved data goes through session.mjs, which writes browser storage.
// Credentials: none.
import { shared } from './app-state.mjs';
import { $, main } from './app.mjs';
import { bindSave, catalogCards, questionCard } from './cards-ui.mjs';
import { sourceExcerpt } from './data-load.mjs';
import { progress } from './engine.mjs';
import { flagQuestion, isFlagged } from './flags.mjs';
import { cardForQuestion, cardKey, manualHas } from './flashcards.mjs';
import { openTermPop, reviewGloss } from './glossary-ui.mjs';
import { keyTerms, stemLinks } from './glossary.mjs';
import { assessUnderstanding, reviewIds, understandingRecord } from './learning.mjs';
import { centreSheet, confirmDialog, headerHeight, keepTopBar, navOnly, navigate, render, resetNavigationView, syncScreens, topRow } from './nav.mjs';
import { assistanceTimer, saveButton, sourceVisible } from './presentation.mjs';
import * as screens from './screens.mjs';
import { beginReview, retrySession, saveMissedReview, saveUnderstanding, send, sessionDone, viewed } from './session.mjs';

// Phones and short windows put the question under the header, then focus it.
export function positionStudyQuestion() {
  // Phones: the first row slides away first, so the question sits under the screen row alone; it returns if the page
  // stays at the top.
  if (!keepTopBar()) navOnly(true);
  const placed = screens.positionQuestion({main, win:window, headerHeight:headerHeight()});
  if (window.scrollY <= topRow()) navOnly(false);
  if (placed) $('#stem')?.focus({preventScroll:true});
}
// The text of the assistance countdown for the question on screen.
function countdown() { return assistanceTimer(shared.session?.current,shared.session?.mode); }
// Glossary context for the question on screen (exposure rule in glossary.stemLinks).
function studyGloss(c,q,reviewing){
  if(!shared.glossary)return null;
  const phase=reviewing?'review':sourceVisible(c)?'resolved':c.resolved?'missed':'live';
  const links=stemLinks(shared.glossary,q,{phase});
  if(phase==='live')return {phase,links};
  const terms=keyTerms(shared.glossary,q).map(id=>shared.glossary.byId.get(id)).filter(Boolean);
  return {phase,links,keyTerms:terms};
}
/**
 * Draws the question screen for the current or reviewed question and binds its buttons; goes to Results when the session is finished.
 */
export function renderStudy() {
  if(shared.session.finished){shared.step='results';syncScreens();renderResults();return;}
  const reviewing=shared.session.viewIndex!=null,c=viewed(),q=shared.session.questions.find(q=>q.id===c.id),assisted=(c.mode||shared.session.mode)==='Assisted';
  const gloss=studyGloss(c,q,reviewing);
  const box=questionCard(c,q,reviewing);
  main.innerHTML=screens.studyHtml({session:shared.session, bank:shared.bank, box, library:shared.cardSets, source:sourceExcerpt, isFlagged, gloss});
  if($('#study-mode')?.dataset?.mode)$('#study-mode').onclick=e=>{send({type:'mode',mode:e.currentTarget.dataset.mode});$('#study-mode')?.focus({preventScroll:true});};
  main.querySelectorAll('[data-answer]:not([aria-disabled="true"])').forEach(b=>b.onclick=()=>{if(reviewing)return;const id=b.dataset.answer;
    if(assisted&&c.flippedWrong.includes(id))send({type:'flipWrong',id});else{send({type:'answer',id});if(shared.session.current.resolved)$('#next')?.focus({preventScroll:true});}});
  main.querySelectorAll('.term-link').forEach(b=>b.onclick=()=>openTermPop(b,{phase:gloss?.phase||'live',block:q.block}));
  if($('#hint'))$('#hint').onclick=()=>{send({type:'hint'});$('#stem')?.focus({preventScroll:true});};
  if($('#show-answer'))$('#show-answer').onclick=()=>{send({type:'reveal'});$('#next')?.focus({preventScroll:true});};
  if($('#flag-question'))$('#flag-question').onclick=()=>flagQuestion(q);
  if($('#save-question')&&box)bindSave(box.card);
  $('#previous').onclick=()=>{send({type:'previous'});$('#stem')?.focus({preventScroll:true});resetNavigationView();centreSheet('.q-sheet','.question-actions');};
  $('#next').onclick=()=>{send({type:'next'});$('#stem')?.focus({preventScroll:true});resetNavigationView();centreSheet('.q-sheet','.question-actions');};
  // End Session asks first while pool questions are not cleared; the answers so far still count.
  $('#end').onclick=()=>{const end=()=>{send({type:'end'},false);navigate('results');};const p=progress(shared.session),left=p.pool-p.completed;if(left>0)confirmDialog('End session',`${left} ${left===1?'question is':'questions are'} not cleared yet. Your answers so far count in Results.`,'End session',end);else end();};
}
// Scholar order and sort rows: before an answer, every row of a list already has the tallest answered row height, on every
// width, so a reveal moves nothing. Answer tiles hold by CSS (answersHtml, .answers:has(.back)).
export const scholarHold=new Map();
// Builds a hidden off-screen copy of some HTML at a given width, so its size can be measured.
const probeAt=(width,cls,html)=>{const probe=document.createElement('div');probe.className=cls;probe.setAttribute('aria-hidden','true');probe.inert=true;
  Object.assign(probe.style,{position:'absolute',left:'0',top:'0',width:`${width}px`,visibility:'hidden',pointerEvents:'none'});
  probe.innerHTML=html;probe.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));probe.querySelectorAll('input[name]').forEach(el=>el.removeAttribute('name'));return probe;};
// Adds the probe to the page, returns what read(probe) measures, then removes the probe.
const measure=(probe,read)=>{main.append(probe);try{return read(probe);}finally{probe.remove();}};
// Sets every Scholar row to the height of the tallest row, measured once per question, width and theme.
export function holdScholarHeights(item,qn){
  if(!qn)return;
  const list=main.querySelector('.scholar-rows');if(!list)return;
  const width=list.getBoundingClientRect().width,key=`rows|${qn.id}@${qn.v}|${width}|${document.documentElement.dataset.theme}`;
  if(!scholarHold.has(key))scholarHold.set(key,measure(probeAt(width,'scholar-q',screens.scholarRowProbes(item,qn).join('')),
    p=>Math.max(0,...[...p.querySelectorAll('.scholar-rows > li')].map(li=>{li.style.minHeight='0';return Math.ceil(li.getBoundingClientRect().height);}))));
  for(const li of list.children)li.style.setProperty('--row-hold',`${scholarHold.get(key)}px`);
}
// Updates the assistance bar, the clock, the marks and the countdown for the current question.
export function updateTrack() {
  const c=shared.session?.current;if(!c||!$('#track-fill'))return;
  $('#track-fill').style.width=`${Math.min(100,c.assistedMs/500)}%`;$('#clock').textContent=screens.duration(c.assistedMs);
  main.querySelectorAll('.marks span').forEach((mark,i)=>mark.classList.toggle('hit',c.assistedMs>=screens.TRACK_MARKS[i][0]));
  if($('#countdown'))$('#countdown').textContent=countdown();
}
/**
 * Draws the quiz Results screen and binds its review, save, term, retry and flag controls.
 */
export function renderResults() {
  main.dataset.screen='results';
  const toReview=reviewIds(shared.session,shared.understanding);
  // Quiz review SAVE: the question screen's button, writing to Manual only (Missed is a separate set). Open compact rows
  // stay open across the re-render a press causes.
  const cardOf=q=>cardForQuestion(catalogCards(),q.id),save=q=>{const card=cardOf(q);return card?saveButton({key:cardKey(card),saved:manualHas(shared.cardSets,card)}):'';};
  // The key that remembers whether a review row is open: session, then question id.
  const openKey=id=>`${shared.session.id}:${id}`;
  main.innerHTML=screens.resultsHtml({session:shared.session, bank:shared.bank, blockId:shared.groupId, stats:shared.stats, understanding:shared.understanding, source:sourceExcerpt, isFlagged, gloss:reviewGloss(), save, isOpen:id=>shared.reviewOpen.has(openKey(id))});
  main.querySelectorAll('[data-review-item]').forEach(item=>item.addEventListener('toggle',()=>{const k=openKey(item.dataset.reviewItem);if(item.open)shared.reviewOpen.add(k);else shared.reviewOpen.delete(k);}));
  main.querySelectorAll('.answer-review .review-item').forEach(item=>{const button=item.querySelector('[data-save-card]');if(!button)return;
    const card=catalogCards().find(c=>cardKey(c)===button.dataset.saveCard);if(card)bindSave(card,item);});
  main.querySelectorAll('.answer-review .term-link').forEach(b=>b.onclick=()=>openTermPop(b,{phase:'review',block:shared.session.questions.find(q=>q.id===b.closest('[data-review-item]')?.dataset.reviewItem)?.block??shared.groupId}));
  if($('#review-missed'))$('#review-missed').onclick=()=>beginReview(toReview);
  $('#retry-session').onclick=()=>{retrySession();navigate('study');};
  $('#again').onclick=()=>navigate('blocks');main.querySelectorAll('[data-flag-question]').forEach(b=>b.onclick=()=>flagQuestion(shared.session.questions.find(q=>q.id===b.dataset.flagQuestion)));
}
// Draws the Previous Attempts screen (quiz results and exam history for the chosen block).
export function renderPreviousAttempts(){
  const sessionBlock=shared.session?.questions?.[0]?.block??null;
  main.innerHTML=screens.previousAttemptsHtml({bank:shared.bank, stats:shared.stats, hasResults:sessionDone()&&(shared.attemptsGroup===null||sessionBlock===shared.attemptsGroup), history:shared.examHistory, block:shared.attemptsGroup});
  $('#attempts-back').onclick=()=>navigate('blocks');if($('#last-results'))$('#last-results').onclick=()=>navigate('results');
}
/**
 * Draws the missed-question review screen for the current question and binds its buttons.
 */
export function renderMissedReview(){
  main.dataset.screen='missed-review';
  if(!shared.missedReview){navigate('blocks');return;}
  const q=shared.bank.questions.find(q=>q.id===shared.missedReview.ids[shared.missedReview.index]);
  const card=cardForQuestion(catalogCards(),q.id),g=reviewGloss();
  main.innerHTML=screens.missedReviewHtml({bank:shared.bank, review:shared.missedReview, understanding:shared.understanding, source:sourceExcerpt, isFlagged,
    save:card?saveButton({id:'review-save',key:cardKey(card),saved:manualHas(shared.cardSets,card)}):'', terms:g?g.terms(q):''});
  if(card)bindSave(card);
  main.querySelectorAll('.review-sheet .term-link').forEach(b=>b.onclick=()=>openTermPop(b,{phase:'review',block:q.block}));
  $('#leave-review').onclick=()=>navigate('blocks');
  main.querySelectorAll('[name=understood]').forEach(input=>input.onchange=()=>{shared.understanding=assessUnderstanding(shared.understanding,shared.bank.version,q.id,input.value==='yes',new Date().toISOString());saveUnderstanding();$('#review-next').disabled=false;});
  $('#review-previous').onclick=()=>{shared.missedReview.index--;saveMissedReview();render();$('#review-stem').focus({preventScroll:true});resetNavigationView();centreSheet('.review-sheet','.review-actions');};
  $('#review-next').onclick=()=>{if(!understandingRecord(shared.understanding,shared.bank.version,q.id)?.decision)return;if(shared.missedReview.index+1===shared.missedReview.ids.length){shared.missedReview=null;saveMissedReview();navigate('blocks');}else{shared.missedReview.index++;saveMissedReview();render();$('#review-stem').focus({preventScroll:true});resetNavigationView();centreSheet('.review-sheet','.review-actions');}};
  $('#review-flag').onclick=()=>flagQuestion(q);
}
