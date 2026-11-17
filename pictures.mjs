// Scholar pictures (2.2.0, the owner 2026-11-16: "an interactive picture for each term"; dialog: both kinds, every term,
// drawn diagrams). Pure: a picture description in, SVG and control markup out. No DOM, storage or network access.
// Colours come only from CSS tokens through classes (styles.css .pic-*), so both themes and forced colours work.
// kind 'steps': Back / Next step through captions; each step lights, hides and moves parts. kind 'explore': each part
// is a button; the chosen part is lit and its caption shows. Captions are stacked in one grid cell so the caption box
// always holds the tallest caption (the owner's fixed-height comment, 2026-11-16).
import { escape, ICON } from './presentation.mjs';

export const VIEW = { w: 400, h: 240 };
const NODE_TYPES = ['pc', 'switch', 'router', 'server', 'frame', 'text', 'panel'];
const LINK_KINDS = ['trunk', 'access', 'plain'];
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = v => typeof v === 'string' && v.trim() !== '';
const inView = (x, y) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= VIEW.w && y >= 0 && y <= VIEW.h;

// Every id a step or part may name: nodes, links, groups, frame segments (<node>.<seg>) and panel lines (<node>.<line>).
export function targetIds(p) {
  const ids = new Set();
  for (const n of p.scene.nodes) { ids.add(n.id); for (const s of n.segments || []) if (s.id) ids.add(`${n.id}.${s.id}`); for (const l of n.lines || []) if (l.id) ids.add(`${n.id}.${l.id}`); }
  for (const l of p.scene.links || []) ids.add(l.id);
  for (const g of p.scene.groups || []) ids.add(g.id);
  return ids;
}

// null when the picture is usable, else the first problem (the build script checks the same rules).
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
    ids.add(n.id);
  }
  for (const l of p.scene.links || []) if (!isObj(l) || !isText(l.id) || ids.has(l.id) || !ids.has(l.from) || !ids.has(l.to) || !LINK_KINDS.includes(l.kind) || (l.labelAt !== undefined && !(l.labelAt >= 0 && l.labelAt <= 1))) return `link ${l?.id}`; else ids.add(l.id);
  for (const g of p.scene.groups || []) if (!isObj(g) || !isText(g.id) || !isText(g.label) || ids.has(g.id) || !Array.isArray(g.members) || !g.members.length || !g.members.every(m => ids.has(m))) return `group ${g?.id}`; else ids.add(g.id);
  const all = targetIds(p), known = list => list === undefined || (Array.isArray(list) && list.every(id => all.has(id)));
  if (p.kind === 'steps') {
    if (!Array.isArray(p.steps) || p.steps.length < 2 || p.steps.length > 6) return 'steps count';
    for (const s of p.steps) {
      if (!isObj(s) || !isText(s.caption) || !known(s.light) || !known(s.hide)) return 'step';
      for (const k of s.packets || []) if (!isObj(k) || !(p.scene.links || []).some(l => l.id === k.on) || !(Number.isFinite(k.at) && k.at >= 0 && k.at <= 1)) return 'packet';
    }
  } else {
    if (!Array.isArray(p.parts) || p.parts.length < 2 || p.parts.length > 8) return 'parts count';
    for (const s of p.parts) if (!isObj(s) || !isText(s.caption) || !isText(s.label) || !Array.isArray(s.light) || !s.light.length || !known(s.light)) return 'part';
  }
  return null;
}

// ---- Drawing ----
const SIZE = { pc: [30, 30], switch: [60, 20], router: [30, 30], server: [24, 34], text: [0, 0] };
const box = n => n.type === 'frame' ? { x: n.x, y: n.y, w: n.segments.reduce((a, s) => a + s.w, 0), h: 22 }
  : n.type === 'panel' ? { x: n.x, y: n.y, w: n.w, h: 14 * n.lines.length + 10 }
  : { x: n.x - SIZE[n.type][0] / 2, y: n.y - SIZE[n.type][1] / 2, w: SIZE[n.type][0], h: SIZE[n.type][1] };
