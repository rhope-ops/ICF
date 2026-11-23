// Saved card sets: the fixed set IDs, the block filter and the Saved card sets screen HTML.
// Inputs: a set or the library, the card catalog, the groups and the selected block. Outputs: card lists, HTML.
// Run: imported through flashcards.mjs, which re-exports its public names.
// Network: none.
// Writes: none.
// Credentials: none.
import { LABEL } from './settings.mjs';
import { MISSED_SET, MANUAL_SET } from './storage.mjs';
import { escape, plural } from './presentation.mjs';

export const MISSED_ID = MISSED_SET.id, MANUAL_ID = MANUAL_SET.id;
// Saved cards by block: the one library holds every block's cards, and each view shows one block
// (the current block by default) or ALL_BLOCKS, so any block can open the cards of every block. The block comes from the
// card's question ID (B4-U2-Q020 is Block 4), so the stored schema is unchanged. Highlight cards have no block and show
// in every view.
export const ALL_BLOCKS = 'all';
// The block number in a question id such as B4-U2-Q020 (4); null when the id has none.
export const cardBlock = id => Number(/^B(\d+)-/.exec(id)?.[1]) || null;
// True when the question id belongs to the block, or the view shows all blocks.
const inBlock = (id, block) => block === ALL_BLOCKS || cardBlock(id) === block;
// The cards of a set that are in the block: its question cards from the catalog, then its highlight cards.
export function cardsInSet(set, catalog, block = ALL_BLOCKS) {
  return [...set.questionIds.filter(id => inBlock(id, block)).flatMap(id => catalog.filter(c => c.questionId === id)),
    ...(set.cards || []).map(c => ({ ...c, source:{ ...c.source } }))];
}

// Per-set card list: every stored entry of the view, including ones no longer in the
// current bank, so the user can remove any card without studying the set.
export function setEntries(set, catalog, block = ALL_BLOCKS) {
  return [...set.questionIds.filter(id => inBlock(id, block)).map(id => {
    const card = catalog.find(c => c.questionId === id);
    return { key:id, term:card ? card.term : null, block:cardBlock(id) };
  }), ...(set.cards || []).map(c => ({ key:c.id, term:c.term, highlight:true, block:null }))];
}

// The card list of a set, one heading per block (Block 1, Block 4 ...; highlight cards last, under Highlights).
function setCardsHtml(set, catalog, block) {
  const entries = setEntries(set, catalog, block);
  if (!entries.length) return '';
  const groups = [...new Set(entries.map(e => e.block))].sort((a, b) => (a ?? Infinity) - (b ?? Infinity));
  // One list row of a card with its Remove button.
  const row = e => `<li><span>${e.term ? escape(e.term) : `Unavailable card <span class="muted">${escape(e.key)}</span>`}${e.highlight ? ' <span class="muted">· highlight</span>' : ''}</span><button class="small" data-remove-card="${escape(e.key)}" data-set="${escape(set.id)}" aria-label="Remove ${escape(e.term || e.key)} from ${escape(set.name)}">Remove</button></li>`;
  return `<details class="set-cards"><summary>Edit cards (${entries.length})</summary>${groups.map(b => `<h3 class="label set-block">${b === null ? 'Highlights' : `${LABEL.Group} ${b}`}</h3><ul>${entries.filter(e => e.block === b).map(row).join('')}</ul>`).join('')}</details>`;
}

// The block filter of the saved sets (Saved card sets screen and the card setup): All blocks, then each block.
// blocks: [{id, title}]; block: a block id or ALL_BLOCKS.
export const setsBlockHtml = (blocks, block, id = 'sets-block') => `<label class="field sets-block" for="${escape(id)}">${LABEL.Group}<span class="selwrap"><select id="${escape(id)}"><option value="${ALL_BLOCKS}"${block === ALL_BLOCKS ? ' selected' : ''}>All ${LABEL.groups}</option>${blocks.map(b => `<option value="${b.id}"${b.id === block ? ' selected' : ''}>${LABEL.Group} ${b.id} · ${escape(b.title)}</option>`).join('')}</select></span></label>`;
// Read the value of the block filter: ALL_BLOCKS stays as it is, anything else becomes a number.
export const setsBlockValue = value => value === ALL_BLOCKS ? ALL_BLOCKS : Number(value);

// The two sets: study either one, or remove cards from it. No create, rename or delete. blocks/block: the block filter.
export function savedSetsHtml(library, catalog, { blocks = [], block = ALL_BLOCKS } = {}) {
  const scope = block === ALL_BLOCKS ? `all ${LABEL.groups}` : `${LABEL.Group} ${block}`;
  return `<div class="page-head"><p class="label">Flash cards</p><h1>Saved card sets</h1></div><div class="panel sets-filter">${setsBlockHtml(blocks, block)}</div>${library.sets.map(set => {
    const count = cardsInSet(set,catalog,block).length, unavailable = setEntries(set,catalog,block).filter(e => !e.term).length, auto = set.id === MISSED_ID;
    return `<section class="panel set-panel"><h2>${escape(set.name)}${auto ? ' <span class="tag">Auto</span>' : ''}</h2><p class="muted">${plural(count, 'card')} in ${scope}${unavailable ? ` · ${unavailable} unavailable` : ''}${auto ? ' · fills from missed questions' : ''}</p>
      <div class="actions"><button class="primary" data-open-set="${escape(set.id)}" ${count ? '' : 'disabled'}>Study set</button></div>${setCardsHtml(set, catalog, block)}</section>`;
  }).join('')}`;
}
