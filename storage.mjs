import { APP, LABEL } from './settings.mjs';
import { start, questionsForMode, STUDY_MODES } from './engine.mjs';
import { sessionMissedIds } from './learning.mjs';
export function persistence(storage) {
  return {
    read(key, fallback = null) {
      try { const raw = storage.getItem(APP.storagePrefix + key); return { value: raw === null ? fallback : JSON.parse(raw), error: null }; }
      catch { return { value: fallback, error: 'Saved data could not be read. You can continue with temporary progress.' }; }
    },
    write(key, value) {
      try { storage.setItem(APP.storagePrefix + key, JSON.stringify(value)); return null; }
      catch { return 'Storage is unavailable or full. Progress is temporary; export review notes before closing.'; }
    },
    clear() { try { ['profile','session','flags','understanding','missedReview','device','theme','stats','smart','cardSets','highlights','dynamicCards','saveTarget','pinQuestion','exam','examHistory','examHard','examMix','examCycle','poolKind','glossaryBookmarks','lastBlock','scholar'].forEach(k => storage.removeItem(APP.storagePrefix + k)); return null; } catch { return 'Local data could not be cleared.'; } }
  };
}
// Save IDs/version once, rather than duplicating all static content every second.
export function sessionSnapshot(session) {
  const { questions, ...snapshot } = session;
  return { ...snapshot, contentRef: session.version };
}
export function expandBank(bank) {
  if(!bank.textDictionary)return bank;
  const strings=bank.textDictionary;
  if(!Array.isArray(strings)||strings.some(s=>typeof s!=='string'))throw Error('Invalid content dictionary');
  const decode=v=>{
    if(Array.isArray(v))return v.map(decode);
    if(v&&typeof v==='object'){
      if(Object.keys(v).length===1&&Object.hasOwn(v,'$text')){
        if(!Number.isInteger(v.$text)||typeof strings[v.$text]!=='string')throw Error('Invalid content reference');
        return strings[v.$text];
      }
      return Object.fromEntries(Object.entries(v).filter(([k])=>k!=='textDictionary').map(([k,x])=>[k,decode(x)]));
    }
    return v;
  };
  return decode(bank);
}
export function validateBank(bank) {
  bank=expandBank(bank);
  if (bank.schema !== 1 || typeof bank.version !== 'string' || !Array.isArray(bank.questions)) throw Error('Invalid study content');
  const ids = new Set();
  const blocks = new Map();
  if (!Array.isArray(bank.blocks) || !bank.blocks.length) throw Error(`Missing ${LABEL.group} catalog`);
  for (const block of bank.blocks) {
    if (!Number.isInteger(block.id) || block.id < 1 || blocks.has(block.id) || typeof block.title !== 'string' || !block.title.trim() ||
        !Array.isArray(block.units) || !block.units.length || new Set(block.units.map(u => u.id)).size !== block.units.length ||
        block.units.some(u => !Number.isInteger(u.id) || u.id < 1 || typeof u.title !== 'string' || !u.title.trim())) throw Error(`Invalid ${LABEL.group} catalog`);
    blocks.set(block.id, new Set(block.units.map(u => u.id)));
  }
  for (const q of bank.questions) {
    if (!q.id || ids.has(q.id) || !blocks.has(q.block) || !q.stem || !Array.isArray(q.units) || !q.units.length || q.units.some(u => !blocks.get(q.block).has(u)) ||
      // an Exam-tier item (studyMode and difficulty 'Exam') is exam-only; see engine.questionsForMode.
      ![undefined,'Hard','Exam'].includes(q.studyMode) || q.studyMode === 'Hard' && q.difficulty !== 'Hard' || (q.studyMode === 'Exam') !== (q.difficulty === 'Exam') ||
      !['slides','text'].includes(q.sourceGroup) || !['Easy','Medium','Hard','Exam'].includes(q.difficulty) || !Array.isArray(q.answers) || q.answers.length !== 4 ||
      new Set(q.answers.map(a => a.id)).size !== 4 || new Set(q.answers.map(a => a.text.trim().toLowerCase())).size !== 4 || q.answers.some(a => !a.id || !a.text || !a.rationale) || !q.answers.some(a => a.id === q.correctAnswerId) ||
      !['pending_player_testing','pending_owner_approval'].includes(q.testing?.status) || !['no_concern_identified','needs_testing'].includes(q.testing?.quality_assessment?.status) ||
      !['low','medium','high','very_high'].includes(q.testing?.distinctness_assessment?.overlap_confidence) ||
      !Array.isArray(q.testing?.quality_assessment?.concerns) || q.testing.quality_assessment.concerns.some(c => c.material_defect)) throw Error('Invalid question content');
    if (q.spec !== undefined && q.spec !== 3) throw Error('Invalid question content'); // marker of the current question bank
    if (!Array.isArray(q.keywords) || !q.keywords.length) throw Error('Missing key terms');
    if (q.reviewCue !== undefined && (typeof q.reviewCue !== 'string' || !q.reviewCue.trim() || q.reviewCue.split(/\s+/).length > 25)) throw Error('Invalid review cue');
    const spans = [];
    for (const k of q.keywords) {
      if (!Number.isInteger(k.start) || !Number.isInteger(k.end) || k.start < 0 || k.end <= k.start || k.end > q.stem.length ||
          q.stem.slice(k.start,k.end) !== k.text || spans.some(s => k.start < s.end && k.end > s.start)) throw Error('Invalid key terms');
      spans.push(k);
    }
    ids.add(q.id);
  }
  // Exam forms, optional: per block an order of form names and their question IDs. Every ID is an
  // Exam-tier item of that block, no ID repeats across forms, and every form has the same length.
  if (bank.examForms !== undefined) {
    if (!bank.examForms || typeof bank.examForms !== 'object' || Array.isArray(bank.examForms)) throw Error('Invalid exam forms');
    const byId = new Map(bank.questions.map(q => [q.id, q]));
    for (const [key, f] of Object.entries(bank.examForms)) {
      const block = Number(key), used = new Set();
      if (!blocks.has(block) || String(block) !== key || !f || !Array.isArray(f.order) || !f.order.length || new Set(f.order).size !== f.order.length ||
        f.order.some(n => typeof n !== 'string' || !/^[A-Z]$/.test(n)) || !f.forms || Object.keys(f.forms).length !== f.order.length ||
        f.order.some(n => !Array.isArray(f.forms[n]) || !f.forms[n].length || f.forms[n].length !== f.forms[f.order[0]].length ||
          f.forms[n].some(id => used.has(id) || !used.add(id) || byId.get(id)?.studyMode !== 'Exam' || byId.get(id).block !== block)) ||
        f.rules !== undefined && (!Array.isArray(f.rules) || f.rules.some(r => typeof r !== 'string'))) throw Error('Invalid exam forms');
    }
  }
  // Save migration versions, optional: in order, unique, never this bank's own version. The migrations themselves are in
  // migrations.json (attachMigrations), fetched only for an old saved session or exam.
  const versions = bank.migrationVersions;
  if (versions !== undefined && (!Array.isArray(versions) || new Set(versions).size !== versions.length ||
    versions.some(v => typeof v !== 'string' || !v || v === bank.version))) throw Error('Invalid save migration list');
  return bank;
}
// A pinned question hash: sha256 hex of the question record (servedRecord).
const HASH = /^[0-9a-f]{64}$/;
// isMap: a plain object whose every entry passes ok(key, value).
const isMap = (v, ok) => Boolean(v) && typeof v === 'object' && !Array.isArray(v) && Object.entries(v).every(([k, x]) => ok(k, x));
// pinsHash: one pin entry, a question ID to its hash.
const pinsHash = (id, h) => Boolean(id) && typeof h === 'string' && HASH.test(h);
/**
 * Whether one migrations.json entry has the shape that migrateSession, servedIn and the exam form follow read.
 * @param {object} m The entry.
 * @param {string} version The version that migrationVersions names at the same place.
 * @returns {boolean} True for a full entry (questionHashes) or a short one (changed and absent), with optional
 *   preserveTiming (boolean) and examFormChanges (block, form, old ID to new ID).
 */
