// Drawing symbols as plain primitives: arrowheads, GD&T frames, surface finish, weld, datum, balloons, revision clouds and tables.
// Everything is drawn from lines, arcs, circles and polygons (no special fonts), so it prints the same everywhere and exports to DXF.
import type { GdtSym, Layer, Prim, WeldType } from './dwgTypes';

export type P2 = [number, number];
export const INK = '#14181d';
const f1 = (n: number) => Math.round(n * 100) / 100;

export const line = (out: Prim[], a: P2, b: P2, layer: Layer, w = 0.25, dash?: number[], col?: string) => { out.push({ k: 'l', a, b, layer, w, dash, col }); };
export const text = (out: Prim[], p: P2, s: string, size: number, layer: Layer, anchor: 'start' | 'middle' | 'end' = 'middle', rot = 0, bold = false) => { if (s) out.push({ k: 't', p, s, size, anchor, rot, bold, layer }); };
export const poly = (out: Prim[], pts: P2[], layer: Layer, w = 0.25, closed = false, fill?: string) => { out.push({ k: 'p', pts, closed, w, layer, fill }); };
export const circle = (out: Prim[], c: P2, r: number, layer: Layer, w = 0.25, fill?: string) => { out.push({ k: 'c', c, r, w, layer, fill }); };

// an arrowhead whose tip is at p and which points along (dx, dy)
export function arrowhead(out: Prim[], p: P2, dx: number, dy: number, style: 'filled' | 'open' | 'dot' | 'slash' | 'none', layer: Layer, size = 2.6) {
  const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; const px = -dy, py = dx, w = size * 0.3;
  if (style === 'none') return;
  if (style === 'dot') { circle(out, p, size * 0.28, layer, 0.2, INK); return; }
  if (style === 'slash') { line(out, [p[0] - dx * size * 0.4 - px * size * 0.5 + dy * 0, p[1] - dy * size * 0.4 - py * size * 0.5], [p[0] + dx * size * 0.4 + px * size * 0.5, p[1] + dy * size * 0.4 + py * size * 0.5], layer, 0.4); return; }
  const a: P2 = [p[0] - dx * size + px * w, p[1] - dy * size + py * w], b: P2 = [p[0] - dx * size - px * w, p[1] - dy * size - py * w];
  if (style === 'open') { poly(out, [a, p, b], layer, 0.25); return; }
  poly(out, [p, a, b], layer, 0.15, true, INK);
}

// ---------- geometric tolerance symbols, drawn in a square of side s centred at (cx, cy) ----------
export function gdtSymbol(out: Prim[], sym: GdtSym, cx: number, cy: number, s: number) {
  const h = s / 2, w = 0.3, L = 'sym' as Layer, P = (x: number, y: number): P2 => [cx + x * h, cy + y * h], ln = (a: P2, b: P2) => line(out, a, b, L, w);
  switch (sym) {
    case 'flat': poly(out, [P(-0.8, 0.45), P(0.5, 0.45), P(0.8, -0.45), P(-0.5, -0.45)], L, w, true); break;
    case 'straight': ln(P(-0.8, 0), P(0.8, 0)); break;
    case 'circ': circle(out, [cx, cy], h * 0.7, L, w); break;
    case 'cyl': circle(out, [cx, cy], h * 0.55, L, w); ln(P(-0.95, -0.4), P(-0.35, 0.8)); ln(P(0.35, -0.8), P(0.95, 0.4)); break;
    case 'linep': out.push({ k: 'a', c: [cx, cy + h * 0.25], r: h * 0.8, a0: 180, a1: 360, w, layer: L }); break;
    case 'surfp': out.push({ k: 'a', c: [cx, cy + h * 0.25], r: h * 0.8, a0: 180, a1: 360, w, layer: L }); ln(P(-0.8, 0.25), P(0.8, 0.25)); break;
    case 'para': ln(P(-0.5, 0.8), P(-0.9, -0.8)); ln(P(0.3, 0.8), P(-0.1, -0.8)); break;
    case 'perp': ln(P(-0.8, -0.7), P(0.8, -0.7)); ln(P(0, -0.7), P(0, 0.8)); break;
    case 'angl': ln(P(-0.8, -0.7), P(0.8, -0.7)); ln(P(-0.8, -0.7), P(0.5, 0.8)); break;
    case 'pos': circle(out, [cx, cy], h * 0.62, L, w); ln(P(-0.95, 0), P(0.95, 0)); ln(P(0, -0.95), P(0, 0.95)); break;
    case 'conc': circle(out, [cx, cy], h * 0.7, L, w); circle(out, [cx, cy], h * 0.35, L, w); break;
    case 'symm': ln(P(-0.8, 0.5), P(0.8, 0.5)); ln(P(-0.8, 0), P(0.8, 0)); ln(P(-0.8, -0.5), P(0.8, -0.5)); break;
    case 'run': ln(P(-0.7, -0.7), P(0.7, 0.7)); poly(out, [P(0.7, 0.7), P(0.15, 0.62), P(0.62, 0.15)], L, 0.2, true, INK); break;
    case 'trun': ln(P(-0.8, -0.8), P(0.3, 0.3)); ln(P(-0.3, -0.8), P(0.8, 0.3)); poly(out, [P(0.3, 0.3), P(-0.15, 0.25), P(0.25, -0.15)], L, 0.2, true, INK); poly(out, [P(0.8, 0.3), P(0.35, 0.25), P(0.75, -0.15)], L, 0.2, true, INK); break;
  }
}

