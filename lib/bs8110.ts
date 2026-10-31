// BS 8110-1:1997 member design (alternative to Eurocode 2). Units: mm, N, MPa unless noted.
// Loads 1.4 Gk + 1.6 Qk, cube strength fcu, 0.87 fy, K' = 0.156. Serviceability by span/depth (Tables 3.9, 3.10) and
// the BS 8110-2 cl 3.8 crack width. Preliminary: verify every result independently.
import { area, BeamResult, COVER, ColResult, f0, f1, linkFor, LINK, Mat, pickBars, Status } from './rc';
import type { FootingResult, SlabResult } from './slabfound';

export const fcuOf = (fck: number) => (({ 25: 30, 30: 37, 35: 45, 40: 50 } as Record<number, number>)[fck] ?? Math.round(fck * 1.2));
const Es = 200000, Ec28 = (fcu: number) => 20000 + 200 * fcu;

// design shear stress vc (Table 3.8 as a formula), N/mm²
export function vcBS(As: number, b: number, d: number, fcu: number) {
  const rho = Math.min(3, (100 * As) / (b * d));
  return ((0.79 * Math.cbrt(rho) * Math.max(0.67, Math.pow(400 / d, 0.25))) / 1.25) * Math.cbrt(Math.min(fcu, 40) / 25);
}
// singly reinforced bending (cl 3.4.4.4); doubly reinforced beyond K' = 0.156
export function flexBS(M: number, b: number, d: number, fcu: number, fy: number, dPrime: number) {
  const K = M / (b * d * d * fcu);
  if (K <= 0.156) { const z = Math.min(0.95 * d, d * (0.5 + Math.sqrt(0.25 - K / 0.9))); return { As: M / (0.87 * fy * z), K, z, doubly: false }; }
  const z0 = 0.777 * d, AsC = ((K - 0.156) * fcu * b * d * d) / (0.87 * fy * (d - dPrime));
  return { As: (0.156 * fcu * b * d * d) / (0.87 * fy * z0) + AsC, K, z: z0, doubly: true };
}
// span/depth modification factor for tension steel (Table 3.10, no redistribution)
export function mfBS(M: number, b: number, d: number, fy: number, AsReq: number, AsProv: number) {
  const fs = (2 * fy * AsReq) / (3 * AsProv);
  return Math.min(2, 0.55 + (477 - fs) / (120 * (0.9 + M / (b * d * d))));
}
// design surface crack width (BS 8110-2 cl 3.8.3) under service moment M (N·mm); worst of mid-spacing and corner positions
export function crackBS(o: { M: number; b: number; h: number; d: number; As: number; phi: number; n?: number; spacing?: number; cmin: number; fcu: number }) {
  const ae = Es / (Ec28(o.fcu) / 2), na = ae * o.As, x = -na / o.b + Math.sqrt((na / o.b) ** 2 + (2 * na * o.d) / o.b);
  const fs = o.M / (o.As * (o.d - x / 3)), e1 = (fs / Es) * ((o.h - x) / (o.d - x)), em = e1 - (o.b * (o.h - x) * (o.h - x)) / (3 * Es * o.As * (o.d - x));
  if (!(em > 0)) return { wk: 0, fs, x };
  const s = o.spacing ?? (o.n && o.n > 1 ? (o.b - 2 * o.cmin - o.phi) / (o.n - 1) : Infinity), dc = o.cmin + o.phi / 2;
  const acr = Math.max(isFinite(s) ? Math.sqrt((s / 2) ** 2 + dc ** 2) - o.phi / 2 : 0, Math.sqrt(2) * dc - o.phi / 2);
  return { wk: (3 * acr * em) / (1 + (2 * (acr - o.cmin)) / (o.h - x)), fs, x };
}

