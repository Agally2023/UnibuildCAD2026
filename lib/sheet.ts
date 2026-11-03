// Drawing sheets: a plan, elevation or section placed on a paper size with a border and title block.
// Everything is an SVG string in millimetres so it prints at true scale. Pure functions, tested.
import type { El, Lib, Story } from './engineering';
import { isPitched, roofLines } from './roof';
import { footprint, holesOf, polyArea, polyCentroid, wallT } from './model';
import { buildView, modelExtent, viewSvg, Side, VCOL } from './views';

type Pt = [number, number];
export const PAPER = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594] } as const;
export type Paper = keyof typeof PAPER;
export const SCALES = [20, 50, 100, 200, 500, 1000];
export type SheetView = { kind: 'plan'; storyId: string } | { kind: 'elevation'; side: Side } | { kind: 'section'; axis: 'x' | 'y'; pos: number; flip: boolean };
export type TitleInfo = { project: string; client?: string; drawnBy?: string; date?: string };
export type Drawing = { name: string; inner: string; w: number; h: number };

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const rect = (a: Pt, b: Pt, w: number): Pt[] => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = (-dy / L) * (w / 2), ny = (dx / L) * (w / 2); return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]; };

// the plan of one storey at 1:scale; origin is the model's top-left corner with a margin for dimensions and bubbles
export function planDrawing(els: El[], lib: Lib[], stories: Story[], storyId: string, scale: number): Drawing {
  const list = [...stories].sort((a, b) => a.elevation_m - b.elevation_m), first = list[0]?.id, st = list.find(s => s.id === storyId);
  const k = 1000 / scale, ex = modelExtent(els), m = 2.5;                       // 2.5 m of margin round the model
  const X = (x: number) => (x - ex.x0 + m) * k, Y = (y: number) => (y - ex.y0 + m) * k, P = (p: Pt) => `${X(p[0]).toFixed(2)},${Y(p[1]).toFixed(2)}`;
  const here = els.filter(e => (e.type === 'grid' ? true : (e.story_id ?? first) === storyId));
  const of = (t: string) => here.filter(e => e.type === t), poly = (pts: Pt[]) => pts.map(P).join(' ');
  const walls = Object.fromEntries(of('wall').map(w => [w.id, w]));
  let s = '';
  for (const e of [...of('slab'), ...of('roof')]) { const fp = footprint(e.geometry); if (fp) s += `<polygon points="${poly(fp)}" fill="${e.type === 'roof' ? '#eef3f0' : '#f6f8f7'}" stroke="#9aa7a0" stroke-width="0.15" stroke-dasharray="1.5 1"/>`; for (const h of holesOf(e.geometry)) s += `<rect x="${X(Math.min(h[0], h[2]))}" y="${Y(Math.min(h[1], h[3]))}" width="${Math.abs(h[2] - h[0]) * k}" height="${Math.abs(h[3] - h[1]) * k}" fill="#fff" stroke="#0a2e1f" stroke-width="0.2"/><line x1="${X(h[0])}" y1="${Y(h[1])}" x2="${X(h[2])}" y2="${Y(h[3])}" stroke="#0a2e1f" stroke-width="0.12"/><line x1="${X(h[2])}" y1="${Y(h[1])}" x2="${X(h[0])}" y2="${Y(h[3])}" stroke="#0a2e1f" stroke-width="0.12"/>`; }
  for (const e of of('roof')) if (isPitched(e.geometry)) for (const [a, b] of roofLines(e.geometry)) s += `<line x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(b[0])}" y2="${Y(b[1])}" stroke="#8a6d3b" stroke-width="0.25" stroke-dasharray="3 1.5"/>`;
  for (const e of of('zone')) { const p = e.geometry.poly as Pt[] | undefined; if (!p) continue; const c = polyCentroid(p); s += `<polygon points="${poly(p)}" fill="#e8f1ec" stroke="none"/><text x="${X(c[0])}" y="${Y(c[1])}" font-size="3" text-anchor="middle" fill="#0a2e1f">${esc(e.geometry.name ?? 'Room')}</text><text x="${X(c[0])}" y="${Y(c[1]) + 3.6}" font-size="2.4" text-anchor="middle" fill="#4f6a5b">${polyArea(p).toFixed(1)} m²</text>`; }
  for (const e of of('stair')) { const fp = footprint(e.geometry); if (fp) { s += `<polygon points="${poly(fp)}" fill="#f4efe0" stroke="#0a2e1f" stroke-width="0.2"/>`; const [x0, y0, x1, y1] = e.geometry.rect, n = Math.max(2, Math.round((e.geometry.z1 - e.geometry.z0) / 0.175)), horiz = Math.abs(x1 - x0) > Math.abs(y1 - y0); for (let i = 1; i < n; i++) { const t = i / n; s += horiz ? `<line x1="${X(x0 + (x1 - x0) * t)}" x2="${X(x0 + (x1 - x0) * t)}" y1="${Y(y0)}" y2="${Y(y1)}" stroke="#0a2e1f" stroke-width="0.1"/>` : `<line y1="${Y(y0 + (y1 - y0) * t)}" y2="${Y(y0 + (y1 - y0) * t)}" x1="${X(x0)}" x2="${X(x1)}" stroke="#0a2e1f" stroke-width="0.1"/>`; } } }
  for (const e of of('beam')) s += `<line x1="${X(e.geometry.start[0])}" y1="${Y(e.geometry.start[1])}" x2="${X(e.geometry.end[0])}" y2="${Y(e.geometry.end[1])}" stroke="#146c43" stroke-width="0.25" stroke-dasharray="3 1.5"/>`;
  for (const e of of('wall')) s += `<polygon points="${poly(rect(e.geometry.start, e.geometry.end, wallT(e.geometry)))}" fill="#2b3a33" stroke="#0a2e1f" stroke-width="0.15"/>`;
  for (const o of [...of('door'), ...of('window')]) {
    const w = walls[o.geometry.wall_id]; if (!w) continue; const g = w.geometry, L = Math.hypot(g.end[0] - g.start[0], g.end[1] - g.start[1]) || 1, ux = (g.end[0] - g.start[0]) / L, uy = (g.end[1] - g.start[1]) / L;
    const a: Pt = [g.start[0] + ux * (o.geometry.offset_m - o.geometry.width_m / 2), g.start[1] + uy * (o.geometry.offset_m - o.geometry.width_m / 2)], b: Pt = [g.start[0] + ux * (o.geometry.offset_m + o.geometry.width_m / 2), g.start[1] + uy * (o.geometry.offset_m + o.geometry.width_m / 2)];
    s += `<polygon points="${poly(rect(a, b, wallT(g) + 0.02))}" fill="#fff" stroke="#0a2e1f" stroke-width="0.15"/>`;
    if (o.type === 'window') s += `<line x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(b[0])}" y2="${Y(b[1])}" stroke="#2a7fb8" stroke-width="0.3"/>`;
    else { const wd = o.geometry.width_m, nx = -uy, ny = ux, hx = a[0] + nx * wd, hy = a[1] + ny * wd; s += `<path d="M ${X(a[0])} ${Y(a[1])} L ${X(hx)} ${Y(hy)} A ${wd * k} ${wd * k} 0 0 ${1} ${X(b[0])} ${Y(b[1])}" fill="none" stroke="#0a2e1f" stroke-width="0.15"/>`; }
  }
  for (const e of of('column')) { const sp = lib.find(l => l.id === e.library_item_id)?.specs ?? {}, b = (sp.b_mm ?? (e.geometry.b ? e.geometry.b * 1000 : 300)) / 1000, h = (sp.h_mm ?? (e.geometry.h ? e.geometry.h * 1000 : 300)) / 1000, [x, y] = e.geometry.at; s += `<rect x="${X(x - b / 2)}" y="${Y(y - h / 2)}" width="${b * k}" height="${h * k}" fill="#146c43" stroke="#0a2e1f" stroke-width="0.15"/>`; }
  for (const e of of('grid')) { const [a, b] = [e.geometry.start as Pt, e.geometry.end as Pt], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, r = 3.5; const bub = (p: Pt, d: number) => `<circle cx="${X(p[0]) + ux * d * r}" cy="${Y(p[1]) + uy * d * r}" r="${r}" fill="#fff" stroke="#146c43" stroke-width="0.3"/><text x="${X(p[0]) + ux * d * r}" y="${Y(p[1]) + uy * d * r + 1.2}" font-size="3.4" text-anchor="middle" fill="#146c43">${esc(String(e.geometry.label ?? ''))}</text>`; s += `<line x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(b[0])}" y2="${Y(b[1])}" stroke="#146c43" stroke-width="0.2" stroke-dasharray="6 1 1 1"/>${bub(a, -1)}${bub(b, 1)}`; }
  for (const e of of('dimension')) { const g = e.geometry, dx = g.end[0] - g.start[0], dy = g.end[1] - g.start[1], L = Math.hypot(dx, dy) || 1, o = g.offset ?? 0.6, nx = (-dy / L) * o, ny = (dx / L) * o, a: Pt = [g.start[0] + nx, g.start[1] + ny], b: Pt = [g.end[0] + nx, g.end[1] + ny], ang = (Math.atan2(dy, dx) * 180) / Math.PI, flip = ang > 90 || ang < -90 ? ang + 180 : ang; s += `<line x1="${X(g.start[0])}" y1="${Y(g.start[1])}" x2="${X(a[0])}" y2="${Y(a[1])}" stroke="#555" stroke-width="0.1"/><line x1="${X(g.end[0])}" y1="${Y(g.end[1])}" x2="${X(b[0])}" y2="${Y(b[1])}" stroke="#555" stroke-width="0.1"/><line x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(b[0])}" y2="${Y(b[1])}" stroke="#222" stroke-width="0.2"/><text transform="translate(${X((a[0] + b[0]) / 2)} ${Y((a[1] + b[1]) / 2) - 0.8}) rotate(${flip})" font-size="2.6" text-anchor="middle" fill="#222">${(L * 1000).toFixed(0)}</text>`; }
  for (const e of of('label')) s += `<text x="${X(e.geometry.at[0])}" y="${Y(e.geometry.at[1])}" font-size="${Math.max(2, (e.geometry.h ?? 0.25) * k)}" fill="#222">${esc(String(e.geometry.text ?? ''))}</text>`;
  const w = (ex.x1 - ex.x0 + 2 * m) * k, h = (ex.y1 - ex.y0 + 2 * m) * k;
  return { name: `Plan, ${st?.name ?? 'storey'}`, inner: s, w, h };
}

