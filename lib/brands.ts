// Production vehicles from well-known makers as parametric block models. Each uses the maker's published overall dimensions
// (length, width, height, wheelbase, wheel size, kerb weight) with a generic body style, so it is a dimension-accurate starting
// point to edit, not the maker's own design. Change any named parameter and the model rebuilds. Lengths in millimetres.
import { calc, evalParams, type Sketch } from './sketch';
import { newPart, type FeatureStep, type PartDoc, type PatternStep, type SketchStep, type Step } from './parts';
import { circles, ext, params, type Template } from './partlib';
import type { Plane } from './solid';

type Vals = Record<string, number>;
type Style = 'sedan' | 'hatch' | 'suv' | 'coupe' | 'super' | 'pickup' | 'wedge';
export type Spec = { brand: string; model: string; style: Style; L: number; W: number; H: number; wb: number; kg: number; rw?: number; tw?: number };

// A closed polygon whose every point is placed from the origin by expressions, so the whole outline is driven by parameters.
export function polyX(id: string, name: string, plane: Plane, offset: string, pts: [string, string][], v: Vals): SketchStep {
  const sk: Sketch = { pts: [{ id: 'o', x: 0, y: 0 }], lines: [], circles: [], cons: [{ id: 'fo', t: 'fix', p: 'o' }] };
  pts.forEach((p, i) => { sk.pts.push({ id: `p${i}`, x: calc(p[0], v), y: calc(p[1], v) }); sk.cons.push({ id: `x${i}`, t: 'dx', a: 'o', b: `p${i}`, v: p[0] }, { id: `y${i}`, t: 'dy', a: 'o', b: `p${i}`, v: p[1] }); });
  pts.forEach((_, i) => sk.lines.push({ id: `l${i}`, a: `p${i}`, b: `p${(i + 1) % pts.length}` }));
  return { id, type: 'sketch', name, plane, offset, sk };
}
const lin = (id: string, name: string, of: string, count: string, dy: string): PatternStep => ({ id, type: 'pattern', name, of, mode: 'linear', count, dx: '0', dy, dz: '0', axis: 'z', angle: '360', cx: '0', cy: '0', cz: '0' });
const r3 = (x: number) => String(Math.round(x * 1000) / 1000);

// body outline fractions: windscreen base, roof front, roof rear, rear window base (of L); hood front, hood at windscreen, rear deck (of H); greenhouse width (of W)
const FR: Record<Exclude<Style, 'pickup' | 'wedge'>, { wx: number; rx: number; rrx: number; bx: number; hf: number; hh: number; bh: number; cw: number }> = {
  sedan: { wx: 0.27, rx: 0.42, rrx: 0.66, bx: 0.80, hf: 0.52, hh: 0.60, bh: 0.64, cw: 0.84 },
  hatch: { wx: 0.26, rx: 0.40, rrx: 0.84, bx: 0.96, hf: 0.50, hh: 0.58, bh: 0.78, cw: 0.86 },
  suv: { wx: 0.27, rx: 0.37, rrx: 0.88, bx: 0.98, hf: 0.54, hh: 0.60, bh: 0.80, cw: 0.88 },
  coupe: { wx: 0.30, rx: 0.45, rrx: 0.66, bx: 0.78, hf: 0.50, hh: 0.62, bh: 0.64, cw: 0.84 },
  super: { wx: 0.34, rx: 0.49, rrx: 0.60, bx: 0.74, hf: 0.40, hh: 0.70, bh: 0.78, cw: 0.80 },
};

