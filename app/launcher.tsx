// The launcher: a honeycomb of hexagonal tiles in a digital control-panel style. Three tiles open the main workspaces (mechanical,
// construction and civil, vehicles) and the middle tile is the power button that starts the system and opens the last project.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Pattern, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
import { supabase } from '../lib/supabase';
import { lastProject, rememberProject, session } from '../lib/session';

type Kind = 'gear' | 'building' | 'car' | 'power';
const TONE: Record<Kind, { c: string; dim: string }> = {
  gear: { c: '#ffb02e', dim: '#3a2a0a' }, building: { c: '#27e1ff', dim: '#0a2f3a' }, car: { c: '#ff5ea8', dim: '#3a0f26' }, power: { c: '#3dff9a', dim: '#0a3a24' },
};
const S3 = Math.sqrt(3);

// ----- line icons, drawn in a box of about 60 units around (0,0) -----
const gearPath = (rO: number, rI: number, n: number) => {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, w = Math.PI / n;
    [[a - w * 0.55, rI], [a - w * 0.3, rO], [a + w * 0.3, rO], [a + w * 0.55, rI]].forEach(([t, r]) => pts.push(`${(Math.cos(t) * r).toFixed(1)},${(Math.sin(t) * r).toFixed(1)}`));
  }
  return `M${pts.join('L')}Z`;
};
const arc = (r: number, a0: number, a1: number) => { const p = (a: number) => `${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`; return `M${p(a0)}A${r} ${r} 0 1 1 ${p(a1)}`; };
function Icon({ kind, color }: { kind: Kind; color: string }) {
  const p = { stroke: color, strokeWidth: 2.4, fill: 'none', strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  if (kind === 'gear') return <G><Path d={gearPath(30, 22, 10)} {...p} /><Circle r={9} {...p} /><Circle r={2} fill={color} /></G>;
  if (kind === 'building') {
    const win: JSX.Element[] = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 2; c++) win.push(<Rect key={`${r}${c}`} x={-17 + c * 15} y={-27 + r * 11} width={7} height={5} {...p} strokeWidth={1.6} />);
    return <G><Path d="M-22 30V-32H8V30" {...p} />{win}<Path d="M8 -6H26V30" {...p} /><Path d="M-28 30H30" {...p} /><Rect x={13} y={2} width={5} height={5} {...p} strokeWidth={1.6} /><Rect x={13} y={14} width={5} height={5} {...p} strokeWidth={1.6} /></G>;
  }
  if (kind === 'car') return <G><Path d="M-34 12V2C-34 -2 -31 -4 -26 -5L-17 -6L-8 -18C-6 -20 -4 -21 0 -21H12C16 -21 18 -20 20 -18L27 -6L32 -4C35 -3 36 0 36 4V12" {...p} /><Path d="M-34 12H-26M-10 12H18M34 12H36" {...p} /><Circle cx={-18} cy={12} r={8} {...p} /><Circle cx={26} cy={12} r={8} {...p} /><Path d="M-12 -6L-5 -16H6V-6ZM11 -6V-16H15L21 -6Z" {...p} strokeWidth={1.6} /></G>;
  return <G><Path d={arc(24, -Math.PI / 2 + 0.62, -Math.PI / 2 - 0.62)} {...p} strokeWidth={3.6} /><Line x1={0} y1={-32} x2={0} y2={-6} {...p} strokeWidth={3.6} /></G>;
}

type Tile = { kind: Kind; label: string; sub: string; key: string; x: number; y: number; id: string };

function Hex({ t, R, on, lit, press, hot }: { t: Tile; R: number; on: boolean; lit: number; press: () => void; hot: boolean }) {
  const [hover, setHover] = useState(false);
  const w = 2 * R, h = S3 * R, tone = TONE[t.kind], a = on || hover ? 1 : 0.0;
  const pts = (k: number) => Array.from({ length: 6 }, (_, i) => `${(R + k * R * Math.cos((i * Math.PI) / 3)).toFixed(1)},${(h / 2 + k * R * Math.sin((i * Math.PI) / 3)).toFixed(1)}`).join(' ');
  const glow = 0.25 + 0.2 * lit + a * 0.35;
  return (
    <Pressable testID={t.id} accessibilityLabel={`${t.label}. ${t.sub}`} onPress={press} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)} style={{ position: 'absolute', left: t.x - R, top: t.y - h / 2, width: w, height: h }}>
      <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <Defs>
          <LinearGradient id={`g-${t.id}`} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={tone.dim} stopOpacity={0.95} /><Stop offset="1" stopColor="#050b14" stopOpacity={0.98} /></LinearGradient>
        </Defs>
        <Polygon points={pts(1.0)} fill="none" stroke={tone.c} strokeOpacity={glow * 0.28} strokeWidth={14} strokeLinejoin="round" />
        <Polygon points={pts(1.0)} fill="none" stroke={tone.c} strokeOpacity={glow * 0.5} strokeWidth={7} strokeLinejoin="round" />
        <Polygon points={pts(0.96)} fill={`url(#g-${t.id})`} stroke={tone.c} strokeWidth={a ? 3.2 : 2.2} strokeLinejoin="round" />
        <Polygon points={pts(0.86)} fill="none" stroke={tone.c} strokeOpacity={0.35} strokeWidth={1} strokeDasharray="3 5" />
        {[0, 1, 2, 3, 4, 5].map(i => { const ang = (i * Math.PI) / 3, x = R + 0.96 * R * Math.cos(ang), y = h / 2 + 0.96 * R * Math.sin(ang); return <Circle key={i} cx={x} cy={y} r={3.4} fill={tone.c} opacity={0.9} />; })}
        <G transform={`translate(${R} ${h / 2 - R * 0.1}) scale(${R / 100 * 1.25})`}><Icon kind={t.kind} color={tone.c} /></G>
      </Svg>
      <View pointerEvents="none" style={s.tileText}>
        <Text style={[s.tLabel, { color: tone.c, fontSize: Math.max(9, R * 0.12), letterSpacing: R < 80 ? 0.6 : 2.5 }]}>{t.label}</Text>
        <Text style={[s.tSub, { fontSize: Math.max(8, R * 0.085) }]}>{hot ? 'Booting…' : t.sub}</Text>
      </View>
    </Pressable>
  );
}

