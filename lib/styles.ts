// Coloured, decorated building templates in regional styles (African, American, Chinese, European, Scandinavian, Japanese, Middle
// Eastern): houses, churches, schools and apartment buildings. They are made of the ordinary plan elements, each with a colour, plus
// 'deco' elements for lawns, paths, steps, spires, domes, trees and fences. Everything is in metres and stays editable.
import { Draft, type Building } from './buildings';

type Pt = [number, number];
type R4 = [number, number, number, number];
export type Pal = { wall: string; trim: string; roof: string; door: string; win: string; col: string; floor: string; ground: string; accent: string; stone: string };
type Form = 'flat' | 'gable' | 'hip' | 'mono';
const TINT = ['#fde2e4', '#e2ece9', '#dfe7fd', '#fff1e6', '#f0efeb', '#e9e3f5', '#eaf4d3', '#fbe8c8'];
const WOOD = '#8a5a2b', GREEN = '#3f8f4a', DARKG = '#2f6b3a', BARK = '#6b4a2f', WATER = '#4aa3df', WHITE = '#f5f3ee';

class SD extends Draft {
  constructor(storeys: { name: string; h: number }[], readonly pal: Pal) { super(storeys); }
  private put(s: number, type: string, g: any, key?: string, wall?: string) { this.els.push({ s, type, g, ...(key ? { key } : {}), ...(wall ? { wall } : {}) }); }
  W(s: number, a: Pt, b: Pt, o: { t?: number; color?: string; h?: number; core?: boolean } = {}): string {
    const key = `w${this.n++}`; this.put(s, 'wall', { start: a, end: b, height: o.h ?? this.h(s), thickness: o.t ?? 0.2, color: o.color ?? this.pal.wall, ...(o.core ? { core: true } : {}) }, key); return key;
  }
  bx(s: number, r: R4, o: { t?: number; color?: string; h?: number } = {}): string[] {
    const [x0, y0, x1, y1] = r; return [this.W(s, [x0, y0], [x1, y0], o), this.W(s, [x1, y0], [x1, y1], o), this.W(s, [x1, y1], [x0, y1], o), this.W(s, [x0, y1], [x0, y0], o)];
  }
  dr(s: number, wall: string, off: number, w = 1.0, o: { color?: string; h?: number } = {}) { this.put(s, 'door', { offset_m: off, width_m: w, color: o.color ?? this.pal.door, ...(o.h ? { h: o.h } : {}) }, undefined, wall); }
  wn(s: number, wall: string, off: number, w = 1.4, o: { color?: string; h?: number; sill?: number } = {}) { this.put(s, 'window', { offset_m: off, width_m: w, color: o.color ?? this.pal.win, ...(o.h ? { h: o.h } : {}), ...(o.sill !== undefined ? { sill: o.sill } : {}) }, undefined, wall); }
  // windows spread along a wall of length len, skipping the places in avoid
  spread(s: number, wall: string, len: number, count: number, w: number, avoid: number[] = [], o: { color?: string; h?: number; sill?: number } = {}) {
    for (let i = 0; i < count; i++) { const x = ((i + 0.5) * len) / count; if (avoid.some(a => Math.abs(a - x) < w / 2 + 0.7)) continue; this.wn(s, wall, x, w, o); }
  }
  C(s: number, x: number, y: number, size = 0.3, color?: string) { this.put(s, 'column', { at: [x, y], b: size, h: size, height: this.h(s), color: color ?? this.pal.col }); }
  F(s: number, r: R4, color?: string) { const H = this.h(s); this.put(s, 'slab', { rect: r, z0: +(H - 0.2).toFixed(2), z1: H, color: color ?? this.pal.floor }); }
  RF(s: number, r: R4, form: Form, pitch: number, over: number, color?: string, o: { z?: number; ridge?: 'x' | 'y'; flip?: boolean; t?: number } = {}) {
    const z0 = (o.z ?? this.h(s)), t = o.t ?? 0.2;
    this.put(s, 'roof', { rect: r, z0, z1: +(z0 + t).toFixed(2), color: color ?? this.pal.roof, ...(form !== 'flat' ? { form, pitch, overhang: over, ...(o.ridge ? { ridge: o.ridge } : {}), ...(o.flip ? { flip: true } : {}) } : {}) });
  }
  Z(s: number, r: R4, name: string, color?: string) { this.put(s, 'zone', { rect: r, poly: [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]], name, color: color ?? TINT[this.n++ % TINT.length] }); }
  // ---- decoration ----
  dBox(s: number, r: R4, z0: number, z1: number, color: string) { this.put(s, 'deco', { shape: 'box', rect: r, z0, z1, color }); }
  dPyr(s: number, r: R4, z0: number, z1: number, color: string) { this.put(s, 'deco', { shape: 'pyramid', rect: r, z0, z1, color }); }
  dCyl(s: number, at: Pt, r: number, z0: number, z1: number, color: string) { this.put(s, 'deco', { shape: 'cyl', at, r, z0, z1, color }); }
  dCone(s: number, at: Pt, r: number, z0: number, z1: number, color: string) { this.put(s, 'deco', { shape: 'cone', at, r, z0, z1, color }); }
  tree(x: number, y: number, k = 1, kind: 'pine' | 'round' | 'palm' | 'cypress' = 'round') {
    if (kind === 'palm') { this.dCyl(0, [x, y], 0.16 * k, 0, 5.2 * k, BARK); this.dCone(0, [x, y], 1.7 * k, 4.8 * k, 5.8 * k, GREEN); return; }
    if (kind === 'cypress') { this.dCyl(0, [x, y], 0.12 * k, 0, 0.8 * k, BARK); this.dCone(0, [x, y], 0.7 * k, 0.6 * k, 5.2 * k, DARKG); return; }
    this.dCyl(0, [x, y], 0.16 * k, 0, 1.7 * k, BARK);
    if (kind === 'pine') this.dCone(0, [x, y], 1.2 * k, 1.1 * k, 5 * k, DARKG); else this.dCyl(0, [x, y], 1.3 * k, 1.7 * k, 3.5 * k, GREEN);
  }
  lawn(r: R4, color?: string) { this.dBox(0, r, -0.08, -0.01, color ?? this.pal.ground); }
  paving(r: R4, color?: string, z = 0.02) { this.dBox(0, r, -0.01, z, color ?? this.pal.stone); }
  // a low fence round a rectangle with a gap in the front (south) side
  fence(r: R4, color: string, gap?: [number, number], h = 1.0) {
    const [x0, y0, x1, y1] = r, t = 0.1;
    this.dBox(0, [x0, y0, x1, y0 + t], 0, h, color); this.dBox(0, [x0, y0, x0 + t, y1], 0, h, color); this.dBox(0, [x1 - t, y0, x1, y1], 0, h, color);
    if (gap) { this.dBox(0, [x0, y1 - t, gap[0], y1], 0, h, color); this.dBox(0, [gap[1], y1 - t, x1, y1], 0, h, color); } else this.dBox(0, [x0, y1 - t, x1, y1], 0, h, color);
  }
  steps(s: number, x0: number, x1: number, y: number, n: number, color: string, depth = 0.32) { for (let i = 0; i < n; i++) this.dBox(s, [x0 - i * 0.05, y + i * depth, x1 + i * 0.05, y + (i + 1) * depth], 0, 0.18 * (n - i), color); }
  parapet(s: number, r: R4, h: number, color: string, t = 0.2) { const [x0, y0, x1, y1] = r, z = this.h(s); this.dBox(s, [x0, y0, x1, y0 + t], z, z + h, color); this.dBox(s, [x0, y1 - t, x1, y1], z, z + h, color); this.dBox(s, [x0, y0 + t, x0 + t, y1 - t], z, z + h, color); this.dBox(s, [x1 - t, y0 + t, x1, y1 - t], z, z + h, color); }
  balcony(s: number, x0: number, x1: number, y: number, depth: number, slab: string, rail: string) { this.dBox(s, [x0, y, x1, y + depth], -0.2, 0, slab); this.dBox(s, [x0, y + depth - 0.06, x1, y + depth], 0, 1.05, rail); }
  fin(b: Omit<Building, 'els' | 'storeys'>): Building { return this.done(b); }
}
const names = (n: number, h: number) => Array.from({ length: n }, (_, i) => ({ name: i ? `Floor ${i}` : 'Ground floor', h }));

