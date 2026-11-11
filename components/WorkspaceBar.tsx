import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

export type WS = 'civil' | 'mech' | 'auto';
const ITEMS: [WS, string, string][] = [['civil', '🏗', 'Construction & Civil'], ['mech', '⚙', 'Mechanical'], ['auto', '🚗', 'Automotive']];
// The three workspaces of Unibuild, always on the top of the screen
export default function WorkspaceBar({ current, projectId }: { current: WS; projectId?: string }) {
  const r = useRouter();
  const go = (w: WS) => { if (w === current) return; if (w === 'civil') r.replace((projectId ? `/project/${projectId}` : '/projects') as any); else r.replace(`/parts/new?ws=${w}` as any); };
  const back = () => { if (r.canGoBack()) r.back(); else r.replace('/launcher' as any); };
  return (
    <View style={s.bar} testID="workspace-bar">
      <Pressable testID="ws-back" onPress={back} accessibilityLabel="Go back" style={s.back}><Text style={s.backT}>←</Text></Pressable>
      {ITEMS.map(([k, ic, label]) => (
        <Pressable key={k} testID={`ws-${k}`} onPress={() => go(k)} style={[s.b, current === k && s.on]}>
          <Text style={[s.t, current === k && s.tOn]} numberOfLines={1}>{ic} {label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
const s = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: '#07261a', paddingHorizontal: 6, paddingTop: 4, gap: 4 },
  back: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#146c43', marginBottom: 2, alignSelf: 'center' },
  backT: { color: '#fff', fontWeight: '900', fontSize: 18 },
  b: { paddingVertical: 8, paddingHorizontal: 14, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: '#0e3a28' },
  on: { backgroundColor: '#146c43' },
  t: { color: '#9fd3b8', fontWeight: '700', fontSize: 13 },
  tOn: { color: '#fff' },
});
