// The Glossary screen and the term popover (a bottom sheet on phones): the entry list, one entry, and the key-term links in questions and cards.
// Inputs: the shared app state (glossary, bank, Scholar content, card sets), clicks on the screen and on term links.
// Outputs: the Glossary screen and the popover drawn into the page; Questions sessions started from an entry; the Scholar screen opened from an entry.
// Run: loaded by the browser as part of the app (site/dist/index.html); nav.mjs calls renderGlossary() when the Glossary step is shown.
// Network: none.
// Writes: the page DOM (the Glossary screen and the popover element) and shared state; card saves and flags go through cards-ui.mjs and flags.mjs.
// Credentials: none.
import { shared } from './app-state.mjs';
import { $, dialog, main, tools } from './app.mjs';
import { bindSave, catalogCards, flashToast, toggleManual } from './cards-ui.mjs';
import { questionsForMode, shuffle } from './engine.mjs';
import { keepScroll } from './exam-ui.mjs';
import { examLive } from './exam.mjs';
import { flagCard } from './flags.mjs';
import { cardForQuestion, cardKey, manualHas } from './flashcards.mjs';
import { keyTerms, popover, searchEntries } from './glossary.mjs';
import { focusHeading, navigate, phoneBars, render } from './nav.mjs';
import { flagButton, saveButton } from './presentation.mjs';
import { openScholar } from './scholar-ui.mjs';
import { itemForEntry } from './scholar.mjs';
import * as screens from './screens.mjs';
import { currentGroup, pauseStudy, send, sessionOpen, startSession } from './session.mjs';

// ---- Glossary ----
/**
 * The questions of the current block that a glossary entry lists.
 * @param {object} e the glossary entry (its questionIds name the questions)
 * @returns {object[]} the bank questions of the entry that belong to the current block
 */
const glossQuestions=e=>e.questionIds.map(id=>shared.bank.questions.find(q=>q.id===id)).filter(q=>q&&q.block===shared.groupId);
/**
 * Draw the Glossary: the entry list with search and filters, or one entry with its Save, Flag, Questions and Scholar actions.
 */
