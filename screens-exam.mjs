// Exam screen markup: the Exam panel on the Mode screen, the live exam, the submit check, the results and the review, and
// the exam history rows that Previous Attempts also shows. Pure functions of the state they receive; exam.mjs holds the
// rules, exam-ui.mjs the events, timer and state.
// Inputs: the arguments of each function (exam, bank, results, history). Outputs: HTML strings and the clock text.
// Run: imported through screens.mjs, which re-exports its public functions; tests import them as screens.*.
// Network: none.
// Writes: none.
// Credentials: none.
import { LABEL } from './settings.mjs';
import { escape, reviewNumber, plural, questionUnitLabel, reviewItem, backLabel, nextLabel, ICON, flagButton, sourceRow } from './presentation.mjs';
import { results } from './engine.mjs';
import { scoreTone } from './analytics.mjs';
import { EXAM, passMark, examCounts, reviewItems, REVIEW_FILTERS, examLabel } from './exam.mjs';

// ---- Exam: setup panel, exam screen, submit check, results and review ----
// A ratio as a whole percent, for example 0.7 -> "70%".
const pct0 = ratio => `${Math.round(ratio * 100)}%`;
// A date as day and short month in the reader's locale, for example "20 Nov".
const shortDate = ms => new Date(ms).toLocaleDateString(undefined, {day:'numeric', month:'short'});
// The Exam panel on the Mode screen. forms: bank.examForms for the block or null; status: {cycle, taken, next}
// (exam.formStatus); plan: the Standard-draw blueprint (exam.blueprint), shown when the block has no forms;
// last: the latest history row.
export function examSetupHtml({block, forms, status, plan = null, last, studyOpen}) {
  const mark = passMark(EXAM.size), order = forms?.order || [], next = status?.next;
  const size = next ? forms.forms[next].length : EXAM.size;
  // The status text of exam version n in this cycle.
  const state = n => status.taken.includes(n) ? 'Taken this cycle' : n === next ? 'Next' : 'Not taken yet';
  return `<section class="panel exam-setup" data-tone="violet" aria-labelledby="exam-setup-title"><div class="step-head"><span class="num">${LABEL.Group} ${block.id} · All ${block.units.length} ${LABEL.sections}</span><h2 id="exam-setup-title">Exam</h2></div>
    <dl class="block-figures exam-figures"><div><dt>Questions</dt><dd>${size}</dd></div><div><dt>Time limit</dt><dd>${examTime(EXAM.limitMs)}</dd></div><div><dt>Pass</dt><dd>${Math.round(EXAM.passRatio*100)}%<small> · ${mark} of ${EXAM.size}</small></dd></div></dl>
    ${next ? `<div class="exam-form">${status.cycle > 1 ? `<p class="label">Cycle ${status.cycle}</p>` : ''}
      <ul class="form-status" aria-label="Exam versions">${order.map(n => `<li><span class="tag"${n === next ? ' data-tone="violet"' : ''}>Version ${n}</span><span class="muted">${state(n)}</span></li>`).join('')}</ul></div>` : plan ? `<div class="exam-blueprint"><p class="label">Blueprint · ${plan.size} questions from ${plan.pool}</p>
      <div class="score-list blueprint-list">${plan.units.map(u => `<div><span><span class="unit-number">U${u.id}</span>${escape(block.units.find(x => x.id === u.id)?.title || `${LABEL.Section} ${u.id}`)}</span><strong>${u.count}</strong></div>`).join('')}</div>
      <dl class="ledger-figures metrics blueprint-difficulty" aria-label="Difficulty">${['Easy','Medium'].map(k => `<div><dt>${k}</dt><dd>${plan.difficulty[k].count}</dd></div>`).join('')}</dl></div>` : ''}
    <ul class="exam-rules"><li>No feedback, hints, reveal or retry until you submit.</li><li>No pause. The clock runs on real time, also when the app is closed.</li><li>Change any answer before you submit. Flag a question to come back to it later.</li><li>At 0:00 the app submits. A blank answer scores 0.</li><li>Submitted answers count in your ${LABEL.section} stats.</li></ul>
    ${last ? `<p class="muted exam-last">Last exam: <strong class="${last.pass?'correct-label':'incorrect-label'}">${pct0(last.correct/last.size)} · ${last.pass?'Pass':'Fail'}</strong> · ${escape(shortDate(last.at))}</p>` : ''}
    ${studyOpen ? '<p class="muted exam-note">Your paused study session stays saved.</p>' : ''}</section>`;
}

