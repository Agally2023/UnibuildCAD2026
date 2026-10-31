// MEP auto-routing and sizing for one storey.
// Outlets (type "fixture", with a cooling load in kW) are connected to the nearest plant (type "equipment") by
// orthogonal routes over a 0.5 m grid: columns are blocked, wall crossings are expensive, turns are penalised,
// and later outlets join the existing tree. Branch flows are accumulated and each segment is sized. The tree is then
// lowered under any beam it meets using the clash engine, and checked again.
import type { El, Lib } from './engineering';
import { detect, shapes } from './clash';

type Pt = [number, number];
export type MepSeg = { start: Pt; end: Pt; elevation: number; flow: number; kind: 'duct' | 'pipe'; size: { w_mm?: number; h_mm?: number; dia_mm?: number }; velocity: number };
export type MepInput = { els: El[]; lib: Lib[]; storeyH: number; maxDuctH: number; includePipes: boolean; requiredClear: number; slabT: number };
export type MepResult = {
  ducts: MepSeg[]; pipes: MepSeg[]; notes: string[]; unreached: number;
  stats: { outlets: number; plants: number; ductLen: number; pipeLen: number; totalAir: number; totalKw: number; penetrations: number; maxVelocity: number; lowestBottom: number; clear: number; clashes: number };
};

const STEP = 0.5, TURN = 3, WALL_COST = 15, PIPE_AVOID = 20;
const AIR_PER_KW = 1 / 12.07;          // m³/s per kW at ΔT = 10 K
const WATER_LS_PER_KW = 1 / 20.95;     // l/s per kW at ΔT = 5 K
const DN = [20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250];

export function sizeDuct(Q: number, maxH: number) {
  const v = Q > 1 ? 6 : Q > 0.4 ? 5 : 4, A = Q / v;
  const h = Math.min(maxH, Math.max(0.15, Math.ceil(Math.sqrt(A / 2) / 0.05) * 0.05));
  const w = Math.max(0.2, Math.ceil(A / h / 0.05) * 0.05);
  return { w_mm: Math.round(w * 1000), h_mm: Math.round(h * 1000), velocity: Q / (w * h) };
}
export function sizePipe(ls: number) {
  for (const dn of DN) { const v = ls / 1000 / ((Math.PI / 4) * (dn / 1000) ** 2); if (v <= (dn <= 50 ? 1.2 : dn <= 100 ? 1.8 : 2.5)) return { dia_mm: dn + 12, dn, velocity: v }; }
  return { dia_mm: 262, dn: 250, velocity: ls / 1000 / ((Math.PI / 4) * 0.25 ** 2) };
}

class Heap {
  a: [number, number][] = [];
  push(x: [number, number]) { const a = this.a; a.push(x); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop()!; if (a.length) { a[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  get size() { return this.a.length; }
}

function makeGrid(points: Pt[], els: El[], specOf: (e: El) => any) {
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const ox = Math.floor((Math.min(...xs) - 2) / STEP) * STEP, oy = Math.floor((Math.min(...ys) - 2) / STEP) * STEP;
  const nx = Math.ceil((Math.max(...xs) + 2 - ox) / STEP) + 1, ny = Math.ceil((Math.max(...ys) + 2 - oy) / STEP) + 1, n = nx * ny;
  const blocked = new Uint8Array(n), wall = new Float32Array(n);
  const cell = (p: Pt) => Math.min(ny - 1, Math.max(0, Math.round((p[1] - oy) / STEP))) * nx + Math.min(nx - 1, Math.max(0, Math.round((p[0] - ox) / STEP)));
  const pos = (c: number): Pt => [ox + (c % nx) * STEP, oy + Math.floor(c / nx) * STEP];
  for (const e of els) {
    const g = e.geometry;
    if (e.type === 'column') {
      const s = specOf(e), hb = ((s.b_mm ?? g.b * 1000) / 2000) + 0.4, hh = ((s.h_mm ?? g.h * 1000) / 2000) + 0.4;
      for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) { const x = ox + ix * STEP, y = oy + iy * STEP; if (Math.abs(x - g.at[0]) <= hb && Math.abs(y - g.at[1]) <= hh) blocked[iy * nx + ix] = 1; }
    } else if (e.type === 'wall') {
      const [a, b] = [g.start as Pt, g.end as Pt], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9, lim = (g.thickness ?? 0.2) / 2 + 0.3;
      const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - lim - ox) / STEP)), i1 = Math.min(nx - 1, Math.ceil((Math.max(a[0], b[0]) + lim - ox) / STEP));
      const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - lim - oy) / STEP)), j1 = Math.min(ny - 1, Math.ceil((Math.max(a[1], b[1]) + lim - oy) / STEP));
      for (let iy = j0; iy <= j1; iy++) for (let ix = i0; ix <= i1; ix++) {
        const x = ox + ix * STEP, y = oy + iy * STEP, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2));
        if (Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy)) <= lim) wall[iy * nx + ix] = WALL_COST;
      }
    }
  }
  return { nx, ny, n, ox, oy, blocked, wall, cell, pos };
}
type Grid = ReturnType<typeof makeGrid>;

