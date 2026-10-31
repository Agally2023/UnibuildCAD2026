// Ground (tie) beams between footing columns. They (1) restrain the column bases when the bases are taken as fixed, passing the
// base moments into the beams in each direction, (2) tie the footings together for the tie force (the largest of 10% of the
// larger column load, the EN 1998-5 rule k·α·S·N for earthquakes, and the base shear), and (3) carry their own weight and any
// wall above. Preliminary design: end moments from the base moments, fixed-end gravity moments, tension from the tie force.
import { area, Mat, Status, linkFor, pickBars } from './rc';
import { fcuOf } from './bs8110';
import { Eff, foundationCombos } from './combos';
import { flexW, vcap } from './stripfoot';

export type GbColumn = { id: string; x: number; y: number; b: number; h: number; G: number; Q: number; NEd: number; effs: Eff[] };
export type GbWall = { start: [number, number]; end: [number, number]; height: number; thickness: number };
export type GroundBeam = { id: string; dir: 'x' | 'y'; from: string; to: string; L: number; b: number; h: number; Msag: number; Mhog: number; V: number; tie: number; sway: number; wall: number; bars: string; topBars: string; links: string; status: Status; notes: string[]; steps: string[]; concreteM3: number; steelKg: number };

// beams between each footing column and its nearest neighbour to the right (x) and above (y), when they are in line
export function groundBeamLayout(cols: { id: string; x: number; y: number }[]) {
  const out: { a: string; b: string; dir: 'x' | 'y'; L: number }[] = [];
  for (const c of cols) {
    const r = cols.filter(o => o !== c && Math.abs(o.y - c.y) <= 0.3 && o.x > c.x + 0.5).sort((p, q) => p.x - q.x)[0];
    if (r) out.push({ a: c.id, b: r.id, dir: 'x', L: r.x - c.x });
    const u = cols.filter(o => o !== c && Math.abs(o.x - c.x) <= 0.3 && o.y > c.y + 0.5).sort((p, q) => p.y - q.y)[0];
    if (u) out.push({ a: c.id, b: u.id, dir: 'y', L: u.y - c.y });
  }
  return out;
}

const KTIE: Record<string, number> = { A: 0.3, B: 0.3, C: 0.4, D: 0.6, E: 0.6 };
const SGROUND: Record<string, number> = { A: 1.0, B: 1.2, C: 1.15, D: 1.35, E: 1.4 };

