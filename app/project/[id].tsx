import { memo, useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import Svg, { Defs, Pattern, Path, G, Line, Rect, Circle, Text as SvgText } from 'react-native-svg';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { newId, useModel } from '../../lib/useModel';
import { rememberProject } from '../../lib/session';
import { beamSec, wallT } from '../../lib/model';
import type { El, Lib } from '../../lib/engineering';

const PX = 50;      // pixels per metre at 100% zoom
const SNAP = 0.5;   // snap grid in metres
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
const GROUPS: { name: string; tools: Tool[] }[] = [
  { name: 'Edit', tools: ['select'] },
  { name: 'Structure', tools: ['column', 'beam', 'slab'] },
  { name: 'Architecture', tools: ['wall', 'door', 'window'] },
  { name: 'Services', tools: ['duct', 'pipe', 'plant', 'outlet'] },
];
const BOXC: Record<string, string> = { slab: '#2f5bea', roof: '#8a6d3b', stair: '#6b7a85', foundation: '#555d63' };
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

const Grid = memo(function Grid() {
  const S = N * PX;
  return (
    <>
      <Defs>
        <Pattern id="g1" width={PX} height={PX} patternUnits="userSpaceOnUse"><Path d={`M ${PX} 0 L 0 0 0 ${PX}`} fill="none" stroke="#d5dce1" strokeWidth={0.5} /></Pattern>
        <Pattern id="g10" width={PX * 10} height={PX * 10} patternUnits="userSpaceOnUse"><Path d={`M ${PX * 10} 0 L 0 0 0 ${PX * 10}`} fill="none" stroke="#aab6bd" strokeWidth={1.5} /></Pattern>
      </Defs>
      <Rect x={0} y={0} width={S} height={S} fill="url(#g1)" /><Rect x={0} y={0} width={S} height={S} fill="url(#g10)" />
    </>
  );
});

// All drawn elements. Memoised: it only redraws when the elements themselves change, not on zoom, tool or selection changes.
const Layer = memo(function Layer({ here, libById, wallById }: { here: El[]; libById: Record<string, Lib>; wallById: Record<string, El> }) {
  return (
    <>
      {here.filter(e => e.geometry.rect).map(e => { const [x0, y0, x1, y1] = e.geometry.rect; return <Rect key={e.id} x={x0 * PX} y={y0 * PX} width={(x1 - x0) * PX} height={(y1 - y0) * PX} fill={BOXC[e.type] ?? '#2f5bea'} fillOpacity={0.1} stroke={BOXC[e.type] ?? '#2f5bea'} strokeWidth={1.5} />; })}
      {here.map(e => {
        const g = e.geometry;
        if (e.type === 'wall') {
          const l = Math.hypot(g.end[0] - g.start[0], g.end[1] - g.start[1]);
          return <G key={e.id}>
            <Line x1={g.start[0] * PX} y1={g.start[1] * PX} x2={g.end[0] * PX} y2={g.end[1] * PX} stroke="#2f5bea" strokeWidth={Math.max(wallT(g) * PX, 4)} strokeLinecap="butt" />
            <SvgText x={(g.start[0] + g.end[0]) / 2 * PX + 6} y={(g.start[1] + g.end[1]) / 2 * PX - 6} fontSize={12} fill="#16232b">{l.toFixed(1)} m</SvgText>
          </G>;
        }
        if (e.type === 'beam') return <Line key={e.id} x1={g.start[0] * PX} y1={g.start[1] * PX} x2={g.end[0] * PX} y2={g.end[1] * PX} stroke="#c98a00" strokeWidth={3} strokeDasharray="10 6" />;
        if (e.type === 'column') {
          const sp = libById[e.library_item_id ?? '']?.specs ?? {}, w = ((sp.b_mm ?? g.b * 1000) / 1000) * PX, h = ((sp.h_mm ?? g.h * 1000) / 1000) * PX;
          return <Rect key={e.id} x={g.at[0] * PX - w / 2} y={g.at[1] * PX - h / 2} width={Math.max(w, 8)} height={Math.max(h, 8)} fill="#c98a00" />;
        }
        if (e.type === 'duct' || e.type === 'pipe') {
          const sp = libById[e.library_item_id ?? '']?.specs ?? {}, wpx = ((e.type === 'duct' ? sp.w_mm ?? 600 : sp.dia_mm ?? 110) / 1000) * PX;
          return <Line key={e.id} x1={g.start[0] * PX} y1={g.start[1] * PX} x2={g.end[0] * PX} y2={g.end[1] * PX} stroke={e.type === 'duct' ? '#0c9a87' : '#0b6b8a'} strokeWidth={Math.max(wpx, 3)} opacity={0.75} />;
        }
        if (e.type === 'door' || e.type === 'window') {
          const o = openingSeg(e, wallById); if (!o) return null;
          return <Line key={e.id} x1={o.a[0] * PX} y1={o.a[1] * PX} x2={o.b[0] * PX} y2={o.b[1] * PX} stroke={e.type === 'door' ? '#1a8f4d' : '#0c9a87'} strokeWidth={e.type === 'door' ? 9 : 4} />;
        }
        if (e.type === 'equipment') return <Rect key={e.id} x={g.at[0] * PX - 14} y={g.at[1] * PX - 14} width={28} height={28} fill="#0b6b8a" />;
        if (e.type === 'fixture') return <G key={e.id}><Circle cx={g.at[0] * PX} cy={g.at[1] * PX} r={8} fill="#0c9a87" /><SvgText x={g.at[0] * PX + 11} y={g.at[1] * PX + 4} fontSize={11} fill="#16232b">{g.kw ?? 5} kW</SvgText></G>;
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
  const [selId, setSelId] = useState<string | null>(null);
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

  useFocusEffect(useCallback(() => { rememberProject(id); }, [id]));

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
    const p: Pt = [Math.round(mx / SNAP) * SNAP, Math.round(my / SNAP) * SNAP];
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
    if (tool === 'slab') { await add({ rect: [Math.min(start[0], p[0]), Math.min(start[1], p[1]), Math.max(start[0], p[0]), Math.max(start[1], p[1])], z0: r2(H - 0.2), z1: H }); return setStart(null); }
    await add(tool === 'wall' ? { start, end: p, height: H } : tool === 'duct' || tool === 'pipe' ? { start, end: p, elevation_m: r2(elev) } : { start, end: p });
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

  return (
    <View style={s.wrap}>
      <View style={s.top}>
        <Pressable style={s.modules} onPress={() => router.push(`/hub/${id}`)}><Text style={s.modulesT}>☰ Modules</Text></Pressable>
        <Pressable onPress={() => router.replace('/projects')} style={{ paddingHorizontal: 10 }}><Text style={s.l}>Projects</Text></Pressable>
        <ScrollView horizontal style={{ flex: 1 }} contentContainerStyle={s.rowIn} showsHorizontalScrollIndicator={false}>
          {stories.map(st => (
            <Pressable key={st.id} onPress={() => { setCur(st.id); setStart(null); setSelId(null); }} style={[s.chip, story?.id === st.id && s.chipOn]}><Text style={[s.chipT, story?.id === st.id && s.on]}>{st.name}</Text></Pressable>
          ))}
          <Pressable onPress={() => addStorey(false)} style={s.chip}><Text style={s.chipT}>+ Storey</Text></Pressable>
          <Pressable onPress={() => addStorey(true)} style={s.chip}><Text style={s.chipT}>Copy up</Text></Pressable>
        </ScrollView>
      </View>
      <View style={s.tools}>
        {GROUPS.map(gr => (
          <View key={gr.name} style={s.group}>
            <Text style={s.gl}>{gr.name}</Text>
            <View style={s.gr}>
              {gr.tools.map(t => (
                <Pressable key={t} onPress={() => { setTool(t); setStart(null); setErr(''); if (t !== 'select') setSelId(null); }} style={[s.tool, tool === t && s.chipOn]}><Text style={[s.chipT, tool === t && s.on]}>{TOOLS[t].label}</Text></Pressable>
              ))}
            </View>
          </View>
        ))}
      </View>
      <View style={s.bar}>
        <Text style={s.t} numberOfLines={2}>{chosen ? `${chosen.name}. ` : ''}{def.hint}</Text>
        {choices.length > 1 && <Pressable onPress={() => setPick(p => ({ ...p, [tool]: (p[tool] ?? 0) + 1 }))}><Text style={s.l}>Next type</Text></Pressable>}
        <Pressable onPress={() => setStart(null)}><Text style={s.l}>Finish</Text></Pressable>
        <Pressable onPress={undo}><Text style={s.l}>Undo</Text></Pressable>
        <Pressable onPress={() => setZoom(z => Math.max(0.15, z / 1.25))}><Text style={s.l}>−</Text></Pressable>
        <Text style={s.k}>{Math.round(zoom * 100)}%</Text>
        <Pressable onPress={() => setZoom(z => Math.min(3, z * 1.25))}><Text style={s.l}>+</Text></Pressable>
      </View>
      <Text style={s.sum}>{story?.name ?? ''} · {wallLen.toFixed(1)} m of wall · {counts.column ?? 0} columns · {counts.beam ?? 0} beams · {counts.slab ?? 0} slabs · {counts.door ?? 0} doors · {counts.window ?? 0} windows{nHere.length ? ` · ${nHere.length} open clashes` : ''}</Text>
      {(tool === 'duct' || tool === 'pipe') && (
        <View style={s.bar}>
          <Text style={s.t}>Centreline height {elev.toFixed(2)} m</Text>
          <Pressable onPress={() => setElev(v => Math.max(0.1, v - 0.1))}><Text style={s.l}>Lower</Text></Pressable>
          <Pressable onPress={() => setElev(v => Math.min(H, v + 0.1))}><Text style={s.l}>Higher</Text></Pressable>
        </View>
      )}
      {tool === 'outlet' && (
        <View style={s.bar}>
          <Text style={s.t}>Cooling load {kw} kW per outlet</Text>
          <Pressable onPress={() => setKw(v => Math.max(1, v - 1))}><Text style={s.l}>Less</Text></Pressable>
          <Pressable onPress={() => setKw(v => Math.min(50, v + 1))}><Text style={s.l}>More</Text></Pressable>
        </View>
      )}
      {sel && (() => {
        const { info, steps } = inspector(sel);
        return (
          <View style={s.insp}>
            <View style={s.ir}><Text style={s.it}>{NAME[sel.type] ?? sel.type}{libById[sel.library_item_id ?? ''] ? ` · ${libById[sel.library_item_id ?? ''].name}` : ''}</Text><Pressable onPress={() => setSelId(null)}><Text style={s.l}>Done</Text></Pressable></View>
            <Text style={s.k}>{info}</Text>
            {steps.map(([label, val, dec, inc]) => (
              <View key={label} style={s.ir}><Text style={s.k}>{label}</Text><Pressable onPress={dec}><Text style={s.step}>−</Text></Pressable><Text style={s.sv}>{val}</Text><Pressable onPress={inc}><Text style={s.step}>+</Text></Pressable></View>
            ))}
            <Pressable onPress={() => remove(sel)}><Text style={s.del}>Delete {NAME[sel.type]?.toLowerCase() ?? 'element'}{sel.type === 'wall' ? ' and its doors and windows' : ''}</Text></Pressable>
          </View>
        );
      })()}
      {!!err && <Text style={s.err}>{err}</Text>}
      {!loaded && !els.length && <Text style={s.sum}>Loading the model…</Text>}
      <ScrollView horizontal><ScrollView>
        <Pressable style={{ width: S * zoom, height: S * zoom }} onPress={e => { const [x, y] = tapPos(e); tap(x / zoom, y / zoom); }}>
          <Svg width={S * zoom} height={S * zoom} viewBox={`0 0 ${S} ${S}`} pointerEvents="none">
            <Grid />
            <Layer here={here} libById={libById} wallById={wallById} />
            {sel && <Highlight e={sel} wallById={wallById} />}
            {start && <Circle cx={start[0] * PX} cy={start[1] * PX} r={7} fill="#c98a00" />}
            {nHere.map(i => <Circle key={i.id} cx={i.location[0] * PX} cy={i.location[1] * PX} r={16} fill="none" stroke="#c62828" strokeWidth={3} />)}
          </Svg>
        </Pressable>
      </ScrollView></ScrollView>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: '#d5dce1', paddingLeft: 8 },
  rowIn: { gap: 8, padding: 8, alignItems: 'center' },
  modules: { backgroundColor: '#16232b', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }, modulesT: { color: '#fff', fontWeight: '700' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: '#2f5bea' },
  chipOn: { backgroundColor: '#2f5bea' }, chipT: { color: '#2f5bea', fontWeight: '600' }, on: { color: '#fff' },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: 10, paddingVertical: 6, borderBottomWidth: 1, borderColor: '#d5dce1' },
  group: { gap: 3 }, gl: { fontSize: 11, color: '#5b6b75', textTransform: 'uppercase', letterSpacing: 0.5 }, gr: { flexDirection: 'row', gap: 6 },
  tool: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#2f5bea' },
  bar: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, padding: 10, alignItems: 'center' },
  t: { flex: 1, fontWeight: '600', minWidth: 200 }, l: { color: '#2f5bea', fontWeight: '600' }, k: { color: '#5b6b75' },
  sum: { paddingHorizontal: 12, paddingBottom: 6, color: '#5b6b75', fontSize: 13 },
  err: { color: '#c62828', paddingHorizontal: 12, paddingBottom: 6 },
  insp: { marginHorizontal: 10, marginBottom: 8, padding: 12, gap: 8, borderWidth: 1, borderColor: '#c62828', borderRadius: 10 },
  ir: { flexDirection: 'row', alignItems: 'center', gap: 12 }, it: { flex: 1, fontWeight: '700', fontSize: 16 },
  step: { fontSize: 24, color: '#2f5bea', paddingHorizontal: 10 }, sv: { fontWeight: '600', minWidth: 70, textAlign: 'center' },
  del: { color: '#c62828', fontWeight: '700' },
});
