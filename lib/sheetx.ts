// Drawing aids for construction sheets: north arrow, scale bar, tags, dimension chains, section markers, structural marks with
// reinforcement, material hatches, schedules, revision table and cloud, general notes. All plain SVG strings in millimetres.
import type { El, Lib, Story } from './engineering';
import { buildView, modelExtent } from './views';
import { polyArea, wallT } from './model';
import { groupByStory } from './model';
import { designAll } from './design';
import type { Drawing } from './sheet';

type Pt = [number, number];
export type Rev = { rev: string; desc: string; date: string; by: string };
export type ElevMark = { side: 'N' | 'S' | 'E' | 'W'; n: number };
// plans with elevation markers get a wider margin so the markers sit clear of the dimension chains
export const planMargin = (o?: SheetOpts) => (o?.secMarks && o.elevs?.length ? 3.7 : 2.5);
export type SecMark = { axis: 'x' | 'y'; pos: number; flip: boolean; letter: string };
export type SheetOpts = {
  north: boolean; scalebar: boolean; tags: boolean; chains: boolean; secMarks: boolean; struct: boolean; rebar: boolean; hatch: boolean; cloud: boolean;
  notes: string; revs: Rev[]; secs: SecMark[]; elevs: ElevMark[]; rc?: Rc;
};
export const defaultOpts = (): SheetOpts => ({ north: true, scalebar: true, tags: true, chains: true, secMarks: true, struct: true, rebar: false, hatch: true, cloud: false, notes: '', revs: [], secs: [], elevs: [] });
export type Rc = { cols: Record<string, string>; beams: Record<string, string> };

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const INK = '#0a2e1f', GREEN = '#146c43';
const f2 = (n: number) => (Math.round(n * 100) / 100).toString();
const txt = (x: number, y: number, s: string, size = 2.6, anchor = 'middle', extra = '') => `<text x="${f2(x)}" y="${f2(y)}" font-size="${size}" text-anchor="${anchor}" fill="${INK}"${extra}>${esc(s)}</text>`;
const ln = (a: Pt, b: Pt, w = 0.25, extra = '') => `<line x1="${f2(a[0])}" y1="${f2(a[1])}" x2="${f2(b[0])}" y2="${f2(b[1])}" stroke="${INK}" stroke-width="${w}"${extra}/>`;

// ---------- material hatches (SVG patterns, defined once per sheet) ----------
export const HATCH_DEFS = `<defs>
<pattern id="h-conc" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="3" fill="#fff"/><circle cx="0.8" cy="0.8" r="0.22" fill="#0a2e1f"/><circle cx="2.2" cy="2.1" r="0.3" fill="#0a2e1f"/><path d="M0.2 2.6 L0.9 2.0 L1.3 2.7 Z" fill="none" stroke="#0a2e1f" stroke-width="0.12"/></pattern>
<pattern id="h-brick" width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.4" height="2.4" fill="#fff"/><line x1="0" y1="0" x2="0" y2="2.4" stroke="#0a2e1f" stroke-width="0.35"/></pattern>
<pattern id="h-earth" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="#fff"/><path d="M0 4 L4 0 M-1 1 L1 -1 M3 5 L5 3" stroke="#0a2e1f" stroke-width="0.25"/></pattern>
<pattern id="h-wood" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="3" fill="#fff"/><path d="M0 0.8 Q1.5 0 3 0.8 M0 2.3 Q1.5 1.5 3 2.3" fill="none" stroke="#0a2e1f" stroke-width="0.2"/></pattern>
<pattern id="h-ins" width="4" height="2.4" patternUnits="userSpaceOnUse"><rect width="4" height="2.4" fill="#fff"/><path d="M0 1.2 Q1 0 2 1.2 T4 1.2" fill="none" stroke="#0a2e1f" stroke-width="0.25"/></pattern>
</defs>`;
export const HATCH_OF: Record<string, string> = { wall: 'h-brick', column: 'h-conc', beam: 'h-conc', slab: 'h-conc', roof: 'h-conc', stair: 'h-conc' };
export const hatchLegend = (x: number, y: number): string => [['h-conc', 'Concrete'], ['h-brick', 'Masonry'], ['h-earth', 'Earth'], ['h-wood', 'Timber'], ['h-ins', 'Insulation']].map(([id, n], i) => `<rect x="${x}" y="${y + i * 6}" width="10" height="4.5" fill="url(#${id})" stroke="${INK}" stroke-width="0.25"/>${txt(x + 12, y + i * 6 + 3.5, n, 2.6, 'start')}`).join('');

