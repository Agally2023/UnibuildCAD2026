// Machine parts modelled after standard CAD practice drawings (SolidWorks-style exercises): every one is built from sketches and
// features (extrude with edge rounds, revolve, loft, sweep, hole wizard, patterns, mirror, shell) driven by named parameters,
// so it opens in the timeline and can be edited like a part you drew yourself. Lengths in millimetres, Z up.
import { calc } from './sketch';
import { FINISHES } from './materials';
import { newPart, type FeatureStep, type HoleStep, type LoftStep, type MirrorStep, type PartDoc, type PatternStep, type SketchStep, type Step, type SweepStep } from './parts';
import { circles, ext, params, poly, rev, ring, type Template } from './partlib';
import type { Plane } from './solid';
import type { Sketch } from './sketch';

type P2 = [number, number];
const D2R = Math.PI / 180;

// ---------- sketch helpers ----------
export const rrPts = (w: number, h: number, r: number, cx = 0, cy = 0, n = 6): P2[] => {
  const out: P2[] = [], c: P2[] = [[cx + w / 2 - r, cy + h / 2 - r], [cx - w / 2 + r, cy + h / 2 - r], [cx - w / 2 + r, cy - h / 2 + r], [cx + w / 2 - r, cy - h / 2 + r]];
  c.forEach((q, k) => { for (let i = 0; i <= n; i++) { const ang = (k * 90 + (i / n) * 90) * D2R; out.push([q[0] + r * Math.cos(ang), q[1] + r * Math.sin(ang)]); } });
  return out;
};
export const arcPts = (cx: number, cy: number, r: number, a0: number, a1: number, n = 10): P2[] => Array.from({ length: n + 1 }, (_, i) => { const a = (a0 + ((a1 - a0) * i) / n) * D2R; return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as P2; });
// A free polygon (corners placed by number; drag them in the sketch to change the shape).
export function loop(id: string, name: string, plane: Plane, offset: string, pts: P2[]): SketchStep {
  const sk: Sketch = { pts: pts.map((p, i) => ({ id: `p${i}`, x: p[0], y: p[1] })), lines: pts.map((_, i) => ({ id: `l${i}`, a: `p${i}`, b: `p${(i + 1) % pts.length}` })), circles: [], cons: [{ id: 'fx', t: 'fix', p: 'p0' }] };
  return { id, type: 'sketch', name, plane, offset, sk };
}
// Free circles: one per centre; the radius is a plain number (hole steps can override it with a parameter).
export function dots(id: string, name: string, plane: Plane, offset: string, centres: P2[], r = 5): SketchStep {
  const sk: Sketch = { pts: centres.map((p, i) => ({ id: `c${i}`, x: p[0], y: p[1] })), lines: [], circles: centres.map((_, i) => ({ id: `o${i}`, c: `c${i}`, r })), cons: [] };
  return { id, type: 'sketch', name, plane, offset, sk };
}
export const ringPts = (cx: number, cy: number, pcd: number, n: number, start = 0): P2[] => Array.from({ length: n }, (_, i) => { const a = (start + (360 * i) / n) * D2R; return [cx + (pcd / 2) * Math.cos(a), cy + (pcd / 2) * Math.sin(a)] as P2; });

export function kit(v: Record<string, number>) {
  const C = (e: string) => calc(e, v);
  // rectangle sized by expressions and centred at (cx, cy)
  const rect = (id: string, name: string, plane: Plane, off: string, w: string, h: string, cx = '0', cy = '0') =>
    poly(id, name, plane, off, [[C(cx) - C(w) / 2, C(cy) - C(h) / 2], [C(cx) + C(w) / 2, C(cy) - C(h) / 2], [C(cx) + C(w) / 2, C(cy) + C(h) / 2], [C(cx) - C(w) / 2, C(cy) + C(h) / 2]], [w, h, w, h], { anchor: { dx: `(${cx})-(${w})/2`, dy: `(${cy})-(${h})/2` } });
  // half section for a revolve: (radius, height) corners from the axis; edges are frozen at their drawn length
  const half = (id: string, name: string, pts: P2[], exprs: (string | undefined)[] = []) => poly(id, name, 'XZ', '0', pts, exprs, { anchor: { dx: String(pts[0][0]), dy: String(pts[0][1]) }, axisLen: Math.max(...pts.map(p => p[1])) + 20 });
  const hole = (id: string, name: string, sketch: string, kind: HoleStep['hole'], dia: string, depth: string, cdia = '0', cdepth = '0'): HoleStep => ({ id, type: 'hole', name, sketch, hole: kind, dia, cdia, cdepth, depth });
  const lft = (id: string, name: string, a: string, b: string, op: FeatureStep['op'] = 'join'): LoftStep => ({ id, type: 'loft', name, sketch: a, sketch2: b, op });
  const swp = (id: string, name: string, path: string, dia: string, bore: string, bend: string, op: FeatureStep['op'] = 'new'): SweepStep => ({ id, type: 'sweep', name, path, dia, bore, bend, op });
  const mir = (id: string, name: string, of: string, plane: Plane, offset = '0'): MirrorStep => ({ id, type: 'mirror', name, of, plane, offset });
  const lin = (id: string, name: string, of: string, count: string, dx: string, dy = '0', dz = '0'): PatternStep => ({ id, type: 'pattern', name, of, mode: 'linear', count, dx, dy, dz, axis: 'z', angle: '360', cx: '0', cy: '0', cz: '0' });
  const cir = (id: string, name: string, of: string, count: string, axis: 'x' | 'y' | 'z' = 'z', c: [string, string, string] = ['0', '0', '0']): PatternStep => ({ ...ring(id, name, of, count), axis, cx: c[0], cy: c[1], cz: c[2] });
  const x = (id: string, name: string, sketch: string, op: FeatureStep['op'], depth: string, o: Partial<FeatureStep> = {}): FeatureStep => ({ ...ext(id, name, sketch, op, depth), ...o });
  return { C, rect, half, hole, lft, swp, mir, lin, cir, x };
}
const mk = (name: string, v: Record<string, number>, finish: string | undefined, f: (k: ReturnType<typeof kit>) => Step[]): PartDoc => {
  const d = newPart(name); d.params = params(v); d.steps = f(kit(v)); if (finish) { d.finish = finish; d.density = FINISHES.find(x => x.key === finish)?.density ?? d.density; }
  return d;
};

