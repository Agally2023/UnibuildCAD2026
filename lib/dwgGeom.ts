// Geometry helpers for engineering drawings: cameras, clipping, loops, circle detection, section cuts and hatching.
// Pure functions (no DOM), tested. Lengths are millimetres. 2D coordinates are "view coordinates" (u right, v up) in model millimetres.
import type { Mesh, V3 } from './solid';
import type { Q } from './orbit';

export type Pt = [number, number];
export type Seg = [number, number, number, number];
export type Cam = { right: V3; up: V3; fwd: V3 };

export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const norm = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const mkCam = (from: V3, upHint: V3 = [0, 0, 1]): Cam => { const fwd = norm([-from[0], -from[1], -from[2]]); let right = cross(fwd, upHint); if (Math.hypot(...right) < 1e-6) right = [1, 0, 0]; right = norm(right); return { right, up: cross(right, fwd), fwd }; };
export const proj = (c: Cam, p: V3): Pt => [dot(p, c.right), dot(p, c.up)];
// a camera looking from azimuth/elevation (degrees); azimuth 0 is the front (looking along +y), positive turns towards +x
export const camAzEl = (az: number, el: number): Cam => { const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180; return mkCam([Math.cos(e) * Math.sin(a), -Math.cos(e) * Math.cos(a), Math.sin(e)]); };

export type NamedView = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'iso' | 'dimetric' | 'trimetric';
export const NAMED: Record<NamedView, Cam> = {
  front: mkCam([0, -1, 0]), back: mkCam([0, 1, 0]), right: mkCam([1, 0, 0]), left: mkCam([-1, 0, 0]),
  top: { right: [1, 0, 0], up: [0, 1, 0], fwd: [0, 0, -1] }, bottom: { right: [1, 0, 0], up: [0, -1, 0], fwd: [0, 0, 1] },
  iso: camAzEl(45, 35.264), dimetric: camAzEl(41.4, 7), trimetric: camAzEl(30, 25),
};
export const VIEW_NAMES: Record<NamedView, string> = { front: 'FRONT', back: 'BACK', left: 'LEFT', right: 'RIGHT', top: 'TOP', bottom: 'BOTTOM', iso: 'ISOMETRIC', dimetric: 'DIMETRIC', trimetric: 'TRIMETRIC' };

// the orbit quaternion (see lib/orbit.ts and paintMeshURL) that looks through a camera
export function qFromCam(c: Cam): Q {
  const r0: V3 = [c.right[0], c.right[2], -c.right[1]], r1: V3 = [c.up[0], c.up[2], -c.up[1]], r2: V3 = [-c.fwd[0], -c.fwd[2], c.fwd[1]];
  const m = [r0, r1, r2], tr = m[0][0] + m[1][1] + m[2][2]; let x: number, y: number, z: number, w: number;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; w = s / 4; x = (m[2][1] - m[1][2]) / s; y = (m[0][2] - m[2][0]) / s; z = (m[1][0] - m[0][1]) / s; }
  else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) { const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2; w = (m[2][1] - m[1][2]) / s; x = s / 4; y = (m[0][1] + m[1][0]) / s; z = (m[0][2] + m[2][0]) / s; }
  else if (m[1][1] > m[2][2]) { const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2; w = (m[0][2] - m[2][0]) / s; x = (m[0][1] + m[1][0]) / s; y = s / 4; z = (m[1][2] + m[2][1]) / s; }
  else { const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2; w = (m[1][0] - m[0][1]) / s; x = (m[0][2] + m[2][0]) / s; y = (m[1][2] + m[2][1]) / s; z = s / 4; }
  const l = Math.hypot(x, y, z, w) || 1; return [x / l, y / l, z / l, w / l];
}

