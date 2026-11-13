// Engineering drawing sheet (A3 landscape) generated from a part: front, top and right views with hidden lines, a half section with
// hatching, a shaded isometric view, overall dimensions, feature callouts taken from the timeline, notes and a title block.
// Returns an SVG string (millimetres on paper).
import { calc } from './sketch';
import type { PartDoc } from './parts';
import type { Mesh, V3 } from './solid';
import { paintMeshURL } from './vpaint';
import { VIEWS } from './orbit';

const num = (n: number) => (Math.round(n * 10) / 10).toString();
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
type Cam = { right: V3; up: V3; fwd: V3 };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const mkCam = (from: V3): Cam => { const fwd = norm([-from[0], -from[1], -from[2]]), right = norm(cross(fwd, [0, 0, 1])), up = cross(right, fwd); return { right, up, fwd }; };
const CAM = { front: mkCam([0, -1, 0]), right: mkCam([1, 0, 0]), top: ((): Cam => ({ right: [1, 0, 0], up: [0, 1, 0], fwd: [0, 0, -1] }))() };
const proj = (c: Cam, p: V3): [number, number] => [dot(p, c.right), dot(p, c.up)];

// Which parts of each edge can be seen? Ray from the edge sample towards the viewer against the triangles (bucketed by screen cell).
function visibility(mesh: Mesh, edges: number[], cam: Cam, grid = 40) {
  const T = mesh.f.length / 3, P2: number[] = [], zs: number[] = [];
  for (let i = 0; i < mesh.v.length; i += 3) { const p: V3 = [mesh.v[i], mesh.v[i + 1], mesh.v[i + 2]], q = proj(cam, p); P2.push(q[0], q[1]); zs.push(dot(p, cam.fwd)); }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < P2.length; i += 2) { x0 = Math.min(x0, P2[i]); x1 = Math.max(x1, P2[i]); y0 = Math.min(y0, P2[i + 1]); y1 = Math.max(y1, P2[i + 1]); }
  const gx = (x: number) => Math.max(0, Math.min(grid - 1, Math.floor(((x - x0) / (x1 - x0 || 1)) * grid))), gy = (y: number) => Math.max(0, Math.min(grid - 1, Math.floor(((y - y0) / (y1 - y0 || 1)) * grid)));
  const cells: number[][] = Array.from({ length: grid * grid }, () => []);
  for (let t = 0; t < T; t++) {
    const a = mesh.f[t * 3], b = mesh.f[t * 3 + 1], c = mesh.f[t * 3 + 2], xs = [P2[a * 2], P2[b * 2], P2[c * 2]], ys = [P2[a * 2 + 1], P2[b * 2 + 1], P2[c * 2 + 1]];
    for (let i = gx(Math.min(...xs)); i <= gx(Math.max(...xs)); i++) for (let j = gy(Math.min(...ys)); j <= gy(Math.max(...ys)); j++) cells[j * grid + i].push(t);
  }
  const eps = (x1 - x0 + y1 - y0) * 2e-4 + 1e-6;
  const hidden = (p: V3): boolean => {
    const q = proj(cam, p), z = dot(p, cam.fwd), cell = cells[gy(q[1]) * grid + gx(q[0])];
    for (const t of cell) {
      const a = mesh.f[t * 3], b = mesh.f[t * 3 + 1], c = mesh.f[t * 3 + 2];
      const ax = P2[a * 2], ay = P2[a * 2 + 1], bx = P2[b * 2], by = P2[b * 2 + 1], cx = P2[c * 2], cy = P2[c * 2 + 1];
      const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(d) < 1e-12) continue;
      const u = ((by - cy) * (q[0] - cx) + (cx - bx) * (q[1] - cy)) / d, v = ((cy - ay) * (q[0] - cx) + (ax - cx) * (q[1] - cy)) / d, w = 1 - u - v;
      if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
      if (u * zs[a] + v * zs[b] + w * zs[c] < z - eps * 4) return true;     // a face lies nearer the viewer than the edge
    }
    return false;
  };
  const vis: [number, number, number, number][] = [], hid: [number, number, number, number][] = [];
  for (let i = 0; i < edges.length; i += 6) {
    const A: V3 = [edges[i], edges[i + 1], edges[i + 2]], B: V3 = [edges[i + 3], edges[i + 4], edges[i + 5]], n = edges.length > 9000 ? 1 : 3;
    // split the edge into pieces so a partly hidden edge shows both ways
    let cur: boolean | null = null, st: V3 = A;
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n, m: V3 = [A[0] + (B[0] - A[0]) * (t0 + t1) / 2, A[1] + (B[1] - A[1]) * (t0 + t1) / 2, A[2] + (B[2] - A[2]) * (t0 + t1) / 2], h = hidden(m);
      if (cur === null) { cur = h; st = [A[0] + (B[0] - A[0]) * t0, A[1] + (B[1] - A[1]) * t0, A[2] + (B[2] - A[2]) * t0]; }
      else if (h !== cur) { const mid: V3 = [A[0] + (B[0] - A[0]) * t0, A[1] + (B[1] - A[1]) * t0, A[2] + (B[2] - A[2]) * t0], a = proj(cam, st), b = proj(cam, mid); (cur ? hid : vis).push([a[0], a[1], b[0], b[1]]); cur = h; st = mid; }
    }
    const a = proj(cam, st), b = proj(cam, B); (cur ? hid : vis).push([a[0], a[1], b[0], b[1]]);
  }
  return { vis, hid };
}