function validMigration(m, version) {
  if (!m || typeof m !== 'object' || Array.isArray(m) || m.version !== version) return false;
  const full = m.questionHashes !== undefined;
  const keys = ['version', 'preserveTiming', 'examFormChanges', ...(full ? ['questionHashes'] : ['changed', 'absent'])];
  if (Object.keys(m).some(k => !keys.includes(k))) return false;
  if (full ? !isMap(m.questionHashes, pinsHash) || !Object.keys(m.questionHashes).length
    : !isMap(m.changed, pinsHash) || !Array.isArray(m.absent) || new Set(m.absent).size !== m.absent.length ||
      m.absent.some(id => typeof id !== 'string' || !id || Object.hasOwn(m.changed, id))) return false;
  if (m.preserveTiming !== undefined && typeof m.preserveTiming !== 'boolean') return false;
  return m.examFormChanges === undefined || isMap(m.examFormChanges, (block, forms) => /^[1-9]\d*$/.test(block) &&
    isMap(forms, (form, moves) => /^[A-Z]$/.test(form) && isMap(moves, (from, to) => Boolean(from) && typeof to === 'string' && Boolean(to))));
}
/**
 * The bank with its save migrations from migrations.json.
 * @param {object} bank The validated bank (validateBank).
 * @param {object} raw The parsed migrations.json.
 * @returns {object} A copy of the bank with migrations, in migrationVersions order.
 * @throws {Error} When the file belongs to another bank version, names other versions or another order, or holds an
 *   entry of the wrong shape or a bad text reference.
 */
