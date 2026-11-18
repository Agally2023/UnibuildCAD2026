// An assembly is made from the parts of one workspace: each part is placed at a position, optionally spread apart (exploded) along an axis.
// The result is one mesh for the drawing views plus a bill of materials with a box for every part (for balloons).
import { rebuild, type PartDoc } from './parts';
import type { Mesh, V3 } from './solid';

export type AsmItem = { name: string; at: V3; qty: number };
export type Asm = { on: boolean; items: AsmItem[]; explode: number; axis: 0 | 1 | 2 };
export type BomRow = { item: number; name: string; material: string; qty: number; mass: number; lo: V3; hi: V3 };

export const defaultAsm = (): Asm => ({ on: false, items: [], explode: 0, axis: 2 });
export function moved(m: Mesh, d: V3): Mesh { const v = m.v.slice(); for (let i = 0; i < v.length; i += 3) { v[i] += d[0]; v[i + 1] += d[1]; v[i + 2] += d[2]; } return { v, f: m.f }; }
export function joinMeshes(ms: Mesh[]): Mesh {
  const v: number[] = [], f: number[] = []; let off = 0;
  for (const m of ms) { for (const x of m.v) v.push(x); for (const i of m.f) f.push(i + off); off += m.v.length / 3; }
  return { v, f };
}
export function boxOf(m: Mesh): { lo: V3; hi: V3 } {
  const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.v.length; i += 3) for (let q = 0; q < 3; q++) { lo[q] = Math.min(lo[q], m.v[i + q]); hi[q] = Math.max(hi[q], m.v[i + q]); }
  return { lo, hi };
}
// put the parts next to each other along X with a gap, standing on the same floor
export function arrangeInRow(parts: PartDoc[], names: string[], gap = 20): AsmItem[] {
  let x = 0;
  return names.map(n => { const d = parts.find(p => p.name === n), m = d ? rebuild(d).mesh : { v: [], f: [] }, b = m.v.length ? boxOf(m) : { lo: [0, 0, 0] as V3, hi: [0, 0, 0] as V3 }, at: V3 = [x - b.lo[0], -b.lo[1], -b.lo[2]]; x += b.hi[0] - b.lo[0] + gap; return { name: n, at, qty: 1 }; });
}
export function buildAssembly(parts: PartDoc[], asm: Asm, material: (d: PartDoc) => string): { mesh: Mesh; bom: BomRow[]; mass: number } {
  const ms: Mesh[] = [], bom: BomRow[] = []; let mass = 0;
  asm.items.forEach((it, i) => {
    const d = parts.find(p => p.name === it.name); if (!d) return;
    const r = rebuild(d); if (!r.mesh.v.length) return;
    const e: V3 = [0, 0, 0]; e[asm.axis] = asm.explode * i;
    const m = moved(r.mesh, [it.at[0] + e[0], it.at[1] + e[1], it.at[2] + e[2]]), b = boxOf(m);
    ms.push(m); mass += (r.stats?.mass ?? 0) * it.qty;
    bom.push({ item: bom.length + 1, name: d.name, material: material(d), qty: it.qty, mass: r.stats?.mass ?? 0, lo: b.lo, hi: b.hi });
  });
  return { mesh: joinMeshes(ms), bom, mass };
}
