// The drawing engine. renderDrawing() turns a drawing document and a part into primitives on a sheet (mm): views with hidden lines, sections,
// details, auxiliary and broken views, dimensions, symbols, tables, border and title block. Output formats (SVG, DXF) are in dwgOut.ts.
import { geoPrims } from './dwgSketch';
import { placeDxf } from './dxfIn';
import { uid } from './sketch';
import type { PartDoc } from './parts';
import type { Mesh, V3 } from './solid';
import { callouts, edgePieces, viewEdges, visibility } from './drawing';
import { paintMeshURL } from './vpaint';
import { pageMm, PAPERS, type PageSetup } from './paper';
import { NAMED, VIEW_NAMES, circlesInCam, findCylinders, camAzEl, chain, clipBand, clipCircle, clipMesh, clipRect, cross, cutSegs, dot, findCircles, hatchSegs, norm, proj, qFromCam, segLen, type Cam, type Circ, type NamedView, type Pt, type Seg } from './dwgGeom';
import type { Ann, Brk, Cut, DView, DrawingDoc, Layer, Prim, Props, Sheet, Tol } from './dwgTypes';
import { INK, arrowhead, balloonShape, circle, cloud, finishSymbol, gdtFrame, line, poly, table, text, weldSymbol } from './dwgSym';

export type Ctx = { bom?: { item: number; name: string; material: string; qty: number; mass: number; lo: number[]; hi: number[] }[]; doc: PartDoc; mesh: Mesh; values: Record<string, number>; material: string; mass: number; date: string; color?: string; shine?: number; images?: boolean };
export type ViewInfo = { id: string; kind: DView['kind']; label: string; cx: number; cy: number; uc: number; vc: number; s: number; box: [number, number, number, number]; sheetBox: [number, number, number, number]; cam: Cam; parent?: string };
export type Snap = { view: string; u: number; v: number; x: number; y: number; kind: 'end' | 'mid' | 'center' | 'arc'; r?: number };
export type CircleInfo = { view: string; c: Circ; x: number; y: number; r: number };
export type Hit = { id: string; kind: 'view' | 'ann'; box: [number, number, number, number] };
export type Rendered = { prims: Prim[]; views: ViewInfo[]; snaps: Snap[]; circles: CircleInfo[]; hits: Hit[]; page: [number, number]; area: [number, number, number, number]; tb: [number, number, number, number] };

export const SCALES = [0.02, 0.025, 0.04, 0.05, 0.1, 0.2, 0.25, 0.3333, 0.4, 0.5, 0.6667, 1, 1.5, 2, 2.5, 4, 5, 10, 20, 50];
export const scaleText = (s: number) => (s >= 1 ? `${Math.round(s * 100) / 100} : 1` : `1 : ${Math.round((1 / s) * 100) / 100}`);
const num = (n: number) => (Math.round(n * 10) / 10).toString();

// ---------- geometry of views (cached per mesh and camera) ----------
type Geo = { vis: Seg[]; hid: Seg[]; box: [number, number, number, number]; circ?: { vis: Circ[]; all: Circ[] } };
const PIECES = new WeakMap<Mesh, ReturnType<typeof edgePieces>>();
const GEOS = new WeakMap<Mesh, Map<string, Geo>>();
const CLIPS = new WeakMap<Mesh, Map<string, Mesh>>();
const camKey = (c: Cam) => [...c.right, ...c.up].map(x => Math.round(x * 1e4)).join(',');
export function geoOf(mesh: Mesh, cam: Cam): Geo {
  let m = GEOS.get(mesh); if (!m) { m = new Map(); GEOS.set(mesh, m); }
  const k = camKey(cam), have = m.get(k); if (have) return have;
  let pcs = PIECES.get(mesh); if (!pcs) { pcs = edgePieces(mesh); PIECES.set(mesh, pcs); }
  const edges = viewEdges(pcs, cam, 30), big = (mesh.f.length / 3) * (edges.length / 6) > 4e8;
  let vis: Seg[] = [], hid: Seg[] = [];
  if (big) { for (let i = 0; i < edges.length; i += 6) { const a = proj(cam, [edges[i], edges[i + 1], edges[i + 2]]), b = proj(cam, [edges[i + 3], edges[i + 4], edges[i + 5]]); vis.push([a[0], a[1], b[0], b[1]]); } }
  else { const r = visibility(mesh, edges, cam); vis = r.vis; hid = r.hid; }
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (let i = 0; i < mesh.v.length; i += 3) { const p = proj(cam, [mesh.v[i], mesh.v[i + 1], mesh.v[i + 2]]); u0 = Math.min(u0, p[0]); u1 = Math.max(u1, p[0]); v0 = Math.min(v0, p[1]); v1 = Math.max(v1, p[1]); }
  const g: Geo = { vis, hid, box: [u0, v0, u1, v1] }; m.set(k, g); return g;
}
// round features seen end on in a view (read from the solid, see findCylinders)
function circlesFor(mesh: Mesh, cam: Cam): Circ[] { return circlesInCam(findCylinders(mesh), cam); }
function sectionMesh(mesh: Mesh, axis: 'x' | 'y' | 'z', pos: number, side: 1 | -1): Mesh {
  let m = CLIPS.get(mesh); if (!m) { m = new Map(); CLIPS.set(mesh, m); }
  const k = `${axis}:${pos}:${side}`; let c = m.get(k); if (!c) { c = clipMesh(mesh, axis, pos, side); m.set(k, c); } return c;
}

// ---------- cameras of views ----------
const neg = (a: V3): V3 => [-a[0], -a[1], -a[2]];
const sectionKeep = (c: Cut): 1 | -1 => (c.axis === 'z' ? (c.flip ? 1 : -1) : c.flip ? -1 : 1);
export const sectionCam = (c: Cut): Cam => NAMED[c.axis === 'y' ? (c.flip ? 'back' : 'front') : c.axis === 'x' ? (c.flip ? 'right' : 'left') : c.flip ? 'bottom' : 'top'];
export function camOf(v: DView, views: DView[], dd: DrawingDoc, ctx: Ctx, depth = 0): Cam {
  const par = v.parent ? views.find(x => x.id === v.parent) : undefined;
  if (v.kind === 'section' && v.cut) return sectionCam(v.cut);
  if (depth > 6 || (!par && (v.kind === 'proj' || v.kind === 'detail' || v.kind === 'aux'))) return NAMED.front;
  if (v.kind === 'detail') return camOf(par!, views, dd, ctx, depth + 1);
  if (v.kind === 'proj') {
    const pc = camOf(par!, views, dd, ctx, depth + 1), third = dd.projection === 'third', d = v.proj ?? 'r';
    const side = (right: boolean) => (right === third ? { fwd: neg(pc.right), right: pc.fwd, up: pc.up } : { fwd: pc.right, right: neg(pc.fwd), up: pc.up });
    const vert = (above: boolean) => (above === third ? { fwd: neg(pc.up), right: pc.right, up: pc.fwd } : { fwd: pc.up, right: pc.right, up: neg(pc.fwd) });
    return d === 'r' ? side(true) : d === 'l' ? side(false) : d === 'u' ? vert(true) : vert(false);
  }
  if (v.kind === 'aux' && v.aux) {
    const pc = camOf(par!, views, dd, ctx, depth + 1), g = geoOf(ctx.mesh, pc), [ax, ay] = v.aux.a, [bx, by] = v.aux.b, dl = Math.hypot(bx - ax, by - ay) || 1, dx = (bx - ax) / dl, dy = (by - ay) / dl;
    const n: Pt = [-dy, dx], mid: Pt = [(ax + bx) / 2, (ay + by) / 2], ctr: Pt = [(g.box[0] + g.box[2]) / 2, (g.box[1] + g.box[3]) / 2];
    let sgn = (mid[0] - ctr[0]) * n[0] + (mid[1] - ctr[1]) * n[1] >= 0 ? 1 : -1; if (v.aux.flip) sgn = -sgn;
    const out3: V3 = norm([pc.right[0] * n[0] * sgn + pc.up[0] * n[1] * sgn, pc.right[1] * n[0] * sgn + pc.up[1] * n[1] * sgn, pc.right[2] * n[0] * sgn + pc.up[2] * n[1] * sgn]);
    const right: V3 = norm([pc.right[0] * dx + pc.up[0] * dy, pc.right[1] * dx + pc.up[1] * dy, pc.right[2] * dx + pc.up[2] * dy]), fwd = neg(out3);
    return { right, up: norm(cross(right, fwd)), fwd };
  }
  return NAMED[v.kind as NamedView] ?? NAMED.front;
}

// ---------- view content: lines in view units, ready to be placed on a sheet ----------
type Item = { s: Seg; k: 'v' | 'h' | 'c' | 'x' | 'xd' | 'z' };
type Content = { items: Item[]; box: [number, number, number, number]; model: boolean; cam: Cam; circles: Circ[] };