const centre = n => { const b = box(n); return [b.x + b.w / 2, b.y + b.h / 2]; };
// st: {on, off, fresh}: lit, hidden, and lit now but not in the previous state (fresh parts fade in; animation 2.2.0).
const cls = (id, st) => `${st.on.has(id) ? ' is-on' : ''}${st.fresh.has(id) ? ' is-new' : ''}${st.off.has(id) ? ' is-off' : ''}`;
const label = (x, y, text, extra = '') => text ? `<text class="pic-label${extra}" x="${x}" y="${y}" text-anchor="middle">${escape(text)}</text>` : '';

function icon(n) {
  const [x, y] = [n.x, n.y];
  if (n.type === 'pc') return `<rect class="pic-shape" x="${x - 14}" y="${y - 13}" width="28" height="19" rx="2"/><path class="pic-line" d="M${x} ${y + 6}v5M${x - 7} ${y + 12}h14"/>`;
  if (n.type === 'switch') return `<rect class="pic-shape" x="${x - 30}" y="${y - 10}" width="60" height="20" rx="3"/>${[-18, -6, 6, 18].map(d => `<rect class="pic-port" x="${x + d - 3}" y="${y - 3}" width="6" height="6"/>`).join('')}`;
  if (n.type === 'router') return `<circle class="pic-shape" cx="${x}" cy="${y}" r="15"/><path class="pic-line" d="M${x - 8} ${y}h16M${x} ${y - 8}v16M${x + 5} ${y - 3}l3 3-3 3M${x - 5} ${y - 3}l-3 3 3 3"/>`;
  if (n.type === 'server') return `<rect class="pic-shape" x="${x - 12}" y="${y - 17}" width="24" height="34" rx="2"/><path class="pic-line" d="M${x - 7} ${y - 9}h14M${x - 7} ${y - 3}h14M${x - 7} ${y + 3}h14"/>`;
  return '';
}

function nodeSvg(n, st) {
  if (n.type === 'text') return `<g class="pic-node${cls(n.id, st)}" data-pic-id="${escape(n.id)}">${label(n.x, n.y, n.label, ' pic-note')}</g>`;
  if (n.type === 'frame') {
    let x = n.x;
    const segs = n.segments.map(s => { const id = s.id ? `${n.id}.${s.id}` : '', r = `<g class="pic-seg pic-seg-${escape(s.role || 'data')}${id ? cls(id, st) : ''}"${id ? ` data-pic-id="${escape(id)}"` : ''}><rect class="pic-shape" x="${x}" y="${n.y}" width="${s.w}" height="22"/>${label(x + s.w / 2, n.y + 15, s.label, ' pic-small')}</g>`; x += s.w; return r; }).join('');
    return `<g class="pic-node pic-frame${cls(n.id, st)}" data-pic-id="${escape(n.id)}">${segs}${label(n.x + (x - n.x) / 2, n.y - 6, n.label, ' pic-small')}</g>`;
  }
  if (n.type === 'panel') {
    const lines = n.lines.map((l, i) => { const id = l.id ? `${n.id}.${l.id}` : ''; return `<g class="pic-row${id ? cls(id, st) : ''}"${id ? ` data-pic-id="${escape(id)}"` : ''}><rect class="pic-row-bg" x="${n.x + 2}" y="${n.y + 4 + 14 * i}" width="${n.w - 4}" height="14"/>${l.cells.map((c, k) => c ? `<text class="pic-mono${l.head ? ' pic-head' : ''}" x="${n.x + 6 + n.cols[k]}" y="${n.y + 15 + 14 * i}">${escape(c)}</text>` : '').join('')}</g>`; }).join('');
    return `<g class="pic-node pic-panel${cls(n.id, st)}" data-pic-id="${escape(n.id)}"><rect class="pic-shape" x="${n.x}" y="${n.y}" width="${n.w}" height="${14 * n.lines.length + 10}" rx="4"/>${lines}</g>`;
  }
  const b = box(n);
  return `<g class="pic-node${cls(n.id, st)}" data-pic-id="${escape(n.id)}">${icon(n)}${label(n.x, b.y + b.h + 12, n.label)}</g>`;
}

