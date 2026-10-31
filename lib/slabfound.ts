// Eurocode 2 slab and pad-footing design: simplified, preliminary. Units: mm, N, MPa unless noted.
import type { El, Lib } from './engineering';
import { designAll, Mat, Status } from './design';
import { Group, planBox } from './model';
import { allowedSpanDepth, crackWidth } from './serviceability';
import { bsFooting, bsSlab } from './bs8110';
import { designSlabPanels } from './slabpanels';
import { designStrip, groupPads, StripResult } from './stripfoot';
import { designPadLateral, stripCombos } from './footlateral';
import { designGroundBeams, GroundBeam } from './groundbeam';
import type { LateralResult } from './lateral';

const mp = (m: Mat) => ({ fcd: (0.85 * m.fck) / 1.5, fyd: m.fyk / 1.15, fctm: 0.3 * Math.pow(m.fck, 2 / 3) });
const area = (d: number) => (Math.PI * d * d) / 4;
const lerp = (x: number, x0: number, x1: number, y0: number, y1: number) => y0 + ((y1 - y0) * (Math.min(Math.max(x, x0), x1) - x0)) / (x1 - x0);

// Flexure per metre width: returns As (mm²/m) or null if the section is too shallow for singly reinforced design.
function flexure(M: number, d: number, m: Mat) {
  const { fyd, fctm } = mp(m), K = M / (1000 * d * d * m.fck);
  if (K > 0.167) return null;
  const z = Math.min(0.95 * d, d * (0.5 + Math.sqrt(0.25 - K / 1.134)));
  return Math.max(M / (fyd * z), (0.26 * fctm * 1000 * d) / m.fyk, 0.0013 * 1000 * d);
}
function spacing(As: number, hmm: number, bars = [10, 12, 16, 20, 25]) {
  for (const phi of bars) {
    const s = Math.floor((area(phi) * 1000) / As / 25) * 25;
    if (s >= 100) return { txt: `T${phi}@${Math.min(s, 300, Math.floor((3 * hmm) / 25) * 25)}`, phi, s: Math.min(s, 300) };
  }
  return { txt: 'T25@100', phi: 25, s: 100 };
}
const vrdc = (d: number, rho: number, fck: number) => { const k = Math.min(2, 1 + Math.sqrt(200 / d)); return Math.max(0.12 * k * Math.cbrt(100 * Math.min(0.02, rho) * fck), 0.035 * Math.pow(k, 1.5) * Math.sqrt(fck)); };