// Cut the mesh with the plane y = c: line segments in the (x, z) plane.
function sectionSegs(mesh: Mesh, c: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (let i = 0; i < mesh.f.length; i += 3) {
    const v = [0, 1, 2].map(k => { const j = mesh.f[i + k] * 3; return [mesh.v[j], mesh.v[j + 1], mesh.v[j + 2]] as V3; }), pts: [number, number][] = [];
    for (let k = 0; k < 3; k++) { const a = v[k], b = v[(k + 1) % 3], da = a[1] - c, db = b[1] - c; if ((da < 0 && db >= 0) || (da >= 0 && db < 0)) { const t = da / (da - db); pts.push([a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t]); } }
    if (pts.length === 2 && (Math.abs(pts[0][0] - pts[1][0]) > 1e-9 || Math.abs(pts[0][1] - pts[1][1]) > 1e-9)) out.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]]);
  }
  return out;
}
// 45° hatch lines clipped to the cut outline (even-odd rule on the section segments).
function hatch(segs: [number, number, number, number][], gap: number): [number, number, number, number][] {
  if (!segs.length) return [];
  let lo = Infinity, hi = -Infinity; for (const s of segs) for (const [x, z] of [[s[0], s[1]], [s[2], s[3]]]) { lo = Math.min(lo, x + z); hi = Math.max(hi, x + z); }
  const out: [number, number, number, number][] = [];
  for (let c = lo + gap / 2; c < hi; c += gap) {
    const hits: number[] = [];
    for (const [ax, az, bx, bz] of segs) { const da = ax + az - c, db = bx + bz - c; if ((da < 0 && db >= 0) || (da >= 0 && db < 0)) { const t = da / (da - db); hits.push(ax + (bx - ax) * t); } }
    hits.sort((p, q) => p - q);
    for (let i = 0; i + 1 < hits.length; i += 2) if (hits[i + 1] - hits[i] > 1e-6) out.push([hits[i], c - hits[i], hits[i + 1], c - hits[i + 1]]);
  }
  return out;
}


