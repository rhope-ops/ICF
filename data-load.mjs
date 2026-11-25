// Data files after the first screen: the tagged fetch of the site's own JSON files, the glossary, the Scholar index, the
// flash card catalog (cards.json) and the source excerpts (loaded on demand), and the redraw when late content arrives.
// Inputs: the release-files list (app.mjs) and the served JSON files. Outputs: the loaded data in shared state.
// Run: loaded by the browser as part of the app (site/dist/index.html).
// Network: the site's own files only (glossary.json, scholar.json, cards.json, source-links.json and the excerpt modules).
// Writes: browser storage through persist() (scholar; card sets through cards-ui.writeWaitingMissed and the bookmark
// move) and the page DOM. Credentials: none.
import { FEATURES } from './settings.mjs';
import { shared } from './app-state.mjs';
import { EXCERPT_SCREENS, main, persist, read, releaseFiles } from './app.mjs';
import { writeWaitingMissed } from './cards-ui.mjs';
import { keepScroll } from './exam-ui.mjs';
import { restoreCatalog } from './flashcards.mjs';
import { restoreGlossary } from './glossary.mjs';
import { focusHeading, render, syncScreens } from './nav.mjs';
import { loadScholarGroup } from './scholar-ui.mjs';
import { blockLoaded, restoreScholar, restoreScholarState } from './scholar.mjs';
import { migrateBookmarks } from './session.mjs';

// Fetch one of the site's own JSON files by its content tag (so a new build is never mixed with an old one) and parse it.
export async function fetchJson(path){const tag=releaseFiles[path.slice(2)],response=await fetch(tag?`${path}?v=${tag}`:path,{cache:'no-store'});if(!response.ok)throw Error(`${path} ${response.status}`);return response.json();}
// Load the two excerpt modules once (validation and markup); a failure allows a later try.
function loadExcerptKit(){
  return shared.excerptKitLoad ||= Promise.all([import('./sources.mjs'),import('./reader.mjs')]).then(([logic,view])=>(shared.excerptKit={logic,view})).catch(error=>{shared.excerptKitLoad=null;throw error;});
}
// Load and check the source-link file once, with the excerpt modules; a failure allows a later try.
function loadLinks(){return shared.linkLoad ||= Promise.all([loadExcerptKit(),fetchJson('./source-links.json')]).then(([kit,raw])=>(shared.linkData=kit.logic.validateLinks(raw))).catch(error=>{shared.linkLoad=null;throw error;});}
// Callers decide visibility first; this never runs for an unresolved appearance.
export function sourceExcerpt(q){
  if(!FEATURES.sourceExcerpts)return '';  // switched off: no excerpt, and its modules and file never load
  if(shared.linkData&&shared.excerptKit)return shared.excerptKit.view.excerptHtml(shared.excerptKit.logic.excerptsFor(shared.linkData,q.id));
  if(shared.linkFailed)return '<section class="source-excerpt" aria-label="Source excerpt"><p class="muted">Source excerpt unavailable. Check the connection.</p></section>';
  loadLinks().then(()=>{if(EXCERPT_SCREENS.includes(shared.step))keepScroll(render);}).catch(()=>{shared.linkFailed=true;if(EXCERPT_SCREENS.includes(shared.step))keepScroll(render);});
  return '<section class="source-excerpt" aria-label="Source excerpt" aria-busy="true"><p class="muted">Loading source…</p></section>';
}
// Draws the screen again for content that arrived late, where that content shows, and puts focus back on the same control; when focus could not be kept, the next render shows the content instead.
function redrawLate(screens=['units',...EXCERPT_SCREENS]){const at=document.activeElement||document.body,inMain=main.contains(at),find=at.id?`#${CSS.escape(at.id)}`:at.dataset?.study?`[data-study="${at.dataset.study}"]`:at.matches('h1')?'h1':null;if(screens.includes(shared.step)&&(find||!inMain)){keepScroll(render);const to=inMain&&main.querySelector(find);if(find==='h1')focusHeading(to);else if(to)to.focus({preventScroll:true});}else syncScreens();}
// The screens that show cards (SAVE buttons, card counts, card sets): they are drawn again when the card file arrives.
// A function, not a constant: EXCERPT_SCREENS (app.mjs) is set only after this module has loaded.
const cardScreens=()=>['units','cards-setup','saved-card-sets',...EXCERPT_SCREENS];
// The flash card catalog (cards.json): its load starts with the glossary after the first screen, or at the first card need
// before that (catalogCards). Until it arrives, or after a failure: no SAVE button, no card counts and no cards in a set;
// saved card sets are kept, a missed question waits for Missed Questions (writeWaitingMissed), and the next card need
// tries the load again. On arrival: the waiting writes, the bookmark move (once the glossary is in) and a redraw.
export function loadCards(){
  if(!FEATURES.cardCatalog)return Promise.resolve();  // switched off: no card file, so no cards and no SAVE button
  // A failed fetch, or a body that is not JSON, is tried again at the next card need; a file that fails the catalog check
  // (restoreCatalog) is not, because the same file would come back. The work after a load is outside these catches, so
  // an error there is reported by the browser, not hidden.
  return shared.cardLoad ||= fetchJson('./cards.json')
    .then(raw=>{shared.cardData=restoreCatalog(raw);shared.cardCatalog=null;},()=>{shared.cardLoad=null;})
    .catch(()=>{})
    .then(()=>{if(!shared.cardData)return;writeWaitingMissed();migrateBookmarks();redrawLate(cardScreens());});
}
/** Glossary and Scholar index load after the first screen (optional; a quarter of the first download). Until then, or on
 * a failure: Glossary tile off, no term links, no Scholar in Mode. The card file loads at the same time (loadCards).
 * @returns {Promise<void>} settles when the glossary, the Scholar index and the saved Scholar place are in
 */
export async function loadExtras(){
  loadCards();
  [shared.glossary,shared.scholar]=await Promise.all([fetchJson('./glossary.json').then(restoreGlossary).catch(()=>null),fetchJson('./scholar.json').then(restoreScholar).catch(()=>null)]);
  // The bookmark move needs the glossary and the cards: here when the cards came first, else in loadCards. Nothing here waits for the cards.
  if(shared.cardData)migrateBookmarks();
  const raw=read('scholar',null),held=Number.isInteger(raw?.block)&&Boolean(shared.scholar?.index[String(raw.block)]);  // held (as at an offline start) until its block file is here, so an Open Scholar in between carries the saved picks
  if(held)shared.scholarPending=raw;else{shared.scholarState=restoreScholarState(raw,shared.scholar);if(raw!==null&&!shared.scholarState&&shared.scholar)persist('scholar',null);}
  redrawLate();
  if(held&&await loadScholarGroup(raw.block)&&shared.scholarPending===raw){shared.scholarPending=null;shared.scholarState=restoreScholarState(raw,shared.scholar);if(!shared.scholarState)persist('scholar',null);}
  if(shared.scholarState&&!blockLoaded(shared.scholar,shared.scholarState.block))await loadScholarGroup(shared.scholarState.block);syncScreens();  // Resume Scholar
}
