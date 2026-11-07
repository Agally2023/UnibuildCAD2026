// Parametric 2D sketch: points, lines, circles, dimensions and geometric constraints, solved together by
// damped least squares (Levenberg-Marquardt) starting from the drawn positions, so a rough sketch snaps to its constraints.
// Units are millimetres in the parts workspace.

export type Pt = { id: string; x: number; y: number };
export type Ln = { id: string; a: string; b: string; axis?: boolean };   // axis = construction line (used by revolve)
export type Ci = { id: string; c: string; r: number };
export type Con =
  | { id: string; t: 'coincident'; a: string; b: string }
  | { id: string; t: 'fix'; p: string }
  | { id: string; t: 'horizontal' | 'vertical'; l: string }
  | { id: string; t: 'parallel' | 'perpendicular' | 'equal'; l1: string; l2: string }
  | { id: string; t: 'length'; l: string; v: string }          // v is an expression: "120" or "width/2"
  | { id: string; t: 'dx' | 'dy'; a: string; b: string; v: string }  // horizontal / vertical distance from point a to point b
  | { id: string; t: 'radius'; c: string; v: string }
  | { id: string; t: 'angle'; l: string; v: string };           // angle of the line from the sketch x axis, degrees
export type ConBody = Con extends infer C ? (C extends unknown ? Omit<C, 'id'> : never) : never;
export type Sketch = { pts: Pt[]; lines: Ln[]; circles: Ci[]; cons: Con[] };
export type SolveInfo = { ok: boolean; dof: number; residual: number; message: string };

// ---------- expressions (no eval) ----------
export function calc(src: string, params: Record<string, number> = {}): number {
  const s = src.replace(/\s+/g, '');
  let i = 0;
  const fail = (m: string): never => { throw new Error(`${m} in "${src}"`); };
  const fn: Record<string, (x: number) => number> = { sin: x => Math.sin(x * Math.PI / 180), cos: x => Math.cos(x * Math.PI / 180), tan: x => Math.tan(x * Math.PI / 180), sqrt: Math.sqrt, abs: Math.abs };
  const expr = (): number => { let v = term(); while (s[i] === '+' || s[i] === '-') { const o = s[i++]; const r = term(); v = o === '+' ? v + r : v - r; } return v; };
  const term = (): number => { let v = pow(); while (s[i] === '*' || s[i] === '/') { const o = s[i++]; const r = pow(); if (o === '/' && r === 0) fail('Division by zero'); v = o === '*' ? v * r : v / r; } return v; };
  const pow = (): number => { const b = unary(); if (s[i] === '^') { i++; return Math.pow(b, pow()); } return b; };
  const unary = (): number => { if (s[i] === '-') { i++; return -unary(); } if (s[i] === '+') { i++; return unary(); } return atom(); };
  const atom = (): number => {
    if (s[i] === '(') { i++; const v = expr(); if (s[i++] !== ')') fail('Missing )'); return v; }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
    if (num) { i += num[0].length; return parseFloat(num[0]); }
    const id = /^[A-Za-z_][A-Za-z_0-9]*/.exec(s.slice(i));
    if (id) {
      i += id[0].length;
      if (s[i] === '(') { const f = fn[id[0]]; if (!f) fail(`Unknown function ${id[0]}`); i++; const v = expr(); if (s[i++] !== ')') fail('Missing )'); return f(v); }
      if (id[0] === 'pi') return Math.PI;
      if (id[0] in params) return params[id[0]];
      return fail(`Unknown name ${id[0]}`);
    }
    return fail('Unexpected input');
  };
  if (!s) fail('Empty expression');
  const v = expr();
  if (i < s.length) fail('Unexpected input');
  if (!Number.isFinite(v)) fail('Not a finite number');
  return v;
}