export function fromSpec(s: Spec): PartDoc {
  const rw = s.rw ?? (s.style === 'suv' || s.style === 'pickup' || s.style === 'wedge' ? 390 : s.style === 'super' ? 345 : 330), tw = s.tw ?? (s.style === 'super' ? 290 : 235);
  const d = newPart(`${s.brand} ${s.model}`);
  const front = (s.L - s.wb) * 0.46;
  d.params = params({ L: s.L, W: s.W, H: s.H, wb: s.wb, fo: Math.round(front), gc: s.style === 'suv' || s.style === 'pickup' ? 220 : s.style === 'super' ? 110 : 140, rw, tw, tr: 'W-tw-110' });
  d.vspec = { kind: 'car', style: s.style, brand: s.brand };
  const v = evalParams(d.params).values, gc = v.gc;
  const steps: Step[] = [];
  const arches = (): Step[] => [
    circles('wa', 'Wheel arch', 'XZ', 'tr/2', [{ c: ['fo', 'rw'], r: 'rw+30' }, { c: ['fo+wb', 'rw'], r: 'rw+30' }]), ext('wac', 'Wheel arch cut', 'wa', 'cut', 'tw+60', true), lin('wap', 'Wheel arch, other side', 'wac', '2', 'tr'),
  ];
  const wheels = (): Step[] => [
    circles('ws', 'Wheel', 'XZ', 'tr/2', [{ c: ['fo', 'rw'], r: 'rw' }, { c: ['fo+wb', 'rw'], r: 'rw' }]), ext('wf', 'Wheel', 'ws', 'new', 'tw', true), lin('wp', 'Wheel, other side', 'wf', '2', 'tr'),
  ];
  const clearTop = (2 * rw + 50) / s.H;
  if (s.style === 'wedge') {
    // flat-faced truck: nose rises straight to the roof, flat cab top, then the load bed
    const pts: [string, string][] = [['0', 'gc'], ['0', 'H*0.44'], ['L*0.40', 'H'], ['L*0.62', 'H'], ['L*0.68', 'H*0.64'], ['L', 'H*0.64'], ['L', 'gc']];
    steps.push(polyX('bs', 'Body side profile', 'XZ', '0', pts, v), ext('bf', 'Body', 'bs', 'new', 'W', true), ...arches(), ...wheels());
  } else if (s.style === 'pickup') {
    const cabx = r3(s.L * 0.21), cabl = r3(s.L * 0.30), bedl = r3(s.L * 0.30), bh = 560;
    d.params = params({ L: s.L, W: s.W, H: s.H, wb: s.wb, fo: Math.round(front), gc, bh, wall: 90, rw, tw, tr: 'W-tw-120', cabx, cabl, bedl, bedh: 480 });
    const w = evalParams(d.params).values;
    const pts = (r: [string, string, string, string]): [string, string][] => [[r[0], r[1]], [`${r[0]}+${r[2]}`, r[1]], [`${r[0]}+${r[2]}`, `${r[1]}+${r[3]}`], [r[0], `${r[1]}+${r[3]}`]];
    steps.push(
      polyX('bs', 'Chassis and body', 'XZ', '0', pts(['0', 'gc', 'L', 'bh']), w), ext('bf', 'Chassis and body', 'bs', 'new', 'W', true),
      polyX('cs', 'Cab', 'XZ', '0', [['cabx', 'gc+bh-10'], ['cabx+cabl', 'gc+bh-10'], ['cabx+cabl*0.86', 'H'], ['cabx+cabl*0.18', 'H']], w), ext('cf', 'Cab', 'cs', 'join', 'W-160', true),
      polyX('ds', 'Load bed walls', 'XZ', '0', pts(['L-bedl', 'gc+bh-10', 'bedl', 'bedh+10']), w), ext('df', 'Load bed walls', 'ds', 'join', 'W', true),
      polyX('es', 'Load bed pocket', 'XZ', '0', pts(['L-bedl+wall', 'gc+bh+20', 'bedl-wall+10', 'bedh']), w), ext('ef', 'Load bed pocket', 'es', 'cut', 'W-2*wall', true),
      ...arches(), ...wheels());
  } else {
    const f = FR[s.style], hf = Math.max(f.hf, clearTop), hh = Math.max(f.hh, hf), bh = Math.max(f.bh, clearTop);
    const lower: [string, string][] = [['0', 'gc'], ['0', `H*${r3(hf)}`], [`L*${f.wx}`, `H*${r3(hh)}`], [`L*${f.bx}`, `H*${r3(bh)}`], ['L', `H*${r3(bh)}`], ['L', 'gc']];
    const house: [string, string][] = [[`L*${f.wx}`, `H*${r3(hh)}-10`], [`L*${f.rx}`, 'H'], [`L*${f.rrx}`, 'H'], [`L*${f.bx}`, `H*${r3(bh)}-10`]];
    steps.push(polyX('bs', 'Body side profile', 'XZ', '0', lower, v), ext('bf', 'Body', 'bs', 'new', 'W', true),
      polyX('cs', 'Glasshouse', 'XZ', '0', house, v), ext('cf', 'Glasshouse', 'cs', 'join', `W*${f.cw}`, true), ...arches(), ...wheels());
  }
  d.steps = steps;
  // the mass shown is the maker's kerb weight: set the density from the modelled volume once, at the default dimensions
  d.density = 1; const vol = volumeOf(d); if (vol > 0) d.density = Math.round((s.kg / (vol * 1e-9)) * 10) / 10;
  return d;
}
import { rebuild } from './parts';
const VOL = new Map<string, number>();
function volumeOf(d: PartDoc): number { const k = d.name; if (!VOL.has(k)) VOL.set(k, rebuild(d).stats?.volume ?? 0); return VOL.get(k)!; }

