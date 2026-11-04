// Raft (mat) foundation, preliminary design by the conventional rigid method (ACI 336.2R "rigid" approach):
//  1. the raft is a rectangle centred on the resultant of the column loads, so the soil pressure is uniform;
//  2. it is cut into strips along each column row in both directions (each strip runs to the mid-lines between rows);
//  3. every strip is a rigid beam loaded by its columns and carried by a linear soil reaction that balances force and
//     moment (statics), giving shear and bending moment diagrams;
//  4. thickness is raised in 50 mm steps until punching shear at every column and beam shear in every strip pass;
//  5. steel per metre comes from the largest sagging and hogging moments of the strips in each direction.
// Each direction carries the whole load (conservative). A flexible (spring) analysis should confirm the result.
import { area, Mat, Status } from './rc';
import { fcuOf, vcBS } from './bs8110';
import { flexW, perM, vcap } from './stripfoot';

export type RaftCol = { id: string; x: number; y: number; N: number; c1: number; c2: number };   // N ULS kN; c1 along x, c2 along y (mm)
export type RaftStrip = { dir: 'x' | 'y'; index: number; width: number; length: number; cols: string[]; Msag: number; Mhog: number; Vmax: number; AsB: number; AsT: number };
export type RaftResult = {
  x0: number; y0: number; L: number; B: number; h: number; d: number; overhang: number; pULS: number; pSLS: number; qAllow: number; resultant: [number, number];
  strips: RaftStrip[]; bars: { xBottom: string; xTop: string; yBottom: string; yTop: string }; punchRatio: number; shearRatio: number; status: Status; notes: string[]; steps: string[]; concreteM3: number; steelKg: number;
};

// rows of columns: clustered by one coordinate (tolerance 0.6 m); returns the cluster index of each column and the cluster centres
export function rows(vals: number[], tol = 0.6): { index: number[]; centres: number[] } {
  const order = vals.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0]), clusters: number[][] = [];
  for (const [v, i] of order) { const last = clusters[clusters.length - 1]; if (last && v - vals[last[last.length - 1]] <= tol) last.push(i); else clusters.push([i]); }
  const index = vals.map(() => 0); clusters.forEach((c, k) => c.forEach(i => (index[i] = k)));
  return { index, centres: clusters.map(c => c.reduce((a, i) => a + vals[i], 0) / c.length) };
}

// shear and moment along a rigid strip of length L (m): columns at s with loads P; reaction is linear and balances force and moment
export function stripStatics(L: number, s: number[], P: number[]) {
  const Nt = P.reduce((a, p) => a + p, 0), Mc = P.reduce((a, p, i) => a + p * (s[i] - L / 2), 0), w0 = Nt / L, w1 = (12 * Mc) / L ** 3;
  const at = (t: number, side: 'l' | 'r') => {
    let M = (w0 * t * t) / 2 + w1 * (t ** 3 / 6 - (L * t * t) / 4), V = w0 * t + w1 * (t * t / 2 - (L * t) / 2);
    s.forEach((si, i) => { if (si < t - 1e-9 || (side === 'r' && Math.abs(si - t) < 1e-9)) { M -= P[i] * (t - si); V -= P[i]; } });
    return { M, V };
  };
  return { at, w0, w1 };
}

