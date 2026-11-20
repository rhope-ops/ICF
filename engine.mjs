// Pure transitions: elapsed active time and randomness are supplied by the caller.
import { DEFAULTS, POOL_SIZES } from './settings.mjs';
export const shuffle = (items, random = Math.random) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    if (j < 0 || j > i) throw Error('Invalid random source');
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
export function eligible(questions, units, filter, block = null) {
  if (!units.length) return [];
  return [...new Map(questions.filter(q => (block === null || q.block === block) && q.units.some(u => units.includes(u)) &&
    (filter === 'Slides and Text' || (filter === 'Slides' ? q.sourceGroup === 'slides' : filter === 'Text Only' && q.sourceGroup === 'text')))
    .map(q => [q.id, q])).values()];
}
export function sample(questions, random = Math.random, size = DEFAULTS.poolSize) {
  if (![...POOL_SIZES,'all'].includes(size)) throw Error('Invalid pool size');
  const order=items=>shuffle(items,random);
  // Diagram cap yields to reaching the available pool size when non-diagrams are scarce.
  const count = size === 'all' ? questions.length : Math.min(size, questions.length);
  const diagrams = Math.floor(count / 15);
  const chosen = [];
  const textCount = questions.filter(q => q.sourceGroup === 'text').length;
  const targets = { text: Math.min(Math.round(count / 6), textCount, count), slides: 0 };
  targets.slides = Math.min(count - targets.text, questions.length - textCount);
  targets.text = Math.min(textCount, count - targets.slides);
  // Reserve actual diagram slots before filling; images are inside source quotas.
  for (const q of order(questions.filter(q => q.requiresDiagram))) {
    if (chosen.length >= diagrams) break;
    if (chosen.filter(x => x.sourceGroup === q.sourceGroup).length < targets[q.sourceGroup]) chosen.push(q);
  }
  for (const group of ['text','slides']) {
    const needed = targets[group] - chosen.filter(q => q.sourceGroup === group).length;
    chosen.push(...order(questions.filter(q => q.sourceGroup === group && !q.requiresDiagram && !chosen.includes(q))).slice(0,needed));
  }
  if (chosen.length < count) chosen.push(...order(questions.filter(q => !q.requiresDiagram && !chosen.includes(q))).slice(0,count-chosen.length));
  if (chosen.length < count) chosen.push(...order(questions.filter(q => !chosen.includes(q))).slice(0, count - chosen.length));
  return order(chosen);
}
function open(s, random) {
  if (!s.queue.length) { s.current = null; s.finished = true; return; }
  const id = s.queue.shift(), q = s.questions.find(q => q.id === id);
  if (s.current) (s.history ??= []).push({...structuredClone(s.current),mode:s.current.mode||s.mode});
  if (s.nextMode) { s.mode = s.nextMode; s.nextMode = null; }
  s.appearances++;
  s.current = { id, appearance: s.appearances, order: shuffle(q.answers.map(a => a.id), random), stage: 0,
    assistedMs: 0, elapsedMs: 0, nextStageAt: 30000, eliminated: [], wrongIds: [], flippedWrong: [],
    mode: s.mode, resolved: null, resolvedMs: 0, assisted: false, hintUsed: false, retryScheduled: false };
}
// Exam-tier items (studyMode 'Exam') belong to exam forms only: never in a study pool.
export const questionsForMode = (questions, mode) => questions.filter(q => q.studyMode !== 'Exam' && (q.studyMode === 'Hard') === (mode === 'Hard'));
export const STUDY_MODES = Object.freeze(['Assisted','Unassisted','Hard']);
export function start(pool, { version, mode = 'Assisted', random = Math.random, kind = 'study' } = {}) {
  if (!pool.length || new Set(pool.map(q=>q.id)).size !== pool.length || !['study','not_understood'].includes(kind) || !version || !STUDY_MODES.includes(mode) || questionsForMode(pool,mode).length !== pool.length) throw Error('Invalid session setup');
  const s = { schema: 1, version, kind, missedIds: [], questions: structuredClone(pool), pool: pool.map(q => q.id), queue: pool.map(q => q.id),
    mode, nextMode: null, viewIndex: null, history: [], paused: false, finished: false, ended: false, activeMs: 0, appearances: 0, attempts: [],
    correctIds: [], independentIds: [], hints: [], reveals: 0, retryCount: 0, current: null };
  open(s, random); return s;
}
function markMiss(s) {
  s.missedIds ??= [];
  if (!s.missedIds.includes(s.current.id)) s.missedIds.push(s.current.id);
}
function retry(s, random) {
  const c = s.current;
  if (c.retryScheduled) return;
  c.retryScheduled = true; s.retryCount++;
  const lower = Math.min(5, s.queue.length);
  const at = lower + Math.floor(random() * (s.queue.length - lower + 1));
  s.queue.splice(at, 0, c.id);
}
function reveal(s, random) {
  const c=s.current;
  c.stage=5;c.assisted=true;c.resolved='revealed';c.resolvedMs=0;
  s.reveals++;markMiss(s);retry(s,random);
}
export function transition(state, event, random = Math.random) {
  // Static question/assessment data is immutable. Copy only changing state on
  // ticks; cloning the entire bank five times per second stalls larger pools.
  const { questions, ...mutable } = state;
  const s = { ...structuredClone(mutable), questions }, c = s.current;
  if (event.type === 'pause') { s.paused = true; return s; }
  if (event.type === 'resume') { s.paused = false; return s; }
  if (event.type === 'end') { s.ended = true; s.paused = true; return s; }
  if (event.type === 'previous') {
    if (s.history?.length) s.viewIndex = s.viewIndex == null ? s.history.length-1 : Math.max(0,s.viewIndex-1);
    return s;
  }
  if (s.viewIndex != null) {
    if (event.type === 'next') s.viewIndex = s.viewIndex+1 < s.history.length ? s.viewIndex+1 : null;
    return s;
  }
  if (event.type === 'mode') {
    if (!STUDY_MODES.includes(event.mode)) throw Error('Invalid mode');
    if(s.mode==='Hard'||event.mode==='Hard')return s;
    if (!s.paused && !s.ended && !s.finished && c) {
      if(c.resolved)s.nextMode=event.mode;
      else {s.mode=event.mode;c.mode=event.mode;}
    }
    return s;
  }
  if (s.paused || s.finished || s.ended || !c) return s;
  const q = s.questions.find(q => q.id === c.id);
  if (event.type === 'reveal') {
    if(s.mode==='Hard')return s;
    if(c.resolved==='correct'||c.resolved==='revealed')return s;
    reveal(s,random);
  } else if (event.type === 'hint') {
    if (s.mode !== 'Unassisted' || c.resolved || c.hintUsed) return s;
    c.hintUsed = true; c.assisted = true;
    (s.hints ??= []).push({ questionId: c.id, appearance: c.appearance, elapsedMs: c.elapsedMs, attemptsBeforeHint: s.attempts.length });
  } else if (event.type === 'tick') {
    if (!Number.isFinite(event.ms) || event.ms < 0) throw Error('Invalid elapsed time');
    s.activeMs += event.ms; c.elapsedMs += event.ms;
    if (c.resolved) {
      c.resolvedMs += event.ms;
      return s;
    }
    if (s.mode !== 'Assisted') return s;
    c.assistedMs += event.ms;
    if (c.stage === 0 && c.assistedMs >= 20000) { c.stage = 1; c.assisted = true; }
    while (c.stage >= 1 && c.stage < 5 && c.assistedMs >= c.nextStageAt) {
      // A wrong selection already rules that choice out. Re-evaluate at every
      // deadline, including restored appearances and choices flipped face down.
      const ruledOut = new Set([...c.eliminated, ...c.wrongIds]);
      const choices = q.answers.filter(a => a.id !== q.correctAnswerId && !ruledOut.has(a.id));
      c.stage = c.stage >= 4 || choices.length <= 1 ? 5 : 5 - choices.length;
      c.nextStageAt += 10000;
      if (c.stage === 2 || c.stage === 3) {
        c.eliminated.push(shuffle(choices, random)[0].id);
      }
      if (c.stage === 5) reveal(s,random);
    }
  } else if (event.type === 'answer') {
    if (c.resolved || c.eliminated.includes(event.id) && s.mode === 'Assisted') return s;
    if (!c.order.includes(event.id)) throw Error('Unknown answer');
    const correct = event.id === q.correctAnswerId;
    s.attempts.push({ questionId: q.id, answerId: event.id, correct, appearance: c.appearance,
      elapsedMs: c.elapsedMs, activeMs: s.activeMs, assisted: c.assisted, hintUsed: Boolean(c.hintUsed), mode: s.mode });
    if (correct) {
      c.resolved = 'correct';
      if (!s.correctIds.includes(q.id)) s.correctIds.push(q.id);
      if (!c.assisted && !c.wrongIds.length && !s.independentIds.includes(q.id)) s.independentIds.push(q.id);
    } else {
      markMiss(s); c.wrongIds.push(event.id); c.flippedWrong = [...new Set([...c.flippedWrong, event.id])]; retry(s, random);
      if (s.mode !== 'Assisted') c.resolved = 'missed';
      else c.nextStageAt = Math.max(c.assistedMs + 10000, 30000);
    }
  } else if (event.type === 'flipWrong') {
    if (!c.resolved && s.mode === 'Assisted' && c.wrongIds.includes(event.id))
      c.flippedWrong = c.flippedWrong.includes(event.id) ? c.flippedWrong.filter(id => id !== event.id) : [...c.flippedWrong,event.id];
  } else if (event.type === 'next') {
    if (['correct','revealed','missed'].includes(c.resolved)) open(s, random);
  }
  return s;
}
// Key terms show after a Hint, a correct answer or the Assisted 20 s step; never in Hard.
// c defaults to the live appearance; history views pass their own appearance.
export function keywordHighlightEnabled(s, c = s.current) {
  return Boolean(s.mode !== 'Hard' && c && (c.hintUsed || c.resolved === 'correct' || (c.mode || s.mode) === 'Assisted' && c.stage >= 1));
}
export function results(s) {
  const correct = s.attempts.filter(a => a.correct).length, incorrect = s.attempts.length - correct;
  const first = s.pool.map(id => s.attempts.find(a => a.questionId === id)).filter(Boolean);
  // Average over the distinct questions answered or revealed, not the whole pool: an early end must not dilute it.
  const seen = new Set([...s.attempts.map(a => a.questionId), ...(s.history || []).filter(h => h.resolved).map(h => h.id)]).size;
  return { activeMs: s.activeMs, seen, averageSeconds: seen ? s.activeMs / 1000 / seen : null,
    accuracy: s.attempts.length ? correct / s.attempts.length : null, correct, incorrect,
    firstAccuracy: first.length ? first.filter(a => a.correct).length / first.length : null,
    independent: s.independentIds.length, hints: s.hints?.length || 0, reveals: s.reveals, retries: s.retryCount,
    complete: !s.ended && s.finished && s.correctIds.length === s.pool.length };
}
export function progress(s) {
  return { completed: s.pool.filter(id => s.correctIds.includes(id) && !s.queue.includes(id) && !(s.current?.id === id && !s.current.resolved)).length,
    pool: s.pool.length, appearances: s.appearances, attempts: s.attempts.length,
    pendingRetries: s.queue.filter(id => s.attempts.some(a => a.questionId === id) || s.current?.id === id).length };
}
