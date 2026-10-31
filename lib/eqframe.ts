// Equivalent-frame analysis of flat slabs (no beams): bending moments, column and middle strip split, and steel.
// Each column line in each direction is analysed as a continuous frame (lib/frame.ts) whose supports are rotational
// springs standing for the columns above and below plus the slab torsional member (EC2 Annex I.1.2, ACI 318 13.7).
// Method:
//  1. Strip width = half the distance to the neighbouring column line on each side.
//  2. Slab stiffness EI = E b h^3 / 12; column stiffness 4EI/H for each column framing in (far end fixed).
//  3. Torsional member Kt = 9 E C / (l2 (1 - c2/l2)^3), C = (1 - 0.63 x/y) x^3 y / 3; halved at an edge line.
//  4. Equivalent column: 1/Kec = 1/(sum Kc) + 1/Kt, used as the rotational spring at the support.
//  5. Pattern loading envelope; moments split into column strip (width 0.5 min(l1, l2)) and middle strip using
//     EC2 Annex I Table I.1 mid-range (hogging 70%, sagging 60%) or BS 8110 Table 3.20 (75% and 55%).
// Moments are taken at the column centreline (conservative); the steel uses the same d = h - 35 mm as the rest of
// the slab design. Preliminary design only: review by a registered engineer.
import type { El, Lib } from './engineering';
import type { Group } from './model';
import type { Mat, Status } from './rc';
import { envelope } from './frame';
import { bar, flex } from './slabpanels';

const E = 30e6;                 // kN/m2, same for slab and columns so only ratios matter
const TOL = 0.3;                // m, columns closer than this to a line are on it
const bsOf = (m: Mat) => m.code === 'BS8110';

export type EqSpan = { from: number; to: number; L: number; sag: number; hogL: number; hogR: number };
export type EqNode = { Kc: number; Kt: number; Kec: number };
export type EqBars = { topCS: string; topMS: string; botCS: string; botMS: string };
export type EqLine = {
  dir: 'x' | 'y'; at: number; width: number; csWidth: number; msWidth: number; wMax: number;
  spans: EqSpan[]; nodes: EqNode[]; bars: EqBars; status: Status; notes: string[]; steps: string[];
  mTopCS: number; mTopMS: number; mBotCS: number; mBotMS: number;   // governing design moments, kNm per metre of strip
};
export type EqStorey = { story: string; h: number; lines: EqLine[]; notes: string[]; steelKg: number };

type Col = { x: number; y: number; cx: number; cy: number };

// group sorted values into clusters within tolerance
function cluster(vals: number[]): number[][] {
  const idx = vals.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]), out: number[][] = [];
  for (const [v, i] of idx) { const last = out[out.length - 1]; if (last && Math.abs(v - vals[last[last.length - 1]]) < TOL) last.push(i); else out.push([i]); }
  return out;
}

