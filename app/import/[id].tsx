import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { parseIfc, ImportedEl } from '../../lib/ifcImport';
import { pickText } from '../../components/pickText';

const DISC: Record<string, string> = { wall: 'architecture', door: 'architecture', window: 'architecture', roof: 'architecture', stair: 'architecture', column: 'structure', beam: 'structure', slab: 'structure', foundation: 'structure', duct: 'mep', pipe: 'mep' };
const near = (a: any, b: number | undefined) => b === undefined || Math.abs((a ?? -999) - b) <= 10;
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
type Plan = { name: string; elevation: number; height: number; els: ImportedEl[] };

export default function ImportIfc() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [file, setFile] = useState('');
  const [parsed, setParsed] = useState<ReturnType<typeof parseIfc> | null>(null);
  const [pickSt, setPickSt] = useState<number | null | 'all'>('all');
  const [existing, setExisting] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { supabase.from('elements').select('id', { count: 'exact', head: true }).eq('project_id', id).then(({ count }) => setExisting(count ?? 0)); }, [id]);

  const choose = async () => {
    setMsg(''); setConfirm(false);
    const f = await pickText(); if (!f) return;
    setBusy(true); setMsg('Reading file…');
    setTimeout(() => {                                     // let the screen repaint before the heavy parse
      try {
        const p = parseIfc(f.text);
        setFile(f.name); setParsed(p); setPickSt(p.storeys.filter(s => s.count > 0).length > 1 ? 'all' : p.storeys[0]?.id ?? null);
        setMsg(p.storeys.length ? '' : 'No building elements found in this file.');
      } catch (e: any) { setParsed(null); setMsg('Could not read this file: ' + (e?.message ?? e)); }
      setBusy(false);
    }, 30);
  };

  // what would be imported: every storey, or the one chosen
  const view = useMemo(() => {
    if (!parsed) return null;
    if (pickSt === 'all') { const a = parsed.extractAll(); return { plans: a.stories.map(s => ({ name: s.name, elevation: s.elevation_m, height: s.height_m, els: s.result.elements })) as Plan[], skipped: a.skipped, notes: a.notes }; }
    const r = parsed.extract(pickSt), nm = parsed.storeys.find(s => s.id === pickSt)?.name ?? 'Ground floor';
    return { plans: [{ name: nm, elevation: 0, height: Math.max(r.wallHeight, 3), els: r.elements }] as Plan[], skipped: r.skipped, notes: r.notes };
  }, [parsed, pickSt]);
  const counts = useMemo(() => (view?.plans ?? []).flatMap(p => p.els).reduce<Record<string, number>>((a, e) => ({ ...a, [e.kind]: (a[e.kind] ?? 0) + 1 }), {}), [view]);
  const total = (view?.plans ?? []).reduce((a, p) => a + p.els.length, 0);

  const run = async (replace: boolean) => {
    if (!view || !total) return;
    if (replace && !confirm) { setConfirm(true); return; }
    setBusy(true); setMsg('Importing…'); setConfirm(false);
    try {
      const fresh = replace || existing === 0;
      const { data: libNow } = await supabase.from('library_items').select('id,category,name,specs');
      const lib = [...(libNow ?? [])] as { id: string; category: string; name: string; specs: any }[];
      const cache: Record<string, string> = {};
      const section = async (e: ImportedEl): Promise<string | null> => {
        if (!e.section) return null;
        const s = e.section, k = e.kind + JSON.stringify(s); if (cache[k]) return cache[k];
        const cat = e.kind === 'duct' ? 'duct' : e.kind === 'pipe' ? 'pipe' : 'section', re = e.kind === 'beam' ? /beam/i : e.kind === 'column' ? /column/i : /./;
        const hit = lib.find(l => l.category === cat && re.test(l.name) && near(l.specs?.b_mm, s.b_mm) && near(l.specs?.h_mm, s.h_mm) && near(l.specs?.w_mm, s.w_mm) && near(l.specs?.dia_mm, s.dia_mm) && (e.kind === 'pipe' ? l.specs?.dia_mm : true));
        if (hit) return (cache[k] = hit.id);
        const label = e.kind === 'pipe' ? `Pipe ${s.dia_mm} mm` : `${e.kind === 'beam' ? 'RC beam' : e.kind === 'column' ? 'RC column' : 'Duct'} ${s.b_mm ?? s.w_mm}x${s.h_mm}`;
        const { data, error } = await supabase.from('library_items').insert({ project_id: id, discipline: DISC[e.kind], category: cat, name: `${label} (imported)`, specs: s }).select('id').single();
        if (error || !data) return null;
        lib.push({ id: data.id, category: cat, name: label, specs: s }); return (cache[k] = data.id);
      };
      let base = 0;
      if (fresh) {
        for (const t of ['issues', 'elements', 'stories']) { const { error } = await supabase.from(t).delete().eq('project_id', id); if (error) throw error; }
      } else {
        const { data: st } = await supabase.from('stories').select('elevation_m,height_m').eq('project_id', id);
        base = Math.max(0, ...((st ?? []) as any[]).map(s => Number(s.elevation_m) + Number(s.height_m)));
      }
      const { count: nSt } = await supabase.from('stories').select('id', { count: 'exact', head: true }).eq('project_id', id);
      let order = nSt ?? 0;
      for (const plan of view.plans) {
        const { data: story, error: se } = await supabase.from('stories').insert({ project_id: id, name: plan.name, elevation_m: base + plan.elevation, height_m: plan.height, sort_order: order++ }).select('id').single();
        if (se || !story) throw se ?? new Error('Could not create a storey');
        const row = async (e: ImportedEl, geometry: any) => ({ project_id: id, story_id: story.id, type: e.kind, discipline: DISC[e.kind], library_item_id: await section(e), geometry, properties: { ...e.props, source: 'ifc-import' } });
        const wallIds: Record<number, string> = {}, els = plan.els, wallPos = els.map((e, i) => (e.kind === 'wall' ? i : -1)).filter(i => i >= 0);
        for (const part of chunk(wallPos, 200)) {
          const { data, error } = await supabase.from('elements').insert(await Promise.all(part.map(i => row(els[i], els[i].geometry)))).select('id');
          if (error) throw error; (data ?? []).forEach((d: any, k: number) => (wallIds[part[k]] = d.id));
        }
        for (const part of chunk(els.map((_, i) => i).filter(i => els[i].kind !== 'wall'), 200)) {
          const rows = [];
          for (const i of part) {
            const e = els[i];
            if (e.kind === 'door' || e.kind === 'window') { const wid = wallIds[e.wallIdx ?? -1]; if (!wid) continue; rows.push(await row(e, { ...e.geometry, wall_id: wid })); }
            else rows.push(await row(e, e.geometry));
          }
          if (rows.length) { const { error } = await supabase.from('elements').insert(rows); if (error) throw error; }
        }
      }
      setExisting(fresh ? total : existing + total);
      setMsg(`Imported ${total} elements into ${view.plans.length} storey${view.plans.length > 1 ? 's' : ''}. Open the plan or 3D view to see them.`);
    } catch (e: any) { setMsg('Import failed: ' + (e?.message ?? e)); }
    setBusy(false);
  };

  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <Pressable style={s.btn} onPress={choose} disabled={busy}><Text style={s.bt}>{file ? 'Choose a different IFC file' : 'Choose an IFC file'}</Text></Pressable>
      {!!msg && <Text style={s.k}>{msg}</Text>}
      {parsed && view && (
        <>
          <Text style={s.h}>{file}</Text>
          {parsed.storeys.filter(st => st.count > 0).length > 1 && (
            <View style={s.chips}>
              <Pressable onPress={() => { setPickSt('all'); setConfirm(false); }} style={[s.chip, pickSt === 'all' && s.chipOn]}><Text style={[s.chipT, pickSt === 'all' && { color: '#fff' }]}>All storeys</Text></Pressable>
              {parsed.storeys.map(st => (
                <Pressable key={String(st.id)} onPress={() => { setPickSt(st.id); setConfirm(false); }} style={[s.chip, pickSt === st.id && s.chipOn]}><Text style={[s.chipT, pickSt === st.id && { color: '#fff' }]}>{st.name} ({st.count})</Text></Pressable>
              ))}
            </View>
          )}
          <View style={s.card}>
            <Text style={s.h2}>Will be imported ({total})</Text>
            {view.plans.map(p => <Text key={p.name + p.elevation}>{p.name}: {p.els.length} elements at {p.elevation.toFixed(2)} m</Text>)}
            {Object.entries(counts).map(([k, v]) => <Text key={k} style={s.k}>{v} × {k}</Text>)}
            {!total && <Text style={s.k}>Nothing importable here.</Text>}
            {view.notes.map(n => <Text key={n} style={s.warn}>{n}</Text>)}
          </View>
          {Object.keys(view.skipped).length > 0 && (
            <View style={s.card}>
              <Text style={s.h2}>Skipped</Text>
              {Object.entries(view.skipped).map(([k, v]) => <Text key={k} style={s.k}>{v} × {k}</Text>)}
            </View>
          )}
          <Pressable style={[s.btn, !total && s.off]} onPress={() => run(false)} disabled={busy || !total}><Text style={s.bt}>{existing > 0 ? 'Add above the existing storeys' : 'Import into this project'}</Text></Pressable>
          {existing > 0 && (
            <Pressable style={[s.btn, s.danger, !total && s.off]} onPress={() => run(true)} disabled={busy || !total}>
              <Text style={s.bt}>{confirm ? `Tap again: delete ${existing} existing elements and import` : 'Replace the whole model'}</Text>
            </Pressable>
          )}
          <Pressable onPress={() => router.back()}><Text style={s.l}>Back to plan</Text></Pressable>
        </>
      )}
      <Text style={s.note}>Reads IFC2x3 and IFC4: walls, columns, beams, doors, windows, ducts, pipes, slabs, roofs, stairs and footings. Extruded shapes are read exactly; meshes and B-reps are fitted with a bounding box. Sizes become library items, thickness and beam heights are kept, storeys keep their elevations, and file units are converted to metres. The file is read on your device, so very large files can take a while.</Text>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  wrap: { padding: 16, gap: 10, maxWidth: 720, width: '100%', alignSelf: 'center' },
  btn: { backgroundColor: '#146c43', padding: 14, borderRadius: 8, alignItems: 'center' }, bt: { color: '#fff', fontWeight: '600', textAlign: 'center' },
  danger: { backgroundColor: '#c62828' }, off: { opacity: 0.4 },
  h: { fontSize: 18, fontWeight: '700' }, h2: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  k: { color: '#4f6a5b' }, warn: { color: '#c4620a', marginTop: 4 }, l: { color: '#146c43', fontWeight: '600' },
  card: { borderWidth: 1, borderColor: '#cfdcd4', borderRadius: 8, padding: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#146c43' }, chipOn: { backgroundColor: '#146c43' }, chipT: { color: '#146c43', fontWeight: '600' },
  note: { color: '#4f6a5b', fontSize: 12, marginTop: 8 },
});