export type SlabResult = { lx: number; ly: number; type: string; h: number; n: number; mNeg: number; mPos: number; topBars: string; botBars: string; status: Status; notes: string[]; concreteM3: number; steelKg: number; steps: string[]; ld: number; ldAllowed: number; wk: number };
export function designSlab(lx: number, ly: number, imposed: number, m: Mat, planArea: number, hFixed?: number): SlabResult {
  if (m.code === 'BS8110') return bsSlab(lx, ly, imposed, m, planArea, hFixed);
  const notes: string[] = [];
  let status: Status = 'ok';
  [lx, ly] = [Math.min(lx, ly), Math.max(lx, ly)];
  const ratio = ly / lx, twoWay = ratio <= 2;
  const d0 = (lx * 1000) / 26;                                          // EC2 7.4 basic span/depth, continuous end span
  const h = hFixed ? Math.max(100, Math.round(hFixed)) : Math.max(150, Math.ceil((d0 + 35) / 25) * 25);
  if (hFixed && hFixed < d0 + 35) { notes.push(`Drawn slab ${Math.round(hFixed)} mm is thinner than the span/depth guide (${Math.ceil(d0 + 35)} mm): check deflection`); status = 'warn'; }
  const d = h - 35, gk = 25 * (h / 1000) + 2.5, n = 1.35 * gk + 1.5 * imposed;   // kN/m²
  // interior-panel moment coefficients (published two-way tables) for ly/lx 1 to 2; beyond 2 treat as one-way, M = nL²/10
  const bNeg = twoWay ? lerp(ratio, 1, 2, 0.031, 0.063) : 0.1, bPos = twoWay ? lerp(ratio, 1, 2, 0.024, 0.048) : 0.083;
  const mNeg = bNeg * n * lx * lx, mPos = bPos * n * lx * lx;           // kNm/m
  const asNeg = flexure(mNeg * 1e6, d, m), asPos = flexure(mPos * 1e6, d, m);
  if (asNeg === null || asPos === null) { notes.push('Slab too shallow for bending: increase thickness'); status = 'bad'; }
  const A1 = asNeg ?? 0, A2 = asPos ?? 0, VEd = 0.5 * n * lx * 1000;       // N per metre
  const VRd = vrdc(d, Math.max(A1, A2) / (1000 * d), m.fck) * 1000 * d;
  if (VEd > VRd) { notes.push('Shear exceeds slab capacity: increase thickness'); status = 'bad'; }
  const top = spacing(Math.max(A1, 1), h), bot = spacing(Math.max(A2, 1), h);
  // per plan m²: bottom steel both ways, top steel over supports (about 40% of the area, both ways), 10% laps and waste
  const steelKg = (0.8 * (1e6 / top.s) * area(top.phi) + 2 * (1e6 / bot.s) * area(bot.phi)) * 7850 / 1e9 * 1.1 * (planArea || 0);
  const AsTop = (area(top.phi) * 1000) / top.s, AsBot = (area(bot.phi) * 1000) / bot.s, qp = (gk + 0.3 * imposed) / n;
  const ldA = (lx * 1000) / d, ldOk = allowedSpanDepth({ K: 1.5, fck: m.fck, rho: Math.max(A2, 1) / (1000 * d), AsReq: Math.max(A2, 1), AsProv: AsBot, fyk: m.fyk, L: lx });
  const ckS = crackWidth({ M: mPos * qp * 1e6, b: 1000, h, d, As: AsBot, phi: bot.phi, spacing: bot.s, cover: 25, fck: m.fck }), ckT = crackWidth({ M: mNeg * qp * 1e6, b: 1000, h, d, As: AsTop, phi: top.phi, spacing: top.s, cover: 25, fck: m.fck });
  const wk = Math.max(ckS.wk, ckT.wk);
  if (ldA > ldOk) { notes.push(`Span/depth ${ldA.toFixed(1)} exceeds the allowable ${ldOk.toFixed(1)}: thicken the slab or run a calculated deflection`); if (status === 'ok') status = 'warn'; }
  if (wk > 0.3) { notes.push(`Crack width ${wk.toFixed(2)} mm exceeds 0.3 mm: use closer bar spacing`); if (status === 'ok') status = 'warn'; }
  const steps = [`Bay ${lx.toFixed(2)} × ${ly.toFixed(2)} m, ly/lx = ${ratio.toFixed(2)}: ${twoWay ? 'two-way action, interior panel' : 'one-way action'}`,
    `Thickness from span/depth (EC2 7.4.2, l/d = 26, continuous): d ≥ ${Math.round(d0)} mm, h = ${h} mm`,
    `Design load n = 1.35 (25 h + 2.5) + 1.5 qk = ${n.toFixed(2)} kN/m²`,
    `Moments m = β n lx²: support ${mNeg.toFixed(1)} kNm/m (β = ${bNeg.toFixed(3)}), span ${mPos.toFixed(1)} kNm/m (β = ${bPos.toFixed(3)}); published two-way coefficients, interior panel`,
    `Steel per metre: support ${Math.round(A1)} mm²/m, span ${Math.round(A2)} mm²/m, minimum ${Math.round(Math.max(0.26 * mp(m).fctm * 1000 * d / m.fyk, 0.0013 * 1000 * d))} mm²/m (EC2 6.1, 9.3.1.1)`,
    `Shear: VEd = ${(VEd / 1e3).toFixed(1)} kN/m vs VRd,c = ${(VRd / 1e3).toFixed(1)} kN/m (EC2 6.2.2)`,
    `Span/depth (EC2 7.4.2, K = 1.5 interior panel): lx/d = ${ldA.toFixed(1)} against allowable ${ldOk.toFixed(1)}: ${ldA <= ldOk ? 'satisfied' : 'not satisfied'}`,
    `Crack width (EC2 7.3.4, quasi-permanent moments): span ${ckS.wk.toFixed(2)} mm, support ${ckT.wk.toFixed(2)} mm, limit 0.3 mm`];
  return { ld: ldA, ldAllowed: ldOk, wk, steps, lx, ly, type: twoWay ? 'Two-way, interior panel' : 'One-way', h, n, mNeg, mPos, topBars: top.txt, botBars: bot.txt, status, notes, concreteM3: (planArea || 0) * (h / 1000), steelKg };
}