// Named parameters may refer to each other in any order.
export function evalParams(list: { name: string; expr: string }[]): { values: Record<string, number>; errors: string[] } {
  const values: Record<string, number> = {}; let pending = list.filter(p => p.name.trim());
  for (let pass = 0; pass <= list.length && pending.length; pass++) {
    const left: typeof pending = [];
    for (const p of pending) { try { values[p.name] = calc(p.expr, values); } catch { left.push(p); } }
    if (left.length === pending.length) break;
    pending = left;
  }
  return { values, errors: pending.map(p => { try { calc(p.expr, values); return ''; } catch (e: any) { return `Parameter ${p.name}: ${e.message}`; } }) };
}

// ---------- solver ----------
type Idx = { px: Map<string, number>; cr: Map<string, number>; n: number };

function layout(sk: Sketch): Idx {
  const px = new Map<string, number>(), cr = new Map<string, number>(); let n = 0;
  sk.pts.forEach(p => { px.set(p.id, n); n += 2; });
  sk.circles.forEach(c => { cr.set(c.id, n); n += 1; });
  return { px, cr, n };
}

function residuals(sk: Sketch, ix: Idx, x: number[], home: number[], val: (e: string) => number): number[] {
  const P = (id: string) => { const k = ix.px.get(id); if (k === undefined) throw new Error(`Unknown point ${id}`); return [x[k], x[k + 1]]; };
  const L = (id: string) => { const l = sk.lines.find(q => q.id === id); if (!l) throw new Error(`Unknown line ${id}`); const a = P(l.a), b = P(l.b); return { a, b, dx: b[0] - a[0], dy: b[1] - a[1] }; };
  const out: number[] = [];
  for (const c of sk.cons) {
    switch (c.t) {
      case 'coincident': { const a = P(c.a), b = P(c.b); out.push(a[0] - b[0], a[1] - b[1]); break; }
      case 'fix': { const k = ix.px.get(c.p)!; out.push(x[k] - home[k], x[k + 1] - home[k + 1]); break; }
      case 'horizontal': out.push(L(c.l).dy); break;
      case 'vertical': out.push(L(c.l).dx); break;
      case 'parallel': { const p = L(c.l1), q = L(c.l2); out.push((p.dx * q.dy - p.dy * q.dx) / ((Math.hypot(p.dx, p.dy) * Math.hypot(q.dx, q.dy)) || 1)); break; }
      case 'perpendicular': { const p = L(c.l1), q = L(c.l2); out.push((p.dx * q.dx + p.dy * q.dy) / ((Math.hypot(p.dx, p.dy) * Math.hypot(q.dx, q.dy)) || 1)); break; }
      case 'equal': { const p = L(c.l1), q = L(c.l2); out.push(Math.hypot(p.dx, p.dy) - Math.hypot(q.dx, q.dy)); break; }
      case 'length': { const p = L(c.l); out.push(Math.hypot(p.dx, p.dy) - val(c.v)); break; }
      case 'dx': { const a = P(c.a), b = P(c.b); out.push(b[0] - a[0] - val(c.v)); break; }
      case 'dy': { const a = P(c.a), b = P(c.b); out.push(b[1] - a[1] - val(c.v)); break; }
      case 'radius': { const k = ix.cr.get(c.c); if (k === undefined) throw new Error(`Unknown circle ${c.c}`); out.push(x[k] - val(c.v)); break; }
      case 'angle': { const p = L(c.l), t = val(c.v) * Math.PI / 180; out.push(p.dy * Math.cos(t) - p.dx * Math.sin(t)); const h = Math.hypot(p.dx, p.dy); out.push(Math.min(0, p.dx * Math.cos(t) + p.dy * Math.sin(t)) * (h ? 1 : 0)); break; }
    }
  }
  return out;
}

function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x;
}

function rankOf(J: number[][], tol: number): number {
  const M = J.map(r => [...r]); let rank = 0; const rows = M.length, cols = rows ? M[0].length : 0;
  for (let c = 0; c < cols && rank < rows; c++) {
    let p = rank; for (let r = rank + 1; r < rows; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < tol) continue;
    [M[rank], M[p]] = [M[p], M[rank]];
    for (let r = rank + 1; r < rows; r++) { const f = M[r][c] / M[rank][c]; for (let k = c; k < cols; k++) M[r][k] -= f * M[rank][k]; }
    rank++;
  }
  return rank;
}

