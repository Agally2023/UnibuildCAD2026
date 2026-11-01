// Shared reinforced-concrete types and helpers used by the Eurocode 2 and BS 8110 designs.
export type Code = 'EC2' | 'BS8110';
export type Mat = { fck: number; fyk: number; code?: Code };
export const CLASSES = [25, 30, 35, 40];
// Eurocode class names pair the cylinder and cube strengths: C25/30, C30/37, C35/45, C40/50
const CUBE: Record<number, number> = { 25: 30, 30: 37, 35: 45, 40: 50 };
export const cube = (fck: number) => CUBE[fck] ?? Math.round(fck * 1.2);
export const cname = (fck: number) => `C${fck}/${cube(fck)}`;
export const mp = (m: Mat) => ({ fcd: (0.85 * m.fck) / 1.5, fyd: m.fyk / 1.15, fctm: 0.3 * Math.pow(m.fck, 2 / 3) });
export const area = (d: number) => (Math.PI * d * d) / 4;
export const COVER = 30, LINK = 8;
export const f1 = (x: number) => x.toFixed(1), f0 = (x: number) => Math.round(x).toString();

export type Status = 'ok' | 'warn' | 'bad';
export type BeamResult = { id: string; story?: string; b: number; h: number; L: number; w: number; trib: number; MEd: number; Mhog: number; VEd: number; AsReq: number; AsProv: number; bars: string; topBars: string; links: string; status: Status; notes: string[]; steps: string[]; steelKg: number; defl?: { delta: number; limit: number; ratio: number; ld: number; ldAllowed: number }; crack?: { wk: number; limit: number } };
export type ColResult = { Gk?: number; Qk?: number; id: string; story?: string; b: number; h: number; NEd: number; MEd: number; AsReq: number; AsProv: number; bars: string; links: string; status: Status; notes: string[]; steps: string[]; steelKg: number };

export function pickBars(req: number, b: number) {
  const avail = b - 2 * (COVER + LINK);
  for (const dia of [12, 16, 20, 25, 32]) {
    const n = Math.max(2, Math.ceil(req / area(dia)));
    if (n * dia + (n - 1) * Math.max(dia, 25) <= avail) return { n, dia, As: n * area(dia), layers: 1 };
  }
  const dia = 32, n = Math.ceil(req / area(dia));
  return { n, dia, As: n * area(dia), layers: 2 };
}
export function linkFor(reqPerMm: number, d: number) {
  const smax = Math.floor(Math.min(0.75 * d, 300) / 25) * 25;
  for (const phi of [8, 10, 12]) {
    const s = Math.floor((2 * area(phi)) / Math.max(reqPerMm, 1e-6) / 25) * 25;
    if (s >= 75) return { txt: `T${phi}@${Math.min(s, smax)}`, phi, s: Math.min(s, smax) };
  }
  return { txt: 'T12@75', phi: 12, s: 75, tight: true };
}

