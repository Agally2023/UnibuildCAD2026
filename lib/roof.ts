// Pitched roofs: a rectangular roof with a form (mono, gable or hip) and a pitch in degrees.
// Faces are listed as top-surface polygons in 3D [x, y, z] (x, y in plan, z up). The roof is a shell of constant
// vertical thickness t = z1 - z0 under each face; the eaves are at z1.
type Pt = [number, number];
export type P3 = [number, number, number];
export type RoofForm = 'flat' | 'mono' | 'gable' | 'hip';
export const FORMS: [RoofForm, string][] = [['flat', 'Flat'], ['mono', 'Mono'], ['gable', 'Gable'], ['hip', 'Hip']];

const rad = (d: number) => (d * Math.PI) / 180;
export const roofForm = (g: any): RoofForm => (g?.rect && ['mono', 'gable', 'hip'].includes(g.form) && (g.pitch ?? 0) > 0 && !g.poly ? g.form : 'flat');
export const isPitched = (g: any) => roofForm(g) !== 'flat';
const walls = (g: any) => { const [a, b, c, d] = g.rect as number[]; return { x0: Math.min(a, c), y0: Math.min(b, d), x1: Math.max(a, c), y1: Math.max(b, d) }; };
// how far the roof reaches past the building outline (pitched roofs only)
export const overhangOf = (g: any) => (isPitched(g) ? Math.min(1.5, Math.max(0, g.overhang ?? 0)) : 0);
// the roof's outline in plan: the rectangle grown by the overhang
export function roofPlanBox(g: any): [number, number, number, number] { const b = walls(g), o = overhangOf(g); return [b.x0 - o, b.y0 - o, b.x1 + o, b.y1 + o]; }
const box = (g: any) => { const [x0, y0, x1, y1] = roofPlanBox(g); return { x0, y0, x1, y1 }; };
// the direction the ridge (or high edge) runs: the longer side unless the roof says otherwise
export const ridgeAxis = (g: any): 'x' | 'y' => { const { x0, y0, x1, y1 } = walls(g); return g.ridge === 'x' || g.ridge === 'y' ? g.ridge : x1 - x0 >= y1 - y0 ? 'x' : 'y'; };

export function roofFaces(g: any): P3[][] {
  const { x0, y0, x1, y1 } = box(g), f = roofForm(g), tn = Math.tan(rad(g.pitch ?? 0)), zE = g.z1 - overhangOf(g) * tn, w = x1 - x0, d = y1 - y0;   // the plane keeps its slope past the walls, so the eaves drop by overhang x tan
  if (f === 'flat') return [[[x0, y0, zE], [x1, y0, zE], [x1, y1, zE], [x0, y1, zE]]];
  const ax = ridgeAxis(g);
  if (f === 'mono') {
    if (ax === 'x') { const rise = d * tn, hi = g.flip ? y0 : y1, lo = g.flip ? y1 : y0; return [[[x0, lo, zE], [x1, lo, zE], [x1, hi, zE + rise], [x0, hi, zE + rise]]]; }
    const rise = w * tn, hi = g.flip ? x0 : x1, lo = g.flip ? x1 : x0; return [[[lo, y0, zE], [lo, y1, zE], [hi, y1, zE + rise], [hi, y0, zE + rise]]];
  }
  if (f === 'gable') {
    if (ax === 'x') { const ym = (y0 + y1) / 2, z = zE + (d / 2) * tn; return [[[x0, y0, zE], [x1, y0, zE], [x1, ym, z], [x0, ym, z]], [[x0, y1, zE], [x1, y1, zE], [x1, ym, z], [x0, ym, z]]]; }
    const xm = (x0 + x1) / 2, z = zE + (w / 2) * tn; return [[[x0, y0, zE], [x0, y1, zE], [xm, y1, z], [xm, y0, z]], [[x1, y0, zE], [x1, y1, zE], [xm, y1, z], [xm, y0, z]]];
  }
  // hip: all four sides slope; the ridge runs along the longer side
  const hx = w >= d, s = Math.min(w, d), z = zE + (s / 2) * tn;
  if (hx) { const ym = (y0 + y1) / 2, xa = x0 + s / 2, xb = x1 - s / 2; return [[[x0, y0, zE], [x1, y0, zE], [xb, ym, z], [xa, ym, z]], [[x0, y1, zE], [x1, y1, zE], [xb, ym, z], [xa, ym, z]], [[x0, y0, zE], [x0, y1, zE], [xa, ym, z]], [[x1, y0, zE], [x1, y1, zE], [xb, ym, z]]]; }
  const xm = (x0 + x1) / 2, ya = y0 + s / 2, yb = y1 - s / 2;
  return [[[x0, y0, zE], [x0, y1, zE], [xm, yb, z], [xm, ya, z]], [[x1, y0, zE], [x1, y1, zE], [xm, yb, z], [xm, ya, z]], [[x0, y0, zE], [x1, y0, zE], [xm, ya, z]], [[x0, y1, zE], [x1, y1, zE], [xm, yb, z]]];
}
export const roofThickness = (g: any) => Math.max(0.02, (g.z1 ?? 0) - (g.z0 ?? 0));
export function roofTop(g: any): number { return Math.max(...roofFaces(g).flat().map(p => p[2])); }
export const slopeFactor = (g: any) => (isPitched(g) ? 1 / Math.cos(rad(g.pitch)) : 1);
export const roofLabel = (g: any) => (isPitched(g) ? `${roofForm(g)[0].toUpperCase()}${roofForm(g).slice(1)} ${Math.round(g.pitch)}°${overhangOf(g) ? ` +${overhangOf(g).toFixed(1)} m overhang` : ''}` : 'Flat');

