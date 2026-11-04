// DXF export (AutoCAD R12 ASCII, which every CAD program reads; DWG itself is a closed format).
// Units: millimetres. The plan's y axis points down the screen, so y is flipped to the CAD convention (y up).
import type { El, Lib, Story } from './engineering';
import { footprint, holesOf, polyArea, stairSteps, wallT } from './model';
import { isPitched, roofLines, roofPlanBox } from './roof';
import type { View2D } from './views';

type Pt = [number, number];
const LAYERS: Record<string, number> = {   // name: AutoCAD colour index
  'A-WALL': 7, 'A-DOOR': 3, 'A-WIND': 5, 'A-ROOF': 30, 'A-ROOF-RIDGE': 30, 'A-STAIR': 2, 'A-ROOM': 8, 'A-DIMS': 1, 'A-TEXT': 7,
  'S-COLS': 3, 'S-BEAM': 2, 'S-SLAB': 8, 'S-GRID': 6, 'M-DUCT': 4, 'M-PIPE': 5, 'M-EQPT': 6, 'V-CUT': 7, 'V-SEEN': 8, 'V-OPEN': 5, 'V-LEVEL': 3,
};
const mm = (v: number) => Math.round(v * 1000 * 1000) / 1000;

class Dxf {
  private out: string[] = [];
  used = new Set<string>();
  n = 0;
  private g(code: number, v: string | number) { this.out.push(String(code), String(v)); }
  private head(type: string, layer: string) { this.used.add(layer); this.n++; this.g(0, type); this.g(8, layer); }
  line(a: Pt, b: Pt, layer: string) { this.head('LINE', layer); this.g(10, mm(a[0])); this.g(20, mm(-a[1])); this.g(30, 0); this.g(11, mm(b[0])); this.g(21, mm(-b[1])); this.g(31, 0); }
  poly(pts: Pt[], layer: string, closed = true) {
    this.head('POLYLINE', layer); this.g(66, 1); this.g(70, closed ? 1 : 0);
    for (const p of pts) { this.g(0, 'VERTEX'); this.g(8, layer); this.g(10, mm(p[0])); this.g(20, mm(-p[1])); this.g(30, 0); }
    this.g(0, 'SEQEND'); this.g(8, layer);
  }
  circle(c: Pt, r: number, layer: string) { this.head('CIRCLE', layer); this.g(10, mm(c[0])); this.g(20, mm(-c[1])); this.g(30, 0); this.g(40, mm(r)); }
  arc(c: Pt, r: number, a0: number, a1: number, layer: string) { this.head('ARC', layer); this.g(10, mm(c[0])); this.g(20, mm(-c[1])); this.g(30, 0); this.g(40, mm(r)); this.g(50, Math.round(a0 * 1e4) / 1e4); this.g(51, Math.round(a1 * 1e4) / 1e4); }
  text(p: Pt, h: number, s: string, layer: string, rot = 0) { this.head('TEXT', layer); this.g(10, mm(p[0])); this.g(20, mm(-p[1])); this.g(30, 0); this.g(40, mm(h)); this.g(1, s.replace(/[\r\n]+/g, ' ')); if (rot) this.g(50, Math.round(rot * 1e4) / 1e4); }
  finish(): string {
    const layers = [...this.used].sort().map(n => `0\nLAYER\n2\n${n}\n70\n0\n62\n${LAYERS[n] ?? 7}\n6\nCONTINUOUS`).join('\n');
    return `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLTYPE\n70\n1\n0\nLTYPE\n2\nCONTINUOUS\n70\n0\n3\nSolid line\n72\n65\n73\n0\n40\n0\n0\nENDTAB\n0\nTABLE\n2\nLAYER\n70\n${this.used.size}\n${layers}\n0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${this.out.join('\n')}\n0\nENDSEC\n0\nEOF\n`.replace(/\n\n/g, '\n');
  }
}

const rectPoly = (a: Pt, b: Pt, w: number): Pt[] => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = (-dy / L) * (w / 2), ny = (dx / L) * (w / 2); return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]; };
const deg = (r: number) => ((r * 180) / Math.PI + 360) % 360;

