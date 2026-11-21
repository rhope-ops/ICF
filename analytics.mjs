// On-device first-answer accuracy and exposure history for the study game; independent of grading and flags.
// Inputs: the saved stats record and the finished or running study sessions, passed in by the caller.
// Outputs: new stats objects, per-section scores, a priority order of questions and a score colour class.
// Run: imported as an ES module by the app and the tests; it is not run on its own.
// Network: none.
// Writes: none (pure functions on plain objects; storage.mjs does the saving).
// Credentials: none.
import { LABEL } from './settings.mjs';
// Question pool kinds (Random / Smart). An older save kept Smart Mode as a boolean in icf:smart: true maps to Smart.
export const POOL_KINDS = Object.freeze(['random', 'smart']);
export const POOL_LABEL = Object.freeze({ random: 'Random', smart: 'Smart' });
// Return the pool kind to use: the stored kind when valid, else Smart for an old boolean true, else Random.
export const toPoolKind = (stored, legacySmart) => POOL_KINDS.includes(stored) ? stored : legacySmart === true ? 'smart' : 'random';
// Fields that only Scholar used (help-free, confidence and confused-pair counts; the old Scholar is gone).
// They are dropped on load; every other count of the question stays as it was.
const SCHOLAR_KEYS=['freeAsked','freeCorrect','confSure','confUnsure','confGuess','guessCorrect','sureWrong'];
/**
 * Check a saved stats record and keep what is valid. A damaged record is dropped on its own and the other
 * records stay. Only an unknown schema or a damaged outer shape starts empty. `dropped` counts what was lost,
 * so the app can tell the user; without that, the next save would silently overwrite the stored stats.
 * @param {*} raw the parsed saved stats, or null when nothing was saved.
 * @returns {{stats: object, dropped: number, reset: boolean}} the cleaned stats, the count of dropped records and
 * whether the whole record was reset.
 */
export function inspectStats(raw) {
  // Return a new, empty stats record.
  const empty=()=>({schema:1,questions:{},sessions:{}});
  // True when the value is a plain object (not null, not an array).
  const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
  // True when the value is a whole number of 0 or more.
  const count=n=>Number.isSafeInteger(n)&&n>=0;
  // True when the value is a list of distinct whole numbers above 0.
  const identities=value=>Array.isArray(value)&&new Set(value).size===value.length&&value.every(n=>Number.isSafeInteger(n)&&n>0);
  if(raw==null)return {stats:empty(),dropped:0,reset:false};
  if(!object(raw)||raw.schema!==1||!object(raw.questions)||!object(raw.sessions))return {stats:empty(),dropped:0,reset:true};
  // True when the value is a well-formed per-question record: counts agree and the units and block are valid.
  const question=r=>object(r)&&[r.seen,r.correct,r.asked,r.misses].every(count)&&r.correct+r.misses===r.asked&&r.asked<=r.seen&&identities(r.units)&&r.units.length>0&&Number.isSafeInteger(r.block)&&r.block>=1&&
    // Exam answers are part of asked/correct and also counted here, so study accuracy can leave them out.
    (r.examAsked===undefined&&r.examCorrect===undefined||[r.examAsked,r.examCorrect].every(count)&&r.examCorrect<=r.examAsked&&r.examAsked<=r.asked&&r.examCorrect<=r.correct);
  // True when the value is a well-formed per-session record: scored ids are among the seen ids and the counts agree.
  const session=r=>object(r)&&identities(r.seen)&&identities(r.scored)&&r.scored.every(n=>r.seen.includes(n))&&count(r.correct)&&count(r.asked)&&r.asked===r.scored.length&&r.correct<=r.asked;
  const out=empty();let dropped=0;
  for(const [id,r] of Object.entries(raw.questions)){
    if(!question(r)){dropped++;continue;}
    const kept=structuredClone(r);for(const k of SCHOLAR_KEYS)delete kept[k];out.questions[id]=kept;
  }
  for(const [id,r] of Object.entries(raw.sessions)){if(session(r))out.sessions[id]=structuredClone(r);else dropped++;}
  return {stats:out,dropped,reset:false};
}
/**
 * Return only the stats of a saved record, dropping the report of what was lost.
 * @param {*} raw the parsed saved stats, or null.
 * @returns {object} the cleaned stats record.
 */
export const restoreStats=raw=>inspectStats(raw).stats;
/**
 * Add one study session to the stats: count each first appearance as seen and each first answer as asked, correct
 * or missed. Answers already counted for this session are not counted twice.
 * @param {object} stats the current stats record (it is copied, not changed).
 * @param {object} session the session with its id, questions, history, current card and attempts.
 * @returns {object} a new stats record that includes the session.
 */
