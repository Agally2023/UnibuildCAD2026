// Quantities, cost, structural status and MEP loads from the whole model, storey by storey.
// Preliminary estimates only (EC2-style sizing, simplified loads). Not for construction.
import { designAll } from './design';
import { beamSec, footprint, groupByStory, planBox, polyArea, wallT } from './model';

export type El = { id: string; type: string; geometry: any; library_item_id: string | null; story_id?: string | null; properties?: any };
export type Story = { id: string; name: string; elevation_m: number; height_m: number; sort_order?: number };
export type Lib = { id: string; category: string; name: string; specs: any; unit_cost: number | null };
export type Use = 'office' | 'resi' | 'lab';
export type Check = { level: 'ok' | 'warn' | 'bad'; text: string };

export const USE = {
  office: { ll: 3, cool: 90, el: 60, occ: 10, wl: 50, clr: 2.7, fit: 28000 },
  resi: { ll: 2, cool: 65, el: 40, occ: 25, wl: 150, clr: 2.4, fit: 32000 },
  lab: { ll: 4, cool: 140, el: 120, occ: 15, wl: 100, clr: 2.7, fit: 55000 },
};
const TRANSFORMERS = [100, 200, 315, 500, 630, 800, 1000, 1250, 1600, 2000, 2500];

export function analyse(els: El[], lib: Lib[], use: Use, stories: Story[]) {
  const P = USE[use], groups = groupByStory(els, stories);
  const cost = (cat: string, re: RegExp) => lib.find(l => l.category === cat && re.test(l.name))?.unit_cost ?? 0;
  const specOf = (e: El) => lib.find(l => l.id === e.library_item_id)?.specs ?? {};
  const len = (g: any) => Math.hypot(g.end[0] - g.start[0], g.end[1] - g.start[1]);
  const all = (t: string) => els.filter(e => e.type === t);
  const walls = all('wall'), cols = all('column'), beams = all('beam'), doors = all('door'), wins = all('window');

  const wallLen = walls.reduce((a, w) => a + len(w.geometry), 0);
  const openingArea = doors.reduce((a, d) => a + d.geometry.width_m * 2.1, 0) + wins.reduce((a, w) => a + w.geometry.width_m * 1.2, 0);
  const winArea = wins.reduce((a, w) => a + w.geometry.width_m * 1.2, 0);
  const wallArea = Math.max(0, walls.reduce((a, w) => a + len(w.geometry) * w.geometry.height, 0) - openingArea);

  let GFA = 0, slabVol = 0, clear = Infinity, minBeamD = Infinity, ductH = 0.2;
  const nSt = groups.length;
  const colVol = cols.reduce((a, c) => { const s = specOf(c); return a + ((s.b_mm ?? c.geometry.b * 1000) / 1000) * ((s.h_mm ?? c.geometry.h * 1000) / 1000) * c.geometry.height; }, 0);
  const beamVol = beams.reduce((a, b) => { const { b: bw, d } = beamSec(b.geometry, specOf(b)); return a + len(b.geometry) * bw * d; }, 0);
  const cool = (() => { let a = 0; for (const g of groups) a += planBox(g.els).area * P.cool / 1000; return a + winArea * 0.12; })();
  const air = cool / 12.07;
  ductH = Math.min(0.8, Math.max(0.2, air / nSt / 6 / 4));
  for (const g of groups) {
    const box = planBox(g.els), slabs = g.els.filter(e => e.type === 'slab');
    GFA += box.area;
    const longest = Math.max(0, ...g.els.filter(e => e.type === 'beam').map(b => len(b.geometry)));
    slabVol += slabs.length ? slabs.reduce((a, s) => a + (footprint(s.geometry) ? polyArea(footprint(s.geometry)!) : 0) * (s.geometry.z1 - s.geometry.z0), 0) : box.area * Math.max(0.15, Math.ceil((longest || 4) / 28 / 0.025) * 0.025);
    const bd = Math.min(...g.els.filter(e => e.type === 'beam').map(b => beamSec(b.geometry, specOf(b)).d), 0.5);
    minBeamD = Math.min(minBeamD, bd);
    clear = Math.min(clear, g.story.height_m - bd - ductH - 0.25);
  }
  const conc = colVol + beamVol + slabVol, steel = conc * 0.12;

  const dsg = designAll(groups, lib, { fck: 25, fyk: 500 }, { imposed: P.ll, defaultTrib: 3 });
  const axial = Math.max(0, ...dsg.cols.map(c => c.NEd)), reqSide = Math.sqrt((axial * 1000) / 18.7) / 1000;
  const kw = GFA * P.el / 1000 + cool / 3, kva = kw * 0.8 / 0.9;
  const trafo = TRANSFORMERS.find(x => x >= kva) ?? 2500, water = GFA / P.occ * P.wl / 1000;

  const cStruct = conc * (cost('material', /concrete/i) || 34000) + (steel * cost('material', /reinforcement/i) || steel * 130000);
  const cArch = wallArea * (cost('wall', /./) || 6000) + doors.length * (cost('door', /./) || 18000) + wins.length * (cost('window', /./) || 45000) + GFA * P.fit;
  const cMep = cool * 70000 + kva * 12000 + GFA * 4000;

  const L = (ok: number, warn: number, v: number): Check['level'] => (v <= ok ? 'ok' : v <= warn ? 'warn' : 'bad');
  const checks: Check[] = [];
  const flagged = [...dsg.beams, ...dsg.cols].filter(r => r.status !== 'ok');
  const bad = flagged.filter(r => r.status === 'bad').length;
  if (dsg.beams.length + dsg.cols.length) checks.push({ level: bad ? 'bad' : flagged.length ? 'warn' : 'ok', text: flagged.length ? `${flagged.length} of ${dsg.beams.length + dsg.cols.length} structural members need attention (${bad} fail): see Design` : `All ${dsg.beams.length + dsg.cols.length} beams and columns pass preliminary EC2 design` });
  else checks.push({ level: 'warn', text: 'No beams or columns drawn yet, so no structural check' });
  if (beams.length) checks.push({ level: clear >= P.clr ? 'ok' : clear >= P.clr - 0.15 ? 'warn' : 'bad', text: `Ceiling clear height ${clear.toFixed(2)} m after beam, duct and ceiling (needs ${P.clr} m)` });
  if (GFA > 0) checks.push({ level: L(0.4, 0.6, wallArea + openingArea ? winArea / (wallArea + openingArea) : 0), text: `Glazing is ${Math.round((100 * winArea) / (wallArea + openingArea || 1))}% of wall area and adds ${winArea * 0.12 > 0 ? (winArea * 0.12).toFixed(1) : 0} kW cooling` });
  if (doors.length + wins.length && [...doors, ...wins].some(e => e.geometry.offset_m - e.geometry.width_m / 2 < -0.001)) checks.push({ level: 'bad', text: 'An opening runs past the end of its wall' });

  return {
    arch: { wallLen, wallArea, doors: doors.length, windows: wins.length, winArea, GFA },
    struct: { cols: cols.length, beams: beams.length, slabVol, conc, steel, axial, reqSide, designSteelT: dsg.steelT },
    mep: { cool, tr: cool / 3.517, air, kva, trafo, water },
    cost: { struct: cStruct, arch: cArch, mep: cMep, total: cStruct + cArch + cMep },
    storeys: nSt, checks,
  };
}
export type Analysis = ReturnType<typeof analyse>;
