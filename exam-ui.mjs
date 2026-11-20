// The Exam Mode screens and clock: setup, the live exam, the submit check and the results review. The rules are in exam.mjs.
// Inputs: the shared app state (bank, exam, history, cycles, stats), clicks and keys on the screen, and a wall-clock tick.
// Outputs: the exam screens drawn into the page, and the saved exam, stats, history and form cycles.
// Run: loaded by the browser as part of the app (site/dist/index.html); nav.mjs draws the screens and a timer calls examTick().
// Network: none.
// Writes: browser storage through persist() ('exam', 'stats', 'examHistory', 'examCycle'), the page DOM, and shared state.
// Credentials: none.
import { shared } from './app-state.mjs';
import { recordSession, studyScores } from './analytics.mjs';
import { $, dialog, main, persist } from './app.mjs';
import { bindSave, catalogCards, flashToast } from './cards-ui.mjs';
import { sourceExcerpt } from './data-load.mjs';
import { EXAM, REVIEW_FILTERS, addHistory, blueprint, countExam, examCounts, examEvent, examLive, examResults, examSession, formStatus, formsFor, historyEntry, remainingMs, standardPool, startExam, withStudySnapshot } from './exam.mjs';
import { flagQuestion, isFlagged } from './flags.mjs';
import { cardForQuestion, cardKey, manualHas } from './flashcards.mjs';
import { openTermPop, reviewGloss } from './glossary-ui.mjs';
import { keyTerms } from './glossary.mjs';
import { understandingRecord } from './learning.mjs';
import { centreSheet, headerHeight, navigate, render, showDialog, syncScreens } from './nav.mjs';
import { saveButton } from './presentation.mjs';
import * as screens from './screens.mjs';
import { allSections, currentGroup, noteGroup, sessionOpen } from './session.mjs';
import { renderGroups } from './setup-ui.mjs';

// ---- Exam Mode. Pure logic in exam.mjs; this part owns the clock, storage and events. ----
// Re-render without moving the page (results filters, save boxes, marks).
export function keepScroll(run){const y=window.scrollY;run();window.scrollTo({top:y,behavior:'instant'});}
// The Exam setup screen's HTML for the current block: its forms, status, blueprint and last result.
export function examSetupMarkup(){
  const block=currentGroup();
  const forms=formsFor(shared.bank,block.id),status=formStatus(shared.examCycles,forms,block.id);
  // No forms for this block: the Standard draw and its blueprint.
  return screens.examSetupHtml({block, forms, status, plan:status.next?null:blueprint(standardPool(shared.bank.questions,block.id)),
    last:shared.examHistory.filter(h=>h.block===block.id).at(-1)||null, studyOpen:sessionOpen()});
}
// Start an exam for the current block, save it and open the exam screen; show the error text if it cannot start.
export function beginExam(){
  const forms=formsFor(shared.bank,shared.groupId),{next,cycle}=formStatus(shared.examCycles,forms,shared.groupId);
  try{shared.exam=startExam(shared.bank.questions,{version:shared.bank.version,block:shared.groupId,...(next?{form:next,formIds:forms.forms[next],cycle}:{}),now:Date.now(),id:crypto.randomUUID()});}
  catch(error){$('#mode-availability').textContent=error.message;return;}
  shared.examAnnounced=null;persist('exam',shared.exam);noteGroup(shared.exam.block);navigate('exam');$('#exam-stem')?.focus({preventScroll:true});
}
/**
 * Snapshot study accuracy (exam answers excluded), record the answers in stats with kind 'exam', add the history row.
 * Safe to repeat: the snapshot is taken once, stats count each exam appearance once and history keeps one row per exam.
 */
export function finalizeExam(){
  if(!shared.exam?.submitted)return;
  const block=shared.bank.blocks.find(b=>b.id===shared.exam.block);
  if(!shared.exam.study&&block)shared.exam=withStudySnapshot(shared.exam,studyScores(shared.stats,block.id,block.units));
  shared.stats=recordSession(shared.stats,examSession(shared.exam,shared.bank.questions));persist('stats',shared.stats);
  shared.examHistory=addHistory(shared.examHistory,historyEntry(shared.exam,examResults(shared.exam,shared.bank.questions,shared.bank.blocks)));persist('examHistory',shared.examHistory);
  // A submitted form exam (an automatic submit at 0:00 too) takes its form for this cycle; counted once per exam.
  const cycles=countExam(shared.examCycles,shared.exam,formsFor(shared.bank,shared.exam.block));
  if(JSON.stringify(cycles)!==JSON.stringify(shared.examCycles)&&persist('examCycle',cycles))shared.examCycles=cycles;
  persist('exam',shared.exam);
}
/**
 * Apply an event to the exam, save it, and redraw; a submit moves on to the results.
 * @param {object} event the exam event ({type: 'answer' | 'goto' | 'flag' | 'previous' | 'next' | 'nextBlank' | 'submit' | 'tick', ...})
 */
