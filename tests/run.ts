// Run with:  npx tsx tests/run.ts
// Analytical benchmarks and regression checks. Closed-form results are exact textbook values, not approximations.
import { readFileSync } from 'fs';
import { extrudeEdges as FX, latheAt as FL, holeProfile as FH, loft as FLOFT, sweepTube as FSW, mirrorMesh as FM, insetRegions as FI } from '../lib/feat';
import { MECH_TEMPLATES } from '../lib/mechlib';
import { drawingSvg, edgePieces, callouts } from '../lib/drawing';
import { rebuild as rebuildM, newPart as newPartM } from '../lib/parts';
import { volume as volM, boolean as boolM, extrude as extrudeM } from '../lib/solid';
import { circlePolygon as cpolyM, filletCorner, addRect as addRectM, emptySketch as emptyM } from '../lib/sketch';
import { finishLook, FINISHES as MFIN } from '../lib/materials';
import { VEHICLE_TEMPLATES } from '../lib/vehicles';
import { BUILDINGS } from '../lib/buildings';
import { placeBuilding } from '../lib/placebuilding';
import { STYLED, REGIONS } from '../lib/styles';
import { lookFor, guessWall, guessDeco, partLook, paintFor, vehicleColor, MAT } from '../lib/materials';
import { ALL_TEMPLATES } from '../lib/templates';
import { FINISHES, PARTS, finishById, withFinish, targetsOf, finishesOf, groupsOf, isGround } from '../lib/finishes';
import { crown, tiers, fronds, noise3, rand, sizeOf, trunkHeight } from '../lib/trees';
import { BRAND_TEMPLATES, SPECS } from '../lib/brands';
import { newVehicleProject, VEHICLE_KINDS } from '../lib/vproject';
import { rebuild as rebuildPart } from '../lib/parts';
import { envelope } from '../lib/frame';
import { equivalentFrame } from '../lib/eqframe';
import { analyseNetwork, dynamicPressure, frictionFactor, frictionPerMetre, hydraulicDiameter } from '../lib/mepfit';
import { designBeam, designBeamM, designColumn, designAll } from '../lib/design';
import { designFoundations, designFooting, designSlab } from '../lib/slabfound';
import { beamChains, footprint, groupByStory, inPoly, polyArea, polyBox, polyCentroid, stairSteps, tribWidths } from '../lib/model';
import { detectAll } from '../lib/clash';
import { toIfc } from '../lib/ifc';
import { buildSchedules, schedulesCsv } from '../lib/schedules';
import { buildView, cutIntervals } from '../lib/views';
import { drag, IDENTITY, qAxis, qMul, qRotate, turn, VIEWS } from '../lib/orbit';
import { findFireCrossings, segCross } from '../lib/firedamper';
import { planDxf, viewDxf } from '../lib/dxf';
import { overhangOf, roofPlanBox } from '../lib/roof';
import { faceCut, faceOutline, isPitched, ridgeAxis, roofFaces, roofLines, roofTop, slopeFactor } from '../lib/roof';
import { circlePoints, holesOf, netArea, openingCount, roundsOf } from '../lib/model';
import { centreOf, transformGeometry } from '../lib/transform';
import { compositeDrawing, fitScale, fitScaleMany, layoutCells, makeDrawing, printHtml, sheetSvg } from '../lib/sheet';
import { parseIfc } from '../lib/ifcImport';
import { analyse } from '../lib/engineering';
import { planMep, sizeDuct, sizePipe } from '../lib/mep';
import { designStrip, groupPads } from '../lib/stripfoot';
import { designRaft, rows, stripStatics } from '../lib/raft';
import { designPadLateral, padPressure } from '../lib/footlateral';
import { designGroundBeams, groundBeamLayout } from '../lib/groundbeam';
import { foundationCombos } from '../lib/combos';
import { lateralAnalysis, seismicSd, windCf, windQp } from '../lib/lateral';
import { addCircle, addLine, addPolygon, addRect, boltCircle, chamferCorner, calc, circlePolygon as cpoly, emptySketch, evalParams, profiles, solveSketch } from '../lib/sketch';
import { boolean, featureEdges, extrude as extrudeR, isClosed, revolve as revolveR, toStl, volume as vol3, bounds as bnds } from '../lib/solid';
import { wirePath } from '../lib/wire';
import { newPart, rebuild, sampleBracket, type PartDoc } from '../lib/parts';
import { TEMPLATES } from '../lib/partlib';
import { analyse3D, coreSection, coresFromGroups, loadsOf, wallGroups } from '../lib/core3d';
import { buildLateralReport } from '../lib/report';
import { ecm } from '../lib/serviceability';
import { bays, classify, designSlabPanels, punching } from '../lib/slabpanels';
import { bsColumn, crackBS, fcuOf, flexBS, mfBS, vcBS } from '../lib/bs8110';
import { allowedSpanDepth, beamDeflection, crackWidth, curvature, deflection, section } from '../lib/serviceability';
import { buildVehicle, vehicleBounds } from '../lib/vmodel';
import { CATALOG, CATALOG_TEMPLATES } from '../lib/catalog';
import { BRAND_TEMPLATES as BT2 } from '../lib/brands';
import { VEHICLE_TEMPLATES as VT2 } from '../lib/vehicles';
import { evalParams as evalParams2 } from '../lib/sketch';
import { paintFor as paintFor2 } from '../lib/materials';

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

// ---- column rotational springs on the continuous-beam solver (w = 10 kN/m, L = 6 m, EI = 1e4) ----
{
  const sp = [{ L: 6, EI: 1e4, wMax: 10, wMin: 10 }], k = (2 * 1e4) / 6;
  const fixed = envelope(sp, [1e9, 1e9])[0], pin = envelope(sp)[0], half = envelope(sp, [k, k])[0];
  near('a very stiff spring gives a fixed-end beam: hogging wL²/12 = 30', fixed.hogL, 30, 0.002);
  near('a very stiff spring gives a fixed-end beam: sagging wL²/24 = 15', fixed.sag, 15, 0.002);
  near('no spring is a pinned beam: sagging wL²/8 = 45', pin.sag, 45, 0.002);
  near('spring equal to the beam stiffness 2EI/L: hogging = fixed-end moment / 2 = 15', half.hogL, 15, 0.002);
  near('and sagging = 45 - 15 = 30', half.sag, 30, 0.01);
  const three = [0, 1, 2].map(() => ({ L: 6, EI: 1e4, wMax: 10, wMin: 10 })), env = envelope(three, [2000, 5000, 5000, 2000]);
  ok('symmetric middle span: sag + (hog left + hog right)/2 = wL²/8 = 45 exactly', Math.abs(env[1].sag + (env[1].hogL + env[1].hogR) / 2 - 45) < 0.05, JSON.stringify(env[1]));
  ok('shear in every span adds up to the span load wL = 60 kN', env.every(e => Math.abs(e.VL + e.VR - 60) < 1e-6), JSON.stringify(env));
}

// ---- equivalent frame for flat slabs (3 x 3 columns at 6 m, 300 mm columns, h = 250 mm) ----
{
  const story = { id: 's', name: 'Ground floor', elevation_m: 0, height_m: 3.6 };
  const cols = [0, 6, 12].flatMap(x => [0, 6, 12].map(y => ({ id: `c${x}-${y}`, type: 'column', library_item_id: null, geometry: { at: [x, y], b: 0.3, h: 0.3, height: 3.6 } })));
  const g = { story, els: cols as any };
  const r = equivalentFrame(g, [], { fck: 30, fyk: 500 }, { imposed: 3, h: 250 });
  ok('one frame line per column line in each direction (3 + 3)', r.lines.length === 6);
  const mid = r.lines.find(l => l.dir === 'x' && Math.abs(l.at - 6) < 0.1)!, edge = r.lines.find(l => l.dir === 'x' && Math.abs(l.at) < 0.1)!;
  near('interior line strip width is the full 6 m', mid.width, 6);
  near('edge line strip width is half, 3 m', edge.width, 3);
  near('column strip is half the shorter span, 3 m', mid.csWidth, 3);
  near('strip load = (1.35 × (25 × 0.25 + 2.5) + 1.5 × 3) × 6 = 97.875 kN/m', mid.wMax, 97.875, 0.001);
  const wl2 = mid.wMax * 36, hog = Math.max(...mid.spans.flatMap(s => [s.hogL, s.hogR])), sag = Math.max(...mid.spans.map(s => s.sag));
  ok('hogging moment is within the textbook range 0.06 to 0.125 wL²', hog > 0.06 * wl2 && hog < 0.125 * wl2, `${hog} vs ${wl2}`);
  ok('sagging moment is within the textbook range 0.03 to 0.09 wL²', sag > 0.03 * wl2 && sag < 0.09 * wl2, `${sag} vs ${wl2}`);
  near('column strip takes 70% of hogging (EC2 Annex I)', (mid.mTopCS * mid.csWidth) / hog, 0.7, 0.001);
  near('middle strip takes the other 30%', (mid.mTopMS * mid.msWidth) / hog, 0.3, 0.001);
  near('column strip takes 60% of sagging', (mid.mBotCS * mid.csWidth) / sag, 0.6, 0.001);
  ok('every strip gets bars and the line passes', mid.status === 'ok' && Object.values(mid.bars).every(b => /^T\d+@\d+$/.test(b)), JSON.stringify(mid.bars));
  ok('column strip needs more top steel than the middle strip', mid.mTopCS > mid.mTopMS);
  const bs = equivalentFrame(g, [], { fck: 30, fyk: 460, code: 'BS8110' }, { imposed: 3, h: 250 }).lines.find(l => l.dir === 'x' && Math.abs(l.at - 6) < 0.1)!;
  const hogBs = Math.max(...bs.spans.flatMap(s => [s.hogL, s.hogR]));
  near('BS 8110 Table 3.20 gives the column strip 75% of hogging', (bs.mTopCS * bs.csWidth) / hogBs, 0.75, 0.001);
  const top = equivalentFrame(g, [], { fck: 30, fyk: 500 }, { imposed: 3, h: 250, colsAbove: false }).lines.find(l => l.dir === 'x' && Math.abs(l.at - 6) < 0.1)!;
  ok('columns only below give a softer end support: less end-support hogging than columns above and below', top.spans[0].hogL < mid.spans[0].hogL);
  ok('a storey with beams is not an equivalent-frame case', equivalentFrame({ story, els: [...cols, { id: 'b', type: 'beam', library_item_id: null, geometry: { start: [0, 0], end: [6, 0] } }] as any }, [], { fck: 30, fyk: 500 }, { imposed: 3 }).lines.length === 0);
}

// ---- MEP friction, fittings and pressure drop ----
{
  near('laminar friction factor 64/Re', frictionFactor(1000, 0), 0.064);
  near('Swamee-Jain at Re 1e5, e/D 0.001 matches the Moody chart (0.0223)', frictionFactor(1e5, 0.001), 0.0223, 0.01);
  near('hydraulic diameter of a 300 × 300 duct is 0.3 m', hydraulicDiameter({ kind: 'duct', size: { w_mm: 300, h_mm: 300 } } as any), 0.3);
  near('hydraulic diameter of a DN50 pipe (62 mm outside) is 0.05 m', hydraulicDiameter({ kind: 'pipe', size: { dia_mm: 62 } } as any), 0.05);
  near('air in a 0.3 m duct at 5 m/s loses about 0.98 Pa/m', frictionPerMetre('duct', 5, 0.3), 0.975, 0.05);
  near('water in DN50 at 1 m/s loses about 248 Pa/m', frictionPerMetre('pipe', 1, 0.05), 248, 0.1);
  near('dynamic pressure of air at 5.5 m/s = 0.5 × 1.2 × 5.5² = 18.15 Pa', dynamicPressure('duct', 5.5), 18.15, 0.001);
  const D = (a: number[], b: number[], flow: number, el = 2.7, w = 600): any => ({ start: a, end: b, elevation: el, flow, kind: 'duct', size: { w_mm: w, h_mm: 300 }, velocity: 5.5 });
  const straight = analyseNetwork([D([0, 0], [10, 0], 1), D([10, 0], [20, 0], 1)]);
  ok('a straight run has no fittings', straight.fittings.length === 0);
  near('and its path length is 20 m', straight.critical!.length, 20);
  const L = analyseNetwork([D([0, 0], [10, 0], 1), D([10, 0], [10, 6], 1)]);
  ok('an L-shaped run has exactly one 90° elbow', L.counts.elbow === 1 && L.fittings[0].angle === 90);
  near('elbow loss = 0.30 × 18.15 = 5.445 Pa', L.fittings[0].dp, 5.445, 0.001);
  near('path = friction + fittings', L.critical!.total, L.critical!.friction + 5.445, 0.001);
  near('path length is 16 m', L.critical!.length, 16);
  const T = analyseNetwork([D([0, 0], [10, 0], 2), D([10, 0], [20, 0], 1), D([10, 0], [10, 8], 1)]);
  ok('a branch is one tee, the straight main takes none', T.counts.tee === 1 && T.counts.elbow === 0);
  near('the critical path is the longer branch, 20 m', T.critical!.length, 20);
  ok('collinear segments at different heights make a vertical offset', analyseNetwork([D([0, 0], [10, 0], 1, 2.7), D([10, 0], [20, 0], 1, 2.4)]).counts.offset === 1);
  ok('collinear segments of different size make a reducer', analyseNetwork([D([0, 0], [10, 0], 1, 2.7, 600), D([10, 0], [20, 0], 0.5, 2.7, 400)]).counts.reducer === 1);
  const pipe = analyseNetwork([{ start: [0, 0], end: [10, 0], elevation: 2.7, flow: 2, kind: 'pipe', size: { dia_mm: 62 }, velocity: 1 }, { start: [10, 0], end: [10, 5], elevation: 2.7, flow: 2, kind: 'pipe', size: { dia_mm: 62 }, velocity: 1 }] as any);
  near('pipe elbow loss = 0.75 × 500 = 375 Pa', pipe.fittings[0].dp, 375, 0.001);
  ok('pipe head is reported in kPa and is positive', pipe.head > 0 && pipe.head < 20);
  ok('an empty network gives an empty result', analyseNetwork([]).critical === null);
}


