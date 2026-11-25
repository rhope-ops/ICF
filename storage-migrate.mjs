// Save migrations: a saved session, learning records, review list and card sets from an older bank version.
// Only exact known versions migrate; anything else is refused. Inputs: saved values and the bank with its
// migrations. Outputs: migrated values. Run: imported through storage.mjs, which re-exports its public names.
// Network: none.
// Writes: none (the caller saves the results).
// Credentials: none.
import { start } from './engine.mjs';

/**
 * Whether a question ID was served in a migration's version. A full migration pins every question's hash
 * (questionHashes); a short one pins only the questions whose served record differs from this bank (changed) and lists
 * this bank's questions that the old version did not serve (absent); every other question of this bank is unchanged.
 * @param {object} migration One entry of bank.migrations (attachMigrations).
 * @param {object} bank The validated current bank.
 * @param {string} id A question ID.
 * @returns {boolean} True when that version served the ID.
 */
export function servedIn(migration, bank, id) {
  if (migration.questionHashes) return Object.hasOwn(migration.questionHashes, id);
  return Object.hasOwn(migration.changed, id) || (!migration.absent.includes(id) && bank.questions.some(q => q.id === id));
}
/**
 * Whether a saved full question record is exactly the record that the migration's version served.
 * @param {object} migration One entry of bank.migrations (attachMigrations).
 * @param {object} bank The validated current bank.
 * @param {object} q A saved question record.
 * @returns {Promise<boolean>} True on an exact match (sha256 of JSON.stringify, or the unchanged current record).
 */
async function servedRecord(migration, bank, q) {
  const pinned = migration.questionHashes ? migration.questionHashes[q.id] : migration.changed[q.id];
  if (pinned === undefined && !migration.questionHashes) {
    const now = servedIn(migration, bank, q.id) && bank.questions.find(x => x.id === q.id);
    return Boolean(now) && JSON.stringify(now) === JSON.stringify(q);
  }
  const bytes = new TextEncoder().encode(JSON.stringify(q));
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
  return pinned === hash;
}
/**
 * Migrate a saved session made on an earlier content version. Only exact, hash-pinned old served records from this
 * authorized wording revision migrate. Corrupt or mismatched snapshots still flow to the usual restore rejection.
 * Needs the attached migrations (attachMigrations).
 * @param {object} saved the parsed saved session.
 * @param {object} bank the current bank, with its migrations attached.
 * @returns {Promise<object|null>} the migrated session, the same save when nothing applies, or null when no question is left.
 */
