// Readiness: where a player stands in a block, and which units to study next. Facts only (questions seen, first-try
// accuracy, the newest exam score, weak and new units); it makes no pass prediction. Inputs: the saved stats, the
// question bank and the exam history. Outputs: the result object, the HTML of the figures and the next line for the block card and the
// "Study weak units" button. Loaded by app.mjs. It writes nothing.
// Network: none
// Writes: none
// Credentials: none
import { LABEL } from './settings.mjs';
import { scoreTone } from './analytics.mjs';
import { questionsForMode } from './engine.mjs';
import { EXAM } from './exam.mjs';
import { escape } from './presentation.mjs';

// Questions in a "Study weak units" session: short, so it can be repeated.
export const WEAK_SESSION_SIZE = 10;
// First answers a unit needs before its accuracy can call it weak or colour the number: one miss proves little, and
// the smallest unit has 3 questions.
export const MIN_ASKED = 3;
// Unit titles the card names before it writes "and N more".
export const NAMED_UNITS = 3;
// Units the button takes when no unit is weak or new: the ones with the lowest accuracy.
export const FALLBACK_UNITS = 2;

// The share correct/asked, or null when nothing was asked.
const share = (correct, asked) => asked ? correct / asked : null;

/**
 * The facts of one block for one player. Every number is about the block's Standard questions: Hard and Exam
 * questions have their own screens, and a question that left the bank is not counted.
 * @param {object} input The saved stats ({questions}), the bank ({questions, blocks}), examHistory (oldest first) and block (the block's id).
 * @returns {object} block, seen and total (Standard questions answered at least once, and all of them), correct and asked (first answers in study, exam answers left out), units (each with seen, total, correct, asked and state 'new' | 'weak' | 'ok'), targets (the units to study: weakest first, then new ones), fallback (true when no unit is weak or new and the lowest stand in), exam (the newest one: correct, size, pass; or null), history (false when the player has no Standard answer and no exam in this block) and started (true when the player answered any question of the block, Hard included).
 */
export function readiness({stats, bank, examHistory, block}) {
  const info = bank.blocks.find(b => b.id === block), standard = questionsForMode(bank.questions, 'Unassisted').filter(q => q.block === block);
  // tally: of these questions, how many were answered, and the first answers in study (right, and all).
  const tally = questions => questions.reduce((sum, q) => {
    const record = stats.questions[q.id];
    if (!record?.asked) return sum;
    return {seen: sum.seen + 1, correct: sum.correct + record.correct - (record.examCorrect || 0), asked: sum.asked + record.asked - (record.examAsked || 0)};
  }, {seen: 0, correct: 0, asked: 0});
  const units = info.units.map(unit => {
    const mine = standard.filter(q => q.units.includes(unit.id)), {seen, correct, asked} = tally(mine);
    const state = !seen ? 'new' : asked >= MIN_ASKED && correct / asked < EXAM.passRatio ? 'weak' : 'ok';
    return {id: unit.id, title: unit.title, seen, total: mine.length, correct, asked, state};
  });
  // byAccuracy: lowest first-try accuracy first, then by unit number.
  const byAccuracy = (a, b) => share(a.correct, a.asked) - share(b.correct, b.asked) || a.id - b.id;
  const weak = units.filter(u => u.state === 'weak').sort(byAccuracy), fresh = units.filter(u => u.state === 'new' && u.total);
  const fallback = !weak.length && !fresh.length;
  const targets = fallback ? units.filter(u => u.asked).sort(byAccuracy).slice(0, FALLBACK_UNITS) : [...weak, ...fresh];
  const exams = examHistory.filter(h => h.block === block), last = exams.at(-1), all = tally(standard);
  // started: any question of the block answered, Hard included (a Hard-only player has taken a quiz, but has no Standard facts).
  const started = bank.questions.some(q => q.block === block && stats.questions[q.id]?.asked);
  return {block, ...all, total: standard.length, units, targets, fallback,
    exam: last ? {correct: last.correct, size: last.size, pass: last.pass} : null, history: all.seen > 0 || exams.length > 0, started};
}