// ---------- sheet level: north arrow, scale bar, notes, revision table, cloud ----------
export function northArrow(x: number, y: number, r = 9): string {
  return `<g><circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="${INK}" stroke-width="0.35"/><path d="M ${x} ${y - r + 1} L ${x + r * 0.42} ${y + r * 0.55} L ${x} ${y + r * 0.2} L ${x - r * 0.42} ${y + r * 0.55} Z" fill="${INK}"/><path d="M ${x} ${y - r + 1} L ${x} ${y + r * 0.2} L ${x - r * 0.42} ${y + r * 0.55} Z" fill="#fff" stroke="${INK}" stroke-width="0.2"/>${txt(x, y - r - 1.6, 'N', 4, 'middle', ' font-weight="bold"')}</g>`;
}
// bar of 4 equal parts, each a round number of metres, at least about 12 mm long on paper
export function scaleBar(x: number, y: number, scale: number): string {
  const mmPerM = 1000 / scale, step = [0.5, 1, 2, 5, 10, 20, 50, 100].find(m => m * mmPerM >= 12) ?? 100, seg = step * mmPerM;
  let s = txt(x, y - 2.4, 'Scale bar', 2.2, 'start');
  for (let i = 0; i < 4; i++) s += `<rect x="${f2(x + i * seg)}" y="${y}" width="${f2(seg)}" height="2" fill="${i % 2 ? '#fff' : INK}" stroke="${INK}" stroke-width="0.25"/>`;
  for (let i = 0; i <= 4; i++) s += txt(x + i * seg, y + 5.4, i === 4 ? `${f2(step * 4)} m` : f2(step * i), 2.2);
  return `<g>${s}</g>`;
}
export function noteBlock(x: number, y: number, w: number, notes: string): string {
  const ls = notes.split('\n').map(l => l.trim()).filter(Boolean); if (!ls.length) return '';
  const h = 7 + ls.length * 4.2;
  return `<g><rect x="${x}" y="${y - h}" width="${w}" height="${h}" fill="#fff" stroke="${INK}" stroke-width="0.3"/>${txt(x + 2, y - h + 4.6, 'GENERAL NOTES', 3, 'start', ' font-weight="bold"')}${ls.map((l, i) => txt(x + 2, y - h + 9.4 + i * 4.2, `${i + 1}. ${l}`, 2.6, 'start')).join('')}</g>`;
}
export function revTable(x: number, y: number, w: number, revs: Rev[]): string {
  if (!revs.length) return '';
  const rh = 4.6, h = rh * (revs.length + 1), cw = [14, w - 14 - 22 - 24, 22, 24];
  let s = `<rect x="${x}" y="${y - h}" width="${w}" height="${h}" fill="#fff" stroke="${INK}" stroke-width="0.4"/>`;
  const rows = [['REV', 'DESCRIPTION', 'DATE', 'BY'], ...revs.map(r => [r.rev, r.desc, r.date, r.by])];
  rows.forEach((r, i) => { const yy = y - h + i * rh; if (i) s += ln([x, yy], [x + w, yy], 0.2); let xx = x; r.forEach((c, j) => { s += txt(xx + 1.5, yy + 3.2, c, 2.5, 'start', i === 0 ? ' font-weight="bold"' : ''); xx += cw[j]; }); });
  let xx = x; for (let j = 0; j < 3; j++) { xx += cw[j]; s += ln([xx, y - h], [xx, y], 0.2); }
  return `<g>${s}</g>`;
}
export function cloudPath(x: number, y: number, w: number, h: number, r = 3.2): string {
  const arcs = (a: Pt, b: Pt) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.round(L / (r * 1.6))); let d = ''; for (let i = 1; i <= n; i++) d += ` A ${r} ${r} 0 0 1 ${f2(a[0] + ((b[0] - a[0]) * i) / n)} ${f2(a[1] + ((b[1] - a[1]) * i) / n)}`; return d; };
  return `<path d="M ${f2(x)} ${f2(y)}${arcs([x, y], [x + w, y])}${arcs([x + w, y], [x + w, y + h])}${arcs([x + w, y + h], [x, y + h])}${arcs([x, y + h], [x, y])} Z" fill="none" stroke="#c62828" stroke-width="0.5"/>`;
}
export function revTag(x: number, y: number, tag: string): string { return `<g><path d="M ${x} ${y - 6} L ${x + 6} ${y + 4} L ${x - 6} ${y + 4} Z" fill="#fff" stroke="#c62828" stroke-width="0.5"/>${txt(x, y + 2.6, tag, 3.4, 'middle', ' font-weight="bold" fill="#c62828"')}</g>`; }