// ---------- houses on a rectangular plan ----------
type VO = {
  key: string; label: string; region: string; blurb: string; pal: Pal; W: number; D: number; n: number; h: number;
  roof: [Form, number, number]; ridge?: 'x' | 'y'; veranda?: boolean; portico?: boolean; chimney?: boolean; garage?: boolean; balcony?: boolean; shutters?: string; plinth?: boolean;
  fence?: string; trees?: ['pine' | 'round' | 'palm' | 'cypress', number][]; parapet?: boolean; wide?: boolean; fenceGap?: boolean; x?: (d: SD, W: number, D: number) => void;
};
function rooms(d: SD, s: number, W: number, D: number, upper: boolean) {
  const mid = D * 0.5, nb = Math.max(3, Math.round(W / 4)), hall = d.W(s, [0, mid], [W, mid], { t: 0.1, color: d.pal.trim });
  for (let i = 0; i < nb; i++) { d.dr(s, hall, ((i + 0.5) * W) / nb, 0.9); if (i) d.W(s, [(i * W) / nb, 0], [(i * W) / nb, mid], { t: 0.1, color: d.pal.trim }); d.Z(s, [(i * W) / nb + 0.15, 0.15, ((i + 1) * W) / nb - 0.15, mid - 0.15], i === 0 ? 'Main bedroom' : `Bedroom ${i + 1}`); }
  const xp = W * 0.58, p = d.W(s, [xp, mid], [xp, D], { t: 0.1, color: d.pal.trim }); d.dr(s, p, (D - mid) * 0.35, 0.9);
  d.Z(s, [0.15, mid + 0.15, xp - 0.15, D - 0.15], upper ? 'Lounge' : 'Living and dining'); d.Z(s, [xp + 0.15, mid + 0.15, W - 0.15, D - 0.15], upper ? 'Study' : 'Kitchen');
}
function villa(o: VO): Building {
  const { pal, W, D, n, h } = o, d = new SD(names(n, h), pal), front = D, doorX = o.wide ? W * 0.3 : W * 0.5;
  const [mx0, my0, mx1, my1] = [-6, -5, W + (o.garage ? 9 : 6), D + (o.veranda || o.portico ? 8 : 6)];
  d.lawn([mx0, my0, mx1, my1]);
  if (o.plinth) d.dBox(0, [-0.15, -0.15, W + 0.15, D + 0.15], 0, 0.35, pal.stone);
  for (let s = 0; s < n; s++) {
    const k = d.bx(s, [0, 0, W, D]);
    d.spread(s, k[0], W, Math.max(2, Math.round(W / 3.4)), o.wide ? 2.4 : 1.4, [], { h: o.wide ? 2.2 : undefined, sill: o.wide ? 0.4 : undefined });
    d.spread(s, k[2], W, Math.max(2, Math.round(W / 3.4)), o.wide ? 2.4 : 1.4, s === 0 ? [doorX] : [], { h: o.wide ? 2.2 : undefined, sill: o.wide ? 0.4 : undefined });
    d.spread(s, k[1], D, 2, 1.2); d.spread(s, k[3], D, 2, 1.2);
    if (s === 0) { d.dr(0, k[2], doorX, 1.1, { h: 2.3 }); d.dr(0, k[0], W * 0.8, 0.9); }
    rooms(d, s, W, D, s > 0); d.F(s, [0, 0, W, D]);
    if (o.shutters && s < 2) for (let i = 0; i < Math.max(2, Math.round(W / 3.4)); i++) { const x = ((i + 0.5) * W) / Math.max(2, Math.round(W / 3.4)); if (s === 0 && Math.abs(x - doorX) < 2) continue; d.dBox(s, [x - 1.0, D, x - 0.75, D + 0.08], 0.9, 2.3, o.shutters); d.dBox(s, [x + 0.75, D, x + 1.0, D + 0.08], 0.9, 2.3, o.shutters); }
  }
  if (n > 1) d.stair(0, [0.3, D * 0.5 + 0.3, 1.5, D - 0.3]);
  const top = n - 1;
  if (o.roof[0] === 'flat') { d.RF(top, [-0.2, -0.2, W + 0.2, D + 0.2], 'flat', 0, 0); if (o.parapet) d.parapet(top, [-0.2, -0.2, W + 0.2, D + 0.2], 0.8, pal.wall); }
  else d.RF(top, [0, 0, W, D], o.roof[0], o.roof[1], o.roof[2], pal.roof, { ridge: o.ridge });
  if (o.veranda) {
    const vd = 2.3; d.dBox(0, [0, D, W, D + vd], 0, 0.22, pal.floor);
    const np = Math.max(3, Math.round(W / 3)); for (let i = 0; i <= np; i++) d.dBox(0, [(i * (W - 0.2)) / np, D + vd - 0.2, (i * (W - 0.2)) / np + 0.2, D + vd], 0.22, h - 0.55, pal.col);
    d.RF(0, [-0.3, D - 0.1, W + 0.3, D + vd + 0.3], 'mono', 9, 0, pal.roof, { z: h - 0.75, ridge: 'x', flip: true });
    d.steps(0, doorX - 1.2, doorX + 1.2, D + vd, 3, pal.stone);
  } else if (o.portico) {
    const x0 = W * 0.3, x1 = W * 0.7, ph = h * n;
    d.dBox(0, [x0, D, x1, D + 2.6], 0, 0.3, pal.stone); d.steps(0, x0 + 0.3, x1 - 0.3, D + 2.6, 3, pal.stone);
    for (let i = 0; i < 4; i++) d.dCyl(0, [x0 + 0.4 + (i * (x1 - x0 - 0.8)) / 3, D + 2.2], 0.22, 0.3, ph - 0.3, pal.trim);
    d.RF(n - 1, [x0 - 0.2, D - 0.2, x1 + 0.2, D + 2.8], 'gable', 24, 0, pal.trim, { z: h - 0.4, ridge: 'y' });
  } else d.steps(0, doorX - 0.9, doorX + 0.9, D, 2, pal.stone);
  if (o.chimney) d.dBox(top, [W * 0.8, D * 0.35, W * 0.8 + 0.9, D * 0.35 + 0.9], h * 0.3, h + (o.roof[0] === 'flat' ? 1.6 : 2.6), '#8c4a37');
  if (o.garage) {
    const g0 = W, g1 = W + 3.8, gy = D - 6.2, gk = [d.W(0, [g0, gy], [g1, gy]), d.W(0, [g1, gy], [g1, D]), d.W(0, [g1, D], [g0, D])];
    d.dr(0, gk[2], 1.9, 2.8, { h: 2.2, color: pal.trim }); d.F(0, [g0, gy, g1, D], pal.stone); d.RF(0, [g0, gy, g1, D], 'gable', 18, 0.5, pal.roof, { ridge: 'y' });
    d.paving([g0, D, g1, D + 7].map(v => v) as R4, '#8f959b');
  }
  if (o.balcony && n > 1) { d.balcony(1, W * 0.3, W * 0.7, D, 1.5, pal.floor, pal.trim); }
  d.paving([doorX - 0.7, D + (o.veranda ? 2.6 : o.portico ? 3.6 : 0.6), doorX + 0.7, D + 6.5], '#cdbf9f');
  (o.trees ?? []).forEach(([kind, k], i) => { const side = i % 2 ? 1 : -1; d.tree(side < 0 ? -2.5 - i : W + 2.5 + i, D * 0.3 + i * 2.2, k, kind); });
  if (o.fence) d.fence([-5, -4, W + (o.garage ? 8 : 5), D + 6], o.fence, o.fenceGap === false ? undefined : [doorX - 1.2, doorX + 1.2]);
  o.x?.(d, W, D);
  return d.fin({ key: o.key, label: o.label, group: o.region, blurb: o.blurb });
}

const P = (p: Partial<Pal> & Pick<Pal, 'wall' | 'roof'>): Pal => ({ trim: '#f4efe4', door: '#5a3a22', win: '#a9d4ea', col: '#e8dfcf', floor: '#d9c7a4', ground: '#86c06b', accent: '#c0392b', stone: '#b9b3a8', ...p });

// ---------- African ----------
const kenyanBungalow = () => villa({ key: 'af-bungalow', label: 'House · Kenyan bungalow', region: 'African', blurb: '13 x 9.5 m, cream walls, red mabati roof, veranda', pal: P({ wall: '#f3e2bd', trim: '#8b4a2b', roof: '#b23a2e', door: '#2e7d32', win: '#9fd6e8', col: '#8b4a2b', floor: '#d6b98c', ground: '#9ccf6f' }), W: 13, D: 9.5, n: 1, h: 3, roof: ['gable', 20, 0.8], veranda: true, plinth: true, fence: '#8b4a2b', trees: [['round', 1.2], ['palm', 1], ['round', 0.9]] });
const swahiliHouse = () => villa({ key: 'af-swahili', label: 'House · Swahili coastal house', region: 'African', blurb: '11 x 11 m, whitewashed, flat roof with parapet, carved door, balcony', pal: P({ wall: '#fbf6ea', trim: '#1f8a8a', roof: '#e9dfc9', door: '#6b3f1d', win: '#7fd0d0', col: '#6b3f1d', floor: '#e8d9b8', ground: '#e2cf9f', accent: '#1f8a8a' }), W: 11, D: 11, n: 2, h: 3.2, roof: ['flat', 0, 0], parapet: true, balcony: true, shutters: '#1f8a8a', plinth: true, trees: [['palm', 1.2], ['palm', 1]], fence: '#fbf6ea',
  x: (d, W, D) => { d.dBox(0, [W * 0.5 - 1.3, D, W * 0.5 + 1.3, D + 0.15], 0, 2.6, '#6b3f1d'); } });
