import { useEffect, useMemo, useState } from 'react';
import { cname, cube } from '../../lib/rc';
import { dsn, setDsn } from '../../lib/settings';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useModel } from '../../lib/useModel';
import { groupByStory } from '../../lib/model';
import { CLASSES, designAll, Status } from '../../lib/design';
import { designFoundations } from '../../lib/slabfound';
import { buildReport } from '../../lib/report';
import { saveFile } from '../../components/saveFile';

const IMPOSED = [['Residential', 2], ['Office', 3], ['Laboratory', 4]] as const;
const COL: Record<Status, string> = { ok: '#1a8f4d', warn: '#c4620a', bad: '#c62828' };
const n0 = (x: number) => Math.round(x).toLocaleString('en-US');

export default function Design() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { els, lib, stories } = useModel(id);
  const [code, setCode] = useState<'EC2' | 'BS8110'>(dsn.code);
  const [cls, setCls] = useState(dsn.cls);
  const [use, setUse] = useState(dsn.use);
  const [trib, setTrib] = useState(dsn.trib);
  useEffect(() => { setDsn({ code, cls, use, trib }); }, [code, cls, use, trib]);
  const [msg, setMsg] = useState('');
  const fck = CLASSES[cls], mat = { fck, fyk: code === 'BS8110' ? 460 : 500, code };
  const groups = useMemo(() => groupByStory(els, stories), [els, stories]);
  const r = useMemo(() => designAll(groups, lib, mat, { imposed: IMPOSED[use][1], defaultTrib: trib }), [groups, lib, fck, use, trib, code]);

  const report = async () => {
    try {
      const { data: pr } = await supabase.from('projects').select('name').eq('id', id).single();
      const sf = designFoundations(groups, lib, mat, { imposed: IMPOSED[use][1], defaultTrib: trib, qAllow: 150 });
      const name = pr?.name ?? 'Unibuild';
      await saveFile(`${name.replace(/[^A-Za-z0-9_-]+/g, '_')}-calculation-report.md`, buildReport({ project: name, mat, imposed: IMPOSED[use][1], defaultTrib: trib, qAllow: 150, design: r, sf }));
      setMsg('Report exported');
    } catch (e: any) { setMsg('Export failed: ' + (e?.message ?? e)); }
  };
  const save = async () => {
    const { error } = await supabase.from('snapshots').insert({ project_id: id, label: `${code === 'BS8110' ? 'BS 8110' : 'EC2'} design ${cname(fck)}`, summary: { kind: 'design', code: code === 'BS8110' ? 'BS 8110-1' : 'EN 1992-1-1', fck, storeys: groups.length, tribWidth: trib, steel_t: r.steelT, beams: r.beams.length, columns: r.cols.length, cost: { total: 0 } } });
    setMsg(error ? error.message : 'Design summary saved');
  };

  const Step = ({ label, value, dec, inc }: { label: string; value: string; dec: () => void; inc: () => void }) => (
    <View style={s.step}><Text style={s.k}>{label}</Text><Pressable onPress={dec}><Text style={s.btn}>−</Text></Pressable><Text style={s.v}>{value}</Text><Pressable onPress={inc}><Text style={s.btn}>+</Text></Pressable></View>
  );
  const Card = ({ title, status, rows, notes }: { title: string; status: Status; rows: [string, string][]; notes: string[] }) => (
    <View style={[s.card, { borderLeftColor: COL[status] }]}>
      <Text style={s.h}>{title}</Text>
      {rows.map(([k, v]) => <View key={k} style={s.row}><Text style={s.k}>{k}</Text><Text style={s.v}>{v}</Text></View>)}
      {notes.map(n => <Text key={n} style={{ color: COL[status], marginTop: 4 }}>{n}</Text>)}
    </View>
  );

  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <View style={s.step}>
        {([['EC2', 'Eurocode 2'], ['BS8110', 'BS 8110']] as const).map(([k, l]) => <Pressable key={k} onPress={() => setCode(k)} style={[s.chip, code === k && s.chipOn]}><Text style={[s.chipT, code === k && { color: '#fff' }]}>{l}</Text></Pressable>)}
      </View>
      <Step label="Concrete" value={`${cname(fck)}${code === 'BS8110' ? ` (fcu ${cube(fck)})` : ''}`} dec={() => setCls(c => Math.max(0, c - 1))} inc={() => setCls(c => Math.min(CLASSES.length - 1, c + 1))} />
      <Step label="Use" value={`${IMPOSED[use][0]} ${IMPOSED[use][1]} kN/m²`} dec={() => setUse(u => Math.max(0, u - 1))} inc={() => setUse(u => Math.min(2, u + 1))} />
      <Step label="Default tributary width" value={`${trib.toFixed(1)} m`} dec={() => setTrib(v => Math.max(1, v - 0.5))} inc={() => setTrib(v => Math.min(9, v + 0.5))} />
      <Text style={s.k}>{groups.length} storey{groups.length > 1 ? 's' : ''} · tributary widths come from the beam layout (the default is used for beams with no parallel neighbour) · reinforcement about {r.steelT.toFixed(2)} t</Text>

      <Text style={s.t}>Beams ({r.beams.length})</Text>
      {!r.beams.length && <Text style={s.k}>No beams drawn yet.</Text>}
      {r.beams.map((b, i) => (
        <Card key={b.id} title={`Beam ${i + 1}${b.story ? ` · ${b.story}` : ''}: ${b.b}×${b.h} mm, span ${b.L.toFixed(1)} m`} status={b.status} notes={b.notes}
          rows={[['Tributary / load', `${b.trib.toFixed(1)} m / ${b.w.toFixed(1)} kN/m`], ['Sagging / hogging', `${n0(b.MEd)} / ${n0(b.Mhog)} kNm`], ['Shear', `${n0(b.VEd)} kN`], ['Bottom / top bars', `${b.bars} / ${b.topBars}`], ['Links', b.links], ['Deflection / limit', b.defl ? (b.defl.limit ? `${b.defl.delta.toFixed(1)} / ${b.defl.limit.toFixed(0)} mm` : `L/d ${b.defl.ld.toFixed(1)} / ${b.defl.ldAllowed.toFixed(1)}`) : '-'], ['Crack width / limit', b.crack ? `${b.crack.wk.toFixed(2)} / ${b.crack.limit} mm` : '-']]} />
      ))}
      <Text style={s.t}>Columns ({r.cols.length})</Text>
      {!r.cols.length && <Text style={s.k}>No columns drawn yet.</Text>}
      {r.cols.map((c, i) => (
        <Card key={c.id} title={`Column ${i + 1}${c.story ? ` · ${c.story}` : ''}: ${c.b}×${c.h} mm`} status={c.status} notes={c.notes}
          rows={[['Axial load / moment', `${n0(c.NEd)} kN / ${n0(c.MEd)} kNm`], ['Steel required / provided', `${n0(c.AsReq)} / ${n0(c.AsProv)} mm²`], ['Vertical bars', c.bars], ['Links', c.links]]} />
      ))}
      <Pressable style={s.save} onPress={report}><Text style={s.sb}>Export calculation report (Markdown)</Text></Pressable>
      <Pressable style={[s.save, s.alt]} onPress={save}><Text style={[s.sb, { color: '#146c43' }]}>Save design summary to project</Text></Pressable>
      {!!msg && <Text style={s.k}>{msg}</Text>}
      <Text style={s.note}>{code === 'BS8110' ? 'BS 8110-1 preliminary design (1.4Gk + 1.6Qk, cube strength, fy 460 MPa, deflection by span/depth).' : 'Eurocode 2 preliminary design.'} Beams use continuous-beam analysis with load patterns; columns carry load from every storey above. Frame action on columns, lateral loads, deflection, crack width and detailing rules are not included. Not for construction without a registered engineer's review.</Text>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  wrap: { padding: 16, gap: 10, maxWidth: 720, width: '100%', alignSelf: 'center' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 }, chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#146c43' }, chipOn: { backgroundColor: '#146c43' }, chipT: { color: '#146c43', fontWeight: '600' }, btn: { fontSize: 24, color: '#146c43', paddingHorizontal: 10 },
  t: { fontSize: 20, fontWeight: '700', marginTop: 8 },
  card: { borderWidth: 1, borderColor: '#cfdcd4', borderLeftWidth: 5, borderRadius: 8, padding: 12 }, h: { fontWeight: '700', fontSize: 16, marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, gap: 8 }, k: { color: '#4f6a5b', flexShrink: 1 }, v: { fontWeight: '600', textAlign: 'right', flexShrink: 1 },
  save: { backgroundColor: '#146c43', padding: 14, borderRadius: 8, alignItems: 'center' }, alt: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#146c43' }, sb: { color: '#fff', fontWeight: '600' },
  note: { color: '#4f6a5b', fontSize: 12, marginTop: 8 },
});
