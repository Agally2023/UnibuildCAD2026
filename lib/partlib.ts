// Ready-made parametric parts for the Mechanical and Automotive ribbon tabs. Each one is an ordinary part (sketches, features,
// named parameters) that you can open in the timeline and change. All lengths are millimetres.
import type { Con, Sketch } from './sketch';
import { newPart, type FeatureStep, type PartDoc, type PatternStep, type SketchStep } from './parts';
import type { Plane } from './solid';

type P2 = [number, number];
export const num = (n: number) => String(Math.round(n * 1e6) / 1e6);

// A closed polygon whose edges are all horizontal or vertical (or free), fully dimensioned. dims[i] is the expression for edge i
// (from point i to point i+1); a missing one is frozen at its drawn length. anchor places the first point from the origin by expressions.
export function poly(id: string, name: string, plane: Plane, offset: string, pts: P2[], dims: (string | undefined)[], opt: { anchor?: { dx: string; dy: string }; axisLen?: number } = {}): SketchStep {
  const sk: Sketch = { pts: [{ id: 'o', x: 0, y: 0 }], lines: [], circles: [], cons: [{ id: 'fo', t: 'fix', p: 'o' }] };
  pts.forEach((p, i) => sk.pts.push({ id: `p${i}`, x: p[0], y: p[1] }));
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length], lid = `l${i}`, dx = q[0] - p[0], dy = q[1] - p[1];
    sk.lines.push({ id: lid, a: `p${i}`, b: `p${(i + 1) % pts.length}` });
    if (Math.abs(dy) < 1e-9) sk.cons.push({ id: `h${i}`, t: 'horizontal', l: lid }); else if (Math.abs(dx) < 1e-9) sk.cons.push({ id: `v${i}`, t: 'vertical', l: lid });
    sk.cons.push({ id: `d${i}`, t: 'length', l: lid, v: dims[i] ?? num(Math.hypot(dx, dy)) });
  });
  if (opt.anchor) sk.cons.push({ id: 'ax', t: 'dx', a: 'o', b: 'p0', v: opt.anchor.dx }, { id: 'ay', t: 'dy', a: 'o', b: 'p0', v: opt.anchor.dy });
  else sk.cons.push({ id: 'fp', t: 'fix', p: 'p0' });
  if (opt.axisLen) { sk.pts.push({ id: 'ae', x: 0, y: opt.axisLen }); sk.lines.push({ id: 'axis', a: 'o', b: 'ae', axis: true }); sk.cons.push({ id: 'fae', t: 'fix', p: 'ae' }); }
  return { id, type: 'sketch', name, plane, offset, sk };
}

// Circles with their centres placed from the origin: c = [x, y] expressions, r = radius expression.
export function circles(id: string, name: string, plane: Plane, offset: string, list: { c: [string, string]; r: string }[]): SketchStep {
  const sk: Sketch = { pts: [{ id: 'o', x: 0, y: 0 }], lines: [], circles: [], cons: [{ id: 'fo', t: 'fix', p: 'o' }] };
  list.forEach((q, i) => {
    let cx = 0, cy = 0; try { cx = parseFloat(q.c[0]) || 0; cy = parseFloat(q.c[1]) || 0; } catch { /* use origin */ }
    sk.pts.push({ id: `c${i}`, x: cx, y: cy }); sk.circles.push({ id: `o${i}`, c: `c${i}`, r: 10 });
    sk.cons.push({ id: `x${i}`, t: 'dx', a: 'o', b: `c${i}`, v: q.c[0] }, { id: `y${i}`, t: 'dy', a: 'o', b: `c${i}`, v: q.c[1] }, { id: `r${i}`, t: 'radius', c: `o${i}`, v: q.r });
  });
  return { id, type: 'sketch', name, plane, offset, sk };
}

