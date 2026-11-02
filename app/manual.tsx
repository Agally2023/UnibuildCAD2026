import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Block, MANUAL_TITLE, manual, manualMarkdown, searchManual } from '../lib/manual';
import { saveFile } from '../components/saveFile';

// **bold** in the manual text
function Rich({ x, style }: { x: string; style?: any }) {
  return <Text style={style}>{x.split('**').map((part, i) => (i % 2 ? <Text key={i} style={s.b}>{part}</Text> : part))}</Text>;
}

function Blk({ b }: { b: Block }) {
  if (b.t === 'p') return <Rich x={b.x} style={s.p} />;
  if (b.t === 'h') return <Text style={s.h3}>{b.x}</Text>;
  if (b.t === 'note') return <View style={s.note}><Rich x={b.x} style={s.noteT} /></View>;
  if (b.t === 'ul') return <View style={s.list}>{b.x.map((i, n) => <View key={n} style={s.li}><Text style={s.dot}>•</Text><Rich x={i} style={[s.p, { flex: 1 }]} /></View>)}</View>;
  if (b.t === 'ol') return <View style={s.list}>{b.x.map((i, n) => <View key={n} style={s.li}><Text style={s.num}>{n + 1}.</Text><Rich x={i} style={[s.p, { flex: 1 }]} /></View>)}</View>;
  return (
    <View style={s.table}>
      <View style={[s.tr, s.th]}><Text style={[s.td, s.tc1, s.thT]}>{b.head[0]}</Text><Text style={[s.td, s.thT, { flex: 1 }]}>{b.head[1]}</Text></View>
      {b.rows.map((r, n) => <View key={n} style={[s.tr, n % 2 ? s.alt : null]}><Text style={[s.td, s.tc1, s.b]}>{r[0]}</Text><Rich x={r[1]} style={[s.td, { flex: 1 }]} /></View>)}
    </View>
  );
}

export default function Manual() {
  const { s: sp } = useLocalSearchParams<{ s?: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [cur, setCur] = useState(manual.find(x => x.id === sp)?.id ?? manual[0].id);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const found = searchManual(q), searching = q.trim().length > 0;
  const shown = searching ? found : manual.filter(x => x.id === cur);
  const i = manual.findIndex(x => x.id === cur);
  const nav = (
    <View style={wide ? s.side : s.chips}>
      {manual.map(x => <Pressable key={x.id} onPress={() => { setCur(x.id); setQ(''); }} style={[wide ? s.sideI : s.chip, !searching && cur === x.id && s.on]}><Text style={[wide ? s.sideT : s.chipT, !searching && cur === x.id && { color: '#fff' }]}>{x.title}</Text></Pressable>)}
    </View>
  );
  return (
    <View style={s.wrap}>
      <View style={s.top}>
        <TextInput value={q} onChangeText={setQ} placeholder="Search the manual (for example snap, punching, IFC)" placeholderTextColor="#7d968a" style={s.search} />
        <Pressable onPress={async () => { try { await saveFile('Unibuild-manual.md', manualMarkdown()); setMsg('Manual saved as Markdown'); } catch (e: any) { setMsg('Could not save: ' + (e?.message ?? e)); } }}><Text style={s.link}>Download</Text></Pressable>
      </View>
      {!!msg && <Text style={s.msg}>{msg}</Text>}
      <View style={s.body}>
        {wide ? <ScrollView style={s.sideWrap}>{nav}</ScrollView> : <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipWrap}>{nav}</ScrollView>}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[s.page, wide && { paddingTop: 18 }]}>
          {searching && <Text style={s.k}>{found.length ? `${found.length} section${found.length > 1 ? 's' : ''} match` : 'Nothing matches. Try one word.'}</Text>}
          {shown.map(sec => (
            <View key={sec.id} style={{ gap: 10 }}>
              <Text style={s.h1}>{sec.title}</Text>
              <Text style={s.k}>{sec.blurb}</Text>
              {sec.blocks.map((b, n) => <Blk key={n} b={b} />)}
            </View>
          ))}
          {!searching && (
            <View style={s.pager}>
              {i > 0 ? <Pressable onPress={() => setCur(manual[i - 1].id)}><Text style={s.link}>‹ {manual[i - 1].title}</Text></Pressable> : <View />}
              {i < manual.length - 1 ? <Pressable onPress={() => setCur(manual[i + 1].id)}><Text style={s.link}>{manual[i + 1].title} ›</Text></Pressable> : <View />}
            </View>
          )}
          <Pressable onPress={() => router.back()}><Text style={[s.link, { marginTop: 8 }]}>{MANUAL_TITLE.startsWith('Unibuild') ? 'Close the manual' : 'Close'}</Text></Pressable>
        </ScrollView>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#fff' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 10, backgroundColor: '#f1f7f3', borderBottomWidth: 1, borderColor: '#bccfc3' },
  search: { flex: 1, height: 36, borderRadius: 8, borderWidth: 1, borderColor: '#9db5a5', backgroundColor: '#fff', paddingHorizontal: 12, fontSize: 14 },
  link: { color: '#146c43', fontWeight: '700' }, msg: { color: '#146c43', paddingHorizontal: 12, paddingTop: 6 },
  body: { flex: 1, flexDirection: 'row' },
  sideWrap: { width: 230, flexGrow: 0, backgroundColor: '#f4f9f6', borderRightWidth: 1, borderColor: '#cfdcd4' }, side: { padding: 8, gap: 2 },
  sideI: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 6 }, sideT: { color: '#0a2e1f', fontWeight: '600', fontSize: 13 },
  chipWrap: { flexGrow: 0, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2, backgroundColor: '#f4f9f6', borderBottomWidth: 1, borderColor: '#cfdcd4', height: 46 },
  chips: { flexDirection: 'row', gap: 8, padding: 8, alignItems: 'center' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 18, borderWidth: 1, borderColor: '#146c43' }, chipT: { color: '#146c43', fontWeight: '600' },
  on: { backgroundColor: '#146c43' },
  page: { padding: 18, gap: 14, maxWidth: 860, paddingTop: 60 },
  h1: { fontSize: 24, fontWeight: '800', color: '#0a2e1f' }, h3: { fontSize: 16, fontWeight: '700', color: '#146c43', marginTop: 6 },
  p: { fontSize: 14.5, lineHeight: 22, color: '#1d2b24' }, b: { fontWeight: '700' }, k: { color: '#4f6a5b' },
  list: { gap: 6 }, li: { flexDirection: 'row', gap: 8 }, dot: { color: '#146c43', fontWeight: '800', width: 12, lineHeight: 22 }, num: { color: '#146c43', fontWeight: '800', width: 22, lineHeight: 22 },
  note: { borderLeftWidth: 4, borderColor: '#c98a00', backgroundColor: '#fff8e6', padding: 10, borderRadius: 6 }, noteT: { color: '#4a3a00', lineHeight: 21 },
  table: { borderWidth: 1, borderColor: '#cfdcd4', borderRadius: 8, overflow: 'hidden' },
  tr: { flexDirection: 'row' }, th: { backgroundColor: '#e2eee7' }, alt: { backgroundColor: '#f7fbf8' },
  td: { padding: 9, fontSize: 13.5, lineHeight: 20, color: '#1d2b24' }, tc1: { width: 150 }, thT: { fontWeight: '800', color: '#0a2e1f' },
  pager: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderColor: '#cfdcd4' },
});
