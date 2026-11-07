import { FORMS, isPitched, overhangOf, roofForm, roofLabel, roofLines, roofPlanBox, RoofForm } from '../../lib/roof';
import { ALL_TEMPLATES as TEMPLATES } from '../../lib/templates';
import { findFireCrossings, fireOf, RATINGS } from '../../lib/firedamper';
import { planDxf } from '../../lib/dxf';
import { centreOf, transformGeometry, Xf } from '../../lib/transform';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, Platform } from 'react-native';
import Svg, { Defs, Pattern, Path, G, Line, Rect, Circle, Polygon, Polyline, Text as SvgText } from 'react-native-svg';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { newId, useModel } from '../../lib/useModel';
import { rememberProject } from '../../lib/session';
import { Btn, Field, BoxBtn, Menu, MenuBar, RItem, Sec, Seg, Stepper, Toggle, ToolBar, TItem } from '../../components/ribbon/Ribbon';
import { Icon, IconName } from '../../components/ribbon/Icon';
import { CLASSES, cname } from '../../lib/rc';
import { dsn, plan, setDsn, setPlan } from '../../lib/settings';
import { saveFile } from '../../components/saveFile';
import { toIfc } from '../../lib/ifc';
import { beamSec, footprint, holesOf, inPoly, netArea, openingCount, roundsOf, polyArea, polyBox, polyCentroid, stairSteps, wallT } from '../../lib/model';
import type { El, Lib } from '../../lib/engineering';

const PX = 50;      // pixels per metre at 100% zoom
const N = 120;      // plan canvas size in metres
type Pt = [number, number];
type Cmd = { add: El[]; del: El[]; mod: [El, El][] };      // one undoable step: rows added, rows deleted, rows changed (before, after)
type Tool = 'select' | 'hole' | 'dim' | 'label' | 'grid' | 'arc' | 'roof' | 'stair' | 'zone' | 'wall' | 'beam' | 'column' | 'slab' | 'door' | 'window' | 'duct' | 'pipe' | 'plant' | 'outlet';
const DBT: Record<string, string> = { plant: 'equipment', outlet: 'fixture', dim: 'dimension' };
const LINE_TOOLS = ['wall', 'beam', 'duct', 'pipe', 'grid', 'slab'];
const POLY_TOOLS = ['slab', 'roof', 'zone'];
const DISC: Record<string, string> = { wall: 'architecture', door: 'architecture', window: 'architecture', roof: 'architecture', stair: 'architecture', column: 'structure', beam: 'structure', grid: 'structure', zone: 'architecture', dimension: 'architecture', label: 'architecture', slab: 'structure', foundation: 'structure', duct: 'mep', pipe: 'mep', equipment: 'mep', fixture: 'mep' };
const TOOLS: Record<Tool, { label: string; hint: string; lib?: (l: Lib) => boolean }> = {
  select: { label: 'Select', hint: 'Tap an element to see its details, change its size or delete it.' },
  grid: { label: 'Grid line', hint: 'Tap the start and end of a grid line. Numbers go to vertical lines, letters to horizontal ones. Or generate a whole grid below.' },
  hole: { label: 'Opening', hint: 'Rectangle: tap two opposite corners. Circle: tap the centre, then a point on the edge. Inside a slab or roof (for a stair well or a shaft). Undo removes it.' },
  dim: { label: 'Dimension', hint: 'Tap the two points to measure, then tap where the dimension line should sit.' },
  label: { label: 'Text', hint: 'Type the text in the Info Box, then tap where it goes.' },
  column: { label: 'Column', hint: 'Tap to place a column. Use "Next type" to change its size.', lib: l => l.category === 'section' && /column/i.test(l.name) },
  beam: { label: 'Beam', hint: 'Tap the start, then each end point. Beams that meet end to end form one continuous beam. Tap Finish to stop.', lib: l => l.category === 'section' && /beam/i.test(l.name) },
  slab: { label: 'Slab', hint: 'Rectangle: tap two corners. Polygon: tap each corner, then the first corner or Finish.' },
  wall: { label: 'Wall', hint: 'Tap the start, then each corner. Tap Finish to stop.' },
  arc: { label: 'Arc wall', hint: 'Tap the start, the end, then a point on the curve. It is built as a chain of short straight walls.' },
  roof: { label: 'Roof', hint: 'Flat roof on top of this storey. Rectangle: tap two corners. Polygon: tap each corner, then the first corner or Finish.' },
  stair: { label: 'Stair', hint: 'Tap two opposite corners of the flight. It rises one storey along the longer side; flip the direction in Properties.' },
  zone: { label: 'Room', hint: 'Tap each corner of the room, then the first corner or Finish. It gets a name and an area.' },
  door: { label: 'Door', hint: 'Tap close to a wall to place a door in it.', lib: l => l.category === 'door' },
  window: { label: 'Window', hint: 'Tap close to a wall to place a window in it.', lib: l => l.category === 'window' },
  duct: { label: 'Duct', hint: 'Tap the start, then each end point. Set the centreline height below.', lib: l => l.category === 'duct' },
  pipe: { label: 'Pipe', hint: 'Tap the start, then each end point. Set the centreline height below.', lib: l => l.category === 'pipe' },
  plant: { label: 'Plant', hint: 'Tap to place the air handler or chiller that feeds the outlets.' },
  outlet: { label: 'Outlet', hint: 'Tap to place a diffuser or terminal. Set its cooling load below.' },
};
const OCC = ['Residential', 'Office', 'Laboratory'];
const TOOL_ICON: Record<Tool, IconName> = { select: 'select', hole: 'hole', dim: 'dim', label: 'text', grid: 'grid', arc: 'arc', roof: 'roof', stair: 'stair', zone: 'zone', column: 'column', beam: 'beam', slab: 'slab', wall: 'wall', door: 'door', window: 'window', duct: 'duct', pipe: 'pipe', plant: 'plant', outlet: 'outlet' };
const NAME: Record<string, string> = { dimension: 'Dimension', label: 'Text', zone: 'Room', grid: 'Grid line', wall: 'Wall', beam: 'Beam', column: 'Column', slab: 'Slab', roof: 'Roof', stair: 'Stair', foundation: 'Foundation', door: 'Door', window: 'Window', duct: 'Duct', pipe: 'Pipe', equipment: 'Plant', fixture: 'Outlet' };
const r2 = (x: number) => Math.round(x * 100) / 100;

function nearestWall(walls: El[], x: number, y: number) {
  let best: { w: El; off: number; d: number; len: number } | null = null;
  for (const w of walls) {
    const [a, b] = [w.geometry.start as Pt, w.geometry.end as Pt];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    if (!len) continue;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (len * len)));
    const d = Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
    if (!best || d < best.d) best = { w, off: t * len, d, len };
  }
  return best;
}
const segDist = (a: Pt, b: Pt, x: number, y: number) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)) : 0;
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
};
// the stretch of wall an opening occupies, in metres
function openingSeg(e: El, wallById: Record<string, El>) {
  const w = wallById[e.geometry.wall_id]; if (!w) return null;
  const [a, b] = [w.geometry.start as Pt, w.geometry.end as Pt], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
  const s0 = e.geometry.offset_m - e.geometry.width_m / 2, s1 = e.geometry.offset_m + e.geometry.width_m / 2;
  return { a: [a[0] + ux * s0, a[1] + uy * s0] as Pt, b: [a[0] + ux * s1, a[1] + uy * s1] as Pt };
}
// the element nearest a tap (metres), or null
function hitTest(here: El[], wallById: Record<string, El>, x: number, y: number, tol: number): El | null {
  let best: El | null = null, bd = Infinity;
  for (const e of here) {
    const g = e.geometry; let d = Infinity;
    if (e.type === 'door' || e.type === 'window') { const o = openingSeg(e, wallById); if (o) d = segDist(o.a, o.b, x, y) - 0.05; }
    else if (e.type === 'dimension') { const dx = g.end[0] - g.start[0], dy = g.end[1] - g.start[1], L = Math.hypot(dx, dy) || 1, o = g.offset ?? 0.6, nx = (-dy / L) * o, ny = (dx / L) * o; d = segDist([g.start[0] + nx, g.start[1] + ny], [g.end[0] + nx, g.end[1] + ny], x, y); }
    else if (g.start && g.end) d = segDist(g.start, g.end, x, y) - (e.type === 'wall' ? wallT(g) / 2 : 0);
    else if (g.at) d = Math.hypot(x - g.at[0], y - g.at[1]) - (e.type === 'column' ? Math.max(g.b ?? 0.3, g.h ?? 0.3) / 2 : 0.15);
    else if (g.poly) d = inPoly(g.poly, x, y) ? tol * 0.9 : Infinity;
    else if (g.rect) d = x >= g.rect[0] && x <= g.rect[2] && y >= g.rect[1] && y <= g.rect[3] ? tol * 0.9 : Infinity;   // inside a slab loses to anything closer
    if (d <= tol && d < bd) { bd = d; best = e; }
  }
  return best;
}

// tap position inside the plan, in pixels: native gives locationX/Y; a click in the browser needs the element's box
function tapPos(ev: any): [number, number] {
  const n = ev.nativeEvent ?? {};
  if (typeof n.locationX === 'number' && isFinite(n.locationX)) return [n.locationX, n.locationY];
  const r = ev.currentTarget?.getBoundingClientRect?.();
  if (r && typeof n.clientX === 'number') return [n.clientX - r.left, n.clientY - r.top];
  return [n.offsetX ?? 0, n.offsetY ?? 0];
}

const PAL = {
  light: { bg: '#f7fcf8', minor: '#cfe3d6', major: '#86b79b', node: '#146c43', axis: '#146c43', text: '#146c43', wall: '#146c43', dim: '#0a2e1f', beam: '#c98a00', col: '#c98a00', duct: '#0c9a87', pipe: '#0b6b8a', door: '#1a8f4d', win: '#0c9a87', plant: '#0b6b8a', slab: '#2a6f97', cursor: '#146c43', grid: '#c4620a' },
  blue: { bg: '#0b2447', minor: '#1b4180', major: '#3a6bb5', node: '#7fb2ff', axis: '#7fb2ff', text: '#8fbcff', wall: '#e8f1ff', dim: '#bcd6ff', beam: '#ffcf4a', col: '#ffcf4a', duct: '#3fd6c2', pipe: '#5cc8ff', door: '#6ee7a0', win: '#3fd6c2', plant: '#5cc8ff', slab: '#6aa8ff', cursor: '#ffffff', grid: '#ff9f6e' },
};
type Pal = typeof PAL.light;
const Grid = memo(function Grid({ c }: { c: Pal }) {
  const S = N * PX, M = PX * 5;
  return (
    <>
      <Defs>
        <Pattern id="g1" width={PX} height={PX} patternUnits="userSpaceOnUse"><Path d={`M ${PX} 0 L 0 0 0 ${PX}`} fill="none" stroke={c.minor} strokeWidth={0.6} /></Pattern>
        <Pattern id="g5" width={M} height={M} patternUnits="userSpaceOnUse"><Path d={`M ${M} 0 L 0 0 0 ${M}`} fill="none" stroke={c.major} strokeWidth={1} /><Circle cx={0} cy={0} r={2.6} fill={c.node} /></Pattern>
      </Defs>
      <Rect x={0} y={0} width={S} height={S} fill={c.bg} /><Rect x={0} y={0} width={S} height={S} fill="url(#g1)" /><Rect x={0} y={0} width={S} height={S} fill="url(#g5)" />
      <Line x1={0} y1={0} x2={S} y2={0} stroke={c.axis} strokeWidth={3} /><Line x1={0} y1={0} x2={0} y2={S} stroke={c.axis} strokeWidth={3} />
      {Array.from({ length: N / 5 + 1 }, (_, i) => i * 5).filter(v => v > 0).map(v => (
        <G key={v}><SvgText x={v * PX + 4} y={16} fontSize={12} fill={c.text}>{v}</SvgText><SvgText x={4} y={v * PX - 4} fontSize={12} fill={c.text}>{v}</SvgText></G>
      ))}
    </>
  );
});

