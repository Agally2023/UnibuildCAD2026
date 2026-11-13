// Real-world looks for the 3D views: which material a plan element, a vehicle face or a machine part is made of, and how it should
// shine. Pure functions, so they are tested; the textures themselves are drawn in lib/textures.ts and applied in components/RealMat.tsx.
export type MatKind = 'paint' | 'plaster' | 'brick' | 'timber' | 'tile' | 'metal' | 'concrete' | 'stone' | 'thatch' | 'grass' | 'soil' | 'water' | 'bark' | 'foliage' | 'paving' | 'glass' | 'gold' | 'parquet' | 'terrazzo' | 'ceramic' | 'marble' | 'epoxy' | 'granite' | 'blockwork' | 'slate' | 'shingle' | 'boxprofile' | 'cobble' | 'gravel' | 'carpet' | 'seam';
export type Tex = 'plaster' | 'brick' | 'timber' | 'tile' | 'metal' | 'concrete' | 'stone' | 'thatch' | 'grass' | 'soil' | 'water' | 'bark' | 'foliage' | 'paving' | 'parquet' | 'terrazzo' | 'ceramic' | 'marble' | 'epoxy' | 'granite' | 'blockwork' | 'slate' | 'shingle' | 'boxprofile' | 'cobble' | 'gravel' | 'carpet' | 'seam';
export type MatDef = { tex: Tex | null; tile: number; rough: number; metal: number; env: number };
// tile = metres covered by one repeat of the texture
export const MAT: Record<MatKind, MatDef> = {
  paint: { tex: null, tile: 1, rough: 0.6, metal: 0, env: 0.6 },
  plaster: { tex: 'plaster', tile: 2.4, rough: 0.9, metal: 0, env: 0.4 },
  brick: { tex: 'brick', tile: 1.28, rough: 0.85, metal: 0, env: 0.4 },
  timber: { tex: 'timber', tile: 1.6, rough: 0.7, metal: 0, env: 0.5 },
  tile: { tex: 'tile', tile: 1.8, rough: 0.6, metal: 0, env: 0.6 },
  metal: { tex: 'metal', tile: 1.2, rough: 0.42, metal: 0.7, env: 1.2 },
  concrete: { tex: 'concrete', tile: 3, rough: 0.92, metal: 0, env: 0.35 },
  stone: { tex: 'stone', tile: 2.4, rough: 0.88, metal: 0, env: 0.4 },
  thatch: { tex: 'thatch', tile: 1.5, rough: 1, metal: 0, env: 0.2 },
  grass: { tex: 'grass', tile: 4, rough: 1, metal: 0, env: 0.2 },
  soil: { tex: 'soil', tile: 3, rough: 1, metal: 0, env: 0.2 },
  water: { tex: 'water', tile: 6, rough: 0.08, metal: 0.1, env: 1.4 },
  bark: { tex: 'bark', tile: 1, rough: 0.95, metal: 0, env: 0.3 },
  foliage: { tex: 'foliage', tile: 2, rough: 0.95, metal: 0, env: 0.3 },
  paving: { tex: 'paving', tile: 2, rough: 0.8, metal: 0, env: 0.4 },
  glass: { tex: null, tile: 1, rough: 0.04, metal: 0.15, env: 1.6 },
  gold: { tex: null, tile: 1, rough: 0.3, metal: 1, env: 1.3 },
  parquet: { tex: 'parquet', tile: 1.2, rough: 0.35, metal: 0, env: 0.7 },
  terrazzo: { tex: 'terrazzo', tile: 1.5, rough: 0.28, metal: 0, env: 0.8 },
  ceramic: { tex: 'ceramic', tile: 1.2, rough: 0.2, metal: 0, env: 0.9 },
  marble: { tex: 'marble', tile: 2.4, rough: 0.14, metal: 0, env: 1 },
  epoxy: { tex: 'epoxy', tile: 3, rough: 0.08, metal: 0.05, env: 1.3 },
  granite: { tex: 'granite', tile: 1.5, rough: 0.22, metal: 0, env: 0.8 },
  blockwork: { tex: 'blockwork', tile: 1.6, rough: 0.92, metal: 0, env: 0.3 },
  slate: { tex: 'slate', tile: 1.2, rough: 0.6, metal: 0, env: 0.5 },
  shingle: { tex: 'shingle', tile: 1, rough: 0.9, metal: 0, env: 0.3 },
  boxprofile: { tex: 'boxprofile', tile: 1.2, rough: 0.4, metal: 0.7, env: 1.2 },
  cobble: { tex: 'cobble', tile: 1.2, rough: 0.85, metal: 0, env: 0.3 },
  gravel: { tex: 'gravel', tile: 1, rough: 1, metal: 0, env: 0.2 },
  carpet: { tex: 'carpet', tile: 0.8, rough: 1, metal: 0, env: 0.1 },
  seam: { tex: 'seam', tile: 1.2, rough: 0.38, metal: 0.75, env: 1.2 },
};