// a drawing for any kind of sheet view
export function makeDrawing(els: El[], lib: Lib[], stories: Story[], v: SheetView, scale: number): Drawing {
  if (v.kind === 'plan') return planDrawing(els, lib, stories, v.storyId, scale);
  const view = buildView(els, lib, stories, v.kind === 'elevation' ? { kind: 'elevation', side: v.side } : { kind: 'section', axis: v.axis, pos: v.pos, flip: v.flip });
  const d = viewSvg(view, scale);
  return { name: view.title, inner: d.inner, w: d.w, h: d.h };
}

// the largest standard scale at which the drawing fits the free area of the paper
export function fitScale(els: El[], lib: Lib[], stories: Story[], v: SheetView, paper: Paper): number {
  const [aw, ah] = areaOf(paper);
  for (const sc of SCALES) { const d = makeDrawing(els, lib, stories, v, sc); if (d.w <= aw && d.h <= ah) return sc; }
  return SCALES[SCALES.length - 1];
}
export const areaOf = (paper: Paper): [number, number] => { const [W, H] = PAPER[paper]; return [W - 20 - 8, H - 20 - 8 - 34]; };   // 10 mm margin, 34 mm title block strip

// a full sheet: border, the drawing centred in the free area, title block at the bottom right
export function sheetSvg(drawing: Drawing, paper: Paper, scale: number, no: string, info: TitleInfo): string {
  const [W, H] = PAPER[paper], [aw, ah] = areaOf(paper), dx = 14 + Math.max(0, (aw - drawing.w) / 2), dy = 14 + Math.max(0, (ah - drawing.h) / 2);
  const tw = 150, th = 30, tx = W - 10 - tw, ty = H - 10 - th;
  const row = (y: number, a: string, b: string) => `<text x="${tx + 2}" y="${ty + y}" font-size="2.2" fill="#4f6a5b">${a}</text><text x="${tx + 2 + 22}" y="${ty + y}" font-size="3" fill="#0a2e1f">${esc(b)}</text>`;
  const title = `<g><rect x="${tx}" y="${ty}" width="${tw}" height="${th}" fill="#fff" stroke="#0a2e1f" stroke-width="0.5"/><line x1="${tx}" x2="${tx + tw}" y1="${ty + 11}" y2="${ty + 11}" stroke="#0a2e1f" stroke-width="0.25"/><line x1="${tx + tw - 40}" x2="${tx + tw - 40}" y1="${ty + 11}" y2="${ty + th}" stroke="#0a2e1f" stroke-width="0.25"/>
    <text x="${tx + 2}" y="${ty + 8}" font-size="5.5" font-weight="bold" fill="#146c43">${esc(drawing.name)}</text>
    ${row(17, 'Project', info.project)}${row(22, 'Client', info.client ?? '')}${row(27, 'Drawn by', info.drawnBy ?? '')}
    <text x="${tx + tw - 38}" y="${ty + 16}" font-size="2.2" fill="#4f6a5b">Scale</text><text x="${tx + tw - 38}" y="${ty + 21}" font-size="3.6" font-weight="bold" fill="#0a2e1f">1:${scale}</text>
    <text x="${tx + tw - 38}" y="${ty + 25}" font-size="2.2" fill="#4f6a5b">Sheet ${esc(no)}  ${esc(paper)}</text><text x="${tx + tw - 38}" y="${ty + 29}" font-size="2.4" fill="#0a2e1f">${esc(info.date ?? '')}</text></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/><rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="none" stroke="#0a2e1f" stroke-width="0.7"/><g transform="translate(${dx.toFixed(2)} ${dy.toFixed(2)})">${drawing.inner}</g>${title}</svg>`;
}

// print document: one sheet per page, sized by @page. Used by the web "Print / save as PDF" button.
export function printHtml(sheets: string[], paper: Paper, title: string): string {
  const [W, H] = PAPER[paper];
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:${W}mm ${H}mm;margin:0}html,body{margin:0;padding:0}.p{width:${W}mm;height:${H}mm;page-break-after:always;overflow:hidden}.p:last-child{page-break-after:auto}svg{display:block}</style></head><body>${sheets.map(s => `<div class="p">${s}</div>`).join('')}</body></html>`;
}
export { VCOL };