// All drawn elements. Memoised: it only redraws when the elements themselves change, not on zoom, tool or selection changes.
const Layer = memo(function Layer({ here, libById, wallById, dims, c }: { here: El[]; libById: Record<string, Lib>; wallById: Record<string, El>; dims: boolean; c: Pal }) {
  const BX: Record<string, string> = { slab: c.slab, roof: '#8a6d3b', stair: '#6b7a85', foundation: '#555d63' };
  return (
    <>
      {here.filter(e => e.geometry.rect && e.type !== 'stair' && e.type !== 'zone').map(e => {
        const col = BX[e.type] ?? c.wall;
        if (e.geometry.poly) return <Polygon key={e.id} points={e.geometry.poly.map((q: Pt) => `${q[0] * PX},${q[1] * PX}`).join(' ')} fill={col} fillOpacity={0.1} stroke={col} strokeWidth={1.5} />;
        const [x0, y0, x1, y1] = e.type === 'roof' && isPitched(e.geometry) ? roofPlanBox(e.geometry) : e.geometry.rect; return <Rect key={e.id} x={x0 * PX} y={y0 * PX} width={(x1 - x0) * PX} height={(y1 - y0) * PX} fill={col} fillOpacity={0.1} stroke={col} strokeWidth={1.5} />;
      })}
      {here.filter(e => (e.type === 'slab' || e.type === 'roof') && holesOf(e.geometry).length).flatMap(e => holesOf(e.geometry).map((h, i) => <G key={e.id + 'h' + i}><Rect x={Math.min(h[0], h[2]) * PX} y={Math.min(h[1], h[3]) * PX} width={Math.abs(h[2] - h[0]) * PX} height={Math.abs(h[3] - h[1]) * PX} fill={c.bg} stroke={c.dim} strokeWidth={1.5} strokeDasharray="6 4" /><Line x1={h[0] * PX} y1={h[1] * PX} x2={h[2] * PX} y2={h[3] * PX} stroke={c.dim} strokeWidth={1} /><Line x1={h[2] * PX} y1={h[1] * PX} x2={h[0] * PX} y2={h[3] * PX} stroke={c.dim} strokeWidth={1} /></G>))}
      {here.filter(e => (e.type === 'slab' || e.type === 'roof') && roundsOf(e.geometry).length).flatMap(e => roundsOf(e.geometry).map((q, i) => <G key={e.id + 'r' + i}><Circle cx={q.c[0] * PX} cy={q.c[1] * PX} r={q.r * PX} fill={c.bg} stroke={c.dim} strokeWidth={1.5} strokeDasharray="6 4" /><Line x1={(q.c[0] - q.r) * PX} y1={q.c[1] * PX} x2={(q.c[0] + q.r) * PX} y2={q.c[1] * PX} stroke={c.dim} strokeWidth={1} /><Line x1={q.c[0] * PX} y1={(q.c[1] - q.r) * PX} x2={q.c[0] * PX} y2={(q.c[1] + q.r) * PX} stroke={c.dim} strokeWidth={1} /></G>))}
      {here.filter(e => e.type === 'roof' && isPitched(e.geometry)).flatMap(e => roofLines(e.geometry).map(([a, b], i) => <Line key={e.id + 'r' + i} x1={a[0] * PX} y1={a[1] * PX} x2={b[0] * PX} y2={b[1] * PX} stroke={c.dim} strokeWidth={1.5} strokeDasharray="10 5" />))}
      {findFireCrossings(here, Object.values(libById), []).map((f, i) => <G key={'fd' + i}><Circle cx={f.at[0] * PX} cy={f.at[1] * PX} r={9} fill="none" stroke="#e53935" strokeWidth={2.5} /><SvgText x={f.at[0] * PX + 12} y={f.at[1] * PX - 8} fontSize={11} fill="#e53935" fontWeight="bold">{f.kind === 'damper' ? 'FD' : 'FS'} {f.rating}</SvgText></G>)}
      {here.filter(e => e.type === 'wall' && e.geometry.core).map(e => <Line key={e.id + 'cw'} x1={e.geometry.start[0] * PX} y1={e.geometry.start[1] * PX} x2={e.geometry.end[0] * PX} y2={e.geometry.end[1] * PX} stroke="#1565c0" strokeWidth={5} strokeOpacity={0.35} />)}
      {here.filter(e => e.type === 'wall' && fireOf(e.geometry) > 0).map(e => <Line key={e.id + 'fw'} x1={e.geometry.start[0] * PX} y1={e.geometry.start[1] * PX} x2={e.geometry.end[0] * PX} y2={e.geometry.end[1] * PX} stroke="#e53935" strokeWidth={3} strokeOpacity={0.55} strokeDasharray="2 5" />)}
      {here.filter(e => e.type === 'dimension').map(e => <Dim key={e.id} a={e.geometry.start} b={e.geometry.end} off={e.geometry.offset ?? 0.6} c={c} />)}
      {here.filter(e => e.type === 'label').map(e => <SvgText key={e.id} x={e.geometry.at[0] * PX} y={e.geometry.at[1] * PX} fontSize={(e.geometry.h ?? 0.25) * PX} fill={c.dim}>{e.geometry.text ?? ''}</SvgText>)}
      {here.filter(e => e.type === 'zone' && e.geometry.poly).map(e => {
        const q = e.geometry.poly as Pt[], cen = polyCentroid(q);
        return <G key={e.id}><Polygon points={q.map(v => `${v[0] * PX},${v[1] * PX}`).join(' ')} fill={c.pipe} fillOpacity={0.12} stroke={c.pipe} strokeWidth={1} strokeDasharray="6 4" /><SvgText x={cen[0] * PX} y={cen[1] * PX} fontSize={13} fontWeight="700" textAnchor="middle" fill={c.dim}>{e.geometry.name ?? 'Room'}</SvgText><SvgText x={cen[0] * PX} y={cen[1] * PX + 15} fontSize={11} textAnchor="middle" fill={c.dim}>{polyArea(q).toFixed(1)} m²</SvgText></G>;
      })}
      {here.filter(e => e.type === 'stair' && e.geometry.rect).map(e => {
        const [x0, y0, x1, y1] = e.geometry.rect as number[], n = stairSteps(e.geometry), alongX = Math.abs(x1 - x0) >= Math.abs(y1 - y0), flip = e.geometry.flip ? -1 : 1, L = alongX ? x1 - x0 : y1 - y0;
        const cut = Array.from({ length: n - 1 }, (_, i) => (i + 1) / n);
        const ax = alongX ? (flip > 0 ? x0 + L * 0.1 : x1 - L * 0.1) : (x0 + x1) / 2, ay = alongX ? (y0 + y1) / 2 : (flip > 0 ? y0 + L * 0.1 : y1 - L * 0.1), bx = alongX ? (flip > 0 ? x1 - L * 0.1 : x0 + L * 0.1) : (x0 + x1) / 2, by = alongX ? (y0 + y1) / 2 : (flip > 0 ? y1 - L * 0.1 : y0 + L * 0.1);
        return <G key={e.id}><Rect x={x0 * PX} y={y0 * PX} width={(x1 - x0) * PX} height={(y1 - y0) * PX} fill={c.wall} fillOpacity={0.06} stroke={c.wall} strokeWidth={1.5} />
          {cut.map((f, i) => alongX ? <Line key={i} x1={(x0 + (x1 - x0) * f) * PX} y1={y0 * PX} x2={(x0 + (x1 - x0) * f) * PX} y2={y1 * PX} stroke={c.wall} strokeWidth={0.8} /> : <Line key={i} x1={x0 * PX} y1={(y0 + (y1 - y0) * f) * PX} x2={x1 * PX} y2={(y0 + (y1 - y0) * f) * PX} stroke={c.wall} strokeWidth={0.8} />)}
          <Line x1={ax * PX} y1={ay * PX} x2={bx * PX} y2={by * PX} stroke={c.beam} strokeWidth={2} /><Circle cx={ax * PX} cy={ay * PX} r={4} fill={c.beam} /><SvgText x={(ax + bx) / 2 * PX + 6} y={(ay + by) / 2 * PX - 6} fontSize={11} fill={c.dim}>UP</SvgText></G>;
      })}
      {here.map(e => {
        const g = e.geometry;
        if (e.type === 'wall') {
          const l = Math.hypot(g.end[0] - g.start[0], g.end[1] - g.start[1]);
          return <G key={e.id}>
            <Line x1={g.start[0] * PX} y1={g.start[1] * PX} x2={g.end[0] * PX} y2={g.end[1] * PX} stroke={c.wall} strokeWidth={Math.max(wallT(g) * PX, 4)} strokeLinecap="butt" />
            {dims && l > 1.2 && <SvgText x={(g.start[0] + g.end[0]) / 2 * PX + 6} y={(g.start[1] + g.end[1]) / 2 * PX - 6} fontSize={12} fill={c.dim}>{l.toFixed(1)} m</SvgText>}
          </G>;
        }
        if (e.type === 'beam') return <Line key={e.id} x1={g.start[0] * PX} y1={g.start[1] * PX} x2={g.end[0] * PX} y2={g.end[1] * PX} stroke={c.beam} strokeWidth={3} strokeDasharray="10 6" />;
        if (e.type === 'column') {
          const sp = libById[e.library_item_id ?? '']?.specs ?? {}, w = ((sp.b_mm ?? g.b * 1000) / 1000) * PX, h = ((sp.h_mm ?? g.h * 1000) / 1000) * PX;
          return <Rect key={e.id} x={g.at[0] * PX - w / 2} y={g.at[1] * PX - h / 2} width={Math.max(w, 8)} height={Math.max(h, 8)} fill={c.col} />;
        }
        if (e.type === 'duct' || e.type === 'pipe') {
          const sp = libById[e.library_item_id ?? '']?.specs ?? {}, wpx = ((e.type === 'duct' ? sp.w_mm ?? 600 : sp.dia_mm ?? 110) / 1000) * PX;
          return <Line key={e.id} x1={g.start[0] * PX} y1={g.start[1] * PX} x2={g.end[0] * PX} y2={g.end[1] * PX} stroke={e.type === 'duct' ? c.duct : c.pipe} strokeWidth={Math.max(wpx, 3)} opacity={0.75} />;
        }
        if (e.type === 'door' || e.type === 'window') {
          const o = openingSeg(e, wallById); if (!o) return null;
          return <Line key={e.id} x1={o.a[0] * PX} y1={o.a[1] * PX} x2={o.b[0] * PX} y2={o.b[1] * PX} stroke={e.type === 'door' ? c.door : c.win} strokeWidth={e.type === 'door' ? 9 : 4} />;
        }
        if (e.type === 'equipment') return <Rect key={e.id} x={g.at[0] * PX - 14} y={g.at[1] * PX - 14} width={28} height={28} fill={c.plant} />;
        if (e.type === 'fixture') return <G key={e.id}><Circle cx={g.at[0] * PX} cy={g.at[1] * PX} r={8} fill={c.duct} /><SvgText x={g.at[0] * PX + 11} y={g.at[1] * PX + 4} fontSize={11} fill={c.dim}>{g.kw ?? 5} kW</SvgText></G>;
        return null;
      })}
    </>
  );
});

const GridLines = memo(function GridLines({ grids, c }: { grids: El[]; c: Pal }) {
  return (
    <>
      {grids.map(e => {
        const [a, b] = [e.geometry.start as Pt, e.geometry.end as Pt], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, r = 15;
        const bub = (p: Pt, k: number) => <G key={k}><Circle cx={p[0] * PX + ux * k * r} cy={p[1] * PX + uy * k * r} r={r} fill={c.bg} stroke={c.grid} strokeWidth={1.5} /><SvgText x={p[0] * PX + ux * k * r} y={p[1] * PX + uy * k * r + 4} fontSize={12} fontWeight="700" textAnchor="middle" fill={c.grid}>{e.geometry.label ?? ''}</SvgText></G>;
        return <G key={e.id}><Line x1={a[0] * PX} y1={a[1] * PX} x2={b[0] * PX} y2={b[1] * PX} stroke={c.grid} strokeWidth={1.4} strokeDasharray="22 5 3 5" />{bub(a, -1)}{bub(b, 1)}</G>;
      })}
    </>
  );
});

type SnapKind = 'end' | 'mid' | 'int' | 'cell';
// line segments and points of everything drawn, for object snapping
function snapGeo(all: El[], wallById: Record<string, El>) {
  const segs: [Pt, Pt][] = [], pts: [Pt, SnapKind][] = [];
  for (const e of all) {
    const g = e.geometry;
    if (e.type === 'dimension' || e.type === 'label') continue;
    if (g.start && g.end) { segs.push([g.start, g.end]); pts.push([g.start, 'end'], [g.end, 'end'], [[(g.start[0] + g.end[0]) / 2, (g.start[1] + g.end[1]) / 2], 'mid']); }
    else if (g.at) pts.push([g.at, 'end']);
    else if (g.poly) { g.poly.forEach((q: Pt, i: number) => { const n = g.poly[(i + 1) % g.poly.length]; segs.push([q, n]); pts.push([q, 'end'], [[(q[0] + n[0]) / 2, (q[1] + n[1]) / 2], 'mid']); }); }
    else if (g.rect) { const [x0, y0, x1, y1] = g.rect; segs.push([[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x1, y1], [x0, y1]], [[x0, y1], [x0, y0]]); pts.push([[x0, y0], 'end'], [[x1, y0], 'end'], [[x1, y1], 'end'], [[x0, y1], 'end'], [[(x0 + x1) / 2, (y0 + y1) / 2], 'mid']); }
  }
  return { segs, pts };
}
function segCross(a: [Pt, Pt], b: [Pt, Pt]): Pt | null {
  const [p, p2] = a, [q, q2] = b, rx = p2[0] - p[0], ry = p2[1] - p[1], sx = q2[0] - q[0], sy = q2[1] - q[1], den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const tt = ((q[0] - p[0]) * sy - (q[1] - p[1]) * sx) / den, u = ((q[0] - p[0]) * ry - (q[1] - p[1]) * rx) / den;
  return tt >= 0 && tt <= 1 && u >= 0 && u <= 1 ? [p[0] + tt * rx, p[1] + tt * ry] : null;
}

// points along the arc from a to b that passes through c, one chord per at most 10 degrees (a straight line if they are collinear)
function arcPoints(a: Pt, b: Pt, c: Pt): Pt[] {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-6) return [a, b];
  const ux = ((a[0] ** 2 + a[1] ** 2) * (b[1] - c[1]) + (b[0] ** 2 + b[1] ** 2) * (c[1] - a[1]) + (c[0] ** 2 + c[1] ** 2) * (a[1] - b[1])) / d;
  const uy = ((a[0] ** 2 + a[1] ** 2) * (c[0] - b[0]) + (b[0] ** 2 + b[1] ** 2) * (a[0] - c[0]) + (c[0] ** 2 + c[1] ** 2) * (b[0] - a[0])) / d;
  const r = Math.hypot(a[0] - ux, a[1] - uy), ang = (q: Pt) => Math.atan2(q[1] - uy, q[0] - ux);
  const a0 = ang(a), a1 = ang(b), ac = ang(c), TAU = Math.PI * 2, norm = (x: number) => ((x % TAU) + TAU) % TAU;
  let sweep = norm(a1 - a0);                                    // counter-clockwise sweep a to b
  if (norm(ac - a0) > sweep) sweep -= TAU;                      // c is not on that side: go the other way round
  const n = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 18))), out: Pt[] = [a];
  for (let i = 1; i < n; i++) { const th = a0 + (sweep * i) / n; out.push([r2(ux + r * Math.cos(th)), r2(uy + r * Math.sin(th))]); }
  out.push(b); return out;
}

// an aligned dimension: extension lines, the dimension line with ticks, and the measured length
function Dim({ a, b, off, c }: { a: Pt; b: Pt; off: number; c: Pal }) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  if (L < 1e-6) return null;
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux, sg = off >= 0 ? 1 : -1;
  const P = (q: Pt, k: number): [number, number] => [(q[0] + nx * k) * PX, (q[1] + ny * k) * PX], A = (q: Pt, k: number, t: number): [number, number] => [(q[0] + nx * k + ux * t) * PX, (q[1] + ny * k + uy * t) * PX];
  const p1 = P(a, off), p2 = P(b, off), mid: [number, number] = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI; if (deg > 90) deg -= 180; if (deg <= -90) deg += 180;
  const e1a = P(a, sg * 0.1), e1b = P(a, off + sg * 0.15), e2a = P(b, sg * 0.1), e2b = P(b, off + sg * 0.15), tk = 0.12;
  const tick = (q: Pt) => { const s0 = A(q, off, -tk * 0.7), s1 = A(q, off, tk * 0.7), n0 = [s0[0] - nx * tk * 0.7 * PX, s0[1] - ny * tk * 0.7 * PX], n1 = [s1[0] + nx * tk * 0.7 * PX, s1[1] + ny * tk * 0.7 * PX]; return <Line x1={n0[0]} y1={n0[1]} x2={n1[0]} y2={n1[1]} stroke={c.dim} strokeWidth={1.6} />; };
  return (
    <G>
      <Line x1={e1a[0]} y1={e1a[1]} x2={e1b[0]} y2={e1b[1]} stroke={c.dim} strokeWidth={0.8} /><Line x1={e2a[0]} y1={e2a[1]} x2={e2b[0]} y2={e2b[1]} stroke={c.dim} strokeWidth={0.8} />
      <Line x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} stroke={c.dim} strokeWidth={1.2} />{tick(a)}{tick(b)}
      <SvgText x={mid[0] - nx * sg * 5} y={mid[1] - ny * sg * 5} fontSize={12} fontWeight="700" textAnchor="middle" fill={c.dim} transform={`rotate(${deg} ${mid[0] - nx * sg * 5} ${mid[1] - ny * sg * 5})`}>{L.toFixed(2)}</SvgText>
    </G>
  );
}

// a name box that saves when you press Enter or leave it
function NameField({ value, onCommit, placeholder }: { value: string; onCommit: (v: string) => void; placeholder?: string }) {
  const [v, setV] = useState(value);
  const done = () => { const nm = v.trim(); if (nm && nm !== value) onCommit(nm); };
  return <TextInput value={v} onChangeText={setV} onBlur={done} onSubmitEditing={done} placeholder={placeholder ?? 'Room name'} style={s.nameIn} />;
}

