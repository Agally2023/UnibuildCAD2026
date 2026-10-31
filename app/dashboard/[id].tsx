import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useModel } from '../../lib/useModel';
import { analyse, Use } from '../../lib/engineering';

const USES: Use[] = ['office', 'resi', 'lab'];
const NAMES = { office: 'Office', resi: 'Residential', lab: 'Laboratory' };
const COL = { ok: '#1a8f4d', warn: '#c4620a', bad: '#c62828' };
const n0 = (x: number) => Math.round(x).toLocaleString('en-US');
const n1 = (x: number) => x.toFixed(1);
const M = (x: number) => (x / 1e6).toFixed(1) + ' M';

export default function Dashboard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { els, lib, stories } = useModel(id);
  const [use, setUse] = useState<Use>('office');
  const [msg, setMsg] = useState('');
  const a = useMemo(() => analyse(els, lib, use, stories), [els, lib, use, stories]);
  const t = a.cost.total || 1;

  const save = async () => {
    const { error } = await supabase.from('snapshots').insert({
      project_id: id, label: `${NAMES[use]}, ${a.storeys} storey${a.storeys > 1 ? 's' : ''}`,
      summary: { use, storeys: a.storeys, cost: a.cost, gfa: a.arch.GFA, concrete: a.struct.conc, cooling_kw: a.mep.cool, kva: a.mep.kva },
    });
    setMsg(error ? error.message : 'Snapshot saved');
  };
  const Card = ({ title, c, rows }: { title: string; c: string; rows: [string, string][] }) => (
    <View style={[s.card, { borderTopColor: c }]}>
      <Text style={[s.h, { color: c }]}>{title}</Text>
      {rows.map(([k, v]) => <View key={k} style={s.row}><Text style={s.k}>{k}</Text><Text style={s.v}>{v}</Text></View>)}
    </View>
  );

  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <View style={s.ctl}>
        {USES.map(u => <Pressable key={u} onPress={() => setUse(u)} style={[s.chip, use === u && s.chipOn]}><Text style={[s.chipT, use === u && { color: '#fff' }]}>{NAMES[u]}</Text></Pressable>)}
      </View>
      <Text style={s.k}>{a.storeys} storey{a.storeys > 1 ? 's' : ''} · {els.length} elements. Add storeys on the plan with "+ Storey" or "Copy up".</Text>
      <Text style={s.total}>KES {M(a.cost.total)}</Text>
      <View style={s.bar}>
        <View style={{ flex: a.cost.struct / t, backgroundColor: '#c98a00' }} /><View style={{ flex: a.cost.arch / t, backgroundColor: '#2f5bea' }} /><View style={{ flex: a.cost.mep / t, backgroundColor: '#0c9a87' }} />
      </View>
      <Text style={s.k}>Structure {M(a.cost.struct)} · Architecture {M(a.cost.arch)} · MEP {M(a.cost.mep)}{a.arch.GFA ? ` · KES ${n0(a.cost.total / a.arch.GFA)}/m²` : ''}</Text>
      <Card title="Architecture" c="#2f5bea" rows={[['Gross floor area', n0(a.arch.GFA) + ' m²'], ['Wall length', n1(a.arch.wallLen) + ' m'], ['Wall area (net)', n0(a.arch.wallArea) + ' m²'], ['Doors / windows', `${a.arch.doors} / ${a.arch.windows}`], ['Glazing', n1(a.arch.winArea) + ' m²']]} />
      <Card title="Structure" c="#c98a00" rows={[['Columns / beams', `${a.struct.cols} / ${a.struct.beams}`], ['Concrete', n1(a.struct.conc) + ' m³'], ['Reinforcement (estimate)', n1(a.struct.steel) + ' t'], ['Reinforcement (from design)', n1(a.struct.designSteelT) + ' t'], ['Heaviest column load', n0(a.struct.axial) + ' kN']]} />
      <Card title="MEP" c="#0c9a87" rows={[['Cooling load', `${n0(a.mep.cool)} kW (${n0(a.mep.tr)} TR)`], ['Supply air', n1(a.mep.air) + ' m³/s'], ['Electrical demand', n0(a.mep.kva) + ' kVA'], ['Transformer', a.mep.trafo + ' kVA'], ['Water demand', n1(a.mep.water) + ' m³/day']]} />
      <View style={[s.card, { borderTopColor: '#16232b' }]}>
        <Text style={s.h}>Cross-discipline checks</Text>
        {a.checks.map((c, i) => <View key={i} style={s.chk}><View style={[s.dot, { backgroundColor: COL[c.level] }]} /><Text style={{ flex: 1 }}>{c.text}</Text></View>)}
      </View>
      <Pressable style={s.save} onPress={save}><Text style={{ color: '#fff', fontWeight: '600' }}>Save snapshot to project</Text></Pressable>
      {!!msg && <Text style={s.k}>{msg}</Text>}
      <Text style={s.note}>Preliminary estimates: simplified loads, EC2-style sizing, placeholder unit rates. Not for construction.</Text>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  wrap: { padding: 16, gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center' },
  ctl: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#2f5bea' }, chipOn: { backgroundColor: '#2f5bea' }, chipT: { color: '#2f5bea', fontWeight: '600' },
  total: { fontSize: 32, fontWeight: '700' }, bar: { flexDirection: 'row', height: 20, borderRadius: 5, overflow: 'hidden' },
  card: { borderWidth: 1, borderColor: '#d5dce1', borderTopWidth: 4, borderRadius: 10, padding: 14 }, h: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }, k: { color: '#5b6b75' }, v: { fontWeight: '600' },
  chk: { flexDirection: 'row', gap: 10, paddingVertical: 5 }, dot: { width: 11, height: 11, borderRadius: 6, marginTop: 5 },
  save: { backgroundColor: '#2f5bea', padding: 14, borderRadius: 8, alignItems: 'center' }, note: { color: '#5b6b75', fontSize: 12, marginTop: 8 },
});