// ---------- brackets, housings and blocks ----------
export function clevisBracket(): PartDoc {
  const v = { Wd: 75, tb: 15, lug: 20, hd: 12, lugd: 20, hc: 45, rib: 8, hx: 40 };
  return mk('Clevis bracket', v, 'castiron', k => {
    const lugPts: P2[] = [[-30, 14], [30, 14], [26, 26], [25, 45], ...arcPts(0, 45, 25, 0, 180, 14), [-25, 45], [-26, 26]];
    return [
      loop('s1', 'Base plate outline', 'XY', '0', rrPts(100, 75, 6, 0, 37.5)), k.x('f1', 'Base plate', 's1', 'new', 'tb', { fillet: '1.5' }),
      loop('s2', 'Lug profile', 'XZ', '0', lugPts), k.x('f2', 'Lug', 's2', 'join', '-lug'),
      loop('s3', 'Rib profile', 'YZ', '0', [[20, 14], [66, 14], [20, 52]]), k.x('f3', 'Rib', 's3', 'join', 'rib', { symmetric: true }),
      circles('s4', 'Lug bore centre', 'XZ', '5', [{ c: ['0', 'hc'], r: 'lugd/2' }]), k.hole('f4', 'Lug bore', 's4', 'simple', 'lugd', '-30'),
      circles('s5', 'Base hole', 'XY', 'tb', [{ c: ['-hx', 'Wd/2+10'], r: 'hd/2' }]), k.hole('f5', 'Base hole', 's5', 'simple', 'hd', '-(tb+2)'), k.lin('f6', 'Second hole', 'f5', '2', '2*hx'),
    ];
  });
}

export function flangeBlock(): PartDoc {
  const v = { t: 15, bossD: 60, bossH: 20, bore: 20, cb: 40, cbd: 8, hd: 12 };
  return mk('Flanged boss plate', v, 'castiron', k => [
    loop('s1', 'Plate outline', 'XY', '0', rrPts(120, 100, 15)), k.x('f1', 'Plate', 's1', 'new', 't', { fillet: '1.2' }),
    circles('s2', 'Boss', 'XY', 't', [{ c: ['0', '0'], r: 'bossD/2' }]), k.x('f2', 'Boss', 's2', 'join', 'bossH', { fillet: '1.5', edges: 'top' }),
    circles('s3', 'Bore centre', 'XY', 't+bossH', [{ c: ['0', '0'], r: 'bore/2' }]), k.hole('f3', 'Counterbored bore', 's3', 'cbore', 'bore', '-(t+bossH+2)', 'cb', 'cbd'),
    dots('s4', 'Corner holes', 'XY', 't', [[40, 30], [-40, 30], [-40, -30], [40, -30]], 6), k.hole('f4', 'Corner holes', 's4', 'simple', 'hd', '-(t+2)'),
  ]);
}

export function bearingBlock(): PartDoc {
  const v = { L: 115, W: 64, tb: 12, H: 56, wall: 16, R: 24, bh: 20, cb: 34, cbd: 5, dr: 16, hd: 12 };
  return mk('Bearing block', v, 'steel', k => [
    k.rect('s1', 'Base', 'XY', '0', 'L', 'W', 'L/2', 'W/2'), k.x('f1', 'Base plate', 's1', 'new', 'tb', { fillet: '1' }),
    k.rect('s2', 'Back wall', 'XY', 'tb', 'L', 'wall', 'L/2', 'W-wall/2'), k.x('f2', 'Back wall', 's2', 'join', 'H-tb'),
    k.rect('s3', 'Right pillar', 'XY', 'tb', '24', 'W', 'L-12', 'W/2'), k.x('f3', 'Right pillar', 's3', 'join', 'H-tb'),
    circles('s4', 'Boss', 'XY', 'tb', [{ c: ['32', '26'], r: 'R' }]), k.x('f4', 'Round boss', 's4', 'join', 'bh', { fillet: '1', edges: 'top' }),
    circles('s5', 'Boss bore', 'XY', 'tb+bh', [{ c: ['32', '26'], r: 'dr/2' }]), k.hole('f5', 'Counterbored hole', 's5', 'cbore', 'dr', '-(bh+tb+2)', 'cb', 'cbd'),
    dots('s6', 'Base holes', 'XY', 'tb', [[64, 18], [64, 40]], 6), k.hole('f6', 'Base holes', 's6', 'simple', 'hd', '-(tb+2)'),
    loop('s7', 'Rib profile', 'YZ', '55', [[W(v) - 16, 11], [W(v) - 16 - 28, 11], [W(v) - 16, 40]]), k.x('f7', 'Rib', 's7', 'join', '8'),
  ]);
}
const W = (v: Record<string, number>) => v.W;

