// 3D lateral analysis with structural cores (connected walls) and P-delta effects.
//
// Model: every floor is a rigid diaphragm with three degrees of freedom (ux, uy, rotation) at a reference point. Between floors:
//   frame columns  act as shear springs (Dx, Dy from the D-value method in lib/lateral.ts) at their plan positions;
//   each core      is a vertical cantilever of Euler-Bernoulli elements with its own rotation degrees of freedom at every floor, so
//                  it bends like a cantilever instead of a shear building. Biaxial bending uses Ix, Iy and Ixy of the core section,
//                  and torsion uses the St Venant constant J (warping is ignored). The core centroid stands for its shear centre.
// Second order: the gravity load P above each storey gives a geometric stiffness (P/h on the storey drift, with the polar radius
// of gyration for twist). (K - KG) u = F is the P-delta solution; K phi = lambda KG phi gives the elastic buckling factor.
// Stability coefficient theta = P d / (V h) follows EN 1998-1 4.4.2.2 (theta <= 0.1 ignore; 0.1-0.2 amplify; > 0.3 not allowed).
// Preliminary: linear elastic, cracked stiffness by a factor, no soil flexibility, no axial shortening, no shear deformation.
import type { El } from './engineering';
import type { Group } from './model';
import { wallT } from './model';
import type { CaseRes, Model3D } from './lateral';
import type { Status } from './rc';

export type Wall = { sx: number; sy: number; ex: number; ey: number; t: number };
export type CoreSection = { cx: number; cy: number; A: number; Ix: number; Iy: number; Ixy: number; J: number; closed: boolean; walls: number };
export type Core = { x: number; y: number; levels: (CoreSection | null)[] };           // levels[k]: section on storey k (null where the core stops)

const NODE_TOL = 0.15;

// section properties of a group of connected thin walls, about their common centroid. Ix = sum y^2 dA, Iy = sum x^2 dA, Ixy = sum xy dA
export function coreSection(walls: Wall[]): CoreSection {
  let A = 0, mx = 0, my = 0;
  const seg = walls.map(w => { const L = Math.hypot(w.ex - w.sx, w.ey - w.sy) || 1e-9, a = L * w.t, x = (w.sx + w.ex) / 2, y = (w.sy + w.ey) / 2; A += a; mx += a * x; my += a * y; return { w, L, a, x, y, c: (w.ex - w.sx) / L, s: (w.ey - w.sy) / L }; });
  const cx = mx / A, cy = my / A; let Ix = 0, Iy = 0, Ixy = 0, J = 0;
  for (const g of seg) {
    const Il = (g.w.t * g.L ** 3) / 12, It = (g.L * g.w.t ** 3) / 12, dx = g.x - cx, dy = g.y - cy;
    Ix += Il * g.s * g.s + It * g.c * g.c + g.a * dy * dy; Iy += Il * g.c * g.c + It * g.s * g.s + g.a * dx * dx; Ixy += (Il - It) * g.c * g.s + g.a * dx * dy;
    J += (g.L * g.w.t ** 3) / 3;
  }
  // a closed loop of walls (every junction joins exactly two walls) is a box: J = 4 A_enc^2 / sum(L/t)
  const nodes: [number, number][] = [], key = (x: number, y: number) => { let i = nodes.findIndex(n => Math.hypot(n[0] - x, n[1] - y) < NODE_TOL); if (i < 0) { nodes.push([x, y]); i = nodes.length - 1; } return i; };
  const edges = walls.map(w => [key(w.sx, w.sy), key(w.ex, w.ey)] as [number, number]), deg = nodes.map(() => 0);
  edges.forEach(([a, b]) => { deg[a]++; deg[b]++; });
  const closed = walls.length >= 3 && nodes.length === walls.length && deg.every(d => d === 2);
  if (closed) {
    const order = [edges[0][0]]; let cur = edges[0][1], used = new Set([0]);
    while (cur !== order[0]) { order.push(cur); const nx = edges.findIndex((e, i) => !used.has(i) && (e[0] === cur || e[1] === cur)); if (nx < 0) break; used.add(nx); cur = edges[nx][0] === cur ? edges[nx][1] : edges[nx][0]; }
    let Aenc = 0; order.forEach((a, i) => { const b = order[(i + 1) % order.length]; Aenc += nodes[a][0] * nodes[b][1] - nodes[b][0] * nodes[a][1]; });
    Aenc = Math.abs(Aenc) / 2; const sum = seg.reduce((a, g) => a + g.L / g.w.t, 0);
    if (sum > 0 && order.length === walls.length) J = (4 * Aenc * Aenc) / sum;
  }
  return { cx, cy, A, Ix, Iy, Ixy, J, closed, walls: walls.length };
}

