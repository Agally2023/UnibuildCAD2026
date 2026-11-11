import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { FINISHES, PARTS, finishById, finishesOf, groupsOf, type Finish, type Part } from '../lib/finishes';
import { MAT } from '../lib/materials';
import { swatchUrl } from '../lib/textures';

export type Scope = 'sel' | 'storey' | 'all';
// Material chooser: pick the part (floor, wall, roof ...), then a finish; it is applied to the selection, this storey or the whole project.
export default function FinishPanel({ selTypes, activeIds, storeyName, onApply, note }: { selTypes: string[]; activeIds: string[]; storeyName: string; onApply: (f: Finish, scope: Scope) => void; note?: string }) {
  const [part, setPart] = useState<Part>('wall'), [scope, setScope] = useState<Scope>('sel');
  useEffect(() => { const p = PARTS.find(x => selTypes.includes(x.types[0]) || x.types.some(t => selTypes.includes(t))); if (p) setPart(p.key); }, [selTypes.join(',')]);
  const list = finishesOf(part), groups = groupsOf(part);
  return (
    <View style={{ gap: 8 }} testID="finish-panel">
      <Text style={s.k}>Apply to</Text>
      <View style={s.row}>{([['sel', selTypes.length ? `Selected (${selTypes.length})` : 'Selected'], ['storey', storeyName], ['all', 'Whole project']] as [Scope, string][]).map(([k, l]) => <Pressable key={k} testID={`fscope-${k}`} onPress={() => setScope(k)} style={[s.chip, scope === k && s.on]}><Text style={[s.ct, scope === k && s.cto]} numberOfLines={1}>{l}</Text></Pressable>)}</View>
      <View style={s.row}>{PARTS.map(p => <Pressable key={p.key} testID={`fpart-${p.key}`} onPress={() => setPart(p.key)} style={[s.chip, part === p.key && s.on]}><Text style={[s.ct, part === p.key && s.cto]}>{p.icon} {p.label}</Text></Pressable>)}</View>
      {note ? <Text style={s.note}>{note}</Text> : null}
      {groups.map(g => (
        <View key={g} style={{ gap: 4 }}>
          <Text style={s.k}>{g}</Text>
          <View style={s.grid}>{list.filter(f => f.group === g).map(f => {
            const tex = MAT[f.kind].tex, url = Platform.OS === 'web' && tex ? swatchUrl(tex) : '';
            const sw: any = { backgroundColor: f.color, ...(url ? { backgroundImage: `url(${url})`, backgroundBlendMode: 'multiply', backgroundSize: '44px 44px' } : {}) };
            return (
              <Pressable key={f.id} testID={`finish-${f.id}`} onPress={() => onApply(f, scope)} style={[s.cell, activeIds.includes(f.id) && s.cellOn]}>
                <View style={[s.sw, sw]} />
                <Text style={s.cl} numberOfLines={2}>{f.label}</Text>
              </Pressable>
            );
          })}</View>
        </View>
      ))}
    </View>
  );
}
export const FINISH_COUNT = FINISHES.length;
export { finishById };
const s = StyleSheet.create({
  k: { fontSize: 11, color: '#5b6b63', fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip: { paddingVertical: 5, paddingHorizontal: 8, borderRadius: 14, backgroundColor: '#e3ece7' },
  on: { backgroundColor: '#146c43' }, ct: { fontSize: 11, color: '#264a39', fontWeight: '700' }, cto: { color: '#fff' },
  note: { fontSize: 11, color: '#8a5a00' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: { width: 62, alignItems: 'center', gap: 3, padding: 3, borderRadius: 8, borderWidth: 2, borderColor: 'transparent' },
  cellOn: { borderColor: '#146c43', backgroundColor: '#e6f3ec' },
  sw: { width: 52, height: 40, borderRadius: 6, borderWidth: 1, borderColor: '#0002' },
  cl: { fontSize: 9.5, color: '#264a39', textAlign: 'center', lineHeight: 11 },
});
