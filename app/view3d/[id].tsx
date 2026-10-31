import { useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, PanResponder, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useModel } from '../../lib/useModel';
import { groupByStory, planBox } from '../../lib/model';
import Scene from '../../components/Scene';

export default function View3D() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { els, lib, stories } = useModel(id);
  const [rotY, setRotY] = useState(0.6);
  const [zoom, setZoom] = useState(1);
  const last = useRef(0);
  const libMap = useMemo(() => Object.fromEntries(lib.map(l => [l.id, l])), [lib]);
  const groups = useMemo(() => groupByStory(els, stories), [els, stories]);
  // one shared centre so the storeys stack on top of each other
  const { center, extent } = useMemo(() => {
    const xs: number[] = [], ys: number[] = [];
    for (const e of els) { const g = e.geometry; if (g.start) { xs.push(g.start[0], g.end[0]); ys.push(g.start[1], g.end[1]); } if (g.at) { xs.push(g.at[0]); ys.push(g.at[1]); } if (g.rect) { xs.push(g.rect[0], g.rect[2]); ys.push(g.rect[1], g.rect[3]); } }
    if (!xs.length) return { center: [0, 0] as [number, number], extent: 10 };
    return { center: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2] as [number, number], extent: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 6) };
  }, [els]);
  const scene = useMemo(() => groups.map(g => ({ id: g.story.id, elevation: g.story.elevation_m, height: g.story.height_m, els: g.els })), [groups]);

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { last.current = 0; },
    onPanResponderMove: (_e, g) => { setRotY(r => r + (g.dx - last.current) * 0.01); last.current = g.dx; },
  }), []);

  return (
    <View style={s.wrap}>
      <View style={s.canvas} {...pan.panHandlers}><Scene stories={scene} lib={libMap} center={center} extent={extent} rotY={rotY} zoom={zoom} /></View>
      <View style={s.bar}>
        <Text style={s.t}>{els.length} elements · {groups.length} storey{groups.length > 1 ? 's' : ''} · drag to rotate</Text>
        <Pressable onPress={() => setZoom(z => Math.max(0.2, z - 0.15))}><Text style={s.l}>Zoom out</Text></Pressable>
        <Pressable onPress={() => setZoom(z => Math.min(4, z + 0.15))}><Text style={s.l}>Zoom in</Text></Pressable>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { flex: 1 }, canvas: { flex: 1, backgroundColor: '#eef1f3' },
  bar: { flexDirection: 'row', gap: 16, padding: 12, alignItems: 'center' },
  t: { flex: 1, color: '#5b6b75' }, l: { color: '#2f5bea', fontWeight: '600' },
});