// The tone of a figure for each score class of scoreTone (the tones the app's cards and tags use).
const TONES = {'score-gold': 'gold', 'correct-label': 'good', 'incorrect-label': 'bad', muted: ''};
// Guards the rounding down against binary fractions: 57/100 * 100 is 56.99999999999999 in floating point.
const FLOAT_GUARD = 1e-9;
// First try: a whole percent, rounded down, so a number under the pass mark never reads as the pass mark (69.5% shows 69%).
const percentDown = ratio => `${Math.floor(ratio * 100 + FLOAT_GUARD)}%`;
// Last exam: rounded to the nearest percent, as the Exam results screen shows the same exam.
const percentNear = ratio => `${Math.round(ratio * 100)}%`;

// The card's text for a block the player has not started: what the figures cannot say yet, and what to do first.
const UNKNOWN = 'Unknown', START_FIRST = 'Take at least one quiz first';
// figure: one item in the style of the card's counts row (a small label above a large value).
const figure = (label, value, tint = '') => `<div${tint ? ` data-tone="${tint}"` : ''}><dt>${label}</dt><dd>${value}</dd></div>`;
// wrap: the card part around its figures and its next line.
const wrap = (block, figures, next) => `<div class="readiness" data-readiness="${block}"><dl class="block-figures readiness-figures">${figures}</dl>${next}</div>`;

/**
 * The block card's part: the figures (the facts), and a line with the units the button takes. A block without
 * history that the player has not started shows 0 seen, an unknown first try and what to do first; a block with Hard answers
 * only, or without Standard questions, shows nothing.
 * Every weak unit is named; new units fill the line up to NAMED_UNITS names, the rest is "and N more".
 * @param {object} result A result of readiness().
 * @returns {string} HTML.
 */
export function readinessHtml(result) {
  if (!result.history) return result.total && !result.started ? wrap(result.block, figure('Seen', `0<small> of ${result.total}</small>`) + figure('First try', UNKNOWN),
    `<p class="readiness-next"><span class="label">Weak or new</span> ${START_FIRST}</p>`) : '';
  const first = share(result.correct, result.asked), tone = result.asked >= MIN_ASKED ? TONES[scoreTone(first)] : '';
  const figures = [figure('Seen', `${result.seen}<small> of ${result.total}</small>`),
    first === null ? '' : figure('First try', percentDown(first), tone),
    result.exam ? figure('Last exam', `${percentNear(result.exam.correct / result.exam.size)}<span class="sr-only"> ${result.exam.pass ? 'passed' : 'not passed'}</span>`, result.exam.pass ? 'good' : 'bad') : ''].join('');
  const weak = result.targets.filter(u => u.state === 'weak').length, shown = result.targets.slice(0, Math.max(NAMED_UNITS, weak)), more = result.targets.length - shown.length;
  const next = shown.length ? `<p class="readiness-next"><span class="label">${result.fallback ? 'Lowest' : 'Weak or new'}</span> ${shown.map(u => escape(u.title)).join(', ')}${more > 0 ? ` and ${more} more` : ''}</p>` : '';
  return wrap(result.block, figures, next);
}

// The button for the block card's actions row. Empty when there is nothing to target, and while a session is open:
// a start would replace that session, and the screen already offers Resume.
export const weakButtonHtml = (result, sessionOpen = false) => result.history && result.targets.length && !sessionOpen ? `<button type="button" data-weak-block="${result.block}">Study weak ${LABEL.sections}</button>` : '';

/**
 * Binds the card buttons: a press hands the block and its target units to the app, which starts the session.
 * @param {HTMLElement} main The app's main element.
 * @param {(block:number)=>object} facts The readiness result of a block, read at the press.
 * @param {(block:number, units:number[])=>void} start Starts the session.
 * @returns {void}
 */
export function bindWeakButtons(main, facts, start) {
  main.querySelectorAll('[data-weak-block]').forEach(button => button.onclick = () => { const block = Number(button.dataset.weakBlock); start(block, facts(block).targets.map(u => u.id)); });
}