function insidePoly(p: Pt, segs: Seg[]): boolean {
  let n = 0; for (const [ax, ay, bx, by] of segs) if ((ay > p[1]) !== (by > p[1]) && p[0] < ax + ((p[1] - ay) / (by - ay)) * (bx - ax)) n++;
  return n % 2 === 1;
}
function hatchItems(outline: Seg[], style: string, s: number, angle = 45): Item[] {
  if (style === 'none' || !outline.length) return [];
  const g = (sheetGap: number, ang: number, dx = 0, dy = 0, k: 'x' | 'xd' = 'x'): Item[] => {
    const shifted = dx || dy ? outline.map(o => [o[0] + dx, o[1] + dy, o[2] + dx, o[3] + dy] as Seg) : outline;
    return hatchSegs(shifted, ang, sheetGap / s).map(h => ({ s: [h[0] - dx, h[1] - dy, h[2] - dx, h[3] - dy] as Seg, k }));
  };
  const a = (angle * Math.PI) / 180, nx = -Math.sin(a) / s, ny = Math.cos(a) / s;   // shift across the lines, in view units
  switch (style) {
    case 'steel': return [...g(3.6, angle), ...g(3.6, angle, nx * 1.1, ny * 1.1)];
    case 'brass': return [...g(4, angle), ...g(4, angle, nx * 2, ny * 2, 'xd')];
    case 'alu': return [...g(3.6, angle), ...g(3.6, angle, nx * 1.2, ny * 1.2, 'xd'), ...g(3.6, angle, nx * 2.4, ny * 2.4, 'xd')];
    case 'cross': return [...g(3.2, angle), ...g(3.2, angle + 90)];
    case 'solid': return g(0.45, angle);
    default: return g(2.6, angle);
  }
}
const subtractRect = (sg: Seg, x0: number, y0: number, x1: number, y1: number): Seg[] => {
  const inside = clipRect(sg, x0, y0, x1, y1); if (!inside) return [sg];
  const out: Seg[] = [], L = segLen(sg) || 1, d = (p: Pt) => Math.hypot(p[0] - sg[0], p[1] - sg[1]) / L, t0 = d([inside[0], inside[1]]), t1 = d([inside[2], inside[3]]), lerp = (t: number): Pt => [sg[0] + (sg[2] - sg[0]) * t, sg[1] + (sg[3] - sg[1]) * t];
  if (t0 > 1e-6) out.push([sg[0], sg[1], ...lerp(t0)]); if (t1 < 1 - 1e-6) out.push([...lerp(t1), sg[2], sg[3]]);
  return out;
};

function planeContent(v: DView, ctx: Ctx, cut: Cut, pos: number, s: number, hatchStyle: string, band?: (sg: Seg) => Seg | null): { items: Item[]; cam: Cam; box: Geo['box'] } {
  const cam = sectionCam(cut), side = sectionKeep(cut), m = sectionMesh(ctx.mesh, cut.axis, pos, side), g = geoOf(m, cam);
  const outline = cutSegs(ctx.mesh, cut.axis, pos).map(([a, b]) => [...proj(cam, a), ...proj(cam, b)] as Seg), items: Item[] = [];
  const keep = (sg: Seg) => !insidePoly([(sg[0] + sg[2]) / 2, (sg[1] + sg[3]) / 2], outline), add = (sg: Seg, k: Item['k']) => { const q = band ? band(sg) : sg; if (q) items.push({ s: q, k }); };
  for (const sg of g.vis) if (keep(sg)) add(sg, 'v');
  for (const sg of g.hid) if (keep(sg)) add(sg, 'h');
  for (const sg of outline) add(sg, 'c');
  for (const h of hatchItems(outline, hatchStyle, s)) add(h.s, h.k);
  void v;
  return { items, cam, box: geoOf(ctx.mesh, cam).box };
}

export function contentOf(v: DView, views: DView[], dd: DrawingDoc, ctx: Ctx, sheetScale: number, depth = 0): Content {
  const s = v.scale ?? sheetScale, cam = camOf(v, views, dd, ctx), par = v.parent ? views.find(x => x.id === v.parent) : undefined;
  let c: Content;
  if (v.kind === 'section' && v.cut) {
    const cut = v.cut, st = v.hatch ?? dd.hatch, full = geoOf(ctx.mesh, cam), box = full.box, ctr = v.cut.split ?? (box[0] + box[2]) / 2;
    if (cut.kind === 'half') {
      const left = (cut.halfSide ?? 'l') === 'l', secBand = (sg: Seg) => clipBand(sg, 0, left ? -1e12 : ctr, left ? ctr : 1e12), extBand = (sg: Seg) => clipBand(sg, 0, left ? ctr : -1e12, left ? 1e12 : ctr);
      const p = planeContent(v, ctx, cut, cut.pos, s, st, secBand), items = p.items.slice();
      for (const sg of full.vis) { const q = extBand(sg); if (q) items.push({ s: q, k: 'v' }); } for (const sg of full.hid) { const q = extBand(sg); if (q) items.push({ s: q, k: 'h' }); }
      items.push({ s: [ctr, box[1] - 4 / s, ctr, box[3] + 4 / s], k: 'z' });
      c = { items, box, model: false, cam, circles: [] };
    } else if (cut.kind === 'offset' && cut.pos2 !== undefined) {
      const a = planeContent(v, ctx, cut, cut.pos, s, st, sg => clipBand(sg, 0, -1e12, ctr)), b = planeContent(v, ctx, cut, cut.pos2, s, st, sg => clipBand(sg, 0, ctr, 1e12));
      c = { items: [...a.items, ...b.items], box, model: false, cam, circles: [] };
    } else { const p = planeContent(v, ctx, cut, cut.pos, s, st); c = { items: p.items, box, model: false, cam, circles: [] }; }
  } else if (v.kind === 'detail' && v.detail && par) {
    const pc = contentOf(par, views, dd, ctx, sheetScale, depth + 1), d = v.detail, items: Item[] = [];
    // the parent's lines, at this view's scale (so hatching is re-spaced), cut to the circle or square
    const pc2 = par.scale === s ? pc : contentOf({ ...par, scale: s }, views, dd, ctx, sheetScale, depth + 1);
    for (const it of pc2.items) { const q = d.round ? clipCircle(it.s, d.u, d.v, d.r) : clipRect(it.s, d.u - d.r, d.v - d.r, d.u + d.r, d.v + d.r); if (q) items.push({ s: q, k: it.k }); }
    c = { items, box: [d.u - d.r, d.v - d.r, d.u + d.r, d.v + d.r], model: false, cam, circles: [] };
  } else {
    const g = geoOf(ctx.mesh, cam), items: Item[] = [...g.vis.map(sg => ({ s: sg, k: 'v' as const })), ...g.hid.map(sg => ({ s: sg, k: 'h' as const }))];
    c = { items, box: g.box, model: true, cam, circles: [] };
  }
  // break-out section: a window onto a section at a depth
  if (v.breakout && c.model) {
    const b = v.breakout, ax = Math.abs(cam.fwd[0]) > 0.9 ? 'x' : Math.abs(cam.fwd[1]) > 0.9 ? 'y' : Math.abs(cam.fwd[2]) > 0.9 ? 'z' : null;
    if (ax) {
      const comp = ax === 'x' ? cam.fwd[0] : ax === 'y' ? cam.fwd[1] : cam.fwd[2], cut: Cut = { axis: ax, pos: b.depth, flip: false, kind: 'full' };
      const kept = comp > 0 ? 1 : -1, m = sectionMesh(ctx.mesh, ax, b.depth, kept as 1 | -1), g = geoOf(m, cam), outline = cutSegs(ctx.mesh, ax, b.depth).map(([p, q]) => [...proj(cam, p), ...proj(cam, q)] as Seg);
      void cut;
      const items: Item[] = [];
      for (const it of c.items) for (const piece of subtractRect(it.s, b.u0, b.v0, b.u1, b.v1)) items.push({ s: piece, k: it.k });
      const inWin = (sg: Seg) => clipRect(sg, b.u0, b.v0, b.u1, b.v1), keep = (sg: Seg) => !insidePoly([(sg[0] + sg[2]) / 2, (sg[1] + sg[3]) / 2], outline);
      for (const sg of g.vis) if (keep(sg)) { const q = inWin(sg); if (q) items.push({ s: q, k: 'v' }); }
      for (const sg of outline) { const q = inWin(sg); if (q) items.push({ s: q, k: 'c' }); }
      for (const h of hatchItems(outline, v.hatch ?? dd.hatch, s)) { const q = inWin(h.s); if (q) items.push({ s: q, k: h.k }); }
      for (const e of [[b.u0, b.v0, b.u1, b.v0], [b.u1, b.v0, b.u1, b.v1], [b.u1, b.v1, b.u0, b.v1], [b.u0, b.v1, b.u0, b.v0]] as Seg[]) items.push({ s: e, k: 'z' });
      c = { ...c, items, model: false };
    }
  }
  // broken view: the middle of a long part is left out and replaced by break lines
  for (const br of v.breaks ?? []) c = breakContent(c, br, s);
  if (v.crop) { const k = v.crop, ctr: Pt = [(k.u0 + k.u1) / 2, (k.v0 + k.v1) / 2], r = Math.min(k.u1 - k.u0, k.v1 - k.v0) / 2, items: Item[] = [];
    for (const it of c.items) { const q = k.round ? clipCircle(it.s, ctr[0], ctr[1], r) : clipRect(it.s, k.u0, k.v0, k.u1, k.v1); if (q) items.push({ s: q, k: it.k }); }
    c = { ...c, items, box: k.round ? [ctr[0] - r, ctr[1] - r, ctr[0] + r, ctr[1] + r] : [k.u0, k.v0, k.u1, k.v1], model: false }; }
  return c;
}
function breakContent(c: Content, br: Brk, s: number): Content {
  const ax: 0 | 1 = br.dir === 'h' ? 0 : 1, lo = Math.min(br.a, br.b), hi = Math.max(br.a, br.b), gap = 3 / s, shift = hi - lo - gap, items: Item[] = [];
  const mv = (sg: Seg): Seg => (ax === 0 ? [sg[0] - shift, sg[1], sg[2] - shift, sg[3]] : [sg[0], sg[1] - shift, sg[2], sg[3] - shift]);
  for (const it of c.items) {
    const a = clipBand(it.s, ax, -1e12, lo), b = clipBand(it.s, ax, hi, 1e12);
    if (a) items.push({ s: a, k: it.k }); if (b) items.push({ s: mv(b), k: it.k });
  }
  const box: Content['box'] = ax === 0 ? [c.box[0], c.box[1], c.box[2] - shift, c.box[3]] : [c.box[0], c.box[1], c.box[2], c.box[3] - shift];
  // two break lines at the edges of the gap
  const zig = (pos: number): Seg[] => {
    const lo2 = ax === 0 ? box[1] : box[0], hi2 = ax === 0 ? box[3] : box[2], n = 8, out: Seg[] = [], amp = 0.8 / s;
    let prev: Pt = ax === 0 ? [pos, lo2] : [lo2, pos];
    for (let i = 1; i <= n; i++) { const t = lo2 + ((hi2 - lo2) * i) / n, off = br.style === 'straight' ? 0 : i % 2 ? amp : -amp, q: Pt = ax === 0 ? [pos + off, t] : [t, pos + off]; out.push([prev[0], prev[1], q[0], q[1]]); prev = q; }
    return out;
  };
  for (const pos of [lo, lo + gap]) for (const z of zig(pos)) items.push({ s: z, k: 'z' });
  return { ...c, items, box };
}

