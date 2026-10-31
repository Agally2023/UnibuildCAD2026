// Eurocode 2 (EN 1992-1-1) member design: preliminary. Units: mm, N, MPa unless noted.
// Beams: continuous-beam analysis with load patterns (lib/frame.ts). Columns: braced, rectangular stress block.
import type { El, Lib } from './engineering';
import { envelope, Span } from './frame';
import { allowedSpanDepth, beamDeflection, crackWidth } from './serviceability';
import { beamChains, beamSec, Group, planBox, tribWidths } from './model';

import { Mat, CLASSES, Status, BeamResult, ColResult, area, COVER, LINK, f0, f1, mp, pickBars, linkFor } from './rc';
import { bsBeam, bsColumn } from './bs8110';
export { CLASSES };
export type { Mat, Status, BeamResult, ColResult };

// Beam section design from design forces: Msag, Mhog in kNm, V in kN, w in kN/m (for the report).
export function designBeamM(id: string, b: number, h: number, L: number, F: { sag: number; hog: number; V: number; w: number; hogL?: number; hogR?: number }, m: Mat, extra: { story?: string; trib?: number; qpRatio?: number; K?: number } = {}): BeamResult {
  if (m.code === 'BS8110') return bsBeam(id, b, h, L, F, m, extra);
  const { fcd, fyd, fctm } = mp(m), notes: string[] = [], steps: string[] = [];
  const d = h - COVER - LINK - 8, d2 = COVER + LINK + 8, Kp = 0.167;
  let status: Status = 'ok';
  const AsMin = Math.max((0.26 * fctm * b * d) / m.fyk, 0.0013 * b * d);
  const flex = (Mknm: number, label: string) => {
    const M = Mknm * 1e6, K = M / (b * d * d * m.fck);
    let As: number;
    if (K <= Kp) {
      const z = Math.min(0.95 * d, d * (0.5 + Math.sqrt(0.25 - K / 1.134))); As = M / (fyd * z);
      steps.push(`${label}: M = ${f1(Mknm)} kNm, K = M/(b d² fck) = ${K.toFixed(3)} ≤ K' = 0.167, z = ${f0(z)} mm, As = M/(fyd z) = ${f0(As)} mm² (EC2 §3.1.7, 6.1)`);
    } else {
      const z = d * (0.5 + Math.sqrt(0.25 - Kp / 1.134)), As2 = ((K - Kp) * m.fck * b * d * d) / (fyd * (d - d2));
      As = (Kp * m.fck * b * d * d) / (fyd * z) + As2;
      steps.push(`${label}: M = ${f1(Mknm)} kNm, K = ${K.toFixed(3)} > K' = 0.167: compression steel needed, As = ${f0(As)} mm²`);
      notes.push(`${label}: needs compression steel, consider a deeper beam`); if (status === 'ok') status = 'warn';
    }
    return Math.max(As, AsMin);
  };
  const AsB = flex(F.sag, 'Sagging'), AsT = flex(Math.max(F.hog, 0), 'Hogging');
  steps.push(`Minimum steel As,min = max(0.26 fctm b d/fyk, 0.0013 b d) = ${f0(AsMin)} mm² (EC2 9.2.1.1)`);
  if (AsB > 0.04 * b * h || AsT > 0.04 * b * h) { notes.push('Steel exceeds 4% of section: enlarge the beam'); status = 'bad'; }
  const bot = pickBars(AsB, b), top = pickBars(AsT, b);
  if (bot.layers === 2 || top.layers === 2) notes.push('Bars need two layers');

  const VEd = F.V * 1e3, k = Math.min(2, 1 + Math.sqrt(200 / d)), rho = Math.min(0.02, bot.As / (b * d));
  const vmin = 0.035 * Math.pow(k, 1.5) * Math.sqrt(m.fck), VRdc = Math.max(0.12 * k * Math.cbrt(100 * rho * m.fck), vmin) * b * d;
  const fywd = 500 / 1.15, z = 0.9 * d, nu = 0.6 * (1 - m.fck / 250);
  let reqPerMm = (0.08 * Math.sqrt(m.fck) * b) / m.fyk, cot = 0;
  if (VEd > VRdc) {
    const sc = VEd / (b * z * nu * fcd);
    if (sc > 0.5) { notes.push('Shear exceeds strut capacity: enlarge the beam'); status = 'bad'; reqPerMm = 1; }
    else { cot = Math.min(2.5, Math.max(1, 1 / Math.tan(0.5 * Math.asin(2 * sc)))); reqPerMm = Math.max(reqPerMm, VEd / (z * fywd * cot)); }
    steps.push(`Shear: VEd = ${f1(F.V)} kN > VRd,c = ${f1(VRdc / 1e3)} kN, links by variable strut method: cot θ = ${cot.toFixed(2)}, Asw/s = VEd/(z fywd cot θ) = ${reqPerMm.toFixed(2)} mm²/mm (EC2 6.2.3)`);
  } else steps.push(`Shear: VEd = ${f1(F.V)} kN ≤ VRd,c = ${f1(VRdc / 1e3)} kN, minimum links Asw/s = ${reqPerMm.toFixed(2)} mm²/mm (EC2 6.2.2, 9.2.2)`);
  const lk = linkFor(reqPerMm, d);
  if ((lk as any).tight) { notes.push('Links very closely spaced: enlarge the beam'); if (status === 'ok') status = 'warn'; }
  // serviceability under the quasi-permanent combination (moments scaled from ULS by the load ratio)
  const q = extra.qpRatio ?? 0.6, K = extra.K ?? 1.3, Mq = F.sag * q, hl = (F.hogL ?? F.hog) * q, hr = (F.hogR ?? F.hog) * q;
  const df = beamDeflection(L, b, h, d, bot.As, top.As, Mq, hl, hr, m.fck);
  const ldA = (L * 1000) / d, ldOk = allowedSpanDepth({ K, fck: m.fck, rho: AsB / (b * d), AsReq: AsB, AsProv: bot.As, fyk: m.fyk, L });
  const cs = crackWidth({ M: Mq * 1e6, b, h, d, As: bot.As, phi: bot.dia, n: bot.n, cover: COVER + LINK, fck: m.fck });
  const ch = crackWidth({ M: Math.max(hl, hr) * 1e6, b, h, d, As: top.As, phi: top.dia, n: top.n, cover: COVER + LINK, fck: m.fck });
  const wk = Math.max(cs.wk, ch.wk);
  steps.push(`Span/depth (EC2 7.4.2): L/d = ${ldA.toFixed(1)} against allowable ${ldOk.toFixed(1)} (K = ${K}): ${ldA <= ldOk ? 'satisfied' : 'not satisfied, so the calculated deflection governs'}`);
  steps.push(`Deflection (EC2 7.4.3, quasi-permanent moments ${f1(Mq)} kNm span, ${f1(hl)} and ${f1(hr)} kNm supports, creep φ = 2.5, shrinkage 0.0004): ${df.delta.toFixed(1)} mm against L/250 = ${df.limit.toFixed(1)} mm (ratio ${df.ratio.toFixed(2)})`);
  steps.push(`Crack width (EC2 7.3.4): span w_k = ${cs.wk.toFixed(2)} mm (σs = ${f0(cs.sigma)} MPa), supports w_k = ${ch.wk.toFixed(2)} mm, limit ${cs.limit} mm`);
  if (df.ratio > 1) { notes.push(`Deflection ${df.delta.toFixed(0)} mm exceeds L/250 (${df.limit.toFixed(0)} mm): deepen the beam or add steel`); if (status !== 'bad') status = df.ratio > 1.5 ? 'bad' : 'warn'; }
  if (wk > 0.3) { notes.push(`Crack width ${wk.toFixed(2)} mm exceeds 0.3 mm: use smaller bars at closer spacing`); if (status !== 'bad') status = wk > 0.4 ? 'bad' : 'warn'; }
  const steelKg = ((bot.As * L * 1000 + top.As * L * 700 + ((L * 1000) / lk.s) * 2 * area(lk.phi) * 0.9 * (b + h)) * 7850) / 1e9;
  return { id, story: extra.story, b, h, L, w: F.w, trib: extra.trib ?? 0, MEd: F.sag, Mhog: F.hog, VEd: F.V, AsReq: Math.max(AsB, AsT), AsProv: bot.As, bars: `${bot.n}T${bot.dia}`, topBars: `${top.n}T${top.dia}`, links: lk.txt, status, notes, steps, steelKg, defl: { delta: df.delta, limit: df.limit, ratio: df.ratio, ld: ldA, ldAllowed: ldOk }, crack: { wk, limit: cs.limit } };
}
// Single span with continuity assumed (M = wL²/10, V = 0.6wL): the quick form used for hand checks.
export const designBeam = (id: string, b: number, h: number, L: number, w: number, m: Mat) => { const M = (w * L * L) / 10; return designBeamM(id, b, h, L, { sag: M, hog: M, V: 0.6 * w * L, w }, m); };