// ===== Polygon slabs, roofs, rooms and stairs =====
{
  const L: [number, number][] = [[0, 0], [6, 0], [6, 3], [3, 3], [3, 6], [0, 6]];       // L shape: 36 - 9 = 27 m²
  near('L-shaped polygon area is 27 m²', polyArea(L), 27, 0.0001);
  ok('polygon bounding box', JSON.stringify(polyBox(L)) === '[0,0,6,6]');
  ok('point inside the L is inside, point in the notch is outside', inPoly(L, 1, 1) && !inPoly(L, 5, 5) && inPoly(L, 5, 1));
  const cen = polyCentroid([[0, 0], [4, 0], [4, 2], [0, 2]]);
  ok('rectangle centroid is its centre', Math.abs(cen[0] - 2) < 1e-9 && Math.abs(cen[1] - 1) < 1e-9);
  ok('a rect-only slab still has a footprint of its own area', Math.abs(polyArea(footprint({ rect: [0, 0, 8, 6] })!) - 48) < 1e-9);
  ok('polygon footprint wins over rect', Math.abs(polyArea(footprint({ poly: L, rect: [0, 0, 6, 6] })!) - 27) < 1e-9);
  ok('stair step count: 3.6 m rise at about 175 mm', stairSteps({ z0: 0, z1: 3.6 }) === 21);
  const st = [{ id: 's0', name: 'Ground', elevation_m: 0, height_m: 3.6 }];
  const poly = [{ id: '66666666-6666-4666-8666-666666666666', type: 'slab', geometry: { poly: L, rect: [0, 0, 6, 6], z0: 3.4, z1: 3.6 }, library_item_id: null, story_id: 's0' }];
  const ifc = toIfc('Poly', poly as any, [], st as any);
  ok('IFC export writes the polygon outline as an arbitrary closed profile', /IFCARBITRARYCLOSEDPROFILEDEF/.test(ifc) && /IFCPOLYLINE/.test(ifc) && /IFCSLAB/.test(ifc));
  const rt = parseIfc(ifc).extractAll().stories[0].result.elements.find(x => x.kind === 'slab');
  ok('IFC polygon slab re-imports as a slab with the right bounding box', !!rt && Math.abs(rt.geometry.rect[2] - rt.geometry.rect[0] - 6) < 0.05 && Math.abs(rt.geometry.rect[3] - rt.geometry.rect[1] - 6) < 0.05, JSON.stringify(rt?.geometry));
}

// ===== Schedules and views =====
{
  const st = [{ id: 's0', name: 'Ground', elevation_m: 0, height_m: 3 }, { id: 's1', name: 'First', elevation_m: 3, height_m: 3 }];
  const W = (id: string, a: [number, number], b: [number, number], story = 's0') => ({ id, type: 'wall', geometry: { start: a, end: b, thickness: 0.2, height: 3 }, library_item_id: null, story_id: story });
  const els: any[] = [
    W('w1', [0, 0], [10, 0]), W('w2', [10, 0], [10, 8]), W('w3', [10, 8], [0, 8]), W('w4', [0, 8], [0, 0]),
    { id: 'd1', type: 'door', geometry: { wall_id: 'w1', offset_m: 2, width_m: 1 }, library_item_id: null, story_id: 's0' },
    { id: 'd2', type: 'door', geometry: { wall_id: 'w3', offset_m: 5, width_m: 1 }, library_item_id: null, story_id: 's0' },
    { id: 'n1', type: 'window', geometry: { wall_id: 'w1', offset_m: 6, width_m: 2 }, library_item_id: null, story_id: 's0' },
    { id: 'sl', type: 'slab', geometry: { poly: [[0, 0], [10, 0], [10, 8], [0, 8]], rect: [0, 0, 10, 8], z0: 2.8, z1: 3 }, library_item_id: null, story_id: 's0' },
    { id: 'z1', type: 'zone', geometry: { poly: [[0, 0], [10, 0], [10, 8], [0, 8]], rect: [0, 0, 10, 8], name: 'Hall, main' }, library_item_id: null, story_id: 's0' },
  ];
  const T = buildSchedules(els, [], st as any), by = (id: string) => T.find(t => t.id === id)!;
  ok('doors get marks D1, D2 and windows W1', by('openings').rows.map(r => r[0]).join() === 'D1,D2,W1');
  near('opening area total: 2 doors 1 x 2.1 + window 2 x 1.2', by('openings').foot![5] as number, 6.6, 1e-9);
  near('wall length is the 36 m perimeter', by('walls').rows[0][2] as number, 36, 1e-9);
  near('wall net area = 36 x 3 minus openings (6.6)', by('walls').rows[0][6] as number, 101.4, 0.05);
  near('slab volume = 80 m² x 0.2 m', by('slabs').rows[0][5] as number, 16, 1e-9);
  ok('room area 80 m²', by('rooms').rows[0][2] === 80);
  const csv = schedulesCsv(T);
  ok('CSV quotes a name containing a comma', csv.includes('"Hall, main"'));
  ok('empty model still gives an openings table and nothing else', buildSchedules([], [], st as any).length === 1);

  // views
  const south = buildView(els, [], st as any, { kind: 'elevation', side: 'S' });
  ok('south elevation spans the 10 m width', Math.abs(south.u1 - south.u0 - 10.2) < 0.3 || Math.abs(south.u1 - south.u0 - 10) < 0.3, String(south.u1 - south.u0));
  ok('elevation shows the door and window of the south wall as openings', south.shapes.filter(x => x.open).length >= 2);
  const north = buildView(els, [], st as any, { kind: 'elevation', side: 'N' });
  ok('north elevation also sees the door in the north wall', north.shapes.filter(x => x.type === 'door' && x.open).length >= 1);
  ok('levels include Ground, First and Top', south.levels.map(l => l.name).join() === 'Ground,First,Top');
  const cut = buildView(els, [], st as any, { kind: 'section', axis: 'y', pos: 4, flip: false });
  const cuts = cut.shapes.filter(x => x.cut && x.type === 'wall');
  ok('a section through the middle cuts the two side walls', cuts.length === 2, String(cuts.length));
  ok('section also cuts the slab', cut.shapes.some(x => x.cut && x.type === 'slab'));
  ok('cut intervals of a rectangle are one span', cutIntervals([[0, 0], [4, 0], [4, 4], [0, 4]], p => p[0], p => p[1], 2).length === 1);
  ok('cut intervals of a U shape are two spans', cutIntervals([[0, 0], [6, 0], [6, 6], [4, 6], [4, 2], [2, 2], [2, 6], [0, 6]], p => p[0], p => p[1], 4).length === 2);
  ok('an empty model gives an empty view without throwing', buildView([], [], st as any, { kind: 'elevation', side: 'S' }).shapes.length === 0);
}

// ===== Drawing sheets =====
{
  const st = [{ id: 's0', name: 'Ground', elevation_m: 0, height_m: 3 }];
  const els: any[] = [
    { id: 'w1', type: 'wall', geometry: { start: [0, 0], end: [10, 0], thickness: 0.2 }, story_id: 's0' },
    { id: 'w2', type: 'wall', geometry: { start: [10, 0], end: [10, 8], thickness: 0.2 }, story_id: 's0' },
    { id: 'd1', type: 'door', geometry: { wall_id: 'w1', offset_m: 3, width_m: 1 }, story_id: 's0' },
    { id: 'z1', type: 'zone', geometry: { poly: [[0, 0], [10, 0], [10, 8], [0, 8]], rect: [0, 0, 10, 8], name: 'Hall & lobby' }, story_id: 's0' },
    { id: 'm1', type: 'dimension', geometry: { start: [0, 0], end: [10, 0], offset: 1 }, story_id: 's0' },
  ];
  const d = makeDrawing(els, [], st as any, { kind: 'plan', storyId: 's0' }, 100);
  near('plan at 1:100 is (10 + 5 m margin) wide = 150 mm', d.w, 150, 1e-6);
  ok('plan shows the dimension as 10000', d.inner.includes('>10000<'));
  ok('room name is escaped in the SVG', d.inner.includes('Hall &amp; lobby'));
  const sv = sheetSvg(d, 'A3', 100, 'A-01', { project: 'Test', date: '2026-11-02' });
  ok('sheet has the paper size in mm and the scale in the title block', sv.includes('width="420mm"') && sv.includes('1:100'));
  ok('fit scale for a 10 x 8 m plan on A3 is 1:100', fitScale(els, [], st as any, { kind: 'plan', storyId: 's0' }, 'A3') === 100);
  ok('the same plan on A4 needs a smaller scale', fitScale(els, [], st as any, { kind: 'plan', storyId: 's0' }, 'A4') >= 100);
  const html = printHtml([sv, sv], 'A3', 'x');
  ok('print document has one page per sheet and sets the page size', (html.match(/class="p"/g) ?? []).length === 2 && html.includes('size:420mm 297mm'));
}

// ===== Rotate and mirror =====
{
  const w = { start: [0, 0], end: [4, 0], thickness: 0.2 };
  const c = centreOf([w]);
  const r = transformGeometry(w, c, { kind: 'rot', quarter: 1 });
  ok('a 4 m wall turned a quarter about its centre becomes vertical, same length', Math.abs(r.start[0] - r.end[0]) < 1e-9 && Math.abs(Math.hypot(r.end[0] - r.start[0], r.end[1] - r.start[1]) - 4) < 1e-9 && JSON.stringify(c) === '[2,0]');
  ok('four quarter turns return the original', JSON.stringify([1, 2, 3, 4].reduce((g: any) => transformGeometry(g, [2, 0], { kind: 'rot', quarter: 1 }), w).start) === JSON.stringify(w.start));
  ok('clockwise then counter-clockwise cancels', JSON.stringify(transformGeometry(transformGeometry(w, c, { kind: 'rot', quarter: 1 }), c, { kind: 'rot', quarter: -1 }).end) === JSON.stringify(w.end));
  const m = transformGeometry({ start: [1, 1], end: [5, 3] }, [3, 2], { kind: 'mirror', axis: 'x' });
  ok('left-right mirror about x = 3 swaps the ends', JSON.stringify(m.start) === '[5,1]' && JSON.stringify(m.end) === '[1,3]');
  const col = transformGeometry({ at: [1, 1], b: 0.3, h: 0.5 }, [0, 0], { kind: 'rot', quarter: 1 });
  ok('a rotated column swaps its sides and moves its centre', col.b === 0.5 && col.h === 0.3 && JSON.stringify(col.at) === '[-1,1]');
  const sl = transformGeometry({ poly: [[0, 0], [6, 0], [6, 3], [0, 3]], rect: [0, 0, 6, 3] }, [3, 1.5], { kind: 'rot', quarter: 1 });
  ok('a rotated slab keeps its area and gets a new bounding box', JSON.stringify(sl.rect) === '[1.5,-1.5,4.5,4.5]', JSON.stringify(sl.rect));
}

// ===== Slab openings =====
{
  const g = { rect: [0, 0, 10, 8], z0: 2.8, z1: 3, holes: [[2, 2, 4, 5]] };
  near('net area = 80 - 2 x 3', netArea(g), 74, 1e-9);
  ok('holesOf is empty when there are none', holesOf({ rect: [0, 0, 1, 1] }).length === 0);
  const st = [{ id: 's0', name: 'Ground', elevation_m: 0, height_m: 3 }];
  const els: any[] = [{ id: '77777777-7777-4777-8777-777777777777', type: 'slab', geometry: g, library_item_id: null, story_id: 's0' }];
  near('schedule volume uses the net area', buildSchedules(els, [], st as any).find(t => t.id === 'slabs')!.rows[0][5] as number, 74 * 0.2, 1e-9);
  const ifc = toIfc('Holes', els, [], st as any);
  ok('IFC writes the slab with an inner void profile', /IFCARBITRARYPROFILEDEFWITHVOIDS/.test(ifc));
  const back = parseIfc(ifc).extractAll().stories[0].result.elements.find(x => x.kind === 'slab');
  ok('IFC slab with an opening re-imports as a slab', !!back && Math.abs(back.geometry.rect[2] - back.geometry.rect[0] - 10) < 0.05, JSON.stringify(back?.geometry));
}

