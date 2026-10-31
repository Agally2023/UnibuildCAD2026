import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import Svg, { Defs, Pattern, Path, G, Line, Rect, Circle, Text as SvgText } from 'react-native-svg';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useModel } from '../../lib/useModel';
import { toIfc } from '../../lib/ifc';
import { saveFile } from '../../components/saveFile';
import { wallT } from '../../lib/model';
import type { El, Lib } from '../../lib/engineering';

const PX = 50;      // pixels per metre at 100% zoom
const SNAP = 0.5;   // snap grid in metres
const N = 120;      // plan canvas size in metres
type Pt = [number, number];
type Tool = 'wall' | 'beam' | 'column' | 'slab' | 'door' | 'window' | 'duct' | 'pipe' | 'plant' | 'outlet';
const DBT: Record<string, string> = { plant: 'equipment', outlet: 'fixture' };
const DISC: Record<string, string> = { wall: 'architecture', door: 'architecture', window: 'architecture', roof: 'architecture', stair: 'architecture', column: 'structure', beam: 'structure', slab: 'structure', foundation: 'structure', duct: 'mep', pipe: 'mep', equipment: 'mep', fixture: 'mep' };
const TOOLS: { key: Tool; label: string; lib?: (l: Lib) => boolean }[] = [
  { key: 'wall', label: 'Wall' },
  { key: 'column', label: 'Column', lib: l => l.category === 'section' && /column/i.test(l.name) },
  { key: 'beam', label: 'Beam', lib: l => l.category === 'section' && /beam/i.test(l.name) },
  { key: 'slab', label: 'Slab' },
  { key: 'door', label: 'Door', lib: l => l.category === 'door' },
  { key: 'window', label: 'Window', lib: l => l.category === 'window' },
  { key: 'duct', label: 'Duct', lib: l => l.category === 'duct' },
  { key: 'pipe', label: 'Pipe', lib: l => l.category === 'pipe' },
  { key: 'plant', label: 'Plant' },
  { key: 'outlet', label: 'Outlet' },
];
const BOXC: Record<string, string> = { slab: '#2f5bea', roof: '#8a6d3b', stair: '#6b7a85', foundation: '#555d63' };

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

