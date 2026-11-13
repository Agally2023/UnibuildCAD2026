// Solid-modelling features beyond a plain extrude: edge fillets and chamfers, draft, shell, hole wizard (simple, counterbore,
// countersink), loft, sweep and mirror. Everything is a pure function from sketch regions or paths to a closed Mesh.
import type { Region } from './sketch';
import { BASIS, capTriangles, outward, toWorld, type Mesh, type Plane, type V3 } from './solid';

type P2 = [number, number];
const area = (l: P2[]) => { let s = 0; for (let i = 0; i < l.length; i++) { const a = l[i], b = l[(i + 1) % l.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
const orient = (l: P2[], ccw: boolean): P2[] => ((area(l) > 0) === ccw ? l : [...l].reverse());

// Move a closed loop sideways by d into the material (outer loops counter-clockwise, holes clockwise: the material is on the left).
// Corners are mitred, so the vertex count never changes.
export function offsetLoop(loop: P2[], d: number): P2[] {
  const n = loop.length;
  return loop.map((p, i) => {
    const a = loop[(i + n - 1) % n], b = loop[(i + 1) % n];
    let ux = p[0] - a[0], uy = p[1] - a[1], wx = b[0] - p[0], wy = b[1] - p[1];
    const lu = Math.hypot(ux, uy) || 1, lw = Math.hypot(wx, wy) || 1; ux /= lu; uy /= lu; wx /= lw; wy /= lw;
    const nax = -uy, nay = ux, nbx = -wy, nby = wx, k = Math.max(0.35, 1 + nax * nbx + nay * nby);
    return [p[0] + ((nax + nbx) / k) * d, p[1] + ((nay + nby) / k) * d] as P2;
  });
}
const norm = (r: Region): Region => ({ outer: orient(r.outer, true), holes: r.holes.map(h => orient(h, false)) });
export const insetRegions = (rs: Region[], t: number): Region[] => rs.map(norm).map(r => ({ outer: offsetLoop(r.outer, t), holes: r.holes.map(h => offsetLoop(h, t)) }));

export type EdgeOpt = { symmetric?: boolean; fillet?: number; chamfer?: number; draft?: number; edges?: 'both' | 'top' | 'bottom' };
// Extrude with rounded or chamfered rims on the end faces and/or a draft (taper) angle. Positive draft narrows the far end.
export function extrudeEdges(regions: Region[], plane: Plane, offset: number, depth: number, o: EdgeOpt = {}): Mesh {
  const L = Math.abs(depth), zlo = o.symmetric ? -L / 2 : Math.min(0, depth), zhi = zlo + L;
  const both = (o.edges ?? 'both') === 'both', bot = both || o.edges === 'bottom', top = both || o.edges === 'top';
  let e = o.fillet && o.fillet > 0 ? o.fillet : o.chamfer && o.chamfer > 0 ? o.chamfer : 0;
  e = Math.min(e, (bot && top ? L / 2 : L) - 1e-3); if (e < 1e-6) e = 0;
  const n = o.fillet && o.fillet > 0 ? 4 : 1, tan = Math.tan(((o.draft ?? 0) * Math.PI) / 180);
  const rows: [number, number][] = [];
  if (bot && e) for (let k = 0; k <= n; k++) { const f = (k / n) * (Math.PI / 2); rows.push(n === 1 ? [e * (1 - k), zlo + e * k] : [e * (1 - Math.sin(f)), zlo + e * (1 - Math.cos(f))]); } else rows.push([0, zlo]);
  if (top && e) for (let k = 0; k <= n; k++) { const f = (k / n) * (Math.PI / 2); rows.push(n === 1 ? [e * k, zhi - e * (1 - k)] : [e * (1 - Math.cos(f)), zhi - e + e * Math.sin(f)]); } else rows.push([0, zhi]);
  const v: number[] = [], f: number[] = [], push = (p: V3) => { v.push(p[0], p[1], p[2]); return v.length / 3 - 1; };
  for (const r0 of regions.map(norm)) {
    const loops = [r0.outer, ...r0.holes], made = rows.map(([ins, z]) => loops.map(l => offsetLoop(l, ins + (z - zlo) * tan).map(p => push(toWorld(plane, offset, p, z)))));
    for (let s = 0; s + 1 < rows.length; s++) loops.forEach((l, li) => { const A = made[s][li], B = made[s + 1][li]; for (let i = 0; i < l.length; i++) { const j = (i + 1) % l.length; f.push(A[i], A[j], B[j], A[i], B[j], B[i]); } });
    for (const end of [0, 1]) {
      const [ins, z] = rows[end ? rows.length - 1 : 0], reg: Region = { outer: offsetLoop(r0.outer, ins + (z - zlo) * tan), holes: r0.holes.map(h => offsetLoop(h, ins + (z - zlo) * tan)) };
      const { pts, tri } = capTriangles(reg), ids = pts.map(p => push(toWorld(plane, offset, p, z)));
      for (let i = 0; i < tri.length; i += 3) end ? f.push(ids[tri[i]], ids[tri[i + 1]], ids[tri[i + 2]]) : f.push(ids[tri[i]], ids[tri[i + 2]], ids[tri[i + 1]]);
    }
  }
  return outward({ v, f });
}

// ---------- hole wizard ----------
export type HoleKind = 'simple' | 'cbore' | 'csink';
// A lathe profile of (radius, distance along the axis) pairs that starts and ends on the axis, turned about the axis through c.
export function latheAt(profile: P2[], plane: Plane, offset: number, c: P2, sign = 1, n = 36): Mesh {
  const v: number[] = [], f: number[] = [], rows: number[][] = [];
  for (const [r, z] of profile) {
    if (r < 1e-9) { v.push(...toWorld(plane, offset, c, sign * z)); rows.push([v.length / 3 - 1]); continue; }
    const row: number[] = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; v.push(...toWorld(plane, offset, [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)], sign * z)); row.push(v.length / 3 - 1); }
    rows.push(row);
  }
  for (let s = 0; s + 1 < rows.length; s++) {
    const A = rows[s], B = rows[s + 1];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (A.length === 1 && B.length === 1) continue;
      if (A.length === 1) f.push(A[0], B[j], B[i]); else if (B.length === 1) f.push(A[i], A[j], B[0]); else f.push(A[i], A[j], B[j], A[i], B[j], B[i]);
    }
  }
  return outward({ v, f });
}
export function holeProfile(kind: HoleKind, dia: number, depth: number, cdia = 0, cdepth = 0): P2[] {
  const R = dia / 2, D = Math.abs(depth), e = 1;
  if (kind === 'cbore' && cdia > dia) return [[0, -e], [cdia / 2, -e], [cdia / 2, Math.min(cdepth, D)], [R, Math.min(cdepth, D)], [R, D], [0, D]];
  if (kind === 'csink' && cdia > dia) { const Rc = cdia / 2; return [[0, -e], [Rc + e, -e], [R, Rc - R], [R, Math.max(D, Rc - R + 0.01)], [0, Math.max(D, Rc - R + 0.01)]]; }
  return [[0, -e], [R, -e], [R, D], [0, D]];
}