// ---------- clipping (so every drawn line is a plain segment: SVG, PDF and DXF all agree) ----------
export function clipRect(s: Seg, x0: number, y0: number, x1: number, y1: number): Seg | null {
  let [ax, ay, bx, by] = s, t0 = 0, t1 = 1; const dx = bx - ax, dy = by - ay;
  for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]] as [number, number][]) {
    if (Math.abs(p) < 1e-12) { if (q < 0) return null; continue; }
    const r = q / p; if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  if (t1 - t0 < 1e-9) return null;
  return [ax + dx * t0, ay + dy * t0, ax + dx * t1, ay + dy * t1];
}
export function clipCircle(s: Seg, cx: number, cy: number, r: number): Seg | null {
  const [ax, ay, bx, by] = s, dx = bx - ax, dy = by - ay, fx = ax - cx, fy = ay - cy, a = dx * dx + dy * dy; if (a < 1e-18) return null;
  const b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - r * r, ina = c <= 0, d = b * b - 4 * a * c;
  const inb = (bx - cx) ** 2 + (by - cy) ** 2 <= r * r;
  if (ina && inb) return s;
  if (d <= 0) return null;
  const sq = Math.sqrt(d); let t0 = (-b - sq) / (2 * a), t1 = (-b + sq) / (2 * a); t0 = Math.max(0, t0); t1 = Math.min(1, t1);
  if (t1 - t0 < 1e-9) return null;
  return [ax + dx * t0, ay + dy * t0, ax + dx * t1, ay + dy * t1];
}
// keep the part of a segment whose coordinate (axis 0 = u, 1 = v) lies in [lo, hi]
export function clipBand(s: Seg, axis: 0 | 1, lo: number, hi: number): Seg | null {
  return axis === 0 ? clipRect(s, lo, -1e12, hi, 1e12) : clipRect(s, -1e12, lo, 1e12, hi);
}