// ---------- placing views, dimensions and symbols ----------
const dashFor = (k: string): number[] | undefined => (k === 'h' ? [1.6, 1] : k === 'xd' ? [2.2, 1] : undefined);

function viewSnaps(c: Content, id: string, T: (u: number, v: number) => Pt, showHidden: boolean, circles: Circ[]): Snap[] {
  const seen = new Set<string>(), out: Snap[] = [], add = (u: number, v: number, kind: Snap['kind'], r?: number) => { const k = `${Math.round(u * 20)},${Math.round(v * 20)},${kind}`; if (seen.has(k) || out.length > 4000) return; seen.add(k); const p = T(u, v); out.push({ view: id, u, v, x: p[0], y: p[1], kind, r }); };
  for (const it of c.items) if (it.k === 'v' || it.k === 'c' || (showHidden && it.k === 'h')) { add(it.s[0], it.s[1], 'end'); add(it.s[2], it.s[3], 'end'); if (segLen(it.s) > 0) add((it.s[0] + it.s[2]) / 2, (it.s[1] + it.s[3]) / 2, 'mid'); }
  for (const ci of circles) { add(ci.cx, ci.cy, 'center', ci.r); for (let k = 0; k < 4; k++) add(ci.cx + ci.r * Math.cos(k * Math.PI / 2), ci.cy + ci.r * Math.sin(k * Math.PI / 2), 'arc', ci.r); }
  return out;
}

function fmtVal(mm: number, dd: DrawingDoc, prec?: number): string {
  const inch = dd.units === 'in', val = inch ? mm / 25.4 : mm, p = prec ?? (inch ? Math.max(dd.prec, 2) : dd.prec);
  return val.toFixed(Math.max(0, p));
}
function dimString(mm: number, d: Extract<Ann, { t: 'dim' }>, dd: DrawingDoc, pre = ''): { main: string; up?: string; lo?: string; box?: boolean } {
  const base = `${d.prefix ?? ''}${pre}${fmtVal(mm, dd, d.prec)}${d.suffix ?? ''}`, tol: Tol | undefined = d.tol;
  let main = d.text !== undefined && d.text !== '' ? d.text.replace('<DIM>', fmtVal(mm, dd, d.prec)) : base;
  if (dd.dual) main += `  [${dd.units === 'mm' ? (mm / 25.4).toFixed(2) : (mm).toFixed(1)}]`;
  if (!tol || tol.type === 'none') return { main: d.ref ? `(${main})` : main };
  const f = (x: number) => fmtVal(Math.abs(x), dd, d.prec ?? dd.prec + 1);
  switch (tol.type) {
    case 'basic': return { main, box: true };
    case 'ref': return { main: `(${main})` };
    case 'symmetric': return { main: `${main} ±${f(tol.plus)}` };
    case 'bilateral': return { main, up: `${tol.plus >= 0 ? '+' : '-'}${f(tol.plus)}`, lo: `${tol.minus >= 0 ? '+' : '-'}${f(tol.minus)}` };
    case 'limit': { const hi = mm + tol.plus, lo = mm - Math.abs(tol.minus); return { main: '', up: `${pre}${fmtVal(hi, dd, d.prec ?? dd.prec + 1)}`, lo: `${pre}${fmtVal(lo, dd, d.prec ?? dd.prec + 1)}` }; }
    case 'fit': return { main: `${main} ${tol.fit ?? 'H7'}` };
  }
  return { main };
}

function drawDimText(out: Prim[], p: Pt, ds: ReturnType<typeof dimString>, size: number, rot = 0, anchor: 'start' | 'middle' | 'end' = 'middle') {
  const L: Layer = 'dim', w = (ds.main.length + (ds.up ? 4 : 0)) * size * 0.58;
  if (ds.box) { const x0 = p[0] - w / 2 - 1, y0 = p[1] - size * 1.05; out.push({ k: 'p', pts: [[x0, y0], [x0 + w + 2, y0], [x0 + w + 2, y0 + size * 1.5], [x0, y0 + size * 1.5]], closed: true, w: 0.25, layer: L }); }
  if (ds.up !== undefined && ds.main === '') { text(out, [p[0], p[1] - size * 0.25], ds.up, size, L, anchor, rot); text(out, [p[0], p[1] + size * 0.95], ds.lo ?? '', size, L, anchor, rot); return; }
  text(out, [p[0] - (ds.up ? size * 0.9 : 0) * Math.cos((rot * Math.PI) / 180), p[1] - (ds.up ? size * 0.9 : 0) * Math.sin((rot * Math.PI) / 180)], ds.main, size, L, anchor, rot);
  if (ds.up) { const tx = p[0] + (ds.main.length * size * 0.29), sz = size * 0.62; text(out, [tx, p[1] - size * 0.55], ds.up, sz, L, 'start', rot); text(out, [tx, p[1] + size * 0.2], ds.lo ?? '', sz, L, 'start', rot); }
}

