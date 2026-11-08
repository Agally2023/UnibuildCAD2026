// Ready-made building templates for the Plan: storeys, grid lines, columns, beams, slabs, walls, doors, windows, stairs, roofs and
// rooms, placed in metres. A template is plain data (no database here); loadBuilding in lib/loadbuilding.ts writes it into a project.
import type { Pt } from './model';

export type TEl = { s: number; type: string; g: any; key?: string; wall?: string; lib?: 'door' | 'window' | 'column' | 'beam' };
export type Building = { key: string; label: string; group: string; blurb: string; storeys: { name: string; h: number }[]; els: TEl[] };

const WT = 0.2, PT = 0.1, SLAB = 0.2;

class Draft {
  els: TEl[] = [];
  n = 0;
  constructor(readonly storeys: { name: string; h: number }[]) {}
  h(s: number) { return this.storeys[s].h; }
  wall(s: number, a: Pt, b: Pt, t = WT, core = false): string { const key = `w${this.n++}`; this.els.push({ s, type: 'wall', key, g: { start: a, end: b, height: this.h(s), thickness: t, ...(core ? { core: true } : {}) } }); return key; }
  open(s: number, wall: string, type: 'door' | 'window', off: number, w: number) { this.els.push({ s, type, wall, lib: type, g: { offset_m: off, width_m: w } }); }
  col(s: number, x: number, y: number, size = 0.3) { this.els.push({ s, type: 'column', lib: 'column', g: { at: [x, y], b: size, h: size, height: this.h(s) } }); }
  beam(s: number, a: Pt, b: Pt) { this.els.push({ s, type: 'beam', lib: 'beam', g: { start: a, end: b } }); }
  slab(s: number, r: [number, number, number, number]) { const H = this.h(s); this.els.push({ s, type: 'slab', g: { rect: r, z0: +(H - SLAB).toFixed(2), z1: H } }); }
  roof(s: number, r: [number, number, number, number], form: 'flat' | 'gable' | 'hip' | 'mono' = 'flat', pitch = 25) {
    const H = this.h(s); this.els.push({ s, type: 'roof', g: { rect: r, z0: H, z1: +(H + SLAB).toFixed(2), ...(form !== 'flat' ? { form, pitch, overhang: 0.4 } : {}) } });
  }
  stair(s: number, r: [number, number, number, number]) { this.els.push({ s, type: 'stair', g: { rect: r, z0: 0, z1: this.h(s) } }); }
  zone(s: number, r: [number, number, number, number], name: string) { this.els.push({ s, type: 'zone', g: { rect: r, poly: [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]], name } }); }
  grid(a: Pt, b: Pt, label: string) { this.els.push({ s: -1, type: 'grid', g: { start: a, end: b, label } }); }
  // a partition with an optional door at the given offset
  part(s: number, a: Pt, b: Pt, doorAt?: number, t = PT) { const k = this.wall(s, a, b, t); if (doorAt !== undefined) this.open(s, k, 'door', doorAt, 0.9); return k; }
  // four outer walls round a rectangle; returns their keys (south, east, north, west)
  box(s: number, r: [number, number, number, number], core = false, t = WT): string[] {
    const [x0, y0, x1, y1] = r;
    return [this.wall(s, [x0, y0], [x1, y0], t, core), this.wall(s, [x1, y0], [x1, y1], t, core), this.wall(s, [x1, y1], [x0, y1], t, core), this.wall(s, [x0, y1], [x0, y0], t, core)];
  }
  grids(nx: number, ny: number, bx: number, by: number) {
    const W = nx * bx, D = ny * by;
    for (let i = 0; i <= nx; i++) this.grid([i * bx, -1.5], [i * bx, D + 1.5], String(i + 1));
    for (let j = 0; j <= ny; j++) this.grid([-1.5, j * by], [W + 1.5, j * by], String.fromCharCode(65 + j));
  }
  done(b: Omit<Building, 'els' | 'storeys'>): Building { return { ...b, storeys: this.storeys, els: this.els }; }
}

