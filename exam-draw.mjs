// Exam questions: the format, the old mix names, the Standard draw, the exam forms and their cycles.
// Inputs: questions, exam forms, cycle records and a random function. Outputs: question lists, blueprints and
// cycle records. Run: imported through exam.mjs, which re-exports its public names.
// Network: none.
// Writes: none (the caller saves the cycle records).
// Credentials: none.
import { EXAM_FORMAT } from './settings.mjs';
import { shuffle } from './engine.mjs';

// The exam format (size, time limit, pass ratio) is a setting; this module's name for it is EXAM.
export const EXAM = EXAM_FORMAT;
// 21 of 30. The small epsilon keeps 0.7 * 30 from rounding to 22.
export const passMark = size => Math.ceil(size * EXAM.passRatio - 1e-9);
// A question with two units counts toward its first unit for per-unit exam scores.
export const examUnit = q => q.units[0];
const DIFFICULTIES = Object.freeze(['Easy', 'Medium', 'Hard']);

// Question mix: exams made before forms existed drew by mix (Standard, Hard or Hybrid). The mix names are kept to
// label and resume those exams. A block without exam forms draws a Standard exam (see standardPool).
export const MIXES = Object.freeze(['standard', 'hard', 'hybrid']);
export const MIX_LABEL = Object.freeze({ standard: 'Standard', hard: 'Hard', hybrid: 'Hybrid' });
// Turn a stored mix value into a known mix name: an old boolean true means Hybrid, anything unknown means Standard.
export const toMix = value => MIXES.includes(value) ? value : value === true ? 'hybrid' : 'standard';
// The questions of a block that an old mix-based exam could draw: no Exam-tier items; Hard mix takes only Hard ones.
export const legacyPool = (questions, block, mix) => questions.filter(q => q.block === block && q.studyMode !== 'Exam' &&
  (mix === 'hybrid' || (mix === 'hard') === (q.difficulty === 'Hard')));

// ---- Standard draw: used when the bank has no exam forms for the block ----
// The Standard draw: 30 Easy and Medium questions of the block, unit-proportional, no Hard and no Exam-tier item.
export const standardPool = (questions, block) => legacyPool(questions, block, 'standard');

/**
 * Largest-remainder apportionment of `size` across rows in proportion to their `n`. Ties go to the larger group,
 * then to the earlier row, so the result is deterministic. A row never gets more than its own `n`.
 * @param {{key: *, n: number}[]} rows the groups and how many questions each has.
 * @param {number} size the total to share out.
 * @returns {object[]} the rows with a `count` added.
 */
function largestRemainder(rows, size) {
  const total = rows.reduce((sum, r) => sum + r.n, 0);
  if (!total || size <= 0) return rows.map(r => ({ ...r, count: 0 }));
  const out = rows.map((r, i) => { const exact = r.n * size / total; return { ...r, i, count: Math.floor(exact), rest: exact - Math.floor(exact) }; });
  let left = size - out.reduce((sum, r) => sum + r.count, 0);
  for (const r of [...out].sort((a, b) => b.rest - a.rest || b.n - a.n || a.i - b.i)) {
    if (left <= 0) break;
    if (r.count < r.n) { r.count++; left--; }
  }
  return out.map(({ i, rest, ...r }) => r);
}

// The blueprint shown on the exam setup: questions per unit and per difficulty for this pool.
export function blueprint(pool, size = EXAM.size) {
  const n = Math.min(size, pool.length);
  const unitIds = [...new Set(pool.map(examUnit))].sort((a, b) => a - b);
  const units = largestRemainder(unitIds.map(id => ({ key: id, n: pool.filter(q => examUnit(q) === id).length })), n)
    .map(r => ({ id: r.key, available: r.n, count: r.count }));
  const difficulty = Object.fromEntries(largestRemainder(DIFFICULTIES.map(d => ({ key: d, n: pool.filter(q => q.difficulty === d).length })), n)
    .map(r => [r.key, { available: r.n, count: r.count }]));
  return { size: n, pool: pool.length, units, difficulty };
}

/**
 * Unit x difficulty targets whose row sums are the unit blueprint and whose column sums are the difficulty
 * blueprint. Each cell starts at the floor of its proportional share; the remaining slots are placed by
 * augmenting paths (a small max-flow), tried in a random order weighted toward the larger remainders.
 * @param {object[]} pool the exam pool questions.
 * @param {object} plan the blueprint from blueprint().
 * @param {function} random the random source.
 * @returns {{rows: number[], cols: string[], t: number[][]}} the unit ids, the difficulties and the target count per cell.
 */
