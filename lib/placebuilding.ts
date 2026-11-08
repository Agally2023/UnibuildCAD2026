// Pure part of loading a building template: decides the storeys and builds the element rows (no database, so it can be tested).
import { planBox } from './model';
import type { El, Lib, Story } from './engineering';
import type { Building } from './buildings';

const uuid = (): string => { const h = '0123456789abcdef'; let s = ''; for (let i = 0; i < 36; i++) s += i === 8 || i === 13 || i === 18 || i === 23 ? '-' : i === 14 ? '4' : i === 19 ? h[8 + Math.floor(Math.random() * 4)] : h[Math.floor(Math.random() * 16)]; return s; };
export const DISC: Record<string, string> = { wall: 'architecture', door: 'architecture', window: 'architecture', roof: 'architecture', stair: 'architecture', column: 'structure', beam: 'structure', grid: 'structure', zone: 'architecture', slab: 'structure' };

const shift = (g: any, dx: number): any => {
  const out: any = { ...g };
  if (g.start) { out.start = [g.start[0] + dx, g.start[1]]; out.end = [g.end[0] + dx, g.end[1]]; }
  if (g.at) out.at = [g.at[0] + dx, g.at[1]];
  if (g.rect) out.rect = [g.rect[0] + dx, g.rect[1], g.rect[2] + dx, g.rect[3]];
  if (g.poly) out.poly = g.poly.map((p: [number, number]) => [p[0] + dx, p[1]]);
  return out;
};

export type Placed = { stories: { id: string | null; name: string; elevation_m: number; height_m: number; isNew: boolean }[]; rows: { id: string; story: number; type: string; geometry: any; lib: string | null }[]; dx: number };

// Pure part: decides storeys and builds the element rows (testable without a database).
export function placeBuilding(b: Building, stories: Story[], els: El[], lib: Lib[], ids: () => string = uuid): Placed {
  const sorted = [...stories].sort((a, c) => a.elevation_m - c.elevation_m);
  const out: Placed['stories'] = [];
  let top = sorted.length ? sorted[sorted.length - 1].elevation_m + sorted[sorted.length - 1].height_m : 0;
  b.storeys.forEach((st, i) => {
    const ex = sorted[i];
    if (ex) out.push({ id: ex.id, name: ex.name, elevation_m: ex.elevation_m, height_m: ex.height_m, isNew: false });
    else { out.push({ id: null, name: st.name, elevation_m: +top.toFixed(2), height_m: st.h, isNew: true }); top += st.h; }
  });
  const box = planBox(els), dx = box.w > 0 ? Math.ceil(box.x0 + box.w + 8) : 0;
  const pick = (kind: string, width?: number): string | null => {
    const l = lib.filter(x => (kind === 'column' || kind === 'beam' ? x.category === 'section' && new RegExp(kind, 'i').test(x.name) : x.category === kind));
    return (width ? l.find(x => Math.abs((x.specs?.w ?? 0) - width) < 0.01) : undefined)?.id ?? l[0]?.id ?? null;
  };
  const wallIds: Record<string, string> = {};
  b.els.forEach(e => { if (e.key) wallIds[e.key] = ids(); });
  const rows: Placed['rows'] = b.els.map(e => {
    const id = e.key ? wallIds[e.key] : ids();
    const g = e.wall ? { ...e.g, wall_id: wallIds[e.wall] } : shift(e.g, dx);
    return { id, story: e.s, type: e.type, geometry: g, lib: e.lib ? pick(e.lib, e.g.width_m) : null };
  });
  return { stories: out, rows, dx };
}