function drawDim(out: Prim[], d: Extract<Ann, { t: 'dim' }>, T: (u: number, v: number) => Pt, s: number, dd: DrawingDoc) {
  const L: Layer = 'dim', ar = d.arrow ?? dd.arrow, ts = dd.textH, A = T(d.a[0], d.a[1]), B = T(d.b[0], d.b[1]), Pp = T(d.p[0], d.p[1]);
  const ln = (a: Pt, b: Pt, w = 0.25) => line(out, a, b, L, w), ah = (p: Pt, dx: number, dy: number) => arrowhead(out, p, dx, dy, ar, L, ts * 0.8);
  const ansi = dd.std === 'ansi';
  if (d.kind === 'hor' || d.kind === 'ver' || d.kind === 'ali' || d.kind === 'ord') {
    let mm: number, a1: Pt, b1: Pt, ux: number, uy: number, nx: number, ny: number;
    if (d.kind === 'hor') { mm = Math.abs(d.b[0] - d.a[0]); a1 = [A[0], Pp[1]]; b1 = [B[0], Pp[1]]; ux = 1; uy = 0; nx = 0; ny = Pp[1] >= (A[1] + B[1]) / 2 ? 1 : -1; }
    else if (d.kind === 'ver') { mm = Math.abs(d.b[1] - d.a[1]); a1 = [Pp[0], A[1]]; b1 = [Pp[0], B[1]]; ux = 0; uy = 1; nx = Pp[0] >= (A[0] + B[0]) / 2 ? 1 : -1; ny = 0; }
    else if (d.kind === 'ord') {
      const o = d.org ?? [0, 0], horizontal = Math.abs(Pp[1] - A[1]) >= Math.abs(Pp[0] - A[0]), O = T(o[0], o[1]);
      mm = horizontal ? Math.abs(d.a[0] - o[0]) : Math.abs(d.a[1] - o[1]);
      const ds = dimString(mm, d, dd), ex: Pt = horizontal ? [A[0], Pp[1]] : [Pp[0], A[1]];
      ln([A[0] + (horizontal ? 0 : Math.sign(Pp[0] - A[0]) * 1.2), A[1] + (horizontal ? Math.sign(Pp[1] - A[1]) * 1.2 : 0)], ex, 0.25);
      void O; if (horizontal) drawDimText(out, [ex[0], ex[1] - ts * 0.35 * Math.sign(Pp[1] - A[1] || 1) - (Pp[1] > A[1] ? -ts : 0)], ds, ts, -90, 'middle'); else drawDimText(out, [ex[0] + (Pp[0] > A[0] ? 1.2 : -1.2), ex[1] - 0.8], ds, ts, 0, Pp[0] > A[0] ? 'start' : 'end');
      return;
    } else {
      const dx = B[0] - A[0], dy = B[1] - A[1], L2 = Math.hypot(dx, dy) || 1; ux = dx / L2; uy = dy / L2; mm = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]);
      let n: Pt = [-uy, ux]; if ((Pp[0] - A[0]) * n[0] + (Pp[1] - A[1]) * n[1] < 0) n = [-n[0], -n[1]]; nx = n[0]; ny = n[1]; const off = (Pp[0] - A[0]) * nx + (Pp[1] - A[1]) * ny; a1 = [A[0] + nx * off, A[1] + ny * off]; b1 = [B[0] + nx * off, B[1] + ny * off];
    }
    // extension lines from the points to the dimension line, then the line, arrows and text
    const gap = 1.2, over = 1.8;
    for (const [P0, P1] of [[A, a1], [B, b1]] as [Pt, Pt][]) { const dl = Math.hypot(P1[0] - P0[0], P1[1] - P0[1]); if (dl > gap) { const ex = (P1[0] - P0[0]) / dl, ey = (P1[1] - P0[1]) / dl; ln([P0[0] + ex * gap, P0[1] + ey * gap], [P1[0] + ex * over, P1[1] + ey * over]); } }
    const dl = Math.hypot(b1[0] - a1[0], b1[1] - a1[1]), tx = dl > 1e-6 ? (b1[0] - a1[0]) / dl : 1, ty = dl > 1e-6 ? (b1[1] - a1[1]) / dl : 0, ds = dimString(mm, d, dd), mid: Pt = [(a1[0] + b1[0]) / 2, (a1[1] + b1[1]) / 2];
    const tw = (ds.main.length + (ds.up ? 4 : 0)) * ts * 0.58, fits = dl > tw + ts * 3.2;
    let rot = (Math.atan2(ty, tx) * 180) / Math.PI; if (rot > 90) rot -= 180; if (rot <= -90) rot += 180;
    if (fits) { ln(a1, b1, 0.3); ah(a1, -tx, -ty); ah(b1, tx, ty); } else { ln([a1[0] - tx * 4, a1[1] - ty * 4], [b1[0] + tx * 4, b1[1] + ty * 4], 0.3); ah(a1, tx, ty); ah(b1, -tx, -ty); }
    const horiz = Math.abs(ty) < 0.7;
    if (ansi && !horiz) { const ang = (rot * Math.PI) / 180; void ang; drawDimText(out, [mid[0] - ts * 0.35, mid[1]], ds, ts, -90, 'middle'); }
    else if (ansi) drawDimText(out, [mid[0], mid[1] - ts * 0.4], ds, ts, 0);
    else { const o = ts * 0.55, px = -ty, py = tx; drawDimText(out, [mid[0] + (rot === -90 ? -1 : 1) * 0, mid[1] - o * Math.abs(px) * 0 - o], ds, ts, rot); void py; }
    return;
  }
  if (d.kind === 'dia' || d.kind === 'rad') {
    const r = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]), C = A, R = r * s, ex = Pp[0] - C[0], ey = Pp[1] - C[1], el = Math.hypot(ex, ey) || 1, ux = ex / el, uy = ey / el, ds = dimString(d.kind === 'dia' ? 2 * r : r, d, dd, d.kind === 'dia' ? 'Ø' : 'R');
    const near: Pt = [C[0] + ux * R, C[1] + uy * R], far: Pt = [C[0] - ux * R, C[1] - uy * R];
    if (d.kind === 'dia') { ln(far, el > R ? Pp : near, 0.3); ah(far, ux, uy); ah(near, -ux, -uy); if (el <= R) { /* leader inside */ } }
    else { ln(C, el > R ? Pp : near, 0.3); ah(near, -ux, -uy); }
    const tp: Pt = el > R ? [Pp[0] + ux * 1.2, Pp[1] + uy * 1.2 - 0.6] : [C[0] + ux * R * 0.5, C[1] + uy * R * 0.5 - 1]; drawDimText(out, tp, ds, ts, 0, ux >= 0 ? 'start' : 'end');
    if (el > R) ln(Pp, [Pp[0] + (ux >= 0 ? 1 : -1) * (ds.main.length * ts * 0.6 + 2.4), Pp[1]], 0.25);
    return;
  }
  if (d.kind === 'ang' && d.c) {
    const V = T(d.c[0], d.c[1]), a0 = Math.atan2(A[1] - V[1], A[0] - V[0]), a1 = Math.atan2(B[1] - V[1], B[0] - V[0]), rr = Math.max(4, Math.hypot(Pp[0] - V[0], Pp[1] - V[1]));
    let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    const deg = (Math.abs(da) * 180) / Math.PI, ds = { main: `${deg.toFixed(d.prec ?? 1)}°` };
    for (const q of [A, B]) { const dl = Math.hypot(q[0] - V[0], q[1] - V[1]) || 1, ux = (q[0] - V[0]) / dl, uy = (q[1] - V[1]) / dl; ln([V[0] + ux * Math.min(dl * 0.15, 2) + ux * 0, V[1] + uy * Math.min(dl * 0.15, 2)], [V[0] + ux * (Math.max(rr, dl) + 1.8), V[1] + uy * (Math.max(rr, dl) + 1.8)]); }
    const n = 14, pts: Pt[] = []; for (let i = 0; i <= n; i++) { const a = a0 + (da * i) / n; pts.push([V[0] + rr * Math.cos(a), V[1] + rr * Math.sin(a)]); }
    poly(out, pts, L, 0.3); const sg = Math.sign(da) || 1;
    ah(pts[0], Math.sin(a0) * sg * -1 * -1, -Math.cos(a0) * sg * -1 * -1 * -1); ah(pts[n], -(-Math.sin(a1) * sg), -(Math.cos(a1) * sg));
    const am = a0 + da / 2; drawDimText(out, [V[0] + (rr + 3.6) * Math.cos(am), V[1] + (rr + 3.6) * Math.sin(am)], ds, ts, 0);
    return;
  }
  if (d.kind === 'chamfer') {
    const dx = Math.abs(d.b[0] - d.a[0]), dy = Math.abs(d.b[1] - d.a[1]), eq = Math.abs(dx - dy) < Math.max(dx, dy) * 0.03, txt = eq ? `${fmtVal(dx, dd, d.prec)} × 45°` : `${fmtVal(dx, dd, d.prec)} × ${fmtVal(dy, dd, d.prec)}`, mid: Pt = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    const dl = Math.hypot(Pp[0] - mid[0], Pp[1] - mid[1]) || 1; ln(mid, Pp, 0.3); ah(mid, -(Pp[0] - mid[0]) / dl, -(Pp[1] - mid[1]) / dl);
    ln(Pp, [Pp[0] + (Pp[0] >= mid[0] ? 1 : -1) * (txt.length * ts * 0.6 + 2), Pp[1]], 0.25); text(out, [Pp[0] + (Pp[0] >= mid[0] ? 1 : -1) * 1, Pp[1] - 0.8], d.text || txt, ts, L, Pp[0] >= mid[0] ? 'start' : 'end');
  }
}