export function recordSession(stats,session) {
  const next=structuredClone(stats),key=session.id;
  if(!key)return next;
  const old=next.sessions[key]||{seen:[],scored:[],correct:0,asked:0};
  const seen=new Set(old.seen),scored=new Set(old.scored);
  // Return the stats row of a question, creating it on first use; null when the question is not in the session.
  const get=id=>{
    const q=session.questions.find(q=>q.id===id);
    if(!q)return null;
    return next.questions[id]??={seen:0,correct:0,asked:0,misses:0,units:[...q.units],block:q.block};
  };
  const appearances=[...(session.history||[]),...(session.current?[session.current]:[])];
  for(const c of appearances){if(!seen.has(c.appearance)){const r=get(c.id);if(r){r.seen++;seen.add(c.appearance);}}}
  // Count one answer for an appearance, once per appearance; also count it as seen if it was not yet.
  const score=(id,appearance,correct)=>{
    if(scored.has(appearance))return;
    const r=get(id);if(!r)return;
    if(!seen.has(appearance)){r.seen++;seen.add(appearance);}
    r.asked++;r.correct+=Number(correct);r.misses+=Number(!correct);
    // Exam answers still count toward Smart Mode weighting (asked/misses); the exam tag keeps them separable.
    if(session.kind==='exam'){r.examAsked=(r.examAsked||0)+1;r.examCorrect=(r.examCorrect||0)+Number(correct);}
    old.asked++;old.correct+=Number(correct);scored.add(appearance);
  };
  for(const a of session.attempts)score(a.questionId,a.appearance,a.correct);
  for(const c of appearances)if(c.resolved==='revealed')score(c.id,c.appearance,false);
  next.sessions[key]={...old,seen:[...seen],scored:[...scored],kind:session.kind,activeMs:session.activeMs,finished:session.finished,ended:session.ended};
  return next;
}
// Add up asked and correct counts for one block, in total and for each of its units (exam answers included).
export function unitScores(stats,block,units) {
  const rows=units.map(unit=>({id:unit.id,title:unit.title,correct:0,asked:0}));
  let correct=0,asked=0;
  for(const r of Object.values(stats.questions))if(r.block===block){correct+=r.correct;asked+=r.asked;for(const row of rows)if(r.units.includes(row.id)){row.correct+=r.correct;row.asked+=r.asked;}}
  return {correct,asked,rows};
}
// Study first-answer accuracy: unitScores without exam answers (Exam results compare against this).
export function studyScores(stats,block,units) {
  const rows=units.map(unit=>({id:unit.id,title:unit.title,correct:0,asked:0}));
  let correct=0,asked=0;
  for(const r of Object.values(stats.questions))if(r.block===block){
    const c=r.correct-(r.examCorrect||0),a=r.asked-(r.examAsked||0);
    correct+=c;asked+=a;for(const row of rows)if(r.units.includes(row.id)){row.correct+=c;row.asked+=a;}
  }
  return {correct,asked,rows};
}
// Order questions for Smart Mode: unseen first, then by a random key weighted so often-missed questions come earlier.
export function prioritize(questions,stats,random=Math.random) {
  return questions.map(q=>{
    const r=stats.questions[q.id],seen=r?.seen||0;
    const weight=(1+4*(r?.misses||0)/(r?.asked||1))/(1+Math.log1p(seen));
    return {q,tier:seen?1:0,key:-Math.log(Math.max(Number.EPSILON,random()))/weight};
  }).sort((a,b)=>a.tier-b.tier||a.key-b.key).map(r=>r.q);
}
// List the units that had missed questions in a session, most missed first, with each unit's title and count.
export function missedUnits(session,blocks) {
  const missed=new Set(session.missedIds||session.attempts.filter(a=>!a.correct).map(a=>a.questionId)),counts=new Map();
  for(const q of session.questions)if(missed.has(q.id))for(const id of q.units){const key=`${q.block}/${id}`;const title=blocks.find(b=>b.id===q.block)?.units.find(u=>u.id===id)?.title||`${LABEL.Section} ${id}`;const row=counts.get(key)||{id,title,count:0};row.count++;counts.set(key,row);}
  return [...counts.values()].sort((a,b)=>b.count-a.count||a.id-b.id);
}
// Map a score ratio to a CSS class: muted when there is no score, gold above 96 percent, correct from 70 percent.
export const scoreTone = ratio => ratio===null?'muted':ratio>0.96?'score-gold':ratio>=0.7?'correct-label':'incorrect-label';
