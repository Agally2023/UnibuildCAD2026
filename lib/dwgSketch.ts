// Free 2D sketch geometry for the drawing sheet: AutoCAD-style Draw and Modify tools as pure functions.
// All coordinates are sheet millimetres with y pointing down (as on screen). Angles are in degrees, measured the way
// atan2(dy, dx) measures them in that frame, so an arc runs from a0 to a1 with the angle increasing.
import type { Ann, Layer, Prim } from './dwgTypes';

export type Pt = [number, number];
export type Geo = Extract<Ann, { t: 'geo' }>;
export type Body = Omit<Geo, 'id'>;
const D = Math.PI / 180;
const rd = (x: number) => Math.round(x * 1e6) / 1e6;
const P = (x: number, y: number): Pt => [rd(x), rd(y)];
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const norm360 = (a: number) => ((a % 360) + 360) % 360;
const ang = (c: Pt, p: Pt) => (Math.atan2(p[1] - c[1], p[0] - c[0]) * 180) / Math.PI;
const sweepEnd = (a0: number, a1: number) => { let e = a1; while (e <= a0) e += 360; return e; };

// ---------- shapes ----------
export const pl = (pts: Pt[], closed = false): Body => ({ t: 'geo', g: 'pl', pts: pts.map(p => P(p[0], p[1])), closed });
export const circle = (c: Pt, r: number): Body => ({ t: 'geo', g: 'ci', pts: [P(c[0], c[1])], r: rd(r) });
export const arc = (c: Pt, r: number, a0: number, a1: number): Body => { const s = norm360(a0); return { t: 'geo', g: 'ar', pts: [P(c[0], c[1])], r: rd(r), a0: rd(s), a1: rd(sweepEnd(s, s + norm360(a1 - a0) || s + 360)) }; };
export const ellipse = (c: Pt, rx: number, ry: number, rot = 0): Body => ({ t: 'geo', g: 'el', pts: [P(c[0], c[1])], rx: rd(rx), ry: rd(ry), rot: rd(rot) });
export const rectPts = (a: Pt, b: Pt): Pt[] => [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]];
/** Regular polygon. Inscribed: the point picked is a corner. Circumscribed: it is the middle of a side. */
export function polygonPts(c: Pt, p: Pt, n: number, inscribed: boolean): Pt[] {
  const k = Math.max(3, Math.round(n)), r0 = dist(c, p), a0 = Math.atan2(p[1] - c[1], p[0] - c[0]), r = inscribed ? r0 : r0 / Math.cos(Math.PI / k), st = inscribed ? a0 : a0 - Math.PI / k;
  return Array.from({ length: k }, (_, i) => [c[0] + r * Math.cos(st + (2 * Math.PI * i) / k), c[1] + r * Math.sin(st + (2 * Math.PI * i) / k)] as Pt);
}
export function circle3(a: Pt, b: Pt, c: Pt): { c: Pt; r: number } | null {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1])); if (Math.abs(d) < 1e-9) return null;
  const a2 = a[0] ** 2 + a[1] ** 2, b2 = b[0] ** 2 + b[1] ** 2, c2 = c[0] ** 2 + c[1] ** 2;
  const x = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d, y = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
  return { c: [x, y], r: Math.hypot(a[0] - x, a[1] - y) };
}
/** Arc through three points, from the first to the third. */
export function arc3(p1: Pt, p2: Pt, p3: Pt): Body | null {
  const f = circle3(p1, p2, p3); if (!f) return null;
  const cross = (p2[0] - p1[0]) * (p3[1] - p2[1]) - (p2[1] - p1[1]) * (p3[0] - p2[0]);
  return cross > 0 ? arc(f.c, f.r, ang(f.c, p1), ang(f.c, p3)) : arc(f.c, f.r, ang(f.c, p3), ang(f.c, p1));
}
/** Arc from its centre, a start point and an end point; counter-clockwise on the screen from the start. */
export function arcCse(c: Pt, s: Pt, e: Pt): Body | null { const r = dist(c, s); if (r < 1e-9) return null; return arc(c, r, ang(c, e), ang(c, s)); }