export function solveSketch(sk: Sketch, params: Record<string, number> = {}): { sketch: Sketch; info: SolveInfo } {
  const val = (e: string) => calc(e, params);
  const ix = layout(sk), N = ix.n;
  const x = Array(N).fill(0); sk.pts.forEach(p => { const k = ix.px.get(p.id)!; x[k] = p.x; x[k + 1] = p.y; }); sk.circles.forEach(c => { x[ix.cr.get(c.id)!] = c.r; });
  const home = [...x];
  if (!sk.cons.length || !N) return { sketch: sk, info: { ok: true, dof: N, residual: 0, message: N ? `${N} degrees of freedom` : '' } };
  const f = (v: number[]) => residuals(sk, ix, v, home, val);
  const jac = (v: number[], r0: number[]) => {
    const J = r0.map(() => Array(N).fill(0));
    for (let k = 0; k < N; k++) { const h = 1e-6 * Math.max(1, Math.abs(v[k])), w = [...v]; w[k] += h; const r1 = f(w); w[k] = v[k] - h; const r2 = f(w); for (let i = 0; i < r0.length; i++) J[i][k] = (r1[i] - r2[i]) / (2 * h); }
    return J;
  };
  let r = f(x), cost = r.reduce((a, v) => a + v * v, 0), mu = 1e-3;
  for (let it = 0; it < 200 && cost > 1e-22; it++) {
    const J = jac(x, r), A = Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => J.reduce((s, row) => s + row[i] * row[j], 0) + (i === j ? mu : 0)));
    const g = Array.from({ length: N }, (_, i) => -J.reduce((s, row, k) => s + row[i] * r[k], 0));
    const d = solveLinear(A, g); if (!d) { mu *= 10; continue; }
    const xn = x.map((v, i) => v + d[i]), rn = f(xn), cn = rn.reduce((a, v) => a + v * v, 0);
    if (cn < cost) { for (let i = 0; i < N; i++) x[i] = xn[i]; r = rn; const done = cost - cn < 1e-26 * Math.max(1, cost); cost = cn; mu = Math.max(mu / 5, 1e-12); if (done) break; } else { mu *= 8; if (mu > 1e12) break; }
  }
  const res = Math.sqrt(cost), J = jac(x, r), rank = rankOf(J, 1e-7), dof = Math.max(0, N - rank), ok = res < 1e-6;
  const out: Sketch = { ...sk, pts: sk.pts.map(p => { const k = ix.px.get(p.id)!; return { ...p, x: x[k], y: x[k + 1] }; }), circles: sk.circles.map(c => ({ ...c, r: x[ix.cr.get(c.id)!] })) };
  const message = !ok ? 'The constraints conflict or cannot be met. Remove or change the last one added.' : dof === 0 ? 'Fully constrained' : `${dof} degree${dof === 1 ? '' : 's'} of freedom left`;
  return { sketch: out, info: { ok, dof, residual: res, message } };
}

// ---------- profiles ----------
export type Region = { outer: [number, number][]; holes: [number, number][][] };
const area2 = (p: [number, number][]) => p.reduce((s, q, i) => { const n = p[(i + 1) % p.length]; return s + q[0] * n[1] - n[0] * q[1]; }, 0) / 2;
const inside = (pt: [number, number], poly: [number, number][]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };

export function circlePolygon(cx: number, cy: number, r: number, n = 48): [number, number][] {
  return Array.from({ length: n }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / n), cy + r * Math.sin((2 * Math.PI * i) / n)] as [number, number]);
}