// cheapest orthogonal route from start to any goal cell (turns and wall crossings cost extra)
function route(G: Grid, start: number, goals: Set<number>, extra?: Float32Array): number[] | null {
  const { nx, ny, n, blocked, wall } = G, dist = new Float32Array(n * 5).fill(Infinity), prev = new Int32Array(n * 5).fill(-1), heap = new Heap();
  const saved = blocked[start]; blocked[start] = 0;
  const s0 = start * 5 + 4; dist[s0] = 0; heap.push([0, s0]);
  const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
  let found = -1;
  while (heap.size) {
    const [d, st] = heap.pop(); if (d > dist[st]) continue;
    const c = (st / 5) | 0, pd = st % 5;
    if (goals.has(c)) { found = st; break; }
    const cx = c % nx, cy = (c / nx) | 0;
    for (let k = 0; k < 4; k++) {
      const x = cx + DX[k], y = cy + DY[k]; if (x < 0 || y < 0 || x >= nx || y >= ny) continue;
      const nc = y * nx + x; if (blocked[nc] && !goals.has(nc)) continue;
      const cost = d + 1 + wall[nc] + (extra ? extra[nc] : 0) + (pd !== 4 && pd !== k ? TURN : 0), ns = nc * 5 + k;
      if (cost < dist[ns]) { dist[ns] = cost; prev[ns] = st; heap.push([cost, ns]); }
    }
  }
  blocked[start] = saved;
  if (found < 0) return null;
  const path: number[] = []; for (let st = found; st !== -1; st = prev[st]) path.push((st / 5) | 0);
  return path.reverse();                                 // start ... goal
}

type Edge = { a: number; b: number; Q: number };
function buildTree(G: Grid, plant: number, outlets: { cell: number; q: number }[], extra?: Float32Array) {
  const parent = new Map<number, number>(), tree = new Set<number>([plant]), reached: { cell: number; q: number }[] = [];
  let unreached = 0;
  const md = (c: number) => Math.abs((c % G.nx) - (plant % G.nx)) + Math.abs(((c / G.nx) | 0) - ((plant / G.nx) | 0));
  for (const o of [...outlets].sort((p, q) => md(p.cell) - md(q.cell))) {
    if (tree.has(o.cell)) { reached.push(o); continue; }
    const path = route(G, o.cell, tree, extra);
    if (!path) { unreached++; continue; }
    for (let i = 0; i < path.length - 1; i++) parent.set(path[i], path[i + 1]);
    path.forEach(c => tree.add(c)); reached.push(o);
  }
  const edgeQ = new Map<number, number>();
  for (const o of reached) { let cur = o.cell, guard = 0; while (cur !== plant && guard++ < 1e5) { const p = parent.get(cur); if (p === undefined) break; edgeQ.set(cur, (edgeQ.get(cur) ?? 0) + o.q); cur = p; } }
  let edges: Edge[] = [...edgeQ].map(([a, Q]) => ({ a, b: parent.get(a)!, Q }));
  // merge straight runs of equal flow into single segments
  const dirOf = (e: Edge) => [Math.sign((e.b % G.nx) - (e.a % G.nx)), Math.sign(((e.b / G.nx) | 0) - ((e.a / G.nx) | 0))];
  for (let changed = true; changed; ) {
    changed = false;
    const into = new Map<number, number>(), from = new Map<number, number>(); edges.forEach((e, i) => { into.set(e.b, (into.get(e.b) ?? 0) + 1); from.set(e.a, i); });
    for (let i = 0; i < edges.length && !changed; i++) {
      const e1 = edges[i], j = from.get(e1.b); if (j === undefined || j === i || into.get(e1.b) !== 1) continue;
      const e2 = edges[j], d1 = dirOf(e1), d2 = dirOf(e2);
      if (Math.abs(e1.Q - e2.Q) < 1e-9 && d1[0] === d2[0] && d1[1] === d2[1]) { edges[i] = { a: e1.a, b: e2.b, Q: e1.Q }; edges.splice(j, 1); changed = true; }
    }
  }
  return { edges, unreached };
}

