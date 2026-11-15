// The Drawing tab: a drawing sheet made from the part, with views, annotations, sheets and output, in the way a CAD drawing environment works.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import PrintOptions from './PrintOptions';
import { DISPLAYS, HATCHES, GDT, WELDS, LAYERS, type Ann, type DView, type DrawingDoc, type Sheet, type Layer, type Display, type HatchStyle, type TolType } from '../lib/dwgTypes';
import { SCALES, renderDrawing, scaleText, newDrawing, arrangeStandard, blankDoc, camOf, type Ctx, type Rendered, type ViewInfo } from '../lib/dwg';
import { VIEW_NAMES, dot, type NamedView, type Pt } from '../lib/dwgGeom';
import { toSvg, toDxf } from '../lib/dwgOut';
import { addAux, addDetail, addModelView, addSection, aid, autoBalloons, autoDims, circle3, cloneDoc, cutChoices, holeText, meshBox } from '../lib/dwgEdit';
import { uid } from '../lib/sketch';
import { pageMm } from '../lib/paper';
import type { PartDoc } from '../lib/parts';
import type { Mesh } from '../lib/solid';

type Props = { doc: PartDoc; mesh: Mesh; values: Record<string, number>; mass: number; matName: string; look: { color: string; metal: number }; commit: (fn: (d: PartDoc) => PartDoc) => void; setMsg: (m: string) => void; base: string; save: (name: string, content: string) => Promise<void>; onPdf: () => void; onPrint: () => void; phone: boolean };

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
  T('cmark', 'Centre mark', 1, 'Tap a circle.'), T('cline', 'Centreline', 2, 'Tap the two ends.'), T('fill', 'Area hatch', 2, 'Tap two corners of the area.'), T('cloud', 'Revision cloud', 2, 'Tap two corners.'),
  T('htable', 'Hole table', 1, 'Tap where the table goes.'), T('bom', 'Bill of materials', 1, 'Tap where the table goes.'), T('rev', 'Revision table', 1, 'Tap where the table goes.'), T('table', 'General table', 1, 'Tap where the table goes.'), T('measure', 'Measure', 2, 'Tap two points to read the distance.'),
];
const ALL_TOOLS = [...VIEW_TOOLS, ...DIM_TOOLS, ...NOTE_TOOLS];
const r1 = (x: number) => Math.round(x * 100) / 100;
const nm = (t: string) => { const v = parseFloat(t.replace(',', '.')); return isNaN(v) ? undefined : v; };