// everything that sits on the sheet itself, not inside the drawing
export function sheetExtras(W: number, H: number, scale: number, o: SheetOpts, hatchOn: boolean, drawBox?: { x: number; y: number; w: number; h: number }, nts = false): string {
  const tw = 150, tx = W - 10 - tw, ty = H - 10 - 30; let s = '';
  if (o.north && !nts) s += northArrow(W - 28, 30, 9);
  if (o.scalebar && !nts) s += scaleBar(16, H - 20, scale);
  const noteW = Math.min(150, tx - 16 - 4); if (o.notes.trim()) s += noteBlock(14, H - 28, Math.max(60, noteW - 70), o.notes);
  if (o.revs.length) s += revTable(tx, ty - 2, tw, o.revs);
  if (hatchOn && !nts) s += hatchLegend(W - 10 - 34, 14 + 30);
  if (o.cloud && o.revs.length && drawBox) { const p = 3; s += cloudPath(drawBox.x - p, drawBox.y - p, drawBox.w + 2 * p, drawBox.h + 2 * p) + revTag(drawBox.x + drawBox.w + p + 3, drawBox.y - p, o.revs[o.revs.length - 1].rev); }
  return s;
}

// ---------- plan aids, in the plan's own coordinates (see planDrawing) ----------
const tick = (x: number, y: number) => `<line x1="${f2(x - 1.3)}" y1="${f2(y + 1.3)}" x2="${f2(x + 1.3)}" y2="${f2(y - 1.3)}" stroke="${INK}" stroke-width="0.4"/>`;
const uniq = (v: number[], tol = 0.02) => { const a = [...v].sort((p, q) => p - q), r: number[] = []; for (const x of a) if (!r.length || x - r[r.length - 1] > tol) r.push(x); return r; };
function chain(vals: number[], horizontal: boolean, line: number, ref: number, map: (v: number) => number, other: (v: number) => number): string {
  if (vals.length < 2) return '';
  let s = '';
  const P = (v: number): Pt => (horizontal ? [map(v), line] : [line, map(v)]);
  const dirSign = Math.sign(line - ref) || 1;
  vals.forEach(v => { const a: Pt = horizontal ? [map(v), ref + dirSign * 1.2] : [ref + dirSign * 1.2, map(v)]; s += ln(a, [P(v)[0] + (horizontal ? 0 : dirSign * 1.6), P(v)[1] + (horizontal ? dirSign * 1.6 : 0)], 0.18); s += tick(P(v)[0], P(v)[1]); });
  s += ln([P(vals[0])[0] - (horizontal ? 1.6 : 0), P(vals[0])[1] - (horizontal ? 0 : 1.6)], [P(vals[vals.length - 1])[0] + (horizontal ? 1.6 : 0), P(vals[vals.length - 1])[1] + (horizontal ? 0 : 1.6)], 0.3);
  for (let i = 0; i + 1 < vals.length; i++) {
    const mm = Math.round((vals[i + 1] - vals[i]) * 1000), a = map(vals[i]), b = map(vals[i + 1]); if (Math.abs(b - a) < 5) continue;
    s += horizontal ? txt((a + b) / 2, line - 1, String(mm), 2.4) : `<text x="${f2(line - 1)}" y="${f2((a + b) / 2)}" font-size="2.4" text-anchor="middle" fill="${INK}" transform="rotate(-90 ${f2(line - 1)} ${f2((a + b) / 2)})">${mm}</text>`;
  }
  void other; return s;
}

