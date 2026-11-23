// Picture drawing: the scene constants and the SVG of a picture in one step or part state. Colours come
// only from CSS classes. Inputs: a picture description and a state. Outputs: SVG strings.
// Run: imported through pictures.mjs, which re-exports its public names.
// Network: none.
// Writes: none.
// Credentials: none.
import { escape } from './presentation.mjs';

export const VIEW = { w: 400, h: 240 };
// Drawn shapes (icons). The shape kit also adds
// people, documents and objects, so a picture can show who does what to what, not only network gear.
// The picture kit addition adds the hardware and place
// shapes most named by the terms the kit could not draw (building, disk, chip), a cable link, a layer stack (ranked or
// layered bands) and a timeline (an axis with marks). A stack or timeline, like a panel or frame, is not a drawn shape.
export const ICONS = ['pc', 'switch', 'router', 'server', 'person', 'doc', 'lock', 'alert', 'envelope', 'shield', 'cloud', 'clock', 'building', 'disk', 'chip'];
export const NODE_TYPES = [...ICONS, 'frame', 'text', 'panel', 'stack', 'timeline'];
export const LINK_KINDS = ['trunk', 'access', 'plain', 'cable'];
// Boxes (not icons): links meet their edges and no label is cleared under them.
const BOXES = ['frame', 'panel', 'stack', 'timeline'];
export const BAND_H = 22;
// ---- Drawing ----
const SIZE = { pc: [30, 30], switch: [60, 20], router: [30, 30], server: [24, 34], text: [0, 0], person: [26, 30], doc: [22, 28], lock: [22, 28],
  alert: [30, 26], envelope: [30, 20], shield: [24, 30], cloud: [34, 22], clock: [28, 28], building: [32, 32], disk: [28, 30], chip: [30, 30] };
// Label width estimate: capitals are wider (COMSEC overflowed its group box on phones).
export const textW = t => [...(t || '')].reduce((a, c) => a + (/[A-Z0-9]/.test(c) ? 8 : 6.5), 0);
// The bounding box {x, y, w, h} of a node: its icon, text, frame, panel, stack or timeline.
const box = n => n.type === 'text' ? { x: n.x - textW(n.label) / 2, y: n.y - 12, w: textW(n.label), h: 16 }
  : n.type === 'frame' ? { x: n.x, y: n.y, w: n.segments.reduce((a, s) => a + s.w, 0), h: 22 }
  : n.type === 'panel' ? { x: n.x, y: n.y, w: n.w, h: 14 * n.lines.length + 10 }
  : n.type === 'stack' ? { x: n.x, y: n.y, w: n.w, h: BAND_H * n.layers.length }
  : n.type === 'timeline' ? { x: n.x, y: n.y - 6, w: n.w, h: 28 }
  : { x: n.x - SIZE[n.type][0] / 2, y: n.y - SIZE[n.type][1] / 2, w: SIZE[n.type][0], h: SIZE[n.type][1] };
// The centre point [x, y] of a node's box.
const centre = n => { const b = box(n); return [b.x + b.w / 2, b.y + b.h / 2]; };
// st: {on, off, fresh}: lit, hidden, and lit now but not in the previous state (fresh parts fade in).
const cls = (id, st) => `${st.on.has(id) ? ' is-on' : ''}${st.fresh.has(id) ? ' is-new' : ''}${st.off.has(id) ? ' is-off' : ''}`;
// An SVG text element centred at x, y; an empty string when there is no text.
export const label = (x, y, text, extra = '') => text ? `<text class="pic-label${extra}" x="${x}" y="${y}" text-anchor="middle">${escape(text)}</text>` : '';

/**
 * The SVG of a node's drawn shape (pc, switch, router and so on); an empty string for a type with no icon.
 * @param {object} n the node, with its type and position.
 * @returns {string} the SVG markup.
 */
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

/**
 * The SVG group of one node: its shape and label, or a frame, panel, stack or timeline with its parts.
 * @param {object} n the node.
 * @param {{on: Set, off: Set, fresh: Set}} st which ids are lit, hidden and newly lit.
 * @returns {string} the SVG markup.
 */
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