export function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', ''), n = h.length === 3 ? h.split('').map(c => c + c).join('') : h.padEnd(6, '0');
  return [parseInt(n.slice(0, 2), 16) / 255, parseInt(n.slice(2, 4), 16) / 255, parseInt(n.slice(4, 6), 16) / 255];
}
export const toHex = (c: [number, number, number]) => '#' + c.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
// hue 0-360, saturation and lightness 0-1
export function hsl(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d < 1e-6) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1)); let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360;
  return [h, s, l];
}

const REAL: Record<string, { kind: MatKind; color: string; opacity?: number }> = {
  wall: { kind: 'plaster', color: '#e9e3d6' }, slab: { kind: 'concrete', color: '#bdc0c2' }, roof: { kind: 'tile', color: '#b5533c' }, column: { kind: 'concrete', color: '#b9bcbe' }, beam: { kind: 'concrete', color: '#b3b6b8' },
  stair: { kind: 'concrete', color: '#b0b3b5' }, door: { kind: 'timber', color: '#7a5230' }, window: { kind: 'glass', color: '#9cc9e0', opacity: 0.5 }, foundation: { kind: 'concrete', color: '#8f9396' },
  duct: { kind: 'metal', color: '#c4c8cc' }, pipe: { kind: 'metal', color: '#8fa6b8' }, equipment: { kind: 'metal', color: '#7f8a93' }, fixture: { kind: 'paint', color: '#f1f1ee' },
};
const SCHEMATIC: Record<string, string> = { wall: '#aab6e8', column: '#c98a00', beam: '#e0a100', slab: '#cdd5da', roof: '#b9a99a', stair: '#9aa8b1', foundation: '#8a8f94' };

// brick reds and browns, tan timber, thatch yellow, leaf green, water blue, from the colour alone
export function guessWall(color: string): MatKind {
  const [h, s, l] = hsl(color);
  if ((h < 28 || h > 340) && s > 0.3 && l < 0.5) return 'brick';
  return 'plaster';
}
export function guessDeco(g: any): MatKind {
  const col: string = g.color ?? '#9aa8b1', [h, s, l] = hsl(col), z0 = g.z0 ?? 0, z1 = g.z1 ?? 0.2, shape = g.shape ?? 'box';
  if (h > 190 && h < 215 && s > 0.5 && l > 0.45 && l < 0.7) return 'water';
  if (h > 38 && h < 52 && s > 0.8 && l > 0.38 && l < 0.5) return 'gold';
  if (shape === 'cone' && h > 35 && h < 60 && s > 0.35 && s < 0.8 && l > 0.3 && l < 0.6) return 'thatch';
  if (h > 70 && h < 160 && s > 0.2) return shape === 'box' && z1 <= 0.02 ? 'grass' : 'foliage';
  if (shape === 'box' && z1 <= 0.0) return s > 0.15 ? 'soil' : 'paving';
  if (shape === 'box' && z1 <= 0.12 && z0 >= -0.02) return 'paving';
  if (h > 15 && h < 40 && s > 0.3 && l < 0.45) return shape === 'cyl' && (g.r ?? 1) < 0.6 ? 'bark' : 'timber';
  if (s < 0.12 && l > 0.88) return 'plaster';
  if (s < 0.15) return 'stone';
  return 'paint';
}
export type Look = { kind: MatKind; color: string; opacity: number };
// What a plan element looks like in 3D. real=false gives the flat engineering colours.
export function lookFor(type: string, g: any, real = true): Look {
  const own: string | undefined = g?.color;
  if (!real) return { kind: 'paint', color: own ?? SCHEMATIC[type] ?? '#9aa8b1', opacity: type === 'window' ? 0.7 : type === 'slab' && !own ? 0.75 : 1 };
  if (type === 'deco') return { kind: g?.mat ?? guessDeco(g), color: own ?? '#9aa8b1', opacity: 1 };
  const d = REAL[type] ?? { kind: 'paint' as MatKind, color: '#9aa8b1' };
  let kind: MatKind = g?.mat ?? d.kind;
  if (!g?.mat && own) {
    if (type === 'wall') kind = guessWall(own);
    else if (type === 'roof') kind = g.form ? 'tile' : 'concrete';
    else if (type === 'door') kind = 'timber';
    else if (type === 'window') kind = 'glass';
    else if (type === 'column' || type === 'slab') kind = type === 'column' ? 'plaster' : 'concrete';
  }
  if (type === 'roof' && !g?.form && !g?.mat) kind = 'concrete';
  return { kind, color: own ?? d.color, opacity: typeof g?.opacity === 'number' ? g.opacity : type === 'window' ? 0.5 : d.opacity ?? 1 };
}

