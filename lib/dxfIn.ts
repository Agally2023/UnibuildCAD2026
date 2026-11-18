// Reads the drawing entities of an ASCII DXF file (lines, circles, arcs, polylines, text) so that a drawing can be placed on a sheet.
// Coordinates come out with y pointing down, like the sheet. Splines, ellipses, hatches, blocks and dimensions are counted but not drawn.
import type { Prim } from './dwgTypes';

export type DxfImport = { prims: Prim[]; box: [number, number, number, number]; skipped: Record<string, number> };
type Pair = [number, string];

export function parseDxf(src: string): DxfImport {
  const L = src.split(/\r?\n/), pairs: Pair[] = [];
  for (let i = 0; i + 1 < L.length; i += 2) { const c = parseInt(L[i].trim(), 10); if (!isNaN(c)) pairs.push([c, L[i + 1].trim()]); }
  let i = 0; while (i < pairs.length && !(pairs[i][0] === 2 && pairs[i][1] === 'ENTITIES')) i++;
  const prims: Prim[] = [], skipped: Record<string, number> = {}, skip = (n: string) => { skipped[n] = (skipped[n] ?? 0) + 1; };
  const num = (g: Pair[], c: number, d = 0) => { const p = g.find(q => q[0] === c); return p ? parseFloat(p[1]) : d; };
  const P = (x: number, y: number): [number, number] => [x, -y];
  const ents: { t: string; g: Pair[] }[] = [];
  for (i++; i < pairs.length; i++) {
    if (pairs[i][0] === 0 && pairs[i][1] === 'ENDSEC') break;
    if (pairs[i][0] === 0) { const g: Pair[] = []; let j = i + 1; while (j < pairs.length && pairs[j][0] !== 0) g.push(pairs[j++]); ents.push({ t: pairs[i][1], g }); i = j - 1; }
  }
  const strip = (t: string) => t.replace(/\\P/g, ' ').replace(/\{?\\[A-Za-z][^;]*;/g, '').replace(/[{}]/g, '').replace(/%%c/gi, 'Ø').replace(/%%d/gi, '°').replace(/%%p/gi, '±');
  for (let k = 0; k < ents.length; k++) {
    const { t, g } = ents[k];
    if (t === 'LINE') prims.push({ k: 'l', a: P(num(g, 10), num(g, 20)), b: P(num(g, 11), num(g, 21)), layer: 'vis', w: 0.25 });
    else if (t === 'CIRCLE') prims.push({ k: 'c', c: P(num(g, 10), num(g, 20)), r: num(g, 40), w: 0.25, layer: 'vis' });
    else if (t === 'ARC') { const a0 = num(g, 50), a1 = num(g, 51), sweep = (((a1 - a0) % 360) + 360) % 360 || 360, n0 = (((-a1) % 360) + 360) % 360; prims.push({ k: 'a', c: P(num(g, 10), num(g, 20)), r: num(g, 40), a0: n0, a1: n0 + sweep, w: 0.25, layer: 'vis' }); }
    else if (t === 'LWPOLYLINE') { const pts: [number, number][] = []; let x = 0; for (const [c, v] of g) { if (c === 10) x = parseFloat(v); else if (c === 20) pts.push(P(x, parseFloat(v))); } if (pts.length > 1) prims.push({ k: 'p', pts, closed: (num(g, 70) & 1) === 1, w: 0.25, layer: 'vis' }); }
    else if (t === 'POLYLINE') { const pts: [number, number][] = [], closed = (num(g, 70) & 1) === 1; while (k + 1 < ents.length && ents[k + 1].t === 'VERTEX') { k++; pts.push(P(num(ents[k].g, 10), num(ents[k].g, 20))); } if (k + 1 < ents.length && ents[k + 1].t === 'SEQEND') k++; if (pts.length > 1) prims.push({ k: 'p', pts, closed, w: 0.25, layer: 'vis' }); }
    else if (t === 'TEXT' || t === 'MTEXT') { const s = strip(g.filter(q => q[0] === 3 || q[0] === 1).map(q => q[1]).join('')); if (s) prims.push({ k: 't', p: P(num(g, 10), num(g, 20)), s, size: num(g, 40, 2.5) || 2.5, anchor: 'start', rot: -num(g, 50), layer: 'note' }); }
    else if (t !== 'VERTEX' && t !== 'SEQEND') skip(t);
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; const pt = (x: number, y: number) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
  for (const p of prims) { if (p.k === 'l') { pt(...p.a); pt(...p.b); } else if (p.k === 'p') p.pts.forEach(q => pt(q[0], q[1])); else if (p.k === 'c' || p.k === 'a') { pt(p.c[0] - p.r, p.c[1] - p.r); pt(p.c[0] + p.r, p.c[1] + p.r); } else if (p.k === 't') pt(p.p[0], p.p[1]); }
  if (!isFinite(x0)) { x0 = y0 = 0; x1 = y1 = 1; }
  return { prims, box: [x0, y0, x1, y1], skipped };
}

// move and scale imported primitives to a place on the sheet
export function placeDxf(prims: Prim[], box: [number, number, number, number], x: number, y: number, s: number): Prim[] {
  const T = (p: [number, number]): [number, number] => [x + (p[0] - box[0]) * s, y + (p[1] - box[1]) * s];
  return prims.map((p): Prim => {
    if (p.k === 'l') return { ...p, a: T(p.a), b: T(p.b) };
    if (p.k === 'p') return { ...p, pts: p.pts.map(T) };
    if (p.k === 'c') return { ...p, c: T(p.c), r: p.r * s };
    if (p.k === 'a') return { ...p, c: T(p.c), r: p.r * s };
    if (p.k === 't') return { ...p, p: T(p.p), size: Math.max(1.2, p.size * s) };
    return p;
  });
}