export function designRaft(cols: RaftCol[], qAllow: number, m: Mat): RaftResult {
  const bs = m.code === 'BS8110', gf = bs ? 1.45 : 1.4, fcu = fcuOf(m.fck), notes: string[] = [];
  const NT = cols.reduce((a, c) => a + c.N, 0), Nserv = NT / gf, xr = cols.reduce((a, c) => a + c.N * c.x, 0) / NT, yr = cols.reduce((a, c) => a + c.N * c.y, 0) / NT;
  const xmin = Math.min(...cols.map(c => c.x)), xmax = Math.max(...cols.map(c => c.x)), ymin = Math.min(...cols.map(c => c.y)), ymax = Math.max(...cols.map(c => c.y));
  const cx = Math.max(...cols.map(c => c.c1)) / 2000, cy = Math.max(...cols.map(c => c.c2)) / 2000;
  const rx = rows(cols.map(c => c.y)), ry = rows(cols.map(c => c.x));        // rows along x (grouped by y) and rows along y (grouped by x)

  const attempt = (a: number) => {
    const L = Math.ceil((2 * (Math.max(xr - xmin, xmax - xr) + cx + a)) / 0.1 - 1e-9) / 10, B = Math.ceil((2 * (Math.max(yr - ymin, ymax - yr) + cy + a)) / 0.1 - 1e-9) / 10;
    const x0 = xr - L / 2, y0 = yr - B / 2, A = L * B;
    // strips: for direction 'x' the strip bounds are y mid-lines, for 'y' they are x mid-lines
    const mk = (dir: 'x' | 'y') => {
      const r = dir === 'x' ? rx : ry, off = dir === 'x' ? y0 : x0, span = dir === 'x' ? B : L, len = dir === 'x' ? L : B, origin = dir === 'x' ? x0 : y0;
      const bounds = [off, ...r.centres.slice(1).map((c, i) => (c + r.centres[i]) / 2), off + span];
      return r.centres.map((_, k) => {
        const ids = cols.map((c, i) => [c, i] as const).filter(([, i]) => r.index[i] === k).map(([c]) => c);
        return { dir, index: k, width: bounds[k + 1] - bounds[k], length: len, ids, s: ids.map(c => (dir === 'x' ? c.x : c.y) - origin), P: ids.map(c => c.N) };
      });
    };
    return { L, B, x0, y0, A, strips: [...mk('x'), ...mk('y')] };
  };

  const design = (g: ReturnType<typeof attempt>) => {
    const { A, strips, L, B, x0, y0 } = g, pU = NT / A;
    for (let hm = 0.4; hm <= 2.0 + 1e-9; hm += 0.05) {
      const h = Math.round(hm * 100) / 100, d = h * 1000 - 90, b = 1000;
      const out: RaftStrip[] = []; let bad = false, shear = 0;
      for (const st of strips) {
        const sx = stripStatics(st.length, st.s, st.P); let hi = 0, lo = 0, V = 0;
        for (let t = 0; t <= st.length + 1e-9; t += 0.05) { const r = sx.at(Math.min(t, st.length), 'l'); hi = Math.max(hi, r.M); lo = Math.min(lo, r.M); }
        st.s.forEach((x, i) => { const l = sx.at(x, 'l'), r = sx.at(x, 'r'); hi = Math.max(hi, l.M, r.M); lo = Math.min(lo, l.M, r.M);
          const half = (st.dir === 'x' ? st.ids[i].c1 : st.ids[i].c2) / 2000 + d / 1000;
          for (const sg of [-1, 1]) { const t = x + sg * half; if (t > 0 && t < st.length) V = Math.max(V, Math.abs(sx.at(t, sg < 0 ? 'l' : 'r').V)); } });
        const mPos = hi / st.width, mNeg = -lo / st.width, AsB = flexW(mPos, b, d, m, h * 1000), AsT = flexW(mNeg, b, d, m, h * 1000);
        if (AsB === null || AsT === null) { bad = true; break; }
        const vE = (V / st.width) * 1e3 / (b * d), vR = vcap(Math.max(AsB, AsT), b, d, m); shear = Math.max(shear, vE / vR);
        out.push({ dir: st.dir, index: st.index, width: st.width, length: st.length, cols: st.ids.map(c => c.id), Msag: hi, Mhog: -lo, Vmax: V, AsB, AsT });
      }
      if (bad || shear > 1) continue;
      // punching at every column
      let punch = 0; const rho = Math.max(0.0015, Math.max(...out.map(o => o.AsB)) / (b * d));
      for (const c of cols) {
        const ex = Math.min(c.x - x0, x0 + L - c.x) * 1000 - c.c1 / 2, ey = Math.min(c.y - y0, y0 + B - c.y) * 1000 - c.c2 / 2, lim = (bs ? 1.5 : 2) * d, nE = (ex < lim ? 1 : 0) + (ey < lim ? 1 : 0);
        const kind = nE === 2 ? 'corner' : nE === 1 ? 'edge' : 'interior', beta = kind === 'interior' ? 1.15 : bs ? 1.25 : kind === 'edge' ? 1.4 : 1.5;
        const c1 = ex < lim && ey >= lim ? c.c2 : c.c1, c2 = ex < lim && ey >= lim ? c.c1 : c.c2;
        const u = bs ? (kind === 'interior' ? 2 * (c1 + c2) + 12 * d : kind === 'edge' ? c1 + 2 * c2 + 6 * d : c1 + c2 + 3 * d) : kind === 'interior' ? 2 * (c1 + c2) + 4 * Math.PI * d : kind === 'edge' ? c1 + 2 * c2 + 2 * Math.PI * d : c1 + c2 + Math.PI * d;
        const Ain = kind !== 'interior' ? 0 : (bs ? (c1 + 3 * d) * (c2 + 3 * d) : c1 * c2 + 4 * d * (c1 + c2) + Math.PI * 4 * d * d) / 1e6, vEd = (beta * Math.max(0, c.N - pU * Ain) * 1e3) / (u * d);
        const kk = Math.min(2, 1 + Math.sqrt(200 / d)), vRd = bs ? vcBS(rho * b * d, b, d, fcu) : Math.max(0.12 * kk * Math.cbrt(100 * Math.min(0.02, rho) * m.fck), 0.035 * Math.pow(kk, 1.5) * Math.sqrt(m.fck));
        const u0 = kind === 'interior' ? 2 * (c1 + c2) : kind === 'edge' ? c1 + 2 * c2 : c1 + c2, vMax = (beta * c.N * 1e3) / (u0 * d), vMaxRd = bs ? Math.min(0.8 * Math.sqrt(fcu), 5) : 0.5 * 0.6 * (1 - m.fck / 250) * ((0.85 * m.fck) / 1.5);
        punch = Math.max(punch, vEd / vRd, vMax / vMaxRd);
      }
      if (punch <= 1) return { h, d, strips: out, punch, shear };
    }
    return null;
  };

  let chosen: { g: ReturnType<typeof attempt>; r: NonNullable<ReturnType<typeof design>>; a: number } | null = null, last: ReturnType<typeof attempt> | null = null, lastA = 0;
  for (let a = 0.5; a <= 3.0001; a += 0.25) {
    const g = attempt(a); last = g; lastA = a;
    if (Nserv / g.A + 25 * 0.4 > qAllow) continue;                                   // cannot even carry a minimum-thickness raft
    const r = design(g); if (!r) continue;
    if (Nserv / g.A + 25 * r.h <= qAllow) { chosen = { g, r, a }; break; }
  }
  let status: Status = 'ok';
  if (!chosen) {
    const g = last!, r = design(g);
    if (!r) { notes.push('No raft thickness up to 2.0 m passes punching and shear: use piles, bigger columns or stronger concrete'); status = 'bad'; }
    else notes.push(`Bearing pressure cannot be met within a 3 m projection (${Math.round(Nserv / g.A + 25 * r.h)} kPa against ${qAllow} kPa): use piles or a larger raft`), status = 'bad';
    chosen = { g, r: r ?? { h: 2.0, d: 1910, strips: [], punch: 9, shear: 9 }, a: lastA };
  }
  const { g, r } = chosen, A = g.A, pSLS = Nserv / A + 25 * r.h, pU = NT / A;
  const pick = (dir: 'x' | 'y', k: 'AsB' | 'AsT') => Math.max(0.0013 * 1000 * r.h * 1000, ...r.strips.filter(s => s.dir === dir).map(s => s[k]));
  const xB = pick('x', 'AsB'), xT = pick('x', 'AsT'), yB = pick('y', 'AsB'), yT = pick('y', 'AsT');
  const bars = { xBottom: perM(xB).txt, xTop: perM(xT).txt, yBottom: perM(yB).txt, yTop: perM(yT).txt };
  if (Math.max(xB, xT, yB, yT) > area(25) * 10) { notes.push('The steel needed is more than one layer of T25@100: increase the concrete class or use a second layer'); if (status === 'ok') status = 'warn'; }
  if (qAllow < 75) { notes.push('Very low bearing capacity: check settlement; piles or a piled raft may be needed'); if (status === 'ok') status = 'warn'; }
  notes.push('Conventional rigid method: each direction carries the full load and the raft is taken as rigid. Confirm with a flexible (spring) analysis, check settlement, and add edge and corner reinforcement details.');
  const steelKg = ((xB + xT) * 1e-6 * g.L * g.B + (yB + yT) * 1e-6 * g.L * g.B) * 7850;
  const steps = [
    `${cols.length} columns, total ULS load ${Math.round(NT)} kN (service ${Math.round(Nserv)} kN); resultant at x = ${xr.toFixed(2)}, y = ${yr.toFixed(2)} m, so the raft is centred there and the soil pressure is uniform`,
    `Plan ${g.L.toFixed(1)} × ${g.B.toFixed(1)} m = ${A.toFixed(0)} m² with a projection of ${chosen.a.toFixed(2)} m beyond the outer columns; ULS soil pressure ${pU.toFixed(0)} kPa, service pressure including the raft weight ${pSLS.toFixed(0)} kPa against ${qAllow} kPa allowable`,
    `The raft is cut into ${rx.centres.length} strips along x and ${ry.centres.length} strips along y, each to the mid-lines between column rows; each strip is a rigid beam on a linear soil reaction that balances its column loads in force and moment`,
    `Thickness raised in 50 mm steps until beam shear in every strip and punching (with ${bs ? 'BS 8110 3.7.7' : 'EC2 6.4'} factors for interior, edge and corner columns) pass: h = ${Math.round(r.h * 1000)} mm (shear ${(r.shear * 100).toFixed(0)}%, punching ${(r.punch * 100).toFixed(0)}% of capacity)`,
    `Steel per metre from the largest strip moments: x direction bottom ${Math.round(xB)} mm² (${bars.xBottom}), top ${Math.round(xT)} mm² (${bars.xTop}); y direction bottom ${Math.round(yB)} mm² (${bars.yBottom}), top ${Math.round(yT)} mm² (${bars.yTop})`,
  ];
  return { x0: g.x0, y0: g.y0, L: g.L, B: g.B, h: r.h, d: r.d, overhang: chosen.a, pULS: pU, pSLS, qAllow, resultant: [xr, yr], strips: r.strips, bars, punchRatio: r.punch, shearRatio: r.shear, status: r.punch > 1 || r.shear > 1 ? 'bad' : status, notes, steps, concreteM3: A * r.h, steelKg };
}