// the plan of one storey (plus the project's grid lines, which belong to every storey)
export function planDxf(els: El[], lib: Lib[], stories: Story[], storyId: string): string {
  const d = new Dxf(), list = [...stories].sort((a, b) => a.elevation_m - b.elevation_m), first = list[0]?.id;
  const here = els.filter(e => e.type === 'grid' || (e.story_id ?? first) === storyId), of = (t: string) => here.filter(e => e.type === t);
  const walls = Object.fromEntries(of('wall').map(w => [w.id, w]));
  for (const e of [...of('slab'), ...of('roof')]) {
    const pitched = e.type === 'roof' && isPitched(e.geometry), pb = pitched ? roofPlanBox(e.geometry) : null, layer = e.type === 'roof' ? 'A-ROOF' : 'S-SLAB';
    const fp: Pt[] | null = pb ? [[pb[0], pb[1]], [pb[2], pb[1]], [pb[2], pb[3]], [pb[0], pb[3]]] : footprint(e.geometry);
    if (fp) d.poly(fp, layer);
    for (const h of holesOf(e.geometry)) d.poly([[h[0], h[1]], [h[2], h[1]], [h[2], h[3]], [h[0], h[3]]], layer);
    if (pitched) for (const [a, b] of roofLines(e.geometry)) d.line(a, b, 'A-ROOF-RIDGE');
  }
  for (const e of of('zone')) { const p = e.geometry.poly as Pt[] | undefined; if (!p) continue; d.poly(p, 'A-ROOM'); const c: Pt = [p.reduce((a, q) => a + q[0], 0) / p.length, p.reduce((a, q) => a + q[1], 0) / p.length]; d.text(c, 0.25, `${e.geometry.name ?? 'Room'}  ${polyArea(p).toFixed(1)} m2`, 'A-ROOM'); }
  for (const e of of('stair')) {
    const fp = footprint(e.geometry); if (!fp) continue; d.poly(fp, 'A-STAIR');
    const [x0, y0, x1, y1] = e.geometry.rect, n = stairSteps(e.geometry), horiz = Math.abs(x1 - x0) > Math.abs(y1 - y0);
    for (let i = 1; i < n; i++) { const t = i / n; d.line(horiz ? [x0 + (x1 - x0) * t, y0] : [x0, y0 + (y1 - y0) * t], horiz ? [x0 + (x1 - x0) * t, y1] : [x1, y0 + (y1 - y0) * t], 'A-STAIR'); }
  }
  for (const e of of('beam')) d.line(e.geometry.start, e.geometry.end, 'S-BEAM');
  for (const e of of('wall')) d.poly(rectPoly(e.geometry.start, e.geometry.end, wallT(e.geometry)), 'A-WALL');
  for (const o of [...of('door'), ...of('window')]) {
    const w = walls[o.geometry.wall_id]; if (!w) continue; const g = w.geometry, L = Math.hypot(g.end[0] - g.start[0], g.end[1] - g.start[1]) || 1, ux = (g.end[0] - g.start[0]) / L, uy = (g.end[1] - g.start[1]) / L;
    const s0 = o.geometry.offset_m - o.geometry.width_m / 2, s1 = o.geometry.offset_m + o.geometry.width_m / 2, a: Pt = [g.start[0] + ux * s0, g.start[1] + uy * s0], b: Pt = [g.start[0] + ux * s1, g.start[1] + uy * s1];
    d.poly(rectPoly(a, b, wallT(g) + 0.02), o.type === 'door' ? 'A-DOOR' : 'A-WIND');
    if (o.type === 'window') d.line(a, b, 'A-WIND');
    else { const wd = o.geometry.width_m, hx: Pt = [a[0] - uy * wd, a[1] + ux * wd], A = (p: Pt): Pt => [p[0] - a[0], -(p[1] - a[1])], vb = A(b), vh = A(hx), t0 = Math.atan2(vb[1], vb[0]), t1 = Math.atan2(vh[1], vh[0]), ccw = vb[0] * vh[1] - vb[1] * vh[0] > 0; d.line(a, hx, 'A-DOOR'); d.arc(a, wd, deg(ccw ? t0 : t1), deg(ccw ? t1 : t0), 'A-DOOR'); }
  }
  for (const e of of('column')) { const sp = lib.find(l => l.id === e.library_item_id)?.specs ?? {}, b = (sp.b_mm ?? (e.geometry.b ? e.geometry.b * 1000 : 300)) / 1000, h = (sp.h_mm ?? (e.geometry.h ? e.geometry.h * 1000 : 300)) / 1000, [x, y] = e.geometry.at; d.poly([[x - b / 2, y - h / 2], [x + b / 2, y - h / 2], [x + b / 2, y + h / 2], [x - b / 2, y + h / 2]], 'S-COLS'); }
  for (const e of of('grid')) { const [a, b] = [e.geometry.start as Pt, e.geometry.end as Pt], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L; d.line(a, b, 'S-GRID'); for (const [p, k] of [[a, -1], [b, 1]] as [Pt, number][]) { const c: Pt = [p[0] + ux * k * 0.6, p[1] + uy * k * 0.6]; d.circle(c, 0.6, 'S-GRID'); d.text([c[0] - 0.15, c[1] + 0.15], 0.4, String(e.geometry.label ?? ''), 'S-GRID'); } }
  for (const e of of('dimension')) { const g = e.geometry, dx = g.end[0] - g.start[0], dy = g.end[1] - g.start[1], L = Math.hypot(dx, dy) || 1, o = g.offset ?? 0.6, nx = (-dy / L) * o, ny = (dx / L) * o, a: Pt = [g.start[0] + nx, g.start[1] + ny], b: Pt = [g.end[0] + nx, g.end[1] + ny]; d.line(g.start, a, 'A-DIMS'); d.line(g.end, b, 'A-DIMS'); d.line(a, b, 'A-DIMS'); d.text([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], 0.2, (L * 1000).toFixed(0), 'A-DIMS', deg(Math.atan2(-dy, dx)) % 180); }
  for (const e of of('label')) d.text(e.geometry.at, e.geometry.h ?? 0.25, String(e.geometry.text ?? ''), 'A-TEXT');
  for (const e of [...of('duct'), ...of('pipe')]) { const sp = lib.find(l => l.id === e.library_item_id)?.specs ?? {}, w = e.type === 'duct' ? (e.geometry.w_mm ?? sp.w_mm ?? 600) / 1000 : (e.geometry.dia_mm ?? sp.dia_mm ?? 110) / 1000; d.poly(rectPoly(e.geometry.start, e.geometry.end, w), e.type === 'duct' ? 'M-DUCT' : 'M-PIPE'); }
  for (const e of [...of('equipment'), ...of('fixture')]) if (e.geometry.at) d.circle(e.geometry.at, e.type === 'equipment' ? 0.5 : 0.2, 'M-EQPT');
  return d.finish();
}

// an elevation or section from lib/views, as outlines in the (u, z) plane
export function viewDxf(v: View2D): string {
  const d = new Dxf(), P = (u: number, z: number): Pt => [u, -z];     // the exporter flips y, so pass -z to land z upwards
  for (const s of v.shapes) {
    const layer = s.open ? 'V-OPEN' : s.cut ? 'V-CUT' : 'V-SEEN';
    d.poly(s.poly ? s.poly.map(q => P(q[0], q[1])) : [P(s.u0, s.z0), P(s.u1, s.z0), P(s.u1, s.z1), P(s.u0, s.z1)], layer);
  }
  for (const l of v.levels) { d.line(P(v.u0 - 1, l.z), P(v.u1 + 1, l.z), 'V-LEVEL'); d.text(P(v.u0 - 1, l.z + 0.1), 0.2, `${l.name} ${l.z.toFixed(2)}`, 'V-LEVEL'); }
  return d.finish();
}