const rows = (n: number, name: string) => Array.from({ length: n }, (_, i) => ({ name: i === 0 ? 'Ground floor' : `${name} ${i}`, h: 0 }));

type Framed = { key: string; label: string; blurb: string; nx: number; ny: number; bx: number; by: number; n: number; h: number; col: number; walls: boolean; corridor?: boolean; core?: boolean; use: [string, string]; ramp?: boolean; stairs?: boolean };
function framed(o: Framed): Building {
  const storeys = rows(o.n, 'Level').map(x => ({ ...x, h: o.h }));
  const d = new Draft(storeys), W = o.nx * o.bx, D = o.ny * o.by;
  d.grids(o.nx, o.ny, o.bx, o.by);
  const coreW = o.core ? 6 : 0, coreD = 5, cx0 = W - coreW, cy0 = (D - coreD) / 2;
  for (let s = 0; s < o.n; s++) {
    for (let i = 0; i <= o.nx; i++) for (let j = 0; j <= o.ny; j++) d.col(s, i * o.bx, j * o.by, o.col);
    for (let j = 0; j <= o.ny; j++) for (let i = 0; i < o.nx; i++) d.beam(s, [i * o.bx, j * o.by], [(i + 1) * o.bx, j * o.by]);
    for (let i = 0; i <= o.nx; i++) for (let j = 0; j < o.ny; j++) d.beam(s, [i * o.bx, j * o.by], [i * o.bx, (j + 1) * o.by]);
    d.slab(s, [0, 0, W, D]);
    if (o.walls) {
      const [south, east, north, west] = d.box(s, [0, 0, W, D]);
      for (let i = 0; i < o.nx; i++) { const off = i * o.bx + o.bx / 2; d.open(s, south, 'window', off, 1.5); d.open(s, north, 'window', off, 1.5); }
      if (s === 0) d.open(0, south, 'door', Math.floor(o.nx / 2) * o.bx + o.bx / 2, 1.8);
      for (let j = 0; j < o.ny; j++) { d.open(s, east, 'window', j * o.by + o.by / 2, 1.5); d.open(s, west, 'window', j * o.by + o.by / 2, 1.5); }
      if (o.corridor && o.ny >= 2) {
        const ya = D / 2 - 1.0, yb = D / 2 + 1.0, xe = o.core ? cx0 : W;
        const a = d.wall(s, [0, ya], [xe, ya], PT), b = d.wall(s, [0, yb], [xe, yb], PT);
        for (let i = 0; i < o.nx; i++) { if ((i + 1) * o.bx > xe + 0.01) break; d.open(s, a, 'door', i * o.bx + o.bx / 2, 0.9); d.open(s, b, 'door', i * o.bx + o.bx / 2, 0.9); }
        for (let i = 1; i < o.nx; i++) { const x = i * o.bx; if (x >= xe) break; d.wall(s, [x, 0], [x, ya], PT); d.wall(s, [x, yb], [x, D], PT); }
        for (let i = 0; i < o.nx; i++) { const x1 = Math.min((i + 1) * o.bx, xe); if (i * o.bx >= xe) break; d.zone(s, [i * o.bx + 0.1, 0.1, x1 - 0.1, ya - 0.1], `${o.use[0]} ${i + 1}`); d.zone(s, [i * o.bx + 0.1, yb + 0.1, x1 - 0.1, D - 0.1], `${o.use[0]} ${o.nx + i + 1}`); }
        d.zone(s, [0.1, ya + 0.1, xe - 0.1, yb - 0.1], 'Corridor');
      } else if (o.ny >= 1) d.zone(s, [0.2, 0.2, (o.core ? cx0 : W) - 0.2, D - 0.2], o.use[1]);
    }
    if (o.core) {
      d.box(s, [cx0, cy0, W, cy0 + coreD], true, 0.25);
      d.stair(s, [cx0 + 0.3, cy0 + 0.3, W - 3.2, cy0 + coreD - 0.3]);
      d.zone(s, [W - 3.0, cy0 + 0.3, W - 0.3, cy0 + 2.6], 'Lift');
    } else if (o.stairs) d.stair(s, [W - o.bx + 0.5, 0.5, W - 0.5, 3.4]);
  }
  d.roof(o.n - 1, [-0.2, -0.2, W + 0.2, D + 0.2]);
  if (o.ramp) d.stair(0, [-6, 0.5, -0.5, D - 0.5]);
  return d.done({ key: o.key, label: o.label, group: 'Framed buildings', blurb: o.blurb });
}