export function sendExam(event){
  if(!shared.exam)return;
  const wasLive=examLive(shared.exam),next=examEvent(shared.exam,event,Date.now());
  if(next===shared.exam)return;
  shared.exam=next;persist('exam',shared.exam);
  if(wasLive&&shared.exam.submitted){examSubmitted();return;}
  render();
  // the flag (button or F) flashes a toast, as SAVE does. The button label carries the state for screen readers.
  if(event.type==='flag'&&shared.step==='exam')flashToast(shared.exam.flagged.includes(shared.exam.pool[shared.exam.index])?'Question flagged':'Flag removed',$('#exam-flag')?.closest('.exam-flag-row'));
  // The toast is aria-hidden; the status line tells screen readers what F and 1-9 changed.
  if(shared.step==='exam'&&(event.type==='flag'||event.type==='answer')){const qid=shared.exam.pool[shared.exam.index];$('#answer-status').textContent=event.type==='flag'?(shared.exam.flagged.includes(qid)?'Question flagged':'Flag removed'):`Answer ${'ABCDEFGH'[shared.exam.orders[qid].indexOf(event.id)]||''} selected`;}
}
// After a live exam is submitted: finalize it and show the results with the score announced.
function examSubmitted(){
  if(dialog.open)dialog.close();
  finalizeExam();shared.resultsKind='exam';
  const r=examResults(shared.exam,shared.bank.questions,shared.bank.blocks);shared.examFilter=r.correct<r.size?'missed':'all';
  navigate('exam-results');window.scrollTo({top:0,behavior:'instant'});
  $('#answer-status').textContent=`${shared.exam.timedOut?'Time is up. The exam was submitted. ':''}Score ${Math.round(r.pct*100)} percent, ${r.pass?'pass':'fail'}.`;
}
/**
 * Wall-clock tick: 0:00 submits the exam wherever the app is; otherwise only the clock text and time bar change.
 */
export function examTick(){
  if(!examLive(shared.exam))return;
  const now=Date.now();
  if(now>=shared.exam.deadline){sendExam({type:'tick'});return;}
  if(shared.step!=='exam')return;
  const left=remainingMs(shared.exam,now),text=screens.examClock(left);
  if($('#exam-clock')&&$('#exam-clock').textContent!==text){
    $('#exam-clock').textContent=text;$('#exam-clock-box')?.classList.toggle('low',left<=300000);
    if($('#exam-time-fill'))$('#exam-time-fill').style.width=`${(100*(1-left/EXAM.limitMs)).toFixed(2)}%`;
  }
  // Spoken warnings at 10, 5 and 1 minute left (the timer itself is not live).
  const minute=[10,5,1].find(m=>left<=m*60000&&left>m*60000-1500);
  if(minute&&shared.examAnnounced!==minute){shared.examAnnounced=minute;$('#answer-status').textContent=`${minute} ${minute===1?'minute':'minutes'} left in the exam.`;}
}
// Bring the question sheet under the header after a jump (navigator, Previous/Next, next blank); wide screens centre it.
export function showExamQuestion(){
  const sheet=main.querySelector('.exam-sheet');if(!sheet)return;
  // The clock bar is sticky under the top bar, so both cover the page.
  const bar=$('.exam-top'),head=headerHeight()+(bar?bar.getBoundingClientRect().height:0),top=sheet.getBoundingClientRect().top;
  if(!window.matchMedia('(max-width: 760px), (max-height: 500px)').matches){centreSheet('.exam-sheet','.question-actions',{cover:head});return;}
  if(top<head||top>window.innerHeight*0.5)window.scrollTo({top:Math.max(0,top+window.scrollY-head-8),behavior:'instant'});
}
// Open the submit check dialog: answered count, jump links to blank questions and the confirm button.
function openSubmitCheck(){
  const c=examCounts(shared.exam);
  showDialog('Submit exam',screens.submitCheckHtml(shared.exam),()=>{
    dialog.querySelectorAll('[data-exam-jump]').forEach(b=>b.onclick=()=>{dialog.close();sendExam({type:'goto',index:Number(b.dataset.examJump)});$('#exam-stem')?.focus({preventScroll:true});showExamQuestion();});
    $('#exam-confirm-submit').onclick=()=>sendExam({type:'submit'});
  },{label:`${c.answered} of ${shared.exam.pool.length} answered`,closeFirst:true,tone:'violet'});
}
/**
 * Draw the live exam question, bind its controls and keep focus on the control that was used.
 */