// Exam answers: the selected-state rule (blue border and fill), no grading marks until submit.
function examAnswersHtml(q, order, picked) {
  return order.map((id, i) => {
    const a = q.answers.find(x => x.id === id), on = id === picked;
    return `<button type="button" class="item${on?' picked':''}" data-exam-answer="${escape(id)}" aria-pressed="${on}" aria-keyshortcuts="${i+1}"><span class="letter" aria-hidden="true">${'ABCDEFGH'[i]}</span><span class="answer-body"><span class="answer-text"><span>${escape(a.text)}</span></span><span class="feedback-label" aria-hidden="true">Your answer</span></span></button>`;
  }).join('');
}
// Exam times read in minutes, so the limit shows as 60:00 (screens.duration() would show 1:00:00).
const examTime = ms => { const n = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`; };
// The live exam clock: the time left as m:ss, rounded up to the next second (a countdown shows 0:00 only at the end).
export const examClock = ms => examTime(Math.ceil(ms / 1000) * 1000);
/** The exam screen: top bar (Submit, pill, live clock), navigator, question sheet, Previous/Next and tools.
 * @param {object} o exam (the saved exam), bank, now (ms) and navOpen (false: phones fold the 30 cells under a
 *   Questions disclosure so the question shows first)
 * @returns {string} the screen markup */
export function examHtml({exam, bank, now, navOpen = true}) {
  const id = exam.pool[exam.index], q = bank.questions.find(x => x.id === id), counts = examCounts(exam), n = exam.pool.length;
  const left = Math.max(0, exam.deadline - now), last = exam.index === n - 1, flagged = exam.flagged.includes(id);
  const otherBlank = exam.pool.some((x, i) => i !== exam.index && exam.answers[x] === null);
  // One navigator cell: question i, with its answered, flagged and current state.
  const cell = (qid, i) => { const answered = exam.answers[qid] !== null, flag = exam.flagged.includes(qid), here = i === exam.index;
    return `<button type="button" class="exam-cell${answered?' answered':''}${flag?' flagged':''}${here?' now':''}" data-exam-go="${i}" aria-label="Question ${i+1}, ${answered?'answered':'blank'}${flag?', flagged':''}"${here?' aria-current="step"':''}>${i+1}</button>`; };
  // Clock at the left, Submit at the right, as Next sits at the right of Previous.
  return `<h1 class="sr-only">Exam · ${LABEL.Group} ${exam.block}</h1><div class="toolbar study-toolbar study-top exam-top"><div class="meta exam-clock-cell"><span class="exam-clock${left<=300000?' low':''}" id="exam-clock-box" role="timer" aria-label="Time left"><span id="exam-clock">${examClock(left)}</span></span></div><span class="tag" data-tone="violet">Exam · ${LABEL.Group} ${exam.block}</span><button class="small" data-tone="violet" id="exam-submit">Submit</button></div>
    <section class="panel ledger exam-ledger" data-tone="violet" aria-label="Question navigator"><dl class="track-row ledger-figures"><div><dt>Answered</dt><dd>${counts.answered}<small>/${n}</small></dd></div><div><dt>Blank</dt><dd>${counts.blank}</dd></div><div><dt>Flagged</dt><dd>${counts.flagged}</dd></div></dl>
    <div class="exam-time" aria-hidden="true"><i id="exam-time-fill" style="width:${(100*(1-left/EXAM.limitMs)).toFixed(2)}%"></i></div>
    <details class="exam-nav-box"${navOpen ? ' open' : ''}><summary>Questions</summary><div class="exam-nav" role="group" aria-label="Go to question">${exam.pool.map(cell).join('')}</div>
    <div class="legend" aria-hidden="true"><span><i class="answered"></i>Answered</span><span><i class="blank"></i>Blank</span><span><i class="flagged"></i>Flagged</span><span><i class="now"></i>Current</span></div></details></section>
    <article class="panel q-sheet exam-sheet"><section class="question-focus" aria-label="Current question"><div class="question-heading qhead"><p class="qnum">#${exam.index+1} <small>of ${n}</small><span class="sr-only">Question ${exam.index+1} of ${n}</span></p><span class="unit-label">${escape(questionUnitLabel(q,bank.blocks))}</span></div><h2 id="exam-stem" class="stem" tabindex="-1">${escape(q.stem)}</h2></section>
    <div class="answers" role="group" aria-label="Answer choices">${examAnswersHtml(q, exam.orders[id], exam.answers[id])}</div>
    <div class="exam-flag-row"><button type="button" class="small exam-flag" id="exam-flag" aria-pressed="${flagged}" aria-keyshortcuts="F">${ICON.flag}<span>${flagged?'Flagged for later':'Flag for later'}</span></button></div></article>
    <div class="navrow actions question-actions"><button id="exam-previous" ${exam.index?'':'disabled'} aria-keyshortcuts="ArrowLeft">${backLabel('Previous')}</button><button id="exam-next" class="primary" data-tone="violet" aria-keyshortcuts="ArrowRight">${nextLabel(last?'Review and submit':'Next')}</button></div>
    <div class="tool-row exam-tools"><button id="exam-next-blank" ${otherBlank?'':'disabled'}>Go to next blank</button></div>`;
}

// Submit check (dialog body; the dialog adds the head and Close).
export function submitCheckHtml(exam) {
  const c = examCounts(exam), jumps = list => list.map(n => `<button type="button" class="link-button exam-jump" data-exam-jump="${n-1}">#${n}</button>`).join('');
  return `<dl class="ledger-figures metrics submit-figures"><div><dt>Answered</dt><dd>${c.answered}<small>/${exam.pool.length}</small></dd></div><div><dt>Blank</dt><dd>${c.blank}</dd></div><div><dt>Flagged</dt><dd>${c.flagged}</dd></div></dl>
    ${c.blank ? `<div class="jump-row"><span class="label incorrect-label">Blank</span><span class="jump-list">${jumps(c.blankNumbers)}</span></div>` : ''}
    ${c.flagged ? `<div class="jump-row"><span class="label">Flagged</span><span class="jump-list">${jumps(c.flaggedNumbers)}</span></div>` : ''}
    <p class="muted">${c.blank ? `${plural(c.blank,'blank answer')} will score 0. ` : ''}After you submit, answers cannot change.</p>
    <div class="actions"><button class="primary" id="exam-confirm-submit">Submit exam</button></div>`;
}

