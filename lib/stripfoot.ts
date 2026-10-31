// Combined and strip footings. Pads that would overlap are grouped; groups of columns in a line are designed as one rigid
// strip (combined footing for two columns): the footing is centred on the load resultant so the soil pressure is uniform,
// the longitudinal moment and shear come from statics, and bending, beam shear, transverse bending under each column and
// punching are checked. Two-dimensional clusters are flagged for a raft or foundation grid. Preliminary design.
import { area, Mat, Status } from './rc';
import { fcuOf, flexBS, vcBS } from './bs8110';
import { betaMoment } from './combos';

export type PadIn = { id: string; x: number; y: number; B: number; N: number; c1: number; c2: number };   // c1 along x, c2 along y (mm)
export type StripCol = { id: string; s: number; N: number; cAxis: number; cPerp: number };
export type StripResult = {
  id: string; kind: 'combined' | 'strip'; axis: 'x' | 'y'; columns: StripCol[]; L: number; B: number; h: number; pULS: number; pSLS: number;
  Msag: number; Mhog: number; Vmax: number; barsBottom: string; barsTop: string; barsTransverse: string; punchRatio: number; status: Status; notes: string[]; steps: string[];
  concreteM3: number; steelKg: number; diagram: { s: number; M: number; V: number }[]; lat?: { pmax: number; allow: number; govern: string; uplift: number; sliding: number; grewTo: string };
};
// one load combination for a strip: per column axial load N, in-plane moment Min and shear Vin (along the strip), transverse moment Mtr and shear Vtr
export type StripCombo = { name: string; ls: 'uls' | 'sls' | 'stab'; lateral: boolean; cols: { N: number; Min: number; Mtr: number; Vin: number; Vtr: number }[] };
export type Cluster = { ids: string[]; collinear: boolean; axis: 'x' | 'y'; deviation: number };

// pads overlap when their squares overlap in both directions
export function groupPads(pads: PadIn[]): Cluster[] {
  const par = pads.map((_, i) => i), find = (i: number): number => (par[i] === i ? i : (par[i] = find(par[i])));
  pads.forEach((a, i) => pads.forEach((b, j) => { if (j > i && Math.abs(a.x - b.x) < (a.B + b.B) / 2 && Math.abs(a.y - b.y) < (a.B + b.B) / 2) par[find(i)] = find(j); }));
  const groups = new Map<number, number[]>(); pads.forEach((_, i) => (groups.get(find(i)) ?? groups.set(find(i), []).get(find(i))!).push(i));
  return [...groups.values()].filter(g => g.length > 1).map(g => {
    const xs = g.map(i => pads[i].x), ys = g.map(i => pads[i].y), sx = Math.max(...xs) - Math.min(...xs), sy = Math.max(...ys) - Math.min(...ys), axis: 'x' | 'y' = sx >= sy ? 'x' : 'y', dev = axis === 'x' ? sy : sx;
    return { ids: g.map(i => pads[i].id), collinear: dev <= 0.6, axis, deviation: dev };
  });
}

const bsOf = (m: Mat) => m.code === 'BS8110';
export function flexW(Mknm: number, b: number, d: number, m: Mat, h: number): number | null {      // b, d in mm; moment in kNm
  const M = Mknm * 1e6;
  if (bsOf(m)) { const r = flexBS(M, b, d, fcuOf(m.fck), m.fyk, 58); return r.doubly ? null : Math.max(r.As, 0.0013 * b * h); }
  const K = M / (b * d * d * m.fck); if (K > 0.167) return null;
  const z = Math.min(0.95 * d, d * (0.5 + Math.sqrt(0.25 - K / 1.134)));
  return Math.max(M / ((m.fyk / 1.15) * z), (0.26 * 0.3 * Math.pow(m.fck, 2 / 3) * b * d) / m.fyk, 0.0013 * b * d);
}
export const vcap = (As: number, b: number, d: number, m: Mat) => {
  if (bsOf(m)) return vcBS(As, b, d, fcuOf(m.fck));
  const k = Math.min(2, 1 + Math.sqrt(200 / d)); return Math.max(0.12 * k * Math.cbrt(100 * Math.min(0.02, As / (b * d)) * m.fck), 0.035 * Math.pow(k, 1.5) * Math.sqrt(m.fck));
};
export const across = (As: number, Bm: number) => {
  for (const phi of [16, 20, 25, 32]) { const n = Math.max(2, Math.ceil(As / area(phi))), sp = (Bm * 1000 - 100) / (n - 1); if (sp >= 100) return { txt: `${n}T${phi}`, As: n * area(phi) }; }
  const n = Math.ceil(As / area(32)); return { txt: `${n}T32 (closely spaced)`, As: n * area(32) };
};
export const perM = (As: number) => { for (const phi of [12, 16, 20, 25]) { const s = Math.floor((area(phi) * 1000) / Math.max(As, 1) / 25) * 25; if (s >= 100) return { txt: `T${phi}@${Math.min(s, 300)}`, phi, As: (area(phi) * 1000) / Math.min(s, 300) }; } return { txt: 'T25@100', phi: 25, As: (area(25) * 1000) / 100 }; };