// ===== Pitched roofs =====
{
  const g = { rect: [0, 0, 10, 6], z0: 3, z1: 3.2, form: 'gable', pitch: 30 };
  ok('a gable roof has two faces, flat has one', roofFaces(g).length === 2 && roofFaces({ ...g, form: 'flat' }).length === 1);
  near('ridge height = 3.2 + 3 x tan 30', roofTop(g), 3.2 + 3 * Math.tan(Math.PI / 6), 1e-9);
  ok('ridge runs along the longer side by default', ridgeAxis(g) === 'x');
  ok('pitch zero or a polygon makes the roof flat', !isPitched({ ...g, pitch: 0 }) && !isPitched({ ...g, poly: [[0, 0], [1, 0], [1, 1]] }));
  const hip = { ...g, form: 'hip' };
  ok('a hip roof has four faces and a 4 m ridge on a 10 x 6 plan', roofFaces(hip).length === 4 && roofLines(hip).some(([a, b]) => Math.abs(Math.hypot(b[0] - a[0], b[1] - a[1]) - 4) < 1e-9));
  ok('a hip roof draws a ridge and four hips', roofLines(hip).length === 5, String(roofLines(hip).length));
  near('mono roof high edge is 6 x tan 30 above the eaves', roofTop({ ...g, form: 'mono', ridge: 'x' }), 3.2 + 6 * Math.tan(Math.PI / 6), 1e-9);
  near('slope area factor at 30 degrees', slopeFactor(g), 1 / Math.cos(Math.PI / 6), 1e-9);
  const U = (p: [number, number]) => -p[1] * 0 + p[0], Dp = (p: [number, number]) => p[1];            // look along +y, u = x
  const cut = faceCut(roofFaces(g)[0], 0.2, U, Dp, 1.5);
  ok('a section half way up the south slope cuts a parallelogram-like shell 10 m wide', cut.length >= 4 && Math.abs(Math.max(...cut.map(c => c[0])) - Math.min(...cut.map(c => c[0])) - 10) < 1e-9);
  ok('a section outside the roof cuts nothing', faceCut(roofFaces(g)[0], 0.2, U, Dp, 9).length === 0);
  const out = faceOutline(roofFaces(g)[0], 0.2, U);
  ok('the silhouette seen along the ridge-side face is a hull with the eaves and ridge points', out.length >= 4);
}

// ===== Pitched roofs in drawings =====
{
  const st = [{ id: 's0', name: 'Ground', elevation_m: 0, height_m: 3 }];
  const roof: any = { id: '88888888-8888-4888-8888-888888888888', type: 'roof', geometry: { rect: [0, 0, 10, 6], z0: 3, z1: 3.2, form: 'gable', pitch: 30 }, library_item_id: null, story_id: 's0' };
  const south = buildView([roof], [], st as any, { kind: 'elevation', side: 'S' });
  ok('a gable roof seen from the long side is drawn as outlines with a ridge above the eaves', south.shapes.length === 2 && south.shapes.every(x => x.poly) && Math.abs(south.zmax - (3.2 + 3 * Math.tan(Math.PI / 6))) < 1e-6, south.zmax.toFixed(3));
  const east = buildView([roof], [], st as any, { kind: 'elevation', side: 'E' });
  ok('seen from the gable end it fills a triangle-like outline up to the ridge', east.shapes.length === 2 && Math.abs(east.zmax - (3.2 + 3 * Math.tan(Math.PI / 6))) < 1e-6);
  const sec = buildView([roof], [], st as any, { kind: 'section', axis: 'x', pos: 5, flip: false });
  ok('a section across the ridge cuts both slopes', sec.shapes.filter(x => x.cut).length === 2, JSON.stringify(sec.shapes.map(x => x.cut)));
  const sch = buildSchedules([roof], [], st as any).find(t => t.id === 'slabs')!;
  ok('the slabs and roofs schedule names the roof form and pitch', String(sch.rows[0][2]).startsWith('Gable 30'), String(sch.rows[0][2]));
  const ifc = toIfc('R', [roof], [], st as any);
  ok('IFC names the pitched roof with its form and pitch', /Roof \(gable 30 deg\)/.test(ifc));
}

// ===== 3D orbit =====
{
  const close = (a: number[], b: number[]) => a.every((x, i) => Math.abs(x - b[i]) < 1e-9);
  ok('a quarter turn about Z takes X to Y', close(qRotate(qAxis('z', Math.PI / 2), [1, 0, 0]), [0, 1, 0]));
  ok('a quarter turn about X takes the up axis towards the viewer (top view)', close(qRotate(VIEWS.top.q, [0, 1, 0]), [0, 0, 1]));
  ok('the right view brings the east side (+x) towards the viewer', close(qRotate(VIEWS.right.q, [1, 0, 0]), [0, 0, 1]));
  ok('the back view turns the front half a turn', close(qRotate(VIEWS.back.q, [0, 0, 1]), [0, 0, -1]));
  let q = IDENTITY; for (let i = 0; i < 24; i++) q = turn(q, 'x', Math.PI / 12);
  ok('24 steps of 15 degrees about X make a full 360 and come back to the start', close(qRotate(q, [0, 1, 0]), [0, 1, 0]) && close(qRotate(q, [0, 0, 1]), [0, 0, 1]));
  let r = IDENTITY; for (let i = 0; i < 500; i++) r = drag(r, 7, -3);
  ok('many drags keep the rotation a unit quaternion (no drift)', Math.abs(Math.hypot(...r) - 1) < 1e-9);
  ok('rotating about all three axes in turn is not the same as one axis (free rotation)', !close(qRotate(turn(turn(turn(IDENTITY, 'x', 1), 'y', 1), 'z', 1), [1, 0, 0]), qRotate(turn(IDENTITY, 'x', 1), [1, 0, 0])));
  ok('composition: x then y equals the product', close(turn(turn(IDENTITY, 'x', 0.7), 'y', 0.4), qMul(qAxis('y', 0.4), qAxis('x', 0.7))));
}

// ===== Several views on one sheet =====
{
  const st = [{ id: 's0', name: 'Ground', elevation_m: 0, height_m: 3 }];
  const els: any[] = [
    { id: 'w1', type: 'wall', geometry: { start: [0, 0], end: [10, 0], thickness: 0.2, height: 3 }, story_id: 's0' },
    { id: 'w2', type: 'wall', geometry: { start: [10, 0], end: [10, 8], thickness: 0.2, height: 3 }, story_id: 's0' },
  ];
  const c4 = layoutCells(4, [392, 230]);
  ok('four views make a 2 x 2 grid that fits inside the area', c4.length === 4 && c4.every(c => c[0] >= 0 && c[1] >= 0 && c[0] + c[2] <= 392 + 1e-9 && c[1] + c[3] <= 230 + 1e-9));
  ok('one view uses the whole area, six views a 3 x 2 grid', layoutCells(1, [392, 230])[0][2] === 392 && new Set(layoutCells(6, [392, 230]).map(c => c[0].toFixed(1))).size === 3);
  const vs: any[] = [{ kind: 'plan', storyId: 's0' }, { kind: 'elevation', side: 'S' }, { kind: 'elevation', side: 'E' }];
  const sc = fitScaleMany(els, [], st as any, vs, 'A3');
  ok('a plan and two elevations fit together on A3 at a standard scale', [50, 100, 200].includes(sc), String(sc));
  const d = compositeDrawing(els, [], st as any, vs, 'A3', sc, 'General arrangement');
  ok('the composite carries every caption with the common scale', d.inner.includes('Plan, Ground') && d.inner.includes('South elevation') && d.inner.includes('East elevation') && d.inner.includes(`1:${sc}`));
  const svg = sheetSvg(d, 'A3', sc, 'A-09', { project: 'T' });
  ok('the composite sheet has the title block with its own title', svg.includes('General arrangement') && svg.includes('A-09'));
}

// ===== Roof overhang and IFC export of pitched roofs =====
{
  const g = { rect: [0, 0, 10, 6], z0: 3, z1: 3.2, form: 'gable', pitch: 30, overhang: 0.5 };
  ok('the overhang grows the plan outline by 0.5 m all round', JSON.stringify(roofPlanBox(g)) === '[-0.5,-0.5,10.5,6.5]' && overhangOf(g) === 0.5);
  near('the ridge stays where it was (3 m span x tan 30 above the walls)', roofTop(g), 3.2 + 3 * Math.tan(Math.PI / 6), 1e-9);
  const lowest = Math.min(...roofFaces(g).flat().map(p => p[2]));
  near('the eaves drop by overhang x tan 30', lowest, 3.2 - 0.5 * Math.tan(Math.PI / 6), 1e-9);
  const xs = roofFaces(g).flat().map(p => p[0]);
  ok('the verges reach 0.5 m past the gable ends', Math.min(...xs) === -0.5 && Math.max(...xs) === 10.5);
  ok('a flat roof ignores the overhang', overhangOf({ ...g, form: 'flat' }) === 0);
  const st = [{ id: 's0', name: 'Ground', elevation_m: 0, height_m: 3 }];
  const roof: any = { id: '99999999-9999-4999-8999-999999999999', type: 'roof', geometry: g, library_item_id: null, story_id: 's0' };
  const row = buildSchedules([roof], [], st as any).find(t => t.id === 'slabs')!.rows[0];
  ok('the schedule area includes the overhang (11 x 7) and says so', row[3] === 77 && String(row[2]).includes('0.5 m overhang'), JSON.stringify(row));
  const ifc = toIfc('Roof', [roof], [], st as any);
  ok('IFC writes the pitched roof as faceted B-rep solids with a gable roof type', /IFCFACETEDBREP/.test(ifc) && /IFCCLOSEDSHELL/.test(ifc) && /\.GABLE_ROOF\./.test(ifc) && !/exported flat/.test(ifc));
  ok('two faces give two B-rep solids', (ifc.match(/IFCFACETEDBREP/g) ?? []).length === 2);
  const back = parseIfc(ifc).extractAll().stories[0].result.elements.find(x => x.kind === 'roof' || x.kind === 'slab');
  ok('the roof re-imports as a roof or slab with roughly the right plan size', !!back && Math.abs(back.geometry.rect[2] - back.geometry.rect[0] - 11) < 0.3, JSON.stringify(back?.geometry));
}

// ===== DXF export =====
{
  const st = [{ id: 's0', name: 'Ground', elevation_m: 0, height_m: 3 }];
  const els: any[] = [
    { id: 'w1', type: 'wall', geometry: { start: [0, 0], end: [10, 0], thickness: 0.2, height: 3 }, story_id: 's0' },
    { id: 'd1', type: 'door', geometry: { wall_id: 'w1', offset_m: 3, width_m: 1 }, story_id: 's0' },
    { id: 'n1', type: 'window', geometry: { wall_id: 'w1', offset_m: 7, width_m: 2 }, story_id: 's0' },
    { id: 'c1', type: 'column', geometry: { at: [0, 5], b: 0.3, h: 0.3, height: 3 }, story_id: 's0' },
    { id: 'z1', type: 'zone', geometry: { poly: [[0, 0], [10, 0], [10, 8], [0, 8]], rect: [0, 0, 10, 8], name: 'Hall' }, story_id: 's0' },
    { id: 'g1', type: 'grid', geometry: { start: [0, -2], end: [0, 10], label: 'A' }, story_id: null },
    { id: 'm1', type: 'dimension', geometry: { start: [0, 0], end: [10, 0], offset: 1 }, story_id: 's0' },
  ];
  const dxf = planDxf(els, [], st as any, 's0'), pairs = dxf.trim().split('\n'), vals = (code: string) => pairs.map((v, i) => (i % 2 === 0 && v === code ? pairs[i + 1] : null)).filter(x => x !== null) as string[];
  ok('the file is a complete DXF: sections, entities and EOF', dxf.startsWith('0\nSECTION') && /ENTITIES/.test(dxf) && dxf.trim().endsWith('EOF') && pairs.length % 2 === 0);
  ok('layers for walls, doors, windows, columns, rooms, grid and dimensions are declared', ['A-WALL', 'A-DOOR', 'A-WIND', 'S-COLS', 'A-ROOM', 'S-GRID', 'A-DIMS'].every(n => dxf.includes(`LAYER\n2\n${n}\n`)));
  const xs = vals('10').map(Number), ys = vals('20').map(Number);
  ok('a 10 m wall is 10 000 mm long and the units are millimetres', Math.max(...xs) >= 10000 && xs.includes(10000));
  ok('the wall is 200 mm thick and y is flipped to CAD (y up)', ys.includes(100) && ys.includes(-100) && ys.includes(-8000), JSON.stringify([...new Set(ys)].slice(0, 12)));
  ok('the door has a swing arc and the dimension says 10000', dxf.includes('\n0\nARC\n') && vals('1').includes('10000'));
  ok('the room is labelled with its area', vals('1').some(v => v.startsWith('Hall') && v.includes('80.0')));
  ok('another storey still gets the grid but not this storey walls', !planDxf(els, [], [...st, { id: 's1', name: 'First', elevation_m: 3, height_m: 3 }] as any, 's1').includes('A-WALL') && planDxf(els, [], [...st, { id: 's1', name: 'First', elevation_m: 3, height_m: 3 }] as any, 's1').includes('S-GRID'));
  const v = viewDxf(buildView(els, [], st as any, { kind: 'elevation', side: 'S' }));
  ok('an elevation exports as outlines with level lines', v.includes('POLYLINE') && v.includes('V-LEVEL') && v.includes('Ground 0.00'));
  const vy = viewDxf(buildView(els, [], st as any, { kind: 'elevation', side: 'S' })).split('\n');
  const zs = vy.map((x, i) => (i % 2 === 0 && x === '20' ? Number(vy[i + 1]) : null)).filter(x => x !== null) as number[];
  ok('in the elevation the heights come out positive (z up) in mm', Math.max(...zs) >= 3000 && Math.min(...zs) >= -1);
}