// Exam history: score columns against the 70% line (newest at the right), then the latest rows as text.
export function examHistoryHtml(history, currentId = null) {
  if (!history.length) return '';
  const shown = history.slice(-12), line = Math.round(EXAM.passRatio * 100);
  const label = shown.map(h => `${shortDate(h.at)} ${pct0(h.correct/h.size)} ${h.pass?'pass':'fail'}`).join(', ');
  return `<section class="panel exam-history"><h2>Exam history</h2><p class="label">On this device · ${plural(history.length,'exam')}</p>
    <div class="exam-chart" role="img" aria-label="Exam scores, oldest first: ${escape(label)}. Pass line at ${line}%."><div class="exam-plot"><span class="pass-line" style="bottom:${line}%"><span>${line}%</span></span>${shown.map(h => `<span class="exam-col${h.pass?' pass':' fail'}${h.id===currentId?' current':''}" style="height:${Math.max(2,100*h.correct/h.size).toFixed(1)}%"></span>`).join('')}</div>
    <div class="exam-axis" aria-hidden="true">${shown.map(h => `<span>${pct0(h.correct/h.size)}</span>`).join('')}</div></div>
    <div class="score-list exam-history-list">${[...history].reverse().slice(0,5).map(h => `<div><span>${escape(shortDate(h.at))} · ${examLabel(h)}${h.timedOut?' · timed out':''}</span><strong class="${h.pass?'correct-label':'incorrect-label'}">${pct0(h.correct/h.size)} · ${h.pass?'Pass':'Fail'}</strong></div>`).join('')}</div></section>`;
}

const FILTER_NAMES = {missed:'Missed', blank:'Blank', changed:'Changed', flagged:'Flagged', all:'All'};
/** One review item: your answer against the correct one, the rationale, then the Save · Key terms · Source · Flag row.
 * Exam reviews never offer Mark for review, old or new exams alike.
 * @param {object} item a review item of exam.reviewItems (q, picked, correct, blank, changed, number)
 * @param {object} o box (Save button markup), marked, source(q), isFlagged(id), termsFor(q), link (term links or
 *   null) and open (the row starts open)
 * @returns {string} the item markup */