// ---------- chains and circles ----------
export type Chain = { pts: Pt[]; closed: boolean };
// join segments end to end into simple paths: a path ends where three or more lines meet. Isolated loops come out closed.
// (points closer than tol are the same point)
export function chain(segs0: Seg[], tol = 1e-3): Chain[] {
  const key = (x: number, y: number) => `${Math.round(x / tol)},${Math.round(y / tol)}`;
  // the same line seen twice (an edge on the top and on the bottom of a hole) counts once
  const seen = new Set<string>(), segs = segs0.filter(s => { const a = key(s[0], s[1]), b = key(s[2], s[3]), k = a < b ? `${a}|${b}` : `${b}|${a}`; if (seen.has(k) || a === b) return false; seen.add(k); return true; });
  type N = { p: Pt; e: number[] };
  const nodes = new Map<string, N>(), ends: [N, N][] = [];
  const node = (x: number, y: number) => { const k = key(x, y); let n = nodes.get(k); if (!n) { n = { p: [x, y], e: [] }; nodes.set(k, n); } return n; };
  segs.forEach((s, i) => { const a = node(s[0], s[1]), b = node(s[2], s[3]); if (a === b) { ends.push([a, b]); return; } a.e.push(i); b.e.push(i); ends.push([a, b]); });
  const used = new Array(segs.length).fill(false), out: Chain[] = [];
  const walk = (start: N, first: number): Chain => {
    const pts: Pt[] = [start.p]; let cur = start, ei = first;
    for (;;) {
      used[ei] = true; const [a, b] = ends[ei], nx = a === cur ? b : a; pts.push(nx.p);
      if (nx === start) return { pts, closed: true };
      if (nx.e.length !== 2) return { pts, closed: false };
      const more = nx.e.filter(j => !used[j]); if (!more.length) return { pts, closed: false };
      cur = nx; ei = more[0];
    }
  };
  for (const n of nodes.values()) if (n.e.length !== 2) for (const i of n.e) if (!used[i]) out.push(walk(n, i));
  for (const n of nodes.values()) for (const i of n.e) if (!used[i]) out.push(walk(n, i));
  return out;
}
export type Circ = { cx: number; cy: number; r: number; a0: number; a1: number; full: boolean };
function fit3(a: Pt, b: Pt, c: Pt): { cx: number; cy: number; r: number } | null {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1])); if (Math.abs(d) < 1e-9) return null;
  const a2 = a[0] ** 2 + a[1] ** 2, b2 = b[0] ** 2 + b[1] ** 2, c2 = c[0] ** 2 + c[1] ** 2;
  const cx = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d, cy = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
  return { cx, cy, r: Math.hypot(a[0] - cx, a[1] - cy) };
}
// least-squares circle through points (Kasa's algebraic fit)
function fitLsq(P: Pt[]): { cx: number; cy: number; r: number } | null {
  const n = P.length; if (n < 3) return null;
  let mx = 0, my = 0; for (const p of P) { mx += p[0]; my += p[1]; } mx /= n; my /= n;
  let suu = 0, suv = 0, svv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const p of P) { const u = p[0] - mx, v = p[1] - my; suu += u * u; suv += u * v; svv += v * v; suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u; }
  const det = suu * svv - suv * suv; if (Math.abs(det) < 1e-12) return null;
  const a = 0.5 * (suuu + suvv), b = 0.5 * (svvv + svuu), uc = (a * svv - b * suv) / det, vc = (b * suu - a * suv) / det;
  return { cx: uc + mx, cy: vc + my, r: Math.sqrt(uc * uc + vc * vc + (suu + svv) / n) };
}
// circles and arcs found in a set of drawn lines. Each simple path that stays at one distance from a centre is an arc; arcs that share a
// centre and radius are joined and the circle refitted through all their points; a circle is "full" when its arcs cover (nearly) all of it.
export function findCircles(segs: Seg[], tol = 1e-3): Circ[] {
  type Arc = { cx: number; cy: number; r: number; sweep: number; a0: number; a1: number; pts: Pt[] };
  const arcs: Arc[] = [];
  for (const ch of chain(segs, tol)) {
    const P = ch.closed ? ch.pts.slice(0, -1) : ch.pts, n = P.length; if (n < 4) continue;
    const f = fitLsq(P); if (!f || f.r < 0.2 || f.r > 1e5) continue;
    let bad = 0; for (const p of P) if (Math.abs(Math.hypot(p[0] - f.cx, p[1] - f.cy) - f.r) > f.r * 0.02 + 2e-3) bad++;
    if (bad > 0) continue;
    const ang = P.map(p => Math.atan2(p[1] - f.cy, p[0] - f.cx)); let sweep = 0;
    for (let i = 1; i < ang.length; i++) { let d = ang[i] - ang[i - 1]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; sweep += d; }
    if (ch.closed) { let d = ang[0] - ang[ang.length - 1]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; sweep += d; }
    if (Math.abs(sweep) < 0.6) continue;
    arcs.push({ ...f, sweep: Math.abs(sweep), a0: sweep >= 0 ? ang[0] : ang[ang.length - 1], a1: sweep >= 0 ? ang[ang.length - 1] : ang[0], pts: P });
  }
  const same = (a: { cx: number; cy: number; r: number }, b: { cx: number; cy: number; r: number }) => Math.abs(a.cx - b.cx) < 0.03 * a.r + 1e-2 && Math.abs(a.cy - b.cy) < 0.03 * a.r + 1e-2 && Math.abs(a.r - b.r) < 0.03 * a.r + 1e-2;
  const grp: { c: Arc; total: number; best: Arc; pts: Pt[] }[] = [];
  for (const a of arcs) { const g = grp.find(q => same(q.c, a)); if (g) { g.total += a.sweep; g.pts.push(...a.pts); if (a.sweep > g.best.sweep) g.best = a; } else grp.push({ c: a, total: a.sweep, best: a, pts: [...a.pts] }); }
  return grp.map(g => { const f = fitLsq(g.pts) ?? g.c; return { cx: f.cx, cy: f.cy, r: f.r, a0: g.best.a0, a1: g.best.a1, full: g.total >= Math.PI * 0.95 }; });
}