export function portHousing(): PartDoc {
  const v = { tb: 6, Dm: 42, bore: 25, Hm: 56, Dp: 32, pb: 18, hd: 6 };
  return mk('Port housing', v, 'yellow', k => [
    circles('s1', 'Base disc', 'XY', '0', [{ c: ['0', '0'], r: '54' }]), k.x('f1', 'Base disc', 's1', 'new', 'tb', { fillet: '1' }),
    dots('s2', 'Lugs', 'XY', '0', ringPts(0, 0, 108, 3, 60), 10), k.x('f2', 'Lugs', 's2', 'join', 'tb', { fillet: '1' }),
    dots('s3', 'Lug holes', 'XY', 'tb', ringPts(0, 0, 108, 3, 60), 3), k.hole('f3', 'Lug holes', 's3', 'simple', 'hd', '-(tb+2)'),
    circles('s4', 'Centre boss', 'XY', '0', [{ c: ['0', '0'], r: 'Dm/2' }]), k.x('f4', 'Centre boss', 's4', 'join', 'Hm', { fillet: '1.2', edges: 'top' }),
    loop('s5', 'Gusset', 'XZ', '0', [[20, 5], [46, 5], [20, 24]]), k.x('f5', 'Gusset', 's5', 'join', '6', { symmetric: true }),
    circles('s6', 'Side port', 'YZ', '0', [{ c: ['0', '34'], r: 'Dp/2' }]), k.x('f6', 'Side port boss', 's6', 'join', '46', { fillet: '1', edges: 'top' }),
    circles('s7', 'Main bore', 'XY', 'Hm', [{ c: ['0', '0'], r: 'bore/2' }]), k.hole('f7', 'Main bore', 's7', 'simple', 'bore', '-(Hm+2)'),
    circles('s8', 'Port bore', 'YZ', '50', [{ c: ['0', '34'], r: 'pb/2' }]), k.hole('f8', 'Port bore', 's8', 'simple', 'pb', '-40'),
  ]);
}

export function bronzeSleeve(): PartDoc {
  const v = { t: 12, D: 60, H: 80, bore: 30, cb: 40, cbd: 16, hd: 15, lugD: 30, lugB: 16 };
  const outline: P2[] = [...arcPts(-35, -35, 15, 180, 270, 6), ...arcPts(78, 0, 16, -70, 70, 8), ...arcPts(-35, 35, 15, 90, 180, 6)];
  return mk('Bronze bearing housing', v, 'bronze', k => [
    loop('s1', 'Base outline', 'XY', '0', outline), k.x('f1', 'Base plate', 's1', 'new', 't', { fillet: '1' }),
    circles('s2', 'Sleeve', 'XY', '0', [{ c: ['0', '0'], r: 'D/2' }]), k.x('f2', 'Sleeve', 's2', 'join', 'H', { fillet: '2', edges: 'top' }),
    circles('s3', 'Bore', 'XY', 'H', [{ c: ['0', '0'], r: 'bore/2' }]), k.hole('f3', 'Counterbored bore', 's3', 'cbore', 'bore', '-(H+2)', 'cb', 'cbd'),
    dots('s4', 'Base holes', 'XY', 't', [[-35, 35], [-35, -35], [78, 0]], 7), k.hole('f4', 'Base holes', 's4', 'simple', 'hd', '-(t+2)'),
    circles('s5', 'Side lug', 'XZ', '0', [{ c: ['0', '30'], r: 'lugD/2' }]), k.x('f5', 'Side lug', 's5', 'join', '50', { fillet: '1.5', edges: 'top' }),
    loop('s6', 'Lug gusset', 'YZ', '0', [[-12, 12], [-48, 12], [-48, 30], [-12, 40]]), k.x('f6', 'Lug gusset', 's6', 'join', '8', { symmetric: true }),
    circles('s7', 'Lug bore', 'XZ', '-5', [{ c: ['0', '30'], r: 'lugB/2' }]), k.hole('f7', 'Lug bore', 's7', 'simple', 'lugB', '60'),
  ]);
}