// ---------- sheet frame and title block ----------
export function sheetFactor(page: [number, number]): number { return Math.max(0.7, Math.min(1.6, Math.sqrt((page[0] * page[1]) / (420 * 297)))); }
function drawFrame(out: Prim[], page: [number, number], dd: DrawingDoc, sh: Sheet, idx: number, ctx: Ctx, scale: number): { tb: [number, number, number, number]; area: [number, number, number, number] } {
  const [W, H] = page, k = sheetFactor(page), M = 10, L: Layer = 'frm', P = dd.props;
  if (dd.border) { poly(out, [[M, M], [W - M, M], [W - M, H - M], [M, H - M]], L, 0.7, true);
    if (dd.zones) {
      const nx = Math.max(4, Math.round((W - 2 * M) / 52)), ny = Math.max(3, Math.round((H - 2 * M) / 52)), cw = (W - 2 * M) / nx, ch = (H - 2 * M) / ny;
      for (let i = 0; i <= nx; i++) { const x = M + i * cw; if (i > 0 && i < nx) { line(out, [x, M - 5], [x, M], L, 0.25); line(out, [x, H - M], [x, H - M + 5], L, 0.25); } if (i < nx) { text(out, [x + cw / 2, M - 1.6], `${i + 1}`, 2.6, L); text(out, [x + cw / 2, H - M + 4], `${i + 1}`, 2.6, L); } }
      for (let j = 0; j <= ny; j++) { const y = M + j * ch; if (j > 0 && j < ny) { line(out, [M - 5, y], [M, y], L, 0.25); line(out, [W - M, y], [W - M + 5, y], L, 0.25); } if (j < ny) { const lab = String.fromCharCode(65 + j); text(out, [M - 2.4, y + ch / 2 + 1], lab, 2.6, L); text(out, [W - M + 2.6, y + ch / 2 + 1], lab, 2.6, L); } }
    }
  }
  const bw = 180 * k, bh = 52 * k, bx = W - M - bw, by = H - M - bh, tb: [number, number, number, number] = [bx - 34 * k, by, W - M, H - M], area: [number, number, number, number] = [M + 4, M + 4, W - M - 4, dd.titleBlock ? by - 4 : H - M - 4];
  if (!dd.titleBlock) return { tb: [W, H, W, H], area };
  const cell = (x: number, y: number, w: number, h: number, label: string, val: string, size = 3.4) => {
    poly(out, [[bx + x * k, by + y * k], [bx + (x + w) * k, by + y * k], [bx + (x + w) * k, by + (y + h) * k], [bx + x * k, by + (y + h) * k]], L, 0.35, true);
    text(out, [bx + (x + 1.2) * k, by + (y + 3.2) * k], label, 2 * k, L, 'start'); text(out, [bx + (x + 1.8) * k, by + (y + h - 2.6) * k], val, Math.min(size, ((w - 3) * 1.55) / Math.max(4, val.length)) * k, L, 'start', 0, true);
  };
  const wt = P.weight === '' || P.weight === 'auto' ? `${num(ctx.mass)} kg` : P.weight;
  cell(0, 0, 110, 26, 'TITLE', (P.title || ctx.doc.name).toUpperCase(), 6); cell(110, 0, 70, 13, 'COMPANY', P.company);
  cell(110, 13, 45, 13, 'DRAWING NO.', P.drawingNo || P.partNo); cell(155, 13, 25, 13, 'REV', P.revision);
  cell(0, 26, 45, 13, 'MATERIAL', ctx.material); cell(45, 26, 45, 13, 'FINISH', P.finish); cell(90, 26, 30, 13, 'MASS', wt); cell(120, 26, 30, 13, 'SCALE', scaleText(scale));
  const pg = PAPERS.find(q => q.w === Math.max(W, H) && q.h === Math.min(W, H))?.label ?? 'CUSTOM'; cell(150, 26, 15, 13, 'SIZE', pg.replace('ISO ', '')); cell(165, 26, 15, 13, 'UNITS', dd.units === 'mm' ? 'mm' : 'in');
  cell(0, 39, 40, 13, 'DRAWN', P.drawnBy || 'UNIBUILD CAD'); cell(40, 39, 40, 13, 'CHECKED', P.checkedBy); cell(80, 39, 40, 13, 'APPROVED', P.approvedBy); cell(120, 39, 30, 13, 'DATE', ctx.date); cell(150, 39, 30, 13, 'SHEET', `${idx + 1} / ${dd.sheets.length}`);
  text(out, [bx + 0.5 * k, by - 1.4 * k], `${P.tolerance}`, 2.2 * k, L, 'start');
  // projection symbol: two views of a truncated cone, in the standard order of each system
  const px = bx - 32 * k, py = by + 6 * k, sw = 30 * k, sh2 = 28 * k;
  poly(out, [[px, py - 6 * k], [px + sw, py - 6 * k], [px + sw, py + sh2 - 6 * k], [px, py + sh2 - 6 * k]], L, 0.35, true); text(out, [px + sw / 2, py - 3 * k], dd.projection === 'third' ? 'THIRD ANGLE' : 'FIRST ANGLE', 1.9 * k, L);
  const cone = (cx: number, cy: number, front: boolean) => { if (front) { poly(out, [[cx - 6 * k, cy + 4 * k], [cx + 6 * k, cy + 4 * k], [cx + 3.4 * k, cy - 4 * k], [cx - 3.4 * k, cy - 4 * k]], L, 0.3, true); } else { circle(out, [cx, cy], 6 * k, L, 0.3); circle(out, [cx, cy], 3.4 * k, L, 0.3); } };
  if (dd.projection === 'third') { cone(px + 8 * k, py + 12 * k, true); cone(px + 22 * k, py + 12 * k, false); } else { cone(px + 8 * k, py + 12 * k, false); cone(px + 22 * k, py + 12 * k, true); }
  void sh;
  return { tb, area };
}

// ---------- the sheet ----------
const SYMBOL_ROWS: Record<string, { title: string; rows: string[][] }> = {
  gentol: { title: 'GENERAL TOLERANCES  ISO 2768-m', rows: [['RANGE mm', 'LINEAR ±'], ['0.5 to 3', '0.1'], ['over 3 to 6', '0.1'], ['over 6 to 30', '0.2'], ['over 30 to 120', '0.3'], ['over 120 to 400', '0.5'], ['over 400 to 1000', '0.8']] },
  notes: { title: 'NOTES', rows: [['1. ALL DIMENSIONS IN MILLIMETRES'], ['2. BREAK SHARP EDGES 0.3 MAX'], ['3. REMOVE ALL BURRS'], ['4. DO NOT SCALE THE DRAWING']] },
  finish: { title: 'SURFACE FINISH', rows: [['ALL SURFACES Ra 3.2 UNLESS STATED']] },
  edges: { title: 'UNLESS STATED', rows: [['INTERNAL FILLETS R2'], ['EXTERNAL EDGES 1 x 45° CHAMFER']] },
};
export function resolveSheetScale(sh: Sheet): number { return sh.scale > 0 ? sh.scale : 1; }
export function bboxOfPrims(ps: Prim[]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; const pt = (x: number, y: number) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
  for (const p of ps) { if (p.k === 'l') { pt(...p.a); pt(...p.b); } else if (p.k === 'p') p.pts.forEach(q => pt(q[0], q[1])); else if (p.k === 'c' || p.k === 'a') { pt(p.c[0] - p.r, p.c[1] - p.r); pt(p.c[0] + p.r, p.c[1] + p.r); } else if (p.k === 't') { const w = p.s.length * p.size * 0.58; pt(p.anchor === 'end' ? p.p[0] - w : p.anchor === 'start' ? p.p[0] : p.p[0] - w / 2, p.p[1] - p.size); pt(p.anchor === 'end' ? p.p[0] : p.anchor === 'start' ? p.p[0] + w : p.p[0] + w / 2, p.p[1] + p.size * 0.3); } else if (p.k === 'i') { pt(p.p[0], p.p[1]); pt(p.p[0] + p.w, p.p[1] + p.h); } }
  return [x0, y0, x1, y1];
}

