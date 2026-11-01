import { useEffect, useMemo, useState } from 'react';
import { cname } from '../../lib/rc';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useModel } from '../../lib/useModel';
import { groupByStory } from '../../lib/model';
import { CLASSES, designAll, Status } from '../../lib/design';
import { lateralAnalysis, TERRAIN_NAMES } from '../../lib/lateral';
import { lat, setLat, dsn, setDsn } from '../../lib/settings';
import { buildLateralReport } from '../../lib/report';
import { saveFile } from '../../components/saveFile';

const IMPOSED = [['Residential', 2], ['Office', 3], ['Laboratory', 4]] as const;
const GROUNDS = ['A', 'B', 'C', 'D', 'E'] as const;
const COL: Record<Status, string> = { ok: '#1a8f4d', warn: '#c4620a', bad: '#c62828' };
const n0 = (x: number) => Math.round(x).toLocaleString('en-US');

export default function Lateral() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { els, lib, stories } = useModel(id);
  const [code, setCode] = useState<'EC2' | 'BS8110'>(dsn.code);
  const [cls, setCls] = useState(dsn.cls);
  const [use, setUse] = useState(dsn.use);
  const [wind, setWind] = useState(lat.wind);
  const [vb, setVb] = useState(lat.vb);
  const [terrain, setTerrain] = useState(lat.terrain);
  const [seis, setSeis] = useState(lat.seis);
  const [ag, setAg] = useState(lat.ag);
  const [ground, setGround] = useState(lat.ground);
  const [q, setQ] = useState(lat.q);
  const [base, setBase] = useState<'fixed' | 'pinned'>(lat.base);
  useEffect(() => { setLat({ wind, vb, terrain, seis, ag, ground, q, base }); }, [wind, vb, terrain, seis, ag, ground, q, base]);
  useEffect(() => { setDsn({ code, cls, use }); }, [code, cls, use]);
  const [msg, setMsg] = useState('');

  const fck = CLASSES[cls], mat = { fck, fyk: code === 'BS8110' ? 460 : 500, code } as const;
  const groups = useMemo(() => groupByStory(els, stories), [els, stories]);
  const input = useMemo(() => ({ imposed: IMPOSED[use][1], wind: wind ? { vb, terrain: terrain as 0 | 1 | 2 | 3 | 4 } : undefined, seismic: seis ? { agG: ag, ground: GROUNDS[ground], q, psi2: 0.3 } : undefined, base }), [use, wind, vb, terrain, seis, ag, ground, q, base]);
  const r = useMemo(() => {
    if (!els.some(e => e.type === 'column')) return null;
    const grav = designAll(groups, lib, mat, { imposed: input.imposed, defaultTrib: 3 });
    return lateralAnalysis(groups, lib, mat, grav, input);
  }, [groups, lib, fck, code, input]);

  const report = async () => {
    if (!r) return;
    const { data: pr } = await supabase.from('projects').select('name').eq('id', id).single(), name = pr?.name ?? 'Unibuild';
    await saveFile(`${name.replace(/[^A-Za-z0-9_-]+/g, '_')}-lateral-report.md`, buildLateralReport({ project: name, mat, input, result: r }));
    setMsg('Report exported');
  };
  const save = async () => {
    if (!r) return;
    const { error } = await supabase.from('snapshots').insert({ project_id: id, label: `Lateral loads (${code === 'BS8110' ? 'BS 8110' : 'EC2'})`, summary: { kind: 'lateral', wind: input.wind ?? null, seismic: input.seismic ?? null, cases: r.cases.map(c => ({ name: c.name, baseShear: c.baseShear, maxDriftRatio: c.maxRatio, stability: c.stability })), cost: { total: 0 } } });
    setMsg(error ? error.message : 'Saved to the project');
  };

  const Step = ({ label, value, dec, inc }: { label: string; value: string; dec: () => void; inc: () => void }) => (
    <View style={s.step}><Text style={s.k}>{label}</Text><Pressable onPress={dec}><Text style={s.btn}>−</Text></Pressable><Text style={s.v}>{value}</Text><Pressable onPress={inc}><Text style={s.btn}>+</Text></Pressable></View>
  );
  const flagged = (r?.columns ?? []).slice().sort((a, b) => b.util - a.util).slice(0, 12);
  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <View style={s.step}>
        {([['EC2', 'Eurocode 2'], ['BS8110', 'BS 8110']] as const).map(([k, l]) => <Pressable key={k} onPress={() => setCode(k)} style={[s.chip, code === k && s.chipOn]}><Text style={[s.chipT, code === k && { color: '#fff' }]}>{l}</Text></Pressable>)}
      </View>
      <Step label="Concrete" value={`${cname(fck)}`} dec={() => setCls(c => Math.max(0, c - 1))} inc={() => setCls(c => Math.min(CLASSES.length - 1, c + 1))} />
      <Step label="Use" value={`${IMPOSED[use][0]} ${IMPOSED[use][1]} kN/m²`} dec={() => setUse(u => Math.max(0, u - 1))} inc={() => setUse(u => Math.min(2, u + 1))} />
      <Pressable onPress={() => setWind(w => !w)}><Text style={s.l}>{wind ? '✓ ' : '○ '}Wind (EN 1991-1-4)</Text></Pressable>
      {wind && <>
        <Step label="Basic wind speed" value={`${vb} m/s`} dec={() => setVb(v => Math.max(15, v - 1))} inc={() => setVb(v => Math.min(50, v + 1))} />
        <Step label="Terrain" value={TERRAIN_NAMES[terrain]} dec={() => setTerrain(v => Math.max(0, v - 1))} inc={() => setTerrain(v => Math.min(4, v + 1))} />
      </>}
      <Pressable onPress={() => setSeis(w => !w)}><Text style={s.l}>{seis ? '✓ ' : '○ '}Earthquake (EN 1998-1, equivalent static)</Text></Pressable>
      {seis && <>
        <Step label="Design ground accel. ag/g" value={ag.toFixed(2)} dec={() => setAg(v => Math.max(0, +(v - 0.02).toFixed(2)))} inc={() => setAg(v => Math.min(0.5, +(v + 0.02).toFixed(2)))} />
        <Step label="Ground type" value={GROUNDS[ground]} dec={() => setGround(v => Math.max(0, v - 1))} inc={() => setGround(v => Math.min(4, v + 1))} />
        <Step label="Behaviour factor q" value={q.toFixed(1)} dec={() => setQ(v => Math.max(1.5, +(v - 0.5).toFixed(1)))} inc={() => setQ(v => Math.min(4, +(v + 0.5).toFixed(1)))} />
      </>}
      <Pressable onPress={() => setBase(b => (b === 'fixed' ? 'pinned' : 'fixed'))}><Text style={s.l}>Ground-storey column bases: {base === 'fixed' ? 'fixed (ground beams or a raft restrain rotation)' : 'pinned (isolated pads, no base moment)'} · tap to change</Text></Pressable>
      <Text style={s.warn}>The wind speed and ground acceleration shown are placeholders. Enter the values for your site from the national wind map and seismic hazard map.</Text>
      {!r && <Text style={s.k}>Draw columns (and ideally beams and several storeys) on the plan first.</Text>}
      {r && <>
        {r.cases.map(c => (
          <View key={c.name} style={[s.card, { borderLeftColor: COL[c.status] }]}>
            <Text style={s.h}>{c.name}</Text>
            {([['Base shear', `${n0(c.baseShear)} kN`], ['Base overturning moment', `${n0(c.baseMoment)} kNm`], ['Worst inter-storey drift', `h/${n0(1 / Math.max(c.maxRatio, 1e-9))} (limit ${c.limitText})`], ['Top drift', `${(c.topDrift * 1000).toFixed(1)} mm`], ['Overturning stability ratio', c.stability.toFixed(2)]] as [string, string][]).map(([k, v]) => <View key={k} style={s.row}><Text style={s.k}>{k}</Text><Text style={s.v}>{v}</Text></View>)}
            {c.stability < 1 && <Text style={{ color: COL.bad }}>Overturning: the building weight does not resist the moment: tie-downs or a wider plan are needed.</Text>}
            {c.forces.map((f, k) => <Text key={k} style={s.k}>{r.storeys[k].name}: force {f.toFixed(1)} kN, shear {c.shears[k].toFixed(0)} kN, drift h/{n0(1 / Math.max(c.driftRatio[k], 1e-9))}</Text>)}
          </View>
        ))}
        {r.wind && <Text style={s.k}>Wind: peak pressure at the top {Math.round(r.wind.qpTop)} Pa, net force coefficients {r.wind.cf.x.toFixed(2)} (along x) and {r.wind.cf.y.toFixed(2)} (along y).</Text>}
        {r.seismic && <Text style={s.k}>Earthquake: T1 = {r.seismic.T1.toFixed(2)} s, Sd = {r.seismic.Sd.toFixed(3)} g, base shear {n0(r.seismic.Fb)} kN on a seismic weight of {n0(r.seismic.W)} kN.</Text>}
        <Text style={s.t}>Columns under lateral combinations</Text>
        {flagged.map(c => (
          <View key={c.id} style={[s.card, { borderLeftColor: COL[c.status] }]}>
            <Text style={s.h}>{c.story}: {c.b}×{c.h} mm column</Text>
            {([['Governing case', c.combo], ['N / Mx / My', `${n0(c.N)} kN / ${n0(c.Mx)} / ${n0(c.My)} kNm`], ['Utilisation at the gravity steel', c.util.toFixed(2)], ['Steel needed / gravity design', `${n0(c.AsReq)} / ${n0(c.AsProv)} mm² (${c.bars})`]] as [string, string][]).map(([k, v]) => <View key={k} style={s.row}><Text style={s.k}>{k}</Text><Text style={s.v}>{v}</Text></View>)}
            {c.notes.map(n => <Text key={n} style={{ color: COL[c.status] }}>{n}</Text>)}
          </View>
        ))}
        {r.notes.map(n => <Text key={n} style={s.k}>{n}</Text>)}
        <Pressable style={s.save} onPress={report}><Text style={s.sb}>Export lateral-load report (Markdown)</Text></Pressable>
        <Pressable style={[s.save, s.alt]} onPress={save}><Text style={[s.sb, { color: '#146c43' }]}>Save results to project</Text></Pressable>
      </>}
      {!!msg && <Text style={s.k}>{msg}</Text>}
      <Text style={s.note}>Shear-building model: rigid floors, D-value (Muto) column stiffness with cracked sections (0.5 EI), inflection at mid-height (0.65 h at the base), ±5% accidental torsion, overturning axial forces from the column group. Walls and cores are not counted as lateral elements. Wind uses EN 1991-1-4 pressures and net D + E coefficients; earthquake uses the EN 1998-1 type 1 spectrum with T1 = 0.075 H^0.75. Preliminary only: run a full 3D frame analysis for design.</Text>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  wrap: { padding: 16, gap: 10, maxWidth: 720, width: '100%', alignSelf: 'center' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }, btn: { fontSize: 24, color: '#146c43', paddingHorizontal: 10 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#146c43' }, chipOn: { backgroundColor: '#146c43' }, chipT: { color: '#146c43', fontWeight: '600' },
  t: { fontSize: 20, fontWeight: '700', marginTop: 8 },
  card: { borderWidth: 1, borderColor: '#cfdcd4', borderLeftWidth: 5, borderRadius: 8, padding: 12, gap: 2 }, h: { fontWeight: '700', fontSize: 16, marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, gap: 8 }, k: { color: '#4f6a5b', flexShrink: 1 }, v: { fontWeight: '600', textAlign: 'right', flexShrink: 1 },
  l: { color: '#146c43', fontWeight: '600' }, warn: { color: '#c4620a' },
  save: { backgroundColor: '#146c43', padding: 14, borderRadius: 8, alignItems: 'center' }, alt: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#146c43' }, sb: { color: '#fff', fontWeight: '600' },
  note: { color: '#4f6a5b', fontSize: 12, marginTop: 8 },
});