// feature control frame: [symbol | tolerance | datums...]. Returns the frame's left-middle point (where the leader starts) and its width.
export function gdtFrame(out: Prim[], at: P2, sym: GdtSym, tol: string, mod: string, datums: string[], dia: boolean, size = 3.2) {
  const hgt = size * 2.1, cells: { w: number; t?: string; sym?: boolean }[] = [{ w: hgt, sym: true }, { w: Math.max(hgt, (tol.length + (dia ? 2 : 0) + mod.length) * size * 0.62 + size * 1.4), t: `${dia ? 'Ø' : ''}${tol}${mod ? ' ' + mod : ''}` }, ...datums.filter(Boolean).map(d => ({ w: hgt, t: d }))];
  let x = at[0];
  for (const c of cells) {
    poly(out, [[x, at[1] - hgt / 2], [x + c.w, at[1] - hgt / 2], [x + c.w, at[1] + hgt / 2], [x, at[1] + hgt / 2]], 'sym', 0.3, true);
    if (c.sym) gdtSymbol(out, sym, x + c.w / 2, at[1], hgt * 0.72); else text(out, [x + c.w / 2, at[1] + size * 0.36], c.t ?? '', size, 'sym', 'middle');
    x += c.w;
  }
  return { w: x - at[0], h: hgt };
}

// surface finish: a check mark with its point at p. Machining required adds the bar, prohibited adds a circle.
export function finishSymbol(out: Prim[], p: P2, kind: 'machined' | 'basic' | 'prohibited', txt: string, size = 3) {
  const a = size * 1.1, b = size * 2.2, L: Layer = 'sym';
  const left: P2 = [p[0] - a * 0.55, p[1] - a * 1.1], right: P2 = [p[0] + a * 1.2, p[1] - b * 1.5];
  line(out, left, p, L, 0.3); line(out, p, right, L, 0.3);
  if (kind === 'machined' || kind === 'prohibited') line(out, [right[0] - 0.0, right[1]], [right[0] + b * 1.7, right[1]], L, 0.3);
  if (kind === 'prohibited') circle(out, [p[0] + a * 0.55, p[1] - a * 0.75], a * 0.6, L, 0.3);
  text(out, [right[0] + 0.8, right[1] - 0.9], txt, size * 0.9, L, 'start');
}

// weld symbol: reference line at `at`, arrow to `target`
export function weldSymbol(out: Prim[], at: P2, target: P2, type: WeldType, size: string, length: string, around: boolean, field: boolean, other: boolean, ts = 3) {
  const L: Layer = 'sym', len = 26, ref: [P2, P2] = [at, [at[0] + len, at[1]]];
  line(out, ref[0], ref[1], L, 0.3);
  const dx = target[0] - at[0], dy = target[1] - at[1], dl = Math.hypot(dx, dy) || 1;
  line(out, at, target, L, 0.3); arrowhead(out, target, dx / dl, dy / dl, 'filled', L, 2.4);
  const cx = at[0] + len / 2, s = ts * 1.5, sgn = other ? -1 : 1, y0 = at[1], Y = (d: number) => y0 - sgn * d;
  const tri = (x: number) => poly(out, [[x - s / 2, y0], [x - s / 2, Y(s)], [x + s / 2, y0]], L, 0.3, true);
  switch (type) {
    case 'fillet': tri(cx); break;
    case 'v': poly(out, [[cx - s / 2, Y(s)], [cx, y0], [cx + s / 2, Y(s)]], L, 0.3); break;
    case 'square': line(out, [cx - 0.5, y0], [cx - 0.5, Y(s)], L, 0.3); line(out, [cx + 0.5, y0], [cx + 0.5, Y(s)], L, 0.3); break;
    case 'bevel': line(out, [cx - s / 2, y0], [cx - s / 2, Y(s)], L, 0.3); line(out, [cx - s / 2, y0], [cx + s / 2, Y(s)], L, 0.3); break;
    case 'u': out.push({ k: 'a', c: [cx, Y(s * 0.55)], r: s * 0.5, a0: sgn > 0 ? 0 : 180, a1: sgn > 0 ? 180 : 360, w: 0.3, layer: L }); line(out, [cx - s / 2, Y(s * 0.55)], [cx - s / 2, Y(s)], L, 0.3); line(out, [cx + s / 2, Y(s * 0.55)], [cx + s / 2, Y(s)], L, 0.3); break;
    case 'plug': poly(out, [[cx - s / 2, y0], [cx - s * 0.35, Y(s * 0.7)], [cx + s * 0.35, Y(s * 0.7)], [cx + s / 2, y0]], L, 0.3); break;
    case 'spot': circle(out, [cx, Y(s * 0.5)], s * 0.45, L, 0.3); break;
    case 'seam': circle(out, [cx, Y(s * 0.5)], s * 0.45, L, 0.3); line(out, [cx - s * 0.7, Y(s * 0.5)], [cx + s * 0.7, Y(s * 0.5)], L, 0.3); break;
    case 'backing': out.push({ k: 'a', c: [cx, y0], r: s * 0.5, a0: sgn > 0 ? 180 : 0, a1: sgn > 0 ? 360 : 180, w: 0.3, layer: L }); break;
  }
  if (size) text(out, [at[0] + len * 0.2, Y(s * 0.3) + (other ? ts : 0)], size, ts, L, 'middle');
  if (length) text(out, [at[0] + len * 0.8, Y(s * 0.3) + (other ? ts : 0)], length, ts, L, 'middle');
  if (around) circle(out, at, 1.6, L, 0.3);
  if (field) { line(out, at, [at[0], at[1] - 6], L, 0.3); poly(out, [[at[0], at[1] - 6], [at[0] + 3.4, at[1] - 5], [at[0], at[1] - 4]], L, 0.2, true, INK); }
}

