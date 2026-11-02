// Schedules: tables of the model's doors and windows, columns, beams, slabs, walls, rooms and services, with a
// quantities summary. Marks (D01, C01, ...) are numbered from the lowest storey up, then by position. Volumes and
// areas are net of the openings in walls. Plain data, so the same tables feed the screen and the CSV download.
import type { El, Lib, Story } from './engineering';
import { beamSec, footprint, groupByStory, polyArea, wallT } from './model';

export type Cell = string | number;
export type Table = { key: string; title: string; cols: string[]; rows: Cell[][]; total?: Cell[]; note?: string };

const r2 = (x: number) => Math.round(x * 100) / 100, r3 = (x: number) => Math.round(x * 1000) / 1000;
const len = (g: any) => Math.hypot(g.end[0] - g.start[0], g.end[1] - g.start[1]);
const mark = (p: string, n: number) => p + String(n).padStart(2, '0');
const OPEN = { door: { h: 2.1, sill: 0 }, window: { h: 1.2, sill: 0.9 } };

export function schedules(els: El[], lib: Lib[], stories: Story[]): Table[] {
  const groups = groupByStory(els, stories), specOf = (e: El) => lib.find(l => l.id === e.library_item_id)?.specs ?? {}, nameOf = (e: El, d: string) => lib.find(l => l.id === e.library_item_id)?.name ?? d;
  const byPos = (a: El, b: El) => (a.geometry.at ?? a.geometry.start ?? [0, 0])[1] - (b.geometry.at ?? b.geometry.start ?? [0, 0])[1] || (a.geometry.at ?? a.geometry.start ?? [0, 0])[0] - (b.geometry.at ?? b.geometry.start ?? [0, 0])[0];
  const each = (type: string | string[], f: (e: El, g: { story: Story }) => void) => { const ts = Array.isArray(type) ? type : [type]; for (const g of groups) g.els.filter(e => ts.includes(e.type)).sort(byPos).forEach(e => f(e, g)); };
  const wallById = Object.fromEntries(els.filter(e => e.type === 'wall').map(w => [w.id, w]));
  const out: Table[] = [];

  // walls, with the doors and windows that sit in them
  const openArea: Record<string, number> = {};
  for (const e of els) if ((e.type === 'door' || e.type === 'window') && wallById[e.geometry.wall_id]) openArea[e.geometry.wall_id] = (openArea[e.geometry.wall_id] ?? 0) + e.geometry.width_m * OPEN[e.type].h;
  { let n = 0, L = 0, A = 0, V = 0; const rows: Cell[][] = [];
    each('wall', (e, g) => { const G = e.geometry, l = len(G), h = G.height ?? g.story.height_m, th = wallT(G), op = openArea[e.id] ?? 0, net = Math.max(0, l * h - op); n++; L += l; A += net; V += net * th; rows.push([mark('W', n), g.story.name, r2(l), Math.round(th * 1000), r2(h), r2(op), r2(net), r2(net * th)]); });
    out.push({ key: 'walls', title: 'Walls', cols: ['Mark', 'Storey', 'Length (m)', 'Thickness (mm)', 'Height (m)', 'Openings (m²)', 'Net area (m²)', 'Volume (m³)'], rows, total: rows.length ? ['Total', '', r2(L), '', '', '', r2(A), r2(V)] : undefined }); }

  // doors and windows
  { let d = 0, w = 0, A = 0; const rows: Cell[][] = [], types: Record<string, { n: number; w: number; h: number; a: number }> = {};
    each(['door', 'window'], (e, g) => {
      const G = e.geometry, isD = e.type === 'door', m = isD ? mark('D', ++d) : mark('W', ++w), h = OPEN[e.type as 'door'].h, name = nameOf(e, isD ? 'Door' : 'Window'), a = G.width_m * h;
      A += a; rows.push([m.replace(/^W/, 'Wn'), isD ? 'Door' : 'Window', name, g.story.name, r2(G.width_m), r2(h), OPEN[e.type as 'door'].sill, r2(G.offset_m)]);
      const k = `${isD ? 'Door' : 'Window'} · ${name} · ${r2(G.width_m)} × ${r2(h)}`; (types[k] ??= { n: 0, w: G.width_m, h, a: 0 }).n++; types[k].a += a;
    });
    // doors first, then windows, whatever the storey
    rows.sort((x, y) => (x[1] === y[1] ? 0 : x[1] === 'Door' ? -1 : 1));
    out.push({ key: 'openings', title: 'Doors and windows', cols: ['Mark', 'Kind', 'Type', 'Storey', 'Width (m)', 'Height (m)', 'Sill (m)', 'Along wall (m)'], rows, total: rows.length ? ['Total', `${d} doors, ${w} windows`, '', '', '', '', '', ''] : undefined, note: 'Heights are 2.1 m for doors and 1.2 m (sill 0.9 m) for windows.' });
    out.push({ key: 'opentypes', title: 'Door and window types', cols: ['Type', 'Count', 'Width (m)', 'Height (m)', 'Total area (m²)'], rows: Object.entries(types).map(([k, v]) => [k, v.n, r2(v.w), r2(v.h), r2(v.a)]), total: rows.length ? ['Total', d + w, '', '', r2(A)] : undefined }); }

  // columns
  { let n = 0, V = 0; const rows: Cell[][] = [];
    each('column', (e, g) => { const G = e.geometry, sp = specOf(e), b = (sp.b_mm ?? (G.b ?? 0.3) * 1000) / 1000, h = (sp.h_mm ?? (G.h ?? 0.3) * 1000) / 1000, H = G.height ?? g.story.height_m, v = b * h * H; n++; V += v; rows.push([mark('C', n), g.story.name, `${Math.round(b * 1000)} × ${Math.round(h * 1000)}`, r2(G.at[0]), r2(G.at[1]), r2(H), r3(v)]); });
    out.push({ key: 'columns', title: 'Columns', cols: ['Mark', 'Storey', 'Section (mm)', 'X (m)', 'Y (m)', 'Height (m)', 'Volume (m³)'], rows, total: rows.length ? ['Total', `${n} columns`, '', '', '', '', r3(V)] : undefined }); }

  // beams
  { let n = 0, L = 0, V = 0; const rows: Cell[][] = [];
    each('beam', (e, g) => { const G = e.geometry, s = beamSec(G, specOf(e)), l = len(G), v = s.b * s.d * l; n++; L += l; V += v; rows.push([mark('B', n), g.story.name, `${Math.round(s.b * 1000)} × ${Math.round(s.d * 1000)}`, r2(l), r2(G.top_m ?? g.story.height_m), r3(v)]); });
    out.push({ key: 'beams', title: 'Beams', cols: ['Mark', 'Storey', 'Section (mm)', 'Length (m)', 'Top level above floor (m)', 'Volume (m³)'], rows, total: rows.length ? ['Total', `${n} beams`, '', r2(L), '', r3(V)] : undefined }); }

  // slabs and roofs
  { let s = 0, r = 0, A = 0, V = 0; const rows: Cell[][] = [];
    each(['slab', 'roof'], (e, g) => { const G = e.geometry, fp = footprint(G), a = fp ? polyArea(fp) : 0, t = (G.z1 ?? 0) - (G.z0 ?? 0), isS = e.type === 'slab'; A += a; V += a * t; rows.push([isS ? mark('S', ++s) : mark('R', ++r), isS ? 'Slab' : 'Roof', g.story.name, G.poly ? 'Polygon' : 'Rectangle', r2(a), Math.round(t * 1000), r3(a * t)]); });
    out.push({ key: 'slabs', title: 'Slabs and roofs', cols: ['Mark', 'Kind', 'Storey', 'Shape', 'Area (m²)', 'Thickness (mm)', 'Volume (m³)'], rows, total: rows.length ? ['Total', '', '', '', r2(A), '', r3(V)] : undefined }); }

  // rooms
  { let A = 0; const rows: Cell[][] = [];
    each('zone', (e, g) => { const q = e.geometry.poly as [number, number][] | undefined, a = q ? polyArea(q) : 0, per = q ? q.reduce((s, p, i) => s + Math.hypot(q[(i + 1) % q.length][0] - p[0], q[(i + 1) % q.length][1] - p[1]), 0) : 0; A += a; rows.push([e.geometry.name ?? 'Room', g.story.name, r2(a), r2(per)]); });
    out.push({ key: 'rooms', title: 'Rooms', cols: ['Name', 'Storey', 'Area (m²)', 'Perimeter (m)'], rows, total: rows.length ? ['Total', '', r2(A), ''] : undefined }); }

  // ducts and pipes
  { let n = 0, L = 0; const rows: Cell[][] = [];
    each(['duct', 'pipe'], (e, g) => { const G = e.geometry, sp = specOf(e), l = len(G), isD = e.type === 'duct'; n++; L += l; rows.push([mark(isD ? 'DU' : 'PI', n), isD ? 'Duct' : 'Pipe', g.story.name, isD ? `${sp.w_mm ?? 600} × ${sp.h_mm ?? 300} mm` : `${sp.dia_mm ?? 110} mm dia.`, r2(l), r2(G.elevation_m ?? 0)]); });
    rows.sort((x, y) => (x[1] === y[1] ? 0 : x[1] === 'Duct' ? -1 : 1));
    out.push({ key: 'services', title: 'Ducts and pipes', cols: ['Mark', 'Kind', 'Storey', 'Size', 'Length (m)', 'Centreline height (m)'], rows, total: rows.length ? ['Total', '', '', '', r2(L), ''] : undefined }); }

  // quantities summary
  const sum = (key: string, col: number) => { const t = out.find(x => x.key === key); return t?.total ? Number(t.total[col]) || 0 : 0; };
  const cv = sum('columns', 6), bv = sum('beams', 5), sv = sum('slabs', 6);
  out.unshift({ key: 'summary', title: 'Quantities summary', cols: ['Item', 'Quantity', 'Unit'], rows: [
    ['Column concrete', r2(cv), 'm³'], ['Beam concrete', r2(bv), 'm³'], ['Slab and roof concrete', r2(sv), 'm³'], ['Structural concrete, total', r2(cv + bv + sv), 'm³'],
    ['Wall net area', r2(sum('walls', 6)), 'm²'], ['Wall volume (net of openings)', r2(sum('walls', 7)), 'm³'], ['Wall length', r2(sum('walls', 2)), 'm'],
    ['Doors', els.filter(e => e.type === 'door').length, 'no.'], ['Windows', els.filter(e => e.type === 'window').length, 'no.'],
    ['Slab and roof area', r2(sum('slabs', 4)), 'm²'], ['Room area', r2(sum('rooms', 2)), 'm²'], ['Duct and pipe length', r2(sum('services', 4)), 'm'],
  ], note: 'Concrete volumes are geometric. Add reinforcement, formwork and waste from your own rates; use Member design for steel.' });
  return out;
}

const q = (c: Cell) => { const s = String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = (t: Table): string => [t.cols, ...t.rows, ...(t.total ? [t.total] : [])].map(r => r.map(q).join(',')).join('\n') + '\n';
