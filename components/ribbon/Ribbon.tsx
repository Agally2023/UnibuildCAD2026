import { ReactNode } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Icon, IconName } from './Icon';

// A tabbed ribbon in the style of ArchiCAD and Office: tabs on top, groups of large buttons below with the group name underneath.
export type RItem = { key: string; label: string; icon: IconName; onPress: () => void; active?: boolean; disabled?: boolean };
export type RGroup = { name: string; items?: RItem[]; custom?: ReactNode };
export type RTab = { key: string; label: string; groups: RGroup[] };

export function Ribbon({ tabs, active, onTab }: { tabs: RTab[]; active: string; onTab: (k: string) => void }) {
  const tab = tabs.find(t => t.key === active) ?? tabs[0];
  return (
    <View style={s.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabs} contentContainerStyle={{ paddingHorizontal: 6 }}>
        {tabs.map(t => (
          <Pressable key={t.key} onPress={() => onTab(t.key)} style={[s.tab, t.key === tab.key && s.tabOn]}><Text style={[s.tabT, t.key === tab.key && s.tabTOn]}>{t.label}</Text></Pressable>
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.panel} contentContainerStyle={s.panelIn}>
        {tab.groups.map((g, i) => (
          <View key={g.name} style={[s.group, i > 0 && s.sep]}>
            <View style={s.items}>
              {g.items?.map(it => (
                <Pressable key={it.key} disabled={it.disabled} onPress={it.onPress} accessibilityLabel={it.label} style={({ hovered }: any) => [s.btn, it.active && s.btnOn, hovered && !it.active && s.btnHover, it.disabled && { opacity: 0.35 }]}>
                  <Icon name={it.icon} color={it.active ? '#fff' : '#16232b'} accent={it.active ? '#cfe0ff' : '#2f5bea'} />
                  <Text style={[s.bl, it.active && { color: '#fff' }]} numberOfLines={1}>{it.label}</Text>
                </Pressable>
              ))}
              {g.custom}
            </View>
            <Text style={s.gn}>{g.name}</Text>
          </View>
        ))}
      </ScrollView>
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
