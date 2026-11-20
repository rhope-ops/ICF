// The Scholar screens: the term list of a unit, one term's page with its guided questions and picture, and the unit review.
// Inputs: the shared app state (Scholar content and saved place, glossary, bank), clicks and keys on the screen, and each block's Scholar file.
// Outputs: the Scholar screens drawn into the page, the saved Scholar place, and toasts or status lines for screen readers.
// Run: loaded by the browser as part of the app (site/dist/index.html); nav.mjs calls renderScholar() when the Scholar step is shown.
// Network: the site's own files only (a block's Scholar file named in the Scholar index, fetched once with fetchJson when that block opens).
// Writes: browser storage through persist('scholar', ...), the page DOM (main), and shared state and timers for the picture loop.
// Credentials: none.
import { shared } from './app-state.mjs';
import { $, main, persist, reviewDraft, reviewHints, scholarDraft, scholarHints } from './app.mjs';
import { flashToast } from './cards-ui.mjs';
import { fetchJson } from './data-load.mjs';
import { keepScroll } from './exam-ui.mjs';
import { openTermPop } from './glossary-ui.mjs';
import { focusHeading, navigate, render } from './nav.mjs';
import { moveFrom, pictureHtml, stepKey } from './pictures.mjs';
import { addScholarBlock, blockLoaded, draftOf, itemById, itemForEntry, itemsFor, listModel, moveScholar, neighbours, newScholarState, nextUnit, picMs, pickKey, refitScholarState, resolved, restoreScholarState, reviewDeck, right, scholarStateShape, triesOf, unitsOf } from './scholar.mjs';
import * as screens from './screens.mjs';
import { allSections, currentGroup } from './session.mjs';
import { holdScholarHeights } from './study-ui.mjs';

// ---- Scholar ----
// A block's Scholar file: fetched once, when that block's Scholar opens. true when loaded.
const scholarLoads={};
// Fetch and add a block's Scholar file once; resolves true when the block is loaded, false when it cannot be.
export function loadScholarGroup(b){
  if(!shared.scholar)return Promise.resolve(false);if(blockLoaded(shared.scholar,b))return Promise.resolve(true);
  const ix=shared.scholar.index[String(b)];if(!ix)return Promise.resolve(false);
  return scholarLoads[b]||=fetchJson(`./${ix.file}`).then(raw=>{const next=addScholarBlock(shared.scholar,raw);if(!next)throw Error(`${ix.file} damaged`);shared.scholar=next;
    // The saved picks and seen terms of this block are checked now that its content is here.
    if(shared.scholarState){const fit=refitScholarState(shared.scholarState,shared.scholar);if(JSON.stringify(fit)!==JSON.stringify(shared.scholarState))saveScholar(fit);}
    return true;}).catch(()=>{delete scholarLoads[b];return false;});
}
// Tell the reader, in a toast and the status line, that Scholar could not load.
function scholarFailed(){const text='Scholar could not load. Check the connection and try again.';flashToast(text);const say=$('#answer-status');if(say)say.textContent=text;}
/**
 * Open Scholar for the current block: at an item (from the Glossary or a card) or at the saved place of this block, else
 * at the first unit's term list.
 * @param {string|null} itemId the term to open, or null for the saved place or the term list
 * @param {object|null} ret the way back ({to:'glossary', entry} | {to:'flash-card'}) or none (from Mode)
 * @param {number} block the block whose Scholar opens (default: the current block); a card may open a term of another
 *   block, and the current block changes only once that block's file has loaded
 * @param {Function|null} before a callback run once the file is here, just before the screen changes (Resume pauses the
 *   quiz only then)
 * @param {number|null} part the picture part to show for a covered entry, or null
 * @param {boolean} list true to open the term list instead of a term
 */
