// Study session: the current block and its units, starting and saving a quiz session, the stats it records, marked
// review and pause/resume. Inputs: the shared state (app-state.mjs) and the bank. Outputs: the session in shared state and
// in browser storage. Run: loaded by the browser as part of the app (site/dist/index.html).
// Network: none. Writes: browser storage through persist() (session, stats, understanding, missedReview, poolKind,
// dynamicCards, lastBlock, card sets) and the page DOM. Credentials: none.
import { APP, FEATURES } from './settings.mjs';
import { shared } from './app-state.mjs';
import { prioritize, recordSession, toPoolKind } from './analytics.mjs';
import { $, main, notice, persist, read } from './app.mjs';
import { catalogCards, persistCardSets } from './cards-ui.mjs';
import { sample, shuffle, start, transition } from './engine.mjs';
import { keepScroll } from './exam-ui.mjs';
import { MANUAL_ID, addCardToSet, cardForQuestion } from './flashcards.mjs';
import { restoreBookmarks } from './glossary.mjs';
import { markMissed, newMissedIds } from './learning.mjs';
import { navigate, render } from './nav.mjs';
import * as screens from './screens.mjs';
import { sessionSnapshot } from './storage.mjs';

// The block that is open now (its title and units), from the bank.
export const currentGroup = () => shared.bank.blocks.find(block => block.id === shared.groupId);
// True when the block ID is a whole number and the bank has at least one question in that block.
export const servedGroup = id => Number.isInteger(id) && shared.bank.questions.some(q => q.block === id);
// Save the block as the last studied one (icf:lastBlock) when it is served and has changed.
export function noteGroup(id){ if (servedGroup(id) && id !== shared.lastGroup) { shared.lastGroup = id; persist('lastBlock', id); } }
// The unit IDs of the open block.
export const allSections = () => currentGroup().units.map(unit => unit.id);
// A new quiz session gets its own stats identity, an empty save box and an immediate save.
export function startSession(pool,options,kind='random'){shared.session={...start(pool,options),id:crypto.randomUUID(),poolKind:kind};noteGroup(shared.session.questions[0]?.block??shared.groupId);shared.pendingCard=null;shared.resultsKind='study';updateStats();save();shared.last=performance.now();}
// Pick the session's questions from the pool: a random sample, or the Smart order (weakest first) cut to the size.
export function selectQuestions(pool,size,kind=shared.poolKind){
  if(kind!=='smart')return sample(pool,Math.random,size);
  // Smart Mode orders only this eligible pool: All Units includes the whole block.
  const count=size==='all'?pool.length:Math.min(size,pool.length);
  return prioritize(pool,shared.stats).slice(0,count);
}
// Record the session in the question stats and save the stats.
export function updateStats(){
  if(!shared.session)return;
  shared.session.id ||= crypto.randomUUID();
  shared.stats=recordSession(shared.stats,shared.session);persist('stats',shared.stats);
}
// Redraws the pool chips for the current selection count and rebinds them.
export function syncPool(fieldset,name,current,n,pick,empty=''){
  fieldset.querySelector('.pool-row')?.remove();
  fieldset.insertAdjacentHTML('beforeend',screens.poolSeg(name,current,n,empty));
  fieldset.querySelectorAll(`[name="${name}"]`).forEach(r=>r.onchange=()=>pick(r.value==='all'?'all':Number(r.value)));
}
// Bind the Random/Smart pool choice: save it, redraw the screen and keep focus on the chosen option.
export function bindPoolKind(){main.querySelectorAll('[name="pool-kind"]').forEach(r=>r.onchange=()=>{shared.poolKind=toPoolKind(r.value);persist('poolKind',shared.poolKind);shared.keepEmptySections=!shared.sections.length;keepScroll(render);main.querySelector(`[name="pool-kind"][value="${shared.poolKind}"]`)?.focus({preventScroll:true});});}
// Bind the Dynamic Flash Cards switch: save its new value.
export function bindDynamic(){if($('#dynamic-cards'))$('#dynamic-cards').onchange=event=>{shared.dynamicCards=event.target.checked;persist('dynamicCards',shared.dynamicCards);};}
// Save the open session (a compact snapshot) so a reload resumes it.
export function save() { if (shared.session) persist('session',sessionSnapshot(shared.session)); }
// SAVE replaced the glossary bookmark. Saved bookmarks (icf:glossaryBookmarks, a list of entry ids) move once into
// Manual as the cards of their source questions, then the key is removed. Damaged card sets or a failed write keep the key.
export function migrateBookmarks(){
  if(!FEATURES.legacyMigrations)return;
  const raw=read('glossaryBookmarks',null);if(raw===null||!shared.glossary||!shared.cardSetsRead)return;
  let next=shared.cardSets;
  try{for(const id of restoreBookmarks(raw,shared.glossary)){const card=cardForQuestion(catalogCards(),shared.glossary.byId.get(id).sourceId);if(card)next=addCardToSet(next,MANUAL_ID,card);}}
  catch(error){notice(error.message);return;}
  if(next!==shared.cardSets&&!persistCardSets(next))return;
  try{shared.local.removeItem(APP.storagePrefix + 'glossaryBookmarks');}catch{}
}
// Save the Understanding record (questions marked as not understood).
export function saveUnderstanding() { persist('understanding',shared.understanding); }
// Take the next session state: update the stats when the session moved on, and mark newly missed questions.
export function updateStudy(next) {
  const missed=newMissedIds(shared.session,next),changed=!shared.session||next.attempts.length!==shared.session.attempts.length||next.appearances!==shared.session.appearances||next.reveals!==shared.session.reveals||next.ended!==shared.session.ended||next.finished!==shared.session.finished;shared.session=next;
  if(changed)updateStats();
  if(missed.length){shared.understanding=markMissed(shared.understanding,shared.session.version,missed,new Date().toISOString());saveUnderstanding();}
}
// Save the place in the marked review.
export function saveMissedReview(){persist('missedReview',shared.missedReview);}
// Start a marked review of these question IDs (none: nothing happens) and open its screen.
export function beginReview(ids){if(!ids.length)return;noteGroup(shared.bank.questions.find(q=>q.id===ids[0])?.block??shared.groupId);shared.missedReview={version:shared.bank.version,ids:[...ids],index:0};saveMissedReview();navigate('missed-review');}
// Apply one study event to the session, save it, redraw (unless told not to) and announce the answer result.
export function send(event, redraw = true) {
  const attempts=shared.session.attempts.length;
  updateStudy(transition(shared.session, event)); save(); shared.last = performance.now(); if (redraw) render();
  const line=screens.answerAnnouncement(event,attempts,shared.session);
  if(line!==null)$('#answer-status').textContent=line;
}
// The appearance on screen: a history entry while reviewing, otherwise the live one.
export const viewed=()=>screens.viewedAppearance(shared.session);
// An open session (not ended, not finished) can resume.
export function sessionOpen(){return Boolean(shared.session&&!shared.session.ended&&!shared.session.finished);}
// A done session (ended or finished) has results.
export function sessionDone(){return Boolean(shared.session&&(shared.session.ended||shared.session.finished));}
// Pause the open study session when it is on screen and running.
export function pauseStudy(){if(shared.step==='study'&&sessionOpen()&&!shared.session.paused)send({type:'pause'},false);}
// Open the study screen and resume the session.
export function resumeStudy(){shared.step='study';send({type:'resume'});main.focus({preventScroll:true});}
// Retry: the same questions in a new order (a different order whenever more than one question exists).
export function retrySession() {
  const before=shared.session.questions.map(q=>q.id).join();let order=shuffle(shared.session.questions);
  for(let i=0;i<5&&order.length>1&&order.map(q=>q.id).join()===before;i++)order=shuffle(shared.session.questions);
  startSession(order,{version:shared.session.version,mode:shared.session.nextMode||shared.session.mode,kind:shared.session.kind},shared.session.poolKind||'random');
}
