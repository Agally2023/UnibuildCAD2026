// Elevations and sections generated from the model. Pure functions, tested.
// A view looks along `dir` (a unit vector in plan, y pointing down the plan). `right` is the viewer's right-hand side, so
// the horizontal drawing coordinate is u = p . right and the distance from the viewer is depth = p . dir.
// Heights are absolute (storey elevation plus the element's own level).
import type { El, Lib, Story } from './engineering';
import { beamSec, footprint, stairSteps, wallT } from './model';

type Pt = [number, number];
export type Side = 'N' | 'S' | 'E' | 'W';
export type ViewSpec = { kind: 'elevation'; side: Side } | { kind: 'section'; axis: 'x' | 'y'; pos: number; flip: boolean };
export type VShape = { u0: number; u1: number; z0: number; z1: number; type: string; cut: boolean; depth: number; open?: boolean };
export type View2D = { title: string; shapes: VShape[]; levels: { name: string; z: number }[]; u0: number; u1: number; zmin: number; zmax: number; dir: Pt; note: string };

// the side named is the one you stand on: the "south elevation" looks north at the south face
const DIR: Record<Side, Pt> = { S: [0, -1], N: [0, 1], E: [-1, 0], W: [1, 0] };
const SIDE_NAME: Record<Side, string> = { N: 'North', S: 'South', E: 'East', W: 'West' };

const rectPoly = (a: Pt, b: Pt, w: number): Pt[] => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = (-dy / L) * (w / 2), ny = (dx / L) * (w / 2);
  return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]];
};

// where a polygon crosses the plane depth = d0, as intervals of u (works for concave polygons)
export function cutIntervals(poly: Pt[], U: (p: Pt) => number, Dp: (p: Pt) => number, d0: number): [number, number][] {
  const xs: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], dp = Dp(p), dq = Dp(q);
    if (dp > d0 !== dq > d0) xs.push(U(p) + ((U(q) - U(p)) * (d0 - dp)) / (dq - dp));
  }
  xs.sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
  return out;
}

export function modelExtent(els: El[]): { x0: number; x1: number; y0: number; y1: number } {
  const xs: number[] = [], ys: number[] = [];
  for (const e of els) { const g = e.geometry; if (g.start && g.end) { xs.push(g.start[0], g.end[0]); ys.push(g.start[1], g.end[1]); } if (g.at) { xs.push(g.at[0]); ys.push(g.at[1]); } if (g.rect) { xs.push(g.rect[0], g.rect[2]); ys.push(g.rect[1], g.rect[3]); } }
  return xs.length ? { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } : { x0: 0, x1: 10, y0: 0, y1: 10 };
}

