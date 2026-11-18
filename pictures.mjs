// Scholar pictures: an interactive, drawn diagram for each term, of both kinds. Pure: a picture description in, SVG and control markup out. No DOM, storage or network access.
// Colours come only from CSS tokens through classes (styles.css .pic-*), so both themes and forced colours work.
// kind 'steps': Back / Next step through captions; each step lights, hides and moves parts. kind 'explore': each part
// is a button; the chosen part is lit and its caption shows. Captions are stacked in one grid cell so the caption box
// always holds the tallest caption (the box keeps a fixed height).
import { escape, ICON } from './presentation.mjs';

export const VIEW = { w: 400, h: 240 };
// Drawn shapes (icons). The shape kit also adds
// people, documents and objects, so a picture can show who does what to what, not only network gear.
// The picture kit addition adds the hardware and place
// shapes most named by the terms the kit could not draw (building, disk, chip), a cable link, a layer stack (ranked or
// layered bands) and a timeline (an axis with marks). A stack or timeline, like a panel or frame, is not a drawn shape.
const ICONS = ['pc', 'switch', 'router', 'server', 'person', 'doc', 'lock', 'alert', 'envelope', 'shield', 'cloud', 'clock', 'building', 'disk', 'chip'];
const NODE_TYPES = [...ICONS, 'frame', 'text', 'panel', 'stack', 'timeline'];
const LINK_KINDS = ['trunk', 'access', 'plain', 'cable'];
// Boxes (not icons): links meet their edges and no label is cleared under them.
const BOXES = ['frame', 'panel', 'stack', 'timeline'];
export const BAND_H = 22;
// Each band of a stack and each mark of a timeline is a target (<node>.<id>), like frame segments and panel lines.
const subs = n => [...(n.segments || []), ...(n.lines || []), ...(n.layers || []), ...(n.marks || [])];
const subList = (list, max = 8) => Array.isArray(list) && list.length >= 2 && list.length <= max && list.every(x => isObj(x) && isText(x.id) && isText(x.label)) && new Set(list.map(x => x.id)).size === list.length;
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = v => typeof v === 'string' && v.trim() !== '';
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
    const look = s => JSON.stringify([[...(s.light || [])].sort(), [...(s.hide || [])].sort(), (s.packets || []).map(k => [k.on, k.at, k.label || '', k.tag || ''])]);
    if (p.steps.some((s, i) => i && look(s) === look(p.steps[i - 1]))) return 'a step changes nothing in the drawing';
  } else {
    if (!Array.isArray(p.parts) || p.parts.length < 2 || p.parts.length > 8) return 'parts count';
    for (const s of p.parts) if (!isObj(s) || !isText(s.caption) || !isText(s.label) || !Array.isArray(s.light) || !s.light.length || !known(s.light)) return 'part';
    if (new Set(p.parts.map(s => [...s.light].sort().join())).size !== p.parts.length) return 'two parts light the same thing';
  }
  return null;
}

// ---- Drawing ----
const SIZE = { pc: [30, 30], switch: [60, 20], router: [30, 30], server: [24, 34], text: [0, 0], person: [26, 30], doc: [22, 28], lock: [22, 28],
  alert: [30, 26], envelope: [30, 20], shield: [24, 30], cloud: [34, 22], clock: [28, 28], building: [32, 32], disk: [28, 30], chip: [30, 30] };
// Label width estimate: capitals are wider (COMSEC overflowed its group box on phones).
const textW = t => [...(t || '')].reduce((a, c) => a + (/[A-Z0-9]/.test(c) ? 8 : 6.5), 0);
const box = n => n.type === 'text' ? { x: n.x - textW(n.label) / 2, y: n.y - 12, w: textW(n.label), h: 16 }
  : n.type === 'frame' ? { x: n.x, y: n.y, w: n.segments.reduce((a, s) => a + s.w, 0), h: 22 }
  : n.type === 'panel' ? { x: n.x, y: n.y, w: n.w, h: 14 * n.lines.length + 10 }
  : n.type === 'stack' ? { x: n.x, y: n.y, w: n.w, h: BAND_H * n.layers.length }
  : n.type === 'timeline' ? { x: n.x, y: n.y - 6, w: n.w, h: 28 }
  : { x: n.x - SIZE[n.type][0] / 2, y: n.y - SIZE[n.type][1] / 2, w: SIZE[n.type][0], h: SIZE[n.type][1] };
