import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { supabase } from '../lib/supabase';

export default function Layout() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSignedIn(!!data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const onLogin = (segments as string[]).length === 0;
    if (!signedIn && !onLogin) router.replace('/');
    if (signedIn && onLogin) router.replace('/projects');
  }, [ready, signedIn, segments]);

  return <Stack screenOptions={{ headerTitleStyle: { fontWeight: '700' } }}>
    <Stack.Screen name="index" options={{ title: 'Unibuild' }} />
    <Stack.Screen name="projects" options={{ title: 'Projects' }} />
    <Stack.Screen name="project/[id]" options={{ title: 'Plan' }} />
    <Stack.Screen name="view3d/[id]" options={{ title: '3D view' }} />
    <Stack.Screen name="dashboard/[id]" options={{ title: 'Dashboard' }} />
    <Stack.Screen name="clashes/[id]" options={{ title: 'Clash detection' }} />
    <Stack.Screen name="design/[id]" options={{ title: 'Member design (EC2)' }} />
    <Stack.Screen name="foundations/[id]" options={{ title: 'Slab and foundations' }} />
    <Stack.Screen name="import/[id]" options={{ title: 'Import IFC' }} />
    <Stack.Screen name="mep/[id]" options={{ title: 'MEP routing and sizing' }} />
    <Stack.Screen name="lateral/[id]" options={{ title: 'Wind and earthquake' }} />
  </Stack>;
}