function house(storeysN: 1 | 2): Building {
  const storeys = Array.from({ length: storeysN }, (_, i) => ({ name: i ? 'First floor' : 'Ground floor', h: 3.0 }));
  const d = new Draft(storeys), W = 12, D = 9;
  for (let s = 0; s < storeysN; s++) {
    const [south, east, north, west] = d.box(s, [0, 0, W, D]);
    d.open(s, south, 'window', 2, 1.2); d.open(s, south, 'window', 6, 1.2); d.open(s, south, 'window', 10, 1.2);
    d.open(s, north, 'window', 3, 1.5); d.open(s, north, 'window', 7, 1.5); d.open(s, east, 'window', 2.5, 1.2); d.open(s, west, 'window', 2.5, 1.2);
    if (s === 0) { d.open(0, north, 'door', 8.5, 1.0); d.open(0, south, 'door', 11.2 - 0.0, 0.9); }
    const hall = d.part(s, [0, 4.5], [W, 4.5], undefined);
    [2, 6, 10].forEach(x => d.open(s, hall, 'door', x, 0.9));
    d.part(s, [4, 0], [4, 4.5]); d.part(s, [8, 0], [8, 4.5]);
    if (s === 0 || storeysN === 1) { d.part(s, [7, 4.5], [7, D], 2.0); d.zone(s, [0.2, 4.7, 6.9, D - 0.2], 'Living and dining'); d.zone(s, [7.1, 4.7, W - 0.2, D - 0.2], 'Kitchen'); }
    d.zone(s, [0.2, 0.2, 3.9, 4.3], 'Bedroom 1'); d.zone(s, [4.1, 0.2, 7.9, 4.3], storeysN === 1 ? 'Bedroom 2' : 'Bathroom'); d.zone(s, [8.1, 0.2, W - 0.2, 4.3], storeysN === 1 ? 'Bathroom' : 'Bedroom 2');
    if (storeysN === 2 && s === 0) d.stair(0, [0.3, 5.0, 1.5, 8.7]);
    d.slab(s, [0, 0, W, D]);
  }
  d.roof(storeysN - 1, [-0.4, -0.4, W + 0.4, D + 0.4], 'gable', 25);
  return d.done(storeysN === 1 ? { key: 'house-1', label: 'Detached house, 3 bedrooms', group: 'Houses', blurb: '12 x 9 m, gable roof' } : { key: 'house-2', label: 'Two-storey house', group: 'Houses', blurb: '12 x 9 m, two floors and stair' });
}