/**
 * The point where a link leaves a node, on the edge of its box and not at its centre: a dimmed box is see-through, so a
 * line drawn to the centre of a frame or panel crossed its label. A link that would cross its own icon's label starts
 * where it leaves the label, so a downward or diagonal line no longer runs through the name under the icon.
 * @param {object} n the node.
 * @param {number[]} from the centre [x, y] of this node.
 * @param {number[]} to the centre [x, y] of the node at the other end.
 * @param {boolean} [clear] true to keep clear of the node's label.
 * @returns {number[]} the point [x, y].
 */
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
// The SVG group of one link: its hit line, its drawn line and, for a cable, a plug at each end.
function linkSvg(l, nodes, st) {
  const a = nodes.get(l.from), z = nodes.get(l.to), ca = centre(a), cz = centre(z);
  let [x1, y1] = edge(a, ca, cz), [x2, y2] = edge(z, cz, ca);
  // When clearing the labels would make the two ends meet or cross (a target inside the label band), use the icon edges.
  if ((x2 - x1) * (cz[0] - ca[0]) + (y2 - y1) * (cz[1] - ca[1]) <= 0) [[x1, y1], [x2, y2]] = [edge(a, ca, cz, false), edge(z, cz, ca, false)];
  // A cable is a thick line with a plug (a short wide bar along the line) at each end.
  const len = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / len * 7, uy = (y2 - y1) / len * 7;
  const plugs = l.kind === 'cable' ? `<line class="pic-plug" x1="${x1}" y1="${y1}" x2="${x1 + ux}" y2="${y1 + uy}"/><line class="pic-plug" x1="${x2}" y1="${y2}" x2="${x2 - ux}" y2="${y2 - uy}"/>` : '';
  return `<g class="pic-link pic-${l.kind}${cls(l.id, st)}" data-pic-id="${escape(l.id)}" data-from="${escape(l.from)}" data-to="${escape(l.to)}"><line class="pic-hit" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>${l.kind === 'trunk' ? `<line class="pic-trunk-core" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>` : ''}${plugs}${l.label ? linkLabel(l, x1, y1, x2, y2, st.carried?.has(l.id)) : ''}</g>`;
}

/**
 * A line's label sits beside the line, never on it: its centre moves along the normal (up, or right on a vertical
 * line) far enough that the label box clears the line; a flat line keeps the old 7 px gap (11 px to the centre).
 * The other side is used when the first leaves the 400 x 240 frame by more.
 * @param {object} l the link, with its label, kind and labelAt position.
 * @param {number} x1 the start x.
 * @param {number} y1 the start y.
 * @param {number} x2 the end x.
 * @param {number} y2 the end y.
 * @param {boolean} [carries] a packet rides this line in some step, so the label also clears the packet (17 px from the
 * line: the packet's 9 px half height, the label's 6 px half height and a 2 px gap).
 * @returns {string} the SVG text of the label.
 */
export function linkLabel(l, x1, y1, x2, y2, carries = false) {
  const t = l.labelAt ?? 0.5, px = x1 + (x2 - x1) * t, py = y1 + (y2 - y1) * t, len = Math.hypot(x2 - x1, y2 - y1) || 1;
  let nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
  if (ny > 0.05 || (Math.abs(ny) <= 0.05 && nx < 0)) [nx, ny] = [-nx, -ny];
  const hw = textW(l.label) * 0.58, hh = 6, base = l.kind === 'trunk' ? 20 : carries ? 17 : l.kind === 'cable' ? 14 : 11, d = l.kind === 'trunk' && Math.abs(ny) > 0.9 ? base : Math.max(base, hw * Math.abs(nx) + hh * Math.abs(ny) + 4 + base - 11);
  // The other side when it leaves the 400 x 240 frame by less; a near-flat trunk keeps its fixed 20 px gap, a steep one uses the angle too.
  const out = s => { const cx = px + s * nx * d, cy = py + s * ny * d;
    return Math.max(0, 4 - (cx - hw)) + Math.max(0, cx + hw - (VIEW.w - 4)) + Math.max(0, 4 - (cy - hh)) + Math.max(0, cy + hh - (VIEW.h - 4)); };
  if (out(-1) < out(1)) [nx, ny] = [-nx, -ny];
  return label(Math.round(px + nx * d), Math.round(py + ny * d + 4), l.label, ' pic-small');
}