// ridge, hips and the high edge of a mono roof, as plan segments for drawing
export function roofLines(g: any): [Pt, Pt][] {
  const f = roofForm(g); if (f === 'flat') return [];
  const faces = roofFaces(g), top = roofTop(g), eps = 1e-6, out: [Pt, Pt][] = [], seen = new Set<string>();
  const add = (a: P3, b: P3) => { const k = [a, b].map(p => p.map(v => v.toFixed(3)).join(',')).sort().join('|'); if (!seen.has(k)) { seen.add(k); out.push([[a[0], a[1]], [b[0], b[1]]]); } };
  for (const face of faces) for (let i = 0; i < face.length; i++) {
    const a = face[i], b = face[(i + 1) % face.length];
    if (Math.abs(a[2] - b[2]) < eps && a[2] > g.z1 + eps) add(a, b);                  // along the ridge or the high edge
    else if (f === 'hip' && Math.abs(a[2] - b[2]) > eps) add(a, b);                    // hips
  }
  void top; return out;
}

// ---- views: silhouettes and cuts of the faces as (u, z) polygons ----
const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
export function hull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]).filter((q, i, arr) => !i || q[0] !== arr[i - 1][0] || q[1] !== arr[i - 1][1]);
  if (p.length < 3) return p;
  const lo: Pt[] = [], up: Pt[] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 1e-12) lo.pop(); lo.push(q); }
  for (const q of [...p].reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 1e-12) up.pop(); up.push(q); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}
const down = (p: P3, t: number): P3 => [p[0], p[1], p[2] - t];
// the shape of a face seen along the view: its (u, z) outline
export function faceOutline(face: P3[], t: number, U: (p: Pt) => number): Pt[] {
  return hull(face.flatMap(p => [[U([p[0], p[1]]), p[2]] as Pt, [U([p[0], p[1]]), p[2] - t] as Pt]));
}
// where the plane depth = d0 cuts the face's shell, as a (u, z) polygon (empty when it misses)
export function faceCut(face: P3[], t: number, U: (p: Pt) => number, Dp: (p: Pt) => number, d0: number): Pt[] {
  const bot = face.map(p => down(p, t)), edges: [P3, P3][] = [];
  for (let i = 0; i < face.length; i++) { const j = (i + 1) % face.length; edges.push([face[i], face[j]], [bot[i], bot[j]], [face[i], bot[i]]); }
  const pts: Pt[] = [];
  for (const [a, b] of edges) {
    const da = Dp([a[0], a[1]]) - d0, db = Dp([b[0], b[1]]) - d0;
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) { const k = da / (da - db), q: P3 = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; pts.push([U([q[0], q[1]]), q[2]]); }
  }
  return hull(pts);
}