// ---------- cutting a mesh ----------
const AX: Record<'x' | 'y' | 'z', number> = { x: 0, y: 1, z: 2 };
// keep the part of a mesh on one side of the plane axis = pos (side +1 keeps larger coordinates). Cut triangles are split; the cut itself stays open.
export function clipMesh(m: Mesh, axis: 'x' | 'y' | 'z', pos: number, side: 1 | -1): Mesh {
  const k = AX[axis], v: number[] = [], f: number[] = [], P = (i: number): V3 => [m.v[i * 3], m.v[i * 3 + 1], m.v[i * 3 + 2]];
  const push = (p: V3) => { v.push(p[0], p[1], p[2]); return v.length / 3 - 1; };
  const d = (p: V3) => (p[k] - pos) * side;
  for (let i = 0; i < m.f.length; i += 3) {
    const tri = [P(m.f[i]), P(m.f[i + 1]), P(m.f[i + 2])], poly: V3[] = [];
    for (let j = 0; j < 3; j++) {
      const a = tri[j], b = tri[(j + 1) % 3], da = d(a), db = d(b);
      if (da >= 0) poly.push(a);
      if ((da > 0 && db < 0) || (da < 0 && db > 0)) { const t = da / (da - db); poly.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
    }
    if (poly.length < 3) continue;
    const ids = poly.map(push); for (let j = 1; j + 1 < ids.length; j++) f.push(ids[0], ids[j], ids[j + 1]);
  }
  return { v, f };
}
// the outline where the plane axis = pos cuts the mesh: 3D segments
export function cutSegs(m: Mesh, axis: 'x' | 'y' | 'z', pos: number): [V3, V3][] {
  const k = AX[axis], out: [V3, V3][] = [];
  for (let i = 0; i < m.f.length; i += 3) {
    const t = [0, 1, 2].map(q => { const j = m.f[i + q] * 3; return [m.v[j], m.v[j + 1], m.v[j + 2]] as V3; }), pts: V3[] = [];
    for (let q = 0; q < 3; q++) { const a = t[q], b = t[(q + 1) % 3], da = a[k] - pos, db = b[k] - pos; if ((da < 0 && db >= 0) || (da >= 0 && db < 0)) { const s = da / (da - db); pts.push([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s]); } }
    if (pts.length === 2 && Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1], pts[0][2] - pts[1][2]) > 1e-9) out.push([pts[0], pts[1]]);
  }
  return out;
}

// ---------- hatching ----------
// parallel lines at an angle and spacing, clipped to the inside of the outline (even-odd rule on the outline segments)
export function hatchSegs(outline: Seg[], angleDeg: number, gap: number): Seg[] {
  if (!outline.length || gap <= 0) return [];
  const a = (angleDeg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a), R = (x: number, y: number): Pt => [x * ca + y * sa, -x * sa + y * ca], B = (x: number, y: number): Pt => [x * ca - y * sa, x * sa + y * ca];
  const rs = outline.map(s => [...R(s[0], s[1]), ...R(s[2], s[3])] as Seg);
  let lo = Infinity, hi = -Infinity; for (const s of rs) { lo = Math.min(lo, s[1], s[3]); hi = Math.max(hi, s[1], s[3]); }
  const out: Seg[] = [], n = Math.ceil((hi - lo) / gap);
  if (n > 4000) return [];
  for (let i = 0; i <= n; i++) {
    const y = lo + gap / 2 + i * gap; if (y > hi) break;
    const hits: number[] = [];
    for (const [ax, ay, bx, by] of rs) { if ((ay < y && by >= y) || (ay >= y && by < y)) { const t = (y - ay) / (by - ay); hits.push(ax + (bx - ax) * t); } }
    hits.sort((p, q) => p - q);
    for (let j = 0; j + 1 < hits.length; j += 2) if (hits[j + 1] - hits[j] > 1e-6) out.push([...B(hits[j], y), ...B(hits[j + 1], y)] as Seg);
  }
  return out;
}
export const segLen = (s: Seg) => Math.hypot(s[2] - s[0], s[3] - s[1]);