// Moment capacity of a rectangular section at axial load N (compression +), symmetric steel As.
export function colMoment(b: number, h: number, d1: number, As: number, fcd: number, fyd: number, N: number) {
  const Es = 200000, ecu = 0.0035;
  const at = (x: number) => {
    const a = Math.min(0.8 * x, h), Fc = b * a * fcd;
    const sig = (dist: number) => Math.max(-fyd, Math.min(fyd, (Es * ecu * (x - dist)) / x));
    let s1 = sig(d1), s2 = sig(h - d1);
    if (d1 < a) s1 -= fcd; if (h - d1 < a) s2 -= fcd;
    return { n: Fc + (As / 2) * (s1 + s2), m: Fc * (h / 2 - a / 2) + (As / 2) * (s1 - s2) * (h / 2 - d1) };
  };
  let lo = 1, hi = 20 * h;
  if (at(hi).n < N) return -1;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; at(mid).n < N ? (lo = mid) : (hi = mid); }
  return at(hi).m;
}

export function designColumn(id: string, b: number, h: number, NEd: number, height: number, m: Mat, story?: string): ColResult {
  if (m.code === 'BS8110') return bsColumn(id, b, h, NEd, height, m, story);
  const { fcd, fyd } = mp(m), notes: string[] = [], steps: string[] = [], Ac = b * h, d1 = COVER + LINK + 10;
  const N = NEd * 1e3, e0 = Math.max(h / 30, 20), MEd = N * e0;
  let status: Status = 'ok';
  const minAs = Math.max((0.1 * N) / fyd, 0.002 * Ac), maxAs = 0.04 * Ac;
  steps.push(`NEd = ${f0(NEd)} kN, minimum eccentricity e0 = max(h/30, 20 mm) = ${f0(e0)} mm, MEd = NEd e0 = ${f1(MEd / 1e6)} kNm (EC2 6.1(4))`);
  let As = maxAs; const fits = colMoment(b, h, d1, maxAs, fcd, fyd, N) >= MEd;
  if (!fits) { notes.push('Section too small for the load: enlarge the column'); status = 'bad'; }
  else {
    let lo = minAs, hi = maxAs;
    if (colMoment(b, h, d1, lo, fcd, fyd, N) >= MEd) hi = lo;
    else for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; colMoment(b, h, d1, mid, fcd, fyd, N) >= MEd ? (hi = mid) : (lo = mid); }
    As = Math.max(hi, minAs);
  }
  steps.push(`Steel from strain compatibility (rectangular block, fcd = ${f1(fcd)} MPa): As,req = ${f0(As)} mm², limits ${f0(minAs)} to ${f0(maxAs)} mm² (EC2 9.5.2)`);
  const options: [number, number][] = [];
  for (const n of [4, 6, 8, 10, 12]) for (const dia of [16, 20, 25, 32]) options.push([n, dia]);
  options.sort((p, q) => p[0] * area(p[1]) - q[0] * area(q[1]));
  const pick = options.find(([n, dia]) => n * area(dia) >= As && n * dia + (n / 2 - 1) * 40 <= Math.max(b, h) - 2 * (COVER + LINK)) ?? [12, 32];
  const prov = pick[0] * area(pick[1]);
  const phiL = Math.max(8, Math.ceil(pick[1] / 4 / 2) * 2), sL = Math.floor(Math.min(20 * pick[1], Math.min(b, h), 400) / 25) * 25;
  const nRatio = Math.max(0.05, N / (Ac * fcd)), lam = (0.85 * height * 1000) / (Math.min(b, h) / Math.sqrt(12)), lamLim = 15.4 / Math.sqrt(nRatio);
  steps.push(`Slenderness λ = l0/i = ${f0(lam)}, limit λlim = 15.4/√n = ${f0(lamLim)} (EC2 5.8.3.1)`);
  if (lam > lamLim) { notes.push(`Slender (λ ${f0(lam)} > ${f0(lamLim)}): second-order effects needed`); if (status === 'ok') status = 'warn'; }
  const steelKg = ((prov * height * 1000 + ((height * 1000) / sL) * 2 * (b + h) * area(phiL)) * 7850) / 1e9;
  return { id, story, b, h, NEd, MEd: MEd / 1e6, AsReq: As, AsProv: prov, bars: `${pick[0]}T${pick[1]}`, links: `T${phiL}@${sL}`, status, notes, steps, steelKg };
}

