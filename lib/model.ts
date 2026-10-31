// Shared model helpers: storeys, element sizes, beam chains and tributary widths.
import type { El, Story } from './engineering';
export type Pt = [number, number];
export const DEFAULT_H = 3.6;
export const wallT = (g: any): number => g.thickness ?? 0.2;
export const beamSec = (g: any, s: any = {}) => ({ b: (g.b_mm ?? s.b_mm ?? 250) / 1000, d: (g.h_mm ?? s.h_mm ?? 500) / 1000 });
export const isBox = (t: string) => t === 'slab' || t === 'roof' || t === 'stair' || t === 'foundation';

export type Group = { story: Story; els: El[] };
export function groupByStory(els: El[], stories: Story[]): Group[] {
  const list: Story[] = stories.length ? [...stories].sort((a, b) => a.elevation_m - b.elevation_m) : [{ id: '_', name: 'Ground floor', elevation_m: 0, height_m: DEFAULT_H }];
  const first = list[0].id;
  return list.map(s => ({ story: s, els: els.filter(e => (e.story_id ?? first) === s.id || (first === '_' && true)) }));
}

export function planBox(els: El[]) {
  const xs: number[] = [], ys: number[] = [];
  for (const e of els) {
    const g = e.geometry;
    if (g.start) { xs.push(g.start[0], g.end[0]); ys.push(g.start[1], g.end[1]); }
    if (g.at) { xs.push(g.at[0]); ys.push(g.at[1]); }
    if (g.rect) { xs.push(g.rect[0], g.rect[2]); ys.push(g.rect[1], g.rect[3]); }
  }
  if (!xs.length) return { w: 0, d: 0, area: 0 };
  const w = Math.max(...xs) - Math.min(...xs), d = Math.max(...ys) - Math.min(...ys);
  return { w, d, area: w * d };
}

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export type ChainItem = { el: El; a: Pt; b: Pt; L: number };
// Beams that meet end to end in a straight line form one continuous beam.
export function beamChains(beams: El[], tol = 0.15): ChainItem[][] {
  const items = beams.map(e => ({ el: e, a: e.geometry.start as Pt, b: e.geometry.end as Pt })).filter(i => dist(i.a, i.b) > 0.05);
  const used = new Set<string>(), out: ChainItem[][] = [];
  const dir = (a: Pt, b: Pt) => { const l = dist(a, b) || 1e-9; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  for (const it of items) {
    if (used.has(it.el.id)) continue; used.add(it.el.id);
    const chain = [{ ...it }];
    for (;;) {
      const last = chain[chain.length - 1], d = dir(last.a, last.b); let found = false;
      for (const o of items) {
        if (used.has(o.el.id)) continue;
        let a = o.a, b = o.b;
        if (dist(last.b, o.a) < tol) { /* already oriented */ } else if (dist(last.b, o.b) < tol) { [a, b] = [b, a]; } else continue;
        const dd = dir(a, b); if (d[0] * dd[0] + d[1] * dd[1] < 0.98) continue;
        used.add(o.el.id); chain.push({ el: o.el, a, b }); found = true; break;
      }
      if (!found) break;
    }
    for (;;) {
      const first = chain[0], d = dir(first.a, first.b); let found = false;
      for (const o of items) {
        if (used.has(o.el.id)) continue;
        let a = o.a, b = o.b;
        if (dist(first.a, o.b) < tol) { /* o ends where first starts */ } else if (dist(first.a, o.a) < tol) { [a, b] = [b, a]; } else continue;
        const dd = dir(a, b); if (d[0] * dd[0] + d[1] * dd[1] < 0.98) continue;
        used.add(o.el.id); chain.unshift({ el: o.el, a, b }); found = true; break;
      }
      if (!found) break;
    }
    out.push(chain.map(c => ({ ...c, L: dist(c.a, c.b) })));
  }
  return out;
}

// Tributary width of each beam from the layout: half the distance to the nearest parallel beam on each side
// (one-way slab assumption). Beams with no parallel neighbour get the fallback width.
export function tribWidths(beams: El[], fallback: number, maxSide = 8): Record<string, number> {
  const out: Record<string, number> = {};
  const b = beams.map(e => { const a = e.geometry.start as Pt, z = e.geometry.end as Pt, L = dist(a, z) || 1e-9; return { id: e.id, a, z, L, u: [(z[0] - a[0]) / L, (z[1] - a[1]) / L], mid: [(a[0] + z[0]) / 2, (a[1] + z[1]) / 2] }; });
  for (const p of b) {
    const n = [-p.u[1], p.u[0]], p0 = p.a[0] * p.u[0] + p.a[1] * p.u[1], p1 = p0 + p.L; let left = Infinity, right = Infinity;
    for (const q of b) {
      if (q === p || Math.abs(p.u[0] * q.u[0] + p.u[1] * q.u[1]) < 0.995) continue;
      const q0 = q.a[0] * p.u[0] + q.a[1] * p.u[1], q1 = q.z[0] * p.u[0] + q.z[1] * p.u[1];
      const overlap = Math.min(p1, Math.max(q0, q1)) - Math.max(p0, Math.min(q0, q1));
      if (overlap < 0.3 * Math.min(p.L, q.L)) continue;
      const d = (q.mid[0] - p.mid[0]) * n[0] + (q.mid[1] - p.mid[1]) * n[1];
      if (d > 0.3 && d < maxSide) left = Math.min(left, d); else if (d < -0.3 && -d < maxSide) right = Math.min(right, -d);
    }
    const w = (isFinite(left) ? left / 2 : 0) + (isFinite(right) ? right / 2 : 0);
    out[p.id] = w > 0 ? w : fallback;
  }
  return out;
}
