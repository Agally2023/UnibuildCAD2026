import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useModel } from '../../lib/useModel';
import { buildSchedules, schedulesCsv } from '../../lib/schedules';
import { saveFile } from '../../components/saveFile';
import { supabase } from '../../lib/supabase';

export default function Schedules() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { els, lib, stories, loaded } = useModel(id);
  const [msg, setMsg] = useState('');
  const tables = useMemo(() => buildSchedules(els, lib, stories), [els, lib, stories]);
  const save = async () => {
    try { const { data } = await supabase.from('projects').select('name').eq('id', id).single(); await saveFile(`${(data?.name ?? 'Unibuild').replace(/[^A-Za-z0-9_-]+/g, '_')}-schedules.csv`, schedulesCsv(tables)); setMsg('Schedules saved as CSV (opens in Excel)'); }
    catch (e: any) { setMsg('Could not save: ' + (e?.message ?? e)); }
  };
  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <View style={s.top}><Text style={s.h1}>Schedules</Text><Pressable onPress={save}><Text style={s.link}>Download CSV</Text></Pressable></View>
      <Text style={s.k}>Built from the model as it is now: doors and windows with marks, walls, columns, beams, slabs and roofs, rooms, stairs, services and concrete volumes. {els.length ? '' : loaded ? 'The model is empty: draw something in the Plan first.' : 'Loading the model…'}</Text>
      {!!msg && <Text style={s.msg}>{msg}</Text>}
      {tables.map(t => (
        <View key={t.id} style={{ gap: 6 }}>
          <Text style={s.h2}>{t.title}</Text>
          {!!t.note && <Text style={s.k}>{t.note}</Text>}
          <ScrollView horizontal><View style={s.table}>
            <View style={[s.tr, s.th]}>{t.head.map((h, i) => <Text key={i} style={[s.td, s.thT, i === 0 && s.c0]}>{h}</Text>)}</View>
            {t.rows.length ? t.rows.map((r, n) => <View key={n} style={[s.tr, n % 2 ? s.alt : null]}>{r.map((c, i) => <Text key={i} style={[s.td, i === 0 && s.c0, i === 0 && s.b]}>{String(c)}</Text>)}</View>) : <Text style={[s.td, { color: '#4f6a5b' }]}>None drawn yet.</Text>}
            {t.foot && t.rows.length > 0 && <View style={[s.tr, s.ft]}>{t.foot.map((c, i) => <Text key={i} style={[s.td, s.b, i === 0 && s.c0]}>{String(c)}</Text>)}</View>}
          </View></ScrollView>
        </View>
      ))}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  wrap: { padding: 16, gap: 14, maxWidth: 1100 }, top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h1: { fontSize: 24, fontWeight: '800', color: '#0a2e1f' }, h2: { fontSize: 16, fontWeight: '700', color: '#146c43' }, k: { color: '#4f6a5b' }, msg: { color: '#146c43' }, link: { color: '#146c43', fontWeight: '700' },
  table: { borderWidth: 1, borderColor: '#cfdcd4', borderRadius: 8, overflow: 'hidden', minWidth: 320 }, tr: { flexDirection: 'row' },
  th: { backgroundColor: '#146c43' }, thT: { color: '#fff', fontWeight: '700' }, alt: { backgroundColor: '#f4f9f6' }, ft: { backgroundColor: '#e2eee7' },
  td: { padding: 8, fontSize: 13, minWidth: 92, color: '#1d2b24' }, c0: { minWidth: 120 }, b: { fontWeight: '700' },
});
