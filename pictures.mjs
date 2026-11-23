// Scholar pictures: an interactive, drawn diagram for each term, of both kinds. Pure: a picture description in, SVG and control markup out. No DOM, storage or network access.
// Colours come only from CSS tokens through classes (styles.css .pic-*), so both themes and forced colours work.
// kind 'steps': Back / Next step through captions; each step lights, hides and moves parts. kind 'explore': each part
// is a button; the chosen part is lit and its caption shows. Captions are stacked in one grid cell so the caption box
// always holds the tallest caption (the box keeps a fixed height).
// Inputs: a picture description (kind, alt text, scene of nodes, links and groups, steps or parts) and a step or part index.
// Outputs: SVG and control markup as strings, and checks of a picture description. Run: imported as an ES module by the app and the tests.
// Network: none.
// Writes: none (it returns strings; scholar-ui.mjs puts them on the page).
// Credentials: none.
import { escape, ICON } from './presentation.mjs';
import { VIEW, ICONS, NODE_TYPES, LINK_KINDS, BAND_H, textW, label, isHidden, hiddenIds, pictureSvg } from './pictures-svg.mjs';
export { VIEW, BAND_H, linkLabel, pictureSvg } from './pictures-svg.mjs';

// Each band of a stack and each mark of a timeline is a target (<node>.<id>), like frame segments and panel lines.
const subs = n => [...(n.segments || []), ...(n.lines || []), ...(n.layers || []), ...(n.marks || [])];
// True when the list holds 2 to `max` items that each have a unique id and a label.
const subList = (list, max = 8) => Array.isArray(list) && list.length >= 2 && list.length <= max && list.every(x => isObj(x) && isText(x.id) && isText(x.label)) && new Set(list.map(x => x.id)).size === list.length;
// True when the value is a plain object (not null, not an array).
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
// True when the value is a string with something other than spaces in it.
const isText = v => typeof v === 'string' && v.trim() !== '';
// True when the point lies inside the 400 x 240 drawing area.
const inView = (x, y) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= VIEW.w && y >= 0 && y <= VIEW.h;

// Every id a step or part may name: nodes, links, groups, frame segments (<node>.<seg>), panel lines (<node>.<line>), stack
// bands (<node>.<layer>) and timeline marks (<node>.<mark>).
export function targetIds(p) {
  const ids = new Set();
  for (const n of p.scene.nodes) { ids.add(n.id); for (const s of subs(n)) if (s?.id) ids.add(`${n.id}.${s.id}`); }
  for (const l of p.scene.links || []) ids.add(l.id);
  for (const g of p.scene.groups || []) ids.add(g.id);
  return ids;
}

/**
 * Check a picture description against the picture rules. The build script checks the same rules.
 * @param {*} p the picture.
 * @returns {string|null} null when the picture is usable, else a short text naming the first problem.
 */