export const ext = (id: string, name: string, sketch: string, op: FeatureStep['op'], depth: string, symmetric = false): FeatureStep => ({ id, type: 'extrude', name, sketch, op, depth, angle: '360', symmetric });
export const rev = (id: string, name: string, sketch: string): FeatureStep => ({ id, type: 'revolve', name, sketch, op: 'new', depth: '0', angle: '360' });
export const ring = (id: string, name: string, of: string, count: string): PatternStep => ({ id, type: 'pattern', name, of, mode: 'circular', count, dx: '0', dy: '0', dz: '0', axis: 'z', angle: '360', cx: '0', cy: '0', cz: '0' });
export const params = (o: Record<string, number | string>) => Object.entries(o).map(([name, v]) => ({ name, expr: String(v) }));

// ---------- mechanical ----------
export function shaft(): PartDoc {
  const d = newPart('Stepped shaft'), v = { d1: 30, l1: 40, d2: 40, l2: 80, d3: 30, l3: 40 }; d.params = params(v);
  const H = v.l1 + v.l2 + v.l3;
  const pts: P2[] = [[0, 0], [v.d1 / 2, 0], [v.d1 / 2, v.l1], [v.d2 / 2, v.l1], [v.d2 / 2, v.l1 + v.l2], [v.d3 / 2, v.l1 + v.l2], [v.d3 / 2, H], [0, H]];
  d.steps = [poly('s1', 'Half section', 'XZ', '0', pts, ['d1/2', 'l1', '(d2-d1)/2', 'l2', '(d2-d3)/2', 'l3', 'd3/2', 'l1+l2+l3'], { anchor: { dx: '0', dy: '0' }, axisLen: 50 }), rev('f1', 'Revolve about the axis', 's1')];
  return d;
}

export function flange(): PartDoc {
  const d = newPart('Bolted flange'), v = { D: 120, bore: 40, t: 15, pcd: 90, nb: 6, bd: 10 }; d.params = params(v);
  d.steps = [
    circles('s1', 'Outer and bore', 'XY', '0', [{ c: ['0', '0'], r: 'D/2' }, { c: ['0', '0'], r: 'bore/2' }]), ext('f1', 'Extrude the plate', 's1', 'new', 't'),
    circles('s2', 'Bolt hole', 'XY', '-1', [{ c: ['pcd/2', '0'], r: 'bd/2' }]), ext('f2', 'Drill one hole', 's2', 'cut', 't+2'), ring('f3', 'Bolt circle', 'f2', 'nb'),
  ];
  return d;
}

export function hexBolt(): PartDoc {
  const d = newPart('Hex bolt M10'), v = { d: 10, af: 16, k: 6.4, len: 40 }; d.params = params(v);
  const R = v.af / Math.sqrt(3), pts: P2[] = Array.from({ length: 6 }, (_, i) => [R * Math.cos((Math.PI / 3) * i), R * Math.sin((Math.PI / 3) * i)]);
  const head = poly('s1', 'Hexagon head (AF 16, set when inserted)', 'XY', '0', pts, []);
  head.sk.cons = head.sk.cons.filter(c => !(c.t === 'length' || c.t === 'horizontal' || c.t === 'vertical'));
  d.steps = [head, ext('f1', 'Head', 's1', 'new', 'k'), circles('s2', 'Shank', 'XY', '0', [{ c: ['0', '0'], r: 'd/2' }]), ext('f2', 'Shank', 's2', 'join', '-len')];
  return d;
}

export function tube(): PartDoc {
  const d = newPart('Rectangular hollow section'), v = { W: 60, H: 40, t: 3, L: 500 }; d.params = params(v);
  const outer = poly('s1', 'Outer and inner rectangle', 'XY', '0', [[0, 0], [v.W, 0], [v.W, v.H], [0, v.H]], ['W', 'H', 'W', 'H'], { anchor: { dx: '0', dy: '0' } });
  const w = v.W - 2 * v.t, h = v.H - 2 * v.t, inner = [[v.t, v.t], [v.t + w, v.t], [v.t + w, v.t + h], [v.t, v.t + h]];
  inner.forEach((p, i) => outer.sk.pts.push({ id: `i${i}`, x: p[0], y: p[1] }));
  const cons: Con[] = [{ id: 'ix', t: 'dx', a: 'p0', b: 'i0', v: 't' }, { id: 'iy', t: 'dy', a: 'p0', b: 'i0', v: 't' }];
  inner.forEach((_, i) => { const l = `il${i}`; outer.sk.lines.push({ id: l, a: `i${i}`, b: `i${(i + 1) % 4}` }); cons.push({ id: `ih${i}`, t: i % 2 ? 'vertical' : 'horizontal', l }, { id: `id${i}`, t: 'length', l, v: i % 2 ? 'H-2*t' : 'W-2*t' }); });
  outer.sk.cons.push(...cons);
  d.steps = [outer, ext('f1', 'Extrude the length', 's1', 'new', 'L')];
  return d;
}