export type StoryDesign = { name: string; slabT: number; wu: number; beams: number; cols: number };
export type Design = { beams: BeamResult[]; cols: ColResult[]; stories: StoryDesign[]; load: { slabT: number; wu: number; trib: number }; steelT: number };

export function designAll(groups: Group[], lib: Lib[], m: Mat, o: { imposed: number; defaultTrib: number; psi2?: number }): Design {
  const isBS = m.code === 'BS8110', gG = isBS ? 1.4 : 1.35, gQ = isBS ? 1.6 : 1.5, gMin = isBS ? 1.0 : 1.35, psi2 = o.psi2 ?? (isBS ? 1.0 : 0.3);
  const specOf = (e: El) => lib.find(l => l.id === e.library_item_id)?.specs ?? {};
  const Ecm = 22 * Math.pow((m.fck + 8) / 10, 0.3) * 1e6;                   // kN/m²
  const gs = [...groups].sort((a, b) => a.story.elevation_m - b.story.elevation_m);
  const beams: BeamResult[] = [], stories: StoryDesign[] = [];
  const perStory = gs.map(g => {
    const bs = g.els.filter(e => e.type === 'beam'), cs = g.els.filter(e => e.type === 'column'), slabs = g.els.filter(e => e.type === 'slab');
    const longest = Math.max(0, ...bs.map(b => Math.hypot(b.geometry.end[0] - b.geometry.start[0], b.geometry.end[1] - b.geometry.start[1])));
    const slabT = slabs.length ? slabs.reduce((a, s) => a + (s.geometry.z1 - s.geometry.z0), 0) / slabs.length : Math.max(0.15, Math.ceil((longest || 4) / 28 / 0.025) * 0.025);
    const gk = 25 * slabT + 2.5, wu = gG * gk + gQ * o.imposed, wmin = gMin * gk;
    const box = planBox(g.els), trib = cs.length ? box.area / cs.length : 0;
    // beams
    const tw = tribWidths(bs, o.defaultTrib);
    for (const chain of beamChains(bs)) {
      const secs = chain.map(c => beamSec(c.el.geometry, specOf(c.el)));
      const spans: Span[] = chain.map((c, i) => { const { b, d } = secs[i], sw = gG * 25 * b * d, t = tw[c.el.id] ?? o.defaultTrib; return { L: c.L, EI: (Ecm * b * d * d * d) / 12, wMax: wu * t + sw, wMin: wmin * t + sw }; });
      const env = envelope(spans);
      chain.forEach((c, i) => {
        const { b, d } = secs[i], t = tw[c.el.id] ?? o.defaultTrib;
        const r = designBeamM(c.el.id, Math.round(b * 1000), Math.round(d * 1000), c.L, { sag: env[i].sag, hog: Math.max(env[i].hogL, env[i].hogR), hogL: env[i].hogL, hogR: env[i].hogR, V: Math.max(env[i].VL, env[i].VR), w: spans[i].wMax }, m, { story: g.story.name, trib: t, K: chain.length === 1 ? 1.0 : i === 0 || i === chain.length - 1 ? 1.3 : 1.5, qpRatio: (gk * t + 25 * b * d + psi2 * o.imposed * t) / spans[i].wMax });
        r.steps.unshift(`Span ${c.L.toFixed(2)} m in a continuous line of ${chain.length} span${chain.length > 1 ? 's' : ''}; tributary width ${t.toFixed(2)} m; w = (${gG}Gk + ${gQ}Qk) × trib + ${gG} × self-weight = ${spans[i].wMax.toFixed(1)} kN/m; moments from continuous-beam analysis with load patterns (${isBS ? 'BS 8110 cl 3.2.1.2' : 'EC1990/EC2 5.1.3'})`);
        beams.push(r);
      });
    }
    stories.push({ name: g.story.name, slabT, wu, beams: bs.length, cols: cs.length });
    return { g, cs, wu, gk, trib, H: g.story.height_m };
  });
  // columns: load accumulates from every storey above
  const cols: ColResult[] = [];
  perStory.forEach((s, k) => s.cs.forEach(e => {
    const sp = specOf(e), b = sp.b_mm ?? e.geometry.b * 1000, h = sp.h_mm ?? e.geometry.h * 1000;
    let Gk = 0, Qk = 0; for (let j = k; j < perStory.length; j++) { const tr = perStory[j].trib || s.trib; Gk += perStory[j].gk * tr + 25 * (b / 1000) * (h / 1000) * perStory[j].H; Qk += o.imposed * tr; }
    const NEd = gG * Gk + gQ * Qk;
    const r = designColumn(e.id, b, h, NEd, s.H, m, s.g.story.name);
    r.steps.unshift(`Load from ${perStory.length - k} storey${perStory.length - k > 1 ? 's' : ''} (this one and above): Σ [(1.35Gk + 1.5Qk) × tributary area + self-weight] = ${f0(NEd)} kN`);
    r.Gk = Gk; r.Qk = Qk; cols.push(r);
  }));
  const first = stories[0] ?? { slabT: 0.2, wu: 0 };
  const steelT = [...beams, ...cols].reduce((a, r) => a + r.steelKg, 0) / 1000;
  return { beams, cols, stories, load: { slabT: first.slabT, wu: first.wu, trib: perStory[0]?.trib ?? 0 }, steelT };
}
