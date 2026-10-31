// MEP fittings and pressure drop for the routed duct and pipe networks (lib/mep.ts).
// The segments are joined into a tree. Fittings are found at the nodes: elbows (turns), tees (branches), reducers
// (size changes) and vertical offsets (where connected segments sit at different elevations). Pressure drop is the
// straight-run friction loss plus fitting losses, summed along the path from the plant to the most remote outlet.
//   Duct: Darcy-Weisbach on the hydraulic diameter, Swamee-Jain friction factor, galvanised steel roughness 0.09 mm,
//         air at 1.2 kg/m3 and 18 microPa.s. Fitting loss = K rho v^2 / 2 (K from CIBSE/ASHRAE ranges, below).
//   Pipe: Darcy-Weisbach on the bore, steel roughness 0.045 mm, chilled water at 1000 kg/m3 and 1.3 mPa.s.
// K values: duct elbow 0.30 x (angle/90), tee branch 0.60, reducer 0.10, offset 2 x 0.30;
//           pipe elbow 0.75 x (angle/90), tee branch 1.80, reducer 0.30, offset 2 x 0.75.
import type { MepSeg } from './mep';

type Pt = [number, number];
export type FitKind = 'elbow' | 'tee' | 'reducer' | 'offset';
export type Fitting = { kind: FitKind; at: Pt; angle?: number; K: number; dp: number };
export type NetKind = 'duct' | 'pipe';
export type PathResult = { length: number; friction: number; fittings: number; total: number; to: Pt };
export type NetworkResult = {
  kind: NetKind; segments: number; length: number; fittings: Fitting[];
  counts: Record<FitKind, number>; critical: PathResult | null; maxVelocity: number; maxPerMetre: number;
  head: number;       // pressure to overcome at the plant with 10% allowance: Pa for ducts, kPa for pipes
  notes: string[];
};

const ROUGH = { duct: 0.09e-3, pipe: 0.045e-3 };
const FLUID = { duct: { rho: 1.2, mu: 1.8e-5 }, pipe: { rho: 1000, mu: 1.3e-3 } };
const KF = { duct: { elbow: 0.3, tee: 0.6, reducer: 0.1, offset: 0.3 }, pipe: { elbow: 0.75, tee: 1.8, reducer: 0.3, offset: 0.75 } };

// Swamee-Jain explicit friction factor (turbulent), laminar below Re 2300
export function frictionFactor(Re: number, relRough: number): number {
  if (Re < 2300) return Re > 0 ? 64 / Re : 0;
  return 0.25 / Math.log10(relRough / 3.7 + 5.74 / Re ** 0.9) ** 2;
}
export function hydraulicDiameter(s: MepSeg): number {
  if (s.kind === 'pipe') return Math.max(((s.size.dia_mm ?? 12) - 12) / 1000, 0.01);   // bore: outside diameter less 12 mm insulation allowance
  const a = (s.size.w_mm ?? 300) / 1000, b = (s.size.h_mm ?? 200) / 1000;
  return (2 * a * b) / (a + b);
}
// friction loss per metre (Pa/m) at velocity v in a conduit of hydraulic diameter D
export function frictionPerMetre(kind: NetKind, v: number, D: number): number {
  const { rho, mu } = FLUID[kind], Re = (rho * v * D) / mu, f = frictionFactor(Re, ROUGH[kind] / D);
  return (f / D) * ((rho * v * v) / 2);
}
export const dynamicPressure = (kind: NetKind, v: number) => (FLUID[kind].rho * v * v) / 2;

