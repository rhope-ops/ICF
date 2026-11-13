// Source excerpt logic: validates source-links.json and looks up a question's
// excerpts. Loaded only on demand; no DOM, network or storage access.
// The app has no source reader (2026-11-07); reader search and highlights were removed.
const DOC = /^[A-Z0-9-]{1,20}$/, ID = /^[\w-]{1,100}$/, ERRATUM = /^[A-Z0-9-]{1,30}$/;
const isInt = (n, min = 0) => Number.isInteger(n) && n >= min;
const text = (s, max) => typeof s === 'string' && s.length > 0 && s.length <= max;

export function validateLinks(raw) {
  const fail = () => { throw Error('Source excerpts could not be read.'); };
  if (!raw || raw.schema !== 1 || !raw.documents || typeof raw.documents !== 'object' || !raw.links || typeof raw.links !== 'object') fail();
  for (const [doc, label] of Object.entries(raw.documents)) if (!DOC.test(doc) || !text(label, 80)) fail();
  for (const [id, rows] of Object.entries(raw.links)) {
    if (!ID.test(id) || !Array.isArray(rows) || !rows.length || rows.length > 3) fail();
    for (const row of rows)
      if (!Object.hasOwn(raw.documents, row?.doc) || !isInt(row.page, 1) || !isInt(row.start) || !isInt(row.end, row.start + 1) ||
          !text(row.text, 4000) || row.text.length !== row.end - row.start ||
          (row.corrections !== undefined && (!Array.isArray(row.corrections) || !row.corrections.every(c => ERRATUM.test(c?.id ?? '') && text(c.printed, 400))))) fail();
  }
  return raw;
}

export function excerptsFor(links, questionId) {
  return (links?.links?.[questionId] || []).map(row => ({ ...row, label: links.documents[row.doc] }));
}