function cellTargets(pool, plan, random) {
  const total = pool.length, rows = plan.units.map(u => u.id), cols = DIFFICULTIES;
  const cap = rows.map(u => cols.map(d => pool.filter(q => examUnit(q) === u && q.difficulty === d).length));
  const exact = cap.map(row => row.map(n => n * plan.size / total));
  const t = exact.map(row => row.map(Math.floor));
  const rowNeed = rows.map((_, i) => plan.units[i].count - t[i].reduce((a, b) => a + b, 0));
  const colNeed = cols.map((d, j) => plan.difficulty[d].count - t.reduce((a, row) => a + row[j], 0));
  if (rowNeed.some(n => n < 0) || colNeed.some(n => n < 0)) throw Error('Exam blueprint could not be met');
  // Edge preference: remainder plus jitter, so sampling varies between exams but follows the shares.
  const pref = exact.map(row => row.map(x => x - Math.floor(x) + random() * 0.5));
  // The column order to try for row i: highest preference first.
  const order = i => cols.map((_, j) => j).sort((a, b) => pref[i][b] - pref[i][a]);
  // add[i][j]: slots placed above the floor. Re-routing moves only these, so floors stay proportional.
  const add = rows.map(() => cols.map(() => 0));
  /**
   * Place one more slot in row i, moving an earlier added slot of another row when the column is full.
   * @param {number} i the row to place a slot for.
   * @param {Set<number>} seen the columns already tried on this path.
   * @returns {boolean} true when a slot was placed.
   */
  const augment = (i, seen) => {
    for (const j of order(i)) {
      if (t[i][j] >= cap[i][j] || seen.has(j)) continue;
      seen.add(j);
      if (colNeed[j] > 0) { t[i][j]++; add[i][j]++; colNeed[j]--; return true; }
      // Column j is full: let another row k give up one added slot in j and place it in another column.
      for (let k = 0; k < rows.length; k++) {
        if (k === i || !add[k][j]) continue;
        t[k][j]--; add[k][j]--; colNeed[j]++;
        if (augment(k, seen)) { colNeed[j]--; t[i][j]++; add[i][j]++; return true; }
        t[k][j]++; add[k][j]++; colNeed[j]--;
      }
    }
    return false;
  };
  for (const i of shuffle(rows.map((_, i) => i), random)) {
    while (rowNeed[i] > 0) {
      if (!augment(i, new Set())) throw Error('Exam blueprint could not be met');
      rowNeed[i]--;
    }
  }
  return { rows, cols, t };
}

/**
 * Stratified sample: exactly the unit and difficulty blueprint, no duplicates, in a shuffled order. A pool smaller than
 * the exam size is returned whole. Throws on duplicate question ids.
 * @param {object[]} pool the questions to draw from.
 * @param {function} [random] the random source.
 * @param {number} [size] the number of questions to draw.
 * @returns {object[]} the chosen questions.
 */
export function sampleExam(pool, random = Math.random, size = EXAM.size) {
  if (new Set(pool.map(q => q.id)).size !== pool.length) throw Error('Duplicate questions in the exam pool');
  const plan = blueprint(pool, size);
  if (plan.size < size) return shuffle(pool, random);
  // Walk a random permutation and keep a question while its unit and its difficulty both have room. Every question
  // gets a fair chance inside the quotas. A walk that ends short (rare) is retried; the cell plan is the fallback.
  for (let attempt = 0; attempt < 200; attempt++) {
    const unitLeft = new Map(plan.units.map(u => [u.id, u.count])), diffLeft = new Map(DIFFICULTIES.map(d => [d, plan.difficulty[d].count]));
    const picked = [];
    for (const q of shuffle(pool, random)) {
      const u = examUnit(q);
      if (unitLeft.get(u) > 0 && diffLeft.get(q.difficulty) > 0) { picked.push(q); unitLeft.set(u, unitLeft.get(u) - 1); diffLeft.set(q.difficulty, diffLeft.get(q.difficulty) - 1); }
    }
    if (picked.length === plan.size) return shuffle(picked, random);
  }
  return sampleByCells(pool, random, size);
}
// Fallback (and tested on its own): fixed unit x difficulty cell targets, then a random pick inside each cell.
function sampleByCells(pool, random = Math.random, size = EXAM.size) {
  const plan = blueprint(pool, size);
  const { rows, cols, t } = cellTargets(pool, plan, random), chosen = [];
  rows.forEach((u, i) => cols.forEach((d, j) => {
    chosen.push(...shuffle(pool.filter(q => examUnit(q) === u && q.difficulty === d), random).slice(0, t[i][j]));
  }));
  return shuffle(chosen, random);
}

