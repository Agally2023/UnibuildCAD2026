import { ReactNode, useRef } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Icon, IconName } from './Icon';

// ArchiCAD-style workspace parts: menu bar with drop-down menus, tool bar, tool box buttons and collapsible panel sections.
export type RItem = { key: string; label: string; icon: IconName; onPress: () => void; active?: boolean; disabled?: boolean };
export type MItem = { label: string; onPress?: () => void; checked?: boolean; disabled?: boolean; sep?: boolean };
export type Menu = { key: string; label: string; items: MItem[] };

export function MenuBar({ menus, open, setOpen, narrow, right }: { menus: Menu[]; open: string | null; setOpen: (k: string | null) => void; narrow: boolean; right?: string }) {
  const xs = useRef<Record<string, number>>({}).current;
  const m = menus.find(x => x.key === open);
  return (
    <View style={s.mbar}>
      {menus.map(x => (
        <Pressable key={x.key} onLayout={e => { xs[x.key] = e.nativeEvent.layout.x; }} onPress={() => setOpen(open === x.key ? null : x.key)}
          style={({ hovered }: any) => [s.mi, narrow && { paddingHorizontal: 9 }, (open === x.key || hovered) && s.miOn]}><Text style={s.mt}>{x.label}</Text></Pressable>
      ))}
      {!narrow && !!right && <Text style={s.mr} numberOfLines={1}>{right}</Text>}
      {m && (
        <View style={[s.drop, { left: narrow ? 6 : xs[m.key] ?? 0 }]}>
          {m.items.map((it, i) => it.sep ? <View key={i} style={s.dsep} /> : (
            <Pressable key={i} disabled={it.disabled} onPress={() => { setOpen(null); it.onPress?.(); }} style={({ hovered }: any) => [s.di, hovered && !it.disabled && s.diHover, it.disabled && { opacity: 0.4 }]}>
              <Text style={s.dchk}>{it.checked ? '✓' : ''}</Text><Text style={s.dt}>{it.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export type TItem = { key: string; label: string; icon: IconName; onPress: () => void; active?: boolean; disabled?: boolean; sep?: boolean };
export function ToolBar({ items }: { items: TItem[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tbar} contentContainerStyle={s.tbarIn}>
      {items.map(it => it.sep ? <View key={it.key} style={s.tsep} /> : (
        <Pressable key={it.key} disabled={it.disabled} onPress={it.onPress} accessibilityLabel={it.label} {...({ title: it.label } as any)}
          style={({ hovered }: any) => [s.tb, it.active && s.tbOn, hovered && !it.active && s.btnHover, it.disabled && { opacity: 0.35 }]}>
          <Icon name={it.icon} size={20} color={it.active ? '#fff' : '#16232b'} accent={it.active ? '#cfe0ff' : '#2f5bea'} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

// a labelled button for the tool box (wide: two columns; phone: a sideways strip)
export function BoxBtn({ it, strip }: { it: RItem; strip?: boolean }) {
  return (
    <Pressable disabled={it.disabled} onPress={it.onPress} accessibilityLabel={it.label}
      style={({ hovered }: any) => [strip ? s.bs : s.bb, it.active && s.btnOn, hovered && !it.active && s.btnHover, it.disabled && { opacity: 0.35 }]}>
      <Icon name={it.icon} size={strip ? 24 : 18} color={it.active ? '#fff' : '#16232b'} accent={it.active ? '#cfe0ff' : '#2f5bea'} />
      <Text style={[s.bbl, it.active && { color: '#fff' }]} numberOfLines={1}>{it.label}</Text>
    </Pressable>
  );
}

export function Sec({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <View style={s.sec}>
      <Pressable onPress={onToggle} style={s.sech}><Text style={s.secc}>{open ? '▾' : '▸'}</Text><Text style={s.sect}>{title}</Text></Pressable>
      {open && <View style={s.secb}>{children}</View>}
    </View>
  );
}

// small controls for the Settings tab
export function Stepper({ label, value, dec, inc }: { label: string; value: string; dec: () => void; inc: () => void }) {
  return (
    <View style={s.stp}>
      <Text style={s.sl}>{label}</Text>
      <View style={s.sr}><Pressable onPress={dec} style={s.sb}><Text style={s.sbt}>−</Text></Pressable><Text style={s.sv}>{value}</Text><Pressable onPress={inc} style={s.sb}><Text style={s.sbt}>+</Text></Pressable></View>
    </View>
  );
}
export function Seg({ label, options, value, onChange }: { label: string; options: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={s.stp}>
      <Text style={s.sl}>{label}</Text>
      <View style={s.sr}>{options.map(([v, t]) => <Pressable key={v} onPress={() => onChange(v)} style={[s.seg, value === v && s.segOn]}><Text style={[s.segT, value === v && { color: '#fff' }]}>{t}</Text></Pressable>)}</View>
    </View>
  );
}
export function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable onPress={() => onChange(!on)} style={s.stp}>
      <Text style={s.sl}>{label}</Text>
      <View style={[s.seg, on && s.segOn, { minWidth: 56 }]}><Text style={[s.segT, on && { color: '#fff' }]}>{on ? 'On' : 'Off'}</Text></View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  mbar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#16232b', zIndex: 60, position: 'relative', paddingHorizontal: 4 },
  mi: { paddingHorizontal: 13, paddingVertical: 8 }, miOn: { backgroundColor: '#2c4352' }, mt: { color: '#e6edf2', fontSize: 13, fontWeight: '600' },
  mr: { flex: 1, textAlign: 'right', color: '#9fb2bf', fontSize: 12, paddingRight: 10 },
  drop: { position: 'absolute', top: '100%', minWidth: 230, backgroundColor: '#fff', borderWidth: 1, borderColor: '#aab6bd', borderRadius: 6, paddingVertical: 4, zIndex: 70, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  di: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingRight: 16 }, diHover: { backgroundColor: '#e3ebf7' },
  dchk: { width: 26, textAlign: 'center', color: '#2f5bea', fontWeight: '700' }, dt: { color: '#16232b', fontSize: 13 }, dsep: { height: 1, backgroundColor: '#d5dce1', marginVertical: 4 },
  tbar: { flexGrow: 0, backgroundColor: '#f3f6f9', borderBottomWidth: 1, borderColor: '#c5ced4' }, tbarIn: { paddingHorizontal: 6, paddingVertical: 4, alignItems: 'center', gap: 2 },
  tb: { width: 34, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 5, borderWidth: 1, borderColor: 'transparent' }, tbOn: { backgroundColor: '#2f5bea', borderColor: '#2f5bea' },
  tsep: { width: 1, height: 22, backgroundColor: '#c5ced4', marginHorizontal: 5 },
  bb: { width: '48%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6, paddingVertical: 6, borderRadius: 5, borderWidth: 1, borderColor: 'transparent' },
  bs: { width: 58, alignItems: 'center', gap: 2, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: 'transparent' },
  bbl: { fontSize: 12, color: '#16232b', fontWeight: '600', flexShrink: 1 },
  sec: { borderBottomWidth: 1, borderColor: '#dde3e8' }, sech: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 8, backgroundColor: '#e8eef2' },
  secc: { color: '#5b6b75', width: 10, fontSize: 11 }, sect: { fontSize: 11, color: '#33434d', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: '700' }, secb: { padding: 6 },
  wrap: { backgroundColor: '#f3f6f9', borderBottomWidth: 1, borderColor: '#c5ced4' },
  tabs: { flexGrow: 0, backgroundColor: '#16232b' },
  tab: { paddingHorizontal: 16, paddingVertical: 8, marginTop: 4, borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  tabOn: { backgroundColor: '#f3f6f9' }, tabT: { color: '#cdd8df', fontWeight: '600' }, tabTOn: { color: '#16232b' },
  panel: { flexGrow: 0 }, panelIn: { paddingHorizontal: 6, paddingVertical: 6 },
  group: { paddingHorizontal: 8, justifyContent: 'space-between' }, sep: { borderLeftWidth: 1, borderColor: '#d5dce1' },
  items: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  gn: { textAlign: 'center', fontSize: 11, color: '#5b6b75', marginTop: 4 },
  btn: { width: 62, paddingVertical: 6, alignItems: 'center', gap: 3, borderRadius: 6, borderWidth: 1, borderColor: 'transparent' },
  btnOn: { backgroundColor: '#2f5bea', borderColor: '#2f5bea' }, btnHover: { backgroundColor: '#e3ebf7', borderColor: '#c9d8f0' },
  bl: { fontSize: 11, color: '#16232b', fontWeight: '600' },
  stp: { alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingTop: 4, minWidth: 84 }, sl: { fontSize: 11, color: '#5b6b75' },
  sr: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sb: { width: 26, height: 26, borderRadius: 6, borderWidth: 1, borderColor: '#aab6bd', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }, sbt: { fontSize: 17, color: '#2f5bea', fontWeight: '700', lineHeight: 20 },
  sv: { minWidth: 52, textAlign: 'center', fontWeight: '700', fontSize: 13 },
  seg: { paddingHorizontal: 9, height: 26, borderRadius: 6, borderWidth: 1, borderColor: '#aab6bd', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }, segOn: { backgroundColor: '#2f5bea', borderColor: '#2f5bea' }, segT: { fontSize: 12, fontWeight: '700', color: '#16232b' },
});
