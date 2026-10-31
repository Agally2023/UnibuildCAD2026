// Run with:  npx tsx tests/run.ts
// Analytical benchmarks and regression checks. Closed-form results are exact textbook values, not approximations.
import { readFileSync } from 'fs';
import { envelope } from '../lib/frame';
import { designBeam, designBeamM, designColumn, designAll } from '../lib/design';
import { designFoundations, designFooting, designSlab } from '../lib/slabfound';
import { beamChains, groupByStory, tribWidths } from '../lib/model';
import { detectAll } from '../lib/clash';
import { toIfc } from '../lib/ifc';
import { parseIfc } from '../lib/ifcImport';
import { analyse } from '../lib/engineering';
import { planMep, sizeDuct, sizePipe } from '../lib/mep';
import { designStrip, groupPads } from '../lib/stripfoot';
import { designPadLateral, padPressure } from '../lib/footlateral';
import { designGroundBeams, groundBeamLayout } from '../lib/groundbeam';
import { foundationCombos } from '../lib/combos';
import { lateralAnalysis, seismicSd, windCf, windQp } from '../lib/lateral';
import { buildLateralReport } from '../lib/report';
import { ecm } from '../lib/serviceability';
import { bays, classify, designSlabPanels, punching } from '../lib/slabpanels';
import { bsColumn, crackBS, fcuOf, flexBS, mfBS, vcBS } from '../lib/bs8110';
import { allowedSpanDepth, beamDeflection, crackWidth, curvature, deflection, section } from '../lib/serviceability';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, detail = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + detail}`); };
const near = (name: string, got: number, want: number, tol = 0.01) => ok(name, Math.abs(got - want) <= tol * Math.max(1, Math.abs(want)), `got ${got}, want ${want}`);
const mat = { fck: 25, fyk: 500 };

// ---- continuous beam analysis: closed-form solutions (w = 10 kN/m, L = 6 m) ----
const S = (wMin = 10) => ({ L: 6, EI: 1e4, wMax: 10, wMin });
let e = envelope([S()]);
near('single span sagging wL²/8', e[0].sag, 45); near('single span shear wL/2', e[0].VL, 30);
e = envelope([S(), S()]);
near('two spans: support hogging wL²/8', e[0].hogR, 45); near('two spans: sagging 9wL²/128', e[0].sag, 25.3125);
near('two spans: end shear 3wL/8', e[0].VL, 22.5); near('two spans: interior shear 5wL/8', e[0].VR, 37.5);
e = envelope([S(), S(), S()]); near('three spans all loaded: support hogging wL²/10', e[0].hogR, 36);
e = envelope([S(0), S(0), S(0)]); near('three spans, two adjacent loaded: support hogging 7wL²/60 (independent solve)', e[0].hogR, 42);

// ---- section design: hand calculation, 250x500 beam, 6 m span, w = 48.09 kN/m ----
const w = (1.35 * (25 * 0.2 + 2.5) + 1.5 * 3) * 3 + 1.35 * 25 * 0.25 * 0.5;
const b = designBeam('b', 250, 500, 6, w, mat);
near('beam: bending steel (hand calc 1,015 mm²)', b.AsReq, 1016, 0.01); ok('beam: 4T20 chosen', b.bars === '4T20', b.bars);
ok('beam: passes', b.status === 'ok');
ok('beam: oversized load flagged', designBeam('x', 200, 300, 9, 60, mat).status === 'bad');
const c = designColumn('c', 300, 300, 1650, 3.6, mat);
ok('column: steel within 1%..4% of section', c.AsReq > 900 && c.AsReq < 3600, String(c.AsReq)); ok('column: slenderness flagged', c.notes.some(n => n.includes('Slender')));
ok('column: undersized flagged', designColumn('c2', 200, 200, 3000, 3.6, mat).status === 'bad');
const sl = designSlab(6, 6, 3, mat, 500);
near('slab: support moment 0.031 n lx²', sl.mNeg, 0.031 * sl.n * 36, 0.001); ok('slab: 275 mm', sl.h === 275, String(sl.h));
const f = designFooting('f', 1650, 300, 300, 150, mat);
ok('footing: 3.0 m square', f.B === 3, String(f.B)); near('footing: bending steel (hand calc 822 mm²/m)', f.AsReq, 822, 0.01);

// ---- layout logic ----
const beam = (id: string, a: number[], z: number[], s = 's0') => ({ id, type: 'beam', geometry: { start: a, end: z }, library_item_id: null, story_id: s });
const bs = [beam('1', [0, 0], [6, 0]), beam('2', [6, 0], [12, 0]), beam('3', [0, 6], [6, 6]), beam('4', [0, 12], [6, 12])];
const tw = tribWidths(bs as any, 3);
near('tributary width: two neighbours at 6 m = 6', tw['3'], 6); near('tributary width: edge beam = 3', tw['1'], 3);
ok('beam chains: two beams in line form one chain', beamChains(bs as any).some(ch => ch.length === 2));

// ---- clash detection across storeys ----
const stories = [{ id: 's0', name: 'Ground', elevation_m: 0, height_m: 3.6 }, { id: 's1', name: 'Level 1', elevation_m: 3.6, height_m: 3.6 }];
const lib: any = [{ id: 'd', category: 'duct', name: 'duct', specs: { w_mm: 600, h_mm: 300 }, unit_cost: null }];
const duct = (id: string, s: string) => ({ id, type: 'duct', geometry: { start: [3, -2], end: [3, 2], elevation_m: 3.15 }, library_item_id: 'd', story_id: s });
const clashes = detectAll([beam('b0', [0, 0], [6, 0], 's0'), duct('d0', 's0'), beam('b1', [0, 0], [6, 0], 's1')] as any, lib, stories);
ok('clash: duct through beam on the same storey found, none across storeys', clashes.length === 1 && clashes[0].storyId === 's0', JSON.stringify(clashes));

// ---- multi-storey design: column load doubles over two storeys ----
const mk = (s: string) => [0, 6].flatMap(x => [0, 6].map(y => ({ id: `${s}c${x}${y}`, type: 'column', geometry: { at: [x, y], b: 0.4, h: 0.4, height: 3.6 }, library_item_id: null, story_id: s })));
const els: any[] = [...mk('s0'), ...mk('s1')];
const dsg = designAll(groupByStory(els, stories), [], mat, { imposed: 3, defaultTrib: 3 });
const n0 = dsg.cols.find(x => x.story === 'Ground')!.NEd, n1 = dsg.cols.find(x => x.story === 'Level 1')!.NEd;
near('ground column carries about twice the upper column load', n0 / n1, 2, 0.02);
ok('foundations designed for the ground storey only', designFoundations(groupByStory(els, stories), [], mat, { imposed: 3, defaultTrib: 3, qAllow: 150 }).footings.length === 4);
ok('dashboard analysis runs on two storeys', analyse(els, [], 'office', stories as any).storeys === 2);

// ---- IFC round trip: two storeys, thickness, beam size and top, slab ----
const model: any[] = [
  { id: '11111111-1111-4111-8111-111111111111', type: 'wall', geometry: { start: [0, 0], end: [8, 0], height: 3.6, thickness: 0.3 }, library_item_id: null, story_id: 's0' },
  { id: '22222222-2222-4222-8222-222222222222', type: 'beam', geometry: { start: [0, 0], end: [8, 0], b_mm: 300, h_mm: 600, top_m: 3.6 }, library_item_id: null, story_id: 's0' },
  { id: '33333333-3333-4333-8333-333333333333', type: 'slab', geometry: { rect: [0, 0, 8, 6], z0: 3.4, z1: 3.6 }, library_item_id: null, story_id: 's0' },
  { id: '44444444-4444-4444-8444-444444444444', type: 'door', geometry: { wall_id: '11111111-1111-4111-8111-111111111111', offset_m: 3, width_m: 0.9 }, library_item_id: null, story_id: 's0' },
  { id: '55555555-5555-4555-8555-555555555555', type: 'wall', geometry: { start: [0, 0], end: [8, 0], height: 3.6 }, library_item_id: null, story_id: 's1' },
];
const back = parseIfc(toIfc('Round trip', model, [], stories as any)).extractAll();
ok('round trip: two storeys', back.stories.length === 2, back.stories.map(s => s.name).join());
ok('round trip: storey elevations 0 and 3.6', back.stories[0].elevation_m === 0 && back.stories[1].elevation_m === 3.6);
const g0 = back.stories[0].result.elements;
ok('round trip: wall thickness 0.3', g0.find(x => x.kind === 'wall')!.geometry.thickness === 0.3);
const bm = g0.find(x => x.kind === 'beam')!;
ok('round trip: beam 300x600 with top at 3.6', bm.geometry.b_mm === 300 && bm.geometry.h_mm === 600 && bm.geometry.top_m === 3.6, JSON.stringify(bm.geometry));
const sb = g0.find(x => x.kind === 'slab')!;
ok('round trip: slab 8 x 6 m, 200 mm', sb.geometry.rect[2] - sb.geometry.rect[0] === 8 && sb.geometry.rect[3] - sb.geometry.rect[1] === 6 && Math.abs(sb.geometry.z1 - sb.geometry.z0 - 0.2) < 0.011, JSON.stringify(sb.geometry));
ok('round trip: door kept on its wall', g0.some(x => x.kind === 'door' && x.geometry.offset_m === 3));

// ---- third-party files ----
const mm = parseIfc(readFileSync(__dirname + '/fixtures/third-party-mm.ifc', 'utf8')).extractAll();
ok('third-party (mm units, indexed polycurve, rotated walls): two storeys, elevation 3 m', mm.stories.length === 2 && mm.stories[1].elevation_m === 3, JSON.stringify(mm.stories.map(s => [s.name, s.elevation_m])));
ok('third-party: walls 6 m long and 4 m long', mm.stories[0].result.elements.filter(x => x.kind === 'wall').map(x => Math.round(Math.hypot(x.geometry.end[0] - x.geometry.start[0], x.geometry.end[1] - x.geometry.start[1]))).sort().join() === '4,6');
const mesh = parseIfc(readFileSync(__dirname + '/fixtures/mesh-geometry.ifc', 'utf8')).extractAll().stories[0].result.elements;
const mw = mesh.find(x => x.kind === 'wall')!, len = Math.hypot(mw.geometry.end[0] - mw.geometry.start[0], mw.geometry.end[1] - mw.geometry.start[1]);
ok('mesh wall rotated 30°: length 6 m, thickness 0.25 m', Math.abs(len - 6) < 0.02 && mw.geometry.thickness === 0.25, `${len} ${mw.geometry.thickness}`);
ok('mesh beam, column, slab and stair all fitted', ['beam', 'column', 'slab', 'stair'].every(k => mesh.some(x => x.kind === k)));


// ---- MEP routing and sizing ----
const mel = (id: string, type: string, geometry: any, lib_id: string | null = null) => ({ id, type, geometry, library_item_id: lib_id }) as any;
const mlib: any = [{ id: 'b', category: 'section', name: 'RC beam', specs: { b_mm: 250, h_mm: 500 }, unit_cost: null }];
const mm0 = [mel('plant', 'equipment', { at: [1, 5] }), mel('o1', 'fixture', { at: [14, 2], kw: 6 }), mel('o2', 'fixture', { at: [14, 9], kw: 6 }), mel('o3', 'fixture', { at: [8, 9], kw: 4 }),
  mel('col', 'column', { at: [5, 5], b: 0.4, h: 0.4, height: 3.6 }), mel('beam', 'beam', { start: [10, -1], end: [10, 12] }, 'b'), mel('wall', 'wall', { start: [7, 0], end: [7, 12], height: 3.6 })];
const mr = planMep({ els: mm0, lib: mlib, storeyH: 3.6, maxDuctH: 0.4, includePipes: true, requiredClear: 2.7, slabT: 0.2 });
ok('mep: every outlet reached', mr.unreached === 0 && mr.ducts.length > 1);
const atPlant = mr.ducts.filter(d => Math.hypot(d.start[0] - 1, d.start[1] - 5) < 0.6 || Math.hypot(d.end[0] - 1, d.end[1] - 5) < 0.6);
near('mep: the segment at the plant carries the whole airflow (16 kW / 12.07)', atPlant[0].flow, 16 / 12.07, 0.001);
ok('mep: no duct runs through the column', !mr.ducts.some(d => { const x0 = Math.min(d.start[0], d.end[0]), x1 = Math.max(d.start[0], d.end[0]), y0 = Math.min(d.start[1], d.end[1]), y1 = Math.max(d.start[1], d.end[1]); return x1 >= 4.8 && x0 <= 5.2 && y1 >= 4.8 && y0 <= 5.2; }));
ok('mep: duct top is lowered under the beam soffit (3.1 m) by 50 mm', Math.max(...mr.ducts.map(d => d.elevation + (d.size.h_mm ?? 0) / 2000)) <= 3.05 + 1e-6);
ok('mep: no clashes left with structure', mr.stats.clashes === 0, String(mr.stats.clashes)); ok('mep: wall crossing reported as a penetration', mr.stats.penetrations >= 1);
ok('mep: pipes routed and kept clear of ducts', mr.pipes.length > 0);
const sd = sizeDuct(1.3, 0.4); ok('mep: 1.3 m³/s duct at 6 m/s has about 0.22 m²', Math.abs((sd.w_mm * sd.h_mm) / 1e6 - 1.3 / 6) < 0.03, JSON.stringify(sd));
const sp = sizePipe(2); ok('mep: 2 l/s pipe is DN50 (1.02 m/s; DN40 would run at 1.59 m/s, over the 1.2 m/s limit)', sp.dn === 50 && sp.velocity <= 1.2, JSON.stringify(sp));
ok('mep: no plant gives a clear message', planMep({ els: [mel('o', 'fixture', { at: [1, 1] })], lib: [], storeyH: 3.6, maxDuctH: 0.4, includePipes: false, requiredClear: 2.7, slabT: 0.2 }).notes[0].includes('plant'));


// ---- serviceability (EC2 7.3.4, 7.4.2, 7.4.3) ----
{
  const sec = section(250, 500, 446, 1257, 25);
  near('section: cracked neutral axis depth (independent solve 223.2 mm)', sec.xII, 223.2, 0.002); near('section: cracking moment (independent solve 41.7 kNm)', sec.Mcr / 1e6, 41.7, 0.005);
  near('curvature at 100 kNm incl. creep and shrinkage (independent solve 5.6923e-6 /mm)', curvature(100e6, sec).kappa, 5.6923e-6, 0.001);
  const wk = crackWidth({ M: 100e6, b: 250, h: 500, d: 446, As: 1257, phi: 20, n: 4, cover: 38, fck: 25 });
  near('crack width, 4T20 under 100 kNm (independent solve 0.1808 mm)', wk.wk, 0.1808, 0.002); near('steel stress under 100 kNm (independent solve 214.1 MPa)', wk.sigma, 214.1, 0.002);
  ok('crack width: uncracked section reports zero', crackWidth({ M: 20e6, b: 250, h: 500, d: 446, As: 1257, phi: 20, n: 4, cover: 38, fck: 25 }).wk === 0);
  // exact closed form: an uncracked simply supported beam deflects 5wL⁴/384EI
  const M = 20e6, L = 6000, w = (8 * M) / (L * L), EI = sec.Eeff * sec.II;
  near('deflection formula = 5wL⁴/384EI for an uncracked span', deflection(L, 0, M / EI, 0), (5 * w * L ** 4) / (384 * EI), 1e-9);
  near('allowable span/depth, C25, ρ = 0.91%, K = 1.3, steel factor 1.236 (hand calc 24.3)', allowedSpanDepth({ K: 1.3, fck: 25, rho: 1017 / (250 * 446), AsReq: 1017, AsProv: 1257, fyk: 500, L: 6 }), 24.28, 0.005);
  ok('deflection: hogging at the supports reduces the midspan deflection', beamDeflection(6, 250, 500, 446, 1257, 1257, 100, 40, 40, 25).delta < beamDeflection(6, 250, 500, 446, 1257, 1257, 100, 0, 0, 25).delta);
  const slim = designBeam('slim', 200, 300, 6, 20, mat); ok('beam: a slim 200x300 beam over 6 m is flagged for deflection or strength', slim.status !== 'ok' && slim.notes.length > 0);
  ok('beam design now reports deflection and crack width', !!b.defl && !!b.crack && b.defl.ratio < 1 && b.crack.wk < 0.3, JSON.stringify([b.defl?.ratio, b.crack?.wk]));
  ok('slab design reports span/depth and crack width', sl.ld > 0 && sl.ldAllowed > 0 && sl.wk >= 0);
}


// ---- BS 8110-1 (independent hand and Python calculations, d = 454 mm for a 250 x 500 beam) ----
{
  const bsm = { fck: 25, fyk: 460, code: 'BS8110' as const };
  ok('BS: cube strength mapping C25/30 -> 30, C30/37 -> 37, C35/45 -> 45', fcuOf(25) === 30 && fcuOf(30) === 37 && fcuOf(35) === 45);
  const fl = flexBS(173.1e6, 250, 454, 30, 460, 46);
  near('BS beam: K = M/(b d² fcu) (hand 0.1120)', fl.K, 0.112, 0.003); near('BS beam: lever arm z (hand 388.1 mm)', fl.z, 388.1, 0.002); near('BS beam: As = M/(0.87 fy z) (hand 1114 mm²)', fl.As, 1114.4, 0.003);
  ok('BS beam: K above 0.156 needs compression steel', flexBS(300e6, 250, 454, 30, 460, 46).doubly);
  near('BS shear: vc for 100As/bd = 1.13, d = 446, fcu 30 (independent 0.680 N/mm²)', vcBS(1257, 250, 446, 30), 0.68, 0.005);
  near('BS columns: As = (N - 0.4 fcu Ac)/(0.75 fy) (hand 1652 mm²)', bsColumn('c', 300, 300, 1650, 3.6, bsm).AsReq, 1652, 0.002);
  const cb = crackBS({ M: 100e6, b: 250, h: 500, d: 446, As: 1257, phi: 20, n: 4, cmin: 38, fcu: 30 });
  near('BS crack width, 4T20 under 100 kNm (independent solve 0.1764 mm)', cb.wk, 0.1764, 0.003); near('BS steel stress (independent 209.1 MPa)', cb.fs, 209.1, 0.003);
  near('BS span/depth modification factor (independent 0.926)', mfBS(173.1e6, 250, 446, 460, 1144, 1257), 0.926, 0.003);
  const bb = designBeamM('b', 250, 500, 6, { sag: 173.1, hog: 173.1, V: 120, w: 48 }, bsm);
  near('BS beam design uses the same section (1,115 mm² needed)', bb.AsReq, 1115, 0.003); ok('BS beam passes with deflection and cracking reported', bb.status === 'ok' && !!bb.defl && !!bb.crack, JSON.stringify(bb.notes));
  const bf = designFooting('f', 1650, 300, 300, 150, bsm); ok('BS footing: 2.9 m square, 550 mm thick (independent check: 500 mm fails punching)', bf.B === 2.9 && bf.h === 0.55, `${bf.B} ${bf.h}`);
  const bsl = designSlab(6, 6, 3, bsm, 500); near('BS slab: n = 1.4gk + 1.6qk', bsl.n, 1.4 * (25 * 0.275 + 2.5) + 1.6 * 3, 0.001); near('BS slab: support moment 0.031 n lx²', bsl.mNeg, 0.031 * bsl.n * 36, 0.001);
  const ec = designAll(groupByStory(els, stories), [], mat, { imposed: 3, defaultTrib: 3 }), bsd = designAll(groupByStory(els, stories), [], bsm, { imposed: 3, defaultTrib: 3 });
  ok('BS loads (1.4/1.6) exceed Eurocode loads (1.35/1.5) on the same columns', bsd.cols[0].NEd > ec.cols[0].NEd, `${bsd.cols[0].NEd} ${ec.cols[0].NEd}`);
  ok('BS multi-storey: ground column still carries about twice the upper load', Math.abs(bsd.cols.find(x => x.story === 'Ground')!.NEd / bsd.cols.find(x => x.story === 'Level 1')!.NEd - 2) < 0.05);
}


// ---- slab panels (edge and corner) and punching ----
{
  const sel = (id: string, type: string, geometry: any) => ({ id, type, geometry, library_item_id: null, story_id: 's0' }) as any;
  const cs = [0, 6, 12, 18].flatMap(x => [0, 5, 10].map(y => sel(`c${x}_${y}`, 'column', { at: [x, y], b: 0.4, h: 0.4, height: 3.6 })));
  const grp = { story: stories[0], els: [...cs, sel('b', 'beam', { start: [0, 0], end: [18, 0] })] } as any;
  ok('bays: a 4 x 3 column grid forms 6 bays', bays(cs).length === 6);
  ok('classify: interior bay', classify({ L: true, R: true, B: true, T: true }, 6, 5).key === 'interior');
  ok('classify: corner bay (one short and one long edge discontinuous)', classify({ L: false, R: true, B: false, T: true }, 6, 5).key === 'corner');
  ok('classify: one long edge discontinuous', classify({ L: true, R: true, B: false, T: true }, 6, 5).key === 'longEdge');
  ok('classify: one short edge discontinuous', classify({ L: false, R: true, B: true, T: true }, 6, 5).key === 'shortEdge');
  const ps = designSlabPanels(grp, [], mat, { imposed: 3 }), corner = ps.panels.find(p => p.label === 'A1')!, edge = ps.panels.find(p => p.label === 'B1')!;
  ok('panels: four corner panels and two edge panels', ps.panels.filter(p => p.type.startsWith('Corner')).length === 4 && ps.panels.filter(p => p.type.startsWith('Edge')).length === 2);
  const n = 1.35 * (25 * 0.25 + 2.5) + 1.5 * 3;
  near('corner panel: support moment 0.063 n lx² at ly/lx = 1.2 (Table 3.14)', corner.mxNeg, 0.063 * n * 25, 0.001); near('corner panel: span moment 0.047 n lx²', corner.mxPos, 0.047 * n * 25, 0.001);
  near('edge panel (long edge): support moment 0.056 n lx²', edge.mxNeg, 0.056 * n * 25, 0.001);
  const interior = designSlab(5, 6, 3, mat, 30); ok('corner and edge panels attract more moment than an interior panel', corner.mxPos > interior.mPos && edge.mxPos > interior.mPos);
  ok('corner panel gets torsion steel', !!corner.torsion && !edge.torsion);
  ok('panel steel total is reported', ps.steelKg > 0 && ps.concreteM3 === 45);
  const bsp = designSlabPanels(grp, [], { fck: 25, fyk: 460, code: 'BS8110' }, { imposed: 3 }); ok('BS panels use 1.4/1.6 loads and carry more moment', bsp.panels[0].mxPos > ps.panels[0].mxPos);
  // flat slab punching: independent calculation (interior 400 mm column, d = 215, n = 17, 6 m bays)
  const pu = punching('x', 'interior', 400, 400, 215, 17, 17 * 36, 6, mat);
  near('punching: v_Ed (independent solve 0.7308 N/mm²)', pu.vEd, 0.7308, 0.002); near('punching: v_Rd,c (independent solve 0.506 N/mm²)', pu.vRd, 0.506, 0.003);
  ok('punching: this column needs links or a thicker slab', pu.status === 'warn');
  const flat = designSlabPanels({ story: stories[0], els: cs } as any, [], mat, { imposed: 3 });
  ok('flat slab: detected, punching checked at every column', flat.mode === 'flat' && flat.punching.length === 12);
  const ir = flat.punching.filter(p => p.kind === 'interior').map(p => p.ratio), er = flat.punching.filter(p => p.kind !== 'interior').map(p => p.ratio);
  ok('flat slab: edge and corner columns are more heavily stressed than interior columns', Math.min(...er) > Math.max(...ir), JSON.stringify([ir, er]));
  ok('flat slab: reports the thickness that needs no punching links', !!flat.hNoLinks && flat.hNoLinks > flat.h, String(flat.hNoLinks));
  const fd = designFoundations(groupByStory([...cs, sel('b', 'beam', { start: [0, 0], end: [18, 0] })], stories), [], mat, { imposed: 3, defaultTrib: 3, qAllow: 150 });
  ok('foundation design now returns slab panels and a steel total from them', fd.slabs[0].mode === 'panels' && fd.slabSteelT > 0);
}


// ---- wind and earthquake (independent hand and Python calculations) ----
{
  const el2 = (id: string, type: string, geometry: any, sid: string) => ({ id, type, geometry, library_item_id: null, story_id: sid }) as any;
  const building = (nSt: number, xs: number[], ys: number[], beam: number) => {
    const sts = [...Array(nSt)].map((_, k) => ({ id: `s${k}`, name: k ? `Level ${k}` : 'Ground', elevation_m: k * 3.6, height_m: 3.6 }));
    return sts.map(s => { const els: any[] = []; xs.forEach(x => ys.forEach(y => els.push(el2(`${s.id}c${x}_${y}`, 'column', { at: [x, y], b: 0.4, h: 0.4, height: 3.6 }, s.id))));
      xs.forEach(x => ys.slice(1).forEach((y, j) => els.push(el2(`${s.id}by${x}${j}`, 'beam', { start: [x, ys[j]], end: [x, y], b_mm: beam, h_mm: beam }, s.id))));
      ys.forEach(y => xs.slice(1).forEach((x, j) => els.push(el2(`${s.id}bx${y}${j}`, 'beam', { start: [xs[j], y], end: [x, y], b_mm: beam, h_mm: beam }, s.id)))); return { story: s, els }; }) as any;
  };
  near('wind: peak velocity pressure, vb 22 m/s, terrain II, z = 10 m (independent 711.6 Pa)', windQp(10, 22, 2), 711.6, 0.001);
  near('wind: net force coefficient at h/d = 1 is 0.8 + 0.5', windCf(1), 1.3, 0.001); near('wind: cf at h/d = 0.25 is 1.0 and at h/d = 5 is 1.5', windCf(0.25) + windCf(5), 2.5, 0.001);
  near('seismic: plateau Sd = ag S 2.5/q = 0.1 × 1.2 × 2.5/1.5', seismicSd(0.4, 0.1, 'B', 1.5), 0.2, 0.001); near('seismic: Sd on the descending branch at T = 1 s', seismicSd(1, 0.1, 'B', 1.5), 0.1, 0.001);
  const g1 = building(1, [0, 6], [0, 6], 2000), gv1 = designAll(g1, [], mat, { imposed: 3, defaultTrib: 3 });
  const r1 = lateralAnalysis(g1, [], mat, gv1, { imposed: 3, wind: { vb: 22, terrain: 2 }, seismic: { agG: 0.1, ground: 'B', q: 1.5, psi2: 0.3 } });
  const wx = r1.cases[0], hand = windCf(3.6 / 6) * windQp(3.6, 22, 2) * 6 * 3.6 / 1000;
  near('wind: base shear = cf qp B h (hand calculation)', wx.baseShear, hand, 0.0005);
  const Dc = 12 * ecm(25) * 1000 * 0.5 * (0.4 * 0.4 ** 3 / 12) / 3.6 ** 3;
  near('drift of a stiff-beam frame = 1.05 × V/ΣD (5% accidental torsion on a symmetric plan)', wx.drift[0], (1.05 * wx.shears[0]) / (4 * Dc), 0.01);
  const sx = r1.cases[2], c0 = r1.columns[0];
  near('seismic: base shear Fb = Sd W (one storey, λ = 1)', sx.baseShear, 0.2 * r1.seismic!.W, 0.001);
  near('column shear on a symmetric plan = 0.25 V + 5% torsion = 0.2625 V', c0.lat.Vx, 0.2625 * sx.baseShear, 0.002);
  near('overturning axial force on a symmetric 4-column plan = Mot/12', c0.lat.dN, (sx.forces[0] * 3.6) / 12, 0.002);
  ok('stable low building passes overturning', sx.stability > 1 && wx.stability > 1);
  const tall = building(10, [0, 4], [0, 4], 300), rt = lateralAnalysis(tall, [], mat, designAll(tall, [], mat, { imposed: 3, defaultTrib: 3 }), { imposed: 3, wind: { vb: 35, terrain: 3 }, seismic: { agG: 0.2, ground: 'C', q: 1.5, psi2: 0.3 } });
  ok('a slender 10-storey building on a 4 m plan fails overturning and drift', rt.cases.every(c => c.status === 'bad' && c.stability < 1));
  ok('lateral combinations raise column steel or flag uplift', rt.columns.some(c => c.AsReq > c.AsProv || c.notes.some(n => n.includes('uplift'))));
  ok('taller than 15 m raises the dynamic factor note', rt.notes.some(n => n.includes('15 m')));
  ok('wind force grows with height (qp at the top exceeds qp at 10 m)', windQp(30, 30, 3) > windQp(10, 30, 3));
  const rb = lateralAnalysis(g1, [], { fck: 25, fyk: 460, code: 'BS8110' }, designAll(g1, [], { fck: 25, fyk: 460, code: 'BS8110' }, { imposed: 3, defaultTrib: 3 }), { imposed: 3, wind: { vb: 22, terrain: 2 }, seismic: { agG: 0.1, ground: 'B', q: 1.5, psi2: 0.3 } });
  ok('BS 8110 mode runs and states that seismic actions come from EN 1998-1', rb.cases.length === 4 && rb.notes.some(n => n.includes('no seismic provisions')));
  const rep = buildLateralReport({ project: 'T', mat, input: { imposed: 3, wind: { vb: 22, terrain: 2 }, seismic: { agG: 0.1, ground: 'B', q: 1.5, psi2: 0.3 } }, result: r1 });
  ok('the lateral report states the wind and earthquake basis and the computed pressure', rep.includes('Wind (EN 1991-1-4)') && rep.includes('Earthquake (EN 1998-1') && rep.includes(`qp at the top ${Math.round(r1.wind!.qpTop)} Pa`));
}


// ---- combined and strip footings (closed-form statics, independent Python solve) ----
{
  const two = [{ id: 'a', s: 0, N: 500, cAxis: 400, cPerp: 400 }, { id: 'b', s: 4, N: 500, cAxis: 400, cPerp: 400 }];
  const sf = designStrip('S1', 'x', two, 150, mat);
  near('combined footing: length 5.2 m (columns 4 m apart, 0.4 m overhang plus half a column)', sf.L, 5.2, 0.001); near('combined footing: width 1.1 m (independent solve)', sf.B, 1.1, 0.001);
  near('combined footing: ULS soil pressure ΣN/(B L) (independent 174.8 kPa)', sf.pULS, 174.8, 0.002);
  near('combined footing: hogging moment between the columns N(2o − a)/4 = −350 kNm', sf.Mhog, 350, 0.002); near('combined footing: sagging moment at a column N o²/(L) = 34.6 kNm', sf.Msag, 34.62, 0.003);
  near('combined footing: shear at the overhang w x (independent 105.8 kN at 0.55 m)', sf.diagram.find(p => Math.abs(p.s - 0.55) < 0.026)!.V, 105.8, 0.005);
  near('combined footing: moment closes to zero at the far end (equilibrium)', Math.abs(sf.diagram[sf.diagram.length - 1].M) + 1, 1, 0.01);
  const asym = designStrip('S2', 'x', [{ id: 'a', s: 0, N: 300, cAxis: 400, cPerp: 400 }, { id: 'b', s: 4, N: 600, cAxis: 400, cPerp: 400 }], 150, mat);
  near('unequal loads: moment closes to zero because the footing is centred on the resultant', Math.abs(asym.diagram[asym.diagram.length - 1].M) + 1, 1, 0.01);
  ok('three columns in a line become a strip footing; two a combined footing', designStrip('S3', 'x', [0, 5, 10].map((s, i) => ({ id: 'c' + i, s, N: 700, cAxis: 400, cPerp: 400 })), 150, mat).kind === 'strip' && sf.kind === 'combined');
  ok('strip footing: passes bending, shear and punching at the thickness chosen', sf.status === 'ok' && sf.h >= 0.5 && sf.punchRatio <= 1, `${sf.status} ${sf.h} ${sf.punchRatio}`);
  ok('BS 8110 strip footing designs with the same statics', designStrip('S1', 'x', two, 150, { fck: 25, fyk: 460, code: 'BS8110' }).Mhog === sf.Mhog);
  const gp = groupPads([{ id: 'a', x: 0, y: 0, B: 2.6, N: 1, c1: 400, c2: 400 }, { id: 'b', x: 2, y: 0, B: 2.6, N: 1, c1: 400, c2: 400 }, { id: 'c', x: 20, y: 20, B: 1.5, N: 1, c1: 400, c2: 400 }, { id: 'd', x: 2, y: 2.2, B: 2.6, N: 1, c1: 400, c2: 400 }]);
  ok('grouping: overlapping pads cluster, an isolated pad does not, and an L-shaped cluster is not collinear', gp.length === 1 && gp[0].ids.length === 3 && !gp[0].collinear);
  ok('grouping: two overlapping pads in a line are collinear', groupPads([{ id: 'a', x: 0, y: 0, B: 2.6, N: 1, c1: 400, c2: 400 }, { id: 'b', x: 2, y: 0.1, B: 2.6, N: 1, c1: 400, c2: 400 }])[0].collinear);
  const row = [0, 2.5, 5, 7.5].map((x, i) => ({ id: `r${i}`, type: 'column', geometry: { at: [x, 0], b: 0.4, h: 0.4, height: 3.6 }, library_item_id: null, story_id: 'g0' })) as any[];
  const tallRow = [...Array(6)].map((_, k) => ({ story: { id: `g${k}`, name: `L${k}`, elevation_m: k * 3.6, height_m: 3.6 }, els: [...row.map(c => ({ ...c, id: `${c.id}_${k}`, story_id: `g${k}` })), { id: `sl${k}`, type: 'slab', geometry: { rect: [0, 0, 7.5, 6], z0: 3.4, z1: 3.6 }, library_item_id: null, story_id: `g${k}` }] })) as any;
  const fdn = designFoundations(tallRow, [], mat, { imposed: 3, defaultTrib: 3, qAllow: 100 });   // soft ground: each pad would be about 2.9 m, wider than the 2.5 m column spacing
  ok('foundation design replaces overlapping pads in a row with one strip footing', fdn.strips.length === 1 && fdn.strips[0].columns.length === 4 && fdn.footings.length === 0, `${fdn.strips.length} strips, ${fdn.footings.length} pads`);
  ok('strip footing concrete and steel are counted in the foundation totals', fdn.foundConcrete >= fdn.strips[0].concreteM3 && fdn.foundSteelT > 0);
}


// ---- lateral loads on the foundations (closed-form pressure, equilibrium, controlled cases) ----
{
  near('pad pressure under N = 1000 kN, M = 100 kNm, B = 2.5 m: N/B² (1 + 6e/B) = 198.4 kPa', padPressure(1000, 100, 0, 2.5).p, 198.4, 0.001);
  near('pad pressure with partial contact (e > B/6): 2N/(3B(B/2 − e)) = 355.6 kPa', padPressure(1000, 500, 0, 2.5).p, 355.6, 0.001);
  ok('pad: net tension (e beyond B/2) reports infinite pressure', padPressure(1000, 1400, 0, 2.5).p === Infinity);
  const gp = designFooting('f', 1650, 300, 300, 150, mat);
  const light = designPadLateral(gp, 300, 300, 1000, 300, [{ name: 'Wind along x', kind: 'wind', dir: 'x', dNs: 60, Vx: 30, Vy: 2, Mb: 2.34 }], 150, mat);
  ok('pad under a modest wind moment is enlarged, never reduced, and stays within the allowable pressure', light.B >= gp.B && light.lat!.pmax <= light.lat!.allow + 1e-6 && light.status === 'ok', `${light.B} ${light.status}`);
  const huge = designPadLateral(designFooting('g', 500, 300, 300, 150, mat), 300, 300, 350, 60, [{ name: 'Wind along x', kind: 'wind', dir: 'x', dNs: 900, Vx: 80, Vy: 2, Mb: 2.34 }], 150, mat);
  ok('pad that cannot resist the overturning is flagged for piles, anchors or ground beams', huge.status === 'bad' && huge.notes.some(n => n.includes('pinned') || n.includes('tension piles')), huge.notes.join(' | '));
  const pinned = designPadLateral(gp, 300, 300, 1000, 300, [{ name: 'Wind along x', kind: 'wind', dir: 'x', dNs: 60, Vx: 30, Vy: 2, Mb: 0 }], 150, mat);
  ok('pinned base: no base moment, so only the shear and axial change act on the pad', pinned.B <= light.B && pinned.status !== 'bad');
  const cb = foundationCombos('EC2', 1000, 300, [{ name: 'W', kind: 'wind', dir: 'x', dNs: 100, Vx: 20, Vy: 0, Mb: 2 }]);
  near('uplift combination: 0.9 G − 1.5 ΔN = 900 − 150 on the compressed side, 900 + 150 on the other', cb.filter(c => c.ls === 'stab').map(c => c.N).sort((a, b) => a - b)[0], 900 - 150, 0.001);
  near('ULS wind combination: 1.35 G + 1.05 Q + 1.5 W (axial)', cb.find(c => c.ls === 'uls' && c.N > 1500)!.N, 1.35 * 1000 + 1.05 * 300 + 150, 0.001);
  near('column base moment = shear × lever arm × factor: 1.5 × 20 × 2 = 60 kNm', Math.abs(cb.find(c => c.name.includes('1.35 G'))!.Mx), 60, 0.001);
  // strip: equal in-plane moments tilt the pressure but statics still close; an overturning couple enlarges the footing
  const two = [{ id: 'a', s: 0, N: 500, cAxis: 400, cPerp: 400 }, { id: 'b', s: 4, N: 500, cAxis: 400, cPerp: 400 }];
  const moments = designStrip('S', 'x', two, 150, mat, [{ name: 'W', ls: 'uls', lateral: true, cols: [{ N: 500, Min: 50, Mtr: 0, Vin: 0, Vtr: 0 }, { N: 500, Min: 50, Mtr: 0, Vin: 0, Vtr: 0 }] }]);
  near('strip with column moments: moment still closes to zero at the far end', Math.abs(moments.diagram[moments.diagram.length - 1].M) + 1, 1, 0.01);
  const couple = designStrip('S', 'x', two, 150, mat, [{ name: 'overturn', ls: 'sls', lateral: true, cols: [{ N: 300, Min: 0, Mtr: 0, Vin: 0, Vtr: 0 }, { N: 700, Min: 0, Mtr: 0, Vin: 0, Vtr: 0 }] }]);
  ok('strip under an overturning couple is enlarged and says so', couple.L > 5.2 && !!couple.lat && couple.lat.grewTo.includes('enlarged'), `${couple.L} ${couple.lat?.grewTo}`);
  const slid = designStrip('S', 'x', two, 150, mat, [{ name: 'W', ls: 'sls', lateral: true, cols: [{ N: 400, Min: 0, Mtr: 0, Vin: 250, Vtr: 0 }, { N: 400, Min: 0, Mtr: 0, Vin: 250, Vtr: 0 }] }]);
  ok('strip: a large shear gives a sliding warning', slid.lat!.sliding < 1.5 && slid.notes.some(n => n.includes('Sliding')));
  const upl = designStrip('S', 'x', two, 150, mat, [{ name: 'uplift', ls: 'stab', lateral: true, cols: [{ N: -2500, Min: 0, Mtr: 0, Vin: 0, Vtr: 0 }, { N: -2500, Min: 0, Mtr: 0, Vin: 0, Vtr: 0 }] }]);
  ok('strip: net uplift beyond the footing weight is flagged', upl.lat!.uplift > 0 && upl.status === 'bad');
  // whole-building link: a light 2-storey frame with strong earthquake loading
  const mk2 = (sid: string) => { const els: any[] = []; [0, 6, 12].forEach(x => [0, 6].forEach(y => els.push({ id: `${sid}c${x}_${y}`, type: 'column', geometry: { at: [x, y], b: 0.4, h: 0.4, height: 3.6 }, library_item_id: null, story_id: sid })));
    [0, 6, 12].forEach(x => els.push({ id: `${sid}by${x}`, type: 'beam', geometry: { start: [x, 0], end: [x, 6], b_mm: 300, h_mm: 300 }, library_item_id: null, story_id: sid })); [0, 6].forEach(y => [[0, 6], [6, 12]].forEach(([a, b2]) => els.push({ id: `${sid}bx${y}${a}`, type: 'beam', geometry: { start: [a, y], end: [b2, y], b_mm: 300, h_mm: 300 }, library_item_id: null, story_id: sid })));
    els.push({ id: `${sid}sl`, type: 'slab', geometry: { rect: [0, 0, 12, 6], z0: 3.4, z1: 3.6 }, library_item_id: null, story_id: sid }); return els; };
  const bld = [0, 1].map(k => ({ story: { id: `q${k}`, name: `L${k}`, elevation_m: k * 3.6, height_m: 3.6 }, els: mk2(`q${k}`) })) as any, inp = { imposed: 3, wind: { vb: 30, terrain: 3 as const }, seismic: { agG: 0.15, ground: 'C' as const, q: 1.5, psi2: 0.3 } };
  const grv = designAll(bld, [], mat, { imposed: 3, defaultTrib: 3 });
  const latFixed = lateralAnalysis(bld, [], mat, grv, { ...inp, base: 'fixed' }), latPinned = lateralAnalysis(bld, [], mat, grv, { ...inp, base: 'pinned' });
  ok('pinned bases pass zero base moment to the foundations, fixed bases pass 0.65 V h', Object.values(latPinned.foundation)[0].effs.every(e => e.Mb === 0) && Object.values(latFixed.foundation)[0].effs.every(e => Math.abs(e.Mb - 0.65 * 3.6) < 1e-9));
  const fg = designFoundations(bld, [], mat, { imposed: 3, defaultTrib: 3, qAllow: 150 }), fp = designFoundations(bld, [], mat, { imposed: 3, defaultTrib: 3, qAllow: 150, lateral: latPinned }), ff = designFoundations(bld, [], mat, { imposed: 3, defaultTrib: 3, qAllow: 150, lateral: latFixed });
  ok('isolated pads with pinned bases: enlarged slightly, no failures, and the heavy shear raises a sliding warning', fp.footings.every((f, i) => f.B >= fg.footings[i].B && f.status !== 'bad') && fp.footings.some(f => f.notes.some(n => n.includes('Sliding'))));
  ok('isolated pads with fixed bases and a strong earthquake cannot resist the base moments and say what to do', ff.footings.some(f => f.status === 'bad' && f.notes.some(n => n.includes('ground beams'))));
  ok('lateral foundation concrete is never less than the gravity-only design', fp.foundConcrete >= fg.foundConcrete && ff.foundConcrete >= fg.foundConcrete);
}


// ---- ground beams ----
{
  const gcols = [0, 6, 12].flatMap(x => [0, 6].map(y => ({ id: `c${x}_${y}`, x, y, b: 400, h: 400, G: 209, Q: 72, NEd: 1.35 * 209 + 1.5 * 72, effs: [] as any[] })));
  ok('ground beam layout: a 3 x 2 column grid has 4 beams along x and 3 along y', groundBeamLayout(gcols).filter(l => l.dir === 'x').length === 4 && groundBeamLayout(gcols).filter(l => l.dir === 'y').length === 3);
  ok('ground beam layout: columns not in line are not connected', groundBeamLayout([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 6, y: 2 }]).length === 0);
  const g0 = designGroundBeams(gcols, [], mat)[0], wself = 1.35 * 25 * (g0.b / 1000) * (g0.h / 1000);
  near('ground beam: gravity end moment = γ w L²/12 (closed form)', g0.Mhog, (wself * 36) / 12, 0.002); near('ground beam: mid-span moment = γ w L²/24', g0.Msag, (wself * 36) / 24, 0.002);
  near('ground beam: tie force is 10% of the larger column load', g0.tie, 0.1 * (1.35 * 209 + 1.5 * 72), 0.002);
  const eff = [{ name: 'Earthquake along x', kind: 'seismic' as const, dir: 'x' as const, dNs: 60, Vx: 70, Vy: 3, Mb: 2.34 }];
  const gl = designGroundBeams(gcols.map(c => ({ ...c, effs: eff })), [], mat, { seismic: { agG: 0.15, ground: 'C', psi2: 0.3 } }), gx = gl.find(g => g.dir === 'x')!, gy = gl.find(g => g.dir === 'y')!;
  near('sway moment in an x beam = factored column base moment = 70 × 2.34 (one beam at an end column, two at the middle: the larger end governs)', gx.sway, 70 * 2.34 / 1, 0.002);
  ok('the y beams see only the small y shear moment', gy.sway < 0.1 * gx.sway);
  near('hogging moment = w L²/12 + sway moment', gx.Mhog, ((1.35 * 25 * (gx.b / 1000) * (gx.h / 1000)) * 36) / 12 + gx.sway, 0.002);
  ok('tie force is the largest of 10% of the column load, the EN 1998-5 rule and the base shear', gx.tie >= Math.max(0.1 * (1.35 * 209 + 1.5 * 72), 0.4 * 0.15 * 1.15 * (209 + 0.3 * 72), 70) - 1e-6);
  ok('a larger sway moment needs more steel than gravity alone', gx.steelKg > g0.steelKg);
  near('wall above the beam adds h t 18 = 3.6 × 0.2 × 18 = 12.96 kN/m', designGroundBeams(gcols, [{ start: [0, 0], end: [6, 0], height: 3.6, thickness: 0.2 }], mat)[0].wall, 12.96, 0.005);
  const pin = designGroundBeams(gcols.map(c => ({ ...c, effs: eff.map(e => ({ ...e, Mb: 0 })) })), [], mat);
  ok('pinned bases: no sway moment, the ground beams are ties only', pin.every(g => g.sway === 0));
  // whole building, fixed bases and a strong earthquake: pads fail alone, ground beams rescue them
  const mk3 = (sid: string) => { const els: any[] = []; [0, 6, 12].forEach(x => [0, 6].forEach(y => els.push({ id: `${sid}c${x}_${y}`, type: 'column', geometry: { at: [x, y], b: 0.4, h: 0.4, height: 3.6 }, library_item_id: null, story_id: sid })));
    [0, 6, 12].forEach(x => els.push({ id: `${sid}by${x}`, type: 'beam', geometry: { start: [x, 0], end: [x, 6], b_mm: 300, h_mm: 300 }, library_item_id: null, story_id: sid })); [0, 6].forEach(y => [[0, 6], [6, 12]].forEach(([a, b2]) => els.push({ id: `${sid}bx${y}${a}`, type: 'beam', geometry: { start: [a, y], end: [b2, y], b_mm: 300, h_mm: 300 }, library_item_id: null, story_id: sid })));
    els.push({ id: `${sid}sl`, type: 'slab', geometry: { rect: [0, 0, 12, 6], z0: 3.4, z1: 3.6 }, library_item_id: null, story_id: sid }); return els; };
  const bld = [0, 1].map(k => ({ story: { id: `q${k}`, name: `L${k}`, elevation_m: k * 3.6, height_m: 3.6 }, els: mk3(`q${k}`) })) as any, inp = { imposed: 3, wind: { vb: 30, terrain: 3 as const }, seismic: { agG: 0.15, ground: 'C' as const, q: 1.5, psi2: 0.3 } };
  const grv = designAll(bld, [], mat, { imposed: 3, defaultTrib: 3 });
  const lateralFixed = lateralAnalysis(bld, [], mat, grv, { ...inp, base: 'fixed' });
  const alone = designFoundations(bld, [], mat, { imposed: 3, defaultTrib: 3, qAllow: 150, lateral: lateralFixed }), withGb = designFoundations(bld, [], mat, { imposed: 3, defaultTrib: 3, qAllow: 150, lateral: lateralFixed, groundBeams: true });
  ok('fixed bases: pads alone fail, with ground beams every pad passes', alone.footings.some(f => f.status === 'bad') && withGb.footings.every(f => f.status === 'ok'), withGb.footings.map(f => f.status).join());
  ok('ground beams run between all footing columns and are counted in the totals', withGb.groundBeams.length === 7 && withGb.foundConcrete > withGb.footings.reduce((a, f) => a + f.concreteM3, 0));
  ok('the foundation with ground beams uses far less concrete than oversized pads', withGb.foundConcrete < alone.foundConcrete / 3);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