// ---- Exam forms ----
// bank.examForms[block] = { order: ['A', 'B'], forms: { A: [ids], B: [ids] }, rules }. Forms are taken in order; any
// submitted exam counts (an automatic submit at 0:00 too). When every form is taken a new cycle starts with the same
// forms. Every exam has a random question order and random answer order. Exams without a form (the Standard draw, and
// every exam made before forms existed) do not count toward the cycle.
export const formsFor = (bank, block) => bank?.examForms?.[String(block)] || null;
// Cycle state (icf:examCycle, schema 1): per block { cycle, taken: [form names this cycle], counted: [exam ids] }.
// counted keeps a submitted exam from counting twice (results are finalized again on every load).
export const CYCLE_SCHEMA = 1;
const COUNTED_MAX = 50;
// The cycle record of a block, or a fresh one (cycle 1, nothing taken) when there is none.
const blockState = (cycles, block) => cycles?.blocks?.[String(block)] || { cycle: 1, taken: [], counted: [] };
// Report where a block stands: its cycle number, the forms taken in it and the next form to take (null when none).
export const formStatus = (cycles, forms, block) => {
  const st = blockState(cycles, block);
  return { cycle: st.cycle, taken: [...st.taken], next: forms ? forms.order.find(n => !st.taken.includes(n)) ?? null : null };
};
/**
 * Count a submitted form exam once: its form joins `taken`, and a full set of forms opens the next cycle.
 * @param {object} cycles the current cycle record.
 * @param {object} exam the exam.
 * @param {object} forms the block's forms (`order` and `forms`).
 * @returns {object} a new cycle record.
 */
export function countExam(cycles, exam, forms) {
  const next = { schema: CYCLE_SCHEMA, blocks: structuredClone(cycles?.blocks || {}) };
  if (!exam?.submitted || !exam.form || !forms?.order.includes(exam.form)) return next;
  const st = structuredClone(blockState(next, exam.block));
  if (st.counted.includes(exam.id)) return next;
  st.counted = [...st.counted, exam.id].slice(-COUNTED_MAX);
  if (!st.taken.includes(exam.form)) st.taken.push(exam.form);
  if (forms.order.every(n => st.taken.includes(n))) { st.cycle++; st.taken = []; }
  next.blocks[String(exam.block)] = st;
  return next;
}
/**
 * Restore the cycle record. Known version only: schema 1 with forms the bank knows. Missing (first run with forms) or
 * unreadable state is rebuilt from exam history, which records each form exam, so no taken form is lost.
 * @param {*} raw the saved record.
 * @param {object[]} history the exam history rows.
 * @param {object} bank the question bank with its exam forms.
 * @returns {object} a valid cycle record.
 */
export function restoreCycles(raw, history, bank) {
  const valid = raw && raw.schema === CYCLE_SCHEMA && raw.blocks && typeof raw.blocks === 'object' && !Array.isArray(raw.blocks) &&
    Object.entries(raw.blocks).every(([key, st]) => { const f = formsFor(bank, key);
      return f && st && Number.isInteger(st.cycle) && st.cycle >= 1 && Array.isArray(st.taken) && new Set(st.taken).size === st.taken.length &&
        st.taken.length < f.order.length && st.taken.every(n => f.order.includes(n)) && Array.isArray(st.counted) && st.counted.length <= COUNTED_MAX &&
        st.counted.every(id => typeof id === 'string'); });
  if (valid) return { schema: CYCLE_SCHEMA, blocks: structuredClone(raw.blocks) };
  let cycles = { schema: CYCLE_SCHEMA, blocks: {} };
  for (const h of [...history].filter(h => h.form).sort((a, b) => a.at - b.at))
    cycles = countExam(cycles, { id: h.id, block: h.block, form: h.form, submitted: true }, formsFor(bank, h.block));
  return cycles;
}
