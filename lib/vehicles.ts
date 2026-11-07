// Complete vehicles and vehicle components for the Vehicles ribbon tab. Every one is an ordinary parametric part: change the named
// parameters (length, width, wheelbase, wheel size...) and the whole vehicle rebuilds. Axes: X runs from the front bumper (0) to the
// rear, Y is across the vehicle (centre line 0), Z is up from the ground. All lengths are millimetres; mass is the kerb weight.
import { calc, evalParams, type Sketch } from './sketch';
import { newPart, type FeatureStep, type PartDoc, type PatternStep, type SketchStep } from './parts';
import { circles, ext, params, poly, type Template } from './partlib';
import type { Plane } from './solid';

type P2 = [number, number];
type Vals = Record<string, number>;

// Several axis-aligned rectangles in one sketch. Each is [x, y, w, h] as expressions, placed from the origin and fully dimensioned.
function rects(id: string, name: string, plane: Plane, offset: string, list: [string, string, string, string][], v: Vals): SketchStep {
  const sk: Sketch = { pts: [{ id: 'o', x: 0, y: 0 }], lines: [], circles: [], cons: [{ id: 'fo', t: 'fix', p: 'o' }] };
  list.forEach((r, i) => {
    const [x, y, w, h] = r.map(e => calc(e, v));
    const P = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], ids = P.map((_, k) => `r${i}p${k}`);
    P.forEach((q, k) => sk.pts.push({ id: ids[k], x: q[0], y: q[1] }));
    P.forEach((_, k) => {
      const lid = `r${i}l${k}`; sk.lines.push({ id: lid, a: ids[k], b: ids[(k + 1) % 4] });
      sk.cons.push({ id: `r${i}c${k}`, t: k % 2 ? 'vertical' : 'horizontal', l: lid }, { id: `r${i}d${k}`, t: 'length', l: lid, v: k % 2 ? r[3] : r[2] });
    });
    sk.cons.push({ id: `r${i}x`, t: 'dx', a: 'o', b: ids[0], v: r[0] }, { id: `r${i}y`, t: 'dy', a: 'o', b: ids[0], v: r[1] });
  });
  return { id, type: 'sketch', name, plane, offset, sk };
}
// A block: one rectangle plus the extrusion that makes it. depth is the expression for the thickness (symmetric about the plane by default).
const blk = (id: string, name: string, plane: Plane, offset: string, r: [string, string, string, string], depth: string, op: FeatureStep['op'], v: Vals, sym = true): (SketchStep | FeatureStep)[] =>
  [rects(`${id}s`, name, plane, offset, [r], v), ext(id, name, `${id}s`, op, depth, sym)];
// A straight bar (tube) between two points in a side view, with a fixed section width t; the ends are not parametric.
const bar = (id: string, name: string, p1: P2, p2: P2, t: number, depth: string, op: FeatureStep['op'], plane: Plane = 'XZ', offset = '0'): (SketchStep | FeatureStep)[] => {
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1], L = Math.hypot(dx, dy), nx = (-dy / L) * t / 2, ny = (dx / L) * t / 2;
  const pts: P2[] = [[p1[0] + nx, p1[1] + ny], [p2[0] + nx, p2[1] + ny], [p2[0] - nx, p2[1] - ny], [p1[0] - nx, p1[1] - ny]];
  return [poly(`${id}s`, name, plane, offset, pts, [undefined, `${t}`, undefined, `${t}`]), ext(id, name, `${id}s`, op, depth, true)];
};
const lin = (id: string, name: string, of: string, count: string, dx: string, dy: string, dz: string): PatternStep =>
  ({ id, type: 'pattern', name, of, mode: 'linear', count, dx, dy, dz, axis: 'z', angle: '360', cx: '0', cy: '0', cz: '0' });
