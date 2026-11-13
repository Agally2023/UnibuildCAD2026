// Solid features built from sketch profiles: extrude, revolve, and boolean join / cut.
// A Mesh is a closed triangle surface: v = x,y,z triplets, f = vertex index triplets, wound counter-clockwise seen from outside.
import earcut from 'earcut';
import { BufferAttribute, BufferGeometry } from 'three';
import { Brush, Evaluator, ADDITION, SUBTRACTION } from 'three-bvh-csg';
import type { Region } from './sketch';

export type Mesh = { v: number[]; f: number[] };
export type V3 = [number, number, number];
export type Plane = 'XY' | 'XZ' | 'YZ';

// Sketch plane basis: u and v span the plane, n is the normal; (u, v, n) is right handed.
export const BASIS: Record<Plane, { u: V3; v: V3; n: V3 }> = {
  XY: { u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] },
  XZ: { u: [1, 0, 0], v: [0, 0, 1], n: [0, -1, 0] },
  YZ: { u: [0, 1, 0], v: [0, 0, 1], n: [1, 0, 0] },
};
export const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
export const toWorld = (pl: Plane, offset: number, p: [number, number], z = 0): V3 => { const b = BASIS[pl]; return add(add(add([0, 0, 0], b.u, p[0]), b.v, p[1]), b.n, offset + z); };

export const volume = (m: Mesh) => { let s = 0; for (let i = 0; i < m.f.length; i += 3) { const a = m.f[i] * 3, b = m.f[i + 1] * 3, c = m.f[i + 2] * 3; s += (m.v[a] * (m.v[b + 1] * m.v[c + 2] - m.v[b + 2] * m.v[c + 1]) - m.v[a + 1] * (m.v[b] * m.v[c + 2] - m.v[b + 2] * m.v[c]) + m.v[a + 2] * (m.v[b] * m.v[c + 1] - m.v[b + 1] * m.v[c])) / 6; } return s; };
export const surfaceArea = (m: Mesh) => { let s = 0; for (let i = 0; i < m.f.length; i += 3) { const a = m.f[i] * 3, b = m.f[i + 1] * 3, c = m.f[i + 2] * 3; const ux = m.v[b] - m.v[a], uy = m.v[b + 1] - m.v[a + 1], uz = m.v[b + 2] - m.v[a + 2], wx = m.v[c] - m.v[a], wy = m.v[c + 1] - m.v[a + 1], wz = m.v[c + 2] - m.v[a + 2]; s += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2; } return s; };
export const bounds = (m: Mesh): { min: V3; max: V3 } => { const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < m.v.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], m.v[i + k]); max[k] = Math.max(max[k], m.v[i + k]); } return { min, max }; };

// Every edge must be used once in each direction for a watertight surface (vertices are matched by position).
export function isClosed(m: Mesh): boolean {
  const key = (i: number) => `${Math.round(m.v[i * 3] * 1e4)},${Math.round(m.v[i * 3 + 1] * 1e4)},${Math.round(m.v[i * 3 + 2] * 1e4)}`;
  const cnt = new Map<string, number>();
  for (let i = 0; i < m.f.length; i += 3) for (let k = 0; k < 3; k++) {
    const a = key(m.f[i + k]), b = key(m.f[i + (k + 1) % 3]); if (a === b) continue;
    cnt.set(`${a}>${b}`, (cnt.get(`${a}>${b}`) ?? 0) + 1); cnt.set(`${b}>${a}`, (cnt.get(`${b}>${a}`) ?? 0) - 1);
  }
  for (const v of cnt.values()) if (v !== 0) return false;
  return true;
}

export const translateMesh = (m: Mesh, d: V3): Mesh => ({ v: m.v.map((x, i) => x + d[i % 3]), f: m.f });
// turn about the world axis x, y or z through a centre point (right-handed, degrees)
export function rotateMesh(m: Mesh, axis: 'x' | 'y' | 'z', deg: number, c: V3 = [0, 0, 0]): Mesh {
  const a = (deg * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a), i = axis === 'x' ? 1 : axis === 'y' ? 2 : 0, j = (i + 1) % 3, v = [...m.v];
  for (let n = 0; n < v.length; n += 3) { const p = v[n + i] - c[i], q = v[n + j] - c[j]; v[n + i] = c[i] + p * co - q * si; v[n + j] = c[j] + p * si + q * co; }
  return { v, f: m.f };
}
// centre of mass of a uniform solid
export function centroid(m: Mesh): V3 {
  let vol = 0; const s: V3 = [0, 0, 0];
  for (let i = 0; i < m.f.length; i += 3) {
    const a = m.f[i] * 3, b = m.f[i + 1] * 3, c = m.f[i + 2] * 3, d = (m.v[a] * (m.v[b + 1] * m.v[c + 2] - m.v[b + 2] * m.v[c + 1]) - m.v[a + 1] * (m.v[b] * m.v[c + 2] - m.v[b + 2] * m.v[c]) + m.v[a + 2] * (m.v[b] * m.v[c + 1] - m.v[b + 1] * m.v[c])) / 6;
    vol += d; for (let k = 0; k < 3; k++) s[k] += (d * (m.v[a + k] + m.v[b + k] + m.v[c + k])) / 4;
  }
  return vol ? [s[0] / vol, s[1] / vol, s[2] / vol] : [0, 0, 0];
}