export function doorMarks(els: El[]): Map<string, string> {
  const m = new Map<string, string>(); let d = 0, w = 0;
  for (const e of els) if (e.type === 'door') m.set(e.id, `D${String(++d).padStart(2, '0')}`); else if (e.type === 'window') m.set(e.id, `W${String(++w).padStart(2, '0')}`);
  return m;
}
export function structMarks(els: El[]): Map<string, string> {
  const m = new Map<string, string>(); let c = 0, b = 0;
  for (const e of els) if (e.type === 'column') m.set(e.id, `C${++c}`); else if (e.type === 'beam') m.set(e.id, `B${++b}`);
  return m;
}
const specOf = (e: El, lib: Lib[]) => lib.find(l => l.id === e.library_item_id)?.specs ?? {};
export function sizeOfEl(e: El, lib: Lib[]): string {
  const sp = specOf(e, lib), g = e.geometry;
  if (e.type === 'column') { const b = sp.b_mm ?? (g.b ? g.b * 1000 : 300), h = sp.h_mm ?? (g.h ? g.h * 1000 : 300); return `${Math.round(b)}x${Math.round(h)}`; }
  const b = sp.b_mm ?? (g.b ? g.b * 1000 : 300), h = sp.h_mm ?? (g.h ? g.h * 1000 : 500); return `${Math.round(b)}x${Math.round(h)}`;
}