// A link runs between the edges of its two boxes, not their centres: a dimmed box is see-through, so a line drawn to the
// centre of a frame or panel crossed its label (Block 5 Scholar, 2026-11-16). Icons hid that part of the line anyway.
function edge(n, [x, y], [tx, ty]) {
  const b = box(n), dx = tx - x, dy = ty - y;
  const t = Math.min(1, dx ? b.w / 2 / Math.abs(dx) : Infinity, dy ? b.h / 2 / Math.abs(dy) : Infinity);
  return [x + dx * t, y + dy * t];
}
function linkSvg(l, nodes, st) {
  const a = nodes.get(l.from), z = nodes.get(l.to), ca = centre(a), cz = centre(z);
  const [x1, y1] = edge(a, ca, cz), [x2, y2] = edge(z, cz, ca);
  return `<g class="pic-link pic-${l.kind}${cls(l.id, st)}" data-pic-id="${escape(l.id)}"><line class="pic-hit" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>${l.kind === 'trunk' ? `<line class="pic-trunk-core" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>` : ''}${l.label ? label(x1 + (x2 - x1) * (l.labelAt ?? 0.5), y1 + (y2 - y1) * (l.labelAt ?? 0.5) - (l.kind === 'trunk' ? 16 : 7), l.label, ' pic-small') : ''}</g>`;
}

function groupSvg(g, nodes, st, i) {
  // The box holds each member's icon and its label (about 5.5 px per character at the label size).
  const bs = g.members.map(id => nodes.get(id)).filter(Boolean).map(n => { const b = box(n), lw = (n.label || '').length * 5.5; return lw > b.w && !['frame', 'panel'].includes(n.type) ? { ...b, x: n.x - lw / 2, w: lw } : b; });
  const x = Math.min(...bs.map(b => b.x)) - 10, y = Math.min(...bs.map(b => b.y)) - 18, r = Math.max(...bs.map(b => b.x + b.w)) + 10, bt = Math.max(...bs.map(b => b.y + b.h)) + 22;
  return `<g class="pic-group pic-group-${i % 3}${cls(g.id, st)}" data-pic-id="${escape(g.id)}"><rect x="${x}" y="${y}" width="${r - x}" height="${bt - y}" rx="8"/><text class="pic-label pic-small pic-group-label" x="${x + 6}" y="${y + 11}">${escape(g.label)}</text></g>`;
}

// from: where the packet was in the previous step (0-1 along the same link), or null for no glide. The glide is an SVG
// animateTransform (0.45 s), so it runs once per render and needs no script; reduced motion passes from = null.
function packetSvg(k, links, nodes, from = null) {
  const l = links.get(k.on), [x1, y1] = centre(nodes.get(l.from)), [x2, y2] = centre(nodes.get(l.to));
  const at = t => [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t], [x, y] = at(k.at), text = k.tag ? `Tag ${k.tag}` : (k.label || 'Frame'), w = 8 + 6 * text.length;
  const glide = from !== null && from !== k.at ? (([fx, fy]) => `<animateTransform attributeName="transform" type="translate" from="${(fx - x).toFixed(1)} ${(fy - y).toFixed(1)}" to="0 0" dur="0.45s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".2 .7 .3 1"/>`)(at(from)) : '';
  return `<g class="pic-packet${k.tag ? ' is-tagged' : ''}">${glide}<rect x="${x - w / 2}" y="${y - 9}" width="${w}" height="18" rx="4"/>${label(x, y + 4, text, ' pic-small pic-packet-text')}</g>`;
}