export function bsBeam(id: string, b: number, h: number, L: number, F: { sag: number; hog: number; V: number; w: number; hogL?: number; hogR?: number }, m: Mat, extra: { story?: string; trib?: number; qpRatio?: number; K?: number } = {}): BeamResult {
  const fcu = fcuOf(m.fck), fy = m.fyk, notes: string[] = [], steps: string[] = [];
  const d = h - COVER - LINK - 8, d2 = COVER + LINK + 8, AsMin = 0.0013 * b * h;
  let status: Status = 'ok';
  const flex = (Mk: number, label: string) => {
    const r = flexBS(Mk * 1e6, b, d, fcu, fy, d2);
    steps.push(`${label}: M = ${f1(Mk)} kNm, K = M/(b d² fcu) = ${r.K.toFixed(3)} ${r.doubly ? '> K\' = 0.156: compression steel needed' : '≤ K\' = 0.156'}, z = ${f0(r.z)} mm, As = M/(0.87 fy z) = ${f0(r.As)} mm² (BS 8110 cl 3.4.4.4)`);
    if (r.doubly) { notes.push(`${label}: needs compression steel, consider a deeper beam`); if (status === 'ok') status = 'warn'; }
    return Math.max(r.As, AsMin);
  };
  const AsB = flex(F.sag, 'Sagging'), AsT = flex(Math.max(F.hog, 0), 'Hogging');
  steps.push(`Minimum steel 100As/bh = 0.13%: ${f0(AsMin)} mm² (cl 3.12.5.3)`);
  if (AsB > 0.04 * b * h || AsT > 0.04 * b * h) { notes.push('Steel exceeds 4% of section: enlarge the beam'); status = 'bad'; }
  const bot = pickBars(AsB, b), top = pickBars(AsT, b);
  if (bot.layers === 2 || top.layers === 2) notes.push('Bars need two layers');

  const v = (F.V * 1e3) / (b * d), vc = vcBS(Math.min(bot.As, top.As), b, d, fcu), vmax = Math.min(0.8 * Math.sqrt(fcu), 5);
  let reqPerMm = (0.4 * b) / (0.87 * fy);
  if (v > vmax) { notes.push(`Shear stress ${v.toFixed(2)} N/mm² exceeds the maximum ${vmax.toFixed(2)}: enlarge the beam`); status = 'bad'; reqPerMm = 1; }
  else if (v > vc + 0.4) reqPerMm = (b * (v - vc)) / (0.87 * fy);
  steps.push(`Shear: v = V/(b d) = ${v.toFixed(2)} N/mm², vc = ${vc.toFixed(2)} N/mm² (Table 3.8), vmax = ${vmax.toFixed(2)}; links Asv/sv = ${reqPerMm.toFixed(2)} mm²/mm (cl 3.4.5.3)`);
  const lk = linkFor(reqPerMm, d);
  if ((lk as any).tight) { notes.push('Links very closely spaced: enlarge the beam'); if (status === 'ok') status = 'warn'; }

  // serviceability: span/depth (Tables 3.9 and 3.10), crack width under service load
  const k = extra.K ?? 1.3, basic = k >= 1.3 ? 26 : 20, Mmid = F.sag * 1e6, mf = mfBS(Mmid, b, d, fy, AsB, bot.As);
  let ldOk = basic * mf; if (L > 10) ldOk *= 10 / L;
  const ldA = (L * 1000) / d, q = extra.qpRatio ?? 0.7;
  const cs = crackBS({ M: F.sag * q * 1e6, b, h, d, As: bot.As, phi: bot.dia, n: bot.n, cmin: COVER + LINK, fcu });
  const ch = crackBS({ M: Math.max(F.hogL ?? F.hog, F.hogR ?? F.hog) * q * 1e6, b, h, d, As: top.As, phi: top.dia, n: top.n, cmin: COVER + LINK, fcu });
  const wk = Math.max(cs.wk, ch.wk);
  steps.push(`Span/depth (cl 3.4.6): L/d = ${ldA.toFixed(1)} against basic ${basic} × modification factor ${mf.toFixed(2)} = ${ldOk.toFixed(1)}: ${ldA <= ldOk ? 'satisfied' : 'not satisfied'}`);
  steps.push(`Crack width (BS 8110-2 cl 3.8.3, service moments): span ${cs.wk.toFixed(2)} mm, supports ${ch.wk.toFixed(2)} mm, limit 0.3 mm`);
  if (ldA > ldOk) { notes.push(`Span/depth ${ldA.toFixed(1)} exceeds ${ldOk.toFixed(1)}: deepen the beam or add tension steel`); if (status !== 'bad') status = ldA > ldOk * 1.2 ? 'bad' : 'warn'; }
  if (wk > 0.3) { notes.push(`Crack width ${wk.toFixed(2)} mm exceeds 0.3 mm: use smaller bars at closer spacing`); if (status !== 'bad') status = wk > 0.4 ? 'bad' : 'warn'; }
  const steelKg = ((bot.As * L * 1000 + top.As * L * 700 + ((L * 1000) / lk.s) * 2 * area(lk.phi) * 0.9 * (b + h)) * 7850) / 1e9;
  return { id, story: extra.story, b, h, L, w: F.w, trib: extra.trib ?? 0, MEd: F.sag, Mhog: F.hog, VEd: F.V, AsReq: Math.max(AsB, AsT), AsProv: bot.As, bars: `${bot.n}T${bot.dia}`, topBars: `${top.n}T${top.dia}`, links: lk.txt, status, notes, steps, steelKg, defl: { delta: 0, limit: 0, ratio: ldA / ldOk, ld: ldA, ldAllowed: ldOk }, crack: { wk, limit: 0.3 } };
}