export type SketchTool = 'line' | 'pline' | 'rect' | 'poly' | 'circle' | 'c2p' | 'c3p' | 'arc3' | 'arcc' | 'ellipse';
export const POINTS_NEEDED: Record<SketchTool, number> = { line: 2, pline: 99, rect: 2, poly: 2, circle: 2, c2p: 2, c3p: 3, arc3: 3, arcc: 3, ellipse: 3 };
export type SketchOpts = { sides: number; inscribed: boolean; closed?: boolean };
/** The shape the picked points describe so far. `pts` may be one longer than the clicks, the extra one being the cursor. */
export function shapeOf(tool: SketchTool, pts: Pt[], o: SketchOpts): Body | null {
  if (!pts.length) return null;
  const [a, b, c] = pts;
  switch (tool) {
    case 'line': return b ? pl([a, b]) : null;
    case 'pline': return pts.length >= 2 ? pl(pts, !!o.closed && pts.length >= 3) : null;
    case 'rect': return b && Math.abs(a[0] - b[0]) > 1e-9 && Math.abs(a[1] - b[1]) > 1e-9 ? pl(rectPts(a, b), true) : null;
    case 'poly': return b && dist(a, b) > 1e-9 ? pl(polygonPts(a, b, o.sides, o.inscribed), true) : null;
    case 'circle': return b && dist(a, b) > 1e-9 ? circle(a, dist(a, b)) : null;
    case 'c2p': return b && dist(a, b) > 1e-9 ? circle([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], dist(a, b) / 2) : null;
    case 'c3p': { if (!c) return null; const f = circle3(a, b, c); return f ? circle(f.c, f.r) : null; }
    case 'arc3': return c ? arc3(a, b, c) : null;
    case 'arcc': return c ? arcCse(a, b, c) : null;
    case 'ellipse': { if (!c) return null; const rx = dist(a, b), ry = Math.abs(((c[0] - a[0]) * -(b[1] - a[1]) + (c[1] - a[1]) * (b[0] - a[0])) / (rx || 1)); return rx > 1e-9 && ry > 1e-9 ? ellipse(a, rx, ry, ang(a, b)) : null; }
  }
}
/** Ortho: keep the new point level or plumb with the previous one. */
export const orthoPt = (from: Pt, p: Pt): Pt => (Math.abs(p[0] - from[0]) >= Math.abs(p[1] - from[1]) ? [p[0], from[1]] : [from[0], p[1]]);
export const gridPt = (p: Pt, g: number): Pt => (g > 0 ? [Math.round(p[0] / g) * g, Math.round(p[1] / g) * g] : p);

/** Typed coordinates: "50,40" absolute (from the bottom left of the sheet, y up), "@10,5" relative, "@25<30" distance and angle. */
export function parseCoord(t: string, last: Pt | null, pageH: number): Pt | null {
  const s = t.trim().replace(/\s+/g, ''); if (!s) return null;
  const rel = s.startsWith('@'), body = rel ? s.slice(1) : s, base: Pt = rel && last ? last : [0, pageH];
  let m = /^(-?\d*\.?\d+)<(-?\d*\.?\d+)$/.exec(body); if (m) { const d = parseFloat(m[1]), a = parseFloat(m[2]) * D; return P(base[0] + d * Math.cos(a), base[1] - d * Math.sin(a)); }
  m = /^(-?\d*\.?\d+)[,;](-?\d*\.?\d+)$/.exec(body); if (m) { const x = parseFloat(m[1]), y = parseFloat(m[2]); return rel ? P(base[0] + x, base[1] - y) : P(x, pageH - y); }
  return null;
}