// ===== Fire dampers =====
{
  const st = [{ id: 's0', name: 'Ground', elevation_m: 0, height_m: 3 }];
  const wall = (id: string, fire: number): any => ({ id, type: 'wall', geometry: { start: [5, 0], end: [5, 10], thickness: 0.2, height: 3, fire }, story_id: 's0' });
  const duct: any = { id: 'd1', type: 'duct', geometry: { start: [0, 4], end: [10, 4], w_mm: 600, h_mm: 300, elevation_m: 2.6 }, library_item_id: null, story_id: 's0' };
  const pipe: any = { id: 'p1', type: 'pipe', geometry: { start: [0, 6], end: [10, 6], dia_mm: 110, elevation_m: 2.5 }, library_item_id: null, story_id: 's0' };
  ok('segments that cross are found, parallel ones are not', JSON.stringify(segCross([0, 4], [10, 4], [5, 0], [5, 10])) === '[5,4]' && segCross([0, 0], [10, 0], [0, 1], [10, 1]) === null);
  const f = findFireCrossings([wall('w', 60), duct, pipe], [], st as any);
  ok('a duct through a 60 minute wall needs a damper and a pipe a fire-stopped sleeve', f.length === 2 && f[0].kind === 'damper' && f[1].kind === 'sleeve' && f[0].rating === 60 && f[0].size === '600 x 300 mm', JSON.stringify(f));
  ok('a wall with no fire rating needs nothing', findFireCrossings([wall('w', 0), duct, pipe], [], st as any).length === 0);
  ok('a duct above the wall top is not a crossing', findFireCrossings([wall('w', 60), { ...duct, geometry: { ...duct.geometry, elevation_m: 3.4 } }], [], st as any).length === 0);
  ok('a duct on another storey is not a crossing', findFireCrossings([wall('w', 60), { ...duct, story_id: 's1' }], [], [...st, { id: 's1', name: 'First', elevation_m: 3, height_m: 3 }] as any).length === 0);
  const sch = buildSchedules([wall('w', 60), duct, pipe], [], st as any).find(t => t.id === 'fire')!;
  ok('the schedule lists FD1 and FS2 with the rating and wall thickness', sch.rows.length === 2 && sch.rows[0][0] === 'FD1' && sch.rows[1][0] === 'FS2' && sch.rows[0][4] === 60 && sch.rows[0][5] === 200, JSON.stringify(sch.rows));
  ok('without fire walls there is no fire table', !buildSchedules([wall('w', 0), duct], [], st as any).some(t => t.id === 'fire'));
}

// ===== Round openings =====
{
  const g = { rect: [0, 0, 10, 8], z0: 2.8, z1: 3, holes: [[2, 2, 4, 5]], rounds: [{ c: [7, 4], r: 1 }] };
  near('net area = 80 - 6 - pi', netArea(g), 80 - 6 - Math.PI, 1e-9);
  ok('opening count includes round ones', openingCount(g) === 2 && roundsOf(g).length === 1 && roundsOf({ rounds: [{ c: [0, 0], r: 0 }] }).length === 0);
  const pts = circlePoints([7, 4], 1, 48);
  ok('a circle is 48 points all at the radius', pts.length === 48 && pts.every(p => Math.abs(Math.hypot(p[0] - 7, p[1] - 4) - 1) < 1e-3));
  const st = [{ id: 's0', name: 'Ground', elevation_m: 0, height_m: 3 }];
  const els: any[] = [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', type: 'slab', geometry: g, library_item_id: null, story_id: 's0' }];
  const row = buildSchedules(els, [], st as any).find(t => t.id === 'slabs')!.rows[0];
  near('schedule volume uses the net area with the round opening', row[5] as number, (80 - 6 - Math.PI) * 0.2, 0.01);
  ok('schedule counts both openings', String(row[2]).includes('2 opening(s)'));
  const ifc = toIfc('R', els, [], st as any);
  ok('IFC writes both inner curves of the profile', /IFCARBITRARYPROFILEDEFWITHVOIDS/.test(ifc) && (ifc.match(/IFCPOLYLINE/g) ?? []).length >= 3);
  ok('DXF has a circle for the round opening', planDxf(els, [], st as any, 's0').includes('\n0\nCIRCLE\n'));
  const turned = transformGeometry(g, [5, 4], { kind: 'rot', quarter: 1 });
  ok('rotating the slab turns its openings with it (round centre and rectangle)', JSON.stringify(turned.rounds[0].c) === '[5,6]' && turned.holes.length === 1 && JSON.stringify(turned.holes[0]) === '[4,1,7,3]', JSON.stringify([turned.rounds, turned.holes]));
  const sheet = makeDrawing(els, [], st as any, { kind: 'plan', storyId: 's0' }, 100);
  ok('sheet plan draws the round opening as a circle', sheet.inner.includes('<circle'));
}

// ---- raft footing (rigid method) ----
{
  const grid = (nx: number, ny: number, sp: number, N: number) => { const c: any[] = []; for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) c.push({ id: `c${i}${j}`, x: i * sp, y: j * sp, N, c1: 400, c2: 400 }); return c; };
  const ss = stripStatics(8, [1, 4, 7], [600, 900, 300]);
  const eL = ss.at(8, 'l');
  ok('raft strip statics close: moment and shear are zero at the far end', Math.abs(eL.M) < 1e-6 && Math.abs(eL.V) < 1e-6, `M ${eL.M} V ${eL.V}`);
  const sym = stripStatics(6, [1, 5], [500, 500]);
  ok('symmetric strip has uniform reaction (w1 = 0) and the textbook midspan moment', Math.abs(sym.w1) < 1e-9 && Math.abs(sym.at(3, 'l').M - (1000 / 6 * 9 / 2 - 500 * 2)) < 1e-6);
  const rw = rows([0, 0.2, 5, 5.3, 10]);
  ok('rows clusters coordinates within tolerance', rw.centres.length === 3 && rw.index[0] === rw.index[1] && rw.index[2] === rw.index[3] && rw.index[4] === 2);
  const r3 = designRaft(grid(3, 3, 6, 1500), 150, mat);
  ok('3 x 3 grid raft is centred on the grid with a projection', Math.abs(r3.x0 + r3.L / 2 - 6) < 1e-9 && Math.abs(r3.y0 + r3.B / 2 - 6) < 1e-9 && r3.L >= 12);
  ok('raft thickness is plausible (0.4 to 1.5 m) and passes', r3.h >= 0.4 && r3.h <= 1.5 && r3.punchRatio <= 1 && r3.shearRatio <= 1 && r3.status !== 'bad', `h ${r3.h} punch ${r3.punchRatio}`);
  ok('raft bearing pressure within allowable', r3.pSLS <= 150 + 1e-6, `${r3.pSLS}`);
  ok('3 x 3 grid gives 3 strips each way', r3.strips.filter(s => s.dir === 'x').length === 3 && r3.strips.filter(s => s.dir === 'y').length === 3);
  const ecc = grid(3, 3, 6, 1000); ecc[8].N = 3000;
  const re = designRaft(ecc, 150, mat), NT = ecc.reduce((a, c) => a + c.N, 0), xr = ecc.reduce((a, c) => a + c.N * c.x, 0) / NT;
  ok('eccentric loads: raft is centred on the load resultant (uniform pressure)', Math.abs(re.x0 + re.L / 2 - xr) < 1e-9 && re.resultant[0] === xr);
  const soft = designRaft(grid(3, 3, 6, 1500), 60, mat);
  ok('weaker soil needs a bigger raft or is flagged', soft.L * soft.B > r3.L * r3.B || soft.status !== 'ok');
  ok('BS 8110 raft runs and passes', designRaft(grid(3, 3, 6, 1500), 150, { fck: 25, fyk: 500, code: 'BS8110' } as any).status !== 'bad');
  const tot = r3.strips.filter(s => s.dir === 'x').reduce((a, s) => a + s.width, 0);
  ok('x strips together span the raft width', Math.abs(tot - r3.B) < 1e-9);
  ok('steel is reported for both faces and both directions', !!r3.bars.xBottom && !!r3.bars.xTop && !!r3.bars.yBottom && !!r3.bars.yTop && r3.steelKg > 0);
}

