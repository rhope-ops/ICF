// Fast start: a first-time player picks only the block and gets a short first session; in a
// question, the keys 1 to 4 answer. Inputs: the blocks of the question file and the callbacks the app passes in.
// Outputs: the "Which block are you in?" screen and one key listener. Loaded by app.mjs.
// Network: none
// Writes: none (the app's callbacks save the session)
// Credentials: none
import { escape, commBadge } from './presentation.mjs';

// Questions in the first session: short enough for about five minutes.
export const FIRST_SESSION_SIZE = 10;
// The first session's help level and question order: timed help, unseen questions first.
export const FIRST_SESSION_MODE = 'Assisted', FIRST_SESSION_ORDER = 'smart';
// A block button takes no tap for this long after the screen opens, so the second tap of a double tap on Start does
// not start a session by accident (a double tap is two taps within about 500 ms).
export const DOUBLE_TAP_MS = 600;

// True only for the first Start on this device (visited: Start was pressed here before) by a player with no history:
// nothing answered, no open session, no exam taken, no block chosen.
export const firstRun = ({visited, answered, session, exams, lastBlock}) => !visited && !answered && !session && !exams && lastBlock == null;

// The screen, built from the parts of the Blocks screen so the two look alike: the same head (greeting, heading,
// badge), what a block does, one block card per block as a button (accent bar, "Block N", title, an arrow at the
// right), then the way to the full setup and the help panel.
export const firstBlockHtml = (blocks, nickname = '') => `<div class="page-head hub-head"><p class="label">${escape(nickname ? `Welcome, ${nickname}` : 'Cyber Fundamentals')}</p><h1>Which block are you in?</h1>${commBadge}</div>
  <p class="lede first-lede">Pick your block to start ${FIRST_SESSION_SIZE} practice questions.</p>
  <div class="first-blocks">${blocks.map(b => `<button type="button" class="panel block-card first-block" data-tone="blue" data-first-block="${b.id}"><span class="step-head"><span class="num">Block ${b.id}</span><span class="first-title">${escape(b.title)}</span></span></button>`).join('')}</div>
  <p class="first-links"><button type="button" class="link-button" id="first-setup">Set up my own session</button><button type="button" class="link-button" id="first-help">How to use</button></p>`;

/**
 * Draws the screen and binds its controls. A block button ignores taps in the first DOUBLE_TAP_MS; such a tap puts
 * focus back on the heading, where the app put it, so a screen reader stays at the question.
 * @param {HTMLElement} main The app's main element.
 * @param {{blocks:Array<{id:number,title:string}>, nickname:string, start:(block:number)=>void, setup:()=>void, help:()=>void}} app The served blocks, the player's nickname and what each control does.
 * @returns {void}
 */
export function renderFirstBlock(main, {blocks, nickname, start, setup, help}) {
  main.innerHTML = firstBlockHtml(blocks, nickname);
  const shown = performance.now();
  main.querySelectorAll('[data-first-block]').forEach(b => b.onclick = () => { if (performance.now() - shown >= DOUBLE_TAP_MS) start(Number(b.dataset.firstBlock)); else main.querySelector('h1').focus({preventScroll: true}); });
  main.querySelector('#first-setup').onclick = setup;
  main.querySelector('#first-help').onclick = help;
}

// The answer tile a key picks: "1" to "4" pick the tile at that place on screen; any other key, or a place with no
// tile or a tile that is off (disabled: removed by the timed help; aria-disabled: the question is answered or an
// earlier one is on screen), picks nothing.
export function answerKeyTile(key, tiles) {
  const tile = /^[1-4]$/.test(key) ? tiles[Number(key) - 1] : null;
  return tile && tile.getAttribute('aria-disabled') !== 'true' && !tile.disabled ? tile : null;
}

/**
 * Study keys: 1 to 4 press the answer tile at that place, through the tile's own click, so a key and a tap do the same
 * (focus goes to the tile first, as a tap does).
 * Enter needs no code: after an answer the app puts focus on Next. Never while typing, with a modifier key or on repeat.
 * @param {()=>boolean} live True while a question is on screen and takes answers (no dialog, menu or pause).
 * @param {()=>ArrayLike<HTMLElement>} tiles The answer tiles on screen, in order.
 * @returns {void}
 */
export function installStudyKeys(live, tiles) {
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.repeat || !live()) return;
    if (event.target?.closest?.('input,textarea,select,[contenteditable=""],[contenteditable="true"]')) return;
    const tile = answerKeyTile(event.key, tiles());
    if (tile) { event.preventDefault(); tile.focus({preventScroll: true}); tile.click(); }
  });
}
