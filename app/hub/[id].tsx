import { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useModel } from '../../lib/useModel';
import { toIfc } from '../../lib/ifc';
import { saveFile } from '../../components/saveFile';

type Mod = { route?: string; title: string; what: string; badge?: string; action?: () => void };

export default function Hub() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { els, lib, stories, loaded } = useModel(id);
  const [name, setName] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [msg, setMsg] = useState('');

  useFocusEffect(useCallback(() => {
    supabase.from('projects').select('name').eq('id', id).single().then(({ data }) => setName(data?.name ?? ''));
    supabase.from('issues').select('id', { count: 'exact', head: true }).eq('project_id', id).eq('status', 'open').then(({ count }) => setOpen(count ?? 0));
  }, [id]));

  const c = useMemo(() => els.reduce<Record<string, number>>((a, e) => ({ ...a, [e.type]: (a[e.type] ?? 0) + 1 }), {}), [els]);
  const exportIfc = async () => {
    try { await saveFile(`${(name || 'Unibuild').replace(/[^A-Za-z0-9_-]+/g, '_')}.ifc`, toIfc(name || 'Unibuild', els, lib, stories)); setMsg('IFC exported'); }
    catch (e: any) { setMsg('IFC export failed: ' + (e?.message ?? e)); }
  };

  const sections: { title: string; color: string; mods: Mod[] }[] = [
    { title: 'Model', color: '#146c43', mods: [
      { route: 'project', title: 'Plan', what: 'Draw and edit one storey at a time: walls, columns, beams, slabs, doors, windows, ducts, pipes. Select any element to resize or delete it.', badge: `${els.length} elements` },
      { route: 'view3d', title: '3D view', what: 'All storeys stacked at their real levels, with true thicknesses and beam levels.' },
      { route: 'import', title: 'Import IFC', what: 'Bring in a building exported from Revit, ArchiCAD or Tekla (IFC2x3 or IFC4).' },
      { title: 'Export IFC', what: 'Save the whole model as an IFC4 file with openings and property sets.', action: exportIfc },
    ] },
    { title: 'Structural design', color: '#c98a00', mods: [
      { route: 'design', title: 'Member design', what: 'Continuous beams with load patterns, columns carrying every storey above, shear links, deflection and crack width. Eurocode 2 or BS 8110. Exports the calculation report.', badge: `${c.beam ?? 0} beams · ${c.column ?? 0} columns` },
      { route: 'foundations', title: 'Slab and foundations', what: 'Slab panels, flat slabs (punching shear and equivalent-frame bending), pad, strip and combined footings, ground beams, lateral loads at the base.', badge: `${c.slab ?? 0} slabs` },
      { route: 'lateral', title: 'Wind and earthquake', what: 'Wind to EN 1991-1-4 and equivalent-static earthquake to EN 1998-1, shared among columns, with drift, overturning and column checks.' },
    ] },
    { title: 'Parts and mechanical design', color: '#b3402a', mods: [
      { route: 'parts', title: 'Parts', what: 'Sketch with dimensions and constraints, extrude, revolve, cut and join into solid parts driven by named parameters, with a history timeline, mass and volume, and STL export. For brackets, plates, shafts, connections and machine or vehicle components.', badge: 'New' },
    ] },
    { title: 'Services (MEP)', color: '#0c9a87', mods: [
      { route: 'mep', title: 'MEP routing and sizing', what: 'Routes ducts and chilled-water pipes from a plant to the outlets, sizes every segment, lowers them under beams, and reports fittings and pressure drop for fan and pump selection.', badge: `${c.equipment ?? 0} plant · ${c.fixture ?? 0} outlets` },
    ] },
    { title: 'Coordination and output', color: '#8a3ffc', mods: [
      { route: 'clashes', title: 'Clash detection', what: 'Finds elements that collide between disciplines and marks them on the plan; results are saved as issues.', badge: open === null ? undefined : `${open} open` },
      { route: 'schedules', title: 'Schedules', what: 'Door and window schedule with marks, walls, columns, beams, slabs, rooms, stairs, services and concrete volumes. Download as CSV for Excel.' },
      { route: 'views', title: 'Elevations and sections', what: 'Elevations from the four sides and sections cut at any X or Y, drawn from the model with the storey levels. Download as SVG.' },
      { route: 'sheets', title: 'Drawing sheets', what: 'Plans, elevations and sections on A4 to A1 sheets with a border and title block at a true scale. Print or save as PDF from the browser.' },
      { route: 'dashboard', title: 'Dashboard', what: 'Quantities, cost, structural status and MEP loads for the whole building, with saved snapshots.' },
    ] },
  ];
  const go = (m: Mod) => (m.action ? m.action() : router.push(`/${m.route}/${id}` as any));

  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <Text style={s.h1}>{name || 'Project'}</Text>
      <Pressable onPress={() => router.push('/manual' as any)}><Text style={{ color: '#146c43', fontWeight: '700' }}>Manual and guides ›</Text></Pressable>
      <Text style={s.k}>{loaded || els.length ? `${stories.length} storey${stories.length === 1 ? '' : 's'} · ${els.length} elements · ${c.wall ?? 0} walls · ${c.column ?? 0} columns · ${c.beam ?? 0} beams · ${c.slab ?? 0} slabs` : 'Loading…'}</Text>

      {sections.map(sec => (
        <View key={sec.title} style={{ gap: 8 }}>
          <Text style={[s.h2, { color: sec.color }]}>{sec.title}</Text>
          <View style={s.grid}>
            {sec.mods.map(m => (
              <Pressable key={m.title} style={[s.card, { borderLeftColor: sec.color }]} onPress={() => go(m)}>
                <View style={s.row}><Text style={s.ct}>{m.title}</Text>{!!m.badge && <Text style={s.badge}>{m.badge}</Text>}</View>
                <Text style={s.cd}>{m.what}</Text>
                <Text style={[s.open, { color: sec.color }]}>{m.action ? 'Export' : 'Open'} →</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      {!!msg && <Text style={s.k}>{msg}</Text>}

      <Pressable onPress={() => router.replace('/projects')}><Text style={s.link}>← All projects</Text></Pressable>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  wrap: { padding: 16, gap: 14, maxWidth: 980, width: '100%', alignSelf: 'center' },
  h1: { fontSize: 26, fontWeight: '800' }, h2: { fontSize: 18, fontWeight: '700' }, k: { color: '#4f6a5b', lineHeight: 20 },
  panel: { borderWidth: 1, borderColor: '#cfdcd4', borderRadius: 12, padding: 14, gap: 10, backgroundColor: '#f4f9f6' },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' }, st: { fontWeight: '700' },
  num: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: '#9aa7b0', textAlign: 'center', lineHeight: 24, color: '#4f6a5b', fontWeight: '700', overflow: 'hidden' },
  numOn: { backgroundColor: '#1a8f4d', borderColor: '#1a8f4d', color: '#fff' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { flexGrow: 1, flexBasis: 280, borderWidth: 1, borderColor: '#cfdcd4', borderLeftWidth: 5, borderRadius: 10, padding: 14, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  ct: { fontSize: 17, fontWeight: '700', flexShrink: 1 }, badge: { fontSize: 12, color: '#4f6a5b', backgroundColor: '#eef2f5', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
  cd: { lineHeight: 20 }, cu: { color: '#4f6a5b', fontStyle: 'italic', lineHeight: 19 }, open: { fontWeight: '700', marginTop: 4 },
  link: { color: '#146c43', fontWeight: '600', paddingVertical: 8 },
});
