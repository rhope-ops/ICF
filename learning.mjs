// Player understanding is separate from attempts and editorial review flags.
// This file holds the Not-understood records (one per question and content version), the lists of missed question ids
// and the saved review position. Inputs: records, sessions and the question bank. Outputs: new objects and id lists.
// Run: imported as an ES module by the app and the tests; it is not run on its own.
// Network: none.
// Writes: none (the caller saves what these functions return).
// Credentials: none.

// The record key of a question: its content version, a slash and its id.
const key = (version, id) => `${version}/${id}`;
// Check the saved understanding records and return a copy; throw when the object or a record is not valid.
export function restoreUnderstanding(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Invalid understanding history');
  for (const [id, r] of Object.entries(raw)) {
    if (!r || typeof r.version !== 'string' || typeof r.questionId !== 'string' || id !== key(r.version,r.questionId) ||
      typeof r.understood !== 'boolean' || ![null,'yes','no'].includes(r.decision) || r.understood !== (r.decision === 'yes') ||
      typeof r.updatedAt !== 'string') throw Error('Invalid understanding record');
  }
  return structuredClone(raw);
}
// Mark questions as not understood (decision still open) and return the new records.
export function markMissed(records, version, ids, now) {
  const next=structuredClone(records);
  for (const id of new Set(ids)) next[key(version,id)]={version,questionId:id,understood:false,decision:null,updatedAt:now};
  return next;
}
// Record the user's Yes or No answer to "did you understand?" for one question; throw if it is not a boolean.
export function assessUnderstanding(records, version, id, understood, now) {
  if (typeof understood !== 'boolean') throw Error('Choose Yes or No');
  return {...records,[key(version,id)]:{version,questionId:id,understood,decision:understood?'yes':'no',updatedAt:now}};
}
// The understanding record of a question for a content version, or null when there is none.
export const understandingRecord = (records, version, id) => records[key(version,id)] || null;
// The bank questions (not Exam-tier) marked not understood, limited to a block and units when given.
export function notUnderstoodQuestions(bank, records, units=null, block=null) {
  // Exam-tier items are exam-only: they never join marked-review practice.
  return [...new Map(bank.questions.filter(q => q.studyMode !== 'Exam' && (block === null || q.block === block) && (units === null || q.units.some(u => units.includes(u))) &&
    understandingRecord(records,bank.version,q.id)?.understood === false).map(q=>[q.id,q])).values()];
}
// The ids of the session's pool that were missed (a wrong answer or a reveal), in pool order.
export function sessionMissedIds(session) {
  const missed=new Set([...(session.missedIds || []),...session.attempts.filter(a=>!a.correct).map(a=>a.questionId)]);
  if(session.current?.resolved==='revealed')missed.add(session.current.id);
  return session.pool.filter(id=>missed.has(id));
}
// The ids newly missed between two states of a session (new wrong answers, or a reveal), without repeats.
export function newMissedIds(before, after) {
  const missed=after.attempts.slice(before?.attempts.length || 0).filter(a=>!a.correct).map(a=>a.questionId);
  if(after.reveals>(before?.reveals || 0) && after.current?.resolved==='revealed')missed.push(after.current.id);
  return [...new Set(missed)];
}
// The ids to review for a session: for a not-understood session the ones still marked no, else the missed ones.
export function reviewIds(session, records) {
  return session.kind === 'not_understood'
    ? session.pool.filter(id => understandingRecord(records,session.version,id)?.understood === false)
    : sessionMissedIds(session);
}
// Check a saved review position against the bank; return a copy, or null when it does not match.
export function restoreReview(raw, bank) {
  if (!raw || raw.version!==bank.version || !Array.isArray(raw.ids) || !raw.ids.length || new Set(raw.ids).size!==raw.ids.length ||
    raw.ids.some(id=>!bank.questions.some(q=>q.id===id)) || !Number.isInteger(raw.index) || raw.index<0 || raw.index>=raw.ids.length) return null;
  return structuredClone(raw);
}