export function attachMigrations(bank, raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Invalid save migrations');
  const file = expandBank(raw), versions = bank.migrationVersions ?? [];
  if (Object.keys(file).some(k => !['bankVersion', 'migrations'].includes(k)) || file.bankVersion !== bank.version ||
    !Array.isArray(file.migrations) || file.migrations.length !== versions.length ||
    file.migrations.some((m, i) => !validMigration(m, versions[i]))) throw Error('Invalid save migrations');
  return { ...bank, migrations: file.migrations };
}
/**
 * Whether any of the saves (a saved session or exam) was made on a version that needs the migrations file.
 * @param {object} bank The validated bank.
 * @param {...any} saves The raw saved values; null, a current save or an unknown version needs nothing.
 * @returns {boolean} True when a save's version is in migrationVersions.
 */
export const needsMigrations = (bank, ...saves) =>
  saves.some(s => Boolean(s) && typeof s === 'object' && (bank.migrationVersions ?? []).includes(s.version));
/**
 * The bank for restoring the saves: with the migrations attached when a save needs them.
 * @param {object} bank The validated bank.
 * @param {Array} saves The raw saved session and exam.
 * @param {Function} load Returns (a promise of) the parsed migrations.json.
 * @returns {Promise<{bank: object, held: boolean}>} held is true when the file was needed but could not be loaded or
 *   was invalid: the caller then restores nothing and keeps the saves for the next start.
 */