// Wheels on both sides of the vehicle: one sketch with a circle per axle (x positions), a symmetric extrusion at the left, and a linear
// pattern over the track to the right. Optionally the wheel arches are cut in the body first.
function wheelSet(id: string, label: string, xs: string[], rExpr: string, wExpr: string, trExpr: string, v: Vals, arches = false, zc = rExpr): (SketchStep | FeatureStep | PatternStep)[] {
  void v;
  const out: (SketchStep | FeatureStep | PatternStep)[] = [];
  if (arches) out.push(circles(`${id}as`, `${label} arch`, 'XZ', `(${trExpr})/2`, xs.map(x => ({ c: [x, zc] as [string, string], r: `${rExpr}+30` }))), ext(`${id}a`, `${label} arch cut`, `${id}as`, 'cut', `${wExpr}+60`, true), lin(`${id}ap`, `${label} arch, other side`, `${id}a`, '2', '0', trExpr, '0'));
  out.push(circles(`${id}s`, `${label}`, 'XZ', `(${trExpr})/2`, xs.map(x => ({ c: [x, zc] as [string, string], r: rExpr }))), ext(id, `${label}`, `${id}s`, 'new', wExpr, true), lin(`${id}p`, `${label}, other side`, id, '2', '0', trExpr, '0'));
  return out;
}

