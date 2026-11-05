// Wind (EN 1991-1-4) and equivalent-static seismic (EN 1998-1) loading with a stiffness-based distribution to the columns.
// Frame stiffness by the D-value (Muto) method with a rigid diaphragm and accidental torsion; column checks under the
// wind and seismic combinations. Preliminary: a shear-building model, not a 3D analysis. Verify with a full frame model.
import type { El, Lib } from './engineering';
import { colMoment, Design } from './design';
import { colMomentBS, fcuOf } from './bs8110';
import { beamSec, Group, planBox, wallT } from './model';
import { area, COVER, LINK, Mat, Status } from './rc';
import { ecm } from './serviceability';
import type { Eff } from './combos';

export type WindInput = { vb: number; terrain: 0 | 1 | 2 | 3 | 4 };
export type SeismicInput = { agG: number; ground: 'A' | 'B' | 'C' | 'D' | 'E'; q: number; psi2: number };
export type LateralInput = { imposed: number; wind?: WindInput; seismic?: SeismicInput; base?: 'fixed' | 'pinned' };   // base: ground-storey column bases fixed by ground beams or a raft, or pinned (isolated pads)
const TERRAIN = [{ z0: 0.003, zmin: 1 }, { z0: 0.01, zmin: 1 }, { z0: 0.05, zmin: 2 }, { z0: 0.3, zmin: 5 }, { z0: 1.0, zmin: 10 }];
export const TERRAIN_NAMES = ['0 sea', 'I open', 'II farmland', 'III suburban', 'IV urban'];
const GROUND = { A: { S: 1.0, TB: 0.15, TC: 0.4, TD: 2 }, B: { S: 1.2, TB: 0.15, TC: 0.5, TD: 2 }, C: { S: 1.15, TB: 0.2, TC: 0.6, TD: 2 }, D: { S: 1.35, TB: 0.2, TC: 0.8, TD: 2 }, E: { S: 1.4, TB: 0.15, TC: 0.5, TD: 2 } };

// peak velocity pressure (Pa) at height z (EN 1991-1-4 4.5): qp = (1 + 7 Iv) ½ ρ vm², ρ = 1.25 kg/m³
export function windQp(z: number, vb: number, terrain: number) {
  const { z0, zmin } = TERRAIN[terrain], ze = Math.max(z, zmin), kr = 0.19 * Math.pow(z0 / 0.05, 0.07), vm = kr * Math.log(ze / z0) * vb, iv = 1 / Math.log(ze / z0);
  return (1 + 7 * iv) * 0.5 * 1.25 * vm * vm;
}
// net force coefficient of a rectangular building: windward D plus leeward E (EN 1991-1-4 Table 7.1), by h/d
export function windCf(hd: number) {
  const li = (x: number, p: [number, number][]) => { const c = Math.min(5, Math.max(0.25, x)); for (let i = 0; i < p.length - 1; i++) if (c <= p[i + 1][0]) return p[i][1] + ((p[i + 1][1] - p[i][1]) * (c - p[i][0])) / (p[i + 1][0] - p[i][0]); return p[p.length - 1][1]; };
  return li(hd, [[0.25, 0.7], [1, 0.8], [5, 0.8]]) + Math.abs(li(hd, [[0.25, -0.3], [1, -0.5], [5, -0.7]]));
}
// EC8 type 1 design spectrum Sd(T) in units of g
export function seismicSd(T: number, agG: number, ground: keyof typeof GROUND, q: number) {
  const { S, TB, TC, TD } = GROUND[ground], a = agG * S;
  if (T <= TB) return a * (2 / 3 + (T / TB) * (2.5 / q - 2 / 3));
  if (T <= TC) return (a * 2.5) / q;
  return Math.max(T <= TD ? ((a * 2.5) / q) * (TC / T) : ((a * 2.5) / q) * ((TC * TD) / (T * T)), 0.2 * agG);
}