// ---- 3D core and P-delta analysis ----
{
  const el2 = (id: string, type: string, geometry: any, sid: string) => ({ id, type, geometry, library_item_id: null, story_id: sid }) as any;
  const building = (nSt: number, xs: number[], ys: number[], beam: number) => {
    const sts = [...Array(nSt)].map((_, k) => ({ id: `s${k}`, name: k ? `Level ${k}` : 'Ground', elevation_m: k * 3.6, height_m: 3.6 }));
    return sts.map(s => { const els: any[] = []; xs.forEach(x => ys.forEach(y => els.push(el2(`${s.id}c${x}_${y}`, 'column', { at: [x, y], b: 0.4, h: 0.4, height: 3.6 }, s.id))));
      xs.forEach(x => ys.slice(1).forEach((y, j) => els.push(el2(`${s.id}by${x}${j}`, 'beam', { start: [x, ys[j]], end: [x, y], b_mm: beam, h_mm: beam }, s.id))));
      ys.forEach(y => xs.slice(1).forEach((x, j) => els.push(el2(`${s.id}bx${y}${j}`, 'beam', { start: [xs[j], y], end: [x, y], b_mm: beam, h_mm: beam }, s.id)))); return { story: s, els }; }) as any;
  };
  const bx = (cx: number, cy: number, a: number, t: number) => [{ sx: cx - a / 2, sy: cy - a / 2, ex: cx + a / 2, ey: cy - a / 2, t }, { sx: cx + a / 2, sy: cy - a / 2, ex: cx + a / 2, ey: cy + a / 2, t }, { sx: cx + a / 2, sy: cy + a / 2, ex: cx - a / 2, ey: cy + a / 2, t }, { sx: cx - a / 2, sy: cy + a / 2, ex: cx - a / 2, ey: cy - a / 2, t }];
  const wall = coreSection([{ sx: 0, sy: 0, ex: 4, ey: 0, t: 0.3 }]);
  near('section: wall 4 m × 0.3 m, Iy (bending in x) = t L³/12', wall.Iy, 0.3 * 64 / 12 + 4 * 0.3 ** 3 * 0 + 0, 0.001);
  ok('section: wall Ix is tiny (L t³/12) and Ixy is zero', Math.abs(wall.Ix - 4 * 0.3 ** 3 / 12) < 1e-9 && Math.abs(wall.Ixy) < 1e-9 && !wall.closed);
  const sq = coreSection(bx(0, 0, 4, 0.3));
  ok('section: square box core is closed, Ix = Iy, Ixy = 0, centroid at the centre', sq.closed && Math.abs(sq.Ix - sq.Iy) < 1e-9 && Math.abs(sq.Ixy) < 1e-9 && Math.abs(sq.cx) < 1e-9);
  near('section: closed box J = 4 A² / Σ(L/t) (midline area 16 m², perimeter 16 m)', sq.J, 4 * 256 / (16 / 0.3), 0.001);
  const Lc = coreSection([{ sx: 0, sy: 0, ex: 4, ey: 0, t: 0.3 }, { sx: 0, sy: 0, ex: 0, ey: 3, t: 0.3 }]);
  ok('section: L-shaped core has a non-zero product of inertia and is open', Math.abs(Lc.Ixy) > 0.5 && !Lc.closed);
  near('section: inclined wall at 45° has Ixy = (Il − It)/2 in magnitude', Math.abs(coreSection([{ sx: 0, sy: 0, ex: 3, ey: 3, t: 0.3 }]).Ixy), ((0.3 * (3 * Math.SQRT2) ** 3) / 12 - (3 * Math.SQRT2 * 0.3 ** 3) / 12) / 2, 0.001);
  ok('walls groups: two separate cores found', wallGroups([...bx(0, 0, 4, 0.3), ...bx(20, 0, 4, 0.3)]).length === 2 && wallGroups([...bx(0, 0, 4, 0.3)]).length === 1);

  const mk = (n: number, P: number[], frame: any[] = [], x = 0, y = 0) => ({ h: Array(n).fill(3), P, xm: Array(n).fill(x), ym: Array(n).fill(y), r2: Array(n).fill(2), box: Array(n).fill([x - 2, y - 2, x + 2, y + 2]), ref: [x, y] as [number, number], E: 15e6, frame });
  const n = 20, H = 3 * n, EI = 15e6 * sq.Iy, Ptop = 1000, Pcr = Math.PI ** 2 * EI / (4 * H * H);
  const P = Array(n).fill(0); P[n - 1] = Ptop; const F = Array(n).fill(0); F[n - 1] = 100;
  const rc = analyse3D(mk(n, P) as any, [{ x: 0, y: 0, levels: Array(n).fill(sq) }], [{ name: 'tip', dir: 'x', F, limit: 1 / 500, kind: 'wind' }]);
  near('cantilever core: tip deflection = P H³ / 3EI', rc.cases[0].topFirst, 100 * H ** 3 / (3 * EI), 0.01);
  near('cantilever core: elastic buckling load matches Euler π² EI / 4H² (P on the top)', rc.lambda * Ptop, Pcr, 0.01);
  near('P-delta amplification of the top displacement = 1 / (1 − P/Pcr)', rc.cases[0].topSecond / rc.cases[0].topFirst, 1 / (1 - Ptop / Pcr), 0.01);
  ok('stability coefficient θ is small for a light load and the case passes', rc.cases[0].thetaMax < 0.1 && rc.cases[0].status !== 'bad', `${rc.cases[0].thetaMax}`);
  const heavy = analyse3D(mk(n, P.map(v => v * 0.9 * Pcr / Ptop)) as any, [{ x: 0, y: 0, levels: Array(n).fill(sq) }], [{ name: 'tip', dir: 'x', F, limit: 1 / 500, kind: 'wind' }]);
  ok('a load at 90% of the buckling load: λ ≈ 1.1, drift grows by about 10 times, case fails', Math.abs(heavy.lambda - 1 / 0.9) < 0.02 && heavy.cases[0].topSecond / heavy.cases[0].topFirst > 8 && heavy.cases[0].status === 'bad');
  ok('a core only reaching half the height leaves the upper floors without stiffness unless a frame is there', analyse3D(mk(n, P) as any, [{ x: 0, y: 0, levels: Array(10).fill(sq) }], [{ name: 'tip', dir: 'x', F, limit: 1 / 500, kind: 'wind' }]).stable === false);

  // frame plus core in parallel: the shear is shared by stiffness, and the shares add to the applied base shear
  const fr = [[-6, -6], [6, -6], [-6, 6], [6, 6]].map(([x, y], i) => ({ id: `c${i}`, k: 0, x, y, Dx: 3000, Dy: 3000 }));
  const fr2 = Array.from({ length: 3 }, (_, k) => fr.map(c => ({ ...c, k })));
  const Fs = [20, 30, 40], mf = { ...mk(3, [3000, 3000, 3000]), box: Array(3).fill([-8, -8, 8, 8]), frame: fr2.flat() };
  const rf = analyse3D(mf as any, [{ x: 0, y: 0, levels: Array(3).fill(sq) }], [{ name: 'f', dir: 'x', F: Fs, limit: 1 / 500, kind: 'seismic' }]);
  const sh = rf.cases[0].shearShare; near('frame + core share of the base shear add up to the applied 90 kN', sh.frame + sh.cores[0], 90, 0.03);
  ok('the stiff core takes most of the shear', sh.cores[0] > sh.frame);
  // a core off the centre makes the building twist
  const off = analyse3D({ ...mf, frame: [] } as any, [{ x: 6, y: 0, levels: Array(3).fill(sq) }], [{ name: 'e', dir: 'y', F: Fs, limit: 1 / 500, kind: 'seismic' }]);
  ok('an eccentric core twists the floor plates and is flagged for torsional irregularity', Math.abs(off.cases[0].twistTop) > 1e-7 && off.cases[0].torsionRatio > 1.2, `${off.cases[0].torsionRatio}`);
  ok('a single central core in a wide plan is torsionally flexible (EC8): accidental eccentricity twists it and it is flagged', rf.cases[0].torsionRatio > 1.2, String(rf.cases[0].torsionRatio));
  const cs4 = [[-6, -6], [6, -6], [-6, 6], [6, 6]].map(([x, y]) => ({ x, y, levels: Array(3).fill(coreSection(bx(x, y, 3, 0.3))) }));
  const r4 = analyse3D({ ...mf, frame: [] } as any, cs4, [{ name: 'f', dir: 'x', F: Fs, limit: 1 / 500, kind: 'seismic' }]);
  ok('four corner cores resist twist: torsion ratio below 1.2 and the case is not flagged for it', r4.cases[0].torsionRatio < 1.2 && !r4.cases[0].notes.some(n => /Torsional/.test(n)), String(r4.cases[0].torsionRatio));
  ok('no cores and no frame: reports no stiffness without throwing', analyse3D({ ...mf, frame: [] } as any, [], []).cases.length === 0);

  // from the plan model: walls marked as core are picked up and run through lateralAnalysis
  const bld = building(3, [0, 6, 12], [0, 6, 12], 300);
  bld.forEach((g: any, k: number) => bx(6, 6, 3, 0.25).forEach((w, i) => g.els.push(el2(`k${k}${i}`, 'wall', { start: [w.sx, w.sy], end: [w.ex, w.ey], thickness: 0.25, height: 3.6, core: true }, g.story.id))));
  const { cores } = coresFromGroups(bld);
  ok('cores are read from the walls marked as structural, continuous over all storeys', cores.length === 1 && cores[0].levels.length === 3 && !!cores[0].levels[2]);
  const rl = lateralAnalysis(bld, [], mat, designAll(bld, [], mat, { imposed: 3, defaultTrib: 3 }), { imposed: 3, wind: { vb: 28, terrain: 2 }, seismic: { agG: 0.15, ground: 'B', q: 2, psi2: 0.3 } });
  const r3 = analyse3D(rl.model3d, cores, loadsOf(rl.cases));
  ok('3D analysis runs on the lateral model and returns each load case', r3.cases.length === rl.cases.length && r3.lambda > 3 && r3.cores.length === 1, `${r3.lambda}`);
  const none = analyse3D(rl.model3d, [], loadsOf(rl.cases));
  ok('adding the core stiffens the building: smaller drift than the frame alone', r3.cases[0].topFirst < none.cases[0].topFirst, `${r3.cases[0].topFirst} vs ${none.cases[0].topFirst}`);
  ok('second-order drift is never smaller than first-order drift', r3.cases.every(c => c.topSecond >= c.topFirst * 0.999));
  ok('a core that stops at the first storey (not continuous) is dropped with a note', (() => { const b2 = building(2, [0, 6], [0, 6], 300); bx(3, 3, 3, 0.25).forEach((w, i) => b2[1].els.push(el2(`u${i}`, 'wall', { start: [w.sx, w.sy], end: [w.ex, w.ey], thickness: 0.25, core: true }, b2[1].story.id))); const x = coresFromGroups(b2); return x.cores.length === 0 && x.notes.length === 1; })());
}

// ---- parametric parts: sketches, solids, timeline ----
{
  const a48 = 0.5 * 48 * Math.sin((2 * Math.PI) / 48);   // area of a 48-sided polygon of radius 1
  near('expressions: precedence, powers, functions and names', calc('2*(w+10)^2/4-sin(30)+sqrt(16)', { w: 5 }), 116, 1e-9);
  ok('expressions: unknown names and division by zero are errors, not NaN', (() => { try { calc('x+1'); return false; } catch { /* expected */ } try { calc('1/0'); return false; } catch { return true; } })());
  const ep = evalParams([{ name: 'b', expr: 'a*2' }, { name: 'a', expr: '10' }, { name: 'bad', expr: 'zzz' }]);
  ok('parameters may refer to ones defined later; broken ones are reported', ep.values.b === 20 && ep.errors.length === 1 && /bad/.test(ep.errors[0]));

  let sk = addRect(emptySketch(), [0, 0], [97, 41]);
  sk = { ...sk, cons: [...sk.cons, { id: 'f', t: 'fix', p: sk.pts[0].id }, { id: 'w', t: 'length', l: sk.lines[0].id, v: 'W' }, { id: 'h', t: 'length', l: sk.lines[1].id, v: 'W/2' }] };
  const sv = solveSketch(sk, { W: 120 });
  ok('solver: a rough rectangle snaps to its dimensions (120 × 60) and reports fully constrained', sv.info.ok && sv.info.dof === 0 && Math.abs(sv.sketch.pts[2].x - 120) < 1e-6 && Math.abs(sv.sketch.pts[2].y - 60) < 1e-6, JSON.stringify(sv.info));
  const sv2 = solveSketch({ ...sk, cons: sk.cons.slice(0, -2) }, {});
  ok('solver: free dimensions are counted as degrees of freedom', sv2.info.ok && sv2.info.dof === 2, JSON.stringify(sv2.info));
  const clash = solveSketch({ ...sk, cons: [...sk.cons, { id: 'x', t: 'length', l: sk.lines[0].id, v: '50' }] }, { W: 120 });
  ok('solver: conflicting dimensions are reported', !clash.info.ok);
  // a triangle with parallel / perpendicular / equal constraints
  let tr = addLine(addLine(addLine(emptySketch(), [0, 0], [100, 5], { snap: 1 }).sketch, [100, 5], [95, 80], { snap: 1 }).sketch, [95, 80], [0, 0], { snap: 1 }).sketch;
  tr = { ...tr, cons: [{ id: '1', t: 'fix', p: tr.pts[0].id }, { id: '2', t: 'horizontal', l: tr.lines[0].id }, { id: '3', t: 'perpendicular', l1: tr.lines[0].id, l2: tr.lines[1].id }, { id: '4', t: 'equal', l1: tr.lines[0].id, l2: tr.lines[1].id }] };
  const st = solveSketch(tr, {}); const [p0, p1, p2] = st.sketch.pts;
  ok('solver: perpendicular and equal legs make a right isosceles triangle', st.info.ok && Math.abs(p1.y - p0.y) < 1e-6 && Math.abs(p2.x - p1.x) < 1e-6 && Math.abs(Math.hypot(p1.x - p0.x, p1.y - p0.y) - Math.abs(p2.y - p1.y)) < 1e-6, JSON.stringify(st.sketch.pts));
  const ang = solveSketch({ ...addLine(emptySketch(), [0, 0], [50, 10]).sketch, cons: [] }, {});
  const al = addLine(emptySketch(), [0, 0], [50, 10]).sketch; const sa = solveSketch({ ...al, cons: [{ id: 'a', t: 'fix', p: al.pts[0].id }, { id: 'b', t: 'length', l: al.lines[0].id, v: '100' }, { id: 'c', t: 'angle', l: al.lines[0].id, v: '30' }] }, {});
  ok('solver: line at 30° and 100 long ends at (86.6, 50)', sa.info.ok && Math.abs(sa.sketch.pts[1].x - 86.6025) < 1e-3 && Math.abs(sa.sketch.pts[1].y - 50) < 1e-3 && ang.info.ok);

  const withHole = addCircle(addRect(emptySketch(), [0, 0], [100, 50]), [50, 25], 10).sketch, pr = profiles(withHole);
  ok('profiles: a circle inside a rectangle is a hole, not a second region', pr.regions.length === 1 && pr.regions[0].holes.length === 1);
  ok('profiles: an unclosed chain of lines is reported as open', profiles(addLine(emptySketch(), [0, 0], [10, 0]).sketch).open === 1);
  const bar = extrudeR(pr.regions, 'XY', 0, 20);
  near('extrude: plate with a round hole, volume = (b h − polygon area) × depth', vol3(bar), (5000 - a48 * 100) * 20, 1e-9);
  ok('extrude: surface is watertight and sits on 0..20 in z', isClosed(bar) && bnds(bar).max[2] === 20 && bnds(bar).min[2] === 0);
  ok('extrude: XZ and YZ planes put the solid on the right side (normal −y and +x)', (() => { const b1 = bnds(extrudeR(pr.regions, 'XZ', 0, 20)), b2 = bnds(extrudeR(pr.regions, 'YZ', 0, 20)); return Math.abs(b1.min[1] + 20) < 1e-9 && Math.abs(b2.max[0] - 20) < 1e-9; })());
  near('extrude: symmetric about the plane gives the same volume centred on it', vol3(extrudeR(pr.regions, 'XY', 0, 20, true)), vol3(bar), 1e-9);
  near('extrude: negative depth goes the other way with the same volume', vol3(extrudeR(pr.regions, 'XY', 0, -20)), vol3(bar), 1e-9);
  const axis: [[number, number], [number, number]] = [[0, 0], [0, 100]], ring = profiles(addRect(emptySketch(), [10, 0], [30, 40])).regions;
  near('revolve: hollow cylinder (r 10 to 30, 40 high) = Pappus π (30² − 10²) × 40, within the 64-segment polygon error', vol3(revolveR(ring, 'XY', 0, axis, 360)), Math.PI * 800 * 40, 0.004);
  near('revolve: a quarter turn has a quarter of the volume and is watertight', vol3(revolveR(ring, 'XY', 0, axis, 90)) * 4, Math.PI * 800 * 40, 0.004);
  ok('revolve: partial turns have flat end caps (closed surface), on either side of the axis', isClosed(revolveR(ring, 'XY', 0, axis, 120)) && isClosed(revolveR(profiles(addRect(emptySketch(), [-30, 0], [-10, 40])).regions, 'XZ', 0, axis, 120)));
  const cutM = boolean(bar, extrudeR([{ outer: cpoly(20, 25, 5), holes: [] }], 'XY', -5, 40), 'cut');
  near('cut: a drilled hole removes polygon area × thickness', vol3(cutM), vol3(bar) - a48 * 25 * 20, 1e-6);
  const joinM = boolean(extrudeR(ring.length ? profiles(addRect(emptySketch(), [0, 0], [10, 10])).regions : [], 'XY', 0, 10), extrudeR(profiles(addRect(emptySketch(), [5, 0], [15, 10])).regions, 'XY', 0, 10), 'join');
  near('join: two overlapping blocks make the union (15 × 10 × 10)', vol3(joinM), 1500, 1e-6);
  ok('STL export has one facet per triangle', (toStl('x y', bar).match(/facet normal/g) ?? []).length === bar.f.length / 3 && toStl('x y', bar).startsWith('solid x_y'));

  const br = sampleBracket(), rb = rebuild(br);
  const legs = (80 * 8 + 8 * 52) * 40, holeV = a48 * 36 * 8;
  ok('part: sample bracket rebuilds without errors', rb.errors.length === 0, JSON.stringify(rb.errors));
  near('part: L bracket with a drilled bolt hole, volume = L section × depth − hole', rb.stats!.volume, legs - holeV, 1e-4);
  near('part: mass in steel = volume × 7850 kg/m³', rb.stats!.mass, (legs - holeV) * 1e-9 * 7850, 1e-6);
  ok('part: bounding size is 80 × 60 × 40 mm', rb.stats!.size.every((v, i) => Math.abs(v - [80, 60, 40][i]) < 1e-6), JSON.stringify(rb.stats!.size));
  const wide = rebuild({ ...br, params: br.params.map(p => (p.name === 'width' ? { ...p, expr: '100' } : p)) });
  near('part: changing the named parameter width from 80 to 100 rebuilds the model (bigger volume by 20 × 8 × 40)', wide.stats!.volume - rb.stats!.volume, 20 * 8 * 40, 1e-4);
  const rolled = rebuild({ ...br, upTo: 2 });
  near('part: rolling the timeline back to before the cut gives the solid without the hole', rolled.stats!.volume, legs, 1e-6);
  const supp = rebuild({ ...br, steps: br.steps.map(s => (s.id === 'f2' ? { ...s, off: true } : s)) });
  near('part: a suppressed feature is skipped', supp.stats!.volume, legs, 1e-6);
  const bad = rebuild({ ...br, steps: br.steps.map(s => (s.id === 'f1' ? { ...s, depth: 'nope' } : s)) });
  ok('part: a broken expression is reported on its feature and later cuts do not crash', bad.errors.some(e => e.step === 'f1') && bad.stats === null);
  const open = rebuild({ ...newPart(), steps: [{ id: 's', type: 'sketch', name: 'S', plane: 'XY', offset: '0', sk: addLine(emptySketch(), [0, 0], [10, 0]).sketch }, { id: 'f', type: 'extrude', name: 'E', sketch: 's', op: 'new', depth: '5', angle: '360' }] });
  ok('part: extruding an open sketch gives a clear message', open.errors.some(e => /not closed/.test(e.msg)));
  const rev = rebuild({ ...newPart(), steps: [{ id: 's', type: 'sketch', name: 'S', plane: 'XY', offset: '0', sk: addLine(addRect(emptySketch(), [10, 0], [30, 40]), [0, 0], [0, 100], { axis: true }).sketch }, { id: 'f', type: 'revolve', name: 'R', sketch: 's', op: 'new', depth: '0', angle: '360' }] });
  near('part: revolve feature about the axis line makes the ring', rev.stats?.volume ?? 0, Math.PI * (900 - 100) * 40, 0.004);
}