export function renderGlossary() {
  if(!shared.glossary){navigate('units');return;}
  const entry=shared.glossEntry?shared.glossary.byId.get(shared.glossEntry):null;
  const card=entry&&cardForQuestion(catalogCards(),entry.sourceId);
  const save=card?saveButton({id:'gloss-save',key:cardKey(card),saved:manualHas(shared.cardSets,card)}):'';
  // the entry's card Flag at the far right of the Source row, as on the card back (same flag key and dialog).
  const flagSource=card?shared.bank.questions.find(q=>q.id===card.questionId):null;
  const flag=flagSource?flagButton({id:'flag-card',question:flagSource.id,label:'Flag card',card:true,flagged:Boolean(shared.flags[`${shared.bank.version}/${flagSource.id}/card`])}):'';
  // Back to the card the entry was opened from (Card N), while that card session is still open.
  if(shared.glossReturn&&!shared.flashPreview)shared.glossReturn=null;
  const toCard=shared.glossReturn?`Card ${shared.flashPreview.index+1}`:'';
  main.innerHTML=screens.glossaryHtml({block:currentGroup(), replacing:sessionOpen(), g:shared.glossary, list:searchEntries(shared.glossary,{query:shared.glossQuery,unit:shared.glossSection}).filter(e=>e.block===shared.groupId), query:shared.glossQuery, unit:shared.glossSection, entry, questionCount:e=>{const qs=glossQuestions(e);return {standard:questionsForMode(qs,'Unassisted').length,hard:questionsForMode(qs,'Hard').length};}, save, flag, toCard, group:shared.glossGroup, scholar:Boolean(entry&&itemForEntry(shared.scholar,shared.groupId,entry.id))});
  // Open the entry with this id and move focus to its term heading.
  const openEntry=id=>{shared.glossEntry=id;render();window.scrollTo({top:0,behavior:'instant'});focusHeading($('#gloss-term'));};
  main.querySelectorAll('[data-entry]').forEach(b=>b.onclick=()=>openEntry(b.dataset.entry));
  if($('#gloss-card'))$('#gloss-card').onclick=()=>{shared.glossEntry=null;shared.glossReturn=null;navigate('flash-card');};
  if(entry){
    // Key terms: a glossary entry opens here; an acronym without an entry opens the term popover.
    main.querySelectorAll('.gloss-entry .term-link').forEach(b=>b.onclick=()=>shared.glossary.byId.has(b.dataset.term)?openEntry(b.dataset.term):openTermPop(b,{phase:'review',block:entry.block}));
    $('#gloss-back').onclick=()=>{const id=shared.glossEntry;shared.glossEntry=null;render();main.querySelector(`[data-entry="${CSS.escape(id)}"]`)?.focus({preventScroll:false});};
    // A Questions session with this term's questions: Standard ones in the current help level, or the Hard ones.
    const studyPool=hard=>{const qs=glossQuestions(entry),pool=questionsForMode(qs,hard?'Hard':'Unassisted');if(!pool.length)return;
      const useMode=hard?'Hard':shared.mode==='Hard'?'Unassisted':shared.mode;shared.mode=useMode;startSession(shuffle(pool),{version:shared.bank.version,mode:useMode},'random');navigate('study');};
    if($('#gloss-questions'))$('#gloss-questions').onclick=()=>studyPool(false);
    if($('#gloss-open-scholar'))$('#gloss-open-scholar').onclick=()=>{const it=itemForEntry(shared.scholar,shared.groupId,entry.id);openScholar(it.id,{to:'glossary',entry:entry.id},shared.groupId,null,it.part);};
    if($('#gloss-hard-questions'))$('#gloss-hard-questions').onclick=()=>studyPool(true);
    if(card)bindSave(card);
    if($('#flag-card')&&flagSource)$('#flag-card').onclick=()=>flagCard(flagSource,screens.cardFlagContext(card));
    return;
  }
  const search=$('#gloss-search');
  search.oninput=()=>{shared.glossQuery=search.value;const pos=search.selectionStart;render();const again=$('#gloss-search');again.focus();again.setSelectionRange(pos,pos);};
  main.querySelectorAll('[name="gloss-unit"]').forEach(r=>r.onchange=()=>{shared.glossSection=Number(r.value);keepScroll(render);main.querySelector(`[name="gloss-unit"][value="${shared.glossSection}"]`)?.focus({preventScroll:true});});
  main.querySelectorAll('[name="gloss-group"]').forEach(r=>r.onchange=()=>{shared.glossGroup=r.value;keepScroll(render);main.querySelector(`[name="gloss-group"][value="${shared.glossGroup}"]`)?.focus({preventScroll:true});});
  if($('#back'))$('#back').onclick=()=>navigate('units');
}
// Reviews (Quiz review, Exam review): every part is resolved, so stems, answers and rationales link in full.
export function reviewGloss(){
  if(!shared.glossary)return null;
  // The link spans in one part of a question (stem, an answer or a rationale), or none.
  const spans=(q,part,id)=>{const L=shared.glossary.questionLinks[q.id];if(!L)return [];return part==='stem'?L.stem:part==='answer'?L.answers[id]||[]:L.rationales[id]||[];};
  return {text:(q,part,id,text)=>screens.linkedText(text,spans(q,part,id)),terms:q=>screens.keyTermsHtml(keyTerms(shared.glossary,q).map(x=>shared.glossary.byId.get(x)).filter(Boolean))};
}
// Term popover (desktop) / bottom sheet (phone, 640px or less).
// A re-render (e.g. the 200 ms tick when an Assisted stage advances) replaces the link that opened the popover:
// follow the new copy of that link, or close when it is gone, so focus and position never use a detached element.
const termAnchor=from=>from?.isConnected?from:document.querySelector(`.term-link[data-term="${CSS.escape(from?.dataset?.term??'')}"]`);
// Close the term popover, return focus to its link and resume a study session that it paused.
export function closeTermPop(){if(!shared.termPop)return;const {el,from}=shared.termPop;shared.termPop=null;el.remove();termAnchor(from)?.focus?.({preventScroll:true});
  if(shared.termWasRunning){shared.termWasRunning=false;if(shared.step==='study'&&shared.session&&!shared.session.ended&&!dialog.open&&!tools.isOpen())send({type:'resume'},false);}}
