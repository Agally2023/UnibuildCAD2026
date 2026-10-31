// Slab design panel by panel from the column grid (interior, edge and corner panels) and punching shear at columns
// of flat slabs. Two-way moments use the published BS 8110-1 Table 3.14 coefficients for rectangular panels with
// torsional restraint at the corners (also used with Eurocode 2, which gives no tabulated coefficients). Types 1 to 4
// (interior, one short edge, one long edge, two adjacent edges discontinuous) use their own coefficients; every other
// arrangement falls back to the simply-supported coefficients of Table 3.13, which are conservative.
import type { El, Lib } from './engineering';
import { area, Mat, Status } from './rc';
import { crackBS, fcuOf, flexBS, mfBS, vcBS } from './bs8110';
import type { Group } from './model';
import { allowedSpanDepth, crackWidth } from './serviceability';

const R = [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.75, 2];
type PT = { name: string; negX?: number[]; posX: number[]; negY?: number; posY: number };
const T: Record<string, PT> = {
  interior: { name: 'Interior panel', negX: [0.031, 0.037, 0.042, 0.046, 0.05, 0.053, 0.059, 0.063], posX: [0.024, 0.028, 0.032, 0.035, 0.037, 0.04, 0.044, 0.048], negY: 0.032, posY: 0.024 },
  shortEdge: { name: 'Edge panel (one short edge discontinuous)', negX: [0.039, 0.044, 0.048, 0.052, 0.055, 0.058, 0.063, 0.067], posX: [0.029, 0.033, 0.036, 0.039, 0.041, 0.043, 0.047, 0.05], negY: 0.037, posY: 0.028 },
  longEdge: { name: 'Edge panel (one long edge discontinuous)', negX: [0.039, 0.049, 0.056, 0.062, 0.068, 0.073, 0.082, 0.089], posX: [0.03, 0.036, 0.042, 0.047, 0.051, 0.055, 0.062, 0.067], negY: 0.037, posY: 0.028 },
  corner: { name: 'Corner panel (two adjacent edges discontinuous)', negX: [0.047, 0.056, 0.063, 0.069, 0.074, 0.078, 0.087, 0.093], posX: [0.036, 0.042, 0.047, 0.051, 0.055, 0.059, 0.065, 0.07], negY: 0.045, posY: 0.034 },
  simple: { name: 'Simply supported values (Table 3.13, conservative)', posX: [0.062, 0.074, 0.084, 0.093, 0.099, 0.104, 0.113, 0.118], posY: 0.062 },
};
const SSY = [0.062, 0.061, 0.059, 0.055, 0.051, 0.046, 0.037, 0.029];
const at = (v: number[], r: number) => { const x = Math.min(2, Math.max(1, r)); let i = 0; while (i < R.length - 2 && x > R[i + 1]) i++; return v[i] + ((v[i + 1] - v[i]) * (x - R[i])) / (R[i + 1] - R[i]); };

export type Panel = { label: string; x0: number; y0: number; w: number; d: number; type: string; cont: { L: boolean; R: boolean; B: boolean; T: boolean }; lx: number; ly: number; mxNeg: number; mxPos: number; myNeg: number; myPos: number; bottomX: string; bottomY: string; topEdges: string; torsion?: string; status: Status; notes: string[]; steps: string[]; steelKg: number; ld: number; ldAllowed: number; wk: number };
export type Punch = { id: string; story?: string; kind: 'interior' | 'edge' | 'corner'; c1: number; c2: number; V: number; vEd: number; vRd: number; vMax: number; vMaxRd: number; ratio: number; status: Status; notes: string[]; steps: string[] };
export type SlabStorey = { story: string; mode: 'panels' | 'flat' | 'none'; h: number; panels: Panel[]; punching: Punch[]; steelKg: number; concreteM3: number; hNoLinks?: number; notes: string[] };

