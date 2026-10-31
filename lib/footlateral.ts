// Pad footings under gravity plus lateral actions: overturning moment, base shear and uplift from the Wind & quake analysis.
// Checks bearing pressure with eccentricity (no tension in service), uplift, sliding, and re-designs bending, shear and
// punching with moment transfer under the ULS combinations. Also builds the strip-footing combinations from the same actions.
import type { FootingResult } from './slabfound';
import { betaMoment, Combo, Eff, foundationCombos } from './combos';
import { area, Mat, Status } from './rc';
import { fcuOf } from './bs8110';
import { flexW, perM, StripCol, StripCombo, vcap } from './stripfoot';

// maximum soil pressure under a square pad for axial load N (kN) and moments M1, M2 (kNm) at the underside; partial contact beyond B/6
export function padPressure(N: number, M1: number, M2: number, B: number) {
  const e = (Math.abs(M1) + Math.abs(M2)) / Math.max(N, 1e-9);
  if (N <= 0 || e >= B / 2) return { p: Infinity, e, tension: true };
  return { p: e <= B / 6 ? (N / (B * B)) * (1 + (6 * e) / B) : (2 * N) / (3 * B * (B / 2 - e)), e, tension: e > B / 6 };
}

export function designPadLateral(base: FootingResult, c1: number, c2: number, G: number, Q: number, effs: Eff[], qAllow: number, m: Mat, o: { qInc?: number; mu?: number } = {}): FootingResult {
  const bs = m.code === 'BS8110', qInc = o.qInc ?? 1.25, mu = o.mu ?? 0.5, gG = bs ? 1.4 : 1.35, gQ = bs ? 1.6 : 1.5, fcu = fcuOf(m.fck), notes = [...base.notes];
  const zero = { Mx: 0, My: 0, Vx: 0, Vy: 0, lateral: false };
  const combos: Combo[] = [{ name: 'Gravity (ULS)', ls: 'uls', N: gG * G + gQ * Q, ...zero }, { name: 'Gravity (service)', ls: 'sls', N: G + Q, ...zero }, ...foundationCombos(m.code, G, Q, effs)];
  const uls = combos.filter(c => c.ls === 'uls'), sls = combos.filter(c => c.ls === 'sls'), stab = combos.filter(c => c.ls === 'stab');
  // plan size from the service combinations (footing weight 25 B² h included), never below the gravity pad
  let B = base.B, worst = 0, govS = 'gravity', svcOk = false;
  const cap = Math.round((base.B + 2.5) * 10) / 10;                      // a pad much larger than this is not a sensible answer: use piles, anchors or a raft
  for (let b = Math.max(0.9, base.B); b <= cap + 1e-9; b = Math.round((b + 0.1) * 10) / 10) {
    let ok = true; worst = 0;
    for (const c of sls) {
      const r = padPressure(c.N + 25 * b * b * base.h, c.Mx + c.Vx * base.h, c.My + c.Vy * base.h, b), allow = qAllow * (c.lateral ? qInc : 1);
      if (r.tension || r.p > allow) ok = false; if (r.p / allow > worst) { worst = r.p / allow; govS = c.name; }
    }
    B = b; svcOk = ok; if (ok) break;
  }
  if (!svcOk) notes.push(`Bearing pressure or tension under the lateral combinations cannot be met with a pad up to ${cap.toFixed(1)} m: tie the pads with ground beams and treat the column bases as pinned (Wind & quake screen), or use a raft or piles`);
  const grown = B > base.B + 1e-9;
  // thickness from the ULS combinations
  let pick: { h: number; As: number; util: number; gov: string } | null = null, pmaxU = 0;
  for (let hm = base.h; hm <= 1.6 + 1e-9; hm += 0.05) {
    const h = Math.round(hm * 100) / 100, d = h * 1000 - 58, a = (B * 1000 - Math.max(c1, c2)) / 2, cc = (c1 + c2) / 2;
    let ok = true, As = 0, util = 0, gov = '';
    for (const c of uls) {
      const r = padPressure(c.N, c.Mx + c.Vx * h, c.My + c.Vy * h, B); if (!isFinite(r.p)) { ok = false; break; }
      pmaxU = Math.max(pmaxU, r.p);
      const as = flexW((r.p * (a / 1000) ** 2) / 2, 1000, d, m, h * 1000); if (as === null) { ok = false; break; } As = Math.max(As, as);
      const vE = (r.p * (a / 1000 - d / 1000) * 1e3) / (1000 * d), vR = vcap(as, 1000, d, m);
      const pAvg = c.N / (B * B), Ain = (bs ? (cc + 3 * d) ** 2 : cc * cc + 4 * d * 2 * cc + Math.PI * 4 * d * d) / 1e6, M = Math.hypot(c.Mx, c.My), beta = betaMoment(m.code, c.N, M, cc, d);
      const u = bs ? 4 * cc + 12 * d : 4 * cc + 4 * Math.PI * d, vP = (beta * Math.max(0, c.N - pAvg * Ain) * 1e3) / (u * d), rho = Math.max(0.0015, as / (1000 * d));
      const kk = Math.min(2, 1 + Math.sqrt(200 / d)), vRp = bs ? vcap(rho * 1000 * d, 1000, d, m) : Math.max(0.12 * kk * Math.cbrt(100 * Math.min(0.02, rho) * m.fck), 0.035 * Math.pow(kk, 1.5) * Math.sqrt(m.fck));
      const vMax = (beta * c.N * 1e3) / (4 * cc * d), vMaxRd = bs ? Math.min(0.8 * Math.sqrt(fcu), 5) : 0.5 * 0.6 * (1 - m.fck / 250) * ((0.85 * m.fck) / 1.5);
      const ut = Math.max(vE / vR, vP / vRp, vMax / vMaxRd); if (ut > util) { util = ut; gov = c.name; } if (ut > 1) ok = false;
    }
    if (ok) { pick = { h, As, util, gov }; break; }
  }
  let status: Status = base.status === 'bad' || !svcOk ? 'bad' : 'ok';
  if (!pick) { notes.push('No thickness up to 1.6 m passes the lateral combinations: use a larger footing, a raft or piles'); status = 'bad'; pick = { h: 1.6, As: base.AsReq, util: 9, gov: '' }; }
  // uplift and sliding
  const wStab = (bs ? 1.0 : 0.9) * 25 * B * B * pick.h; let uplift = 0, sliding = Infinity;
  for (const c of stab) uplift = Math.max(uplift, -(c.N + wStab));
  for (const c of sls.filter(x => x.lateral)) { const H = Math.hypot(c.Vx, c.Vy), N = c.N + 25 * B * B * pick.h; if (H > 1e-6) sliding = Math.min(sliding, (mu * N) / H); }
  if (uplift > 0) { notes.push(`Net uplift ${Math.round(uplift)} kN after the footing weight: provide a tension pile, rock anchor or ballast`); status = 'bad'; }
  if (isFinite(sliding) && sliding < 1.5) { notes.push(`Sliding factor ${sliding.toFixed(2)} (friction ${mu}) is below 1.5: add a shear key or passive resistance`); if (status === 'ok') status = 'warn'; }
  if (grown) notes.push(`Enlarged from ${base.B.toFixed(1)} m to ${B.toFixed(1)} m for the overturning moments (bearing pressure and no tension under the lateral combinations)`);
  const bars = perM(pick.As);
  const steps = [`Gravity: G = ${Math.round(G)} kN, Q = ${Math.round(Q)} kN; lateral combinations from the Wind & quake analysis (${effs.length} effects, both directions); allowable pressure ${qAllow} kPa, ×${qInc} for lateral combinations`,
    `Plan size ${B.toFixed(1)} m: worst service pressure ${(worst * 100).toFixed(0)}% of the allowable under ${govS}; the resultant stays within the middle third (no tension)`,
    `Thickness ${Math.round(pick.h * 1000)} mm from the ULS combinations (governing ${pick.gov || 'gravity'}), with the shear at the column base acting through the footing depth; maximum ULS pressure ${Math.round(pmaxU)} kPa; punching includes moment transfer (${bs ? 'BS 8110 3.7.6.2' : 'EC2 6.4.3'})`,
    `Steel ${Math.round(pick.As)} mm²/m each way: ${bars.txt}; uplift ${uplift > 0 ? Math.round(uplift) + ' kN' : 'none'}, sliding factor ${isFinite(sliding) ? sliding.toFixed(2) : 'n/a'}`];
  return { ...base, steps, B, h: pick.h, pULS: pmaxU, pSLS: worst * qAllow, bars: `${bars.txt} each way`, AsReq: pick.As, status, notes, concreteM3: B * B * pick.h, steelKg: (2 * ((area(bars.phi) * 1000) / (area(bars.phi) * 1000 / bars.As)) * B * B * 1000 * 7850) / 1e9, lat: { pmax: worst * qAllow, allow: qAllow, govern: govS, uplift, sliding, grown } };
}

// strip footing combinations from the actions of its columns (columns must be in the strip's order, sorted by position)
export function stripCombos(code: Mat['code'], axis: 'x' | 'y', ids: string[], act: Record<string, { G: number; Q: number; effs: Eff[] }>): StripCombo[] {
  const per = ids.map(id => (act[id] ? foundationCombos(code, act[id].G, act[id].Q, act[id].effs) : []));
  if (!per.length || per.some(p => p.length !== per[0].length)) return [];
  return per[0].map((c0, k) => ({ name: c0.name, ls: c0.ls, lateral: true, cols: per.map(p => { const c = p[k]; return axis === 'x' ? { N: c.N, Min: c.Mx, Mtr: c.My, Vin: c.Vx, Vtr: c.Vy } : { N: c.N, Min: c.My, Mtr: c.Mx, Vin: c.Vy, Vtr: c.Vx }; }) }));
}