export function spurGear(): PartDoc {
  const d = newPart('Spur gear'), v = { m: 3, z: 20, b: 25, bore: 20 }; d.params = params(v);
  const rf = ((v.z - 2.5) * v.m) / 2, ra = ((v.z + 2) * v.m) / 2, pitch = (2 * Math.PI) / v.z, pts: P2[] = [];
  for (let i = 0; i < v.z; i++) for (const [r, a] of [[rf, -0.3], [ra, -0.12], [ra, 0.12], [rf, 0.3]] as [number, number][]) pts.push([r * Math.cos((i + a) * pitch), r * Math.sin((i + a) * pitch)]);
  const sk = poly('s1', `Tooth outline (module ${v.m}, ${v.z} teeth, set when inserted) and bore`, 'XY', '0', pts, []);
  sk.sk.cons = sk.sk.cons.filter(c => c.t !== 'length' && c.t !== 'horizontal' && c.t !== 'vertical' && c.t !== 'fix');
  sk.sk.pts.push({ id: 'cb', x: 0, y: 0 }); sk.sk.circles.push({ id: 'ob', c: 'cb', r: v.bore / 2 });
  sk.sk.cons.push({ id: 'fcb', t: 'fix', p: 'cb' }, { id: 'rb', t: 'radius', c: 'ob', v: 'bore/2' }, { id: 'fo2', t: 'fix', p: 'o' });
  d.steps = [sk, ext('f1', 'Face width', 's1', 'new', 'b')];
  return d;
}

// ---------- automotive ----------
export function wheelRim(): PartDoc {
  const d = newPart('Wheel rim 16 in, 5 × 114.3'), v = { rim: 203, t: 4, fh: 18, fw: 12, W: 180, zc: 60, dt: 12, bore: 30, pcd: 114.3, nb: 5, bd: 14 }; d.params = params(v);
  const Ro = v.rim, pts: P2[] = [[v.bore, v.zc - v.dt / 2], [Ro - v.t, v.zc - v.dt / 2], [Ro - v.t, 0], [Ro + v.fh, 0], [Ro + v.fh, v.fw], [Ro, v.fw], [Ro, v.W - v.fw], [Ro + v.fh, v.W - v.fw], [Ro + v.fh, v.W], [Ro - v.t, v.W], [Ro - v.t, v.zc + v.dt / 2], [v.bore, v.zc + v.dt / 2]];
  d.steps = [
    poly('s1', 'Rim and disc half section', 'XZ', '0', pts, ['rim-t-bore', 'zc-dt/2', 't+fh', 'fw', 'fh', 'W-2*fw', 'fh', 'fw', 't+fh', 'W-zc-dt/2', 'rim-t-bore', 'dt'], { anchor: { dx: 'bore', dy: 'zc-dt/2' }, axisLen: 100 }), rev('f1', 'Revolve the wheel', 's1'),
    circles('s2', 'Stud hole', 'XY', '0', [{ c: ['pcd/2', '0'], r: 'bd/2' }]), ext('f2', 'Drill one stud hole', 's2', 'cut', 'W'), ring('f3', 'Stud circle', 'f2', 'nb'),
  ];
  return d;
}