function Highlight({ e, wallById }: { e: El; wallById: Record<string, El> }) {
  const g = e.geometry, c = '#c62828';
  if (e.type === 'door' || e.type === 'window') { const o = openingSeg(e, wallById); return o ? <Line x1={o.a[0] * PX} y1={o.a[1] * PX} x2={o.b[0] * PX} y2={o.b[1] * PX} stroke={c} strokeWidth={14} opacity={0.35} /> : null; }
  if (g.start && g.end) return <Line x1={g.start[0] * PX} y1={g.start[1] * PX} x2={g.end[0] * PX} y2={g.end[1] * PX} stroke={c} strokeWidth={Math.max(wallT(g) * PX, 4) + 8} opacity={0.35} />;
  if (g.at) return <Circle cx={g.at[0] * PX} cy={g.at[1] * PX} r={22} fill={c} fillOpacity={0.25} stroke={c} strokeWidth={2} />;
  if (g.poly) return <Polygon points={g.poly.map((q: Pt) => `${q[0] * PX},${q[1] * PX}`).join(' ')} fill={c} fillOpacity={0.12} stroke={c} strokeWidth={3} />;
  if (g.rect) return <Rect x={g.rect[0] * PX} y={g.rect[1] * PX} width={(g.rect[2] - g.rect[0]) * PX} height={(g.rect[3] - g.rect[1]) * PX} fill={c} fillOpacity={0.12} stroke={c} strokeWidth={3} />;
  return null;
}