export function renderDrawing(dd: DrawingDoc, sheetIndex: number, ctx: Ctx): Rendered {
  const sh = dd.sheets[Math.max(0, Math.min(sheetIndex, dd.sheets.length - 1))], page = pageMm(sh.size), out: Prim[] = [], k = sheetFactor(page), sheetScale = resolveSheetScale(sh);
  const { tb, area } = drawFrame(out, page, dd, sh, sheetIndex, ctx, sheetScale), views = sh.views, infos: ViewInfo[] = [], snaps: Snap[] = [], circles: CircleInfo[] = [], hits: Hit[] = [];
  const byId = new Map<string, ViewInfo>(), contents = new Map<string, Content>();
  // 1. content and placement of every view
  for (const v of views) {
    const c = contentOf(v, views, dd, ctx, sheetScale), s = v.scale ?? sheetScale, uc = (c.box[0] + c.box[2]) / 2, vc = (c.box[1] + c.box[3]) / 2, w = (c.box[2] - c.box[0]) * s, h = (c.box[3] - c.box[1]) * s;
    const nameBase = v.kind === 'section' ? `SECTION ${v.letter ?? 'A'}–${v.letter ?? 'A'}` : v.kind === 'detail' ? `DETAIL ${v.letter ?? 'B'}` : v.kind === 'aux' ? `VIEW ${v.letter ?? 'C'}` : v.kind === 'proj' ? 'PROJECTED VIEW' : `${VIEW_NAMES[v.kind as NamedView] ?? ''} VIEW`;
    const label = v.label ?? nameBase, info: ViewInfo = { id: v.id, kind: v.kind, label, cx: v.cx, cy: v.cy, uc, vc, s, box: c.box, sheetBox: [v.cx - w / 2, v.cy - h / 2, v.cx + w / 2, v.cy + h / 2], cam: c.cam, parent: v.parent };
    infos.push(info); byId.set(v.id, info); contents.set(v.id, c);
  }
  const Tof = (id: string) => { const i = byId.get(id)!; return (u: number, v: number): Pt => [i.cx + (u - i.uc) * i.s, i.cy - (v - i.vc) * i.s]; };
  // 2. emit views
  for (const v of views) {
    const i = byId.get(v.id)!, c = contents.get(v.id)!, T = Tof(v.id), s = i.s, i0 = out.length, hidden = v.display === 'hlv' || v.display === 'wire';
    let drewImage = false;
    if ((v.display === 'shaded' || v.display === 'edges') && c.model && ctx.images !== false) {
      const wmm = (c.box[2] - c.box[0]) * s, hmm = (c.box[3] - c.box[1]) * s; let ppm = 8; const mx = Math.max(wmm, hmm); if (mx * ppm > 2400) ppm = 2400 / mx;
      const pad = 6, url = paintMeshURL(ctx.mesh, qFromCam(c.cam), Math.max(8, Math.round(wmm * ppm + 2 * pad)), Math.max(8, Math.round(hmm * ppm + 2 * pad)), ctx.color ?? '#cfd3d8', ctx.shine ?? 0.7, 1, pad, v.display === 'edges');
      if (url) { const iw = wmm + (2 * pad) / ppm, ih = hmm + (2 * pad) / ppm; out.push({ k: 'i', href: url, p: [v.cx - iw / 2, v.cy - ih / 2], w: iw, h: ih, layer: 'img' }); drewImage = true; }
    }
    const showV = v.display !== 'shaded' || !drewImage, showEdges = !(drewImage && v.display === 'shaded');
    void showV;
    for (const it of c.items) {
      const a = T(it.s[0], it.s[1]), b = T(it.s[2], it.s[3]);
      if (it.k === 'v') { if (showEdges || v.display === 'edges') line(out, a, b, 'vis', 0.5); }
      else if (it.k === 'h') { if (hidden) line(out, a, b, 'hid', v.display === 'wire' ? 0.3 : 0.22, v.display === 'wire' ? undefined : [1.6, 1], '#555a60'); }
      else if (it.k === 'c') line(out, a, b, 'vis', 0.55);
      else if (it.k === 'z') line(out, a, b, 'vis', 0.3);
      else line(out, a, b, 'hat', 0.16, dashFor(it.k));
    }
    // centre marks of the round features seen in this view
    let circs: Circ[] = [];
    circs = circlesFor(ctx.mesh, c.cam).filter(q => q.cx - q.r >= c.box[0] - 1e-6 && q.cx + q.r <= c.box[2] + 1e-6 && q.cy - q.r >= c.box[1] - 1e-6 && q.cy + q.r <= c.box[3] + 1e-6 || (v.kind === 'detail' && Math.hypot(q.cx - (c.box[0] + c.box[2]) / 2, q.cy - (c.box[1] + c.box[3]) / 2) < (c.box[2] - c.box[0]) / 2));
    if (!c.model && v.kind === 'section' && v.cut) circs = circs.filter(q => true);
    if (v.breaks || v.crop) circs = [];
    c.circles = circs;
    if (v.marks) for (const ci of circs) if (ci.full && ci.r * s >= 0.9) { const C = T(ci.cx, ci.cy), r = ci.r * s, e = r + 2.2; line(out, [C[0] - e, C[1]], [C[0] + e, C[1]], 'cen', 0.18, [5, 1, 1, 1], '#b02020'); line(out, [C[0], C[1] - e], [C[0], C[1] + e], 'cen', 0.18, [5, 1, 1, 1], '#b02020'); }
    for (const ci of circs) { const C = T(ci.cx, ci.cy); circles.push({ view: v.id, c: ci, x: C[0], y: C[1], r: ci.r * s }); }
    snaps.push(...viewSnaps(c, v.id, T, hidden, circs));
    if (v.showLabel) text(out, [v.cx, i.sheetBox[3] + 8.5], `${i.label}${v.showScale && (v.kind === 'section' || v.kind === 'detail' || v.scale !== null) ? `  ( ${scaleText(s)} )` : ''}`, 3.6, 'frm' === 'frm' ? 'note' : 'note', 'middle', 0, true);
    hits.push({ id: v.id, kind: 'view', box: i.sheetBox });
    void i0;
  }
  // 3. marks on parent views: cutting-plane lines, detail circles, auxiliary arrows
  for (const v of views) {
    const par = v.parent ? byId.get(v.parent) : undefined; if (!par) continue; const T = Tof(par.id), pc = par.cam, i = byId.get(v.id)!;
    if (v.kind === 'section' && v.cut) {
      const e = v.cut.axis === 'x' ? ([1, 0, 0] as V3) : v.cut.axis === 'y' ? ([0, 1, 0] as V3) : ([0, 0, 1] as V3), eu = dot(e, pc.right), ev = dot(e, pc.up), L = 'sym' as Layer, look = sectionCam(v.cut).fwd, ar = 5, ext = 6 / par.s;
      const draw = (pos: number, from: number, to: number) => {
        if (Math.abs(ev) > 0.9) { const vv = pos * ev; return [T(from, vv), T(to, vv)] as [Pt, Pt]; }
        if (Math.abs(eu) > 0.9) { const uu = pos * eu; return [T(uu, from), T(uu, to)] as [Pt, Pt]; }
        return null;
      };
      const horiz = Math.abs(ev) > 0.9, lo = horiz ? par.box[0] - ext : par.box[1] - ext, hi = horiz ? par.box[2] + ext : par.box[3] + ext, ctr = v.cut.split ?? (horiz ? (par.box[0] + par.box[2]) / 2 : (par.box[1] + par.box[3]) / 2);
      const segs: [Pt, Pt][] = []; const first = v.cut.kind === 'offset' && v.cut.pos2 !== undefined ? [draw(v.cut.pos, lo, ctr), draw(v.cut.pos2, ctr, hi)] : [draw(v.cut.pos, lo, hi)];
      for (const q of first) if (q) segs.push(q);
      if (segs.length) {
        const fl = segs[0][0], tl = segs[segs.length - 1][1];
        for (const [a, b] of segs) line(out, a, b, L, 0.5, [7, 1.5, 1.5, 1.5]);
        if (segs.length === 2) line(out, segs[0][1], segs[1][0], L, 0.5, [7, 1.5, 1.5, 1.5]);
        const lx = dot(look, pc.right), ly = dot(look, pc.up), ll = Math.hypot(lx, ly) || 1, ax = lx / ll, ay = -ly / ll;   // arrow direction on the sheet (y down)
        for (const [P, dirOut] of [[fl, -1], [tl, 1]] as [Pt, number][]) { void dirOut; line(out, P, [P[0] + ax * ar, P[1] + ay * ar], L, 0.4); arrowhead(out, [P[0] + ax * ar, P[1] + ay * ar], ax, ay, 'filled', L, 2.4); text(out, [P[0] - ax * 3.2 * 0 + (horiz ? 0 : -3.6 * (ax >= 0 ? 1 : -1) * -1), P[1] + (horiz ? -3 * (ay >= 0 ? -1 : 1) * -1 : 1.2)], v.letter ?? 'A', 3.6, L, 'middle', 0, true); }
      }
    }
    if (v.kind === 'detail' && v.detail) {
      const d = v.detail, C = T(d.u, d.v), r = d.r * par.s, L = 'sym' as Layer;
      if (d.round) circle(out, C, r, L, 0.3); else poly(out, [[C[0] - r, C[1] - r], [C[0] + r, C[1] - r], [C[0] + r, C[1] + r], [C[0] - r, C[1] + r]], L, 0.3, true);
      text(out, [C[0] + r * 0.72 + 2, C[1] - r * 0.72 - 1], v.letter ?? 'B', 3.6, L, 'start', 0, true);
    }
    if (v.kind === 'aux' && v.aux) {
      const a = T(v.aux.a[0], v.aux.a[1]), b = T(v.aux.b[0], v.aux.b[1]), L = 'sym' as Layer, mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const dir = i.cam.fwd, ux = -dot(dir, pc.right), uy = dot(dir, pc.up), ul = Math.hypot(ux, uy) || 1, ax = ux / ul, ay = uy / ul;   // pointing at the edge from outside
      const P: Pt = [mid[0] - ax * 12, mid[1] - ay * 12]; line(out, P, [mid[0] - ax * 2, mid[1] - ay * 2], L, 0.4); arrowhead(out, [mid[0] - ax * 2, mid[1] - ay * 2], ax, ay, 'filled', L, 2.6); text(out, [P[0] - ax * 3, P[1] - ay * 3 + 1.2], v.letter ?? 'C', 3.6, L, 'middle', 0, true);
    }
  }
  // 4. annotations
  for (const an of sh.anns) {
    const i0 = out.length, vw = 'view' in an && an.view ? byId.get(an.view) : undefined, T = vw ? Tof(vw.id) : null, ts = dd.textH;
    const P = (p: [number, number]): Pt => (T ? T(p[0], p[1]) : [p[0], p[1]]);
    switch (an.t) {
      case 'dim': if (T && vw) drawDim(out, an, T, vw.s, dd); break;
      case 'note': { const at = P(an.at), lines = an.text.split('\n'), sz = an.size || ts, w = Math.max(...lines.map(l => l.length)) * sz * 0.58 + 3;
        if (an.target) { const tg = P(an.target), dl = Math.hypot(tg[0] - at[0], tg[1] - at[1]) || 1; line(out, at, tg, 'note', 0.25); arrowhead(out, tg, (tg[0] - at[0]) / dl, (tg[1] - at[1]) / dl, 'filled', 'note', 2.4); }
        lines.forEach((l, j) => text(out, [at[0] + 1.5, at[1] + sz + j * sz * 1.25], l, sz, 'note', 'start'));
        if (an.box === 'box') poly(out, [[at[0], at[1]], [at[0] + w, at[1]], [at[0] + w, at[1] + lines.length * sz * 1.25 + 1.5], [at[0], at[1] + lines.length * sz * 1.25 + 1.5]], 'note', 0.3, true);
        if (an.box === 'circle') circle(out, [at[0] + w / 2, at[1] + (lines.length * sz * 1.25) / 2 + 0.8], Math.max(w, lines.length * sz * 1.25) / 2 + 1, 'note', 0.3);
        break; }
      case 'balloon': { const at = P(an.at), tg = P(an.target), r = Math.max(4.2, an.text.length * 1.4 + 2.6), dl = Math.hypot(tg[0] - at[0], tg[1] - at[1]) || 1, ux = (tg[0] - at[0]) / dl, uy = (tg[1] - at[1]) / dl;
        balloonShape(out, at, an.shape, r); text(out, [at[0], at[1] + 1.3], an.text, 3.6, 'note', 'middle'); line(out, [at[0] + ux * r, at[1] + uy * r], tg, 'note', 0.25); arrowhead(out, tg, ux, uy, 'dot', 'note', 2.6); break; }
      case 'finish': { const at = P(an.at), tg = P(an.target); if (Math.hypot(tg[0] - at[0], tg[1] - at[1]) > 2) line(out, at, tg, 'sym', 0.2); finishSymbol(out, at, an.kind, an.text, 3); break; }
      case 'weld': weldSymbol(out, P(an.at), P(an.target), an.type, an.size, an.length, an.around, an.field, an.other, 3); break;
      case 'gdt': { const at = P(an.at), tg = P(an.target); const fr = gdtFrame(out, at, an.sym, an.tol, an.mod, an.datums, an.dia, 3.2); void fr; const dl = Math.hypot(tg[0] - at[0], tg[1] - at[1]) || 1; line(out, at, tg, 'sym', 0.25); arrowhead(out, tg, (tg[0] - at[0]) / dl, (tg[1] - at[1]) / dl, 'filled', 'sym', 2.4); break; }
      case 'datum': { const at = P(an.at), tg = P(an.target), s2 = 5.4; poly(out, [[at[0] - s2 / 2, at[1] - s2 / 2], [at[0] + s2 / 2, at[1] - s2 / 2], [at[0] + s2 / 2, at[1] + s2 / 2], [at[0] - s2 / 2, at[1] + s2 / 2]], 'sym', 0.35, true); text(out, [at[0], at[1] + 1.4], an.letter, 3.8, 'sym', 'middle', 0, true);
        const dl = Math.hypot(tg[0] - at[0], tg[1] - at[1]) || 1, ux = (tg[0] - at[0]) / dl, uy = (tg[1] - at[1]) / dl, st: Pt = [at[0] + ux * (s2 / 2), at[1] + uy * (s2 / 2)]; line(out, st, [tg[0] - ux * 3, tg[1] - uy * 3], 'sym', 0.3); arrowhead(out, tg, ux, uy, 'filled', 'sym', 3); break; }
      case 'dtarget': { const at = P(an.at), tg = P(an.target); circle(out, at, 4.2, 'sym', 0.3); line(out, [at[0] - 4.2, at[1]], [at[0] + 4.2, at[1]], 'sym', 0.3); text(out, [at[0], at[1] - 0.8], an.letter, 2.8, 'sym', 'middle'); text(out, [at[0], at[1] + 3.1], an.n, 2.8, 'sym', 'middle'); const dl = Math.hypot(tg[0] - at[0], tg[1] - at[1]) || 1; line(out, [at[0] + ((tg[0] - at[0]) / dl) * 4.2, at[1] + ((tg[1] - at[1]) / dl) * 4.2], tg, 'sym', 0.25); arrowhead(out, tg, (tg[0] - at[0]) / dl, (tg[1] - at[1]) / dl, 'dot', 'sym', 2.6); break; }
      case 'cmark': { const C = P(an.c), r = an.r * (vw?.s ?? 1), e = r + 2.2; line(out, [C[0] - e, C[1]], [C[0] + e, C[1]], 'cen', 0.18, [5, 1, 1, 1], '#b02020'); line(out, [C[0], C[1] - e], [C[0], C[1] + e], 'cen', 0.18, [5, 1, 1, 1], '#b02020'); break; }
      case 'cline': { const a = P(an.a), b = P(an.b), dl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / dl, uy = (b[1] - a[1]) / dl; line(out, [a[0] - ux * 3, a[1] - uy * 3], [b[0] + ux * 3, b[1] + uy * 3], 'cen', 0.18, [8, 1.4, 1.2, 1.4], '#b02020'); break; }
      case 'hole': { const C = P(an.c), r = an.r * (vw?.s ?? 1), at = P(an.at), dl = Math.hypot(at[0] - C[0], at[1] - C[1]) || 1, ux = (at[0] - C[0]) / dl, uy = (at[1] - C[1]) / dl, edge: Pt = [C[0] + ux * r, C[1] + uy * r];
        line(out, edge, at, 'dim', 0.3); arrowhead(out, edge, -ux, -uy, dd.arrow, 'dim', ts * 0.8); const right = at[0] >= C[0]; line(out, at, [at[0] + (right ? 1 : -1) * (an.text.length * ts * 0.6 + 2), at[1]], 'dim', 0.25); text(out, [at[0] + (right ? 1 : -1) * 1, at[1] - 0.8], an.text, ts, 'dim', right ? 'start' : 'end'); break; }
      case 'thread': { const C = P(an.c), r = an.r * (vw?.s ?? 1), nr = an.nom * (vw?.s ?? 1), at = P(an.at), dl = Math.hypot(at[0] - C[0], at[1] - C[1]) || 1, ux = (at[0] - C[0]) / dl, uy = (at[1] - C[1]) / dl, edge: Pt = [C[0] + ux * nr, C[1] + uy * nr];
        out.push({ k: 'a', c: C, r: nr, a0: 0, a1: 270, w: 0.18, layer: 'cen' }); void r;   // cosmetic thread: three quarters of the major (or minor) circle
        line(out, edge, at, 'dim', 0.3); arrowhead(out, edge, -ux, -uy, dd.arrow, 'dim', ts * 0.8); const right = at[0] >= C[0]; line(out, at, [at[0] + (right ? 1 : -1) * (an.text.length * ts * 0.6 + 2), at[1]], 'dim', 0.25); text(out, [at[0] + (right ? 1 : -1) * 1, at[1] - 0.8], an.text, ts, 'dim', right ? 'start' : 'end'); break; }
      case 'geo': { for (const q of geoPrims(an)) out.push(q); break; }
      case 'dxf': { for (const q of placeDxf(an.prims, an.box, an.x, an.y, an.s)) out.push(q); break; }
      case 'symbol': { const rows = SYMBOL_ROWS[an.name]; if (rows) table(out, an.x, an.y, rows.rows, 2.8, true, rows.title); break; }
      case 'htable': { if (!vw) break; const cs = circlesInView(vw.id, circles).filter(q => q.c.full).sort((a, b) => a.c.cx - b.c.cx || a.c.cy - b.c.cy), st = an.style ?? 'xy', rows: string[][] = [st === 'group' ? ['TAGS', 'QTY', 'DIA'] : st === 'polar' ? ['TAG', 'R', 'ANGLE', 'DIA'] : ['TAG', 'X', 'Y', 'DIA']];
        if (st === 'group') { const g = new Map<string, string[]>(); cs.forEach((q, j) => { const d = fmtVal(2 * q.c.r, dd); g.set(d, [...(g.get(d) ?? []), `A${j + 1}`]); text(out, [q.x + q.r * 0.8 + 1, q.y - q.r * 0.8 - 0.6], `A${j + 1}`, 2.8, 'tbl', 'start', 0, true); }); for (const [d, tags] of g) rows.push([tags.join(','), String(tags.length), `Ø${d}`]); }
        else cs.forEach((q, j) => { const tag = `A${j + 1}`, dx = q.c.cx - an.org[0], dy = q.c.cy - an.org[1]; rows.push(st === 'polar' ? [tag, fmtVal(Math.hypot(dx, dy), dd), `${Math.round(((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360 * 10) / 10}°`, `Ø${fmtVal(2 * q.c.r, dd)}`] : [tag, fmtVal(dx, dd), fmtVal(dy, dd), `Ø${fmtVal(2 * q.c.r, dd)}`]); text(out, [q.x + q.r * 0.8 + 1, q.y - q.r * 0.8 - 0.6], tag, 2.8, 'tbl', 'start', 0, true); });
        table(out, an.x, an.y, rows, 2.8, true, 'HOLE TABLE'); break; }
      case 'bom': { const nm = ctx.doc.name, rows = ctx.bom?.length ? [['ITEM', 'PART NO.', 'DESCRIPTION', 'MATERIAL', 'QTY', 'MASS'], ...ctx.bom.map(b => [String(b.item), b.name.toUpperCase().replace(/\s+/g, '-'), b.name, b.material, String(b.qty), `${num(b.mass)} kg`])] : [['ITEM', 'PART NO.', 'DESCRIPTION', 'MATERIAL', 'QTY', 'MASS'], ['1', dd.props.partNo || nm.toUpperCase().replace(/\s+/g, '-'), dd.props.description || nm, ctx.material, '1', `${num(ctx.mass)} kg`]]; const t = table(out, an.x, an.y, rows, 2.8, true, 'BILL OF MATERIALS'); void t; break; }
      case 'rev': table(out, an.x, an.y, [['REV', 'DESCRIPTION', 'DATE', 'APPROVED'], ...an.rows.map(r => [r.rev, r.desc, r.date, r.by])], 2.8, true, 'REVISIONS'); break;
      case 'table': table(out, an.x, an.y, an.rows, 2.8, true, an.title); break;
      case 'cloud': { cloud(out, an.x, an.y, an.w, an.h); poly(out, [[an.x + an.w + 3, an.y - 3], [an.x + an.w + 9, an.y - 3], [an.x + an.w + 6, an.y - 8]], 'note', 0.3, true); text(out, [an.x + an.w + 6, an.y - 3.8], an.tag, 2.6, 'note'); break; }
      case 'fill': { if (!T || !vw) break; const o: Seg[] = [[an.u0, an.v0, an.u1, an.v0], [an.u1, an.v0, an.u1, an.v1], [an.u1, an.v1, an.u0, an.v1], [an.u0, an.v1, an.u0, an.v0]];
        for (const h of hatchItems(o, an.style, vw.s, an.angle)) { const a = T(h.s[0], h.s[1]), b = T(h.s[2], h.s[3]); line(out, a, b, 'hat', 0.16, dashFor(h.k)); }
        const A2 = T(an.u0, an.v0), B2 = T(an.u1, an.v1); poly(out, [A2, [B2[0], A2[1]], B2, [A2[0], B2[1]]], 'hat', 0.2, true); break; }
    }
    if (out.length > i0) { const b = bboxOfPrims(out.slice(i0)); if (isFinite(b[0])) hits.push({ id: an.id, kind: 'ann', box: b }); }
  }
  void k;
  const layers = dd.layers, prims = out.filter(p => layers[p.layer] !== false);
  return { prims, views: infos, snaps, circles, hits, page, area, tb };
}
const circlesInView = (id: string, all: CircleInfo[]) => all.filter(c => c.view === id);