// ---- machine parts ----
export type PartLook = { color: string; metal: number; rough: number };
export function partLook(density: number): PartLook {
  const t: [number, PartLook][] = [[7850, { color: '#aeb4bb', metal: 1, rough: 0.34 }], [8000, { color: '#cfd3d6', metal: 1, rough: 0.28 }], [2700, { color: '#d0d4d8', metal: 1, rough: 0.38 }], [4500, { color: '#9c9ea3', metal: 1, rough: 0.4 }], [7200, { color: '#686b70', metal: 0.9, rough: 0.55 }], [8500, { color: '#cfa24a', metal: 1, rough: 0.28 }], [1050, { color: '#2e3236', metal: 0, rough: 0.45 }]];
  return (t.find(x => x[0] === density) ?? t[0])[1];
}
// Finishes offered in the Material group: density for mass, colour and sheen for the viewport and drawings.
export const FINISHES: { key: string; label: string; density: number; look: PartLook & { coat?: number } }[] = [
  { key: 'steel', label: 'Steel', density: 7850, look: { color: '#aeb4bb', metal: 1, rough: 0.34 } },
  { key: 'stainless', label: 'Stainless', density: 8000, look: { color: '#cfd3d6', metal: 1, rough: 0.26 } },
  { key: 'aluminium', label: 'Aluminium', density: 2700, look: { color: '#d3d6da', metal: 1, rough: 0.36 } },
  { key: 'titanium', label: 'Titanium', density: 4500, look: { color: '#9c9ea3', metal: 1, rough: 0.4 } },
  { key: 'castiron', label: 'Cast iron', density: 7200, look: { color: '#8b8f95', metal: 0.6, rough: 0.5 } },
  { key: 'brass', label: 'Brass', density: 8500, look: { color: '#d4a84b', metal: 1, rough: 0.26 } },
  { key: 'bronze', label: 'Bronze', density: 8800, look: { color: '#b9803f', metal: 1, rough: 0.3 } },
  { key: 'yellow', label: 'Yellow enamel', density: 7850, look: { color: '#f2e21c', metal: 0.1, rough: 0.32, coat: 1 } },
  { key: 'cream', label: 'Cream enamel', density: 7850, look: { color: '#efe892', metal: 0.1, rough: 0.34, coat: 1 } },
  { key: 'blue', label: 'Blue enamel', density: 7850, look: { color: '#2d5fb4', metal: 0.15, rough: 0.3, coat: 1 } },
  { key: 'abs', label: 'ABS plastic', density: 1050, look: { color: '#3a3e43', metal: 0, rough: 0.45 } },
  { key: 'nylon', label: 'Nylon', density: 1150, look: { color: '#ece9df', metal: 0, rough: 0.5 } },
];
export const finishLook = (density: number, finish?: string): PartLook & { coat?: number } => FINISHES.find(f => f.key === finish)?.look ?? partLook(density);
// ---- vehicles ----
export function paintFor(name: string): string {
  const n = name.toLowerCase(), has = (...w: string[]) => w.some(x => n.includes(x));
  if (has('ferrari')) return '#c4161c'; if (has('lamborghini', 'lambo')) return '#e8c000'; if (has('tesla')) return '#d8dadd'; if (has('toyota')) return '#c9ccd1'; if (has('nissan')) return '#a9181f';
  if (has('ford')) return '#1f4e9c'; if (has('land rover', 'landrover', 'defender', 'range rover')) return '#33553c'; if (has('bmw')) return '#2b4f86'; if (has('mercedes')) return '#2c2f33'; if (has('porsche')) return '#d7d9dc';
  if (has('tractor')) return '#2f7d32'; if (has('motorcycle')) return '#9a1b1b'; if (has('bicycle')) return '#b3261e'; if (has('trailer')) return '#3a4a5c';
  if (has('bus')) return '#f0b400'; if (has('box truck', 'boxtruck', 'truck')) return '#e7e9ec'; if (has('pickup')) return '#37573d'; if (has('sedan')) return '#2c4d8a'; if (has('hatch')) return '#a31d24'; if (has('suv', 'van')) return '#4a5058';
  return '#9ea6ae';
}
const dark = '#15161a', glass = '#0f1e2b', lamp = '#f4f1da', tail = '#b3141a';
// colour of one triangle of a vehicle: n = face normal, t = height of its centre as a fraction of the vehicle (0 ground, 1 roof).
// Part axes: X front to rear, Y across, Z up.
export function vehicleColor(n: [number, number, number], t: number, paint: string): string {
  const [nx, ny, nz] = n;
  if (nz < -0.5) return dark;
  if (t < 0.24) return '#17181a';
  if (nx < -0.6 && t >= 0.3 && t < 0.52) return lamp;
  if (nx > 0.6 && t >= 0.3 && t < 0.52) return tail;
  if (t > 0.56 && t < 0.92 && (Math.abs(ny) > 0.55 || (nz > 0.15 && nz < 0.85 && Math.abs(nx) > 0.4))) return glass;
  return paint;
}