export type FootingResult = { id: string; NEd: number; B: number; h: number; pULS: number; pSLS: number; bars: string; AsReq: number; status: Status; notes: string[]; concreteM3: number; steelKg: number; steps: string[]; lat?: { pmax: number; allow: number; govern: string; uplift: number; sliding: number; grown: boolean } };
export function designFooting(id: string, NEd: number, c1: number, c2: number, qAllow: number, m: Mat): FootingResult {
  if (m.code === 'BS8110') return bsFooting(id, NEd, c1, c2, qAllow, m);
  const { fcd } = mp(m), notes: string[] = [];
  const Nserv = NEd / 1.4, B = Math.max(0.9, Math.ceil(Math.sqrt((Nserv * 1.1) / qAllow) / 0.1 - 1e-9) / 10);
  const pULS = NEd / (B * B), pSLS = (Nserv * 1.1) / (B * B), p = pULS / 1000;              // p in N/mm²
  const a = (B * 1000 - Math.max(c1, c2)) / 2, Bmm = B * 1000;
  let status: Status = 'ok', pick = null as null | { h: number; d: number; As: number };
  for (let hm = 0.3; hm <= 1.5; hm += 0.05) {
    const h = Math.round(hm * 100) / 100, d = h * 1000 - 58;
    const As = flexure((p * a * a * 0.5) * 1000, d, m);                                      // N·mm per metre = p·a²/2 × 1000 mm
    if (As === null) continue;
    const rho = As / (1000 * d);
    const beamV = a > d ? p * (a - d) * 1000 : 0;
    const u1 = 2 * (c1 + c2) + 4 * Math.PI * d, Ain = c1 * c2 + 4 * d * (c1 + c2) + Math.PI * 4 * d * d;
    const vEd = (1.15 * Math.max(0, NEd * 1000 - p * Ain)) / (u1 * d), vRd = vrdc(d, rho, m.fck);
    const vEdMax = (1.15 * NEd * 1000) / (2 * (c1 + c2) * d), vRdMax = 0.5 * 0.6 * (1 - m.fck / 250) * fcd;
    if (beamV <= vrdc(d, rho, m.fck) * 1000 * d && vEd <= vRd && vEdMax <= vRdMax) { pick = { h, d, As }; break; }
  }
  if (!pick) { notes.push('No thickness up to 1.5 m passes punching: use a larger column or a stronger concrete'); status = 'bad'; pick = { h: 1.5, d: 1442, As: 0.0013 * 1000 * 1442 }; }
  const bars = spacing(pick.As, pick.h * 1000, [12, 16, 20, 25]);
  if (qAllow < 75) { notes.push('Very low bearing capacity: consider piles or a raft'); if (status === 'ok') status = 'warn'; }
  const steps = [`NEd = ${Math.round(NEd)} kN (ULS), service load ≈ NEd/1.4 = ${Math.round(Nserv)} kN, plus 10% self-weight`,
    `Plan size from allowable bearing ${qAllow} kPa: B = √(1.1 Nserv / q) rounded up = ${B.toFixed(1)} m; service pressure ${Math.round(pSLS)} kPa`,
    `ULS pressure p = NEd/B² = ${Math.round(pULS)} kPa; cantilever a = ${Math.round(a)} mm, m = p a²/2 = ${Math.round((p * a * a * 0.5) * 1000 / 1e3 / 1e3 * 1000) / 1000 || 0} kNm/m`,
    `Thickness raised in 50 mm steps until bending, beam shear at d and punching at 2d all pass (EC2 6.2.2, 6.4.4): h = ${Math.round(pick.h * 1000)} mm`,
    `Steel As = ${Math.round(pick.As)} mm²/m each way: ${bars.txt}`];
  return { steps, id, NEd, B, h: pick.h, pULS, pSLS, bars: `${bars.txt} each way`, AsReq: pick.As, status, notes, concreteM3: B * B * pick.h, steelKg: (2 * (area(bars.phi) * 1000 / bars.s) * B * Bmm * 7850) / 1e9 };
}