function homestead(): Building {
  const pal = P({ wall: '#d99b5b', trim: '#7b4a22', roof: '#c9a227', door: '#5a2e12', win: '#8a5a2b', col: '#7b4a22', floor: '#caa573', ground: '#d8b985', stone: '#bfa07a', accent: '#c0392b' });
  const d = new SD([{ name: 'Ground floor', h: 2.4 }], pal);
  d.lawn([-8, -8, 34, 28], '#d8b985');
  const hut = (cx: number, cy: number, r: number, name: string, band: string) => {
    const pts: Pt[] = Array.from({ length: 8 }, (_, i) => [cx + r * Math.cos((i * Math.PI) / 4 + Math.PI / 8), cy + r * Math.sin((i * Math.PI) / 4 + Math.PI / 8)]);
    const keys = pts.map((p, i) => d.W(0, p, pts[(i + 1) % 8], { t: 0.3, color: i % 2 ? band : pal.wall }));
    d.dr(0, keys[2], Math.hypot(pts[3][0] - pts[2][0], pts[3][1] - pts[2][1]) / 2, 0.9); d.wn(0, keys[5], 1.2, 0.7, { color: '#8a5a2b' });
    d.Z(0, [cx - r * 0.7, cy - r * 0.7, cx + r * 0.7, cy + r * 0.7], name);
    d.dCone(0, [cx, cy], r * 1.28, 2.1, 5.2, pal.roof); d.dCyl(0, [cx, cy], 0.1, 5.1, 5.8, BARK);
  };
  hut(5, 5, 3.4, 'Main house', '#c0562f'); hut(14, 4, 2.7, 'Bedroom hut', '#2e86a6'); hut(5, 14, 2.7, 'Kitchen hut', '#c0562f');
  d.dCyl(0, [16, 14], 1.1, 0.7, 2.0, '#9c6b3a'); d.dCone(0, [16, 14], 1.5, 2.0, 3.4, pal.roof); d.dBox(0, [15.4, 15.2, 16.6, 16.4], 0, 0.7, BARK); d.Z(0, [15, 13, 17, 15], 'Granary');
  const f: Pt[] = [[-3, -3], [21, -3], [21, 20], [-3, 20]]; f.forEach((p, i) => d.W(0, p, f[(i + 1) % 4], { t: 0.18, h: 1.3, color: '#8b5a2b' }));
  d.tree(22, 3, 1.5, 'round'); d.tree(-5, 12, 1.2, 'round'); d.tree(23, 15, 1, 'palm'); d.paving([8.3, 4.2, 11.5, 5.8], '#b99a6b'); d.paving([3.2, 8.6, 4.8, 11.5], '#b99a6b');
  return d.fin({ key: 'af-homestead', label: 'House · Rondavel homestead', group: 'African', blurb: 'Three round huts with thatched cones, granary, fenced compound', });
}

// ---------- American ----------
const colonial = () => villa({ key: 'us-colonial', label: 'House · Colonial two-storey', region: 'American', blurb: '14 x 10 m, brick, white portico columns, shutters, picket fence', pal: P({ wall: '#a5432f', trim: '#f4f4f0', roof: '#4b4f58', door: '#1f3a5f', win: '#bfd9ea', col: '#f4f4f0', floor: '#cfc3ad', ground: '#7fc063', stone: '#cfcfca' }), W: 14, D: 10, n: 2, h: 3, roof: ['hip', 26, 0.5], portico: true, shutters: '#1f3a5f', chimney: true, plinth: true, fence: '#f4f4f0', trees: [['round', 1.4], ['round', 1.1]] });
const ranch = () => villa({ key: 'us-ranch', label: 'House · Suburban ranch with garage', region: 'American', blurb: '16 x 9 m, single storey, sage siding, attached garage, driveway', pal: P({ wall: '#9db4a0', trim: '#f1ead9', roof: '#5d544c', door: '#8a3b2a', win: '#c4e0f0', col: '#f1ead9', floor: '#cfc7b4', ground: '#86c86a', stone: '#c9c5bc' }), W: 16, D: 9, n: 1, h: 2.8, roof: ['gable', 18, 0.6], garage: true, chimney: true, plinth: true, trees: [['round', 1.3], ['round', 1], ['pine', 1.1]] });

// ---------- European ----------
const cottage = () => villa({ key: 'eu-cottage', label: 'House · English country cottage', region: 'European', blurb: '10 x 8 m, brick, steep thatch-brown roof, chimney, garden wall', pal: P({ wall: '#b5573d', trim: '#f1e9d8', roof: '#7a5c3e', door: '#2b5d34', win: '#cfe3f0', col: '#f1e9d8', floor: '#cdbd9b', ground: '#7dbd63', stone: '#a9a39a' }), W: 10, D: 8, n: 2, h: 2.6, roof: ['gable', 45, 0.35], chimney: true, plinth: true, fence: '#a9a39a', trees: [['round', 1.3], ['round', 1], ['round', 0.9]],
  x: (d, W, D) => { d.dBox(0, [-1.5, -1.2, W + 1.5, 0], 0, 0.1, '#c9a3d6'); d.dBox(0, [-2.5, D + 1, 2, D + 3.5], 0.01, 0.35, '#e0a9c1'); d.dBox(0, [W - 2, D + 1, W + 2.5, D + 3.5], 0.01, 0.35, '#f2c14e'); } });
const medVilla = () => villa({ key: 'eu-med', label: 'House · Mediterranean villa', region: 'European', blurb: '15 x 11 m, ochre stucco, terracotta hip roof, loggia, cypress trees', pal: P({ wall: '#f4dfb0', trim: '#f9f1de', roof: '#c4572f', door: '#5a3a22', win: '#7fb3d5', col: '#e8d9b4', floor: '#e3c99a', ground: '#9acb74', accent: '#2b8a9e', stone: '#d8cdb6' }), W: 15, D: 11, n: 2, h: 3.2, roof: ['hip', 20, 0.7], veranda: true, balcony: true, shutters: '#2b8a9e', plinth: true, trees: [['cypress', 1.2], ['cypress', 1.1], ['cypress', 1], ['round', 1]],
  x: (d, W, D) => { d.dBox(0, [W + 1.2, 1, W + 5, 4.5], 0, 0.15, '#4aa3df'); d.dBox(0, [W + 0.9, 0.7, W + 5.3, 4.8], 0, 0.05, '#e8dcc2'); } });
// ---------- Scandinavian ----------
const stuga = () => villa({ key: 'sc-stuga', label: 'House · Swedish timber stuga', region: 'Scandinavian', blurb: '9 x 6.5 m, falu red boards, white trim, steep roof, porch', pal: P({ wall: '#9c2b1e', trim: '#f5f5f0', roof: '#2f3236', door: '#d9b36c', win: '#dce9f2', col: '#f5f5f0', floor: '#c9a46a', ground: '#8fcf72', stone: '#aab0b5' }), W: 9, D: 6.5, n: 1, h: 2.6, roof: ['gable', 35, 0.6], veranda: true, chimney: true, plinth: true, trees: [['pine', 1.3], ['pine', 1.5], ['pine', 1.1], ['pine', 1.2]],
  x: (d, W, D) => { d.dBox(0, [W + 1.5, 0.5, W + 4.5, 2.2], 0, 2.2, '#8a5a2b'); d.dBox(0, [-5, -4, -2.5, -3.5], 0, 1.0, '#8a5a2b'); } });
const nordicModern = () => villa({ key: 'sc-modern', label: 'House · Nordic modern house', region: 'Scandinavian', blurb: '14 x 8 m, black cladding, timber accents, mono roof, big glazing, deck', pal: P({ wall: '#2a2d32', trim: '#c9a46a', roof: '#3a3d42', door: '#c9a46a', win: '#b5d9ec', col: '#c9a46a', floor: '#d4b27a', ground: '#8fcf72', stone: '#aab0b5' }), W: 14, D: 8, n: 2, h: 3, roof: ['mono', 8, 0.5], ridge: 'x', wide: true, balcony: true, trees: [['pine', 1.4], ['pine', 1.2], ['pine', 1.3]],
  x: (d, W, D) => { d.dBox(0, [0, D, W * 0.6, D + 3.2], 0, 0.3, '#c9a46a'); d.dBox(0, [W * 0.62, D + 0.4, W * 0.62 + 4, D + 2.4], 0.01, 0.12, '#cfd6dc'); } });
// ---------- Japanese ----------
const minka = () => villa({ key: 'jp-minka', label: 'House · Japanese minka', region: 'Japanese', blurb: '12 x 9 m, deep hip roof, timber posts, engawa veranda, gravel garden', pal: P({ wall: '#f2efe6', trim: '#6b4a2f', roof: '#4a4d52', door: '#f1e8cf', win: '#efe6cf', col: '#6b4a2f', floor: '#c49a62', ground: '#8fbf74', stone: '#d8d4c8', accent: '#b5532a' }), W: 12, D: 9, n: 1, h: 2.8, roof: ['hip', 28, 1.4], veranda: true, plinth: true, wide: false, fence: '#8a6a45', trees: [['pine', 1.3], ['round', 1]],
  x: (d, W, D) => { d.paving([-3, D + 3, W + 3, D + 7.5], '#dcd8cc'); for (let i = 0; i < 5; i++) d.dCyl(0, [W * 0.5 - 2 + i * 1.1, D + 3.2 + (i % 2) * 0.6], 0.3, 0, 0.08, '#8a8a85'); d.dCyl(0, [W + 1.5, D + 4], 0.28, 0, 1.2, '#9a9a96'); d.dCone(0, [W + 1.5, D + 4], 0.5, 1.2, 1.6, '#7a7a76'); } });

