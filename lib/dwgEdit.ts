// Editing a drawing: adding views and annotations with sensible defaults. All functions change the document they are given
// (callers pass a copy, see structuredClone) and use the latest Rendered result to find free space on the sheet.
import { uid, calc } from './sketch';
import { callouts } from './drawing';
import type { Ann, DView, DrawingDoc, Sheet, Cut, HatchStyle } from './dwgTypes';
import { SCALES, camOf, contentOf, freeSpot, nextLetter, sectionCam, type Ctx, type Rendered, type ViewInfo } from './dwg';
import { dot, type Pt, type Cam } from './dwgGeom';
import type { V3 } from './solid';

export const aid = () => uid('an');
export function meshBox(ctx: Ctx): { lo: V3; hi: V3 } {
  const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity], m = ctx.mesh;
  for (let i = 0; i < m.v.length; i += 3) for (let q = 0; q < 3; q++) { lo[q] = Math.min(lo[q], m.v[i + q]); hi[q] = Math.max(hi[q], m.v[i + q]); }
  return { lo, hi };
}
const nice = (s: number) => SCALES.find(q => q >= s - 1e-9) ?? SCALES[SCALES.length - 1];
export function viewSize(v: DView, sh: Sheet, dd: DrawingDoc, ctx: Ctx): [number, number] {
  const c = contentOf(v, sh.views, dd, ctx, sh.scale), s = v.scale ?? sh.scale; return [(c.box[2] - c.box[0]) * s, (c.box[3] - c.box[1]) * s];
}

// the cutting planes that show as a line in a parent view: the cut axis must lie in the plane of the view
export type CutChoice = { axis: 'x' | 'y' | 'z'; dir: 'h' | 'v'; lo: number; hi: number; mid: number };
export function cutChoices(parentCam: Cam, ctx: Ctx): CutChoice[] {
  const { lo, hi } = meshBox(ctx), out: CutChoice[] = [];
  (['x', 'y', 'z'] as const).forEach((a, i) => { const e: V3 = [0, 0, 0]; e[i] = 1; const eu = dot(e, parentCam.right), ev = dot(e, parentCam.up); if (Math.abs(ev) > 0.9) out.push({ axis: a, dir: 'h', lo: lo[i], hi: hi[i], mid: (lo[i] + hi[i]) / 2 }); else if (Math.abs(eu) > 0.9) out.push({ axis: a, dir: 'v', lo: lo[i], hi: hi[i], mid: (lo[i] + hi[i]) / 2 }); });
  return out;
}

export function addModelView(dd: DrawingDoc, sh: Sheet, ctx: Ctx, r: Rendered, kind: DView['kind'], extra: Partial<DView> = {}, prefer?: Pt): DView {
  const v: DView = { id: uid('vw'), kind, cx: 0, cy: 0, scale: null, display: 'hlv', marks: true, showLabel: true, showScale: false, ...extra };
  const [w, h] = viewSize(v, sh, dd, ctx), par = v.parent ? r.views.find(q => q.id === v.parent) : undefined;
  let p: Pt;
  if (v.kind === 'proj' && par) {
    const gap = 36, d = v.proj ?? 'r';
    p = d === 'r' ? [par.cx + (par.sheetBox[2] - par.sheetBox[0]) / 2 + gap + w / 2, par.cy] : d === 'l' ? [par.cx - (par.sheetBox[2] - par.sheetBox[0]) / 2 - gap - w / 2, par.cy] : d === 'u' ? [par.cx, par.cy - (par.sheetBox[3] - par.sheetBox[1]) / 2 - gap - h / 2] : [par.cx, par.cy + (par.sheetBox[3] - par.sheetBox[1]) / 2 + gap + h / 2];
    v.align = d === 'r' || d === 'l' ? 'v' : 'h';
  } else p = freeSpot(r, w, h, prefer ?? (par ? [par.cx + 90, par.cy] : [r.area[2] - w, r.area[1] + h]));
  v.cx = p[0]; v.cy = p[1]; sh.views.push(v); return v;
}