// connected components of walls (endpoints within 150 mm)
export function wallGroups(walls: Wall[]): Wall[][] {
  const parent = walls.map((_, i) => i), find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const ends = (w: Wall) => [[w.sx, w.sy], [w.ex, w.ey]];
  for (let i = 0; i < walls.length; i++) for (let j = i + 1; j < walls.length; j++)
    if (ends(walls[i]).some(a => ends(walls[j]).some(b => Math.hypot(a[0] - b[0], a[1] - b[1]) < NODE_TOL))) parent[find(i)] = find(j);
  const out = new Map<number, Wall[]>(); walls.forEach((w, i) => { const r = find(i); out.set(r, [...(out.get(r) ?? []), w]); });
  return [...out.values()];
}

export const isCoreWall = (e: El) => e.type === 'wall' && !!e.geometry.core;

// cores from the walls marked as structural, matched from storey to storey by their centroids
export function coresFromGroups(groups: Group[]): { cores: Core[]; notes: string[] } {
  const gs = [...groups].sort((a, b) => a.story.elevation_m - b.story.elevation_m), cores: Core[] = [], notes: string[] = [];
  gs.forEach((g, k) => {
    const walls = g.els.filter(isCoreWall).map(e => ({ sx: e.geometry.start[0], sy: e.geometry.start[1], ex: e.geometry.end[0], ey: e.geometry.end[1], t: wallT(e.geometry) }));
    for (const grp of wallGroups(walls)) {
      const sec = coreSection(grp);
      const hit = cores.find(c => c.levels[k] === undefined && c.levels.slice(0, k).every(l => l !== undefined) && Math.hypot(c.x - sec.cx, c.y - sec.cy) < 0.6 && c.levels[k - 1] !== null && c.levels[k - 1] !== undefined);
      if (hit) hit.levels[k] = sec;
      else if (k === 0) cores.push({ x: sec.cx, y: sec.cy, levels: [sec] });
      else notes.push(`A core on ${g.story.name} does not continue from the ground storey: it is left out of the 3D analysis (transfer structures are not modelled).`);
    }
    for (const c of cores) if (c.levels[k] === undefined) c.levels[k] = null;
  });
  // levels after the first null are dropped: a core must be continuous from the ground
  for (const c of cores) { const first = c.levels.findIndex(l => l === null); if (first >= 0) c.levels.length = first; }
  return { cores, notes };
}

// ---------- small dense linear algebra ----------
type Mat = number[][];
const zeros = (n: number): Mat => Array.from({ length: n }, () => new Array(n).fill(0));
function lu(A: Mat): { LU: Mat; piv: number[] } | null {
  const n = A.length, LU = A.map(r => r.slice()), piv = [...Array(n).keys()];
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(LU[r][c]) > Math.abs(LU[p][c])) p = r;
    if (Math.abs(LU[p][c]) < 1e-14) return null;
    if (p !== c) { [LU[p], LU[c]] = [LU[c], LU[p]]; [piv[p], piv[c]] = [piv[c], piv[p]]; }
    for (let r = c + 1; r < n; r++) { const f = (LU[r][c] /= LU[c][c]); if (f !== 0) for (let k = c + 1; k < n; k++) LU[r][k] -= f * LU[c][k]; }
  }
  return { LU, piv };
}
function luSolve(f: { LU: Mat; piv: number[] }, b: number[]): number[] {
  const n = b.length, x = f.piv.map(i => b[i]);
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) x[i] -= f.LU[i][j] * x[j];
  for (let i = n - 1; i >= 0; i--) { for (let j = i + 1; j < n; j++) x[i] -= f.LU[i][j] * x[j]; x[i] /= f.LU[i][i]; }
  return x;
}
const matVec = (A: Mat, x: number[]) => A.map(r => r.reduce((a, v, j) => a + v * x[j], 0));