// ---------- building drawings ----------
export const defaultProps = (): Props => ({ company: '', title: '', drawnBy: '', checkedBy: '', approvedBy: '', drawingNo: '', revision: 'A', partNo: '', description: '', finish: '', tolerance: 'UNLESS OTHERWISE STATED: TOLERANCES ±0.2 mm', weight: 'auto' });
function meshExtent(mesh: Mesh): { lo: V3; hi: V3 } {
  const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.v.length; i += 3) for (let q = 0; q < 3; q++) { lo[q] = Math.min(lo[q], mesh.v[i + q]); hi[q] = Math.max(hi[q], mesh.v[i + q]); }
  return { lo, hi };
}
export const blankDoc = (size: PageSetup = { key: 'A3', orient: 'landscape', custom: [420, 297], margin: 0 }): DrawingDoc => ({ v: 1, sheets: [{ id: uid('sh'), name: 'Sheet1', size, scale: 1, views: [], anns: [] }], std: 'iso', projection: 'third', units: 'mm', dual: false, prec: 1, arrow: 'filled', textH: 3.4, zones: true, border: true, titleBlock: true, hatch: 'iron', layers: {}, props: defaultProps(), bomNote: '' });
const newView = (kind: DView['kind'], cx: number, cy: number, extra: Partial<DView> = {}): DView => ({ id: uid('vw'), kind, cx, cy, scale: null, display: 'hlv', marks: true, showLabel: true, showScale: false, ...extra });