const bsOf = (m: Mat) => m.code === 'BS8110';
export function flex(M: number, d: number, m: Mat, h: number): number | null {
  if (bsOf(m)) { const r = flexBS(M, 1000, d, fcuOf(m.fck), m.fyk, 35); return r.doubly ? null : Math.max(r.As, 0.0013 * 1000 * h); }
  const K = M / (1000 * d * d * m.fck); if (K > 0.167) return null;
  const z = Math.min(0.95 * d, d * (0.5 + Math.sqrt(0.25 - K / 1.134)));
  return Math.max(M / ((m.fyk / 1.15) * z), (0.26 * 0.3 * Math.pow(m.fck, 2 / 3) * 1000 * d) / m.fyk, 0.0013 * 1000 * d);
}
export const bar = (As: number, h: number) => { for (const phi of [10, 12, 16, 20, 25]) { const s = Math.floor((area(phi) * 1000) / Math.max(As, 1) / 25) * 25; if (s >= 100) { const ss = Math.min(s, 300, Math.floor((3 * h) / 25) * 25); return { txt: `T${phi}@${ss}`, phi, s: ss, As: (area(phi) * 1000) / ss }; } } return { txt: 'T25@100', phi: 25, s: 100, As: (area(25) * 1000) / 100 }; };
const lm = (...a: number[]) => a;

// bays between column grid lines; a bay needs columns at three or more of its corners
export function bays(cols: El[]) {
  const q = (v: number) => Math.round(v * 4) / 4, uniq = (v: number[]) => [...new Set(v.map(q))].sort((a, b) => a - b);
  const xs = uniq(cols.map(c => c.geometry.at[0])), ys = uniq(cols.map(c => c.geometry.at[1])), has = (x: number, y: number) => cols.some(c => Math.abs(c.geometry.at[0] - x) < 0.3 && Math.abs(c.geometry.at[1] - y) < 0.3);
  const out: { i: number; j: number; x0: number; y0: number; w: number; d: number }[] = [];
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
    const n = [has(xs[i], ys[j]), has(xs[i + 1], ys[j]), has(xs[i], ys[j + 1]), has(xs[i + 1], ys[j + 1])].filter(Boolean).length;
    if (n >= 3 && xs[i + 1] - xs[i] >= 1.5 && ys[j + 1] - ys[j] >= 1.5) out.push({ i, j, x0: xs[i], y0: ys[j], w: xs[i + 1] - xs[i], d: ys[j + 1] - ys[j] });
  }
  return out;
}
export function classify(cont: { L: boolean; R: boolean; B: boolean; T: boolean }, w: number, d: number) {
  const wide = w <= d;                                   // short span along x: bottom and top edges are the short edges
  const short = wide ? [cont.B, cont.T] : [cont.L, cont.R], long = wide ? [cont.L, cont.R] : [cont.B, cont.T];
  const ds = short.filter(c => !c).length, dl = long.filter(c => !c).length;
  const key = ds === 0 && dl === 0 ? 'interior' : ds === 1 && dl === 0 ? 'shortEdge' : ds === 0 && dl === 1 ? 'longEdge' : ds === 1 && dl === 1 ? 'corner' : 'simple';
  return { key, discShort: ds, discLong: dl, wide };
}