export async function openScholar(itemId=null,ret=null,block=shared.groupId,before=null,part=null,list=false){
  const us=unitsOf(shared.scholar,block);if(!us.length)return;
  const seq=++shared.scholarOpenSeq,from=shared.step;
  if(!await loadScholarGroup(block)){if(seq===shared.scholarOpenSeq)scholarFailed();return;}
  // A place held at start (its block file was not here yet, or could not load) is checked before another block's place replaces it.
  // If its block still cannot load, its picks and seen terms (shape checked) carry into the new place and are checked when
  // that block loads (an empty place used to overwrite it).
  if(shared.scholarPending){const held=shared.scholarPending;shared.scholarPending=null;
    if(!shared.scholarState){
      if(held.block===block||await loadScholarGroup(held.block)){shared.scholarState=restoreScholarState(held,shared.scholar);if(!shared.scholarState)persist('scholar',null);}
      else shared.scholarState=refitScholarState(scholarStateShape(held),shared.scholar);}}  // loaded blocks' picks are checked now
  if(seq!==shared.scholarOpenSeq||shared.step!==from)return;
  before?.();
  if(shared.groupId!==block){shared.groupId=block;shared.sections=allSections();}
  let st=shared.scholarState&&shared.scholarState.block===shared.groupId?shared.scholarState:{...newScholarState(shared.groupId,us[0]),picks:{...shared.scholarState?.picks},seen:[...(shared.scholarState?.seen||[])]};
  if(itemId)st=moveScholar(st,{type:'item',id:itemId},shared.scholar);
  else if(list)st=moveScholar(st,{type:'list'},shared.scholar);  // picks and seen terms stay
  // A covered entry (umbrella) opens its umbrella with the picture at the part that shows it.
  if(Number.isInteger(part)&&st.item===itemId){shared.scholarPicOpen=itemId;shared.scholarPic={item:itemId,index:part,prev:null,manual:true};}
  shared.scholarReturn=ret;saveScholar(st);navigate('scholar');
}
// Keep the Scholar place in shared state and save it to browser storage.
function saveScholar(st){shared.scholarState=st;persist('scholar',st);}
// A message in the guided question's live region, after the render (so it is heard as a change).
function sayScholar(text){setTimeout(()=>{const say=main.querySelector('.scholar-q [data-say]');if(say&&say.isConnected)say.textContent=text;},150);}
// Draw the Scholar term list or a term page (or the unit review) into the page and bind its controls.
export function renderScholar(){
  clearTimeout(shared.picTimer);
  if(!shared.scholar||!shared.scholarState){navigate('units');return;}
  if(shared.scholarReturn?.to==='flash-card'&&!shared.flashPreview)shared.scholarReturn=null;
  const st=shared.scholarState,block=shared.bank.blocks.find(b=>b.id===st.block)||currentGroup(),item=itemById(shared.scholar,st.item);
  // Open the term with this id and move focus to its heading.
  const open=id=>{saveScholar(moveScholar(shared.scholarState,{type:'item',id},shared.scholar));render();window.scrollTo({top:0,behavior:'instant'});focusHeading($('#scholar-term'));};
  if(shared.scholarReview&&(shared.scholarReview.block!==st.block||shared.scholarReview.unit!==st.unit||item))shared.scholarReview=null;
  if(shared.scholarReview){renderScholarReview(block);return;}
  if(!item){shared.scholarOpenFor=null;
    const m=listModel(shared.scholar,st,shared.scholarQuery,id=>shared.glossary?.byId.get(id)?.short),items=m.items;
    main.innerHTML=screens.scholarListHtml({...m,block,unit:st.unit,review:items.length>=2,glossOf:id=>shared.glossary?.byId.get(id)||null,query:shared.scholarQuery});
    const search=$('#scholar-search');
    search.oninput=()=>{shared.scholarQuery=search.value;const pos=search.selectionStart;render();const again=$('#scholar-search');again.focus();again.setSelectionRange(pos,pos);};
    if($('#scholar-next-unit'))$('#scholar-next-unit').onclick=()=>{shared.scholarQuery='';saveScholar(moveScholar(shared.scholarState,{type:'unit',unit:Number($('#scholar-next-unit').dataset.unit)},shared.scholar));render();window.scrollTo({top:0,behavior:'instant'});focusHeading(main.querySelector('h1'));};
    if($('#scholar-todo'))$('#scholar-todo').onclick=()=>open($('#scholar-todo').dataset.scholarNext);
    if($('#scholar-review'))$('#scholar-review').onclick=()=>{shared.scholarReview={block:st.block,unit:st.unit,deck:reviewDeck(items),k:0,picks:{}};reviewHints.clear();reviewDraft.clear();render();window.scrollTo({top:0,behavior:'instant'});focusHeading($('#scholar-review-title'));};
    main.querySelectorAll('[name="scholar-unit"]').forEach(r=>r.onchange=()=>{shared.scholarQuery='';saveScholar(moveScholar(shared.scholarState,{type:'unit',unit:Number(r.value)},shared.scholar));keepScroll(render);main.querySelector(`[name="scholar-unit"][value="${r.value}"]`)?.focus({preventScroll:true});});
    main.querySelectorAll('[data-scholar-item]').forEach(b=>b.onclick=()=>open(b.dataset.scholarItem));
    $('#back').onclick=()=>navigate('units');
    return;
  }
  if(shared.scholarPic.item!==item.id)shared.scholarPic={item:item.id,index:item.picture?.kind==='explore'?-1:0,prev:null,manual:false};
  if(shared.scholarOpenFor!==item.id){shared.scholarOpenFor=item.id;const seen=(st.seen||[]).includes(item.id);
    shared.scholarOpen=seen?{picture:false,deeper:false,analogy:false,scenario:false,example:false}:{};if(!seen)saveScholar(moveScholar(st,{type:'seen',id:item.id},shared.scholar));}
  if(shared.scholarPicOpen===item.id){shared.scholarOpen={...shared.scholarOpen,picture:true};shared.scholarPicOpen=null;}
  const back=shared.scholarReturn?.to==='glossary'?'Glossary':shared.scholarReturn?.to==='flash-card'?`Card ${shared.flashPreview.index+1}`:'';
  const qn=item.questions[st.q],tries=triesOf(shared.scholarState,qn);
  const related=(shared.glossary?.byId.get(item.entry)?.related||[]).map(id=>shared.glossary.byId.get(id)).filter(e=>e&&e.block===item.block).map(e=>{const it=itemForEntry(shared.scholar,e.block,e.id);return {id:e.id,term:e.term,item:it&&it.id!==item.id?it.id:null,part:it?.part};}).filter(r=>r.item||!itemForEntry(shared.scholar,item.block,r.id));
  main.innerHTML=screens.scholarItemHtml({block,item,q:st.q,tries,started:item.questions.some(x=>triesOf(shared.scholarState,x).length),hint:scholarHints.has(qn.id),nav:{...neighbours(shared.scholar,st),nextUnit:itemsFor(shared.scholar,st.block,nextUnit(shared.scholar,st))[0]||null},done:x=>resolved(x,triesOf(shared.scholarState,x)),back,pic:picOptions(),open:shared.scholarOpen,draft:draftOf(qn,tries,scholarDraft),related});
  main.querySelectorAll('.scholar-related [data-scholar-item]').forEach(b=>b.onclick=()=>{const part=b.dataset.part===undefined?null:Number(b.dataset.part);  // the part first, so one render keeps focus on the heading
    if(Number.isInteger(part)){shared.scholarPicOpen=b.dataset.scholarItem;shared.scholarPic={item:b.dataset.scholarItem,index:part,prev:null,manual:true};}open(b.dataset.scholarItem);});
  main.querySelectorAll('.scholar-related .term-link').forEach(b=>b.onclick=()=>openTermPop(b,{phase:'review',block:item.block}));
  shared.scholarPic.prev=null;
  main.querySelectorAll('.scholar-drop').forEach(d=>d.ontoggle=()=>{shared.scholarOpen[d.dataset.section]=d.open;if(d.dataset.section==='picture')picLoop(item);});
  // Apply a Scholar event to the saved place, redraw in place and focus the control that focus() returns, else the question stem.
  const move=(event,focus)=>{saveScholar(moveScholar(shared.scholarState,event,shared.scholar));keepScroll(render);(focus?.()||$('#scholar-stem'))?.focus({preventScroll:true});};
  // A pick: a tile (A-D, tap, the current branch decision) or a tap on the picture's target (tap).
  // Focus after a pick: the tile just picked; in a branch, a new decision takes focus on its first tile.
  const pick=id=>{shared.scholarSay=true;const n0=main.querySelectorAll('.scholar-decision').length;move({type:'answer',index:Number(id)},()=>{const ds=main.querySelectorAll('.scholar-decision'),last=ds[ds.length-1];
    if(last)return (ds.length>n0?last.querySelector('[data-answer]:not([aria-disabled="true"])'):null)||last.querySelector(`[data-answer="${id}"]`);
    return main.querySelector(`.scholar-answers [data-answer="${id}"]`)||$('#scholar-stem');});};
  main.querySelectorAll('.scholar-answers [data-answer]').forEach(b=>b.onclick=()=>{if(b.getAttribute('aria-disabled')==='true'||b.closest('.scholar-decision.is-done'))return;pick(b.dataset.answer);});
  { const board=main.querySelector('.scholar-tap:not(.is-done) svg');if(board)board.onclick=e=>{const t=e.target.closest('[data-tap]');if(t&&!t.dataset.tapState)pick(t.dataset.tap);}; }
  bindArrange(qn,tries,scholarDraft);  // Check saves the arrangement as a try.
  if($('#scholar-reset'))$('#scholar-reset').onclick=()=>{for(const x of item.questions){scholarHints.delete(x.id);scholarDraft.delete(x.id);}
    saveScholar(moveScholar(shared.scholarState,{type:'reset',item:item.id},shared.scholar));keepScroll(render);$('#scholar-stem')?.focus({preventScroll:true});sayScholar('This term\'s questions start over.');};
  if($('#scholar-check'))$('#scholar-check').onclick=()=>{shared.scholarSay=true;move({type:'answer',value:draftOf(qn,tries,scholarDraft)},()=>main.querySelector('.scholar-row.is-wrong :is(button:not(:disabled),input)')||$('#scholar-stem'));};
  bindPicture(item);picLoop(item);holdScholarHeights(item,qn);
  main.querySelectorAll('[data-scholar-q]').forEach(b=>b.onclick=()=>move({type:'question',index:Number(b.dataset.scholarQ)}));
  if($('#scholar-next-q'))$('#scholar-next-q').onclick=()=>move({type:'question',index:st.q+1});
  if($('#scholar-prev-q'))$('#scholar-prev-q').onclick=()=>move({type:'question',index:st.q-1});
  if($('#scholar-hint'))$('#scholar-hint').onclick=()=>{scholarHints.add(item.questions[st.q].id);keepScroll(render);$('#scholar-hint-text')?.focus({preventScroll:true});};
  // The answer line is announced after the render, so a screen reader hears a change in an existing live region.
  // Only the render that follows a pick speaks; a Hint or Look again render stays quiet.
  { const say=main.querySelector('.scholar-q [data-say]');if(shared.scholarSay&&say?.dataset.say)setTimeout(()=>{if(say.isConnected)say.textContent=say.dataset.say;},150);shared.scholarSay=false; }
  // Look again: open the section that explains the question (a picture step is shown and its loop paused), then go there.
  // The same for an umbrella's "Also covers" links: each opens the picture at the part that shows that term.
  main.querySelectorAll('#scholar-see, .scholar-also [data-see]').forEach(b=>b.onclick=()=>{const [part,n]=b.dataset.see.split(':');shared.scholarOpen[part]=true;
    if(part==='picture'){shared.scholarPic={item:item.id,index:Number(n),prev:shared.scholarPic.index,manual:true};}
    render();const box=main.querySelector(`[data-section="${part}"]`);box?.scrollIntoView({block:'start'});box?.querySelector('summary')?.focus({preventScroll:true});});
  main.querySelectorAll('.scholar-nav [data-scholar-item]').forEach(b=>b.onclick=()=>open(b.dataset.scholarItem));
  $('#scholar-list').onclick=()=>{const id=item.id;shared.scholarReturn=null;saveScholar(moveScholar(shared.scholarState,{type:'list'},shared.scholar));render();window.scrollTo({top:0,behavior:'instant'});main.querySelector(`[data-scholar-item="${CSS.escape(id)}"]`)?.focus({preventScroll:false});};
  if($('#scholar-return'))$('#scholar-return').onclick=()=>{const r=shared.scholarReturn;shared.scholarReturn=null;if(r.to==='glossary'){shared.glossEntry=r.entry;navigate('glossary');}else navigate('flash-card');};
}
/**
 * Unit review screen: the term page's guided-question handlers on a practice state that is never saved.
 * @param {object} block the block the review belongs to
 */
