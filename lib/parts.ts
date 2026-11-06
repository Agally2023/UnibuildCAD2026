// A part is a timeline of steps (sketches and solid features) driven by named parameters.
// Rebuilding replays the timeline from the top: parameters are evaluated, each sketch is solved, each feature adds to or cuts the body.
import { calc, evalParams, profiles, solveSketch, type Sketch, type SolveInfo } from './sketch';
import { boolean, bounds, concat, extrude, revolve, surfaceArea, volume, type Mesh, type Plane } from './solid';

export type Op = 'new' | 'join' | 'cut';
export type SketchStep = { id: string; type: 'sketch'; name: string; plane: Plane; offset: string; sk: Sketch };
export type FeatureStep = { id: string; type: 'extrude' | 'revolve'; name: string; sketch: string; op: Op; depth: string; angle: string; symmetric?: boolean; off?: boolean };
export type Step = SketchStep | FeatureStep;
export type PartDoc = { v: 1; name: string; params: { name: string; expr: string }[]; steps: Step[]; upTo?: number; density: number };   // density kg/m³

export const newPart = (name = 'Part 1'): PartDoc => ({ v: 1, name, params: [], steps: [], density: 7850 });

export type Rebuilt = {
  values: Record<string, number>;
  solved: Record<string, { sk: Sketch; info: SolveInfo }>;
  bodies: Mesh[];
  mesh: Mesh;                               // all bodies together
  errors: { step: string; msg: string }[];
  stats: { volume: number; area: number; size: [number, number, number]; mass: number } | null;   // mm³, mm², mm, kg
  shown: number;                            // number of steps replayed
};

export function rebuild(doc: PartDoc): Rebuilt {
  const { values, errors: pe } = evalParams(doc.params);
  const errors = pe.filter(Boolean).map(msg => ({ step: 'params', msg }));
  const solved: Rebuilt['solved'] = {}, steps = doc.steps.slice(0, doc.upTo === undefined ? undefined : Math.max(0, doc.upTo));
  let bodies: Mesh[] = [];
  for (const st of steps) {
    try {
      if (st.type === 'sketch') {
        const r = solveSketch(st.sk, values); solved[st.id] = { sk: r.sketch, info: r.info };
        if (!r.info.ok) errors.push({ step: st.id, msg: r.info.message });
        continue;
      }
      if (st.off) continue;
      const src = steps.find(s => s.id === st.sketch && s.type === 'sketch') as SketchStep | undefined, sol = solved[st.sketch];
      if (!src || !sol) throw new Error('The sketch for this feature is missing or comes later in the timeline');
      const { regions, open } = profiles(sol.sk);
      if (!regions.length) throw new Error(open ? 'The sketch is not closed. Join the lines end to end.' : 'The sketch has no closed profile');
      const off = calc(src.offset || '0', values);
      let m: Mesh;
      if (st.type === 'extrude') {
        const d = calc(st.depth, values); if (!d) throw new Error('Depth is zero');
        m = extrude(regions, src.plane, off, d, st.symmetric);
      } else {
        const ax = sol.sk.lines.find(l => l.axis); if (!ax) throw new Error('Draw an axis line (construction line) in the sketch to revolve about');
        const a = sol.sk.pts.find(p => p.id === ax.a)!, b = sol.sk.pts.find(p => p.id === ax.b)!;
        m = revolve(regions, src.plane, off, [[a.x, a.y], [b.x, b.y]], calc(st.angle || '360', values));
      }
      if (st.op === 'new' || !bodies.length) { if (st.op === 'cut') throw new Error('Nothing to cut yet'); bodies.push(m); }
      else if (st.op === 'join') bodies = [...bodies.slice(0, -1), boolean(bodies[bodies.length - 1], m, 'join')];
      else bodies = bodies.map(b => boolean(b, m, 'cut'));
    } catch (e: any) { errors.push({ step: st.id, msg: e?.message ?? String(e) }); }
  }
  const mesh = bodies.reduce<Mesh>((a, b) => concat(a, b), { v: [], f: [] });
  let stats: Rebuilt['stats'] = null;
  if (mesh.f.length) {
    const vol = bodies.reduce((a, b) => a + volume(b), 0), bb = bounds(mesh);
    stats = { volume: vol, area: bodies.reduce((a, b) => a + surfaceArea(b), 0), size: [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]], mass: (vol * 1e-9) * doc.density };
  }
  return { values, solved, bodies, mesh, errors, stats, shown: steps.length };
}

// Starter parts, so the workspace opens with something to edit.
export function sampleBracket(): PartDoc {
  const d = newPart('L bracket');
  d.params = [{ name: 'width', expr: '80' }, { name: 'height', expr: '60' }, { name: 'thick', expr: '8' }, { name: 'depth', expr: '40' }, { name: 'hole', expr: '12' }];
  const pts = [[0, 0], [80, 0], [80, 8], [8, 8], [8, 60], [0, 60]].map(([x, y], i) => ({ id: `p${i}`, x, y }));
  const lines = pts.map((p, i) => ({ id: `l${i}`, a: p.id, b: pts[(i + 1) % pts.length].id }));
  const cons: Sketch['cons'] = [
    { id: 'c0', t: 'fix', p: 'p0' }, { id: 'c1', t: 'horizontal', l: 'l0' }, { id: 'c2', t: 'vertical', l: 'l1' }, { id: 'c3', t: 'horizontal', l: 'l2' }, { id: 'c4', t: 'vertical', l: 'l3' }, { id: 'c5', t: 'horizontal', l: 'l4' }, { id: 'c6', t: 'vertical', l: 'l5' },
    { id: 'c7', t: 'length', l: 'l0', v: 'width' }, { id: 'c8', t: 'length', l: 'l5', v: 'height' }, { id: 'c9', t: 'length', l: 'l1', v: 'thick' }, { id: 'c10', t: 'length', l: 'l4', v: 'thick' },
  ];
  d.steps = [
    { id: 's1', type: 'sketch', name: 'Profile', plane: 'XY', offset: '0', sk: { pts, lines, circles: [], cons } },
    { id: 'f1', type: 'extrude', name: 'Extrude profile', sketch: 's1', op: 'new', depth: 'depth', angle: '360' },
    { id: 's2', type: 'sketch', name: 'Bolt hole', plane: 'XZ', offset: '0', sk: { pts: [{ id: 'q0', x: 40, y: 20 }], lines: [], circles: [{ id: 'o0', c: 'q0', r: 6 }], cons: [{ id: 'k0', t: 'radius', c: 'o0', v: 'hole/2' }, { id: 'k1', t: 'fix', p: 'q0' }] } },
    { id: 'f2', type: 'extrude', name: 'Cut hole', sketch: 's2', op: 'cut', depth: '-20', angle: '360' },
  ];
  return d;
}