// ---------- Chinese ----------
function siheyuan(): Building {
  const pal = P({ wall: '#f1ece0', trim: '#b3261e', roof: '#5b5f66', door: '#b3261e', win: '#7a5a3a', col: '#b3261e', floor: '#cfc8b8', ground: '#9acb7a', stone: '#c8c0b0', accent: '#d4a017' });
  const d = new SD([{ name: 'Ground floor', h: 3.4 }], pal);
  d.lawn([-6, -6, 30, 31]); d.paving([-1, -1, 25, 26], '#d9d2c3');
  const wing = (r: R4, rooms: number, vertical: boolean, doorSide: 'S' | 'N' | 'E' | 'W', ridge: 'x' | 'y', name: string) => {
    const k = d.bx(0, r, { color: pal.wall, t: 0.3 }), [x0, y0, x1, y1] = r;
    const len = vertical ? y1 - y0 : x1 - x0, cw = len / rooms, idx = { S: 2, N: 0, E: 1, W: 3 }[doorSide];
    for (let i = 0; i < rooms; i++) {
      d.dr(0, k[idx], (i + 0.5) * cw, 1.4, { h: 2.6 }); if (i) { vertical ? d.W(0, [x0, y0 + i * cw], [x1, y0 + i * cw], { t: 0.15 }) : d.W(0, [x0 + i * cw, y0], [x0 + i * cw, y1], { t: 0.15 }); }
      const back = k[(idx + 2) % 4]; d.wn(0, back, (i + 0.5) * cw, 1.6, { color: '#7a5a3a' });
      d.Z(0, vertical ? [x0 + 0.2, y0 + i * cw + 0.2, x1 - 0.2, y0 + (i + 1) * cw - 0.2] : [x0 + i * cw + 0.2, y0 + 0.2, x0 + (i + 1) * cw - 0.2, y1 - 0.2], `${name} ${i + 1}`);
    }
    d.RF(0, r, 'gable', 30, 0.9, pal.roof, { ridge });
  };
  wing([3, 2, 21, 8.5], 3, false, 'S', 'x', 'Main hall'); wing([17.5, 10.5, 21, 18.5], 3, true, 'W', 'y', 'East room'); wing([3, 10.5, 6.5, 18.5], 3, true, 'E', 'y', 'West room'); wing([8.5, 19.8, 15.5, 23.2], 1, false, 'N', 'x', 'Gate room');
  for (let i = 0; i <= 6; i++) d.C(0, 3.3 + i * 2.9, 8.9, 0.34, pal.col);
  d.dBox(0, [3, 8.5, 21, 9.4], 0, 0.3, '#b9b2a2'); d.steps(0, 11, 13, 9.4, 2, '#b9b2a2');
  const gate = d.bx(0, [0, 0, 24, 25], { t: 0.3, h: 3.0, color: '#8f8f8a' }); void gate;
  d.dBox(0, [10.8, 24.9, 13.2, 25.3], 0, 2.9, pal.col); d.dPyr(0, [10.2, 24.6, 13.8, 25.6], 2.9, 4.2, pal.roof);
  d.dCyl(0, [12, 14], 1.6, 0, 0.35, '#7fb8d9'); d.dCyl(0, [12, 14], 1.8, 0, 0.45, '#b9b2a2'); d.dCyl(0, [12, 14], 1.55, 0.3, 0.37, WATER);
  d.tree(8, 12, 1.1, 'round'); d.tree(16, 16, 1.1, 'round'); d.tree(-2.5, 4, 1.4, 'round'); d.tree(26.5, 20, 1.3, 'round'); d.dCone(0, [12, 6], 0.001, 0, 0.001, '#fff');
  return d.fin({ key: 'cn-siheyuan', label: 'House · Siheyuan courtyard house', group: 'Chinese', blurb: '24 x 25 m walled compound: main hall, wings, gate, pond courtyard, grey tiled roofs, red columns' });
}
// ---------- Middle Eastern ----------
function courtyardHouse(): Building {
  const pal = P({ wall: '#ead6a8', trim: '#1f8a8a', roof: '#e0cfa2', door: '#1f8a8a', win: '#7fd0d0', col: '#c9b27c', floor: '#e5d2a2', ground: '#e6d3a0', stone: '#d6c597', accent: '#1f8a8a' });
  const d = new SD(names(2, 3.2), pal), W = 22, D = 20, cx0 = 7, cy0 = 6.5, cx1 = 15, cy1 = 13.5;
  d.lawn([-6, -5, W + 6, D + 8], '#e6d3a0');
  for (let s = 0; s < 2; s++) {
    const o = d.bx(s, [0, 0, W, D], { t: 0.3 }), i = d.bx(s, [cx0, cy0, cx1, cy1], { t: 0.25 });
    d.spread(s, o[0], W, 5, 1.2, [], { h: 1.4, sill: 1.0 }); d.spread(s, o[2], W, 5, 1.2, s === 0 ? [W / 2] : [], { h: 1.4, sill: 1.0 }); d.spread(s, o[1], D, 3, 1.2); d.spread(s, o[3], D, 3, 1.2);
    d.spread(s, i[0], cx1 - cx0, 2, 1.6, [], { h: 2.2 }); d.spread(s, i[2], cx1 - cx0, 2, 1.6, [], { h: 2.2 }); d.spread(s, i[1], cy1 - cy0, 2, 1.6, [], { h: 2.2 }); d.spread(s, i[3], cy1 - cy0, 2, 1.6, [], { h: 2.2 });
    d.W(s, [0, cy0], [cx0, cy0], { t: 0.15 }); d.W(s, [cx1, cy0], [W, cy0], { t: 0.15 }); d.W(s, [0, cy1], [cx0, cy1], { t: 0.15 }); d.W(s, [cx1, cy1], [W, cy1], { t: 0.15 });
    d.Z(s, [0.3, 0.3, W - 0.3, cy0 - 0.3], s ? 'Bedrooms' : 'Majlis (reception)'); d.Z(s, [0.3, cy1 + 0.3, W - 0.3, D - 0.3], s ? 'Bedrooms' : 'Family hall'); d.Z(s, [0.3, cy0 + 0.3, cx0 - 0.3, cy1 - 0.3], s ? 'Bedroom' : 'Kitchen'); d.Z(s, [cx1 + 0.3, cy0 + 0.3, W - 0.3, cy1 - 0.3], s ? 'Bedroom' : 'Dining');
    d.F(s, [0, 0, W, cy0], pal.floor); d.F(s, [0, cy1, W, D], pal.floor); d.F(s, [0, cy0, cx0, cy1], pal.floor); d.F(s, [cx1, cy0, W, cy1], pal.floor);
    if (s === 0) d.dr(0, o[2], W / 2, 1.6, { h: 2.6 });
  }
  d.stair(0, [0.4, D - 3.2, 3.4, D - 0.4]);
  [[0, 0, W, cy0], [0, cy1, W, D], [0, cy0, cx0, cy1], [cx1, cy0, W, cy1]].forEach(r => { d.RF(1, r as R4, 'flat', 0, 0, pal.roof); d.parapet(1, r as R4, 0.9, pal.wall); });
  d.dCyl(0, [11, 10], 1.2, 0, 0.45, '#b9a97a'); d.dCyl(0, [11, 10], 1.0, 0.4, 0.5, WATER); d.dCyl(0, [11, 10], 0.15, 0.4, 1.4, '#b9a97a'); d.paving([cx0 + 0.3, cy0 + 0.3, cx1 - 0.3, cy1 - 0.3], '#d8c593', 0.05);
  d.tree(9, 8, 1.1, 'palm'); d.tree(13, 12, 1.1, 'palm'); d.tree(-3, 5, 1.3, 'palm'); d.tree(W + 3, 16, 1.2, 'palm');
  d.dBox(0, [W / 2 - 1.6, D, W / 2 + 1.6, D + 0.5], 0, 3.0, pal.trim);
  return d.fin({ key: 'me-courtyard', label: 'House · Courtyard villa', group: 'Middle Eastern', blurb: '22 x 20 m, two floors round a fountain courtyard, flat roofs with parapets, palms' });
}