export function designFoundations(groups: Group[], lib: Lib[], m: Mat, o: { imposed: number; defaultTrib: number; qAllow: number; lateral?: LateralResult; groundBeams?: boolean }) {
  const base = designAll(groups, lib, m, { imposed: o.imposed, defaultTrib: o.defaultTrib });
  const gs = [...groups].sort((a, b) => a.story.elevation_m - b.story.elevation_m), low = gs[0];
  const cols = low.els.filter(e => e.type === 'column'), at = Object.fromEntries(cols.map(c => [c.id, c.geometry.at as number[]]));
  const act0 = o.lateral?.foundation ?? {};
  // with ground beams the pads and strips take axial load only: base moments and shears go into the beams
  const actP = o.groundBeams ? Object.fromEntries(Object.entries(act0).map(([k, v]) => [k, { ...v, effs: v.effs.map(e => ({ ...e, Mb: 0, Vx: 0, Vy: 0 })) }])) : act0;
  const pads = base.cols.filter(c => at[c.id]).map(c => { const g = designFooting(c.id, c.NEd, c.b, c.h, o.qAllow, m); return actP[c.id] ? designPadLateral(g, c.b, c.h, actP[c.id].G, actP[c.id].Q, actP[c.id].effs, o.qAllow, m) : g; });
  // pads that overlap are replaced by combined or strip footings where the columns are in a line; 2-D clusters get a raft flag
  const padIn = pads.map(f => ({ id: f.id, x: at[f.id][0], y: at[f.id][1], B: f.B, N: f.NEd, c1: base.cols.find(c => c.id === f.id)!.b, c2: base.cols.find(c => c.id === f.id)!.h }));
  const strips: StripResult[] = [], used = new Set<string>(); let si = 0;
  for (const cl of groupPads(padIn)) {
    if (!cl.collinear) { pads.filter(f => cl.ids.includes(f.id)).forEach(f => { f.notes.push('Footings overlap in a two-dimensional cluster: use a raft or a foundation grid'); if (f.status === 'ok') f.status = 'warn'; }); continue; }
    const cols = cl.ids.map(cid => { const p = padIn.find(x => x.id === cid)!; return { id: cid, s: cl.axis === 'x' ? p.x : p.y, N: p.N, cAxis: cl.axis === 'x' ? p.c1 : p.c2, cPerp: cl.axis === 'x' ? p.c2 : p.c1 }; });
    cols.sort((a, b) => a.s - b.s);
    strips.push(designStrip(`S${++si}`, cl.axis, cols, o.qAllow, m, o.lateral ? stripCombos(m.code, cl.axis, cols.map(k => k.id), actP) : [])); cl.ids.forEach(cid => used.add(cid));
  }
  const footings = pads.filter(f => !used.has(f.id));
  const gbCols = base.cols.filter(c => at[c.id]).map(c => ({ id: c.id, x: at[c.id][0], y: at[c.id][1], b: c.b, h: c.h, G: c.Gk ?? 0, Q: c.Qk ?? 0, NEd: c.NEd, effs: act0[c.id]?.effs ?? [] }));
  const si0 = o.lateral?.seismicInput, groundBeams: GroundBeam[] = o.groundBeams ? designGroundBeams(gbCols, low.els.filter(e => e.type === 'wall').map(w => ({ start: w.geometry.start, end: w.geometry.end, height: w.geometry.height, thickness: w.geometry.thickness ?? 0.2 })), m, { seismic: si0 ? { agG: si0.agG, ground: si0.ground, psi2: si0.psi2 } : undefined }) : [];
  const uniq = (v: number[]) => [...new Set(v.map(x => Math.round(x * 2) / 2))].sort((a, b) => a - b);
  const gaps = (v: number[]) => v.slice(1).map((x, i) => x - v[i]);
  const gx = gaps(uniq(cols.map(c => c.geometry.at[0]))), gy = gaps(uniq(cols.map(c => c.geometry.at[1])));
  const lx = gx.length ? Math.max(...gx) : 4, ly = gy.length ? Math.max(...gy) : 6;
  const slabEls = low.els.filter(e => e.type === 'slab');
  const hFixed = slabEls.length ? (slabEls.reduce((a, s) => a + (s.geometry.z1 - s.geometry.z0), 0) / slabEls.length) * 1000 : undefined;
  const slab = designSlab(lx, ly, o.imposed, m, planBox(low.els).area, hFixed);
  const slabs = gs.map(g => designSlabPanels(g, lib, m, { imposed: o.imposed }));
  const panelSteelT = slabs.reduce((a, s) => a + s.steelKg, 0) / 1000;
  return { slab, slabs, footings, strips, groundBeams, base, foundConcrete: footings.reduce((a, f) => a + f.concreteM3, 0) + strips.reduce((a, s) => a + s.concreteM3, 0) + groundBeams.reduce((a, g) => a + g.concreteM3, 0), foundSteelT: (footings.reduce((a, f) => a + f.steelKg, 0) + strips.reduce((a, s) => a + s.steelKg, 0) + groundBeams.reduce((a, g) => a + g.steelKg, 0)) / 1000, slabSteelT: panelSteelT > 0 ? panelSteelT : (slab.steelKg * gs.length) / 1000 };
}