const centre = n => { const b = box(n); return [b.x + b.w / 2, b.y + b.h / 2]; };
// st: {on, off, fresh}: lit, hidden, and lit now but not in the previous state (fresh parts fade in).
const cls = (id, st) => `${st.on.has(id) ? ' is-on' : ''}${st.fresh.has(id) ? ' is-new' : ''}${st.off.has(id) ? ' is-off' : ''}`;
const label = (x, y, text, extra = '') => text ? `<text class="pic-label${extra}" x="${x}" y="${y}" text-anchor="middle">${escape(text)}</text>` : '';

function icon(n) {
  const [x, y] = [n.x, n.y];
  if (n.type === 'pc') return `<rect class="pic-shape" x="${x - 14}" y="${y - 13}" width="28" height="19" rx="2"/><path class="pic-line" d="M${x} ${y + 6}v5M${x - 7} ${y + 12}h14"/>`;
  if (n.type === 'switch') return `<rect class="pic-shape" x="${x - 30}" y="${y - 10}" width="60" height="20" rx="3"/>${[-18, -6, 6, 18].map(d => `<rect class="pic-port" x="${x + d - 3}" y="${y - 3}" width="6" height="6"/>`).join('')}`;
  if (n.type === 'router') return `<circle class="pic-shape" cx="${x}" cy="${y}" r="15"/><path class="pic-line" d="M${x - 8} ${y}h16M${x} ${y - 8}v16M${x + 5} ${y - 3}l3 3-3 3M${x - 5} ${y - 3}l-3 3 3 3"/>`;
  if (n.type === 'server') return `<rect class="pic-shape" x="${x - 12}" y="${y - 17}" width="24" height="34" rx="2"/><path class="pic-line" d="M${x - 7} ${y - 9}h14M${x - 7} ${y - 3}h14M${x - 7} ${y + 3}h14"/>`;
  if (n.type === 'person') return `<circle class="pic-shape" cx="${x}" cy="${y - 8}" r="6.5"/><path class="pic-shape" d="M${x - 13} ${y + 15}v-3a13 11 0 0 1 26 0v3z"/>`;
  if (n.type === 'doc') return `<path class="pic-shape" d="M${x - 11} ${y - 14}h15l7 7v21h-22z"/><path class="pic-line" d="M${x + 4} ${y - 14}v7h7M${x - 6} ${y - 1}h12M${x - 6} ${y + 4}h12M${x - 6} ${y + 9}h8"/>`;
  if (n.type === 'lock') return `<path class="pic-line" d="M${x - 7} ${y - 2}v-5a7 7 0 0 1 14 0v5"/><rect class="pic-shape" x="${x - 11}" y="${y - 2}" width="22" height="16" rx="2"/><path class="pic-line" d="M${x} ${y + 3}v5"/>`;
  if (n.type === 'alert') return `<path class="pic-shape" d="M${x} ${y - 13}l15 26h-30z" stroke-linejoin="round"/><path class="pic-line" d="M${x} ${y - 4}v8M${x} ${y + 8}v1"/>`;
  if (n.type === 'envelope') return `<rect class="pic-shape" x="${x - 15}" y="${y - 10}" width="30" height="20" rx="2"/><path class="pic-line" d="M${x - 15} ${y - 9}l15 11 15-11"/>`;
  if (n.type === 'shield') return `<path class="pic-shape" d="M${x} ${y - 15}l12 5v8c0 9-5 14-12 17c-7-3-12-8-12-17v-8z"/><path class="pic-line" d="M${x - 5} ${y}l4 4 7-8"/>`;
  if (n.type === 'cloud') return `<path class="pic-shape" d="M${x - 10} ${y + 10}a7 7 0 0 1-1-14a9 9 0 0 1 17-4a7 7 0 0 1 7 9a5 5 0 0 1-1 9z"/>`;
  // building: a roof line over a wall with a door and two windows; disk: a drive cylinder with a platter line; chip: a square
  // with three pins on each side.
  if (n.type === 'building') return `<path class="pic-shape" d="M${x - 16} ${y - 3}L${x} ${y - 16}L${x + 16} ${y - 3}z" stroke-linejoin="round"/><rect class="pic-shape" x="${x - 13}" y="${y - 3}" width="26" height="19"/><path class="pic-line" d="M${x - 3} ${y + 16}v-8h6v8"/><rect class="pic-line" x="${x - 10}" y="${y + 1}" width="5" height="5"/><rect class="pic-line" x="${x + 5}" y="${y + 1}" width="5" height="5"/>`;
  if (n.type === 'disk') return `<path class="pic-shape" d="M${x - 13} ${y - 10}v20a13 5 0 0 0 26 0v-20a13 5 0 0 0-26 0z"/><path class="pic-line" d="M${x - 13} ${y - 10}a13 5 0 0 0 26 0M${x - 13} ${y}a13 5 0 0 0 26 0"/>`;
  if (n.type === 'chip') return `<rect class="pic-shape" x="${x - 10}" y="${y - 10}" width="20" height="20" rx="2"/><path class="pic-line" d="${[-6, 0, 6].map(d => `M${x + d} ${y - 11}v-4M${x + d} ${y + 11}v4M${x - 11} ${y + d}h-4M${x + 11} ${y + d}h4`).join('')}"/><circle class="pic-line" cx="${x - 5}" cy="${y - 5}" r="1.5"/>`;
  if (n.type === 'clock') return `<circle class="pic-shape" cx="${x}" cy="${y}" r="13"/><path class="pic-line" d="M${x} ${y - 8}v8l6 4"/>`;
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
  if (n.type === 'stack') {
    const bands = n.layers.map((l, i) => { const id = `${n.id}.${l.id}`, y = n.y + BAND_H * i; return `<g class="pic-band${cls(id, st)}" data-pic-id="${escape(id)}"><rect class="pic-shape" x="${n.x}" y="${y}" width="${n.w}" height="${BAND_H}"/>${label(n.x + n.w / 2, y + 15, l.label, ' pic-small')}</g>`; }).join('');
    return `<g class="pic-node pic-stack${cls(n.id, st)}" data-pic-id="${escape(n.id)}">${bands}${label(n.x + n.w / 2, n.y - 6, n.label, ' pic-small')}</g>`;
  }
  if (n.type === 'timeline') {
    const k = n.marks.length, marks = n.marks.map((m, i) => { const id = `${n.id}.${m.id}`, x = n.x + n.w * (i + 0.5) / k; return `<g class="pic-mark${cls(id, st)}" data-pic-id="${escape(id)}"><circle class="pic-shape" cx="${x}" cy="${n.y}" r="4.5"/>${label(x, n.y + 19, m.label, ' pic-small')}</g>`; }).join('');
    return `<g class="pic-node pic-timeline${cls(n.id, st)}" data-pic-id="${escape(n.id)}"><path class="pic-line" d="M${n.x} ${n.y}h${n.w}m-6 -4l6 4-6 4"/>${marks}</g>`;
  }
  const b = box(n);
  return `<g class="pic-node${cls(n.id, st)}" data-pic-id="${escape(n.id)}">${icon(n)}${label(n.x, b.y + b.h + 12, n.label)}</g>`;
}