// ---------- loft ----------
function frac(loop0: P2[], ccw: boolean) {
  const loop = orient(loop0, ccw), n = loop.length, cx = loop.reduce((a, p) => a + p[0], 0) / n, cy = loop.reduce((a, p) => a + p[1], 0) / n;
  let pts = loop, k0 = -1, hit: P2 | null = null;
  for (let i = 0; i < n && !hit; i++) {
    const p = loop[i], q = loop[(i + 1) % n], dp = p[1] - cy, dq = q[1] - cy;
    if ((dp < 0 && dq >= 0) || (dp > 0 && dq <= 0) || (dp === 0 && dq !== 0)) { const t = dp === dq ? 0 : dp / (dp - dq), x = p[0] + (q[0] - p[0]) * t; if (x > cx + 1e-9) { hit = [x, cy]; k0 = i; } }
  }
  if (hit) { const rest = [...loop.slice(k0 + 1), ...loop.slice(0, k0 + 1)]; pts = [hit, ...rest]; }
  const cum = [0]; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const tot = cum[pts.length] || 1;
  return { pts, t: cum.slice(0, pts.length).map(c => c / tot), at: (t: number): P2 => {
    let i = 0; while (i + 1 < pts.length && cum[i + 1] / tot <= t + 1e-12) i++;
    const a = pts[i], b = pts[(i + 1) % pts.length], t0 = cum[i] / tot, t1 = cum[i + 1] / tot, u = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  } };
}
const matchLoops = (a: P2[], b: P2[], ccw: boolean, extra = 48): [P2[], P2[]] => {
  const A = frac(a, ccw), B = frac(b, ccw), ts = [...A.t, ...B.t, ...Array.from({ length: extra }, (_, i) => i / extra)].sort((x, y) => x - y).filter((t, i, arr) => i === 0 || t - arr[i - 1] > 1e-7);
  return [ts.map(t => A.at(t)), ts.map(t => B.at(t))];
};
// Blend the first region of one sketch into the first region of another one on a parallel plane (square to round, tapered housings).
// Bores are lofted too when both sketches have the same number of them.
export function loft(ra: Region, rb: Region, plane: Plane, offA: number, offB: number): Mesh {
  if (offA > offB) { const t = ra; ra = rb; rb = t; const o = offA; offA = offB; offB = o; }
  if (Math.abs(offB - offA) < 1e-9) throw new Error('The two sketches are on the same plane. Give one of them an offset.');
  const withHoles = ra.holes.length === rb.holes.length;
  const pairs: [P2[], P2[]][] = [matchLoops(ra.outer, rb.outer, true), ...(withHoles ? ra.holes.map((h, i) => matchLoops(h, rb.holes[i], false)) : [])];
  const v: number[] = [], f: number[] = [], push = (p: V3) => { v.push(p[0], p[1], p[2]); return v.length / 3 - 1; };
  const A = pairs.map(([a]) => a.map(p => push(toWorld(plane, offA, p)))), B = pairs.map(([, b]) => b.map(p => push(toWorld(plane, offB, p))));
  pairs.forEach(([a], li) => { for (let i = 0; i < a.length; i++) { const j = (i + 1) % a.length; f.push(A[li][i], A[li][j], B[li][j], A[li][i], B[li][j], B[li][i]); } });
  for (const end of [0, 1]) {
    const reg: Region = { outer: pairs[0][end], holes: pairs.slice(1).map(p => p[end]) }, { pts, tri } = capTriangles(reg), ids = pts.map(p => push(toWorld(plane, end ? offB : offA, p)));
    for (let i = 0; i < tri.length; i += 3) end ? f.push(ids[tri[i]], ids[tri[i + 1]], ids[tri[i + 2]]) : f.push(ids[tri[i]], ids[tri[i + 2]], ids[tri[i + 1]]);
  }
  return outward({ v, f });
}