// ---------- churches ----------
type CO = { key: string; label: string; region: string; blurb: string; pal: Pal; W: number; L: number; h: number; pitch: number; tower: 'bell' | 'twin' | 'spire' | 'detached' | 'dome' | 'none'; th?: number; sh?: number; transept?: boolean; apse?: boolean; buttress?: boolean; trees?: ['pine' | 'round' | 'palm' | 'cypress', number][]; roofForm?: Form };
function church(o: CO): Building {
  const { W, L, h, pal } = o, d = new SD([{ name: 'Ground floor', h }], pal), th = o.th ?? 9, sh = o.sh ?? 4, GOLD = '#d4a017';
  d.lawn([-12, -14, W + 12, L + 14]); d.paving([W / 2 - 1.3, -14, W / 2 + 1.3, -2], pal.stone);
  const n = d.bx(0, [0, 0, W, L], { t: 0.4 });
  d.dr(0, n[0], W / 2, 2.2, { h: 2.9 }); d.spread(0, n[1], L, Math.max(2, Math.floor(L / 3.6)), 1.2, [], { h: 3, sill: 1.1 }); d.spread(0, n[3], L, Math.max(2, Math.floor(L / 3.6)), 1.2, [], { h: 3, sill: 1.1 });
  d.wn(0, n[2], W / 2, 1.8, { h: 2.4, sill: 1.6, color: pal.accent });
  d.Z(0, [0.4, 0.4, W - 0.4, L * 0.72], 'Nave'); d.Z(0, [0.4, L * 0.72, W - 0.4, L - 0.4], 'Sanctuary');
  for (let i = 0; i < 6; i++) { const y = 4 + i * 1.5; if (y > L * 0.7) break; d.dBox(0, [1.2, y, W / 2 - 1, y + 0.6], 0, 0.9, WOOD); d.dBox(0, [W / 2 + 1, y, W - 1.2, y + 0.6], 0, 0.9, WOOD); }
  d.dBox(0, [W / 2 - 0.6, 0.5, W / 2 + 0.6, L * 0.72], 0.01, 0.03, pal.accent); d.dBox(0, [W / 2 - 1.3, L - 2.6, W / 2 + 1.3, L - 1.7], 0, 1, WHITE); d.dBox(0, [W / 2 - 2.5, L * 0.72, W / 2 + 2.5, L * 0.72 + 0.4], 0, 0.3, pal.stone);
  const dome = o.tower === 'dome';
  d.RF(0, [0, 0, W, L], dome ? 'flat' : (o.roofForm ?? 'gable'), o.pitch, 0.5, pal.roof, { ridge: 'y' });
  const cross = (x: number, y: number, z: number) => { d.dBox(0, [x - 0.08, y - 0.08, x + 0.08, y + 0.08], z, z + 1.5, GOLD); d.dBox(0, [x - 0.5, y - 0.08, x + 0.5, y + 0.08], z + 0.8, z + 1.0, GOLD); };
  const tower = (r: R4, door: boolean) => {
    const k = d.bx(0, r, { t: 0.4, h: th, color: pal.wall }); const w = r[2] - r[0];
    if (door) d.dr(0, k[0], w / 2, 1.6, { h: 2.6 }); d.wn(0, k[1], w / 2, 1, { h: 2, sill: th - 3.2 }); d.wn(0, k[3], w / 2, 1, { h: 2, sill: th - 3.2 }); d.wn(0, k[2], w / 2, 1, { h: 2, sill: th - 3.2 });
    d.dBox(0, [r[0] - 0.15, r[1] - 0.15, r[2] + 0.15, r[3] + 0.15], th, th + 0.3, pal.trim); d.dPyr(0, [r[0] - 0.3, r[1] - 0.3, r[2] + 0.3, r[3] + 0.3], th + 0.3, th + 0.3 + sh, pal.accent);
    cross((r[0] + r[2]) / 2, (r[1] + r[3]) / 2, th + 0.3 + sh);
  };
  if (o.tower === 'bell' || o.tower === 'spire') tower([W / 2 - 2.2, -4.4, W / 2 + 2.2, 0], true);
  if (o.tower === 'twin') { tower([0, -4, 4.4, 0], false); tower([W - 4.4, -4, W, 0], false); }
  if (o.tower === 'detached') {
    const x = W + 4, y = 2; for (const [dx, dy] of [[0, 0], [3, 0], [0, 3], [3, 3]]) d.C(0, x + dx, y + dy, 0.35, WOOD);
    d.dBox(0, [x - 0.3, y - 0.3, x + 3.3, y + 3.3], 5.6, 5.9, WOOD); d.dPyr(0, [x - 0.6, y - 0.6, x + 3.6, y + 3.6], 5.9, 9.5, pal.roof); d.dCyl(0, [x + 1.5, y + 1.5], 0.5, 3.8, 5.0, GOLD); cross(x + 1.5, y + 1.5, 9.5);
  }
  if (dome) {
    const r = W * 0.3, c: Pt = [W / 2, L * 0.45]; d.dCyl(0, c, r, h, h + 3, pal.wall); for (let a = 0; a < 8; a++) { const x = c[0] + r * Math.cos((a * Math.PI) / 4), y = c[1] + r * Math.sin((a * Math.PI) / 4); d.dBox(0, [x - 0.2, y - 0.2, x + 0.2, y + 0.2], h + 0.6, h + 2.4, pal.win); }
    for (let k = 0; k < 5; k++) d.dCyl(0, c, r * Math.cos((k * 17 * Math.PI) / 180), h + 3 + k * 0.55, h + 3.6 + k * 0.55, GOLD);
    d.dCone(0, c, 0.5, h + 5.8, h + 7.2, GOLD); cross(c[0], c[1], h + 7.2);
    for (const dx of [-1, 1]) d.dCone(0, [W / 2 + dx * (W * 0.38), 1.6], 0.9, h, h + 2.4, pal.accent);
    d.dCyl(0, [W / 2, L + 0.6], 2.2, 0, h * 0.8, pal.wall); d.dCone(0, [W / 2, L + 0.6], 2.4, h * 0.8, h * 0.8 + 1.6, GOLD);
  }
  if (o.apse) { const r: R4 = [W / 2 - 3, L, W / 2 + 3, L + 4.5], k = d.bx(0, r, { t: 0.4 }); d.wn(0, k[2], 3, 1.2, { h: 3, sill: 1.2, color: pal.accent }); d.RF(0, r, 'hip', 35, 0.4, pal.roof); }
  if (o.transept) {
    const y0 = L * 0.4, r: R4 = [-5, y0, W + 5, y0 + W * 0.45], k = d.bx(0, r, { t: 0.4 }); d.wn(0, k[1], W * 0.225, 1.4, { h: 3, sill: 1.2 }); d.wn(0, k[3], W * 0.225, 1.4, { h: 3, sill: 1.2 });
    d.RF(0, r, 'gable', o.pitch, 0.4, pal.roof, { ridge: 'x' });
  }
  if (o.buttress) for (let i = 0; i < Math.floor(L / 3.5); i++) { const y = 1.5 + i * 3.5; d.dBox(0, [-0.7, y, 0, y + 0.6], 0, h + 0.8, pal.stone); d.dBox(0, [W, y, W + 0.7, y + 0.6], 0, h + 0.8, pal.stone); }
  (o.trees ?? [['round', 1.2], ['round', 1]]).forEach(([k, s], i) => d.tree(i % 2 ? W + 6 + i : -6 - i, 4 + i * 5, s, k));
  return d.fin({ key: o.key, label: o.label, group: o.region, blurb: o.blurb });
}
const africanChurch = () => church({ key: 'af-church', label: 'Church · African parish church', region: 'African', blurb: '12 x 22 m, bright walls, bell tower, tin roof, shaded yard', pal: P({ wall: '#fbf3dc', trim: '#c0392b', roof: '#2e6fb5', door: '#7a3f1d', win: '#f2c14e', accent: '#c0392b', stone: '#cdbf9a', ground: '#a9cf7a' }), W: 12, L: 22, h: 4.2, pitch: 24, tower: 'bell', th: 10, sh: 3.5, trees: [['round', 1.5], ['palm', 1.1], ['round', 1.2]] });
const americanChurch = () => church({ key: 'us-church', label: 'Church · American white steeple church', region: 'American', blurb: '11 x 20 m, white clapboard, tall steeple, red doors, lawn', pal: P({ wall: '#f7f6f2', trim: '#e9e6dd', roof: '#4b4f58', door: '#a5281f', win: '#9bc3dd', accent: '#2b3a67', stone: '#c9c6bd', ground: '#7fc063' }), W: 11, L: 20, h: 4.5, pitch: 32, tower: 'spire', th: 9, sh: 7, trees: [['round', 1.5], ['round', 1.3]] });
const gothicChurch = () => church({ key: 'eu-gothic', label: 'Church · European Gothic cathedral', region: 'European', blurb: '14 x 34 m, twin towers, transepts, apse, buttresses, stone grey', pal: P({ wall: '#cfc9bb', trim: '#e6e0d1', roof: '#4a5560', door: '#4b2f1c', win: '#4b6fb5', accent: '#8a2d3b', stone: '#b5ae9d', ground: '#7dbd63' }), W: 14, L: 34, h: 11, pitch: 50, tower: 'twin', th: 18, sh: 9, transept: true, apse: true, buttress: true, trees: [['cypress', 1.2], ['round', 1.3]] });
const byzantineChurch = () => church({ key: 'eu-byzantine', label: 'Church · Orthodox domed church', region: 'European', blurb: '16 x 20 m, cream stucco, golden dome on drum, apse, side cupolas', pal: P({ wall: '#f2e3c2', trim: '#d9c79b', roof: '#b5532a', door: '#5a3a22', win: '#7fb3d5', accent: '#b5532a', stone: '#d0c4a3', ground: '#9acb74' }), W: 16, L: 20, h: 8, pitch: 0, tower: 'dome', trees: [['cypress', 1.2], ['cypress', 1.1], ['round', 1]] });
const nordicChurch = () => church({ key: 'sc-church', label: 'Church · Scandinavian timber church', region: 'Scandinavian', blurb: '9 x 16 m, white boards, steep black roof, separate timber belfry', pal: P({ wall: '#f4f1e8', trim: '#8a5a2b', roof: '#26292d', door: '#8a1f1f', win: '#b9d6e6', accent: '#8a1f1f', stone: '#b4b8bc', ground: '#8fcf72' }), W: 9, L: 16, h: 4.6, pitch: 42, tower: 'detached', apse: true, trees: [['pine', 1.5], ['pine', 1.3], ['pine', 1.6], ['pine', 1.2]] });

