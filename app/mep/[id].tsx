import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useModel } from '../../lib/useModel';
import { planMep, MepResult, MepSeg } from '../../lib/mep';

const n1 = (x: number) => x.toFixed(1);
const group = (segs: MepSeg[]) => Object.entries(segs.reduce<Record<string, number>>((a, s) => { const k = s.kind === 'duct' ? `${s.size.w_mm}×${s.size.h_mm} duct` : `DN${(s.size.dia_mm ?? 12) - 12} pipe`; a[k] = (a[k] ?? 0) + Math.hypot(s.end[0] - s.start[0], s.end[1] - s.start[1]); return a; }, {}));

export default function Mep() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { els, lib, stories, reload } = useModel(id);
  const [cur, setCur] = useState<string | null>(null);
  const [maxH, setMaxH] = useState(0.4);
  const [clear, setClear] = useState(2.7);
  const [pipes, setPipes] = useState(true);
  const [res, setRes] = useState<MepResult | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const story = stories.find(s => s.id === cur) ?? stories[0];
  const here = useMemo(() => els.filter(e => (e.story_id ?? stories[0]?.id) === story?.id), [els, stories, story]);
  const slabs = here.filter(e => e.type === 'slab');
  const slabT = slabs.length ? slabs.reduce((a, s) => a + (s.geometry.z1 - s.geometry.z0), 0) / slabs.length : 0.2;
  const nOut = here.filter(e => e.type === 'fixture').length, nPlant = here.filter(e => e.type === 'equipment').length;
  const nAuto = here.filter(e => e.properties?.auto).length;

  const run = () => { setMsg(''); setBusy(true); setTimeout(() => { setRes(planMep({ els: here, lib, storeyH: story?.height_m ?? 3.6, maxDuctH: maxH, includePipes: pipes, requiredClear: clear, slabT })); setBusy(false); }, 30); };

  const remove = async () => {
    if (!story) return;
    const { error } = await supabase.from('elements').delete().eq('project_id', id).eq('story_id', story.id).contains('properties', { auto: true });
    setMsg(error ? error.message : 'Generated MEP removed'); await reload();
  };
  const apply = async () => {
    if (!res || !story) return;
    setBusy(true); setMsg('Writing to the project…');
    try {
      const { data: libNow } = await supabase.from('library_items').select('id,category,name,specs');
      const items = [...(libNow ?? [])] as { id: string; category: string; name: string; specs: any }[], cache: Record<string, string> = {};
      const item = async (s: MepSeg) => {
        const key = s.kind + JSON.stringify(s.size); if (cache[key]) return cache[key];
        const hit = items.find(l => l.category === s.kind && (s.kind === 'duct' ? l.specs?.w_mm === s.size.w_mm && l.specs?.h_mm === s.size.h_mm : l.specs?.dia_mm === s.size.dia_mm));
        if (hit) return (cache[key] = hit.id);
        const name = s.kind === 'duct' ? `Duct ${s.size.w_mm}x${s.size.h_mm} (auto)` : `Pipe DN${(s.size.dia_mm ?? 12) - 12} (auto)`;
        const { data, error } = await supabase.from('library_items').insert({ project_id: id, discipline: 'mep', category: s.kind, name, specs: s.size }).select('id').single();
        if (error || !data) throw error ?? new Error('library item failed');
        items.push({ id: data.id, category: s.kind, name, specs: s.size }); return (cache[key] = data.id);
      };
      await supabase.from('elements').delete().eq('project_id', id).eq('story_id', story.id).contains('properties', { auto: true });
      const rows = [];
      for (const s of [...res.ducts, ...res.pipes]) rows.push({ project_id: id, story_id: story.id, type: s.kind, discipline: 'mep', library_item_id: await item(s), geometry: { start: s.start, end: s.end, elevation_m: s.elevation }, properties: { auto: true, flow: Math.round(s.flow * 1000) / 1000, velocity: Math.round(s.velocity * 10) / 10 } });
      for (let i = 0; i < rows.length; i += 200) { const { error } = await supabase.from('elements').insert(rows.slice(i, i + 200)); if (error) throw error; }
      setMsg(`Added ${res.ducts.length} duct and ${res.pipes.length} pipe segments. Run clash detection to confirm.`); await reload();
    } catch (e: any) { setMsg('Failed: ' + (e?.message ?? e)); }
    setBusy(false);
  };

  const Step = ({ label, value, dec, inc }: { label: string; value: string; dec: () => void; inc: () => void }) => (
    <View style={s.step}><Text style={s.k}>{label}</Text><Pressable onPress={dec}><Text style={s.btn}>−</Text></Pressable><Text style={s.v}>{value}</Text><Pressable onPress={inc}><Text style={s.btn}>+</Text></Pressable></View>
  );
  const st = res?.stats;
  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
        {stories.map(x => <Pressable key={x.id} onPress={() => { setCur(x.id); setRes(null); }} style={[s.chip, story?.id === x.id && s.chipOn]}><Text style={[s.chipT, story?.id === x.id && { color: '#fff' }]}>{x.name}</Text></Pressable>)}
      </ScrollView>
      <Text style={s.k}>{nPlant} plant{nPlant === 1 ? '' : 's'} and {nOut} outlet{nOut === 1 ? '' : 's'} on {story?.name ?? 'this storey'}. Place them on the plan with the Plant and Outlet tools (each outlet has a cooling load in kW).</Text>
      <Step label="Max duct height" value={`${maxH.toFixed(2)} m`} dec={() => setMaxH(v => Math.max(0.2, +(v - 0.05).toFixed(2)))} inc={() => setMaxH(v => Math.min(0.8, +(v + 0.05).toFixed(2)))} />
      <Step label="Required clear height" value={`${clear.toFixed(1)} m`} dec={() => setClear(v => Math.max(2.2, +(v - 0.1).toFixed(1)))} inc={() => setClear(v => Math.min(3.2, +(v + 0.1).toFixed(1)))} />
      <Pressable onPress={() => setPipes(p => !p)}><Text style={s.l}>{pipes ? '✓ ' : '○ '}Also route chilled-water pipes</Text></Pressable>
      <Pressable style={[s.save, (!nOut || !nPlant || busy) && s.off]} onPress={run} disabled={!nOut || !nPlant || busy}><Text style={s.sb}>{busy ? 'Working…' : 'Route and size'}</Text></Pressable>
      {nAuto > 0 && <Pressable onPress={remove}><Text style={[s.l, { color: '#c62828' }]}>Remove the {nAuto} generated segments on this storey</Text></Pressable>}
      {res && st && (
        <>
          <View style={s.card}>
            <Text style={s.h}>Result</Text>
            {([['Cooling load', `${n1(st.totalKw)} kW`], ['Supply air', `${st.totalAir.toFixed(2)} m³/s`], ['Duct run', `${n1(st.ductLen)} m`], ['Pipe run', `${n1(st.pipeLen)} m`], ['Highest duct velocity', `${n1(st.maxVelocity)} m/s`], ['Lowest MEP above floor', `${st.lowestBottom.toFixed(2)} m`], ['Clear height', `${st.clear.toFixed(2)} m`], ['Wall penetrations', `${st.penetrations}`], ['Remaining clashes', `${st.clashes}`]] as [string, string][]).map(([k, v]) => <View key={k} style={s.row}><Text style={s.k}>{k}</Text><Text style={s.v}>{v}</Text></View>)}
          </View>
          <View style={s.card}>
            <Text style={s.h}>Sizes</Text>
            {[...group(res.ducts), ...group(res.pipes)].map(([k, v]) => <View key={k} style={s.row}><Text style={s.k}>{k}</Text><Text style={s.v}>{n1(v)} m</Text></View>)}
          </View>
          {res.notes.map(n => <Text key={n} style={s.warn}>{n}</Text>)}
          <Pressable style={[s.save, busy && s.off]} onPress={apply} disabled={busy || (!res.ducts.length && !res.pipes.length)}><Text style={s.sb}>Add to the model</Text></Pressable>
        </>
      )}
      {!!msg && <Text style={s.k}>{msg}</Text>}
      <Text style={s.note}>Routes run on a 0.5 m grid: columns are avoided, wall crossings are minimised, and the network is lowered under any beam it meets, then re-checked with the clash engine. Duct sizes use a velocity method (4 to 6 m/s) at ΔT 10 K, pipes ΔT 5 K. Fittings, pressure drop, fire dampers and acoustics are not designed. Preliminary only: review with an MEP engineer.</Text>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  wrap: { padding: 16, gap: 10, maxWidth: 720, width: '100%', alignSelf: 'center' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#2f5bea' }, chipOn: { backgroundColor: '#2f5bea' }, chipT: { color: '#2f5bea', fontWeight: '600' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 }, btn: { fontSize: 24, color: '#2f5bea', paddingHorizontal: 10 },
  card: { borderWidth: 1, borderColor: '#d5dce1', borderTopWidth: 4, borderTopColor: '#0c9a87', borderRadius: 10, padding: 14 }, h: { fontSize: 18, fontWeight: '700', marginBottom: 6, color: '#0c9a87' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, gap: 8 }, k: { color: '#5b6b75', flexShrink: 1 }, v: { fontWeight: '600', textAlign: 'right', flexShrink: 1 },
  l: { color: '#2f5bea', fontWeight: '600' }, warn: { color: '#c4620a' },
  save: { backgroundColor: '#2f5bea', padding: 14, borderRadius: 8, alignItems: 'center' }, sb: { color: '#fff', fontWeight: '600' }, off: { opacity: 0.4 },
  note: { color: '#5b6b75', fontSize: 12, marginTop: 8 },
});
