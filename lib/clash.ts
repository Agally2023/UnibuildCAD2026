// Clash detection: each element becomes a 2D footprint (convex polygon) plus a height range.
// Two elements clash when footprints overlap by more than TOL_XY and height ranges overlap by more than TOL_Z.
import type { El, Lib, Story } from './engineering';
import { beamSec, groupByStory, wallT } from './model';
type Pt = [number, number];
export type Clash = { a: string; b: string; kind: string; severity: 'high' | 'warn'; loc: Pt; title: string; storyId?: string };
type Shape = { id: string; type: string; poly: Pt[]; z0: number; z1: number; ends?: Pt[] };

const TOL_XY = 0.05, TOL_Z = 0.02;
const NAME: Record<string, string> = { wall: 'Wall', column: 'Column', beam: 'Beam', door: 'Door', window: 'Window', duct: 'Duct', pipe: 'Pipe' };
const isMep = (t: string) => t === 'duct' || t === 'pipe';
const isStruct = (t: string) => t === 'column' || t === 'beam';
const isOpen = (t: string) => t === 'door' || t === 'window';

function rect(a: Pt, b: Pt, w: number): Pt[] {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1e-6, nx = (-dy / l) * (w / 2), ny = (dx / l) * (w / 2);
  return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]];
}

export function shapes(els: El[], lib: Lib[], storeyH = 3.6): Shape[] {
  const specOf = (e: El) => lib.find(l => l.id === e.library_item_id)?.specs ?? {};
  const walls = Object.fromEntries(els.filter(e => e.type === 'wall').map(w => [w.id, w]));
  const out: Shape[] = [];
  for (const e of els) {
    const g = e.geometry, s = specOf(e);
    if (e.type === 'wall') out.push({ id: e.id, type: e.type, poly: rect(g.start, g.end, wallT(g)), z0: 0, z1: g.height });
    else if (e.type === 'column') {
      const b = (s.b_mm ?? g.b * 1000) / 1000, h = (s.h_mm ?? g.h * 1000) / 1000, [x, y] = g.at as Pt;
      out.push({ id: e.id, type: e.type, poly: [[x - b / 2, y - h / 2], [x + b / 2, y - h / 2], [x + b / 2, y + h / 2], [x - b / 2, y + h / 2]], z0: 0, z1: g.height });
    } else if (e.type === 'beam') {
      const { b: bw, d: bd } = beamSec(g, s), top = g.top_m ?? storeyH;
      out.push({ id: e.id, type: e.type, poly: rect(g.start, g.end, bw), z0: top - bd, z1: top, ends: [g.start, g.end] });
    } else if (isOpen(e.type)) {
      const w = walls[g.wall_id]; if (!w) continue;
      const [a, b] = [w.geometry.start as Pt, w.geometry.end as Pt], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const ux = (b[0] - a[0]) / l, uy = (b[1] - a[1]) / l, p0: Pt = [a[0] + ux * (g.offset_m - g.width_m / 2), a[1] + uy * (g.offset_m - g.width_m / 2)], p1: Pt = [a[0] + ux * (g.offset_m + g.width_m / 2), a[1] + uy * (g.offset_m + g.width_m / 2)];
      out.push({ id: e.id, type: e.type, poly: rect(p0, p1, 0.26), z0: e.type === 'door' ? 0 : 0.9, z1: 2.1 });
    } else if (e.type === 'duct') {
      const w = (g.w_mm ?? s.w_mm ?? 600) / 1000, h = (g.h_mm ?? s.h_mm ?? 300) / 1000, c = g.elevation_m ?? 3.15;
      out.push({ id: e.id, type: e.type, poly: rect(g.start, g.end, w), z0: c - h / 2, z1: c + h / 2, ends: [g.start, g.end] });
    } else if (e.type === 'pipe') {
      const d = (g.dia_mm ?? s.dia_mm ?? 110) / 1000, c = g.elevation_m ?? 3.2;
      out.push({ id: e.id, type: e.type, poly: rect(g.start, g.end, d), z0: c - d / 2, z1: c + d / 2, ends: [g.start, g.end] });
    }
  }
  return out;
}

