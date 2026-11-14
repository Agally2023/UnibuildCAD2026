import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { lastProject, session } from '../lib/session';
import { deleteProject } from '../lib/projectDelete';
import { askConfirm } from '../components/confirm';

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

  const remove = async (p: Project) => {
    if (!(await askConfirm(`Delete "${p.name}"?`, 'The project and everything in it (drawings, storeys, designs, issues, snapshots) will be deleted for good. This cannot be undone.'))) return;
    const e = await deleteProject(p.id);
    if (e) return setErr(e);
    setErr(''); setItems(a => a.filter(x => x.id !== p.id));
  };
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
        ListEmptyComponent={<Text style={{ color: '#4f6a5b' }}>No projects yet. Name one above and tap Create: it opens the Plan, ready to draw.</Text>}
        renderItem={({ item }) => (
          <View style={[s.card, s.cardRow]}>
            <Pressable style={{ flex: 1 }} testID={`open-${item.id}`} onPress={() => router.push(`/project/${item.id}` as any)}><Text style={s.ct}>{item.name}</Text></Pressable>
            <Pressable testID={`delete-${item.id}`} accessibilityLabel={`Delete ${item.name}`} onPress={() => remove(item)} style={s.del}><Text style={s.delT}>Delete</Text></Pressable>
          </View>
        )} />
      <Pressable onPress={() => router.push('/manual' as any)}><Text style={{ color: '#146c43', fontWeight: '700' }}>Manual and guides</Text></Pressable>
      <Pressable onPress={() => supabase.auth.signOut()}><Text style={{ color: '#146c43' }}>Sign out</Text></Pressable>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { flex: 1, padding: 16, gap: 12 },
  row: { flexDirection: 'row', gap: 8 },
  in: { borderWidth: 1, borderColor: '#bccfc3', borderRadius: 8, padding: 12, fontSize: 16 },
  btn: { backgroundColor: '#146c43', paddingHorizontal: 18, justifyContent: 'center', borderRadius: 8 },
  bt: { color: '#fff', fontWeight: '600' },
  card: { padding: 16, borderWidth: 1, borderColor: '#cfdcd4', borderRadius: 10, marginBottom: 8 },
  ct: { fontSize: 17, fontWeight: '600' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, del: { borderWidth: 1, borderColor: '#c62828', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }, delT: { color: '#c62828', fontWeight: '700' },
});