export function planMep(inp: MepInput): MepResult {
  const specOf = (e: El) => inp.lib.find(l => l.id === e.library_item_id)?.specs ?? {};
  const els = inp.els.filter(e => !(e as any).properties?.auto);
  const outlets = els.filter(e => e.type === 'fixture' && e.geometry.at), plants = els.filter(e => e.type === 'equipment' && e.geometry.at);
  const empty: MepResult = { ducts: [], pipes: [], notes: [], unreached: 0, stats: { outlets: outlets.length, plants: plants.length, ductLen: 0, pipeLen: 0, totalAir: 0, totalKw: 0, penetrations: 0, maxVelocity: 0, lowestBottom: 0, clear: 0, clashes: 0 } };
  if (!outlets.length || !plants.length) { empty.notes.push(!plants.length ? 'Place a plant (air handler) first with the Plant tool.' : 'Place at least one outlet with the Outlet tool.'); return empty; }

  const pts: Pt[] = [];
  for (const e of els) { const g = e.geometry; if (g.start) pts.push(g.start, g.end); if (g.at) pts.push(g.at); if (g.rect) pts.push([g.rect[0], g.rect[1]], [g.rect[2], g.rect[3]]); }
  const G = makeGrid(pts, els, specOf), notes: string[] = [];
  const kw = (e: El) => e.geometry.kw ?? 5;
  const assign = new Map<number, { cell: number; q: number; l: number }[]>();
  const pc = plants.map(p => G.cell(p.geometry.at));
  outlets.forEach(o => {
    const c = G.cell(o.geometry.at); let best = 0, bd = Infinity;
    pc.forEach((p, i) => { const d = Math.abs((p % G.nx) - (c % G.nx)) + Math.abs(((p / G.nx) | 0) - ((c / G.nx) | 0)); if (d < bd) { bd = d; best = i; } });
    (assign.get(best) ?? assign.set(best, []).get(best)!).push({ cell: c, q: kw(o) * AIR_PER_KW, l: kw(o) * WATER_LS_PER_KW });
  });

  type Raw = { start: Pt; end: Pt; Q: number };
  const toSegs = (edges: Edge[]): Raw[] => edges.map(e => ({ start: G.pos(e.a), end: G.pos(e.b), Q: e.Q }));
  let unreached = 0; const dRaw: Raw[] = [], pRaw: Raw[] = []; const ductCells = new Float32Array(G.n);
  assign.forEach((os, pi) => { const t = buildTree(G, pc[pi], os); unreached += t.unreached; dRaw.push(...toSegs(t.edges)); t.edges.forEach(e => { ductCells[e.a] = PIPE_AVOID; ductCells[e.b] = PIPE_AVOID; }); });
  if (inp.includePipes) assign.forEach((os, pi) => { const t = buildTree(G, pc[pi], os.map(o => ({ cell: o.cell, q: o.l })), ductCells); unreached += t.unreached; pRaw.push(...toSegs(t.edges)); });
  if (unreached) notes.push(`${unreached} outlet${unreached > 1 ? 's' : ''} could not be reached (blocked by columns).`);

  const sized = dRaw.map(r => ({ ...r, ...sizeDuct(r.Q, inp.maxDuctH) }));
  const pSized = pRaw.map(r => ({ ...r, ...sizePipe(r.Q) }));
  // temporary library so the clash engine knows the new sizes
  const tmpLib: Lib[] = [...inp.lib];
  const lib = (id: string, category: string, s: any) => { if (!tmpLib.find(l => l.id === id)) tmpLib.push({ id, category, name: id, specs: s, unit_cost: null }); return id; };
  const dEls = (top: number): El[] => sized.map((s, i) => ({ id: `mep-d-${i}`, type: 'duct', library_item_id: lib(`dz-${s.w_mm}x${s.h_mm}`, 'duct', { w_mm: s.w_mm, h_mm: s.h_mm }), geometry: { start: s.start, end: s.end, elevation_m: top - s.h_mm / 2000 } }));
  const pEls = (top: number): El[] => pSized.map((s, i) => ({ id: `mep-p-${i}`, type: 'pipe', library_item_id: lib(`pz-${s.dia_mm}`, 'pipe', { dia_mm: s.dia_mm }), geometry: { start: s.start, end: s.end, elevation_m: top - s.dia_mm / 2000 } }));
  const z0 = new Map(shapes(els, tmpLib, inp.storeyH).map(s => [s.id, s.z0]));
  const isTmp = (id: string) => id.startsWith('mep-');
  const lowerBelowBeams = (top: number, cl: ReturnType<typeof detect>, withDucts?: number): number => {
    let t = top;
    for (const c of cl) {
      const other = isTmp(c.a) ? c.b : c.a, mine = isTmp(c.a) ? c.a : c.b; if (!isTmp(mine)) continue;
      if (z0.has(other) && els.find(e => e.id === other)?.type === 'beam') t = Math.min(t, z0.get(other)! - 0.05);
      if (withDucts !== undefined && isTmp(other)) t = Math.min(t, withDucts - 0.08);
    }
    return t;
  };
  let dTop = inp.storeyH - inp.slabT - 0.05;
  for (let it = 0; it < 4; it++) {
    const cl = detect([...els, ...dEls(dTop)], tmpLib, inp.storeyH).filter(c => isTmp(c.a) !== isTmp(c.b) && /structure/.test(c.kind));
    const nt = lowerBelowBeams(dTop, cl); if (nt >= dTop - 1e-6) break; dTop = nt;
  }
  const ducts = dEls(dTop); const ductBottom = sized.length ? Math.min(...ducts.map((d, i) => d.geometry.elevation_m - sized[i].h_mm / 2000)) : dTop;
  let pTop = dTop;
  if (pSized.length) for (let it = 0; it < 4; it++) {
    const cl = detect([...els, ...ducts, ...pEls(pTop)], tmpLib, inp.storeyH).filter(c => (c.a.startsWith('mep-p') || c.b.startsWith('mep-p')) && (c.kind === 'MEP vs structure' || c.kind === 'MEP vs MEP'));
    const nt = lowerBelowBeams(pTop, cl.map(c => (c.a.startsWith('mep-p') ? c : { ...c, a: c.b, b: c.a })), ductBottom); if (nt >= pTop - 1e-6) break; pTop = nt;
  }
  const pipes = pEls(pTop);
  const mk = (list: El[], raw: typeof sized | typeof pSized, kind: 'duct' | 'pipe'): MepSeg[] => list.map((e, i) => ({ start: e.geometry.start, end: e.geometry.end, elevation: Math.round(e.geometry.elevation_m * 1000) / 1000, flow: raw[i].Q, kind, velocity: (raw[i] as any).velocity, size: kind === 'duct' ? { w_mm: (raw[i] as any).w_mm, h_mm: (raw[i] as any).h_mm } : { dia_mm: (raw[i] as any).dia_mm } }));
  const dSegs = mk(ducts, sized, 'duct'), pSegs = mk(pipes, pSized, 'pipe');

  const final = detect([...els, ...ducts, ...pipes], tmpLib, inp.storeyH).filter(c => isTmp(c.a) || isTmp(c.b));
  const pen = final.filter(c => c.kind === 'Needs wall penetration').length, hard = final.filter(c => c.severity === 'high').length;
  const bottoms = [...dSegs.map(s => s.elevation - (s.size.h_mm ?? 0) / 2000), ...pSegs.map(s => s.elevation - (s.size.dia_mm ?? 0) / 2000)];
  const lowest = bottoms.length ? Math.min(...bottoms) : 0, clear = lowest - 0.1;
  if (clear < inp.requiredClear) notes.push(`Lowest MEP is ${lowest.toFixed(2)} m above the floor, leaving ${clear.toFixed(2)} m clear after a 100 mm allowance (needs ${inp.requiredClear} m): reduce the duct height limit or raise the storey height.`);
  if (sized.some(s => s.w_mm > 2000)) notes.push('A trunk duct is wider than 2 m: split it with a second plant or allow a taller duct.');
  if (pen) notes.push(`${pen} wall penetration${pen > 1 ? 's' : ''} needed: sleeves or openings must be coordinated with the architect.`);
  if (hard) notes.push(`${hard} clash${hard > 1 ? 'es' : ''} remain with other elements: run clash detection and adjust.`);
  const len = (a: MepSeg[]) => a.reduce((t, s) => t + Math.hypot(s.end[0] - s.start[0], s.end[1] - s.start[1]), 0);
  return {
    ducts: dSegs, pipes: pSegs, notes, unreached,
    stats: { outlets: outlets.length, plants: plants.length, ductLen: len(dSegs), pipeLen: len(pSegs), totalAir: outlets.reduce((a, o) => a + kw(o) * AIR_PER_KW, 0), totalKw: outlets.reduce((a, o) => a + kw(o), 0), penetrations: pen, maxVelocity: Math.max(0, ...dSegs.map(s => s.velocity)), lowestBottom: lowest, clear, clashes: hard },
  };
}