function examReviewItem(item, {box, marked, source, isFlagged, termsFor = () => '', link = null, open = false}) {
  // A text of the question with its term links, or escaped plain text when there are no links.
  const T = (part, id, text) => link ? link(item.q, part, id, text) : escape(text);
  const q = item.q, right = q.answers.find(a => a.id === q.correctAnswerId), pick = item.picked && q.answers.find(a => a.id === item.picked);
  // The rationale line under an answer.
  const why = (text, id) => `<em class="review-explanation">${T('rationale', id, text)}</em>`;
  const status = item.correct ? '<span class="tag" data-tone="good">Correct</span>' : item.blank ? '<span class="tag" data-tone="bad">Blank</span>' : '<span class="tag" data-tone="bad">Missed</span>';
  // One row per question (number, ✓ or ✕, stem) that opens to the full item, as first-try-correct rows in Quiz review
  // (a 30-item review would be about 15 screens long). Open: the summary shows the status tags in place of the
  // clipped stem, and the full stem shows once below it (the open row was cramped).
  const mark = item.correct ? '<span class="correct-label" aria-hidden="true">✓</span>' : '<span class="incorrect-label" aria-hidden="true">✕</span>';
  const said = item.correct ? 'Correct' : item.blank ? 'Blank' : 'Missed';
  return `<details class="review-item review-compact exam-item" data-exam-item="${escape(q.id)}"${open?' open':''}><summary><strong class="review-number">${reviewNumber(item.number)}</strong>${mark}<span class="review-compact-stem">${escape(q.stem)}</span><span class="review-status" aria-hidden="true">${status}${item.changed?'<span class="tag">Changed</span>':''}${item.flagged?'<span class="tag">Flagged</span>':''}</span><span class="sr-only">${said}${item.changed?', changed':''}${item.flagged?', flagged':''}</span></summary>
    <p class="review-question">${T('stem', null, q.stem)}</p>
    ${reviewItem(item.correct?'correct':'wrong','Your answer',pick?T('answer', pick.id, pick.text):'<span class="muted">No answer</span>',pick&&!item.correct?why(pick.rationale, pick.id):'')}
    ${reviewItem('correct','Correct answer',T('answer', right.id, right.text),why(right.rationale, right.id))}
    ${sourceRow(source(q),flagButton({question:q.id,label:`Flag question ${item.number}`,flagged:isFlagged(q.id)}),termsFor(q),box||'')}</details>`;
}

/** The exam results screen: verdict, time and changes, score by section, history, then the filtered review.
 * @param {object} o exam, results (examResults()), bank, history, filter (a REVIEW_FILTERS value), boxFor(q) (Save
 *   button markup or ''), marked(id) (already marked not understood), source, isFlagged, termsFor, link and isOpen(id)
 * @returns {string} the screen markup */