export default function Plan() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { els, lib, stories, reload } = useModel(id);
  const [cur, setCur] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('wall');
  const [pick, setPick] = useState<Record<string, number>>({});
  const [start, setStart] = useState<Pt | null>(null);
  const [err, setErr] = useState('');
  const [elev, setElev] = useState(3.15);
  const [zoom, setZoom] = useState(0.6);
  const [kw, setKw] = useState(5);
  const [issues, setIssues] = useState<{ id: string; location: any; story_id: string | null }[]>([]);

  const story = stories.find(s => s.id === cur) ?? stories[0];
  const H = story?.height_m ?? 3.6;
  const here = useMemo(() => els.filter(e => (e.story_id ?? stories[0]?.id) === story?.id), [els, stories, story]);
  const walls = here.filter(e => e.type === 'wall');
  const libById = useMemo(() => Object.fromEntries(lib.map(l => [l.id, l])), [lib]);
  const def = TOOLS.find(t => t.key === tool)!;
  const choices = useMemo(() => (def.lib ? lib.filter(def.lib) : []), [lib, def]);
  const chosen = choices.length ? choices[(pick[tool] ?? 0) % choices.length] : null;

  useEffect(() => {
    supabase.from('issues').select('id,location,story_id').eq('project_id', id).eq('status', 'open').then(({ data }) => setIssues(((data as any[]) ?? []).filter(i => i.location)));
  }, [id, els]);

  const add = async (geometry: object) => {
    setErr('');
    const { error } = await supabase.from('elements').insert({ project_id: id, story_id: story?.id ?? null, type: DBT[tool] ?? tool, discipline: DISC[DBT[tool] ?? tool], library_item_id: chosen?.id ?? null, geometry });
    if (error) setErr(error.message);
  };

  const tap = async (wx: number, wy: number) => {
    const p: Pt = [Math.round(wx / PX / SNAP) * SNAP, Math.round(wy / PX / SNAP) * SNAP];
    if (tool === 'column') { const sp = chosen?.specs ?? {}; return add({ at: p, b: (sp.b_mm ?? 300) / 1000, h: (sp.h_mm ?? 300) / 1000, height: H }); }
    if (tool === 'plant') return add({ at: p });
    if (tool === 'outlet') return add({ at: p, kw });
    if (tool === 'door' || tool === 'window') {
      const hit = nearestWall(walls, wx / PX, wy / PX);
      if (!hit || hit.d > 0.5) return setErr('Tap close to a wall to place it.');
      const width = chosen?.specs?.w ?? (tool === 'door' ? 0.9 : 1.5), off = Math.max(width / 2, Math.min(hit.len - width / 2, hit.off));
      return add({ wall_id: hit.w.id, offset_m: Math.round(off * 100) / 100, width_m: width });
    }
    if (!start) return setStart(p);
    if (p[0] === start[0] && p[1] === start[1]) return setStart(null);
    if (tool === 'slab') { await add({ rect: [Math.min(start[0], p[0]), Math.min(start[1], p[1]), Math.max(start[0], p[0]), Math.max(start[1], p[1])], z0: Math.round((H - 0.2) * 100) / 100, z1: H }); return setStart(null); }
    await add(tool === 'wall' ? { start, end: p, height: H } : tool === 'duct' || tool === 'pipe' ? { start, end: p, elevation_m: Math.round(elev * 100) / 100 } : { start, end: p });
    setStart(p);
  };

  const undo = async () => { const last = here[here.length - 1]; if (last) await supabase.from('elements').delete().eq('id', last.id); };

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

  const exportIfc = async () => {
    try {
      const { data: pr } = await supabase.from('projects').select('name').eq('id', id).single();
      await saveFile(`${(pr?.name ?? 'Unibuild').replace(/[^A-Za-z0-9_-]+/g, '_')}.ifc`, toIfc(pr?.name ?? 'Unibuild', els, lib, stories));
      setErr('IFC exported');
    } catch (e: any) { setErr('IFC export failed: ' + (e?.message ?? e)); }
  };

  const counts = here.reduce<Record<string, number>>((a, e) => ({ ...a, [e.type]: (a[e.type] ?? 0) + 1 }), {});
  const wallLen = walls.reduce((a, w) => a + Math.hypot(w.geometry.end[0] - w.geometry.start[0], w.geometry.end[1] - w.geometry.start[1]), 0);
  const wallById = Object.fromEntries(walls.map(w => [w.id, w]));
  const nHere = issues.filter(i => (i.story_id ?? stories[0]?.id) === story?.id);
  const S = N * PX;

  const opening = (e: El) => {
    const w = wallById[e.geometry.wall_id]; if (!w) return null;
    const [a, b] = [w.geometry.start as Pt, w.geometry.end as Pt], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
    const s0 = e.geometry.offset_m - e.geometry.width_m / 2, s1 = e.geometry.offset_m + e.geometry.width_m / 2;
    return { x1: (a[0] + ux * s0) * PX, y1: (a[1] + uy * s0) * PX, x2: (a[0] + ux * s1) * PX, y2: (a[1] + uy * s1) * PX };
  };
  const nav: [string, () => void][] = [['3D', () => router.push(`/view3d/${id}`)], ['Dashboard', () => router.push(`/dashboard/${id}`)], [`Clashes${nHere.length ? ` (${nHere.length})` : ''}`, () => router.push(`/clashes/${id}`)], ['Design', () => router.push(`/design/${id}`)], ['Foundations', () => router.push(`/foundations/${id}`)], ['MEP', () => router.push(`/mep/${id}`)], ['Wind & quake', () => router.push(`/lateral/${id}`)], ['Export IFC', exportIfc], ['Import IFC', () => router.push(`/import/${id}`)]];

  return (
    <View style={s.wrap}>
      <ScrollView horizontal style={s.row} contentContainerStyle={s.rowIn}>
        {stories.map(st => (
          <Pressable key={st.id} onPress={() => { setCur(st.id); setStart(null); }} style={[s.chip, story?.id === st.id && s.chipOn]}><Text style={[s.chipT, story?.id === st.id && s.on]}>{st.name}</Text></Pressable>
        ))}
        <Pressable onPress={() => addStorey(false)} style={s.chip}><Text style={s.chipT}>+ Storey</Text></Pressable>
        <Pressable onPress={() => addStorey(true)} style={s.chip}><Text style={s.chipT}>Copy up</Text></Pressable>
      </ScrollView>
      <ScrollView horizontal style={s.row} contentContainerStyle={s.rowIn}>
        {TOOLS.map(t => (
          <Pressable key={t.key} onPress={() => { setTool(t.key); setStart(null); setErr(''); }} style={[s.chip, tool === t.key && s.chipOn]}><Text style={[s.chipT, tool === t.key && s.on]}>{t.label}</Text></Pressable>
        ))}
      </ScrollView>
      <View style={s.bar}>
        <Text style={s.t} numberOfLines={1}>{chosen ? `${chosen.name}` : tool === 'wall' ? 'Tap two points' : tool === 'slab' ? 'Tap two corners' : 'Default size'}</Text>
        {choices.length > 1 && <Pressable onPress={() => setPick(p => ({ ...p, [tool]: (p[tool] ?? 0) + 1 }))}><Text style={s.l}>Next type</Text></Pressable>}
        <Pressable onPress={() => setStart(null)}><Text style={s.l}>Finish</Text></Pressable>
        <Pressable onPress={undo}><Text style={s.l}>Undo</Text></Pressable>
        <Pressable onPress={() => setZoom(z => Math.max(0.15, z / 1.25))}><Text style={s.l}>−</Text></Pressable>
        <Text style={s.k}>{Math.round(zoom * 100)}%</Text>
        <Pressable onPress={() => setZoom(z => Math.min(3, z * 1.25))}><Text style={s.l}>+</Text></Pressable>
      </View>
      <ScrollView horizontal style={s.row} contentContainerStyle={s.rowIn}>
        {nav.map(([label, fn]) => <Pressable key={label} onPress={fn}><Text style={s.l}>{label}</Text></Pressable>)}
      </ScrollView>
      <Text style={s.sum}>{story?.name ?? ''} · {wallLen.toFixed(1)} m of wall · {counts.column ?? 0} columns · {counts.beam ?? 0} beams · {counts.slab ?? 0} slabs · {counts.door ?? 0} doors · {counts.window ?? 0} windows</Text>
      {(tool === 'duct' || tool === 'pipe') && (
        <View style={s.bar}>
          <Text style={s.t}>Centreline elevation {elev.toFixed(2)} m</Text>
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
      {!!err && <Text style={s.err}>{err}</Text>}
      <ScrollView horizontal><ScrollView>
        <Pressable style={{ width: S * zoom, height: S * zoom }} onPress={e => tap(e.nativeEvent.locationX / zoom, e.nativeEvent.locationY / zoom)}>
          <Svg width={S * zoom} height={S * zoom} viewBox={`0 0 ${S} ${S}`} pointerEvents="none">
            <Defs>
              <Pattern id="g1" width={PX} height={PX} patternUnits="userSpaceOnUse"><Path d={`M ${PX} 0 L 0 0 0 ${PX}`} fill="none" stroke="#d5dce1" strokeWidth={0.5} /></Pattern>
              <Pattern id="g10" width={PX * 10} height={PX * 10} patternUnits="userSpaceOnUse"><Path d={`M ${PX * 10} 0 L 0 0 0 ${PX * 10}`} fill="none" stroke="#aab6bd" strokeWidth={1.5} /></Pattern>
            </Defs>
            <Rect x={0} y={0} width={S} height={S} fill="url(#g1)" /><Rect x={0} y={0} width={S} height={S} fill="url(#g10)" />
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
                const o = opening(e); if (!o) return null;
                return <Line key={e.id} x1={o.x1} y1={o.y1} x2={o.x2} y2={o.y2} stroke={e.type === 'door' ? '#1a8f4d' : '#0c9a87'} strokeWidth={e.type === 'door' ? 9 : 4} />;
              }
              if (e.type === 'equipment') return <Rect key={e.id} x={g.at[0] * PX - 14} y={g.at[1] * PX - 14} width={28} height={28} fill="#0b6b8a" />;
              if (e.type === 'fixture') return <G key={e.id}><Circle cx={g.at[0] * PX} cy={g.at[1] * PX} r={8} fill="#0c9a87" /><SvgText x={g.at[0] * PX + 11} y={g.at[1] * PX + 4} fontSize={11} fill="#16232b">{g.kw ?? 5} kW</SvgText></G>;
              return null;
            })}
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
  row: { flexGrow: 0, borderBottomWidth: 1, borderColor: '#d5dce1' }, rowIn: { gap: 8, padding: 8, alignItems: 'center' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: '#2f5bea' },
  chipOn: { backgroundColor: '#2f5bea' }, chipT: { color: '#2f5bea', fontWeight: '600' }, on: { color: '#fff' },
  bar: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, padding: 10, alignItems: 'center' },
  t: { flex: 1, fontWeight: '600' }, l: { color: '#2f5bea', fontWeight: '600' }, k: { color: '#5b6b75' },
  sum: { paddingHorizontal: 12, paddingBottom: 6, color: '#5b6b75', fontSize: 13 },
  err: { color: '#c62828', paddingHorizontal: 12, paddingBottom: 6 },
});