export const flip = (m: Mesh): Mesh => { const f = [...m.f]; for (let i = 0; i < f.length; i += 3) { const t = f[i + 1]; f[i + 1] = f[i + 2]; f[i + 2] = t; } return { v: m.v, f }; };
export const outward = (m: Mesh) => (volume(m) < 0 ? flip(m) : m);

export function capTriangles(r: Region): { pts: [number, number][]; tri: number[] } {
  const pts = [...r.outer, ...r.holes.flat()], flat: number[] = [], holeIdx: number[] = []; let n = r.outer.length;
  r.outer.forEach(p => flat.push(p[0], p[1]));
  r.holes.forEach(h => { holeIdx.push(n); h.forEach(p => flat.push(p[0], p[1])); n += h.length; });
  const tri = earcut(flat, holeIdx, 2);
  for (let i = 0; i < tri.length; i += 3) { const a = pts[tri[i]], b = pts[tri[i + 1]], c = pts[tri[i + 2]]; if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) < 0) { const k = tri[i + 1]; tri[i + 1] = tri[i + 2]; tri[i + 2] = k; } }   // all counter-clockwise in the sketch
  return { pts, tri };
}

// Extrude the region from the sketch plane by depth along the plane normal (negative depth goes the other way).
export function extrude(regions: Region[], plane: Plane, offset: number, depth: number, symmetric = false): Mesh {
  const z0 = symmetric ? -depth / 2 : 0, z1 = symmetric ? depth / 2 : depth, v: number[] = [], f: number[] = [];
  const push = (p: V3) => { v.push(p[0], p[1], p[2]); return v.length / 3 - 1; };
  for (const r of regions) {
    const { pts, tri } = capTriangles(r), lo = pts.map(p => push(toWorld(plane, offset, p, z0))), hi = pts.map(p => push(toWorld(plane, offset, p, z1)));
    for (let i = 0; i < tri.length; i += 3) { f.push(lo[tri[i]], lo[tri[i + 2]], lo[tri[i + 1]], hi[tri[i]], hi[tri[i + 1]], hi[tri[i + 2]]); }
    let base = 0;
    for (const loop of [r.outer, ...r.holes]) {
      for (let i = 0; i < loop.length; i++) { const a = base + i, b = base + ((i + 1) % loop.length); f.push(lo[a], lo[b], hi[b], lo[a], hi[b], hi[a]); }
      base += loop.length;
    }
  }
  return outward({ v, f });
}

// Revolve the region about an axis line (two points in the sketch plane) through angleDeg (up to 360).
export function revolve(regions: Region[], plane: Plane, offset: number, axis: [[number, number], [number, number]], angleDeg: number): Mesh {
  const [A, B] = axis, el = Math.hypot(B[0] - A[0], B[1] - A[1]);
  if (el < 1e-9) throw new Error('The axis line has no length');
  const e: [number, number] = [(B[0] - A[0]) / el, (B[1] - A[1]) / el], nrm: [number, number] = [-e[1], e[0]];
  const full = angleDeg >= 359.999, ang = (Math.min(360, Math.max(1, angleDeg)) * Math.PI) / 180, steps = Math.max(2, Math.ceil((ang / (2 * Math.PI)) * 64));
  const bs = BASIS[plane], N3 = add(add([0, 0, 0], bs.u, nrm[0]), bs.v, nrm[1]);
  const ring = (p: [number, number], th: number): V3 => {
    const dx = p[0] - A[0], dy = p[1] - A[1], along = dx * e[0] + dy * e[1], d = dx * nrm[0] + dy * nrm[1];
    const o = toWorld(plane, offset, A), E3 = add(add([0, 0, 0], bs.u, e[0]), bs.v, e[1]);
    return add(add(add(o, E3, along), N3, d * Math.cos(th)), bs.n, d * Math.sin(th));
  };
  const v: number[] = [], f: number[] = [], push = (p: V3) => { v.push(p[0], p[1], p[2]); return v.length / 3 - 1; };
  for (const r of regions) {
    const loops = [r.outer, ...r.holes];
    const cnt = full ? steps : steps + 1;
    for (const loop of loops) {
      const rows = Array.from({ length: cnt }, (_, s) => loop.map(p => push(ring(p, (ang * s) / steps))));
      for (let s = 0; s < steps; s++) {
        const r0 = rows[s], r1 = rows[(s + 1) % cnt];
        for (let i = 0; i < loop.length; i++) { const j = (i + 1) % loop.length; f.push(r0[i], r0[j], r1[j], r0[i], r1[j], r1[i]); }
      }
    }
    if (!full) {
      const { pts, tri } = capTriangles(r);
      for (const end of [0, 1]) {
        const ids = pts.map(p => push(ring(p, end ? ang : 0)));
        for (let i = 0; i < tri.length; i += 3) f.push(ids[tri[i]], ids[tri[i + (end ? 1 : 2)]], ids[tri[i + (end ? 2 : 1)]]);
      }
    }
  }
  return outward({ v, f });
}