export function pictureProblem(p) {
  if (!isObj(p) || !['steps', 'explore'].includes(p.kind) || !isText(p.alt) || !isObj(p.scene) || !Array.isArray(p.scene.nodes) || !p.scene.nodes.length) return 'shape';
  const ids = new Set();
  for (const n of p.scene.nodes) {
    if (!isObj(n) || !isText(n.id) || ids.has(n.id) || !NODE_TYPES.includes(n.type) || !inView(n.x, n.y)) return `node ${n?.id}`;
    if (n.type === 'frame' && !(Array.isArray(n.segments) && n.segments.length && n.segments.every(s => isObj(s) && isText(s.label) && Number.isFinite(s.w) && s.w > 0))) return `frame ${n.id}`;
    // Panel (command output, course text only): rows of cells at the column offsets in cols (the app has one face, not
    // a fixed-width one, so columns are placed, not padded with spaces).
    if (n.type === 'panel' && !(Array.isArray(n.cols) && n.cols.every(Number.isFinite) && Array.isArray(n.lines) && n.lines.length && n.lines.every(l => isObj(l) && Array.isArray(l.cells) && l.cells.length <= n.cols.length && l.cells.every(c => typeof c === 'string')) && Number.isFinite(n.w) && inView(n.x + n.w, n.y + 14 * n.lines.length + 10))) return `panel ${n.id}`;
    if (n.type === 'frame' && !inView(n.x + n.segments.reduce((a, s) => a + s.w, 0), n.y)) return `frame ${n.id} width`;
    // Stack: bands top to bottom (the first is the top rank or layer); timeline: marks left to right, evenly spaced.
    if (n.type === 'stack' && !(subList(n.layers) && Number.isFinite(n.w) && n.w > 0 && inView(n.x + n.w, n.y + BAND_H * n.layers.length) && (!isText(n.label) || n.y >= 16))) return `stack ${n.id}`;  // its label sits above the bands
    if (n.type === 'timeline' && !(subList(n.marks) && Number.isFinite(n.w) && n.w > 0 && inView(n.x + n.w, n.y + 24) && n.label === undefined && n.marks.every(m => textW(m.label) <= n.w / n.marks.length + 8))) return `timeline ${n.id}`;  // no undrawn label; mark labels fit their spacing
    ids.add(n.id);
  }
  for (const l of p.scene.links || []) if (!isObj(l) || !isText(l.id) || ids.has(l.id) || !ids.has(l.from) || !ids.has(l.to) || !LINK_KINDS.includes(l.kind) || (l.labelAt !== undefined && !(l.labelAt >= 0 && l.labelAt <= 1))) return `link ${l?.id}`; else ids.add(l.id);
  for (const g of p.scene.groups || []) if (!isObj(g) || !isText(g.id) || !isText(g.label) || ids.has(g.id) || !Array.isArray(g.members) || !g.members.length || !g.members.every(m => ids.has(m))) return `group ${g?.id}`; else ids.add(g.id);
  // Picture standard: a picture shows what happens or how parts relate, so it draws at least
  // one shape (a table panel, text or a frame alone is a table of the text), and every step or part changes what is shown.
  if (!p.scene.nodes.some(n => ICONS.includes(n.type))) return 'no drawn shape (a panel, text or frame alone)';
  const all = targetIds(p), known = list => list === undefined || (Array.isArray(list) && list.every(id => all.has(id)));
  if (p.kind === 'steps') {
    if (!Array.isArray(p.steps) || p.steps.length < 2 || p.steps.length > 6) return 'steps count';
    for (const s of p.steps) {
      if (!isObj(s) || !isText(s.caption) || !known(s.light) || !known(s.hide)) return 'step';
      for (const k of s.packets || []) if (!isObj(k) || !(p.scene.links || []).some(l => l.id === k.on) || !(Number.isFinite(k.at) && k.at >= 0 && k.at <= 1)) return 'packet';
    }
    // A step never lights a part it hides (a hidden node takes its parts, such as "f.h", with it), or a line whose end it
    // hides, nor moves a packet on such a line.
    for (const s of p.steps) { const off = hiddenIds(p, s); if ([...(s.light || []), ...(s.packets || []).map(k => k.on)].some(id => isHidden(off, id))) return 'a step lights a part or line it hides'; }
    // A signature of a step's drawing (what is lit, hidden and moving), to spot a step that changes nothing.
    const look = s => JSON.stringify([[...(s.light || [])].sort(), [...(s.hide || [])].sort(), (s.packets || []).map(k => [k.on, k.at, k.label || '', k.tag || ''])]);
    if (p.steps.some((s, i) => i && look(s) === look(p.steps[i - 1]))) return 'a step changes nothing in the drawing';
  } else {
    if (!Array.isArray(p.parts) || p.parts.length < 2 || p.parts.length > 8) return 'parts count';
    for (const s of p.parts) if (!isObj(s) || !isText(s.caption) || !isText(s.label) || !Array.isArray(s.light) || !s.light.length || !known(s.light)) return 'part';
    if (new Set(p.parts.map(s => [...s.light].sort().join())).size !== p.parts.length) return 'two parts light the same thing';
  }
  return null;
}

/**
 * The picture body (the term page wraps it in its collapsible section): drawing, controls and the held caption box.
 * Controls: steps = rewind and forward icon buttons on the left (on the last step, forward becomes Replay); both kinds
 * have a Flag-sized play/pause button at the right. Captions are not announced while the loop plays.
 * @param {object} p the picture.
 * @param {number} [index] the step or chosen part.
 * @param {object} [options] motion (the options for pictureSvg) and playing (the loop runs; app.mjs advances it).
 * @returns {string} the HTML.
 */
