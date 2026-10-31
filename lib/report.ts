// Calculation report (Markdown): every input, assumption, intermediate value and clause behind the design results.
import type { Design } from './design';
import type { Mat } from './design';
import { fcuOf } from './bs8110';

type SlabSt = { story: string; mode: string; h: number; panels: { label: string; steps: string[]; notes: string[]; status: string }[]; punching: { id: string; kind: string; steps: string[]; notes: string[]; status: string }[]; notes: string[]; hNoLinks?: number };
type GbSt = { id: string; dir: string; b: number; h: number; L: number; status: string; steps: string[]; notes: string[] };
type StripSt = { id: string; kind: string; L: number; B: number; h: number; status: string; steps: string[]; notes: string[] };
type SF = { groundBeams?: GbSt[]; strips?: StripSt[]; slabs?: SlabSt[]; slab: { steps: string[]; h: number; topBars: string; botBars: string; notes: string[]; status: string }; footings: { id: string; B: number; h: number; bars: string; steps: string[]; notes: string[]; status: string }[] };

export function buildReport(o: { project: string; mat: Mat; imposed: number; defaultTrib: number; qAllow: number; design: Design; sf?: SF; date?: Date }): string {
  const { mat: m, design: d } = o, fcd = (0.85 * m.fck) / 1.5, fyd = m.fyk / 1.15, L: string[] = [];
  const mark = (s: string) => (s === 'ok' ? 'PASS' : s === 'warn' ? 'CHECK' : 'FAIL');
  L.push(`# Calculation report: ${o.project}`, '', `Generated ${(o.date ?? new Date()).toISOString().slice(0, 10)} by Unibuild. Preliminary design to ${m.code === 'BS8110' ? 'BS 8110-1:1997' : 'EN 1992-1-1 (Eurocode 2)'}. **Not for construction without review by a registered engineer.**`, '');
  const bs = m.code === 'BS8110';
  L.push('## 1. Basis of design', '',
    bs ? `- Concrete C${m.fck}/${Math.round(m.fck * 1.2)}: characteristic cube strength fcu = ${fcuOf(m.fck)} MPa` : `- Concrete C${m.fck}/${Math.round(m.fck * 1.2)}: fck = ${m.fck} MPa, fcd = αcc fck/γc = 0.85 × ${m.fck}/1.5 = ${fcd.toFixed(1)} MPa`,
    bs ? `- Reinforcement: fy = ${m.fyk} MPa, design strength 0.87 fy = ${(0.87 * m.fyk).toFixed(0)} MPa` : `- Reinforcement: fyk = ${m.fyk} MPa, fyd = fyk/γs = ${m.fyk}/1.15 = ${fyd.toFixed(0)} MPa`,
    bs ? '- Cover 30 mm, links T8; ULS combination 1.4 Gk + 1.6 Qk, 1.0 Gk on unloaded spans (BS 8110 cl 2.4.3, 3.2.1.2)' : '- Cover 30 mm, links T8; ULS combination 1.35 Gk + 1.5 Qk (EN 1990 6.10)',
    `- Imposed load qk = ${o.imposed} kN/m²; finishes and services 2.5 kN/m²; concrete 25 kN/m³`,
    `- Beam tributary width taken from the layout (half the distance to the nearest parallel beam on each side, one-way slab); ${o.defaultTrib} m where no neighbour exists`,
    '- Beams analysed as continuous lines by the slope-deflection method with alternate-span and adjacent-span load patterns; end supports pinned with at least 15% of the span moment applied as hogging',
    bs ? '- Columns: braced short columns by cl 3.8.4.3 (N = 0.4 fcu Ac + 0.75 fy Asc); load accumulated from every storey above' : '- Columns: braced, uniaxial, minimum eccentricity, rectangular stress block; load accumulated from every storey above',
    bs ? '- Serviceability: deflection by basic span/depth with the tension-steel modification factor (Tables 3.9, 3.10); crack width to BS 8110-2 cl 3.8.3 under service load, limit 0.3 mm' : '- Serviceability: calculated deflection (EC2 7.4.3) and crack width (EC2 7.3.4) under the quasi-permanent combination', '');
  L.push('## 2. Storeys and loads', '', '| Storey | Slab thickness | Design load | Beams | Columns |', '|---|---|---|---|---|');
  d.stories.forEach(s => L.push(`| ${s.name} | ${Math.round(s.slabT * 1000)} mm | ${s.wu.toFixed(2)} kN/m² | ${s.beams} | ${s.cols} |`));
  L.push('');
  L.push(`## 3. Beams (${d.beams.length})`, '');
  d.beams.forEach((b, i) => {
    L.push(`### Beam ${i + 1}${b.story ? ` (${b.story})` : ''}: ${b.b} × ${b.h} mm, span ${b.L.toFixed(2)} m, ${mark(b.status)}`, '');
    b.steps.forEach(s => L.push(`- ${s}`));
    L.push(`- **Result:** bottom ${b.bars}, top ${b.topBars}, links ${b.links}`); b.notes.forEach(n => L.push(`- Note: ${n}`)); L.push('');
  });
  L.push(`## 4. Columns (${d.cols.length})`, '');
  d.cols.forEach((c, i) => {
    L.push(`### Column ${i + 1}${c.story ? ` (${c.story})` : ''}: ${c.b} × ${c.h} mm, ${mark(c.status)}`, '');
    c.steps.forEach(s => L.push(`- ${s}`));
    L.push(`- **Result:** ${c.bars} vertical bars (${Math.round(c.AsProv)} mm² provided), links ${c.links}`); c.notes.forEach(n => L.push(`- Note: ${n}`)); L.push('');
  });
  if (o.sf) {
    L.push('## 5. Slab', '');
    o.sf.slab.steps.forEach(s => L.push(`- ${s}`));
    L.push(`- **Result:** ${Math.round(o.sf.slab.h)} mm slab, top ${o.sf.slab.topBars}, bottom ${o.sf.slab.botBars}, ${mark(o.sf.slab.status)}`); o.sf.slab.notes.forEach(n => L.push(`- Note: ${n}`)); L.push('');
    (o.sf.slabs ?? []).filter(s => s.mode !== 'none').forEach(st => {
      L.push(`### Slab panels and punching: ${st.story} (${st.h} mm slab)`, '');
      st.notes.forEach(n => L.push(`- Note: ${n}`));
      st.panels.forEach(p => { L.push(`#### Panel ${p.label}, ${mark(p.status)}`, ''); p.steps.forEach(s => L.push(`- ${s}`)); p.notes.forEach(n => L.push(`- Note: ${n}`)); L.push(''); });
      st.punching.forEach((p, i) => { L.push(`#### Punching at column ${i + 1} (${p.kind}), ${mark(p.status)}`, ''); p.steps.forEach(s => L.push(`- ${s}`)); p.notes.forEach(n => L.push(`- Note: ${n}`)); L.push(''); });
      if (st.hNoLinks) L.push(`- A slab ${st.hNoLinks} mm thick needs no punching shear reinforcement at any column.`, '');
    });
    if (o.sf.strips?.length) { L.push(`## 6a. Combined and strip footings (${o.sf.strips.length})`, ''); o.sf.strips.forEach(s => { L.push(`### ${s.kind === 'combined' ? 'Combined footing' : 'Strip footing'} ${s.id}: ${s.L.toFixed(1)} × ${s.B.toFixed(1)} × ${Math.round(s.h * 1000)} mm, ${mark(s.status)}`, ''); s.steps.forEach(x => L.push(`- ${x}`)); s.notes.forEach(n => L.push(`- Note: ${n}`)); L.push(''); }); }
    if (o.sf.groundBeams?.length) { L.push(`## 6b. Ground beams (${o.sf.groundBeams.length})`, ''); o.sf.groundBeams.forEach(g => { L.push(`### ${g.id} along ${g.dir}: ${g.b} × ${g.h} mm, span ${g.L.toFixed(1)} m, ${mark(g.status)}`, ''); g.steps.forEach(x => L.push(`- ${x}`)); g.notes.forEach(n => L.push(`- Note: ${n}`)); L.push(''); }); }
    L.push(`## 6. Pad footings (${o.sf.footings.length})`, '', `Allowable bearing pressure assumed ${o.qAllow} kPa: replace with the value from the site investigation.`, '');
    o.sf.footings.forEach((f, i) => { L.push(`### Footing ${i + 1}: ${f.B.toFixed(1)} × ${f.B.toFixed(1)} × ${Math.round(f.h * 1000)} mm, ${mark(f.status)}`, ''); f.steps.forEach(s => L.push(`- ${s}`)); L.push(`- **Result:** ${f.bars}`); f.notes.forEach(n => L.push(`- Note: ${n}`)); L.push(''); });
  }
  L.push('## Limitations', '', 'Not included: frame action on columns, lateral (wind and seismic) loading, deflection and crack-width calculations, detailing rules (laps, anchorage, curtailment), punching of flat slabs, edge and corner slab panels, settlement, groundwater and soil-structure interaction. Coefficients and formulas are simplified; verify every result independently.');
  return L.join('\n');
}

