import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, TextInput, PanResponder, Platform, useWindowDimensions } from 'react-native';
import Svg, { Circle, G as SvgG, Line, Rect, Text as SvgText } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router';
import { drag, Q, turn, VIEWS } from '../../lib/orbit';
import { addCircle, addLine, addPolygon, addRect, boltCircle, chamferCorner, emptySketch, solveSketch, uid, type Con, type ConBody, type Sketch } from '../../lib/sketch';
import { TEMPLATES } from '../../lib/partlib';
import { newPart, rebuild, sampleBracket, type FeatureStep, type Op, type PartDoc, type PatternStep, type SketchStep, type Step } from '../../lib/parts';
import { toStl } from '../../lib/solid';
import PartScene from '../../components/PartScene';
import { saveFile } from '../../components/saveFile';

type Tool = 'select' | 'line' | 'rect' | 'circle' | 'axis' | 'polygon';
const TABS = [['sketch', 'Sketch'], ['solid', 'Solid'], ['mech', 'Mechanical'], ['auto', 'Automotive'], ['inspect', 'Inspect'], ['file', 'File']] as const;
type Tab = typeof TABS[number][0];
const PLANES = ['XY', 'XZ', 'YZ'] as const;
const r1 = (n: number) => Math.round(n * 100) / 100;

// an expression box that only commits when you leave it, so half-typed text never reaches the solver
function Exp({ value, onCommit, width = 90, testID }: { value: string; onCommit: (v: string) => void; width?: number; testID?: string }) {
  const [t, setT] = useState(value);
  useEffect(() => setT(value), [value]);
  return <TextInput testID={testID} value={t} onChangeText={setT} onBlur={() => t !== value && onCommit(t)} onSubmitEditing={() => t !== value && onCommit(t)} style={[s.inp, { width }]} autoCapitalize="none" autoCorrect={false} />;
}
const Chip = ({ label, on, go, testID, danger }: { label: string; on?: boolean; go: () => void; testID?: string; danger?: boolean }) => (
  <Pressable testID={testID} onPress={go} style={[s.chip, on && s.chipOn, danger && s.chipDanger]}><Text style={[s.chipT, on && { color: '#fff' }, danger && { color: '#b71c1c' }]}>{label}</Text></Pressable>
);

const Grp = ({ title, children }: { title: string; children: any }) => (<View style={s.grp}><View style={s.grpRow}>{children}</View><Text style={s.grpT}>{title}</Text></View>);
const B = ({ icon, label, go, on, testID, danger, sub, wide }: { icon: string; label: string; go: () => void; on?: boolean; testID?: string; danger?: boolean; sub?: string; wide?: boolean }) => (
  <Pressable testID={testID} onPress={go} style={[s.rb, wide && { width: 138 }, on && s.rbOn, danger && s.rbDanger]}>
    <Text style={[s.rbI, on && { color: '#fff' }]}>{icon}</Text><Text style={[s.rbT, on && { color: '#fff' }]}>{label}</Text>{!!sub && <Text style={[s.rbS, on && { color: '#dff' }]} numberOfLines={3}>{sub}</Text>}
  </Pressable>
);