export function loftedBracket(): PartDoc {
  const v = { t: 10, H: 43, hd: 12, bore: 40 };
  return mk('Lofted housing bracket', v, 'castiron', k => [
    loop('s1', 'Base plate', 'XY', '0', rrPts(160, 90, 10)), k.x('f1', 'Base plate', 's1', 'new', 't', { fillet: '1' }),
    loop('s2', 'Loft start', 'XY', 't', rrPts(100, 64, 8)), loop('s3', 'Loft end', 'XY', 't+H', rrPts(80, 60, 28, 0, 0, 8)), k.lft('f2', 'Loft to oval collar', 's2', 's3'),
    loop('s4', 'Rib', 'XZ', '0', [[-62, 9], [-40, 9], [-40, 30]]), k.x('f3', 'Rib', 's4', 'join', '8', { symmetric: true }), k.mir('f4', 'Mirror rib', 'f3', 'YZ'),
    circles('s5', 'Bore', 'XY', 't+H', [{ c: ['0', '0'], r: 'bore/2' }]), k.hole('f5', 'Bore', 's5', 'simple', 'bore', '-(t+H+2)'),
    dots('s6', 'Base holes', 'XY', 't', [[-65, 30], [65, 30], [-65, -30], [65, -30]], 6), k.hole('f6', 'Base holes', 's6', 'simple', 'hd', '-(t+2)'),
  ]);
}

export function pumpHousing(): PartDoc {
  const v = { hd: 9, nr: 4, rt: 6 };
  return mk('Ribbed pump housing', v, 'castiron', k => [
    k.half('s1', 'Half section', [[0, 0], [50, 0], [50, 10], [36, 10], [36, 70], [40, 70], [40, 90], [25, 90], [25, 20], [0, 20]]), { id: 'f1', type: 'revolve', name: 'Revolve body', sketch: 's1', op: 'new', depth: '0', angle: '360' } as FeatureStep,
    loop('s2', 'Rib profile', 'XZ', '0', [[34, 9], [49, 9], [34, 52]]), k.x('f2', 'Rib', 's2', 'join', 'rt', { symmetric: true }), k.cir('f3', 'Four ribs', 'f2', 'nr'),
    dots('s3', 'Ears', 'XY', '0', ringPts(0, 0, 104, 2, 45), 9), k.x('f4', 'Mounting ears', 's3', 'join', '10', { fillet: '1' }),
    dots('s4', 'Ear holes', 'XY', '10', ringPts(0, 0, 104, 2, 45), 4), k.hole('f5', 'Ear holes', 's4', 'simple', 'hd', '-12'),
  ]);
}

export function squareToRound(): PartDoc {
  const v = { tb: 15, H: 70, tf: 12, bore: 60, hd: 10 };
  const circ = arcPts(0, 0, 45, 0, 360, 48).slice(0, -1);
  return mk('Square-to-round adapter', v, 'steel', k => [
    loop('s1', 'Base plate', 'XY', '0', rrPts(160, 150, 10)), k.x('f1', 'Base plate', 's1', 'new', 'tb', { fillet: '1' }),
    loop('s2', 'Loft start', 'XY', 'tb', rrPts(130, 120, 18)), loop('s3', 'Loft end', 'XY', 'tb+H', circ), k.lft('f2', 'Loft square to round', 's2', 's3'),
    circles('s4', 'Top flange', 'XY', 'tb+H', [{ c: ['0', '0'], r: '60' }]), k.x('f3', 'Top flange', 's4', 'join', 'tf', { fillet: '1', edges: 'top' }),
    circles('s5', 'Through bore', 'XY', 'tb+H+tf', [{ c: ['0', '0'], r: 'bore/2' }]), k.hole('f4', 'Through bore', 's5', 'simple', 'bore', '-(tb+H+tf+2)'),
    dots('s6', 'Base holes', 'XY', 'tb', [[70, 65], [-70, 65], [-70, -65], [70, -65]], 5), k.hole('f5', 'Base holes', 's6', 'simple', 'hd', '-(tb+2)'),
    dots('s7', 'Flange holes', 'XY', 'tb+H+tf', ringPts(0, 0, 100, 4, 45), 4), k.hole('f6', 'Flange holes', 's7', 'simple', '8', '-(tf+2)'),
  ]);
}