export function balloonShape(out: Prim[], c: P2, shape: 'circle' | 'triangle' | 'hex' | 'box', r: number) {
  const L: Layer = 'note';
  if (shape === 'circle') circle(out, c, r, L, 0.3);
  else if (shape === 'box') poly(out, [[c[0] - r, c[1] - r], [c[0] + r, c[1] - r], [c[0] + r, c[1] + r], [c[0] - r, c[1] + r]], L, 0.3, true);
  else if (shape === 'triangle') poly(out, [[c[0], c[1] - r * 1.25], [c[0] + r * 1.15, c[1] + r * 0.8], [c[0] - r * 1.15, c[1] + r * 0.8]], L, 0.3, true);
  else poly(out, Array.from({ length: 6 }, (_, i) => [c[0] + r * 1.1 * Math.cos((i * Math.PI) / 3), c[1] + r * 1.1 * Math.sin((i * Math.PI) / 3)] as P2), L, 0.3, true);
}

// a revision cloud: scalloped outline of a rectangle
export function cloud(out: Prim[], x: number, y: number, w: number, h: number) {
  const bump = 5, pts: P2[] = [];
  const edge = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number) => {
    const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(L / bump)), ux = (x1 - x0) / L, uy = (y1 - y0) / L, r = L / n / 2;
    for (let i = 0; i < n; i++) for (let k = 0; k <= 8; k++) { const a = Math.PI * (k / 8), along = (i + 0.5) * 2 * r - Math.cos(a) * r, out_ = Math.sin(a) * r * 0.9; pts.push([x0 + ux * along + nx * out_, y0 + uy * along + ny * out_]); }
  };
  edge(x, y, x + w, y, 0, -1); edge(x + w, y, x + w, y + h, 1, 0); edge(x + w, y + h, x, y + h, 0, 1); edge(x, y + h, x, y, -1, 0);
  poly(out, pts, 'note', 0.3, true);
}

// a table at (x, y) (top left). The first row is the header when `head` is set. Column widths follow the text.
export function table(out: Prim[], x: number, y: number, rows: string[][], size = 2.8, head = true, title = ''): { w: number; h: number } {
  const cols = Math.max(...rows.map(r => r.length), 1), cw = Array.from({ length: cols }, (_, c) => Math.max(8, ...rows.map(r => (r[c] ?? '').length * size * 0.6 + 4))), W = cw.reduce((a, b) => a + b, 0), rh = size * 2.2;
  let yy = y;
  if (title) { poly(out, [[x, yy], [x + W, yy], [x + W, yy + rh], [x, yy + rh]], 'tbl', 0.35, true); text(out, [x + W / 2, yy + rh * 0.68], title, size * 1.05, 'tbl', 'middle', 0, true); yy += rh; }
  rows.forEach((r, ri) => {
    let xx = x;
    for (let c = 0; c < cols; c++) { poly(out, [[xx, yy], [xx + cw[c], yy], [xx + cw[c], yy + rh], [xx, yy + rh]], 'tbl', 0.25, true); text(out, [xx + 1.6, yy + rh * 0.68], r[c] ?? '', size, 'tbl', 'start', 0, head && ri === 0); xx += cw[c]; }
    yy += rh;
  });
  return { w: W, h: yy - y };
}
export const fx = f1;