// Closed chains of lines (joined by shared or coincident points) and circles become loops; loops inside other loops are holes.
export function profiles(sk: Sketch): { regions: Region[]; open: number } {
  const parent = new Map<string, string>(); const find = (a: string): string => { const p = parent.get(a) ?? a; if (p === a) return a; const r = find(p); parent.set(a, r); return r; };
  sk.cons.forEach(c => { if (c.t === 'coincident') parent.set(find(c.a), find(c.b)); });
  const at = new Map(sk.pts.map(p => [p.id, [p.x, p.y] as [number, number]]));
  const edges = sk.lines.filter(l => !l.axis).map(l => ({ a: find(l.a), b: find(l.b), id: l.id })).filter(e => e.a !== e.b);
  const adj = new Map<string, typeof edges>(); edges.forEach(e => { (adj.get(e.a) ?? adj.set(e.a, []).get(e.a)!).push(e); (adj.get(e.b) ?? adj.set(e.b, []).get(e.b)!).push(e); });
  const used = new Set<string>(), loops: [number, number][][] = []; let open = 0;
  for (const e0 of edges) {
    if (used.has(e0.id)) continue;
    const chain = [e0.a]; let cur = e0.b, e = e0; used.add(e0.id); let closed = false;
    for (let guard = 0; guard < edges.length + 2; guard++) {
      chain.push(cur);
      if (cur === e0.a) { closed = true; chain.pop(); break; }
      const nx = (adj.get(cur) ?? []).find(q => !used.has(q.id));
      if (!nx) break;
      used.add(nx.id); cur = nx.a === cur ? nx.b : nx.a; e = nx;
    }
    void e;
    const pts = chain.map(id => at.get(sk.pts.find(p => find(p.id) === id)?.id ?? id)!).filter(Boolean);
    if (closed && pts.length >= 3) loops.push(pts); else open++;
  }
  sk.circles.forEach(c => { const p = at.get(c.c); if (p && c.r > 1e-9) loops.push(circlePolygon(p[0], p[1], c.r)); });
  const info = loops.map(l => ({ l, a: Math.abs(area2(l)) })).filter(q => q.a > 1e-9);
  const depth = info.map((q, i) => info.filter((o, j) => j !== i && o.a > q.a && inside(q.l[0], o.l)).length);
  const regions: Region[] = [];
  info.forEach((q, i) => {
    if (depth[i] % 2) return;
    const loop = area2(q.l) < 0 ? [...q.l].reverse() : q.l;
    const holes = info.filter((h, j) => depth[j] === depth[i] + 1 && inside(h.l[0], q.l)).map(h => (area2(h.l) > 0 ? [...h.l].reverse() : h.l));
    regions.push({ outer: loop, holes });
  });
  return { regions, open };
}

// ---------- convenience constructors ----------
let seq = 0;
export const uid = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;
export const emptySketch = (): Sketch => ({ pts: [], lines: [], circles: [], cons: [] });

export function addLine(sk: Sketch, a: [number, number], b: [number, number], opt: { axis?: boolean; snap?: number } = {}): { sketch: Sketch; line: string } {
  const near = (q: [number, number]) => sk.pts.find(p => Math.hypot(p.x - q[0], p.y - q[1]) <= (opt.snap ?? 0));
  const pa = near(a) ?? { id: uid('p'), x: a[0], y: a[1] }, pb = near(b) ?? { id: uid('p'), x: b[0], y: b[1] };
  const line = { id: uid('l'), a: pa.id, b: pb.id, axis: opt.axis };
  const pts = [...sk.pts]; if (!sk.pts.includes(pa)) pts.push(pa); if (!sk.pts.includes(pb)) pts.push(pb);
  return { sketch: { ...sk, pts, lines: [...sk.lines, line] }, line: line.id };
}

export function addRect(sk: Sketch, a: [number, number], b: [number, number]): Sketch {
  const c = [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]] as [number, number][];
  const pts = c.map(p => ({ id: uid('p'), x: p[0], y: p[1] })), lines = pts.map((p, i) => ({ id: uid('l'), a: p.id, b: pts[(i + 1) % 4].id }));
  const cons: Con[] = [{ id: uid('c'), t: 'horizontal', l: lines[0].id }, { id: uid('c'), t: 'vertical', l: lines[1].id }, { id: uid('c'), t: 'horizontal', l: lines[2].id }, { id: uid('c'), t: 'vertical', l: lines[3].id }];
  return { pts: [...sk.pts, ...pts], lines: [...sk.lines, ...lines], circles: sk.circles, cons: [...sk.cons, ...cons] };
}