export function teeValve(): PartDoc {
  const v = { D: 50, run: 200, Hup: 80, Df: 100, tf: 12, bore: 30, pcd: 80, hd: 10 };
  return mk('Three-way flanged valve body', v, 'castiron', k => [
    circles('s1', 'Run', 'YZ', '0', [{ c: ['0', '0'], r: 'D/2' }]), k.x('f1', 'Run pipe', 's1', 'new', 'run', { symmetric: true }),
    circles('s2', 'Branch', 'XY', '0', [{ c: ['0', '0'], r: 'D/2' }]), k.x('f2', 'Vertical branch', 's2', 'join', 'Hup'),
    circles('s3', 'Left flange', 'YZ', '-run/2', [{ c: ['0', '0'], r: 'Df/2' }]), k.x('f3', 'Left flange', 's3', 'join', 'tf', { fillet: '1', edges: 'top' }),
    circles('s4', 'Right flange', 'YZ', 'run/2-tf', [{ c: ['0', '0'], r: 'Df/2' }]), k.x('f4', 'Right flange', 's4', 'join', 'tf', { fillet: '1', edges: 'bottom' }),
    circles('s5', 'Top flange', 'XY', 'Hup-tf', [{ c: ['0', '0'], r: 'Df/2' }]), k.x('f5', 'Top flange', 's5', 'join', 'tf', { fillet: '1', edges: 'top' }),
    circles('s6', 'Run bore', 'YZ', '-run/2-1', [{ c: ['0', '0'], r: 'bore/2' }]), k.hole('f6', 'Run bore', 's6', 'simple', 'bore', 'run+2'),
    circles('s7', 'Branch bore', 'XY', 'Hup+1', [{ c: ['0', '0'], r: 'bore/2' }]), k.hole('f7', 'Branch bore', 's7', 'simple', 'bore', '-(Hup+1)'),
    dots('s8', 'Top bolt holes', 'XY', 'Hup', ringPts(0, 0, 80, 4, 45), 5), k.hole('f8', 'Top bolt holes', 's8', 'simple', 'hd', '-(tf+2)'),
    dots('s9', 'Left bolt holes', 'YZ', '-run/2', ringPts(0, 0, 80, 4, 45), 5), k.hole('f9', 'Left bolt holes', 's9', 'simple', 'hd', 'tf+2'),
    dots('s10', 'Right bolt holes', 'YZ', 'run/2', ringPts(0, 0, 80, 4, 45), 5), k.hole('f10', 'Right bolt holes', 's10', 'simple', 'hd', '-(tf+2)'),
  ]);
}

export function shelledHousing(): PartDoc {
  const v = { H: 40, wall: 3, hd: 5 };
  return mk('Shelled housing', v, 'aluminium', k => [
    loop('s1', 'Box outline', 'XY', '0', rrPts(100, 60, 8)), k.x('f1', 'Shelled box (open top)', 's1', 'new', 'H', { fillet: '1', edges: 'bottom', wall: 'wall', open: 'top' }),
    dots('s2', 'Ears', 'XY', '0', [[-56, 0], [56, 0]], 9), k.x('f2', 'Mounting ears', 's2', 'join', '4', { fillet: '1' }),
    dots('s3', 'Ear holes', 'XY', '4', [[-56, 0], [56, 0]], 2.5), k.hole('f3', 'Ear holes', 's3', 'simple', 'hd', '-6'),
    circles('s4', 'Gland boss', 'XZ', '30', [{ c: ['0', '20'], r: '14' }]), k.x('f4', 'Cable gland boss', 's4', 'join', '8'),
    circles('s5', 'Gland hole', 'XZ', '36', [{ c: ['0', '20'], r: '8' }]), k.hole('f5', 'Gland hole', 's5', 'simple', '16', '-16'),
  ]);
}

export function stepBlock(): PartDoc {
  const v = { W: 60 };
  return mk('Three-step block', v, 'steel', k => [
    loop('s1', 'Step profile', 'XZ', '0', [[0, 0], [80, 0], [80, 10], [50, 10], [50, 22], [30, 22], [30, 32], [0, 32]]), k.x('f1', 'Stepped block', 's1', 'new', '-W', { chamfer: '0.8' }),
    dots('s2', 'Top hole', 'XY', '32', [[15, 30]], 7.5), k.hole('f2', 'Top hole', 's2', 'simple', '15', '-34'),
    dots('s3', 'Middle hole', 'XY', '22', [[40, 30]], 4), k.hole('f3', 'Counterbored hole', 's3', 'cbore', '8', '-24', '14', '3'),
    dots('s4', 'Low hole', 'XY', '10', [[65, 30]], 6.5), k.hole('f4', 'Low hole', 's4', 'simple', '13', '-12'),
  ]);
}

export function stepPyramid(): PartDoc {
  const v = { B: 100, s: 24, t: 12 };
  const c4 = (r: number): P2[] => [[r, r], [-r, r], [-r, -r], [r, -r]];
  return mk('Square step pyramid', v, 'aluminium', k => [
    k.rect('s1', 'Tier 1', 'XY', '0', 'B', 'B'), k.x('f1', 'Tier 1', 's1', 'new', '10', { fillet: '0.8' }),
    k.rect('s2', 'Tier 2', 'XY', '10', 'B-s', 'B-s'), k.x('f2', 'Tier 2', 's2', 'join', 't'),
    k.rect('s3', 'Tier 3', 'XY', '10+t', 'B-2*s', 'B-2*s'), k.x('f3', 'Tier 3', 's3', 'join', 't'),
    k.rect('s4', 'Tier 4', 'XY', '10+2*t', 'B-3*s', 'B-3*s'), k.x('f4', 'Tier 4', 's4', 'join', 't'),
    dots('s5', 'Ledge holes 1', 'XY', '10', c4(44), 2.5), k.hole('f5', 'Ledge holes tier 1', 's5', 'simple', '5', '-12'),
    dots('s6', 'Ledge holes 2', 'XY', '10+t', c4(32), 2.5), k.hole('f6', 'Ledge holes tier 2', 's6', 'simple', '5', '-14'),
    dots('s7', 'Ledge holes 3', 'XY', '10+2*t', c4(20), 2.5), k.hole('f7', 'Ledge holes tier 3', 's7', 'simple', '5', '-14'),
    circles('s8', 'Centre hole', 'XY', '10+3*t', [{ c: ['0', '0'], r: '5' }]), k.hole('f8', 'Centre hole', 's8', 'simple', '10', '-14'),
  ]);
}