// ---------- transforms ----------
export type Mat = { a: number; b: number; c: number; d: number; e: number; f: number };   // x' = a x + c y + e,  y' = b x + d y + f
const ap = (m: Mat, p: Pt): Pt => P(m.a * p[0] + m.c * p[1] + m.e, m.b * p[0] + m.d * p[1] + m.f);
const dirAng = (m: Mat, deg: number) => (Math.atan2(m.b * Math.cos(deg * D) + m.d * Math.sin(deg * D), m.a * Math.cos(deg * D) + m.c * Math.sin(deg * D)) * 180) / Math.PI;
export const moveM = (dx: number, dy: number): Mat => ({ a: 1, b: 0, c: 0, d: 1, e: dx, f: dy });
/** Counter-clockwise on the screen by `deg`. */
export const rotateM = (c: Pt, deg: number): Mat => { const t = -deg * D, co = Math.cos(t), si = Math.sin(t); return { a: co, b: si, c: -si, d: co, e: c[0] - co * c[0] + si * c[1], f: c[1] - si * c[0] - co * c[1] }; };
export const scaleM = (c: Pt, k: number): Mat => ({ a: k, b: 0, c: 0, d: k, e: c[0] * (1 - k), f: c[1] * (1 - k) });
export const mirrorM = (p: Pt, q: Pt): Mat => { const dx = q[0] - p[0], dy = q[1] - p[1], l = dx * dx + dy * dy || 1, a = (dx * dx - dy * dy) / l, b = (2 * dx * dy) / l; return { a, b, c: b, d: -a, e: p[0] - a * p[0] - b * p[1], f: p[1] - b * p[0] + a * p[1] }; };
export function transform(g: Body, m: Mat): Body {
  const det = m.a * m.d - m.b * m.c, k = Math.sqrt(Math.abs(det)), o: Body = { ...g, pts: g.pts.map(p => ap(m, p)) };
  if (g.g === 'ci') o.r = rd((g.r ?? 0) * k);
  else if (g.g === 'ar') { const n0 = dirAng(m, g.a0 ?? 0), n1 = dirAng(m, g.a1 ?? 0), s = det < 0 ? norm360(n1) : norm360(n0), e = det < 0 ? n0 : n1; o.r = rd((g.r ?? 0) * k); o.a0 = rd(s); o.a1 = rd(sweepEnd(s, norm360(e))); }
  else if (g.g === 'el') { o.rx = rd((g.rx ?? 0) * k); o.ry = rd((g.ry ?? 0) * k); o.rot = rd(dirAng(m, g.rot ?? 0)); }
  return o;
}
export const moved = (g: Body, dx: number, dy: number) => transform(g, moveM(dx, dy));

/** Rectangular array. The original stays at row 0, column 0; copies run right (dx) and down (dy) on the screen. */
export function arrayRect(g: Body[], rows: number, cols: number, dx: number, dy: number): Body[] {
  const out: Body[] = []; for (let i = 0; i < Math.max(1, rows); i++) for (let j = 0; j < Math.max(1, cols); j++) { if (!i && !j) continue; for (const q of g) out.push(moved(q, j * dx, i * dy)); } return out;
}
/** Polar array about a centre: `count` items in all (the original included) over `fill` degrees, turning the copies with the circle. */
export function arrayPolar(g: Body[], c: Pt, count: number, fill: number, turn: boolean): Body[] {
  const n = Math.max(2, Math.round(count)), step = Math.abs(fill) >= 360 ? fill / n : fill / (n - 1), out: Body[] = [];
  for (let i = 1; i < n; i++) { const m = rotateM(c, i * step); for (const q of g) { if (turn) out.push(transform(q, m)); else { const p0 = q.pts[0], p1 = ap(m, p0); out.push(moved(q, p1[0] - p0[0], p1[1] - p0[1])); } } }
  return out;
}

