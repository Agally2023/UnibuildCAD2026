import { useEffect, useMemo, useState } from 'react';
import { cname } from '../../lib/rc';
import Svg, { Line as SLine, Polyline, Rect as SRect, Text as SText } from 'react-native-svg';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useModel } from '../../lib/useModel';
import { groupByStory } from '../../lib/model';
import { CLASSES, designAll, Status } from '../../lib/design';
import { lateralAnalysis } from '../../lib/lateral';
import { lat, setLat, dsn, setDsn } from '../../lib/settings';
import { designFoundations } from '../../lib/slabfound';
import { equivalentFrame } from '../../lib/eqframe';

const IMPOSED = [['Residential', 2], ['Office', 3], ['Laboratory', 4]] as const;
const COL: Record<Status, string> = { ok: '#1a8f4d', warn: '#c4620a', bad: '#c62828' };
const n0 = (x: number) => Math.round(x).toLocaleString('en-US');

export default function SlabFoundations() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { els, lib, stories } = useModel(id);
  const [code, setCode] = useState<'EC2' | 'BS8110'>(dsn.code);
  const [cls, setCls] = useState(dsn.cls);
  const [use, setUse] = useState(dsn.use);
  const [trib, setTrib] = useState(dsn.trib);
  const [q, setQ] = useState(dsn.q);
  useEffect(() => { setDsn({ code, cls, use, trib, q }); }, [code, cls, use, trib, q]);
  const [msg, setMsg] = useState('');

  const fck = CLASSES[cls], mat = { fck, fyk: code === 'BS8110' ? 460 : 500, code };
  const groups = useMemo(() => groupByStory(els, stories), [els, stories]);
  const [latOn, setLatOn] = useState(lat.on);
  const [vb, setVb] = useState(lat.vb);
  const [ag, setAg] = useState(lat.ag);
  const [base, setBase] = useState<'fixed' | 'pinned'>(lat.base);
  const [gbOn, setGbOn] = useState(false);
  const lateral = useMemo(() => {
    if (!latOn || !els.some(e => e.type === 'column')) return undefined;
    const grav = designAll(groups, lib, mat, { imposed: IMPOSED[use][1], defaultTrib: trib });
    return lateralAnalysis(groups, lib, mat, grav, { imposed: IMPOSED[use][1], wind: lat.wind ? { vb, terrain: lat.terrain as 0 | 1 | 2 | 3 | 4 } : undefined, seismic: lat.seis ? { agG: ag, ground: (['A', 'B', 'C', 'D', 'E'] as const)[lat.ground], q: lat.q, psi2: 0.3 } : undefined, base });
  }, [groups, lib, fck, code, use, trib, latOn, vb, ag, base]);
  const r = useMemo(() => designFoundations(groups, lib, mat, { imposed: IMPOSED[use][1], defaultTrib: trib, qAllow: q , lateral, groundBeams: gbOn }), [gbOn, groups, lib, fck, use, trib, q, code, lateral]);
  const sl = r.slab;
  // flat-slab bending by equivalent frame, one result per flat storey
  const eq = useMemo(() => {
    const out: Record<string, ReturnType<typeof equivalentFrame>> = {};
    groups.forEach((gr, i) => { const st = r.slabs.find(x => x.story === gr.story.name && x.mode === 'flat'); if (st) out[st.story] = equivalentFrame(gr, lib, mat, { imposed: IMPOSED[use][1], h: st.h, colsAbove: i < groups.length - 1 }); });
    return out;
  }, [groups, lib, r, use, fck, code]);

  const save = async () => {
    const { error } = await supabase.from('snapshots').insert({
      project_id: id, label: `${code === 'BS8110' ? 'BS 8110' : 'EC2'} slab and foundations ${cname(fck)}`,
      summary: { kind: 'slab_foundations', code: code === 'BS8110' ? 'BS 8110-1' : 'EN 1992-1-1', fck, qAllow: q, storeys: groups.length, slab_h_mm: sl.h, footings: r.footings.length, foundation_concrete_m3: r.foundConcrete, foundation_steel_t: r.foundSteelT, slab_steel_t: r.slabSteelT, cost: { total: 0 } },
    });
    setMsg(error ? error.message : 'Summary saved');
  };

  const Step = ({ label, value, dec, inc }: { label: string; value: string; dec: () => void; inc: () => void }) => (
    <View style={s.step}><Text style={s.k}>{label}</Text><Pressable onPress={dec}><Text style={s.btn}>−</Text></Pressable><Text style={s.v}>{value}</Text><Pressable onPress={inc}><Text style={s.btn}>+</Text></Pressable></View>
  );
  const Card = ({ title, status, rows, notes }: { title: string; status: Status; rows: [string, string][]; notes: string[] }) => (
    <View style={[s.card, { borderLeftColor: COL[status] }]}>
      <Text style={s.h}>{title}</Text>
      {rows.map(([k, v]) => <View key={k} style={s.row}><Text style={s.k}>{k}</Text><Text style={s.v}>{v}</Text></View>)}
      {notes.map(n => <Text key={n} style={{ color: COL[status], marginTop: 4 }}>{n}</Text>)}
    </View>
  );

  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <View style={s.step}>
        {([['EC2', 'Eurocode 2'], ['BS8110', 'BS 8110']] as const).map(([k, l]) => <Pressable key={k} onPress={() => setCode(k)} style={[s.chip, code === k && s.chipOn]}><Text style={[s.chipT, code === k && { color: '#fff' }]}>{l}</Text></Pressable>)}
      </View>
      <Step label="Concrete" value={`${cname(fck)}`} dec={() => setCls(c => Math.max(0, c - 1))} inc={() => setCls(c => Math.min(CLASSES.length - 1, c + 1))} />
      <Step label="Use" value={`${IMPOSED[use][0]} ${IMPOSED[use][1]} kN/m²`} dec={() => setUse(u => Math.max(0, u - 1))} inc={() => setUse(u => Math.min(2, u + 1))} />
      <Step label="Default tributary width" value={`${trib.toFixed(1)} m`} dec={() => setTrib(v => Math.max(1, v - 0.5))} inc={() => setTrib(v => Math.min(9, v + 0.5))} />
      <Step label="Allowable bearing" value={`${q} kPa`} dec={() => setQ(v => Math.max(25, v - 25))} inc={() => setQ(v => Math.min(600, v + 25))} />
      <Pressable onPress={() => { setLatOn(v => !v); setLat({ on: !latOn }); }}><Text style={s.l}>{latOn ? '✓ ' : '○ '}Include wind and earthquake loads (overturning, shear, uplift)</Text></Pressable>
      {latOn && <>
        <Step label="Basic wind speed" value={`${vb} m/s`} dec={() => { setVb(v => Math.max(15, v - 1)); setLat({ vb: Math.max(15, vb - 1) }); }} inc={() => { setVb(v => Math.min(50, v + 1)); setLat({ vb: Math.min(50, vb + 1) }); }} />
        <Step label="Ground acceleration ag/g" value={ag.toFixed(2)} dec={() => { const v = Math.max(0, +(ag - 0.02).toFixed(2)); setAg(v); setLat({ ag: v }); }} inc={() => { const v = Math.min(0.5, +(ag + 0.02).toFixed(2)); setAg(v); setLat({ ag: v }); }} />
        <Pressable onPress={() => { const b = base === 'fixed' ? 'pinned' : 'fixed'; setBase(b); setLat({ base: b }); }}><Text style={s.l}>Column bases: {base === 'fixed' ? 'fixed (ground beams or raft restrain rotation)' : 'pinned (isolated pads, no base moment)'} · tap to change</Text></Pressable>
        <Text style={s.k}>Terrain, ground type and behaviour factor come from the Wind & quake screen. Bearing pressure under lateral combinations may be 25% higher.</Text>
      </>}
      <Pressable onPress={() => setGbOn(v => !v)}><Text style={s.l}>{gbOn ? '✓ ' : '○ '}Ground beams between the footings (tie the pads and restrain the column bases)</Text></Pressable>
      <Text style={s.warn}>Set the allowable bearing pressure from your site soil investigation. 150 kPa is only a placeholder.</Text>

      <Text style={s.t}>Slab</Text>
      <Card title={`${Math.round(sl.h)} mm slab, ${sl.lx.toFixed(1)} × ${sl.ly.toFixed(1)} m bay`} status={sl.status} notes={sl.notes}
        rows={[['Type', sl.type], ['Design load', `${sl.n.toFixed(1)} kN/m²`], ['Moment support / span', `${sl.mNeg.toFixed(1)} / ${sl.mPos.toFixed(1)} kNm/m`], ['Top bars (each way)', sl.topBars], ['Bottom bars (each way)', sl.botBars], ['Span/depth (actual / allowed)', `${sl.ld.toFixed(1)} / ${sl.ldAllowed.toFixed(1)}`], ['Crack width / limit', `${sl.wk.toFixed(2)} / 0.30 mm`], ['Concrete / steel per floor', `${n0(sl.concreteM3)} m³ / ${n0(sl.steelKg)} kg`]]} />

      {r.slabs.map((st, si) => st.mode === 'none' ? null : (
        <View key={st.story} style={{ gap: 8 }}>
          <Text style={s.t}>{st.mode === 'flat' ? 'Flat slab: punching and equivalent frame' : 'Slab panels'}: {st.story}</Text>
          <Text style={s.k}>{st.h} mm slab · {st.mode === 'panels' ? `${st.panels.length} panels · ${Math.round(st.steelKg)} kg of steel` : `${st.punching.length} columns checked${st.hNoLinks ? ` · ${st.hNoLinks} mm needs no punching links` : ''}`}</Text>
          {st.notes.map(n => <Text key={n} style={s.warn}>{n}</Text>)}
          {si === 0 && st.panels.slice(0, 12).map(p => (
            <Card key={p.label} title={`Panel ${p.label}: ${p.w.toFixed(1)} × ${p.d.toFixed(1)} m, ${p.type.split(' (')[0]}`} status={p.status} notes={[...p.notes, ...(p.torsion ? [p.torsion] : [])]}
              rows={[['Moments x (support / span)', `${p.mxNeg.toFixed(1)} / ${p.mxPos.toFixed(1)} kNm/m`], ['Moments y (support / span)', `${p.myNeg.toFixed(1)} / ${p.myPos.toFixed(1)} kNm/m`], ['Bottom bars (short / long span)', `${p.bottomX} / ${p.bottomY}`], ['Top bars at edges', p.topEdges], ['Span/depth · crack width', `${p.ld.toFixed(1)} / ${p.ldAllowed.toFixed(1)} · ${p.wk.toFixed(2)} mm`]]} />
          ))}
          {si === 0 && st.panels.length > 12 && <Text style={s.k}>…and {st.panels.length - 12} more panels (all are in the report and the steel total).</Text>}
          {si === 0 && st.punching.slice(0, 12).map((p, i) => (
            <Card key={p.id} title={`Column ${i + 1} (${p.kind}): ${p.c1}×${p.c2} mm`} status={p.status} notes={p.notes}
              rows={[['Shear stress / capacity', `${p.vEd.toFixed(2)} / ${p.vRd.toFixed(2)} N/mm²`], ['Ratio', p.ratio.toFixed(2)], ['Load from the bays', `${Math.round(p.V)} kN`]]} />
          ))}
          {st.mode === 'flat' && (eq[st.story]?.lines ?? []).map(l => (
            <Card key={`${l.dir}${l.at}`} title={`Equivalent frame ${l.dir.toUpperCase()}-direction, line at ${l.at.toFixed(1)} m (${l.width.toFixed(1)} m wide)`} status={l.status} notes={l.notes}
              rows={[['Column / middle strip', `${l.csWidth.toFixed(1)} / ${l.msWidth.toFixed(1)} m`], ['Top bars (column / middle)', `${l.bars.topCS} / ${l.bars.topMS}`], ['Bottom bars (column / middle)', `${l.bars.botCS} / ${l.bars.botMS}`], ['Top moments (column / middle)', `${l.mTopCS.toFixed(0)} / ${l.mTopMS.toFixed(0)} kNm/m`], ['Bottom moments (column / middle)', `${l.mBotCS.toFixed(0)} / ${l.mBotMS.toFixed(0)} kNm/m`], ['Frame sagging / hogging', `${Math.max(...l.spans.map(x => x.sag)).toFixed(0)} / ${Math.max(...l.spans.flatMap(x => [x.hogL, x.hogR])).toFixed(0)} kNm`]]} />
          ))}
          {st.mode === 'flat' && eq[st.story]?.notes.map(n => <Text key={n} style={s.k}>{n}</Text>)}
        </View>
      ))}
      {r.strips.length > 0 && <Text style={s.t}>Combined and strip footings ({r.strips.length})</Text>}
      {r.strips.map(st => {
        const sbar = st.columns.reduce((a, k) => a + k.N * k.s, 0) / st.columns.reduce((a, k) => a + k.N, 0), s0 = sbar - st.L / 2, mx = Math.max(...st.diagram.map(p => Math.abs(p.M)), 1), W = 300, sx = W / st.L;
        return (
          <View key={st.id} style={{ gap: 6 }}>
            <Card title={`${st.kind === 'combined' ? 'Combined footing' : 'Strip footing'} ${st.id}: ${st.columns.length} columns, ${st.L.toFixed(1)} × ${st.B.toFixed(1)} × ${Math.round(st.h * 1000)} mm`} status={st.status} notes={st.notes}
              rows={[['Column loads (ULS)', st.columns.map(k => Math.round(k.N)).join(', ') + ' kN'], ['ULS / service pressure', `${Math.round(st.pULS)} / ${Math.round(st.pSLS)} kPa`], ['Max sagging / hogging moment', `${Math.round(st.Msag)} / ${Math.round(st.Mhog)} kNm`], ['Max shear', `${Math.round(st.Vmax)} kN`], ['Bottom / top steel (lengthwise)', `${st.barsBottom} / ${st.barsTop}`], ['Transverse steel', st.barsTransverse], ['Punching utilisation', `${(st.punchRatio * 100).toFixed(0)}%`], ...(st.lat ? [['Worst service pressure', `${Math.round(st.lat.pmax)} / ${st.lat.allow} kPa`], ['Uplift / sliding factor', `${st.lat.uplift > 0 ? Math.round(st.lat.uplift) + ' kN' : 'none'} / ${isFinite(st.lat.sliding) ? st.lat.sliding.toFixed(2) : 'n/a'}`]] as [string, string][] : [])]} />
            <Svg width={W + 20} height={130}>
              <SRect x={10} y={10} width={W} height={110} fill="none" stroke="#cfdcd4" />
              <SLine x1={10} y1={65} x2={10 + W} y2={65} stroke="#9aa8b1" />
              {st.columns.map(k => <SLine key={k.id} x1={10 + (k.s - s0) * sx} y1={10} x2={10 + (k.s - s0) * sx} y2={120} stroke="#c98a00" strokeDasharray="4 3" />)}
              <Polyline points={st.diagram.map(p => `${10 + p.s * sx},${65 - (p.M / mx) * 50}`).join(' ')} fill="none" stroke="#146c43" strokeWidth={2} />
              <SText x={14} y={22} fontSize={10} fill="#4f6a5b">bending moment (up = tension at the bottom), peak {Math.round(mx)} kNm</SText>
            </Svg>
          </View>
        );
      })}
      {r.groundBeams.length > 0 && <Text style={s.t}>Ground beams ({r.groundBeams.length})</Text>}
      {r.groundBeams.slice(0, 12).map(g => (
        <Card key={g.id} title={`${g.id} along ${g.dir}: ${g.b} × ${g.h} mm, span ${g.L.toFixed(1)} m`} status={g.status} notes={g.notes}
          rows={[['Sway moment / tie force', `${Math.round(g.sway)} kNm / ${Math.round(g.tie)} kN`], ['Sagging / hogging moment', `${Math.round(g.Msag)} / ${Math.round(g.Mhog)} kNm`], ['Shear', `${Math.round(g.V)} kN`], ['Bottom / top bars', `${g.bars} / ${g.topBars}`], ['Links', g.links], ...(g.wall ? [['Wall above', `${g.wall.toFixed(1)} kN/m`]] as [string, string][] : [])]} />
      ))}
      {r.groundBeams.length > 12 && <Text style={s.k}>…and {r.groundBeams.length - 12} more ground beams (all are in the report and the totals).</Text>}
      {r.groundBeams.length > 0 && <Text style={s.t}>Ground beams ({r.groundBeams.length})</Text>}
      {r.groundBeams.slice(0, 14).map(g => (
        <Card key={g.id} title={`${g.id} along ${g.dir}: ${g.b} × ${g.h} mm, span ${g.L.toFixed(1)} m`} status={g.status} notes={g.notes}
          rows={[['Sway moment from the column bases', `${Math.round(g.sway)} kNm`], ['Hogging / sagging moment', `${Math.round(g.Mhog)} / ${Math.round(g.Msag)} kNm`], ['Shear', `${Math.round(g.V)} kN`], ['Tie force', `${Math.round(g.tie)} kN`], ['Wall above', g.wall ? `${g.wall.toFixed(1)} kN/m` : 'none'], ['Bottom / top bars', `${g.bars} / ${g.topBars}`], ['Links', g.links]]} />
      ))}
      {r.groundBeams.length > 14 && <Text style={s.k}>…and {r.groundBeams.length - 14} more ground beams (all are in the report and the totals).</Text>}
      <Text style={s.t}>Pad footings ({r.footings.length})</Text>
      {!r.footings.length && <Text style={s.k}>Draw columns on the plan to design footings.</Text>}
      {r.footings.map((f, i) => (
        <Card key={f.id} title={`Footing ${i + 1}: ${f.B.toFixed(1)} × ${f.B.toFixed(1)} × ${(f.h * 1000).toFixed(0)} mm`} status={f.status} notes={f.notes}
          rows={[['Column load (ULS)', `${n0(f.NEd)} kN`], ['Bearing pressure (service)', `${n0(f.pSLS)} kPa`], ['Bars', f.bars], ...(f.lat ? [['Worst service pressure', `${Math.round(f.lat.pmax)} / ${f.lat.allow} kPa`], ['Uplift / sliding factor', `${f.lat.uplift > 0 ? Math.round(f.lat.uplift) + ' kN' : 'none'} / ${isFinite(f.lat.sliding) ? f.lat.sliding.toFixed(2) : 'n/a'}`]] as [string, string][] : []), ['Concrete / steel', `${f.concreteM3.toFixed(1)} m³ / ${n0(f.steelKg)} kg`]]} />
      ))}
      <Text style={s.k}>Foundations total {r.foundConcrete.toFixed(1)} m³ concrete and {r.foundSteelT.toFixed(2)} t steel.</Text>
      <Pressable style={s.save} onPress={save}><Text style={{ color: '#fff', fontWeight: '600' }}>Save summary to project</Text></Pressable>
      {!!msg && <Text style={s.k}>{msg}</Text>}
      <Text style={s.note}>Eurocode 2 preliminary design. Slab: interior panel from published two-way coefficients (edge and corner panels need more steel), span/depth deflection control, no punching or openings. Footings: square pads under concentric loads, cover 50 mm, no moments, settlement, groundwater or frost. Not for construction without a registered engineer's review.</Text>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  wrap: { padding: 16, gap: 10, maxWidth: 720, width: '100%', alignSelf: 'center' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 }, chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#146c43' }, chipOn: { backgroundColor: '#146c43' }, chipT: { color: '#146c43', fontWeight: '600' },
  btn: { fontSize: 24, color: '#146c43', paddingHorizontal: 10 },
  t: { fontSize: 20, fontWeight: '700', marginTop: 8 },
  card: { borderWidth: 1, borderColor: '#cfdcd4', borderLeftWidth: 5, borderRadius: 8, padding: 12 },
  h: { fontWeight: '700', fontSize: 16, marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, gap: 8 },
  k: { color: '#4f6a5b', flexShrink: 1 }, v: { fontWeight: '600', textAlign: 'right', flexShrink: 1 },
  warn: { color: '#c4620a' },
  save: { backgroundColor: '#146c43', padding: 14, borderRadius: 8, alignItems: 'center' },
  note: { color: '#4f6a5b', fontSize: 12, marginTop: 8 },
  l: { fontSize: 14, color: '#1b2a33', paddingVertical: 4 },
});