export function planExtras(els: El[], lib: Lib[], stories: Story[], storyId: string, scale: number, o: SheetOpts): string {
  const list = [...stories].sort((a, b) => a.elevation_m - b.elevation_m), first = list[0]?.id, ex = modelExtent(els), m = planMargin(o), k = 1000 / scale;
  const X = (x: number) => (x - ex.x0 + m) * k, Y = (y: number) => (y - ex.y0 + m) * k;
  const here = els.filter(e => (e.type === 'grid' ? true : (e.story_id ?? first) === storyId)), of = (t: string) => here.filter(e => e.type === t);
  let s = '';
  const walls = of('wall');
  if (o.chains && walls.length) {
    const xs = uniq([...walls.flatMap(w => [w.geometry.start[0], w.geometry.end[0]]), ...of('column').map(c => c.geometry.at[0]), ...of('grid').filter(g => Math.abs(g.geometry.end[1] - g.geometry.start[1]) > Math.abs(g.geometry.end[0] - g.geometry.start[0])).map(g => g.geometry.start[0])]);
    const ys = uniq([...walls.flatMap(w => [w.geometry.start[1], w.geometry.end[1]]), ...of('column').map(c => c.geometry.at[1]), ...of('grid').filter(g => Math.abs(g.geometry.end[0] - g.geometry.start[0]) > Math.abs(g.geometry.end[1] - g.geometry.start[1])).map(g => g.geometry.start[1])]);
    const bot = Y(ex.y1) + 1.1 * k, left = X(ex.x0) - 1.1 * k;
    s += chain(xs, true, bot, Y(ex.y1), X, Y) + chain(ys, false, left, X(ex.x0), Y, X);
    if (xs.length > 2) s += chain([xs[0], xs[xs.length - 1]], true, bot + 0.9 * k, Y(ex.y1), X, Y);
    if (ys.length > 2) s += chain([ys[0], ys[ys.length - 1]], false, left - 0.9 * k, X(ex.x0), Y, X);
  }
  if (o.tags) {
    const marks = doorMarks(els), wmap = Object.fromEntries(els.filter(e => e.type === 'wall').map(w => [w.id, w]));
    for (const e of [...of('door'), ...of('window')]) {
      const w = wmap[e.geometry.wall_id]; if (!w) continue; const g = w.geometry, L = Math.hypot(g.end[0] - g.start[0], g.end[1] - g.start[1]) || 1, ux = (g.end[0] - g.start[0]) / L, uy = (g.end[1] - g.start[1]) / L, off = e.geometry.offset_m;
      const mx = X(g.start[0] + ux * off), my = Y(g.start[1] + uy * off), d = (wallT(g) * k) / 2 + 4.6, cx = mx - uy * d, cy = my + ux * d;
      s += `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="2.9" fill="#fff" stroke="${INK}" stroke-width="0.25"/>${txt(cx, cy + 0.9, marks.get(e.id) ?? '', 2.2)}`;
    }
  }
  if (o.struct) {
    const marks = structMarks(els);
    for (const e of of('column')) { const [x, y] = e.geometry.at, t = marks.get(e.id) ?? 'C', rc = o.rebar ? o.rc?.cols[e.id] : ''; s += txt(X(x) + 4, Y(y) - 4, `${t} ${sizeOfEl(e, lib)}`, 2.2, 'start') + (rc ? txt(X(x) + 4, Y(y) - 1.4, rc, 2, 'start', ' fill="#8a3b00"') : ''); }
    for (const e of of('beam')) { const a = e.geometry.start as Pt, b = e.geometry.end as Pt, rc = o.rebar ? o.rc?.beams[e.id] : ''; const mx = X((a[0] + b[0]) / 2), my = Y((a[1] + b[1]) / 2); s += txt(mx, my - 1.6, `${marks.get(e.id) ?? 'B'} ${sizeOfEl(e, lib)}`, 2.2) + (rc ? txt(mx, my + 1.1, rc, 2, 'middle', ' fill="#8a3b00"') : ''); }
  }
  if (o.secMarks) for (const sc of o.secs) {
    const v = buildView(els, lib, stories, { kind: 'section', axis: sc.axis, pos: sc.pos, flip: sc.flip }), d = v.dir;
    const a: Pt = sc.axis === 'y' ? [X(ex.x0) - 4, Y(sc.pos)] : [X(sc.pos), Y(ex.y0) - 4], b: Pt = sc.axis === 'y' ? [X(ex.x1) + 4, Y(sc.pos)] : [X(sc.pos), Y(ex.y1) + 4];
    s += ln(a, b, 0.4, ' stroke-dasharray="8 1.5 1.5 1.5"');
    for (const p of [a, b]) { s += `<circle cx="${f2(p[0])}" cy="${f2(p[1])}" r="3" fill="#fff" stroke="${INK}" stroke-width="0.3"/>${txt(p[0], p[1] + 1.2, sc.letter, 3.4, 'middle', ' font-weight="bold"')}`; const dl = Math.hypot(d[0], d[1]) || 1, ux = d[0] / dl, uy = d[1] / dl, q: Pt = [p[0] + ux * 11, p[1] + uy * 11]; s += ln([p[0] + ux * 3, p[1] + uy * 3], q, 0.4) + `<path d="M ${f2(q[0])} ${f2(q[1])} l ${f2(-ux * 3 - uy * 1.2)} ${f2(-uy * 3 + ux * 1.2)} l ${f2(uy * 2.4)} ${f2(-ux * 2.4)} Z" fill="${INK}"/>`; }
  }
  if (o.secMarks) for (const e of o.elevs ?? []) {
    // the side named is the one you stand on, looking at the building: south is the bottom of the plan, east the right
    const mx = (ex.x0 + ex.x1) / 2, my = (ex.y0 + ex.y1) / 2, d = 3.1;
    const at: Pt = e.side === 'S' ? [X(mx), Y(ex.y1 + d)] : e.side === 'N' ? [X(mx), Y(ex.y0 - d)] : e.side === 'E' ? [X(ex.x1 + d), Y(my)] : [X(ex.x0 - d), Y(my)];
    const ux = e.side === 'E' ? -1 : e.side === 'W' ? 1 : 0, uy = e.side === 'S' ? -1 : e.side === 'N' ? 1 : 0;   // points at the building
    const base: Pt = [at[0] + ux * 3.6, at[1] + uy * 3.6], tip: Pt = [at[0] + ux * 8, at[1] + uy * 8];
    s += `<circle cx="${f2(at[0])}" cy="${f2(at[1])}" r="3.6" fill="#fff" stroke="${INK}" stroke-width="0.35"/>${txt(at[0], at[1] + 1.3, String(e.n), 3.6, 'middle', ' font-weight="bold"')}`;
    s += `<path d="M ${f2(tip[0])} ${f2(tip[1])} L ${f2(base[0] - uy * 2.6)} ${f2(base[1] + ux * 2.6)} L ${f2(base[0] + uy * 2.6)} ${f2(base[1] - ux * 2.6)} Z" fill="${INK}"/>`;
  }
  return s;
}

// reinforcement text for every column and beam, from the preliminary design (C30/37, EC2, office loading)
export function rebarLabels(els: El[], lib: Lib[], stories: Story[]): Rc {
  const out: Rc = { cols: {}, beams: {} };
  try {
    const r = designAll(groupByStory(els, stories), lib, { fck: 30, fyk: 500, code: 'EC2' } as any, { imposed: 3, defaultTrib: 3 });
    for (const c of r.cols) out.cols[c.id] = `${c.bars}, links ${c.links}`;
    for (const b of r.beams) out.beams[b.id] = `${b.bars} bot, ${b.topBars} top, ${b.links}`;
  } catch { /* no design possible */ }
  return out;
}