export function addSection(dd: DrawingDoc, sh: Sheet, ctx: Ctx, r: Rendered, parentId: string, cut: Cut, hatch?: HatchStyle): DView | null {
  const par = r.views.find(q => q.id === parentId); if (!par) return null;
  const ch = cutChoices(par.cam, ctx).find(c => c.axis === cut.axis); if (!ch) return null;
  const dirv = camOf({ id: 'x', kind: 'section', cut, cx: 0, cy: 0, scale: null, display: 'hlv', marks: false, showLabel: true, showScale: false }, sh.views, dd, ctx).fwd;
  const ax = dot(dirv, par.cam.right), ay = -dot(dirv, par.cam.up), prefer: Pt = [par.cx + ax * 110, par.cy + ay * 90];
  return addModelView(dd, sh, ctx, r, 'section', { parent: parentId, cut, letter: nextLetter(sh, 'section'), marks: false, showScale: true, hatch }, prefer);
}
export function addDetail(dd: DrawingDoc, sh: Sheet, ctx: Ctx, r: Rendered, parentId: string, u: number, v: number, rad: number, round: boolean, scale?: number): DView | null {
  const par = r.views.find(q => q.id === parentId); if (!par) return null;
  return addModelView(dd, sh, ctx, r, 'detail', { parent: parentId, detail: { u, v, r: rad, round }, scale: scale ?? nice(par.s * 2.5), letter: nextLetter(sh, 'detail'), marks: false, showScale: true }, [par.cx + 100, par.cy + 60]);
}
export function addAux(dd: DrawingDoc, sh: Sheet, ctx: Ctx, r: Rendered, parentId: string, a: Pt, b: Pt, flip = false): DView | null {
  const par = r.views.find(q => q.id === parentId); if (!par) return null;
  return addModelView(dd, sh, ctx, r, 'aux', { parent: parentId, aux: { a, b, flip }, letter: nextLetter(sh, 'aux') }, [par.cx + 100, par.cy - 30]);
}

// ---------- dimensions ----------
const off = (mm: number, s: number) => mm / s;
export function dimsForView(info: ViewInfo, r: Rendered, seen: Set<string>): Ann[] {
  const out: Ann[] = [], [u0, v0, u1, v1] = info.box, s = info.s;
  if (info.kind === 'iso' || info.kind === 'dimetric' || info.kind === 'trimetric' || info.kind === 'detail') return out;
  out.push({ id: aid(), t: 'dim', view: info.id, kind: 'hor', a: [u0, v0], b: [u1, v0], p: [(u0 + u1) / 2, v1 + off(11, s)] });
  out.push({ id: aid(), t: 'dim', view: info.id, kind: 'ver', a: [u0, v0], b: [u0, v1], p: [u0 - off(11, s), (v0 + v1) / 2] });
  const circles = r.circles.filter(c => c.view === info.id && c.c.full && c.c.r * s >= 1.2).sort((a, b) => b.c.r - a.c.r);
  let n = 0;
  for (const c of circles) {
    const key = `d${Math.round(c.c.r * 20)}`; if (seen.has(key) || n >= 6) continue; seen.add(key); n++;
    const d = off(7 + c.c.r * s, s) * 0.8;
    out.push({ id: aid(), t: 'dim', view: info.id, kind: 'dia', a: [c.c.cx, c.c.cy], b: [c.c.cx + c.c.r, c.c.cy], p: [c.c.cx + (c.c.r + d) * 0.7, c.c.cy + (c.c.r + d) * 0.7] });
  }
  // hole positions from the lower left corner of the view
  let k = 0; for (const c of circles) {
    if (Math.abs(c.c.cx - (u0 + u1) / 2) < 0.5 && Math.abs(c.c.cy - (v0 + v1) / 2) < 0.5) continue; if (k >= 3) break; k++;
    out.push({ id: aid(), t: 'dim', view: info.id, kind: 'hor', a: [u0, c.c.cy], b: [c.c.cx, c.c.cy], p: [(u0 + c.c.cx) / 2, v1 + off(18 + k * 7, s)] });
    out.push({ id: aid(), t: 'dim', view: info.id, kind: 'ver', a: [c.c.cx, v0], b: [c.c.cx, c.c.cy], p: [u1 + off(8 + k * 7, s), (v0 + c.c.cy) / 2] });
  }
  return out;
}
export function autoDims(sh: Sheet, r: Rendered): Ann[] {
  const seen = new Set<string>(); const out: Ann[] = [];
  for (const info of r.views) out.push(...dimsForView(info, r, seen));
  const have = (a: Ann) => sh.anns.some(b => b.t === 'dim' && a.t === 'dim' && b.view === a.view && b.kind === a.kind && Math.abs(b.a[0] - a.a[0]) < 1e-6 && Math.abs(b.a[1] - a.a[1]) < 1e-6 && Math.abs(b.b[0] - a.b[0]) < 1e-6 && Math.abs(b.b[1] - a.b[1]) < 1e-6);
  return out.filter(a => !have(a));
}
// the matching text of a hole in the feature list, such as "4× Ø12 THRU"
export function holeText(ctx: Ctx, diameter: number): string {
  const list = callouts(ctx.doc, ctx.values), tag = `Ø${Math.round(diameter * 10) / 10}`;
  const m = list.find(t => t.includes(tag + ' ') || t.includes(tag + '  ') || t.startsWith(tag) || t.includes('× ' + tag));
  return m ?? tag;
}
export function autoBalloons(sh: Sheet, r: Rendered, ctx?: Ctx): Ann[] {
  if (ctx?.bom?.length) {
    const v = r.views.find(q => q.kind === 'front') ?? r.views[0]; if (!v) return [];
    const have = new Set(sh.anns.filter(a => a.t === 'balloon').map(a => (a as any).text)), out: Ann[] = [];
    ctx.bom.forEach((b, i) => {
      if (have.has(String(b.item))) return;
      const c = [(b.lo[0] + b.hi[0]) / 2, (b.lo[1] + b.hi[1]) / 2, (b.lo[2] + b.hi[2]) / 2] as V3, t: Pt = [dot(c, v.cam.right), dot(c, v.cam.up)];
      out.push({ id: aid(), t: 'balloon', view: v.id, at: [v.box[0] - off(12, v.s), v.box[3] - (i + 0.5) * ((v.box[3] - v.box[1]) / ctx.bom!.length)], target: t, text: String(b.item), shape: 'circle' });
    });
    return out;
  }
  const v = r.views.find(q => q.kind === 'front') ?? r.views[0]; if (!v || sh.anns.some(a => a.t === 'balloon')) return [];
  const [u0, , u1, v1] = v.box; void u1;
  return [{ id: aid(), t: 'balloon', view: v.id, at: [u0 - off(14, v.s), v1 + off(12, v.s)], target: [u0 + (v.box[2] - u0) * 0.25, v1 - (v.box[3] - v.box[1]) * 0.1], text: '1', shape: 'circle' }];
}
export const cloneDoc = <T,>(d: T): T => JSON.parse(JSON.stringify(d));
void calc; void sectionCam;