// Lateral-load report: inputs, storey forces, drifts, stability and the column checks under each combination.
import type { LateralInput, LateralResult } from './lateral';
export function buildLateralReport(o: { project: string; mat: Mat; input: LateralInput; result: LateralResult; date?: Date }): string {
  const { result: r, input: i, mat: m } = o, bs = m.code === 'BS8110', L: string[] = [];
  L.push(`# Lateral load report: ${o.project}`, '', `Generated ${(o.date ?? new Date()).toISOString().slice(0, 10)} by Unibuild. Preliminary. **Not for construction without review by a registered engineer.**`, '');
  L.push('## 1. Basis', '', `- Section design code: ${bs ? 'BS 8110-1:1997' : 'EN 1992-1-1'}, concrete C${m.fck}/${Math.round(m.fck * 1.2)}`);
  if (i.wind && r.wind) L.push(`- Wind (EN 1991-1-4): basic wind speed ${i.wind.vb} m/s, terrain category ${i.wind.terrain}; peak velocity pressure qp = (1 + 7 Iv) ½ ρ vm² with ρ = 1.25 kg/m³; qp at the top ${Math.round(r.wind.qpTop)} Pa; net force coefficients cf = cpe(D) + |cpe(E)| = ${r.wind.cf.x.toFixed(2)} (along x), ${r.wind.cf.y.toFixed(2)} (along y); cs·cd = 1.0`);
  if (i.seismic && r.seismic) L.push(`- Earthquake (EN 1998-1 equivalent static): ag/g = ${i.seismic.agG}, ground type ${i.seismic.ground}, q = ${i.seismic.q}, ψ2 = ${i.seismic.psi2}; T1 = 0.075 H^0.75 = ${r.seismic.T1.toFixed(2)} s; Sd(T1) = ${r.seismic.Sd.toFixed(3)} g; λ = ${r.seismic.lambda}; Fb = Sd m λ = ${r.seismic.Fb.toFixed(0)} kN on a seismic weight ${r.seismic.W.toFixed(0)} kN; forces distributed in proportion to height × mass`);
  L.push(`- Ground-storey column bases: ${i.base === 'pinned' ? 'pinned (isolated pads; first-storey columns carry the shear moment at their tops)' : 'fixed (restrained by ground beams or a raft; base moment 0.65 V h)'}`);
  L.push('- Lateral system: rigid floors; D-value (Muto) column stiffness from beam and column sizes, cracked (0.5 EI); ±5% accidental torsion; column moments from storey shear with inflection at mid-height (0.65 h at the base); overturning axial force shared by the column group', '');
  L.push('## 2. Storeys', '', '| Storey | Top level | Height | Dead weight |', '|---|---|---|---|');
  r.storeys.forEach(s => L.push(`| ${s.name} | ${s.top.toFixed(2)} m | ${s.height.toFixed(2)} m | ${Math.round(s.W)} kN |`));
  L.push('', '## 3. Load cases', '');
  r.cases.forEach(c => {
    L.push(`### ${c.name}: ${c.status === 'ok' ? 'PASS' : c.status === 'warn' ? 'CHECK' : 'FAIL'}`, '', `- Base shear ${c.baseShear.toFixed(0)} kN, base overturning moment ${c.baseMoment.toFixed(0)} kNm, overturning stability ratio ${c.stability.toFixed(2)}`, `- Worst inter-storey drift h/${Math.round(1 / Math.max(c.maxRatio, 1e-9))} against the limit ${c.limitText}; top drift ${(c.topDrift * 1000).toFixed(1)} mm`);
    c.forces.forEach((f, k) => L.push(`- ${r.storeys[k].name}: force ${f.toFixed(1)} kN, shear ${c.shears[k].toFixed(0)} kN, drift ${(c.drift[k] * 1000).toFixed(1)} mm (h/${Math.round(1 / Math.max(c.driftRatio[k], 1e-9))})`)); L.push('');
  });
  L.push('## 4. Columns under the lateral combinations', '');
  r.columns.slice().sort((a, b) => b.util - a.util).forEach(c => L.push(`- ${c.story} ${c.b}×${c.h} mm: governing ${c.combo}; N ${c.N.toFixed(0)} kN, Mx ${c.Mx.toFixed(0)} kNm, My ${c.My.toFixed(0)} kNm; utilisation at the gravity steel ${c.util.toFixed(2)}; steel needed ${Math.round(c.AsReq)} mm² (${c.bars}) against ${Math.round(c.AsProv)} mm² from the gravity design${c.notes.length ? '. ' + c.notes.join('. ') : ''}`));
  L.push('', '## Notes and limitations', '', ...r.notes.map(n => `- ${n}`), '- Shear-building model only: confirm with a 3D frame analysis. Walls, cores, bracing, P-delta effects, vertical irregularity, diaphragm flexibility and foundation flexibility are not modelled. Column interaction is checked as Mx/Mrx + My/Mry ≤ 1 (conservative).');
  return L.join('\n');
}
