// Paper and canvas size picker used wherever a design can be printed or saved as PDF.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CUSTOM, MARGINS, Orient, PAPERS, PAPER_GROUPS, PageSetup, paperLabel } from '../lib/paper';

type Props = { setup: PageSetup; set: (s: PageSetup) => void; margins?: boolean; testID?: string };
export default function PrintOptions({ setup, set, margins = true, testID }: Props) {
  const [inch, setInch] = useState(false);
  const k = inch ? 25.4 : 1, num = (v: number) => String(Math.round((v / k) * 100) / 100);
  const Chip = ({ on, label, go, id }: { on: boolean; label: string; go: () => void; id?: string }) => <Pressable testID={id} onPress={go} style={[s.chip, on && s.on]}><Text style={[s.ct, on && { color: '#fff' }]}>{label}</Text></Pressable>;
  const setC = (i: 0 | 1, t: string) => { const v = parseFloat(t.replace(',', '.')); const c: [number, number] = [...setup.custom]; c[i] = isNaN(v) ? 0 : v * k; set({ ...setup, custom: c }); };
  return (
    <View style={s.wrap} testID={testID}>
      {PAPER_GROUPS.map(g => (
        <View key={g} style={s.grp}><Text style={s.gl}>{g}</Text>
          <View style={s.row}>{PAPERS.filter(p => p.group === g).map(p => <Chip key={p.key} id={`paper-${p.key}`} on={setup.key === p.key} label={p.label} go={() => set({ ...setup, key: p.key })} />)}</View>
        </View>
      ))}
      <View style={s.grp}><Text style={s.gl}>Custom size</Text>
        <View style={s.row}>
          <Chip id="paper-custom" on={setup.key === CUSTOM} label="Custom" go={() => set({ ...setup, key: CUSTOM })} />
          <TextInput testID="custom-w" style={s.in} value={num(setup.custom[0])} onChangeText={t => setC(0, t)} keyboardType="numeric" onFocus={() => set({ ...setup, key: CUSTOM })} />
          <Text style={s.ct}>×</Text>
          <TextInput testID="custom-h" style={s.in} value={num(setup.custom[1])} onChangeText={t => setC(1, t)} keyboardType="numeric" onFocus={() => set({ ...setup, key: CUSTOM })} />
          <Chip on={!inch} label="mm" go={() => setInch(false)} /><Chip on={inch} label="inch" go={() => setInch(true)} />
        </View>
      </View>
      <View style={s.grp}><Text style={s.gl}>Orientation</Text>
        <View style={s.row}>{(['landscape', 'portrait'] as Orient[]).map(o => <Chip key={o} id={`orient-${o}`} on={setup.orient === o} label={o === 'landscape' ? 'Landscape' : 'Portrait'} go={() => set({ ...setup, orient: o })} />)}</View>
      </View>
      {margins && <View style={s.grp}><Text style={s.gl}>Margin</Text><View style={s.row}>{MARGINS.map(m => <Chip key={m} on={setup.margin === m} label={m ? `${m} mm` : 'None'} go={() => set({ ...setup, margin: m })} />)}</View></View>}
      <Text style={s.sum} testID="paper-summary">{paperLabel(setup)}</Text>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { gap: 8 }, grp: { gap: 4 }, gl: { fontSize: 12, fontWeight: '700', color: '#146c43' }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, borderWidth: 1, borderColor: '#146c43', backgroundColor: '#fff' }, on: { backgroundColor: '#146c43' }, ct: { color: '#146c43', fontWeight: '600', fontSize: 13 },
  in: { borderWidth: 1, borderColor: '#cfdcd4', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, width: 76, backgroundColor: '#fff' },
  sum: { color: '#0a2e1f', fontWeight: '700' },
});