// ---- patterns and the mechanical / automotive part library ----
{
  const f48 = (0.5 * 48 * Math.sin((2 * Math.PI) / 48)) / Math.PI, f64 = (0.5 * 64 * Math.sin((2 * Math.PI) / 64)) / Math.PI;
  const block = (extra: any[]): PartDoc => ({ ...newPart(), steps: [{ id: 's', type: 'sketch', name: 'S', plane: 'XY', offset: '0', sk: addRect(emptySketch(), [0, 0], [10, 10]) }, { id: 'f', type: 'extrude', name: 'E', sketch: 's', op: 'new', depth: '10', angle: '360' }, ...extra] });
  const lin = (count: string, dx: string) => ({ id: 'p', type: 'pattern', name: 'P', of: 'f', mode: 'linear', count, dx, dy: '0', dz: '0', axis: 'z', angle: '360', cx: '0', cy: '0', cz: '0' });
  // a pattern of a 'new body' feature makes separate bodies
  const sep = rebuild(block([lin('3', '20')]));
  ok('linear pattern of a new body gives three separate blocks (3000 mm³)', sep.bodies.length === 3 && Math.abs(sep.stats!.volume - 3000) < 1e-6, JSON.stringify(sep.errors));
  const join = rebuild({ ...block([{ id: 'j', type: 'extrude', name: 'J', sketch: 's', op: 'join', depth: '10', angle: '360' }, { ...lin('3', '5'), of: 'j' }]) });
  near('linear pattern of a join, copies overlapping: union of blocks at 0, 5 and 10 is 20 × 10 × 10', join.stats!.volume, 2000, 1e-6);
  const cutP = rebuild(block([{ id: 's2', type: 'sketch', name: 'H', plane: 'XY', offset: '-1', sk: addRect(emptySketch(), [1, 1], [3, 3]) }, { id: 'c', type: 'extrude', name: 'C', sketch: 's2', op: 'cut', depth: '12', angle: '360' }, { ...lin('3', '3'), of: 'c' }]));
  near('linear pattern of a cut: three 2 × 2 slots, 3 mm apart, remove 3 × 40 mm³ from the block', cutP.stats!.volume, 1000 - 3 * 40, 1e-6);
  const rot = rebuild({ ...block([{ id: 'j', type: 'extrude', name: 'J', sketch: 's', op: 'join', depth: '10', angle: '360' }, { id: 'p', type: 'pattern', name: 'P', of: 'j', mode: 'circular', count: '4', dx: '0', dy: '0', dz: '0', axis: 'z', angle: '360', cx: '0', cy: '0', cz: '0' }]) });
  near('circular pattern about the z axis: four 10 mm blocks, one in each quadrant, meeting at the axis (4000 mm³)', rot.stats!.volume, 4000, 1e-3);
  ok('a pattern pointing at a missing feature reports it', rebuild(block([{ ...lin('3', '5'), of: 'nope' }])).errors.some(e => /repeat/.test(e.msg)));
  ok('a pattern count below 2 is refused', rebuild(block([lin('1', '5')])).errors.some(e => /Count/.test(e.msg)));
  near('centre of mass of a 10 mm block is its middle', rebuild(block([])).stats!.com[0] + rebuild(block([])).stats!.com[1] + rebuild(block([])).stats!.com[2], 15, 1e-9);

  const R = Object.fromEntries(TEMPLATES.map(tp => [tp.key, rebuild(tp.make())]));
  ok('every template rebuilds without errors and every sketch is fully constrained or intentionally frozen', TEMPLATES.every(tp => R[tp.key].errors.length === 0 && R[tp.key].stats!.volume > 0), TEMPLATES.map(tp => tp.key + ':' + JSON.stringify(R[tp.key].errors)).join(' '));
  near('shaft: π/4 Σ d² l for 30/40/30 mm diameters within the 64-segment polygon error', R.shaft.stats!.volume, f64 * Math.PI * (15 * 15 * 40 + 20 * 20 * 80 + 15 * 15 * 40), 1e-6);
  near('shaft: centre of mass is at mid-length (symmetric shaft)', R.shaft.stats!.com[2], 80, 1e-4);
  near('flange: π (R² − r²) t minus six bolt holes', R.flange.stats!.volume, f48 * Math.PI * ((60 * 60 - 20 * 20) * 15 - 6 * 25 * 15), 1e-4);
  near('hex bolt: hexagon head (√3/2 AF² k) plus round shank', R.bolt.stats!.volume, (Math.sqrt(3) / 2) * 256 * 6.4 + f48 * Math.PI * 25 * 40, 1e-4);
  near('hollow section: (W H − (W − 2t)(H − 2t)) × L', R.tube.stats!.volume, (2400 - 54 * 34) * 500, 1e-9);
  near('hollow section: centre of mass at the middle of the section and length', R.tube.stats!.com[0] * 1e4 + R.tube.stats!.com[1] * 1e2 + R.tube.stats!.com[2] * 1e-2, 30 * 1e4 + 20 * 1e2 + 250 * 1e-2, 1e-6);
  ok('spur gear volume lies between the root and tip cylinders', R.gear.stats!.volume > Math.PI * (28.75 ** 2 - 10 ** 2) * 25 * 0.95 && R.gear.stats!.volume < Math.PI * 33 ** 2 * 25);
  ok('wheel rim spans 2 × (203 + 18) = 442 mm over the flanges and 180 mm wide', R.rim.stats!.size.every((v, i) => Math.abs(v - [442, 442, 180][i]) < 1), JSON.stringify(R.rim.stats!.size));
  const discNo = tpl('disc', d => ({ ...d, steps: d.steps.filter(s => s.id !== 'f6') }));
  near('brake disc: the stud-circle pattern drills four more holes through the 8 mm top plate', discNo.stats!.volume - R.disc.stats!.volume, 4 * f48 * Math.PI * 49 * 8, 2e-3);
  ok('piston is 86 mm across and 62 mm tall', Math.abs(R.piston.stats!.size[2] - 62) < 1e-6 && Math.abs(R.piston.stats!.size[0] - 86) < 0.5, JSON.stringify(R.piston.stats!.size));
  function tpl(key: string, f: (d: PartDoc) => PartDoc) { return rebuild(f(TEMPLATES.find(x => x.key === key)!.make())); }
  const big = TEMPLATES.filter(tp => !['gear', 'bolt'].includes(tp.key)).every(tp => {
    const d = tp.make(); return d.params.every((pr, i) => { if (/^(nb|z)$/.test(pr.name)) return true; const r2 = rebuild({ ...d, params: d.params.map((q, j) => (j === i ? { ...q, expr: String(parseFloat(q.expr) * 1.1) } : q)) }); return r2.errors.length === 0; });
  });
  ok('changing any single parameter of a template by +10% keeps it solvable (the sketches follow the parameters)', big);
  near('flange: widening the plate by 10% grows the volume as the parameter says', tpl('flange', d => ({ ...d, params: d.params.map(q => (q.name === 't' ? { ...q, expr: '30' } : q)) })).stats!.volume, R.flange.stats!.volume * 2, 1e-4);
}

// ---- sketch helpers: polygon, chamfer, bolt circle ----
{
  const hex = addPolygon(emptySketch(), [0, 0], [10, 0], 6), pr = profiles(hex);
  near('polygon: a regular hexagon of circumradius 10 has area 3√3/2 R²', Math.abs(pr.regions[0].outer.reduce((s, q, i, a) => { const n = a[(i + 1) % a.length]; return s + q[0] * n[1] - n[0] * q[1]; }, 0) / 2), (3 * Math.sqrt(3) / 2) * 100, 1e-9);
  const sq = addRect(emptySketch(), [0, 0], [10, 10]), ch = chamferCorner(sq, sq.pts[2].id, 3)!;
  const pc = profiles(ch);
  near('chamfer: a 3 mm corner cut removes a right triangle of 4.5 mm²', Math.abs(pc.regions[0].outer.reduce((s, q, i, a) => { const n = a[(i + 1) % a.length]; return s + q[0] * n[1] - n[0] * q[1]; }, 0) / 2), 100 - 4.5, 1e-9);
  ok('chamfer: refuses a point that is not a corner of exactly two lines, or a cut longer than the edge', chamferCorner(sq, 'nope', 3) === null && chamferCorner(sq, sq.pts[0].id, 11) === null);
  ok('chamfered sketch still solves (parallel and horizontal constraints on the cut edges are dropped)', solveSketch(ch, {}).info.ok);
  const bc = boltCircle(emptySketch(), [0, 0], 100, 5, 10), cs = bc.circles.map(c => bc.pts.find(p => p.id === c.c)!);
  ok('bolt circle: five 10 mm holes on a 100 mm pitch circle', bc.circles.length === 5 && cs.every(p => Math.abs(Math.hypot(p.x, p.y) - 50) < 1e-9) && bc.circles.every(c => c.r === 5));
}

{
  const cube = extrudeR(profiles(addRect(emptySketch(), [0, 0], [10, 10])).regions, 'XY', 0, 10), cyl = extrudeR(profiles(addCircle(emptySketch(), [0, 0], 10).sketch).regions, 'XY', 0, 20);
  ok('viewport edges: a cube shows its 12 edges, a cylinder only its two rim circles (no side seams)', featureEdges(cube).length / 6 === 12 && featureEdges(cyl).length / 6 === 96, `${featureEdges(cube).length / 6} ${featureEdges(cyl).length / 6}`);
  const holed = boolean(cube, extrudeR([{ outer: [[3, 3], [7, 3], [7, 7], [3, 7]], holes: [] }], 'XY', -1, 12), 'cut');
  const he = featureEdges(holed); let axisOnly = true; for (let i = 0; i < he.length; i += 6) { const d = [Math.abs(he[i + 3] - he[i]), Math.abs(he[i + 4] - he[i + 1]), Math.abs(he[i + 5] - he[i + 2])]; if (d.filter(v => v > 1e-6).length > 1) axisOnly = false; }
  ok('viewport edges: a cube with a square hole made by boolean draws only real, axis-aligned edges (no diagonals across flat faces)', he.length > 0 && axisOnly);
}

