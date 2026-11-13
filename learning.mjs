// Player understanding is separate from attempts and editorial review flags.
const key = (version, id) => `${version}/${id}`;
export function restoreUnderstanding(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Invalid understanding history');
  for (const [id, r] of Object.entries(raw)) {
    if (!r || typeof r.version !== 'string' || typeof r.questionId !== 'string' || id !== key(r.version,r.questionId) ||
      typeof r.understood !== 'boolean' || ![null,'yes','no'].includes(r.decision) || r.understood !== (r.decision === 'yes') ||
      typeof r.updatedAt !== 'string') throw Error('Invalid understanding record');
  }
  return structuredClone(raw);
}
export function markMissed(records, version, ids, now) {
  const next=structuredClone(records);
  for (const id of new Set(ids)) next[key(version,id)]={version,questionId:id,understood:false,decision:null,updatedAt:now};
  return next;
}
export function assessUnderstanding(records, version, id, understood, now) {
  if (typeof understood !== 'boolean') throw Error('Choose Yes or No');
  return {...records,[key(version,id)]:{version,questionId:id,understood,decision:understood?'yes':'no',updatedAt:now}};
}
export const understandingRecord = (records, version, id) => records[key(version,id)] || null;
export function notUnderstoodQuestions(bank, records, units=null, block=null) {
  // Exam-tier items are exam-only: they never join marked-review practice.
  return [...new Map(bank.questions.filter(q => q.studyMode !== 'Exam' && (block === null || q.block === block) && (units === null || q.units.some(u => units.includes(u))) &&
    understandingRecord(records,bank.version,q.id)?.understood === false).map(q=>[q.id,q])).values()];
}
export function sessionMissedIds(session) {
  const missed=new Set([...(session.missedIds || []),...session.attempts.filter(a=>!a.correct).map(a=>a.questionId)]);
  if(session.current?.resolved==='revealed')missed.add(session.current.id);
  return session.pool.filter(id=>missed.has(id));
}
export function newMissedIds(before, after) {
  const missed=after.attempts.slice(before?.attempts.length || 0).filter(a=>!a.correct).map(a=>a.questionId);
  if(after.reveals>(before?.reveals || 0) && after.current?.resolved==='revealed')missed.push(after.current.id);
  return [...new Set(missed)];
}
export function reviewIds(session, records) {
  return session.kind === 'not_understood'
    ? session.pool.filter(id => understandingRecord(records,session.version,id)?.understood === false)
    : sessionMissedIds(session);
}
export function restoreReview(raw, bank) {
  if (!raw || raw.version!==bank.version || !Array.isArray(raw.ids) || !raw.ids.length || new Set(raw.ids).size!==raw.ids.length ||
    raw.ids.some(id=>!bank.questions.some(q=>q.id===id)) || !Number.isInteger(raw.index) || raw.index<0 || raw.index>=raw.ids.length) return null;
  return structuredClone(raw);
}