function renderScholarReview(block){
  const rv=shared.scholarReview,d=rv.deck[rv.k],item=itemById(shared.scholar,d.item),qn=item?.questions[d.q];
  if(!qn){shared.scholarReview=null;render();return;}
  const tries=rv.picks[pickKey(qn)]||[];
  main.innerHTML=screens.scholarReviewHtml({block,unit:rv.unit,item,qn,k:rv.k,total:rv.deck.length,tries,hint:reviewHints.has(qn.id),draft:draftOf(qn,tries,reviewDraft)});
  // Apply an event to the review's practice picks (never saved), redraw in place and focus the control that focus() returns.
  const apply=(event,focus)=>{const temp={...shared.scholarState,item:item.id,q:d.q,picks:rv.picks};rv.picks=moveScholar(temp,event,shared.scholar).picks;shared.scholarSay=true;keepScroll(render);(focus?.()||$('#scholar-stem'))?.focus({preventScroll:true});};
  // A pick in the review: answer by tile index and focus the tile just picked, or a new decision's first tile.
  const pick=id=>{const n0=main.querySelectorAll('.scholar-decision').length;apply({type:'answer',index:Number(id)},()=>{const ds=main.querySelectorAll('.scholar-decision'),last=ds[ds.length-1];
    if(last)return (ds.length>n0?last.querySelector('[data-answer]:not([aria-disabled="true"])'):null)||last.querySelector(`[data-answer="${id}"]`);
    return main.querySelector(`.scholar-answers [data-answer="${id}"]`);});};
  main.querySelectorAll('.scholar-answers [data-answer]').forEach(b=>b.onclick=()=>{if(b.getAttribute('aria-disabled')==='true'||b.closest('.scholar-decision.is-done'))return;pick(b.dataset.answer);});
  { const board=main.querySelector('.scholar-tap:not(.is-done) svg');if(board)board.onclick=e=>{const t=e.target.closest('[data-tap]');if(t&&!t.dataset.tapState)pick(t.dataset.tap);}; }
  bindArrange(qn,tries,reviewDraft);
  if($('#scholar-check'))$('#scholar-check').onclick=()=>apply({type:'answer',value:draftOf(qn,tries,reviewDraft)},()=>main.querySelector('.scholar-row.is-wrong :is(button:not(:disabled),input)'));
  if($('#scholar-hint'))$('#scholar-hint').onclick=()=>{reviewHints.add(qn.id);keepScroll(render);$('#scholar-hint-text')?.focus({preventScroll:true});};
  holdScholarHeights(item,qn);
  { const say=main.querySelector('.scholar-q [data-say]');if(shared.scholarSay&&say?.dataset.say)setTimeout(()=>{if(say.isConnected)say.textContent=say.dataset.say;},150);shared.scholarSay=false; }
  // Show review card number k and move focus to the review heading.
  const go=k=>{rv.k=k;render();window.scrollTo({top:0,behavior:'instant'});focusHeading($('#scholar-review-title'));};
  if($('#scholar-review-prev'))$('#scholar-review-prev').onclick=()=>go(rv.k-1);
  if($('#scholar-review-next'))$('#scholar-review-next').onclick=()=>go(rv.k+1);
  // Leave the review for the term list; a non-empty say is spoken in the list's status line.
  const exit=(say)=>{shared.scholarReview=null;saveScholar(moveScholar(shared.scholarState,{type:'list'},shared.scholar));render();window.scrollTo({top:0,behavior:'instant'});focusHeading(main.querySelector('h1'));if(say)sayList(say);};
  if($('#scholar-review-end'))$('#scholar-review-end').onclick=()=>{const right_=rv.deck.filter(x=>{const it=itemById(shared.scholar,x.item),q=it.questions[x.q];return right(q,rv.picks[pickKey(q)]||[]);}).length;exit(`Review done: ${right_} of ${rv.deck.length} right.`);};
  $('#scholar-review-exit').onclick=()=>exit('');
  $('#scholar-review-term').onclick=()=>{shared.scholarReview=null;saveScholar(moveScholar(shared.scholarState,{type:'item',id:item.id},shared.scholar));render();window.scrollTo({top:0,behavior:'instant'});focusHeading($('#scholar-term'));};
}
// Order: Move up / Move down (buttons, no drag); sort: one radio group per item. drafts: the arrangements being built.
function bindArrange(qn,tries,drafts){
  main.querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>{const d=[...draftOf(qn,tries,drafts)],i=Number(b.dataset.move),j=i+Number(b.dataset.dir);[d[i],d[j]]=[d[j],d[i]];drafts.set(qn.id,d);keepScroll(render);
    const again=main.querySelector(`[data-move="${j}"][data-dir="${b.dataset.dir}"]`);(again&&!again.disabled?again:main.querySelector(`[data-move="${j}"]:not(:disabled)`))?.focus({preventScroll:true});
    sayScholar(`${qn.steps[d[j]].text} Moved to place ${j+1} of ${d.length}.`);});  // the place number is drawn for sight only
  main.querySelectorAll('.scholar-sort-seg input').forEach(r=>r.onchange=()=>{const d=[...draftOf(qn,tries,drafts)],i=Number(r.closest('[data-sort]').dataset.sort);d[i]=Number(r.value);drafts.set(qn.id,d);keepScroll(render);main.querySelector(`[name="sort-${i}"][value="${r.value}"]`)?.focus({preventScroll:true});});}