// Separating axis test for convex polygons: returns the smallest overlap depth (0 if separated).
function depth(p: Pt[], q: Pt[]): number {
  let min = Infinity;
  for (const poly of [p, q]) for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], nx = b[1] - a[1], ny = a[0] - b[0], n = Math.hypot(nx, ny) || 1;
    const proj = (s: Pt[]) => { const v = s.map(t => (t[0] * nx + t[1] * ny) / n); return [Math.min(...v), Math.max(...v)]; };
    const [a0, a1] = proj(p), [b0, b1] = proj(q), o = Math.min(a1, b1) - Math.max(a0, b0);
    if (o <= 0) return 0;
    min = Math.min(min, o);
  }
  return min;
}
const ccw = (p: Pt[]) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + (a[0] * b[1] - b[0] * a[1]); }, 0) >= 0 ? p : [...p].reverse();
function clip(subject: Pt[], clipper: Pt[]): Pt[] {
  let out = subject; const c = ccw(clipper);
  for (let i = 0; i < c.length && out.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length], inside = (p: Pt) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0;
    const inter = (p: Pt, q: Pt): Pt => {
      const d1x = q[0] - p[0], d1y = q[1] - p[1], d2x = b[0] - a[0], d2y = b[1] - a[1], den = d1x * d2y - d1y * d2x || 1e-9, t = ((a[0] - p[0]) * d2y - (a[1] - p[1]) * d2x) / den;
      return [p[0] + t * d1x, p[1] + t * d1y];
    };
    const input = out; out = [];
    input.forEach((p, k) => {
      const q = input[(k + 1) % input.length];
      if (inside(p)) { out.push(p); if (!inside(q)) out.push(inter(p, q)); } else if (inside(q)) out.push(inter(p, q));
    });
  }
  return out;
}

// Which pairs matter, and how serious they are.
function rule(a: string, b: string): { kind: string; severity: 'high' | 'warn' } | null {
  const pair = (f: (t: string) => boolean, g: (t: string) => boolean) => (f(a) && g(b)) || (f(b) && g(a));
  if (pair(isMep, isStruct)) return { kind: 'MEP vs structure', severity: 'high' };
  if (pair(isMep, isOpen)) return { kind: 'MEP vs opening', severity: 'high' };
  if (pair(isStruct, isOpen)) return { kind: 'Structure vs opening', severity: 'high' };
  if (isMep(a) && isMep(b)) return { kind: 'MEP vs MEP', severity: 'high' };
  if (pair(isMep, t => t === 'wall')) return { kind: 'Needs wall penetration', severity: 'warn' };
  return null;
}
const sharesEnd = (a?: Pt[], b?: Pt[]) => !!a && !!b && a.some(p => b.some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.01));

export function detect(els: El[], lib: Lib[], storeyH = 3.6): Clash[] {
  const S = shapes(els, lib, storeyH), out: Clash[] = [];
  for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
    const a = S[i], b = S[j], r = rule(a.type, b.type);
    if (!r) continue;
    if (a.type === b.type && sharesEnd(a.ends, b.ends)) continue;          // chained segments of one run
    if (Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) <= TOL_Z) continue;     // different heights
    if (depth(a.poly, b.poly) <= TOL_XY) continue;                         // footprints do not overlap enough
    const area = clip(a.poly, b.poly), n = area.length || 1;
    const loc: Pt = area.length ? [area.reduce((s, p) => s + p[0], 0) / n, area.reduce((s, p) => s + p[1], 0) / n] : a.poly[0];
    out.push({ a: a.id, b: b.id, kind: r.kind, severity: r.severity, loc, title: `${NAME[a.type]} / ${NAME[b.type]}: ${r.kind}` });
  }
  return out;
}

// Clash detection storey by storey: elements only clash with others on the same floor.
export function detectAll(els: El[], lib: Lib[], stories: Story[]): Clash[] {
  return groupByStory(els, stories).flatMap(g => detect(g.els, lib, g.story.height_m).map(c => ({ ...c, storyId: g.story.id === '_' ? undefined : g.story.id })));
}