export function sedan(): PartDoc {
  const d = newPart('Sedan');
  d.params = params({ L: 4600, W: 1800, wb: 2700, fo: 900, gc: 220, bh: 520, cl: 2000, cx: 1250, ch: 560, rw: 330, tw: 225, tr: 'W-tw-120' });
  const v = evalParams(d.params).values;
  d.steps = [
    ...blk('f1', 'Lower body', 'XZ', '0', ['0', 'gc', 'L', 'bh'], 'W', 'new', v),
    ...blk('f2', 'Cabin', 'XZ', '0', ['cx', 'gc+bh-10', 'cl', 'ch+10'], 'W-220', 'join', v),
    ...wheelSet('w', 'Wheel', ['fo', 'fo+wb'], 'rw', 'tw', 'tr', v, true),
  ];
  d.density = DENS.sedan; return d;
}
export function pickup(): PartDoc {
  const d = newPart('Pickup truck');
  d.params = params({ L: 5300, W: 1950, wb: 3200, fo: 950, gc: 240, bh: 560, cabx: 1050, cabl: 1750, cabh: 800, bedl: 1750, bedh: 480, wall: 90, rw: 380, tw: 265, tr: 'W-tw-120' });
  const v = evalParams(d.params).values;
  d.steps = [
    ...blk('f1', 'Chassis and body', 'XZ', '0', ['0', 'gc', 'L', 'bh'], 'W', 'new', v),
    ...blk('f2', 'Cab', 'XZ', '0', ['cabx', 'gc+bh-10', 'cabl', 'cabh+10'], 'W-160', 'join', v),
    ...blk('f3', 'Load bed walls', 'XZ', '0', ['L-bedl', 'gc+bh-10', 'bedl', 'bedh+10'], 'W', 'join', v),
    ...blk('f4', 'Load bed pocket', 'XZ', '0', ['L-bedl+wall', 'gc+bh+20', 'bedl-wall+10', 'bedh'], 'W-2*wall', 'cut', v),
    ...wheelSet('w', 'Wheel', ['fo', 'fo+wb'], 'rw', 'tw', 'tr', v, true),
  ];
  d.density = DENS.pickup; return d;
}
export function boxTruck(): PartDoc {
  const d = newPart('Box truck');
  d.params = params({ L: 7200, W: 2400, fo: 1100, wb: 3900, ax2: 1350, gc: 460, fh: 640, cabl: 1800, cabh: 1750, boxl: 5000, boxh: 2350, wall: 80, rw: 520, tw: 295, tr: 'W-tw-300' });
  const v = evalParams(d.params).values;
  d.steps = [
    ...blk('f1', 'Chassis frame', 'XZ', '0', ['0', 'gc', 'L', 'fh'], '1000', 'new', v),
    ...blk('f2', 'Cab', 'XZ', '0', ['100', 'gc+fh-10', 'cabl', 'cabh+10'], 'W-250', 'join', v),
    ...blk('f3', 'Cargo box', 'XZ', '0', ['L-boxl', 'gc+fh-10', 'boxl', 'boxh+10'], 'W', 'join', v),
    ...blk('f4', 'Hollow cargo space', 'XZ', '0', ['L-boxl+wall', 'gc+fh+wall', 'boxl-2*wall', 'boxh-2*wall'], 'W-2*wall', 'cut', v),
    ...wheelSet('w', 'Front wheel', ['fo'], 'rw', 'tw', 'tr', v, true),
    ...wheelSet('r', 'Rear wheels', ['fo+wb', 'fo+wb+ax2'], 'rw', 'tw', 'tr', v, true),
  ];
  d.density = DENS.boxTruck; return d;
}
export function bus(): PartDoc {
  const d = newPart('City bus');
  d.params = params({ L: 12000, W: 2550, H: 3250, wb: 6000, fo: 2600, gc: 420, wall: 100, nwin: 7, wl: 1100, wsp: 1300, wz: 1450, wh: 900, rw: 520, tw: 295, tr: 'W-tw-200' });
  const v = evalParams(d.params).values;
  d.steps = [
    ...blk('f1', 'Body', 'XZ', '0', ['0', 'gc', 'L', 'H-gc'], 'W', 'new', v),
    ...blk('f2', 'Hollow the interior', 'XZ', '0', ['wall', 'gc+wall', 'L-2*wall', 'H-gc-2*wall'], 'W-2*wall', 'cut', v),
    ...blk('f3', 'First window', 'XZ', '0', ['900', 'wz', 'wl', 'wh'], 'W+200', 'cut', v),
    lin('f3p', 'Window row', 'f3', 'nwin', 'wsp', '0', '0'),
    ...wheelSet('w', 'Wheel', ['fo', 'fo+wb'], 'rw', 'tw', 'tr', v, true),
  ];
  d.density = DENS.bus; return d;
}
export function motorcycle(): PartDoc {
  const d = newPart('Motorcycle');
  d.params = params({ wb: 1450, rw: 330, tw: 130, rim: 55, hub: 45, eng: 380 });
  const v = evalParams(d.params).values, W = v.wb, R = v.rw;
  d.steps = [
    { ...circles('s1', 'Wheels, rims and hubs', 'XZ', '0', [{ c: ['0', 'rw'], r: 'rw' }, { c: ['0', 'rw'], r: 'rw-rim' }, { c: ['0', 'rw'], r: 'hub' }]), id: 's1' },
    ext('f1', 'Rear wheel', 's1', 'new', 'tw', true),
    { ...circles('s2', 'Front wheel', 'XZ', '0', [{ c: ['wb', 'rw'], r: 'rw' }, { c: ['wb', 'rw'], r: 'rw-rim' }, { c: ['wb', 'rw'], r: 'hub' }]), id: 's2' },
    ext('f2', 'Front wheel', 's2', 'new', 'tw', true),
    ...blk('f3', 'Engine', 'XZ', '0', ['wb*0.28', '230', 'eng', '330'], '360', 'new', v),
    ...bar('f4', 'Swing arm', [0, R], [W * 0.32, 330], 50, '120', 'new'),
    ...bar('f5', 'Frame spine', [W * 0.3, 360], [W * 0.88, 880], 55, '110', 'join'),
    ...bar('f6', 'Seat rail', [W * 0.12, 650], [W * 0.5, 760], 45, '110', 'join'),
    ...bar('f7', 'Fork', [W * 0.9, 930], [W, R], 40, '130', 'new'),
    ...blk('f8', 'Fuel tank', 'XZ', '0', ['wb*0.42', '800', '420', '230'], '300', 'new', v),
    ...blk('f9', 'Seat', 'XZ', '0', ['wb*0.1', '740', '560', '90'], '290', 'new', v),
    ...blk('f10', 'Handlebar', 'YZ', 'wb*0.86', ['-380', '980', '760', '40'], '40', 'new', v),
  ];
  d.density = DENS.motorcycle; return d;
}
export function bicycle(): PartDoc {
  const d = newPart('Bicycle');
  d.params = params({ wb: 1050, rw: 340, rim: 20, hub: 22 });
  const R = 340, W = 1050, BB: P2 = [W * 0.42, R - 55], ST: P2 = [W * 0.36, 900], HT: P2 = [W * 0.9, 860], HB: P2 = [W * 0.93, 520], A: P2 = [0, R], F: P2 = [W, R];
  d.steps = [
    circles('s1', 'Wheels', 'XZ', '0', [{ c: ['0', 'rw'], r: 'rw' }, { c: ['0', 'rw'], r: 'rw-rim' }, { c: ['0', 'rw'], r: 'hub' }]), ext('f1', 'Rear wheel', 's1', 'new', '25', true),
    circles('s2', 'Front wheel', 'XZ', '0', [{ c: ['wb', 'rw'], r: 'rw' }, { c: ['wb', 'rw'], r: 'rw-rim' }, { c: ['wb', 'rw'], r: 'hub' }]), ext('f2', 'Front wheel', 's2', 'new', '25', true),
    ...bar('f3', 'Chain stay', A, BB, 24, '30', 'new'),
    ...bar('f4', 'Seat stay', A, ST, 20, '30', 'join'),
    ...bar('f5', 'Seat tube', BB, ST, 28, '30', 'join'),
    ...bar('f6', 'Top tube', ST, HT, 28, '30', 'join'),
    ...bar('f7', 'Down tube', BB, HB, 34, '30', 'join'),
    ...bar('f8', 'Head tube', HB, [HT[0] - 10, HT[1] + 30], 36, '34', 'join'),
    ...bar('f9', 'Fork', HB, F, 24, '30', 'new'),
    ...bar('f10', 'Seat post', ST, [ST[0] - 30, ST[1] + 120], 26, '26', 'join'),
    ...bar('f11', 'Saddle', [ST[0] - 130, ST[1] + 135], [ST[0] + 100, ST[1] + 135], 40, '140', 'new'),
    ...bar('f12', 'Stem', [HT[0] - 10, HT[1] + 30], [HT[0] - 50, HT[1] + 120], 26, '26', 'join'),
    ...blk('f13', 'Handlebar', 'YZ', 'wb*0.9-50', ['-210', '960', '420', '26'], '26', 'new', evalParams(d.params).values),
  ];
  d.density = DENS.bicycle; return d;
}
export function trailer(): PartDoc {
  const d = newPart('Box trailer');
  d.params = params({ L: 3000, W: 1800, gc: 330, ch: 150, bw: 480, wall: 70, ax: 1350, rw: 300, tw: 200, tr: 'W-tw-80', dl: 1200, dw: 260 });
  const v = evalParams(d.params).values;
  d.steps = [
    ...blk('f1', 'Chassis', 'XZ', '0', ['0', 'gc', 'L', 'ch'], 'W-300', 'new', v),
    ...blk('f2', 'Box', 'XZ', '0', ['0', 'gc+ch-10', 'L', 'bw+10'], 'W', 'join', v),
    ...blk('f3', 'Inside of the box', 'XZ', '0', ['wall', 'gc+ch+30', 'L-2*wall', 'bw'], 'W-2*wall', 'cut', v),
    { ...poly('s4', 'Drawbar A-frame', 'XY', 'gc', [[100, -v.dw], [100, v.dw], [-v.dl, 0]], [`${2 * v.dw}`, undefined, undefined]), id: 's4' },
    ext('f4', 'Drawbar', 's4', 'join', '90'),
    ...wheelSet('w', 'Wheel', ['ax'], 'rw', 'tw', 'tr', v, true),
  ];
  d.density = DENS.trailer; return d;
}
export function tractor(): PartDoc {
  const d = newPart('Farm tractor');
  d.params = params({ L: 3900, hoodl: 1500, hw: 700, cw: 1350, chassisH: 220, rrw: 800, rtw: 450, rtr: 1650, frw: 500, ftw: 250, ftr: 1500, rax: 2650, fax: 500, cabx: 1750, cabl: 1350, cabh: 1450, exh: 36 });
  const v = evalParams(d.params).values;
  d.steps = [
    ...blk('f1', 'Chassis', 'XZ', '0', ['0', '600', 'L-500', 'chassisH'], '700', 'new', v),
    ...blk('f2', 'Engine hood', 'XZ', '0', ['0', '700', 'hoodl', '700'], 'hw', 'join', v),
    ...blk('f3', 'Cab', 'XZ', '0', ['cabx', '700', 'cabl', 'cabh'], 'cw', 'join', v),
    ...blk('f4', 'Cab roof', 'XZ', '0', ['cabx-80', '700+cabh-10', 'cabl+160', '90'], '1700', 'join', v),
    circles('s5', 'Exhaust pipe', 'XY', '1400', [{ c: ['hoodl-300', '0'], r: 'exh' }]), ext('f5', 'Exhaust pipe', 's5', 'join', '650'),
    ...wheelSet('r', 'Rear wheel', ['rax'], 'rrw', 'rtw', 'rtr', v, false),
    ...wheelSet('n', 'Front wheel', ['fax'], 'frw', 'ftw', 'ftr', v, false),
  ];
  d.density = DENS.tractor; return d;
}