export default function DrawingStudio(p: Props) {
  const { doc, mesh, values, commit, setMsg } = p;
  const [si, setSi] = useState(0), [group, setGroup] = useState<'view' | 'ann' | 'sheet' | 'out'>('view'), [tool, setTool] = useState('select'), [sel, setSel] = useState<string | null>(null);
  const [pend, setPend] = useState<{ view: string; pts: Pt[]; circ?: { cx: number; cy: number; r: number } } | null>(null), [over, setOver] = useState<DrawingDoc | null>(null), [zoom, setZoom] = useState(1);
  const [txt, setTxt] = useState('NOTE'), [secKind, setSecKind] = useState<'full' | 'half' | 'offset'>('full'), [secDir, setSecDir] = useState<'h' | 'v'>('h'), [round, setRound] = useState(true), [gdtSym, setGdtSym] = useState<string>('pos'), [weldT, setWeldT] = useState<string>('fillet');
  const [hover, setHover] = useState<Pt | null>(null);
  const wrap = useRef<any>(null), drag = useRef<null | { id: string; kind: 'view' | 'ann'; x0: number; y0: number; moved: boolean; start: DrawingDoc }>(null);
  const ctx: Ctx = useMemo(() => ({ doc, mesh, values, material: p.matName, mass: p.mass, date: new Date().toISOString().slice(0, 10), color: p.look.color, shine: p.look.metal, images: !over }), [doc, mesh, values, p.matName, p.mass, p.look, !!over]);
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
  const svg = useMemo(() => {
    const k = 0.5; let ov = '';
    const box = (b: number[], col: string) => `<rect x="${b[0] - 1.5}" y="${b[1] - 1.5}" width="${b[2] - b[0] + 3}" height="${b[3] - b[1] + 3}" fill="none" stroke="${col}" stroke-width="1.5" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>`;
    const h = r.hits.find(q => q.id === sel); if (h) ov += box(h.box, '#1565c0');
    if (pend) for (const q of pend.pts) { const v = r.views.find(w => w.id === pend.view); if (v) { const X = v.cx + (q[0] - v.uc) * v.s, Y = v.cy - (q[1] - v.vc) * v.s; ov += `<circle cx="${X}" cy="${Y}" r="1.4" fill="#e65100"/>`; } }
    if (pend?.circ) { const v = r.views.find(w => w.id === pend.view); if (v) ov += `<circle cx="${v.cx + (pend.circ.cx - v.uc) * v.s}" cy="${v.cy - (pend.circ.cy - v.vc) * v.s}" r="${pend.circ.r * v.s}" fill="none" stroke="#e65100" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`; }
    if (hover && tool !== 'select' && tool !== 'pan') ov += `<circle cx="${hover[0]}" cy="${hover[1]}" r="${k * 2.4}" fill="none" stroke="#2e7d32" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
    return toSvg(r.prims, r.page, { overlay: ov }).replace(/width="[\d.]+" height="[\d.]+"/, 'style="width:100%;height:auto;display:block"');
  }, [r, sel, pend, hover, tool]);

  // ---------- pointer handling ----------
  const toMm = (e: any): Pt => { const b = wrap.current?.getBoundingClientRect?.(); if (!b) return [0, 0]; return [((e.clientX - b.left) / b.width) * r.page[0], ((e.clientY - b.top) / b.height) * r.page[1]]; };
  const px = () => { const b = wrap.current?.getBoundingClientRect?.(); return b ? r.page[0] / b.width : 0.3; };   // mm per screen pixel
  const viewAt = (X: number, Y: number): ViewInfo | undefined => { const c = r.views.filter(v => X >= v.sheetBox[0] - 8 && X <= v.sheetBox[2] + 8 && Y >= v.sheetBox[1] - 8 && Y <= v.sheetBox[3] + 8); c.sort((a, b) => (a.sheetBox[2] - a.sheetBox[0]) * (a.sheetBox[3] - a.sheetBox[1]) - (b.sheetBox[2] - b.sheetBox[0]) * (b.sheetBox[3] - b.sheetBox[1])); return c[0]; };
  const uv = (v: ViewInfo, X: number, Y: number): Pt => [v.uc + (X - v.cx) / v.s, v.vc - (Y - v.cy) / v.s];
  const snap = (X: number, Y: number, vid?: string): { v: ViewInfo; p: Pt; snapped: boolean } | null => {
    const tol = Math.max(2.5, px() * 9); let best: any = null, bd = tol;
    for (const q of r.snaps) { if (vid && q.view !== vid) continue; const d = Math.hypot(q.x - X, q.y - Y); if (d < bd) { bd = d; best = q; } }
    if (best) { const v = r.views.find(w => w.id === best.view)!; return { v, p: [best.u, best.v], snapped: true }; }
    const v = (vid ? r.views.find(w => w.id === vid) : undefined) ?? viewAt(X, Y); return v ? { v, p: uv(v, X, Y), snapped: false } : null;
  };
  const hitAt = (X: number, Y: number): string | null => {
    const m = Math.max(1.5, px() * 6), anns = r.hits.filter(h => h.kind === 'ann' && X >= h.box[0] - m && X <= h.box[2] + m && Y >= h.box[1] - m && Y <= h.box[3] + m).sort((a, b) => (a.box[2] - a.box[0]) * (a.box[3] - a.box[1]) - (b.box[2] - b.box[0]) * (b.box[3] - b.box[1]));
    if (anns[0]) return anns[0].id; const v = viewAt(X, Y); return v && X >= v.sheetBox[0] && X <= v.sheetBox[2] && Y >= v.sheetBox[1] && Y <= v.sheetBox[3] ? v.id : null;
  };
  const addAnn = (a: Ann) => { edit((_d, s) => { s.anns.push(a); }); setSel(a.id); };
  const circleNear = (vid: string, q: Pt, v: ViewInfo) => { const tol = Math.max(3, px() * 10) / v.s; let best: any = null, bd = tol; for (const c of r.circles) { if (c.view !== vid) continue; const d = Math.abs(Math.hypot(q[0] - c.c.cx, q[1] - c.c.cy) - c.c.r), dc = Math.hypot(q[0] - c.c.cx, q[1] - c.c.cy); const dd2 = Math.min(d, dc < c.c.r ? dc : 1e9); if (dd2 < bd) { bd = dd2; best = c.c; } } return best as { cx: number; cy: number; r: number } | null; };

  const click = (X: number, Y: number) => {
    if (tool === 'select' || tool === 'pan') { setSel(hitAt(X, Y)); return; }
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

  const onDown = (e: any) => {
    const [X, Y] = toMm(e);
    if (tool === 'select') {
      const id = hitAt(X, Y); setSel(id);
      if (id) { const k = sh.anns.some(a => a.id === id) ? 'ann' : 'view'; drag.current = { id, kind: k, x0: X, y0: Y, moved: false, start: cloneDoc(dd) }; try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* ignore */ } }
      return;
    }
    if (tool !== 'pan') click(X, Y);
  };
  const onMove = (e: any) => {
    const [X, Y] = toMm(e); setHover(tool !== 'select' && tool !== 'pan' ? (() => { const sn = snap(X, Y, pend?.view); return sn?.snapped ? [sn.v.cx + (sn.p[0] - sn.v.uc) * sn.v.s, sn.v.cy - (sn.p[1] - sn.v.vc) * sn.v.s] as Pt : null; })() : null);
    const dg = drag.current; if (!dg) return;
    const dx = X - dg.x0, dy = Y - dg.y0; if (!dg.moved && Math.hypot(dx, dy) < Math.max(1, px() * 4)) return; dg.moved = true;
    const nd = cloneDoc(dg.start), s2 = nd.sheets[sIdx];
    if (dg.kind === 'view') {
      const v = s2.views.find(q => q.id === dg.id)!; if (v.locked) return; const mx = v.align === 'h' ? 0 : dx, my = v.align === 'v' ? 0 : dy; v.cx += mx; v.cy += my;
      for (const c of s2.views) if (c.parent === v.id && c.align) { if (c.align === 'h') c.cx += dx; else c.cy += dy; }   // aligned children follow their parent
    } else {
      const a = s2.anns.find(q => q.id === dg.id)!, vi = 'view' in a && a.view ? r.views.find(w => w.id === a.view) : undefined, ku = vi ? 1 / vi.s : 1;
      if (a.t === 'dim') a.p = [a.p[0] + dx * ku, a.p[1] - (vi ? dy * ku : -dy)];
      else if ('at' in a) a.at = [a.at[0] + dx * ku, a.at[1] + (vi ? -dy * ku : dy)];
      else if ('x' in a && 'y' in a) { a.x += dx; a.y += dy; }
    }
    setOver(nd);
  };
  const onUp = () => { const dg = drag.current; drag.current = null; if (dg?.moved && over) { save(over); } setOver(null); };

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
      {a.t === 'note' && <><Txt label="Text" value={a.text} set={t => upAnn(x => { x.text = t; })} w={220} multi /><Num label="Text height (mm)" value={a.size} set={n => upAnn(x => { if (n) x.size = n; })} /><Pick label="Frame" value={a.box ?? 'none'} opts={[{ key: 'none', label: 'None' }, { key: 'box', label: 'Box' }, { key: 'circle', label: 'Circle' }]} set={k => upAnn(x => { x.box = k; })} /></>}
      {a.t === 'balloon' && <><Txt label="Item number" value={a.text} set={t => upAnn(x => { x.text = t; })} w={80} /><Pick label="Shape" value={a.shape} opts={[{ key: 'circle', label: 'Circle' }, { key: 'triangle', label: 'Triangle' }, { key: 'hex', label: 'Hexagon' }, { key: 'box', label: 'Box' }]} set={k => upAnn(x => { x.shape = k; })} /></>}
      {a.t === 'finish' && <><Txt label="Roughness text" value={a.text} set={t => upAnn(x => { x.text = t; })} w={100} /><Pick label="Symbol" value={a.kind} opts={[{ key: 'machined', label: 'Machining required' }, { key: 'basic', label: 'Basic' }, { key: 'prohibited', label: 'No machining' }]} set={k => upAnn(x => { x.kind = k; })} /></>}
      {a.t === 'weld' && <><Pick label="Weld" value={a.type} opts={WELDS} set={k => upAnn(x => { x.type = k; })} /><View style={s.row}><Txt label="Size" value={a.size} set={t => upAnn(x => { x.size = t; })} w={60} /><Txt label="Length" value={a.length} set={t => upAnn(x => { x.length = t; })} w={60} /></View><View style={s.row}><Btn label="All around" on={a.around} go={() => upAnn(x => { x.around = !x.around; })} /><Btn label="Field weld" on={a.field} go={() => upAnn(x => { x.field = !x.field; })} /><Btn label="Other side" on={a.other} go={() => upAnn(x => { x.other = !x.other; })} /></View></>}
      {a.t === 'gdt' && <><Pick label="Characteristic" value={a.sym} opts={GDT} set={k => upAnn(x => { x.sym = k; })} /><View style={s.row}><Txt label="Tolerance" value={a.tol} set={t => upAnn(x => { x.tol = t; })} w={70} /><Txt label="Modifier (M, L, P)" value={a.mod} set={t => upAnn(x => { x.mod = t; })} w={70} /><Txt label="Datums (A,B,C)" value={a.datums.join(',')} set={t => upAnn(x => { x.datums = t.split(/[ ,]+/).filter(Boolean).slice(0, 3); })} w={90} /></View><Btn label="Diameter zone Ø" on={a.dia} go={() => upAnn(x => { x.dia = !x.dia; })} /></>}
      {(a.t === 'datum' || a.t === 'dtarget') && <Txt label="Letter" value={a.letter} set={t => upAnn(x => { x.letter = t.toUpperCase().slice(0, 2); })} w={60} />}
      {a.t === 'dtarget' && <Txt label="Target number" value={a.n} set={t => upAnn(x => { x.n = t; })} w={60} />}
      {a.t === 'hole' && <Txt label="Callout" value={a.text} set={t => upAnn(x => { x.text = t; })} w={200} />}
      {a.t === 'cloud' && <Txt label="Revision tag" value={a.tag} set={t => upAnn(x => { x.tag = t; })} w={60} />}
      {a.t === 'fill' && <><Pick label="Pattern" value={a.style} opts={HATCHES} set={k => upAnn(x => { x.style = k; })} /><View style={s.row}><Num label="Angle (°)" value={a.angle} set={n => upAnn(x => { x.angle = n ?? 45; })} /><Num label="Spacing (mm)" value={a.gap} set={n => upAnn(x => { if (n) x.gap = n; })} /></View></>}
      {a.t === 'table' && <><Txt label="Title" value={a.title} set={t => upAnn(x => { x.title = t; })} w={160} /><Txt label="Cells (rows on lines, columns with ;)" value={a.rows.map(rw => rw.join(';')).join('\n')} set={t => upAnn(x => { x.rows = t.split('\n').map(l => l.split(';')); })} w={240} multi /></>}
      {a.t === 'rev' && <><Text style={s.fl}>One revision per line: REV; DESCRIPTION; DATE; BY</Text><Txt label="Revisions" value={a.rows.map(q => [q.rev, q.desc, q.date, q.by].join('; ')).join('\n')} set={t => upAnn(x => { x.rows = t.split('\n').filter(Boolean).map(l => { const c = l.split(';').map(z => z.trim()); return { rev: c[0] ?? '', desc: c[1] ?? '', date: c[2] ?? '', by: c[3] ?? '' }; }); })} w={280} multi /></>}
      {a.t === 'htable' && <Text style={s.k}>Lists the round features found in the view, with their position from the lower left corner.</Text>}
      <Pick label="Layer" value={(a.layer ?? 'note') as Layer} opts={LAYERS.slice(3, 7).map(l => ({ key: l.key, label: l.label.split(' ')[0] }))} set={k => upAnn(x => { x.layer = k; })} />
      <Btn label="Delete" danger go={() => edit((_d, s2) => { s2.anns = s2.anns.filter(q => q.id !== a.id); setSel(null); })} />
    </View>;
  })();

  const toolBtn = (t: Tool) => <Btn key={t.key} id={`dw-${t.key}`} label={t.label} on={tool === t.key} go={() => { setTool(tool === t.key ? 'select' : t.key); setSel(null); setMsg(t.help); }} />;
  const setDoc = (f: (d: DrawingDoc) => void) => edit(d => f(d));
  const P = dd.props;
  const propRows: [keyof typeof P, string][] = [['company', 'Company'], ['title', 'Title'], ['drawnBy', 'Drawn by'], ['checkedBy', 'Checked by'], ['approvedBy', 'Approved by'], ['drawingNo', 'Drawing number'], ['revision', 'Revision'], ['partNo', 'Part number'], ['description', 'Description'], ['finish', 'Finish'], ['tolerance', 'General tolerance'], ['weight', 'Mass text (auto: calculated)']];
  const sheetSvg = () => toSvg(r.prims, r.page, { px: 3 });

  return (
    <View style={s.wrap} testID="drawing-studio">
      <View style={s.tabs}>{([['view', 'View layout'], ['ann', 'Annotation'], ['sheet', 'Sheet'], ['out', 'Output']] as const).map(([k, l]) => <Pressable key={k} testID={`dw-tab-${k}`} onPress={() => setGroup(k)} style={[s.tab, group === k && s.tabOn]}><Text style={[s.tabT, group === k && { color: '#fff' }]}>{l}</Text></Pressable>)}</View>
      <ScrollView style={[s.ribbon, { maxHeight: p.phone ? 210 : 300 }]} contentContainerStyle={{ gap: 4 }} nestedScrollEnabled>
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
          <View style={s.row}>
            <Btn id="dw-auto-dims" label="Model items: auto dimensions" go={() => edit((_d, s2) => { const add = autoDims(s2, r); s2.anns.push(...add); setMsg(add.length ? `${add.length} dimensions added` : 'Everything is already dimensioned.'); })} />
            <Btn id="dw-auto-marks" label="Auto centre marks" go={() => edit((_d, s2) => { const have = (vv: string, c: any) => s2.anns.some(a => a.t === 'cmark' && a.view === vv && Math.abs(a.c[0] - c.cx) < 1e-3 && Math.abs(a.c[1] - c.cy) < 1e-3); let n = 0; for (const c of r.circles) if (c.c.full && !have(c.view, c.c)) { s2.anns.push({ id: aid(), t: 'cmark', view: c.view, c: [c.c.cx, c.c.cy], r: c.c.r }); n++; } setMsg(`${n} centre marks added`); })} />
            <Btn id="dw-auto-balloon" label="Auto balloon" go={() => edit((_d, s2) => { s2.anns.push(...autoBalloons(s2, r)); })} />
            {pend && (tool === 'base' || tool === 'chain') && <Btn label="Done" go={() => setPend(null)} />}
          </View>
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
          <Text style={s.fl}>Title block properties</Text><View style={s.row}>{propRows.map(([k, l]) => <Txt key={k} label={l} value={P[k]} set={t => setDoc(d => { (d.props as any)[k] = t; })} w={160} />)}</View>
          <Btn id="dw-rearrange" label="Arrange the standard views again" go={() => edit((d, s2) => { arrangeStandard(d, s2, ctx); setSel(null); })} />
        </>}
        {group === 'out' && <>
          <View style={s.row}>
            <Btn id="dw-pdf" label="Save as PDF" go={p.onPdf} /><Btn id="dw-print" label="Print" go={p.onPrint} />
            <Btn id="dw-svg" label="Download SVG" go={() => { void p.save(`${p.base}-${sh.name}.svg`, sheetSvg()).then(() => setMsg('Saved')); }} />
            <Btn id="dw-dxf" label="Download DXF" go={() => { void p.save(`${p.base}-${sh.name}.dxf`, toDxf(r.prims, r.page)).then(() => setMsg('DXF saved. It opens in AutoCAD, SolidWorks, FreeCAD and others.')); }} />
          </View>
          <Text style={s.k}>PDF and print include every sheet, scaled to the paper chosen below. SVG and DXF are the sheet you are looking at, in millimetres.</Text>
          <Btn label="Start the drawing again" danger go={() => { commit(d => ({ ...d, drawing: undefined })); setSel(null); setSi(0); setMsg('Drawing reset to the standard layout.'); }} />
        </>}
      </ScrollView>
      <View style={s.bar}>
        <Btn id="dw-select" label="Select" on={tool === 'select'} go={() => { setTool('select'); setPend(null); }} /><Btn id="dw-pan" label="Hand" on={tool === 'pan'} go={() => setTool(tool === 'pan' ? 'select' : 'pan')} />
        <Btn label="−" go={() => setZoom(z => Math.max(1, z / 1.4))} /><Text style={s.fl}>{Math.round(zoom * 100)}%</Text><Btn label="+" go={() => setZoom(z => Math.min(5, z * 1.4))} />
        <Text style={[s.k, { flex: 1 }]} numberOfLines={2}>{tdef ? tdef.help : sel ? 'Drag to move. Edit it below.' : 'Tap a view or a dimension to select it. Drag to move.'}{pend ? `  (${pend.pts.length} point${pend.pts.length === 1 ? '' : 's'} picked)` : ''}</Text>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 6 }}>
        <ScrollView horizontal nestedScrollEnabled contentContainerStyle={{ width: `${zoom * 100}%` as any }} scrollEnabled={zoom > 1 && tool === 'pan'} showsHorizontalScrollIndicator={zoom > 1}>
          {Platform.OS === 'web' ? React.createElement('div', { ref: wrap, 'data-testid': 'drawing-sheet', onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onUp, onPointerLeave: () => setHover(null), style: { width: '100%', background: '#fff', borderRadius: 4, lineHeight: 0, touchAction: tool === 'pan' ? 'auto' : 'none', userSelect: 'none', cursor: tool === 'select' ? 'default' : tool === 'pan' ? 'grab' : 'crosshair', border: '1px solid #cfdcd4' }, dangerouslySetInnerHTML: { __html: svg } }) : <Text style={s.k}>The drawing editor is in the web version.</Text>}
        </ScrollView>
        {ViewProps}{AnnProps}
        {!selView && !selAnn && <Text style={[s.k, { marginTop: 6 }]}>{sh.views.length} views and {sh.anns.length} annotations on {sh.name}. Pick a tool above, or select something to change it.</Text>}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#eef3ef' }, tabs: { flexDirection: 'row', gap: 6, padding: 6, flexWrap: 'wrap' }, tab: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6, backgroundColor: '#dfe9e2' }, tabOn: { backgroundColor: '#2e7d32' }, tabT: { fontSize: 13, fontWeight: '600', color: '#26443a' },
  ribbon: { paddingHorizontal: 6, paddingBottom: 4, flexGrow: 0 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center' },
  btn: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 5, backgroundColor: '#fff', borderWidth: 1, borderColor: '#cfdcd4' }, btnOn: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' }, btnDanger: { borderColor: '#e0a0a0' }, btnT: { fontSize: 12, color: '#1f3a2f' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 4, flexWrap: 'wrap' }, k: { fontSize: 12, color: '#52645a' }, fl: { fontSize: 11, color: '#52645a', fontWeight: '600', marginTop: 2 },
  panel: { marginTop: 8, padding: 8, backgroundColor: '#fff', borderRadius: 6, borderWidth: 1, borderColor: '#cfdcd4', gap: 6 }, h: { fontSize: 14, fontWeight: '700', color: '#1f3a2f' }, fld: { gap: 2 },
  inp: { borderWidth: 1, borderColor: '#cfdcd4', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 4, fontSize: 13, backgroundColor: '#fff', color: '#14181d' },
});