// A link runs between the edges of its two boxes, not their centres: a dimmed box is see-through, so a line drawn to the
// centre of a frame or panel crossed its label. Icons hid that part of the line anyway.
// A link that would cross its own icon's label starts where it leaves the label: a downward or
// diagonal line no longer runs through the name under the icon.
function edge(n, [x, y], [tx, ty], clear = true) {
  const b = box(n), dx = tx - x, dy = ty - y;
  let t = Math.min(1, dx ? b.w / 2 / Math.abs(dx) : Infinity, dy ? b.h / 2 / Math.abs(dy) : Infinity);
  if (clear && n.label && ![...BOXES, 'text'].includes(n.type)) {
    const w = textW(n.label) * 0.62 + 2, top = b.y + b.h, bottom = top + 18;  // labels render up to ~1.2x wider on phones
    const tx0 = dx ? ((n.x - w) - x) / dx : -Infinity, tx1 = dx ? ((n.x + w) - x) / dx : Infinity;
    const ty0 = dy ? (top - y) / dy : -Infinity, ty1 = dy ? (bottom - y) / dy : Infinity;
    const enter = Math.max(Math.min(tx0, tx1), Math.min(ty0, ty1)), leave = Math.min(Math.max(tx0, tx1), Math.max(ty0, ty1));
    if ((dx || (x >= n.x - w && x <= n.x + w)) && (dy || (y >= top && y <= bottom)) && enter <= leave && leave > 0 && enter < 1) t = Math.min(1, Math.max(t, leave));
  }
  return [x + dx * t, y + dy * t];
}
function linkSvg(l, nodes, st) {
  const a = nodes.get(l.from), z = nodes.get(l.to), ca = centre(a), cz = centre(z);
  let [x1, y1] = edge(a, ca, cz), [x2, y2] = edge(z, cz, ca);
  // When clearing the labels would make the two ends meet or cross (a target inside the label band), use the icon edges.
  if ((x2 - x1) * (cz[0] - ca[0]) + (y2 - y1) * (cz[1] - ca[1]) <= 0) [[x1, y1], [x2, y2]] = [edge(a, ca, cz, false), edge(z, cz, ca, false)];
  // A cable is a thick line with a plug (a short wide bar along the line) at each end.
  const len = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / len * 7, uy = (y2 - y1) / len * 7;
  const plugs = l.kind === 'cable' ? `<line class="pic-plug" x1="${x1}" y1="${y1}" x2="${x1 + ux}" y2="${y1 + uy}"/><line class="pic-plug" x1="${x2}" y1="${y2}" x2="${x2 - ux}" y2="${y2 - uy}"/>` : '';
  return `<g class="pic-link pic-${l.kind}${cls(l.id, st)}" data-pic-id="${escape(l.id)}"><line class="pic-hit" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>${l.kind === 'trunk' ? `<line class="pic-trunk-core" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>` : ''}${plugs}${l.label ? linkLabel(l, x1, y1, x2, y2) : ''}</g>`;
}

