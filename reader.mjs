// Source excerpt presentation: escaped markup only. Loaded only on demand, after
// the correct answer is known. The app has no reader (the owner, 2026-11-07), so an
// excerpt names its document and physical page and links nowhere.
import { escape, pageLabel, dropHtml, excerptBody } from './presentation.mjs';

const correctionNote = c => `Corrected (${c.id}): the source prints “${c.printed}”.`;

// The Source drop-down of the answer tools row (see presentation.dropHtml). A list excerpt shows its paragraphs and real
// lists (row.blocks, built by build_source_reader.py), as the glossary does.
export function excerptHtml(rows, { heading = 'Source' } = {}) {
  if (!rows.length) return '';
  return dropHtml('source', heading, rows.length, rows.length === 1 ? 'excerpt' : 'excerpts', `<div class="excerpt">${rows.map(row =>
    `<figure><blockquote>${excerptBody(row)}</blockquote><figcaption>${escape(pageLabel(row.label, row.page))}</figcaption>${(row.corrections || []).map(c =>
      `<p class="correction-note">${escape(correctionNote(c))}</p>`).join('')}</figure>`).join('')}</div>`);
}
