// Flash card screens and the SAVE button: the card catalog in use, saved card sets, the card study screen, the Manual
// toggle and the save toast. Inputs: the shared state (app-state.mjs), the card catalog (cards.json, loaded by
// data-load.mjs) and the bank. Outputs: the card screens in the page. Run: loaded by the browser as part of the app.
// Network: the site's own cards.json, whose load catalogCards starts (data-load.loadCards).
// Writes: browser storage through persist() (card sets) and the page DOM. Credentials: none.
import { shared } from './app-state.mjs';
import { $, cardStore, main, persist } from './app.mjs';
import { loadCards, sourceExcerpt } from './data-load.mjs';
import { keepScroll } from './exam-ui.mjs';
import { flagCard } from './flags.mjs';
import { ALL_BLOCKS, MANUAL_ID, MISSED_ID, cardForQuestion, cardKey, cardsInSet, manualHas, moveCards, previewCards, questionSaveBox, removeSavedCard, setHasCard, setsBlockValue, startCards, writeSetCard } from './flashcards.mjs';
import { openTermPop } from './glossary-ui.mjs';
import { entryForCard } from './glossary.mjs';
import { centreSheet, focusHeading, navigate, render, resetNavigationView } from './nav.mjs';
import { escape } from './presentation.mjs';
import { openScholar } from './scholar-ui.mjs';
import { itemForEntry } from './scholar.mjs';
import * as screens from './screens.mjs';

// The block filter of the saved card sets: the reader's choice while its block stays open, else the open block (or all).
export const setsGroup = () => shared.setsView && shared.setsView.for === shared.groupId ? shared.setsView.value : shared.groupId ?? ALL_BLOCKS;
// Bind a card-set block filter (select element by ID): keep the choice for the open block, redraw, keep focus.
export function bindSetsGroup(id) { const select = $(`#${id}`); if (!select) return;
  select.onchange = () => { shared.setsView = {for:shared.groupId, value:setsBlockValue(select.value)}; keepScroll(render); $(`#${id}`)?.focus({preventScroll:true}); }; }
// The cards that can be studied now (previewCards over the loaded catalog). Before cards.json is in: none, and the call
// starts its load (a card need), or tries it again after a failure.
export function catalogCards(){
  if(!shared.cardData){loadCards();return [];}
  return shared.cardCatalog||=previewCards(shared.bank.questions,shared.cardData);
}
// Write the missed questions that waited for the card file into Missed Questions, once each, while Dynamic Flash Cards is
// still on (switched off meanwhile: nothing is written). The last one becomes the SAVE box of its appearance, so the
// question screen does not write it a second time.
export function writeWaitingMissed(){
  for(const [id,key] of shared.missedWaiting){const card=cardForQuestion(catalogCards(),id);if(!card||!shared.dynamicCards)continue;
    if(!inMissed(card))writeSetCard(cardStore,MISSED_ID,card,true);shared.pendingCard={key,card};}
  shared.missedWaiting.clear();
}
// The cards of these questions, for the unit counts of the card setup; none until cards.json has loaded.
export const cardsFor=questions=>shared.cardData?previewCards(questions,shared.cardData):[];
// Save the card sets; on success they become the current sets. Returns false when the write failed.
export function persistCardSets(next) {
  if (!persist('cardSets',next)) return false;
  shared.cardSets = next; return true;
}
/** The question screen's SAVE state once the answer is known; null before it. An earlier question (after Back) shows
 * SAVE too; only the live question runs the Dynamic Flash Cards write to Missed Questions, once per appearance.
 * @param {object} c the appearance on screen (its resolved state and appearance number)
 * @param {object} q the question
 * @param {boolean} reviewing true for an earlier question (after Back): no Missed Questions write
 * @returns {object|null} {key, saved, missed, card}, where missed means the card is in Missed Questions (the Missed set
 *   tag; SAVE itself shows Manual only); null before the answer is known or when the question has no card
 */