// A line's label sits beside the line, never on it: its centre moves along the normal (up, or right
// on a vertical line) far enough that the label box clears the line; a flat line keeps the old 7 px gap (11 px to the centre).
export function linkLabel(l, x1, y1, x2, y2) {
  const t = l.labelAt ?? 0.5, px = x1 + (x2 - x1) * t, py = y1 + (y2 - y1) * t, len = Math.hypot(x2 - x1, y2 - y1) || 1;
  let nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
  if (ny > 0.05 || (Math.abs(ny) <= 0.05 && nx < 0)) [nx, ny] = [-nx, -ny];
  const hw = textW(l.label) * 0.58, hh = 6, base = l.kind === 'trunk' ? 20 : l.kind === 'cable' ? 14 : 11, d = l.kind === 'trunk' && Math.abs(ny) > 0.9 ? base : Math.max(base, hw * Math.abs(nx) + hh * Math.abs(ny) + 4 + base - 11);
  // The other side when it leaves the 400 x 240 frame by less; a near-flat trunk keeps its fixed 20 px gap, a steep one uses the angle too.
  const out = s => { const cx = px + s * nx * d, cy = py + s * ny * d;
    return Math.max(0, 4 - (cx - hw)) + Math.max(0, cx + hw - (VIEW.w - 4)) + Math.max(0, 4 - (cy - hh)) + Math.max(0, cy + hh - (VIEW.h - 4)); };
  if (out(-1) < out(1)) [nx, ny] = [-nx, -ny];
  return label(Math.round(px + nx * d), Math.round(py + ny * d + 4), l.label, ' pic-small');
}

function groupSvg(g, nodes, st, i) {
  // The box holds each member's icon and its label (textW; 5.5 px per character let a label touch the box).
  const bs = g.members.map(id => nodes.get(id)).filter(Boolean).map(n => { const b = box(n), lw = textW(n.label); return lw > b.w && !BOXES.includes(n.type) ? { ...b, x: n.x - lw / 2, w: lw } : b; });
  const x = Math.min(...bs.map(b => b.x)) - 10, y = Math.min(...bs.map(b => b.y)) - 18, r = Math.max(Math.max(...bs.map(b => b.x + b.w)) + 10, Math.min(...bs.map(b => b.x)) - 4 + textW(g.label) * 1.05 + 4), bt = Math.max(...bs.map(b => b.y + b.h)) + 22;
  return `<g class="pic-group pic-group-${i % 3}${cls(g.id, st)}" data-pic-id="${escape(g.id)}"><rect x="${x}" y="${y}" width="${r - x}" height="${bt - y}" rx="8"/><text class="pic-label pic-small pic-group-label" x="${x + 6}" y="${y + 11}">${escape(g.label)}</text></g>`;
}

// from: where the packet was in the previous step (0-1 along the same link), null for no motion, or 'new' when the
// previous step had no packet on this link: then it fades in at its place, since a glide from the line start crossed
// labels and icons. The glide is an SVG animateTransform (0.45 s), so it runs once per render and
// needs no script; reduced motion passes from = null.
function packetSvg(k, links, nodes, from = null) {
  const l = links.get(k.on), [x1, y1] = centre(nodes.get(l.from)), [x2, y2] = centre(nodes.get(l.to));
  const at = t => [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t], [x, y] = at(k.at), text = k.tag ? `Tag ${k.tag}` : (k.label || 'Frame'), w = 8 + 6 * text.length;
  const glide = from !== null && from !== 'new' && from !== k.at ? (([fx, fy]) => `<animateTransform attributeName="transform" type="translate" from="${(fx - x).toFixed(1)} ${(fy - y).toFixed(1)}" to="0 0" dur="0.45s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".2 .7 .3 1"/>`)(at(from)) : '';
  return `<g class="pic-packet${k.tag ? ' is-tagged' : ''}${from === 'new' ? ' is-new' : ''}">${glide}<rect x="${x - w / 2}" y="${y - 9}" width="${w}" height="18" rx="4"/>${label(x, y + 4, text, ' pic-small pic-packet-text')}</g>`;
}