export function brakeDisc(): PartDoc {
  const d = newPart('Brake disc 300 mm'), v = { od: 300, id: 170, th: 24, hubD: 190, wall: 6, hh: 40, top: 8, bore: 60, pcd: 114.3, nb: 5, bd: 14 }; d.params = params(v);
  d.steps = [
    circles('s1', 'Friction ring', 'XY', '0', [{ c: ['0', '0'], r: 'od/2' }, { c: ['0', '0'], r: 'id/2' }]), ext('f1', 'Ring thickness', 's1', 'new', 'th'),
    circles('s2', 'Hat wall', 'XY', '0', [{ c: ['0', '0'], r: 'hubD/2' }, { c: ['0', '0'], r: 'hubD/2-wall' }]), ext('f2', 'Hat height', 's2', 'join', 'hh'),
    circles('s3', 'Hat top plate', 'XY', 'hh-top', [{ c: ['0', '0'], r: 'hubD/2' }]), ext('f3', 'Top plate', 's3', 'join', 'top'),
    circles('s4', 'Centre bore', 'XY', '-1', [{ c: ['0', '0'], r: 'bore/2' }]), ext('f4', 'Bore through', 's4', 'cut', 'hh+2'),
    circles('s5', 'Stud hole', 'XY', '-1', [{ c: ['pcd/2', '0'], r: 'bd/2' }]), ext('f5', 'Drill one stud hole', 's5', 'cut', 'hh+2'), ring('f6', 'Stud circle', 'f5', 'nb'),
  ];
  return d;
}

export function piston(): PartDoc {
  const d = newPart('Piston 86 mm'), v = { D: 86, H: 62, ct: 9, wall: 5, gh: 2.5, gd: 3, gl: 3, g0: 7, pin: 22 }; d.params = params(v);
  const R = v.D / 2, Rin = R - v.wall, pts: P2[] = [[Rin, 0], [R, 0]], dims: string[] = ['wall'];
  let z = 0;
  for (let k = 2; k >= 0; k--) {
    const zlo = v.H - v.g0 - k * (v.gh + v.gl) - v.gh;
    dims.push(k === 2 ? 'H-g0-2*(gh+gl)-gh' : 'gl'); pts.push([R, zlo]); dims.push('gd'); pts.push([R - v.gd, zlo]); dims.push('gh'); pts.push([R - v.gd, zlo + v.gh]); dims.push('gd'); pts.push([R, zlo + v.gh]); z = zlo + v.gh;
  }
  dims.push('g0'); pts.push([R, v.H]); dims.push('D/2'); pts.push([0, v.H]); dims.push('ct'); pts.push([0, v.H - v.ct]); dims.push('D/2-wall'); pts.push([Rin, v.H - v.ct]); dims.push('H-ct');
  void z;
  d.steps = [
    poly('s1', 'Half section with ring grooves', 'XZ', '0', pts, dims, { anchor: { dx: 'D/2-wall', dy: '0' }, axisLen: 80 }), rev('f1', 'Revolve the piston', 's1'),
    circles('s2', 'Gudgeon pin bore', 'YZ', '0', [{ c: ['0', 'H*0.45'], r: 'pin/2' }]), ext('f2', 'Bore through both sides', 's2', 'cut', 'D+10', true),
  ];
  return d;
}

export type Template = { key: string; label: string; group: 'mechanical' | 'automotive' | 'vehicle' | 'component'; blurb: string; make: () => PartDoc };
export const TEMPLATES: Template[] = [
  { key: 'shaft', label: 'Stepped shaft', group: 'mechanical', blurb: 'Three diameters and lengths, turned from a half section', make: shaft },
  { key: 'flange', label: 'Bolted flange', group: 'mechanical', blurb: 'Plate with a bore and a circle of bolt holes', make: flange },
  { key: 'bolt', label: 'Hex bolt', group: 'mechanical', blurb: 'Hexagon head and round shank (M10 as a start)', make: hexBolt },
  { key: 'tube', label: 'Hollow section', group: 'mechanical', blurb: 'Rectangular tube for frames and chassis members', make: tube },
  { key: 'gear', label: 'Spur gear', group: 'mechanical', blurb: 'Trapezoid-tooth gear with a bore', make: spurGear },
  { key: 'rim', label: 'Wheel rim', group: 'automotive', blurb: '16 in rim with a disc and a 5-stud circle', make: wheelRim },
  { key: 'disc', label: 'Brake disc', group: 'automotive', blurb: 'Friction ring, hat, centre bore and studs', make: brakeDisc },
  { key: 'piston', label: 'Piston', group: 'automotive', blurb: 'Crown, three ring grooves, skirt and pin bore', make: piston },
];