export function questionCard(c,q,reviewing){
  if(!c.resolved)return null;
  const missed=c.resolved!=='correct'||shared.session.attempts.some(a=>a.questionId===q.id&&a.appearance===c.appearance&&!a.correct);
  const card=cardForQuestion(catalogCards(),q.id),key=`${shared.session.id}:${q.id}:${c.appearance}`;
  // Before the card file is in, a missed question waits for Missed Questions (writeWaitingMissed writes it on arrival).
  if(!shared.cardData&&!reviewing&&shared.dynamicCards&&missed){shared.missedWaiting.delete(q.id);shared.missedWaiting.set(q.id,key);}  // newest last
  if(!card)return null;
  if(!reviewing){
    shared.pendingCard=questionSaveBox(cardStore,shared.pendingCard,{key,card,missed,dynamic:shared.dynamicCards});
  }
  return {key:cardKey(card),saved:manualHas(shared.cardSets,card),missed:inMissed(card),card};
}
// True when the card is in the Missed Questions set.
const inMissed=card=>setHasCard(shared.cardSets.sets.find(s=>s.id===MISSED_ID),card);
// One Manual toggle for every Save button. The screen re-renders and every Save button of the card on the page, the term
// pop-up's included, shows the new state at once (the pop-up and question Save share one state).
// Returns the announced line, or null when the write failed.
export function toggleManual(card){
  const on=!manualHas(shared.cardSets,card);
  if(!writeSetCard(cardStore,MANUAL_ID,card,on))return null;
  const text=on?'Saved as a Flash Card':'Removed from flash cards',status=$('#answer-status');
  status.textContent='';requestAnimationFrame(()=>{status.textContent=text;});
  keepScroll(render);
  const saved=manualHas(shared.cardSets,card);
  document.querySelectorAll(`[data-save-card="${CSS.escape(cardKey(card))}"]`).forEach(b=>{b.setAttribute('aria-pressed',String(saved));b.setAttribute('aria-label',saved?'Saved as a flash card':'Save as a flash card');});
  return text;
}
// Bind the SAVE button of this card inside scope: toggle it in Manual, keep focus on it and flash the toast.
export function bindSave(card,scope=main){
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
export function flashToast(text,row){
  document.querySelectorAll('.save-toast').forEach(n=>n.remove());clearTimeout(shared.saveNoteTimer);
  document.body.insertAdjacentHTML('beforeend',`<div class="save-toast" aria-hidden="true"><span class="tag">${escape(text)}</span></div>`);
  // If the pressed row sits at the bottom of the viewport, the toast moves under the header instead, so it never covers it.
  if(row){ const toast=document.querySelector('.save-toast'),t=toast.getBoundingClientRect(),r=row.getBoundingClientRect();
    if(r.bottom>t.top&&r.top<t.bottom)toast.classList.add('at-top'); }
  shared.saveNoteTimer=setTimeout(()=>document.querySelectorAll('.save-toast').forEach(n=>n.remove()),2000);
}
/** Draw the Saved card sets screen and bind its controls: block filter, Back, Study set and Remove card.
 * The screen takes no input; it reads the card sets, the catalog and the block filter from shared state.
 */
export function renderSavedCardSets() {
  const catalog = catalogCards();
  main.innerHTML = screens.savedSetsScreenHtml({library:shared.cardSets, catalog, back:shared.setsReturn==='units'?'Flash cards':'Blocks', blocks:shared.bank.blocks, block:setsGroup()});
  bindSetsGroup('sets-block');
  $('#cards-home').onclick = () => navigate(shared.setsReturn === 'units' && shared.groupId ? 'cards-setup' : 'blocks');
  main.querySelectorAll('[data-open-set]').forEach(button => button.onclick = () => {
    const set = shared.cardSets.sets.find(s => s.id === button.dataset.openSet);
    const cards = cardsInSet(set,catalog,setsGroup());
    if (!cards.length) return;
    shared.flashSetId = set.id; shared.flashPreview = startCards(cards); shared.flashMessage = ''; navigate('flash-card');
  });
  main.querySelectorAll('[data-remove-card]').forEach(button => button.onclick = () => {
    const setId = button.dataset.set, index = [...button.closest('details').querySelectorAll('[data-remove-card]')].indexOf(button);
    if (!persistCardSets(removeSavedCard(shared.cardSets,setId,button.dataset.removeCard))) return;
    render();
    // Keep the editor open and focus the next Remove button (or the set's summary).
    const details = [...main.querySelectorAll('[data-open-set]')].find(b => b.dataset.openSet === setId)?.closest('section')?.querySelector('details');
    if (!details) { const open = main.querySelector(`[data-open-set="${CSS.escape(setId)}"]`); if (open && !open.disabled) open.focus(); else focusHeading(main.querySelector('h1')); return; }
    details.open = true;
    const buttons = details.querySelectorAll('[data-remove-card]');
    (buttons[Math.min(index, buttons.length - 1)] || details.querySelector('summary')).focus();
  });
}
/** Draw the flash card screen for the card in play and bind its controls: flip, Hint, Back, Next, Exit, SAVE, Flag,
 * and the card back's links to the Glossary and Scholar. It reads the card session from shared state.
 */
export function renderFlashCards() {
  const set = shared.cardSets.sets.find(s => s.id === shared.flashSetId);
  const card = shared.flashPreview.cards[shared.flashPreview.index];
  const source = card.kind === 'highlight' ? null : shared.bank.questions.find(q => q.id === card.questionId);
  // Card back (after the first flip): glossary entry, Source row with the card Flag.
  const entry = shared.glossary ? entryForCard(shared.glossary, card) : null, seen = Boolean(card.seenBack);
  const back = seen && (entry || source) ? screens.cardBackHtml({entry, g:shared.glossary, source:source ? sourceExcerpt(source) : '', flagged:Boolean(source && shared.flags[`${shared.bank.version}/${source.id}/card`]), questionId:source?.id || null, save:'<!--save-->'}) : '';
  main.innerHTML = screens.flashScreenHtml({preview:shared.flashPreview, set, bank:shared.bank, saved:manualHas(shared.cardSets,card), missed:inMissed(card), message:shared.flashMessage, source, back, glossEntry:seen && entry ? entry : null, scholar:Boolean(seen && entry && itemForEntry(shared.scholar,entry.block,entry.id))});
  // Open in Glossary (under Back): the Glossary then offers "Card N" back to this card, on the same side.
  if ($('#card-open-gloss')) $('#card-open-gloss').onclick = () => { shared.glossEntry = entry.id; shared.glossReturn = 'flash-card'; navigate('glossary'); };
  if ($('#card-open-scholar')) $('#card-open-scholar').onclick = () => { const it = itemForEntry(shared.scholar,entry.block,entry.id); openScholar(it.id,{to:'flash-card'},it.block,null,it.part); };
  main.querySelectorAll('.card-back .term-link').forEach(b => b.onclick = () => openTermPop(b, {phase:'resolved', block:entry?.block ?? shared.groupId}));
  // Apply one card event (flip, hint, next, previous), redraw, and reset the navigation view on a move.
  const move = event => { shared.flashMessage='';shared.flashPreview = moveCards(shared.flashPreview,event); if(event==='flip')shared.flashPreview.cards[shared.flashPreview.index].seenBack=true; render(); if(['next','previous'].includes(event)){resetNavigationView();centreSheet('#flash-card','.question-actions');} };
  $('#flash-exit').onclick = () => navigate(shared.flashSetId ? 'saved-card-sets' : 'cards-setup');
  if (shared.flipIn) { shared.flipIn = false; $('#flash-card').classList?.add('flip-in'); }
  bindSave(card);
  if ($('#flag-card')) $('#flag-card').onclick = () => flagCard(source, screens.cardFlagContext(card));
  $('#flash-card').onclick = () => {
    const el = $('#flash-card'), still = typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still || !el.classList?.contains) { move('flip'); $('#flash-card').focus({preventScroll:true}); return; }
    if (el.classList.contains('flip-out')) return;
    el.classList.add('flip-out');
    setTimeout(() => { shared.flipIn = true; move('flip'); const card = $('#flash-card'); card?.focus({preventScroll:true}); requestAnimationFrame(() => requestAnimationFrame(() => card?.classList.remove('flip-in'))); }, 180);
  };
  $('#flash-hint').onclick = () => { move('hint'); $('#flash-card').focus({preventScroll:true}); };
  $('#flash-previous').onclick = () => { move('previous'); $('#flash-card').focus({preventScroll:true}); };
  $('#flash-next').onclick = () => {
    if (shared.flashPreview.index === shared.flashPreview.cards.length - 1) navigate(shared.flashSetId ? 'saved-card-sets' : 'cards-setup');
    else { move('next'); $('#flash-card').focus({preventScroll:true}); }
  };
}