// The SVG for one state. index: the step (steps) or the chosen part (explore; -1 = none).
// Animation: prev is the state shown before (null on first draw); packets glide from their
// previous place and newly lit parts fade in. still: reduced motion, so nothing moves or fades.
const stateOf = (p, index) => p.kind === 'steps' ? p.steps[Math.min(Math.max(index, 0), p.steps.length - 1)] : (p.parts[index] || {});
// fixed: a state to draw instead of a step or part ({light, hide}; the tap board of a guided question).
export function pictureSvg(p, index = 0, { prev = null, still = false, fixed = null } = {}) {
  const nodes = new Map(p.scene.nodes.map(n => [n.id, n])), links = new Map((p.scene.links || []).map(l => [l.id, l]));
  const s = fixed || stateOf(p, index), before = fixed || prev === null || still || prev === index ? null : stateOf(p, prev);
  const on = new Set(s.light || []), off = new Set(s.hide || []);
  const st = { on, off, fresh: before ? new Set([...on].filter(id => !(before.light || []).includes(id))) : new Set() };
  // The n-th packet on a line glides from the n-th packet that was on that line (two packets can share a line).
  const nth = (list, k) => list.filter(b => b.on === k.on).indexOf(k);
  const from = k => !before ? null : ((before.packets || []).filter(b => b.on === k.on)[nth(s.packets, k)]?.at ?? 'new');
  const dim = on.size ? ' has-light' : '';
  return `<svg class="pic${dim}" viewBox="0 0 ${VIEW.w} ${VIEW.h}" role="img" aria-label="${escape(p.alt)}" focusable="false">`
    + (p.scene.groups || []).map((g, i) => groupSvg(g, nodes, st, i)).join('')
    + (p.scene.links || []).map(l => linkSvg(l, nodes, st)).join('')
    + p.scene.nodes.map(n => nodeSvg(n, st)).join('')
    + (s.packets || []).map(k => packetSvg(k, links, nodes, from(k))).join('') + '</svg>';
}

// The picture body (the term page wraps it in its collapsible section): drawing, controls and the held caption box.
// Controls: steps = rewind and forward icon buttons on the left; both kinds have a Flag-sized
// play/pause button at the right. playing: the loop runs (app.mjs advances it); captions are not announced meanwhile.
export function pictureHtml(p, index = 0, { motion = {}, playing = false } = {}) {
  const steps = p.kind === 'steps', list = steps ? p.steps : p.parts, i = steps ? Math.min(Math.max(index, 0), list.length - 1) : index;
  const now = k => steps ? k === i : k === i + 1;
  const captions = (steps ? list : [{ caption: 'Choose a part of the picture to read about it.' }, ...list])
    .map((s, k) => `<p class="pic-caption${now(k) ? ' is-now' : ''}"${now(k) ? '' : ' aria-hidden="true"'}>${steps ? `<span class="label pic-step">Step ${k + 1} of ${list.length}</span> ` : ''}${escape(s.caption)}</p>`).join('');
  // The label names the action (aria-pressed with "Pause" read as contradictory); data-playing is the state.
  const play = `<button type="button" id="pic-play" class="flag-btn pic-play" data-playing="${playing}" aria-label="${playing ? 'Pause the picture' : 'Play the picture'}" title="${playing ? 'Pause' : 'Play'}">${playing ? ICON.pause : ICON.play}</button>`;
  const controls = steps
    ? `<div class="pic-controls"><button type="button" id="pic-back" class="flag-btn pic-nav" aria-label="Previous step" title="Previous step"${i === 0 ? ' disabled' : ''}>${ICON.rewind}</button><button type="button" id="pic-next" class="flag-btn pic-nav" aria-label="Next step" title="Next step"${i === list.length - 1 ? ' disabled' : ''}>${ICON.forward}</button>${play}</div>`
    : `<div class="pic-controls">${play}<div class="pic-parts" role="group" aria-label="Parts of the picture">${list.map((s, k) => `<button type="button" class="small pic-part" data-pic-part="${k}" aria-pressed="${k === i}">${escape(s.label)}</button>`).join('')}</div></div>`;
  return `<div class="pic-body"><div class="pic-frame">${pictureSvg(p, i, motion)}</div>${controls}<div class="pic-captions"${playing ? ' aria-live="off"' : ' role="status"'}>${captions}</div></div>`;
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
