import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { supabase } from '../lib/supabase';
import { clearModelCache } from '../lib/useModel';
import { session } from '../lib/session';

export default function Layout() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSignedIn(!!data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { if (!s) { clearModelCache(); session.autoOpened = false; } setSignedIn(!!s); });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const onLogin = (segments as string[]).length === 0;
    if (!signedIn && !onLogin) router.replace('/');
    if (signedIn && onLogin) router.replace('/projects');
  }, [ready, signedIn, segments]);

  const toHub = ({ route }: { route: { name: string; params?: any } }) => ({
    headerTitleStyle: { fontWeight: '700' as const },
    headerRight: route.params?.id && route.name !== 'hub/[id]' && route.name !== 'project/[id]'
      ? () => <Pressable onPress={() => router.navigate(`/hub/${route.params.id}` as any)}><Text style={{ color: '#146c43', fontWeight: '700' }}>☰ Modules</Text></Pressable>
      : undefined,
  });

  return <Stack screenOptions={toHub as any}>
    <Stack.Screen name="index" options={{ title: 'Unibuild' }} />
    <Stack.Screen name="manual" options={{ title: 'Manual and guides' }} />
    <Stack.Screen name="schedules/[id]" options={{ title: 'Schedules' }} />
    <Stack.Screen name="views/[id]" options={{ title: 'Elevations and sections' }} />
    <Stack.Screen name="projects" options={{ title: 'Projects' }} />
    <Stack.Screen name="hub/[id]" options={{ title: 'Modules' }} />
    <Stack.Screen name="project/[id]" options={{ title: 'Plan', headerShown: false }} />
    <Stack.Screen name="view3d/[id]" options={{ title: '3D view' }} />
    <Stack.Screen name="dashboard/[id]" options={{ title: 'Dashboard' }} />
    <Stack.Screen name="clashes/[id]" options={{ title: 'Clash detection' }} />
    <Stack.Screen name="design/[id]" options={{ title: 'Member design' }} />
    <Stack.Screen name="foundations/[id]" options={{ title: 'Slab and foundations' }} />
    <Stack.Screen name="import/[id]" options={{ title: 'Import IFC' }} />
    <Stack.Screen name="mep/[id]" options={{ title: 'MEP routing and sizing' }} />
    <Stack.Screen name="lateral/[id]" options={{ title: 'Wind and earthquake' }} />
  </Stack>;
}