const key = (p: Pt) => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`;
const len = (s: MepSeg) => Math.hypot(s.end[0] - s.start[0], s.end[1] - s.start[1]);

export function analyseNetwork(segs: MepSeg[]): NetworkResult {
  const kind: NetKind = segs[0]?.kind ?? 'duct';
  const empty: NetworkResult = { kind, segments: 0, length: 0, fittings: [], counts: { elbow: 0, tee: 0, reducer: 0, offset: 0 }, critical: null, maxVelocity: 0, maxPerMetre: 0, head: 0, notes: [] };
  const live = segs.filter(s => len(s) > 1e-6);
  if (!live.length) return empty;

  // node graph: each node lists the segments touching it
  const at = new Map<string, { p: Pt; segs: number[] }>();
  const touch = (p: Pt, i: number) => { const k = key(p), n = at.get(k) ?? at.set(k, { p, segs: [] }).get(k)!; n.segs.push(i); };
  live.forEach((s, i) => { touch(s.start, i); touch(s.end, i); });
  const dirFrom = (s: MepSeg, p: Pt): [number, number] => {      // unit vector pointing away from node p along segment s
    const far = key(s.start) === key(p) ? s.end : s.start, L = Math.hypot(far[0] - p[0], far[1] - p[1]) || 1;
    return [(far[0] - p[0]) / L, (far[1] - p[1]) / L];
  };
  const spec = KF[kind], D = (s: MepSeg) => hydraulicDiameter(s);

  const fittings: Fitting[] = [], nodeLoss = new Map<string, number>();
  const counts: Record<FitKind, number> = { elbow: 0, tee: 0, reducer: 0, offset: 0 };
  const add = (k: string, f: Fitting) => { fittings.push(f); counts[f.kind]++; nodeLoss.set(k, (nodeLoss.get(k) ?? 0) + f.dp); };
  for (const [k, n] of at) {
    const ss = n.segs.map(i => live[i]);
    if (ss.length < 2) continue;
    // reference segment: the one with the highest flow carries the main
    const main = ss.reduce((a, b) => (b.flow > a.flow ? b : a)), v = main.velocity;
    if (ss.length === 2) {
      const [a, b] = ss, da = dirFrom(a, n.p), db = dirFrom(b, n.p), cos = Math.max(-1, Math.min(1, da[0] * db[0] + da[1] * db[1]));
      const turn = 180 - (Math.acos(cos) * 180) / Math.PI;           // deflection angle: 0 = straight through
      if (turn > 10) { const K = spec.elbow * (turn / 90); add(k, { kind: 'elbow', at: n.p, angle: Math.round(turn), K, dp: K * dynamicPressure(kind, v) }); }
      if (Math.abs(a.elevation - b.elevation) > 0.02) { const K = 2 * spec.offset; add(k, { kind: 'offset', at: n.p, K, dp: K * dynamicPressure(kind, v) }); }
      if (D(a) !== D(b) || a.size.w_mm !== b.size.w_mm || a.size.h_mm !== b.size.h_mm) { const K = spec.reducer; add(k, { kind: 'reducer', at: n.p, K, dp: K * dynamicPressure(kind, Math.max(a.velocity, b.velocity)) }); }
    } else {
      // tee or cross: the branches each take the branch coefficient; the straight main takes none
      const branches = ss.length - 2;
      for (let b = 0; b < branches; b++) add(k, { kind: 'tee', at: n.p, K: spec.tee, dp: spec.tee * dynamicPressure(kind, v) });
    }
  }

  // root: the end of the highest-flow segment that touches nothing else (the plant)
  const top = live.reduce((a, b) => (b.flow > a.flow ? b : a));
  const ends = [top.start, top.end], leaf = ends.filter(p => at.get(key(p))!.segs.length === 1);
  const root = leaf.length ? leaf[0] : ends[0];
  // depth-first walk accumulating friction and fitting losses to every leaf
  let critical: PathResult | null = null, maxPer = 0, maxV = 0;
  const onPath = new Set<string>();
  const walk = (k: string, from: number, length: number, fric: number, fit: number) => {
    const n = at.get(k)!, next = n.segs.filter(i => i !== from);
    if (!next.length) { const tot = fric + fit; if (!critical || tot > critical.total) critical = { length, friction: fric, fittings: fit, total: tot, to: n.p }; return; }
    for (const i of next) {
      const s = live[i], L = len(s), pm = frictionPerMetre(kind, s.velocity, D(s));
      maxPer = Math.max(maxPer, pm); maxV = Math.max(maxV, s.velocity);
      const other = key(s.start) === k ? key(s.end) : key(s.start);
      if (onPath.has(other)) continue;
      onPath.add(other);
      walk(other, i, length + L, fric + pm * L, fit + (nodeLoss.get(other) ?? 0));
      onPath.delete(other);
    }
  };
  const rk = key(root);
  onPath.add(rk); walk(rk, -1, 0, 0, nodeLoss.get(rk) ?? 0);

  const total = live.reduce((a, s) => a + len(s), 0), crit = critical as PathResult | null, notes: string[] = [];
  const head = crit ? crit.total * 1.1 : 0;
  if (kind === 'duct') {
    if (maxPer > 1.5) notes.push(`Friction ${maxPer.toFixed(2)} Pa/m in the worst duct is above 1.5 Pa/m: enlarge it or reduce the airflow to cut fan power and noise.`);
    if (crit) notes.push(`Fan external static pressure at least ${Math.round(head)} Pa for the critical path (10% allowance); add filters, coils and grilles from the supplier data.`);
  } else {
    if (maxPer > 400) notes.push(`Friction ${Math.round(maxPer)} Pa/m in the worst pipe is above 400 Pa/m (about 40 mm/m): use a larger size.`);
    if (crit) notes.push(`Pump head at least ${(head / 1000 / 9.81).toFixed(2)} m of water (${(head / 1000).toFixed(1)} kPa) before the chiller, valves and coil drops are added.`);
  }
  return { kind, segments: live.length, length: total, fittings, counts, critical: crit, maxVelocity: maxV, maxPerMetre: maxPer, head: kind === 'pipe' ? head / 1000 : head, notes };
}