import { renderDrawing as _render, newDrawing } from './dwg';
import { toSvg } from './dwgOut';
export const drawingOf = (ctx: Ctx): DrawingDoc => ctx.doc.drawing ?? newDrawing(ctx);
export function sheetSvgs(dd: DrawingDoc, ctx: Ctx): { svg: string; page: [number, number] }[] {
  return dd.sheets.map((_, i) => { const r = _render(dd, i, ctx); return { svg: toSvg(r.prims, r.page, { px: 3 }), page: r.page }; });
}
// a circle through three points (for dimensioning round features the detector missed)
export function circle3(a: Pt, b: Pt, c: Pt): { cx: number; cy: number; r: number } | null {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1])); if (Math.abs(d) < 1e-9) return null;
  const a2 = a[0] ** 2 + a[1] ** 2, b2 = b[0] ** 2 + b[1] ** 2, c2 = c[0] ** 2 + c[1] ** 2;
  const cx = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d, cy = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
  return { cx, cy, r: Math.hypot(a[0] - cx, a[1] - cy) };
}

// metric coarse threads: nominal diameter and pitch
export const METRIC: [number, number][] = [[2, 0.4], [2.5, 0.45], [3, 0.5], [4, 0.7], [5, 0.8], [6, 1], [8, 1.25], [10, 1.5], [12, 1.75], [14, 2], [16, 2], [18, 2.5], [20, 2.5], [22, 2.5], [24, 3], [27, 3], [30, 3.5], [36, 4], [42, 4.5], [48, 5]];
// text and nominal size for a round feature of diameter D: a tapped hole is drilled near the minor diameter, a shaft is cut at the major
export function threadText(D: number): { text: string; nom: number; ext: boolean } {
  let best: { text: string; nom: number; ext: boolean; e: number } | null = null;
  for (const [d, p] of METRIC) {
    const eh = Math.abs(D - (d - 1.0825 * p)) / D, es = Math.abs(D - d) / d;
    if (eh < 0.06 && (!best || eh < best.e)) best = { text: `M${d}x${p} - 6H`, nom: d / 2, ext: false, e: eh };
    if (es < 0.04 && (!best || es < best.e)) best = { text: `M${d}x${p} - 6g`, nom: d / 2, ext: true, e: es };
  }
  if (best) return { text: best.text, nom: best.nom, ext: best.ext };
  const nd = METRIC.reduce((a, b) => (Math.abs(b[0] - D) < Math.abs(a[0] - D) ? b : a));
  return { text: `M${nd[0]}x${nd[1]} - 6H`, nom: nd[0] / 2, ext: false };
}

// where the next table goes: stacked under the tables already placed in the left column of the sheet
const SYM_ROWS: Record<string, number> = { gentol: 7, notes: 4, finish: 1, edges: 2 };
export function nextTablePos(sh: Sheet, r: Rendered, ctx?: Ctx): Pt {
  const x = r.area[0] + 4; let y = r.area[1] + 8;
  for (const a of sh.anns) {
    if (!('x' in a) || !('y' in a) || Math.abs(a.x - x) > 2) continue;
    const rows = a.t === 'symbol' ? SYM_ROWS[a.name] ?? 3 : a.t === 'bom' ? (ctx?.bom?.length ?? 1) + 1 : a.t === 'rev' ? a.rows.length + 1 : a.t === 'table' ? a.rows.length : 4;
    y = Math.max(y, a.y + (rows + 2) * 5.8 + 2);
  }
  return [x, y];
}