function shed(key: string, label: string, bays: number, span: number, bay: number, eaves: number, blurb: string, office: boolean): Building {
  const d = new Draft([{ name: 'Ground floor', h: eaves }]), W = bays * bay, D = span;
  d.grids(bays, 1, bay, span);
  for (let i = 0; i <= bays; i++) { d.col(0, i * bay, 0, 0.45); d.col(0, i * bay, D, 0.45); d.beam(0, [i * bay, 0], [i * bay, D]); }
  for (let i = 0; i < bays; i++) { d.beam(0, [i * bay, 0], [(i + 1) * bay, 0]); d.beam(0, [i * bay, D], [(i + 1) * bay, D]); }
  const [south, east, north, west] = d.box(0, [0, 0, W, D], false, 0.15);
  for (let i = 0; i < bays; i++) { d.open(0, north, 'window', i * bay + bay / 2, 2.4); if (i % 2 === 0) d.open(0, south, 'window', i * bay + bay / 2, 2.4); }
  d.open(0, south, 'door', bay * 1.5, 4.5); d.open(0, south, 'door', W - bay * 1.5, 4.5); d.open(0, west, 'door', D / 2, 1.2); d.open(0, east, 'door', D / 2, 4.5);
  if (office) { d.part(0, [0, 6], [bay * 2, 6], bay, 0.15); d.part(0, [bay * 2, 0], [bay * 2, 6], 3, 0.15); d.zone(0, [0.2, 0.2, bay * 2 - 0.2, 5.9], 'Office and welfare'); d.zone(0, [bay * 2 + 0.2, 0.2, W - 0.2, D - 0.2], 'Production floor'); } else d.zone(0, [0.2, 0.2, W - 0.2, D - 0.2], 'Storage hall');
  d.slab(0, [0, 0, W, D]);
  d.roof(0, [-0.5, -0.5, W + 0.5, D + 0.5], 'gable', 10);
  return d.done({ key, label, group: 'Industrial', blurb });
}

function hatchery(): Building {
  const d = new Draft([{ name: 'Ground floor', h: 5 }]), W = 36, D = 24;
  d.grids(6, 4, 6, 6);
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 4; j++) d.col(0, i * 6, j * 6, 0.4);
  for (let j = 0; j <= 4; j++) for (let i = 0; i < 6; i++) d.beam(0, [i * 6, j * 6], [(i + 1) * 6, j * 6]);
  for (let i = 0; i <= 6; i++) for (let j = 0; j < 4; j++) d.beam(0, [i * 6, j * 6], [i * 6, (j + 1) * 6]);
  const [south, east, north, west] = d.box(0, [0, 0, W, D], false, 0.2);
  for (let i = 0; i < 6; i++) d.open(0, north, 'window', i * 6 + 3, 1.5);
  d.open(0, south, 'door', 3, 1.8); d.open(0, south, 'door', 18, 3.6); d.open(0, east, 'door', 12, 3.6);
  // front block (office, lab, feed store) and plant room on the west end; production hall with six tanks
  const fb = d.part(0, [0, 6], [18, 6], 3, 0.15), pr = d.part(0, [6, 6], [6, D], 4, 0.15);
  d.part(0, [6, 0], [6, 6], 3, 0.15); d.part(0, [12, 0], [12, 6], 3, 0.15); void fb; void pr;
  d.zone(0, [0.2, 0.2, 5.9, 5.8], 'Office'); d.zone(0, [6.2, 0.2, 11.9, 5.8], 'Water-quality lab'); d.zone(0, [12.2, 0.2, 17.9, 5.8], 'Feed and chemical store'); d.zone(0, [0.2, 6.2, 5.9, D - 0.2], 'Plant room: pumps, blowers, UV');
  const tank = (x: number, y: number, n: number) => d.zone(0, [x, y, x + 5, y + 5], `Tank T${n}`);
  [[8.5, 8], [15, 8], [21.5, 8], [8.5, 15], [15, 15], [21.5, 15]].forEach(([x, y], i) => tank(x, y, i + 1));
  d.zone(0, [28, 6.5, W - 0.5, D - 0.5], 'Drum filter and biofilter area'); d.zone(0, [18.5, 0.5, W - 0.5, 5.5], 'Loading and dispatch');
  d.slab(0, [0, 0, W, D]); d.roof(0, [-0.5, -0.5, W + 0.5, D + 0.5], 'gable', 8);
  return d.done({ key: 'hatchery', label: 'Hatchery / RAS building', group: 'Industrial', blurb: '36 x 24 m hall, 6 tanks, plant room, lab' });
}