// ---------- schedules and the drawing register as drawings ----------
export type ScheduleKind = 'door' | 'window' | 'room' | 'struct' | 'register';
export const SCHEDULES: { key: ScheduleKind; label: string }[] = [{ key: 'door', label: 'Door schedule' }, { key: 'window', label: 'Window schedule' }, { key: 'room', label: 'Room schedule' }, { key: 'struct', label: 'Structural schedule' }, { key: 'register', label: 'Drawing register' }];
export function tableDrawing(title: string, head: string[], rows: string[][], widths?: number[]): Drawing {
  const cw = widths ?? head.map((h, i) => Math.max(14, ...[h, ...rows.map(r => r[i] ?? '')].map(t => t.length * 2.6 + 6))), W = cw.reduce((a, b) => a + b, 0), rh = 6.4;
  let inner = `<rect x="0" y="0" width="${W}" height="${rh}" fill="#e8f1ec" stroke="${INK}" stroke-width="0.35"/>`, x = 0;
  head.forEach((h, i) => { inner += txt(x + 2, 4.5, h, 3, 'start', ' font-weight="bold"'); x += cw[i]; });
  rows.forEach((r, ri) => { x = 0; r.forEach((c, i) => { inner += `<rect x="${x}" y="${(ri + 1) * rh}" width="${cw[i]}" height="${rh}" fill="none" stroke="${INK}" stroke-width="0.2"/>` + txt(x + 2, (ri + 1) * rh + 4.5, c, 3, 'start'); x += cw[i]; }); });
  if (!rows.length) inner += txt(2, rh + 4.5, 'Nothing to list yet', 3, 'start');
  return { name: title, inner, w: W, h: rh * (rows.length + 1 || 2), nts: true };
}
export function scheduleDrawing(kind: ScheduleKind, els: El[], lib: Lib[], stories: Story[], o: SheetOpts, register: { no: string; title: string }[] = []): Drawing {
  const sname = (e: El) => stories.find(s => s.id === (e.story_id ?? [...stories].sort((a, b) => a.elevation_m - b.elevation_m)[0]?.id))?.name ?? '';
  const mm = (v: any) => (typeof v === 'number' ? String(Math.round(v * 1000)) : '');
  if (kind === 'door' || kind === 'window') {
    const marks = doorMarks(els), rows = els.filter(e => e.type === kind).map(e => [marks.get(e.id) ?? '', sname(e), mm(e.geometry.width_m), mm(e.geometry.height_m), kind === 'window' ? mm(e.geometry.sill_m) : '', lib.find(l => l.id === e.library_item_id)?.name ?? '']);
    return tableDrawing(kind === 'door' ? 'DOOR SCHEDULE' : 'WINDOW SCHEDULE', ['MARK', 'LEVEL', 'WIDTH mm', 'HEIGHT mm', kind === 'window' ? 'SILL mm' : '', 'TYPE'], rows);
  }
  if (kind === 'room') {
    const rows = els.filter(e => e.type === 'zone' && e.geometry.poly).map((e, i) => [String(i + 1), e.geometry.name ?? 'Room', sname(e), (Math.round(polyArea(e.geometry.poly) * 10) / 10).toFixed(1)]);
    const tot = els.filter(e => e.type === 'zone' && e.geometry.poly).reduce((a, e) => a + polyArea(e.geometry.poly), 0);
    if (rows.length) rows.push(['', 'TOTAL', '', (Math.round(tot * 10) / 10).toFixed(1)]);
    return tableDrawing('ROOM SCHEDULE', ['NO.', 'NAME', 'LEVEL', 'AREA m²'], rows, [16, 70, 40, 30]);
  }
  if (kind === 'struct') {
    const marks = structMarks(els), rows = els.filter(e => e.type === 'column' || e.type === 'beam').map(e => [marks.get(e.id) ?? '', e.type === 'column' ? 'Column' : 'Beam', sname(e), sizeOfEl(e, lib), (e.type === 'column' ? o.rc?.cols[e.id] : o.rc?.beams[e.id]) ?? '']);
    return tableDrawing('STRUCTURAL SCHEDULE', ['MARK', 'TYPE', 'LEVEL', 'SIZE mm', 'REINFORCEMENT (preliminary)'], rows);
  }
  return tableDrawing('DRAWING REGISTER', ['SHEET', 'TITLE', 'REV'], register.map(r => [r.no, r.title, o.revs.length ? o.revs[o.revs.length - 1].rev : '-']), [26, 110, 20]);
}
