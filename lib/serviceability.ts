// EN 1992-1-1 serviceability: calculated deflection (7.4.3), span/depth limits (7.4.2) and crack width (7.3.4).
// Units: mm, N, MPa unless noted. Rectangular sections, singly reinforced, quasi-permanent loading.
const Es = 200000;
export const ecm = (fck: number) => 22000 * Math.pow((fck + 8) / 10, 0.3);
export const fctm = (fck: number) => 0.3 * Math.pow(fck, 2 / 3);

// Cracked and uncracked transformed section properties, with creep through the effective modulus.
export function section(b: number, h: number, d: number, As: number, fck: number, creep = 2.5) {
  const Eeff = ecm(fck) / (1 + creep), n = Es / Eeff, na = n * As;
  const xII = -na / b + Math.sqrt((na / b) ** 2 + (2 * na * d) / b);
  const III = (b * xII ** 3) / 3 + na * (d - xII) ** 2;
  const xI = ((b * h * h) / 2 + na * d) / (b * h + na);
  const II = (b * h ** 3) / 12 + b * h * (xI - h / 2) ** 2 + na * (d - xI) ** 2;
  return { Eeff, n, xII, III, xI, II, Mcr: (fctm(fck) * II) / (h - xI), SII: As * (d - xII), SI: As * (d - xI) };
}
// Curvature (1/mm) at moment M (N·mm): load part interpolated between uncracked and cracked states, plus shrinkage.
export function curvature(M: number, sec: ReturnType<typeof section>, beta = 0.5, ecs = 0.0004) {
  const zeta = M > sec.Mcr ? 1 - beta * (sec.Mcr / M) ** 2 : 0;
  const load = zeta * (M / (sec.Eeff * sec.III)) + (1 - zeta) * (M / (sec.Eeff * sec.II));
  const shr = ecs * sec.n * (zeta * (sec.SII / sec.III) + (1 - zeta) * (sec.SI / sec.II));
  return { kappa: load + shr, zeta, cracked: M > sec.Mcr };
}
// Midspan deflection of a span with end curvatures kA, kB and midspan curvature kC (sagging +): L²/96 (kA + 10 kC + kB).
export const deflection = (L: number, kA: number, kC: number, kB: number) => (L * L * (kA + 10 * kC + kB)) / 96;

// Continuous beam span: moments in kNm (quasi-permanent), L in m.
export function beamDeflection(L: number, b: number, h: number, d: number, AsBot: number, AsTop: number, Msag: number, MhogL: number, MhogR: number, fck: number) {
  const bot = section(b, h, d, AsBot, fck), top = section(b, h, d, AsTop, fck);
  const kC = curvature(Msag * 1e6, bot).kappa, kA = -curvature(MhogL * 1e6, top).kappa, kB = -curvature(MhogR * 1e6, top).kappa;
  const delta = deflection(L * 1000, kA, kC, kB), limit = (L * 1000) / 250;
  return { delta, limit, ratio: delta / limit, cracked: Msag * 1e6 > bot.Mcr };
}

// Basic span/depth with the EC2 7.16 expressions. K: 1.0 simply supported, 1.3 end span, 1.5 interior span.
export function allowedSpanDepth(o: { K: number; fck: number; rho: number; AsReq: number; AsProv: number; fyk: number; L: number; span7?: boolean }) {
  const r0 = Math.sqrt(o.fck) / 1000, sq = Math.sqrt(o.fck);
  const base = o.rho <= r0 ? 11 + 1.5 * sq * (r0 / o.rho) + 3.2 * sq * Math.pow(r0 / o.rho - 1, 1.5) : 11 + 1.5 * sq * (r0 / o.rho);
  let v = o.K * base * Math.min(1.5, 500 / (o.fyk * (o.AsReq / o.AsProv)));
  if (o.span7 !== false && o.L > 7) v *= 7 / o.L;
  return v;
}

// Crack width under moment M (N·mm). phi bar diameter, n bars across b (or spacing in mm for slabs), cover to the bar.
export function crackWidth(o: { M: number; b: number; h: number; d: number; As: number; phi: number; n?: number; spacing?: number; cover: number; fck: number; limit?: number }) {
  const sec = section(o.b, o.h, o.d, o.As, o.fck), limit = o.limit ?? 0.3;
  if (o.M <= sec.Mcr) return { wk: 0, limit, sigma: 0, srmax: 0, cracked: false };
  const sigma = (sec.n * o.M * (o.d - sec.xII)) / sec.III, ae = Es / ecm(o.fck);
  const hc = Math.min(2.5 * (o.h - o.d), (o.h - sec.xII) / 3, o.h / 2), rho = o.As / (o.b * hc);
  const diff = Math.max((sigma - (0.4 * fctm(o.fck)) / rho * (1 + ae * rho)) / Es, (0.6 * sigma) / Es);
  const spacing = o.spacing ?? (o.n && o.n > 1 ? (o.b - 2 * o.cover - o.phi) / (o.n - 1) : Infinity);
  const srmax = spacing > 5 * (o.cover + o.phi / 2) ? 1.3 * (o.h - sec.xII) : 3.4 * o.cover + (0.8 * 0.5 * 0.425 * o.phi) / rho;
  return { wk: srmax * diff, limit, sigma, srmax, cracked: true };
}