// Boolean results leave T-junctions (an edge on one face is split in two on its neighbour), so edges are first cut at every vertex that lies
// on them; then neighbouring faces can be matched edge to edge. Returns each piece with the normals of the faces that share it.
type Piece = { seg: number[]; ns: V3[] };
export function edgePieces(m: Mesh): Piece[] {
  const nv = m.v.length / 3; if (!nv) return [];
  let lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], m.v[i * 3 + k]); hi[k] = Math.max(hi[k], m.v[i * 3 + k]); }
  const diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1, cell = diag / 40, tol = diag * 2e-6, rk = (x: number) => Math.round(x / (diag * 1e-6));
  const uid = new Map<string, number>(), pts: V3[] = [], gridv = new Map<string, number[]>(), vid = new Array<number>(nv);
  const gk = (x: number, y: number, z: number) => `${Math.floor((x - lo[0]) / cell)},${Math.floor((y - lo[1]) / cell)},${Math.floor((z - lo[2]) / cell)}`;
  for (let i = 0; i < nv; i++) {
    const x = m.v[i * 3], y = m.v[i * 3 + 1], z = m.v[i * 3 + 2], key = `${rk(x)},${rk(y)},${rk(z)}`; let id = uid.get(key);
    if (id === undefined) { id = pts.length; uid.set(key, id); pts.push([x, y, z]); const g = gk(x, y, z); (gridv.get(g) ?? gridv.set(g, []).get(g)!).push(id); }
    vid[i] = id;
  }
  const near = (a: V3, b: V3): number[] => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), steps = Math.max(2, Math.ceil(L / (cell / 4))), seen = new Set<number>(), out: number[] = [];
    for (let s = 0; s <= steps; s++) { const t = s / steps, g = gridv.get(gk(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)); if (g) for (const id of g) if (!seen.has(id)) { seen.add(id); out.push(id); } }
    return out;
  };
  const map = new Map<string, Piece>();
  for (let i = 0; i < m.f.length; i += 3) {
    const ids = [vid[m.f[i]], vid[m.f[i + 1]], vid[m.f[i + 2]]], A = pts[ids[0]], B = pts[ids[1]], C = pts[ids[2]];
    const n = cross([B[0] - A[0], B[1] - A[1], B[2] - A[2]], [C[0] - A[0], C[1] - A[1], C[2] - A[2]]), l = Math.hypot(...n); if (l < 1e-12) continue;
    const nn: V3 = [n[0] / l, n[1] / l, n[2] / l];
    for (let e = 0; e < 3; e++) {
      const ia = ids[e], ib = ids[(e + 1) % 3]; if (ia === ib) continue;
      const a = pts[ia], b = pts[ib], d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L2 = dot(d, d), on: { t: number; id: number }[] = [{ t: 0, id: ia }, { t: 1, id: ib }];
      for (const id of near(a, b)) {
        if (id === ia || id === ib) continue;
        const p = pts[id], t = dot([p[0] - a[0], p[1] - a[1], p[2] - a[2]], d) / L2; if (t <= 1e-9 || t >= 1 - 1e-9) continue;
        const dx = a[0] + d[0] * t - p[0], dy = a[1] + d[1] * t - p[1], dz = a[2] + d[2] * t - p[2]; if (Math.hypot(dx, dy, dz) < tol * 50) on.push({ t, id });
      }
      on.sort((p, q) => p.t - q.t);
      for (let k = 0; k + 1 < on.length; k++) {
        const u = on[k].id, w = on[k + 1].id; if (u === w) continue;
        const key = u < w ? `${u}|${w}` : `${w}|${u}`, pc = map.get(key) ?? { seg: [...pts[u], ...pts[w]], ns: [] }; pc.ns.push(nn); map.set(key, pc);
      }
    }
  }
  return [...map.values()];
}
// Edges to draw in one view: sharp feature edges plus silhouettes (where one face looks at the viewer and its neighbour looks away),
// so smooth rims and cylinders still get their outline.
function viewEdges(pieces: Piece[], cam: Cam, thresholdDeg = 30): number[] {
  const cosT = Math.cos((thresholdDeg * Math.PI) / 180), out: number[] = [];
  for (const pc of pieces) {
    if (pc.ns.length < 2) continue;
    const [p, r] = pc.ns, sharp = dot(p, r) < cosT, sil = (dot(p, cam.fwd) <= 1e-9) !== (dot(r, cam.fwd) <= 1e-9);
    if (sharp || sil) out.push(...pc.seg);
  }
  return out;
}

const SCALES = [0.05, 0.1, 0.2, 0.25, 0.3333, 0.4, 0.5, 0.6667, 1, 1.5, 2, 4, 5, 10];
const scaleText = (s: number) => (s >= 1 ? `${s} : 1` : `1 : ${num(1 / s)}`);