// ---------- vehicle components, to build a vehicle from scratch ----------
export function ladderFrame(): PartDoc {
  const d = newPart('Ladder chassis frame');
  d.params = params({ L: 4200, gauge: 820, rail: 100, rh: 160, cm: 70, nx: 6, sp: 700, x0: 300 });
  const v = evalParams(d.params).values;
  d.steps = [
    rects('s1', 'Side rails', 'XY', '0', [['0', '0-gauge/2-rail/2', 'L', 'rail'], ['0', 'gauge/2-rail/2', 'L', 'rail']], v), ext('f1', 'Rails', 's1', 'new', 'rh'),
    rects('s2', 'First cross member', 'XY', '0', [['x0', '0-gauge/2', 'cm', 'gauge']], v), ext('f2', 'Cross member', 's2', 'join', 'rh'),
    lin('f3', 'Cross members', 'f2', 'nx', 'sp', '0', '0'),
  ];
  d.density = DENS.ladder; return d;
}
export function axle(): PartDoc {
  const d = newPart('Axle with hubs');
  d.params = params({ track: 1500, ad: 70, hd: 160, hl: 60, dr: 140, dl: 200 });
  d.steps = [
    circles('s1', 'Axle tube', 'XZ', '0', [{ c: ['0', '0'], r: 'ad/2' }]), ext('f1', 'Axle beam', 's1', 'new', 'track', true),
    circles('s2', 'Wheel hub', 'XZ', 'track/2', [{ c: ['0', '0'], r: 'hd/2' }]), ext('f2', 'Hub', 's2', 'join', 'hl', true), lin('f3', 'Hub, other side', 'f2', '2', '0', 'track', '0'),
    circles('s4', 'Differential housing', 'YZ', '0', [{ c: ['0', '0'], r: 'dr' }]), ext('f4', 'Differential', 's4', 'join', 'dl', true),
  ];
  d.density = DENS.axle; return d;
}
export function engineBlock(): PartDoc {
  const d = newPart('Inline-4 engine block');
  d.params = params({ bl: 400, bw: 260, bh: 300, bore: 84, bdep: 220, pitch: 94, b0: 55, skirt: 40 });
  const v = evalParams(d.params).values;
  d.steps = [
    rects('s1', 'Block outline', 'XY', '0', [['0', '0', 'bl', 'bw']], v), ext('f1', 'Block', 's1', 'new', 'bh'),
    circles('s2', 'First cylinder', 'XY', 'bh-bdep', [{ c: ['b0', 'bw/2'], r: 'bore/2' }]), ext('f2', 'Cylinder bore', 's2', 'cut', 'bdep+2'), lin('f3', 'Four cylinders', 'f2', '4', 'pitch', '0', '0'),
    rects('s4', 'Crankcase skirt', 'XY', '0-skirt', [['0-10', '0-10', 'bl+20', 'bw+20']], v), ext('f4', 'Skirt', 's4', 'join', 'skirt+10'),
  ];
  d.density = DENS.engine; return d;
}
export function steeringWheel(): PartDoc {
  const d = newPart('Steering wheel');
  d.params = params({ R: 190, rimt: 28, hub: 40, sp: 24, th: 30 });
  const v = evalParams(d.params).values;
  d.steps = [
    circles('s1', 'Rim', 'XY', '0', [{ c: ['0', '0'], r: 'R' }, { c: ['0', '0'], r: 'R-rimt' }]), ext('f1', 'Rim', 's1', 'new', 'th', true),
    circles('s2', 'Hub', 'XY', '0', [{ c: ['0', '0'], r: 'hub' }]), ext('f2', 'Hub', 's2', 'join', 'th+10', true),
    rects('s3', 'Spokes', 'XY', '0', [['0-R+5', '0-sp/2', '2*R-10', 'sp'], ['0-sp/2', '0-R+5', 'sp', 'R-5']], v), ext('f3', 'Spokes', 's3', 'join', 'th-8', true),
  ];
  d.density = DENS.wheel; return d;
}
export function seat(): PartDoc {
  const d = newPart('Driver seat');
  d.params = params({ sl: 480, sw: 500, sh: 120, bh: 560, bt: 110, hr: 140 });
  const v = evalParams(d.params).values;
  d.steps = [
    ...blk('f1', 'Cushion', 'XZ', '0', ['0', '0', 'sl', 'sh'], 'sw', 'new', v),
    ...blk('f2', 'Backrest', 'XZ', '0', ['sl-bt', 'sh-10', 'bt', 'bh+10'], 'sw', 'join', v),
    ...blk('f3', 'Headrest', 'XZ', '0', ['sl-bt-10', 'sh+bh+20', 'bt+20', 'hr'], 'sw*0.6', 'join', v),
  ];
  d.density = DENS.seat; return d;
}