// ---------- booleans ----------
const toGeo = (m: Mesh) => {
  const g = new BufferGeometry(), pos = new Float32Array(m.f.length * 3);
  m.f.forEach((vi, k) => { pos[k * 3] = m.v[vi * 3]; pos[k * 3 + 1] = m.v[vi * 3 + 1]; pos[k * 3 + 2] = m.v[vi * 3 + 2]; });
  g.setAttribute('position', new BufferAttribute(pos, 3)); g.computeVertexNormals();
  g.setIndex(Array.from({ length: m.f.length }, (_, i) => i));
  return g;
};
const fromGeo = (g: BufferGeometry): Mesh => {
  const p = g.attributes.position, idx = g.index, v: number[] = [], f: number[] = [];
  for (let i = 0; i < p.count; i++) v.push(p.getX(i), p.getY(i), p.getZ(i));
  if (idx) for (let i = 0; i < idx.count; i++) f.push(idx.getX(i)); else for (let i = 0; i < p.count; i++) f.push(i);
  return { v, f };
};
export function boolean(a: Mesh, b: Mesh, op: 'join' | 'cut'): Mesh {
  const ev = new Evaluator(); ev.attributes = ['position', 'normal'];
  const A = new Brush(toGeo(a)), B = new Brush(toGeo(b)); A.updateMatrixWorld(); B.updateMatrixWorld();
  return fromGeo(ev.evaluate(A, B, op === 'join' ? ADDITION : SUBTRACTION).geometry);
}
export const concat = (a: Mesh, b: Mesh): Mesh => ({ v: [...a.v, ...b.v], f: [...a.f, ...b.f.map(i => i + a.v.length / 3)] });

// ---------- export ----------
export function toStl(name: string, m: Mesh): string {
  const out = [`solid ${name.replace(/[^A-Za-z0-9_-]+/g, '_') || 'part'}`];
  for (let i = 0; i < m.f.length; i += 3) {
    const P = [0, 1, 2].map(k => [m.v[m.f[i + k] * 3], m.v[m.f[i + k] * 3 + 1], m.v[m.f[i + k] * 3 + 2]]);
    const u = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], w = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(n[0], n[1], n[2]) || 1;
    out.push(`facet normal ${n[0] / l} ${n[1] / l} ${n[2] / l}`, ' outer loop', ...P.map(q => `  vertex ${q[0]} ${q[1]} ${q[2]}`), ' endloop', 'endfacet');
  }
  out.push(`endsolid ${name.replace(/[^A-Za-z0-9_-]+/g, '_') || 'part'}`);
  return out.join('\n');
}

// Edges to draw in the viewport: edges between two faces that meet at more than the threshold angle (default 30°), as x,y,z pairs.
// Edges that only one triangle touches (T-junctions left by boolean operations) are skipped, so flat faces stay clean.
export function featureEdges(m: Mesh, thresholdDeg = 30): number[] {
  const q = (i: number) => [Math.round(m.v[i * 3] * 1e3), Math.round(m.v[i * 3 + 1] * 1e3), Math.round(m.v[i * 3 + 2] * 1e3)];
  const ek = (a: number[], b: number[]) => { const A = a.join(','), B = b.join(','); return A < B ? `${A}|${B}` : `${B}|${A}`; };
  const seen = new Map<string, { n: V3; seg: number[] }[]>(), cosT = Math.cos((thresholdDeg * Math.PI) / 180);
  for (let i = 0; i < m.f.length; i += 3) {
    const ia = m.f[i], ib = m.f[i + 1], ic = m.f[i + 2], A = q(ia), B = q(ib), C = q(ic);
    const u = [m.v[ib * 3] - m.v[ia * 3], m.v[ib * 3 + 1] - m.v[ia * 3 + 1], m.v[ib * 3 + 2] - m.v[ia * 3 + 2]], w = [m.v[ic * 3] - m.v[ia * 3], m.v[ic * 3 + 1] - m.v[ia * 3 + 1], m.v[ic * 3 + 2] - m.v[ia * 3 + 2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(n[0], n[1], n[2]);
    if (l < 1e-12) continue;
    const nn: V3 = [n[0] / l, n[1] / l, n[2] / l];
    for (const [a, b, ja, jb] of [[A, B, ia, ib], [B, C, ib, ic], [C, A, ic, ia]] as [number[], number[], number, number][]) {
      if (a.join() === b.join()) continue;
      const k = ek(a, b), arr = seen.get(k) ?? []; arr.push({ n: nn, seg: [m.v[ja * 3], m.v[ja * 3 + 1], m.v[ja * 3 + 2], m.v[jb * 3], m.v[jb * 3 + 1], m.v[jb * 3 + 2]] }); seen.set(k, arr);
    }
  }
  const out: number[] = [];
  for (const arr of seen.values()) if (arr.length === 2 && arr[0].n[0] * arr[1].n[0] + arr[0].n[1] * arr[1].n[1] + arr[0].n[2] * arr[1].n[2] < cosT) out.push(...arr[0].seg);
  return out;
}