function designPanel(label: string, b: { x0: number; y0: number; w: number; d: number }, cont: Panel['cont'], h: number, m: Mat, imposed: number, hFixed?: number): Panel {
  const bs = bsOf(m), fcu = fcuOf(m.fck), gG = bs ? 1.4 : 1.35, gQ = bs ? 1.6 : 1.5, notes: string[] = [];
  const lx = Math.min(b.w, b.d), ly = Math.max(b.w, b.d), ratio = ly / lx, cl = classify(cont, b.w, b.d);
  const gk = 25 * (h / 1000) + 2.5, n = gG * gk + gQ * imposed, dx = h - 35, dy = dx - 12;
  let status: Status = 'ok';
  const twoWay = ratio <= 2, t = T[cl.key];
  let mxNeg: number, mxPos: number, myNeg: number, myPos: number, name = t.name;
  if (twoWay) {
    mxNeg = (t.negX ? at(t.negX, ratio) : 0) * n * lx * lx; mxPos = at(t.posX, ratio) * n * lx * lx;
    myNeg = (t.negY ?? 0) * n * lx * lx; myPos = (cl.key === 'simple' ? at(SSY, ratio) : t.posY) * n * lx * lx;
  } else {                                               // one-way across lx, supported on the long edges
    const sup = (cl.wide ? [cont.L, cont.R] : [cont.B, cont.T]).filter(Boolean).length;
    name = 'One-way panel'; mxNeg = sup === 2 ? 0.1 * n * lx * lx : sup === 1 ? 0.086 * n * lx * lx : 0; mxPos = (sup === 2 ? 0.083 : sup === 1 ? 0.086 : 0.125) * n * lx * lx; myNeg = 0; myPos = 0;
  }
  if (cl.key === 'simple' && twoWay) notes.push('Edge arrangement not tabulated here: simply-supported coefficients used (conservative)');
  const AsMin = bs ? 0.0013 * 1000 * h : Math.max((0.26 * 0.3 * Math.pow(m.fck, 2 / 3) * 1000 * dx) / m.fyk, 0.0013 * 1000 * dx);
  const need = (M: number, d: number) => (M <= 0 ? 0 : flex(M * 1e6, d, m, h));
  const aNx = need(mxNeg, dx), aPx = need(mxPos, dx), aNy = need(myNeg, dy), aPy = need(myPos, dy);
  if ([aNx, aPx, aNy, aPy].some(a => a === null)) { notes.push('Slab too shallow for bending: increase thickness'); status = 'bad'; }
  const dist = Math.max(AsMin, 0.0013 * 1000 * h);
  const sx = Math.max(aPx ?? 0, AsMin), sy = Math.max(aPy ?? 0, twoWay ? AsMin : dist), bx = bar(sx, h), by = bar(sy, h);
  // top steel: support moments at continuous edges, half the span steel at discontinuous edges
  const topAt = (cont: boolean, isX: boolean) => { const a = cont ? Math.max((isX ? aNx : aNy) ?? 0, AsMin) : 0.5 * (isX ? sx : sy); return bar(Math.max(a, 0.5 * AsMin), h); };
  const sides = lm(0, 1, 2, 3), edgesTxt: string[] = [];
  const spanX = (edge: 'L' | 'R' | 'B' | 'T') => (cl.wide ? edge === 'L' || edge === 'R' : edge === 'B' || edge === 'T');   // edges across the short span carry the lx-direction support moment
  (['L', 'R', 'B', 'T'] as const).forEach(e => { const tb = topAt(cont[e], spanX(e)); edgesTxt.push(`${e} ${cont[e] ? tb.txt : tb.txt + ' (nominal)'}`); });
  void sides;
  const nDisc = [cont.L, cont.R, cont.B, cont.T].filter(c => !c).length, adjacent = (!cont.L || !cont.R) && (!cont.B || !cont.T) && nDisc >= 2 && !(!cont.L && !cont.R) && !(!cont.B && !cont.T);
  const torsion = adjacent || (nDisc >= 2 && twoWay) ? `Torsion steel at discontinuous corners: 75% of the span steel (${bar(0.75 * sx, h).txt}) top and bottom over a corner zone of ${(lx / 5).toFixed(2)} m` : undefined;
  // shear, span/depth and cracking
  const V = 0.5 * n * lx * 1000, Asmin2 = Math.min(bx.As, by.As);
  const vEd = V / (1000 * dx);
  const vc = bs ? vcBS(Asmin2, 1000, dx, fcu) : Math.max(0.12 * Math.min(2, 1 + Math.sqrt(200 / dx)) * Math.cbrt(100 * Math.min(0.02, Asmin2 / (1000 * dx)) * m.fck), 0.035 * Math.pow(Math.min(2, 1 + Math.sqrt(200 / dx)), 1.5) * Math.sqrt(m.fck));
  if (vEd > vc) { notes.push('Shear exceeds slab capacity: increase thickness'); status = 'bad'; }
  const supports = (cl.wide ? [cont.L, cont.R] : [cont.B, cont.T]).filter(Boolean).length, ldA = (lx * 1000) / dx;
  const ldOk = bs ? (supports === 0 ? 20 : 26) * mfBS(Math.max(mxPos, 1e-3) * 1e6, 1000, dx, m.fyk, Math.max(aPx ?? sx, 1), bx.As) : allowedSpanDepth({ K: supports === 2 ? 1.5 : supports === 1 ? 1.3 : 1, fck: m.fck, rho: Math.max(aPx ?? sx, 1) / (1000 * dx), AsReq: Math.max(aPx ?? sx, 1), AsProv: bx.As, fyk: m.fyk, L: lx });
  if (ldA > ldOk) { notes.push(`Span/depth ${ldA.toFixed(1)} exceeds ${ldOk.toFixed(1)}: thicken the slab`); if (status === 'ok') status = 'warn'; }
  const sv = bs ? (gk + imposed) / n : (gk + 0.3 * imposed) / n;
  const ck = (M: number, as: ReturnType<typeof bar>, d: number) => (M <= 0 ? 0 : bs ? crackBS({ M: M * sv * 1e6, b: 1000, h, d, As: as.As, phi: as.phi, spacing: as.s, cmin: 25, fcu }).wk : crackWidth({ M: M * sv * 1e6, b: 1000, h, d, As: as.As, phi: as.phi, spacing: as.s, cover: 25, fck: m.fck }).wk);
  const wk = Math.max(ck(mxPos, bx, dx), ck(myPos, by, dy), ck(mxNeg, topAt(true, true), dx));
  if (wk > 0.3) { notes.push(`Crack width ${wk.toFixed(2)} mm exceeds 0.3 mm: use closer bar spacing`); if (status === 'ok') status = 'warn'; }
  const kg = (a: number, w: number, len: number) => (a * w * len * 1000 * 7850) / 1e9;
  const steelKg = 1.1 * (kg(bx.As, ly, lx) + kg(by.As, lx, ly) + (['L', 'R', 'B', 'T'] as const).reduce((s, e) => { const tb = topAt(cont[e], spanX(e)), len = e === 'L' || e === 'R' ? b.d : b.w, reach = spanX(e) ? lx : ly; return s + kg(tb.As, len, 0.3 * reach); }, 0));
  const steps = [`${label}: ${b.w.toFixed(2)} × ${b.d.toFixed(2)} m, ly/lx = ${ratio.toFixed(2)}, edges continuous L ${cont.L ? 'yes' : 'no'}, R ${cont.R ? 'yes' : 'no'}, B ${cont.B ? 'yes' : 'no'}, T ${cont.T ? 'yes' : 'no'}: ${name}`,
    `Load n = ${gG} (25 h + 2.5) + ${gQ} qk = ${n.toFixed(2)} kN/m² (h = ${h} mm)`,
    `Moments m = β n lx² (kNm/m): x-direction support ${mxNeg.toFixed(1)}, span ${mxPos.toFixed(1)}; y-direction support ${myNeg.toFixed(1)}, span ${myPos.toFixed(1)}`,
    `Steel: bottom ${bx.txt} (short span) and ${by.txt} (long span); top at edges ${edgesTxt.join(', ')}`, ...(torsion ? [torsion] : []),
    `Shear v = ${vEd.toFixed(2)} N/mm² vs capacity ${vc.toFixed(2)}; span/depth ${ldA.toFixed(1)} vs ${ldOk.toFixed(1)}; crack width ${wk.toFixed(2)} mm`];
  return { label, x0: b.x0, y0: b.y0, w: b.w, d: b.d, type: name, cont, lx, ly, mxNeg, mxPos, myNeg, myPos, bottomX: bx.txt, bottomY: by.txt, topEdges: edgesTxt.join(', '), torsion, status, notes, steps, steelKg, ld: ldA, ldAllowed: ldOk, wk };
}