export default function Launcher() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const [tick, setTick] = useState(0), [boot, setBoot] = useState<string[]>([]), [email, setEmail] = useState(''), [now, setNow] = useState(new Date()), [err, setErr] = useState('');
  const booting = useRef(false);

  useEffect(() => { const i = setInterval(() => { setTick(t => t + 1); }, 60); const c = setInterval(() => setNow(new Date()), 1000); return () => { clearInterval(i); clearInterval(c); }; }, []);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? '')); }, []);

  // the project to open: the last one used, else the newest, else a first project is made
  const project = useCallback(async (): Promise<string | null> => {
    const { data, error } = await supabase.from('projects').select('id,name').order('created_at', { ascending: false });
    if (error) { setErr(error.message); return null; }
    const last = await lastProject();
    let id = data?.find(p => p.id === last)?.id ?? data?.[0]?.id ?? null;
    if (!id) {
      const made = await supabase.from('projects').insert({ name: 'My first project' }).select('id').single();
      if (made.error || !made.data) { setErr(made.error?.message ?? 'Could not create a project'); return null; }
      id = made.data.id as string;
      await supabase.from('stories').insert({ project_id: id, name: 'Ground floor', elevation_m: 0, height_m: 3.6 });
    }
    rememberProject(id); session.autoOpened = true;
    return id;
  }, []);

  const open = useCallback(async (to: (id: string) => string) => { setErr(''); const id = await project(); if (id) router.push(to(id) as any); }, [project, router]);
  const power = useCallback(async () => {
    if (booting.current) return; booting.current = true; setErr('');
    const lines = ['POWER ON', 'Starting the geometry kernel', 'Loading parts, vehicles and building templates', 'Mounting your project library', 'All systems online'];
    const idP = project();
    for (const l of lines) { setBoot(b => [...b, l]); await new Promise(r => setTimeout(r, 380)); }
    const id = await idP;
    booting.current = false;
    if (id) { setBoot([]); router.replace(`/project/${id}` as any); } else setBoot([]);
  }, [project, router]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const k = (e: KeyboardEvent) => {
      if (e.key === '1') void open(id => `/parts/${id}?tab=mech`); else if (e.key === '2') void open(id => `/project/${id}`); else if (e.key === '3') void open(id => `/parts/${id}?tab=veh`); else if (e.key === 'Enter') void power();
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [open, power]);

  const R = Math.max(54, Math.min(112, (width - 28) / 5.3, (height - 250) / 4.6)), d = S3 * R * 1.035;
  const cw = 5.2 * R, ch = 4.5 * R, ox = cw / 2, oy = 1.85 * R;
  const at = (ang: number): [number, number] => [ox + d * Math.cos((ang * Math.PI) / 180), oy + d * Math.sin((ang * Math.PI) / 180)];
  const [gx, gy] = at(-150), [bx, by] = at(-30), [cx, cy] = at(90);
  const tiles: Tile[] = [
    { kind: 'gear', id: 'launch-gear', key: '1', label: 'MECHANICAL', sub: 'Parts and machines', x: gx, y: gy },
    { kind: 'building', id: 'launch-building', key: '2', label: 'CONSTRUCTION', sub: 'Building and civil', x: bx, y: by },
    { kind: 'car', id: 'launch-car', key: '3', label: 'VEHICLES', sub: 'Cars, trucks, brands', x: cx, y: cy },
    { kind: 'power', id: 'launch-power', key: '↵', label: 'START', sub: 'Power on', x: ox, y: oy },
  ];
  const press = (k: Kind) => (k === 'gear' ? open(id => `/parts/${id}?tab=mech`) : k === 'building' ? open(id => `/project/${id}`) : k === 'car' ? open(id => `/parts/${id}?tab=veh`) : power());
  const pulse = 0.5 + 0.5 * Math.sin(tick / 9), scan = ((tick * 6) % (height + 200)) - 100, on = boot.length > 0;
  const hh = String(now.getHours()).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0'), ss = String(now.getSeconds()).padStart(2, '0');

  return (
    <View style={s.root}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <Pattern id="grid" width={36} height={36} patternUnits="userSpaceOnUse"><Path d="M36 0H0V36" fill="none" stroke="#12304a" strokeWidth={1} /></Pattern>
          <RadialGradient id="glow" cx="50%" cy="46%" r="55%"><Stop offset="0" stopColor="#0f3a52" stopOpacity={0.75} /><Stop offset="1" stopColor="#060d18" stopOpacity={0} /></RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#grid)" opacity={0.55} />
        <Rect width="100%" height="100%" fill="url(#glow)" />
        <Rect x={0} y={scan} width="100%" height={2} fill="#27e1ff" opacity={0.10} />
      </Svg>

      <View style={s.top}>
        <Text style={s.brand}>UNIBUILD <Text style={{ color: '#27e1ff' }}>CAD</Text></Text>
        <Text style={s.stat}><Text style={{ color: on ? '#3dff9a' : '#ffb02e' }}>●</Text>  {on ? 'SYSTEM STARTING' : 'STANDBY'}   {hh}:{mm}:{ss}</Text>
      </View>

      <View style={s.center}>
        <Text style={[s.title, width < 500 && { letterSpacing: 1.5, fontSize: 11 }]}>Design, create, test and build</Text>
        <View style={{ width: cw, height: ch }}>
          {tiles.map(t => <Hex key={t.id} t={t} R={R} on={t.kind === 'power' && (on || pulse > 0.5)} lit={t.kind === 'power' ? pulse : 0.3} hot={t.kind === 'power' && on} press={() => { void press(t.kind); }} />)}
        </View>
        {on ? <View style={s.log}>{boot.map((l, i) => <Text key={i} style={s.logT}>{i === boot.length - 1 ? '▸ ' : '✓ '}{l}</Text>)}</View>
          : <Text style={[s.hint, { textAlign: 'center', paddingHorizontal: 16 }]}>{width < 600 ? 'Tap a hexagon to open it' : <>Press a hexagon to open it   ·   keys <Text style={s.kbd}>1</Text> <Text style={s.kbd}>2</Text> <Text style={s.kbd}>3</Text> <Text style={s.kbd}>Enter</Text></>}</Text>}
        {!!err && <Text style={s.err}>{err}</Text>}
      </View>

      <View style={s.bottom}>
        <Pressable testID="launch-projects" onPress={() => { session.autoOpened = true; router.push('/projects' as any); }}><Text style={s.link}>ALL PROJECTS</Text></Pressable>
        <Pressable testID="launch-manual" onPress={() => router.push('/manual' as any)}><Text style={s.link}>MANUAL</Text></Pressable>
        <Text style={s.user}>{email}</Text>
        <Pressable testID="launch-signout" onPress={() => { void supabase.auth.signOut(); }}><Text style={[s.link, { color: '#ff5ea8' }]}>SIGN OUT</Text></Pressable>
      </View>
    </View>
  );
}