// ---------- the model ----------
export type Load3D = { name: string; dir: 'x' | 'y'; F: number[]; limit: number; kind: 'wind' | 'seismic' };
export type Case3D = {
  name: string; dir: 'x' | 'y'; kind: 'wind' | 'seismic';
  firstDrift: number[]; secondDrift: number[]; firstRatio: number[]; secondRatio: number[]; theta: number[]; thetaMax: number; amp: number[]; ampMax: number;
  topFirst: number; topSecond: number; twistTop: number; torsionRatio: number; shearShare: { frame: number; cores: number[] }; limit: number; maxSecondRatio: number; status: Status; notes: string[];
};
export type Result3D = { cases: Case3D[]; lambda: number; lambdaStatus: Status; cores: { x: number; y: number; storeys: number; Ix: number; Iy: number; Ixy: number; J: number; closed: boolean }[]; stable: boolean; notes: string[]; T?: number };

export function analyse3D(model: Model3D, cores: Core[], loads: Load3D[], o: { nu?: number; base?: 'fixed' | 'pinned'; coreStiffness?: number } = {}): Result3D {
  const n = model.h.length, nc = cores.length, G = model.E / (2 * (1 + (o.nu ?? 0.2))), EIc = model.E * (o.coreStiffness ?? 1);   // model.E is already the cracked modulus (0.5 Ecm)
  const per = 3 + 2 * nc, N = n * per, [xr, yr] = model.ref, notes: string[] = [];
  const idx = (k: number, j: number) => (k < 0 ? -1 : k * per + j);                  // j: 0 ux, 1 uy, 2 rotation, 3+2c rx of core c, 4+2c ry of core c
  const K = zeros(N), KG = zeros(N);
  const add = (M: Mat, dofs: number[], Ke: Mat) => { for (let i = 0; i < dofs.length; i++) { if (dofs[i] < 0) continue; for (let j = 0; j < dofs.length; j++) if (dofs[j] >= 0) M[dofs[i]][dofs[j]] += Ke[i][j]; } };
  const storeyDofs = (k: number) => [idx(k - 1, 0), idx(k - 1, 1), idx(k - 1, 2), idx(k, 0), idx(k, 1), idx(k, 2)];
  const rel6 = (R: Mat): Mat => { const M = zeros(6); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { M[i][j] = R[i][j]; M[i + 3][j + 3] = R[i][j]; M[i][j + 3] = -R[i][j]; M[i + 3][j] = -R[i][j]; } return M; };

  // frame columns: shear springs at their positions
  for (let k = 0; k < n; k++) {
    const R = zeros(3);
    for (const c of model.frame.filter(f => f.k === k)) {
      const ex = c.x - xr, ey = c.y - yr, bx = [1, 0, -ey], by = [0, 1, ex];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[i][j] += c.Dx * bx[i] * bx[j] + c.Dy * by[i] * by[j];
    }
    // torsion of the cores (St Venant)
    for (const core of cores) { const s = core.levels[k]; if (s) R[2][2] += (G * (o.coreStiffness ?? 1) * s.J) / model.h[k]; }
    add(K, storeyDofs(k), rel6(R));
  }
  // cores: cantilever elements between floors
  cores.forEach((core, c) => {
    for (let k = 0; k < core.levels.length; k++) {
      const s = core.levels[k]; if (!s) continue;
      const L = model.h[k], dxc = s.cx - xr, dyc = s.cy - yr, b = (EIc / L ** 3);
      const kb = [[12, 6 * L, -12, 6 * L], [6 * L, 4 * L * L, -6 * L, 2 * L * L], [-12, -6 * L, 12, -6 * L], [6 * L, 2 * L * L, -6 * L, 4 * L * L]];
      // q = [uxc1, rx1, uxc2, rx2, uyc1, ry1, uyc2, ry2] from d = [ux1, uy1, th1, rx1, ry1, ux2, uy2, th2, rx2, ry2]
      const T = Array.from({ length: 8 }, () => new Array(10).fill(0));
      T[0][0] = 1; T[0][2] = -dyc; T[1][3] = 1; T[2][5] = 1; T[2][7] = -dyc; T[3][8] = 1;
      T[4][1] = 1; T[4][2] = dxc; T[5][4] = 1; T[6][6] = 1; T[6][7] = dxc; T[7][9] = 1;
      const Kq = zeros(8);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { Kq[i][j] = b * s.Iy * kb[i][j]; Kq[i + 4][j + 4] = b * s.Ix * kb[i][j]; Kq[i][j + 4] = b * s.Ixy * kb[i][j]; Kq[i + 4][j] = b * s.Ixy * kb[i][j]; }
      const Ke = zeros(10);
      for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) { let v = 0; for (let p = 0; p < 8; p++) { if (!T[p][i]) continue; for (let q = 0; q < 8; q++) v += T[p][i] * Kq[p][q] * T[q][j]; } Ke[i][j] = v; }
      const dofs = [idx(k - 1, 0), idx(k - 1, 1), idx(k - 1, 2), k - 1 < 0 ? -1 : idx(k - 1, 3 + 2 * c), k - 1 < 0 ? -1 : idx(k - 1, 4 + 2 * c), idx(k, 0), idx(k, 1), idx(k, 2), idx(k, 3 + 2 * c), idx(k, 4 + 2 * c)];
      add(K, dofs, Ke);
    }
  });
  // floors a core does not reach have no rotation degrees of freedom: pin them so the matrix stays regular
  cores.forEach((core, c) => { for (let k = core.levels.length; k < n; k++) for (const j of [3 + 2 * c, 4 + 2 * c]) K[idx(k, j)][idx(k, j)] += 1; });

  // geometric stiffness: P above storey k acts on its drift (translation, and twist through the mass centre and radius of gyration)
  for (let k = 0; k < n; k++) {
    const R = zeros(3);
    for (let j = k; j < n; j++) {
      const ex = model.xm[j] - xr, ey = model.ym[j] - yr, f = model.P[j] / model.h[k];
      const g = [[1, 0, -ey], [0, 1, ex], [-ey, ex, ex * ex + ey * ey + model.r2[j]]];
      for (let a = 0; a < 3; a++) for (let b2 = 0; b2 < 3; b2++) R[a][b2] += f * g[a][b2];
    }
    add(KG, storeyDofs(k), rel6(R));
  }

  const fK = lu(K);
  if (!fK) return { cases: [], lambda: 0, lambdaStatus: 'bad', cores: [], stable: false, notes: ['The structure has no lateral stiffness (add columns with beams, or mark walls as structural).'] };
  const KmKG = K.map((r, i) => r.map((v, j) => v - KG[i][j])), fS = lu(KmKG);

  // elastic buckling factor: smallest lambda in K phi = lambda KG phi, by inverse iteration on K^-1 KG
  let phi = new Array(N).fill(0).map((_, i) => 1 + 0.01 * ((i * 7) % 5)), lambda = Infinity;
  for (let it = 0; it < 600; it++) {
    const y = luSolve(fK, matVec(KG, phi)), nrm = Math.sqrt(y.reduce((a, v) => a + v * v, 0)) || 1, next = y.map(v => v / nrm);
    const kp = matVec(KG, next), kn = matVec(K, next), num = next.reduce((a, v, i) => a + v * kn[i], 0), den = next.reduce((a, v, i) => a + v * kp[i], 0);
    const lam = den > 0 ? num / den : Infinity, done = Math.abs(lam - lambda) < 1e-10 * Math.max(1, lam); lambda = lam; phi = next; if (done) break;
  }
  const lambdaStatus: Status = !(lambda >= 3) ? 'bad' : lambda < 10 ? 'warn' : 'ok';
  if (lambda < 10) notes.push(lambda < 3 ? `Elastic buckling factor ${lambda.toFixed(1)} is below 3: the structure is too flexible for its weight. Stiffen it.` : `Elastic buckling factor ${lambda.toFixed(1)} is below 10: P-delta effects must be included in the design forces.`);

  const out: Case3D[] = [];
  for (const ld of loads) {
    let best: Case3D | null = null;
    for (const sg of [1, -1]) {
      const Fv = new Array(N).fill(0);
      for (let k = 0; k < n; k++) {
        const bx = model.box[k], e = 0.05 * (ld.dir === 'x' ? bx[3] - bx[1] : bx[2] - bx[0]) * sg, f = ld.F[k] ?? 0;
        if (ld.dir === 'x') { Fv[idx(k, 0)] += f; Fv[idx(k, 2)] += -f * (model.ym[k] + e - yr); } else { Fv[idx(k, 1)] += f; Fv[idx(k, 2)] += f * (model.xm[k] + e - xr); }
      }
      const u1 = luSolve(fK, Fv), u2 = fS ? luSolve(fS, Fv) : u1.map(() => NaN);
      // displacement of a plan point (x, y) at floor k, in the loaded direction
      const at = (u: number[], k: number, x: number, y: number) => k < 0 ? 0 : ld.dir === 'x' ? u[idx(k, 0)] - u[idx(k, 2)] * (y - yr) : u[idx(k, 1)] + u[idx(k, 2)] * (x - xr);
      const drifts = (u: number[]) => model.h.map((_, k) => {
        const bx = model.box[k], corners = [[bx[0], bx[1]], [bx[2], bx[1]], [bx[0], bx[3]], [bx[2], bx[3]]].map(([x, y]) => Math.abs(at(u, k, x, y) - at(u, k - 1, x, y)));
        const mc = Math.abs(at(u, k, model.xm[k], model.ym[k]) - at(u, k - 1, model.xm[k], model.ym[k]));
        return { max: Math.max(...corners), mean: corners.reduce((a, v) => a + v, 0) / 4, mc };
      });
      const d1 = drifts(u1), d2 = drifts(u2), V = ld.F.map((_, k) => ld.F.slice(k).reduce((a, v) => a + v, 0)), Pa = model.P.map((_, k) => model.P.slice(k).reduce((a, v) => a + v, 0));
      const theta = d1.map((d, k) => (Pa[k] * d.mc) / (Math.max(V[k], 1e-9) * model.h[k])), amp = d2.map((d, k) => (d1[k].max > 1e-12 ? d.max / d1[k].max : 1));
      const sec = d2.map((d, k) => d.max / model.h[k]);
      // base shear carried by the frame and by each core (first order)
      const fr = { frame: 0, cores: cores.map(() => 0) }, dx0 = (x: number, y: number) => at(u1, 0, x, y);
      for (const c of model.frame.filter(f => f.k === 0)) fr.frame += (ld.dir === 'x' ? c.Dx : c.Dy) * Math.abs(dx0(c.x, c.y));
      cores.forEach((core, ci) => {
        const s = core.levels[0]; if (!s) return;
        const L = model.h[0], b = EIc / L ** 3, rx = u1[idx(0, 3 + 2 * ci)], ry = u1[idx(0, 4 + 2 * ci)], ux = u1[idx(0, 0)] - u1[idx(0, 2)] * (s.cy - yr), uy = u1[idx(0, 1)] + u1[idx(0, 2)] * (s.cx - xr);
        // shear at the base: force on the translational DOF of the fixed node = -(12 u2 - ... ) with node 1 fixed
        const ex = b * (s.Iy * (-12 * ux + 6 * L * rx) + s.Ixy * (-12 * uy + 6 * L * ry)), ey = b * (s.Ixy * (-12 * ux + 6 * L * rx) + s.Ix * (-12 * uy + 6 * L * ry));
        fr.cores[ci] = Math.abs(ld.dir === 'x' ? ex : ey);
      });
      const tw = u1[idx(n - 1, 2)], mx = Math.max(...d1.map(d => d.max / Math.max(d.mean, 1e-12)));
      const th = Math.max(...theta), cs: string[] = [], lim = ld.limit, maxR = Math.max(...sec);
      let status: Status = maxR > lim * 1.25 || th > 0.3 || !(lambda >= 3) ? 'bad' : maxR > lim || th > 0.1 || mx > 1.2 ? 'warn' : 'ok';
      if (th > 0.3) cs.push(`Stability coefficient ${th.toFixed(2)} is above 0.3: not permitted by EN 1998-1 4.4.2.2. Stiffen the structure.`);
      else if (th > 0.2) cs.push(`Stability coefficient ${th.toFixed(2)} is between 0.2 and 0.3: a second-order analysis is required (done here); check the member design for amplified moments.`);
      else if (th > 0.1) cs.push(`Stability coefficient ${th.toFixed(2)} is between 0.1 and 0.2: P-delta effects count; multiply the first-order lateral effects by about 1/(1 − θ) = ${(1 / (1 - th)).toFixed(2)}.`);
      if (mx > 1.2) cs.push(`Torsional irregularity: the largest storey drift is ${mx.toFixed(2)} times the average (above 1.2): the layout twists noticeably under this load.`);
      if (!fS) { cs.push('K − KG is singular: the structure is at or past its buckling load.'); status = 'bad'; }
      const cand: Case3D = { name: ld.name, dir: ld.dir, kind: ld.kind, firstDrift: d1.map(d => d.max), secondDrift: d2.map(d => d.max), firstRatio: d1.map((d, k) => d.max / model.h[k]), secondRatio: sec, theta, thetaMax: th, amp, ampMax: Math.max(...amp), topFirst: Math.max(...[[model.box[n - 1][0], model.box[n - 1][1]], [model.box[n - 1][2], model.box[n - 1][3]]].map(([x, y]) => Math.abs(at(u1, n - 1, x, y)))), topSecond: Math.max(...[[model.box[n - 1][0], model.box[n - 1][1]], [model.box[n - 1][2], model.box[n - 1][3]]].map(([x, y]) => Math.abs(at(u2, n - 1, x, y)))), twistTop: tw, torsionRatio: mx, shearShare: fr, limit: lim, maxSecondRatio: maxR, status, notes: cs };
      if (!best || cand.maxSecondRatio > best.maxSecondRatio) best = cand;
    }
    out.push(best!);
  }
  if (cores.length === 0) notes.push('No walls are marked as structural cores: only the frame columns resist the lateral loads. Select walls and switch on "Structural wall" in their properties to include them.');
  else notes.push('Cores: cantilever with cracked stiffness, St Venant torsion only (warping of open sections ignored), centroid taken as shear centre, no shear deformation, fixed at the base.');
  notes.push('P-delta uses the gravity load above each storey (dead + ψ2 imposed). Soil and raft flexibility, floor flexibility and axial shortening of the core and columns are not included.');
  return { cases: out, lambda, lambdaStatus, stable: !!fS && lambda > 1, cores: cores.map(c => { const s = c.levels[0]!; return { x: c.x, y: c.y, storeys: c.levels.length, Ix: s.Ix, Iy: s.Iy, Ixy: s.Ixy, J: s.J, closed: s.closed }; }), notes };
}

// the loads from a lateralAnalysis result, ready for analyse3D
export const loadsOf = (cases: CaseRes[]): Load3D[] => cases.map(c => ({ name: c.name, dir: c.dir, F: c.forces, limit: c.limit, kind: c.kind }));