export function renderExam(){
  if(!shared.exam){shared.step='blocks';renderGroups();return;}
  if(shared.exam.submitted){shared.step='exam-results';syncScreens();renderExamResults();return;}
  // Keep focus on the control that was used (an answer, a navigator cell, Flag) across the redraw.
  const active=document.activeElement,sameQuestion=main.dataset.examIndex===String(shared.exam.index)&&main.dataset.examId===shared.exam.id;
  const keep={id:active?.id,answer:active?.dataset?.examAnswer,go:active?.dataset?.examGo};
  main.innerHTML=screens.examHtml({exam:shared.exam,bank:shared.bank,now:Date.now(),navOpen:shared.examNavOpen||!window.matchMedia('(max-width: 640px)').matches});
  main.querySelector('.exam-nav-box')?.addEventListener('toggle',e=>{if(window.matchMedia('(max-width: 640px)').matches)shared.examNavOpen=e.target.open;});
  main.dataset.examIndex=String(shared.exam.index);main.dataset.examId=shared.exam.id;
  main.querySelectorAll('[data-exam-answer]').forEach(b=>b.onclick=()=>sendExam({type:'answer',id:b.dataset.examAnswer}));
  main.querySelectorAll('[data-exam-go]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.examGo);if(i===shared.exam.index)return;sendExam({type:'goto',index:i});$('#exam-stem')?.focus({preventScroll:true});showExamQuestion();});
  $('#exam-flag').onclick=()=>sendExam({type:'flag'});
  $('#exam-previous').onclick=()=>{sendExam({type:'previous'});$('#exam-stem')?.focus({preventScroll:true});showExamQuestion();};
  $('#exam-next').onclick=()=>{if(shared.exam.index===shared.exam.pool.length-1){openSubmitCheck();return;}sendExam({type:'next'});$('#exam-stem')?.focus({preventScroll:true});showExamQuestion();};
  $('#exam-next-blank').onclick=()=>{sendExam({type:'nextBlank'});$('#exam-stem')?.focus({preventScroll:true});showExamQuestion();};
  $('#exam-submit').onclick=openSubmitCheck;
  const target=keep.go!=null?main.querySelector(`[data-exam-go="${CSS.escape(keep.go)}"]`):sameQuestion&&keep.answer?main.querySelector(`[data-exam-answer="${CSS.escape(keep.answer)}"]`):keep.id&&keep.id!=='main'?document.getElementById(keep.id):null;
  if(target&&main.contains(target)&&!target.disabled)target.focus({preventScroll:true});
}
/**
 * Draw the exam results review: score, history, filter and each question with its Save, flag and terms.
 */
export function renderExamResults(){
  if(!shared.exam?.submitted){if(examLive(shared.exam)){shared.step='exam';renderExam();}else{shared.step='blocks';renderGroups();}return;}
  main.dataset.screen='exam-results';
  const r=examResults(shared.exam,shared.bank.questions,shared.bank.blocks);
  if(!REVIEW_FILTERS.includes(shared.examFilter))shared.examFilter='all';
  // SAVE per item (questions that supply a flash card): pressed when the card is in Manual.
  const boxFor=q=>{const card=cardForQuestion(catalogCards(),q.id);return card?saveButton({key:cardKey(card),saved:manualHas(shared.cardSets,card)}):'';};
  // True when the reader marked this question as not understood.
  const marked=id=>understandingRecord(shared.understanding,shared.bank.version,id)?.understood===false;
  // The key-terms HTML for a question, or an empty string when there is no glossary.
  const termsFor=q=>shared.glossary?screens.keyTermsHtml(keyTerms(shared.glossary,q).map(id=>shared.glossary.byId.get(id)).filter(Boolean)):'';
  main.innerHTML=screens.examResultsHtml({exam:shared.exam,results:r,bank:shared.bank,history:shared.examHistory.filter(h=>h.block===shared.exam.block),filter:shared.examFilter,boxFor,marked,source:sourceExcerpt,isFlagged,termsFor,link:reviewGloss()?.text||null,isOpen:id=>shared.examOpen.has(`${shared.exam.id}:${id}`)});
  // Exam glossary: none until submitted; in the review every term opens (phase 'review').
  main.querySelectorAll('.term-link').forEach(b=>b.onclick=()=>openTermPop(b,{phase:'review',block:shared.exam.block}));
  $('#exam-blocks').onclick=()=>navigate('blocks');
  $('#exam-again').onclick=()=>{shared.groupId=shared.exam.block;shared.sections=allSections();navigate('exam-setup');};
  main.querySelectorAll('[name="exam-filter"]').forEach(r=>r.onchange=()=>{shared.examFilter=r.value;keepScroll(render);main.querySelector(`[name="exam-filter"][value="${shared.examFilter}"]`)?.focus({preventScroll:true});});
  main.querySelectorAll('[data-exam-item]').forEach(item=>{
    const id=item.dataset.examItem,q=shared.bank.questions.find(x=>x.id===id);
    // Open review rows stay open across re-renders (save, mark, flag).
    item.addEventListener('toggle',()=>{const k=`${shared.exam.id}:${id}`;if(item.open)shared.examOpen.add(k);else shared.examOpen.delete(k);});
    const card=item.querySelector('[data-save-card]')&&cardForQuestion(catalogCards(),id);if(card)bindSave(card,item);
    item.querySelectorAll('[data-flag-question]').forEach(b=>b.onclick=()=>flagQuestion(q));
  });
}