// ---------- sweep ----------
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addv = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export function roundedPath(path: V3[], bend: number, per = 8): V3[] {
  const out: V3[] = [path[0]];
  for (let i = 1; i + 1 < path.length; i++) {
    const A = path[i - 1], P = path[i], B = path[i + 1], u = unit(sub(P, A)), w = unit(sub(B, P)), cosT = Math.max(-1, Math.min(1, dot(u, w))), turn = Math.acos(cosT);
    if (turn < 1e-3 || bend <= 0) { out.push(P); continue; }
    let t = bend * Math.tan(turn / 2); const room = Math.min(len(sub(P, A)), len(sub(B, P))) / 2; if (t > room) t = room;
    const rad = t / Math.tan(turn / 2), P1 = addv(P, u, -t), nv = unit(sub(w, [u[0] * cosT, u[1] * cosT, u[2] * cosT])), C = addv(P1, nv, rad), ax = unit(cross(u, w));
    for (let s = 0; s <= per; s++) {
      const th = (s / per) * turn, r0 = sub(P1, C), c = Math.cos(th), sn = Math.sin(th), kxr = cross(ax, r0), kd = dot(ax, r0);
      out.push([C[0] + r0[0] * c + kxr[0] * sn + ax[0] * kd * (1 - c), C[1] + r0[1] * c + kxr[1] * sn + ax[1] * kd * (1 - c), C[2] + r0[2] * c + kxr[2] * sn + ax[2] * kd * (1 - c)]);
    }
  }
  out.push(path[path.length - 1]);
  return out;
}
// A round bar (or tube when bore > 0) of diameter dia that follows a polyline, with the bends rounded to the bend radius.
export function sweepTube(path: V3[], dia: number, bore = 0, bend = 0, seg = 28): Mesh {
  if (path.length < 2) throw new Error('A sweep path needs at least two points');
  const c = roundedPath(path, bend), R = dia / 2, r = Math.min(bore / 2, R - 1e-3), hollow = r > 1e-6, v: number[] = [], f: number[] = [];
  const T = c.map((p, i) => unit(sub(c[Math.min(c.length - 1, i + 1)], c[Math.max(0, i - 1)])));
  let N = cross(T[0], Math.abs(T[0][2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]); N = unit(N);
  const rings: number[][][] = [];
  c.forEach((p, i) => {
    if (i) { const t = T[i]; N = unit(sub(N, [t[0] * dot(N, t), t[1] * dot(N, t), t[2] * dot(N, t)])); }
    const Bn = cross(T[i], N), mk = (rad: number) => Array.from({ length: seg }, (_, k) => { const a = (k / seg) * Math.PI * 2, q = addv(addv(p, N, rad * Math.cos(a)), Bn, rad * Math.sin(a)); v.push(...q); return v.length / 3 - 1; });
    rings.push(hollow ? [mk(R), mk(r)] : [mk(R)]);
  });
  for (let s = 0; s + 1 < rings.length; s++) rings[s].forEach((A, li) => { const B = rings[s + 1][li]; for (let i = 0; i < seg; i++) { const j = (i + 1) % seg; if (li) f.push(A[i], B[j], A[j], A[i], B[i], B[j]); else f.push(A[i], A[j], B[j], A[i], B[j], B[i]); } });
  const first = rings[0], last = rings[rings.length - 1];
  if (hollow) for (let i = 0; i < seg; i++) { const j = (i + 1) % seg; f.push(first[0][i], first[1][j], first[0][j], first[0][i], first[1][i], first[1][j]); f.push(last[0][i], last[0][j], last[1][j], last[0][i], last[1][j], last[1][i]); }
  else { v.push(...c[0]); const a = v.length / 3 - 1; v.push(...c[c.length - 1]); const b = a + 1; for (let i = 0; i < seg; i++) { const j = (i + 1) % seg; f.push(a, first[0][j], first[0][i]); f.push(b, last[0][i], last[0][j]); } }
  return outward({ v, f });
}

// ---------- mirror ----------
export function mirrorMesh(m: Mesh, plane: Plane, offset: number): Mesh {
  const k = plane === 'XY' ? 2 : plane === 'XZ' ? 1 : 0, v = [...m.v];
  for (let i = k; i < v.length; i += 3) v[i] = 2 * offset - v[i];
  const f = [...m.f]; for (let i = 0; i < f.length; i += 3) { const t = f[i + 1]; f[i + 1] = f[i + 2]; f[i + 2] = t; }
  return { v, f };
}
void BASIS;