export async function withMigrations(bank, saves, load) {
  if (!needsMigrations(bank, ...saves)) return { bank, held: false };
  try { return { bank: attachMigrations(bank, await load()), held: false }; }
  catch { return { bank, held: true }; }
}
export function restoreSession(saved, bank) {
  try {
    if (saved?.contentRef !== undefined) {
      if (saved.contentRef !== bank.version || saved.questions !== undefined || !Array.isArray(saved.pool)) return null;
      const { contentRef, ...state } = saved;
      saved = { ...state, questions: saved.pool.map(id => bank.questions.find(q => q.id === id)) };
    }
    const kind = saved?.kind ?? 'study';
    if (!['study','not_understood'].includes(kind)) return null;
    if (!saved || saved.schema !== 1 || saved.version !== bank.version || !Array.isArray(saved.pool) || !saved.pool.length || saved.pool.length > bank.questions.length ||
      new Set(saved.pool).size !== saved.pool.length || !Array.isArray(saved.questions) ||
      JSON.stringify(saved.questions) !== JSON.stringify(saved.pool.map(id => bank.questions.find(q => q.id === id))) ||
      !Array.isArray(saved.queue) || saved.queue.some(id => !saved.pool.includes(id)) || new Set(saved.queue).size !== saved.queue.length ||
      !STUDY_MODES.includes(saved.mode) || typeof saved.paused !== 'boolean' || typeof saved.finished !== 'boolean' || typeof saved.ended !== 'boolean' ||
      !Number.isFinite(saved.activeMs) || saved.activeMs < 0 || !Number.isInteger(saved.appearances) || saved.appearances < 1 ||
      !Array.isArray(saved.attempts) || !Array.isArray(saved.correctIds) || !Array.isArray(saved.independentIds) || new Set(saved.correctIds).size !== saved.correctIds.length || new Set(saved.independentIds).size !== saved.independentIds.length ||
      [...saved.correctIds,...saved.independentIds].some(id => !saved.pool.includes(id)) ||
      !Number.isInteger(saved.reveals) || saved.reveals < 0 || !Number.isInteger(saved.retryCount) || saved.retryCount < 0) return null;
    if(questionsForMode(saved.questions,saved.mode).length!==saved.pool.length)return null;
    if (saved.mode==='Hard') {
      if(saved.nextMode!=null||saved.reveals!==0||(saved.hints||[]).length||saved.attempts.some(a=>a.assisted||a.hintUsed||a.mode!=='Hard'))return null;
      for(const c of [...(saved.history||[]),...(saved.current?[saved.current]:[])]) {
        if(c.mode!=='Hard'||c.assisted||c.hintUsed||c.stage!==0||c.assistedMs!==0||c.eliminated?.length||c.resolved==='revealed')return null;
      }
    } else if ([...(saved.history||[]),...(saved.current?[saved.current]:[])].some(c=>c.mode==='Hard')||saved.attempts.some(a=>a.mode==='Hard'))return null;
    if (saved.nextMode != null && !['Assisted','Unassisted'].includes(saved.nextMode)) return null;
    const history = saved.history ?? [];
    if (!Array.isArray(history) || history.length > saved.appearances - 1) return null;
    for (const [i, h] of history.entries()) {
      const q = bank.questions.find(q => q.id === h.id);
      if (!q || !saved.pool.includes(h.id) || !Number.isInteger(h.appearance) || h.appearance < 1 || h.appearance >= saved.appearances ||
        i && history[i-1].appearance >= h.appearance || !['correct','revealed','missed'].includes(h.resolved) ||
        !Array.isArray(h.order) || h.order.length !== 4 || new Set(h.order).size !== 4 || h.order.some(id => !q.answers.some(a=>a.id===id)) ||
        ![h.eliminated,h.wrongIds,h.flippedWrong].every(a=>Array.isArray(a)&&a.every(id=>h.order.includes(id)&&id!==q.correctAnswerId)) ||
        !Number.isInteger(h.stage) || h.stage<0 || h.stage>5 || typeof h.assisted!=='boolean' || typeof h.hintUsed!=='boolean' ||
        ![h.assistedMs,h.elapsedMs,h.nextStageAt,h.resolvedMs].every(n=>Number.isFinite(n)&&n>=0)) return null;
    }
    if (saved.viewIndex != null && (!Number.isInteger(saved.viewIndex) || saved.viewIndex < 0 || saved.viewIndex >= history.length)) return null;
    const missedIds = saved.missedIds ?? sessionMissedIds(saved);
    if (!Array.isArray(missedIds) || new Set(missedIds).size!==missedIds.length || missedIds.some(id=>!saved.pool.includes(id)) || sessionMissedIds(saved).some(id=>!missedIds.includes(id))) return null;
    const hints = saved.hints === undefined ? [] : saved.hints;
    if (!Array.isArray(hints) || hints.some(h => !h || !saved.pool.includes(h.questionId) ||
      !Number.isInteger(h.appearance) || h.appearance < 1 || h.appearance > saved.appearances ||
      !Number.isFinite(h.elapsedMs) || h.elapsedMs < 0 ||
      !Number.isInteger(h.attemptsBeforeHint) || h.attemptsBeforeHint < 0 || h.attemptsBeforeHint > saved.attempts.length) ||
      new Set(hints.map(h => `${h.questionId}/${h.appearance}`)).size !== hints.length) return null;
    for (const [index, a] of saved.attempts.entries()) {
      const q = bank.questions.find(q => q.id === a.questionId);
      if (!q || !saved.pool.includes(q.id) || !q.answers.some(x => x.id === a.answerId) || a.correct !== (a.answerId === q.correctAnswerId) ||
        !Number.isFinite(a.elapsedMs) || a.elapsedMs < 0 || !Number.isInteger(a.appearance) || a.appearance < 1 || a.appearance > saved.appearances ||
        a.hintUsed !== undefined && typeof a.hintUsed !== 'boolean' ||
        Boolean(a.hintUsed) !== hints.some(h => h.questionId === a.questionId && h.appearance === a.appearance && h.attemptsBeforeHint <= index) ||
        a.hintUsed && !a.assisted) return null;
    }
    if (saved.correctIds.some(id => !saved.attempts.some(a => a.questionId === id && a.correct))) return null;
    if (saved.independentIds.some(id => !saved.attempts.some(a => a.questionId === id && a.correct && !a.assisted &&
      !saved.attempts.some(other => other.questionId === id && other.appearance === a.appearance && !other.correct)))) return null;
    const c = saved.current;
    if (c) {
      const q = bank.questions.find(q => q.id === c.id);
      if (!q || !saved.pool.includes(c.id) || c.appearance !== saved.appearances || !Array.isArray(c.order) || c.order.length !== 4 ||
        new Set(c.order).size !== 4 || c.order.some(id => !q.answers.some(a => a.id === id)) ||
        !Number.isInteger(c.stage) || c.stage < 0 || c.stage > 5 ||
        ![c.assistedMs,c.elapsedMs,c.nextStageAt,c.resolvedMs].every(n => Number.isFinite(n) && n >= 0) ||
        ![null,'correct','missed','revealed'].includes(c.resolved) || typeof c.assisted !== 'boolean' || typeof c.retryScheduled !== 'boolean' ||
        c.hintUsed !== undefined && typeof c.hintUsed !== 'boolean' || c.hintUsed && !c.assisted ||
        Boolean(c.hintUsed) !== hints.some(h => h.questionId === c.id && h.appearance === c.appearance && h.elapsedMs <= c.elapsedMs) ||
        ![c.eliminated,c.wrongIds,c.flippedWrong].every(a => Array.isArray(a) && a.every(id => c.order.includes(id) && id !== q.correctAnswerId)) ||
        c.resolved === 'correct' && !saved.correctIds.includes(c.id) || c.retryScheduled && !saved.queue.includes(c.id)) return null;
    } else if (!saved.finished || saved.queue.length || saved.correctIds.length !== saved.pool.length) return null;
    const restored = { ...structuredClone(saved), kind, history: structuredClone(history), nextMode: saved.nextMode ?? null, viewIndex: saved.viewIndex ?? null, missedIds: [...missedIds], hints: structuredClone(hints), paused: true };
    if (restored.current) restored.current.hintUsed ??= false;
    return restored;
  } catch { return null; }
}
export function reviewFlag({ version, question, answerIds = [], questionFlag = false, note = '', now = new Date().toISOString() }) {
  if (!version || !question || !Array.isArray(answerIds) || answerIds.some(id => !question.answers.some(a => a.id === id))) throw Error('Invalid review target');
  return { version, questionId: question.id, answerIds: [...new Set(answerIds)], questionFlag: Boolean(questionFlag),
    note: String(note).slice(0, 2000), updatedAt: now, assessment: structuredClone(question.testing) };
}
// A card flag: the review flag plus the card face it names (and the cue only when it was shown).
// No tick and no note means no flag (null), so saving a blank form clears it.
export const cardFlag = ({ version, question, note, cardFlag, card }) => !cardFlag && !String(note).trim() ? null
  : { ...reviewFlag({ version, question, note }), target: 'card', cardFlag, card: { ...card } };