// short braced column, cl 3.8.4.3: N = 0.4 fcu Ac + 0.75 fy Asc (allows for the minimum eccentricity 0.05h)
export function bsColumn(id: string, b: number, h: number, NEd: number, height: number, m: Mat, story?: string): ColResult {
  const fcu = fcuOf(m.fck), fy = m.fyk, Ac = b * h, N = NEd * 1e3, notes: string[] = [], steps: string[] = [];
  let status: Status = 'ok';
  const need = (N - 0.4 * fcu * Ac) / (0.75 * fy), minAs = 0.004 * Ac, maxAs = 0.06 * Ac, As = Math.max(need, minAs);
  steps.push(`N = ${f0(NEd)} kN; Asc = (N − 0.4 fcu Ac)/(0.75 fy) = ${f0(Math.max(need, 0))} mm², limits 0.4% to 6% of Ac: ${f0(minAs)} to ${f0(maxAs)} mm² (cl 3.8.4.3, 3.12.5.3)`);
  if (As > maxAs) { notes.push('Section too small for the load: enlarge the column'); status = 'bad'; }
  const le = 0.85 * height * 1000, slender = le / h;
  steps.push(`Slenderness le/h = ${slender.toFixed(1)}, limit 15 for a braced short column (cl 3.8.1.3)`);
  if (slender > 15) {
    const ba = (1 / 2000) * slender * slender, Madd = (N * ba * h) / 1e6;
    notes.push(`Slender (le/h ${slender.toFixed(1)} > 15): additional moment about ${Madd.toFixed(0)} kNm (cl 3.8.3.1), design for N and M together`); if (status === 'ok') status = 'warn';
  }
  const options: [number, number][] = [];
  for (const n of [4, 6, 8, 10, 12]) for (const dia of [16, 20, 25, 32]) options.push([n, dia]);
  options.sort((p, q) => p[0] * area(p[1]) - q[0] * area(q[1]));
  const pick = options.find(([n, dia]) => n * area(dia) >= Math.min(As, maxAs) && n * dia + (n / 2 - 1) * 40 <= Math.max(b, h) - 2 * (COVER + LINK)) ?? [12, 32];
  const prov = pick[0] * area(pick[1]), phiL = Math.max(8, Math.ceil(pick[1] / 4 / 2) * 2), sL = Math.floor(Math.min(12 * pick[1], Math.min(b, h)) / 25) * 25;
  const steelKg = ((prov * height * 1000 + ((height * 1000) / sL) * 2 * (b + h) * area(phiL)) * 7850) / 1e9;
  return { id, story, b, h, NEd, MEd: (N * 0.05 * h) / 1e6, AsReq: As, AsProv: prov, bars: `${pick[0]}T${pick[1]}`, links: `T${phiL}@${sL}`, status, notes, steps, steelKg };
}

const spacingBS = (As: number, hmm: number) => {
  for (const phi of [10, 12, 16, 20, 25]) { const s = Math.floor((area(phi) * 1000) / As / 25) * 25; if (s >= 100) return { txt: `T${phi}@${Math.min(s, 300, Math.floor((3 * hmm) / 25) * 25)}`, phi, s: Math.min(s, 300) }; }
  return { txt: 'T25@100', phi: 25, s: 100 };
};
const lerp = (x: number, x0: number, x1: number, y0: number, y1: number) => y0 + ((y1 - y0) * (Math.min(Math.max(x, x0), x1) - x0)) / (x1 - x0);

