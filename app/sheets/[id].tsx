import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, TextInput, Platform, useWindowDimensions } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useLocalSearchParams } from 'expo-router';
import { useModel } from '../../lib/useModel';
import { modelExtent } from '../../lib/views';
import { compositeDrawing, fitScale, fitScaleMany, makeDrawing, SCALES, sheetSvg, SheetView } from '../../lib/sheet';
import { defaultSetup, PAPERS, pageMm } from '../../lib/paper';
import { pdfSupported, printSvgs, savePdf } from '../../lib/pdf';
import PrintOptions from '../../components/PrintOptions';
import { saveFile } from '../../components/saveFile';
import { supabase } from '../../lib/supabase';

export default function Sheets() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { els, lib, stories, loaded } = useModel(id);
  const { width } = useWindowDimensions();
  const list = useMemo(() => [...stories].sort((a, b) => a.elevation_m - b.elevation_m), [stories]);
  const ext = useMemo(() => modelExtent(els), [els]);
  const [sel, setSel] = useState<string[]>(['plan:0']);
  const [sheetTitle, setSheetTitle] = useState('General arrangement');
  const [setup, setSetup] = useState(defaultSetup());
  const paper = useMemo(() => pageMm(setup), [setup]), plabel = PAPERS.find(p => p.key === setup.key)?.label ?? 'Custom';
  const [scale, setScale] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [by, setBy] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { supabase.from('projects').select('name').eq('id', id).single().then(({ data }) => data?.name && setName(n => n || data.name)); }, [id]);

  const views = useMemo(() => {
    const v: { key: string; label: string; v: SheetView }[] = list.map((s, i) => ({ key: `plan:${i}`, label: `Plan: ${s.name}`, v: { kind: 'plan', storyId: s.id } }));
    for (const [side, n] of [['S', 'South'], ['N', 'North'], ['E', 'East'], ['W', 'West']] as const) v.push({ key: 'el:' + side, label: `${n} elevation`, v: { kind: 'elevation', side } });
    v.push({ key: 'sec:y', label: 'Section through the middle (Y)', v: { kind: 'section', axis: 'y', pos: Math.round(((ext.y0 + ext.y1) / 2) * 10) / 10, flip: false } });
    v.push({ key: 'sec:x', label: 'Section through the middle (X)', v: { kind: 'section', axis: 'x', pos: Math.round(((ext.x0 + ext.x1) / 2) * 10) / 10, flip: false } });
    return v;
  }, [list, ext]);
  const chosen = views.filter(x => sel.includes(x.key)), picked = chosen.length ? chosen : views.slice(0, 1), many = picked.length > 1, cur = picked[0];
  const toggle = (k: string) => setSel(a => (a.includes(k) ? (a.length > 1 ? a.filter(x => x !== k) : a) : [...a, k]));
  const date = new Date().toISOString().slice(0, 10), info = { project: name || 'Project', client, drawnBy: by, date };
  const build = (v: SheetView, no: string, sc: number | null) => { const s = sc ?? fitScale(els, lib, stories, v, paper); return sheetSvg(makeDrawing(els, lib, stories, v, s), paper, s, no, info, plabel); };
  const manyScale = (sc: number | null) => sc ?? fitScaleMany(els, lib, stories, picked.map(x => x.v), paper);
  const svg = useMemo(() => {
    if (!cur) return '';
    if (many) { const sc = manyScale(scale); return sheetSvg(compositeDrawing(els, lib, stories, picked.map(x => x.v), paper, sc, sheetTitle), paper, sc, 'A-C1', info, plabel); }
    return build(cur.v, `A-${String(views.indexOf(cur) + 1).padStart(2, '0')}`, scale);
  }, [sel, paper, scale, name, client, by, sheetTitle, els, lib, stories]);
  const used = !cur ? 100 : many ? manyScale(scale) : scale ?? fitScale(els, lib, stories, cur.v, paper);

  const fname = `${(name || 'Unibuild').replace(/[^A-Za-z0-9_-]+/g, '_')}-${many ? 'composite' : sel[0].replace(':', '-')}`;
  const setSvgs = (all: boolean) => (all ? views.map((x, i) => build(x.v, `A-${String(i + 1).padStart(2, '0')}`, null)) : [svg]);
  const printSet = (all: boolean) => setMsg(printSvgs(setSvgs(all), paper, `${name || 'Unibuild'} drawings`, 0, false));
  const pdfSet = async (all: boolean) => { try { setMsg('Making the PDF…'); await savePdf(setSvgs(all), paper, all ? `${fname.replace(/-[^-]*$/, '')}-drawing-set` : fname, 0, false); setMsg(`PDF saved: ${all ? views.length + ' sheets' : '1 sheet'}, ${plabel} ${paper[0] >= paper[1] ? 'landscape' : 'portrait'}`); } catch (e: any) { setMsg('Could not make the PDF: ' + (e?.message ?? e)); } };
  const dl = async () => { try { await saveFile(`${(name || 'Unibuild').replace(/[^A-Za-z0-9_-]+/g, '_')}-${many ? 'composite' : sel[0].replace(':', '-')}.svg`, svg); setMsg('Sheet saved as SVG'); } catch (e: any) { setMsg('Could not save: ' + (e?.message ?? e)); } };

  const W = Math.min(width - 32, 900), H = W * paper[1] / paper[0];
  const Chip = ({ on, label, go }: { on: boolean; label: string; go: () => void }) => <Pressable onPress={go} style={[s.chip, on && s.on]}><Text style={[s.ct, on && { color: '#fff' }]}>{label}</Text></Pressable>;
  const F = ({ l, v, set }: { l: string; v: string; set: (x: string) => void }) => <View style={{ flex: 1, minWidth: 150 }}><Text style={s.k}>{l}</Text><TextInput value={v} onChangeText={set} style={s.in} placeholder={l} /></View>;
  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <Text style={s.h1}>Drawing sheets</Text>
      <Text style={s.k}>Each sheet puts a plan, elevation or section on a paper size with a border and title block, at a true scale. {els.length ? '' : loaded ? 'The model is empty: draw something in the Plan first.' : 'Loading the model…'}</Text>
      <Text style={s.h2}>Drawing</Text>
      <Text style={s.k}>Tap one drawing for a single sheet, or tap several to put them together on one sheet at a common scale.</Text>
      <View style={s.row}>{views.map(x => <Chip key={x.key} on={sel.includes(x.key)} label={x.label} go={() => toggle(x.key)} />)}</View>
      <Text style={s.h2}>Paper size, canvas and scale</Text>
      <PrintOptions setup={setup} set={setSetup} margins={false} testID="print-options" />
      <View style={s.row}><Chip on={scale === null} label={`Best fit (1:${used})`} go={() => setScale(null)} />{SCALES.map(x => <Chip key={x} on={scale === x} label={`1:${x}`} go={() => setScale(x)} />)}</View>
      <Text style={s.h2}>Title block</Text>
      <View style={s.row}>{many && <F l="Sheet title" v={sheetTitle} set={setSheetTitle} />}<F l="Project" v={name} set={setName} /><F l="Client" v={client} set={setClient} /><F l="Drawn by" v={by} set={setBy} /></View>
      <View style={s.row}>
        <Pressable testID="sheet-pdf" onPress={() => pdfSet(false)} style={s.btn}><Text style={s.bt}>Save this sheet as PDF</Text></Pressable>
        <Pressable testID="sheet-pdf-all" onPress={() => pdfSet(true)} style={s.btn}><Text style={s.bt}>Save the full set as PDF ({views.length} sheets)</Text></Pressable>
        <Pressable testID="sheet-print" onPress={() => printSet(false)} style={s.btn2}><Text style={s.bt2}>Print this sheet</Text></Pressable>
        <Pressable onPress={() => printSet(true)} style={s.btn2}><Text style={s.bt2}>Print the full set</Text></Pressable>
        <Pressable onPress={dl} style={s.btn2}><Text style={s.bt2}>Download SVG</Text></Pressable>
      </View>
      {!!msg && <Text style={s.msg}>{msg}</Text>}
      <View style={[s.paper, { width: W, height: H }]}>{!!svg && <SvgXml xml={svg.replace(/width="[\d.]+mm" height="[\d.]+mm"/, `width="${W}" height="${H}"`)} width={W} height={H} />}</View>
      <Text style={s.k}>If the drawing is larger than the paper at the chosen scale it is cut off by the border; pick a smaller scale or a larger sheet. The full set uses the best fit for each sheet.</Text>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  wrap: { padding: 16, gap: 12, maxWidth: 1100 }, h1: { fontSize: 24, fontWeight: '800', color: '#0a2e1f' }, h2: { fontSize: 15, fontWeight: '700', color: '#146c43' },
  k: { color: '#4f6a5b' }, msg: { color: '#146c43' }, row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: '#146c43', backgroundColor: '#fff' }, on: { backgroundColor: '#146c43' }, ct: { color: '#146c43', fontWeight: '600' },
  in: { borderWidth: 1, borderColor: '#cfdcd4', borderRadius: 8, padding: 8, backgroundColor: '#fff' },
  btn: { backgroundColor: '#146c43', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 }, bt: { color: '#fff', fontWeight: '700' },
  btn2: { borderWidth: 1, borderColor: '#146c43', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 }, bt2: { color: '#146c43', fontWeight: '700' },
  paper: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cfdcd4' },
});