export default function Parts() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions(), wide = width >= 900;
  const key = `unibuild.parts.${id}`;
  const [parts, setParts] = useState<PartDoc[]>([sampleBracket()]), [ci, setCi] = useState(0), [ready, setReady] = useState(false);
  const [selStep, setSelStep] = useState<string | null>('f1'), [view, setView] = useState<'sketch' | '3d'>('3d');
  const doc = parts[Math.min(ci, parts.length - 1)];
  const hist = useRef<PartDoc[]>([]);
  const [msg, setMsg] = useState('');

  useEffect(() => { AsyncStorage.getItem(key).then(v => { try { const p = v ? JSON.parse(v) : null; if (Array.isArray(p) && p.length) setParts(p); } catch { /* start fresh */ } setReady(true); }).catch(() => setReady(true)); }, [key]);
  useEffect(() => { if (ready) AsyncStorage.setItem(key, JSON.stringify(parts)).catch(() => {}); }, [parts, ready, key]);

  const commit = useCallback((fn: (d: PartDoc) => PartDoc) => setParts(ps => ps.map((p, i) => { if (i !== Math.min(ci, ps.length - 1)) return p; hist.current = [...hist.current.slice(-49), p]; return fn(p); })), [ci]);
  const undo = () => { const p = hist.current.pop(); if (p) setParts(ps => ps.map((q, i) => (i === Math.min(ci, ps.length - 1) ? p : q))); };
  const R = useMemo(() => rebuild(doc), [doc]);
  const step = doc.steps.find(x => x.id === selStep) ?? null;
  const editingSketch = step?.type === 'sketch' ? step : null;
  const errOf = (sid: string) => R.errors.find(e => e.step === sid)?.msg;

  // ----- timeline editing -----
  const setStep = (sid: string, patch: Record<string, any>) => commit(d => ({ ...d, steps: d.steps.map(x => (x.id === sid ? ({ ...x, ...patch } as Step) : x)) }));
  const addSketch = (plane: 'XY' | 'XZ' | 'YZ') => { const sid = uid('s'); commit(d => ({ ...d, upTo: undefined, steps: [...d.steps, { id: sid, type: 'sketch', name: `Sketch ${d.steps.filter(x => x.type === 'sketch').length + 1} (${plane})`, plane, offset: '0', sk: emptySketch() }] })); setSelStep(sid); setView('sketch'); setTool('line'); };
  const lastSketchId = () => (editingSketch?.id ?? [...doc.steps].reverse().find(x => x.type === 'sketch')?.id);
  const addFeature = (type: 'extrude' | 'revolve') => {
    const sk = lastSketchId(); if (!sk) { setMsg('Draw a sketch first.'); return; }
    const fid = uid('f'), hasBody = doc.steps.some(x => x.type !== 'sketch' && !(x as FeatureStep).off);
    commit(d => ({ ...d, upTo: undefined, steps: [...d.steps, { id: fid, type, name: type === 'extrude' ? 'Extrude' : 'Revolve', sketch: sk, op: hasBody ? 'join' : 'new', depth: '20', angle: '360' } as FeatureStep] })); setSelStep(fid); setView('3d');
  };
  const move = (sid: string, dir: -1 | 1) => commit(d => { const i = d.steps.findIndex(x => x.id === sid), j = i + dir; if (i < 0 || j < 0 || j >= d.steps.length) return d; const a = [...d.steps]; [a[i], a[j]] = [a[j], a[i]]; return { ...d, steps: a }; });
  const remove = (sid: string) => { commit(d => ({ ...d, upTo: undefined, steps: d.steps.filter(x => x.id !== sid && !(x.type !== 'sketch' && x.type !== 'pattern' && (x as FeatureStep).sketch === sid) && !(x.type === 'pattern' && x.of === sid)) })); if (selStep === sid) setSelStep(null); };
  const roll = (to: number | undefined) => commit(d => ({ ...d, upTo: to }));
  const shown = R.shown;

  // ----- sketch editing -----
  const [tool, setTool] = useState<Tool>('select'), [pend, setPend] = useState<[number, number][]>([]), [sel, setSel] = useState<string[]>([]);
  const [snap, setSnap] = useState(5), [cur, setCur] = useState<[number, number] | null>(null), [dimv, setDimv] = useState('');
  const [tab, setTab] = useState<Tab>('sketch'), [opt, setOpt] = useState({ sides: '6', chamfer: '2', bn: '6', pcd: '100', bd: '10', pc: '4', pd: '20', pa: '360' }), [paste, setPaste] = useState<string | null>(null);
  const setO = (k: keyof typeof opt) => (v: string) => setOpt(o => ({ ...o, [k]: v }));
  const [box, setBox] = useState({ w: 600, h: 420 }), [vw, setVw] = useState({ cx: 40, cy: 30, k: 4 });
  const sk: Sketch | null = editingSketch ? (R.solved[editingSketch.id]?.sk ?? editingSketch.sk) : null;
  const info = editingSketch ? R.solved[editingSketch.id]?.info : null;
  const toPx = (p: [number, number]): [number, number] => [box.w / 2 + (p[0] - vw.cx) * vw.k, box.h / 2 - (p[1] - vw.cy) * vw.k];
  const toMm = (x: number, y: number): [number, number] => [vw.cx + (x - box.w / 2) / vw.k, vw.cy - (y - box.h / 2) / vw.k];
  const edit = (fn: (s: Sketch) => Sketch) => { if (!editingSketch) return; commit(d => ({ ...d, steps: d.steps.map(x => { if (x.id !== editingSketch.id || x.type !== 'sketch') return x; const next = fn(x.sk), r = solveSketch(next, R.values); return { ...x, sk: r.info.ok ? r.sketch : next }; }) })); };
  const fit = () => {
    if (!sk || !sk.pts.length) { setVw({ cx: 40, cy: 30, k: 4 }); return; }
    const xs = sk.pts.map(p => p.x).concat(sk.circles.flatMap(c => { const p = sk.pts.find(q => q.id === c.c)!; return [p.x - c.r, p.x + c.r]; })), ys = sk.pts.map(p => p.y).concat(sk.circles.flatMap(c => { const p = sk.pts.find(q => q.id === c.c)!; return [p.y - c.r, p.y + c.r]; }));
    const w = Math.max(10, Math.max(...xs) - Math.min(...xs)), h = Math.max(10, Math.max(...ys) - Math.min(...ys));
    setVw({ cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2, k: Math.min((box.w - 80) / w, (box.h - 80) / h) });
  };
  const snapPt = (p: [number, number]): [number, number] => {
    if (sk) for (const q of sk.pts) if (Math.hypot(q.x - p[0], q.y - p[1]) * vw.k < 12) return [q.x, q.y];
    return [Math.round(p[0] / snap) * snap, Math.round(p[1] / snap) * snap];
  };
  const hit = (p: [number, number]): string | null => {
    if (!sk) return null; const tol = 10 / vw.k, at = (pid: string) => sk.pts.find(q => q.id === pid)!;
    for (const q of sk.pts) if (Math.hypot(q.x - p[0], q.y - p[1]) < tol) return q.id;
    for (const c of sk.circles) { const o = at(c.c); if (Math.abs(Math.hypot(o.x - p[0], o.y - p[1]) - c.r) < tol) return c.id; }
    for (const l of sk.lines) { const a = at(l.a), b = at(l.b), dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - a.x) * dx + (p[1] - a.y) * dy) / L2)); if (Math.hypot(a.x + t * dx - p[0], a.y + t * dy - p[1]) < tol) return l.id; }
    return null;
  };
  const tap = (x: number, y: number) => {
    if (!editingSketch || !sk) return;
    const raw = toMm(x, y);
    if (tool === 'select') { const h = hit(raw); setSel(h ? (sel.includes(h) ? sel.filter(q => q !== h) : [...sel, h]) : []); return; }
    const p = snapPt(raw), first = pend[0];
    if (!first) { setPend([p]); return; }
    if (tool === 'line' || tool === 'axis') {
      if (Math.hypot(p[0] - first[0], p[1] - first[1]) < 1e-6) return;
      const dy = Math.abs(p[1] - first[1]), dx = Math.abs(p[0] - first[0]);
      edit(s => {
        const r = addLine(s, first, p, { axis: tool === 'axis', snap: 1e-6 }); let n = r.sketch;
        if (tool === 'line' && dy < 1e-9) n = { ...n, cons: [...n.cons, { id: uid('c'), t: 'horizontal', l: r.line }] };
        else if (tool === 'line' && dx < 1e-9) n = { ...n, cons: [...n.cons, { id: uid('c'), t: 'vertical', l: r.line }] };
        return n;
      });
      setPend(tool === 'line' ? [p] : []);
    } else if (tool === 'polygon') {
      if (Math.hypot(p[0] - first[0], p[1] - first[1]) < 1e-6) return;
      edit(s => addPolygon(s, first, p, parseInt(opt.sides) || 6)); setPend([]);
    } else if (tool === 'rect') {
      if (Math.abs(p[0] - first[0]) < 1e-6 || Math.abs(p[1] - first[1]) < 1e-6) return;
      edit(s => addRect(s, first, p)); setPend([]);
    } else if (tool === 'circle') {
      const r = Math.hypot(p[0] - first[0], p[1] - first[1]); if (r < 1e-6) return;
      edit(s => addCircle(s, first, r).sketch); setPend([]);
    }
  };
  const lines = sk ? sk.lines.filter(l => sel.includes(l.id)) : [], pts = sk ? sk.pts.filter(p => sel.includes(p.id)) : [], circs = sk ? sk.circles.filter(c => sel.includes(c.id)) : [];
  const addCon = (c: ConBody) => { edit(s => ({ ...s, cons: [...s.cons, { ...c, id: uid('c') } as Con] })); setDimv(''); };
  const delSel = () => edit(s => {
    const lineIds = new Set(sel.filter(q => s.lines.some(l => l.id === q))), circIds = new Set(sel.filter(q => s.circles.some(c => c.id === q)));
    const lines2 = s.lines.filter(l => !lineIds.has(l.id)), circles2 = s.circles.filter(c => !circIds.has(c.id));
    const used = new Set([...lines2.flatMap(l => [l.a, l.b]), ...circles2.map(c => c.c)]);
    const pts2 = s.pts.filter(p => used.has(p.id));
    const alive = new Set([...pts2.map(p => p.id), ...lines2.map(l => l.id), ...circles2.map(c => c.id)]);
    return { pts: pts2, lines: lines2, circles: circles2, cons: s.cons.filter(c => Object.entries(c).every(([k, v]) => k === 'id' || k === 't' || k === 'v' || alive.has(v as string))) };
  });
  useEffect(() => { setSel([]); setPend([]); }, [selStep]);

  // ----- 3D view -----
  const [quat, setQuat] = useState<Q>(VIEWS.iso.q), [zoom, setZoom] = useState(1), last = useRef({ x: 0, y: 0 }), wrap = useRef<any>(null);
  const pan = useMemo(() => PanResponder.create({ onStartShouldSetPanResponder: () => true, onPanResponderGrant: () => { last.current = { x: 0, y: 0 }; }, onPanResponderMove: (_e, g) => { const dx = g.dx - last.current.x, dy = g.dy - last.current.y; last.current = { x: g.dx, y: g.dy }; setQuat(q => drag(q, dx, dy)); } }), []);
  useEffect(() => {
    if (Platform.OS !== 'web') return; const node = wrap.current as HTMLElement | null;
    const w = (e: WheelEvent) => { e.preventDefault(); setZoom(z => Math.min(6, Math.max(0.2, z * (e.deltaY > 0 ? 0.92 : 1.09)))); };
    node?.addEventListener?.('wheel', w, { passive: false }); return () => node?.removeEventListener?.('wheel', w);
  }, [view]);

  // ----- parts list and files -----
  const base = (doc.name || 'part').replace(/[^A-Za-z0-9_-]+/g, '_');
  const exportStl = async () => { if (!R.mesh.f.length) { setMsg('Nothing to export yet.'); return; } try { await saveFile(`${base}.stl`, toStl(doc.name, R.mesh)); setMsg('STL saved'); } catch (e: any) { setMsg('Export failed: ' + (e?.message ?? e)); } };
  const exportJson = async () => { try { await saveFile(`${base}.unibuild-part.json`, JSON.stringify(doc, null, 1)); setMsg('Part file saved'); } catch (e: any) { setMsg('Export failed: ' + (e?.message ?? e)); } };
  const newDoc = (d: PartDoc) => { hist.current = []; setParts(ps => [...ps, d]); setCi(parts.length); setSelStep(d.steps[0]?.id ?? null); setView(d.steps.length ? '3d' : 'sketch'); };

  // ----- pieces -----
  const Timeline = (
    <View style={s.card}>
      <Text style={s.h}>Timeline</Text>
      {doc.steps.map((x, i) => {
        const e = errOf(x.id), on = i < shown, off = x.type !== 'sketch' && (x as FeatureStep).off;
        return (
          <View key={x.id} style={[s.step, selStep === x.id && s.stepOn, !on && { opacity: 0.4 }]}>
            <Pressable testID={`step-${x.id}`} style={{ flex: 1 }} onPress={() => { setSelStep(x.id); setView(x.type === 'sketch' ? 'sketch' : '3d'); if (x.type === 'sketch') setTool('select'); }}>
              <Text style={[s.stepT, off && { textDecorationLine: 'line-through' }]}>{x.type === 'sketch' ? '✎ ' : x.type === 'extrude' ? '▮ ' : x.type === 'pattern' ? '✲ ' : '◐ '}{x.name}</Text>
              {!!e && <Text style={s.errT}>{e}</Text>}
            </Pressable>
            <Pressable onPress={() => move(x.id, -1)}><Text style={s.ic}>↑</Text></Pressable><Pressable onPress={() => move(x.id, 1)}><Text style={s.ic}>↓</Text></Pressable>
            {x.type !== 'sketch' && <Pressable onPress={() => setStep(x.id, { off: !off })}><Text style={s.ic}>{off ? '○' : '●'}</Text></Pressable>}
            <Pressable testID={`del-${x.id}`} onPress={() => remove(x.id)}><Text style={[s.ic, { color: '#b71c1c' }]}>✕</Text></Pressable>
          </View>
        );
      })}
      {!doc.steps.length && <Text style={s.k}>Empty. Add a sketch, draw a closed shape and extrude it.</Text>}
      {doc.upTo !== undefined && <Text style={s.k}>Showing the first {shown} of {doc.steps.length} steps.</Text>}
    </View>
  );
  const Params = (
    <View style={s.card}>
      <Text style={s.h}>Parameters</Text>
      <Text style={s.k}>Use names in any dimension: width/2, depth + 5.</Text>
      {doc.params.map((p, i) => (
        <View key={i} style={s.row}>
          <Exp value={p.name} width={90} onCommit={v => commit(d => ({ ...d, params: d.params.map((q, j) => (j === i ? { ...q, name: v.trim() } : q)) }))} />
          <Text style={s.k}>=</Text>
          <Exp testID={`param-${p.name}`} value={p.expr} width={90} onCommit={v => commit(d => ({ ...d, params: d.params.map((q, j) => (j === i ? { ...q, expr: v } : q)) }))} />
          <Text style={s.k}>{R.values[p.name] !== undefined ? r1(R.values[p.name]) : '?'}</Text>
          <Pressable onPress={() => commit(d => ({ ...d, params: d.params.filter((_, j) => j !== i) }))}><Text style={[s.ic, { color: '#b71c1c' }]}>✕</Text></Pressable>
        </View>
      ))}
      <Chip label="＋ Parameter" go={() => commit(d => ({ ...d, params: [...d.params, { name: `p${d.params.length + 1}`, expr: '10' }] }))} />
    </View>
  );
  const Props = (
    <View style={s.card}>
      <Text style={s.h}>{step ? step.name : 'Properties'}</Text>
      {step && <View style={s.row}><Text style={s.k}>Name</Text><Exp value={step.name} width={150} onCommit={v => setStep(step.id, { name: v })} /></View>}
      {step && step.type === 'pattern' && (
        <>
          <View style={s.row}><Text style={s.k}>Repeats</Text>{doc.steps.filter(x => x.type === 'extrude' || x.type === 'revolve').map(x => <Chip key={x.id} label={x.name} on={step.of === x.id} go={() => setStep(step.id, { of: x.id })} />)}</View>
          <View style={s.row}><Chip label="Linear" on={step.mode === 'linear'} go={() => setStep(step.id, { mode: 'linear' })} /><Chip label="Circular" on={step.mode === 'circular'} go={() => setStep(step.id, { mode: 'circular' })} /></View>
          <View style={s.row}><Text style={s.k}>Count</Text><Exp testID="pat-count" value={step.count} width={70} onCommit={v => setStep(step.id, { count: v })} /></View>
          {step.mode === 'linear' ? (
            <View style={s.row}><Text style={s.k}>Spacing x y z</Text><Exp value={step.dx} width={56} onCommit={v => setStep(step.id, { dx: v })} /><Exp value={step.dy} width={56} onCommit={v => setStep(step.id, { dy: v })} /><Exp value={step.dz} width={56} onCommit={v => setStep(step.id, { dz: v })} /></View>
          ) : (
            <>
              <View style={s.row}><Text style={s.k}>Axis</Text>{(['x', 'y', 'z'] as const).map(a => <Chip key={a} label={a} on={step.axis === a} go={() => setStep(step.id, { axis: a })} />)}<Text style={s.k}>Angle</Text><Exp value={step.angle} width={60} onCommit={v => setStep(step.id, { angle: v })} /></View>
              <View style={s.row}><Text style={s.k}>Through x y z</Text><Exp value={step.cx} width={56} onCommit={v => setStep(step.id, { cx: v })} /><Exp value={step.cy} width={56} onCommit={v => setStep(step.id, { cy: v })} /><Exp value={step.cz} width={56} onCommit={v => setStep(step.id, { cz: v })} /></View>
            </>
          )}
        </>
      )}
      {step && step.type !== 'sketch' && step.type !== 'pattern' && (
        <>
          <View style={s.row}><Text style={s.k}>Sketch</Text>{doc.steps.filter(x => x.type === 'sketch').map(x => <Chip key={x.id} label={x.name.split(' (')[0]} on={step.sketch === x.id} go={() => setStep(step.id, { sketch: x.id })} />)}</View>
          <View style={s.row}><Text style={s.k}>Operation</Text>{(['new', 'join', 'cut'] as Op[]).map(o => <Chip key={o} testID={`op-${o}`} label={o === 'new' ? 'New body' : o === 'join' ? 'Join' : 'Cut'} on={step.op === o} go={() => setStep(step.id, { op: o })} />)}</View>
          {step.type === 'extrude' ? (
            <>
              <View style={s.row}><Text style={s.k}>Depth (mm)</Text><Exp testID="depth" value={step.depth} onCommit={v => setStep(step.id, { depth: v })} /></View>
              <View style={s.row}><Chip label="Symmetric about the sketch" on={!!step.symmetric} go={() => setStep(step.id, { symmetric: !step.symmetric })} /></View>
            </>
          ) : <View style={s.row}><Text style={s.k}>Angle (°)</Text><Exp value={step.angle} onCommit={v => setStep(step.id, { angle: v })} /></View>}
        </>
      )}
      {step?.type === 'sketch' && (
        <>
          <View style={s.row}><Text style={s.k}>Plane</Text>{PLANES.map(p => <Chip key={p} label={p} on={step.plane === p} go={() => setStep(step.id, { plane: p })} />)}</View>
          <View style={s.row}><Text style={s.k}>Offset (mm)</Text><Exp value={step.offset} onCommit={v => setStep(step.id, { offset: v })} /></View>
        </>
      )}
      {!step && <Text style={s.k}>Select a step in the timeline.</Text>}
    </View>
  );
  const Stats = (
    <View style={s.card} testID="stats">
      <Text style={s.h}>Part</Text>
      {R.stats ? (
        <>
          <Text style={s.v}>Volume {r1(R.stats.volume / 1000)} cm³</Text>
          <Text style={s.v}>Mass {R.stats.mass < 1 ? `${r1(R.stats.mass * 1000)} g` : `${r1(R.stats.mass)} kg`} <Text style={s.k}>at {doc.density} kg/m³</Text></Text>
          <Text style={s.v}>Surface {r1(R.stats.area / 100)} cm²</Text>
          <Text style={s.v}>Centre of mass {R.stats.com.map(r1).join(', ')} mm</Text>
          <Text style={s.v}>Size {R.stats.size.map(r1).join(' × ')} mm</Text>
        </>
      ) : <Text style={s.k}>No solid yet.</Text>}
      <View style={s.row}><Text style={s.k}>Density kg/m³</Text><Exp value={String(doc.density)} width={80} onCommit={v => { const n = parseFloat(v); if (n > 0) commit(d => ({ ...d, density: n })); }} /></View>
      <View style={s.row}>{[['Steel', 7850], ['Aluminium', 2700], ['Cast iron', 7200], ['Brass', 8500]].map(([n, v]) => <Chip key={n as string} label={n as string} on={doc.density === v} go={() => commit(d => ({ ...d, density: v as number }))} />)}</View>
      {R.errors.filter(e => e.step === 'params').map((e, i) => <Text key={i} style={s.errT}>{e.msg}</Text>)}
    </View>
  );

  const SketchTools = editingSketch && sk && (
    <Text style={[s.k, info && !info.ok && { color: '#b71c1c' }]}>{info?.message || (sk.pts.length ? '' : 'Pick a drawing tool in the ribbon and tap the canvas.')}{tool !== 'select' && pend.length ? '  Tap the next point.' : ''}{tool === 'select' ? `  ${sel.length} selected. Tap a line, point or circle to select it.` : ''}</Text>
  );

  const SketchCanvas = editingSketch && sk && (
    <Pressable testID="sketch-canvas" style={s.canvas} onLayout={e => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      onPress={e => { const n: any = e.nativeEvent ?? {}; const r = (e as any).currentTarget?.getBoundingClientRect?.(); const [x, y] = typeof n.locationX === 'number' && isFinite(n.locationX) ? [n.locationX, n.locationY] : r ? [n.clientX - r.left, n.clientY - r.top] : [0, 0]; tap(x, y); }}
      {...(Platform.OS === 'web' ? ({ onMouseMove: (e: any) => { const r = e.currentTarget.getBoundingClientRect(); const q = snapPt(toMm(e.clientX - r.left, e.clientY - r.top)); setCur(o => (o && o[0] === q[0] && o[1] === q[1] ? o : q)); } } as any) : {})}>
      <Svg width={box.w} height={box.h} pointerEvents="none">
        <Rect x={0} y={0} width={box.w} height={box.h} fill="#fbfdfb" />
        {(() => { const g = vw.k * 10 >= 14 ? 10 : 50, out: any[] = []; const [x0, y1] = toMm(0, 0), [x1, y0] = toMm(box.w, box.h); for (let x = Math.ceil(x0 / g) * g; x <= x1; x += g) out.push(<Line key={'x' + x} x1={toPx([x, 0])[0]} y1={0} x2={toPx([x, 0])[0]} y2={box.h} stroke={x === 0 ? '#5d8f74' : '#e1ece5'} strokeWidth={x === 0 ? 1.5 : 1} />); for (let y = Math.ceil(y0 / g) * g; y <= y1; y += g) out.push(<Line key={'y' + y} x1={0} y1={toPx([0, y])[1]} x2={box.w} y2={toPx([0, y])[1]} stroke={y === 0 ? '#5d8f74' : '#e1ece5'} strokeWidth={y === 0 ? 1.5 : 1} />); return out; })()}
        {sk.lines.map(l => { const a = sk.pts.find(p => p.id === l.a)!, b = sk.pts.find(p => p.id === l.b)!, A = toPx([a.x, a.y]), B = toPx([b.x, b.y]); return <Line key={l.id} x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} stroke={sel.includes(l.id) ? '#d81b60' : l.axis ? '#e08a00' : '#146c43'} strokeWidth={sel.includes(l.id) ? 3.5 : 2.5} strokeDasharray={l.axis ? '10 5' : undefined} />; })}
        {sk.circles.map(c => { const o = sk.pts.find(p => p.id === c.c)!, P = toPx([o.x, o.y]); return <Circle key={c.id} cx={P[0]} cy={P[1]} r={c.r * vw.k} fill="none" stroke={sel.includes(c.id) ? '#d81b60' : '#146c43'} strokeWidth={sel.includes(c.id) ? 3.5 : 2.5} />; })}
        {sk.pts.map(p => { const P = toPx([p.x, p.y]), fixed = sk.cons.some(c => c.t === 'fix' && c.p === p.id); return <Rect key={p.id} x={P[0] - 4} y={P[1] - 4} width={8} height={8} fill={sel.includes(p.id) ? '#d81b60' : fixed ? '#0a2e1f' : '#fff'} stroke="#146c43" strokeWidth={1.5} />; })}
        {sk.cons.map(c => {
          if (c.t === 'length') { const l = sk.lines.find(q => q.id === c.l); if (!l) return null; const a = sk.pts.find(p => p.id === l.a)!, b = sk.pts.find(p => p.id === l.b)!, M = toPx([(a.x + b.x) / 2, (a.y + b.y) / 2]); return <SvgText key={c.id} x={M[0] + 6} y={M[1] - 6} fontSize={12} fill="#1565c0">{r1(Math.hypot(b.x - a.x, b.y - a.y))}</SvgText>; }
          if (c.t === 'radius') { const ci = sk.circles.find(q => q.id === c.c); if (!ci) return null; const o = sk.pts.find(p => p.id === ci.c)!, P = toPx([o.x, o.y]); return <SvgText key={c.id} x={P[0] + 4} y={P[1] - 4} fontSize={12} fill="#1565c0">R{r1(ci.r)}</SvgText>; }
          if (c.t === 'horizontal' || c.t === 'vertical') { const l = sk.lines.find(q => q.id === c.l); if (!l) return null; const a = sk.pts.find(p => p.id === l.a)!, b = sk.pts.find(p => p.id === l.b)!, M = toPx([(a.x + b.x) / 2, (a.y + b.y) / 2]); return <SvgText key={c.id} x={M[0] - 4} y={M[1] + 14} fontSize={11} fill="#8a3ffc">{c.t === 'horizontal' ? '—' : '|'}</SvgText>; }
          return null;
        })}
        {pend[0] && cur && <SvgG>{tool === 'rect' ? <Rect x={Math.min(toPx(pend[0])[0], toPx(cur)[0])} y={Math.min(toPx(pend[0])[1], toPx(cur)[1])} width={Math.abs(toPx(cur)[0] - toPx(pend[0])[0])} height={Math.abs(toPx(cur)[1] - toPx(pend[0])[1])} fill="none" stroke="#ffb300" strokeWidth={1.5} strokeDasharray="6 4" /> : tool === 'circle' ? <Circle cx={toPx(pend[0])[0]} cy={toPx(pend[0])[1]} r={Math.hypot(cur[0] - pend[0][0], cur[1] - pend[0][1]) * vw.k} fill="none" stroke="#ffb300" strokeWidth={1.5} strokeDasharray="6 4" /> : <Line x1={toPx(pend[0])[0]} y1={toPx(pend[0])[1]} x2={toPx(cur)[0]} y2={toPx(cur)[1]} stroke="#ffb300" strokeWidth={1.5} strokeDasharray="6 4" />}</SvgG>}
        {cur && tool !== 'select' && <Circle cx={toPx(cur)[0]} cy={toPx(cur)[1]} r={5} fill="none" stroke="#ffb300" strokeWidth={1.5} />}
      </Svg>
      {cur && <Text style={s.coord}>{r1(cur[0])}, {r1(cur[1])} mm</Text>}
    </Pressable>
  );

  const Viewport = (
    <View ref={wrap} testID="viewport3d" style={s.canvas} {...pan.panHandlers}>
      {R.mesh.f.length ? <PartScene mesh={R.mesh} quat={quat} zoom={zoom} /> : <Text style={[s.k, { padding: 20 }]}>Nothing to show yet. Sketch a closed shape on a plane and extrude it.</Text>}
      <View style={s.vbtns}>{Object.entries(VIEWS).filter(([k]) => ['iso', 'front', 'right', 'top'].includes(k)).map(([k, v]) => <Chip key={k} label={v.label} go={() => setQuat(v.q)} />)}<Chip label="Turn 15° ↻" go={() => setQuat(q => turn(q, 'y', Math.PI / 12))} /></View>
    </View>
  );

  const Center = (
    <View style={s.center}>
      {view === 'sketch' && editingSketch ? <>{SketchTools}{SketchCanvas}{editingSketch && sk && sk.cons.length > 0 && (
        <ScrollView horizontal style={{ maxHeight: 34 }} contentContainerStyle={{ gap: 6, alignItems: 'center' }}>{sk.cons.map(c => <Pressable key={c.id} onPress={() => edit(s2 => ({ ...s2, cons: s2.cons.filter(q => q.id !== c.id) }))}><Text style={s.conT}>{c.t}{'v' in c ? ` ${c.v}` : ''} ✕</Text></Pressable>)}</ScrollView>
      )}</> : Viewport}
    </View>
  );

  // ----- commands -----
  const conLine = (c: 'horizontal' | 'vertical') => (lines.length === 1 ? addCon({ t: c, l: lines[0].id }) : setMsg('Select one line: choose Select in Draw, then tap a line.'));
  const conPair = (c: 'parallel' | 'perpendicular' | 'equal') => (lines.length === 2 ? addCon({ t: c, l1: lines[0].id, l2: lines[1].id }) : setMsg('Select two lines.'));
  const dimLine = (c: 'length' | 'angle') => (lines.length === 1 && dimv ? addCon({ t: c, l: lines[0].id, v: dimv }) : setMsg('Select one line and type the value first.'));
  const dimPts = (c: 'dx' | 'dy') => (pts.length === 2 && dimv ? addCon({ t: c, a: pts[0].id, b: pts[1].id, v: dimv }) : setMsg('Select two points and type the distance first.'));
  const doChamfer = () => { if (pts.length !== 1) { setMsg('Select one corner point where two lines meet.'); return; } const r = chamferCorner(sk!, pts[0].id, parseFloat(opt.chamfer)); if (!r) { setMsg('That point is not a corner of exactly two lines, or the cut is longer than a line.'); return; } edit(() => r); setSel([]); };
  const doBolt = () => { edit(s2 => boltCircle(s2, [0, 0], parseFloat(opt.pcd) || 100, parseInt(opt.bn) || 4, parseFloat(opt.bd) || 10)); setMsg('Bolt circle drawn about the sketch origin. Select a circle to dimension or move it.'); };
  const featureId = () => (step && (step.type === 'extrude' || step.type === 'revolve') ? step.id : [...doc.steps].reverse().find(x => x.type === 'extrude' || x.type === 'revolve')?.id);
  const addPattern = (mode: 'linear' | 'circular') => {
    const f = featureId(); if (!f) { setMsg('Add an extrude or revolve first, then pattern it.'); return; }
    const pid = uid('f');
    commit(d => ({ ...d, upTo: undefined, steps: [...d.steps, { id: pid, type: 'pattern', name: mode === 'linear' ? 'Linear pattern' : 'Circular pattern', of: f, mode, count: mode === 'linear' ? '3' : '4', dx: '20', dy: '0', dz: '0', axis: 'z', angle: '360', cx: '0', cy: '0', cz: '0' } as PatternStep] })); setSelStep(pid); setView('3d');
  };
  const finishSketch = () => { setView('3d'); setTool('select'); };
  const fromTemplate = (mk: () => PartDoc) => { newDoc(mk()); setTab('solid'); setMsg('Template opened as a new part. Change its parameters on the left, or any step in the timeline.'); };
  const TAB_HINT: Record<Tab, string> = {
    sketch: '1 New sketch on a plane. 2 Draw a closed shape. 3 Select lines or points and constrain them. 4 Type a value and dimension. Then Solid > Extrude.',
    solid: 'Extrude pushes a sketch into a solid; Revolve turns it about the Axis line. Choose New body, Join or Cut in the properties. Patterns repeat a feature.',
    mech: 'Ready-made parametric machine parts. Each opens as a new part: change the parameters (left) to resize it, or open any step to see how it was built.',
    auto: 'Ready-made vehicle parts. Each opens as a new part with its parameters, sketches and features, so you can adapt it.',
    inspect: 'Material sets the mass. Volume, mass, size and centre of mass update as you edit. Use the view buttons to look at the part from any side.',
    file: 'Parts are kept on this device. Export STL for printing or CAM; save a part file to share or back up, and paste one back to open it.',
  };

  const Ribbon = (
    <View style={s.ribbon}>
      <View style={s.tabs}>{TABS.map(([k, l]) => <Pressable key={k} testID={`tab-${k}`} onPress={() => { setTab(k); if (k === 'sketch' && !editingSketch) { const f = doc.steps.find(x => x.type === 'sketch'); if (f) { setSelStep(f.id); setView('sketch'); } } }} style={[s.tab, tab === k && s.tabOn]}><Text style={[s.tabT, tab === k && { color: '#0a2e1f' }]}>{l}</Text></Pressable>)}</View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.groups}>
        {tab === 'sketch' && <>
          <Grp title="Sketch">{PLANES.map(p => <B key={p} testID={`add-sketch-${p}`} icon="✎" label={`New on ${p}`} go={() => addSketch(p)} />)}<B testID="finish-sketch" icon="✓" label="Finish" go={finishSketch} /></Grp>
          <Grp title="Draw">
            <B testID="tool-select" icon="⌖" label="Select" on={tool === 'select'} go={() => { setTool('select'); setPend([]); }} />
            <B testID="tool-line" icon="∕" label="Line" on={tool === 'line'} go={() => { setTool('line'); setPend([]); }} />
            <B testID="tool-rect" icon="▭" label="Rectangle" on={tool === 'rect'} go={() => { setTool('rect'); setPend([]); }} />
            <B testID="tool-circle" icon="◯" label="Circle" on={tool === 'circle'} go={() => { setTool('circle'); setPend([]); }} />
            <B testID="tool-polygon" icon="⬡" label="Polygon" on={tool === 'polygon'} go={() => { setTool('polygon'); setPend([]); }} />
            <B testID="tool-axis" icon="┄" label="Axis line" on={tool === 'axis'} go={() => { setTool('axis'); setPend([]); }} />
            <View style={s.fld}><Text style={s.fl}>Sides</Text><Exp value={opt.sides} width={48} onCommit={setO('sides')} /></View>
          </Grp>
          <Grp title="Constrain"><B icon="—" label="Horizontal" go={() => conLine('horizontal')} /><B icon="|" label="Vertical" go={() => conLine('vertical')} /><B icon="∥" label="Parallel" go={() => conPair('parallel')} /><B icon="⟂" label="Perpendicular" go={() => conPair('perpendicular')} /><B icon="＝" label="Equal" go={() => conPair('equal')} /><B icon="●" label="Coincident" go={() => (pts.length === 2 ? addCon({ t: 'coincident', a: pts[0].id, b: pts[1].id }) : setMsg('Select two points.'))} /><B testID="fix-pt" icon="⚓" label="Fix point" go={() => (pts.length === 1 ? addCon({ t: 'fix', p: pts[0].id }) : setMsg('Select one point.'))} /></Grp>
          <Grp title="Dimension">
            <View style={s.fld}><Text style={s.fl}>Value</Text><Exp testID="dim-input" value={dimv} width={84} onCommit={setDimv} /></View>
            <B testID="set-length" icon="↔" label="Length" go={() => dimLine('length')} /><B icon="∠" label="Angle°" go={() => dimLine('angle')} /><B testID="set-radius" icon="R" label="Radius" go={() => (circs.length === 1 && dimv ? addCon({ t: 'radius', c: circs[0].id, v: dimv }) : setMsg('Select one circle and type the radius first.'))} /><B icon="⇥" label="Δ X" go={() => dimPts('dx')} /><B icon="⇧" label="Δ Y" go={() => dimPts('dy')} />
          </Grp>
          <Grp title="Modify">
            <View style={s.fld}><Text style={s.fl}>Dist.</Text><Exp value={opt.chamfer} width={48} onCommit={setO('chamfer')} /></View><B icon="◣" label="Chamfer corner" go={doChamfer} />
            <View style={s.fld}><Text style={s.fl}>Count</Text><Exp value={opt.bn} width={44} onCommit={setO('bn')} /><Text style={s.fl}>PCD</Text><Exp value={opt.pcd} width={56} onCommit={setO('pcd')} /><Text style={s.fl}>Hole ⌀</Text><Exp value={opt.bd} width={48} onCommit={setO('bd')} /></View><B testID="bolt-circle" icon="✲" label="Bolt circle" go={doBolt} />
            <B testID="del-sel" icon="🗑" label="Delete" danger go={delSel} /><B icon="⤢" label="Fit view" go={fit} />
            <View style={s.fld}><Text style={s.fl}>Snap</Text>{[1, 5, 10].map(n => <Chip key={n} label={`${n}`} on={snap === n} go={() => setSnap(n)} />)}</View>
          </Grp>
        </>}
        {tab === 'solid' && <>
          <Grp title="Create"><B testID="add-extrude" icon="▮" label="Extrude" sub="Push a sketch into a solid" go={() => addFeature('extrude')} /><B testID="add-revolve" icon="◐" label="Revolve" sub="Turn a sketch about its axis" go={() => addFeature('revolve')} /></Grp>
          <Grp title="Pattern"><B testID="add-linear" icon="⋮⋮" label="Linear" sub="Copies along a line" go={() => addPattern('linear')} /><B testID="add-circular" icon="✲" label="Circular" sub="Copies around an axis" go={() => addPattern('circular')} /></Grp>
          {step && (step.type === 'extrude' || step.type === 'revolve') && <Grp title={`Operation: ${step.name}`}>{(['new', 'join', 'cut'] as Op[]).map(o => <B key={o} testID={`op-${o}`} icon={o === 'new' ? '＋' : o === 'join' ? '∪' : '−'} label={o === 'new' ? 'New body' : o === 'join' ? 'Join' : 'Cut'} on={step.op === o} go={() => setStep(step.id, { op: o })} />)}</Grp>}
          <Grp title="History"><B testID="undo" icon="↶" label="Undo" go={undo} /><B icon="◀" label="Roll back" go={() => roll(Math.max(0, shown - 1))} /><B icon="▶" label="Roll forward" go={() => roll(shown + 1 >= doc.steps.length ? undefined : shown + 1)} /></Grp>
        </>}
        {tab === 'mech' && <Grp title="Machine parts">{TEMPLATES.filter(x => x.group === 'mechanical').map(x => <B key={x.key} testID={`tpl-${x.key}`} icon="⚙" label={x.label} sub={x.blurb} go={() => fromTemplate(x.make)} wide />)}<B icon="∟" label="L bracket" sub="Bent bracket with a bolt hole" go={() => fromTemplate(sampleBracket)} wide /></Grp>}
        {tab === 'auto' && <Grp title="Vehicle parts">{TEMPLATES.filter(x => x.group === 'automotive').map(x => <B key={x.key} testID={`tpl-${x.key}`} icon="🚗" label={x.label} sub={x.blurb} go={() => fromTemplate(x.make)} wide />)}</Grp>}
        {tab === 'inspect' && <>
          <Grp title="View"><B testID="view-sketch" icon="✎" label="Sketch" on={view === 'sketch'} go={() => { if (!editingSketch) { const f = doc.steps.find(x => x.type === 'sketch'); if (f) setSelStep(f.id); else return; } setView('sketch'); }} /><B testID="view-3d" icon="🧊" label="3D" on={view === '3d'} go={() => setView('3d')} />{Object.entries(VIEWS).filter(([k]) => ['iso', 'front', 'right', 'top'].includes(k)).map(([k, v]) => <B key={k} icon="◫" label={v.label} go={() => { setView('3d'); setQuat(v.q); }} />)}<B icon="↻" label="Turn 15°" go={() => { setView('3d'); setQuat(q => turn(q, 'y', Math.PI / 12)); }} /></Grp>
          <Grp title="Material">{[['Steel', 7850], ['Stainless', 8000], ['Aluminium', 2700], ['Titanium', 4500], ['Cast iron', 7200], ['Brass', 8500], ['ABS', 1050]].map(([n, v]) => <B key={n as string} icon="◼" label={n as string} on={doc.density === v} go={() => commit(d => ({ ...d, density: v as number }))} />)}</Grp>
          <Grp title="Measure"><View style={{ minWidth: 220 }}>{R.stats ? <><Text style={s.v}>Volume {r1(R.stats.volume / 1000)} cm³</Text><Text style={s.v}>Mass {R.stats.mass < 1 ? `${r1(R.stats.mass * 1000)} g` : `${r1(R.stats.mass)} kg`}</Text><Text style={s.v}>Size {R.stats.size.map(r1).join(' × ')} mm</Text><Text style={s.v}>Centre of mass {R.stats.com.map(r1).join(', ')} mm</Text></> : <Text style={s.k}>No solid yet.</Text>}</View></Grp>
        </>}
        {tab === 'file' && <>
          <Grp title="Parts"><B testID="new-part" icon="＋" label="New part" go={() => newDoc(newPart(`Part ${parts.length + 1}`))} /><B icon="∟" label="Sample bracket" go={() => newDoc(sampleBracket())} />{parts.length > 1 && <B icon="🗑" label="Delete part" danger go={() => { setParts(ps => ps.filter((_, i) => i !== Math.min(ci, ps.length - 1))); setCi(0); }} />}</Grp>
          <Grp title="Export"><B testID="export-stl" icon="⬇" label="STL (print, CAM)" go={exportStl} /><B icon="💾" label="Part file" go={exportJson} /></Grp>
          <Grp title="Open"><B testID="paste-open" icon="⬆" label="Paste a part file" go={() => setPaste(paste === null ? '' : null)} /></Grp>
        </>}
      </ScrollView>
      <Text style={s.hint}>{TAB_HINT[tab]}</Text>
      {paste !== null && (
        <View style={s.card}>
          <TextInput testID="paste-box" multiline value={paste} onChangeText={setPaste} placeholder="Paste the contents of a .unibuild-part.json file" style={[s.inp, { height: 90, width: '100%' }]} autoCapitalize="none" autoCorrect={false} />
          <Chip testID="paste-load" label="Open part" go={() => { try { const d = JSON.parse(paste); if (!d || !Array.isArray(d.steps) || !Array.isArray(d.params)) throw new Error('Not a part file'); newDoc({ ...newPart(d.name || 'Imported'), ...d }); setPaste(null); setMsg('Part opened.'); } catch (e: any) { setMsg('Could not open that: ' + (e?.message ?? e)); } }} />
        </View>
      )}
    </View>
  );

  const Head = (
    <View style={s.head}>
      <Text style={s.t1}>Parts</Text>
      <Exp testID="part-name" value={doc.name} width={170} onCommit={v => commit(d => ({ ...d, name: v }))} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: 'center' }}>
        {parts.map((p, i) => <Chip key={i} label={p.name} on={i === Math.min(ci, parts.length - 1)} go={() => { setCi(i); hist.current = []; setSelStep(p.steps[0]?.id ?? null); }} />)}
      </ScrollView>
    </View>
  );

  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 10, gap: 10 }}>
      {Head}
      {Ribbon}
      {!!msg && <Text style={s.msg}>{msg}</Text>}
      {wide ? (
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <View style={{ width: 280, gap: 10 }}>{Timeline}{Params}</View>
          <View style={{ flex: 1 }}>{Center}</View>
          <View style={{ width: 290, gap: 10 }}>{Props}{Stats}</View>
        </View>
      ) : <View style={{ gap: 10 }}>{Center}{Timeline}{Props}{Stats}{Params}</View>}
      <Text style={s.k}>Parts are kept in this browser or device. Use Save part file and Export STL to keep or share them. Modelled in millimetres. Joins and cuts use a mesh boolean, so curved faces are faceted.</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  ribbon: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#dde7e0', overflow: 'hidden' },
  tabs: { flexDirection: 'row', backgroundColor: '#e6f0ea', paddingHorizontal: 6, paddingTop: 6, gap: 2 },
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  tabOn: { backgroundColor: '#fff' },
  tabT: { fontSize: 13, fontWeight: '700', color: '#4f6a5b' },
  groups: { padding: 6, gap: 0, alignItems: 'stretch' },
  grp: { paddingHorizontal: 8, borderRightWidth: 1, borderColor: '#e2ece6', justifyContent: 'space-between' },
  grpRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, flexWrap: 'nowrap' },
  grpT: { fontSize: 11, color: '#6b8576', textAlign: 'center', marginTop: 4, fontWeight: '600' },
  rb: { minWidth: 64, paddingHorizontal: 6, paddingVertical: 5, borderRadius: 6, alignItems: 'center', gap: 2 },
  rbOn: { backgroundColor: '#146c43' },
  rbDanger: { backgroundColor: '#fdf3f3' },
  rbI: { fontSize: 20, color: '#146c43', height: 26 },
  rbT: { fontSize: 11, fontWeight: '700', color: '#0a2e1f', textAlign: 'center' },
  rbS: { fontSize: 10, color: '#5f7a6b', textAlign: 'center' },
  fld: { alignItems: 'center', gap: 3, paddingHorizontal: 4, flexDirection: 'row' },
  fl: { fontSize: 11, color: '#4f6a5b' },
  hint: { fontSize: 12, color: '#355846', backgroundColor: '#f1f7f3', paddingHorizontal: 12, paddingVertical: 6 },
  msg: { fontSize: 12, color: '#7a4b00', backgroundColor: '#fff6e0', padding: 8, borderRadius: 6 },
  page: { flex: 1, backgroundColor: '#f1f5f2' },
  head: { gap: 6 },
  t1: { fontSize: 20, fontWeight: '800', color: '#0a2e1f' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 10, gap: 6, borderWidth: 1, borderColor: '#dde7e0' },
  h: { fontSize: 14, fontWeight: '800', color: '#0a2e1f' },
  k: { fontSize: 12, color: '#4f6a5b' },
  v: { fontSize: 13, color: '#0a2e1f', fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: '#bccfc3', backgroundColor: '#f4f9f6' },
  chipOn: { backgroundColor: '#146c43', borderColor: '#146c43' },
  chipDanger: { borderColor: '#e6b8b8', backgroundColor: '#fdf3f3' },
  chipT: { fontSize: 12, fontWeight: '700', color: '#0a2e1f' },
  inp: { borderWidth: 1, borderColor: '#bccfc3', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, fontSize: 13, backgroundColor: '#fff', color: '#0a2e1f' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, paddingHorizontal: 6, borderRadius: 6 },
  stepOn: { backgroundColor: '#e3f2ea' },
  stepT: { fontSize: 13, fontWeight: '600', color: '#0a2e1f' },
  errT: { fontSize: 11, color: '#b71c1c' },
  ic: { fontSize: 15, paddingHorizontal: 4, color: '#146c43', fontWeight: '800' },
  center: { gap: 8 },
  tools: { gap: 6 },
  canvas: { height: 460, backgroundColor: '#fbfdfb', borderRadius: 10, borderWidth: 1, borderColor: '#dde7e0', overflow: 'hidden' },
  coord: { position: 'absolute', right: 8, bottom: 6, fontSize: 11, color: '#4f6a5b' },
  vbtns: { position: 'absolute', left: 8, bottom: 8, flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  conT: { fontSize: 11, color: '#6a3fb8', backgroundColor: '#f1ebfb', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
});