// The SVG group of one group box around its member nodes, with the group's label; `i` picks one of three colours.
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
  // The point at fraction t of the way along the link.
  const at = t => [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t], [x, y] = at(k.at), text = k.tag ? `Tag ${k.tag}` : (k.label || 'Frame'), w = 8 + 6 * text.length;
  const glide = from !== null && from !== 'new' && from !== k.at ? (([fx, fy]) => `<animateTransform attributeName="transform" type="translate" from="${(fx - x).toFixed(1)} ${(fy - y).toFixed(1)}" to="0 0" dur="0.45s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".2 .7 .3 1"/>`)(at(from)) : '';
  return `<g class="pic-packet${k.tag ? ' is-tagged' : ''}${from === 'new' ? ' is-new' : ''}">${glide}<rect x="${x - w / 2}" y="${y - 9}" width="${w}" height="18" rx="4"/>${label(x, y + 4, text, ' pic-small pic-packet-text')}</g>`;
}

// True when id is hidden: in the hidden set, or a part ("f.h") of a hidden node ("f").
export const isHidden = (off, id) => off.has(id) || off.has(String(id).split('.')[0]);
// The ids a state hides: its own hide list, and each line with a hidden end, so a line never points at nothing
// (picture standard). A hidden node hides its parts too (a frame segment "f.s1" goes with "f").
export function hiddenIds(p, s) {
  const off = new Set(s.hide || []);
  for (const l of p.scene.links || []) if (isHidden(off, l.from) || isHidden(off, l.to)) off.add(l.id);
  return off;
}

// The SVG for one state. index: the step (steps) or the chosen part (explore; -1 = none).
// Animation: prev is the state shown before (null on first draw); packets glide from their
// previous place and newly lit parts fade in. still: reduced motion, so nothing moves or fades.
const stateOf = (p, index) => p.kind === 'steps' ? p.steps[Math.min(Math.max(index, 0), p.steps.length - 1)] : (p.parts[index] || {});
/**
 * The SVG for one state. Animation: prev is the state shown before (null on first draw); packets glide from their
 * previous place and newly lit parts fade in. still: reduced motion, so nothing moves or fades.
 * @param {object} p the picture.
 * @param {number} [index] the step (steps) or the chosen part (explore; -1 = none).
 * @param {object} [options] prev (the index drawn before), still (reduced motion) and fixed (a state to draw instead of a step or part: {light, hide}; the tap board of a guided question).
 * @returns {string} the SVG markup.
 */
export function pictureSvg(p, index = 0, { prev = null, still = false, fixed = null } = {}) {
  const nodes = new Map(p.scene.nodes.map(n => [n.id, n])), links = new Map((p.scene.links || []).map(l => [l.id, l]));
  const s = fixed || stateOf(p, index), before = fixed || prev === null || still || prev === index ? null : stateOf(p, prev);
  const on = new Set(s.light || []), off = hiddenIds(p, s);
  const st = { on, off, carried: new Set((p.steps || []).flatMap(x => (x.packets || []).map(k => k.on))), fresh: before ? new Set([...on].filter(id => !(before.light || []).includes(id))) : new Set() };
  // The n-th packet on a line glides from the n-th packet that was on that line (two packets can share a line).
  const nth = (list, k) => list.filter(b => b.on === k.on).indexOf(k);
  // Where a packet was in the previous state: 0-1 along the line, 'new' when it was not there, null for no motion.
  const from = k => !before ? null : ((before.packets || []).filter(b => b.on === k.on)[nth(s.packets, k)]?.at ?? 'new');
  const dim = on.size ? ' has-light' : '';
  return `<svg class="pic${dim}" viewBox="0 0 ${VIEW.w} ${VIEW.h}" role="img" aria-label="${escape(p.alt)}" focusable="false">`
    + (p.scene.groups || []).map((g, i) => groupSvg(g, nodes, st, i)).join('')
    + (p.scene.links || []).map(l => linkSvg(l, nodes, st)).join('')
    + p.scene.nodes.map(n => nodeSvg(n, st)).join('')
    + (s.packets || []).filter(k => !off.has(k.on)).map(k => packetSvg(k, links, nodes, from(k))).join('') + '</svg>';
}
