import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { lastProject, session } from '../lib/session';

type Project = { id: string; name: string };

export default function Projects() {
  const [items, setItems] = useState<Project[]>([]);
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const router = useRouter();

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('projects').select('id,name').order('created_at', { ascending: false });
    if (error) return setErr(error.message);
    setItems(data ?? []);
    // straight into the working space: the last project used, else the newest
    if (!session.autoOpened && data?.length) {
      session.autoOpened = true;
      const last = await lastProject();
      router.replace(`/project/${data.find(p => p.id === last)?.id ?? data[0].id}` as any);
    }
  }, [router]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!name.trim()) return;
    const { data, error } = await supabase.from('projects').insert({ name: name.trim() }).select('id').single();
    if (error || !data) return setErr(error?.message ?? 'Could not create project');
    await supabase.from('stories').insert({ project_id: data.id, name: 'Ground floor', elevation_m: 0, height_m: 3.6 });
    setName(''); session.autoOpened = true; router.replace(`/project/${data.id}` as any);
  };

  return (
    <View style={s.wrap}>
      <View style={s.row}>
        <TextInput style={[s.in, { flex: 1 }]} placeholder="New project name" value={name} onChangeText={setName} />
        <Pressable style={s.btn} onPress={create}><Text style={s.bt}>Create</Text></Pressable>
      </View>
      {!!err && <Text style={{ color: '#c62828' }}>{err}</Text>}
      <FlatList data={items} keyExtractor={p => p.id}
        ListEmptyComponent={<Text style={{ color: '#5b6b75' }}>No projects yet. Name one above and tap Create: it opens the Plan, ready to draw.</Text>}
        renderItem={({ item }) => (
          <Pressable style={s.card} onPress={() => router.push(`/project/${item.id}` as any)}><Text style={s.ct}>{item.name}</Text></Pressable>
        )} />
      <Pressable onPress={() => supabase.auth.signOut()}><Text style={{ color: '#2f5bea' }}>Sign out</Text></Pressable>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { flex: 1, padding: 16, gap: 12 },
  row: { flexDirection: 'row', gap: 8 },
  in: { borderWidth: 1, borderColor: '#c5ced4', borderRadius: 8, padding: 12, fontSize: 16 },
  btn: { backgroundColor: '#2f5bea', paddingHorizontal: 18, justifyContent: 'center', borderRadius: 8 },
  bt: { color: '#fff', fontWeight: '600' },
  card: { padding: 16, borderWidth: 1, borderColor: '#d5dce1', borderRadius: 10, marginBottom: 8 },
  ct: { fontSize: 17, fontWeight: '600' },
});
