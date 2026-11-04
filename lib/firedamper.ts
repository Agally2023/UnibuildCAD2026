// Fire dampers and fire-stopped sleeves: where a duct or pipe passes through a wall that has a fire rating.
// A wall's rating (minutes, 0 = none) is stored as geometry.fire. Ducts get a fire damper rated for the wall;
// pipes get a fire-stopped sleeve. Pure functions, tested.
import type { El, Lib, Story } from './engineering';

type Pt = [number, number];
export type Crossing = { serviceId: string; wallId: string; kind: 'damper' | 'sleeve'; at: Pt; rating: number; size: string; storyId: string | null; wallT: number };

export const RATINGS = [0, 30, 60, 90, 120];
export const fireOf = (g: any): number => (RATINGS.includes(g?.fire) ? g.fire : 0);

// where two segments cross, or null
export function segCross(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const r: Pt = [b[0] - a[0], b[1] - a[1]], s: Pt = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-12) return null;                                  // parallel: running along a wall is not a crossing
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? [a[0] + r[0] * t, a[1] + r[1] * t] : null;
}

export function findFireCrossings(els: El[], lib: Lib[], stories: Story[]): Crossing[] {
  const list = [...stories].sort((a, b) => a.elevation_m - b.elevation_m), first = list[0]?.id ?? null, sid = (e: El) => e.story_id ?? first;
  const specOf = (e: El) => lib.find(l => l.id === e.library_item_id)?.specs ?? {};
  const walls = els.filter(e => e.type === 'wall' && fireOf(e.geometry) > 0), out: Crossing[] = [];
  for (const sv of els.filter(e => e.type === 'duct' || e.type === 'pipe')) {
    const g = sv.geometry, sp = specOf(sv), size = sv.type === 'duct' ? `${g.w_mm ?? sp.w_mm ?? 600} x ${g.h_mm ?? sp.h_mm ?? 300} mm` : `dia ${g.dia_mm ?? sp.dia_mm ?? 110} mm`;
    for (const w of walls) {
      if (sid(w) !== sid(sv)) continue;
      const at = segCross(g.start, g.end, w.geometry.start, w.geometry.end); if (!at) continue;
      const top = (g.elevation_m ?? (sv.type === 'duct' ? 3 : 3.2)) + (sv.type === 'duct' ? (g.h_mm ?? sp.h_mm ?? 300) / 2000 : (g.dia_mm ?? sp.dia_mm ?? 110) / 2000);
      if (top > (w.geometry.height ?? 3.6) + 1e-6) continue;               // passes above the wall
      out.push({ serviceId: sv.id, wallId: w.id, kind: sv.type === 'duct' ? 'damper' : 'sleeve', at: [Math.round(at[0] * 100) / 100, Math.round(at[1] * 100) / 100], rating: fireOf(w.geometry), size, storyId: sid(sv) ?? null, wallT: w.geometry.thickness ?? 0.2 });
    }
  }
  return out;
}