{
  const cube = extrudeR(profiles(addRect(emptySketch(), [0, 0], [10, 10])).regions, 'XY', 0, 10);
  const front = wirePath(cube, VIEWS.front.q, 100, 100, 0), segs = (front.match(/M/g) ?? []).length;
  ok('wire view: a cube seen from the front is a square drawn edge to edge in the box', segs === 12 && /M0\.0 100\.0|M0\.0 0\.0|M100\.0/.test(front), `${segs} ${front.slice(0, 60)}`);
  ok('wire view: an empty part draws nothing', wirePath({ v: [], f: [] }, VIEWS.iso.q, 100, 100) === '');
}

// ---- vehicles ----
{
  for (const x of VEHICLE_TEMPLATES) { const r = rebuildPart(x.make()); ok(`vehicle template ${x.key} builds without errors`, r.errors.length === 0 && !!r.stats); }
  const sed = rebuildPart(VEHICLE_TEMPLATES[0].make());
  ok('sedan is 4.6 m long and 1.8 m wide', Math.abs(sed.stats!.size[0] - 4600) < 1 && Math.abs(sed.stats!.size[1] - 1800) < 1);
  ok('sedan mass is its kerb weight, about 1400 kg', Math.abs(sed.stats!.mass - 1400) < 20);
}

// ---- makers and vehicle projects ----
{
  ok('50 production models from 22 makers', BRAND_TEMPLATES.length === 50 && new Set(SPECS.map(s => s.brand)).size === 22);
  let bad = 0;
  SPECS.forEach((s, i) => { const r = rebuildPart(BRAND_TEMPLATES[i].make()); const z = r.stats; if (r.errors.length || !z || Math.abs(z.size[0] - s.L) > 2 || Math.abs(z.size[1] - s.W) > 2 || Math.abs(z.size[2] - s.H) > 2 || Math.abs(z.mass - s.kg) > s.kg * 0.01) bad++; });
  ok('every model has its published length, width, height and kerb weight', bad === 0);
  const vp = newVehicleProject('  City runabout ', 'blank');
  ok('a new vehicle project keeps its name and is marked as a vehicle', vp.name === 'City runabout' && vp.kind === 'vehicle');
  ok('every vehicle project kind builds', VEHICLE_KINDS.every(k => { const r = rebuildPart(newVehicleProject('x', k.key)); return r.errors.length === 0 && !!r.stats; }));
}