function chineseChurch(): Building {
  const pal = P({ wall: '#f6ecd3', trim: '#b3261e', roof: '#2f6b4f', door: '#b3261e', win: '#7a5a3a', col: '#b3261e', floor: '#d9c9a4', ground: '#9acb7a', stone: '#cfc7b6', accent: '#d4a017' });
  const W = 16, L = 22, h = 4.6, d = new SD([{ name: 'Ground floor', h }], pal), GOLD = '#d4a017';
  d.lawn([-12, -14, W + 12, L + 14]); d.paving([-3.5, -3.5, W + 3.5, L + 3.5], '#d9d2c3'); d.dBox(0, [-3, -3, W + 3, L + 3], -0.01, 0.5, pal.stone); d.steps(0, W / 2 - 2, W / 2 + 2, -4.8, 3, pal.stone); d.paving([W / 2 - 1.2, -14, W / 2 + 1.2, -5], '#b9b2a2');
  const k = d.bx(0, [2, 2, W - 2, L - 2], { t: 0.4 }); [3.5, W / 2, W - 3.5].forEach(x => d.dr(0, k[0], x - 2, 1.6, { h: 3 }));
  d.spread(0, k[1], L - 4, 4, 1.2, [], { h: 2.4, sill: 0.9, color: '#7a5a3a' }); d.spread(0, k[3], L - 4, 4, 1.2, [], { h: 2.4, sill: 0.9, color: '#7a5a3a' }); d.wn(0, k[2], (W - 4) / 2, 1.8, { h: 2.4, sill: 1.2, color: pal.accent });
  d.Z(0, [2.4, 2.4, W - 2.4, L - 6], 'Worship hall'); d.Z(0, [2.4, L - 6, W - 2.4, L - 2.4], 'Chancel');
  for (let i = 0; i <= 4; i++) { d.C(0, i * (W / 4), 0, 0.4); d.C(0, i * (W / 4), L, 0.4); } for (let j = 1; j < 5; j++) { d.C(0, 0, j * (L / 5), 0.4); d.C(0, W, j * (L / 5), 0.4); }
  for (let i = 0; i < 5; i++) { const y = 5 + i * 2; d.dBox(0, [3.5, y, W / 2 - 1, y + 0.7], 0, 0.9, WOOD); d.dBox(0, [W / 2 + 1, y, W - 3.5, y + 0.7], 0, 0.9, WOOD); }
  d.RF(0, [-1.6, -1.6, W + 1.6, L + 1.6], 'hip', 9, 1.4, pal.roof, { z: h });
  d.dBox(0, [W * 0.2, L * 0.2, W * 0.8, L * 0.8], h + 0.4, h + 3.0, pal.trim); d.RF(0, [W * 0.1, L * 0.1, W * 0.9, L * 0.9], 'hip', 24, 1.2, pal.roof, { z: h + 3 });
  d.dCone(0, [W / 2, L / 2], 0.35, h + 6.2, h + 8.2, GOLD); d.dBox(0, [W / 2 - 0.1, L / 2 - 0.1, W / 2 + 0.1, L / 2 + 0.1], h + 8, h + 10, GOLD); d.dBox(0, [W / 2 - 0.6, L / 2 - 0.1, W / 2 + 0.6, L / 2 + 0.1], h + 9, h + 9.2, GOLD);
  const px = W + 7, py = 3; for (let i = 0; i < 3; i++) { const s = 4.2 - i * 0.9, z = i * 3.4; d.dBox(0, [px - s / 2 + 1, py - s / 2 + 1, px + s / 2 - 1, py + s / 2 - 1], z, z + 3, pal.trim); d.RF(0, [px - s / 2 - 0.8, py - s / 2 - 0.8, px + s / 2 + 0.8, py + s / 2 + 0.8], 'hip', 22, 0.8, pal.roof, { z: z + 3, t: 0.15 }); }
  d.dCone(0, [px, py], 0.3, 10.2, 11.8, GOLD);
  d.tree(-7, 6, 1.3, 'pine'); d.tree(-7, 16, 1.2, 'pine'); d.tree(W + 8, 15, 1.4, 'round'); d.tree(W / 2 - 5, -10, 1, 'round'); d.tree(W / 2 + 5, -10, 1, 'round');
  return d.fin({ key: 'cn-church', label: 'Church · Chinese-style church', group: 'Chinese', blurb: '16 x 22 m hall on a stone platform, red columns, double green-tile roof, bell pagoda' });
}

// ---------- schools ----------
type SO = { key: string; label: string; region: string; blurb: string; pal: Pal; wings: R4[]; n: number; h: number; roof: [Form, number, number]; bands?: string[]; veranda?: boolean; parapet?: boolean; extra?: (d: SD) => void };
function school(o: SO): Building {
  const d = new SD(names(o.n, o.h), o.pal), pal = o.pal, all = o.wings, bb = (i: 0 | 1 | 2 | 3) => Math[i % 2 ? 'max' : 'min'](...all.map(r => r[i]));
  d.lawn([bb(0) - 10, bb(1) - 10, bb(2) + 10, bb(3) + 14], pal.ground);
  all.forEach((r, wi) => {
    const [x0, y0, x1, y1] = r, horiz = x1 - x0 >= y1 - y0, len = horiz ? x1 - x0 : y1 - y0, nr = Math.max(2, Math.round(len / 7.5)), cw = len / nr;
    for (let s = 0; s < o.n; s++) {
      const col = o.bands ? o.bands[s % o.bands.length] : pal.wall, k = d.bx(s, r, { color: col, t: 0.3 }), front = horiz ? k[2] : k[1], back = horiz ? k[0] : k[3];
      for (let i = 0; i < nr; i++) {
        const c = (i + 0.5) * cw;
        if (s === 0) d.dr(s, front, c, 1.1, { h: 2.3 }); else d.wn(s, front, c, 1.8, { h: 1.5, sill: 0.9 });
        d.wn(s, back, c, 1.8, { h: 1.5, sill: 0.9 });
        if (i) { horiz ? d.W(s, [x0 + i * cw, y0], [x0 + i * cw, y1], { t: 0.15, color: pal.trim }) : d.W(s, [x0, y0 + i * cw], [x1, y0 + i * cw], { t: 0.15, color: pal.trim }); }
        if (o.n <= 2 || s === 0) d.Z(s, horiz ? [x0 + i * cw + 0.2, y0 + 0.2, x0 + (i + 1) * cw - 0.2, y1 - 0.2] : [x0 + 0.2, y0 + i * cw + 0.2, x1 - 0.2, y0 + (i + 1) * cw - 0.2], `${s ? 'Room' : 'Classroom'} ${wi + 1}.${i + 1}`);
      }
    }
    const top = o.n - 1; d.RF(top, r, o.roof[0], o.roof[1], o.roof[2], pal.roof, { ridge: horiz ? 'x' : 'y' }); if (o.parapet) d.parapet(top, r, 0.8, pal.trim);
    if (o.veranda && horiz) { for (let x = x0 + 1; x <= x1 - 0.5; x += 3) d.C(0, x, y1 + 1.8, 0.2, pal.trim); d.dBox(0, [x0, y1, x1, y1 + 1.9], o.h, o.h + 0.15, pal.trim); d.dBox(0, [x0, y1, x1, y1 + 1.9], -0.01, 0.06, pal.stone); }
  });
  d.stair(0, [all[0][0] + 0.4, all[0][1] + 0.4, all[0][0] + 3, all[0][1] + 2.6]);
  o.extra?.(d);
  return d.fin({ key: o.key, label: o.label, group: o.region, blurb: o.blurb });
}
const flag = (d: SD, x: number, y: number, c: string) => { d.dCyl(0, [x, y], 0.07, 0, 7, '#9aa0a6'); d.dBox(0, [x + 0.07, y - 0.03, x + 1.5, y + 0.03], 5.4, 6.6, c); };
const africanSchool = () => school({ key: 'af-school', label: 'School · African primary school', region: 'African', blurb: 'Two 30 m classroom blocks, 8 rooms, verandas, flagpole, water tank, trees', pal: P({ wall: '#f9e7b5', trim: '#c0392b', roof: '#2e6fb5', door: '#2e6fb5', win: '#8fd0e8', ground: '#c5d98a', stone: '#d8c7a0', accent: '#c0392b' }), wings: [[0, 0, 30, 7], [0, 16, 30, 23]], n: 1, h: 3.2, roof: ['gable', 12, 0.8], veranda: true,
  extra: d => { flag(d, 34, 12, '#2e9b4a'); d.dCyl(0, [33, 3], 1.0, 0, 2.4, '#4a90c2'); d.dCone(0, [33, 3], 1.1, 2.4, 3, '#2e6fb5'); d.paving([-2, 8, 32, 15], '#d8c7a0'); d.tree(-5, 12, 1.5, 'round'); d.tree(38, 20, 1.3, 'round'); d.tree(38, 6, 1.1, 'palm'); d.dBox(0, [8, 10, 10, 12], 0, 0.5, '#b5532a'); } });