// Feature callouts from the timeline ("4× Ø12 THRU", "R2 EDGES", "WALL 3").
export function callouts(doc: PartDoc, values: Record<string, number>): string[] {
  const out: string[] = [], val = (e: string) => { try { return calc(e || '0', values); } catch { return NaN; } };
  for (const st of doc.steps) {
    if ((st as any).off) continue;
    if (st.type === 'hole') {
      const sk = doc.steps.find(x => x.id === st.sketch); let n = sk && sk.type === 'sketch' ? sk.sk.circles.length || 1 : 1;
      const pat = doc.steps.find(x => x.type === 'pattern' && x.of === st.id); if (pat && pat.type === 'pattern') n *= Math.round(val(pat.count)) || 1;
      let d = val(st.dia); if (!(d > 0) && sk && sk.type === 'sketch' && sk.sk.circles[0]) d = sk.sk.circles[0].r * 2;
      const cd = val(st.cdia), ch = val(st.cdepth), dep = Math.abs(val(st.depth));
      out.push(`${n > 1 ? n + '× ' : ''}Ø${num(d)}${st.hole === 'cbore' ? ` ⌴ Ø${num(cd)} ↧ ${num(ch)}` : st.hole === 'csink' ? ` ⌵ Ø${num(cd)} × 90°` : ''}  DEPTH ${num(Math.max(0, dep - 2))}`);
    } else if (st.type === 'extrude') {
      const f = val(st.fillet || '0'), c = val(st.chamfer || '0'), dr = val(st.draft || '0'), w = val(st.wall || '0');
      if (f > 0) out.push(`${st.name.toUpperCase()}: EDGES R${num(f)}`); if (c > 0) out.push(`${st.name.toUpperCase()}: CHAMFER ${num(c)} × 45°`); if (dr) out.push(`${st.name.toUpperCase()}: DRAFT ${num(dr)}°`); if (w > 0) out.push(`${st.name.toUpperCase()}: SHELL WALL ${num(w)}`);
    } else if (st.type === 'sweep') out.push(`${st.name.toUpperCase()}: Ø${num(val(st.dia))}${val(st.bore) > 0 ? ` × Ø${num(val(st.bore))} BORE` : ''}, BEND R${num(val(st.bend))}`);
    else if (st.type === 'loft') out.push(`${st.name.toUpperCase()}: LOFTED BLEND`);
  }
  return out;
}

