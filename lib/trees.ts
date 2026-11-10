// Natural plants. Pure functions that describe a tree as a few lumpy crowns, tiers or fronds; components/Tree.tsx turns them into
// organic 3D shapes. Nothing here is regular: sizes, positions and shades vary from a seed, so no two trees are alike.
export type TreeKind = 'round' | 'pine' | 'palm' | 'cypress' | 'shrub';
export type Blob = { c: [number, number, number]; r: [number, number, number]; shade: number };   // shade -1 dark .. +1 light
export type Tier = { z: number; r: number; h: number; shade: number };
export type Frond = { a: number; len: number; droop: number; lift: number };

export const rand = (seed: number) => { let a = (seed * 2654435761) >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
// smooth value noise in 3D, range about -1..1, same answer for the same input
export function noise3(x: number, y: number, z: number, seed = 0): number {
  const h = (i: number, j: number, k: number) => { let n = (i * 374761393 + j * 668265263 + k * 2147483647 + seed * 1442695041) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return (((n ^ (n >>> 16)) >>> 0) / 4294967296) * 2 - 1; };
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi, s = (t: number) => t * t * (3 - 2 * t), u = s(fx), v = s(fy), w = s(fz), L = (a: number, b: number, t: number) => a + (b - a) * t;
  return L(L(L(h(xi, yi, zi), h(xi + 1, yi, zi), u), L(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v), L(L(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), L(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
}
export const trunkHeight = (kind: TreeKind, h: number) => (kind === 'round' ? h * 0.38 : kind === 'pine' ? h * 0.18 : kind === 'cypress' ? h * 0.1 : kind === 'palm' ? h * 0.92 : 0);
export const trunkRadius = (kind: TreeKind, h: number, r: number) => (kind === 'palm' ? Math.max(0.1, h * 0.028) : kind === 'cypress' ? Math.max(0.06, r * 0.12) : Math.max(0.08, Math.min(r * 0.16, h * 0.035)));

// crown of a broad-leaved tree or shrub: overlapping lumps heaped into a rounded, uneven dome
export function crown(kind: TreeKind, h: number, r: number, seed: number): Blob[] {
  const R = rand(seed + 11), out: Blob[] = [], t0 = trunkHeight(kind, h);
  if (kind === 'shrub') { const n = 5; for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + R(), d = r * 0.45 * R(); out.push({ c: [Math.cos(a) * d, Math.sin(a) * d, h * (0.3 + 0.25 * R())], r: [r * (0.5 + 0.25 * R()), r * (0.5 + 0.25 * R()), h * (0.32 + 0.12 * R())], shade: R() * 2 - 1 }); } return out; }
  if (kind === 'cypress') { const n = 7; for (let i = 0; i < n; i++) { const f = i / (n - 1), w = Math.sin(Math.PI * (0.18 + 0.78 * f)) ; out.push({ c: [(R() - 0.5) * r * 0.2, (R() - 0.5) * r * 0.2, t0 + (h - t0) * (0.12 + 0.76 * f)], r: [r * (0.35 + 0.65 * w) * (0.9 + 0.2 * R()), r * (0.35 + 0.65 * w) * (0.9 + 0.2 * R()), (h - t0) * 0.2], shade: R() * 2 - 1 }); } return out; }
  const n = 9, zc = t0 + (h - t0) * 0.5, hr = (h - t0) * 0.5;
  out.push({ c: [0, 0, zc + hr * 0.15], r: [r * 0.72, r * 0.72, hr * 0.78], shade: 0 });
  for (let i = 0; i < n; i++) { const a = i * 2.399 + R() * 0.6, d = r * (0.35 + 0.4 * R()), z = zc + hr * (-0.45 + 1.25 * R()); const k = 1 - Math.min(1, Math.abs(z - zc) / (hr * 1.2)) * 0.3; out.push({ c: [Math.cos(a) * d, Math.sin(a) * d, z], r: [r * (0.34 + 0.2 * R()) * k, r * (0.34 + 0.2 * R()) * k, hr * (0.3 + 0.18 * R())], shade: (z - zc) / hr * 0.7 + (R() - 0.5) * 0.6 }); }
  return out;
}
// conifer: drooping skirts, wide at the bottom and narrowing to the tip
export function tiers(h: number, r: number, seed: number): Tier[] {
  const R = rand(seed + 5), t0 = trunkHeight('pine', h), n = Math.max(5, Math.round(h / 0.9)), out: Tier[] = [];
  for (let i = 0; i < n; i++) { const f = i / (n - 1), z = t0 + (h - t0) * f * 0.86; out.push({ z, r: r * (1 - f * 0.88) * (0.88 + 0.24 * R()), h: (h - t0) * (0.34 - 0.1 * f), shade: R() * 2 - 1 }); }
  return out;
}
// palm crown: fronds fanned out round the top, the lower ones hanging
export function fronds(h: number, r: number, seed: number): Frond[] {
  const R = rand(seed + 3), n = 12, out: Frond[] = [];
  for (let i = 0; i < n; i++) out.push({ a: (i / n) * 6.283 + R() * 0.3, len: r * (0.85 + 0.35 * R()), droop: 0.35 + 0.5 * R(), lift: i % 3 === 0 ? 0.55 : 0.1 + 0.2 * R() });
  return out;
}
// the trunk of a palm leans a little: its centre line at height fraction f (0..1) is offset from the base
export const lean = (h: number, seed: number, f: number): [number, number] => { const R = rand(seed + 17), a = R() * 6.283, d = h * 0.07 * f * f; return [Math.cos(a) * d, Math.sin(a) * d]; };
// default size of a tree of a kind at the scale k used by the templates (k = 1 is a normal tree)
export function sizeOf(kind: TreeKind, k = 1): { h: number; r: number } {
  return kind === 'pine' ? { h: 5.5 * k, r: 1.3 * k } : kind === 'cypress' ? { h: 5.6 * k, r: 0.7 * k } : kind === 'palm' ? { h: 6 * k, r: 2.2 * k } : kind === 'shrub' ? { h: 0.9 * k, r: 0.6 * k } : { h: 4.8 * k, r: 1.9 * k };
}