const americanSchool = () => school({ key: 'us-school', label: 'School · American two-storey school', region: 'American', blurb: '44 x 14 m brick block with front wings, 2 floors, flat roof, flagpole, bus loop', pal: P({ wall: '#a5432f', trim: '#e9e3d3', roof: '#6c7178', door: '#1f3a5f', win: '#bfd9ea', ground: '#7fc063', stone: '#c9c6bd', accent: '#1f3a5f' }), wings: [[0, 0, 44, 14], [0, 14, 10, 22], [34, 14, 44, 22]], n: 2, h: 3.4, roof: ['flat', 0, 0], parapet: true,
  extra: d => { flag(d, 22, 28, '#b22234'); d.paving([10, 14, 34, 22], '#d4d0c4'); d.dBox(0, [18, 22, 26, 24], 0, 0.15, '#c9c6bd'); d.dBox(0, [16, 14, 28, 15.6], 3.4, 3.7, '#e9e3d3'); d.paving([-4, 30, 48, 36], '#55585e'); d.dBox(0, [4, 31.5, 14, 33.5], 0.15, 2.5, '#f2b705'); d.tree(-6, 6, 1.4, 'round'); d.tree(50, 8, 1.4, 'round'); } });
const europeSchool = () => school({ key: 'eu-school', label: 'School · European H-plan school', region: 'European', blurb: 'Two 30 m wings joined by a hall, 2 floors, hipped tile roofs, courtyards', pal: P({ wall: '#efd9a8', trim: '#8a5a2b', roof: '#b5532a', door: '#2e5d34', win: '#bcd8ea', ground: '#86c06b', stone: '#d4c7a6', accent: '#2e5d34' }), wings: [[0, 0, 9, 30], [27, 0, 36, 30], [9, 11, 27, 19]], n: 2, h: 3.4, roof: ['hip', 24, 0.6],
  extra: d => { d.paving([-3, -4, 39, -1], '#cfc7b0'); d.dBox(0, [14, 19.2, 22, 19.6], 0, 0.5, '#8a5a2b'); d.tree(18, 4, 1.4, 'round'); d.tree(18, 26, 1.4, 'round'); d.tree(-6, 15, 1.3, 'round'); d.tree(42, 15, 1.3, 'round'); d.dCyl(0, [18, 15], 1.3, 0, 0.5, '#b9b2a2'); } });
const nordicSchool = () => school({ key: 'sc-school', label: 'School · Scandinavian timber school', region: 'Scandinavian', blurb: 'Three low timber pavilions, mono-pitch roofs, big windows, playground', pal: P({ wall: '#c98a4b', trim: '#f4f1e8', roof: '#3a3d42', door: '#2f7fb5', win: '#cfe6f2', ground: '#8fcf72', stone: '#cfd3d6', accent: '#e8b730' }), wings: [[0, 0, 24, 8], [0, 13, 24, 21], [29, 4, 41, 17]], n: 1, h: 3.4, roof: ['mono', 8, 0.5], bands: ['#c98a4b'],
  extra: d => { d.dBox(0, [44, 2, 50, 8], 0, 0.1, '#e8b730'); d.dCyl(0, [46, 5], 0.8, 0, 2.0, '#2f7fb5'); d.dBox(0, [44, 10, 50, 12], 0.5, 0.7, '#c0392b'); d.tree(-5, 10, 1.6, 'pine'); d.tree(46, 18, 1.5, 'pine'); d.tree(52, 14, 1.3, 'pine'); d.tree(24, -6, 1.4, 'pine'); } });
const chineseSchool = () => school({ key: 'cn-school', label: 'School · Chinese school with gate tower', region: 'Chinese', blurb: '48 x 12 m symmetrical 3-storey block, red gate tower, playground, flagpole', pal: P({ wall: '#f3e6cd', trim: '#b3261e', roof: '#5b5f66', door: '#b3261e', win: '#8fc9e0', ground: '#9acb7a', stone: '#d6cdbb', accent: '#b3261e' }), wings: [[0, 0, 48, 12], [18, 12, 30, 20]], n: 3, h: 3.4, roof: ['hip', 18, 0.8], bands: ['#f3e6cd', '#f3e6cd', '#f3e6cd'],
  extra: d => { d.dBox(0, [18, 20, 30, 20.6], 0, 3.4, '#b3261e'); d.dPyr(0, [17.5, 12, 30.5, 20.6], 10.2, 12.5, '#b3261e'); d.paving([-4, 24, 52, 44], '#c9b890'); d.dBox(0, [-4, 24, 52, 24.4], 0, 0.4, '#b3261e'); d.dBox(0, [8, 30, 12, 31], 0, 3, '#c0392b'); flag(d, 24, 26, '#de2910'); for (let x = 2; x < 48; x += 8) d.tree(x, -5, 1, 'round'); } });