export function slotRail(): PartDoc {
  const v = { L: 120 };
  return mk('T-slot guide rail', v, 'aluminium', k => [
    loop('s1', 'Rail section', 'YZ', '0', [[-20, 0], [20, 0], [20, 40], [7, 40], [7, 28], [13, 28], [13, 16], [-13, 16], [-13, 28], [-7, 28], [-7, 40], [-20, 40]]), k.x('f1', 'Rail', 's1', 'new', 'L', { symmetric: true, chamfer: '2' }),
    dots('s2', 'Slot floor holes', 'XY', '16', [[-40, 0], [0, 0], [40, 0]], 4), k.hole('f2', 'Counterbored slot holes', 's2', 'cbore', '8', '-18', '14', '5'),
  ]);
}

// ---------- turned parts and discs ----------
const rv = (id: string, sketch: string): FeatureStep => ({ id, type: 'revolve', name: 'Revolve', sketch, op: 'new', depth: '0', angle: '360' });

export function flangedShaft(): PartDoc {
  const v = { hd: 6 };
  return mk('Flanged stepped shaft', v, 'steel', k => [
    k.half('s1', 'Half section', [[0, 0], [35, 0], [35, 10], [25, 10], [25, 35], [20, 35], [20, 55], [15, 55], [15, 75], [0, 75]]), rv('f1', 's1'),
    loop('s2', 'Keyway', 'XY', '55', [[10, -2.5], [16, -2.5], [16, 2.5], [10, 2.5]]), k.x('f2', 'Keyway', 's2', 'cut', '21'),
    dots('s3', 'Flange holes', 'XY', '10', ringPts(0, 0, 60, 3, 90), 3), k.hole('f3', 'Flange holes', 's3', 'simple', 'hd', '-12'),
    circles('s4', 'Centre drill', 'XY', '75', [{ c: ['0', '0'], r: '5' }]), k.hole('f4', 'Centre drill', 's4', 'simple', '10', '-20'),
  ]);
}

export function steppedCup(): PartDoc {
  const v = { hd: 4 };
  return mk('Stepped cup with flange', v, 'brass', k => [
    k.half('s1', 'Half section', [[14, 0], [24, 0], [24, 14], [40, 14], [40, 26], [30, 26], [24, 20], [14, 12]]), rv('f1', 's1'),
    dots('s2', 'Flange holes', 'XY', '26', ringPts(0, 0, 70, 6, 0), 2), k.hole('f2', 'Flange holes', 's2', 'simple', 'hd', '-12'),
  ]);
}

export function tierDisc(): PartDoc {
  const v = { hd: 6 };
  return mk('Three-tier disc', v, 'steel', k => [
    k.half('s1', 'Half section', [[0, 0], [60, 0], [60, 12], [45, 12], [45, 24], [28, 24], [28, 40], [0, 40]]), rv('f1', 's1'),
    circles('s2', 'Outer tier hole', 'XY', '12', [{ c: ['52', '0'], r: 'hd/2' }]), k.hole('f2', 'Outer tier hole', 's2', 'simple', 'hd', '-14'), k.cir('f3', 'Eight holes', 'f2', '8'),
    circles('s3', 'Middle tier hole', 'XY', '24', [{ c: ['36', '0'], r: '2.5' }]), k.hole('f4', 'Middle tier hole', 's3', 'simple', '5', '-14'), k.cir('f5', 'Six holes', 'f4', '6'),
    circles('s4', 'Centre hole', 'XY', '40', [{ c: ['0', '0'], r: '6.5' }]), k.hole('f6', 'Centre hole', 's4', 'simple', '13', '-42'),
  ]);
}

export function hubDisc(): PartDoc {
  const v = { pcd: 120, hd: 10, nh: 12 };
  return mk('Keyed hub disc', v, 'steel', k => [
    k.half('s1', 'Half section', [[0, 0], [80, 0], [80, 5], [77, 7.5], [80, 10], [80, 15], [77, 17.5], [80, 20], [25, 20], [25, 40], [0, 40]]), rv('f1', 's1'),
    circles('s2', 'Bolt hole', 'XY', '20', [{ c: ['pcd/2', '0'], r: 'hd/2' }]), k.hole('f2', 'Bolt hole', 's2', 'simple', 'hd', '-22'), k.cir('f3', 'Bolt circle', 'f2', 'nh'),
    circles('s3', 'Bore', 'XY', '40', [{ c: ['0', '0'], r: '12.5' }]), k.hole('f4', 'Bore', 's3', 'simple', '25', '-42'),
    loop('s4', 'Keyway', 'XY', '40', [[-4, 10], [4, 10], [4, 16.5], [-4, 16.5]]), k.x('f5', 'Keyway', 's4', 'cut', '-42'),
  ]);
}

