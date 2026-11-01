import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { detectAll } from '../../lib/clash';
import type { El, Lib, Story } from '../../lib/engineering';

type Issue = { id: string; title: string; status: string; severity: string; element_a: string | null; element_b: string | null };
const key = (a: string | null, b: string | null) => [a, b].sort().join('|');

export default function Clashes() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('issues').select('id,title,status,severity,element_a,element_b').eq('project_id', id).eq('kind', 'clash').order('created_at', { ascending: false });
    setIssues((data as Issue[]) ?? []);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const run = async () => {
    setBusy(true); setMsg('');
    const [e, l, ex, st] = await Promise.all([
      supabase.from('elements').select('id,type,geometry,library_item_id,story_id').eq('project_id', id),
      supabase.from('library_items').select('id,category,name,specs,unit_cost'),
      supabase.from('issues').select('id,status,element_a,element_b').eq('project_id', id).eq('kind', 'clash'),
      supabase.from('stories').select('id,name,elevation_m,height_m').eq('project_id', id).order('elevation_m'),
    ]);
    const found = detectAll((e.data as El[]) ?? [], (l.data as Lib[]) ?? [], ((st.data as any[]) ?? []).map(x => ({ ...x, elevation_m: Number(x.elevation_m), height_m: Number(x.height_m) })) as Story[]);
    const nowKeys = new Map(found.map(c => [key(c.a, c.b), c]));
    const existing = new Map((ex.data ?? []).map((i: any) => [key(i.element_a, i.element_b), i]));
    const fresh = found.filter(c => !existing.has(key(c.a, c.b)));
    let err = '';
    if (fresh.length) {
      const r = await supabase.from('issues').insert(fresh.map(c => ({ project_id: id, kind: 'clash', element_a: c.a, element_b: c.b, title: c.title, severity: c.severity, location: c.loc, story_id: c.storyId ?? null })));
      if (r.error) err = r.error.message;
    }
    for (const [k, i] of existing) {
      const c = nowKeys.get(k);
      if (!c && i.status === 'open') await supabase.from('issues').update({ status: 'resolved', updated_at: new Date().toISOString() }).eq('id', i.id);
      if (c && i.status === 'resolved') await supabase.from('issues').update({ status: 'open', location: c.loc, updated_at: new Date().toISOString() }).eq('id', i.id);
    }
    setMsg(err || `${found.length} clash${found.length === 1 ? '' : 'es'} found, ${fresh.length} new`);
    setBusy(false); load();
  };

  const setStatus = async (i: Issue, status: string) => { await supabase.from('issues').update({ status, updated_at: new Date().toISOString() }).eq('id', i.id); load(); };
  const open = issues.filter(i => i.status === 'open'), rest = issues.filter(i => i.status !== 'open');
  const row = (i: Issue) => (
    <View key={i.id} style={[s.card, { borderLeftColor: i.status !== 'open' ? '#9aa8b1' : i.severity === 'warn' ? '#c4620a' : '#c62828' }]}>
      <Text style={s.t}>{i.title}</Text>
      <Text style={s.k}>{i.status} · {i.severity === 'warn' ? 'needs coordination' : 'hard clash'}</Text>
      <View style={s.acts}>
        {i.status === 'open' && <Pressable onPress={() => setStatus(i, 'ignored')}><Text style={s.l}>Ignore</Text></Pressable>}
        {i.status === 'ignored' && <Pressable onPress={() => setStatus(i, 'open')}><Text style={s.l}>Reopen</Text></Pressable>}
      </View>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <Pressable style={s.btn} onPress={run} disabled={busy}><Text style={s.bt}>{busy ? 'Checking…' : 'Run clash detection'}</Text></Pressable>
      {!!msg && <Text style={s.k}>{msg}</Text>}
      <Text style={s.h}>Open ({open.length})</Text>
      {open.length ? open.map(row) : <Text style={s.k}>No open clashes. Draw ducts or pipes across beams and columns, then run again.</Text>}
      {rest.length > 0 && <Text style={s.h}>Resolved and ignored ({rest.length})</Text>}
      {rest.map(row)}
      <Pressable onPress={() => router.back()}><Text style={s.l}>Back to plan</Text></Pressable>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  wrap: { padding: 16, gap: 10, maxWidth: 720, width: '100%', alignSelf: 'center' },
  btn: { backgroundColor: '#146c43', padding: 14, borderRadius: 8, alignItems: 'center' }, bt: { color: '#fff', fontWeight: '600' },
  h: { fontSize: 18, fontWeight: '700', marginTop: 8 },
  card: { borderWidth: 1, borderColor: '#cfdcd4', borderLeftWidth: 5, borderRadius: 8, padding: 12, gap: 4 },
  t: { fontWeight: '600' }, k: { color: '#4f6a5b' }, acts: { flexDirection: 'row', gap: 16 }, l: { color: '#146c43', fontWeight: '600' },
});