export function examResultsHtml({exam, results: r, bank, history, filter, boxFor, marked, source, isFlagged, termsFor = () => '', link = null, isOpen = () => false}) {
  // A signed whole number: +3, −3 (a true minus sign) or 0.
  const sign = n => n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0', mark = r.passMark;
  const gap = r.gap === null ? null : Math.round(r.gap * 100);
  const counts = Object.fromEntries(REVIEW_FILTERS.map(f => [f, reviewItems(r, f).length])), items = reviewItems(r, filter);
  // One bar row of a section: the exam score bar with the study first-answer mark.
  const unitRow = u => { const v = u.total ? u.correct / u.total : null;
    return `<div class="barrow"><span class="bar-name"><span class="unit-number">U${u.id}</span><span class="bar-title">${escape(u.title)}</span>${u.lowConfidence?'<span class="tag" title="3 or fewer questions">Low confidence</span>':''}</span><span class="b" aria-hidden="true"><i style="width:${(v*100).toFixed(1)}%"></i>${u.study===null?'':`<b class="study-tick" style="left:${(u.study*100).toFixed(1)}%"></b>`}</span><span class="mono ${scoreTone(v)}">${u.correct}/${u.total}</span><span class="mono muted">${u.study===null?'—':pct0(u.study)}</span><span class="sr-only">${u.correct} of ${u.total} correct in this exam; study first-answer accuracy ${u.study===null?'not available':pct0(u.study)}</span></div>`; };
  return `<div class="page-head"><p class="label">Exam results · ${LABEL.Group} ${exam.block} · ${examLabel(exam)}<span class="tag" data-tone="violet">Exam</span></p><h1>Exam</h1></div>
    <section class="panel exam-verdict" data-tone="violet" aria-label="Exam score"><div class="verdict-row"><strong class="verdict-score">${pct0(r.pct)}</strong><span class="tag verdict-tag" data-tone="${r.pass?'good':'bad'}">${r.pass?'Pass':'Fail'}</span></div>
      <p><strong>${r.correct} of ${r.size}</strong> correct · pass mark ${Math.round(EXAM.passRatio*100)}% (${mark} of ${r.size})</p>
      <p class="muted">${r.margin >= 0 ? `${r.margin ? plural(r.margin,'question') : 'Exactly'} ${r.margin ? 'above' : 'at'} the pass mark` : `${plural(-r.margin,'question')} short of the pass mark`}${r.timedOut?' · Time ran out, so the app submitted.':''}</p></section>
    <div class="stats"><div class="stat"><span class="label">Time used</span><strong>${examTime(r.timeUsedMs)}</strong><small>of ${examTime(EXAM.limitMs)}</small></div><div class="stat"><span class="label">Per question</span><strong>${r.secondsPerQuestion<10?r.secondsPerQuestion.toFixed(1):Math.round(r.secondsPerQuestion)}s</strong><small>${plural(r.size,'question')}</small></div><div class="stat"><span class="label">Blank</span><strong class="${r.blank?'incorrect-label':''}">${r.blank}</strong><small>Scored as wrong</small></div><div class="stat"><span class="label">Practice gap</span><strong class="${gap===null?'':gap<0?'incorrect-label':'correct-label'}">${gap===null?'—':`${sign(gap)} pts`}</strong><small>${r.studyAccuracy===null?'No study answers yet':`Study first answers ${pct0(r.studyAccuracy)}`}</small></div></div>
    <dl class="ledger-figures metrics exam-changes" aria-label="Changed answers"><div><dt>Changed</dt><dd>${r.changes.changed}</dd></div><div><dt>Wrong → right</dt><dd class="correct-label">${r.changes.wrongToRight}</dd></div><div><dt>Right → wrong</dt><dd class="incorrect-label">${r.changes.rightToWrong}</dd></div><div><dt>Net</dt><dd>${sign(r.changes.net)}</dd></div></dl>
    <section class="panel unit-bars exam-units"><h2>Score by ${LABEL.section}</h2><p class="label">This exam vs study first-answer accuracy · ${escape(bank.blocks.find(b=>b.id===exam.block)?.title||'')}</p>
      <div class="bars exam-bars"><div class="barrow bar-head" aria-hidden="true"><span class="bar-key"><i class="key-exam"></i>Exam bar <i class="key-study"></i>Study mark</span><span></span><span class="label">Exam</span><span class="label">Study</span></div>${r.units.map(unitRow).join('')}</div>
      <p class="muted exam-note">${LABEL.Sections} with 3 or fewer questions in this exam are low confidence: one answer moves the score by 33 points or more.</p></section>
    ${examHistoryHtml(history, exam.id)}
    <section class="answer-review exam-review" data-tone="violet" aria-labelledby="exam-review-title"><h2 id="exam-review-title">Exam review</h2>
      <fieldset class="review-filter"><legend class="sr-only">Show</legend><div class="seg">${REVIEW_FILTERS.map(f => `<label><input type="radio" name="exam-filter" value="${f}" ${f===filter?'checked':''}>${FILTER_NAMES[f]} ${counts[f]}</label>`).join('')}</div></fieldset>
      ${items.length ? items.map(item => examReviewItem(item, {box:boxFor(item.q), marked:marked(item.q.id), source, isFlagged, termsFor, link, open:isOpen(item.q.id)})).join('') : `<p class="muted review-empty">No ${FILTER_NAMES[filter].toLowerCase()} questions in this exam.</p>`}</section>
    <div class="navrow actions results-nav"><button id="exam-blocks">${backLabel('Blocks')}</button><button id="exam-again" data-tone="violet"><span class="lbl">${ICON.retry}New exam</span></button></div>`;
}