export function addCircle(sk: Sketch, c: [number, number], r: number): { sketch: Sketch; circle: string } {
  const p = { id: uid('p'), x: c[0], y: c[1] }, circle = { id: uid('o'), c: p.id, r };
  return { sketch: { ...sk, pts: [...sk.pts, p], circles: [...sk.circles, circle] }, circle: circle.id };
}

// Regular polygon from its centre and one corner (n sides). The corners are left free so they can be dimensioned.
export function addPolygon(sk: Sketch, c: [number, number], corner: [number, number], n: number): Sketch {
  const r = Math.hypot(corner[0] - c[0], corner[1] - c[1]), a0 = Math.atan2(corner[1] - c[1], corner[0] - c[0]);
  const pts = Array.from({ length: Math.max(3, Math.round(n)) }, (_, i) => ({ id: uid('p'), x: c[0] + r * Math.cos(a0 + (2 * Math.PI * i) / Math.max(3, Math.round(n))), y: c[1] + r * Math.sin(a0 + (2 * Math.PI * i) / Math.max(3, Math.round(n))) }));
  const lines = pts.map((p, i) => ({ id: uid('l'), a: p.id, b: pts[(i + 1) % pts.length].id }));
  return { ...sk, pts: [...sk.pts, ...pts], lines: [...sk.lines, ...lines] };
}

// Cut a corner where exactly two lines meet at a point: both lines are shortened by d and joined by a new line.
export function chamferCorner(sk: Sketch, pointId: string, d: number): Sketch | null {
  const at = sk.pts.find(p => p.id === pointId), two = sk.lines.filter(l => !l.axis && (l.a === pointId || l.b === pointId));
  if (!at || two.length !== 2 || d <= 0) return null;
  const ends = two.map(l => sk.pts.find(p => p.id === (l.a === pointId ? l.b : l.a))!), news: Pt[] = [];
  for (const e of ends) { const L = Math.hypot(e.x - at.x, e.y - at.y); if (L <= d + 1e-9) return null; news.push({ id: uid('p'), x: at.x + ((e.x - at.x) / L) * d, y: at.y + ((e.y - at.y) / L) * d }); }
  const lines = sk.lines.map(l => (l.id === two[0].id ? { ...l, a: l.a === pointId ? news[0].id : l.a, b: l.b === pointId ? news[0].id : l.b } : l.id === two[1].id ? { ...l, a: l.a === pointId ? news[1].id : l.a, b: l.b === pointId ? news[1].id : l.b } : l));
  const gone = new Set(two.map(l => l.id));
  const cons = sk.cons.filter(c => !(('p' in c && c.p === pointId) || ('a' in c && 'b' in c && (c.a === pointId || c.b === pointId)) || (c.t === 'length' && gone.has(c.l)) || (('l' in c) && gone.has((c as any).l) && ['horizontal', 'vertical', 'angle'].includes(c.t)) || (('l1' in c) && (gone.has(c.l1) || gone.has(c.l2)))));
  return { ...sk, pts: [...sk.pts.filter(p => p.id !== pointId), ...news], lines: [...lines, { id: uid('l'), a: news[0].id, b: news[1].id }], circles: sk.circles, cons };
}

// n circles of diameter dia, evenly spaced on a pitch circle of diameter pcd about the centre c, the first at angle start (degrees).
export function boltCircle(sk: Sketch, c: [number, number], pcd: number, n: number, dia: number, start = 0): Sketch {
  let out = sk; const k = Math.max(1, Math.round(n));
  for (let i = 0; i < k; i++) { const a = ((start + (360 * i) / k) * Math.PI) / 180; out = addCircle(out, [c[0] + (pcd / 2) * Math.cos(a), c[1] + (pcd / 2) * Math.sin(a)], dia / 2).sketch; }
  return out;
}