export function equivalentFrame(g: Group, lib: Lib[], m: Mat, o: { imposed: number; h?: number; colsAbove?: boolean }): EqStorey {
  const story = g.story.name, H = g.story.height_m || 3.6, bs = bsOf(m);
  const none = (notes: string[]): EqStorey => ({ story, h: 0, lines: [], notes, steelKg: 0 });
  if (g.els.some(e => e.type === 'beam')) return none(['This storey has beams: the equivalent frame applies to flat slabs only (no beams).']);
  const specOf = (e: El) => lib.find(l => l.id === e.library_item_id)?.specs ?? {};
  const cols: Col[] = g.els.filter(e => e.type === 'column' && e.geometry.at).map(e => {
    const sp = specOf(e), at = e.geometry.at as number[];
    return { x: at[0], y: at[1], cx: (sp.b_mm ?? (e.geometry.b ? e.geometry.b * 1000 : 300)) / 1000, cy: (sp.h_mm ?? (e.geometry.h ? e.geometry.h * 1000 : 300)) / 1000 };
  });
  if (cols.length < 4) return none(['Needs a column grid of at least two lines in each direction.']);

  const xs = [...new Set(cols.map(c => Math.round(c.x * 100) / 100))], ys = [...new Set(cols.map(c => Math.round(c.y * 100) / 100))];
  const spanMax = Math.max(...[xs, ys].map(a => { const s = [...a].sort((p, q) => p - q); return s.length > 1 ? Math.max(...s.slice(1).map((v, i) => v - s[i])) : 0; }));
  const slabs = g.els.filter(e => e.type === 'slab');
  const hMm = o.h ?? (slabs.length ? Math.round((slabs.reduce((a, s) => a + (s.geometry.z1 - s.geometry.z0), 0) / slabs.length) * 1000) : Math.max(200, Math.ceil(((spanMax * 1000) / 24 + 35) / 25) * 25));
  const h = hMm / 1000, d = hMm - 35, gG = bs ? 1.4 : 1.35, gQ = bs ? 1.6 : 1.5;
  const gk = 25 * h + 2.5, wuA = gG * gk + gQ * o.imposed, wminA = gG * gk;   // kN/m2
  const fracHog = bs ? 0.75 : 0.7, fracSag = bs ? 0.55 : 0.6;
  const lines: EqLine[] = [];
  let steelKg = 0;

  for (const dir of ['x', 'y'] as const) {
    const along = (c: Col) => (dir === 'x' ? c.x : c.y), perp = (c: Col) => (dir === 'x' ? c.y : c.x);
    const cAlong = (c: Col) => (dir === 'x' ? c.cx : c.cy), cPerp = (c: Col) => (dir === 'x' ? c.cy : c.cx);
    const groups = cluster(cols.map(perp));
    const pos = groups.map(gr => gr.reduce((a, i) => a + perp(cols[i]), 0) / gr.length);
    groups.forEach((gr, k) => {
      const lc = gr.map(i => cols[i]).sort((a, b) => along(a) - along(b));
      if (lc.length < 2) return;
      const lo = k > 0 ? (pos[k] - pos[k - 1]) / 2 : 0, hi = k < groups.length - 1 ? (pos[k + 1] - pos[k]) / 2 : 0;
      const edge = lo === 0 || hi === 0;
      const spansL = lc.slice(1).map((c, i) => along(c) - along(lc[i])).filter(L => L > 0.5);
      const width = lo + hi || spansL.reduce((a, b) => a + b, 0) / spansL.length;
      const notes: string[] = [], steps: string[] = [];
      const I = (width * h ** 3) / 12;
      const nCol = o.colsAbove === false ? 1 : 2;
      const nodes: EqNode[] = lc.map(c => {
        const Ic = (cPerp(c) * cAlong(c) ** 3) / 12, Kc = nCol * ((4 * E * Ic) / H);
        const x = Math.min(h, cPerp(c)), y = Math.max(h, cPerp(c)), C = (1 - 0.63 * (x / y)) * ((x ** 3 * y) / 3);
        const r = Math.min(cPerp(c) / width, 0.9), Kt = ((9 * E * C) / (width * (1 - r) ** 3)) * (edge ? 0.5 : 1);
        return { Kc, Kt, Kec: 1 / (1 / Kc + 1 / Kt) };
      });
      const spans = lc.slice(1).map((c, i) => ({ L: along(c) - along(lc[i]), EI: E * I, wMax: wuA * width, wMin: wminA * width }));
      const env = envelope(spans, nodes.map(n => n.Kec));
      const eqSpans: EqSpan[] = env.map((e, i) => ({ from: i, to: i + 1, L: spans[i].L, sag: e.sag, hogL: e.hogL, hogR: e.hogR }));
      const hogMax = Math.max(...eqSpans.flatMap(s => [s.hogL, s.hogR])), sagMax = Math.max(...eqSpans.map(s => s.sag));
      const lMin = Math.min(...spans.map(s => s.L)), csWidth = Math.min(width, 0.5 * Math.min(lMin, width)), msWidth = Math.max(width - csWidth, 0.1);
      const mTopCS = (fracHog * hogMax) / csWidth, mTopMS = ((1 - fracHog) * hogMax) / msWidth, mBotCS = (fracSag * sagMax) / csWidth, mBotMS = ((1 - fracSag) * sagMax) / msWidth;
      let status: Status = 'ok', steel = 0;
      const mk = (mm: number, label: string, bw: number) => {
        const As = flex(mm * 1e6, d, m, hMm);
        if (As == null) { status = 'bad'; notes.push(`${label}: moment too high for a singly reinforced section: thicken the slab or add drop panels`); return { txt: 'n/a', As: 0 }; }
        const b = bar(As, hMm); steel += b.As * bw * (spansL.reduce((a, c) => a + c, 0) * 0.75) * 7.85e-3; return { txt: b.txt, As };
      };
      const tCS = mk(mTopCS, 'Column strip hogging', csWidth), tMS = mk(mTopMS, 'Middle strip hogging', msWidth), bCS = mk(mBotCS, 'Column strip sagging', csWidth), bMS = mk(mBotMS, 'Middle strip sagging', msWidth);
      steelKg += steel;
      if (edge && groups.length > 1) notes.push('Edge line: torsional stiffness halved; edge column moments need a check for moment transfer to the column (EC2 9.4.2).');
      steps.push(
        `${dir.toUpperCase()}-direction line at ${dir === 'x' ? 'y' : 'x'} = ${pos[k].toFixed(2)} m, ${lc.length} columns, ${spans.length} span${spans.length > 1 ? 's' : ''}; strip width ${width.toFixed(2)} m, h = ${hMm} mm, d = ${d} mm`,
        `Load ${wuA.toFixed(1)} kN/m² (${gG} Gk + ${gQ} Qk, Gk = ${gk.toFixed(1)}) = ${(wuA * width).toFixed(1)} kN/m on the strip; pattern loading envelope`,
        `Equivalent columns: Kc = ${nodes.map(n => n.Kc.toFixed(0)).join(', ')}; Kt = ${nodes.map(n => n.Kt.toFixed(0)).join(', ')}; Kec = ${nodes.map(n => n.Kec.toFixed(0)).join(', ')} kNm/rad`,
        `Governing frame moments: hogging ${hogMax.toFixed(1)} kNm, sagging ${sagMax.toFixed(1)} kNm; column strip ${csWidth.toFixed(2)} m takes ${Math.round(fracHog * 100)}% of hogging and ${Math.round(fracSag * 100)}% of sagging (${bs ? 'BS 8110 Table 3.20' : 'EC2 Annex I Table I.1'})`,
        `Per metre: column strip top ${mTopCS.toFixed(1)}, bottom ${mBotCS.toFixed(1)}; middle strip top ${mTopMS.toFixed(1)}, bottom ${mBotMS.toFixed(1)} kNm/m`);
      lines.push({ dir, at: pos[k], width, csWidth, msWidth, wMax: wuA * width, spans: eqSpans, nodes, bars: { topCS: tCS.txt, topMS: tMS.txt, botCS: bCS.txt, botMS: bMS.txt }, status, notes, steps, mTopCS, mTopMS, mBotCS, mBotMS });
    });
  }
  const notes = lines.length ? ['Moments at column centrelines, column and middle strip split from the code tables. Check punching shear and moment transfer at every column.'] : ['No column lines with two or more columns were found.'];
  return { story, h: hMm, lines, notes, steelKg };
}