export function bearingCover(): PartDoc {
  const v = { pcd: 100, hd: 8, nh: 8 };
  return mk('Gearbox bearing cover', v, 'castiron', k => [
    k.half('s1', 'Half section', [[20, 0], [60, 0], [60, 10], [40, 10], [40, 22], [30, 22], [30, 14], [20, 14]]), rv('f1', 's1'),
    circles('s2', 'Bolt hole', 'XY', '10', [{ c: ['pcd/2', '0'], r: 'hd/2' }]), k.hole('f2', 'Bolt hole', 's2', 'simple', 'hd', '-12'), k.cir('f3', 'Bolt circle', 'f2', 'nh'),
  ]);
}

export function spurGear20(): PartDoc {
  const N = 20, Ro = 33, Rr = 26.25, hr = 7, ht = 3.4, pts: P2[] = [];
  for (let i = 0; i < N; i++) {
    const th = (i * 360) / N, up: P2[] = [], dn: P2[] = [];
    for (let j = 0; j <= 6; j++) { const r = Rr + ((Ro - Rr) * j) / 6, al = hr - (hr - ht) * Math.pow(j / 6, 0.7); up.push([r * Math.cos((th - al) * D2R), r * Math.sin((th - al) * D2R)]); dn.push([r * Math.cos((th + al) * D2R), r * Math.sin((th + al) * D2R)]); }
    pts.push(...up, ...dn.reverse(), ...arcPts(0, 0, Rr, th + hr, th + 360 / N - hr, 2).slice(1, -1));
  }
  const v = { tg: 12, bore: 20 };
  return mk('Spur gear, 20 teeth', v, 'steel', k => [
    loop('s1', 'Tooth outline', 'XY', '0', pts), k.x('f1', 'Gear blank with teeth', 's1', 'new', 'tg', { chamfer: '0.5' }),
    circles('s2', 'Bore', 'XY', '-1', [{ c: ['0', '0'], r: 'bore/2' }]), k.hole('f2', 'Bore', 's2', 'simple', 'bore', 'tg+2'),
    loop('s3', 'Keyway', 'XY', '-1', [[-3, 8], [3, 8], [3, 12.8], [-3, 12.8]]), k.x('f3', 'Keyway', 's3', 'cut', 'tg+2'),
  ]);
}

export function uHandle(): PartDoc {
  const v = { tp: 12, dia: 20, span: 130, H: 80, bend: 25, hd: 10 };
  return mk('U-handle on plate', v, 'steel', k => [
    loop('s1', 'Plate outline', 'XY', '0', rrPts(190, 100, 8)), k.x('f1', 'Plate', 's1', 'new', 'tp', { fillet: '1.5' }),
    dots('s2', 'Plate holes', 'XY', 'tp', [[80, 35], [-80, 35], [-80, -35], [80, -35]], 5), k.hole('f2', 'Plate holes', 's2', 'simple', 'hd', '-(tp+2)'),
    k.swp('f3', 'Handle sweep', '-span/2,0,tp-2; -span/2,0,tp+H; span/2,0,tp+H; span/2,0,tp-2', 'dia', '0', 'bend', 'join'),
  ]);
}

export function hoseAssembly(): PartDoc {
  const v = { od: 30, id: 22, bend: 35 };
  return mk('Hose with end fittings', v, 'steel', k => [
    k.swp('f1', 'Hose', '-90,0,-25; -25,0,-25; 25,0,25; 90,0,25', 'od', 'id', 'bend', 'new'),
    circles('s1', 'Left collar', 'YZ', '-112', [{ c: ['0', '-25'], r: '19' }]), k.x('f2', 'Left collar', 's1', 'join', '22'),
    circles('s2', 'Left rib', 'YZ', '-118', [{ c: ['0', '-25'], r: '22' }]), k.x('f3', 'Left rib', 's2', 'join', '4'), k.lin('f4', 'Left ribs', 'f3', '4', '8'),
    circles('s3', 'Left bore', 'YZ', '-113', [{ c: ['0', '-25'], r: '11' }]), k.hole('f5', 'Left bore', 's3', 'simple', 'id', '25'),
    circles('s4', 'Right collar', 'YZ', '90', [{ c: ['0', '25'], r: '19' }]), k.x('f6', 'Right collar', 's4', 'join', '22'),
    circles('s5', 'Right rib', 'YZ', '94', [{ c: ['0', '25'], r: '22' }]), k.x('f7', 'Right rib', 's5', 'join', '4'), k.lin('f8', 'Right ribs', 'f7', '4', '8'),
    circles('s6', 'Right bore', 'YZ', '113', [{ c: ['0', '25'], r: '11' }]), k.hole('f9', 'Right bore', 's6', 'simple', 'id', '-25'),
  ]);
}

