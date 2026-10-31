import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');

  const go = async (signUp: boolean) => {
    setMsg('');
    const fn = signUp ? supabase.auth.signUp : supabase.auth.signInWithPassword;
    const { error } = await fn.call(supabase.auth, { email, password });
    if (error) setMsg(error.message);
    else if (signUp) setMsg('Account created. Check your email if confirmation is on, then sign in.');
  };

  return (
    <View style={s.wrap}>
      <Text style={s.h1}>One model for architecture, structure and MEP</Text>
      <TextInput style={s.in} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={s.in} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
      <Pressable style={s.btn} onPress={() => go(false)}><Text style={s.bt}>Sign in</Text></Pressable>
      <Pressable style={[s.btn, s.alt]} onPress={() => go(true)}><Text style={[s.bt, { color: '#2f5bea' }]}>Create account</Text></Pressable>
      {!!msg && <Text style={s.msg}>{msg}</Text>}
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { flex: 1, padding: 24, justifyContent: 'center', gap: 12, maxWidth: 440, width: '100%', alignSelf: 'center' },
  h1: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  in: { borderWidth: 1, borderColor: '#c5ced4', borderRadius: 8, padding: 12, fontSize: 16 },
  btn: { backgroundColor: '#2f5bea', padding: 14, borderRadius: 8, alignItems: 'center' },
  alt: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#2f5bea' },
  bt: { color: '#fff', fontWeight: '600', fontSize: 16 },
  msg: { color: '#c62828' },
});