// ---------- apartments ----------
type AO = { key: string; label: string; region: string; blurb: string; pal: Pal; blocks: R4[]; n: number; h: number; roof: [Form, number, number]; bands?: string[]; blockColors?: string[]; balc?: string[]; shops?: boolean; tanks?: boolean; stoop?: boolean; cornice?: string; parapet?: boolean; court?: R4; per?: number; extra?: (d: SD) => void };
function tower(o: AO): Building {
  const d = new SD(names(o.n, o.h), o.pal), pal = o.pal, top = o.n - 1, per = o.per ?? 3.4;
  const xs = o.blocks.concat(o.court ? [o.court] : []); d.lawn([Math.min(...xs.map(r => r[0])) - 9, Math.min(...xs.map(r => r[1])) - 9, Math.max(...xs.map(r => r[2])) + 9, Math.max(...xs.map(r => r[3])) + 12], pal.ground);
  const outer: R4 | undefined = o.court ? [Math.min(...o.blocks.map(r => r[0])), Math.min(...o.blocks.map(r => r[1])), Math.max(...o.blocks.map(r => r[2])), Math.max(...o.blocks.map(r => r[3]))] : undefined;
  const floor = (s: number, r: R4, bi: number, front: boolean) => {
    const [x0, y0, x1, y1] = r, W = x1 - x0, D = y1 - y0, col = o.blockColors ? o.blockColors[bi % o.blockColors.length] : o.bands ? o.bands[s % o.bands.length] : pal.wall, k = d.bx(s, r, { color: col, t: 0.3 });
    const nw = Math.max(1, Math.round(W / per));
    if (s === 0 && o.shops) d.spread(s, k[2], W, Math.max(1, Math.round(W / 4.5)), 2.6, [W / 2], { h: 2.4, sill: 0.3 }); else d.spread(s, k[2], W, nw, 1.3, s === 0 ? [W / 2] : [], { h: 1.4, sill: 0.9 });
    if (s === 0) d.dr(s, k[2], W / 2, o.stoop ? 1.2 : 2, { h: 2.6 });
    d.spread(s, k[0], W, nw, 1.3, [], { h: 1.4, sill: 0.9 });
    if (D > 7) { d.spread(s, k[1], D, Math.max(1, Math.round(D / (per * 1.3))), 1.2, [], { h: 1.4, sill: 0.9 }); d.spread(s, k[3], D, Math.max(1, Math.round(D / (per * 1.3))), 1.2, [], { h: 1.4, sill: 0.9 }); }
    const nu = Math.round(W / 7); for (let i = 1; i < nu && W > 14; i++) d.W(s, [x0 + (i * W) / nu, y0], [x0 + (i * W) / nu, y1], { t: 0.15, color: pal.trim });
    if (s === 0 || o.n <= 3) d.Z(s, [x0 + 0.3, y0 + 0.3, x1 - 0.3, y1 - 0.3], s === 0 ? (o.shops ? 'Shops & lobby' : 'Lobby & flats') : `Flats floor ${s}`);
    if (s >= 1 && front && o.balc && W > 8) { const nb = Math.max(1, Math.round(W / 6)); for (let i = 0; i < nb; i++) { const a = x0 + (i * W) / nb + 0.7, b = x0 + ((i + 1) * W) / nb - 0.7; d.balcony(s, a, b, y1, 1.5, pal.stone, o.balc[(i + s) % o.balc.length]); } }
  };
  o.blocks.forEach((r, bi) => {
    for (let s = 0; s < o.n; s++) floor(s, r, bi, true);
    d.stair(0, [r[0] + 0.5, r[1] + 0.5, r[0] + 3, r[1] + 2.7]);
    if (o.court) d.RF(top, r, o.roof[0], o.roof[1], o.roof[2], pal.roof, { ridge: r[2] - r[0] >= r[3] - r[1] ? 'x' : 'y' }); else d.RF(top, r, o.roof[0], o.roof[1], o.roof[2], pal.roof, { ridge: 'x' });
    if (o.parapet) d.parapet(top, r, 0.9, pal.trim);
    if (o.cornice) d.dBox(top, [r[0] - 0.3, r[1] - 0.3, r[2] + 0.3, r[3] + 0.5], o.h - 0.1, o.h + 0.5, o.cornice);
    if (o.stoop) d.steps(0, (r[0] + r[2]) / 2 - 0.8, (r[0] + r[2]) / 2 + 0.8, r[3], 5, pal.stone);
    if (o.tanks) for (let i = 0; i < 2; i++) { d.dCyl(top, [r[0] + 4 + i * 5, (r[1] + r[3]) / 2], 1, o.h, o.h + 1.8, '#2e86c1'); d.dCone(top, [r[0] + 4 + i * 5, (r[1] + r[3]) / 2], 1.1, o.h + 1.8, o.h + 2.3, '#1b4f72'); }
  });
  if (outer && o.court) { const c = o.court, k = d.bx(0, c, { color: pal.wall, t: 0.3 }); for (let s = 1; s < o.n; s++) d.bx(s, c, { color: pal.wall, t: 0.3 }); d.spread(0, k[0], c[2] - c[0], 3, 1.3, [], { h: 1.4, sill: 0.9 }); d.dr(0, k[2], (c[2] - c[0]) / 2, 2, { h: 2.6 }); d.paving([c[0] + 0.3, c[1] + 0.3, c[2] - 0.3, c[3] - 0.3], '#d6cfbd'); d.dCyl(0, [(c[0] + c[2]) / 2, (c[1] + c[3]) / 2], 1.2, 0, 0.5, pal.stone); d.dCyl(0, [(c[0] + c[2]) / 2, (c[1] + c[3]) / 2], 1.0, 0.4, 0.55, WATER); d.tree(c[0] + 2, c[1] + 2, 0.9, 'round'); d.tree(c[2] - 2, c[3] - 2, 0.9, 'round'); }
  const e = xs; d.paving([Math.min(...e.map(r => r[0])), Math.max(...e.map(r => r[3])) + 1, Math.max(...e.map(r => r[2])), Math.max(...e.map(r => r[3])) + 4], '#d8d3c6');
  d.tree(Math.min(...e.map(r => r[0])) - 4, 5, 1.3, 'round'); d.tree(Math.max(...e.map(r => r[2])) + 4, 6, 1.3, 'round'); d.tree(Math.min(...e.map(r => r[0])) - 3, Math.max(...e.map(r => r[3])) + 6, 1, 'round');
  o.extra?.(d);
  return d.fin({ key: o.key, label: o.label, group: o.region, blurb: o.blurb });
}
const africanFlats = () => tower({ key: 'af-flats', label: 'Apartments · African walk-up flats', region: 'African', blurb: '24 x 12 m, 4 floors, shops below, colourful bands, balconies, roof water tanks', pal: P({ wall: '#f4a261', trim: '#fff4de', roof: '#9a8f86', win: '#8fd0e8', door: '#2a6f97', ground: '#c5d98a', stone: '#e4d3b2', accent: '#e76f51' }), blocks: [[0, 0, 24, 12]], n: 4, h: 3.1, roof: ['flat', 0, 0], parapet: true, shops: true, tanks: true, bands: ['#e9c46a', '#f4a261', '#2a9d8f', '#e76f51'], balc: ['#2a6f97', '#e76f51', '#264653'] });
const chineseTower = () => tower({ key: 'cn-tower', label: 'Apartments · Chinese 10-storey residential tower', region: 'Chinese', blurb: '30 x 13 m, 10 floors, shop podium, alternating colour bands, balconies, crown roof', pal: P({ wall: '#f2ece0', trim: '#c8bfae', roof: '#b3261e', win: '#7fb8d9', door: '#8a5a2b', ground: '#9acb7a', stone: '#d6cdbb', accent: '#c0562f' }), blocks: [[0, 0, 30, 13]], n: 10, h: 3, roof: ['hip', 14, 0.6], shops: true, bands: ['#e8d9b8', '#f2ece0', '#f2ece0', '#e8d9b8'], balc: ['#c0562f', '#f2ece0'], per: 3.8 });
const europeBlock = () => tower({ key: 'eu-block', label: 'Apartments · European courtyard block', region: 'European', blurb: '34 x 30 m perimeter block round a fountain courtyard, 4 floors, hipped zinc roofs', pal: P({ wall: '#efe2c3', trim: '#8a5a2b', roof: '#5b6670', win: '#bcd8ea', door: '#2e5d34', ground: '#86c06b', stone: '#cfc5aa', accent: '#8a5a2b' }), blocks: [[0, 0, 34, 7], [0, 23, 34, 30], [0, 7, 7, 23], [27, 7, 34, 23]], court: [7, 7, 27, 23], n: 4, h: 3.1, roof: ['hip', 30, 0.5], bands: ['#d9c08c', '#efe2c3', '#efe2c3', '#efe2c3'], balc: ['#2b2d31'], cornice: '#f6f0de' });
const usBrownstones = () => tower({ key: 'us-brownstone', label: 'Apartments · American brownstone row', region: 'American', blurb: 'Five 6 x 14 m townhouse-apartments, 4 floors, stoops, cornices, flat roofs', pal: P({ wall: '#8a4b34', trim: '#f0e8d8', roof: '#4b4f58', win: '#cfe3f0', door: '#1f3a5f', ground: '#8fbf74', stone: '#cfc7b6', accent: '#1f3a5f' }), blocks: [0, 1, 2, 3, 4].map(i => [i * 6.2, 0, i * 6.2 + 6, 14] as R4), blockColors: ['#8a4b34', '#a5603f', '#6e3a2b', '#b07a52', '#7d4638'], n: 4, h: 3.2, roof: ['flat', 0, 0], stoop: true, cornice: '#f0e8d8', per: 3 });
const nordicBlocks = () => tower({ key: 'sc-blocks', label: 'Apartments · Scandinavian timber blocks', region: 'Scandinavian', blurb: 'Two 24 x 11 m blocks, 3 floors, timber cladding, balconies, pitched roofs, pine yard', pal: P({ wall: '#c98a4b', trim: '#f4f1e8', roof: '#3a3d42', win: '#cfe6f2', door: '#2f7fb5', ground: '#8fcf72', stone: '#d5d8da', accent: '#9a3b2b' }), blocks: [[0, 0, 24, 11], [30, 0, 54, 11]], blockColors: ['#c98a4b', '#9a3b2b'], n: 3, h: 3, roof: ['gable', 20, 0.6], balc: ['#f4f1e8', '#2f7fb5'], extra: d => { d.dBox(0, [24.5, -3, 29.5, 15], 0.01, 0.04, '#d5d8da'); d.tree(27, 3, 1.5, 'pine'); d.tree(27, 9, 1.3, 'pine'); d.tree(60, 6, 1.4, 'pine'); } });

// ---------- catalogue ----------
const BASE: Building[] = [
  kenyanBungalow(), swahiliHouse(), homestead(), colonial(), ranch(), cottage(), medVilla(), stuga(), nordicModern(), siheyuan(), minka(), courtyardHouse(),
  africanChurch(), americanChurch(), gothicChurch(), byzantineChurch(), nordicChurch(), chineseChurch(),
  africanSchool(), americanSchool(), europeSchool(), nordicSchool(), chineseSchool(),
  africanFlats(), chineseTower(), europeBlock(), usBrownstones(), nordicBlocks(),
];
// what the walls and pitched roofs of each template are made of, so the 3D view can draw real brick, timber, stone, thatch or sheet metal
const WALL: Record<string, string> = { 'us-ranch': 'timber', 'sc-stuga': 'timber', 'sc-modern': 'timber', 'us-church': 'timber', 'eu-gothic': 'stone', 'sc-church': 'timber', 'sc-school': 'timber', 'us-brownstone': 'stone', 'sc-blocks': 'timber', 'af-homestead': 'plaster' };
const ROOF: Record<string, string> = { 'af-bungalow': 'metal', 'af-homestead': 'thatch', 'eu-cottage': 'thatch', 'af-church': 'metal', 'af-school': 'metal', 'sc-modern': 'metal', 'sc-school': 'metal' };
export const STYLED: Building[] = BASE.map(b => ({ ...b, els: b.els.map(e => (e.type === 'wall' && WALL[b.key] ? { ...e, g: { ...e.g, mat: WALL[b.key] } } : e.type === 'roof' && ROOF[b.key] && e.g.form ? { ...e, g: { ...e.g, mat: ROOF[b.key] } } : e)) }));

export const REGIONS = ['African', 'American', 'European', 'Scandinavian', 'Chinese', 'Japanese', 'Middle Eastern'];