export function buildView(els: El[], lib: Lib[], stories: Story[], spec: ViewSpec): View2D {
  const list = [...stories].sort((a, b) => a.elevation_m - b.elevation_m), first = list[0];
  const dir: Pt = spec.kind === 'elevation' ? DIR[spec.side] : spec.axis === 'x' ? (spec.flip ? [-1, 0] : [1, 0]) : (spec.flip ? [0, -1] : [0, 1]);
  const right: Pt = [-dir[1], dir[0]];
  const U = (p: Pt) => p[0] * right[0] + p[1] * right[1], Dp = (p: Pt) => p[0] * dir[0] + p[1] * dir[1];
  const sec = spec.kind === 'section', d0 = sec ? spec.pos * (spec.axis === 'x' ? dir[0] : dir[1]) : -Infinity;
  const storeyOf = (e: El) => list.find(s => s.id === (e.story_id ?? first?.id)) ?? first;
  const E = (e: El) => storeyOf(e)?.elevation_m ?? 0, H = (e: El) => storeyOf(e)?.height_m ?? 3.6;
  const specOf = (e: El) => lib.find(l => l.id === e.library_item_id)?.specs ?? {};
  const shapes: VShape[] = [];

  const body = (e: El): { poly: Pt[]; z0: number; z1: number } | null => {
    const g = e.geometry, base = E(e);
    switch (e.type) {
      case 'wall': return { poly: rectPoly(g.start, g.end, wallT(g)), z0: base, z1: base + (g.height ?? H(e)) };
      case 'column': { const sp = specOf(e), b = (sp.b_mm ?? (g.b ? g.b * 1000 : 300)) / 1000, h = (sp.h_mm ?? (g.h ? g.h * 1000 : 300)) / 1000, [x, y] = g.at; return { poly: [[x - b / 2, y - h / 2], [x + b / 2, y - h / 2], [x + b / 2, y + h / 2], [x - b / 2, y + h / 2]], z0: base, z1: base + (g.height ?? H(e)) }; }
      case 'beam': { const s = beamSec(g, specOf(e)), top = base + (g.top_m ?? H(e)); return { poly: rectPoly(g.start, g.end, s.b), z0: top - s.d, z1: top }; }
      case 'slab': case 'roof': { const fp = footprint(g); return fp ? { poly: fp, z0: base + g.z0, z1: base + g.z1 } : null; }
      case 'stair': { const fp = footprint(g); return fp ? { poly: fp, z0: base + (g.z0 ?? 0), z1: base + (g.z1 ?? H(e)) } : null; }
      case 'duct': { const sp = specOf(e), w = (g.w_mm ?? sp.w_mm ?? 600) / 1000, h = (g.h_mm ?? sp.h_mm ?? 300) / 1000, c = base + (g.elevation_m ?? 3); return { poly: rectPoly(g.start, g.end, w), z0: c - h / 2, z1: c + h / 2 }; }
      case 'pipe': { const sp = specOf(e), d = (g.dia_mm ?? sp.dia_mm ?? 110) / 1000, c = base + (g.elevation_m ?? 3.2); return { poly: rectPoly(g.start, g.end, d), z0: c - d / 2, z1: c + d / 2 }; }
      default: return null;
    }
  };
  const mean = (poly: Pt[]) => poly.reduce((a, p) => a + Dp(p), 0) / poly.length;

  for (const e of els) {
    const b = body(e); if (!b) continue;
    const ds = b.poly.map(Dp), us = b.poly.map(U);
    if (sec) {
      if (Math.max(...ds) <= d0) continue;                                     // behind the cut: not seen
      if (Math.min(...ds) < d0) {                                              // the plane passes through it: cut
        for (const [a, c] of cutIntervals(b.poly, U, Dp, d0)) if (c - a > 1e-6) shapes.push({ u0: a, u1: c, z0: b.z0, z1: b.z1, type: e.type, cut: true, depth: d0 });
        continue;
      }
    }
    shapes.push({ u0: Math.min(...us), u1: Math.max(...us), z0: b.z0, z1: b.z1, type: e.type, cut: false, depth: mean(b.poly) });
  }

  // doors and windows: seen on the walls that face the viewer, or as gaps where the section plane cuts a wall
  const walls = Object.fromEntries(els.filter(e => e.type === 'wall').map(w => [w.id, w]));
  for (const o of els) {
    if (o.type !== 'door' && o.type !== 'window') continue;
    const w = walls[o.geometry.wall_id]; if (!w) continue;
    const g = w.geometry, L = Math.hypot(g.end[0] - g.start[0], g.end[1] - g.start[1]) || 1, ux = (g.end[0] - g.start[0]) / L, uy = (g.end[1] - g.start[1]) / L;
    const s0 = o.geometry.offset_m - o.geometry.width_m / 2, s1 = o.geometry.offset_m + o.geometry.width_m / 2, base = E(w);
    const z0 = base + (o.type === 'door' ? 0 : 0.9), z1 = base + (o.type === 'door' ? 2.1 : 2.1);
    const pa: Pt = [g.start[0] + ux * s0, g.start[1] + uy * s0], pb: Pt = [g.start[0] + ux * s1, g.start[1] + uy * s1];
    const poly = rectPoly(pa, pb, wallT(g) + 0.02), ds = poly.map(Dp), us = poly.map(U);
    if (sec) {
      const da = Dp(g.start), db = Dp(g.end);
      if (Math.min(...ds) < d0 && Math.max(...ds) > d0 || (da - d0) * (db - d0) < 0) {
        const t = db !== da ? (d0 - da) / (db - da) : -1, along = t * L;
        if (along >= s0 && along <= s1) { for (const [a, c] of cutIntervals(rectPoly(g.start, g.end, wallT(g)), U, Dp, d0)) shapes.push({ u0: a, u1: c, z0, z1, type: o.type, cut: false, depth: d0 - 0.01, open: true }); }
        continue;
      }
      if (Math.max(...ds) <= d0) continue;
    }
    const u0 = Math.min(...us), u1 = Math.max(...us);
    if (u1 - u0 < 0.05) continue;                                              // edge-on to the viewer
    shapes.push({ u0, u1, z0, z1, type: o.type, cut: false, depth: mean(rectPoly(g.start, g.end, wallT(g))) - 0.01, open: true });
  }

  shapes.sort((a, b) => b.depth - a.depth);                                    // far first, cut drawn over what is beyond it
  const levels = list.map(s => ({ name: s.name, z: s.elevation_m }));
  if (list.length) { const t = list[list.length - 1]; levels.push({ name: 'Top', z: t.elevation_m + t.height_m }); }
  const all = shapes.length ? shapes : [{ u0: 0, u1: 10, z0: 0, z1: 3.6 } as VShape];
  const u0 = Math.min(...all.map(s => s.u0)), u1 = Math.max(...all.map(s => s.u1)), zmin = Math.min(0, ...all.map(s => s.z0), ...levels.map(l => l.z)), zmax = Math.max(...all.map(s => s.z1), ...levels.map(l => l.z));
  const title = sec ? `Section ${spec.axis.toUpperCase()} = ${spec.pos.toFixed(2)} m, looking ${spec.axis === 'x' ? (spec.flip ? 'west' : 'east') : (spec.flip ? 'north' : 'south')}` : `${SIDE_NAME[spec.side]} elevation`;
  const note = sec ? 'Dark: cut by the plane. Light: seen beyond it. Open boxes are doors and windows.' : 'Seen from the outside. Open boxes are doors and windows.';
  return { title, shapes, levels, u0, u1, zmin, zmax, dir, note };
}