// two-way slab, interior panel, BS 8110 Table 3.14 coefficients
export function bsSlab(lx: number, ly: number, imposed: number, m: Mat, planArea: number, hFixed?: number): SlabResult {
  const fcu = fcuOf(m.fck), fy = m.fyk, notes: string[] = [];
  let status: Status = 'ok';
  [lx, ly] = [Math.min(lx, ly), Math.max(lx, ly)];
  const ratio = ly / lx, twoWay = ratio <= 2, d0 = (lx * 1000) / 26;
  const h = hFixed ? Math.max(100, Math.round(hFixed)) : Math.max(150, Math.ceil((d0 + 35) / 25) * 25), d = h - 35;
  const gk = 25 * (h / 1000) + 2.5, n = 1.4 * gk + 1.6 * imposed;
  const bNeg = twoWay ? lerp(ratio, 1, 2, 0.031, 0.063) : 0.1, bPos = twoWay ? lerp(ratio, 1, 2, 0.024, 0.048) : 0.083;
  const mNeg = bNeg * n * lx * lx, mPos = bPos * n * lx * lx;
  const fN = flexBS(mNeg * 1e6, 1000, d, fcu, fy, 35), fP = flexBS(mPos * 1e6, 1000, d, fcu, fy, 35), AsMin = 0.0013 * 1000 * h;
  if (fN.doubly || fP.doubly) { notes.push('Slab too shallow for bending: increase thickness'); status = 'bad'; }
  const A1 = Math.max(fN.As, AsMin), A2 = Math.max(fP.As, AsMin), top = spacingBS(A1, h), bot = spacingBS(A2, h);
  const AsTop = (area(top.phi) * 1000) / top.s, AsBot = (area(bot.phi) * 1000) / bot.s;
  const v = (0.5 * n * lx * 1000) / (1000 * d), vc = vcBS(Math.min(AsTop, AsBot), 1000, d, fcu);
  if (v > vc) { notes.push('Shear exceeds slab capacity: increase thickness'); status = 'bad'; }
  const mf = mfBS(mPos * 1e6, 1000, d, fy, A2, AsBot), ldOk = 26 * mf, ldA = (lx * 1000) / d;
  if (ldA > ldOk) { notes.push(`Span/depth ${ldA.toFixed(1)} exceeds the allowable ${ldOk.toFixed(1)}: thicken the slab`); if (status === 'ok') status = 'warn'; }
  const sv = (gk + imposed) / n;
  const ckS = crackBS({ M: mPos * sv * 1e6, b: 1000, h, d, As: AsBot, phi: bot.phi, spacing: bot.s, cmin: 25, fcu }), ckT = crackBS({ M: mNeg * sv * 1e6, b: 1000, h, d, As: AsTop, phi: top.phi, spacing: top.s, cmin: 25, fcu });
  const wk = Math.max(ckS.wk, ckT.wk);
  if (wk > 0.3) { notes.push(`Crack width ${wk.toFixed(2)} mm exceeds 0.3 mm: use closer bar spacing`); if (status === 'ok') status = 'warn'; }
  const steps = [`Bay ${lx.toFixed(2)} × ${ly.toFixed(2)} m, ly/lx = ${ratio.toFixed(2)}: ${twoWay ? 'two-way, interior panel (Table 3.14)' : 'one-way'}`,
    `Thickness from span/depth 26 (Table 3.9): d ≥ ${Math.round(d0)} mm, h = ${h} mm`, `Design load n = 1.4 (25 h + 2.5) + 1.6 qk = ${n.toFixed(2)} kN/m²`,
    `Moments m = β n lx²: support ${mNeg.toFixed(1)} kNm/m (β = ${bNeg.toFixed(3)}), span ${mPos.toFixed(1)} kNm/m (β = ${bPos.toFixed(3)})`,
    `Steel per metre (cl 3.4.4.4): support ${Math.round(A1)} mm²/m, span ${Math.round(A2)} mm²/m, minimum ${Math.round(AsMin)} mm²/m`,
    `Shear: v = ${v.toFixed(2)} N/mm² vs vc = ${vc.toFixed(2)} N/mm² (cl 3.5.5)`, `Span/depth: lx/d = ${ldA.toFixed(1)} against 26 × MF ${mf.toFixed(2)} = ${ldOk.toFixed(1)}`,
    `Crack width (BS 8110-2 cl 3.8.3, service moments): span ${ckS.wk.toFixed(2)} mm, support ${ckT.wk.toFixed(2)} mm, limit 0.3 mm`];
  const steelKg = ((0.8 * (1e6 / top.s) * area(top.phi) + 2 * (1e6 / bot.s) * area(bot.phi)) * 7850) / 1e9 * 1.1 * (planArea || 0);
  return { steps, ld: ldA, ldAllowed: ldOk, wk, lx, ly, type: twoWay ? 'Two-way, interior panel' : 'One-way', h, n, mNeg, mPos, topBars: top.txt, botBars: bot.txt, status, notes, concreteM3: (planArea || 0) * (h / 1000), steelKg };
}