// Flag notes: write a changed copy and keep it only when the write succeeds. entry null removes the key.
export function updateFlags(store, flags, key, entry) {
  const next = { ...flags };
  if (entry) next[key] = entry; else delete next[key];
  const error = store.write('flags', next);
  return { flags: error ? flags : next, error };
}
// A saved on/off setting: anything but a boolean falls back.
export const savedBoolean = (value, fallback) => typeof value === 'boolean' ? value : fallback;
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
// Migrate only exact, hash-pinned old served records from this authorized wording revision.
// Corrupt/mismatched snapshots still flow to the usual restore rejection. Needs the attached migrations (attachMigrations).
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
export function migrateReview(raw, bank) {
  if(!raw||!bank.migrationVersions?.includes(raw.version))return raw;
  if(!Array.isArray(raw.ids)||!Number.isInteger(raw.index))return null;
  const allowed=new Set(bank.questions.map(q=>q.id)),ids=raw.ids.filter(id=>allowed.has(id));
  if(!ids.length)return null;
  const index=Math.min(ids.length-1,raw.ids.slice(0,raw.index).filter(id=>allowed.has(id)).length);
  return {...raw,version:bank.version,ids,index};
}
// Card sets, schema 3: exactly two fixed sets, Missed Questions (automatic) and Manual (the SAVE button).
// Only the pinned schemas 1 and 2 migrate (flashcards.restoreCardSets checks their shape first); anything else is refused.
// The Missed set keeps its cards. Every other set merges into Manual: a set already named Manual (or with id 'manual')
// leads, then the rest in saved order. A card is kept once, at its first occurrence (sets store no save times, so saved
// order is the earliest order known). Nothing is dropped.
export const MISSED_SET=Object.freeze({id:'missed',name:'Missed Questions'}), MANUAL_SET=Object.freeze({id:'manual',name:'Manual'});
export function migrateCardSets(raw) {
  if(!raw||![1,2].includes(raw.schema)||!Array.isArray(raw.sets))throw Error('Saved card sets have an unknown version.');
  const same=(a,b)=>String(a).toLowerCase()===b.toLowerCase();
  const missed=raw.sets.find(s=>s.id===MISSED_SET.id)||raw.sets.find(s=>same(s.name,MISSED_SET.name))||null;
  const rest=raw.sets.filter(s=>s!==missed),lead=rest.filter(s=>s.id===MANUAL_SET.id||same(s.name,MANUAL_SET.name));
  const ordered=[...lead,...rest.filter(s=>!lead.includes(s))];
  const questionIds=[...new Set(ordered.flatMap(s=>s.questionIds))],seen=new Set(),cards=[];
  for(const c of ordered.flatMap(s=>s.cards||[]))if(!seen.has(c.id)){seen.add(c.id);cards.push(structuredClone(c));}
  return {schema:3,sets:[{...MISSED_SET,questionIds:[...(missed?.questionIds||[])],cards:structuredClone(missed?.cards||[])},{...MANUAL_SET,questionIds,cards}]};
}