// Densities (kg/m³ of the modelled solid) chosen so that the mass shown equals the real kerb weight of the template.
const DENS: Record<string, number> = { sedan: 231, pickup: 245, boxTruck: 316, bus: 880, motorcycle: 1504, bicycle: 2000, trailer: 363, tractor: 741, ladder: 7850, axle: 7850, engine: 2700, wheel: 1100, seat: 350 };

export const VEHICLE_TEMPLATES: Template[] = [
  { key: 'sedan', label: 'Sedan car', group: 'vehicle', blurb: 'Four-door car: body, cabin, four wheels in arches', make: sedan },
  { key: 'pickup', label: 'Pickup truck', group: 'vehicle', blurb: 'Double cab with an open load bed', make: pickup },
  { key: 'boxtruck', label: 'Box truck', group: 'vehicle', blurb: 'Cab, cargo box and a three-axle chassis', make: boxTruck },
  { key: 'bus', label: 'City bus', group: 'vehicle', blurb: 'Hollow 12 m body with a row of windows', make: bus },
  { key: 'motorcycle', label: 'Motorcycle', group: 'vehicle', blurb: 'Frame, engine, tank, seat, fork and two wheels', make: motorcycle },
  { key: 'bicycle', label: 'Bicycle', group: 'vehicle', blurb: 'Diamond frame, fork, saddle, bars, two wheels', make: bicycle },
  { key: 'trailer', label: 'Box trailer', group: 'vehicle', blurb: 'Chassis, open box, A-frame drawbar and axle', make: trailer },
  { key: 'tractor', label: 'Farm tractor', group: 'vehicle', blurb: 'Hood, cab, roof, exhaust, big rear wheels', make: tractor },
  { key: 'ladder', label: 'Ladder chassis', group: 'component', blurb: 'Two side rails and a row of cross members', make: ladderFrame },
  { key: 'axle', label: 'Axle with hubs', group: 'component', blurb: 'Beam, two wheel hubs and a differential', make: axle },
  { key: 'engine', label: 'Engine block', group: 'component', blurb: 'Inline-4 block with cylinders and a skirt', make: engineBlock },
  { key: 'steer', label: 'Steering wheel', group: 'component', blurb: 'Rim, hub and spokes', make: steeringWheel },
  { key: 'seat', label: 'Driver seat', group: 'component', blurb: 'Cushion, backrest and headrest', make: seat },
];