export async function migrateSession(saved, bank) {
  const migration=bank.migrations?.find(m=>m.version===saved?.version);
  if(!migration)return saved;
  const compact=saved.contentRef===saved.version&&saved.questions===undefined;
  if(compact){
    if(!Array.isArray(saved.pool)||saved.pool.some(id=>!servedIn(migration,bank,id)))return saved;
  }else{
    if(!Array.isArray(saved.questions))return saved;
    for(const q of saved.questions)if(!await servedRecord(migration,bank,q))return saved;
  }
  const allowed=new Set(bank.questions.map(q=>q.id));
  const next=structuredClone(saved);delete next.contentRef;
  if(!Array.isArray(next.pool)||!Array.isArray(next.queue)||!Array.isArray(next.attempts))return saved;
  if(next.queue.some(id=>!next.pool.includes(id)))return saved;
  // Keep only the ids that the current bank still serves.
  const kept=ids=>ids.filter(id=>allowed.has(id));
  next.pool=kept(next.pool);
  if(!next.pool.length)return null;
  next.queue=kept(next.queue);
  next.questions=next.pool.map(id=>bank.questions.find(q=>q.id===id));
  next.attempts=next.attempts.filter(a=>allowed.has(a.questionId));
  for(const key of ['correctIds','independentIds','missedIds'])if(Array.isArray(next[key]))next[key]=kept(next[key]);
  next.hints=(next.hints||[]).filter(h=>allowed.has(h.questionId)).map(h=>({...h,attemptsBeforeHint:saved.attempts.slice(0,h.attemptsBeforeHint).filter(a=>allowed.has(a.questionId)).length}));
  next.history=(next.history||[]).filter(h=>allowed.has(h.id));
  const viewed=saved.viewIndex!=null?saved.history?.[saved.viewIndex]?.appearance:null;
  const viewIndex=next.history.findIndex(h=>h.appearance===viewed);
  next.viewIndex=viewIndex<0?null:viewIndex;
  if(next.current&&!allowed.has(next.current.id)){
    if(next.queue.length){
      const id=next.queue.shift();
      const fresh=start([bank.questions.find(q=>q.id===id)],{version:bank.version,mode:next.nextMode||next.mode});
      next.mode=fresh.mode;next.nextMode=null;
      next.appearances++;
      next.current={...fresh.current,appearance:next.appearances};
    }else {next.current=null;next.finished=true;}
  }
  if(next.current){
    next.current.mode ||= next.mode;
    if(!migration.preserveTiming&&!next.current.resolved)next.current.nextStageAt=Math.max(30000,next.current.nextStageAt,next.current.assistedMs+10000);
  }
  next.version=bank.version;
  return next;
}
// Learning and review records migrate from the version list alone (migrationVersions): no migrations file needed.
export function migrateLearning(records, bank) {
  const out = structuredClone(records);
  for (const r of Object.values(records)) {
    if (bank.migrationVersions?.includes(r.version) && bank.questions.some(q=>q.id===r.questionId)) {
      const key=`${bank.version}/${r.questionId}`;
      out[key] ??= {...r,version:bank.version};
    }
  }
  return out;
}
// Move a saved review list from an old content version to the current one, dropping ids the bank no longer serves; null when it is damaged or empty.
export function migrateReview(raw, bank) {
  if(!raw||!bank.migrationVersions?.includes(raw.version))return raw;
  if(!Array.isArray(raw.ids)||!Number.isInteger(raw.index))return null;
  const allowed=new Set(bank.questions.map(q=>q.id)),ids=raw.ids.filter(id=>allowed.has(id));
  if(!ids.length)return null;
  const index=Math.min(ids.length-1,raw.ids.slice(0,raw.index).filter(id=>allowed.has(id)).length);
  return {...raw,version:bank.version,ids,index};
}
// Card sets, schema 3: exactly two fixed sets, Missed Questions (automatic) and Manual (the SAVE button).
// Only schemas 1 and 2 migrate (flashcards.restoreCardSets checks their shape first); anything else is refused. Missed
// keeps its cards; every other set merges into Manual, a set named Manual (or id 'manual') first, then saved order. A
// card is kept once, at its first place (sets store no save times, so saved order is the earliest known). None is dropped.
export const MISSED_SET=Object.freeze({id:'missed',name:'Missed Questions'}), MANUAL_SET=Object.freeze({id:'manual',name:'Manual'});
/**
 * Merge the card sets of schema 1 or 2 into the two fixed sets of schema 3; throws when the schema is unknown.
 * @param {object} raw the saved card-set library (schema 1 or 2).
 * @returns {object} the library in schema 3.
 */
export function migrateCardSets(raw) {
  if(!raw||![1,2].includes(raw.schema)||!Array.isArray(raw.sets))throw Error('Saved card sets have an unknown version.');
  // True when two names are the same ignoring case.
  const same=(a,b)=>String(a).toLowerCase()===b.toLowerCase();
  const missed=raw.sets.find(s=>s.id===MISSED_SET.id)||raw.sets.find(s=>same(s.name,MISSED_SET.name))||null;
  const rest=raw.sets.filter(s=>s!==missed),lead=rest.filter(s=>s.id===MANUAL_SET.id||same(s.name,MANUAL_SET.name));
  const ordered=[...lead,...rest.filter(s=>!lead.includes(s))];
  const questionIds=[...new Set(ordered.flatMap(s=>s.questionIds))],seen=new Set(),cards=[];
  for(const c of ordered.flatMap(s=>s.cards||[]))if(!seen.has(c.id)){seen.add(c.id);cards.push(structuredClone(c));}
  return {schema:3,sets:[{...MISSED_SET,questionIds:[...(missed?.questionIds||[])],cards:structuredClone(missed?.cards||[])},{...MANUAL_SET,questionIds,cards}]};
}