// ---------- measuring ----------
function segDist(p: Pt, a: Pt, b: Pt): number { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
export const segments = (g: Body): [Pt, Pt][] => { const o: [Pt, Pt][] = []; for (let i = 0; i + 1 < g.pts.length; i++) o.push([g.pts[i], g.pts[i + 1]]); if (g.closed && g.pts.length > 2) o.push([g.pts[g.pts.length - 1], g.pts[0]]); return o; };
export function ellipsePts(g: Body, n = 96): Pt[] { const c = g.pts[0], rot = (g.rot ?? 0) * D, rx = g.rx ?? 0, ry = g.ry ?? 0; return Array.from({ length: n }, (_, i) => { const t = (2 * Math.PI * i) / n, x = rx * Math.cos(t), y = ry * Math.sin(t); return P(c[0] + x * Math.cos(rot) - y * Math.sin(rot), c[1] + x * Math.sin(rot) + y * Math.cos(rot)); }); }
export function arcOnPts(g: Body, n = 48): Pt[] { const c = g.pts[0], a0 = g.a0 ?? 0, a1 = g.a1 ?? 0, r = g.r ?? 0; return Array.from({ length: n + 1 }, (_, i) => { const t = (a0 + ((a1 - a0) * i) / n) * D; return P(c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)); }); }
/** Distance from a point to the outline of a shape. */
export function distTo(g: Body, p: Pt): number {
  if (g.g === 'pl') return Math.min(1e9, ...segments(g).map(([a, b]) => segDist(p, a, b)));
  if (g.g === 'ci') return Math.abs(dist(g.pts[0], p) - (g.r ?? 0));
  if (g.g === 'ar') { const c = g.pts[0], a = norm360(ang(c, p)), s = norm360(g.a0 ?? 0), e = s + ((g.a1 ?? 0) - (g.a0 ?? 0)); const inside = a >= s && a <= e || a + 360 <= e; if (inside) return Math.abs(dist(c, p) - (g.r ?? 0)); const ends = arcOnPts({ ...g }, 1); return Math.min(dist(ends[0], p), dist(ends[1], p)); }
  const pts = ellipsePts(g, 72); return Math.min(...pts.map((q, i) => segDist(p, q, pts[(i + 1) % pts.length])));
}
export type Snap = { p: Pt; kind: 'end' | 'mid' | 'cen' | 'quad' };
export function snapsOf(g: Body): Snap[] {
  const o: Snap[] = [];
  if (g.g === 'pl') { g.pts.forEach(p => o.push({ p, kind: 'end' })); segments(g).forEach(([a, b]) => o.push({ p: P((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), kind: 'mid' })); }
  else { const c = g.pts[0]; o.push({ p: c, kind: 'cen' }); if (g.g === 'ci') for (let i = 0; i < 4; i++) o.push({ p: P(c[0] + (g.r ?? 0) * Math.cos((i * Math.PI) / 2), c[1] + (g.r ?? 0) * Math.sin((i * Math.PI) / 2)), kind: 'quad' }); else if (g.g === 'ar') { const e = arcOnPts(g, 2); o.push({ p: e[0], kind: 'end' }, { p: e[1], kind: 'mid' }, { p: e[2], kind: 'end' }); } else ellipsePts(g, 4).forEach(p => o.push({ p, kind: 'quad' })); }
  return o;
}
export function bboxOf(g: Body): [number, number, number, number] {
  const pts = g.g === 'pl' ? g.pts : g.g === 'ci' ? [[g.pts[0][0] - (g.r ?? 0), g.pts[0][1] - (g.r ?? 0)], [g.pts[0][0] + (g.r ?? 0), g.pts[0][1] + (g.r ?? 0)]] as Pt[] : g.g === 'ar' ? arcOnPts(g, 24) : ellipsePts(g, 48);
  return [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
}

// ---------- offset, fillet, chamfer, explode ----------
const lineX = (p1: Pt, p2: Pt, p3: Pt, p4: Pt): Pt | null => { const d = (p1[0] - p2[0]) * (p3[1] - p4[1]) - (p1[1] - p2[1]) * (p3[0] - p4[0]); if (Math.abs(d) < 1e-12) return null; const a = p1[0] * p2[1] - p1[1] * p2[0], b = p3[0] * p4[1] - p3[1] * p4[0]; return P((a * (p3[0] - p4[0]) - (p1[0] - p2[0]) * b) / d, (a * (p3[1] - p4[1]) - (p1[1] - p2[1]) * b) / d); };
/** A parallel copy `d` away, on the side of `side`. Null when it would collapse. */
export function offset(g: Body, d: number, side: Pt): Body | null {
  if (!(d > 0)) return null;
  if (g.g === 'ci' || g.g === 'ar') { const out = dist(g.pts[0], side) > (g.r ?? 0), r = (g.r ?? 0) + (out ? d : -d); return r > 1e-9 ? { ...g, r: rd(r) } : null; }
  if (g.g === 'el') { const e = ellipsePts(g, 72), c = g.pts[0], inside = (() => { const lp = [side[0] - c[0], side[1] - c[1]], rot = -(g.rot ?? 0) * D, x = lp[0] * Math.cos(rot) - lp[1] * Math.sin(rot), y = lp[0] * Math.sin(rot) + lp[1] * Math.cos(rot); return (x / (g.rx || 1)) ** 2 + (y / (g.ry || 1)) ** 2 < 1; })(); void e; const rx = (g.rx ?? 0) + (inside ? -d : d), ry = (g.ry ?? 0) + (inside ? -d : d); return rx > 1e-9 && ry > 1e-9 ? { ...g, rx: rd(rx), ry: rd(ry) } : null; }
  const sg = segments(g); if (!sg.length) return null;
  let bi = 0, bd = 1e18; sg.forEach(([a, b], i) => { const q = segDist(side, a, b); if (q < bd) { bd = q; bi = i; } });
  const [a0, b0] = sg[bi], sgn = ((side[0] - a0[0]) * -(b0[1] - a0[1]) + (side[1] - a0[1]) * (b0[0] - a0[0])) >= 0 ? 1 : -1;
  const L = sg.map(([a, b]) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = (-dy / l) * sgn * d, ny = (dx / l) * sgn * d; return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny]] as [Pt, Pt]; });
  const n = g.pts.length, out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = g.closed ? (i - 1 + sg.length) % sg.length : i - 1, cur = g.closed ? i : i;
    if (!g.closed && i === 0) out.push(L[0][0]); else if (!g.closed && i === n - 1) out.push(L[sg.length - 1][1]); else { const A = L[prev], B = L[cur], x = lineX(A[0], A[1], B[0], B[1]); out.push(x ?? B[0]); }
  }
  return pl(out, !!g.closed);
}
function corner(g: Body, j: number): { v: Pt; A: Pt; B: Pt; open: boolean } | null {
  const n = g.pts.length; if (g.g !== 'pl' || n < 3) return null; const closed = !!g.closed;
  if (!closed && (j <= 0 || j >= n - 1)) return null;
  return { v: g.pts[j], A: g.pts[(j - 1 + n) % n], B: g.pts[(j + 1) % n], open: !closed };
}
export function nearestVertex(g: Body, p: Pt): number { let bi = -1, bd = 1e18; g.pts.forEach((q, i) => { const d = dist(p, q); if (d < bd) { bd = d; bi = i; } }); return bi; }
function tangents(v: Pt, A: Pt, B: Pt, dA: number, dB: number) { const la = dist(v, A), lb = dist(v, B); if (la < 1e-9 || lb < 1e-9 || dA >= la || dB >= lb) return null; return { t1: P(v[0] + ((A[0] - v[0]) / la) * dA, v[1] + ((A[1] - v[1]) / la) * dA), t2: P(v[0] + ((B[0] - v[0]) / lb) * dB, v[1] + ((B[1] - v[1]) / lb) * dB) }; }
const around = (g: Body, j: number, mid: Pt[]): Pt[] => { const n = g.pts.length, out: Pt[] = []; if (g.closed) { for (let k = 1; k < n; k++) out.push(g.pts[(j + k) % n]); return [...mid.slice(-1), ...out, mid[0]]; } return [...g.pts.slice(0, j), ...mid, ...g.pts.slice(j + 1)]; };
/** Cut a corner off with a straight edge. */
export function chamferCorner(g: Body, j: number, d1: number, d2: number): Body | null {
  const c = corner(g, j); if (!c) return null; const t = tangents(c.v, c.A, c.B, d1, d2); if (!t) return null;
  if (!g.closed) return { ...g, pts: around(g, j, [t.t1, t.t2]) };
  return { ...g, closed: false, pts: [t.t2, ...Array.from({ length: g.pts.length - 1 }, (_, k) => g.pts[(j + 1 + k) % g.pts.length]), t.t1] };
}
/** Round a corner. Returns the shapes that replace the polyline (the pieces, then the arc), or null if the radius is too big. */
export function filletCorner(g: Body, j: number, r: number): Body[] | null {
  const c = corner(g, j); if (!c || !(r > 0)) return null; const { v, A, B } = c;
  const ua: Pt = [(A[0] - v[0]) / dist(v, A), (A[1] - v[1]) / dist(v, A)], ub: Pt = [(B[0] - v[0]) / dist(v, B), (B[1] - v[1]) / dist(v, B)];
  const cosT = ua[0] * ub[0] + ua[1] * ub[1], half = Math.acos(Math.max(-1, Math.min(1, cosT))) / 2; if (half < 1e-6) return null;
  const tl = r / Math.tan(half), t = tangents(v, A, B, tl, tl); if (!t) return null;
  const bx = ua[0] + ub[0], by = ua[1] + ub[1], bl = Math.hypot(bx, by); if (bl < 1e-9) return null;
  const cen: Pt = [v[0] + (bx / bl) * (r / Math.sin(half)), v[1] + (by / bl) * (r / Math.sin(half))];
  let s = ang(cen, t.t1), e = ang(cen, t.t2), dl = ((e - s + 540) % 360) - 180; if (dl < 0) { const q = s; s = e; e = q; }
  const ar = arc(cen, r, s, e);
  if (!g.closed) { const left = pl([...g.pts.slice(0, j), t.t1]), right = pl([t.t2, ...g.pts.slice(j + 1)]); return [left, ar, right].filter(q => q.pts.length > 1 || q.g !== 'pl'); }
  return [{ ...g, closed: false, pts: [t.t2, ...Array.from({ length: g.pts.length - 1 }, (_, k) => g.pts[(j + 1 + k) % g.pts.length]), t.t1] }, ar];
}
/** Fillet (or, with radius 0, a sharp corner) between two separate straight lines. */
export function filletLines(a: Body, b: Body, pa: Pt, pb: Pt, r: number): Body[] | null {
  if (a.g !== 'pl' || b.g !== 'pl' || a.pts.length !== 2 || b.pts.length !== 2) return null;
  const v = lineX(a.pts[0], a.pts[1], b.pts[0], b.pts[1]); if (!v) return null;
  const keep = (l: Body, p: Pt): Pt => { const [s, e] = l.pts; return dist(p, s) <= dist(p, e) ? s : e; };   // the end the pick was nearer to stays
  const A = keep(a, pa), B = keep(b, pb), j = pl([A, v, B]);
  return r > 0 ? filletCorner(j, 1, r) : [j];
}
export function chamferLines(a: Body, b: Body, pa: Pt, pb: Pt, d1: number, d2: number): Body[] | null {
  if (a.g !== 'pl' || b.g !== 'pl' || a.pts.length !== 2 || b.pts.length !== 2) return null;
  const v = lineX(a.pts[0], a.pts[1], b.pts[0], b.pts[1]); if (!v) return null;
  const keep = (l: Body, p: Pt): Pt => { const [s, e] = l.pts; return dist(p, s) <= dist(p, e) ? s : e; };
  const c = chamferCorner(pl([keep(a, pa), v, keep(b, pb)]), 1, d1, d2); return c ? [c] : null;
}
/** Break a polyline into separate lines. */
export const explode = (g: Body): Body[] => (g.g === 'pl' ? segments(g).map(([a, b]) => pl([a, b])) : [g]);
/** Join lines and polylines that meet end to end into one polyline. Returns the joined shapes. */
export function joinAll(gs: Body[]): Body[] {
  const open = gs.filter(g => g.g === 'pl' && !g.closed), rest = gs.filter(g => !(g.g === 'pl' && !g.closed)), out: Body[] = [];
  const same = (a: Pt, b: Pt) => dist(a, b) < 1e-4; const pool = open.map(g => g.pts.slice());
  while (pool.length) {
    let cur = pool.shift()!, grew = true;
    while (grew) { grew = false; for (let i = 0; i < pool.length; i++) { const q = pool[i], e = cur[cur.length - 1], s = cur[0];
      if (same(e, q[0])) { cur = [...cur, ...q.slice(1)]; } else if (same(e, q[q.length - 1])) { cur = [...cur, ...q.slice(0, -1).reverse()]; } else if (same(s, q[q.length - 1])) { cur = [...q, ...cur.slice(1)]; } else if (same(s, q[0])) { cur = [...q.slice().reverse(), ...cur.slice(1)]; } else continue;
      pool.splice(i, 1); grew = true; break; } }
    const closed = cur.length > 3 && same(cur[0], cur[cur.length - 1]); out.push(pl(closed ? cur.slice(0, -1) : cur, closed));
  }
  return [...rest, ...out];
}