// what the 3D core and P-delta analysis (lib/core3d.ts) needs from this model
export type Model3D = { h: number[]; P: number[]; xm: number[]; ym: number[]; r2: number[]; box: [number, number, number, number][]; ref: [number, number]; E: number; frame: { id: string; k: number; x: number; y: number; Dx: number; Dy: number }[] };
type CInfo = { id: string; k: number; x: number; y: number; b: number; h: number };
export type CaseRes = { name: string; dir: 'x' | 'y'; kind: 'wind' | 'seismic'; forces: number[]; shears: number[]; drift: number[]; driftRatio: number[]; topDrift: number; maxRatio: number; limitText: string; status: Status; baseShear: number; baseMoment: number; stability: number; limit: number };
export type ColCheck = { lat: { Vx: number; Vy: number; dN: number }; id: string; story: string; b: number; h: number; N: number; Mx: number; My: number; combo: string; util: number; AsProv: number; AsReq: number; bars: string; status: Status; notes: string[] };
export type LateralResult = { foundation: Record<string, { G: number; Q: number; effs: Eff[] }>; storeys: { name: string; top: number; height: number; W: number }[]; cases: CaseRes[]; columns: ColCheck[]; wind?: { qpTop: number; cf: { x: number; y: number }; vb: number }; seismic?: { T1: number; Sd: number; lambda: number; Fb: number; W: number }; seismicInput?: SeismicInput; model3d: Model3D; notes: string[] };