// punching shear at a flat-slab column (EC2 6.4 or BS 8110 3.7.7)
export function punching(id: string, kind: Punch['kind'], c1: number, c2: number, d: number, n: number, Vtrib: number, spanM: number, m: Mat, story?: string): Punch {
  const bs = bsOf(m), fcu = fcuOf(m.fck), steps: string[] = [], notes: string[] = [];
  const Mstrip = 0.122 * n * spanM * spanM, asr = flex(Mstrip * 1e6, d, m, d + 35) ?? 0.02 * 1000 * d, rho = Math.min(0.02, asr / (1000 * d));
  const beta = bs ? (kind === 'interior' ? 1.15 : 1.25) : kind === 'interior' ? 1.15 : kind === 'edge' ? 1.4 : 1.5;
  const k = Math.min(2, 1 + Math.sqrt(200 / d));
  let u: number, Ain = 0, u0: number;
  if (bs) { u = kind === 'interior' ? 2 * (c1 + c2) + 12 * d : kind === 'edge' ? c1 + 2 * c2 + 6 * d : c1 + c2 + 3 * d; if (kind === 'interior') Ain = (c1 + 3 * d) * (c2 + 3 * d) / 1e6; }
  else { u = kind === 'interior' ? 2 * (c1 + c2) + 4 * Math.PI * d : kind === 'edge' ? c1 + 2 * c2 + 2 * Math.PI * d : c1 + c2 + Math.PI * d; if (kind === 'interior') Ain = (c1 * c2 + 4 * d * (c1 + c2) + Math.PI * 4 * d * d) / 1e6; }
  u0 = kind === 'interior' ? 2 * (c1 + c2) : kind === 'edge' ? c1 + 2 * c2 : c1 + c2;
  const Vred = Math.max(0, Vtrib - n * Ain) * 1e3, vEd = (beta * Vred) / (u * d);
  const vRd = bs ? vcBS(asr, 1000, d, fcu) : Math.max(0.12 * k * Math.cbrt(100 * rho * m.fck), 0.035 * Math.pow(k, 1.5) * Math.sqrt(m.fck));
  const vMax = (beta * Vtrib * 1e3) / (u0 * d), vMaxRd = bs ? Math.min(0.8 * Math.sqrt(fcu), 5) : 0.5 * 0.6 * (1 - m.fck / 250) * ((0.85 * m.fck) / 1.5);
  const lim = bs ? 1.6 : 1.5, ratio = vEd / vRd;
  let status: Status = 'ok';
  if (vMax > vMaxRd || vEd > lim * vRd) { status = 'bad'; notes.push('Punching capacity exceeded even with shear reinforcement: thicken the slab, add a drop panel or column head, or enlarge the column'); }
  else if (vEd > vRd) { status = 'warn'; notes.push('Needs punching shear reinforcement (links or studs), or a thicker slab, drop panel or column head'); }
  steps.push(`${kind} column ${c1} × ${c2} mm, d = ${Math.round(d)} mm, load from the surrounding bays V = ${Vtrib.toFixed(0)} kN, β = ${beta}`,
    `Control perimeter ${bs ? '1.5d' : '2d'}: u = ${Math.round(u)} mm; load inside the perimeter deducted for interior columns; v_Ed = β V/(u d) = ${vEd.toFixed(2)} N/mm²`,
    `Column strip hogging moment ≈ 0.122 n l² = ${Mstrip.toFixed(0)} kNm/m gives ρ = ${(rho * 100).toFixed(2)}%; ${bs ? 'v_c' : 'v_Rd,c'} = ${vRd.toFixed(2)} N/mm² (${bs ? 'BS 8110 cl 3.7.7' : 'EC2 6.4.4'}); ratio ${ratio.toFixed(2)}`,
    `Face check: v = ${vMax.toFixed(2)} against maximum ${vMaxRd.toFixed(2)} N/mm²`);
  return { id, story, kind, c1, c2, V: Vtrib, vEd, vRd, vMax, vMaxRd, ratio, status, notes, steps };
}