// ---------- cylinders and arcs, read from the solid itself ----------
// A round hole, bore, boss or fillet is a run of narrow facets parallel to an axis whose normals turn smoothly. Finding them in the mesh (instead of in
// the drawn lines) is reliable even when two rims are tessellated differently. Only cylinders along the x, y or z axis are found, which is nearly every part.
export type Cyl = { axis: 0 | 1 | 2; c: Pt; r: number; lo: number; hi: number; sweep: number; full: boolean };   // c: centre in the two other axes, in ascending axis order
const CYL = new WeakMap<Mesh, Cyl[]>();
export function findCylinders(m: Mesh): Cyl[] {
  const have = CYL.get(m); if (have) return have;
  const out: Cyl[] = [], nv = m.v.length / 3, T = m.f.length / 3; if (!T) { CYL.set(m, out); return out; }
  let lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], m.v[i * 3 + k]); hi[k] = Math.max(hi[k], m.v[i * 3 + k]); }
  const diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1, q = diag * 1e-6, uid = new Map<string, number>(), vid = new Array<number>(nv), pos: V3[] = [];
  for (let i = 0; i < nv; i++) { const k = `${Math.round(m.v[i * 3] / q)},${Math.round(m.v[i * 3 + 1] / q)},${Math.round(m.v[i * 3 + 2] / q)}`; let id = uid.get(k); if (id === undefined) { id = pos.length; uid.set(k, id); pos.push([m.v[i * 3], m.v[i * 3 + 1], m.v[i * 3 + 2]]); } vid[i] = id; }
  const tri: { v: [number, number, number]; n: V3 }[] = [];
  for (let t = 0; t < T; t++) {
    const v: [number, number, number] = [vid[m.f[t * 3]], vid[m.f[t * 3 + 1]], vid[m.f[t * 3 + 2]]], A = pos[v[0]], B = pos[v[1]], C = pos[v[2]];
    const n = cross([B[0] - A[0], B[1] - A[1], B[2] - A[2]], [C[0] - A[0], C[1] - A[1], C[2] - A[2]]), l = Math.hypot(...n); if (l < 1e-12 || v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) continue;
    tri.push({ v, n: [n[0] / l, n[1] / l, n[2] / l] });
  }
  // a vertex is on a curved wall when the side facets around it do not all face the same way (T-junctions mean facets rarely share whole edges)
  const around: number[][] = pos.map(() => []); tri.forEach((t, i) => t.v.forEach(v => around[v].push(i)));
  for (const axis of [0, 1, 2] as const) {
    const o = ([0, 1, 2] as const).filter(k => k !== axis), side = tri.map(t => Math.abs(t.n[axis]) < 0.02);
    const bendy = pos.map((_, v) => { const l = around[v].filter(i => side[i]); for (let a = 0; a < l.length; a++) for (let b = a + 1; b < l.length; b++) { const d = dot(tri[l[a]].n, tri[l[b]].n); if (d < 0.9999 && d > 0.3) return true; } return false; });
    const curved = tri.map((t, i) => side[i] && t.v.filter(v => bendy[v]).length >= 2);
    const parent = new Map<number, number>(), find = (x: number): number => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; while (parent.get(x) !== r) { const n = parent.get(x)!; parent.set(x, r); x = n; } return r; };
    tri.forEach((t, i) => { if (!curved[i]) return; for (const v of t.v) if (bendy[v] && !parent.has(v)) parent.set(v, v); const vs = t.v.filter(v => bendy[v]); for (let k = 1; k < vs.length; k++) { const ra = find(vs[0]), rb = find(vs[k]); if (ra !== rb) parent.set(ra, rb); } });
    const groups = new Map<number, Set<number>>(); for (const v of parent.keys()) { const r = find(v); (groups.get(r) ?? groups.set(r, new Set()).get(r)!).add(v); }
    for (const ids of groups.values()) {
      const P: Pt[] = [], along: number[] = []; for (const v of ids) { P.push([pos[v][o[0]], pos[v][o[1]]]); along.push(pos[v][axis]); }
      let left = P.map((_, i) => i);
      for (let round = 0; round < 8 && left.length >= 8; round++) {
        // RANSAC: the circle through three points that most of the remaining points lie on
        let best: number[] = [], seed = 12345 + round; const nbr = new Map<number, number[]>();
        const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; };
        for (let tr = 0; tr < 300; tr++) {
          const i0 = left[rnd() % left.length]; let l = nbr.get(i0);
          if (!l) { l = left.filter(i => i !== i0).sort((a, b) => Math.hypot(P[a][0] - P[i0][0], P[a][1] - P[i0][1]) - Math.hypot(P[b][0] - P[i0][0], P[b][1] - P[i0][1])).slice(0, 40); nbr.set(i0, l); }
          if (l.length < 2) continue; const i1 = l[rnd() % l.length], i2 = l[rnd() % l.length]; if (i1 === i2) continue;
          const f3 = fit3(P[i0], P[i1], P[i2]); if (!f3 || f3.r < 0.2 || f3.r > diag) continue;
          const inl = left.filter(i => Math.abs(Math.hypot(P[i][0] - f3.cx, P[i][1] - f3.cy) - f3.r) <= f3.r * 0.015 + 1e-3); if (inl.length > best.length) best = inl;
        }
        if (best.length < 8) break;
        const f = fitLsq(best.map(i => P[i])); if (!f) break;
        const inl = left.filter(i => Math.abs(Math.hypot(P[i][0] - f.cx, P[i][1] - f.cy) - f.r) <= f.r * 0.02 + 1e-3), set = new Set(inl);
        left = left.filter(i => !set.has(i));
        const ang = inl.map(i => Math.atan2(P[i][1] - f.cy, P[i][0] - f.cx)).sort((a, b) => a - b); let gap = ang[0] + 2 * Math.PI - ang[ang.length - 1]; for (let i = 1; i < ang.length; i++) gap = Math.max(gap, ang[i] - ang[i - 1]);
        const sweep = 2 * Math.PI - gap; if (sweep < 0.7 || f.r < 0.2) continue;
        const al = inl.map(i => along[i]);
        out.push({ axis, c: [f.cx, f.cy], r: f.r, lo: Math.min(...al), hi: Math.max(...al), sweep, full: sweep > 2 * Math.PI - 0.8 });
      }
    }
  }
  // the same cylinder can be found twice (e.g. a bore split by a rib): merge by position
  const res: Cyl[] = [];
  for (const c of out) { const d = res.find(q => q.axis === c.axis && Math.abs(q.c[0] - c.c[0]) < 0.02 * c.r + 1e-2 && Math.abs(q.c[1] - c.c[1]) < 0.02 * c.r + 1e-2 && Math.abs(q.r - c.r) < 0.02 * c.r + 1e-2 && q.lo <= c.hi + 1e-6 && c.lo <= q.hi + 1e-6); if (d) { d.sweep = Math.min(2 * Math.PI, d.sweep + c.sweep); d.full = d.sweep > 2 * Math.PI - 0.8; d.lo = Math.min(d.lo, c.lo); d.hi = Math.max(d.hi, c.hi); } else res.push({ ...c }); }
  CYL.set(m, res); return res;
}
// the cylinders whose axis points at the camera: circles in that view (u, v and radius in view units)
export function circlesInCam(cyls: Cyl[], cam: Cam): Circ[] {
  const out: Circ[] = [];
  for (const c of cyls) {
    const e: V3 = [0, 0, 0]; e[c.axis] = 1; if (Math.abs(dot(e, cam.fwd)) < 0.999) continue;
    const o = ([0, 1, 2] as const).filter(k => k !== c.axis), p: V3 = [0, 0, 0]; p[o[0]] = c.c[0]; p[o[1]] = c.c[1]; p[c.axis] = (c.lo + c.hi) / 2;
    const q = proj(cam, p); out.push({ cx: q[0], cy: q[1], r: c.r, a0: 0, a1: 2 * Math.PI, full: c.full });
  }
  return out;
}