// the standard arrangement: front, top, right and an isometric view, at the largest standard scale that fits the sheet
export function arrangeStandard(dd: DrawingDoc, sh: Sheet, ctx: Ctx): void {
  const page = pageMm(sh.size), k = sheetFactor(page), M = 10, bw = 180 * k, bh = 52 * k, area: [number, number, number, number] = [M + 14, M + 8, page[0] - M - 8, page[1] - M - bh - 14];
  const { lo, hi } = meshExtent(ctx.mesh), sx = hi[0] - lo[0], sy = hi[1] - lo[1], sz = hi[2] - lo[2], gx = 38, gy = 36, aw = area[2] - area[0], ah = area[3] - area[1];
  const fits = (s: number) => (sx + sy) * s + gx + 20 <= aw * 0.66 && (sz + sy) * s + gy <= ah;
  const s = [...SCALES].reverse().find(fits) ?? SCALES[0];
  sh.scale = s; const fw = sx * s, fh = sz * s, th = sy * s, rw = sy * s, third = dd.projection === 'third';
  const clusterW = fw + gx + rw, clusterH = fh + gy + th, x0 = area[0] + 6, y0 = area[1] + (ah - clusterH) / 2 + 4;
  const topY = third ? y0 + th / 2 : y0 + fh + gy + th / 2, frontY = third ? y0 + th + gy + fh / 2 : y0 + fh / 2;
  const front = newView('front', x0 + (third ? 0 : rw + gx) + fw / 2, frontY), top = newView('top', front.cx, topY, { parent: front.id, align: 'h' as const });
  const right = newView('right', third ? x0 + fw + gx + rw / 2 : x0 + rw / 2, frontY, { parent: front.id, align: 'v' as const });
  const iso = newView('iso', x0 + clusterW + (area[2] - x0 - clusterW) / 2, area[1] + (ah * 0.34), { display: 'edges', marks: false, scale: Math.min(s, 1.0 * Math.max(0.02, Math.min((area[2] - x0 - clusterW - 8) / Math.max(1, sx + sy), (ah * 0.6) / Math.max(1, sz + (sx + sy) * 0.4)))) });
  const fitIso = [...SCALES].reverse().find(q => q <= (iso.scale as number)) ?? SCALES[0]; iso.scale = fitIso;
  sh.views = [front, top, right, iso]; sh.anns = sh.anns.filter(a => !('view' in a) || a.t === 'dim' && false);
}
export function newDrawing(ctx: Ctx, size?: PageSetup): DrawingDoc { const dd = blankDoc(size); dd.props.partNo = ctx.doc.name.toUpperCase().replace(/\s+/g, '-'); arrangeStandard(dd, dd.sheets[0], ctx); return dd; }

export function nextLetter(sh: Sheet, kind: DView['kind']): string { const used = new Set(sh.views.filter(v => v.letter).map(v => v.letter)); for (let i = 0; i < 26; i++) { const c = String.fromCharCode(65 + i); if (!used.has(c)) return c; } void kind; return 'Z'; }

// find a free spot of a given size on the sheet near a preferred point
export function freeSpot(r: Rendered, w: number, h: number, prefer: Pt): Pt {
  const [ax0, ay0, ax1, ay1] = r.area, boxes = r.views.map(v => v.sheetBox), pad = 16;
  let best: Pt = prefer, bd = Infinity;
  for (let x = ax0 + w / 2; x <= ax1 - w / 2; x += 6) for (let y = ay0 + h / 2; y <= ay1 - h / 2 - 16; y += 6) {
    const bx0 = x - w / 2 - pad / 2, bx1 = x + w / 2 + pad / 2, by0 = y - h / 2 - pad / 2, by1 = y + h / 2 + pad / 2 + 10;
    if (boxes.some(b => bx0 < b[2] + 2 && bx1 > b[0] - 2 && by0 < b[3] + 2 && by1 > b[1] - 2)) continue;
    const d = Math.hypot(x - prefer[0], y - prefer[1]); if (d < bd) { bd = d; best = [x, y]; }
  }
  return best;
}

export { callouts, camAzEl, chain };