// Position the desktop popover by its link, above the link when there is no room below.
export function placeTermPop(){
  if(!shared.termPop||shared.termPop.el.classList.contains('sheet'))return;
  const anchor=termAnchor(shared.termPop.from);if(!anchor){closeTermPop();return;}
  shared.termPop.from=anchor;const {el}=shared.termPop,r=anchor.getBoundingClientRect(),w=Math.min(360,window.innerWidth-24);
  el.style.width=`${w}px`;el.style.left=`${Math.max(12,Math.min(window.innerWidth-w-12,r.left))}px`;
  // open above the link when the window has no room below it and room above (a Key terms row near the bottom).
  const h=el.offsetHeight,below=r.bottom+6+h<=window.innerHeight,above=r.top-6-h>=0;
  el.style.top=`${(below||!above?r.bottom+6:r.top-6-h)+window.scrollY}px`;
}
/**
 * Open the term popover (desktop) or bottom sheet (phone) for a term link, replacing any popover already open.
 * @param {Element} button the term link that was activated
 * @param {object} options the settings below
 * @param {string} options.phase the phase the link is in (for example 'review')
 * @param {string|null} options.ref an entry from the popover's own See row; the new popover stays anchored to the link that opened the first one
 * @param {number} options.block the block of the question, card or entry the link is in; a link opens only that block's entries
 */
export function openTermPop(button,{phase,ref:seeRef=null,block=shared.groupId}){
  if(!shared.glossary)return;
  const ref=seeRef??button.dataset.term;
  const content=popover(shared.glossary,ref,{block});if(!content)return;
  closeTermPop();
  const el=document.createElement('div');el.className='term-pop';el.setAttribute('role','dialog');el.setAttribute('aria-labelledby','term-pop-title');
  // Save beside the close button: the term's flash card in Manual. A glossary-only term has no card.
  const card=content.entry?cardForQuestion(catalogCards(),content.entry.sourceId):null;
  // Study in Scholar: not during a live exam (the nav hides Scholar there) and not from Scholar itself.
  const study=content.entry&&!examLive(shared.exam)&&shared.step!=='scholar'?itemForEntry(shared.scholar,content.entry.block,content.entry.id):null;
  // Draw the popover's content; more=true shows the longer text.
  const draw=(more=false)=>{
    const save=card?saveButton({id:'term-pop-save',key:cardKey(card),saved:manualHas(shared.cardSets,card)}):'';
    el.innerHTML=screens.termPopoverHtml(content,{more,docs:shared.glossary.docs,save,scholar:Boolean(study)});
    el.querySelector('#term-pop-scholar')?.addEventListener('click',()=>{closeTermPop();openScholar(study.id,null,study.block,pauseStudy,study.part);});
    el.querySelector('#term-pop-close').onclick=closeTermPop;
    if(card)el.querySelector('#term-pop-save').onclick=()=>{const text=toggleManual(card);if(!text)return;el.querySelector('#term-pop-save').focus({preventScroll:true});flashToast(text,el);};
    el.querySelector('#term-pop-more')?.addEventListener('click',()=>{draw(true);el.querySelector('#term-pop-close').focus();});
    el.querySelectorAll('[data-term]').forEach(b=>b.onclick=()=>openTermPop(termAnchor(shared.termPop?.from)||button,{phase,ref:b.dataset.term,block}));
  };
  draw();document.body.append(el);shared.termPop={el,from:button};
  if(!shared.termWasRunning&&shared.step==='study'&&shared.session&&!shared.session.paused&&!shared.session.ended){shared.termWasRunning=true;send({type:'pause'},false);}
  el.addEventListener('focusout',e=>{if(shared.termPop?.el===el&&e.relatedTarget&&!el.contains(e.relatedTarget))closeTermPop();});
  if(phoneBars())el.classList.add('sheet');
  else placeTermPop();
  el.querySelector('#term-pop-close').focus({preventScroll:true});
}