export function pictureHtml(p, index = 0, { motion = {}, playing = false } = {}) {
  const steps = p.kind === 'steps', list = steps ? p.steps : p.parts, i = steps ? Math.min(Math.max(index, 0), list.length - 1) : index;
  // True when caption k is the one shown now.
  const now = k => steps ? k === i : k === i + 1;
  const captions = (steps ? list : [{ caption: 'Choose a part of the picture to read about it.' }, ...list])
    .map((s, k) => `<p class="pic-caption${now(k) ? ' is-now' : ''}"${now(k) ? '' : ' aria-hidden="true"'}>${steps ? `<span class="label pic-step">Step ${k + 1} of ${list.length}</span> ` : ''}${escape(s.caption)}</p>`).join('');
  // The label names the action (aria-pressed with "Pause" read as contradictory); data-playing is the state.
  const play = `<button type="button" id="pic-play" class="flag-btn pic-play" data-playing="${playing}" aria-label="${playing ? 'Pause the picture' : 'Play the picture'}" title="${playing ? 'Pause' : 'Play'}">${playing ? ICON.pause : ICON.play}</button>`;
  const controls = steps
    ? `<div class="pic-controls"><button type="button" id="pic-back" class="flag-btn pic-nav" aria-label="Previous step" title="Previous step"${i === 0 ? ' disabled' : ''}>${ICON.rewind}</button>${i === list.length - 1 ? `<button type="button" id="pic-next" class="flag-btn pic-nav" data-replay="true" aria-label="Replay from step 1" title="Replay">${ICON.retry}</button>` : `<button type="button" id="pic-next" class="flag-btn pic-nav" aria-label="Next step" title="Next step">${ICON.forward}</button>`}${play}</div>`
    : `<div class="pic-controls">${play}<div class="pic-parts" role="group" aria-label="Parts of the picture">${list.map((s, k) => `<button type="button" class="small pic-part" data-pic-part="${k}" aria-pressed="${k === i}">${escape(s.label)}</button>`).join('')}</div></div>`;
  return `<div class="pic-body"><div class="pic-frame">${pictureSvg(p, i, motion)}</div>${controls}<div class="pic-captions"${playing ? ' aria-live="off"' : ' role="status"'}>${captions}</div></div>`;
}

// The previous index a picture move animates from: none on a jump back to the start (the loop's wrap and Replay draw
// step 1 fresh, so no packet glides backwards).
export const moveFrom = (from, to) => to === 0 && from > 0 ? null : from;
// The step or part an arrow key moves to from index (Left = back, Right = on): steps stop at the ends, parts wrap
// (from no part, Right gives the first); null for another key or no move.
export function stepKey(p, index, key) {
  const d = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0, n = (p.steps || p.parts).length;
  if (!d) return null;
  const from = index < 0 ? (d > 0 ? -1 : n) : index, to = p.kind === 'steps' ? Math.min(n - 1, Math.max(0, index + d)) : (from + d + n) % n;
  return to === index ? null : to;
}

// ---- Tap board ----
// The ids an answer's at names: a node, link, group, segment, panel line, stack band or timeline mark, or part:<n> (the ids that part lights).
// A group also covers its members, so a tap on a computer inside a VLAN box answers with that box.
export const tapIds = (p, at) => /^part:\d+$/.test(at) ? (p.parts?.[Number(at.slice(5))]?.light || [])
  : [at, ...((p.scene.groups || []).find(g => g.id === at)?.members || [])];
// The term's picture with no step or part lit; each answer's target carries data-tap="<answer index>" and, after a pick,
// data-tap-state="wrong" (a wrong pick) or "right" (the key, once found or revealed). The drawing is a pointer shortcut;
// the answer tiles under it are the keyboard and screen-reader way to answer (WCAG 2.5.7: no drag, no picture-only input).
export function tapBoardHtml(p, answers, { wrong = [], right = null, done = false } = {}) {
  let svg = pictureSvg(p, -1, { fixed: { light: [] } });
  answers.forEach((a, i) => {
    const state = i === right ? 'right' : wrong.includes(i) ? 'wrong' : '';
    for (const id of tapIds(p, a.at)) svg = svg.split(`data-pic-id="${escape(id)}"`).join(`data-pic-id="${escape(id)}" data-tap="${i}"${state ? ` data-tap-state="${state}"` : ''}`);
  });
  return `<div class="pic-frame scholar-tap${done ? ' is-done' : ''}">${svg}</div>`;
}