const mono = Platform.select({ web: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', default: 'Courier' });
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060d18' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#12304a' },
  brand: { color: '#e6f4ff', fontWeight: '800', letterSpacing: 4, fontSize: 15, fontFamily: mono },
  stat: { color: '#7fb3cc', fontSize: 12, letterSpacing: 1.5, fontFamily: mono },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  title: { color: '#9fd6ee', letterSpacing: 5, fontSize: 12, textTransform: 'uppercase', fontFamily: mono },
  tileText: { position: 'absolute', left: 0, right: 0, bottom: '17%', alignItems: 'center' },
  tLabel: { fontWeight: '800', letterSpacing: 2.5, fontFamily: mono },
  tSub: { color: '#8fb4c8', marginTop: 2, fontFamily: mono },
  hint: { color: '#6f9bb2', fontSize: 12, letterSpacing: 1, fontFamily: mono },
  kbd: { color: '#27e1ff', borderWidth: 1, borderColor: '#27e1ff' },
  log: { alignSelf: 'center', minWidth: 300, gap: 3 },
  logT: { color: '#3dff9a', fontSize: 12, fontFamily: mono },
  err: { color: '#ff7a7a', fontSize: 12, fontFamily: mono },
  bottom: { flexDirection: 'row', gap: 22, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderColor: '#12304a' },
  link: { color: '#27e1ff', letterSpacing: 2, fontSize: 12, fontFamily: mono },
  user: { color: '#5e8499', fontSize: 11, fontFamily: mono },
});
