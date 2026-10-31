// Continuous beam analysis by the slope-deflection (stiffness) method, with EN 1992-1-1 5.1.3 load patterns.
// Units: kN, m, kNm. Supports are vertical pins at every node; sagging moments are positive.
// Optional `springs` (length = spans + 1) are rotational spring stiffnesses (kNm/rad) at the nodes, for example the
// stiffness of the columns above and below a support. Omitted or 0 gives a pin; very large gives a fixed support.
export type Span = { L: number; EI: number; wMax: number; wMin: number };
export type SpanEnv = { sag: number; hogL: number; hogR: number; VL: number; VR: number };

function solve(A: number[][], b: number[]): number[] {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x;
}

function pattern(spans: Span[], w: number[], springs?: number[]) {
  const n = spans.length, K = Array.from({ length: n + 1 }, () => new Array(n + 1).fill(0)), rhs = new Array(n + 1).fill(0);
  spans.forEach((s, i) => { const k = (2 * s.EI) / s.L, fem = (w[i] * s.L * s.L) / 12; K[i][i] += 2 * k; K[i + 1][i + 1] += 2 * k; K[i][i + 1] += k; K[i + 1][i] += k; rhs[i] += fem; rhs[i + 1] -= fem; });
  if (springs) springs.forEach((ks, i) => { if (ks > 0) K[i][i] += ks; });
  const th = solve(K, rhs);
  return spans.map((s, i) => {
    const k = (2 * s.EI) / s.L, fem = (w[i] * s.L * s.L) / 12, mA = -fem + k * (2 * th[i] + th[i + 1]), mB = -(fem + k * (th[i] + 2 * th[i + 1]));
    const VA = (mB - mA) / s.L + (w[i] * s.L) / 2, VB = (w[i] * s.L) / 2 - (mB - mA) / s.L;
    let sag = -Infinity; for (let k2 = 0; k2 <= 40; k2++) { const x = (s.L * k2) / 40; sag = Math.max(sag, mA + VA * x - (w[i] * x * x) / 2); }
    return { mA, mB, VA, VB, sag };
  });
}

export function envelope(spans: Span[], springs?: number[]): SpanEnv[] {
  const n = spans.length, cases: number[][] = [spans.map(s => s.wMax)];
  if (n > 1) {
    cases.push(spans.map((s, i) => (i % 2 === 0 ? s.wMax : s.wMin)), spans.map((s, i) => (i % 2 === 1 ? s.wMax : s.wMin)));
    for (let j = 1; j < n; j++) cases.push(spans.map((s, i) => (i === j - 1 || i === j ? s.wMax : s.wMin)));
  }
  const env: SpanEnv[] = spans.map(() => ({ sag: 0, hogL: 0, hogR: 0, VL: 0, VR: 0 }));
  for (const w of cases) pattern(spans, w, springs).forEach((r, i) => {
    const e = env[i]; e.sag = Math.max(e.sag, r.sag); e.hogL = Math.max(e.hogL, -r.mA); e.hogR = Math.max(e.hogR, -r.mB);
    e.VL = Math.max(e.VL, Math.abs(r.VA)); e.VR = Math.max(e.VR, Math.abs(r.VB));
  });
  // end supports are pins unless a spring is given; EN 1992-1-1 9.2.1.2(1): design for at least 15% of the adjacent span moment
  env[0].hogL = Math.max(env[0].hogL, 0.15 * env[0].sag); env[n - 1].hogR = Math.max(env[n - 1].hogR, 0.15 * env[n - 1].sag);
  return env;
}