export function designStrip(id: string, axis: 'x' | 'y', cols: StripCol[], qAllow: number, m: Mat, lat: StripCombo[] = [], o: { qInc?: number; mu?: number } = {}): StripResult {
  const bs = bsOf(m), gf = bs ? 1.45 : 1.4, fcu = fcuOf(m.fck), notes: string[] = [], c = cols, qInc = o.qInc ?? 1.25, mu = o.mu ?? 0.5;   // c must be sorted by s
  const NT = c.reduce((a, k) => a + k.N, 0), sbar = c.reduce((a, k) => a + k.N * k.s, 0) / NT, first = c[0], last = c[c.length - 1];
  const half = Math.max(sbar - first.s + first.cAxis / 2000, last.s - sbar + last.cAxis / 2000) + 0.4, Lg = Math.ceil((2 * half) / 0.1 - 1e-9) / 10;
  const Bg = Math.max(0.9, Math.ceil(((NT / gf) * 1.1) / (qAllow * Lg) / 0.1 - 1e-9) / 10);
  const zero = (k: StripCol, n: number) => ({ N: n, Min: 0, Mtr: 0, Vin: 0, Vtr: 0 });
  const all: StripCombo[] = [{ name: 'Gravity (ULS)', ls: 'uls', lateral: false, cols: c.map(k => zero(k, k.N)) }, { name: 'Gravity (service)', ls: 'sls', lateral: false, cols: c.map(k => zero(k, k.N / gf)) }, ...lat];
  const uC = all.filter(x => x.ls === 'uls'), sC = all.filter(x => x.ls === 'sls'), stC = all.filter(x => x.ls === 'stab');
  // soil pressure, no-tension and bearing check of a plan size under the service combinations (footing weight 25 B L h included)
  const service = (L: number, B: number, h: number) => {
    let ok = true, worst = 0, gov = '';
    for (const cb of [...sC, ...uC.filter(x => x.lateral)]) {
      const s0 = sbar - L / 2, Nt = cb.cols.reduce((a, k) => a + k.N, 0) + (cb.ls === 'sls' ? 25 * B * L * h : 0);
      if (Nt <= 0) { ok = false; continue; }
      const Mc = cb.cols.reduce((a, k, i) => a + k.N * (c[i].s - s0 - L / 2) + k.Min + k.Vin * h, 0), Mt = cb.cols.reduce((a, k) => a + k.Mtr + k.Vtr * h, 0);
      const fr = Math.abs(Mc / Nt) / L + Math.abs(Mt / Nt) / B, p = (Nt / (B * L)) * (1 + 6 * fr), allow = cb.ls === 'uls' ? Infinity : qAllow * (cb.lateral ? qInc : 1);
      if (fr > 1 / 6 + 1e-9 || p > allow) ok = false; if (cb.ls === 'sls' && p / allow > worst) { worst = p / allow; gov = cb.name; }
    }
    return { ok, worst, gov };
  };
  // bending, shear, transverse bending and punching of a plan size for a set of ULS combinations; returns the first thickness that passes
  const design = (L: number, B: number, combos: StripCombo[], hFrom: number) => {
    const s0 = sbar - L / 2;
    for (let hm = hFrom; hm <= 1.6 + 1e-9; hm += 0.05) {
      const h = Math.round(hm * 100) / 100, d = h * 1000 - 58, b = B * 1000;
      let Msag = 0, Mhog = 0, V = 0, Nmax = c.map(() => 0), govM = 0, gov = combos[0], govDiag: StripResult['diagram'] = [], punchTxt = 0;
      for (const cb of combos) {
        const Nt = cb.cols.reduce((a, k) => a + k.N, 0), sp = c.map(k => k.s - s0), Mi = cb.cols.map(k => k.Min + k.Vin * h), Mc = cb.cols.reduce((a, k, i) => a + k.N * (sp[i] - L / 2) + Mi[i], 0), w0 = Nt / L, w1 = (12 * Mc) / L ** 3;
        const at = (t: number, side: 'l' | 'r') => { let M = (w0 * t * t) / 2 + w1 * (t ** 3 / 6 - (L * t * t) / 4), Vt = w0 * t + w1 * (t * t / 2 - (L * t) / 2); cb.cols.forEach((k, i) => { if (sp[i] < t - 1e-9 || (side === 'r' && Math.abs(sp[i] - t) < 1e-9)) { M += -k.N * (t - sp[i]) + Mi[i]; Vt -= k.N; } }); return { M, V: Vt }; };
        const diag: StripResult['diagram'] = []; let lo = 0, hi = 0;
        for (let t = 0; t <= L + 1e-9; t += 0.05) { const r = at(Math.min(t, L), 'l'); hi = Math.max(hi, r.M); lo = Math.min(lo, r.M); if (diag.length < 400) diag.push({ s: t, M: r.M, V: r.V }); }
        sp.forEach(x => { const r = at(x, 'l'), r2 = at(x, 'r'); hi = Math.max(hi, r.M, r2.M); lo = Math.min(lo, r.M, r2.M); });
        Msag = Math.max(Msag, hi); Mhog = Math.max(Mhog, -lo); if (Math.max(hi, -lo) >= govM) { govM = Math.max(hi, -lo); gov = cb; govDiag = diag; }
        c.forEach((k, i) => { Nmax[i] = Math.max(Nmax[i], cb.cols[i].N); for (const sg of [-1, 1]) { const t = sp[i] + sg * (k.cAxis / 2000 + d / 1000); if (t > 0 && t < L) V = Math.max(V, Math.abs(at(t, sg < 0 ? 'l' : 'r').V)); } });
      }
      const AsB = flexW(Msag, b, d, m, h * 1000), AsT = flexW(Mhog, b, d, m, h * 1000); if (AsB === null || AsT === null) continue;
      const vE = (V * 1e3) / (b * d), vR = vcap(Math.max(AsB, AsT), b, d, m);
      let transAs = 0, mt = 0, bad = false; c.forEach((k, i) => { const aT = (B * 1000 - k.cPerp) / 2 / 1000, Mt = (Nmax[i] * aT * aT) / (2 * B), be = k.cAxis + d, as = flexW(Mt, be, d - 16, m, h * 1000); if (as === null) { bad = true; return; } transAs = Math.max(transAs, (as / be) * 1000); mt = Math.max(mt, Mt); });
      if (bad) continue;
      const rho = Math.max(0.0015, AsB / (b * d)); let punch = 0;
      for (const cb of combos) { const pU = cb.cols.reduce((a, k) => a + k.N, 0) / (B * L); c.forEach((k, i) => {
        const N = cb.cols[i].N, M = Math.hypot(cb.cols[i].Min, cb.cols[i].Mtr), endOver = Math.min(k.s - s0 - k.cAxis / 2000, s0 + L - k.s - k.cAxis / 2000) * 1000, side = (B * 1000 - k.cPerp) / 2, lim = (bs ? 1.5 : 2) * d, nEnd = endOver < lim, nSide = side < lim;
        const kind = nEnd && nSide ? 'corner' : nEnd || nSide ? 'edge' : 'interior', c1 = nEnd ? k.cPerp : k.cAxis, c2 = nEnd ? k.cAxis : k.cPerp, cc = (c1 + c2) / 2;
        const beta0 = bs ? (kind === 'interior' ? 1.15 : 1.25) : kind === 'interior' ? 1.15 : kind === 'edge' ? 1.4 : 1.5, beta = kind === 'interior' ? betaMoment(m.code, N, M, cc, d) : Math.max(beta0, betaMoment(m.code, N, M, cc, d) * (beta0 / 1.15));
        const u = bs ? (kind === 'interior' ? 2 * (c1 + c2) + 12 * d : kind === 'edge' ? c1 + 2 * c2 + 6 * d : c1 + c2 + 3 * d) : kind === 'interior' ? 2 * (c1 + c2) + 4 * Math.PI * d : kind === 'edge' ? c1 + 2 * c2 + 2 * Math.PI * d : c1 + c2 + Math.PI * d;
        const Ain = kind !== 'interior' ? 0 : (bs ? (c1 + 3 * d) * (c2 + 3 * d) : c1 * c2 + 4 * d * (c1 + c2) + Math.PI * 4 * d * d) / 1e6, vEd = (beta * Math.max(0, N - pU * Ain) * 1e3) / (u * d);
        const kk = Math.min(2, 1 + Math.sqrt(200 / d)), vRd = bs ? vcBS(rho * b * d, b, d, fcu) : Math.max(0.12 * kk * Math.cbrt(100 * Math.min(0.02, rho) * m.fck), 0.035 * Math.pow(kk, 1.5) * Math.sqrt(m.fck));
        const u0 = kind === 'interior' ? 2 * (c1 + c2) : kind === 'edge' ? c1 + 2 * c2 : c1 + c2, vMax = (beta * N * 1e3) / (u0 * d), vMaxRd = bs ? Math.min(0.8 * Math.sqrt(fcu), 5) : 0.5 * 0.6 * (1 - m.fck / 250) * ((0.85 * m.fck) / 1.5);
        punch = Math.max(punch, vEd / vRd, vMax / vMaxRd); }); }
      if (vE <= vR && punch <= 1) return { h, d, AsB, AsT, shear: vE / vR, punch, transAs, mt, Msag, Mhog, diag: govDiag, gov: gov.name };
    }
    return null;
  };
  let L = Lg, B = Bg, grew = 'gravity size', g0 = design(Lg, Bg, [all[0]], 0.5);
  if (lat.length) {
    const h0 = g0?.h ?? 0.8, cand: [number, number][] = [];
    for (let dl = 0; dl <= 4.0001; dl += 0.2) for (let db = 0; db <= 3.0001; db += 0.1) cand.push([Math.round((Lg + dl) * 10) / 10, Math.round((Bg + db) * 10) / 10]);
    cand.sort((a, b2) => a[0] * a[1] - b2[0] * b2[1]);
    const f = cand.find(([L2, B2]) => service(L2, B2, h0).ok);
    if (f) { [L, B] = f; if (L > Lg + 1e-9 || B > Bg + 1e-9) grew = `enlarged from ${Lg.toFixed(1)} × ${Bg.toFixed(1)} m for the lateral combinations`; }
    else { [L, B] = cand[cand.length - 1]; notes.push('Bearing pressure or tension under the lateral combinations cannot be met even with a much larger footing: use piles or a raft'); }
  }
  let pick = design(L, B, uC, g0?.h ?? 0.5), status: Status = 'ok';
  if (!pick) { notes.push('No thickness up to 1.6 m passes bending, shear and punching: use a raft or piles'); status = 'bad'; pick = { h: 1.6, d: 1542, AsB: 0, AsT: 0, shear: 9, punch: 9, transAs: 500, mt: 0, Msag: 0, Mhog: 0, diag: [], gov: '' }; }
  if (qAllow < 75) { notes.push('Very low bearing capacity: consider piles or a raft'); if (status === 'ok') status = 'warn'; }
  // uplift and sliding under the lateral combinations
  let uplift = 0, sliding = Infinity; const wFoot = 25 * B * L * pick.h;
  for (const cb of stC) uplift = Math.max(uplift, -(cb.cols.reduce((a, k) => a + k.N, 0) + (bs ? 1.0 : 0.9) * wFoot));
  for (const cb of sC.filter(x => x.lateral)) { const H = Math.hypot(cb.cols.reduce((a, k) => a + k.Vin, 0), cb.cols.reduce((a, k) => a + k.Vtr, 0)), N = cb.cols.reduce((a, k) => a + k.N, 0) + wFoot; if (H > 1e-6) sliding = Math.min(sliding, (mu * N) / H); }
  if (uplift > 0) { notes.push(`Net uplift ${Math.round(uplift)} kN after the footing weight: provide a tension pile, rock anchor or ballast`); status = 'bad'; }
  if (isFinite(sliding) && sliding < 1.5) { notes.push(`Sliding factor ${sliding.toFixed(2)} (friction ${mu}) is below 1.5: add a shear key or passive resistance`); if (status === 'ok') status = 'warn'; }
  const sv = service(L, B, pick.h), bot = across(pick.AsB, B), top = across(pick.AsT, B), tr = perM(pick.transAs), minTr = perM(0.0013 * 1000 * pick.h * 1000);
  const diagram = pick.diag.length ? pick.diag : [], Vmax = Math.max(0, ...diagram.map(p => Math.abs(p.V))), kind: StripResult['kind'] = c.length === 2 ? 'combined' : 'strip';
  const steelKg = ((bot.As * L + top.As * L + tr.As * L * B) * 1000 * 7850) / 1e9, NTu = Math.max(...uC.map(x => x.cols.reduce((a, k) => a + k.N, 0)));
  const steps = [`${c.length} columns in a line along ${axis}, total ULS load ${Math.round(NT)} kN, resultant at ${sbar.toFixed(2)} m; the footing is centred on the resultant so the gravity soil pressure is uniform`,
    `Plan size ${L.toFixed(1)} × ${B.toFixed(1)} m (${grew}); worst service pressure ${Math.round(sv.worst * 100)}% of the allowable (${sv.gov || 'gravity'}), lateral combinations allowed ${Math.round((qInc - 1) * 100)}% extra`,
    `Statics along the footing for every combination (linear soil pressure when the column moments and shears add an eccentricity): maximum sagging ${pick.Msag.toFixed(0)} kNm (tension at the bottom), maximum hogging ${pick.Mhog.toFixed(0)} kNm (tension at the top), maximum shear ${Vmax.toFixed(0)} kN; governing combination ${pick.gov}`,
    `Thickness raised in 50 mm steps until bending, beam shear at d from each column face, transverse bending and punching (with moment transfer) all pass: h = ${Math.round(pick.h * 1000)} mm (shear ${(pick.shear * 100).toFixed(0)}%, punching ${(pick.punch * 100).toFixed(0)}% of capacity)`,
    `Longitudinal steel across the width: bottom ${Math.round(pick.AsB)} mm² (${bot.txt}), top ${Math.round(pick.AsT)} mm² (${top.txt}); transverse under each column over a zone c + d wide: ${tr.txt} per metre (minimum ${minTr.txt} elsewhere), from M = N a²/(2B) = ${pick.mt.toFixed(0)} kNm`,
    ...(lat.length ? [`Uplift check (${bs ? '1.0' : '0.9'} × footing weight ${Math.round(wFoot)} kN against the stabilising combinations): ${uplift > 0 ? Math.round(uplift) + ' kN net uplift' : 'no uplift'}; sliding factor ${isFinite(sliding) ? sliding.toFixed(2) : 'n/a'}`] : [])];
  void NTu;
  return { id, kind, axis, columns: c, L, B, h: pick.h, pULS: NTu / (B * L), pSLS: sv.worst * qAllow, Msag: pick.Msag, Mhog: pick.Mhog, Vmax, barsBottom: bot.txt, barsTop: top.txt, barsTransverse: `${tr.txt} under columns, ${minTr.txt} elsewhere`, punchRatio: pick.punch, status, notes, steps, concreteM3: L * B * pick.h, steelKg, diagram, lat: lat.length ? { pmax: sv.worst * qAllow, allow: qAllow, govern: sv.gov, uplift, sliding, grewTo: grew } : undefined };
}