export function lateralAnalysis(groups: Group[], lib: Lib[], m: Mat, grav: Design, o: LateralInput): LateralResult {
  const gs = [...groups].sort((a, b) => a.story.elevation_m - b.story.elevation_m), n = gs.length, notes: string[] = [];
  const pinned = o.base === 'pinned', bs = m.code === 'BS8110', specOf = (e: El) => lib.find(l => l.id === e.library_item_id)?.specs ?? {}, E = ecm(m.fck) * 1000, EIf = 0.5;
  const all = gs.flatMap(g => g.els), ext = planBox(all), Hs = gs.map(g => g.story.height_m), tops = gs.map((g, k) => g.story.elevation_m + Hs[k]), Htot = tops[n - 1];
  // weights per storey
  const W = gs.map((g, k) => {
    const box = planBox(g.els), slabT = grav.stories[k]?.slabT ?? 0.2, gk = 25 * slabT + 2.5, len = (e: El) => Math.hypot(e.geometry.end[0] - e.geometry.start[0], e.geometry.end[1] - e.geometry.start[1]);
    const beams = g.els.filter(e => e.type === 'beam').reduce((a, e) => { const { b, d } = beamSec(e.geometry, specOf(e)); return a + 25 * b * d * len(e); }, 0);
    const cols = g.els.filter(e => e.type === 'column').reduce((a, e) => { const s = specOf(e); return a + 25 * ((s.b_mm ?? e.geometry.b * 1000) / 1000) * ((s.h_mm ?? e.geometry.h * 1000) / 1000) * Hs[k]; }, 0);
    const op = g.els.filter(e => e.type === 'door' || e.type === 'window').reduce((a, e) => a + e.geometry.width_m * (e.type === 'door' ? 2.1 : 1.2), 0);
    const walls = Math.max(0, g.els.filter(e => e.type === 'wall').reduce((a, e) => a + len(e) * e.geometry.height * 18 * wallT(e.geometry), 0) - op * 18 * 0.2);
    return { dead: box.area * gk + beams + cols + walls, live: box.area * o.imposed };
  });
  // columns and their lateral stiffness (D-value method)
  const infos: CInfo[] = gs.flatMap((g, k) => g.els.filter(e => e.type === 'column').map(e => { const s = specOf(e); return { id: e.id, k, x: e.geometry.at[0], y: e.geometry.at[1], b: (s.b_mm ?? e.geometry.b * 1000) / 1000, h: (s.h_mm ?? e.geometry.h * 1000) / 1000 }; }));
  const near = (p: number[], c: CInfo) => Math.hypot(p[0] - c.x, p[1] - c.y) < 0.25;
  const D = (c: CInfo, dir: 'x' | 'y') => {
    const Ic = dir === 'x' ? (c.h * c.b ** 3) / 12 : (c.b * c.h ** 3) / 12, kc = (E * EIf * Ic) / Hs[c.k];
    const kb = (k: number) => k < 0 ? 0 : gs[k].els.filter(e => e.type === 'beam').reduce((a, e) => {
      const g = e.geometry, ends = [g.start, g.end]; if (!ends.some(p => near(p, c))) return a;
      const L = Math.hypot(g.end[0] - g.start[0], g.end[1] - g.start[1]), { b, d } = beamSec(g, specOf(e)), cs = Math.abs(dir === 'x' ? (g.end[0] - g.start[0]) / L : (g.end[1] - g.start[1]) / L);
      return a + ((E * EIf * (b * d ** 3) / 12) / L) * cs * cs;
    }, 0);
    let Kbar = c.k === 0 ? kb(0) / kc : (kb(c.k) + kb(c.k - 1)) / (2 * kc);
    if (gs[c.k].els.every(e => e.type !== 'beam')) Kbar = 1;                                  // flat slab: assume slab strips give K = 1
    const a = c.k === 0 ? (pinned ? (0.5 * Kbar) / (1 + 2 * Kbar) : (0.5 + Kbar) / (2 + Kbar)) : Kbar / (2 + Kbar);
    return (Math.max(0.15, a) * 12 * kc) / Hs[c.k] ** 2;                                         // D = a · 12 E I / h³
  };
  const Dx = infos.map(c => D(c, 'x')), Dy = infos.map(c => D(c, 'y'));
  if (gs.some(g => g.els.every(e => e.type !== 'beam'))) notes.push('A storey without beams uses an assumed slab-strip stiffness (K̄ = 1): confirm with a frame model.');

  // distribute storey forces to columns (rigid diaphragm, accidental eccentricity ±5%)
  const distribute = (F: number[], dir: 'x' | 'y', name: string, kind: 'wind' | 'seismic'): { res: CaseRes; col: Map<string, { Vx: number; Vy: number; dN: number; dNs: number; Mb: number; Mbase: number }> } => {
    const col = new Map<string, { Vx: number; Vy: number; dN: number; dNs: number; Mb: number; Mbase: number }>(), drift: number[] = [], shears: number[] = [];
    for (let k = 0; k < n; k++) {
      const V = F.slice(k).reduce((a, b) => a + b, 0); shears.push(V);
      const idx = infos.map((c, i) => (c.k === k ? i : -1)).filter(i => i >= 0); if (!idx.length) { drift.push(0); continue; }
      const sx = idx.reduce((a, i) => a + Dx[i], 0), sy = idx.reduce((a, i) => a + Dy[i], 0), xR = idx.reduce((a, i) => a + Dy[i] * infos[i].x, 0) / sy, yR = idx.reduce((a, i) => a + Dx[i] * infos[i].y, 0) / sx;
      const kb = planBox(gs[k].els), xs = infos.filter(c => c.k === k).map(c => c.x), ys = infos.filter(c => c.k === k).map(c => c.y);
      const xm = (Math.min(...xs) + Math.max(...xs)) / 2, ym = (Math.min(...ys) + Math.max(...ys)) / 2, ex = 0.05 * (Math.max(...xs) - Math.min(...xs)), ey = 0.05 * (Math.max(...ys) - Math.min(...ys));
      const J = idx.reduce((a, i) => a + Dx[i] * (infos[i].y - yR) ** 2 + Dy[i] * (infos[i].x - xR) ** 2, 0) || 1e-9;
      const yI = k === 0 ? (pinned ? 1 : 0.65) : 0.5; let maxD = 0; void kb;
      // overturning axial forces at the base of this storey
      const Mot = F.slice(k).reduce((a, f, j) => a + f * (tops[k + j] - gs[k].story.elevation_m), 0);
      const mean = idx.reduce((a, i) => a + (dir === 'x' ? infos[i].x : infos[i].y), 0) / idx.length, Sdd = idx.reduce((a, i) => a + infos[i].b * infos[i].h * ((dir === 'x' ? infos[i].x : infos[i].y) - mean) ** 2, 0) || 1e-9;
      for (const sg of [1, -1]) for (const i of idx) {
        const c = infos[i]; let Vx: number, Vy: number;
        if (dir === 'x') { const yF = ym + sg * ey, th = (-V * (yF - yR)) / J; Vx = (V * Dx[i]) / sx - Dx[i] * th * (c.y - yR); Vy = Dy[i] * th * (c.x - xR); }
        else { const xF = xm + sg * ex, th = (V * (xF - xR)) / J; Vx = -Dx[i] * th * (c.y - yR); Vy = (V * Dy[i]) / sy + Dy[i] * th * (c.x - xR); }
        const dN = (Mot * c.b * c.h * ((dir === 'x' ? c.x : c.y) - mean)) / Sdd, cur = col.get(c.id) ?? { Vx: 0, Vy: 0, dN: 0, dNs: 0, Mb: 0, Mbase: 0 };
        col.set(c.id, { Vx: Math.max(cur.Vx, Math.abs(Vx)), Vy: Math.max(cur.Vy, Math.abs(Vy)), dN: Math.max(cur.dN, Math.abs(dN)), dNs: dN, Mb: Math.max(yI, 1 - yI) * Hs[k], Mbase: k === 0 ? (pinned ? 0 : 0.65 * Hs[0]) : 0 });
        maxD = Math.max(maxD, Math.abs(dir === 'x' ? Vx / Dx[i] : Vy / Dy[i]));
      }
      drift.push(maxD);
    }
    const ratio = drift.map((d, k) => d / Hs[k]), top = drift.reduce((a, b) => a + b, 0);
    const lim = kind === 'wind' ? 1 / 500 : 0.005 / (0.5 * (o.seismic?.q ?? 1.5));                        // wind h/500; seismic ν q d_e ≤ 0.005 h with ν = 0.5
    const maxRatio = Math.max(...ratio), moment = F.reduce((a, f, j) => a + f * tops[j], 0), restoring = (kind === 'wind' ? (bs ? 1.0 : 0.9) : 1.0) * W.reduce((a, w) => a + w.dead, 0) * ((dir === 'x' ? ext.w : ext.d) / 2);
    const gamma = kind === 'wind' ? (bs ? 1.4 : 1.5) : 1.0, stab = restoring / Math.max(gamma * moment, 1e-9);
    const status: Status = maxRatio > lim * 1.25 || stab < 1 ? 'bad' : maxRatio > lim ? 'warn' : 'ok';
    return { col, res: { name, dir, kind, forces: F, shears, drift, driftRatio: ratio, topDrift: top, maxRatio, limitText: kind === 'wind' ? 'h/500' : 'ν q d_e ≤ 0.005h', status, baseShear: shears[0], baseMoment: moment, stability: stab, limit: lim } };
  };

  const cases: CaseRes[] = [], effects: { name: string; kind: 'wind' | 'seismic'; dir: 'x' | 'y'; col: Map<string, { Vx: number; Vy: number; dN: number; dNs: number; Mb: number; Mbase: number }> }[] = [];
  let windInfo: LateralResult['wind'], seisInfo: LateralResult['seismic'];
  if (o.wind) {
    const { vb, terrain } = o.wind, qps = tops.map(z => windQp(z, vb, terrain));
    const cfx = windCf(Htot / Math.max(ext.w, 1)), cfy = windCf(Htot / Math.max(ext.d, 1));
    windInfo = { qpTop: qps[n - 1], cf: { x: cfx, y: cfy }, vb };
    for (const dir of ['x', 'y'] as const) {
      const B = dir === 'x' ? ext.d : ext.w, cf = dir === 'x' ? cfx : cfy, F = qps.map((q, k) => (cf * q * B * Hs[k]) / 1000), r = distribute(F, dir, `Wind along ${dir}`, 'wind');
      cases.push(r.res); effects.push({ name: r.res.name, kind: 'wind', dir, col: r.col });
    }
    if (Htot > 15) notes.push('Building taller than 15 m: the dynamic factor cs·cd is taken as 1.0; EN 1991-1-4 section 6 needs checking.');
  }
  if (o.seismic) {
    const { agG, ground, q, psi2 } = o.seismic, mass = W.map(w => w.dead + psi2 * w.live), Wt = mass.reduce((a, b) => a + b, 0), T1 = 0.075 * Math.pow(Htot, 0.75), TC = GROUND[ground].TC;
    const Sd = seismicSd(T1, agG, ground, q), lambda = T1 <= 2 * TC && n > 2 ? 0.85 : 1, Fb = Sd * Wt * lambda, zm = tops.map((z, k) => z * mass[k]), sz = zm.reduce((a, b) => a + b, 0), F = zm.map(v => (Fb * v) / sz);
    seisInfo = { T1, Sd, lambda, Fb, W: Wt };
    for (const dir of ['x', 'y'] as const) { const r = distribute(F, dir, `Earthquake along ${dir}`, 'seismic'); cases.push(r.res); effects.push({ name: r.res.name, kind: 'seismic', dir, col: r.col }); }
    notes.push('Seismic: force-based equivalent static method for low ductility (DCL). Ductile detailing, capacity design and regularity checks (EN 1998-1 section 5) are not included.');
    if (bs) notes.push('BS 8110 has no seismic provisions: EN 1998-1 actions are used with BS 8110 section capacities.');
  }
  if (pinned) notes.push('Ground-storey column bases are taken as pinned (isolated pads): the base moment is zero and the first-storey columns carry the shear moment at their tops. Pads then resist shear and overturning axial force only.');
  if (bs && o.wind) notes.push('Wind pressures follow EN 1991-1-4; BS 8110 load factors (1.2, 1.4) are used in the combinations. Replace with BS 6399-2 pressures if your approval authority requires them.');

  // column checks under the combinations
  const dsg = Object.fromEntries(grav.cols.map(c => [c.id, c])), fcd = (0.85 * m.fck) / 1.5, fyd = m.fyk / 1.15, fcu = fcuOf(m.fck), d1 = COVER + LINK + 10, columns: ColCheck[] = [];
  const cap = (b: number, h: number, As: number, N: number) => (bs ? colMomentBS(b, h, d1, As, fcu, m.fyk, N) : colMoment(b, h, d1, As, fcd, fyd, N));
  const gG = bs ? 1.4 : 1.35, psi0 = 0.7;
  for (const c of infos) {
    const g = dsg[c.id]; if (!g || g.Gk === undefined) continue;
    const G = g.Gk, Q = g.Qk ?? 0, combos: { name: string; N: number; Mx: number; My: number }[] = [];
    for (const ef of effects) {
      const f = ef.col.get(c.id); if (!f) continue;
      const Mx = f.Vx * f.Mb, My = f.Vy * f.Mb;                       // Vx bends the column in the x-z plane (depth = b), Vy in the y-z plane (depth = h)
      for (const sg of [1, -1]) {
        if (ef.kind === 'wind') {
          if (bs) { combos.push({ name: `${ef.name}: 1.2 (G + Q + W)`, N: 1.2 * (G + Q) + sg * 1.2 * f.dN, Mx: 1.2 * Mx, My: 1.2 * My }, { name: `${ef.name}: 1.4 G + 1.4 W`, N: 1.4 * G + sg * 1.4 * f.dN, Mx: 1.4 * Mx, My: 1.4 * My }); }
          else { combos.push({ name: `${ef.name}: 1.35 G + 1.05 Q + 1.5 W`, N: gG * G + 1.5 * psi0 * Q + sg * 1.5 * f.dN, Mx: 1.5 * Mx, My: 1.5 * My }, { name: `${ef.name}: 1.0 G + 1.5 W`, N: G + sg * 1.5 * f.dN, Mx: 1.5 * Mx, My: 1.5 * My }); }
        } else combos.push({ name: `${ef.name}: G + ψ2 Q + E`, N: G + o.seismic!.psi2 * Q + sg * f.dN, Mx, My });
      }
    }
    const e0 = (dim: number) => Math.max(dim / (bs ? 20 : 30), bs ? 0 : 0.02);
    const util = (As: number) => { let u = 0, who = '', worst = { N: 0, Mx: 0, My: 0 }; for (const cb of combos) {
      const N = Math.max(cb.N, 0) * 1e3, Mrx = cap(c.h * 1000, c.b * 1000, As, N) / 1e6, Mry = cap(c.b * 1000, c.h * 1000, As, N) / 1e6;
      const mx = Math.max(cb.Mx, (N / 1e3) * e0(c.b)), my = Math.max(cb.My, (N / 1e3) * e0(c.h)), v = Mrx <= 0 || Mry <= 0 ? 9.99 : mx / Mrx + my / Mry;
      if (cb.N < 0 && Math.abs(cb.N) > 0) { if (v < 9.99) { /* net tension: flag below */ } }
      if (v > u) { u = v; who = cb.name; worst = { N: cb.N, Mx: mx, My: my }; } } return { u, who, worst }; };
    if (!combos.length) continue;
    const Ac = c.b * c.h * 1e6, maxAs = (bs ? 0.06 : 0.04) * Ac, prov = g.AsProv, notesC: string[] = [];
    let u0 = util(prov), As = prov, status: Status = 'ok';
    if (u0.u > 1) { let lo = prov, hi = maxAs; if (util(hi).u > 1) { status = 'bad'; As = hi; notesC.push('Even with the maximum steel the column cannot carry the lateral combination: enlarge the section'); } else { for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; util(mid).u <= 1 ? (hi = mid) : (lo = mid); } As = hi; status = 'warn'; notesC.push('Lateral loading needs more vertical steel than the gravity design'); } }
    const minN = Math.min(...combos.map(x => x.N)); if (minN < 0) { notesC.push(`Net uplift ${Math.abs(minN).toFixed(0)} kN under a lateral combination: check the column tension and the foundation`); if (status === 'ok') status = 'warn'; }
    const w = util(As), options: [number, number][] = [];
    for (const nb of [4, 6, 8, 10, 12]) for (const dia of [16, 20, 25, 32]) options.push([nb, dia]);
    options.sort((p, q) => p[0] * area(p[1]) - q[0] * area(q[1]));
    const pick = options.find(([nb, dia]) => nb * area(dia) >= As) ?? [12, 32];
    const lat = { Vx: 0, Vy: 0, dN: 0 }; for (const ef of effects) { const f = ef.col.get(c.id); if (f) { lat.Vx = Math.max(lat.Vx, f.Vx); lat.Vy = Math.max(lat.Vy, f.Vy); lat.dN = Math.max(lat.dN, f.dN); } }
    columns.push({ lat, id: c.id, story: gs[c.k].story.name, b: c.b * 1000, h: c.h * 1000, N: w.worst.N, Mx: w.worst.Mx, My: w.worst.My, combo: w.who, util: u0.u, AsProv: prov, AsReq: As, bars: `${pick[0]}T${pick[1]}`, status, notes: notesC });
  }
  const foundation: LateralResult['foundation'] = {};
  for (const c of infos) if (c.k === 0 && dsg[c.id]?.Gk !== undefined) foundation[c.id] = { G: dsg[c.id].Gk!, Q: dsg[c.id].Qk ?? 0, effs: effects.map(ef => { const f = ef.col.get(c.id)!; return { name: ef.name, kind: ef.kind, dir: ef.dir, dNs: f.dNs, Vx: f.Vx, Vy: f.Vy, Mb: f.Mbase }; }) };
  const psiP = o.seismic?.psi2 ?? 0.3, boxes = gs.map(g => planBox(g.els));
  const model3d: Model3D = {
    h: Hs, P: W.map(w => w.dead + psiP * w.live), xm: boxes.map(b => b.x0 + b.w / 2), ym: boxes.map(b => b.y0 + b.d / 2), r2: boxes.map(b => (b.w ** 2 + b.d ** 2) / 12),
    box: boxes.map(b => [b.x0, b.y0, b.x0 + b.w, b.y0 + b.d] as [number, number, number, number]), ref: [ext.x0 + ext.w / 2, ext.y0 + ext.d / 2], E: E * EIf,
    frame: infos.map((c, i) => ({ id: c.id, k: c.k, x: c.x, y: c.y, Dx: Dx[i], Dy: Dy[i] })),
  };
  return { model3d, seismicInput: o.seismic, foundation, storeys: gs.map((g, k) => ({ name: g.story.name, top: tops[k], height: Hs[k], W: W[k].dead })), cases, columns, wind: windInfo, seismic: seisInfo, notes };
}
