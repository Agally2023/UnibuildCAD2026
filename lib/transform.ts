// Rotate and mirror: pure geometry transforms for the elements of the model.
type Pt = [number, number];
export type Xf = { kind: 'rot'; quarter: 1 | -1 } | { kind: 'mirror'; axis: 'x' | 'y' };   // quarter 1 = clockwise on screen (y points down)
const r2 = (n: number) => Math.round(n * 100) / 100;

export const mapPoint = (p: Pt, c: Pt, xf: Xf): Pt => {
  const dx = p[0] - c[0], dy = p[1] - c[1];
  if (xf.kind === 'rot') return xf.quarter === 1 ? [r2(c[0] - dy), r2(c[1] + dx)] : [r2(c[0] + dy), r2(c[1] - dx)];
  return xf.axis === 'x' ? [r2(c[0] - dx), r2(p[1])] : [r2(p[0]), r2(c[1] - dy)];   // 'x': mirror left-right, 'y': top-bottom
};

export function transformGeometry(g: any, c: Pt, xf: Xf): any {
  const M = (p: Pt) => mapPoint(p, c, xf), o = { ...g };
  if (g.start) o.start = M(g.start);
  if (g.end) o.end = M(g.end);
  if (g.at) o.at = M(g.at);
  if (g.poly) o.poly = g.poly.map(M);
  if (g.rect) { const a = M([g.rect[0], g.rect[1]]), b = M([g.rect[2], g.rect[3]]); o.rect = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; }
  if (Array.isArray(g.holes)) o.holes = g.holes.map((h: number[]) => { const a = M([h[0], h[1]]), b = M([h[2], h[3]]); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; });
  if (Array.isArray(g.rounds)) o.rounds = g.rounds.map((q: any) => ({ ...q, c: M(q.c) }));
  if (xf.kind === 'rot' && g.at && g.b != null && g.h != null) { o.b = g.h; o.h = g.b; }      // a column turned a quarter swaps its sides
  if (g.flip != null && xf.kind === 'mirror') o.flip = !g.flip;
  return o;
}

export function centreOf(list: any[]): Pt {
  const xs: number[] = [], ys: number[] = [];
  for (const g of list) { if (g.start) { xs.push(g.start[0], g.end[0]); ys.push(g.start[1], g.end[1]); } if (g.at) { xs.push(g.at[0]); ys.push(g.at[1]); } if (g.rect) { xs.push(g.rect[0], g.rect[2]); ys.push(g.rect[1], g.rect[3]); } if (g.poly) for (const p of g.poly) { xs.push(p[0]); ys.push(p[1]); } }
  return xs.length ? [r2((Math.min(...xs) + Math.max(...xs)) / 2), r2((Math.min(...ys) + Math.max(...ys)) / 2)] : [0, 0];
}