export function designSlabPanels(g: Group, lib: Lib[], m: Mat, o: { imposed: number }): SlabStorey {
  const cols = g.els.filter(e => e.type === 'column'), hasBeams = g.els.some(e => e.type === 'beam'), cells = bays(cols), story = g.story.name;
  if (!cells.length) return { story, mode: 'none', h: 0, panels: [], punching: [], steelKg: 0, concreteM3: 0, notes: ['Needs a column grid (at least two columns in each direction) to form slab panels.'] };
  const slabs = g.els.filter(e => e.type === 'slab'), hFixed = slabs.length ? (slabs.reduce((a, s) => a + (s.geometry.z1 - s.geometry.z0), 0) / slabs.length) * 1000 : undefined;
  const key = (i: number, j: number) => `${i},${j}`, have = new Set(cells.map(c => key(c.i, c.j))), bs = bsOf(m), gG = bs ? 1.4 : 1.35, gQ = bs ? 1.6 : 1.5;
  if (!hasBeams) {                                       // flat slab: punching governs the thickness
    const span = Math.max(...cells.map(c => Math.max(c.w, c.d))), hMin = Math.max(200, Math.ceil(((span * 1000) / 24 + 35) / 25) * 25), notes = ['Flat slab (no beams): punching is checked here; bending comes from the equivalent frame (column and middle strips) shown below.'];
    const specOf = (e: El) => lib.find(l => l.id === e.library_item_id)?.specs ?? {};
    const run = (h: number) => {
      const n = gG * (25 * (h / 1000) + 2.5) + gQ * o.imposed, d = h - 35;
      return cols.map(c => {
        const [x, y] = c.geometry.at as number[], adj = cells.filter(b => Math.abs(b.x0 - x) < 0.3 || Math.abs(b.x0 + b.w - x) < 0.3).filter(b => Math.abs(b.y0 - y) < 0.3 || Math.abs(b.y0 + b.d - y) < 0.3);
        const kind: Punch['kind'] = adj.length >= 4 ? 'interior' : adj.length === 2 ? 'edge' : 'corner', sp = specOf(c), c1 = sp.b_mm ?? c.geometry.b * 1000, c2 = sp.h_mm ?? c.geometry.h * 1000;
        const V = adj.reduce((a, b) => a + (b.w * b.d) / 4, 0) * n;
        return punching(c.id, kind, c1, c2, d, n, V, Math.max(...adj.map(b => Math.max(b.w, b.d)), 1), m, story);
      });
    };
    const h = hFixed ? Math.round(hFixed) : hMin; let hNo: number | undefined; for (let t = Math.max(h, hMin); t <= 500; t += 25) if (run(t).every(p => p.status === 'ok')) { hNo = t; break; }
    return { story, mode: 'flat', h, panels: [], punching: run(h), steelKg: 0, concreteM3: cells.reduce((a, c) => a + c.w * c.d * (h / 1000), 0), hNoLinks: hNo, notes };
  }
  const hReq = Math.max(150, ...cells.map(c => Math.ceil((Math.min(c.w, c.d) * 1000 / 26 + 35) / 25) * 25)), h = hFixed ? Math.round(hFixed) : hReq;
  const L = (i: number) => String.fromCharCode(65 + (i % 26));
  const panels = cells.map(c => designPanel(`${L(c.i)}${c.j + 1}`, c, { L: have.has(key(c.i - 1, c.j)), R: have.has(key(c.i + 1, c.j)), B: have.has(key(c.i, c.j - 1)), T: have.has(key(c.i, c.j + 1)) }, h, m, o.imposed, hFixed));
  const notes: string[] = []; if (hFixed && hFixed < hReq) notes.push(`Drawn slab ${Math.round(hFixed)} mm is thinner than the span/depth guide (${hReq} mm): check deflection.`);
  return { story, mode: 'panels', h, panels, punching: [], steelKg: panels.reduce((a, p) => a + p.steelKg, 0), concreteM3: cells.reduce((a, c) => a + c.w * c.d * (h / 1000), 0), notes };
}