function hall(): Building {
  const d = new Draft([{ name: 'Ground floor', h: 4.5 }]), W = 20, D = 12;
  d.grids(4, 1, 5, D);
  const [south, , north, west] = d.box(0, [0, 0, W, D], false, 0.25);
  for (let i = 0; i < 4; i++) { d.open(0, north, 'window', i * 5 + 2.5, 1.2); d.open(0, south, 'window', i * 5 + 2.5, 1.2); }
  d.open(0, west, 'door', 6, 2.0);
  d.zone(0, [0.3, 0.3, 15.7, D - 0.3], 'Main hall');
  d.part(0, [16, 0], [16, D], undefined, 0.15); const ar = d.wall(0, [16, 6], [W, 6], 0.1); d.open(0, ar, 'door', 2, 0.9);
  d.zone(0, [16.2, 0.3, W - 0.3, 5.9], 'Vestry'); d.zone(0, [16.2, 6.1, W - 0.3, D - 0.3], 'Store');
  d.slab(0, [0, 0, W, D]); d.roof(0, [-0.5, -0.5, W + 0.5, D + 0.5], 'gable', 30);
  return d.done({ key: 'hall', label: 'Church or community hall', group: 'Public', blurb: '20 x 12 m hall with annex, gable roof' });
}

const FR: Framed[] = [
  { key: 'apartments', label: 'Apartment block, ground + 4', blurb: '5 floors, flats either side of a corridor, lift core', nx: 6, ny: 2, bx: 5, by: 6.5, n: 5, h: 3.0, col: 0.4, walls: true, corridor: true, core: true, use: ['Flat', 'Flat'] },
  { key: 'office', label: 'Office block, ground + 5', blurb: '6 floors, open plan, lift and stair core', nx: 6, ny: 3, bx: 8, by: 8, n: 6, h: 3.6, col: 0.5, walls: true, core: true, use: ['Office', 'Open-plan office'] },
  { key: 'hotel', label: 'Hotel, ground + 6', blurb: '7 floors of rooms off a central corridor', nx: 8, ny: 2, bx: 4, by: 6, n: 7, h: 3.2, col: 0.4, walls: true, corridor: true, core: true, use: ['Room', 'Room'] },
  { key: 'school', label: 'School block, ground + 1', blurb: '2 floors of classrooms on a corridor', nx: 8, ny: 2, bx: 7.5, by: 8, n: 2, h: 3.6, col: 0.4, walls: true, corridor: true, stairs: true, use: ['Classroom', 'Classroom'] },
  { key: 'clinic', label: 'Clinic or hospital wing, ground + 2', blurb: '3 floors of wards and consulting rooms', nx: 6, ny: 3, bx: 6, by: 6, n: 3, h: 3.8, col: 0.45, walls: true, corridor: true, core: true, use: ['Ward', 'Ward'] },
  { key: 'retail', label: 'Shop or mall, ground + 1', blurb: '2 floors of open retail space', nx: 6, ny: 4, bx: 8, by: 8, n: 2, h: 4.5, col: 0.5, walls: true, stairs: true, use: ['Retail', 'Retail floor'] },
  { key: 'parking', label: 'Parking garage, ground + 3', blurb: 'Open deck, 4 levels, ramp', nx: 6, ny: 3, bx: 7.5, by: 5.4, n: 4, h: 2.9, col: 0.5, walls: false, ramp: true, stairs: true, use: ['Bay', 'Parking'] },
];

export const BUILDINGS: Building[] = [
  house(1), house(2), ...FR.map(framed),
  shed('warehouse', 'Warehouse', 8, 24, 6, 8, '48 x 24 m portal frame shed, loading doors', false),
  shed('factory', 'Factory with office', 10, 30, 6, 9, '60 x 30 m portal frame, office block, production floor', true),
  hatchery(), hall(),
];
export const BUILDING_GROUPS = Array.from(new Set(BUILDINGS.map(b => b.group)));