const S = (brand: string, model: string, style: Style, L: number, W: number, H: number, wb: number, kg: number, rw?: number, tw?: number): Spec => ({ brand, model, style, L, W, H, wb, kg, rw, tw });
export const SPECS: Spec[] = [
  S('Toyota', 'Corolla', 'sedan', 4630, 1780, 1435, 2700, 1300, 315, 205), S('Toyota', 'RAV4', 'suv', 4600, 1855, 1685, 2690, 1600, 355, 225),
  S('Toyota', 'Land Cruiser 300', 'suv', 4985, 1980, 1950, 2850, 2400, 395, 265), S('Toyota', 'Hilux double cab', 'pickup', 5330, 1855, 1815, 3085, 2000, 385, 265),
  S('Tesla', 'Model 3', 'sedan', 4720, 1850, 1441, 2875, 1760, 340, 235), S('Tesla', 'Model S', 'hatch', 5021, 1987, 1431, 2960, 2100, 345, 265),
  S('Tesla', 'Model Y', 'suv', 4751, 1921, 1624, 2890, 1990, 355, 255), S('Tesla', 'Cybertruck', 'wedge', 5885, 2027, 1905, 3550, 3100, 435, 305),
  S('Nissan', 'Leaf', 'hatch', 4490, 1788, 1540, 2700, 1500, 320, 205), S('Nissan', 'GT-R', 'coupe', 4710, 1895, 1370, 2780, 1740, 350, 255),
  S('Nissan', 'Patrol', 'suv', 5140, 1995, 1950, 3075, 2700, 400, 265), S('Nissan', 'Navara', 'pickup', 5255, 1850, 1795, 3150, 1900, 385, 255),
  S('Ford', 'Focus', 'hatch', 4378, 1825, 1454, 2700, 1300, 320, 225), S('Ford', 'Mustang', 'coupe', 4811, 1915, 1397, 2720, 1700, 350, 255),
  S('Ford', 'Ranger', 'pickup', 5370, 1918, 1884, 3270, 2100, 390, 265), S('Ford', 'F-150', 'pickup', 5915, 2029, 1960, 3685, 2200, 405, 275),
  S('Land Rover', 'Defender 110', 'suv', 4758, 1996, 1967, 3022, 2300, 400, 255), S('Land Rover', 'Discovery', 'suv', 4956, 2000, 1846, 2923, 2200, 395, 255),
  S('Land Rover', 'Range Rover', 'suv', 5052, 2047, 1870, 2997, 2400, 405, 275),
  S('Lamborghini', 'Huracán', 'super', 4520, 1933, 1165, 2620, 1422, 345, 305), S('Lamborghini', 'Aventador', 'super', 4797, 2030, 1136, 2700, 1575, 350, 305),
  S('Lamborghini', 'Urus', 'suv', 5112, 2016, 1638, 3003, 2200, 380, 285),
  S('Ferrari', '296 GTB', 'super', 4565, 1958, 1187, 2600, 1470, 345, 305), S('Ferrari', 'F8 Tributo', 'super', 4611, 1979, 1206, 2650, 1435, 345, 305),
  S('Ferrari', '812 Superfast', 'super', 4657, 1971, 1276, 2720, 1525, 350, 305), S('Ferrari', 'Purosangue', 'suv', 4973, 2028, 1589, 3018, 2033, 380, 295),
  S('BMW', '3 Series', 'sedan', 4709, 1827, 1442, 2851, 1550, 335, 225), S('BMW', 'M4', 'coupe', 4794, 1887, 1393, 2857, 1725, 345, 255),
  S('BMW', '7 Series', 'sedan', 5391, 1950, 1544, 3215, 2200, 350, 255), S('BMW', 'X5', 'suv', 4922, 2004, 1745, 2975, 2200, 385, 275),
  S('Mercedes-Benz', 'S-Class', 'sedan', 5179, 1954, 1503, 3106, 2150, 345, 255), S('Mercedes-Benz', 'G-Class', 'suv', 4873, 1984, 1969, 2890, 2500, 395, 275),
  S('Mercedes-Benz', 'C-Class', 'sedan', 4751, 1820, 1438, 2865, 1650, 335, 225), S('Audi', 'A4', 'sedan', 4762, 1847, 1431, 2819, 1600, 335, 225), S('Honda', 'Civic', 'sedan', 4674, 1802, 1415, 2735, 1350, 325, 215),
  S('Nissan', 'Altima', 'sedan', 4900, 1850, 1450, 2825, 1500, 335, 225), S('Hyundai', 'Elantra', 'sedan', 4675, 1825, 1430, 2720, 1350, 325, 215),
  S('Jeep', 'Wrangler', 'suv', 4882, 1894, 1848, 3008, 2000, 390, 255), S('Mitsubishi', 'Pajero', 'suv', 4900, 1875, 1900, 2780, 2100, 390, 265), S('Suzuki', 'Jimny', 'suv', 3645, 1645, 1720, 2250, 1100, 340, 195),
  S('Lexus', 'LX 600', 'suv', 5100, 1990, 1895, 2850, 2500, 395, 265), S('Ford', 'Bronco', 'suv', 4810, 1930, 1850, 2950, 2000, 385, 265),
  S('Bentley', 'Bentayga', 'suv', 5150, 1998, 1742, 2995, 2400, 385, 285), S('Rolls-Royce', 'Cullinan', 'suv', 5341, 2000, 1835, 3295, 2660, 390, 285), S('Aston Martin', 'DBX', 'suv', 5039, 1998, 1680, 3060, 2245, 385, 285),
  S('Porsche', 'Cayenne', 'suv', 4930, 1983, 1676, 2895, 2100, 380, 275), S('Isuzu', 'D-Max', 'pickup', 5265, 1870, 1790, 3125, 1950, 385, 255), S('Volkswagen', 'Amarok', 'pickup', 5350, 1910, 1880, 3270, 2100, 390, 265),
  S('Porsche', '911', 'coupe', 4519, 1852, 1300, 2450, 1500, 335, 245), S('Volkswagen', 'Golf', 'hatch', 4284, 1789, 1456, 2619, 1320, 315, 205),
];
const key = (s: Spec) => `${s.brand}-${s.model}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
export const BRANDS = Array.from(new Set(SPECS.map(s => s.brand)));
export const BRAND_TEMPLATES: Template[] = SPECS.map(s => ({ key: key(s), label: s.model, brand: s.brand, group: 'brand', blurb: `${(s.L / 1000).toFixed(2)} m long, ${s.kg} kg`, make: () => fromSpec(s) }));
void ({} as FeatureStep);
