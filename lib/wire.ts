// Wireframe picture of a part: its sharp edges turned by the view quaternion and drawn flat, as one SVG path.
// Used for the small previews on the Mechanical and Automotive buttons and as a view that needs no 3D graphics.
import { qRotate, type Q } from './orbit';
import { featureEdges, type Mesh } from './solid';

// Outline edges: the edge between a face turned towards the viewer and one turned away. Curved parts (cylinders, tori) need these,
// because their facets are too gentle to count as sharp edges.
export function silhouetteEdges(m: Mesh, q: Q): number[] {
  const key = (i: number) => `${Math.round(m.v[i * 3] * 1e3)},${Math.round(m.v[i * 3 + 1] * 1e3)},${Math.round(m.v[i * 3 + 2] * 1e3)}`;
  const seen = new Map<string, { front: boolean; seg: number[] }[]>();
  for (let i = 0; i < m.f.length; i += 3) {
    const [a, b, c] = [m.f[i], m.f[i + 1], m.f[i + 2]], P = (j: number) => [m.v[j * 3], m.v[j * 3 + 1], m.v[j * 3 + 2]];
    const A = P(a), B = P(b), C = P(c), u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], w = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    if (Math.hypot(n[0], n[1], n[2]) < 1e-12) continue;
    const front = qRotate(q, [n[0], n[2], -n[1]])[2] > 0;
    for (const [ja, jb] of [[a, b], [b, c], [c, a]]) {
      const ka = key(ja), kb = key(jb); if (ka === kb) continue;
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`, arr = seen.get(k) ?? []; arr.push({ front, seg: [...P(ja), ...P(jb)] }); seen.set(k, arr);
    }
  }
  const out: number[] = [];
  for (const arr of seen.values()) if (arr.length === 2 && arr[0].front !== arr[1].front) out.push(...arr[0].seg);
  return out;
}

export function wirePath(mesh: Mesh, q: Q, w: number, h: number, pad = 6, edges?: number[]): string {
  const all = [...(edges ?? featureEdges(mesh, 30)), ...silhouetteEdges(mesh, q)], seen = new Set<string>(), e: number[] = [];
  const kk = (i: number) => `${Math.round(all[i] * 1e3)},${Math.round(all[i + 1] * 1e3)},${Math.round(all[i + 2] * 1e3)}`;
  for (let i = 0; i < all.length; i += 6) { const a = kk(i), b = kk(i + 3), k = a < b ? `${a}|${b}` : `${b}|${a}`; if (seen.has(k)) continue; seen.add(k); e.push(...all.slice(i, i + 6)); }
  if (!e.length) return '';
  // the part is modelled Z up, the view is Y up: (x, y, z) becomes (x, z, -y)
  const pts: [number, number][] = [];
  for (let i = 0; i < e.length; i += 3) { const r = qRotate(q, [e[i], e[i + 2], -e[i + 1]]); pts.push([r[0], -r[1]]); }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const k = Math.min((w - 2 * pad) / Math.max(1e-9, x1 - x0), (h - 2 * pad) / Math.max(1e-9, y1 - y0)), ox = (w - k * (x1 + x0)) / 2, oy = (h - k * (y1 + y0)) / 2;
  let d = '';
  for (let i = 0; i < pts.length; i += 2) d += `M${(pts[i][0] * k + ox).toFixed(1)} ${(pts[i][1] * k + oy).toFixed(1)}L${(pts[i + 1][0] * k + ox).toFixed(1)} ${(pts[i + 1][1] * k + oy).toFixed(1)}`;
  return d;
}