// square pad footing: bearing, bending at the column face, shear at d, punching at 1.5d (cl 3.7.7)
export function bsFooting(id: string, NEd: number, c1: number, c2: number, qAllow: number, m: Mat): FootingResult {
  const fcu = fcuOf(m.fck), fy = m.fyk, notes: string[] = [];
  const Nserv = NEd / 1.45, B = Math.max(0.9, Math.ceil(Math.sqrt((Nserv * 1.1) / qAllow) / 0.1 - 1e-9) / 10);
  const pULS = NEd / (B * B), pSLS = (Nserv * 1.1) / (B * B), p = pULS / 1000, a = (B * 1000 - Math.max(c1, c2)) / 2;
  let status: Status = 'ok', pick: { h: number; As: number } | null = null;
  for (let hm = 0.3; hm <= 1.5; hm += 0.05) {
    const h = Math.round(hm * 100) / 100, d = h * 1000 - 58, fr = flexBS(p * a * a * 0.5 * 1000, 1000, d, fcu, fy, 58);
    if (fr.doubly) continue;
    const As = Math.max(fr.As, 0.0013 * 1000 * h * 1000), vc = vcBS(As, 1000, d, fcu);
    const vOne = a > d ? (p * (a - d) * 1000) / (1000 * d) : 0;
    const u = 2 * (c1 + c2) + 12 * d, Ain = (c1 + 3 * d) * (c2 + 3 * d), vP = (1.15 * Math.max(0, NEd * 1000 - p * Ain)) / (u * d);
    const vFace = (1.15 * NEd * 1000) / (2 * (c1 + c2) * d), vMax = Math.min(0.8 * Math.sqrt(fcu), 5);
    if (vOne <= vc && vP <= vc && vFace <= vMax) { pick = { h, As }; break; }
  }
  if (!pick) { notes.push('No thickness up to 1.5 m passes punching: use a larger column or a stronger concrete'); status = 'bad'; pick = { h: 1.5, As: 0.0013 * 1000 * 1500 }; }
  const bars = (() => { for (const phi of [12, 16, 20, 25]) { const s = Math.floor((area(phi) * 1000) / pick!.As / 25) * 25; if (s >= 100) return { txt: `T${phi}@${Math.min(s, 300)}`, phi, s: Math.min(s, 300) }; } return { txt: 'T25@100', phi: 25, s: 100 }; })();
  if (qAllow < 75) { notes.push('Very low bearing capacity: consider piles or a raft'); if (status === 'ok') status = 'warn'; }
  const steps = [`N = ${Math.round(NEd)} kN (ULS), service load ≈ N/1.45 = ${Math.round(Nserv)} kN, plus 10% self-weight`,
    `Plan size from allowable bearing ${qAllow} kPa: B = ${B.toFixed(1)} m; service pressure ${Math.round(pSLS)} kPa, ULS pressure ${Math.round(pULS)} kPa`,
    `Thickness raised in 50 mm steps until bending (cl 3.4.4.4), shear at d, and punching at 1.5d with V × 1.15 (cl 3.7.7.3) all pass: h = ${Math.round(pick.h * 1000)} mm`,
    `Steel As = ${Math.round(pick.As)} mm²/m each way: ${bars.txt}`];
  return { steps, id, NEd, B, h: pick.h, pULS, pSLS, bars: `${bars.txt} each way`, AsReq: pick.As, status, notes, concreteM3: B * B * pick.h, steelKg: (2 * ((area(bars.phi) * 1000) / bars.s) * B * B * 1000 * 7850) / 1e9 };
}

// moment capacity (N·mm) of a rectangular section at axial load N (compression +), symmetric steel As (BS 8110 cl 3.4.4.1 assumptions)
export function colMomentBS(b: number, h: number, d1: number, As: number, fcu: number, fy: number, N: number) {
  const ecu = 0.0035, fyd = 0.87 * fy;
  const at = (x: number) => {
    const a = Math.min(0.9 * x, h), Fc = 0.45 * fcu * b * a, sig = (dist: number) => Math.max(-fyd, Math.min(fyd, (Es * ecu * (x - dist)) / x));
    let s1 = sig(d1), s2 = sig(h - d1);
    if (d1 < a) s1 -= 0.45 * fcu; if (h - d1 < a) s2 -= 0.45 * fcu;
    return { n: Fc + (As / 2) * (s1 + s2), m: Fc * (h / 2 - a / 2) + (As / 2) * (s1 - s2) * (h / 2 - d1) };
  };
  let lo = 1, hi = 20 * h;
  if (at(hi).n < N) return -1;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; at(mid).n < N ? (lo = mid) : (hi = mid); }
  return at(hi).m;
}
