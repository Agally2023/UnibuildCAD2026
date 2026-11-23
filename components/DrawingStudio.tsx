// The Drawing tab: a drawing sheet made from the part, with views, annotations, sheets and output, in the way a CAD drawing environment works.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import PrintOptions from './PrintOptions';
import { type Prim, SYMBOLS, DISPLAYS, HATCHES, GDT, WELDS, LAYERS, type Ann, type DView, type DrawingDoc, type Sheet, type Layer, type Display, type HatchStyle, type TolType } from '../lib/dwgTypes';
import { SCALES, renderDrawing, scaleText, newDrawing, arrangeStandard, blankDoc, camOf, type Ctx, type Rendered, type ViewInfo } from '../lib/dwg';
import { VIEW_NAMES, dot, type NamedView, type Pt } from '../lib/dwgGeom';
import { toSvg, toDxf } from '../lib/dwgOut';
import { addAux, addDetail, addModelView, addSection, aid, autoBalloons, autoDims, circle3, cloneDoc, cutChoices, holeText, meshBox, nextTablePos, threadText } from '../lib/dwgEdit';
import { uid } from '../lib/sketch';
import { POINTS_NEEDED, arrayPolar, arrayRect, chamferCorner, chamferLines, distTo, explode, filletCorner, filletLines, geoPrims, gridPt, joinAll, mirrorM, moveM, nearestVertex, offset as offsetGeo, orthoPt, parseCoord, pl, rotateM, scaleM, shapeOf, snapsOf, transform, bboxOf, type Body, type Geo, type Mat, type SketchTool } from '../lib/dwgSketch';
import { parseDxf } from '../lib/dxfIn';
import { arrangeInRow, defaultAsm, type Asm } from '../lib/assembly';
import { pageMm } from '../lib/paper';
import type { PartDoc } from '../lib/parts';
import type { Mesh } from '../lib/solid';

type Props = { parts: PartDoc[]; bom?: import('../lib/assembly').BomRow[]; doc: PartDoc; mesh: Mesh; values: Record<string, number>; mass: number; matName: string; look: { color: string; metal: number }; commit: (fn: (d: PartDoc) => PartDoc) => void; setMsg: (m: string) => void; base: string; save: (name: string, content: string) => Promise<void>; onPdf: () => void; onPrint: () => void; phone: boolean };

type Tool = { key: string; label: string; n: number; help: string };
const T = (key: string, label: string, n: number, help: string): Tool => ({ key, label, n, help });
const VIEW_TOOLS: Tool[] = [
  T('section', 'Section view', 1, 'Tap on a view where the cut goes (offset: two taps). Choose the cut direction and kind first.'), T('detail', 'Detail view', 2, 'Tap the centre, then a point on the edge of the circle to enlarge.'),
  T('aux', 'Auxiliary view', 2, 'Tap the two ends of an inclined edge.'), T('crop', 'Crop view', 2, 'Tap two corners of the part of the view to keep.'), T('breakout', 'Broken-out section', 2, 'Tap two corners of the area to cut open.'),
];
const DIM_TOOLS: Tool[] = [
  T('smart', 'Smart dimension', 3, 'Tap two points, then where the dimension goes.'), T('hor', 'Horizontal', 3, 'Tap two points, then where the dimension goes.'), T('ver', 'Vertical', 3, 'Tap two points, then where the dimension goes.'), T('ali', 'Aligned', 3, 'Tap two points, then where the dimension goes.'),
  T('dia', 'Diameter', 2, 'Tap a circle, then where the text goes. If a circle is not found, tap three points on it.'), T('rad', 'Radius', 2, 'Tap a circle or arc, then where the text goes.'), T('ang', 'Angle', 4, 'Tap the corner point, a point on each line, then where the arc goes.'),
  T('chamfer', 'Chamfer', 3, 'Tap the two ends of the chamfer, then where the text goes.'), T('ord', 'Ordinate', 3, 'Tap the zero point, the feature, then where the text goes.'), T('base', 'Baseline', 99, 'Tap the base point, then each feature in turn. Tap Done when finished.'), T('chain', 'Chain', 99, 'Tap the points one after another. Tap Done when finished.'),
];
const NOTE_TOOLS: Tool[] = [
  T('note', 'Note', 1, 'Type the text in the panel, then tap where it goes.'), T('leader', 'Note with leader', 2, 'Tap the point it refers to, then where the text goes.'), T('balloon', 'Balloon', 2, 'Tap the part, then where the balloon goes.'),
  T('finish', 'Surface finish', 2, 'Tap the surface, then where the symbol goes.'), T('weld', 'Weld symbol', 2, 'Tap the joint, then where the symbol goes.'), T('gdt', 'Geometric tolerance', 2, 'Tap the feature, then where the frame goes.'),
  T('datum', 'Datum feature', 2, 'Tap the edge, then where the datum goes.'), T('dtarget', 'Datum target', 2, 'Tap the spot, then where the target goes.'), T('hole', 'Hole callout', 2, 'Tap a hole, then where the text goes.'),
  T('thread', 'Thread callout', 2, 'Tap a round hole or shaft, then where the text goes.'), T('cmark', 'Centre mark', 1, 'Tap a circle.'), T('cline', 'Centreline', 2, 'Tap the two ends.'), T('fill', 'Area hatch', 2, 'Tap two corners of the area.'), T('cloud', 'Revision cloud', 2, 'Tap two corners.'),
  T('htable', 'Hole table', 1, 'Tap where the table goes.'), T('bom', 'Bill of materials', 1, 'Tap where the table goes.'), T('rev', 'Revision table', 1, 'Tap where the table goes.'), T('table', 'General table', 1, 'Tap where the table goes.'), T('measure', 'Measure', 2, 'Tap two points to read the distance.'),
];
const ALL_TOOLS = [...VIEW_TOOLS, ...DIM_TOOLS, ...NOTE_TOOLS];
const r1 = (x: number) => Math.round(x * 100) / 100;
const primsSvg = (ps: Prim[], col: string, w = 1.3): string => ps.map(q => {
  const st = `fill="none" stroke="${col}" stroke-width="${w}" vector-effect="non-scaling-stroke" stroke-linecap="round"`;
  if (q.k === 'l') return `<line x1="${q.a[0]}" y1="${q.a[1]}" x2="${q.b[0]}" y2="${q.b[1]}" ${st}/>`;
  if (q.k === 'c') return `<circle cx="${q.c[0]}" cy="${q.c[1]}" r="${q.r}" ${st}/>`;
  if (q.k === 'p') return `<${q.closed ? 'polygon' : 'polyline'} points="${q.pts.map(z => z.join(',')).join(' ')}" ${st}/>`;
  if (q.k === 'a') { const a0 = (q.a0 * Math.PI) / 180, a1 = (q.a1 * Math.PI) / 180; return `<path d="M${q.c[0] + q.r * Math.cos(a0)} ${q.c[1] + q.r * Math.sin(a0)} A${q.r} ${q.r} 0 ${(((q.a1 - q.a0) % 360) + 360) % 360 > 180 ? 1 : 0} 1 ${q.c[0] + q.r * Math.cos(a1)} ${q.c[1] + q.r * Math.sin(a1)}" ${st}/>`; }
  return '';
}).join('');
const DRAW_TOOLS: [string, string, string][] = [
  ['line', 'Line', 'Tap the start, then the end. Type x,y or @dx,dy or @length<angle in the command line for exact points.'], ['pline', 'Polyline', 'Tap each corner. Tap the last point twice, press Enter, or use Finish to end it.'],
  ['rect', 'Rectangle', 'Tap two opposite corners.'], ['poly', 'Polygon', 'Tap the centre, then a point for the size. Set the number of sides below.'],
  ['circle', 'Circle', 'Tap the centre, then a point on the circle. Or type the radius.'], ['c2p', 'Circle 2P', 'Tap the two ends of a diameter.'], ['c3p', 'Circle 3P', 'Tap three points on the circle.'],
  ['arc3', 'Arc 3P', 'Tap the start, a point on the arc, then the end.'], ['arcc', 'Arc C-S-E', 'Tap the centre, the start, then the end (counter-clockwise).'], ['ellipse', 'Ellipse', 'Tap the centre, the end of one axis, then a point for the other half-axis.'],
];
const MOD_TOOLS: [string, string, string][] = [
  ['move', 'Move', 'Pick the object, tap the base point, then where it goes.'], ['copy', 'Copy', 'Pick the object, tap the base point, then each place for a copy. Esc to stop.'], ['rotate', 'Rotate', 'Pick the object, tap the centre, then point in the new direction (or type the angle).'],
  ['mirror', 'Mirror', 'Pick the object, then tap the two ends of the mirror line.'], ['scale', 'Scale', 'Pick the object, set the factor below, then tap the base point.'], ['offset', 'Offset', 'Set the distance below, tap the object, then tap the side.'],
  ['fillet', 'Fillet', 'Set the radius below. Tap near a corner of a polyline, or tap two separate lines. Radius 0 makes a sharp corner.'], ['chamfer', 'Chamfer', 'Set the distance below. Tap near a corner, or tap two separate lines.'],
  ['arrayr', 'Array', 'Pick the objects, set rows, columns and spacing, then press Make array.'], ['arrayp', 'Polar array', 'Pick the objects, set the count and angle below, then tap the centre.'],
];
const ALIAS: Record<string, string> = { L: 'sk:line', LINE: 'sk:line', PL: 'sk:pline', PLINE: 'sk:pline', REC: 'sk:rect', RECT: 'sk:rect', POL: 'sk:poly', POLYGON: 'sk:poly', C: 'sk:circle', CIRCLE: 'sk:circle', C2P: 'sk:c2p', C3P: 'sk:c3p', A: 'sk:arc3', ARC: 'sk:arc3', ARCC: 'sk:arcc', EL: 'sk:ellipse', ELLIPSE: 'sk:ellipse', M: 'md:move', MOVE: 'md:move', CO: 'md:copy', COPY: 'md:copy', RO: 'md:rotate', ROTATE: 'md:rotate', MI: 'md:mirror', MIRROR: 'md:mirror', SC: 'md:scale', SCALE: 'md:scale', O: 'md:offset', OFFSET: 'md:offset', F: 'md:fillet', FILLET: 'md:fillet', CHA: 'md:chamfer', CHAMFER: 'md:chamfer', AR: 'md:arrayr', ARRAY: 'md:arrayr', ARP: 'md:arrayp', SELECT: 'select', ESC: 'select' };
const TEMPLATES = (): { name: string; props: Partial<Record<string, string>>; std?: 'iso' | 'ansi'; arrow?: any }[] => {
  let mine: any[] = []; try { mine = JSON.parse(localStorage.getItem('dwg-tb-templates') ?? '[]'); } catch { /* none */ }
  return [{ name: 'ISO 2768-m', props: { tolerance: 'GENERAL TOLERANCES ISO 2768-m   |   BREAK SHARP EDGES 0.3 MAX' }, std: 'iso', arrow: 'filled' }, { name: 'ANSI Y14.5', props: { tolerance: 'UNLESS OTHERWISE SPECIFIED: DIMENSIONS ARE IN MILLIMETRES   |   .X ±0.5   .XX ±0.25' }, std: 'ansi', arrow: 'filled' }, { name: 'Sheet metal', props: { tolerance: 'GENERAL TOLERANCES ISO 2768-m   |   BEND RADIUS = MATERIAL THICKNESS   |   DEBURR ALL EDGES', finish: 'AS SUPPLIED' }, std: 'iso' }, ...mine];
};
const nm = (t: string) => { const v = parseFloat(t.replace(',', '.')); return isNaN(v) ? undefined : v; };

