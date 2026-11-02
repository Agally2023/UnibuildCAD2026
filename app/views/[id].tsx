import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Rect, Line, Text as SText } from 'react-native-svg';
import { useLocalSearchParams } from 'expo-router';
import { useModel } from '../../lib/useModel';
import { buildView, modelExtent, VCOL, viewSvg, Side, ViewSpec } from '../../lib/views';
import { saveFile } from '../../components/saveFile';

export default function Views() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { els, lib, stories, loaded } = useModel(id);
  const { width } = useWindowDimensions();
  const ext = useMemo(() => modelExtent(els), [els]);
  const [kind, setKind] = useState<'elevation' | 'section'>('elevation');
  const [side, setSide] = useState<Side>('S');
  const [axis, setAxis] = useState<'x' | 'y'>('y');
  const [flip, setFlip] = useState(false);
  const [pos, setPos] = useState<number | null>(null);
  const mid = axis === 'y' ? (ext.y0 + ext.y1) / 2 : (ext.x0 + ext.x1) / 2;
  const at = pos ?? Math.round(mid * 10) / 10;
  const spec: ViewSpec = kind === 'elevation' ? { kind, side } : { kind, axis, pos: at, flip };
  const v = useMemo(() => buildView(els, lib, stories, spec), [els, lib, stories, kind, side, axis, flip, at]);
  const [msg, setMsg] = useState('');
  const W = Math.min(width - 32, 1000), sc = (W - 70) / Math.max(v.u1 - v.u0, 1), H = (v.zmax - v.zmin) * sc + 20;
  const X = (u: number) => (u - v.u0) * sc + 56, Y = (z: number) => (v.zmax - z) * sc + 10;
  const Chip = ({ on, label, go }: { on: boolean; label: string; go: () => void }) => <Pressable onPress={go} style={[s.chip, on && s.on]}><Text style={[s.ct, on && { color: '#fff' }]}>{label}</Text></Pressable>;
  const save = async () => { try { await saveFile(`${v.title.replace(/[^A-Za-z0-9]+/g, '_')}.svg`, viewSvg(v).svg); setMsg('Saved as SVG'); } catch (e: any) { setMsg('Could not save: ' + (e?.message ?? e)); } };
  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <Text style={s.h1}>Elevations and sections</Text>
      <Text style={s.k}>Drawn from the model. {els.length ? '' : loaded ? 'The model is empty: draw something in the Plan first.' : 'Loading the model…'}</Text>
      <View style={s.row}>
        <Chip on={kind === 'elevation'} label="Elevation" go={() => setKind('elevation')} />
        <Chip on={kind === 'section'} label="Section" go={() => setKind('section')} />
      </View>
      {kind === 'elevation' ? (
        <View style={s.row}>{(['N', 'E', 'S', 'W'] as Side[]).map(x => <Chip key={x} on={side === x} label={{ N: 'North', E: 'East', S: 'South', W: 'West' }[x]} go={() => setSide(x)} />)}</View>
      ) : (
        <View style={s.row}>
          <Chip on={axis === 'y'} label="Cut at Y (looks along Y)" go={() => { setAxis('y'); setPos(null); }} />
          <Chip on={axis === 'x'} label="Cut at X (looks along X)" go={() => { setAxis('x'); setPos(null); }} />
          <Pressable style={s.chip} onPress={() => setPos(Math.round((at - 0.5) * 10) / 10)}><Text style={s.ct}>−0.5 m</Text></Pressable>
          <Text style={s.pos}>{axis.toUpperCase()} = {at.toFixed(1)} m</Text>
          <Pressable style={s.chip} onPress={() => setPos(Math.round((at + 0.5) * 10) / 10)}><Text style={s.ct}>+0.5 m</Text></Pressable>
          <Chip on={flip} label="Flip direction" go={() => setFlip(f => !f)} />
        </View>
      )}
      <Text style={s.h2}>{v.title}</Text>
      <ScrollView horizontal><Svg width={W} height={H} style={s.paper}>
        {v.levels.map(l => <Line key={l.name + l.z} x1={20} x2={W - 10} y1={Y(l.z)} y2={Y(l.z)} stroke="#146c43" strokeWidth={1} strokeDasharray="6 4" />)}
        {v.levels.map(l => <SText key={'t' + l.name + l.z} x={4} y={Y(l.z) - 3} fontSize={10} fill="#146c43">{l.name} {l.z.toFixed(1)}</SText>)}
        {v.shapes.map((p, i) => <Rect key={i} x={X(p.u0)} y={Y(p.z1)} width={Math.max((p.u1 - p.u0) * sc, 1)} height={Math.max((p.z1 - p.z0) * sc, 1)} fill={p.open ? VCOL[p.type] : p.cut ? '#2b3a33' : VCOL[p.type] ?? '#ccc'} stroke="#0a2e1f" strokeWidth={p.cut ? 1.5 : 0.6} />)}
      </Svg></ScrollView>
      <Text style={s.k}>{v.note} Levels are the storey elevations.</Text>
      <Pressable onPress={save}><Text style={s.link}>Download SVG</Text></Pressable>
      {!!msg && <Text style={s.msg}>{msg}</Text>}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  wrap: { padding: 16, gap: 12, maxWidth: 1100 }, h1: { fontSize: 24, fontWeight: '800', color: '#0a2e1f' }, h2: { fontSize: 16, fontWeight: '700', color: '#146c43' },
  k: { color: '#4f6a5b' }, msg: { color: '#146c43' }, link: { color: '#146c43', fontWeight: '700' }, row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: '#146c43', backgroundColor: '#fff' }, on: { backgroundColor: '#146c43' }, ct: { color: '#146c43', fontWeight: '600' },
  pos: { fontWeight: '700', color: '#0a2e1f' }, paper: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cfdcd4' },
});