// ---------- drawing ----------
const LAY: Record<NonNullable<Geo['lt']>, Layer> = { cont: 'vis', hid: 'hid', cen: 'cen' };
/** The lines to draw, ready for the sheet. */
export function geoPrims(g: Body, col?: string): Prim[] {
  const layer = LAY[g.lt ?? 'cont'], w = g.w ?? 0.5, color = col ?? g.col, dash = g.lt === 'hid' ? [3, 1.2] : g.lt === 'cen' ? [8, 1.5, 1.5, 1.5] : undefined;
  const line = (pts: Pt[], closed: boolean): Prim[] => (dash ? segs(pts, closed).map(([a, b]) => ({ k: 'l', a, b, layer, w, dash, col: color } as Prim)) : [{ k: 'p', pts, closed, w, layer } as Prim]);
  const segs = (pts: Pt[], closed: boolean): [Pt, Pt][] => { const o: [Pt, Pt][] = []; for (let i = 0; i + 1 < pts.length; i++) o.push([pts[i], pts[i + 1]]); if (closed && pts.length > 2) o.push([pts[pts.length - 1], pts[0]]); return o; };
  if (g.g === 'pl') return g.pts.length < 2 ? [] : line(g.pts, !!g.closed);
  if (g.g === 'ci') return dash ? line(arcOnPts({ ...g, g: 'ar', a0: 0, a1: 360 }, 72), true) : [{ k: 'c', c: g.pts[0], r: g.r ?? 0, w, layer }];
  if (g.g === 'ar') return dash ? line(arcOnPts(g, 36), false) : [{ k: 'a', c: g.pts[0], r: g.r ?? 0, a0: g.a0 ?? 0, a1: g.a1 ?? 0, w, layer }];
  return line(ellipsePts(g), true);
}