// the stair data a section needs is the same as the plan's: re-exported so screens import from one place
export { stairSteps };

export const VCOL: Record<string, string> = { wall: '#c9d3cd', column: '#9aa7a0', beam: '#a9b6af', slab: '#b4c0b9', roof: '#8fa39a', stair: '#cdbf9c', duct: '#8fb6d8', pipe: '#7fa6c8', door: '#ffffff', window: '#cfe8f7' };

// A view as a standalone SVG string, for download and for drawing sheets. Drawing units are millimetres at the given scale
// (e.g. scale 100 means 1:100), so it prints at true size.
export function viewSvg(v: View2D, scale = 100, pad = 8): { svg: string; w: number; h: number; inner: string } {
  const k = 1000 / scale, X = (u: number) => (u - v.u0) * k + pad + 14, Y = (z: number) => (v.zmax - z) * k + pad + 6;
  const w = (v.u1 - v.u0) * k + pad * 2 + 40, h = (v.zmax - v.zmin) * k + pad * 2 + 12;
  let inner = '';
  for (const l of v.levels) inner += `<line x1="${X(v.u0) - 12}" x2="${X(v.u1) + 8}" y1="${Y(l.z)}" y2="${Y(l.z)}" stroke="#146c43" stroke-width="0.25" stroke-dasharray="4 2"/><text x="${X(v.u0) - 13}" y="${Y(l.z) - 1}" font-size="3" text-anchor="end" fill="#146c43">${l.name} ${l.z.toFixed(2)}</text>`;
  for (const s of v.shapes) {
    const x = X(s.u0), y = Y(s.z1), ww = Math.max((s.u1 - s.u0) * k, 0.2), hh = Math.max((s.z1 - s.z0) * k, 0.2);
    inner += s.open ? `<rect x="${x}" y="${y}" width="${ww}" height="${hh}" fill="${VCOL[s.type]}" stroke="#0a2e1f" stroke-width="0.3"/>` : `<rect x="${x}" y="${y}" width="${ww}" height="${hh}" fill="${s.cut ? '#2b3a33' : VCOL[s.type] ?? '#ccc'}" stroke="#0a2e1f" stroke-width="${s.cut ? 0.5 : 0.2}"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}mm" height="${h.toFixed(1)}mm" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}"><rect width="100%" height="100%" fill="#fff"/>${inner}</svg>`;
  return { svg, w, h, inner };
}