export default function DrawingStudio(p: Props) {
  const { doc, mesh, values, commit, setMsg } = p;
  const [si, setSi] = useState(0), [group, setGroup] = useState<'view' | 'ann' | 'sketch' | 'sheet' | 'asm' | 'out'>('view'), [tool, setTool] = useState('select'), [sel, setSel] = useState<string | null>(null);
  const [pend, setPend] = useState<{ view: string; pts: Pt[]; circ?: { cx: number; cy: number; r: number }; ids?: string[] } | null>(null), [over, setOver] = useState<DrawingDoc | null>(null), [zoom, setZoom] = useState(1);
  const [txt, setTxt] = useState('NOTE'), [secKind, setSecKind] = useState<'full' | 'half' | 'offset'>('full'), [secDir, setSecDir] = useState<'h' | 'v'>('h'), [round, setRound] = useState(true), [gdtSym, setGdtSym] = useState<string>('pos'), [weldT, setWeldT] = useState<string>('fillet');
  const [hover, setHover] = useState<Pt | null>(null);
  const [vp, setVp] = useState({ z: 1, x: 0, y: 0 }), [full, setFull] = useState(Platform.OS === 'web'), [ribOpen, setRibOpen] = useState(true), [propsOpen, setPropsOpen] = useState(true);
  const [sk, setSk] = useState({ sides: 6, inscribed: true, filletR: 5, chamD: 3, offD: 5, rows: 2, cols: 3, dx: 20, dy: 20, polN: 6, polFill: 360, turn: true, rotA: 90, scK: 2, keep: true, lt: 'cont' as 'cont' | 'hid' | 'cen', w: 0.5, ortho: false, grid: false, gridG: 5, osnap: true });
  const [many, setMany] = useState<string[]>([]), [cmd, setCmd] = useState('');
  const vpRef = useRef<any>(null), coordRef = useRef<any>(null), fitted = useRef(true), ptrs = useRef(new Map<number, { x: number; y: number }>()), gest = useRef<any>(null), tap = useRef<any>(null), cur = useRef<Pt | null>(null);
  const BASE = 4;   // screen pixels per millimetre at zoom 1
  const wrap = useRef<any>(null), drag = useRef<null | { id: string; kind: 'view' | 'ann'; x0: number; y0: number; moved: boolean; start: DrawingDoc }>(null);
  const ctx: Ctx = useMemo(() => ({ doc, mesh, values, material: p.matName, mass: p.mass, bom: p.bom, date: new Date().toISOString().slice(0, 10), color: p.look.color, shine: p.look.metal, images: !over }), [doc, mesh, values, p.matName, p.mass, p.look, p.bom, !!over]);
  const stored = doc.drawing;
  const auto = useMemo(() => (stored ? null : newDrawing(ctx)), [stored, doc.name, mesh]);   // shown until the first change is made
  const dd = over ?? stored ?? auto!;
  const sIdx = Math.min(si, dd.sheets.length - 1), sh = dd.sheets[sIdx];
  const r: Rendered = useMemo(() => renderDrawing(dd, sIdx, ctx), [dd, sIdx, ctx]);
  const save = (nd: DrawingDoc) => commit(d => ({ ...d, drawing: nd }));
  const edit = (fn: (d: DrawingDoc, sh: Sheet) => void) => { const nd = cloneDoc(stored ?? dd); fn(nd, nd.sheets[Math.min(sIdx, nd.sheets.length - 1)]); save(nd); setOver(null); };
  const selView = sh.views.find(v => v.id === sel), selAnn = sh.anns.find(a => a.id === sel);
  const tdef = ALL_TOOLS.find(t => t.key === tool);
  useEffect(() => { setPend(null); }, [tool, sIdx]);
  const baseSvg = useMemo(() => toSvg(r.prims, r.page).replace(/width="[\d.]+" height="[\d.]+"/, 'style="width:100%;height:100%;display:block"'), [r]);
  const mmpp = 1 / (BASE * vp.z);   // millimetres per screen pixel


  // ---------- pointer handling ----------
  const toMm = (e: any): Pt => { const b = wrap.current?.getBoundingClientRect?.(); if (!b) return [0, 0]; return [((e.clientX - b.left) / b.width) * r.page[0], ((e.clientY - b.top) / b.height) * r.page[1]]; };
  const px = () => mmpp;   // mm per screen pixel
  const viewAt = (X: number, Y: number): ViewInfo | undefined => { const c = r.views.filter(v => X >= v.sheetBox[0] - 8 && X <= v.sheetBox[2] + 8 && Y >= v.sheetBox[1] - 8 && Y <= v.sheetBox[3] + 8); c.sort((a, b) => (a.sheetBox[2] - a.sheetBox[0]) * (a.sheetBox[3] - a.sheetBox[1]) - (b.sheetBox[2] - b.sheetBox[0]) * (b.sheetBox[3] - b.sheetBox[1])); return c[0]; };
  const uv = (v: ViewInfo, X: number, Y: number): Pt => [v.uc + (X - v.cx) / v.s, v.vc - (Y - v.cy) / v.s];
  const snap = (X: number, Y: number, vid?: string): { v: ViewInfo; p: Pt; snapped: boolean } | null => {
    const tol = Math.max(2.5, px() * 9); let best: any = null, bd = tol;
    for (const q of r.snaps) { if (vid && q.view !== vid) continue; const d = Math.hypot(q.x - X, q.y - Y); if (d < bd) { bd = d; best = q; } }
    if (best) { const v = r.views.find(w => w.id === best.view)!; return { v, p: [best.u, best.v], snapped: true }; }
    const v = (vid ? r.views.find(w => w.id === vid) : undefined) ?? viewAt(X, Y); return v ? { v, p: uv(v, X, Y), snapped: false } : null;
  };
  const hitAt = (X: number, Y: number): string | null => {
    const gh = geoAt(X, Y); if (gh) return gh;
    const m = Math.max(1.5, px() * 6), anns = r.hits.filter(h => h.kind === 'ann' && !geoIds.has(h.id) && X >= h.box[0] - m && X <= h.box[2] + m && Y >= h.box[1] - m && Y <= h.box[3] + m).sort((a, b) => (a.box[2] - a.box[0]) * (a.box[3] - a.box[1]) - (b.box[2] - b.box[0]) * (b.box[3] - b.box[1]));
    if (anns[0]) return anns[0].id; const v = viewAt(X, Y); return v && X >= v.sheetBox[0] && X <= v.sheetBox[2] && Y >= v.sheetBox[1] && Y <= v.sheetBox[3] ? v.id : null;
  };
  const addAnn = (a: Ann) => { edit((_d, s) => { s.anns.push(a); }); setSel(a.id); };
  const circleNear = (vid: string, q: Pt, v: ViewInfo) => { const tol = Math.max(3, px() * 10) / v.s; let best: any = null, bd = tol; for (const c of r.circles) { if (c.view !== vid) continue; const d = Math.abs(Math.hypot(q[0] - c.c.cx, q[1] - c.c.cy) - c.c.r), dc = Math.hypot(q[0] - c.c.cx, q[1] - c.c.cy); const dd2 = Math.min(d, dc < c.c.r ? dc : 1e9); if (dd2 < bd) { bd = dd2; best = c.c; } } return best as { cx: number; cy: number; r: number } | null; };

  // ---------- sketch tools (free drawing and editing on the sheet) ----------
  const skTool = tool.startsWith('sk:') ? (tool.slice(3) as SketchTool) : null, mdTool = tool.startsWith('md:') ? tool.slice(3) : null;
  const geos = sh.anns.filter((a): a is Geo => a.t === 'geo'), geoIds = new Set(geos.map(g => g.id));
  const targets = (): Geo[] => { const ids = many.length ? many : sel ? [sel] : []; return ids.map(i => geos.find(g => g.id === i)).filter(Boolean) as Geo[]; };
  const geoAt = (X: number, Y: number): string | null => { const tol = Math.max(1.2, px() * 7); let best: string | null = null, bd = tol; for (const g of geos) { const d = distTo(g, [X, Y]); if (d < bd) { bd = d; best = g.id; } } return best; };
  const skPt = (X: number, Y: number, prev?: Pt): { p: Pt; kind?: string } => {
    const tol = Math.max(1.5, px() * 10);
    if (sk.osnap) {
      let best: Pt | null = null, bd = tol, kind = '';
      for (const g of geos) for (const q of snapsOf(g)) { const d = Math.hypot(q.p[0] - X, q.p[1] - Y); if (d < bd) { bd = d; best = q.p; kind = q.kind; } }
      for (const q of r.snaps) { const d = Math.hypot(q.x - X, q.y - Y); if (d < bd) { bd = d; best = [q.x, q.y]; kind = 'view'; } }
      if (best) return { p: best, kind };
    }
    let q: Pt = [X, Y]; if (sk.grid) q = gridPt(q, sk.gridG); if (sk.ortho && prev) q = orthoPt(prev, q); return { p: q };
  };
  const styled = (b: Body, src?: Body): Body => ({ ...b, lt: src ? src.lt : sk.lt, w: src ? src.w : sk.w });
  /** One edit: replace some shapes, add some, remove some. */
  const change = (upd: Map<string, Body>, add: Body[], rem: string[] = []): string[] => {
    const ids = add.map(() => aid());
    edit((_d, s2) => { const gone = new Set(rem); s2.anns = s2.anns.filter(a => !gone.has(a.id)).map(a => (upd.has(a.id) ? ({ ...upd.get(a.id)!, id: a.id } as Ann) : a)); add.forEach((b, i) => s2.anns.push({ ...b, id: ids[i] } as Ann)); });
    return ids;
  };
  const addGeo = (b: Body) => { const ids = change(new Map(), [styled(b)]); setSel(ids[0]); setMany([]); };
  const rotDeg = (c: Pt, h: Pt) => (-Math.atan2(h[1] - c[1], h[0] - c[0]) * 180) / Math.PI;
  const finishPline = (close = false) => { const pts = pend?.pts ?? []; if (skTool !== 'pline' || pts.length < 2) { setPend(null); return; } addGeo(pl(pts, close && pts.length > 2)); setPend(null); };
  const ghostOf = (h: Pt): Body[] => {
    const pts = pend?.pts ?? [];
    if (skTool) { if (!pts.length) return []; if (skTool === 'pline') return [pl([...pts, h])]; const b = shapeOf(skTool, [...pts, h], { sides: sk.sides, inscribed: sk.inscribed }); return b ? [b] : [pl([pts[pts.length - 1], h])]; }
    if (!mdTool) return [];
    const T = targets();
    if (mdTool === 'offset' && pend?.ids?.length) { const g = geos.find(q => q.id === pend.ids![0]); const o = g ? offsetGeo(g, sk.offD, h) : null; return o ? [o] : []; }
    if (!pts.length || !T.length) return [];
    const base = pts[0]; let m: Mat | null = null;
    if (mdTool === 'move' || mdTool === 'copy') m = moveM(h[0] - base[0], h[1] - base[1]); else if (mdTool === 'rotate') m = rotateM(base, rotDeg(base, h)); else if (mdTool === 'mirror') m = mirrorM(base, h);
    return m ? T.map(g => transform(g, m!)) : [];
  };
  const feed = (p: Pt, raw?: Pt) => {
    const pts = pend?.pts ?? [];
    if (skTool) {
      if (skTool === 'pline') { const last = pts[pts.length - 1]; if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < Math.max(0.2, mmpp * 6)) { finishPline(); return; } setPend({ view: '', pts: [...pts, p] }); return; }
      const np = [...pts, p]; if (np.length < POINTS_NEEDED[skTool]) { setPend({ view: '', pts: np }); return; }
      const b = shapeOf(skTool, np, { sides: sk.sides, inscribed: sk.inscribed }); setPend(null); if (!b) { setMsg('Those points do not make a shape. Try again.'); return; } addGeo(b); return;
    }
    if (!mdTool) return;
    const T = targets(), upd = (f: (g: Geo) => Body) => { const m = new Map<string, Body>(); T.forEach(g => m.set(g.id, f(g))); return m; };
    const rp = raw ?? p;
    switch (mdTool) {
      case 'move': case 'copy': {
        if (!pts.length) { setPend({ view: '', pts: [p] }); return; }
        const mx = moveM(p[0] - pts[0][0], p[1] - pts[0][1]);
        if (mdTool === 'move') { change(upd(g => transform(g, mx)), []); setPend(null); } else change(new Map(), T.map(g => transform(g, mx))); return; }
      case 'rotate': { if (!pts.length) { setPend({ view: '', pts: [p] }); return; } const d = rotDeg(pts[0], p); change(upd(g => transform(g, rotateM(pts[0], d))), []); setPend(null); return; }
      case 'mirror': { if (!pts.length) { setPend({ view: '', pts: [p] }); return; } const mm = mirrorM(pts[0], p); if (sk.keep) change(new Map(), T.map(g => transform(g, mm))); else change(upd(g => transform(g, mm)), []); setPend(null); return; }
      case 'scale': { if (!(sk.scK > 0)) { setMsg('Enter a scale factor above 0.'); return; } change(upd(g => transform(g, scaleM(p, sk.scK))), []); return; }
      case 'arrayp': { change(new Map(), arrayPolar(T, p, sk.polN, sk.polFill, sk.turn)); return; }
      case 'offset': {
        if (!pend?.ids?.length) { const id = geoAt(rp[0], rp[1]); if (!id) { setMsg('Tap the object to offset.'); return; } setPend({ view: '', pts: [], ids: [id] }); setMsg('Now tap the side to offset to.'); return; }
        const g = geos.find(q => q.id === pend.ids![0]); const o = g ? offsetGeo(g, sk.offD, rp) : null; setPend(null); if (!o) { setMsg('That distance does not fit. Try a smaller one.'); return; } change(new Map(), [styled(o, g)]); return; }
      case 'fillet': case 'chamfer': {
        const id = geoAt(rp[0], rp[1]); if (!id) { setMsg('Tap a corner of a polyline, or a line.'); return; }
        const g = geos.find(q => q.id === id)!, fil = mdTool === 'fillet';
        if (g.g === 'pl' && g.pts.length >= 3) {
          const j = nearestVertex(g, rp);
          if (fil) { const o = filletCorner(g, j, sk.filletR); if (!o) { setMsg('That corner cannot take this radius. Use a smaller one, or tap nearer the corner.'); return; } const ids = change(new Map(), o.map(b => styled(b, g)), [g.id]); setSel(ids[0]); setMany(ids); }
          else { const o = chamferCorner(g, j, sk.chamD, sk.chamD); if (!o) { setMsg('That corner cannot take this distance. Use a smaller one.'); return; } change(new Map([[g.id, o]]), []); }
          return;
        }
        if (g.g !== 'pl' || g.pts.length !== 2) { setMsg('Fillet and chamfer work on lines and polylines.'); return; }
        if (!pend?.ids?.length) { setPend({ view: '', pts: [rp], ids: [id] }); setMsg('Now tap the second line.'); return; }
        const a = geos.find(q => q.id === pend.ids![0]); if (!a || a.id === id) { setMsg('Tap a different line.'); return; }
        const o = fil ? filletLines(a, g, pend.pts[0], rp, sk.filletR) : chamferLines(a, g, pend.pts[0], rp, sk.chamD, sk.chamD); setPend(null);
        if (!o) { setMsg('Those two lines are parallel, or the size is too big.'); return; }
        const ids = change(new Map(), o.map(b => styled(b, a)), [a.id, g.id]); setSel(ids[ids.length - 1]); setMany(ids); return; }
      default: return;
    }
  };
  const sketchClick = (X: number, Y: number, shift: boolean) => {
    if (mdTool && shift) { const id = geoAt(X, Y); if (id) setMany(m => (m.includes(id) ? m.filter(q => q !== id) : [...(m.length || !sel ? m : [sel]), id])); return; }
    const prev = pend?.pts.length ? pend.pts[pend.pts.length - 1] : undefined;
    const { p } = skPt(X, Y, prev);
    if (skTool) { feed(p); return; }
    const own = mdTool === 'offset' || mdTool === 'fillet' || mdTool === 'chamfer';
    if (!own && !targets().length) { const id = geoAt(X, Y); if (id) { setMany([id]); setSel(id); setMsg(mdTool === 'arrayr' ? 'Selected. Set the array below and press Make array.' : 'Selected. Now tap the base point.'); } else setMsg('Tap the object to change first.'); return; }
    if (mdTool === 'arrayr') return;
    feed(p, [X, Y]);
  };
  const erase = () => { const ids = many.length ? many : sel ? [sel] : []; if (!ids.length) { setMsg('Select something first.'); return; } edit((_d, s2) => { s2.anns = s2.anns.filter(a => !ids.includes(a.id)); }); setSel(null); setMany([]); };
  const explodeSel = () => { const T = targets().filter(g => g.g === 'pl' && g.pts.length > 2); if (!T.length) { setMsg('Select a polyline with more than one segment.'); return; } change(new Map(), T.flatMap(g => explode(g).map(b => styled(b, g))), T.map(g => g.id)); setMany([]); };
  const joinSel = () => { const T = many.length ? targets() : geos; const open = T.filter(g => g.g === 'pl' && !g.closed); if (open.length < 2) { setMsg('Select two or more lines that meet end to end (or select none to join all).'); return; } const out = joinAll(open); change(new Map(), out.map(b => styled(b, open[0])), open.map(g => g.id)); setMany([]); setMsg(`Joined into ${out.length} polyline${out.length === 1 ? '' : 's'}.`); };
  const makeArray = () => { const T = targets(); if (!T.length) { setMsg('Select the objects to repeat first.'); return; } change(new Map(), arrayRect(T, sk.rows, sk.cols, sk.dx, sk.dy)); };
  const pickTool = (k: string, help: string) => { setTool(tool === k ? 'select' : k); setPend(null); setMsg(help); };
  const scalarIn = (n: number) => {
    const pts = pend?.pts ?? [], h = cur.current;
    if (skTool && pts.length && skTool !== 'pline' && (skTool === 'circle' || skTool === 'poly')) { feed([pts[0][0] + n, pts[0][1]]); return; }
    if ((skTool === 'line' || skTool === 'pline') && pts.length && h) { const l = pts[pts.length - 1], d = Math.hypot(h[0] - l[0], h[1] - l[1]) || 1; feed([l[0] + ((h[0] - l[0]) / d) * n, l[1] + ((h[1] - l[1]) / d) * n]); return; }
    if (mdTool === 'rotate' && pts.length) { change(new Map(targets().map(g => [g.id, transform(g, rotateM(pts[0], n))] as [string, Body])), []); setPend(null); return; }
    if ((mdTool === 'move' || mdTool === 'copy') && pts.length && h) { const d = Math.hypot(h[0] - pts[0][0], h[1] - pts[0][1]) || 1; feed([pts[0][0] + ((h[0] - pts[0][0]) / d) * n, pts[0][1] + ((h[1] - pts[0][1]) / d) * n]); return; }
    if (mdTool === 'scale') { setSk(o => ({ ...o, scK: n })); setMsg(`Scale factor ${n}. Tap the base point.`); return; }
    if (mdTool === 'offset') { setSk(o => ({ ...o, offD: n })); setMsg(`Offset distance ${n} mm.`); return; }
    if (mdTool === 'fillet') { setSk(o => ({ ...o, filletR: n })); setMsg(`Fillet radius ${n} mm.`); return; }
    if (mdTool === 'chamfer') { setSk(o => ({ ...o, chamD: n })); setMsg(`Chamfer distance ${n} mm.`); return; }
    setMsg('Nothing is waiting for a number. Pick a tool first.');
  };
  const runCmd = (raw: string) => {
    const t = raw.trim(); setCmd(''); const u = t.toUpperCase();
    if (!t) { if (skTool === 'pline') finishPline(); return; }
    if (ALIAS[u]) { setTool(ALIAS[u]); setPend(null); const q = [...DRAW_TOOLS.map(x => ['sk:' + x[0], x[2]]), ...MOD_TOOLS.map(x => ['md:' + x[0], x[2]])].find(x => x[0] === ALIAS[u]); if (q) setMsg(q[1]); return; }
    if (u === 'X' || u === 'EXPLODE') { explodeSel(); return; } if (u === 'J' || u === 'JOIN') { joinSel(); return; } if (u === 'E' || u === 'ERASE' || u === 'DEL') { erase(); return; }
    if (u === 'CLOSE' || u === 'CL') { finishPline(true); return; }
    if (u === 'ORTHO') { setSk(o => ({ ...o, ortho: !o.ortho })); return; } if (u === 'GRID' || u === 'SNAP') { setSk(o => ({ ...o, grid: !o.grid })); return; } if (u === 'OSNAP') { setSk(o => ({ ...o, osnap: !o.osnap })); return; }
    if (u === 'Z' || u === 'ZE' || u === 'FIT' || u === 'ZOOM') { fit(); return; }
    const pt = parseCoord(t, pend?.pts.length ? pend.pts[pend.pts.length - 1] : cur.current, r.page[1]);
    if (pt) { if (skTool || mdTool) { cur.current = pt; if (!skTool && mdTool && !targets().length && mdTool !== 'offset' && mdTool !== 'fillet' && mdTool !== 'chamfer') { setMsg('Tap the object to change first.'); return; } feed(pt, pt); } else setMsg('Pick a draw or modify tool first.'); return; }
    if (/^-?\d*[.,]?\d+$/.test(t)) { scalarIn(parseFloat(t.replace(',', '.'))); return; }
    setMsg(`Unknown command "${t}". Try L, PL, REC, POL, C, ARC, EL, M, CO, RO, MI, SC, O, F, CHA, AR, X, J, E.`);
  };
  // viewport: fit to the screen, zoom about a point
  const fit = () => { const el = vpRef.current; if (!el) return; const b = el.getBoundingClientRect(); if (b.width < 10 || b.height < 10) return; const z = Math.min(b.width / (r.page[0] * BASE), b.height / (r.page[1] * BASE)) * 0.97; setVp({ z, x: (b.width - r.page[0] * BASE * z) / 2, y: (b.height - r.page[1] * BASE * z) / 2 }); fitted.current = true; };
  const zoomBy = (k: number) => { const el = vpRef.current; if (!el) return; const b = el.getBoundingClientRect(), mx = b.width / 2, my = b.height / 2; fitted.current = false; setVp(v => { const z = Math.max(0.05, Math.min(80, v.z * k)), kk = z / v.z; return { z, x: mx - (mx - v.x) * kk, y: my - (my - v.y) * kk }; }); };
  useEffect(() => {
    if (Platform.OS !== 'web') return; const el = vpRef.current; if (!el) return;
    fit(); const ro = new ResizeObserver(() => { if (fitted.current) fit(); }); ro.observe(el);
    const wheel = (e: WheelEvent) => { e.preventDefault(); const b = el.getBoundingClientRect(), mx = e.clientX - b.left, my = e.clientY - b.top, k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)); fitted.current = false; setVp(v => { const z = Math.max(0.05, Math.min(80, v.z * k)), kk = z / v.z; return { z, x: mx - (mx - v.x) * kk, y: my - (my - v.y) * kk }; }); };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => { ro.disconnect(); el.removeEventListener('wheel', wheel); };
  }, [r.page[0], r.page[1], sIdx, full]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const key = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return; if (e.key === 'Escape') { setPend(null); setTool('select'); setMany([]); } else if (e.key === 'Enter') { if (skTool === 'pline') finishPline(); } else if (e.key === 'Delete' || e.key === 'Backspace') { if (sel || many.length) { e.preventDefault(); erase(); } } else if (e.key === 'F8') { e.preventDefault(); setSk(o => ({ ...o, ortho: !o.ortho })); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });

  const click = (X: number, Y: number, shift = false) => {
    if (tool === 'select' || tool === 'pan') { setSel(hitAt(X, Y)); return; }
    if (skTool || mdTool) { sketchClick(X, Y, shift); return; }
    const t = tdef; if (!t) return;
    const free: Record<string, number> = { bom: 1, rev: 1, table: 1, htable: 1, cloud: 2, note: 1 };
    const needView = !(tool === 'bom' || tool === 'rev' || tool === 'table' || tool === 'note' || tool === 'cloud');
    const sn = snap(X, Y, pend?.view); void free;
    if (needView && !sn) { setMsg('Tap on a view.'); return; }
    if (tool === 'bom') { addAnn({ id: aid(), t: 'bom', x: X, y: Y }); setTool('select'); return; }
    if (tool === 'rev') { addAnn({ id: aid(), t: 'rev', x: X, y: Y, rows: [{ rev: 'A', desc: 'FIRST ISSUE', date: ctx.date, by: dd.props.drawnBy }] }); setTool('select'); return; }
    if (tool === 'table') { addAnn({ id: aid(), t: 'table', x: X, y: Y, title: 'TABLE', rows: [['A', 'B'], ['1', '2']] }); setTool('select'); return; }
    if (tool === 'note') { addAnn({ id: aid(), t: 'note', at: [X, Y], text: txt, size: dd.textH }); setTool('select'); return; }
    if (tool === 'cloud') { const a = pend?.pts[0]; if (!a) { setPend({ view: '', pts: [[X, Y]] }); return; } addAnn({ id: aid(), t: 'cloud', x: Math.min(a[0], X), y: Math.min(a[1], Y), w: Math.max(6, Math.abs(X - a[0])), h: Math.max(6, Math.abs(Y - a[1])), tag: dd.sheets[sIdx].anns.filter(q => q.t === 'cloud').length ? String.fromCharCode(66 + dd.sheets[sIdx].anns.filter(q => q.t === 'cloud').length - 1) : 'A' }); setPend(null); setTool('select'); return; }
    const v = sn!.v, q = sn!.p, pts = pend && pend.view === v.id ? pend.pts : [], circ = pend && pend.view === v.id ? pend.circ : undefined;
    if (pend && pend.view !== v.id && pend.view) { setPend({ view: v.id, pts: [] }); setMsg('Start again in this view.'); return; }
    const next = (more: Pt[], c?: any) => setPend({ view: v.id, pts: more, circ: c });
    const done = () => { setPend(null); };
    const [u0, v0, u1, v1] = v.box;
    switch (tool) {
      case 'smart': case 'hor': case 'ver': case 'ali': {
        if (pts.length < 2) { next([...pts, q]); return; }
        const [a, b] = pts; let kind: any = tool;
        if (tool === 'smart') { const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = Math.abs(q[0] - mx), dy = Math.abs(q[1] - my), ex = Math.abs(b[0] - a[0]), ey = Math.abs(b[1] - a[1]); kind = ex < 1e-6 ? 'ver' : ey < 1e-6 ? 'hor' : dy > dx && ex >= ey * 0.2 ? 'hor' : dx >= dy && ey >= ex * 0.2 ? 'ver' : 'ali'; }
        addAnn({ id: aid(), t: 'dim', view: v.id, kind, a, b, p: q }); done(); return; }
      case 'ord': { if (pts.length < 2) { next([...pts, q]); return; } addAnn({ id: aid(), t: 'dim', view: v.id, kind: 'ord', a: pts[1], b: pts[1], p: q, org: pts[0] }); next([pts[0]]); return; }
      case 'chamfer': { if (pts.length < 2) { next([...pts, q]); return; } addAnn({ id: aid(), t: 'dim', view: v.id, kind: 'chamfer', a: pts[0], b: pts[1], p: q }); done(); return; }
      case 'ang': { if (pts.length < 3) { next([...pts, q]); return; } addAnn({ id: aid(), t: 'dim', view: v.id, kind: 'ang', c: pts[0], a: pts[1], b: pts[2], p: q }); done(); return; }
      case 'base': case 'chain': {
        if (!pts.length) { next([q]); return; }
        const last = pts[pts.length - 1], first = pts[0], k = pts.length, hz = pts.length === 1 ? Math.abs(q[0] - first[0]) >= Math.abs(q[1] - first[1]) : Math.abs(pts[1][0] - first[0]) >= Math.abs(pts[1][1] - first[1]), off = 8 / v.s;
        if (tool === 'base') addAnn({ id: aid(), t: 'dim', view: v.id, kind: hz ? 'hor' : 'ver', a: first, b: q, p: hz ? [q[0], v0 - off * (1 + 0.7 * (k - 1))] : [u0 - off * (1 + 0.7 * (k - 1)), q[1]] });
        else addAnn({ id: aid(), t: 'dim', view: v.id, kind: hz ? 'hor' : 'ver', a: last, b: q, p: hz ? [q[0], v0 - off] : [u0 - off, q[1]] });
        next([...pts, q]); return; }
      case 'dia': case 'rad': {
        if (circ) { addAnn({ id: aid(), t: 'dim', view: v.id, kind: tool as any, a: [circ.cx, circ.cy], b: [circ.cx + circ.r, circ.cy], p: q }); done(); return; }
        const c = circleNear(v.id, q, v); if (c) { next([], c); return; }
        const np = [...pts, q]; if (np.length < 3) { next(np); setMsg(`No circle there. Tap ${3 - np.length} more point${np.length === 2 ? '' : 's'} on the circle.`); return; }
        const f = circle3(np[0], np[1], np[2]); if (!f) { next([]); setMsg('Those three points are in a line. Try again.'); return; } next([], f); return; }
      case 'cmark': { const c = circleNear(v.id, q, v); if (!c) { setMsg('No circle found there. Tap on a circle.'); return; } addAnn({ id: aid(), t: 'cmark', view: v.id, c: [c.cx, c.cy], r: c.r }); return; }
      case 'hole': {
        if (circ) { addAnn({ id: aid(), t: 'hole', view: v.id, c: [circ.cx, circ.cy], r: circ.r, at: q, text: holeText(ctx, 2 * circ.r) }); done(); return; }
        const c = circleNear(v.id, q, v); if (!c) { setMsg('No circle found there. Tap on a hole.'); return; } next([], c); return; }
      case 'thread': {
        if (circ) { const th = threadText(2 * circ.r); addAnn({ id: aid(), t: 'thread', view: v.id, c: [circ.cx, circ.cy], r: circ.r, nom: th.nom, at: q, text: th.text, ext: th.ext }); done(); return; }
        const c = circleNear(v.id, q, v); if (!c) { setMsg('No circle found there. Tap on a hole or shaft end.'); return; } next([], c); return; }
      case 'htable': { addAnn({ id: aid(), t: 'htable', view: v.id, x: X, y: Y, org: [u0, v0] }); setTool('select'); return; }
      case 'cline': { if (pts.length < 1) { next([q]); return; } addAnn({ id: aid(), t: 'cline', view: v.id, a: pts[0], b: q }); done(); return; }
      case 'fill': { if (pts.length < 1) { next([q]); return; } addAnn({ id: aid(), t: 'fill', view: v.id, u0: Math.min(pts[0][0], q[0]), v0: Math.min(pts[0][1], q[1]), u1: Math.max(pts[0][0], q[0]), v1: Math.max(pts[0][1], q[1]), style: dd.hatch === 'none' ? 'iron' : dd.hatch, angle: 45, gap: 3 }); done(); return; }
      case 'measure': { if (pts.length < 1) { next([q]); return; } const dx = q[0] - pts[0][0], dy = q[1] - pts[0][1]; setMsg(`Distance ${r1(Math.hypot(dx, dy))} mm   Δx ${r1(dx)}   Δy ${r1(dy)}   angle ${r1((Math.atan2(dy, dx) * 180) / Math.PI)}°`); done(); return; }
      case 'leader': case 'balloon': case 'finish': case 'weld': case 'gdt': case 'datum': case 'dtarget': {
        if (!pts.length) { next([q]); return; }
        const target = pts[0], at = q, n = sh.anns.filter(a => a.t === 'balloon').length + 1;
        if (tool === 'leader') addAnn({ id: aid(), t: 'note', view: v.id, at, target, text: txt, size: dd.textH });
        else if (tool === 'balloon') addAnn({ id: aid(), t: 'balloon', view: v.id, at, target, text: String(n), shape: 'circle' });
        else if (tool === 'finish') addAnn({ id: aid(), t: 'finish', view: v.id, at, target, text: 'Ra 3.2', kind: 'machined' });
        else if (tool === 'weld') addAnn({ id: aid(), t: 'weld', view: v.id, at, target, type: weldT as any, size: '5', length: '', around: false, field: false, other: false });
        else if (tool === 'gdt') addAnn({ id: aid(), t: 'gdt', view: v.id, at, target, sym: gdtSym as any, tol: '0.1', mod: '', datums: ['A'], dia: gdtSym === 'pos' });
        else if (tool === 'datum') addAnn({ id: aid(), t: 'datum', view: v.id, at, target, letter: String.fromCharCode(65 + sh.anns.filter(a => a.t === 'datum').length % 26) });
        else addAnn({ id: aid(), t: 'dtarget', view: v.id, at, target, letter: 'A', n: String(sh.anns.filter(a => a.t === 'dtarget').length + 1) });
        done(); return; }
      case 'section': {
        const ch = cutChoices(v.cam, ctx).find(c => (secDir === 'h') === (c.dir === 'h')); if (!ch) { setMsg(`This view cannot be cut ${secDir === 'h' ? 'horizontally' : 'vertically'}. Choose the other direction, or another view.`); return; }
        const e = ch.axis === 'x' ? 0 : ch.axis === 'y' ? 1 : 2, ev: [number, number, number] = [0, 0, 0]; ev[e] = 1; const comp = secDir === 'h' ? dot(ev, v.cam.up) : dot(ev, v.cam.right), pos = (secDir === 'h' ? q[1] : q[0]) / comp;
        if (secKind === 'offset') { if (!pts.length) { next([q]); return; } const pos1 = (secDir === 'h' ? pts[0][1] : pts[0][0]) / comp; const cut = { axis: ch.axis, pos: pos1, pos2: pos, split: secDir === 'h' ? q[0] : q[1], flip: false, kind: 'offset' as const }; mk(() => null, v.id, cut); done(); return; }
        const cut = { axis: ch.axis, pos, flip: false, kind: secKind, split: secKind === 'half' ? (secDir === 'h' ? q[0] : q[1]) : undefined, halfSide: secKind === 'half' ? ('l' as const) : undefined };
        if (secKind === 'half') cut.split = secDir === 'h' ? (v.box[0] + v.box[2]) / 2 : (v.box[1] + v.box[3]) / 2;
        mk(() => null, v.id, cut); done(); return; }
      case 'detail': { if (!pts.length) { next([q]); return; } const rad = Math.max(1, Math.hypot(q[0] - pts[0][0], q[1] - pts[0][1])); mkv(v.id, (d, s, rr) => addDetail(d, s, ctx, rr, v.id, pts[0][0], pts[0][1], rad, round)); done(); return; }
      case 'aux': { if (!pts.length) { next([q]); return; } mkv(v.id, (d, s, rr) => addAux(d, s, ctx, rr, v.id, pts[0], q)); done(); return; }
      case 'crop': { if (!pts.length) { next([q]); return; } edit((_d, s) => { const w = s.views.find(x => x.id === v.id); if (w) w.crop = { u0: Math.min(pts[0][0], q[0]), v0: Math.min(pts[0][1], q[1]), u1: Math.max(pts[0][0], q[0]), v1: Math.max(pts[0][1], q[1]), round }; }); done(); return; }
      case 'breakout': {
        if (!pts.length) { next([q]); return; }
        const f: number[] = [...v.cam.fwd], axI = Math.abs(f[0]) > 0.9 ? 0 : Math.abs(f[1]) > 0.9 ? 1 : Math.abs(f[2]) > 0.9 ? 2 : -1; if (axI < 0) { setMsg('Broken-out sections work on the standard views.'); done(); return; }
        const { lo, hi } = meshBox(ctx); const depth = ((lo as number[])[axI] + (hi as number[])[axI]) / 2;
        edit((_d, s) => { const w = s.views.find(x => x.id === v.id); if (w) w.breakout = { u0: Math.min(pts[0][0], q[0]), v0: Math.min(pts[0][1], q[1]), u1: Math.max(pts[0][0], q[0]), v1: Math.max(pts[0][1], q[1]), depth }; }); done(); return; }
    }
  };
  // create a view in a copy of the drawing (placement needs the rendered result of the current sheet)
  const mkv = (_parent: string, f: (d: DrawingDoc, s: Sheet, rr: Rendered) => DView | null) => { let made: DView | null = null; edit((d, s) => { made = f(d, s, r); }); if (made) setSel((made as DView).id); };
  const mk = (_: () => null, parent?: string, cut?: any) => { if (!parent || !cut) return; mkv(parent, (d, s, rr) => addSection(d, s, ctx, rr, parent, cut)); };

  const rectOf = () => vpRef.current?.getBoundingClientRect?.();
  const onDown = (e: any) => {
    const b = rectOf(); if (!b) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { vpRef.current.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    if (ptrs.current.size === 2) { const [a, c] = [...ptrs.current.values()]; gest.current = { kind: 'pinch', d0: Math.hypot(a.x - c.x, a.y - c.y) || 1, mx: (a.x + c.x) / 2 - b.left, my: (a.y + c.y) / 2 - b.top, vp0: vp }; drag.current = null; tap.current = null; setOver(null); return; }
    if (ptrs.current.size > 2) return;
    const [X, Y] = toMm(e), shift = !!e.shiftKey || !!e.ctrlKey;
    if (e.button === 1 || tool === 'pan') { gest.current = { kind: 'pan', x0: e.clientX, y0: e.clientY, vp0: vp }; return; }
    if (tool === 'select') {
      const id = hitAt(X, Y);
      if (shift && id) { setMany(m => (m.includes(id) ? m.filter(q => q !== id) : [...(m.length || !sel ? m : [sel]), id])); setSel(id); return; }
      if (id && many.includes(id)) setSel(id); else { setSel(id); setMany([]); }
      if (id) { const k = sh.anns.some(a => a.id === id) ? 'ann' : 'view'; drag.current = { id, kind: k, x0: X, y0: Y, moved: false, start: cloneDoc(dd) }; }
      else gest.current = { kind: 'pan', x0: e.clientX, y0: e.clientY, vp0: vp };
      return;
    }
    tap.current = { x: e.clientX, y: e.clientY, X, Y, shift, id: e.pointerId, moved: false };
  };
  const onMove = (e: any) => {
    if (ptrs.current.has(e.pointerId)) ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gest.current;
    if (g?.kind === 'pinch' && ptrs.current.size >= 2) { const [a, c] = [...ptrs.current.values()], b = rectOf(), d = Math.hypot(a.x - c.x, a.y - c.y) || 1, mx = (a.x + c.x) / 2 - b.left, my = (a.y + c.y) / 2 - b.top, z = Math.max(0.05, Math.min(80, (g.vp0.z * d) / g.d0)), k = z / g.vp0.z; fitted.current = false; setVp({ z, x: mx - (g.mx - g.vp0.x) * k, y: my - (g.my - g.vp0.y) * k }); return; }
    if (g?.kind === 'pan') { fitted.current = false; setVp({ ...g.vp0, x: g.vp0.x + e.clientX - g.x0, y: g.vp0.y + e.clientY - g.y0 }); return; }
    const t = tap.current;
    if (t && !t.moved && Math.hypot(e.clientX - t.x, e.clientY - t.y) > 8) { tap.current = null; gest.current = { kind: 'pan', x0: t.x, y0: t.y, vp0: vp }; return; }   // a drag with a drawing tool pans the sheet
    const [X, Y] = toMm(e); if (coordRef.current) coordRef.current.textContent = `X ${r1(X)}   Y ${r1(r.page[1] - Y)} mm`;
    if (tool !== 'select' && tool !== 'pan') {
      if (skTool || mdTool) { const { p } = skPt(X, Y, pend?.pts.length ? pend.pts[pend.pts.length - 1] : undefined); cur.current = p; setHover(p); }
      else setHover((() => { const sn = snap(X, Y, pend?.view); return sn?.snapped ? [sn.v.cx + (sn.p[0] - sn.v.uc) * sn.v.s, sn.v.cy - (sn.p[1] - sn.v.vc) * sn.v.s] as Pt : null; })());
    }
    const dg = drag.current; if (!dg) return;
    const dx = X - dg.x0, dy = Y - dg.y0; if (!dg.moved && Math.hypot(dx, dy) < Math.max(1, px() * 4)) return; dg.moved = true;
    const nd = cloneDoc(dg.start), s2 = nd.sheets[sIdx];
    if (dg.kind === 'view') {
      const v = s2.views.find(q => q.id === dg.id)!; if (v.locked) return; const mx = v.align === 'h' ? 0 : dx, my = v.align === 'v' ? 0 : dy; v.cx += mx; v.cy += my;
      for (const c of s2.views) if (c.parent === v.id && c.align) { if (c.align === 'h') c.cx += dx; else c.cy += dy; }   // aligned children follow their parent
    } else {
      const a = s2.anns.find(q => q.id === dg.id)!, vi = 'view' in a && a.view ? r.views.find(w => w.id === a.view) : undefined, ku = vi ? 1 / vi.s : 1;
      if (a.t === 'geo') { const ids = many.includes(a.id) ? many : [a.id]; for (const q of s2.anns) if (q.t === 'geo' && ids.includes(q.id)) q.pts = q.pts.map(z => [z[0] + dx, z[1] + dy] as [number, number]); }
      else if (a.t === 'dim') a.p = [a.p[0] + dx * ku, a.p[1] - (vi ? dy * ku : -dy)];
      else if ('at' in a) a.at = [a.at[0] + dx * ku, a.at[1] + (vi ? -dy * ku : dy)];
      else if ('x' in a && 'y' in a) { a.x += dx; a.y += dy; }
    }
    setOver(nd);
  };
  const onUp = (e: any) => {
    ptrs.current.delete(e.pointerId);
    const g = gest.current; if (g?.kind === 'pinch') { if (ptrs.current.size < 2) gest.current = null; tap.current = null; return; }
    if (g?.kind === 'pan') { gest.current = null; return; }
    const t = tap.current; tap.current = null; if (t && t.id === e.pointerId) click(t.X, t.Y, t.shift);
    const dg = drag.current; drag.current = null; if (dg?.moved && over) { save(over); } setOver(null);
  };
  const onCancel = (e: any) => { ptrs.current.delete(e.pointerId); gest.current = null; tap.current = null; drag.current = null; setOver(null); };

  // ---------- panels ----------
  const Btn = ({ label, on, go, danger, id }: { label: string; on?: boolean; go: () => void; danger?: boolean; id?: string }) => <Pressable testID={id} onPress={go} style={[s.btn, on && s.btnOn, danger && s.btnDanger]}><Text style={[s.btnT, on && { color: '#fff' }, danger && { color: '#b71c1c' }]}>{label}</Text></Pressable>;
  const Num = ({ label, value, set, w = 64 }: { label: string; value: number | string | undefined; set: (v: number | undefined) => void; w?: number }) => { const [t, setT] = useState(String(value ?? '')); useEffect(() => setT(String(value ?? '')), [value]); return <View style={s.fld}><Text style={s.fl}>{label}</Text><TextInput value={t} onChangeText={setT} onBlur={() => set(nm(t))} onSubmitEditing={() => set(nm(t))} keyboardType="numeric" style={[s.inp, { width: w }]} /></View>; };
  const Txt = ({ label, value, set, w = 150, multi }: { label: string; value: string | undefined; set: (v: string) => void; w?: number; multi?: boolean }) => { const [t, setT] = useState(value ?? ''); useEffect(() => setT(value ?? ''), [value]); return <View style={s.fld}><Text style={s.fl}>{label}</Text><TextInput value={t} onChangeText={setT} onBlur={() => t !== (value ?? '') && set(t)} onSubmitEditing={() => !multi && t !== (value ?? '') && set(t)} multiline={multi} style={[s.inp, { width: w }, multi && { height: 54 }]} autoCapitalize="none" /></View>; };
  const Pick = <K extends string>({ label, value, opts, set }: { label: string; value: K | undefined; opts: { key: K; label: string }[]; set: (v: K) => void }) => <View style={s.fld}><Text style={s.fl}>{label}</Text><View style={s.row}>{opts.map(o => <Btn key={o.key} label={o.label} on={value === o.key} go={() => set(o.key)} />)}</View></View>;
  const upView = (f: (v: DView) => void) => edit((_d, s2) => { const v = s2.views.find(q => q.id === sel); if (v) f(v); });
  const upAnn = (f: (a: any) => void) => edit((_d, s2) => { const a = s2.anns.find(q => q.id === sel); if (a) f(a); });
  const sectionOf = (v: DView) => (v.cut ? (v.cut.axis) : undefined);
  const stdNames = Object.keys(VIEW_NAMES) as NamedView[];

  const ViewProps = selView && (() => {
    const v = selView, info = r.views.find(q => q.id === v.id), par = v.parent ? sh.views.find(q => q.id === v.parent) : undefined, cuts = info ? cutChoices(info.cam, ctx) : [];
    return <View style={s.panel}>
      <Text style={s.h}>{info?.label ?? 'View'}</Text>
      <View style={s.row}><Btn label="Sheet scale" on={v.scale === null} go={() => upView(x => { x.scale = null; })} />{SCALES.filter(q => q >= 0.05 && q <= 20).map(q => <Btn key={q} label={scaleText(q)} on={v.scale === q} go={() => upView(x => { x.scale = q; })} />)}</View>
      <Pick label="Display style" value={v.display} opts={DISPLAYS} set={d => upView(x => { x.display = d as Display; })} />
      <View style={s.row}><Btn label="Centre marks" on={v.marks} go={() => upView(x => { x.marks = !x.marks; })} /><Btn label="Label" on={v.showLabel} go={() => upView(x => { x.showLabel = !x.showLabel; })} /><Btn label="Show scale" on={v.showScale} go={() => upView(x => { x.showScale = !x.showScale; })} /><Btn label="Lock position" on={!!v.locked} go={() => upView(x => { x.locked = !x.locked; })} /></View>
      <Txt label="Label text (empty: automatic)" value={v.label} set={t => upView(x => { x.label = t || undefined; })} w={200} />
      {stdNames.includes(v.kind as NamedView) && <Pick label="Orientation" value={v.kind as NamedView} opts={stdNames.map(k => ({ key: k, label: VIEW_NAMES[k] }))} set={k => upView(x => { x.kind = k; })} />}
      {v.kind === 'section' && v.cut && <>
        <Pick label="Kind" value={v.cut.kind} opts={[{ key: 'full', label: 'Full' }, { key: 'half', label: 'Half' }, { key: 'offset', label: 'Offset' }]} set={k => upView(x => { if (x.cut) { x.cut.kind = k; if (k === 'offset' && x.cut.pos2 === undefined) x.cut.pos2 = x.cut.pos; } })} />
        <View style={s.row}><Num label={`Position ${v.cut.axis.toUpperCase()} (mm)`} value={r1(v.cut.pos)} set={n => upView(x => { if (x.cut && n !== undefined) x.cut.pos = n; })} />{v.cut.kind === 'offset' && <Num label="Second position" value={r1(v.cut.pos2 ?? v.cut.pos)} set={n => upView(x => { if (x.cut && n !== undefined) x.cut.pos2 = n; })} />}<Btn label="Flip direction" go={() => upView(x => { if (x.cut) x.cut.flip = !x.cut.flip; })} />{v.cut.kind === 'half' && <Btn label="Other half" go={() => upView(x => { if (x.cut) x.cut.halfSide = x.cut.halfSide === 'r' ? 'l' : 'r'; })} />}</View>
        <Pick label="Hatch" value={(v.hatch ?? dd.hatch) as HatchStyle} opts={HATCHES} set={h => upView(x => { x.hatch = h; })} />
      </>}
      {v.kind === 'detail' && v.detail && <View style={s.row}><Num label="Circle radius (mm)" value={r1(v.detail.r)} set={n => upView(x => { if (x.detail && n) x.detail.r = n; })} /><Btn label={v.detail.round ? 'Round' : 'Square'} go={() => upView(x => { if (x.detail) x.detail.round = !x.detail.round; })} /></View>}
      {v.kind === 'aux' && v.aux && <Btn label="Flip side" go={() => upView(x => { if (x.aux) x.aux.flip = !x.aux.flip; })} />}
      <Text style={s.fl}>Add from this view</Text>
      <View style={s.row}>{(['r', 'l', 'u', 'd'] as const).map(d => <Btn key={d} label={`Projected ${{ r: 'right', l: 'left', u: 'up', d: 'down' }[d]}`} go={() => mkv(v.id, (dn, s2, rr) => addProjected(dn, s2, rr, v.id, d))} />)}</View>
      <View style={s.row}><Btn label="Horizontal break" go={() => info && upView(x => { const m = (info.box[1] + info.box[3]) / 2, h = (info.box[3] - info.box[1]) * 0.08; x.breaks = [...(x.breaks ?? []), { dir: 'v', a: m - h, b: m + h, style: 'zigzag' }]; })} /><Btn label="Vertical break" go={() => info && upView(x => { const m = (info.box[0] + info.box[2]) / 2, h = (info.box[2] - info.box[0]) * 0.08; x.breaks = [...(x.breaks ?? []), { dir: 'h', a: m - h, b: m + h, style: 'zigzag' }]; })} />{(v.breaks?.length || v.crop || v.breakout) ? <Btn label="Remove breaks, crop, cut-out" go={() => upView(x => { x.breaks = undefined; x.crop = undefined; x.breakout = undefined; })} /> : null}</View>
      {v.breaks?.length ? <Pick label="Break line" value={v.breaks[0].style} opts={[{ key: 'straight', label: 'Straight' }, { key: 'zigzag', label: 'Zigzag' }, { key: 'curved', label: 'Curved' }]} set={k => upView(x => { x.breaks = x.breaks?.map(b => ({ ...b, style: k })); })} /> : null}
      <View style={s.row}><Btn label="Dimension this view" go={() => info && edit((_d, s2) => { const seen = new Set<string>(); void seen; const add = autoDims({ ...s2, anns: s2.anns }, { ...r, views: r.views.filter(q => q.id === v.id) }); s2.anns.push(...add); setMsg(`${add.length} dimensions added`); })} /><Btn label="Delete view" danger go={() => edit((_d, s2) => { const kill = new Set([v.id]); s2.views.forEach(q => q.parent && kill.has(q.parent) && q.kind !== 'top' && kill.add(q.id)); s2.views = s2.views.filter(q => !kill.has(q.id)); s2.anns = s2.anns.filter(a => !('view' in a && a.view && kill.has(a.view))); setSel(null); })} /></View>
      {par && <Text style={s.k}>Made from {r.views.find(q => q.id === par.id)?.label}. Moving that view keeps aligned views in line.</Text>}
      {sectionOf(v) && <Text style={s.k}>Cut on the {sectionOf(v)!.toUpperCase()} axis.</Text>}
    </View>;
  })();

  const addProjected = (dn: DrawingDoc, s2: Sheet, rr: Rendered, parentId: string, d: 'r' | 'l' | 'u' | 'd') => {
    const par = s2.views.find(q => q.id === parentId)!, pk = par.kind as NamedView, third = dn.projection === 'third';
    // which named view lies in direction d of the parent, in first or third angle
    const map: Record<string, Record<string, NamedView>> = { front: { r: 'left', l: 'right', u: 'bottom', d: 'top' }, back: { r: 'right', l: 'left', u: 'bottom', d: 'top' }, top: { r: 'left', l: 'right', u: 'back', d: 'front' }, bottom: { r: 'left', l: 'right', u: 'front', d: 'back' }, left: { r: 'back', l: 'front', u: 'bottom', d: 'top' }, right: { r: 'front', l: 'back', u: 'bottom', d: 'top' } };
    const firstKinds = map[pk]?.[d]; if (!firstKinds) { setMsg('Projected views come from the standard views (front, top, right…).'); return null; }
    const opp: Record<string, NamedView> = { front: 'back', back: 'front', left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
    const kind = third ? opp[firstKinds] : firstKinds;
    const exists = s2.views.find(q => q.kind === kind && q.parent === parentId); if (exists) { setMsg('That view is already on the sheet.'); return null; }
    return addModelView(dn, s2, ctx, rr, kind, { parent: parentId, proj: d } as any);
  };

  const AnnProps = selAnn && (() => {
    const a = selAnn;
    return <View style={s.panel}>
      <Text style={s.h}>{a.t === 'dim' ? `Dimension (${a.kind})` : a.t.toUpperCase()}</Text>
      {a.t === 'dim' && <>
        <Txt label="Text (empty: measured value)" value={a.text} set={t => upAnn(x => { x.text = t || undefined; })} />
        <Pick label="Tolerance" value={(a.tol?.type ?? 'none') as TolType} opts={[{ key: 'none', label: 'None' }, { key: 'basic', label: 'Basic' }, { key: 'symmetric', label: '±' }, { key: 'bilateral', label: 'Bilateral' }, { key: 'limit', label: 'Limits' }, { key: 'fit', label: 'Fit' }, { key: 'ref', label: 'Ref' }]} set={k => upAnn(x => { x.tol = k === 'none' ? undefined : { type: k, plus: x.tol?.plus ?? 0.1, minus: x.tol?.minus ?? 0.1, fit: x.tol?.fit ?? 'H7' }; })} />
        {a.tol && a.tol.type !== 'none' && a.tol.type !== 'basic' && a.tol.type !== 'ref' && (a.tol.type === 'fit' ? <Txt label="Fit (e.g. H7, g6)" value={a.tol.fit} set={t => upAnn(x => { x.tol.fit = t; })} w={80} /> : <View style={s.row}><Num label={a.tol.type === 'symmetric' ? '± (mm)' : '+ (mm)'} value={a.tol.plus} set={n => upAnn(x => { x.tol.plus = n ?? 0; if (x.tol.type === 'symmetric') x.tol.minus = n ?? 0; })} />{a.tol.type !== 'symmetric' && <Num label="− (mm)" value={a.tol.minus} set={n => upAnn(x => { x.tol.minus = n ?? 0; })} />}</View>)}
        <View style={s.row}><Num label="Decimals" value={a.prec ?? dd.prec} set={n => upAnn(x => { x.prec = n === undefined ? undefined : Math.max(0, Math.min(4, Math.round(n))); })} w={50} /><Txt label="Prefix" value={a.prefix} set={t => upAnn(x => { x.prefix = t || undefined; })} w={60} /><Txt label="Suffix" value={a.suffix} set={t => upAnn(x => { x.suffix = t || undefined; })} w={60} /></View>
        <Pick label="Arrows" value={a.arrow ?? dd.arrow} opts={[{ key: 'filled', label: 'Filled' }, { key: 'open', label: 'Open' }, { key: 'dot', label: 'Dot' }, { key: 'slash', label: 'Slash' }, { key: 'none', label: 'None' }]} set={k => upAnn(x => { x.arrow = k; })} />
        <Btn label="Reference dimension ( )" on={!!a.ref} go={() => upAnn(x => { x.ref = !x.ref; })} />
      </>}
      {a.t === 'geo' && <><Pick label="Line type" value={a.lt ?? 'cont'} opts={[{ key: 'cont', label: 'Solid' }, { key: 'hid', label: 'Hidden' }, { key: 'cen', label: 'Centre' }]} set={k => upAnn(x => { x.lt = k; })} /><Num label="Weight (mm)" value={a.w ?? 0.5} set={n => upAnn(x => { if (n && n > 0) x.w = n; })} /><Text style={s.k}>{a.g === 'pl' ? `${a.pts.length} points${a.closed ? ', closed' : ''}` : a.g === 'ci' ? `Circle, radius ${r1(a.r ?? 0)} mm` : a.g === 'ar' ? `Arc, radius ${r1(a.r ?? 0)} mm` : `Ellipse ${r1(a.rx ?? 0)} × ${r1(a.ry ?? 0)} mm`}</Text></>}
      {a.t === 'note' && <><Txt label="Text" value={a.text} set={t => upAnn(x => { x.text = t; })} w={220} multi /><Num label="Text height (mm)" value={a.size} set={n => upAnn(x => { if (n) x.size = n; })} /><Pick label="Frame" value={a.box ?? 'none'} opts={[{ key: 'none', label: 'None' }, { key: 'box', label: 'Box' }, { key: 'circle', label: 'Circle' }]} set={k => upAnn(x => { x.box = k; })} /></>}
      {a.t === 'balloon' && <><Txt label="Item number" value={a.text} set={t => upAnn(x => { x.text = t; })} w={80} /><Pick label="Shape" value={a.shape} opts={[{ key: 'circle', label: 'Circle' }, { key: 'triangle', label: 'Triangle' }, { key: 'hex', label: 'Hexagon' }, { key: 'box', label: 'Box' }]} set={k => upAnn(x => { x.shape = k; })} /></>}
      {a.t === 'finish' && <><Txt label="Roughness text" value={a.text} set={t => upAnn(x => { x.text = t; })} w={100} /><Pick label="Symbol" value={a.kind} opts={[{ key: 'machined', label: 'Machining required' }, { key: 'basic', label: 'Basic' }, { key: 'prohibited', label: 'No machining' }]} set={k => upAnn(x => { x.kind = k; })} /></>}
      {a.t === 'weld' && <><Pick label="Weld" value={a.type} opts={WELDS} set={k => upAnn(x => { x.type = k; })} /><View style={s.row}><Txt label="Size" value={a.size} set={t => upAnn(x => { x.size = t; })} w={60} /><Txt label="Length" value={a.length} set={t => upAnn(x => { x.length = t; })} w={60} /></View><View style={s.row}><Btn label="All around" on={a.around} go={() => upAnn(x => { x.around = !x.around; })} /><Btn label="Field weld" on={a.field} go={() => upAnn(x => { x.field = !x.field; })} /><Btn label="Other side" on={a.other} go={() => upAnn(x => { x.other = !x.other; })} /></View></>}
      {a.t === 'gdt' && <><Pick label="Characteristic" value={a.sym} opts={GDT} set={k => upAnn(x => { x.sym = k; })} /><View style={s.row}><Txt label="Tolerance" value={a.tol} set={t => upAnn(x => { x.tol = t; })} w={70} /><Txt label="Modifier (M, L, P)" value={a.mod} set={t => upAnn(x => { x.mod = t; })} w={70} /><Txt label="Datums (A,B,C)" value={a.datums.join(',')} set={t => upAnn(x => { x.datums = t.split(/[ ,]+/).filter(Boolean).slice(0, 3); })} w={90} /></View><Btn label="Diameter zone Ø" on={a.dia} go={() => upAnn(x => { x.dia = !x.dia; })} /></>}
      {(a.t === 'datum' || a.t === 'dtarget') && <Txt label="Letter" value={a.letter} set={t => upAnn(x => { x.letter = t.toUpperCase().slice(0, 2); })} w={60} />}
      {a.t === 'dtarget' && <Txt label="Target number" value={a.n} set={t => upAnn(x => { x.n = t; })} w={60} />}
      {a.t === 'dxf' && <><Text style={s.k}>{a.name}: {a.prims.length} items. Drag to move.</Text><Num label="Scale (1 = true size)" value={a.s} set={n => upAnn(x => { if (n && n > 0) x.s = n; })} w={80} /></>}
      {a.t === 'thread' && <><Txt label="Thread" value={a.text} set={t => upAnn(x => { x.text = t; })} w={200} /><Num label="Nominal diameter (mm)" value={r1(a.nom * 2)} set={n => upAnn(x => { if (n) x.nom = n / 2; })} /></>}
      {a.t === 'hole' && <Txt label="Callout" value={a.text} set={t => upAnn(x => { x.text = t; })} w={200} />}
      {a.t === 'cloud' && <Txt label="Revision tag" value={a.tag} set={t => upAnn(x => { x.tag = t; })} w={60} />}
      {a.t === 'fill' && <><Pick label="Pattern" value={a.style} opts={HATCHES} set={k => upAnn(x => { x.style = k; })} /><View style={s.row}><Num label="Angle (°)" value={a.angle} set={n => upAnn(x => { x.angle = n ?? 45; })} /><Num label="Spacing (mm)" value={a.gap} set={n => upAnn(x => { if (n) x.gap = n; })} /></View></>}
      {a.t === 'table' && <><Txt label="Title" value={a.title} set={t => upAnn(x => { x.title = t; })} w={160} /><Txt label="Cells (rows on lines, columns with ;)" value={a.rows.map(rw => rw.join(';')).join('\n')} set={t => upAnn(x => { x.rows = t.split('\n').map(l => l.split(';')); })} w={240} multi /></>}
      {a.t === 'rev' && <><Text style={s.fl}>One revision per line: REV; DESCRIPTION; DATE; BY</Text><Txt label="Revisions" value={a.rows.map(q => [q.rev, q.desc, q.date, q.by].join('; ')).join('\n')} set={t => upAnn(x => { x.rows = t.split('\n').filter(Boolean).map(l => { const c = l.split(';').map(z => z.trim()); return { rev: c[0] ?? '', desc: c[1] ?? '', date: c[2] ?? '', by: c[3] ?? '' }; }); })} w={280} multi /></>}
      {a.t === 'htable' && <Pick label="Table style" value={a.style ?? 'xy'} opts={[{ key: 'xy', label: 'X and Y' }, { key: 'polar', label: 'Radius and angle' }, { key: 'group', label: 'Grouped by size' }]} set={k => upAnn(x => { x.style = k; })} />}
      {a.t === 'htable' && <Text style={s.k}>Lists the round features found in the view, with their position from the lower left corner.</Text>}
      {a.t !== 'geo' && <Pick label="Layer" value={(a.layer ?? 'note') as Layer} opts={LAYERS.slice(3, 7).map(l => ({ key: l.key, label: l.label.split(' ')[0] }))} set={k => upAnn(x => { x.layer = k; })} />}
      <Btn label="Delete" danger go={() => edit((_d, s2) => { s2.anns = s2.anns.filter(q => q.id !== a.id); setSel(null); })} />
    </View>;
  })();

  const numIn = (label: string, k: keyof typeof sk, w = 56) => <View key={String(k)} style={s.fld}><Text style={s.fl}>{label}</Text><TextInput style={[s.inp, { width: w }]} keyboardType="numeric" value={String(sk[k])} onChangeText={t => { const v = parseFloat(t.replace(',', '.')); setSk(o => ({ ...o, [k]: isNaN(v) ? 0 : v })); }} /></View>;
  const tgl = (label: string, on: boolean, go: () => void) => <Btn label={`${label}: ${on ? 'on' : 'off'}`} on={on} go={go} />;
  const toolBtn = (t: Tool) => <Btn key={t.key} id={`dw-${t.key}`} label={t.label} on={tool === t.key} go={() => { setTool(tool === t.key ? 'select' : t.key); setSel(null); setMsg(t.help); }} />;
  const setDoc = (f: (d: DrawingDoc) => void) => edit(d => f(d));
  const P = dd.props;
  const propRows: [keyof typeof P, string][] = [['company', 'Company'], ['title', 'Title'], ['drawnBy', 'Drawn by'], ['checkedBy', 'Checked by'], ['approvedBy', 'Approved by'], ['drawingNo', 'Drawing number'], ['revision', 'Revision'], ['partNo', 'Part number'], ['description', 'Description'], ['finish', 'Finish'], ['tolerance', 'General tolerance'], ['weight', 'Mass text (auto: calculated)']];
  const sheetSvg = () => toSvg(r.prims, r.page, { px: 3 });
  const overlaySvg = (() => {
    const [W, H] = r.page; let o = '';
    const box = (b: number[], col: string) => `<rect x="${b[0] - 1.5}" y="${b[1] - 1.5}" width="${b[2] - b[0] + 3}" height="${b[3] - b[1] + 3}" fill="none" stroke="${col}" stroke-width="1.5" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>`;
    for (const id of new Set([...(sel ? [sel] : []), ...many])) { const h = r.hits.find(q => q.id === id); if (h) o += box(h.box, id === sel && !many.length ? '#1565c0' : '#42a5f5'); }
    if (pend) for (const q of pend.pts) { if (!pend.view) { o += `<circle cx="${q[0]}" cy="${q[1]}" r="${mmpp * 4}" fill="#e65100"/>`; continue; } const v = r.views.find(w => w.id === pend.view); if (v) { const X = v.cx + (q[0] - v.uc) * v.s, Y = v.cy - (q[1] - v.vc) * v.s; o += `<circle cx="${X}" cy="${Y}" r="${mmpp * 4}" fill="#e65100"/>`; } }
    if (pend?.circ) { const v = r.views.find(w => w.id === pend.view); if (v) o += `<circle cx="${v.cx + (pend.circ.cx - v.uc) * v.s}" cy="${v.cy - (pend.circ.cy - v.vc) * v.s}" r="${pend.circ.r * v.s}" fill="none" stroke="#e65100" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`; }
    if (hover && tool !== 'select' && tool !== 'pan') {
      o += `<circle cx="${hover[0]}" cy="${hover[1]}" r="${mmpp * 7}" fill="none" stroke="#2e7d32" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
      if ((skTool || mdTool) && pend) { const gb = ghostOf(hover); o += primsSvg(gb.flatMap(b => geoPrims(b)), '#e65100'); if (mdTool && pend.pts.length) o += `<line x1="${pend.pts[0][0]}" y1="${pend.pts[0][1]}" x2="${hover[0]}" y2="${hover[1]}" stroke="#78909c" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>`; }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" style="width:100%;height:100%;display:block">${o}</svg>`;
  })();

  const root = (
    <View style={[s.wrap, full && Platform.OS === 'web' ? ({ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 } as any) : null]} testID="drawing-studio">
      {ribOpen && <View style={s.tabs}>{([['view', 'View layout'], ['ann', 'Annotation'], ['sketch', 'Sketch'], ['sheet', 'Sheet'], ['asm', 'Assembly'], ['out', 'Output']] as const).map(([k, l]) => <Pressable key={k} testID={`dw-tab-${k}`} onPress={() => setGroup(k)} style={[s.tab, group === k && s.tabOn]}><Text style={[s.tabT, group === k && { color: '#fff' }]}>{l}</Text></Pressable>)}</View>}
      {ribOpen && <ScrollView style={[s.ribbon, { maxHeight: p.phone ? 190 : 300 }]} contentContainerStyle={{ gap: 4 }} nestedScrollEnabled>
        {group === 'view' && <>
          <View style={s.row}>{VIEW_TOOLS.map(toolBtn)}</View>
          {tool === 'section' && <View style={s.row}><Pick label="Cut" value={secKind} opts={[{ key: 'full', label: 'Full' }, { key: 'half', label: 'Half' }, { key: 'offset', label: 'Offset' }]} set={setSecKind} /><Pick label="Line runs" value={secDir} opts={[{ key: 'h', label: 'Across (horizontal)' }, { key: 'v', label: 'Up and down (vertical)' }]} set={setSecDir} /></View>}
          {(tool === 'detail' || tool === 'crop') && <Pick label="Shape" value={round ? 'r' : 's'} opts={[{ key: 'r', label: 'Circle' }, { key: 's', label: 'Square' }]} set={k => setRound(k === 'r')} />}
          <Text style={s.fl}>Add a standard view</Text>
          <View style={s.row}>{stdNames.map(k => <Btn key={k} id={`dw-add-${k}`} label={VIEW_NAMES[k]} go={() => mkv('', (d, s2, rr) => addModelView(d, s2, ctx, rr, k, k === 'iso' || k === 'dimetric' || k === 'trimetric' ? { display: 'edges', marks: false } : {}))} />)}</View>
        </>}
        {group === 'ann' && <>
          <Text style={s.fl}>Dimensions</Text><View style={s.row}>{DIM_TOOLS.map(toolBtn)}</View>
          <Text style={s.fl}>Notes and symbols</Text><View style={s.row}>{NOTE_TOOLS.map(toolBtn)}</View>
          {(tool === 'note' || tool === 'leader') && <Txt label="Note text" value={txt} set={setTxt} w={240} />}
          {tool === 'gdt' && <Pick label="Characteristic" value={gdtSym as any} opts={GDT} set={k => setGdtSym(k)} />}
          {tool === 'weld' && <Pick label="Weld" value={weldT as any} opts={WELDS} set={k => setWeldT(k)} />}
          <Text style={s.fl}>Standard notes and tables</Text>
          <View style={s.row}>{SYMBOLS.map(y => <Btn key={y.key} id={`dw-sym-${y.key}`} label={y.label} go={() => edit((_d, s2) => { const [tx, ty] = nextTablePos(s2, r, ctx); s2.anns.push({ id: aid(), t: 'symbol', x: tx, y: ty, name: y.key }); })} />)}</View>
          <View style={s.row}>
            <Btn id="dw-auto-dims" label="Model items: auto dimensions" go={() => edit((_d, s2) => { const add = autoDims(s2, r); s2.anns.push(...add); setMsg(add.length ? `${add.length} dimensions added` : 'Everything is already dimensioned.'); })} />
            <Btn id="dw-auto-marks" label="Auto centre marks" go={() => edit((_d, s2) => { const have = (vv: string, c: any) => s2.anns.some(a => a.t === 'cmark' && a.view === vv && Math.abs(a.c[0] - c.cx) < 1e-3 && Math.abs(a.c[1] - c.cy) < 1e-3); let n = 0; for (const c of r.circles) if (c.c.full && !have(c.view, c.c)) { s2.anns.push({ id: aid(), t: 'cmark', view: c.view, c: [c.c.cx, c.c.cy], r: c.c.r }); n++; } setMsg(`${n} centre marks added`); })} />
            <Btn id="dw-auto-balloon" label="Auto balloon" go={() => edit((_d, s2) => { const nb = autoBalloons(s2, r, ctx); s2.anns.push(...nb); setMsg(`${nb.length} balloon${nb.length === 1 ? '' : 's'} added`); })} />
            {pend && (tool === 'base' || tool === 'chain') && <Btn label="Done" go={() => setPend(null)} />}
          </View>
        </>}
        {group === 'sketch' && <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled><View style={[s.row, { flexWrap: 'nowrap' }]}><Text style={[s.fl, { width: 44 }]}>Draw</Text>{DRAW_TOOLS.map(([k, l, h]) => <Btn key={k} id={`dw-sk-${k}`} label={l} on={tool === `sk:${k}`} go={() => pickTool(`sk:${k}`, h)} />)}</View></ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled><View style={[s.row, { flexWrap: 'nowrap' }]}><Text style={[s.fl, { width: 44 }]}>Modify</Text>{MOD_TOOLS.map(([k, l, h]) => <Btn key={k} id={`dw-md-${k}`} label={l} on={tool === `md:${k}`} go={() => pickTool(`md:${k}`, h)} />)}<Btn id="dw-explode" label="Explode" go={explodeSel} /><Btn id="dw-join" label="Join" go={joinSel} /><Btn id="dw-erase" label="Erase" danger go={erase} /><Btn label="Select all" go={() => { setMany(geos.map(g => g.id)); setTool('select'); }} />{skTool === 'pline' && <><Btn id="dw-finish" label="Finish" on go={() => finishPline()} /><Btn label="Close shape" go={() => finishPline(true)} /></>}</View></ScrollView>
          <View style={[s.row, { alignItems: 'flex-end', minHeight: 50 }]}>
            {!p.phone && !(skTool === 'poly' || mdTool === 'scale' || mdTool === 'offset' || mdTool === 'fillet' || mdTool === 'chamfer' || mdTool === 'mirror' || mdTool === 'arrayr' || mdTool === 'arrayp') && <Text style={s.k}>Pick a tool. Its settings show here. Command line: L, PL, REC, POL, C, ARC, EL, M, CO, RO, MI, SC, O, F, CHA, AR, X, J, E; points 50,40 · @10,5 · @25&lt;30.</Text>}
            {skTool === 'poly' && <>{numIn('Sides', 'sides', 46)}<Btn label={sk.inscribed ? 'Corner at the point' : 'Side at the point'} go={() => setSk(o => ({ ...o, inscribed: !o.inscribed }))} /></>}
            {mdTool === 'scale' && numIn('Factor', 'scK')}
            {mdTool === 'offset' && numIn('Distance (mm)', 'offD', 70)}{mdTool === 'fillet' && numIn('Radius (mm)', 'filletR', 70)}{mdTool === 'chamfer' && numIn('Distance (mm)', 'chamD', 70)}
            {mdTool === 'mirror' && <Btn label={sk.keep ? 'Keep the original' : 'Delete the original'} go={() => setSk(o => ({ ...o, keep: !o.keep }))} />}
            {mdTool === 'arrayr' && <>{numIn('Rows', 'rows', 46)}{numIn('Columns', 'cols', 46)}{numIn('Row gap (mm)', 'dy', 64)}{numIn('Column gap (mm)', 'dx', 64)}<Btn id="dw-array" label="Make array" go={makeArray} /></>}
            {mdTool === 'arrayp' && <>{numIn('Items', 'polN', 46)}{numIn('Fill angle (°)', 'polFill', 64)}<Btn label={sk.turn ? 'Turn the copies' : 'Keep them upright'} go={() => setSk(o => ({ ...o, turn: !o.turn }))} /></>}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled><View style={[s.row, { flexWrap: 'nowrap', alignItems: 'flex-end' }]}><Text style={[s.fl, { width: 44 }]}>Settings</Text>{tgl('Ortho', sk.ortho, () => setSk(o => ({ ...o, ortho: !o.ortho })))}{tgl('Grid snap', sk.grid, () => setSk(o => ({ ...o, grid: !o.grid })))}{tgl('Object snap', sk.osnap, () => setSk(o => ({ ...o, osnap: !o.osnap })))}{numIn('Grid mm', 'gridG', 46)}
            {(['cont', 'hid', 'cen'] as const).map(k => <Btn key={k} label={k === 'cont' ? 'Solid' : k === 'hid' ? 'Hidden' : 'Centre'} on={sk.lt === k} go={() => setSk(o => ({ ...o, lt: k }))} />)}{numIn('Weight mm', 'w', 52)}</View></ScrollView>
        </>}
        {group === 'sheet' && <>
          <View style={s.row}>{dd.sheets.map((q, i) => <Btn key={q.id} id={`dw-sheet-${i}`} label={q.name} on={i === sIdx} go={() => { setSi(i); setSel(null); }} />)}<Btn id="dw-add-sheet" label="+ Sheet" go={() => edit((d, _s) => { const n = d.sheets.length + 1, ns: Sheet = { id: uid('sh'), name: `Sheet${n}`, size: cloneDoc(d.sheets[sIdx].size), scale: d.sheets[sIdx].scale, views: [], anns: [] }; d.sheets.push(ns); setSi(d.sheets.length - 1); })} />{dd.sheets.length > 1 && <Btn label="Delete sheet" danger go={() => edit(d => { d.sheets.splice(sIdx, 1); setSi(0); setSel(null); })} />}</View>
          <Txt label="Sheet name" value={sh.name} set={t => edit((_d, s2) => { s2.name = t || s2.name; })} w={140} />
          <Text style={s.fl}>Sheet size</Text><PrintOptions setup={sh.size} set={z => edit((_d, s2) => { s2.size = { ...z, margin: 0 }; })} margins={false} testID="sheet-size" />
          <Text style={s.fl}>Sheet scale</Text><View style={s.row}>{SCALES.map(q => <Btn key={q} label={scaleText(q)} on={Math.abs(sh.scale - q) < 1e-4} go={() => edit((_d, s2) => { s2.scale = q; })} />)}</View>
          <Pick label="Projection" value={dd.projection} opts={[{ key: 'third', label: 'Third angle' }, { key: 'first', label: 'First angle' }]} set={k => setDoc(d => { d.projection = k; })} />
          <Pick label="Standard" value={dd.std} opts={[{ key: 'iso', label: 'ISO' }, { key: 'ansi', label: 'ANSI' }]} set={k => setDoc(d => { d.std = k; })} />
          <Pick label="Units" value={dd.units} opts={[{ key: 'mm', label: 'Millimetres' }, { key: 'in', label: 'Inches' }]} set={k => setDoc(d => { d.units = k; })} />
          <View style={s.row}><Num label="Decimals" value={dd.prec} set={n => setDoc(d => { d.prec = Math.max(0, Math.min(4, Math.round(n ?? 1))); })} w={50} /><Num label="Text height (mm)" value={dd.textH} set={n => setDoc(d => { if (n) d.textH = Math.max(1.5, Math.min(10, n)); })} w={60} /><Btn label="Dual dimensions" on={dd.dual} go={() => setDoc(d => { d.dual = !d.dual; })} /></View>
          <Pick label="Arrows" value={dd.arrow} opts={[{ key: 'filled', label: 'Filled' }, { key: 'open', label: 'Open' }, { key: 'dot', label: 'Dot' }, { key: 'slash', label: 'Slash' }, { key: 'none', label: 'None' }]} set={k => setDoc(d => { d.arrow = k; })} />
          <Pick label="Section hatch" value={dd.hatch} opts={HATCHES} set={k => setDoc(d => { d.hatch = k; })} />
          <View style={s.row}><Btn label="Border" on={dd.border} go={() => setDoc(d => { d.border = !d.border; })} /><Btn label="Zones (A–D, 1–8)" on={dd.zones} go={() => setDoc(d => { d.zones = !d.zones; })} /><Btn label="Title block" on={dd.titleBlock} go={() => setDoc(d => { d.titleBlock = !d.titleBlock; })} /></View>
          <Text style={s.fl}>Layers</Text><View style={s.row}>{LAYERS.map(l => <Btn key={l.key} label={l.label} on={dd.layers[l.key] !== false} go={() => setDoc(d => { d.layers[l.key] = d.layers[l.key] === false; })} />)}</View>
          <Text style={s.fl}>Title block templates</Text>
          <View style={s.row}>{TEMPLATES().map(t => <Btn key={t.name} id={`dw-tpl-${t.name}`} label={t.name} go={() => { setDoc(d => { d.props = { ...d.props, ...t.props } as any; if (t.std) d.std = t.std; if (t.arrow) d.arrow = t.arrow; }); setMsg(`Template "${t.name}" applied.`); }} />)}<Btn id="dw-tpl-save" label="Save current as template" go={() => { try { const all = JSON.parse(localStorage.getItem('dwg-tb-templates') ?? '[]'); const name = `${P.company || 'My template'} ${all.length + 1}`; all.push({ name, props: { company: P.company, checkedBy: P.checkedBy, approvedBy: P.approvedBy, finish: P.finish, tolerance: P.tolerance, drawnBy: P.drawnBy }, std: dd.std, arrow: dd.arrow }); localStorage.setItem('dwg-tb-templates', JSON.stringify(all)); setMsg(`Saved as "${name}".`); } catch { setMsg('Could not save the template here.'); } }} /></View>
          <Text style={s.fl}>Title block properties</Text><View style={s.row}>{propRows.map(([k, l]) => <Txt key={k} label={l} value={P[k]} set={t => setDoc(d => { (d.props as any)[k] = t; })} w={160} />)}</View>
          <Btn id="dw-rearrange" label="Arrange the standard views again" go={() => edit((d, s2) => { arrangeStandard(d, s2, ctx); setSel(null); })} />
        </>}
        {group === 'asm' && (() => {
          const asm: Asm = doc.asm ?? defaultAsm(), names = p.parts.map(q => q.name), setAsm = (f: (a: Asm) => void) => { const n: Asm = JSON.parse(JSON.stringify(asm)); f(n); commit(d => ({ ...d, asm: n })); };
          return <>
            <Text style={s.k}>Build an assembly drawing from the parts in this workspace. Each part keeps its own shape; here you place them, spread them apart for an exploded view, and the bill of materials and balloons follow.</Text>
            <View style={s.row}><Btn id="dw-asm-on" label={asm.on ? 'Assembly drawing: on' : 'Assembly drawing: off'} on={asm.on} go={() => setAsm(a => { a.on = !a.on; if (a.on && !a.items.length) { a.items = arrangeInRow(p.parts, names); } })} /></View>
            {asm.on && <>
              <Text style={s.fl}>Parts in the assembly</Text>
              <View style={s.row}>{names.map(n => <Btn key={n} label={n} on={asm.items.some(i => i.name === n)} go={() => setAsm(a => { if (a.items.some(i => i.name === n)) a.items = a.items.filter(i => i.name !== n); else a.items.push({ name: n, at: [0, 0, 0], qty: 1 }); })} />)}<Btn id="dw-asm-row" label="Arrange in a row" go={() => setAsm(a => { a.items = arrangeInRow(p.parts, a.items.map(i => i.name)).map((q, k) => ({ ...q, qty: a.items[k].qty })); })} /></View>
              {asm.items.map((it, k) => <View key={it.name} style={s.row}><Text style={[s.fl, { width: 90 }]} numberOfLines={1}>{k + 1}. {it.name}</Text>{(['X', 'Y', 'Z'] as const).map((ax, q) => <Num key={ax} label={`${ax} (mm)`} value={r1(it.at[q])} set={n => setAsm(a => { a.items[k].at[q] = n ?? 0; })} w={56} />)}<Num label="Qty" value={it.qty} set={n => setAsm(a => { a.items[k].qty = Math.max(1, Math.round(n ?? 1)); })} w={40} /></View>)}
              <View style={s.row}><Num label="Explode distance (mm per part)" value={asm.explode} set={n => setAsm(a => { a.explode = n ?? 0; })} w={70} /><Pick label="Along" value={String(asm.axis) as any} opts={[{ key: '0', label: 'X' }, { key: '1', label: 'Y' }, { key: '2', label: 'Z' }]} set={k => setAsm(a => { a.axis = Number(k) as 0 | 1 | 2; })} /></View>
              <View style={s.row}><Btn id="dw-asm-bom" label="Add bill of materials" go={() => { edit((_d, s2) => { if (!s2.anns.some(q => q.t === 'bom')) { const [tx, ty] = nextTablePos(s2, r, ctx); s2.anns.push({ id: aid(), t: 'bom', x: tx, y: ty }); } }); }} /><Btn id="dw-asm-balloons" label="Balloon every part" go={() => edit((_d, s2) => { const nb = autoBalloons(s2, r, ctx); s2.anns.push(...nb); setMsg(`${nb.length} balloons added`); })} /></View>
            </>}
          </>;
        })()}
        {group === 'out' && <>
          <View style={s.row}>
            <Btn id="dw-pdf" label="Save as PDF" go={p.onPdf} /><Btn id="dw-print" label="Print" go={p.onPrint} />
            <Btn id="dw-svg" label="Download SVG" go={() => { void p.save(`${p.base}-${sh.name}.svg`, sheetSvg()).then(() => setMsg('Saved')); }} />
            <Btn id="dw-dxf" label="Download DXF" go={() => { void p.save(`${p.base}-${sh.name}.dxf`, toDxf(r.prims, r.page)).then(() => setMsg('DXF saved. It opens in AutoCAD, SolidWorks, FreeCAD and others.')); }} />
          </View>
          <Text style={s.fl}>Import a DXF drawing onto this sheet</Text>
          <View style={s.row}>{Platform.OS === 'web' ? React.createElement('input', { type: 'file', accept: '.dxf', 'data-testid': 'dxf-file', onChange: async (e: any) => { const f = e.target.files?.[0]; if (!f) return; try { const im = parseDxf(await f.text()); if (!im.prims.length) { setMsg('No lines, circles, arcs, polylines or text found in that DXF.'); return; } if (im.prims.length > 40000) { setMsg('That DXF has too many entities for the sheet (over 40000).'); return; } const w = im.box[2] - im.box[0] || 1, h = im.box[3] - im.box[1] || 1, aw = r.area[2] - r.area[0], ah = r.area[3] - r.area[1], fit = Math.min((aw * 0.6) / w, (ah * 0.6) / h), sc = Number(fit.toPrecision(2)), sk = Object.entries(im.skipped).map(([k, n]) => `${n} ${k}`).join(', '); edit((_d, s2) => { s2.anns.push({ id: aid(), t: 'dxf', x: r.area[0] + 10, y: r.area[1] + 10, s: sc, box: im.box, prims: im.prims, name: f.name }); }); setMsg(`Imported ${im.prims.length} items from ${f.name}.${sk ? ` Not drawn: ${sk}.` : ''}`); } catch { setMsg('That file could not be read as a DXF.'); } e.target.value = ''; } }) : null}</View>
          <Text style={s.k}>PDF and print include every sheet, scaled to the paper chosen below. SVG and DXF are the sheet you are looking at, in millimetres.</Text>
          <Btn label="Start the drawing again" danger go={() => { commit(d => ({ ...d, drawing: undefined })); setSel(null); setSi(0); setMsg('Drawing reset to the standard layout.'); }} />
        </>}
      </ScrollView>}
      <View style={s.bar}>
        <Btn id="dw-select" label="Select" on={tool === 'select'} go={() => { setTool('select'); setPend(null); }} /><Btn id="dw-pan" label="Hand" on={tool === 'pan'} go={() => setTool(tool === 'pan' ? 'select' : 'pan')} />
        <Btn id="dw-fit" label="Fit" go={fit} /><Btn id="dw-full" label={full ? '✕ Close' : 'Full screen'} on={full} go={() => setFull(f => !f)} />
        <Btn id="dw-tools" label={ribOpen ? 'Hide tools' : 'Show tools'} go={() => setRibOpen(o => !o)} />
        <Text style={s.fl}>{Math.round(vp.z * 100)}%</Text>
        <Text style={[s.k, { flex: 1, minWidth: 140 }]} numberOfLines={2}>{skTool || mdTool ? (DRAW_TOOLS.concat(MOD_TOOLS).find(x => x[0] === (skTool ?? mdTool))?.[2] ?? '') : tdef ? tdef.help : sel ? 'Drag to move. Edit it below.' : 'Tap a view or a dimension to select it. Drag to move. Drag empty space to pan; pinch or scroll to zoom.'}{pend ? `  (${pend.pts.length} point${pend.pts.length === 1 ? '' : 's'} picked)` : ''}</Text>
        <Text ref={coordRef} style={[s.k, { minWidth: 120 }]}> </Text>
      </View>
      {group === 'sketch' && <View style={s.cmd}><Text style={s.k}>Command</Text><TextInput testID="dw-cmd" value={cmd} onChangeText={setCmd} onSubmitEditing={() => runCmd(cmd)} placeholder="L, C, M … or 50,40 or @10,5 or a number" autoCapitalize="none" autoCorrect={false} style={[s.inp, { flex: 1 }]} /><Btn id="dw-cmd-go" label="Enter" go={() => runCmd(cmd)} /></View>}
      <View style={{ flex: 1, minHeight: full ? 180 : 420 }}>
        {Platform.OS === 'web' ? React.createElement('div', { ref: vpRef, 'data-testid': 'drawing-viewport', onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onCancel, onPointerLeave: () => setHover(null), style: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', background: '#c4cec8', touchAction: 'none', userSelect: 'none', cursor: tool === 'select' ? 'default' : tool === 'pan' ? 'grab' : 'crosshair' } },
          React.createElement('div', { ref: wrap, 'data-testid': 'drawing-sheet', style: { position: 'absolute', left: 0, top: 0, width: r.page[0] * BASE, height: r.page[1] * BASE, transformOrigin: '0 0', transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.z})`, background: '#fff', boxShadow: '0 1px 8px rgba(0,0,0,0.35)', lineHeight: 0 } },
            React.createElement('div', { style: { width: '100%', height: '100%' }, dangerouslySetInnerHTML: { __html: baseSvg } }),
            React.createElement('div', { style: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none' }, dangerouslySetInnerHTML: { __html: overlaySvg } }))) : <Text style={s.k}>The drawing editor is in the web version.</Text>}
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 8, top: 8, gap: 6, zIndex: 6 }}>
          <Pressable testID="dw-zin" onPress={() => zoomBy(1.4)} style={s.fab}><Text style={s.fabT}>+</Text></Pressable><Pressable testID="dw-zout" onPress={() => zoomBy(1 / 1.4)} style={s.fab}><Text style={s.fabT}>−</Text></Pressable>
          {(selView || selAnn) && <Pressable testID="dw-props" onPress={() => setPropsOpen(o => !o)} style={s.fab}><Text style={s.fabT}>{propsOpen ? '▾' : '▴'}</Text></Pressable>}
        </View>
        {(selView || selAnn) && propsOpen && !skTool && !mdTool && <ScrollView style={[{ position: 'absolute', backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#9db5a5', zIndex: 5 }, p.phone ? { left: 6, right: 6, bottom: 6, maxHeight: 210 } : { right: 8, top: 8, width: 320, maxHeight: '94%' as any }]} contentContainerStyle={{ padding: 6 }} nestedScrollEnabled>{ViewProps}{AnnProps}</ScrollView>}
      </View>
    </View>
  );
  // full screen is drawn straight onto the page, outside the app's own scrolling and animated containers
  return full && Platform.OS === 'web' && typeof document !== 'undefined' ? (require('react-dom') as { createPortal: (n: React.ReactNode, c: Element) => React.ReactElement }).createPortal(root, document.body) : root;
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#eef3ef' }, tabs: { flexDirection: 'row', gap: 6, padding: 6, flexWrap: 'wrap' }, tab: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6, backgroundColor: '#dfe9e2' }, tabOn: { backgroundColor: '#2e7d32' }, tabT: { fontSize: 13, fontWeight: '600', color: '#26443a' },
  ribbon: { paddingHorizontal: 6, paddingBottom: 4, flexGrow: 0 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center' },
  btn: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 5, backgroundColor: '#fff', borderWidth: 1, borderColor: '#cfdcd4' }, btnOn: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' }, btnDanger: { borderColor: '#e0a0a0' }, btnT: { fontSize: 12, color: '#1f3a2f' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 4, flexWrap: 'wrap' }, k: { fontSize: 12, color: '#52645a' }, fl: { fontSize: 11, color: '#52645a', fontWeight: '600', marginTop: 2 },
  panel: { marginTop: 8, padding: 8, backgroundColor: '#fff', borderRadius: 6, borderWidth: 1, borderColor: '#cfdcd4', gap: 6 }, h: { fontSize: 14, fontWeight: '700', color: '#1f3a2f' }, fld: { gap: 2 },
  fab: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#ffffffee', borderWidth: 1, borderColor: '#9db5a5', alignItems: 'center', justifyContent: 'center' }, fabT: { fontSize: 20, color: '#1f3a2f', fontWeight: '700' }, cmd: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6, paddingVertical: 4, backgroundColor: '#e3ede6' },
  inp: { borderWidth: 1, borderColor: '#cfdcd4', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 4, fontSize: 13, backgroundColor: '#fff', color: '#14181d' },
});