export function drawingSvg(doc: PartDoc, mesh: Mesh, o: { values: Record<string, number>; material: string; mass: number; image?: boolean; date?: string; color?: string; shine?: number } ): string {
  const W = 420, H = 297, ink = '#14181d';
  if (!mesh.f.length) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/><text x="30" y="40" font-family="Arial" font-size="8">Nothing to draw yet. Build a solid first.</text></svg>`;
  let lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.v.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], mesh.v[i + k]); hi[k] = Math.max(hi[k], mesh.v[i + k]); }
  const sx = hi[0] - lo[0], sy = hi[1] - lo[1], sz = hi[2] - lo[2], cy = (lo[1] + hi[1]) / 2;
  const fit = Math.min((235 - 75) / Math.max(1e-6, sx + sy), (195 - 60) / Math.max(1e-6, sz + sy));
  const s = [...SCALES].reverse().find(v => v <= fit) ?? SCALES[0];
  const pieces = edgePieces(mesh);
  const views = (['front', 'top', 'right'] as const).map(n => { const edges = viewEdges(pieces, CAM[n], 30), big = (mesh.f.length / 3) * (edges.length / 6) > 4e8; return ({ n, ...(big ? { vis: (() => { const c = CAM[n], r: [number, number, number, number][] = []; for (let i = 0; i < edges.length; i += 6) { const a = proj(c, [edges[i], edges[i + 1], edges[i + 2]]), b = proj(c, [edges[i + 3], edges[i + 4], edges[i + 5]]); r.push([a[0], a[1], b[0], b[1]]); } return r; })(), hid: [] as [number, number, number, number][] } : visibility(mesh, edges, CAM[n])) }); });
  const ext = { front: [sx, sz], top: [sx, sy], right: [sy, sz] } as const;
  // layout: front top-left, top below it, right to the right of the front
  const fw = sx * s, fh = sz * s, tw = sx * s, th = sy * s, rw = sy * s, rh = sz * s;
  const gapX = 38, gapY = 34, x0 = 24 + 12, yF = 22 + 14;
  const origin = { front: [x0, yF], top: [x0, yF + fh + gapY], right: [x0 + fw + gapX, yF] } as const;
  void tw; void th; void rw; void rh;
  const parts: string[] = [];
  const line = (a: number, b: number, c: number, d: number, w = 0.35, extra = '') => `<line x1="${num(a)}" y1="${num(b)}" x2="${num(c)}" y2="${num(d)}" stroke="${ink}" stroke-width="${w}" ${extra}/>`;
  const arrow = (x: number, y: number, dx: number, dy: number) => { const l = 2.6, w = 0.8, px = -dy, py = dx; return `<polygon points="${num(x)},${num(y)} ${num(x - dx * l + px * w)},${num(y - dy * l + py * w)} ${num(x - dx * l - px * w)},${num(y - dy * l - py * w)}" fill="${ink}"/>`; };
  const text = (x: number, y: number, t: string, size = 3.4, anchor = 'middle', rot = 0, w = 400) => `<text x="${num(x)}" y="${num(y)}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${w}" fill="${ink}" text-anchor="${anchor}"${rot ? ` transform="rotate(${rot} ${num(x)} ${num(y)})"` : ''}>${esc(t)}</text>`;
  const diaView = Math.abs(sx - sy) < 0.5 && doc.steps.some(x => x.type === 'revolve' && !(x as any).off);
  const hdim = (xa: number, xb: number, y: number, yRef: number, label: string) => { parts.push(line(xa, yRef + (y > yRef ? 1.5 : -1.5), xa, y + (y > yRef ? 2 : -2), 0.25), line(xb, yRef + (y > yRef ? 1.5 : -1.5), xb, y + (y > yRef ? 2 : -2), 0.25), line(xa, y, xb, y, 0.3), arrow(xa, y, 1, 0), arrow(xb, y, -1, 0), text((xa + xb) / 2, y - 1.4, label)); };
  const vdim = (ya: number, yb: number, x: number, xRef: number, label: string) => { parts.push(line(xRef + (x > xRef ? 1.5 : -1.5), ya, x + (x > xRef ? 2 : -2), ya, 0.25), line(xRef + (x > xRef ? 1.5 : -1.5), yb, x + (x > xRef ? 2 : -2), yb, 0.25), line(x, ya, x, yb, 0.3), arrow(x, ya, 0, 1), arrow(x, yb, 0, -1), text(x - 1.4, (ya + yb) / 2, label, 3.4, 'middle', -90)); };
  // ---- orthographic views ----
  for (const v of views) {
    const [ox, oy] = origin[v.n], [ew, eh] = ext[v.n], c = CAM[v.n];
    const lo2 = v.n === 'front' ? [lo[0], lo[2]] : v.n === 'top' ? [lo[0], lo[1]] : [lo[1], lo[2]], hi2 = v.n === 'front' ? [hi[0], hi[2]] : v.n === 'top' ? [hi[0], hi[1]] : [hi[1], hi[2]];
    void c;
    const X = (u: number) => ox + (u - lo2[0]) * s, Y = (w: number) => oy + (hi2[1] - w) * s;
    parts.push(`<g>`);
    for (const h of v.hid) parts.push(line(X(h[0]), Y(h[1]), X(h[2]), Y(h[3]), 0.22, 'stroke-dasharray="1.6 1" stroke-opacity="0.65"'));
    for (const e of v.vis) parts.push(line(X(e[0]), Y(e[1]), X(e[2]), Y(e[3]), 0.5, 'stroke-linecap="round"'));
    // centre lines through the middle of the outline, as drawn on shop drawings
    const mx = X((lo2[0] + hi2[0]) / 2), my = Y((lo2[1] + hi2[1]) / 2);
    parts.push(line(mx, oy - 4, mx, oy + eh * s + 4, 0.18, 'stroke-dasharray="6 1.2 1 1.2" stroke="#b02020"'), line(ox - 4, my, ox + ew * s + 4, my, 0.18, 'stroke-dasharray="6 1.2 1 1.2" stroke="#b02020"'));
    parts.push(`</g>`);
    hdim(ox, ox + ew * s, oy + eh * s + 9, oy + eh * s, `${v.n !== 'right' && diaView ? 'Ø' : ''}${num(ew)}`);
    vdim(oy, oy + eh * s, ox - 13, ox, `${v.n === 'top' && diaView ? 'Ø' : ''}${num(eh)}`);
    parts.push(text(ox + (ew * s) / 2, oy + eh * s + 17.5, v.n === 'front' ? 'FRONT VIEW' : v.n === 'top' ? 'TOP VIEW' : 'RIGHT SIDE VIEW', 3.6, 'middle', 0, 700));
  }
  // ---- half section A–A (front view cut through the middle, hatched) ----
  const cands = [0.5, 0.35, 0.65, 0.2, 0.8].map(t => lo[1] + (hi[1] - lo[1]) * t).concat(cy), len = (g: [number, number, number, number][]) => g.reduce((a, q) => a + Math.hypot(q[2] - q[0], q[3] - q[1]), 0);
  let secY = cy, sec = sectionSegs(mesh, cy); for (const c of cands) { const g = sectionSegs(mesh, c); if (len(g) > len(sec) * 1.08) { sec = g; secY = c; } }
  const hs = hatch(sec, Math.max(1.6 / s, 0.6)), secOx = 276, secOy = 138;
  const sscale = Math.min(s, Math.min(130 / Math.max(sx, 1e-6), 78 / Math.max(sz, 1e-6)));
  const SX = (u: number) => secOx + (u - lo[0]) * sscale, SY = (w: number) => secOy + (hi[2] - w) * sscale;
  parts.push(`<g stroke-linecap="round">`);
  for (const h of hs) parts.push(line(SX(h[0]), SY(h[1]), SX(h[2]), SY(h[3]), 0.16, 'stroke-opacity="0.8"'));
  for (const q of sec) parts.push(line(SX(q[0]), SY(q[1]), SX(q[2]), SY(q[3]), 0.55));
  parts.push(`</g>`, text(secOx + (sx * sscale) / 2, secOy + sz * sscale + 8, `SECTION A–A  ( ${scaleText(sscale)} )`, 3.6, 'middle', 0, 700));
  // cutting-plane marks on the top view
  const [tx, ty] = origin.top, tcy = ty + (hi[1] - secY) * s;
  parts.push(line(tx - 6, tcy, tx + sx * s + 6, tcy, 0.5, 'stroke-dasharray="7 1.5 1.5 1.5"'), text(tx - 8, tcy + 1.2, 'A', 3.6, 'end', 0, 700), text(tx + sx * s + 8, tcy + 1.2, 'A', 3.6, 'start', 0, 700), arrow(tx - 6, tcy, 0, 1), arrow(tx + sx * s + 6, tcy, 0, 1));
  // ---- isometric ----
  const isoW = 132, isoH = 100, isoX = 268, isoY = 22;
  if (o.image !== false) {
    const img = paintMeshURL(mesh, VIEWS.iso.q, isoW * 5, isoH * 5, o.color ?? '#cfd3d8', o.shine ?? 0.7, 1, 24);
    if (img) parts.push(`<image href="${img}" x="${isoX}" y="${isoY}" width="${isoW}" height="${isoH}" preserveAspectRatio="xMidYMid meet"/>`);
  }
  parts.push(text(isoX + isoW / 2, isoY + isoH + 6, 'ISOMETRIC VIEW', 3.6, 'middle', 0, 700));
  // ---- notes ----
  const notes = ['ALL DIMENSIONS IN mm', 'REMOVE SHARP EDGES', 'GENERAL TOLERANCE ±0.2 mm', ...callouts(doc, o.values)];
  const ny0 = 232; parts.push(`<rect x="24" y="${ny0 - 5}" width="190" height="${Math.min(56, 8 + notes.length * 4.4)}" fill="none" stroke="${ink}" stroke-width="0.35"/>`, text(27, ny0, 'NOTES', 3.4, 'start', 0, 700));
  notes.slice(0, 10).forEach((t, i) => parts.push(text(27, ny0 + 5 + i * 4.4, `${i + 1}. ${t}`, 2.9, 'start')));
  // ---- title block ----
  const bx = 224, by = 246, bw = 172, bh = 40, cell = (x: number, y: number, w: number, h: number, label: string, val: string, size = 3.6) => `<rect x="${bx + x}" y="${by + y}" width="${w}" height="${h}" fill="none" stroke="${ink}" stroke-width="0.35"/>` + text(bx + x + 1.5, by + y + 3, label, 2.1, 'start', 0, 400) + text(bx + x + 2, by + y + h - 2.4, val, size, 'start', 0, 700);
  parts.push(cell(0, 0, 100, 20, 'TITLE', doc.name.toUpperCase(), 5), cell(100, 0, 36, 10, 'SCALE', scaleText(s)), cell(136, 0, 36, 10, 'SHEET', '1 / 1'), cell(100, 10, 36, 10, 'SIZE', 'A3'), cell(136, 10, 36, 10, 'UNITS', 'mm'), cell(0, 20, 50, 20, 'MATERIAL', o.material), cell(50, 20, 50, 20, 'MASS', `${num(o.mass)} kg`), cell(100, 20, 36, 20, 'DATE', o.date ?? ''), cell(136, 20, 36, 20, 'DRAWN BY', 'UNIBUILD CAD'));
  parts.push(`<rect x="24" y="14" width="${W - 38}" height="${H - 26}" fill="none" stroke="${ink}" stroke-width="0.7"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 3}" height="${H * 3}"><rect width="${W}" height="${H}" fill="#ffffff"/>${parts.join('')}</svg>`;
}
