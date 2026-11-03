import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, PanResponder, Platform, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useModel } from '../../lib/useModel';
import { groupByStory } from '../../lib/model';
import { drag, Axis, Q, turn, VIEWS } from '../../lib/orbit';
import Scene from '../../components/Scene';

const STEP = Math.PI / 12;   // 15 degrees

export default function View3D() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { els, lib, stories } = useModel(id);
  const [quat, setQuat] = useState<Q>(VIEWS.iso.q);
  const [zoom, setZoom] = useState(1);
  const [roll, setRoll] = useState(false);          // drag turns about the view axis (Z) instead of X and Y
  const last = useRef({ x: 0, y: 0 });
  const rollRef = useRef(false); rollRef.current = roll;
  const libMap = useMemo(() => Object.fromEntries(lib.map(l => [l.id, l])), [lib]);
  const groups = useMemo(() => groupByStory(els, stories), [els, stories]);
  // one shared centre so the storeys stack on top of each other
  const { center, extent } = useMemo(() => {
    const xs: number[] = [], ys: number[] = [];
    for (const e of els) { const g = e.geometry; if (g.start) { xs.push(g.start[0], g.end[0]); ys.push(g.start[1], g.end[1]); } if (g.at) { xs.push(g.at[0]); ys.push(g.at[1]); } if (g.rect) { xs.push(g.rect[0], g.rect[2]); ys.push(g.rect[1], g.rect[3]); } if (g.poly) for (const q of g.poly) { xs.push(q[0]); ys.push(q[1]); } }
    if (!xs.length) return { center: [0, 0] as [number, number], extent: 10 };
    return { center: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2] as [number, number], extent: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 6) };
  }, [els]);
  const scene = useMemo(() => groups.map(g => ({ id: g.story.id, elevation: g.story.elevation_m, height: g.story.height_m, els: g.els })), [groups]);

  const shift = useRef(false);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { last.current = { x: 0, y: 0 }; },
    onPanResponderMove: (_e, g) => {
      const dx = g.dx - last.current.x, dy = g.dy - last.current.y; last.current = { x: g.dx, y: g.dy };
      setQuat(q => (rollRef.current || shift.current ? turn(q, 'z', dx * 0.01) : drag(q, dx, dy)));
    },
  }), []);

  const rot = (a: Axis, dir: 1 | -1) => setQuat(q => turn(q, a, dir * STEP));
  const wrap = useRef<any>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const down = (k: KeyboardEvent) => { shift.current = k.shiftKey; const t = (k.target as HTMLElement)?.tagName; if (t === 'INPUT' || t === 'TEXTAREA') return;
      const m: Record<string, [Axis, 1 | -1]> = { ArrowLeft: ['y', -1], ArrowRight: ['y', 1], ArrowUp: ['x', -1], ArrowDown: ['x', 1], q: ['z', 1], e: ['z', -1] };
      const a = m[k.key]; if (a) { k.preventDefault(); rot(a[0], a[1]); } };
    const up = (k: KeyboardEvent) => { shift.current = k.shiftKey; };
    const node = wrap.current as HTMLElement | null;
    const wheel = (w: WheelEvent) => { w.preventDefault(); setZoom(z => Math.min(5, Math.max(0.15, z * (w.deltaY > 0 ? 0.92 : 1.09)))); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); node?.addEventListener?.('wheel', wheel, { passive: false });
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); node?.removeEventListener?.('wheel', wheel); };
  }, []);

  const Btn = ({ label, go, on }: { label: string; go: () => void; on?: boolean }) => <Pressable onPress={go} style={[s.btn, on && s.on]}><Text style={[s.bt, on && { color: '#fff' }]}>{label}</Text></Pressable>;
  return (
    <View style={s.wrap}>
      <View ref={wrap} style={s.canvas} {...pan.panHandlers}><Scene stories={scene} lib={libMap} center={center} extent={extent} quat={quat} zoom={zoom} /></View>
      <ScrollView style={s.bar} contentContainerStyle={{ gap: 8, padding: 10 }}>
        <Text style={s.t}>{els.length} elements · {groups.length} storey{groups.length > 1 ? 's' : ''} · drag to turn freely in any direction · {Platform.OS === 'web' ? 'Shift+drag (or Roll) spins about the view axis · wheel zooms · arrow keys and Q, E turn by 15°' : 'use Roll to spin about the view axis'}</Text>
        <View style={s.row}>
          <Text style={s.k}>Turn 15°</Text>
          <Btn label="X −" go={() => rot('x', -1)} /><Btn label="X +" go={() => rot('x', 1)} />
          <Btn label="Y −" go={() => rot('y', -1)} /><Btn label="Y +" go={() => rot('y', 1)} />
          <Btn label="Z −" go={() => rot('z', -1)} /><Btn label="Z +" go={() => rot('z', 1)} />
          <Btn label="Roll drag" go={() => setRoll(r => !r)} on={roll} />
        </View>
        <View style={s.row}>
          <Text style={s.k}>View</Text>
          {Object.entries(VIEWS).map(([k, v]) => <Btn key={k} label={v.label} go={() => setQuat(v.q)} />)}
          <Btn label="Zoom −" go={() => setZoom(z => Math.max(0.15, z - 0.15))} /><Btn label="Zoom +" go={() => setZoom(z => Math.min(5, z + 0.15))} />
        </View>
      </ScrollView>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { flex: 1 }, canvas: { flex: 1, backgroundColor: '#eef1f3' }, bar: { maxHeight: 150 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  t: { color: '#4f6a5b' }, k: { color: '#0a2e1f', fontWeight: '700', minWidth: 70 },
  btn: { borderWidth: 1, borderColor: '#146c43', borderRadius: 8, paddingHorizontal: 11, paddingVertical: 6, backgroundColor: '#fff' }, on: { backgroundColor: '#146c43' }, bt: { color: '#146c43', fontWeight: '600' },
});