// A short line in the term list's status (a finished review's score).
function sayList(text){setTimeout(()=>{const s=main.querySelector('p.status.count');if(s&&shared.step==='scholar')s.textContent=`${s.textContent} · ${text}`;},150);}
// The picture's display options: current part, motion (still when reduced motion is asked for) and whether it is playing.
const picOptions=()=>({index:shared.scholarPic.index,motion:{prev:shared.scholarPic.prev,still:window.matchMedia('(prefers-reduced-motion: reduce)').matches},playing:shared.scholarPlay&&!shared.scholarPic.manual&&shared.scholarOpen.picture!==false});
/**
 * Redraw only the picture (a loop tick or a picture control), keeping focus on the control that had it.
 * @param {object} item the Scholar item whose picture is drawn
 */
function mountPicture(item){
  const panel=main.querySelector('[data-section="picture"] > .scholar-drop-body');if(!panel)return;
  const next=document.createElement('div');next.innerHTML=pictureHtml(item.picture,shared.scholarPic.index,picOptions());shared.scholarPic.prev=null;
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
/**
 * Bind the picture's controls (back, next, part chips, keys, tap on an explore part, play and pause).
 * @param {object} item the Scholar item whose picture is shown
 */
function bindPicture(item){
  if(!item.picture)return;
  // Show picture part or step `index`; manual says the reader chose it, which stops the loop.
  const go=(index,manual=shared.scholarPic.manual)=>{shared.scholarPic={item:item.id,index,prev:moveFrom(shared.scholarPic.index,index),manual};mountPicture(item);};
  // A reader's choice of part: stop the loop timer and go there.
  const manual=index=>{clearTimeout(shared.picTimer);go(index,true);};
  if($('#pic-back'))$('#pic-back').onclick=()=>manual(shared.scholarPic.index-1);
  if($('#pic-next'))$('#pic-next').onclick=()=>manual($('#pic-next').dataset.replay?0:shared.scholarPic.index+1);
  // Left / Right step through the picture while focus is on one of its controls (steps stop at the ends; parts wrap).
  { const body=main.querySelector('[data-section="picture"] .pic-body');if(body)body.onkeydown=e=>{const to=e.target.closest('.pic-controls')?stepKey(item.picture,shared.scholarPic.index,e.key):null;if(to===null)return;e.preventDefault();manual(to);main.querySelector(`[data-pic-part="${to}"]`)?.focus({preventScroll:true});}; }
  main.querySelectorAll('[data-pic-part]').forEach(b=>b.onclick=()=>manual(Number(b.dataset.picPart)));
  // Explore: a tap on a drawn part chooses the first part that lights it (the chips are the keyboard way).
  if(item.picture.kind==='explore')main.querySelector('.pic')?.addEventListener('click',e=>{const id=e.target.closest('[data-pic-id]')?.dataset.picId;const k=item.picture.parts.findIndex(p=>p.light.includes(id));if(k>=0)manual(k);});
  // Play / pause: the reader's choice for every term; Play also lifts this term's manual pause.
  if($('#pic-play'))$('#pic-play').onclick=()=>{const on=$('#pic-play').dataset.playing!=='true';shared.scholarPlay=on;shared.scholarPic.manual=false;mountPicture(item);picLoop(item);};
}
// One loop tick per step (picMs of its caption) while the term's picture is open, in view and its tab shown; it wraps to the first step or part.
function picLoop(item){
  clearTimeout(shared.picTimer);
  if(!shared.scholarPlay||shared.scholarPic.manual||!item.picture||shared.scholarOpen.picture===false)return;
  shared.picTimer=setTimeout(()=>{
    if(shared.step!=='scholar'||shared.scholarPic.item!==item.id||!shared.scholarPlay||shared.scholarPic.manual)return;if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){shared.scholarPlay=false;mountPicture(item);return;}
    const frame=main.querySelector('[data-section="picture"] .pic-frame')?.getBoundingClientRect(),inView=frame&&frame.bottom>0&&frame.top<window.innerHeight;
    if(!document.hidden&&inView){const next=(shared.scholarPic.index+1)%(item.picture.steps||item.picture.parts).length;shared.scholarPic={item:item.id,index:next,prev:moveFrom(shared.scholarPic.index,next),manual:false};mountPicture(item);}
    picLoop(item);
  },picMs((item.picture.steps||item.picture.parts)[shared.scholarPic.index]?.caption));
}