export function designGroundBeams(cols: GbColumn[], walls: GbWall[], m: Mat, o: { seismic?: { agG: number; ground: 'A' | 'B' | 'C' | 'D' | 'E'; psi2: number } } = {}): GroundBeam[] {
  const bs = m.code === 'BS8110', fcu = fcuOf(m.fck), gG = bs ? 1.4 : 1.35, fyd = bs ? 0.87 * m.fyk : m.fyk / 1.15, byId = Object.fromEntries(cols.map(c => [c.id, c]));
  const lay = groundBeamLayout(cols), count = (id: string, dir: 'x' | 'y') => lay.filter(l => l.dir === dir && (l.a === id || l.b === id)).length;
  // largest factored base moment and shear of a column in each direction over the lateral ULS combinations
  const act = (c: GbColumn) => { let mx = 0, my = 0, vx = 0, vy = 0; for (const k of foundationCombos(m.code, c.G, c.Q, c.effs, o.seismic?.psi2 ?? 0.3)) if (k.ls === 'uls' && k.lateral) { mx = Math.max(mx, Math.abs(k.Mx)); my = Math.max(my, Math.abs(k.My)); vx = Math.max(vx, Math.abs(k.Vx)); vy = Math.max(vy, Math.abs(k.Vy)); } return { mx, my, vx, vy }; };
  const A = Object.fromEntries(cols.map(c => [c.id, act(c)]));
  return lay.map((l, i) => {
    const a = byId[l.a], b = byId[l.b], notes: string[] = [], steps: string[] = [];
    const ma = (l.dir === 'x' ? A[l.a].mx : A[l.a].my) / Math.max(1, count(l.a, l.dir)), mb = (l.dir === 'x' ? A[l.b].mx : A[l.b].my) / Math.max(1, count(l.b, l.dir)), Ms = Math.max(ma, mb);
    const Vb = Math.max(l.dir === 'x' ? A[l.a].vx : A[l.a].vy, l.dir === 'x' ? A[l.b].vx : A[l.b].vy);
    // wall above the beam: any wall within 0.3 m of the beam axis overlapping at least half its length
    const ax = [a.x, a.y], bx = [b.x, b.y], len = l.L; let wWall = 0;
    for (const w of walls) {
      const dx = w.end[0] - w.start[0], dy = w.end[1] - w.start[1], wl = Math.hypot(dx, dy); if (wl < 0.5) continue;
      const along = l.dir === 'x' ? Math.abs(dy) < 0.3 && Math.abs(w.start[1] - a.y) < 0.3 : Math.abs(dx) < 0.3 && Math.abs(w.start[0] - a.x) < 0.3; if (!along) continue;
      const lo = l.dir === 'x' ? Math.min(w.start[0], w.end[0]) : Math.min(w.start[1], w.end[1]), hi = l.dir === 'x' ? Math.max(w.start[0], w.end[0]) : Math.max(w.start[1], w.end[1]);
      const s0 = l.dir === 'x' ? Math.min(ax[0], bx[0]) : Math.min(ax[1], bx[1]), ov = Math.min(hi, s0 + len) - Math.max(lo, s0);
      if (ov >= 0.5 * len) wWall += w.height * w.thickness * 18;
    }
    // tie force
    const Nmax = Math.max(a.NEd, b.NEd), tie10 = 0.1 * Nmax, Navg = (a.G + b.G + (a.Q + b.Q) * (o.seismic?.psi2 ?? 0.3)) / 2;
    const tieSeis = o.seismic ? KTIE[o.seismic.ground] * o.seismic.agG * SGROUND[o.seismic.ground] * Navg : 0, tie = Math.max(tie10, tieSeis, Vb), AsTie = (tie * 1e3) / fyd;
    // section search
    const bw = Math.max(250, Math.ceil(Math.min(a.b, a.h, b.b, b.h) / 50) * 50), hStart = Math.max(350, Math.ceil((l.L * 1000) / 14 / 50) * 50);
    let pick: { h: number; Msag: number; Mhog: number; V: number; AsB: number; AsT: number; req: number; vE: number; gk: number } | null = null;
    for (let h = hStart; h <= 1000; h += 50) {
      const d = h - 66, gk = 25 * (bw / 1000) * (h / 1000) + wWall, wu = gG * gk, Mend = (wu * l.L * l.L) / 12, Mhog = Mend + Ms, Msag = Math.max((wu * l.L * l.L) / 24, Ms - (gk * l.L * l.L) / 12), V = (wu * l.L) / 2 + (2 * Ms) / l.L;
      const sB = flexW(Msag, bw, d, m, h), sT = flexW(Mhog, bw, d, m, h); if (sB === null || sT === null) continue;
      const AsB = sB + AsTie / 2, AsT = sT + AsTie / 2; if (AsB > 0.04 * bw * h || AsT > 0.04 * bw * h) continue;
      const vE = (V * 1e3) / (bw * d), z = 0.9 * d, nu = 0.6 * (1 - m.fck / 250), vmax = bs ? Math.min(0.8 * Math.sqrt(fcu), 5) : 0.5 * nu * ((0.85 * m.fck) / 1.5);
      if (vE > vmax) continue;
      const vc = vcap(Math.min(AsB, AsT) - AsTie / 2, bw, d, m); let req = bs ? (vE > vc + 0.4 ? (bw * (vE - vc)) / (0.87 * m.fyk) : (0.4 * bw) / (0.87 * m.fyk)) : Math.max((0.08 * Math.sqrt(m.fck) * bw) / m.fyk, vE > vc ? (V * 1e3) / (z * (500 / 1.15) * 2.5) : 0);
      pick = { h, Msag, Mhog, V, AsB, AsT, req, vE, gk }; break;
    }
    let status: Status = 'ok';
    if (!pick) { notes.push('No ground beam section up to 1.0 m deep passes: use a raft or deeper beams with a wider section'); status = 'bad'; pick = { h: 1000, Msag: 0, Mhog: 0, V: 0, AsB: 0, AsT: 0, req: 1, vE: 0, gk: 0 }; }
    const d = pick.h - 66, bot = pickBars(pick.AsB, bw), top = pickBars(pick.AsT, bw), lk = linkFor(pick.req, d);
    if (bot.layers === 2 || top.layers === 2) { notes.push('Bars need two layers'); if (status === 'ok') status = 'warn'; }
    const steelKg = ((bot.As + top.As) * l.L * 1000 + ((l.L * 1000) / lk.s) * 2 * area(lk.phi) * 0.9 * (bw + pick.h)) * 7850 / 1e9;
    steps.push(`Between ${l.a} and ${l.b}, ${l.L.toFixed(2)} m along ${l.dir}; section ${bw} × ${pick.h} mm; self-weight${wWall ? ' and wall' : ''} ${pick.gk.toFixed(1)} kN/m`,
      `Column base moment shared between the beams at each joint: sway moment ${Ms.toFixed(0)} kNm (${Ms > 0 ? 'bases fixed by the ground beams' : 'bases pinned: no base moment'}); end moments w L²/12 + sway = ${pick.Mhog.toFixed(0)} kNm hogging, sagging ${pick.Msag.toFixed(0)} kNm, shear ${pick.V.toFixed(0)} kN`,
      `Tie force = max(10% of the larger column load ${tie10.toFixed(0)} kN, ${o.seismic ? `EN 1998-5 k α S N = ${tieSeis.toFixed(0)} kN, ` : ''}base shear ${Vb.toFixed(0)} kN) = ${tie.toFixed(0)} kN; tension steel ${Math.round(AsTie)} mm² shared top and bottom`,
      `Steel: bottom ${Math.round(pick.AsB)} mm² (${bot.n}T${bot.dia}), top ${Math.round(pick.AsT)} mm² (${top.n}T${top.dia}); links ${lk.txt}`);
    return { id: `GB${i + 1}`, dir: l.dir, from: l.a, to: l.b, L: l.L, b: bw, h: pick.h, Msag: pick.Msag, Mhog: pick.Mhog, V: pick.V, tie, sway: Ms, wall: wWall, bars: `${bot.n}T${bot.dia}`, topBars: `${top.n}T${top.dia}`, links: lk.txt, status, notes, steps, concreteM3: (bw / 1000) * (pick.h / 1000) * l.L, steelKg };
  });
}