export function steppedHoleBlock(): PartDoc {
  const v = { H: 35, dia: 20, cb: 40, cbd: 12 };
  return mk('Stepped hole block', v, 'aluminium', k => [
    loop('s1', 'Block outline', 'XY', '0', rrPts(160, 80, 20)), k.x('f1', 'Block', 's1', 'new', 'H', { fillet: '3', edges: 'top' }),
    circles('s2', 'Bore', 'XY', 'H', [{ c: ['0', '0'], r: 'dia/2' }]), k.hole('f2', 'Counterbored bore', 's2', 'cbore', 'dia', '-(H+2)', 'cb', 'cbd'),
    k.rect('s3', 'Side window', 'XZ', '40', '30', '20', '30', '17'), k.x('f3', 'Side window', 's3', 'cut', '-15'),
  ]);
}

export function groovedCylinder(): PartDoc {
  const pts: P2[] = [[0, 0], [30, 0]]; let z = 0;
  for (let i = 0; i < 5; i++) { pts.push([36, z], [36, z + 10], [28, z + 10], [28, z + 22]); z += 22; }
  pts.push([36, z], [36, z + 10], [0, z + 10]);
  const v = { bore: 12 };
  return mk('Grooved cylinder', v, 'aluminium', k => [
    k.half('s1', 'Half section', pts.filter((p, i) => i !== 1 && !(p[1] === 0 && p[0] === 36))), rv('f1', 's1'),
    circles('s2', 'Axial hole', 'XY', String(z + 10), [{ c: ['0', '0'], r: 'bore/2' }]), k.hole('f2', 'Axial hole', 's2', 'simple', 'bore', '-30'),
  ]);
}

export function lTray(): PartDoc {
  const v = { H: 30, wall: 3 };
  return mk('L-shaped tray', v, 'stainless', k => [
    loop('s1', 'L outline', 'XY', '0', [[0, 0], [80, 0], [80, 30], [40, 30], [40, 60], [0, 60]]), k.x('f1', 'Shelled L tray', 's1', 'new', 'H', { fillet: '1', edges: 'bottom', wall: 'wall', open: 'top' }),
  ]);
}

const T = (key: string, label: string, cat: string, blurb: string, make: () => PartDoc): Template => ({ key, label, group: 'mechanical', brand: cat, blurb, make });
const A = 'Brackets & housings', B = 'Plates & blocks', C = 'Turned parts & discs', D = 'Pipes, hoses & gears';
export const MECH_TEMPLATES: Template[] = [
  T('m-clevis', 'Clevis bracket', A, 'Base plate, lug with bore, rib and drilled holes', clevisBracket),
  T('m-flange-block', 'Flanged boss plate', A, 'Rounded plate, boss, counterbored bore, four holes', flangeBlock),
  T('m-bearing-block', 'Bearing block', A, 'Base, back wall, pillar, counterbored boss and rib', bearingBlock),
  T('m-port-housing', 'Port housing', A, 'Yellow enamel housing: 3 lugs, centre boss, side port', portHousing),
  T('m-bronze', 'Bronze bearing housing', A, 'Sleeve on a kite plate with a side lug, in bronze', bronzeSleeve),
  T('m-lofted', 'Lofted housing bracket', A, 'Plate lofted into an oval collar, mirrored ribs', loftedBracket),
  T('m-pump', 'Ribbed pump housing', A, 'Revolved body, four ribs, mounting ears', pumpHousing),
  T('m-adapter', 'Square-to-round adapter', A, 'Square plate lofted into a round flange', squareToRound),
  T('m-tee', 'Three-way flanged valve body', A, 'Run pipe plus branch, three bolted flanges', teeValve),
  T('m-shell', 'Shelled housing', A, 'Hollow box (shell), ears and cable gland', shelledHousing),
  T('m-step-block', 'Three-step block', B, 'Stepped profile with three different holes', stepBlock),
  T('m-pyramid', 'Square step pyramid', B, 'Four tiers with ledge holes and a top hole', stepPyramid),
  T('m-rail', 'T-slot guide rail', B, 'Extruded T-slot section with chamfered ends', slotRail),
  T('m-stepped-hole', 'Stepped hole block', B, 'Rounded block, counterbore and a side window', steppedHoleBlock),
  T('m-tray', 'L-shaped tray', B, 'Shelled L profile, 3 mm walls', lTray),
  T('m-flanged-shaft', 'Flanged stepped shaft', C, 'Four diameters, keyway and flange holes', flangedShaft),
  T('m-cup', 'Stepped cup with flange', C, 'Revolved funnel cup, six flange holes, in brass', steppedCup),
  T('m-tier-disc', 'Three-tier disc', C, 'Stepped disc with two circles of holes', tierDisc),
  T('m-hub', 'Keyed hub disc', C, 'Hub, V-grooved rim, 12 bolt holes and a keyway', hubDisc),
  T('m-cover', 'Gearbox bearing cover', C, 'Flanged cover with a stepped bore, 8 bolts', bearingCover),
  T('m-cylinder', 'Grooved cylinder', C, 'Five ridges and valleys with an axial hole', groovedCylinder),
  T('m-gear20', 'Spur gear, 20 teeth', D, 'Tapered-flank teeth, Ø66 outside, 20 bore with keyway', spurGear20),
  T('m-handle', 'U-handle on plate', D, 'Swept round bar with rounded bends on a drilled plate', uHandle),
  T('m-hose', 'Hose with end fittings', D, 'Swept hollow hose and ribbed collars', hoseAssembly),
];
