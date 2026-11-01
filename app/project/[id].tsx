import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import Svg, { Defs, Pattern, Path, G, Line, Rect, Circle, Text as SvgText } from 'react-native-svg';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { newId, useModel } from '../../lib/useModel';
import { rememberProject } from '../../lib/session';
import { BoxBtn, Menu, MenuBar, RItem, Sec, Seg, Stepper, Toggle, ToolBar, TItem } from '../../components/ribbon/Ribbon';
import { Icon, IconName } from '../../components/ribbon/Icon';
import { CLASSES, cname } from '../../lib/rc';
import { dsn, plan, setDsn, setPlan } from '../../lib/settings';
import { saveFile } from '../../components/saveFile';
import { toIfc } from '../../lib/ifc';
import { beamSec, wallT } from '../../lib/model';
import type { El, Lib } from '../../lib/engineering';

const PX = 50;      // pixels per metre at 100% zoom
const N = 120;      // plan canvas size in metres
type Pt = [number, number];
type Tool = 'select' | 'wall' | 'beam' | 'column' | 'slab' | 'door' | 'window' | 'duct' | 'pipe' | 'plant' | 'outlet';
const DBT: Record<string, string> = { plant: 'equipment', outlet: 'fixture' };
const DISC: Record<string, string> = { wall: 'architecture', door: 'architecture', window: 'architecture', roof: 'architecture', stair: 'architecture', column: 'structure', beam: 'structure', slab: 'structure', foundation: 'structure', duct: 'mep', pipe: 'mep', equipment: 'mep', fixture: 'mep' };
const TOOLS: Record<Tool, { label: string; hint: string; lib?: (l: Lib) => boolean }> = {
  select: { label: 'Select', hint: 'Tap an element to see its details, change its size or delete it.' },
  column: { label: 'Column', hint: 'Tap to place a column. Use "Next type" to change its size.', lib: l => l.category === 'section' && /column/i.test(l.name) },
  beam: { label: 'Beam', hint: 'Tap the start, then each end point. Beams that meet end to end form one continuous beam. Tap Finish to stop.', lib: l => l.category === 'section' && /beam/i.test(l.name) },
  slab: { label: 'Slab', hint: 'Tap two opposite corners of the slab.' },
  wall: { label: 'Wall', hint: 'Tap the start, then each corner. Tap Finish to stop.' },
  door: { label: 'Door', hint: 'Tap close to a wall to place a door in it.', lib: l => l.category === 'door' },
  window: { label: 'Window', hint: 'Tap close to a wall to place a window in it.', lib: l => l.category === 'window' },
  duct: { label: 'Duct', hint: 'Tap the start, then each end point. Set the centreline height below.', lib: l => l.category === 'duct' },
  pipe: { label: 'Pipe', hint: 'Tap the start, then each end point. Set the centreline height below.', lib: l => l.category === 'pipe' },
  plant: { label: 'Plant', hint: 'Tap to place the air handler or chiller that feeds the outlets.' },
  outlet: { label: 'Outlet', hint: 'Tap to place a diffuser or terminal. Set its cooling load below.' },
};
const OCC = ['Residential', 'Office', 'Laboratory'];
const TOOL_ICON: Record<Tool, IconName> = { select: 'select', column: 'column', beam: 'beam', slab: 'slab', wall: 'wall', door: 'door', window: 'window', duct: 'duct', pipe: 'pipe', plant: 'plant', outlet: 'outlet' };
const NAME: Record<string, string> = { wall: 'Wall', beam: 'Beam', column: 'Column', slab: 'Slab', roof: 'Roof', stair: 'Stair', foundation: 'Foundation', door: 'Door', window: 'Window', duct: 'Duct', pipe: 'Pipe', equipment: 'Plant', fixture: 'Outlet' };
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
    else if (g.start && g.end) d = segDist(g.start, g.end, x, y) - (e.type === 'wall' ? wallT(g) / 2 : 0);
    else if (g.at) d = Math.hypot(x - g.at[0], y - g.at[1]) - (e.type === 'column' ? Math.max(g.b ?? 0.3, g.h ?? 0.3) / 2 : 0.15);
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
  light: { bg: '#f7fcf8', minor: '#cfe3d6', major: '#86b79b', node: '#146c43', axis: '#146c43', text: '#146c43', wall: '#146c43', dim: '#0a2e1f', beam: '#c98a00', col: '#c98a00', duct: '#0c9a87', pipe: '#0b6b8a', door: '#1a8f4d', win: '#0c9a87', plant: '#0b6b8a', slab: '#2a6f97', cursor: '#146c43' },
  blue: { bg: '#0b2447', minor: '#1b4180', major: '#3a6bb5', node: '#7fb2ff', axis: '#7fb2ff', text: '#8fbcff', wall: '#e8f1ff', dim: '#bcd6ff', beam: '#ffcf4a', col: '#ffcf4a', duct: '#3fd6c2', pipe: '#5cc8ff', door: '#6ee7a0', win: '#3fd6c2', plant: '#5cc8ff', slab: '#6aa8ff', cursor: '#ffffff' },
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
      {here.filter(e => e.geometry.rect).map(e => { const [x0, y0, x1, y1] = e.geometry.rect; return <Rect key={e.id} x={x0 * PX} y={y0 * PX} width={(x1 - x0) * PX} height={(y1 - y0) * PX} fill={BX[e.type] ?? c.wall} fillOpacity={0.1} stroke={BX[e.type] ?? c.wall} strokeWidth={1.5} />; })}
      {here.map(e => {
        const g = e.geometry;
        if (e.type === 'wall') {
          const l = Math.hypot(g.end[0] - g.start[0], g.end[1] - g.start[1]);
          return <G key={e.id}>
            <Line x1={g.start[0] * PX} y1={g.start[1] * PX} x2={g.end[0] * PX} y2={g.end[1] * PX} stroke={c.wall} strokeWidth={Math.max(wallT(g) * PX, 4)} strokeLinecap="butt" />
            {dims && <SvgText x={(g.start[0] + g.end[0]) / 2 * PX + 6} y={(g.start[1] + g.end[1]) / 2 * PX - 6} fontSize={12} fill={c.dim}>{l.toFixed(1)} m</SvgText>}
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

function Highlight({ e, wallById }: { e: El; wallById: Record<string, El> }) {
  const g = e.geometry, c = '#c62828';
  if (e.type === 'door' || e.type === 'window') { const o = openingSeg(e, wallById); return o ? <Line x1={o.a[0] * PX} y1={o.a[1] * PX} x2={o.b[0] * PX} y2={o.b[1] * PX} stroke={c} strokeWidth={14} opacity={0.35} /> : null; }
  if (g.start && g.end) return <Line x1={g.start[0] * PX} y1={g.start[1] * PX} x2={g.end[0] * PX} y2={g.end[1] * PX} stroke={c} strokeWidth={Math.max(wallT(g) * PX, 4) + 8} opacity={0.35} />;
  if (g.at) return <Circle cx={g.at[0] * PX} cy={g.at[1] * PX} r={22} fill={c} fillOpacity={0.25} stroke={c} strokeWidth={2} />;
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
  const [selId, setSelId] = useState<string | null>(null);
  const [cur2, setCur2] = useState<Pt | null>(null);       // snapped pointer position in metres (web)
  const canvasRef = useRef<any>(null);
  const [issues, setIssues] = useState<{ id: string; location: any; story_id: string | null }[]>([]);

  const story = stories.find(s => s.id === cur) ?? stories[0];
  const H = story?.height_m ?? 3.6;
  const here = useMemo(() => els.filter(e => (e.story_id ?? stories[0]?.id) === story?.id), [els, stories, story]);
  const walls = useMemo(() => here.filter(e => e.type === 'wall'), [here]);
  const libById = useMemo(() => Object.fromEntries(lib.map(l => [l.id, l])), [lib]);
  const wallById = useMemo(() => Object.fromEntries(walls.map(w => [w.id, w])), [walls]);
  const def = TOOLS[tool];
  const choices = useMemo(() => (def.lib ? lib.filter(def.lib) : []), [lib, def]);
  const chosen = choices.length ? choices[(pick[tool] ?? 0) % choices.length] : null;
  const sel = selId ? here.find(e => e.id === selId) ?? null : null;

  const [pname, setPname] = useState('');
  useFocusEffect(useCallback(() => { rememberProject(id); supabase.from('projects').select('name').eq('id', id).single().then(({ data }) => setPname(data?.name ?? '')); }, [id]));

  // open clashes are fetched when the screen is shown, not on every edit
  useFocusEffect(useCallback(() => {
    supabase.from('issues').select('id,location,story_id').eq('project_id', id).eq('status', 'open').then(({ data }) => setIssues(((data as any[]) ?? []).filter(i => i.location)));
  }, [id]));

  // new elements appear at once; the server write follows, and the element is taken back if it fails
  const add = async (geometry: object) => {
    setErr('');
    const type = DBT[tool] ?? tool, row: El = { id: newId(), type, geometry, library_item_id: chosen?.id ?? null, story_id: story?.id ?? null, properties: {} };
    addEls([row]);
    const { error } = await supabase.from('elements').insert({ id: row.id, project_id: id, story_id: row.story_id, type, discipline: DISC[type], library_item_id: row.library_item_id, geometry });
    if (error) { removeEls([row.id]); setErr(error.message); }
  };

  const tap = async (wx: number, wy: number) => {
    const mx = wx / PX, my = wy / PX;
    if (tool === 'select') { setSelId(hitTest(here, wallById, mx, my, 14 / (PX * zoom))?.id ?? null); return; }
    const p: Pt = [r2(Math.round(mx / snap) * snap), r2(Math.round(my / snap) * snap)];
    if (tool === 'column') { const sp = chosen?.specs ?? {}; return add({ at: p, b: (sp.b_mm ?? 300) / 1000, h: (sp.h_mm ?? 300) / 1000, height: H }); }
    if (tool === 'plant') return add({ at: p });
    if (tool === 'outlet') return add({ at: p, kw });
    if (tool === 'door' || tool === 'window') {
      const hit = nearestWall(walls, mx, my);
      if (!hit || hit.d > 0.5) return setErr('Tap close to a wall to place it.');
      const width = chosen?.specs?.w ?? (tool === 'door' ? 0.9 : 1.5), off = Math.max(width / 2, Math.min(hit.len - width / 2, hit.off));
      return add({ wall_id: hit.w.id, offset_m: r2(off), width_m: width });
    }
    if (!start) return setStart(p);
    if (p[0] === start[0] && p[1] === start[1]) return setStart(null);
    if (tool === 'slab') { await add({ rect: [Math.min(start[0], p[0]), Math.min(start[1], p[1]), Math.max(start[0], p[0]), Math.max(start[1], p[1])], z0: r2(H - slabTh), z1: H }); return setStart(null); }
    await add(tool === 'wall' ? { start, end: p, height: H, thickness: wallTh } : tool === 'duct' || tool === 'pipe' ? { start, end: p, elevation_m: r2(elev) } : { start, end: p });
    setStart(p);
  };

  // delete an element (and the doors and windows in a wall)
  const remove = async (e: El) => {
    const gone = [e, ...(e.type === 'wall' ? here.filter(o => (o.type === 'door' || o.type === 'window') && o.geometry.wall_id === e.id) : [])];
    removeEls(gone.map(x => x.id)); setSelId(null);
    const { error } = await supabase.from('elements').delete().in('id', gone.map(x => x.id));
    if (error) { addEls(gone); setErr(error.message); }
  };
  const undo = async () => { const last = here[here.length - 1]; if (last) await remove(last); };
  const edit = async (e: El, geometry: any) => {
    const prev = e; updateEl({ ...e, geometry });
    const { error } = await supabase.from('elements').update({ geometry }).eq('id', e.id);
    if (error) { updateEl(prev); setErr(error.message); }
  };

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
    const g = e.geometry, steps: [string, string, () => void, () => void][] = [];
    let info = '';
    const len = g.start && g.end ? Math.hypot(g.end[0] - g.start[0], g.end[1] - g.start[1]) : 0;
    if (e.type === 'wall') {
      info = `${len.toFixed(2)} m long · ${Math.round(wallT(g) * 1000)} mm thick · ${r2(g.height ?? H)} m high`;
      steps.push(['Thickness', `${Math.round(wallT(g) * 1000)} mm`, () => edit(e, { ...g, thickness: Math.max(0.1, r2(wallT(g) - 0.025)) }), () => edit(e, { ...g, thickness: Math.min(0.6, r2(wallT(g) + 0.025)) })]);
      steps.push(['Height', `${r2(g.height ?? H)} m`, () => edit(e, { ...g, height: Math.max(1, r2((g.height ?? H) - 0.1)) }), () => edit(e, { ...g, height: r2((g.height ?? H) + 0.1) })]);
    } else if (e.type === 'beam') {
      const sec = beamSec(g, libById[e.library_item_id ?? '']?.specs), b = Math.round(sec.b * 1000), h = Math.round(sec.d * 1000);
      info = `${len.toFixed(2)} m long · ${b} × ${h} mm`;
      steps.push(['Width', `${b} mm`, () => edit(e, { ...g, b_mm: Math.max(150, b - 25), h_mm: h }), () => edit(e, { ...g, b_mm: Math.min(600, b + 25), h_mm: h })]);
      steps.push(['Depth', `${h} mm`, () => edit(e, { ...g, b_mm: b, h_mm: Math.max(200, h - 25) }), () => edit(e, { ...g, b_mm: b, h_mm: Math.min(1200, h + 25) })]);
    } else if (e.type === 'column') {
      const sp = libById[e.library_item_id ?? '']?.specs ?? {};
      info = `${sp.b_mm ?? Math.round(g.b * 1000)} × ${sp.h_mm ?? Math.round(g.h * 1000)} mm · at ${g.at[0]}, ${g.at[1]} m`;
    } else if (e.type === 'slab' || e.type === 'roof') {
      const t = Math.round((g.z1 - g.z0) * 1000), [x0, y0, x1, y1] = g.rect;
      info = `${(x1 - x0).toFixed(1)} × ${(y1 - y0).toFixed(1)} m · ${t} mm thick`;
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
    } else if (e.type === 'equipment') info = `Plant at ${g.at[0]}, ${g.at[1]} m`;
    return { info, steps };
  };

  const setT = (k: Tool) => { setTool(k); setStart(null); setErr(''); if (k !== 'select') setSelId(null); };
  const ti = (k: Tool): RItem => ({ key: k, label: TOOLS[k].label, icon: TOOL_ICON[k], active: tool === k, onPress: () => setT(k) });
  const go = (route: string): RItem['onPress'] => () => router.push(`/${route}/${id}` as any);
  const exportIfc = async () => {
    try { const { data: pr } = await supabase.from('projects').select('name').eq('id', id).single(); const nm = pr?.name ?? 'Unibuild'; await saveFile(`${nm.replace(/[^A-Za-z0-9_-]+/g, '_')}.ifc`, toIfc(nm, els, lib, stories)); setErr('IFC exported'); }
    catch (e: any) { setErr('IFC export failed: ' + (e?.message ?? e)); }
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
      {tool === 'select' && <Text style={s.rhint}>Select has no settings. Tap an element, then change it in the Properties panel.</Text>}
      {choices.length > 0 && <Stepper label={`${def.label} type`} value={chosen ? short(chosen.name, 16) : '-'} dec={() => cycle(-1)} inc={() => cycle(1)} />}
      {tool === 'wall' && <Stepper label="Wall thickness" value={`${Math.round(wallTh * 1000)} mm`} dec={() => setWallTh(Math.max(0.1, r2(wallTh - 0.025)))} inc={() => setWallTh(Math.min(0.6, r2(wallTh + 0.025)))} />}
      {tool === 'slab' && <Stepper label="Slab thickness" value={`${Math.round(slabTh * 1000)} mm`} dec={() => setSlabTh(Math.max(0.1, r2(slabTh - 0.025)))} inc={() => setSlabTh(Math.min(0.6, r2(slabTh + 0.025)))} />}
      {(tool === 'duct' || tool === 'pipe') && <Stepper label="Centreline height" value={`${elev.toFixed(2)} m`} dec={() => setElev(v => Math.max(0.1, r2(v - 0.1)))} inc={() => setElev(v => Math.min(H, r2(v + 0.1)))} />}
      {tool === 'outlet' && <Stepper label="Cooling load" value={`${kw} kW`} dec={() => setKw(v => Math.max(1, v - 1))} inc={() => setKw(v => Math.min(50, v + 1))} />}
      {['beam', 'column', 'door', 'window', 'plant'].includes(tool) && choices.length === 0 && <Text style={s.rhint}>No settings for this tool.</Text>}
    </>
  );
  const mi = (label: string, onPress?: () => void, extra: Partial<{ checked: boolean; disabled: boolean }> = {}) => ({ label, onPress, ...extra });
  const SEP = { label: '', sep: true };
  const menus: Menu[] = [
    { key: 'file', label: 'File', items: [mi('Projects', () => router.replace('/projects')), mi('Modules', () => router.push(`/hub/${id}` as any)), SEP, mi('Import IFC…', go('import')), mi('Export IFC', exportIfc)] },
    { key: 'edit', label: 'Edit', items: [mi('Undo last element', undo), mi('Select (V)', () => setT('select')), mi('Delete selected', () => sel && remove(sel), { disabled: !sel }), mi('Finish chain (Esc)', () => setStart(null), { disabled: !start })] },
    { key: 'view', label: 'View', items: [mi('Zoom in', () => setZoom(z => Math.min(3, z * 1.25))), mi('Zoom out', () => setZoom(z => Math.max(0.15, z / 1.25))), mi('Fit to window', fit), SEP, mi('Grid', () => setGrid(!grid), { checked: grid }), mi('Wall lengths', () => setDims(!dims), { checked: dims }), mi('Deep blue canvas', () => setBlue(!blue), { checked: blue }), SEP, mi('Storey up', () => stepStorey(1)), mi('Storey down', () => stepStorey(-1)), mi('3D view', go('view3d'))] },
    { key: 'design', label: 'Design', items: [...(['column', 'beam', 'slab', 'wall', 'door', 'window', 'duct', 'pipe', 'plant', 'outlet'] as Tool[]).map(k => mi(TOOLS[k].label, () => setT(k), { checked: tool === k })), SEP, mi('Add storey', () => addStorey(false)), mi('Copy storey up', () => addStorey(true))] },
    { key: 'analyze', label: 'Analyze', items: [mi('Member design', go('design')), mi('Slab and foundations', go('foundations')), mi('Wind and quake', go('lateral')), mi('MEP routing and pressure', go('mep')), SEP, mi(nHere.length ? `Clashes (${nHere.length} here)` : 'Clashes', go('clashes')), mi('Dashboard', go('dashboard'))] },
    { key: 'options', label: 'Options', items: [
      ...[0.1, 0.25, 0.5, 1].map(v => mi(`Snap ${v} m`, () => setSnap(v), { checked: snap === v })), SEP,
      mi('Code: Eurocode 2', () => basis({ code: 'EC2' }), { checked: dsn.code === 'EC2' }), mi('Code: BS 8110', () => basis({ code: 'BS8110' }), { checked: dsn.code === 'BS8110' }), SEP,
      ...CLASSES.map((c, i) => mi(`Concrete ${cname(c)}`, () => basis({ cls: i }), { checked: dsn.cls === i })), SEP,
      ...OCC.map((o, i) => mi(`Occupancy: ${o}`, () => basis({ use: i }), { checked: dsn.use === i })), SEP,
      ...[100, 150, 200, 300, 400].map(q => mi(`Soil bearing ${q} kPa`, () => basis({ q }), { checked: dsn.q === q })),
    ] },
  ];

  const tbItems: TItem[] = [
    { key: 'sel', label: 'Select', icon: 'select', active: tool === 'select', onPress: () => setT('select') },
    { key: 's1', label: '', icon: 'select', sep: true, onPress: () => {} },
    { key: 'undo', label: 'Undo last element', icon: 'undo', onPress: undo },
    { key: 'del', label: 'Delete selected', icon: 'delete', disabled: !sel, onPress: () => sel && remove(sel) },
    { key: 'fin', label: 'Finish chain', icon: 'finish', disabled: !start, onPress: () => setStart(null) },
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
  const designTools: Tool[] = ['column', 'beam', 'slab', 'wall', 'door', 'window', 'duct', 'pipe', 'plant', 'outlet'];
  const boxSecs: { key: string; title: string; items: RItem[] }[] = [
    { key: 'design', title: 'Design', items: designTools.map(ti) },
    { key: 'view', title: 'Viewpoint', items: [{ key: 'fp', label: 'Floor plan', icon: 'storey', active: true, onPress: () => {} }, { key: 'v3', label: '3D view', icon: 'cube', onPress: go('view3d') }, { key: 'fit', label: 'Fit', icon: 'fit', onPress: fit }] },
    { key: 'doc', title: 'Document', items: [{ key: 'dm', label: 'Lengths', icon: 'dims', active: dims, onPress: () => setDims(!dims) }, { key: 'cl', label: nHere.length ? `Clashes ${nHere.length}` : 'Clashes', icon: 'clash', onPress: go('clashes') }, { key: 'db', label: 'Dashboard', icon: 'dashboard', onPress: go('dashboard') }, { key: 'imp', label: 'Import IFC', icon: 'ifc', onPress: go('import') }, { key: 'exp', label: 'Export IFC', icon: 'ifc', onPress: exportIfc }] },
    { key: 'more', title: 'Analyze', items: [{ key: 'md', label: 'Members', icon: 'design', onPress: go('design') }, { key: 'sf', label: 'Slab, found.', icon: 'foundation', onPress: go('foundations') }, { key: 'wq', label: 'Wind, quake', icon: 'wind', onPress: go('lateral') }, { key: 'mep', label: 'MEP', icon: 'mep', onPress: go('mep') }] },
  ];

  // keyboard on the web: V select, tool letters, Esc, Delete, Ctrl+Z
  const keyRef = useRef<(k: KeyboardEvent) => void>(() => {});
  keyRef.current = (k: KeyboardEvent) => {
    const tg = k.target as HTMLElement | null; if (tg && /INPUT|TEXTAREA/.test(tg.tagName)) return;
    const key = k.key.toLowerCase(), map: Record<string, Tool> = { v: 'select', w: 'wall', c: 'column', b: 'beam', s: 'slab', d: 'door', n: 'window', u: 'duct', p: 'pipe' };
    if ((k.ctrlKey || k.metaKey) && key === 'z') { k.preventDefault(); undo(); }
    else if (key === 'escape') { setStart(null); setSelId(null); setMenu(null); }
    else if ((key === 'delete' || key === 'backspace') && sel) { k.preventDefault(); remove(sel); }
    else if (!k.ctrlKey && !k.metaKey && !k.altKey && map[key]) setT(map[key]);
  };
  const ptrRef = useRef<(x: number, y: number) => void>(() => {});
  ptrRef.current = (cx: number, cy: number) => {
    const el: HTMLElement | null = canvasRef.current; if (!el?.getBoundingClientRect) return;
    const r = el.getBoundingClientRect(), mx = (cx - r.left) / zoom / PX, my = (cy - r.top) / zoom / PX;
    if (mx < 0 || my < 0 || mx > N || my > N) return setCur2(null);
    const q: Pt = [r2(Math.round(mx / snap) * snap), r2(Math.round(my / snap) * snap)];
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
    const h = (k: KeyboardEvent) => keyRef.current(k);
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);

  const insp = sel ? inspector(sel) : null;
  const Inspector = insp && sel ? (
    <View style={s.insp}>
      <View style={s.ir}><Text style={s.it}>{NAME[sel.type] ?? sel.type}{libById[sel.library_item_id ?? ''] ? ` · ${libById[sel.library_item_id ?? ''].name}` : ''}</Text><Pressable onPress={() => setSelId(null)}><Text style={s.l}>Done</Text></Pressable></View>
      <Text style={s.k}>{insp.info}</Text>
      {insp.steps.map(([label, val, dec, inc]) => (
        <View key={label} style={s.ir}><Text style={[s.k, { flex: 1 }]}>{label}</Text><Pressable onPress={dec}><Text style={s.step}>−</Text></Pressable><Text style={s.sv}>{val}</Text><Pressable onPress={inc}><Text style={s.step}>+</Text></Pressable></View>
      ))}
      <Pressable onPress={() => remove(sel)}><Text style={s.del}>Delete {NAME[sel.type]?.toLowerCase() ?? 'element'}{sel.type === 'wall' ? ' and its doors and windows' : ''}</Text></Pressable>
    </View>
  ) : null;
  const rows: [string, number][] = ([['Walls', counts.wall], ['Columns', counts.column], ['Beams', counts.beam], ['Slabs', counts.slab], ['Doors', counts.door], ['Windows', counts.window], ['Ducts', counts.duct], ['Pipes', counts.pipe], ['Plant', counts.equipment], ['Outlets', counts.fixture]] as [string, number | undefined][]).filter(r => r[1]).map(r => [r[0], r[1] as number]);

  const quick = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.quick} contentContainerStyle={s.quickIn}>
      <Seg label="Snap" options={[['0.1', '0.1'], ['0.25', '0.25'], ['0.5', '0.5'], ['1', '1 m']]} value={String(snap)} onChange={v => setSnap(Number(v))} />
      <Toggle label="Grid" on={grid} onChange={setGrid} />
      <Toggle label="Lengths" on={dims} onChange={setDims} />
      <Toggle label="Blue canvas" on={blue} onChange={setBlue} />
      <View style={s.qsep} />
      <Seg label="Design code" options={[['EC2', 'EC2'], ['BS8110', 'BS 8110']]} value={dsn.code} onChange={v => basis({ code: v as 'EC2' | 'BS8110' })} />
      <Stepper label="Concrete" value={cname(CLASSES[dsn.cls])} dec={() => basis({ cls: Math.max(0, dsn.cls - 1) })} inc={() => basis({ cls: Math.min(CLASSES.length - 1, dsn.cls + 1) })} />
      <Stepper label="Occupancy" value={OCC[dsn.use]} dec={() => basis({ use: Math.max(0, dsn.use - 1) })} inc={() => basis({ use: Math.min(OCC.length - 1, dsn.use + 1) })} />
      <Stepper label="Soil bearing" value={`${dsn.q} kPa`} dec={() => basis({ q: Math.max(50, dsn.q - 25) })} inc={() => basis({ q: Math.min(600, dsn.q + 25) })} />
    </ScrollView>
  );

  return (
    <View style={s.wrap}>
      <MenuBar menus={menus} open={menu} setOpen={setMenu} narrow={!wide} right={pname} />
      {menu && <Pressable style={s.backdrop} onPress={() => setMenu(null)} />}
      <ToolBar items={tbItems} />
      <View style={s.info}>
        <View style={s.infoT}><Icon name={TOOL_ICON[tool]} size={20} /><Text style={s.infoN}>{def.label}</Text></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.infoIn}>{toolSettings}</ScrollView>
      </View>
      {!wide && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.strip} contentContainerStyle={{ padding: 4, gap: 2 }}>
          {[ti('select'), ...designTools.map(ti)].map(it => <BoxBtn key={it.key} it={it} strip />)}
        </ScrollView>
      )}
      <View style={s.body}>
        {wide && (
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
                  <Layer here={here} libById={libById} wallById={wallById} dims={dims} c={pal} />
                  {sel && <Highlight e={sel} wallById={wallById} />}
                  {cur2 && <G><Line x1={cur2[0] * PX - 14} y1={cur2[1] * PX} x2={cur2[0] * PX + 14} y2={cur2[1] * PX} stroke={pal.cursor} strokeWidth={1.5} /><Line x1={cur2[0] * PX} y1={cur2[1] * PX - 14} x2={cur2[0] * PX} y2={cur2[1] * PX + 14} stroke={pal.cursor} strokeWidth={1.5} /><Circle cx={cur2[0] * PX} cy={cur2[1] * PX} r={4} fill="none" stroke={pal.cursor} strokeWidth={1.5} /></G>}
                  {start && cur2 && (tool === 'wall' || tool === 'beam' || tool === 'duct' || tool === 'pipe') && <Line x1={start[0] * PX} y1={start[1] * PX} x2={cur2[0] * PX} y2={cur2[1] * PX} stroke={pal.cursor} strokeWidth={2} strokeDasharray="8 6" />}
                  {start && <Circle cx={start[0] * PX} cy={start[1] * PX} r={7} fill="#c98a00" />}
                  {nHere.map(i => <Circle key={i.id} cx={i.location[0] * PX} cy={i.location[1] * PX} r={16} fill="none" stroke="#c62828" strokeWidth={3} />)}
                </Svg>
              </Pressable>
            </ScrollView></ScrollView>
          </View>
        </View>
        {wide && (
          <ScrollView style={s.props}>
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
        )}
      </View>
      {quick}
      <View style={s.status}>
        <Text style={s.stT} numberOfLines={1}>{chosen && tool !== 'select' ? `${short(chosen.name, 28)}. ` : ''}{def.hint}</Text>
        <Text style={s.stR}>{cur2 ? `X ${cur2[0].toFixed(2)}  Y ${cur2[1].toFixed(2)} m` : ''}{start && cur2 ? `  ·  length ${Math.hypot(cur2[0] - start[0], cur2[1] - start[1]).toFixed(2)} m` : ''}{cur2 ? '  ·  ' : ''}{story?.name ?? ''} · Snap {snap} m · Zoom {Math.round(zoom * 100)}%</Text>
      </View>
    </View>
  );
}
function BoxBtnRow({ items }: { items: RItem[] }) { return <View style={{ flexDirection: 'row', gap: 4 }}>{items.map(it => <BoxBtn key={it.key} it={it} />)}</View>; }
const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#fff' },
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
  status: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#0a2e1f' },
  stT: { flex: 1, color: '#e4f1e9', fontSize: 12 }, stR: { color: '#a8c5b4', fontSize: 12 },
});