export default function Plan() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { els, lib, stories, loaded, reload, addEls, removeEls, updateEl } = useModel(id);
  const [cur, setCur] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('wall');
  const [pick, setPick] = useState<Record<string, number>>({});
  const [start, setStart] = useState<Pt | null>(null);
  const [err, setErr] = useState('');
  const [elev, setElev] = useState(3.15);
  const [zoom, setZoom] = useState(0.6);
  const [kw, setKw] = useState(5);
  const [menu, setMenu] = useState<string | null>(null);
  const [open, setOpenS] = useState<Record<string, boolean>>({ design: true, view: true, doc: true, more: true, stories: true, here: true, tools: true, props: true });
  const tog = (k: string) => setOpenS(o => ({ ...o, [k]: !o[k] }));
  // desktop layout: each ribbon/panel can be folded away, and full window leaves only the drawing
  const [lay, setLayS] = useState<{ ribbon: boolean; left: boolean; right: boolean; full: boolean }>(() => {
    try { if (Platform.OS === 'web') { const v = JSON.parse(window.localStorage.getItem('unibuild.layout') ?? 'null'); if (v) return { ribbon: v.ribbon !== false, left: v.left !== false, right: v.right !== false, full: false }; } } catch { /* storage may be blocked */ }
    return { ribbon: true, left: true, right: true, full: false };
  });
  const setLay = (p: Partial<typeof lay>) => setLayS(o => {
    const n = { ...o, ...p };
    try { if (Platform.OS === 'web') window.localStorage.setItem('unibuild.layout', JSON.stringify(n)); } catch { /* ignore */ }
    return n;
  });
  const toggleFull = () => setLay({ full: !lay.full });
  const browserFull = () => { if (Platform.OS !== 'web') return; try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } catch { /* not allowed */ } };
  const [snap, setSnapS] = useState(plan.snap);
  const [grid, setGridS] = useState(plan.grid);
  const [dims, setDimsS] = useState(plan.dims);
  const [blue, setBlueS] = useState(plan.blue);
  const [wallTh, setWallThS] = useState(plan.wallTh);
  const [slabTh, setSlabThS] = useState(plan.slabTh);
  const [, bump] = useState(0);                       // design basis lives in lib/settings and is shared with the design screens
  const { width: winW } = useWindowDimensions();
  const wide = winW >= 900;
  const [vp, setVp] = useState({ w: 800, h: 500 });
  const hRef = useRef<ScrollView>(null), vRef = useRef<ScrollView>(null);
  const setSnap = (v: number) => { setPlan({ snap: v }); setSnapS(v); };
  const setBlue = (v: boolean) => { setPlan({ blue: v }); setBlueS(v); };
  const pal = blue ? PAL.blue : PAL.light;
  const setGrid = (v: boolean) => { setPlan({ grid: v }); setGridS(v); };
  const setDims = (v: boolean) => { setPlan({ dims: v }); setDimsS(v); };
  const setWallTh = (v: number) => { setPlan({ wallTh: v }); setWallThS(v); };
  const setSlabTh = (v: number) => { setPlan({ slabTh: v }); setSlabThS(v); };
  const basis = (p: Partial<typeof dsn>) => { setDsn(p); bump(n => n + 1); };
  const [selIds, setSelIds] = useState<string[]>([]);
  const setSelId = (sid: string | null) => setSelIds(sid ? [sid] : []);
  const [xf, setXf] = useState<{ kind: 'move' | 'copy'; base: Pt | null } | null>(null);
  const [mq, setMq] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [multi, setMulti] = useState(false);
  const [pts, setPts] = useState<Pt[]>([]);
  const [shape, setShape] = useState<'rect' | 'poly'>('rect');
  const [rForm, setRForm] = useState<RoofForm>('flat');
  const [rPitch, setRPitch] = useState(30);
  const [holeShape, setHoleShape] = useState<'rect' | 'circle'>('rect');
  const [rOver, setROver] = useState(0);
  const [rRidge, setRRidge] = useState<'auto' | 'x' | 'y'>('auto');
  const [osnap, setOsnap] = useState(true), [ortho, setOrtho] = useState(false);
  const [curKind, setCurKind] = useState<SnapKind>('cell');
  const [tf, setTf] = useState({ x: '', y: '', l: '', a: '' });
  const [note, setNote] = useState('Note');
  const [gen, setGen] = useState({ nx: 4, sx: 6, ny: 3, sy: 6 });
  const shiftRef = useRef(false), suppress = useRef(0);
  const hist = useRef<{ u: Cmd[]; r: Cmd[] }>({ u: [], r: [] });
  const [hn, setHn] = useState({ u: 0, r: 0 });
  const [cur2, setCur2] = useState<Pt | null>(null);       // snapped pointer position in metres (web)
  const canvasRef = useRef<any>(null);
  const [issues, setIssues] = useState<{ id: string; location: any; story_id: string | null }[]>([]);

  const story = stories.find(s => s.id === cur) ?? stories[0];
  const H = story?.height_m ?? 3.6;
  const here = useMemo(() => els.filter(e => e.type !== 'grid' && (e.story_id ?? stories[0]?.id) === story?.id), [els, stories, story]);
  const grids = useMemo(() => els.filter(e => e.type === 'grid'), [els]);
  const all = useMemo(() => [...here, ...grids], [here, grids]);
  const walls = useMemo(() => here.filter(e => e.type === 'wall'), [here]);
  const libById = useMemo(() => Object.fromEntries(lib.map(l => [l.id, l])), [lib]);
  const wallById = useMemo(() => Object.fromEntries(walls.map(w => [w.id, w])), [walls]);
  const def = TOOLS[tool];
  const polyMode = tool === 'zone' || ((tool === 'slab' || tool === 'roof') && shape === 'poly');
  const choices = useMemo(() => (def.lib ? lib.filter(def.lib) : []), [lib, def]);
  const chosen = choices.length ? choices[(pick[tool] ?? 0) % choices.length] : null;
  const selEls = useMemo(() => all.filter(e => selIds.includes(e.id)), [all, selIds]);
  const sel = selEls.length === 1 ? selEls[0] : null;

  const [pname, setPname] = useState('');
  useFocusEffect(useCallback(() => { rememberProject(id); supabase.from('projects').select('name').eq('id', id).single().then(({ data }) => setPname(data?.name ?? '')); }, [id]));

  // open clashes are fetched when the screen is shown, not on every edit
  useFocusEffect(useCallback(() => {
    supabase.from('issues').select('id,location,story_id').eq('project_id', id).eq('status', 'open').then(({ data }) => setIssues(((data as any[]) ?? []).filter(i => i.location)));
  }, [id]));

  // every edit is one undoable step. The model changes at once; the server write follows, and the model is reloaded if it fails.
  const dbRow = (r: El) => ({ id: r.id, project_id: id, story_id: r.story_id, type: r.type, discipline: DISC[r.type] ?? 'architecture', library_item_id: r.library_item_id, geometry: r.geometry, properties: r.properties ?? {} });
  const sync = () => setHn({ u: hist.current.u.length, r: hist.current.r.length });
  const apply = async (c: Cmd, rev: boolean) => {
    const ad = rev ? c.del : c.add, dl = rev ? c.add : c.del, md = c.mod.map(([x, y]) => (rev ? [y, x] : [x, y]) as [El, El]), errs: string[] = [];
    if (dl.length) removeEls(dl.map(x => x.id));
    if (ad.length) addEls(ad);
    md.forEach(([, to]) => updateEl(to));
    if (dl.length) { const r = await supabase.from('elements').delete().in('id', dl.map(x => x.id)); if (r.error) errs.push(r.error.message); }
    if (ad.length) { const r = await supabase.from('elements').insert(ad.map(dbRow)); if (r.error) errs.push(r.error.message); }
    for (const [, to] of md) { const r = await supabase.from('elements').update({ geometry: to.geometry }).eq('id', to.id); if (r.error) errs.push(r.error.message); }
    if (errs.length) { setErr(errs[0]); reload(); }
  };
  const run = async (c: Cmd) => { hist.current.u.push(c); if (hist.current.u.length > 200) hist.current.u.shift(); hist.current.r = []; sync(); await apply(c, false); };
  const undo = async () => { const c = hist.current.u.pop(); if (!c) return; hist.current.r.push(c); sync(); setSelIds([]); await apply(c, true); };
  const redo = async () => { const c = hist.current.r.pop(); if (!c) return; hist.current.u.push(c); sync(); setSelIds([]); await apply(c, false); };

  const add = async (geometry: object) => {
    setErr('');
    const type = DBT[tool] ?? tool, row: El = { id: newId(), type, geometry, library_item_id: chosen?.id ?? null, story_id: story?.id ?? null, properties: {} };
    await run({ add: [row], del: [], mod: [] });
  };

  // the point a tap or the pointer lands on: grid cell, then ortho lock, then object snap (end, middle, crossing)
  const geo = useMemo(() => snapGeo(all, wallById), [all, wallById]);
  const fromPt = (): Pt | null => (xf?.base ?? (pts.length && (tool === 'arc' || tool === 'dim' || polyMode) ? pts[pts.length - 1] : start && ['wall', 'beam', 'duct', 'pipe', 'grid'].includes(tool) ? start : null));
  const snapAt = (mx: number, my: number, from: Pt | null): { p: Pt; kind: SnapKind } => {
    const tol = 12 / (PX * zoom), cell = (v: number) => r2(Math.round(v / snap) * snap), lock = (ortho || shiftRef.current) && !!from;
    let ax = mx, ay = my, horiz = true;
    if (lock && from) { horiz = Math.abs(mx - from[0]) >= Math.abs(my - from[1]); if (horiz) ay = from[1]; else ax = from[0]; }
    let best: { p: Pt; kind: SnapKind } = { p: lock && from ? (horiz ? [cell(ax), from[1]] : [from[0], cell(ay)]) : [cell(ax), cell(ay)], kind: 'cell' };
    if (!osnap || (tool === 'select' && !xf) || tool === 'door' || tool === 'window') return best;
    const ok = (q: Pt) => !lock || !from || (horiz ? Math.abs(q[1] - from[1]) < 1e-6 : Math.abs(q[0] - from[0]) < 1e-6);
    let bs = Infinity;
    const cand = (q: Pt, kind: SnapKind) => { if (!ok(q)) return; const d = Math.hypot(q[0] - ax, q[1] - ay); if (d > tol) return; const sc = d - (kind === 'int' ? tol * 0.3 : kind === 'end' ? tol * 0.2 : 0); if (sc < bs) { bs = sc; best = { p: [r2(q[0]), r2(q[1])], kind }; } };
    for (const [q, k] of geo.pts) cand(q, k);
    for (const q of pts) cand(q, 'end');
    const near = geo.segs.filter(([a, b]) => segDist(a, b, ax, ay) < tol * 3).slice(0, 10);
    for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) { const x = segCross(near[i], near[j]); if (x) cand(x, 'int'); }
    return best;
  };
  const labelsFor = (vertical: boolean, count: number): string[] => {
    const used = new Set(grids.filter(g2 => (Math.abs(g2.geometry.end[0] - g2.geometry.start[0]) <= Math.abs(g2.geometry.end[1] - g2.geometry.start[1])) === vertical).map(g2 => String(g2.geometry.label)));
    const name = (i: number) => (vertical ? String(i + 1) : i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)));
    const out: string[] = []; for (let i = 0; out.length < count; i++) if (!used.has(name(i))) out.push(name(i));
    return out;
  };
  const gridRow = (a: Pt, b: Pt, label: string): El => ({ id: newId(), type: 'grid', geometry: { start: a, end: b, label }, library_item_id: null, story_id: null, properties: {} });
  const addGrid = async (a: Pt, b: Pt) => { const vert = Math.abs(b[0] - a[0]) <= Math.abs(b[1] - a[1]); await run({ add: [gridRow(a, b, labelsFor(vert, 1)[0])], del: [], mod: [] }); };
  const genGrid = async () => {
    const o: Pt = start ?? [2, 2], vx = labelsFor(true, gen.nx + 1), hy = labelsFor(false, gen.ny + 1), W = gen.nx * gen.sx, D = gen.ny * gen.sy, rows: El[] = [];
    for (let i = 0; i <= gen.nx; i++) rows.push(gridRow([r2(o[0] + i * gen.sx), r2(o[1] - 1.5)], [r2(o[0] + i * gen.sx), r2(o[1] + D + 1.5)], vx[i]));
    for (let j = 0; j <= gen.ny; j++) rows.push(gridRow([r2(o[0] - 1.5), r2(o[1] + j * gen.sy)], [r2(o[0] + W + 1.5), r2(o[1] + j * gen.sy)], hy[j]));
    setStart(null); await run({ add: rows, del: [], mod: [] });
  };
  const num = (v: string) => { const n = parseFloat(v.replace(',', '.')); return Number.isFinite(n) ? n : null; };
  const typedXY = () => { const x = num(tf.x), y = num(tf.y); if (x == null || y == null) return setErr('Type both X and Y in metres.'); setTf(f => ({ ...f, x: '', y: '' })); place([r2(x), r2(y)], x, y); };
  const typedPolar = () => {
    const base = start ?? pts[pts.length - 1] ?? null, l = num(tf.l); if (l == null || !base) return setErr('Type a length in metres after the start point.');
    const a = num(tf.a);
    let ux = 1, uy = 0;
    if (a != null) { ux = Math.cos((a * Math.PI) / 180); uy = -Math.sin((a * Math.PI) / 180); }
    else if (cur2 && (cur2[0] !== base[0] || cur2[1] !== base[1])) { const d = Math.hypot(cur2[0] - base[0], cur2[1] - base[1]); ux = (cur2[0] - base[0]) / d; uy = (cur2[1] - base[1]) / d; }
    const q: Pt = [r2(base[0] + l * ux), r2(base[1] + l * uy)]; setTf(f => ({ ...f, l: '' })); place(q, q[0], q[1]);
  };

  const closePoly = async (poly: Pt[]) => {
    setPts([]);
    if (polyArea(poly) < 0.01) return setErr('That outline has no area.');
    if (tool === 'roof' && rForm !== 'flat') { setPts([]); return setErr('Pitched roofs need the Rectangle shape. Switch Shape to Rectangle, or set the form to Flat.'); }
    const rect = polyBox(poly), n = els.filter(e => e.type === 'zone' && (e.story_id ?? stories[0]?.id) === story?.id).length;
    if (tool === 'zone') return void (await add({ poly, rect, name: `Room ${n + 1}` }));
    await add({ poly, rect, z0: tool === 'roof' ? H : r2(H - slabTh), z1: tool === 'roof' ? r2(H + slabTh) : H });
  };
  const finish = () => { if (polyMode && pts.length >= 3) closePoly(pts); else { setStart(null); setPts([]); } };

  const tap = async (wx: number, wy: number) => {
    if (Date.now() - suppress.current < 300) return;          // the click that ends a rectangle selection
    const mx = wx / PX, my = wy / PX;
    const { p } = snapAt(mx, my, fromPt());
    if (xf) {
      if (!xf.base) return setXf({ ...xf, base: p });
      const k = xf.kind; setXf(null); return void (await doXf(k, r2(p[0] - xf.base[0]), r2(p[1] - xf.base[1])));
    }
    if (tool === 'select') {
      const sid = hitTest(all, wallById, mx, my, 14 / (PX * zoom))?.id ?? null;
      if (shiftRef.current || multi) setSelIds(old => (sid ? (old.includes(sid) ? old.filter(x => x !== sid) : [...old, sid]) : old));
      else setSelIds(sid ? [sid] : []);
      return;
    }
    return place(p, mx, my);
  };

  // put a point of the current tool down (from a tap or from typed values)
  const place = async (p: Pt, mx: number, my: number) => {
    if (tool === 'column') { const sp = chosen?.specs ?? {}; return add({ at: p, b: (sp.b_mm ?? 300) / 1000, h: (sp.h_mm ?? 300) / 1000, height: H }); }
    if (tool === 'plant') return add({ at: p });
    if (tool === 'outlet') return add({ at: p, kw });
    if (tool === 'door' || tool === 'window') {
      const hit = nearestWall(walls, mx, my);
      if (!hit || hit.d > 0.5) return setErr('Tap close to a wall to place it.');
      const width = chosen?.specs?.w ?? (tool === 'door' ? 0.9 : 1.5), off = Math.max(width / 2, Math.min(hit.len - width / 2, hit.off));
      return add({ wall_id: hit.w.id, offset_m: r2(off), width_m: width });
    }
    if (tool === 'stair') {
      if (!start) return setStart(p);
      if (p[0] === start[0] || p[1] === start[1]) return setStart(null);
      const rect = [Math.min(start[0], p[0]), Math.min(start[1], p[1]), Math.max(start[0], p[0]), Math.max(start[1], p[1])];
      await add({ rect, z0: 0, z1: H }); return setStart(null);
    }
    if (tool === 'label') return void (await add({ at: p, text: note.trim() || 'Note', h: 0.25 }));
    if (tool === 'dim') {
      if (pts.length < 2) return setPts(old => (old.length && old[old.length - 1][0] === p[0] && old[old.length - 1][1] === p[1] ? old : [...old, p]));
      const [a, b] = pts, L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, off = r2(((p[0] - a[0]) * -(b[1] - a[1]) + (p[1] - a[1]) * (b[0] - a[0])) / L);
      setPts([]); return void (await add({ start: a, end: b, offset: off === 0 ? 0.6 : off }));
    }
    if (tool === 'arc') {
      if (pts.length < 2) return setPts(old => (old.length && old[old.length - 1][0] === p[0] && old[old.length - 1][1] === p[1] ? old : [...old, p]));
      const segs = arcPoints(pts[0], pts[1], p);
      const rows: El[] = segs.slice(1).map((q, i) => ({ id: newId(), type: 'wall', geometry: { start: segs[i], end: q, height: H, thickness: wallTh }, library_item_id: null, story_id: story?.id ?? null, properties: {} }));
      setPts([]); return void (await run({ add: rows, del: [], mod: [] }));
    }
    if (polyMode) {
      if (pts.length >= 3 && Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) < Math.max(snap * 0.6, 12 / (PX * zoom))) return void (await closePoly(pts));
      return setPts(old => (old.length && old[old.length - 1][0] === p[0] && old[old.length - 1][1] === p[1] ? old : [...old, p]));
    }
    if (tool === 'grid') { if (!start) return setStart(p); if (p[0] === start[0] && p[1] === start[1]) return setStart(null); await addGrid(start, p); return setStart(null); }
    if (!start) return setStart(p);
    if (p[0] === start[0] && p[1] === start[1]) return setStart(null);
    if (tool === 'hole' && holeShape === 'circle') {
      const radius = r2(Math.hypot(p[0] - start[0], p[1] - start[1])), host = here.find(e => (e.type === 'slab' || e.type === 'roof') && inPoly(footprint(e.geometry) ?? [], start[0], start[1]));
      const c: [number, number] = [start[0], start[1]];
      setStart(null);
      if (!host) return setErr('Put the centre of the round opening inside a slab or roof on this storey.');
      if (radius < 0.05) return setErr('That opening is too small: tap further from the centre to set the radius.');
      return void (await run({ add: [], del: [], mod: [[host, { ...host, geometry: { ...host.geometry, rounds: [...roundsOf(host.geometry), { c, r: radius }] } }] as [El, El]] }));
    }
    if (tool === 'hole') {
      const hole: [number, number, number, number] = [Math.min(start[0], p[0]), Math.min(start[1], p[1]), Math.max(start[0], p[0]), Math.max(start[1], p[1])], cx = (hole[0] + hole[2]) / 2, cy = (hole[1] + hole[3]) / 2;
      const host = here.find(e => (e.type === 'slab' || e.type === 'roof') && inPoly(footprint(e.geometry) ?? [], cx, cy));
      setStart(null);
      if (!host) return setErr('Draw the opening inside a slab or roof on this storey.');
      return void (await run({ add: [], del: [], mod: [[host, { ...host, geometry: { ...host.geometry, holes: [...holesOf(host.geometry), hole] } }] as [El, El]] }));
    }
    if (tool === 'slab' || tool === 'roof') { await add({ rect: [Math.min(start[0], p[0]), Math.min(start[1], p[1]), Math.max(start[0], p[0]), Math.max(start[1], p[1])], z0: tool === 'roof' ? H : r2(H - slabTh), z1: tool === 'roof' ? r2(H + slabTh) : H, ...(tool === 'roof' && rForm !== 'flat' ? { form: rForm, pitch: rPitch, ...(rOver > 0 ? { overhang: rOver } : {}), ...(rRidge !== 'auto' ? { ridge: rRidge } : {}) } : {}) }); return setStart(null); }
    await add(tool === 'wall' ? { start, end: p, height: H, thickness: wallTh } : tool === 'duct' || tool === 'pipe' ? { start, end: p, elevation_m: r2(elev) } : { start, end: p });
    setStart(p);
  };


  const isOpen = (e: El) => e.type === 'door' || e.type === 'window';
  // delete elements (and the doors and windows in a deleted wall)
  const removeMany = async (list: El[]) => {
    const ids = new Set(list.map(x => x.id)), gone = [...list, ...here.filter(o => isOpen(o) && !ids.has(o.id) && ids.has(o.geometry.wall_id))];
    if (!gone.length) return;
    setSelIds([]); await run({ add: [], del: gone, mod: [] });
  };
  const remove = (e: El) => removeMany([e]);
  const edit = async (e: El, geometry: any) => { await run({ add: [], del: [], mod: [[e, { ...e, geometry }]] }); };
  // mark or clear walls as structural core walls (used by the 3D core and P-delta analysis)
  const setCore = async (list: El[], on: boolean) => { const w = list.filter(x => x.type === 'wall' && !!x.geometry.core !== on); if (w.length) await run({ add: [], del: [], mod: w.map(x => [x, { ...x, geometry: { ...x.geometry, core: on || undefined } }] as [El, El]) }); };

  // move or copy the selection by (dx, dy) metres; doors and windows follow their wall
  const shiftG = (g: any, dx: number, dy: number) => {
    const o = { ...g };
    if (g.start) { o.start = [r2(g.start[0] + dx), r2(g.start[1] + dy)]; o.end = [r2(g.end[0] + dx), r2(g.end[1] + dy)]; }
    if (g.at) o.at = [r2(g.at[0] + dx), r2(g.at[1] + dy)];
    if (g.poly) o.poly = g.poly.map((q: Pt) => [r2(q[0] + dx), r2(q[1] + dy)]);
    if (g.rect) o.rect = [r2(g.rect[0] + dx), r2(g.rect[1] + dy), r2(g.rect[2] + dx), r2(g.rect[3] + dy)];
    if (Array.isArray(g.holes)) o.holes = g.holes.map((h: number[]) => [r2(h[0] + dx), r2(h[1] + dy), r2(h[2] + dx), r2(h[3] + dy)]);
    if (Array.isArray(g.rounds)) o.rounds = g.rounds.map((q: any) => ({ ...q, c: [r2(q.c[0] + dx), r2(q.c[1] + dy)] }));
    return o;
  };
  const doXf = async (kind: 'move' | 'copy', dx: number, dy: number) => {
    if (!selEls.length || (!dx && !dy)) return;
    const ids = new Set(selIds), body = selEls.filter(e => !isOpen(e));
    if (!body.length) return setErr('Select the wall: its doors and windows move and copy with it.');
    if (kind === 'move') return void (await run({ add: [], del: [], mod: body.map(e => [e, { ...e, geometry: shiftG(e.geometry, dx, dy) }] as [El, El]) }));
    const map: Record<string, string> = {}, rows: El[] = body.map(e => { map[e.id] = newId(); return { ...e, id: map[e.id], geometry: shiftG(e.geometry, dx, dy) }; });
    here.filter(o => isOpen(o) && (ids.has(o.id) || ids.has(o.geometry.wall_id)) && map[o.geometry.wall_id]).forEach(o => rows.push({ ...o, id: newId(), geometry: { ...o.geometry, wall_id: map[o.geometry.wall_id] } }));
    setSelIds(rows.map(r => r.id)); await run({ add: rows, del: [], mod: [] });
  };
  const doTurn = async (xf: Xf) => {
    const body = selEls.filter(e => !isOpen(e));
    if (!body.length) return setErr('Select something to rotate or mirror first (doors and windows follow their wall).');
    const c = centreOf(body.map(e => e.geometry));
    await run({ add: [], del: [], mod: body.map(e => [e, { ...e, geometry: transformGeometry(e.geometry, c, xf) }] as [El, El]) });
  };
  const bbox = (e: El): [number, number, number, number] | null => {
    const g = e.geometry;
    if (g.start) return [Math.min(g.start[0], g.end[0]), Math.min(g.start[1], g.end[1]), Math.max(g.start[0], g.end[0]), Math.max(g.start[1], g.end[1])];
    if (g.at) return [g.at[0] - 0.15, g.at[1] - 0.15, g.at[0] + 0.15, g.at[1] + 0.15];
    if (g.rect) return [g.rect[0], g.rect[1], g.rect[2], g.rect[3]];
    if (isOpen(e)) { const o = openingSeg(e, wallById); return o ? [Math.min(o.a[0], o.b[0]), Math.min(o.a[1], o.b[1]), Math.max(o.a[0], o.b[0]), Math.max(o.a[1], o.b[1])] : null; }
    return null;
  };
  // rectangle selection: left to right takes what is fully inside, right to left takes what it touches
  const pickBox = (a: Pt, b: Pt, crossing: boolean) => {
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    const hit = all.filter(e => { const bb = bbox(e); if (!bb) return false; return crossing ? bb[0] <= x1 && bb[2] >= x0 && bb[1] <= y1 && bb[3] >= y0 : bb[0] >= x0 && bb[2] <= x1 && bb[1] >= y0 && bb[3] <= y1; }).map(e => e.id);
    setSelIds(old => (shiftRef.current || multi ? [...new Set([...old, ...hit])] : hit));
  };
  const live = useRef<any>({});
  live.current = { tool, zoom, xf, pickBox };

  const addStorey = async (copy: boolean) => {
    if (!story) return;
    const last = stories[stories.length - 1];
    const { data: ns, error } = await supabase.from('stories').insert({ project_id: id, name: `Level ${stories.length}`, elevation_m: last.elevation_m + last.height_m, height_m: H, sort_order: stories.length }).select('id').single();
    if (error || !ns) return setErr(error?.message ?? 'Could not add the storey');
    if (copy) {
      const idMap: Record<string, string> = {}, ws = here.filter(e => e.type === 'wall');
      if (ws.length) {
        const { data } = await supabase.from('elements').insert(ws.map(w => ({ project_id: id, story_id: ns.id, type: 'wall', discipline: 'architecture', library_item_id: w.library_item_id, geometry: w.geometry }))).select('id');
        (data ?? []).forEach((d: any, i: number) => (idMap[ws[i].id] = d.id));
      }
      const rest = here.filter(e => e.type !== 'wall').map(e => ({ project_id: id, story_id: ns.id, type: e.type, discipline: DISC[e.type] ?? 'architecture', library_item_id: e.library_item_id, geometry: e.type === 'door' || e.type === 'window' ? { ...e.geometry, wall_id: idMap[e.geometry.wall_id] } : e.geometry }))
        .filter(r => !((r.type === 'door' || r.type === 'window') && !r.geometry.wall_id));
      if (rest.length) await supabase.from('elements').insert(rest);
    }
    setCur(ns.id); await reload();
  };

  const counts = useMemo(() => here.reduce<Record<string, number>>((a, e) => ({ ...a, [e.type]: (a[e.type] ?? 0) + 1 }), {}), [here]);
  const wallLen = useMemo(() => walls.reduce((a, w) => a + Math.hypot(w.geometry.end[0] - w.geometry.start[0], w.geometry.end[1] - w.geometry.start[1]), 0), [walls]);
  const nHere = issues.filter(i => (i.story_id ?? stories[0]?.id) === story?.id);
  const S = N * PX;

  // what the inspector shows and lets you change for the selected element
  const inspector = (e: El) => {
    const g = e.geometry, steps: [string, string, () => void, () => void][] = [], actions: [string, () => void][] = [];
    let info = '';
    const len = g.start && g.end ? Math.hypot(g.end[0] - g.start[0], g.end[1] - g.start[1]) : 0;
    if (e.type === 'wall') {
      info = `${len.toFixed(2)} m long · ${Math.round(wallT(g) * 1000)} mm thick · ${r2(g.height ?? H)} m high${fireOf(g) ? ` · ${fireOf(g)} min fire rating` : ''}`;
      steps.push(['Thickness', `${Math.round(wallT(g) * 1000)} mm`, () => edit(e, { ...g, thickness: Math.max(0.1, r2(wallT(g) - 0.025)) }), () => edit(e, { ...g, thickness: Math.min(0.6, r2(wallT(g) + 0.025)) })]);
      steps.push(['Fire rating', fireOf(g) ? `${fireOf(g)} min` : 'none', () => edit(e, { ...g, fire: RATINGS[Math.max(0, RATINGS.indexOf(fireOf(g)) - 1)] }), () => edit(e, { ...g, fire: RATINGS[Math.min(RATINGS.length - 1, RATINGS.indexOf(fireOf(g)) + 1)] })]);
      steps.push(['Height', `${r2(g.height ?? H)} m`, () => edit(e, { ...g, height: Math.max(1, r2((g.height ?? H) - 0.1)) }), () => edit(e, { ...g, height: r2((g.height ?? H) + 0.1) })]);
      actions.push([g.core ? '✓ Structural core wall (tap to clear)' : '○ Mark as structural core wall', () => setCore([e], !g.core)]);
    } else if (e.type === 'beam') {
      const sec = beamSec(g, libById[e.library_item_id ?? '']?.specs), b = Math.round(sec.b * 1000), h = Math.round(sec.d * 1000);
      info = `${len.toFixed(2)} m long · ${b} × ${h} mm`;
      steps.push(['Width', `${b} mm`, () => edit(e, { ...g, b_mm: Math.max(150, b - 25), h_mm: h }), () => edit(e, { ...g, b_mm: Math.min(600, b + 25), h_mm: h })]);
      steps.push(['Depth', `${h} mm`, () => edit(e, { ...g, b_mm: b, h_mm: Math.max(200, h - 25) }), () => edit(e, { ...g, b_mm: b, h_mm: Math.min(1200, h + 25) })]);
    } else if (e.type === 'column') {
      const sp = libById[e.library_item_id ?? '']?.specs ?? {};
      info = `${sp.b_mm ?? Math.round(g.b * 1000)} × ${sp.h_mm ?? Math.round(g.h * 1000)} mm · at ${g.at[0]}, ${g.at[1]} m`;
    } else if (e.type === 'slab' || e.type === 'roof') {
      const t = Math.round((g.z1 - g.z0) * 1000), [x0, y0, x1, y1] = g.rect, fp = footprint(g);
      if (e.type === 'roof' && g.rect) { const pf = roofForm(g); steps.push(['Pitch', pf === 'flat' ? 'flat' : `${Math.round(g.pitch)}°`, () => edit(e, { ...g, pitch: Math.max(0, (g.pitch ?? 0) - 5), form: (g.pitch ?? 0) - 5 <= 0 ? 'flat' : (g.form ?? 'gable') }), () => edit(e, { ...g, pitch: Math.min(60, (g.pitch ?? 0) + 5), form: g.form && g.form !== 'flat' ? g.form : 'gable' })]); if (pf !== 'flat') { steps.push(['Overhang', `${overhangOf(g).toFixed(1)} m`, () => edit(e, { ...g, overhang: Math.max(0, r2(overhangOf(g) - 0.1)) }), () => edit(e, { ...g, overhang: Math.min(1.5, r2(overhangOf(g) + 0.1)) })]); actions.push(['Change form', () => edit(e, { ...g, form: pf === 'mono' ? 'gable' : pf === 'gable' ? 'hip' : 'mono' })]); actions.push(['Turn ridge', () => edit(e, { ...g, ridge: (g.ridge ?? (g.rect[2] - g.rect[0] >= g.rect[3] - g.rect[1] ? 'x' : 'y')) === 'x' ? 'y' : 'x' })]); if (pf === 'mono') actions.push(['Flip slope', () => edit(e, { ...g, flip: !g.flip })]); } }
      info = (e.type === 'roof' && isPitched(g) ? `${roofLabel(g)} · ` : '') + (openingCount(g) ? `${netArea(g).toFixed(1)} m² net · ${openingCount(g)} opening(s) · ${t} mm thick` : g.poly ? `${fp ? polyArea(fp).toFixed(1) : '?'} m² polygon · ${t} mm thick` : `${(x1 - x0).toFixed(1)} × ${(y1 - y0).toFixed(1)} m · ${t} mm thick`);
      steps.push(['Thickness', `${t} mm`, () => edit(e, { ...g, z0: r2(g.z1 - Math.max(0.1, (t - 25) / 1000)) }), () => edit(e, { ...g, z0: r2(g.z1 - Math.min(0.6, (t + 25) / 1000)) })]);
    } else if (e.type === 'duct' || e.type === 'pipe') {
      info = `${len.toFixed(2)} m long · centreline ${r2(g.elevation_m)} m above the floor`;
      steps.push(['Height', `${r2(g.elevation_m)} m`, () => edit(e, { ...g, elevation_m: Math.max(0.1, r2(g.elevation_m - 0.1)) }), () => edit(e, { ...g, elevation_m: Math.min(H, r2(g.elevation_m + 0.1)) })]);
    } else if (e.type === 'fixture') {
      info = `Outlet at ${g.at[0]}, ${g.at[1]} m`;
      steps.push(['Cooling load', `${g.kw ?? 5} kW`, () => edit(e, { ...g, kw: Math.max(1, (g.kw ?? 5) - 1) }), () => edit(e, { ...g, kw: Math.min(50, (g.kw ?? 5) + 1) })]);
    } else if (e.type === 'door' || e.type === 'window') {
      info = `${r2(g.width_m)} m wide, ${r2(g.offset_m)} m along its wall`;
      steps.push(['Width', `${r2(g.width_m)} m`, () => edit(e, { ...g, width_m: Math.max(0.5, r2(g.width_m - 0.1)) }), () => edit(e, { ...g, width_m: Math.min(3, r2(g.width_m + 0.1)) })]);
    } else if (e.type === 'stair') {
      const [x0, y0, x1, y1] = g.rect, n = stairSteps(g), rise = ((g.z1 - g.z0) / n) * 1000, run = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)), width = Math.min(Math.abs(x1 - x0), Math.abs(y1 - y0)), need = 0.25 * (n - 1);
      info = `${n} risers of ${Math.round(rise)} mm · ${width.toFixed(2)} m wide · ${run.toFixed(2)} m run${run + 1e-6 < need ? ` (needs about ${need.toFixed(1)} m for 250 mm treads)` : ''}`;
      actions.push(['Flip direction', () => edit(e, { ...g, flip: !g.flip })]);
    } else if (e.type === 'dimension') {
      info = `${len.toFixed(2)} m measured · line ${r2(g.offset ?? 0.6)} m from the points`;
      steps.push(['Line offset', `${r2(g.offset ?? 0.6)} m`, () => edit(e, { ...g, offset: r2((g.offset ?? 0.6) - 0.1) }), () => edit(e, { ...g, offset: r2((g.offset ?? 0.6) + 0.1) })]);
    } else if (e.type === 'label') info = 'Text note';
    else if (e.type === 'zone') info = `${g.poly ? polyArea(g.poly).toFixed(1) : '?'} m² · ${g.poly?.length ?? 0} corners`;
    else if (e.type === 'grid') info = `Grid line ${g.label ?? ''} · ${len.toFixed(2)} m long`;
    else if (e.type === 'equipment') info = `Plant at ${g.at[0]}, ${g.at[1]} m`;
    return { info, steps, actions };
  };

  const startXf = (kind: 'move' | 'copy') => { if (!selEls.length) return setErr('Select something first, then choose Move or Copy.'); setTool('select'); setStart(null); setXf({ kind, base: null }); setErr(''); };
  const setT = (k: Tool) => { setTool(k); setStart(null); setPts([]); setXf(null); setErr(''); if (k !== 'select') setSelId(null); };
  const ti = (k: Tool): RItem => ({ key: k, label: TOOLS[k].label, icon: TOOL_ICON[k], active: tool === k, onPress: () => setT(k) });
  const go = (route: string): RItem['onPress'] => () => router.push(`/${route}/${id}` as any);
  const exportIfc = async () => {
    try { const { data: pr } = await supabase.from('projects').select('name').eq('id', id).single(); const nm = pr?.name ?? 'Unibuild'; await saveFile(`${nm.replace(/[^A-Za-z0-9_-]+/g, '_')}.ifc`, toIfc(nm, els, lib, stories)); setErr('IFC exported'); }
    catch (e: any) { setErr('IFC export failed: ' + (e?.message ?? e)); }
  };
  const exportDxf = async () => {
    try { const { data: pr } = await supabase.from('projects').select('name').eq('id', id).single(); const nm = (pr?.name ?? 'Unibuild').replace(/[^A-Za-z0-9_-]+/g, '_'); await saveFile(`${nm}-${(story?.name ?? 'plan').replace(/[^A-Za-z0-9_-]+/g, '_')}.dxf`, planDxf(els, lib, stories, story?.id ?? '')); setErr(`Plan of ${story?.name ?? 'this storey'} saved as DXF (millimetres, opens in AutoCAD and other CAD programs)`); }
    catch (e: any) { setErr('DXF export failed: ' + (e?.message ?? e)); }
  };
  const stepStorey = (d: number) => { const i = stories.findIndex(x => x.id === story?.id), n = stories[i + d]; if (n) { setCur(n.id); setStart(null); setSelId(null); } };
  // fit the drawing in the window
  const fit = () => {
    const xs: number[] = [], ys: number[] = [];
    for (const e of here) { const g = e.geometry; if (g.start) { xs.push(g.start[0], g.end[0]); ys.push(g.start[1], g.end[1]); } if (g.at) { xs.push(g.at[0]); ys.push(g.at[1]); } if (g.rect) { xs.push(g.rect[0], g.rect[2]); ys.push(g.rect[1], g.rect[3]); } }
    if (!xs.length) { setZoom(0.6); setTimeout(() => { hRef.current?.scrollTo({ x: 0, animated: false }); vRef.current?.scrollTo({ y: 0, animated: false }); }, 30); return; }
    const x0 = Math.min(...xs) - 1.5, y0 = Math.min(...ys) - 1.5, w = Math.max(...xs) + 1.5 - x0, d = Math.max(...ys) + 1.5 - y0;
    const z = Math.max(0.15, Math.min(3, vp.w / (w * PX), vp.h / (d * PX)));
    setZoom(z); setTimeout(() => { hRef.current?.scrollTo({ x: x0 * PX * z, animated: false }); vRef.current?.scrollTo({ y: y0 * PX * z, animated: false }); }, 50);
  };
  const cycle = (d: number) => setPick(pk => ({ ...pk, [tool]: ((pk[tool] ?? 0) + d + choices.length * 1000) % Math.max(choices.length, 1) }));
  const short = (x: string, n = 15) => (x.length > n ? x.slice(0, n - 1) + '…' : x);

  const toolSettings = (
    <>
      {tool === 'select' && <><Toggle label="Add to selection" on={multi} onChange={setMulti} /><Text style={s.rhint}>Tap an element, or drag a box (left to right: inside; right to left: touching). Shift adds. Then Move (M), Copy (K), arrows to nudge.</Text></>}
      {choices.length > 0 && <Stepper label={`${def.label} type`} value={chosen ? short(chosen.name, 16) : '-'} dec={() => cycle(-1)} inc={() => cycle(1)} />}
      {(tool === 'slab' || tool === 'roof') && <Seg label="Shape" options={[['rect', 'Rectangle'], ['poly', 'Polygon']]} value={shape} onChange={v => setShape(v as 'rect' | 'poly')} />}
      {(tool === 'wall' || tool === 'arc') && <Stepper label="Wall thickness" value={`${Math.round(wallTh * 1000)} mm`} dec={() => setWallTh(Math.max(0.1, r2(wallTh - 0.025)))} inc={() => setWallTh(Math.min(0.6, r2(wallTh + 0.025)))} />}
      {tool === 'hole' && <Seg label="Shape" options={[['rect', 'Rectangle'], ['circle', 'Circle']]} value={holeShape} onChange={v => setHoleShape(v as 'rect' | 'circle')} />}
      {tool === 'roof' && <Seg label="Form" options={FORMS} value={rForm} onChange={v => setRForm(v as RoofForm)} />}
      {tool === 'roof' && rForm !== 'flat' && <Stepper label="Pitch" value={`${rPitch}°`} dec={() => setRPitch(v => Math.max(5, v - 5))} inc={() => setRPitch(v => Math.min(60, v + 5))} />}
      {tool === 'roof' && rForm !== 'flat' && <Stepper label="Overhang" value={`${rOver.toFixed(1)} m`} dec={() => setROver(v => Math.max(0, r2(v - 0.1)))} inc={() => setROver(v => Math.min(1.5, r2(v + 0.1)))} />}
      {tool === 'roof' && (rForm === 'gable' || rForm === 'mono') && <Seg label="Ridge runs" options={[['auto', 'Long side'], ['x', 'Along X'], ['y', 'Along Y']]} value={rRidge} onChange={v => setRRidge(v as 'auto' | 'x' | 'y')} />}
      {(tool === 'slab' || tool === 'roof') && <Stepper label={tool === 'roof' ? 'Roof thickness' : 'Slab thickness'} value={`${Math.round(slabTh * 1000)} mm`} dec={() => setSlabTh(Math.max(0.1, r2(slabTh - 0.025)))} inc={() => setSlabTh(Math.min(0.6, r2(slabTh + 0.025)))} />}
      {(tool === 'duct' || tool === 'pipe') && <Stepper label="Centreline height" value={`${elev.toFixed(2)} m`} dec={() => setElev(v => Math.max(0.1, r2(v - 0.1)))} inc={() => setElev(v => Math.min(H, r2(v + 0.1)))} />}
      {tool === 'outlet' && <Stepper label="Cooling load" value={`${kw} kW`} dec={() => setKw(v => Math.max(1, v - 1))} inc={() => setKw(v => Math.min(50, v + 1))} />}
      {tool === 'label' && <Field text label="Text" value={note} onChange={setNote} onSubmit={() => {}} placeholder="note" />}
      {tool === 'grid' && <>
        <Stepper label="Bays across" value={`${gen.nx}`} dec={() => setGen(g2 => ({ ...g2, nx: Math.max(1, g2.nx - 1) }))} inc={() => setGen(g2 => ({ ...g2, nx: Math.min(20, g2.nx + 1) }))} />
        <Stepper label="Bay width" value={`${gen.sx} m`} dec={() => setGen(g2 => ({ ...g2, sx: Math.max(2, r2(g2.sx - 0.5)) }))} inc={() => setGen(g2 => ({ ...g2, sx: Math.min(15, r2(g2.sx + 0.5)) }))} />
        <Stepper label="Bays down" value={`${gen.ny}`} dec={() => setGen(g2 => ({ ...g2, ny: Math.max(1, g2.ny - 1) }))} inc={() => setGen(g2 => ({ ...g2, ny: Math.min(20, g2.ny + 1) }))} />
        <Stepper label="Bay depth" value={`${gen.sy} m`} dec={() => setGen(g2 => ({ ...g2, sy: Math.max(2, r2(g2.sy - 0.5)) }))} inc={() => setGen(g2 => ({ ...g2, sy: Math.min(15, r2(g2.sy + 0.5)) }))} />
        <Btn label={start ? 'Generate from start' : 'Generate at 2, 2'} onPress={genGrid} />
      </>}
      {!['select', 'door', 'window'].includes(tool) && tool !== 'label' && <>
        <View style={s.qsep} />
        <Field label="X (m)" value={tf.x} onChange={v => setTf(f => ({ ...f, x: v }))} onSubmit={typedXY} placeholder="x" />
        <Field label="Y (m)" value={tf.y} onChange={v => setTf(f => ({ ...f, y: v }))} onSubmit={typedXY} placeholder="y" />
        <Btn label="Place" onPress={typedXY} />
        {(start || (pts.length > 0 && (tool === 'arc' || tool === 'dim' || polyMode))) && tool !== 'stair' && tool !== 'hole' && !(tool === 'slab' && !polyMode) && <>
          <Field label="Length (m)" value={tf.l} onChange={v => setTf(f => ({ ...f, l: v }))} onSubmit={typedPolar} placeholder="len" />
          <Field label="Angle (°)" value={tf.a} onChange={v => setTf(f => ({ ...f, a: v }))} onSubmit={typedPolar} placeholder="toward cursor" />
          <Btn label="Place" onPress={typedPolar} />
        </>}
      </>}
      {['beam', 'column', 'door', 'window', 'plant'].includes(tool) && choices.length === 0 && tool !== 'column' && tool !== 'beam' && tool !== 'plant' && <Text style={s.rhint}>No settings for this tool.</Text>}
    </>
  );
  const mi = (label: string, onPress?: () => void, extra: Partial<{ checked: boolean; disabled: boolean }> = {}) => ({ label, onPress, ...extra });
  const SEP = { label: '', sep: true };
  const menus: Menu[] = [
    { key: 'file', label: 'File', items: [mi('Projects', () => router.replace('/projects')), mi('Modules', () => router.push(`/hub/${id}` as any)), SEP, mi('Import IFC…', go('import')), mi('Export IFC', exportIfc), mi('Export DXF (this storey)', exportDxf)] },
    { key: 'edit', label: 'Edit', items: [mi('Undo', undo, { disabled: !hn.u }), mi('Redo', redo, { disabled: !hn.r }), SEP, mi('Rotate right 90° (E)', () => doTurn({ kind: 'rot', quarter: 1 }), { disabled: !selEls.length }), mi('Rotate left 90° (Q)', () => doTurn({ kind: 'rot', quarter: -1 }), { disabled: !selEls.length }), mi('Mirror left-right (H)', () => doTurn({ kind: 'mirror', axis: 'x' }), { disabled: !selEls.length }), mi('Mirror top-bottom (F)', () => doTurn({ kind: 'mirror', axis: 'y' }), { disabled: !selEls.length }), SEP, mi('Select (V)', () => setT('select')), mi('Select all on this storey', () => { setT('select'); setSelIds(all.map(e => e.id)); }), SEP, mi('Move selection (M)', () => startXf('move'), { disabled: !selEls.length }), mi('Copy selection (K)', () => startXf('copy'), { disabled: !selEls.length }), mi('Delete selected', () => removeMany(selEls), { disabled: !selEls.length }), SEP, mi('Finish shape or chain (Enter)', finish, { disabled: !start && !pts.length })] },
    { key: 'view', label: 'View', items: [mi('Zoom in', () => setZoom(z => Math.min(3, z * 1.25))), mi('Zoom out', () => setZoom(z => Math.max(0.15, z / 1.25))), mi('Fit to window', fit), SEP, mi('Full window (F9)', toggleFull, { checked: lay.full }), mi('Tool ribbon', () => setLay({ ribbon: !lay.ribbon }), { checked: lay.ribbon }), mi('Tool palette (left)', () => setLay({ left: !lay.left }), { checked: lay.left }), mi('Properties panel (right)', () => setLay({ right: !lay.right }), { checked: lay.right }), mi('Browser full screen', browserFull), SEP, mi('Grid', () => setGrid(!grid), { checked: grid }), mi('Wall lengths', () => setDims(!dims), { checked: dims }), mi('Deep blue canvas', () => setBlue(!blue), { checked: blue }), SEP, mi('Storey up', () => stepStorey(1)), mi('Storey down', () => stepStorey(-1)), mi('3D view', go('view3d'))] },
    { key: 'civil', label: 'Construction & Civil', items: [...(['grid', 'column', 'beam', 'slab', 'wall', 'arc', 'door', 'window', 'roof', 'hole', 'stair', 'zone', 'dim', 'label', 'duct', 'pipe', 'plant', 'outlet'] as Tool[]).map(k => mi(TOOLS[k].label, () => setT(k), { checked: tool === k })), SEP, mi('Add storey', () => addStorey(false)), mi('Copy storey up', () => addStorey(true)), SEP, mi('Member design', go('design')), mi('Slab and foundations', go('foundations')), mi('Wind and quake', go('lateral')), mi('MEP routing and pressure', go('mep')), SEP, mi(nHere.length ? `Clashes (${nHere.length} here)` : 'Clashes', go('clashes')), mi('Schedules', go('schedules')), mi('Elevations and sections', go('views')), mi('Drawing sheets', go('sheets')), mi('Dashboard', go('dashboard'))] },
    { key: 'mech', label: 'Mechanical', items: [mi('Parts workspace (sketch, extrude, revolve)', () => router.push(`/parts/${id}?tab=mech` as any)), SEP, ...TEMPLATES.filter(x => x.group === 'mechanical').map(x => mi(x.label, () => router.push(`/parts/${id}?tpl=${x.key}` as any)))] },
    { key: 'auto', label: 'Automotive', items: [mi('Parts workspace (sketch, extrude, revolve)', () => router.push(`/parts/${id}?tab=auto` as any)), SEP, ...TEMPLATES.filter(x => x.group === 'automotive').map(x => mi(x.label, () => router.push(`/parts/${id}?tpl=${x.key}` as any)))] },
    { key: 'veh', label: 'Vehicles', items: [mi('Parts workspace (sketch, extrude, revolve)', () => router.push(`/parts/${id}?tab=veh` as any)), SEP, ...TEMPLATES.filter(x => x.group === 'vehicle').map(x => mi(x.label, () => router.push(`/parts/${id}?tpl=${x.key}` as any))), SEP, ...TEMPLATES.filter(x => x.group === 'component').map(x => mi(`Component: ${x.label}`, () => router.push(`/parts/${id}?tpl=${x.key}` as any)))] },
    { key: 'help', label: 'Help', items: [mi('Manual and guides', () => router.push('/manual' as any)), mi('Quick start', () => router.push('/manual?s=start' as any)), mi('Keyboard shortcuts', () => router.push('/manual?s=shortcuts' as any)), mi('Limits and assumptions', () => router.push('/manual?s=limits' as any))] },
    { key: 'options', label: 'Options', items: [
      ...[0.1, 0.25, 0.5, 1].map(v => mi(`Snap ${v} m`, () => setSnap(v), { checked: snap === v })), mi('Object snap (ends, middles, crossings)', () => setOsnap(!osnap), { checked: osnap }), mi('Ortho lock (or hold Shift)', () => setOrtho(!ortho), { checked: ortho }), SEP,
      mi('Code: Eurocode 2', () => basis({ code: 'EC2' }), { checked: dsn.code === 'EC2' }), mi('Code: BS 8110', () => basis({ code: 'BS8110' }), { checked: dsn.code === 'BS8110' }), SEP,
      ...CLASSES.map((c, i) => mi(`Concrete ${cname(c)}`, () => basis({ cls: i }), { checked: dsn.cls === i })), SEP,
      ...OCC.map((o, i) => mi(`Occupancy: ${o}`, () => basis({ use: i }), { checked: dsn.use === i })), SEP,
      ...[100, 150, 200, 300, 400].map(q => mi(`Soil bearing ${q} kPa`, () => basis({ q }), { checked: dsn.q === q })),
    ] },
  ];

  const tbItems: TItem[] = [
    { key: 'sel', label: 'Select', icon: 'select', active: tool === 'select', onPress: () => setT('select') },
    { key: 's1', label: '', icon: 'select', sep: true, onPress: () => {} },
    { key: 'undo', label: 'Undo (Ctrl+Z)', icon: 'undo', disabled: !hn.u, onPress: undo },
    { key: 'redo', label: 'Redo (Ctrl+Y)', icon: 'redo', disabled: !hn.r, onPress: redo },
    { key: 'mv', label: 'Move selection (M)', icon: 'move', active: xf?.kind === 'move', disabled: !selEls.length, onPress: () => startXf('move') },
    { key: 'cp', label: 'Copy selection (K)', icon: 'copy', active: xf?.kind === 'copy', disabled: !selEls.length, onPress: () => startXf('copy') },
    { key: 'del', label: 'Delete selected', icon: 'delete', disabled: !selEls.length, onPress: () => removeMany(selEls) },
    { key: 'fin', label: 'Finish (Enter)', icon: 'finish', disabled: !start && !pts.length, onPress: finish },
    { key: 's2', label: '', icon: 'select', sep: true, onPress: () => {} },
    { key: 'zi', label: 'Zoom in', icon: 'zoomin', onPress: () => setZoom(z => Math.min(3, z * 1.25)) },
    { key: 'zo', label: 'Zoom out', icon: 'zoomout', onPress: () => setZoom(z => Math.max(0.15, z / 1.25)) },
    { key: 'fit', label: 'Fit to window', icon: 'fit', onPress: fit },
    { key: 's3', label: '', icon: 'select', sep: true, onPress: () => {} },
    { key: 'g', label: 'Grid', icon: 'grid', active: grid, onPress: () => setGrid(!grid) },
    { key: 'd', label: 'Wall lengths', icon: 'dims', active: dims, onPress: () => setDims(!dims) },
    { key: 's4', label: '', icon: 'select', sep: true, onPress: () => {} },
    { key: 'su', label: 'Storey up', icon: 'storey', onPress: () => stepStorey(1) },
    { key: '3d', label: '3D view', icon: 'cube', onPress: go('view3d') },
    { key: 's5', label: '', icon: 'select', sep: true, onPress: () => {} },
    { key: 'mod', label: 'Modules', icon: 'modules', onPress: () => router.push(`/hub/${id}` as any) },
  ];

  // tool box: Select, Design (drawing tools), Viewpoint, Document, Analyze
  const designTools: Tool[] = ['grid', 'column', 'beam', 'slab', 'wall', 'arc', 'door', 'window', 'roof', 'hole', 'stair', 'zone', 'duct', 'pipe', 'plant', 'outlet'];
  const boxSecs: { key: string; title: string; items: RItem[] }[] = [
    { key: 'design', title: 'Civil · Design', items: designTools.map(ti) },
    { key: 'view', title: 'Viewpoint', items: [{ key: 'fp', label: 'Floor plan', icon: 'storey', active: true, onPress: () => {} }, { key: 'v3', label: '3D view', icon: 'cube', onPress: go('view3d') }, { key: 'fit', label: 'Fit', icon: 'fit', onPress: fit }] },
    { key: 'doc', title: 'Document', items: [ti('dim'), ti('label'), { key: 'dm', label: 'Lengths', icon: 'dims', active: dims, onPress: () => setDims(!dims) }, { key: 'sch', label: 'Schedules', icon: 'table', onPress: go('schedules') }, { key: 'vw', label: 'Sections & elevations', icon: 'section', onPress: go('views') }, { key: 'sht', label: 'Drawing sheets', icon: 'ifc', onPress: go('sheets') }, { key: 'cl', label: nHere.length ? `Clashes ${nHere.length}` : 'Clashes', icon: 'clash', onPress: go('clashes') }, { key: 'db', label: 'Dashboard', icon: 'dashboard', onPress: go('dashboard') }, { key: 'imp', label: 'Import IFC', icon: 'ifc', onPress: go('import') }, { key: 'exp', label: 'Export IFC', icon: 'ifc', onPress: exportIfc }] },
    { key: 'more', title: 'Civil · Analyze', items: [{ key: 'md', label: 'Members', icon: 'design', onPress: go('design') }, { key: 'sf', label: 'Slab, found.', icon: 'foundation', onPress: go('foundations') }, { key: 'wq', label: 'Wind, quake', icon: 'wind', onPress: go('lateral') }, { key: 'mep', label: 'MEP', icon: 'mep', onPress: go('mep') }] },
    { key: 'mech', title: 'Mechanical', items: [{ key: 'pw', label: 'Parts workspace', icon: 'design', onPress: () => router.push(`/parts/${id}?tab=mech` as any) }, ...TEMPLATES.filter(x => x.group === 'mechanical').map(x => ({ key: `t-${x.key}`, label: x.label, icon: 'design' as any, onPress: () => router.push(`/parts/${id}?tpl=${x.key}` as any) }))] },
    { key: 'auto', title: 'Automotive', items: [{ key: 'pa', label: 'Parts workspace', icon: 'design', onPress: () => router.push(`/parts/${id}?tab=auto` as any) }, ...TEMPLATES.filter(x => x.group === 'automotive').map(x => ({ key: `t-${x.key}`, label: x.label, icon: 'design' as any, onPress: () => router.push(`/parts/${id}?tpl=${x.key}` as any) }))] },
    { key: 'veh', title: 'Vehicles', items: [{ key: 'pv', label: 'Parts workspace', icon: 'design', onPress: () => router.push(`/parts/${id}?tab=veh` as any) }, ...TEMPLATES.filter(x => x.group === 'vehicle' || x.group === 'component').map(x => ({ key: `t-${x.key}`, label: x.label, icon: 'design' as any, onPress: () => router.push(`/parts/${id}?tpl=${x.key}` as any) }))] },
  ];

  // keyboard on the web: V select, tool letters, Esc, Delete, Ctrl+Z
  const keyRef = useRef<(k: KeyboardEvent) => void>(() => {});
  keyRef.current = (k: KeyboardEvent) => {
    shiftRef.current = k.shiftKey;
    const tg = k.target as HTMLElement | null; if (tg && /INPUT|TEXTAREA/.test(tg.tagName)) return;
    const key = k.key.toLowerCase(), ctrl = k.ctrlKey || k.metaKey, map: Record<string, Tool> = { v: 'select', i: 'dim', x: 'label', g: 'grid', a: 'arc', r: 'roof', o: 'hole', t: 'stair', z: 'zone', w: 'wall', c: 'column', b: 'beam', s: 'slab', d: 'door', n: 'window', u: 'duct', p: 'pipe' };
    const arrows: Record<string, Pt> = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
    if (ctrl && key === 'z' && !k.shiftKey) { k.preventDefault(); undo(); }
    else if (ctrl && (key === 'y' || (key === 'z' && k.shiftKey))) { k.preventDefault(); redo(); }
    else if (ctrl && key === 'a') { k.preventDefault(); setT('select'); setSelIds(here.map(e => e.id)); }
    else if (key === 'enter' && polyMode && pts.length >= 3) { k.preventDefault(); k.stopPropagation(); closePoly(pts); }
    else if (key === 'f9') { k.preventDefault(); toggleFull(); }
    else if (key === 'escape') { setStart(null); setPts([]); setXf(null); setSelIds([]); setMenu(null); }
    else if ((key === 'delete' || key === 'backspace') && selEls.length) { k.preventDefault(); removeMany(selEls); }
    else if (arrows[key] && selEls.length && tool === 'select') { k.preventDefault(); doXf('move', r2(arrows[key][0] * snap), r2(arrows[key][1] * snap)); }
    else if ((key === 'm' || key === 'k') && !ctrl) startXf(key === 'm' ? 'move' : 'copy');
    else if (['e', 'q', 'h', 'f'].includes(key) && !ctrl && selEls.length && tool === 'select') doTurn(key === 'e' ? { kind: 'rot', quarter: 1 } : key === 'q' ? { kind: 'rot', quarter: -1 } : { kind: 'mirror', axis: key === 'h' ? 'x' : 'y' });
    else if (!ctrl && !k.altKey && map[key]) setT(map[key]);
  };
  const ptrRef = useRef<(x: number, y: number) => void>(() => {});
  ptrRef.current = (cx: number, cy: number) => {
    const el: HTMLElement | null = canvasRef.current; if (!el?.getBoundingClientRect) return;
    const r = el.getBoundingClientRect(), mx = (cx - r.left) / zoom / PX, my = (cy - r.top) / zoom / PX;
    if (mx < 0 || my < 0 || mx > N || my > N) return setCur2(null);
    const { p: q, kind } = snapAt(mx, my, fromPt());
    setCurKind(kind);
    setCur2(c => (c && c[0] === q[0] && c[1] === q[1] ? c : q));
  };
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let raf = 0, last: [number, number] = [0, 0];
    const mv = (e: MouseEvent) => { last = [e.clientX, e.clientY]; if (!raf) raf = requestAnimationFrame(() => { raf = 0; ptrRef.current(last[0], last[1]); }); };
    window.addEventListener('mousemove', mv); return () => { window.removeEventListener('mousemove', mv); if (raf) cancelAnimationFrame(raf); };
  }, []);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const h = (k: KeyboardEvent) => keyRef.current(k), up = (k: KeyboardEvent) => { shiftRef.current = k.shiftKey; };
    window.addEventListener('keydown', h, true); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', h, true); window.removeEventListener('keyup', up); };
  }, []);
  // drag a rectangle in the Select tool to pick several elements
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let d: { cx: number; cy: number; on: boolean } | null = null;
    const toM = (cx: number, cy: number): Pt | null => { const el = canvasRef.current; if (!el?.getBoundingClientRect) return null; const r = el.getBoundingClientRect(), z = live.current.zoom; return [(cx - r.left) / z / PX, (cy - r.top) / z / PX]; };
    const down = (e: MouseEvent) => { const L = live.current, el = canvasRef.current; if (e.button !== 0 || L.tool !== 'select' || L.xf || !el?.contains?.(e.target as Node)) return; d = { cx: e.clientX, cy: e.clientY, on: false }; };
    const move = (e: MouseEvent) => { if (!d || (!d.on && Math.hypot(e.clientX - d.cx, e.clientY - d.cy) < 6)) return; d.on = true; const a = toM(d.cx, d.cy), b = toM(e.clientX, e.clientY); if (a && b) setMq({ x0: a[0], y0: a[1], x1: b[0], y1: b[1] }); };
    const end = (e: MouseEvent) => { if (!d) return; const w = d; d = null; if (!w.on) return; suppress.current = Date.now(); setMq(null); const a = toM(w.cx, w.cy), b = toM(e.clientX, e.clientY); if (a && b) live.current.pickBox(a, b, b[0] < a[0]); };
    window.addEventListener('mousedown', down); window.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
    return () => { window.removeEventListener('mousedown', down); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', end); };
  }, []);

  const insp = sel ? inspector(sel) : null;
  const Multi = selEls.length > 1 ? (
    <View style={s.insp}>
      <View style={s.ir}><Text style={s.it}>{selEls.length} elements selected</Text><Pressable onPress={() => setSelIds([])}><Text style={s.l}>Done</Text></Pressable></View>
      <View style={s.ir}><Pressable onPress={() => startXf('move')}><Text style={s.l}>Move</Text></Pressable><Pressable onPress={() => startXf('copy')}><Text style={s.l}>Copy</Text></Pressable><Pressable onPress={() => doTurn({ kind: 'rot', quarter: 1 })}><Text style={s.l}>Rotate</Text></Pressable><Pressable onPress={() => doTurn({ kind: 'mirror', axis: 'x' })}><Text style={s.l}>Mirror</Text></Pressable></View>
      {selEls.some(x => x.type === 'wall') && <View style={s.ir}><Pressable onPress={() => setCore(selEls, true)}><Text style={s.l}>Mark walls as core</Text></Pressable><Pressable onPress={() => setCore(selEls, false)}><Text style={s.l}>Clear core</Text></Pressable></View>}
      <Pressable onPress={() => removeMany(selEls)}><Text style={s.del}>Delete {selEls.length} elements</Text></Pressable>
    </View>
  ) : null;
  const Inspector = Multi ?? (insp && sel ? (
    <View style={s.insp}>
      <View style={s.ir}><Text style={s.it}>{NAME[sel.type] ?? sel.type}{libById[sel.library_item_id ?? ''] ? ` · ${libById[sel.library_item_id ?? ''].name}` : ''}</Text><Pressable onPress={() => setSelId(null)}><Text style={s.l}>Done</Text></Pressable></View>
      <Text style={s.k}>{insp.info}</Text>
      {insp.steps.map(([label, val, dec, inc]) => (
        <View key={label} style={s.ir}><Text style={[s.k, { flex: 1 }]}>{label}</Text><Pressable onPress={dec}><Text style={s.step}>−</Text></Pressable><Text style={s.sv}>{val}</Text><Pressable onPress={inc}><Text style={s.step}>+</Text></Pressable></View>
      ))}
      {sel.type === 'label' && <NameField key={sel.id} placeholder="Text" value={sel.geometry.text ?? ''} onCommit={tx => edit(sel, { ...sel.geometry, text: tx })} />}
      {sel.type === 'zone' && <NameField key={sel.id} value={sel.geometry.name ?? ''} onCommit={nm => edit(sel, { ...sel.geometry, name: nm })} />}
      {insp.actions.map(([label, fn]) => <Pressable key={label} onPress={fn}><Text style={s.l}>{label}</Text></Pressable>)}
      <View style={s.ir}><Pressable onPress={() => startXf('move')}><Text style={s.l}>Move</Text></Pressable><Pressable onPress={() => startXf('copy')}><Text style={s.l}>Copy</Text></Pressable><Pressable onPress={() => doTurn({ kind: 'rot', quarter: 1 })}><Text style={s.l}>Rotate</Text></Pressable><Pressable onPress={() => doTurn({ kind: 'mirror', axis: 'x' })}><Text style={s.l}>Mirror</Text></Pressable></View>
      <Pressable onPress={() => remove(sel)}><Text style={s.del}>Delete {NAME[sel.type]?.toLowerCase() ?? 'element'}{sel.type === 'wall' ? ' and its doors and windows' : ''}</Text></Pressable>
    </View>
  ) : null);
  const rows: [string, number][] = [...(grids.length ? [['Grid lines', grids.length] as [string, number]] : []), ...([['Walls', counts.wall], ['Columns', counts.column], ['Beams', counts.beam], ['Slabs', counts.slab], ['Roofs', counts.roof], ['Stairs', counts.stair], ['Rooms', counts.zone], ['Dimensions', counts.dimension], ['Texts', counts.label], ['Doors', counts.door], ['Windows', counts.window], ['Ducts', counts.duct], ['Pipes', counts.pipe], ['Plant', counts.equipment], ['Outlets', counts.fixture]] as [string, number | undefined][]).filter(r => r[1]).map(r => [r[0], r[1] as number] as [string, number])];

  const quick = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.quick} contentContainerStyle={s.quickIn}>
      <Seg label="Snap" options={[['0.1', '0.1'], ['0.25', '0.25'], ['0.5', '0.5'], ['1', '1 m']]} value={String(snap)} onChange={v => setSnap(Number(v))} />
      <Toggle label="Grid" on={grid} onChange={setGrid} />
      <Toggle label="Lengths" on={dims} onChange={setDims} />
      <Toggle label="Blue canvas" on={blue} onChange={setBlue} />
      <Toggle label="Object snap" on={osnap} onChange={setOsnap} />
      <Toggle label="Ortho (Shift)" on={ortho} onChange={setOrtho} />
      <View style={s.qsep} />
      <Seg label="Design code" options={[['EC2', 'EC2'], ['BS8110', 'BS 8110']]} value={dsn.code} onChange={v => basis({ code: v as 'EC2' | 'BS8110' })} />
      <Stepper label="Concrete" value={cname(CLASSES[dsn.cls])} dec={() => basis({ cls: Math.max(0, dsn.cls - 1) })} inc={() => basis({ cls: Math.min(CLASSES.length - 1, dsn.cls + 1) })} />
      <Stepper label="Occupancy" value={OCC[dsn.use]} dec={() => basis({ use: Math.max(0, dsn.use - 1) })} inc={() => basis({ use: Math.min(OCC.length - 1, dsn.use + 1) })} />
      <Stepper label="Soil bearing" value={`${dsn.q} kPa`} dec={() => basis({ q: Math.max(50, dsn.q - 25) })} inc={() => basis({ q: Math.min(600, dsn.q + 25) })} />
    </ScrollView>
  );

  const navPanel = (style: any) => (
<ScrollView style={style}>
            <Sec title="Navigator · Project map" open={open.stories} onToggle={() => tog('stories')}>
              <Text style={s.proj}>{pname || 'Project'}</Text>
              {[...stories].reverse().map(st => {
                const n = els.filter(e => (e.story_id ?? stories[0]?.id) === st.id).length;
                return (
                  <Pressable key={st.id} onPress={() => { setCur(st.id); setStart(null); setSelId(null); }} style={[s.tr, story?.id === st.id && s.trOn]}>
                    <Text style={[s.trn, story?.id === st.id && { color: '#fff' }]}>▪ {st.name}</Text>
                    <Text style={[s.trs, story?.id === st.id && { color: '#d3ecdd' }]}>{st.elevation_m.toFixed(2)} m · {n} el.</Text>
                  </Pressable>
                );
              })}
              <View style={s.navBtns}><Pressable onPress={() => addStorey(false)}><Text style={s.l}>+ Storey</Text></Pressable><Pressable onPress={() => addStorey(true)}><Text style={s.l}>Copy up</Text></Pressable></View>
            </Sec>
            <Sec title={`On ${story?.name ?? 'this storey'}`} open={open.here} onToggle={() => tog('here')}>
              {rows.length ? rows.map(([k, v]) => <View key={k} style={s.cr}><Text style={s.k}>{k}</Text><Text style={s.cv}>{v}</Text></View>) : <Text style={s.k}>Nothing drawn yet.</Text>}
              {wallLen > 0 && <View style={s.cr}><Text style={s.k}>Wall length</Text><Text style={s.cv}>{wallLen.toFixed(1)} m</Text></View>}
              {nHere.length > 0 && <Pressable onPress={go('clashes')}><Text style={[s.del, { marginTop: 6 }]}>{nHere.length} open clash{nHere.length > 1 ? 'es' : ''}</Text></Pressable>}
            </Sec>
            <Sec title="Properties" open={open.props} onToggle={() => tog('props')}>
              {Inspector ?? (
                <View style={{ gap: 6 }}>
                  <Text style={s.it}>{def.label} tool</Text>
                  <Text style={s.k}>{def.hint}</Text>
                  <Text style={[s.k, { marginTop: 6 }]}>Keys: V select, W wall, C column, B beam, S slab, D door, N window, U duct, P pipe, Esc finish, Delete remove, Ctrl+Z undo.</Text>
                </View>
              )}
            </Sec>
          </ScrollView>
  );
  const [pop, setPop] = useState<null | 'set' | 'quick' | 'nav'>(null);
  useEffect(() => { if (!lay.full) setPop(null); }, [lay.full]);
  return (
    <View style={s.wrap}>
      {<MenuBar menus={menus} open={menu} setOpen={setMenu} narrow={!wide} right={pname} />}
      {menu && <Pressable style={s.backdrop} onPress={() => setMenu(null)} />}
      {!lay.full && wide && (
        <View style={s.fold}>
          <Pressable testID="fold-ribbon" onPress={() => setLay({ ribbon: !lay.ribbon })} style={s.foldB}><Text style={s.foldT}>{lay.ribbon ? '▲ Hide ribbon' : '▼ Show ribbon'}</Text></Pressable>
          <Pressable testID="fold-left" onPress={() => setLay({ left: !lay.left })} style={s.foldB}><Text style={s.foldT}>{lay.left ? '◀ Hide tools' : '▶ Show tools'}</Text></Pressable>
          <Pressable testID="fold-right" onPress={() => setLay({ right: !lay.right })} style={s.foldB}><Text style={s.foldT}>{lay.right ? 'Hide panel ▶' : 'Show panel ◀'}</Text></Pressable>
          <Pressable testID="full-window" onPress={toggleFull} style={[s.foldB, s.foldFull]}><Text style={[s.foldT, { color: '#fff' }]}>⤢ Full window</Text></Pressable>
        </View>
      )}
      {lay.full && wide && (
        <View style={s.fold}>
          <Pressable testID="exit-full" onPress={toggleFull} style={[s.foldB, s.foldFull, { marginLeft: 0 }]}><Text style={[s.foldT, { color: '#fff' }]}>⤡ Exit full window (F9)</Text></Pressable>
          <Pressable onPress={browserFull} style={s.foldB}><Text style={s.foldT}>Browser full screen</Text></Pressable>
          <Pressable testID="pop-set" onPress={() => setPop(pop === 'set' ? null : 'set')} style={[s.foldB, pop === 'set' && s.foldOn]}><Text style={s.foldT}>{def.label} settings ▾</Text></Pressable>
          <Pressable testID="pop-quick" onPress={() => setPop(pop === 'quick' ? null : 'quick')} style={[s.foldB, pop === 'quick' && s.foldOn]}><Text style={s.foldT}>Quick options ▾</Text></Pressable>
          <Pressable testID="pop-nav" onPress={() => setPop(pop === 'nav' ? null : 'nav')} style={[s.foldB, pop === 'nav' && s.foldOn]}><Text style={s.foldT}>Navigator and properties ▾</Text></Pressable>
        </View>
      )}
      {lay.full && !wide && (
        <View style={s.floatB}><Pressable testID="exit-full" onPress={toggleFull} style={s.foldB}><Text style={s.foldT}>⤡ Exit full window</Text></Pressable></View>
      )}
      {lay.full && wide && <ToolBar items={tbItems} />}
      {lay.full && wide && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.strip} contentContainerStyle={{ padding: 3, gap: 2 }}>
          {[ti('select'), ...boxSecs.flatMap(sc => sc.items)].map(it => <BoxBtn key={it.key} it={it} strip />)}
        </ScrollView>
      )}
      {!lay.full && lay.ribbon && <ToolBar items={tbItems} />}
      {!lay.full && lay.ribbon && <View style={s.info}>
        <View style={s.infoT}><Icon name={TOOL_ICON[tool]} size={20} /><Text style={s.infoN}>{def.label}</Text></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.infoIn}>{toolSettings}</ScrollView>
      </View>}
      {!wide && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.strip} contentContainerStyle={{ padding: 4, gap: 2 }}>
          {[ti('select'), ...designTools.map(ti)].map(it => <BoxBtn key={it.key} it={it} strip />)}
        </ScrollView>
      )}
      <View style={s.body}>
        {lay.full && wide && pop === 'set' && <View style={s.pop}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.infoIn}>{toolSettings}</ScrollView></View>}
        {lay.full && wide && pop === 'quick' && <View style={s.pop}>{quick}</View>}
        {lay.full && wide && pop === 'nav' && <View style={s.popR}>{navPanel({ flexGrow: 0 })}</View>}
        {wide && !lay.full && lay.left && (
          <ScrollView style={s.box}>
            <View style={{ padding: 6 }}><BoxBtnRow items={[ti('select')]} /></View>
            {boxSecs.map(sc => (
              <Sec key={sc.key} title={sc.title} open={open[sc.key]} onToggle={() => tog(sc.key)}>
                <View style={s.grid2}>{sc.items.map(it => <BoxBtn key={it.key} it={it} />)}</View>
              </Sec>
            ))}
          </ScrollView>
        )}
        <View style={s.center}>
          <ScrollView horizontal style={s.tabsbar} contentContainerStyle={s.tabsIn} showsHorizontalScrollIndicator={false}>
            {stories.map(st => (
              <Pressable key={st.id} onPress={() => { setCur(st.id); setStart(null); setSelId(null); }} style={[s.vtab, story?.id === st.id && s.vtabOn]}>
                <Icon name="storey" size={14} color={story?.id === st.id ? '#0a2e1f' : '#4f6a5b'} /><Text style={[s.vtabT, story?.id === st.id && { color: '#0a2e1f' }]}>{st.name}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => addStorey(false)} style={s.vtab}><Text style={[s.vtabT, { color: '#146c43', fontSize: 15 }]}>＋</Text></Pressable>
            <Pressable onPress={go('view3d')} style={s.vtab}><Icon name="cube" size={14} color="#4f6a5b" /><Text style={s.vtabT}>3D</Text></Pressable>
          </ScrollView>
          {!wide && Inspector}
          {!!err && <Text style={s.err}>{err}</Text>}
          {!loaded && !els.length && <Text style={s.sum}>Loading the model…</Text>}
          <View style={{ flex: 1 }} onLayout={e => setVp({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
            <ScrollView horizontal ref={hRef}><ScrollView ref={vRef}>
              <Pressable ref={canvasRef} style={{ width: S * zoom, height: S * zoom }} onPress={e => { const [x, y] = tapPos(e); tap(x / zoom, y / zoom); }}>
                <Svg width={S * zoom} height={S * zoom} viewBox={`0 0 ${S} ${S}`} pointerEvents="none">
                  {grid ? <Grid c={pal} /> : <Rect x={0} y={0} width={S} height={S} fill={pal.bg} />}
                  <GridLines grids={grids} c={pal} />
                  <Layer here={here} libById={libById} wallById={wallById} dims={dims} c={pal} />
                  {selEls.map(e => <Highlight key={e.id} e={e} wallById={wallById} />)}
                  {mq && <Rect x={Math.min(mq.x0, mq.x1) * PX} y={Math.min(mq.y0, mq.y1) * PX} width={Math.abs(mq.x1 - mq.x0) * PX} height={Math.abs(mq.y1 - mq.y0) * PX} fill={pal.cursor} fillOpacity={0.08} stroke={pal.cursor} strokeWidth={1.5} strokeDasharray={mq.x1 < mq.x0 ? '6 4' : undefined} />}
                  {xf?.base && cur2 && <Line x1={xf.base[0] * PX} y1={xf.base[1] * PX} x2={cur2[0] * PX} y2={cur2[1] * PX} stroke="#c62828" strokeWidth={2} strokeDasharray="8 6" />}
                  {cur2 && <G><Line x1={cur2[0] * PX - 14} y1={cur2[1] * PX} x2={cur2[0] * PX + 14} y2={cur2[1] * PX} stroke={curKind === 'cell' ? pal.cursor : '#ffb300'} strokeWidth={1.5} /><Line x1={cur2[0] * PX} y1={cur2[1] * PX - 14} x2={cur2[0] * PX} y2={cur2[1] * PX + 14} stroke={curKind === 'cell' ? pal.cursor : '#ffb300'} strokeWidth={1.5} /><Circle cx={cur2[0] * PX} cy={cur2[1] * PX} r={curKind === 'cell' ? 4 : 9} fill="none" stroke={curKind === 'cell' ? pal.cursor : '#ffb300'} strokeWidth={2} /></G>}
                  {start && cur2 && (tool === 'grid' || tool === 'wall' || tool === 'beam' || tool === 'duct' || tool === 'pipe') && <Line x1={start[0] * PX} y1={start[1] * PX} x2={cur2[0] * PX} y2={cur2[1] * PX} stroke={pal.cursor} strokeWidth={2} strokeDasharray="8 6" />}
                  {polyMode && pts.length > 0 && <G><Polygon points={[...pts, ...(cur2 ? [cur2] : [])].map(q => `${q[0] * PX},${q[1] * PX}`).join(' ')} fill={pal.cursor} fillOpacity={0.07} stroke={pal.cursor} strokeWidth={2} strokeDasharray="8 6" />{pts.map((q, i) => <Circle key={i} cx={q[0] * PX} cy={q[1] * PX} r={i === 0 ? 8 : 4} fill={i === 0 ? '#ffb300' : pal.cursor} />)}</G>}
                  {tool === 'dim' && pts.length === 1 && cur2 && <Line x1={pts[0][0] * PX} y1={pts[0][1] * PX} x2={cur2[0] * PX} y2={cur2[1] * PX} stroke={pal.cursor} strokeWidth={1.5} strokeDasharray="6 4" />}
                  {tool === 'dim' && pts.length === 2 && cur2 && <Dim a={pts[0]} b={pts[1]} off={((cur2[0] - pts[0][0]) * -(pts[1][1] - pts[0][1]) + (cur2[1] - pts[0][1]) * (pts[1][0] - pts[0][0])) / (Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) || 1) || 0.6} c={pal} />}
                  {tool === 'arc' && pts.length > 0 && cur2 && <G><Polyline points={(pts.length === 2 ? arcPoints(pts[0], pts[1], cur2) : [pts[0], cur2]).map(q => `${q[0] * PX},${q[1] * PX}`).join(' ')} fill="none" stroke={pal.cursor} strokeWidth={Math.max(wallTh * PX, 3)} strokeOpacity={0.5} />{pts.map((q, i) => <Circle key={i} cx={q[0] * PX} cy={q[1] * PX} r={5} fill="#ffb300" />)}</G>}
                  {tool === 'hole' && holeShape === 'circle' && start && cur2 && <Circle cx={start[0] * PX} cy={start[1] * PX} r={Math.hypot(cur2[0] - start[0], cur2[1] - start[1]) * PX} fill={pal.cursor} fillOpacity={0.07} stroke={pal.cursor} strokeWidth={2} strokeDasharray="8 6" />}
                  {(tool === 'stair' || (tool === 'hole' && holeShape === 'rect')) && start && cur2 && <Rect x={Math.min(start[0], cur2[0]) * PX} y={Math.min(start[1], cur2[1]) * PX} width={Math.abs(cur2[0] - start[0]) * PX} height={Math.abs(cur2[1] - start[1]) * PX} fill={pal.cursor} fillOpacity={0.07} stroke={pal.cursor} strokeWidth={2} strokeDasharray="8 6" />}
                  {(tool === 'slab' || tool === 'roof') && !polyMode && start && cur2 && <Rect x={Math.min(start[0], cur2[0]) * PX} y={Math.min(start[1], cur2[1]) * PX} width={Math.abs(cur2[0] - start[0]) * PX} height={Math.abs(cur2[1] - start[1]) * PX} fill={pal.cursor} fillOpacity={0.07} stroke={pal.cursor} strokeWidth={2} strokeDasharray="8 6" />}
                  {start && <Circle cx={start[0] * PX} cy={start[1] * PX} r={7} fill="#c98a00" />}
                  {nHere.map(i => <Circle key={i.id} cx={i.location[0] * PX} cy={i.location[1] * PX} r={16} fill="none" stroke="#c62828" strokeWidth={3} />)}
                </Svg>
              </Pressable>
            </ScrollView></ScrollView>
          </View>
        </View>
        {wide && !lay.full && lay.right && navPanel(s.props)}
      </View>
      {!lay.full && lay.ribbon && quick}
      {!lay.full && <View style={s.status}>
        <Text style={s.stT} numberOfLines={1}>{chosen && tool !== 'select' ? `${short(chosen.name, 28)}. ` : ''}{xf ? (xf.base ? `Tap the target point to ${xf.kind} ${selEls.length} element${selEls.length > 1 ? 's' : ''}. Esc cancels.` : `Tap the base point to ${xf.kind} ${selEls.length} element${selEls.length > 1 ? 's' : ''}.`) : def.hint}</Text>
        <Text style={s.stR}>{cur2 ? `X ${cur2[0].toFixed(2)}  Y ${cur2[1].toFixed(2)} m` : ''}{cur2 && curKind !== 'cell' ? `  ·  ${{ end: 'Endpoint', mid: 'Middle', int: 'Crossing', cell: '' }[curKind]}` : ''}{xf?.base && cur2 ? `  ·  Δ ${r2(cur2[0] - xf.base[0])}, ${r2(cur2[1] - xf.base[1])} m` : ''}{start && cur2 ? `  ·  length ${Math.hypot(cur2[0] - start[0], cur2[1] - start[1]).toFixed(2)} m` : ''}{cur2 ? '  ·  ' : ''}{story?.name ?? ''} · Snap {snap} m · Zoom {Math.round(zoom * 100)}%</Text>
      </View>}
    </View>
  );
}
function BoxBtnRow({ items }: { items: RItem[] }) { return <View style={{ flexDirection: 'row', gap: 4 }}>{items.map(it => <BoxBtn key={it.key} it={it} />)}</View>; }
const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#fff' },
  fold: { flexDirection: 'row', gap: 6, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#e6f0ea', borderBottomWidth: 1, borderColor: '#cfdcd4', alignItems: 'center' },
  foldB: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 5, backgroundColor: '#f4f9f6', borderWidth: 1, borderColor: '#bccfc3' },
  foldFull: { backgroundColor: '#146c43', borderColor: '#146c43', marginLeft: 'auto' },
  foldOn: { backgroundColor: '#c4e6d2' },
  pop: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30, backgroundColor: '#f4f9f6', borderBottomWidth: 1, borderColor: '#bccfc3', paddingVertical: 4, elevation: 6 },
  popR: { position: 'absolute', top: 0, right: 0, bottom: 0, width: 280, zIndex: 30, backgroundColor: '#f4f9f6', borderLeftWidth: 1, borderColor: '#bccfc3', elevation: 6 },
  foldT: { fontSize: 12, fontWeight: '600', color: '#0a2e1f' },
  floatB: { position: 'absolute', top: 8, right: 14, zIndex: 40, flexDirection: 'row', gap: 6 },
  body: { flex: 1, flexDirection: 'row' },
  center: { flex: 1 },
  box: { width: 200, flexGrow: 0, borderRightWidth: 1, borderColor: '#cfdcd4', backgroundColor: '#f4f9f6' }, grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, justifyContent: 'space-between' },
  props: { width: 262, flexGrow: 0, borderLeftWidth: 1, borderColor: '#cfdcd4', backgroundColor: '#f4f9f6' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 },
  info: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#edf5ef', borderBottomWidth: 1, borderColor: '#bccfc3', minHeight: 54 },
  infoT: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRightWidth: 1, borderColor: '#bccfc3', alignSelf: 'stretch' }, infoN: { fontWeight: '700', color: '#0a2e1f' },
  infoIn: { paddingHorizontal: 6, alignItems: 'center' },
  strip: { flexGrow: 0, backgroundColor: '#f4f9f6', borderBottomWidth: 1, borderColor: '#cfdcd4' },
  tabsbar: { flexGrow: 0, backgroundColor: '#dbe8e0', borderBottomWidth: 1, borderColor: '#bccfc3' }, tabsIn: { paddingHorizontal: 4, paddingTop: 4, gap: 2, alignItems: 'flex-end' },
  vtab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  vtabOn: { backgroundColor: '#fff', borderTopWidth: 2, borderColor: '#146c43' }, vtabT: { color: '#4f6a5b', fontWeight: '600', fontSize: 13 },
  quick: { flexGrow: 0, backgroundColor: '#edf5ef', borderTopWidth: 1, borderColor: '#bccfc3' }, quickIn: { paddingHorizontal: 6, paddingVertical: 4, alignItems: 'center' }, qsep: { width: 1, height: 34, backgroundColor: '#bccfc3', marginHorizontal: 8 },
  proj: { fontWeight: '700', paddingBottom: 4, color: '#0a2e1f' },
  tr: { paddingVertical: 5, paddingHorizontal: 8, borderRadius: 5, marginBottom: 2 }, trOn: { backgroundColor: '#146c43' }, trn: { fontWeight: '700', fontSize: 13, color: '#0a2e1f' }, trs: { fontSize: 11, color: '#4f6a5b' },
  ph: { fontSize: 11, color: '#4f6a5b', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, fontWeight: '700' },
  st: { paddingVertical: 7, paddingHorizontal: 9, borderRadius: 6, marginBottom: 3, borderWidth: 1, borderColor: '#cfdcd4', backgroundColor: '#fff' }, stOn: { backgroundColor: '#146c43', borderColor: '#146c43' },
  stn: { fontWeight: '700' }, sts: { fontSize: 11, color: '#4f6a5b' },
  navBtns: { flexDirection: 'row', gap: 16, marginTop: 6 },
  cr: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, gap: 8 }, cv: { fontWeight: '700' },
  chips: { flexGrow: 0, borderBottomWidth: 1, borderColor: '#cfdcd4' }, chipsIn: { gap: 8, padding: 8, alignItems: 'center' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: '#146c43' },
  chipOn: { backgroundColor: '#146c43' }, chipT: { color: '#146c43', fontWeight: '600' }, on: { color: '#fff' },
  l: { color: '#146c43', fontWeight: '600' }, k: { color: '#4f6a5b' }, rhint: { color: '#4f6a5b', maxWidth: 220, fontSize: 12, paddingTop: 6 },
  sum: { paddingHorizontal: 12, paddingBottom: 6, color: '#4f6a5b', fontSize: 13 },
  err: { color: '#c62828', paddingHorizontal: 12, paddingVertical: 4 },
  insp: { margin: 8, padding: 12, gap: 8, borderWidth: 1, borderColor: '#c62828', borderRadius: 10, backgroundColor: '#fff' },
  ir: { flexDirection: 'row', alignItems: 'center', gap: 6 }, it: { flex: 1, fontWeight: '700', fontSize: 15 },
  step: { fontSize: 22, color: '#146c43', paddingHorizontal: 4 }, sv: { fontWeight: '600', minWidth: 54, textAlign: 'center' },
  del: { color: '#c62828', fontWeight: '700' },
  nameIn: { height: 32, borderWidth: 1, borderColor: '#9db5a5', borderRadius: 6, paddingHorizontal: 8, fontWeight: '700', color: '#0a2e1f', backgroundColor: '#fff' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#0a2e1f' },
  stT: { flex: 1, color: '#e4f1e9', fontSize: 12 }, stR: { color: '#a8c5b4', fontSize: 12 },
});