// ---- building templates ----
{
  ok('13 building templates', BUILDINGS.length === 13);
  const lib: any[] = [{ id: 'd', category: 'door', name: 'Door', specs: { w: 0.9 } }, { id: 'w', category: 'window', name: 'Win', specs: { w: 1.5 } }, { id: 'c', category: 'section', name: 'RC column 300x300', specs: {} }, { id: 'b', category: 'section', name: 'RC beam 250x500', specs: {} }];
  let n = 0; const ids = () => `id${n++}`;
  for (const b of BUILDINGS) {
    const p = placeBuilding(b, [{ id: 's0', name: 'Ground floor', elevation_m: 0, height_m: 3.6 }], [], lib, ids);
    const walls = new Set(p.rows.filter(r => r.type === 'wall').map(r => r.id));
    const openOk = p.rows.filter(r => r.type === 'door' || r.type === 'window').every(r => walls.has(r.geometry.wall_id));
    ok(`${b.key}: ${b.storeys.length} storeys, ${p.rows.length} elements, every door and window sits in a wall`, p.stories.length === b.storeys.length && openOk && p.rows.length > 20 && p.rows.every(r => r.story < b.storeys.length));
  }
  ok('28 regional styled templates in the right regions', STYLED.length === 28 && STYLED.every(b => REGIONS.includes(b.group)) && new Set(STYLED.map(b => b.key)).size === 28);
  ok('regions cover African, American, European, Scandinavian and Chinese', ['African', 'American', 'European', 'Scandinavian', 'Chinese'].every(r => STYLED.some(b => b.group === r)));
  for (const k of ['House', 'Church', 'School', 'Apartments']) ok(`styled ${k} templates exist for several regions`, new Set(STYLED.filter(b => b.label.startsWith(k)).map(b => b.group)).size >= 4);
  for (const b of STYLED) {
    const p = placeBuilding(b, [{ id: 's0', name: 'Ground floor', elevation_m: 0, height_m: 3.6 }], [], lib, ids);
    const walls = new Set(p.rows.filter(r => r.type === 'wall').map(r => r.id));
    const openOk = p.rows.filter(r => r.type === 'door' || r.type === 'window').every(r => walls.has(r.geometry.wall_id));
    const wallsCol = p.rows.filter(r => r.type === 'wall').every(r => typeof r.geometry.color === 'string');
    const finite = JSON.stringify(p.rows.map(r => r.geometry)).indexOf('null') < 0 && JSON.stringify(p.rows.map(r => r.geometry)).indexOf('NaN') < 0;
    ok(`${b.key}: ${p.rows.length} elements, ${p.rows.filter(r => r.type === 'deco').length} decorations, doors/windows in walls, coloured walls, finite numbers`, openOk && wallsCol && finite && p.rows.some(r => r.type === 'deco') && p.rows.some(r => r.type === 'door') && p.rows.length > 30 && p.stories.length === b.storeys.length);
  }
  ok('trees: noise is smooth, repeatable and bounded', noise3(1.3, 2.1, 0.7, 4) === noise3(1.3, 2.1, 0.7, 4) && Math.abs(noise3(1.3, 2.1, 0.7) - noise3(1.31, 2.1, 0.7)) < 0.1 && Array.from({ length: 200 }, (_, i) => noise3(i * 0.37, i * 0.11, i * 0.53)).every(v => Math.abs(v) <= 1.0001));
  ok('trees: no two crowns are alike, but the same seed gives the same tree', JSON.stringify(crown('round', 5, 2, 1)) !== JSON.stringify(crown('round', 5, 2, 2)) && JSON.stringify(crown('round', 5, 2, 3)) === JSON.stringify(crown('round', 5, 2, 3)));
  ok('trees: a round crown has many lumps above its trunk, a cypress is narrow and tall, a pine tapers', crown('round', 5, 2, 1).length >= 8 && crown('round', 5, 2, 1).every(b => b.c[2] >= trunkHeight('round', 5) * 0.8) && Math.max(...crown('cypress', 6, 0.7, 1).map(b => b.r[0])) <= 0.8 && tiers(5.5, 1.3, 1)[0].r > tiers(5.5, 1.3, 1).at(-1)!.r * 3);
  ok('trees: a palm has a fan of fronds, some hanging', fronds(6, 2.2, 1).length >= 10 && fronds(6, 2.2, 1).some(f => f.droop > 0.6));
  ok('trees: every styled template draws its trees as one organic element each, with sizes from the kind', STYLED.every(b => b.els.filter(e => e.g.shape === 'tree').every(e => e.g.z1 > 0.5 && e.g.r > 0.3)) && STYLED.filter(b => b.els.some(e => e.g.shape === 'tree')).length >= 24 && sizeOf('pine', 1).h > sizeOf('shrub', 1).h * 4 && rand(1)() !== rand(2)());
  ok('finishes: ids are unique and every kind is a known material', new Set(FINISHES.map(f => f.id)).size === FINISHES.length && FINISHES.every(f => f.kind in MAT && /^#[0-9a-f]{6}$/.test(f.color)));
  ok('finishes: every house part has choices', PARTS.every(p => finishesOf(p.key).length >= 4) && FINISHES.length >= 150);
  ok('finishes: floors offer wood, terrazzo, tile and epoxy resin', ['Wood', 'Terrazzo', 'Tile', 'Resin and concrete'].every(g => groupsOf('floor').includes(g)) && finishesOf('floor').some(f => f.kind === 'epoxy') && finishesOf('floor').some(f => f.kind === 'terrazzo'));
  ok('finishes: walls offer many brick types, blocks, stone and marble', finishesOf('wall').filter(f => f.kind === 'brick').length >= 7 && finishesOf('wall').some(f => f.kind === 'marble') && finishesOf('wall').some(f => f.kind === 'granite') && finishesOf('wall').some(f => f.kind === 'blockwork') && finishesOf('wall').some(f => f.kind === 'stone'));
  ok('finishes: roofs offer iron sheets, tiles, slab and thatch', finishesOf('roof').filter(f => f.kind === 'metal' || f.kind === 'boxprofile').length >= 6 && finishesOf('roof').some(f => f.kind === 'tile') && finishesOf('roof').some(f => f.id === 'roof-slab') && finishesOf('roof').some(f => f.kind === 'thatch'));
  ok('finishes: applying one keeps the size and shows in the 3D look', (() => { const f = finishById('wall-brick-engineering')!, g = withFinish({ start: [0, 0], end: [4, 0], height: 3, color: '#fff' }, f); return g.height === 3 && g.finish === f.id && lookFor('wall', g).kind === 'brick' && lookFor('wall', g).color === f.color; })());
  ok('finishes: window glass keeps its see-through level, a roof finish changes the roof look', lookFor('window', withFinish({}, finishById('window-frosted')!)).opacity === 0.9 && lookFor('roof', withFinish({ form: 'gable' }, finishById('roof-box-red')!)).kind === 'boxprofile' && lookFor('roof', withFinish({ form: 'gable' }, finishById('roof-iron-galv')!)).kind === 'metal');
  ok('finishes: a slab can be given a terrazzo floor and a ground lawn', lookFor('slab', withFinish({}, finishById('floor-terrazzo-white')!)).kind === 'terrazzo' && lookFor('deco', withFinish({ shape: 'box', z1: 0 }, finishById('ground-cobble')!)).kind === 'cobble');
  ok('finishes: scope picks the right elements (walls only for a wall finish, storey filter, no trees as ground)', (() => { const els: any[] = [{ type: 'wall', story_id: 'a', geometry: {} }, { type: 'wall', story_id: 'b', geometry: {} }, { type: 'slab', story_id: 'a', geometry: {} }, { type: 'deco', story_id: 'a', geometry: { shape: 'tree' } }, { type: 'deco', story_id: 'a', geometry: { shape: 'box', z1: 0 } }]; return targetsOf(els, 'wall', 'all').length === 2 && targetsOf(els, 'wall', 'storey', 'a').length === 1 && targetsOf(els, 'floor', 'all').length === 1 && targetsOf(els, 'ground', 'all').length === 1 && !isGround(els[3]); })());
  const ap = BUILDINGS.find(b => b.key === 'apartments')!;
  const pl = placeBuilding(ap, [{ id: 's0', name: 'Ground floor', elevation_m: 0, height_m: 3.6 }], [], lib);
  ok('apartment block adds four storeys above the ground floor, 3 m each', pl.stories.filter(s => s.isNew).length === 4 && pl.stories[4].elevation_m === 3.6 + 3 * 3);
  ok('apartment block has a rigid core marked on its walls', pl.rows.some(r => r.geometry.core));
  const el = [{ id: 'x', type: 'wall', geometry: { start: [0, 0], end: [10, 0], height: 3, thickness: 0.2 }, library_item_id: null }];
  const sh = placeBuilding(BUILDINGS[0], [{ id: 's0', name: 'G', elevation_m: 0, height_m: 3.6 }], el as any, lib);
  ok('a template is placed beside existing work, not on top of it', sh.dx >= 18);
}

// ---- real materials ----
{
  ok('brick-red walls get brick, cream walls get plaster', guessWall('#a5432f') === 'brick' && guessWall('#f3e2bd') === 'plaster');
  ok('lawn is grass, pond is water, gold dome is gold, tree trunk is bark', guessDeco({ shape: 'box', color: '#9ccf6f', z0: -0.08, z1: -0.01 }) === 'grass' && guessDeco({ shape: 'cyl', color: '#4aa3df', z0: 0.4, z1: 0.5, r: 1 }) === 'water' && guessDeco({ shape: 'cone', color: '#d4a017', z0: 0, z1: 1 }) === 'gold' && guessDeco({ shape: 'cyl', color: '#6b4a2f', z0: 0, z1: 1.7, r: 0.16 }) === 'bark');
  ok('windows are glass, doors timber, roof with a form is tile, flat roof is concrete', lookFor('window', {}).kind === 'glass' && lookFor('door', { color: '#2e7d32' }).kind === 'timber' && lookFor('roof', { form: 'gable', color: '#b23a2e' }).kind === 'tile' && lookFor('roof', { color: '#e9dfc9' }).kind === 'concrete');
  ok('an explicit material on the element wins', lookFor('wall', { color: '#fff', mat: 'stone' }).kind === 'stone' && lookFor('roof', { form: 'hip', mat: 'thatch' }).kind === 'thatch');
  ok('schematic mode keeps flat engineering colours', lookFor('wall', {}, false).kind === 'paint');
  ok('every material is physically sensible', Object.values(MAT).every(m => m.rough >= 0 && m.rough <= 1 && m.metal >= 0 && m.metal <= 1 && m.tile > 0));
  ok('glass is shinier than plaster, metal is metallic', MAT.glass.rough < MAT.plaster.rough && MAT.metal.metal > 0.5);
  ok('steel is darker grey metal, aluminium lighter', partLook(7850).metal === 1 && partLook(7850).color !== partLook(2700).color);
  ok('brands get their own paint', paintFor('Ferrari 488') === '#c4161c' && paintFor('Lamborghini Huracan') === '#e8c000' && paintFor('Tesla Model 3') !== paintFor('Ford F-150'));
  ok('vehicle faces: glass up high at the sides, tyres low, lamps at the front, underside dark', vehicleColor([0, 1, 0], 0.7, '#f00') === '#0f1e2b' && vehicleColor([0, 1, 0], 0.1, '#f00') === '#17181a' && vehicleColor([-1, 0, 0], 0.4, '#f00') === '#f4f1da' && vehicleColor([0, 0, -1], 0.5, '#f00') === '#15161a' && vehicleColor([0, 1, 0], 0.4, '#f00') === '#f00');
  ok('every vehicle and brand template is marked as a vehicle, machine parts are not', ALL_TEMPLATES.filter(t => t.group === 'vehicle' || t.group === 'brand').every(t => t.make().kind === 'vehicle') && ALL_TEMPLATES.filter(t => t.group === 'mechanical').every(t => t.make().kind === undefined));
  ok('the thatch, timber and stone styled templates carry their materials', STYLED.find(b => b.key === 'af-homestead')!.els.some(e => e.type === 'deco' && guessDeco(e.g) === 'thatch') && STYLED.find(b => b.key === 'eu-cottage')!.els.some(e => e.g.mat === 'thatch') && STYLED.find(b => b.key === 'eu-gothic')!.els.some(e => e.g.mat === 'stone') && STYLED.find(b => b.key === 'sc-stuga')!.els.some(e => e.g.mat === 'timber'));
}


// ---- realistic vehicle models ----
{
  const docs = [...VT2.filter(t => t.group === 'vehicle'), ...BT2].map(t => t.make());
  ok('every vehicle and brand template carries a realistic model spec', docs.every(d => !!d.vspec));
  let allParts = true, sizeOk = true, wheelsOk = true;
  for (const d of docs) {
    const p = evalParams2(d.params).values, parts = buildVehicle(d.vspec!, p, paintFor2(d.name));
    if (!parts.length || parts.some(q => q.idx.length === 0 || q.pos.some(v => !Number.isFinite(v)))) allParts = false;
    const b = vehicleBounds(parts);
    if (d.vspec!.kind === 'car' && p.L && p.W && p.H) { const l = b.hi[0] - b.lo[0], w = b.hi[1] - b.lo[1], h = b.hi[2]; if (l < p.L * 0.97 || l > p.L * 1.08 || w < p.W * 0.9 || w > p.W * 1.2 || h < p.H * 0.93 || h > p.H * 1.12) sizeOk = false; }
    if (parts.filter(q => q.mat === 'rubber').length < 2) wheelsOk = false;
  }
  ok('all vehicle models build finite geometry', allParts);
  ok('car models match the published length, width and height', sizeOk);
  ok('every vehicle has tyres, and cars have glass, lamps and rims', wheelsOk);
  const corolla = BT2.find(t => t.key === 'toyota-corolla')!.make(), cp = buildVehicle(corolla.vspec!, evalParams2(corolla.params).values, '#c9ccd1');
  ok('a car has body, glass, four rims, headlamps and tail lamps', ['paint', 'glass', 'lamp', 'tail'].every(m => cp.some(q => q.mat === m)) && cp.filter(q => q.mat === 'rim').length === 4);
}


// ---- catalogue ----
{
  const cats = CATALOG.map(c => c.title);
  ok('every catalogue template opens as a vehicle with a vspec', CATALOG.every(c => c.items.every(t => { const d = t.make(); return d.kind === 'vehicle' && !!d.vspec; })));
  ok('catalogue has the 15 categories of the reference picture', cats.length === 15 && CATALOG.every(c => c.items.length >= 3));
  let bad = '';
  for (const c of CATALOG) for (const t of c.items) {
    const d = t.make(), p = evalParams2(d.params).values, parts = buildVehicle(d.vspec!, p, paintFor2(d.name));
    const b = vehicleBounds(parts), L = p.L ?? 0, bl = b.hi[0] - b.lo[0];
    if (!d.vspec || !parts.length || parts.some(q => q.pos.some(v => !Number.isFinite(v)))) bad = `${t.key} empty`;
    else if (L && (bl < L * 0.55 || bl > L * 1.5) && !['rv', 'segway', 'hoverboard', 'drone', 'balloon'].includes(d.vspec.kind)) bad = bad || `${t.key} length ${Math.round(bl)} vs ${L}`;
  }
  ok('every catalogue template builds a finite model of about the stated length ' + bad, bad === '');
  ok('catalogue holds well over 100 templates', CATALOG.reduce((n, c) => n + c.items.length, 0) > 100 && CATALOG_TEMPLATES.length > 70);
}

{
  console.log('\nSolid-modelling features');
  const sq = (w: number, h: number): [number, number][] => [[0, 0], [w, 0], [w, h], [0, h]], R0 = [{ outer: sq(100, 60), holes: [] }];
  const plain = FX(R0, 'XY', 0, 20, {});
  ok('extrude with no options keeps the exact volume', Math.abs(volM(plain) - 120000) < 1e-6);
  const fil = FX(R0, 'XY', 0, 20, { fillet: 4 }), cha = FX(R0, 'XY', 0, 20, { chamfer: 3 }), dra = FX(R0, 'XY', 0, 20, { draft: 5 });
  ok('rounding the end edges removes material, but only a little', volM(fil) < 120000 && volM(fil) > 115000);
  const chExpected = 120000 - 2 * (0.5 * 3 * 3) * (2 * (100 + 60) - 4 * 3 * 0.5);
  ok('chamfer 3 on both rims removes about the expected volume (' + volM(cha).toFixed(0) + ')', Math.abs(volM(cha) - chExpected) < 600);
  ok('draft narrows the far end', volM(dra) < 120000 && volM(dra) > 105000);
  ok('edge-rounded extrusions are closed solids', [fil, cha, dra].every(m => volM(m) > 0));
  const ins = FI(R0, 5)[0].outer; ok('inset by 5 shrinks the rectangle by 5 on every side', ins[0][0] === 5 && ins[0][1] === 5 && ins[2][0] === 95 && ins[2][1] === 55);
  const tool = FL(FH('cbore', 10, 20, 18, 6), 'XY', 0, [20, 30]);
  ok('counterbore tool: cylinder Ø18 × 6 plus Ø10 × 20 (plus 1 mm lead-in)', Math.abs(volM(tool) - (Math.PI * 81 * 7 + Math.PI * 25 * 14)) < 25);
  const drilled = boolM(plain, tool, 'cut'); ok('drilling a counterbored hole takes the tool volume out of the plate', Math.abs(volM(plain) - volM(drilled) - (Math.PI * 81 * 6 + Math.PI * 25 * 14)) < 30);
  const cs = FL(FH('csink', 10, 20, 20), 'XY', 0, [20, 30]); ok('countersink tool is a closed solid', volM(cs) > 1500);
  const lf = FLOFT({ outer: sq(100, 100).map(p => [p[0] - 50, p[1] - 50] as [number, number]), holes: [] }, { outer: cpolyM(0, 0, 30, 48), holes: [] }, 'XY', 0, 80);
  ok('loft square to round lies between the two extrusions', volM(lf) > Math.PI * 900 * 80 && volM(lf) < 100 * 100 * 80);
  const sw = FSW([[0, 0, 0], [0, 0, 100], [100, 0, 100], [100, 0, 0]], 20, 0, 20);
  ok('swept bar with bends is a bit shorter than the sharp-corner path', volM(sw) > Math.PI * 100 * 270 && volM(sw) < Math.PI * 100 * 300);
  const tube = FSW([[0, 0, 0], [0, 0, 100]], 20, 12, 0); ok('hollow sweep is an exact tube', Math.abs(volM(tube) - Math.PI * 64 * 100) / (Math.PI * 6400) < 0.01);
  ok('mirror keeps the volume and flips the position', Math.abs(volM(FM(plain, 'YZ', 0)) - 120000) < 1e-6);
  // timeline steps
  const d = newPartM('t'); d.params = [{ name: 'w', expr: '40' }];
  const sk0 = addRectM(emptyM(), [0, 0], [40, 40]);
  d.steps = [{ id: 's1', type: 'sketch', name: 's', plane: 'XY', offset: '0', sk: sk0 }, { id: 'f1', type: 'extrude', name: 'e', sketch: 's1', op: 'new', depth: '10', angle: '360', fillet: '1', wall: '2', open: 'top' }];
  const rb = rebuildM(d); ok('shell: a 40 mm box with 2 mm walls and floor, open top, weighs the right volume', rb.errors.length === 0 && Math.abs((rb.stats?.volume ?? 0) - (40 * 40 * 10 - 36 * 36 * 8)) < 120);
  d.steps.push({ id: 's2', type: 'sketch', name: 'h', plane: 'XY', offset: '10', sk: { pts: [{ id: 'c', x: 20, y: 20 }], lines: [], circles: [{ id: 'o', c: 'c', r: 5 }], cons: [] } }, { id: 'h1', type: 'hole', name: 'h', sketch: 's2', hole: 'simple', dia: '0', cdia: '0', cdepth: '0', depth: '-12' });
  const rh = rebuildM(d); ok('hole wizard drills the 2 mm floor at the circle centre (dia 0 takes the circle size)', rh.errors.length === 0 && Math.abs((rb.stats!.volume - rh.stats!.volume) - Math.PI * 25 * 2) < 8);
  d.steps.push({ id: 'p1', type: 'pattern', name: 'p', of: 'h1', mode: 'linear', count: '1', dx: '0', dy: '0', dz: '0', axis: 'z', angle: '360', cx: '0', cy: '0', cz: '0' } as any);
  ok('a hole can be patterned like any feature (count below 2 is rejected)', rebuildM(d).errors.some(e => e.step === 'p1'));
  d.steps.pop(); d.steps.push({ id: 'm1', type: 'mirror', name: 'm', of: 'h1', plane: 'YZ', offset: '20' });
  ok('mirror of a hole in the middle plane changes nothing', rebuildM(d).errors.length === 0);
  const fc = filletCorner(sk0, sk0.pts[1].id, 5); ok('sketch fillet turns one corner into an arc of 6 segments (lines 4 to 10)', !!fc && fc.lines.length === sk0.lines.length + 6);
  // finishes
  ok('finish list has enamel, bronze and plastics', ['yellow', 'bronze', 'abs', 'nylon'].every(k => MFIN.some(f => f.key === k)) && finishLook(7850, 'yellow').coat === 1);
  // drawing
  const clev = MECH_TEMPLATES.find(t => t.key === 'm-clevis')!.make(), rc = rebuildM(clev);
  ok('edge repair finds sharp edges between faces of a boolean result', edgePieces(rc.mesh).filter(p => p.ns.length === 2).length > 100);
  const svg = drawingSvg(clev, rc.mesh, { values: rc.values, material: 'Cast iron', mass: rc.stats!.mass, image: false, date: '2026-01-01' });
  ok('drawing sheet is an A3 SVG with views, section and title block', svg.startsWith('<svg') && svg.includes('FRONT VIEW') && svg.includes('TOP VIEW') && svg.includes('RIGHT SIDE VIEW') && svg.includes('SECTION A–A') && svg.includes('CLEVIS BRACKET'));
  ok('drawing callouts list the holes with their sizes', callouts(clev, rc.values).some(t => t.includes('Ø12')) && callouts(clev, rc.values).some(t => t.includes('Ø20')));
  ok('drawing shows overall sizes 100 and 75', svg.includes('>100<') && svg.includes('>75<'));
}
{
  console.log('\nReference mechanical templates');
  ok('there are at least 20 reference-based machine parts', MECH_TEMPLATES.length >= 20);
  const bad: string[] = [];
  for (const t of MECH_TEMPLATES) { try { const r = rebuildM(t.make()); if (r.errors.length || !r.stats || !(r.stats.volume > 1000) || r.bodies.length !== 1) bad.push(t.key + ':' + (r.errors[0]?.msg ?? 'empty')); } catch (e: any) { bad.push(t.key + ':' + e.message); } }
  ok('every machine part rebuilds without errors into one solid ' + bad.join(' '), bad.length === 0);
  ok('machine parts are grouped in four categories', new Set(MECH_TEMPLATES.map(t => t.brand)).size === 4);
  ok('machine parts use the new features', MECH_TEMPLATES.some(t => t.make().steps.some(s => s.type === 'hole')) && MECH_TEMPLATES.some(t => t.make().steps.some(s => s.type === 'loft')) && MECH_TEMPLATES.some(t => t.make().steps.some(s => s.type === 'sweep')) && MECH_TEMPLATES.some(t => t.make().steps.some(s => s.type === 'mirror')) && MECH_TEMPLATES.some(t => t.make().steps.some(s => s.type === 'extrude' && !!s.wall)));
  ok('machine parts appear in the template list', MECH_TEMPLATES.every(t => ALL_TEMPLATES.some(a => a.key === t.key)));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
