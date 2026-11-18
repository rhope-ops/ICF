// Source excerpt logic: validates source-links.json and looks up a question's
// excerpts. Loaded only on demand; no DOM, network or storage access.
// The app has no source reader; reader search and highlights were removed.
const DOC = /^[A-Z0-9-]{1,20}$/, ID = /^[\w-]{1,100}$/, ERRATUM = /^[A-Z0-9-]{1,30}$/;
const isInt = (n, min = 0) => Number.isInteger(n) && n >= min;
const text = (s, max) => typeof s === 'string' && s.length > 0 && s.length <= max;
// Optional list structure: paragraphs {p} and lists {ul: [{t, sub?: [string]}]}.
const blocksOk = b => b === undefined || Array.isArray(b) && b.length > 0 && b.length <= 200 && b.every(x => x && (text(x.p, 4000) && Object.keys(x).length === 1 ||
  Array.isArray(x.ul) && Object.keys(x).length === 1 && x.ul.length > 0 && x.ul.every(i => i && text(i.t, 4000) && (i.sub === undefined || Array.isArray(i.sub) && i.sub.every(t => text(t, 4000))))));

// start/end locate the excerpt on its page; a raw row's text is exactly that span. A newer row is cleaned into sentences
// (F-13, cleaned: true), so only its length may differ.
export function validateLinks(raw) {
  const fail = () => { throw Error('Source excerpts could not be read.'); };
  if (!raw || raw.schema !== 1 || !raw.documents || typeof raw.documents !== 'object' || !raw.links || typeof raw.links !== 'object') fail();
  for (const [doc, label] of Object.entries(raw.documents)) if (!DOC.test(doc) || !text(label, 80)) fail();
  for (const [id, rows] of Object.entries(raw.links)) {
    if (!ID.test(id) || !Array.isArray(rows) || !rows.length || rows.length > 3) fail();
    for (const row of rows)
      if (!Object.hasOwn(raw.documents, row?.doc) || !isInt(row.page, 1) || !isInt(row.start) || !isInt(row.end, row.start + 1) ||
          !text(row.text, 4000) || (row.cleaned === true ? false : row.cleaned !== undefined || row.text.length !== row.end - row.start) || !blocksOk(row.blocks) ||
          (row.corrections !== undefined && (!Array.isArray(row.corrections) || !row.corrections.every(c => ERRATUM.test(c?.id ?? '') && text(c.printed, 400))))) fail();
  }
  return raw;
}

export function excerptsFor(links, questionId) {
  return (links?.links?.[questionId] || []).map(row => ({ ...row, label: links.documents[row.doc] }));
}
