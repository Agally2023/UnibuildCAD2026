// Schedules: tables of what is in the model, built from the elements. Pure functions so they can be tested.
// Units: metres, square metres, cubic metres unless a heading says otherwise.
import type { El, Lib, Story } from './engineering';
import { isPitched, roofLabel, roofPlanBox } from './roof';
import { beamSec, footprint, holesOf, netArea, polyArea, stairSteps, wallT } from './model';

export type Cell = string | number;
export type Table = { id: string; title: string; note?: string; head: string[]; rows: Cell[][]; foot?: Cell[] };

const r = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const len = (g: any) => Math.hypot(g.end[0] - g.start[0], g.end[1] - g.start[1]);
const DOOR_H = 2.1, WIN_H = 1.2;     // the heights used by the 3D view, IFC export and clash detection

export function buildSchedules(els: El[], lib: Lib[], stories: Story[]): Table[] {
  const list = [...stories].sort((a, b) => a.elevation_m - b.elevation_m), first = list[0]?.id;
  const sName = (e: El) => list.find(s => s.id === (e.story_id ?? first))?.name ?? '-';
  const sIdx = (e: El) => Math.max(0, list.findIndex(s => s.id === (e.story_id ?? first)));
  const libOf = (e: El) => lib.find(l => l.id === e.library_item_id);
  const of = (t: string) => els.filter(e => e.type === t);
  const byStorey = (a: El, b: El) => sIdx(a) - sIdx(b);
  const wallById = Object.fromEntries(of('wall').map(w => [w.id, w]));
  const out: Table[] = [];

  // doors and windows, with marks D1, D2 ... and W1, W2 ... in storey then plan order
  const openings = [...of('door'), ...of('window')].filter(o => wallById[o.geometry.wall_id]);
  const position = (o: El) => { const w = wallById[o.geometry.wall_id].geometry, L = len(w) || 1, t = o.geometry.offset_m / L; return [w.start[0] + (w.end[0] - w.start[0]) * t, w.start[1] + (w.end[1] - w.start[1]) * t]; };
  const ordered = (t: string) => openings.filter(o => o.type === t).sort((a, b) => byStorey(a, b) || position(a)[1] - position(b)[1] || position(a)[0] - position(b)[0]);
  const orow = (o: El, mark: string): Cell[] => { const h = o.type === 'door' ? DOOR_H : WIN_H, w = o.geometry.width_m; return [mark, sName(o), libOf(o)?.name ?? 'Standard', r(w), r(h), r(w * h), `${r(position(o)[0], 1)}, ${r(position(o)[1], 1)}`, Math.round(wallT(wallById[o.geometry.wall_id].geometry) * 1000)]; };
  const doors = ordered('door'), wins = ordered('window');
  const dRows = doors.map((o, i) => orow(o, `D${i + 1}`)), wRows = wins.map((o, i) => orow(o, `W${i + 1}`));
  out.push({ id: 'openings', title: 'Doors and windows', note: `Door height ${DOOR_H} m and window height ${WIN_H} m are the standard heights used everywhere in the model.`, head: ['Mark', 'Storey', 'Type', 'Width m', 'Height m', 'Area m²', 'At x, y m', 'Wall mm'], rows: [...dRows, ...wRows], foot: ['Total', '', `${doors.length} doors, ${wins.length} windows`, '', '', r([...dRows, ...wRows].reduce((a, x) => a + (x[5] as number), 0)), '', ''] });

  // walls per storey
  const wallRows: Cell[][] = [];
  for (const s of list) {
    const ws = of('wall').filter(w => (w.story_id ?? first) === s.id); if (!ws.length) continue;
    const L = ws.reduce((a, w) => a + len(w.geometry), 0), gross = ws.reduce((a, w) => a + len(w.geometry) * (w.geometry.height ?? s.height_m), 0);
    const open = openings.filter(o => ws.some(w => w.id === o.geometry.wall_id)).reduce((a, o) => a + o.geometry.width_m * (o.type === 'door' ? DOOR_H : WIN_H), 0);
    const vol = ws.reduce((a, w) => a + len(w.geometry) * wallT(w.geometry) * (w.geometry.height ?? s.height_m), 0);
    const th = [...new Set(ws.map(w => Math.round(wallT(w.geometry) * 1000)))].sort((a, b) => a - b).join(', ');
    wallRows.push([s.name, ws.length, r(L, 1), th, r(gross, 1), r(open, 1), r(gross - open, 1), r(vol, 1)]);
  }
  const sum = (rows: Cell[][], i: number) => r(rows.reduce((a, x) => a + (x[i] as number), 0), 1);
  out.push({ id: 'walls', title: 'Walls', head: ['Storey', 'Count', 'Length m', 'Thickness mm', 'Gross area m²', 'Openings m²', 'Net area m²', 'Volume m³'], rows: wallRows, foot: ['Total', wallRows.reduce((a, x) => a + (x[1] as number), 0), sum(wallRows, 2), '', sum(wallRows, 4), sum(wallRows, 5), sum(wallRows, 6), sum(wallRows, 7)] });

  // columns by storey and section
  const colMap = new Map<string, { storey: string; sec: string; n: number; h: number; vol: number }>();
  for (const c of [...of('column')].sort(byStorey)) {
    const sp = libOf(c)?.specs ?? {}, b = (sp.b_mm ?? (c.geometry.b ? c.geometry.b * 1000 : 300)), h = (sp.h_mm ?? (c.geometry.h ? c.geometry.h * 1000 : 300)), H = c.geometry.height ?? 3.6, k = `${sName(c)}|${b}x${h}`;
    const row = colMap.get(k) ?? { storey: sName(c), sec: `${Math.round(b)} × ${Math.round(h)}`, n: 0, h: H, vol: 0 }; row.n++; row.vol += (b / 1000) * (h / 1000) * H; colMap.set(k, row);
  }
  const colRows = [...colMap.values()].map(x => [x.storey, x.sec, x.n, r(x.h), r(x.vol)] as Cell[]);
  out.push({ id: 'columns', title: 'Columns', head: ['Storey', 'Section mm', 'Count', 'Height m', 'Volume m³'], rows: colRows, foot: ['Total', '', colRows.reduce((a, x) => a + (x[2] as number), 0), '', r(colRows.reduce((a, x) => a + (x[4] as number), 0))] });

  // beams by storey and section
  const bMap = new Map<string, { storey: string; sec: string; n: number; L: number; vol: number }>();
  for (const b of [...of('beam')].sort(byStorey)) {
    const sec = beamSec(b.geometry, libOf(b)?.specs), w = Math.round(sec.b * 1000), d = Math.round(sec.d * 1000), L = len(b.geometry), k = `${sName(b)}|${w}x${d}`;
    const row = bMap.get(k) ?? { storey: sName(b), sec: `${w} × ${d}`, n: 0, L: 0, vol: 0 }; row.n++; row.L += L; row.vol += sec.b * sec.d * L; bMap.set(k, row);
  }
  const bRows = [...bMap.values()].map(x => [x.storey, x.sec, x.n, r(x.L, 1), r(x.vol)] as Cell[]);
  out.push({ id: 'beams', title: 'Beams', head: ['Storey', 'Section mm', 'Count', 'Length m', 'Volume m³'], rows: bRows, foot: ['Total', '', bRows.reduce((a, x) => a + (x[2] as number), 0), sum(bRows, 3), r(bRows.reduce((a, x) => a + (x[4] as number), 0))] });

  // slabs and roofs
  const sl = [...of('slab'), ...of('roof')].sort(byStorey).map(e => { const pb = e.type === 'roof' && isPitched(e.geometry) ? roofPlanBox(e.geometry) : null, a = pb ? (pb[2] - pb[0]) * (pb[3] - pb[1]) : netArea(e.geometry), t = (e.geometry.z1 - e.geometry.z0); return [sName(e), e.type === 'roof' ? 'Roof' : 'Slab', (e.type === 'roof' && isPitched(e.geometry) ? roofLabel(e.geometry) : e.geometry.poly ? 'Polygon' : 'Rectangle') + (holesOf(e.geometry).length ? ` + ${holesOf(e.geometry).length} opening(s)` : ''), r(a, 1), Math.round(t * 1000), r(a * t)] as Cell[]; });
  out.push({ id: 'slabs', title: 'Slabs and roofs', head: ['Storey', 'Kind', 'Shape', 'Area m²', 'Thickness mm', 'Volume m³'], rows: sl, foot: ['Total', '', '', sum(sl, 3), '', r(sl.reduce((a, x) => a + (x[5] as number), 0))] });

  // rooms
  const rooms = of('zone').sort(byStorey).map(e => { const p = e.geometry.poly as [number, number][] | undefined; const per = p ? p.reduce((a, q, i) => a + Math.hypot(p[(i + 1) % p.length][0] - q[0], p[(i + 1) % p.length][1] - q[1]), 0) : 0; return [sName(e), e.geometry.name ?? 'Room', r(p ? polyArea(p) : 0, 1), r(per, 1)] as Cell[]; });
  out.push({ id: 'rooms', title: 'Rooms', head: ['Storey', 'Name', 'Area m²', 'Perimeter m'], rows: rooms, foot: ['Total', `${rooms.length} rooms`, sum(rooms, 2), ''] });

  // stairs
  const st = of('stair').sort(byStorey).map(e => { const g = e.geometry, n = stairSteps(g), [x0, y0, x1, y1] = g.rect, run = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)), w = Math.min(Math.abs(x1 - x0), Math.abs(y1 - y0)); return [sName(e), n, Math.round(((g.z1 - g.z0) / n) * 1000), r(w), r(run), r(run / Math.max(n - 1, 1) * 1000, 0)] as Cell[]; });
  out.push({ id: 'stairs', title: 'Stairs', head: ['Storey', 'Risers', 'Riser mm', 'Width m', 'Run m', 'Tread mm'], rows: st });

  // services
  const svc = new Map<string, { kind: string; size: string; L: number; n: number }>();
  for (const e of [...of('duct'), ...of('pipe')]) {
    const sp = libOf(e)?.specs ?? {}, size = e.type === 'duct' ? `${e.geometry.w_mm ?? sp.w_mm ?? 600} × ${e.geometry.h_mm ?? sp.h_mm ?? 300} mm` : `Ø ${e.geometry.dia_mm ?? sp.dia_mm ?? 110} mm`, k = `${e.type}|${size}`;
    const row = svc.get(k) ?? { kind: e.type === 'duct' ? 'Duct' : 'Pipe', size, L: 0, n: 0 }; row.L += len(e.geometry); row.n++; svc.set(k, row);
  }
  const sv = [...svc.values()].map(x => [x.kind, x.size, x.n, r(x.L, 1)] as Cell[]);
  const kw = of('fixture').reduce((a, e) => a + (e.geometry.kw ?? 0), 0);
  out.push({ id: 'services', title: 'Services', note: `${of('equipment').length} plant item(s) and ${of('fixture').length} outlet(s), total cooling load ${r(kw, 1)} kW.`, head: ['Kind', 'Size', 'Segments', 'Length m'], rows: sv, foot: ['Total', '', sv.reduce((a, x) => a + (x[2] as number), 0), sum(sv, 3)] });

  // concrete summary
  const cv = (rows: Cell[][], i: number) => rows.reduce((a, x) => a + (x[i] as number), 0);
  const parts: Cell[][] = [['Columns', r(cv(colRows, 4))], ['Beams', r(cv(bRows, 4))], ['Slabs and roofs', r(cv(sl, 5))]];
  out.push({ id: 'concrete', title: 'Concrete summary', note: 'Slabs and roofs are counted as concrete here. Walls are not (they may be masonry).', head: ['Part', 'Volume m³'], rows: parts, foot: ['Total', r(parts.reduce((a, x) => a + (x[1] as number), 0))] });
  const concrete = parts.reduce((a, x) => a + (x[1] as number), 0);
  return out.filter(t => t.id === 'openings' || (t.id === 'concrete' ? concrete > 0 : t.rows.length > 0));
}

const csvCell = (c: Cell) => { const s = String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function schedulesCsv(tables: Table[]): string {
  return tables.map(t => [t.title, t.head.map(csvCell).join(','), ...t.rows.map(r2 => r2.map(csvCell).join(',')), ...(t.foot ? [t.foot.map(csvCell).join(',')] : [])].join('\n')).join('\n\n');
}