// The SVG for one state. index: the step (steps) or the chosen part (explore; -1 = none).
// Animation (the owner, 2026-11-16, "1 a"): prev is the state shown before (null on first draw); packets glide from their
// previous place and newly lit parts fade in. still: reduced motion, so nothing moves or fades.
const stateOf = (p, index) => p.kind === 'steps' ? p.steps[Math.min(Math.max(index, 0), p.steps.length - 1)] : (p.parts[index] || {});
// fixed: a state to draw instead of a step or part ({light, hide}; the tap board of a guided question, 2.3.0).
export function pictureSvg(p, index = 0, { prev = null, still = false, fixed = null } = {}) {
  const nodes = new Map(p.scene.nodes.map(n => [n.id, n])), links = new Map((p.scene.links || []).map(l => [l.id, l]));
  const s = fixed || stateOf(p, index), before = fixed || prev === null || still || prev === index ? null : stateOf(p, prev);
  const on = new Set(s.light || []), off = new Set(s.hide || []);
  const st = { on, off, fresh: before ? new Set([...on].filter(id => !(before.light || []).includes(id))) : new Set() };
  const from = k => !before ? null : ((before.packets || []).find(b => b.on === k.on)?.at ?? 0);
  const dim = on.size ? ' has-light' : '';
  return `<svg class="pic${dim}" viewBox="0 0 ${VIEW.w} ${VIEW.h}" role="img" aria-label="${escape(p.alt)}" focusable="false">`
    + (p.scene.groups || []).map((g, i) => groupSvg(g, nodes, st, i)).join('')
    + (p.scene.links || []).map(l => linkSvg(l, nodes, st)).join('')
    + p.scene.nodes.map(n => nodeSvg(n, st)).join('')
    + (s.packets || []).map(k => packetSvg(k, links, nodes, from(k))).join('') + '</svg>';
}

// The picture body (the term page wraps it in its collapsible section): drawing, controls and the held caption box.
// Controls (the owner, 2026-11-16): steps = rewind and forward icon buttons on the left; both kinds have a Flag-sized
// play/pause button at the right. playing: the loop runs (app.mjs advances it); captions are not announced meanwhile.
export function pictureHtml(p, index = 0, { motion = {}, playing = false } = {}) {
  const steps = p.kind === 'steps', list = steps ? p.steps : p.parts, i = steps ? Math.min(Math.max(index, 0), list.length - 1) : index;
  const now = k => steps ? k === i : k === i + 1;
  const captions = (steps ? list : [{ caption: 'Choose a part of the picture to read about it.' }, ...list])
    .map((s, k) => `<p class="pic-caption${now(k) ? ' is-now' : ''}"${now(k) ? '' : ' aria-hidden="true"'}>${steps ? `<span class="label pic-step">Step ${k + 1} of ${list.length}</span> ` : ''}${escape(s.caption)}</p>`).join('');
  // The label names the action (review 2026-11-16: aria-pressed with "Pause" read as contradictory); data-playing is the state.
  const play = `<button type="button" id="pic-play" class="flag-btn pic-play" data-playing="${playing}" aria-label="${playing ? 'Pause the picture' : 'Play the picture'}" title="${playing ? 'Pause' : 'Play'}">${playing ? ICON.pause : ICON.play}</button>`;
  const controls = steps
    ? `<div class="pic-controls"><button type="button" id="pic-back" class="flag-btn pic-nav" aria-label="Previous step" title="Previous step"${i === 0 ? ' disabled' : ''}>${ICON.rewind}</button><button type="button" id="pic-next" class="flag-btn pic-nav" aria-label="Next step" title="Next step"${i === list.length - 1 ? ' disabled' : ''}>${ICON.forward}</button>${play}</div>`
    : `<div class="pic-controls"><div class="pic-parts" role="group" aria-label="Parts of the picture">${list.map((s, k) => `<button type="button" class="small pic-part" data-pic-part="${k}" aria-pressed="${k === i}">${escape(s.label)}</button>`).join('')}</div>${play}</div>`;
  return `<div class="pic-body"><div class="pic-frame">${pictureSvg(p, i, motion)}</div>${controls}<div class="pic-captions"${playing ? ' aria-live="off"' : ' role="status"'}>${captions}</div></div>`;
}

// ---- Tap board (2.3.0, the owner 2026-11-16: "tap the picture") ----
// The ids an answer's at names: a node, link, group, segment or panel line, or part:<n> (the ids that part lights).
// A group also covers its members, so a tap on a computer inside a VLAN box answers with that box (fresh review 2026-11-16).
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
