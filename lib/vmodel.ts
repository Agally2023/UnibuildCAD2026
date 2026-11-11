// Realistic vehicle model generator. Builds shaded surface parts (body panels, glass, tyres, rims, lamps, interior...) from a vehicle's named
// parameters, in the same frame as the CAD model: millimetres, X front to rear, Y across (+Y is the right-hand side), Z up, ground at Z = 0.
// Pure functions, no rendering: each part names a material that the viewer maps to paint, glass, rubber, aluminium, chrome, etc.
export type VStyle = 'sedan' | 'hatch' | 'suv' | 'coupe' | 'super' | 'pickup' | 'wedge';
export type VSpec = { kind: 'car' | 'bus' | 'truck' | 'moto' | 'bike' | 'trailer' | 'tractor'; style?: VStyle; brand?: string; paint?: string };
export type VMat = 'paint' | 'glass' | 'rubber' | 'rim' | 'chrome' | 'black' | 'lamp' | 'tail' | 'interior' | 'seat' | 'metal' | 'white' | 'wood' | 'caliper';
export type VPart = { name: string; mat: VMat; pos: number[]; idx: number[]; col?: number[] };
type V3 = [number, number, number];
type P = Record<string, number>;

const sgn = (x: number) => (x < 0 ? -1 : 1);
const sp = (x: number, e: number) => sgn(x) * Math.pow(Math.abs(x), e);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export function hexRgb(h: string): V3 { const n = parseInt(h.replace('#', ''), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }

class B {
  pos: number[] = []; idx: number[] = []; col: number[] = [];
  constructor(public name: string, public mat: VMat, public base: V3 = [1, 1, 1]) { }
  v(p: V3, c?: V3) { this.pos.push(p[0], p[1], p[2]); this.col.push(...(c ?? this.base)); return this.pos.length / 3 - 1; }
  tri(a: number, b: number, c: number) { this.idx.push(a, b, c); }
  // rows x cols grid of points f(i, j); cells for which skip(i, j) is true are left open
  grid(nu: number, nv: number, f: (i: number, j: number) => V3, colf?: (i: number, j: number, p: V3) => V3 | undefined, skip?: (i: number, j: number) => boolean, wrapV = false) {
    const o = this.pos.length / 3, W = nv + 1;
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { const p = f(i, j); this.v(p, colf?.(i, j, p)); }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      if (skip?.(i, j)) continue;
      const a = o + i * W + j, b = a + 1, c = a + W, d = c + 1; this.tri(a, c, b); this.tri(b, c, d);
    }
    void wrapV;
  }
  get part(): VPart { return { name: this.name, mat: this.mat, pos: this.pos, idx: this.idx, col: this.col }; }
}

// superquadric box/ellipsoid: half sizes (a, b, c) about a centre; n = 2 ellipsoid, higher = boxier
function rbox(m: B, c: V3, s: V3, n = 3, rot = 0, nu = 14, nv = 20) {
  const e = 2 / n;
  m.grid(nu, nv, (i, j) => {
    const ph = -Math.PI / 2 + (Math.PI * i) / nu, th = (2 * Math.PI * j) / nv;
    const cp = sp(Math.cos(ph), e), sp_ = sp(Math.sin(ph), e), ct = sp(Math.cos(th), e), st = sp(Math.sin(th), e);
    const x = s[0] * cp * ct, y = s[1] * cp * st, z = s[2] * sp_;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    return [c[0] + x * cr + z * sr, c[1] + y, c[2] - x * sr + z * cr];
  });
}
function tube(m: B, a: V3, b: V3, r: number, seg = 10, r2?: number) {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d) || 1, t: V3 = [d[0] / l, d[1] / l, d[2] / l];
  const h: V3 = Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let u: V3 = [t[1] * h[2] - t[2] * h[1], t[2] * h[0] - t[0] * h[2], t[0] * h[1] - t[1] * h[0]]; const ul = Math.hypot(...u); u = [u[0] / ul, u[1] / ul, u[2] / ul];
  const w: V3 = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
  m.grid(3, seg, (i, j) => {
    const th = (2 * Math.PI * j) / seg, p = i < 2 ? a : b, ra = i === 0 || i === 3 ? 0 : (i === 1 ? r : (r2 ?? r));
    return [p[0] + (u[0] * Math.cos(th) + w[0] * Math.sin(th)) * ra, p[1] + (u[1] * Math.cos(th) + w[1] * Math.sin(th)) * ra, p[2] + (u[2] * Math.cos(th) + w[2] * Math.sin(th)) * ra];
  });
}
// surface of revolution about the Y axis: profile points are [radius, y]
function lathe(m: B, prof: [number, number][], c: V3, side: number, seg = 56, colf?: (r: number, y: number) => V3 | undefined) {
  m.grid(prof.length - 1, seg, (i, j) => { const a = (2 * Math.PI * j) / seg, [r, y] = prof[i]; return [c[0] + r * Math.cos(a), c[1] + side * y, c[2] + r * Math.sin(a)]; }, colf ? (i) => colf(prof[i][0], prof[i][1]) : undefined);
}
function torus(m: B, c: V3, R: number, r: number, ax: V3, ns = 28, nr = 10) {
  const l = Math.hypot(...ax), t: V3 = [ax[0] / l, ax[1] / l, ax[2] / l], h: V3 = Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let u: V3 = [t[1] * h[2] - t[2] * h[1], t[2] * h[0] - t[0] * h[2], t[0] * h[1] - t[1] * h[0]]; const ul = Math.hypot(...u); u = [u[0] / ul, u[1] / ul, u[2] / ul];
  const w: V3 = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
  m.grid(ns, nr, (i, j) => {
    const a = (2 * Math.PI * i) / ns, b = (2 * Math.PI * j) / nr, rad = R + r * Math.cos(b), q = r * Math.sin(b);
    return [c[0] + (u[0] * Math.cos(a) + w[0] * Math.sin(a)) * rad + t[0] * q, c[1] + (u[1] * Math.cos(a) + w[1] * Math.sin(a)) * rad + t[1] * q, c[2] + (u[2] * Math.cos(a) + w[2] * Math.sin(a)) * rad + t[2] * q];
  });
}
// thin strip along a polyline, `w` wide, in the direction perpendicular to both the path and `nrm`
function ribbon(m: B, pts: V3[], w: number, nrm: V3) {
  m.grid(pts.length - 1, 1, (i, j) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], t: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    let s: V3 = [t[1] * nrm[2] - t[2] * nrm[1], t[2] * nrm[0] - t[0] * nrm[2], t[0] * nrm[1] - t[1] * nrm[0]]; const l = Math.hypot(...s) || 1; s = [s[0] / l, s[1] / l, s[2] / l];
    const o = (j - 0.5) * w; return [pts[i][0] + s[0] * o, pts[i][1] + s[1] * o, pts[i][2] + s[2] * o];
  });
}
const merge = (base: number[], extra: number[]) => { const a = [...base, ...extra].sort((x, y) => x - y), r: number[] = []; for (const v of a) if (!r.length || v - r[r.length - 1] > 1e-6) r.push(v); return r; };
const linspace = (a: number, b: number, n: number) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);

// ---------- wheels ----------
type WOpt = { rw: number; tw: number; spokes?: number; solid?: boolean; thin?: boolean; lugs?: boolean; rimCol?: V3; sw?: number };
function wheel(out: VPart[], c: V3, side: number, o: WOpt, tag: string) {
  const { rw, tw } = o, sw = o.sw ?? 0.45, rr = rw - sw * tw * (o.thin ? 0.35 : 1);
  const tyre = new B(`Tyre ${tag}`, 'rubber'), rim = new B(`Rim ${tag}`, 'rim'), disc = new B(`Brake disc ${tag}`, 'metal'), cal = new B(`Caliper ${tag}`, 'caliper'), hub = new B(`Hub ${tag}`, 'chrome');
  const hp: [number, number][] = ([[rr + 2, 0.42], [lerp(rr, rw, 0.25), 0.50], [lerp(rr, rw, 0.62), 0.51], [lerp(rr, rw, 0.9), 0.46], [rw - 2, 0.38], [rw, 0.30], [rw, 0]] as [number, number][]).map(([r, y]) => [r, y * tw]);
  const prof: [number, number][] = [...hp.map(([r, y]) => [r, -y] as [number, number]), ...hp.slice(0, -1).reverse()];
  lathe(tyre, prof, c, side);
  // rim barrel and lip
  lathe(rim, [[rr + 3, 0.40 * tw], [rr - 6, 0.43 * tw], [rr - 14, 0.38 * tw], [rr - 14, -0.36 * tw], [rr - 6, -0.40 * tw]], c, side);
  const yo = 0.40 * tw;
  if (o.solid) {
    lathe(rim, [[rr - 14, yo - 6], [rr * 0.86, yo - 0.05 * tw], [rr * 0.30, yo - 0.07 * tw], [rr * 0.26, yo + 0.02 * tw], [rr * 0.1, yo + 0.04 * tw], [0.001, yo + 0.04 * tw]], c, side, 48);
    for (let k = 0; k < 10; k++) { const a = (k * 2 * Math.PI) / 10; rbox(hub, [c[0] + Math.cos(a) * rr * 0.19, c[1] + side * (yo + 0.05 * tw), c[2] + Math.sin(a) * rr * 0.19], [rr * 0.025, rr * 0.03, rr * 0.025], 3, 0, 5, 8); }
  } else {
    const ns = o.spokes ?? 5, sr = ns > 6 ? Math.max(3, rr * 0.032) : Math.max(4, rr * 0.075);
    for (let k = 0; k < ns; k++) { const a = (k * 2 * Math.PI) / ns + 0.3, ca = Math.cos(a), sa = Math.sin(a); tube(rim, [c[0] + ca * rr * 0.16, c[1] + side * (yo - 0.04 * tw), c[2] + sa * rr * 0.16], [c[0] + ca * (rr - 12), c[1] + side * (yo + 0.0 * tw), c[2] + sa * (rr - 12)], sr, 6, sr * 0.8); }
    const dr = o.thin ? 0.55 : 0.80, d0 = o.thin ? 0.4 : 0.26; if (!(o.thin && o.spokes === 0)) lathe(disc, [[rr * d0, yo - 0.18 * tw], [rr * dr, yo - 0.18 * tw], [rr * dr, yo - 0.24 * tw], [rr * d0, yo - 0.24 * tw]], c, side, 40);
    const a = 0.9; if (!(o.thin && o.spokes === 0)) rbox(cal, [c[0] + Math.cos(a) * rr * 0.62, c[1] + side * (yo - 0.17 * tw), c[2] + Math.sin(a) * rr * 0.62], [rr * 0.14, tw * 0.08, rr * 0.2], 3, 0, 6, 10);
    if (o.thin) { /* bicycle spokes */ }
  }
  lathe(hub, [[rr * 0.15, yo - 0.02 * tw], [rr * 0.15, yo + 0.04 * tw], [rr * 0.08, yo + 0.06 * tw], [0.001, yo + 0.06 * tw]], c, side, 24);
  if (o.lugs) { for (let k = 0; k < 26; k++) { const a = (k * 2 * Math.PI) / 26, pt = (aa: number, y: number, r: number): V3 => [c[0] + Math.cos(aa) * r, c[1] + side * y, c[2] + Math.sin(aa) * r]; tube(tyre, pt(a, -0.40 * tw, rw - 4), pt(a + 0.12, -0.02 * tw, rw + 38), 22, 5); tube(tyre, pt(a + 0.06, 0.40 * tw, rw - 4), pt(a + 0.18, 0.02 * tw, rw + 38), 22, 5); } }
  out.push(tyre.part, rim.part, disc.part, cal.part, hub.part);
}

// ---------- car-like body ----------
type Arch = { x: number; r: number };
type Loft = { m: B; x0: number; x1: number; z0: (x: number) => number; z1: (x: number) => number; hw: (x: number) => number; n: number; capF: number; capR: number; arches: Arch[]; col: V3; step?: number; nr?: number; capEnd?: boolean };
function bodyLoft(o: Loft) {
  const { m, x0, x1 } = o, nr = o.nr ?? 48, xs: number[] = [];
  let xa = merge(linspace(x0, x1, Math.max(8, Math.round((x1 - x0) / (o.step ?? 28)))), o.arches.flatMap(a => [a.x - a.r - 40, a.x - a.r * 0.5, a.x, a.x + a.r * 0.5, a.x + a.r + 40]).filter(x => x > x0 && x < x1));
  xs.push(...xa);
  const e = 2 / o.n, dark: V3 = [0.03, 0.03, 0.035];
  const cap = (x: number) => { const f = x < x0 + o.capF ? (x0 + o.capF - x) / o.capF : x > x1 - o.capR ? (x - (x1 - o.capR)) / o.capR : 0; return f > 0 ? Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, f), 2.4)), 1 / 2.4) : 1; };
  m.grid(xs.length - 1, nr, (i, j) => {
    const x = xs[i], t = (2 * Math.PI * j) / nr, k = cap(x), z0 = o.z0(x), z1 = Math.max(o.z1(x), z0 + 30), zc = (z0 + z1) / 2, hh = ((z1 - z0) / 2) * (0.82 + 0.18 * k), hw = o.hw(x) * k;
    let y = hw * sp(Math.cos(t), e), z = zc + hh * sp(Math.sin(t), e);
    for (const a of o.arches) { const dx = x - a.x; if (Math.abs(y) > o.hw(x) * 0.5 && Math.abs(dx) < a.r) { const az = a.r + Math.sqrt(a.r * a.r - dx * dx) * 0.0 + Math.sqrt(Math.max(0, a.r * a.r - dx * dx)) * 0.75; if (z < az) z = Math.min(az, z1 - 6); } }
    return [x, y, z];
  }, (i, j, p) => {
    const x = xs[i], z0 = o.z0(x), z1 = o.z1(x), t = (2 * Math.PI * j) / nr, under = Math.sin(t) < -0.2 && Math.abs(Math.cos(t)) < 0.8;
    for (const a of o.arches) { const dx = x - a.x; if (Math.abs(p[1]) > o.hw(x) * 0.5 && Math.abs(dx) < a.r + 10 && p[2] > z0 + (z1 - z0) * 0.12 && p[2] <= a.r + Math.sqrt(Math.max(0, a.r * a.r - dx * dx)) * 0.75 + 1) return dark; }
    if (under) return dark; return o.col;
  });
  if (o.capEnd) { /* flat ends are hidden inside other panels */ }
}

const FR: Record<string, { wx: number; rx: number; rrx: number; bx: number; hf: number; hh: number; bh: number; cw: number; pf: number; pr: number }> = {
  sedan: { wx: 0.27, rx: 0.42, rrx: 0.66, bx: 0.80, hf: 0.52, hh: 0.60, bh: 0.64, cw: 0.84, pf: 2.0, pr: 2.2 },
  hatch: { wx: 0.26, rx: 0.40, rrx: 0.84, bx: 0.96, hf: 0.50, hh: 0.58, bh: 0.78, cw: 0.86, pf: 2.0, pr: 4.2 },
  suv: { wx: 0.27, rx: 0.37, rrx: 0.88, bx: 0.98, hf: 0.54, hh: 0.60, bh: 0.80, cw: 0.88, pf: 2.0, pr: 5 },
  coupe: { wx: 0.30, rx: 0.45, rrx: 0.66, bx: 0.78, hf: 0.50, hh: 0.62, bh: 0.64, cw: 0.84, pf: 2.0, pr: 2.0 },
  super: { wx: 0.34, rx: 0.49, rrx: 0.60, bx: 0.74, hf: 0.40, hh: 0.70, bh: 0.78, cw: 0.80, pf: 1.7, pr: 1.7 },
  pickup: { wx: 0.21, rx: 0.25, rrx: 0.45, bx: 0.51, hf: 0.50, hh: 0.56, bh: 0.60, cw: 0.84, pf: 2.4, pr: 5 },
  wedge: { wx: 0.30, rx: 0.40, rrx: 0.86, bx: 0.98, hf: 0.44, hh: 0.60, bh: 0.78, cw: 0.92, pf: 1.2, pr: 1.2 },
};

function car(spec: VSpec, p: P, paint: V3): VPart[] {
  const style = spec.style ?? 'sedan', f = { ...FR[style] };
  const L = p.L ?? 4600, W = p.W ?? 1800, H = p.H ?? 1450, wb = p.wb ?? 2700, rw = p.rw ?? 330, tw = p.tw ?? 235, gc = p.gc ?? (style === 'suv' || style === 'pickup' || style === 'wedge' ? 220 : style === 'super' ? 110 : 140);
  const fo = p.fo ?? (L - wb) * 0.46;
  if (style === 'pickup') { const cabx = p.cabx ?? L * 0.21, cabl = p.cabl ?? L * 0.30; f.wx = cabx / L; f.rx = (cabx + 0.12 * cabl) / L; f.rrx = (cabx + 0.78 * cabl) / L; f.bx = (cabx + cabl) / L; }
  const out: VPart[] = [], hwB = W / 2, tail = L;
  const xs = f.wx * L, rx = f.rx * L, rrx = f.rrx * L, xe = f.bx * L;
  const archR = rw + 38, arches = [{ x: fo, r: archR }, { x: fo + wb, r: archR }];
  const pick = style === 'pickup', bedx = pick ? L - (p.bedl ?? L * 0.30) : L;
  const z0 = (x: number) => gc + Math.max(0, (fo - rw - x) * 0.14) + Math.max(0, (x - (fo + wb + rw)) * 0.12);
  const fender = (x: number) => { const k = Math.min(Math.abs(x - fo), Math.abs(x - fo - wb)); return (2 * rw + 50) * Math.exp(-Math.pow(k / (archR * 1.1), 4)); };
  const belt = pick ? gc + (p.bh ?? 560) : 0;
  const zTop = (x: number) => {
    let z: number;
    if (pick) z = x < xs ? lerp(belt * 0.93, belt, clamp(x / xs)) : belt;
    else z = x <= xs ? lerp(f.hf * H, f.hh * H, Math.pow(clamp(x / xs), 1.3)) : x <= xe ? lerp(f.hh * H, f.bh * H, (x - xs) / (xe - xs)) : f.bh * H;
    return Math.max(z, fender(x) - (pick ? 0 : 0));
  };
  const body = new B('Body shell', 'paint', paint);
  const capF = W * 0.20;
  bodyLoft({ m: body, x0: 0, x1: tail, z0, z1: zTop, hw: () => hwB, n: 4.2, capF, capR: W * 0.14, arches, col: paint });
  out.push(body.part);
  // cabin: windows are left open in the paint and filled with glass
  const zb = (x: number) => zTop(x) - 60;
  const hroof = (x: number) => {
    const zr = x < xs ? zTop(x) : x < rx ? lerp(zTop(xs), H, 1 - Math.pow(1 - (x - xs) / (rx - xs), f.pf)) : x < rrx ? H - 18 * Math.pow((x - (rx + rrx) / 2) / ((rrx - rx) / 2), 2) : lerp(zTop(xe), H, 1 - Math.pow(1 - (xe - x) / (xe - rrx), f.pr));
    return Math.max(8, zr - zb(x) + (x >= xs && x <= xe ? 0 : 0));
  };
  const cw = (W * f.cw) / 2, nC = style === 'pickup' || style === 'suv' || style === 'wedge' ? 3.8 : 2.7, eC = 2 / nC;
  const cx = merge(linspace(xs, xe, Math.round((xe - xs) / 26)), []);
  const A0 = 0.08, A1 = 0.95, B0 = 1.0, B1 = Math.PI - 1.0;
  const two = style === 'coupe' || style === 'super' || pick || style === 'wedge', mid = two ? rrx - 0.0 : (rx + rrx) / 2 + (rrx - rx) * 0.05;
  const wxA0 = xs + 0.30 * (rx - xs), wxRear = xe - 0.30 * (xe - rrx);
  const sideWins: [number, number][] = two ? [[wxA0, mid * 0 + Math.min(wxRear, lerp(rx, rrx, pick ? 0.97 : 0.97))]] : [[wxA0, mid - 0.02 * L], [mid + 0.02 * L, wxRear]];
  if (style === 'super') sideWins[0] = [wxA0, xe - 0.38 * (xe - rrx)];
  const front: [number, number] = [xs + 0.06 * (rx - xs), rx - 0.10 * (rx - xs)], rear: [number, number] = pick ? [0, 0] : [rrx + 0.10 * (xe - rrx), xe - 0.12 * (xe - rrx)];
  const tList = merge(merge(linspace(0, Math.PI, 36), [A0, A1, B0, B1, Math.PI - A0, Math.PI - A1]), []);
  const xList = merge(cx, [...sideWins.flat(), ...front, ...rear].filter(x => x > xs && x < xe));
  const inWin = (xm: number, tm: number) => {
    const sideT = (tm > A0 && tm < A1) || (tm > Math.PI - A1 && tm < Math.PI - A0);
    if (sideT && sideWins.some(w => xm > w[0] && xm < w[1])) return true;
    if (tm > B0 && tm < B1) { if (xm > front[0] && xm < front[1]) return true; if (!pick && xm > rear[0] && xm < rear[1]) return true; }
    return false;
  };
  const cab = (ofs: number): ((i: number, j: number) => V3) => (i, j) => { const x = xList[i], t = tList[j], h = Math.max(1, hroof(x) - ofs), w = Math.max(1, cw * (0.93 + 0.07 * clamp(hroof(x) / 300)) - ofs); return [x, w * sp(Math.cos(t), eC), zb(x) + (ofs ? ofs * 0.4 : 0) + h * sp(Math.sin(t), eC)]; };
  const cabin = new B('Cabin and roof', 'paint', paint);
  cabin.grid(xList.length - 1, tList.length - 1, cab(0), undefined, (i, j) => inWin((xList[i] + xList[i + 1]) / 2, (tList[j] + tList[j + 1]) / 2));
  out.push(cabin.part);
  const glass = new B('Window glass', 'glass');
  const fg = cab(7);
  for (let i = 0; i < xList.length - 1; i++) for (let j = 0; j < tList.length - 1; j++) {
    if (!inWin((xList[i] + xList[i + 1]) / 2, (tList[j] + tList[j + 1]) / 2)) continue;
    const a = glass.v(fg(i, j)), b = glass.v(fg(i, j + 1)), c = glass.v(fg(i + 1, j)), d = glass.v(fg(i + 1, j + 1)); glass.tri(a, c, b); glass.tri(b, c, d);
  }
  out.push(glass.part);
  const topZ = (x: number, y: number) => { const z0_ = z0(x), z1 = Math.max(zTop(x), z0_ + 30); return (z0_ + z1) / 2 + ((z1 - z0_) / 2) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(y) / hwB, 4.2)), 1 / 4.2); };
  // bonnet and boot panel lines, door shut lines and handles
  const seam = new B('Panel gaps', 'black', [0.02, 0.02, 0.025]);
  const hy = hwB * 0.74, hx0 = pick ? 60 : 90, hx1 = xs - 30;
  const hood: V3[] = [[hx0, -hy, 0], ...linspace(0, 1, 8).map(t => [lerp(hx0, hx1, t), -hy * (1 - 0.05 * t), 0] as V3), ...linspace(1, 0, 6).map((t, k) => [hx1, lerp(-hy, hy, k / 5) * 0.95, 0] as V3), ...linspace(1, 0, 8).map(t => [lerp(hx0, hx1, t), hy * (1 - 0.05 * t), 0] as V3), [hx0, hy, 0]];
  ribbon(seam, hood.map(q => [q[0], q[1], topZ(q[0], q[1]) + 1.5] as V3), 3.5, [0, 0, 1]);
  if (!pick) { const tx0 = xe + 40, tx1 = tail - 70, ty = hwB * 0.7; ribbon(seam, [[tx0, -ty, 0], [tx0, 0, 0], [tx0, ty, 0]].map(q => [q[0], q[1], topZ(q[0], q[1]) + 1.5] as V3), 3.5, [0, 0, 1]); }
  const doorX = two ? [wxA0 - 0.06 * L, wxRear + 0.02 * L] : [wxA0 - 0.06 * L, mid, wxRear + 0.04 * L];
  const sill = z0(fo + wb / 2) + 130;
  for (const sd of [-1, 1]) for (const dx of doorX) ribbon(seam, [[dx, sd * (hwB + 2), sill], [dx, sd * (hwB + 2), zTop(dx) - 8]], 4, [0, sd, 0]);
  const handles = new B('Door handles', 'chrome');
  for (const sd of [-1, 1]) for (let k = 0; k < doorX.length - 1; k++) { const hx = doorX[k + 1] - 0.05 * L - 40; rbox(handles, [hx, sd * (hwB + 3), zTop(hx) - 55], [75, 6, 11], 3, 0, 6, 8); }
  out.push(seam.part, handles.part);
  // lamps, grille, bumpers, plates, mirrors
  const lamp = new B('Headlamps', 'lamp'), tailm = new B('Tail lamps', 'tail'), blk = new B('Grille and intakes', 'black', [0.03, 0.03, 0.035]), plate = new B('Number plates', 'white');
  const znose = zTop(60), hl: V3 = [100, 0, znose - 85];
  for (const sd of [-1, 1]) { rbox(lamp, [hl[0] + (style === 'super' ? 30 : 0), sd * W * 0.30, hl[2] + (style === 'super' ? 10 : 0)], [70, W * 0.115, style === 'super' ? 36 : 52], 2.6, 0, 8, 16); rbox(tailm, [tail - 40, sd * W * 0.33, zTop(tail - 60) - (pick ? 130 : 95)], [26, W * 0.11, 38], 4, 0, 8, 16); rbox(blk, [100, sd * W * 0.37, z0(30) + 105], [70, 120, 62], 3, 0, 6, 10); }
  if (spec.brand !== 'Tesla' && style !== 'super') rbox(blk, [58, 0, znose - 120], [48, W * 0.17, 55], 5, 0, 8, 12);
  rbox(blk, [78, 0, z0(30) + 85], [62, W * 0.27, 50], 4, 0, 8, 12);
  rbox(blk, [tail - 70, 0, z0(tail) + 80], [62, W * 0.33, 48], 4, 0, 8, 12);
  rbox(plate, [64, 0, z0(30) + 150], [8, 260, 65], 8, 0, 4, 8); rbox(plate, [tail - 18, 0, z0(tail) + 300], [8, 260, 65], 8, 0, 4, 8);
  out.push(lamp.part, tailm.part, blk.part, plate.part);
  const mir = new B('Mirrors', 'paint', paint), mirb = new B('Mirror bases', 'black', [0.03, 0.03, 0.035]);
  const mx = xs + 0.20 * (rx - xs);
  for (const sd of [-1, 1]) { rbox(mir, [mx + 60, sd * (cw + 130), zb(mx) + 130], [60, 100, 55], 3, 0, 8, 12); tube(mirb, [mx + 20, sd * (cw - 10), zb(mx) + 90], [mx + 50, sd * (cw + 80), zb(mx) + 120], 11, 6); }
  out.push(mir.part, mirb.part);
  const chr = new B('Exhaust tips', 'chrome');
  for (const sd of [-1, 1]) tube(chr, [tail - 60, sd * W * 0.28, z0(tail) + 55], [tail + 12, sd * W * 0.28, z0(tail) + 55], 36, 14);
  if (style === 'super') { const sp_ = new B('Rear wing', 'paint', paint); rbox(sp_, [tail - 120, 0, zTop(tail - 150) + 150], [150, W * 0.44, 10], 4, 0, 6, 16); for (const sd of [-1, 1]) rbox(sp_, [tail - 120, sd * W * 0.3, zTop(tail - 150) + 80], [30, 8, 80], 3, 0, 6, 8); out.push(sp_.part); }
  if (style === 'suv' || style === 'wedge') { const rl = new B('Roof rails', 'black', [0.05, 0.05, 0.055]); for (const sd of [-1, 1]) tube(rl, [rx + 80, sd * cw * 0.62, H - 4], [rrx + 400, sd * cw * 0.62, H - 4], 16, 8); out.push(rl.part); }
  out.push(chr.part);
  // interior seen through the glass
  const int = new B('Interior', 'interior'), seat = new B('Seats', 'seat');
  const fx = xs + 0.40 * (xe - xs), sz = z0(fx) + 330, ry = pick ? 0 : 1;
  rbox(int, [(xs + xe) / 2, 0, z0(fx) + 130], [(xe - xs) / 2 - 80, hwB * 0.78, 30], 6, 0, 6, 10);
  rbox(int, [xs + 90, 0, zb(xs) - 100], [160, hwB * 0.74, 100], 4, 0, 8, 14);
  for (const sd of [-1, 1]) { rbox(seat, [fx, sd * hwB * 0.36, sz], [230, 230, 70], 3.4, 0, 8, 12); rbox(seat, [fx + 230, sd * hwB * 0.36, sz + 240], [60, 220, 270], 3.4, 0.18, 8, 12); rbox(seat, [fx + 250, sd * hwB * 0.36, sz + 570], [45, 110, 90], 3, 0, 8, 10); }
  if (ry && xe - xs > 1500) { const bx = lerp(fx, xe, 0.62); rbox(seat, [bx, 0, sz - 10], [220, hwB * 0.68, 70], 3.4, 0, 8, 12); rbox(seat, [bx + 230, 0, sz + 220], [60, hwB * 0.66, 250], 3.4, 0.18, 8, 12); }
  const sw = new B('Steering wheel', 'black', [0.03, 0.03, 0.035]); torus(sw, [fx - 330, hwB * 0.36, sz + 330], 190, 15, [1, 0, 0.35], 24, 6);
  out.push(int.part, seat.part, sw.part);
  if (pick) {
    const bedl = L - bedx, wall = p.wall ?? 90, bw = hwB, bz0 = z0(bedx + 100) + 150, bz1 = belt + (p.bedh ?? 480);
    const bed = new B('Load bed', 'paint', paint), liner = new B('Bed liner', 'black', [0.04, 0.04, 0.045]);
    rbox(liner, [bedx + bedl / 2, 0, belt + 20], [bedl / 2 - wall, bw - wall, 12], 8, 0, 4, 8);
    for (const sd of [-1, 1]) rbox(bed, [bedx + bedl / 2, sd * (bw - wall / 2), (belt + bz1) / 2], [bedl / 2, wall / 2, (bz1 - belt) / 2], 6, 0, 6, 10);
    rbox(bed, [bedx + wall / 2, 0, (belt + bz1) / 2], [wall / 2, bw, (bz1 - belt) / 2], 6, 0, 6, 10); rbox(bed, [L - wall / 2, 0, (belt + bz1) / 2], [wall / 2, bw, (bz1 - belt) / 2 - 20], 6, 0, 6, 10);
    const ch = new B('Chassis rails', 'metal'); for (const sd of [-1, 1]) rbox(ch, [(fo + L) / 2, sd * bw * 0.5, gc + 90], [(L - fo) / 2, 40, 80], 4, 0, 4, 8);
    out.push(bed.part, liner.part, ch.part);
  }
  const wo: WOpt = { rw, tw, spokes: style === 'super' ? 10 : style === 'suv' || pick || style === 'wedge' ? 6 : 5, sw: style === 'super' ? 0.35 : style === 'suv' || pick ? 0.5 : 0.45 };
  const wy = W / 2 - tw / 2 - 22;
  for (const [i, ax] of [fo, fo + wb].entries()) for (const sd of [-1, 1]) wheel(out, [ax, sd * wy, rw], sd, wo, `${i ? 'rear' : 'front'} ${sd > 0 ? 'right' : 'left'}`);
  return out;
}

// ---------- heavy vehicles ----------
function bus(p: P, paint: V3): VPart[] {
  const L = p.L ?? 12000, W = p.W ?? 2550, H = p.H ?? 3250, wb = p.wb ?? 6000, fo = p.fo ?? 2600, gc = p.gc ?? 420, rw = p.rw ?? 520, tw = p.tw ?? 295, nwin = p.nwin ?? 7, wl = p.wl ?? 1100, wsp = p.wsp ?? 1300, wz = p.wz ?? 1450, wh = p.wh ?? 900;
  const out: VPart[] = [], body = new B('Body shell', 'paint', paint);
  bodyLoft({ m: body, x0: 0, x1: L, z0: () => gc, z1: () => H, hw: () => W / 2, n: 8, capF: W * 0.13, capR: W * 0.1, arches: [{ x: fo, r: rw + 60 }, { x: fo + wb, r: rw + 60 }, { x: fo + wb + 1400, r: rw + 60 }].filter(a => a.x < L - 600), col: paint, step: 60, nr: 40 });
  // two-tone: white upper body is painted by tinting rows above the window line
  out.push(body.part);
  const glass = new B('Window glass', 'glass'), frame = new B('Window frames', 'black', [0.03, 0.03, 0.035]);
  const x0 = fo + 300;
  for (const sd of [-1, 1]) for (let k = 0; k < nwin; k++) { const cx = x0 + k * wsp + wl / 2; if (cx + wl / 2 > L - 500) continue; rbox(frame, [cx, sd * (W / 2 + 3), wz + wh / 2], [wl / 2 + 20, 5, wh / 2 + 20], 8, 0, 4, 8); rbox(glass, [cx, sd * (W / 2 + 9), wz + wh / 2], [wl / 2, 4, wh / 2], 8, 0, 4, 8); }
  for (const sd of [-1]) { rbox(frame, [fo - 1000, sd * (W / 2 + 3), wz + 100], [450, 5, wh / 2 + 220], 8, 0, 4, 8); rbox(glass, [fo - 1000, sd * (W / 2 + 9), wz + 100], [420, 4, wh / 2 + 190], 8, 0, 4, 8); }
  rbox(frame, [8, 0, wz + 380], [8, W / 2 - 220, 780], 8, 0, 4, 8); rbox(glass, [-2, 0, wz + 380], [4, W / 2 - 250, 750], 8, 0, 4, 8);
  rbox(frame, [8, 0, H - 230], [8, W / 2 - 320, 150], 8, 0, 4, 8);
  rbox(glass, [L - 8, 0, wz + 400], [4, W / 2 - 400, 420], 8, 0, 4, 8);
  const lamp = new B('Headlamps', 'lamp'), tail = new B('Tail lamps', 'tail'), blk = new B('Bumpers', 'black', [0.04, 0.04, 0.045]);
  for (const sd of [-1, 1]) { rbox(lamp, [14, sd * (W / 2 - 280), gc + 520], [30, 170, 80], 3, 0, 6, 12); rbox(tail, [L - 14, sd * (W / 2 - 220), gc + 650], [30, 80, 150], 3, 0, 6, 12); }
  rbox(blk, [20, 0, gc + 150], [40, W / 2 - 60, 110], 5, 0, 6, 10); rbox(blk, [L - 20, 0, gc + 150], [40, W / 2 - 60, 110], 5, 0, 6, 10);
  const roof = new B('Roof air conditioner', 'white'); rbox(roof, [L * 0.62, 0, H + 80], [1500, W * 0.3, 90], 4, 0, 8, 12); rbox(roof, [L * 0.2, 0, H + 40], [500, W * 0.25, 50], 4, 0, 6, 10);
  const door = new B('Passenger doors', 'black', [0.04, 0.05, 0.06]); const dg = new B('Door glass', 'glass');
  rbox(door, [fo + 80, W / 2 + 4, gc + 1000], [380, 4, 1000], 8, 0, 4, 8); rbox(dg, [fo + 80, W / 2 + 8, gc + 1050], [360, 4, 920], 8, 0, 4, 8);
  const mir = new B('Mirrors', 'black', [0.04, 0.04, 0.045]); for (const sd of [-1, 1]) { tube(mir, [200, sd * (W / 2 - 40), H - 600], [180, sd * (W / 2 + 220), H - 700], 14, 6); rbox(mir, [170, sd * (W / 2 + 230), H - 800], [30, 60, 230], 3, 0, 6, 8); }
  const trim = new B('Waist stripe', 'white'); for (const sd of [-1, 1]) rbox(trim, [L / 2, sd * (W / 2 + 1.5), gc + 900], [L / 2 - 400, 2, 70], 8, 0, 3, 6);
  out.push(frame.part, glass.part, lamp.part, tail.part, blk.part, roof.part, door.part, dg.part, mir.part, trim.part);
  const wo: WOpt = { rw, tw, solid: true, spokes: 10, sw: 0.4 }, wy = W / 2 - tw / 2 - 25;
  for (const [i, ax] of [fo, fo + wb, fo + wb + 1400].entries()) { if (ax > L - 600) continue; for (const sd of [-1, 1]) wheel(out, [ax, sd * wy, rw], sd, wo, `axle ${i + 1} ${sd > 0 ? 'right' : 'left'}`); }
  return out;
}
function truck(p: P, paint: V3): VPart[] {
  const L = p.L ?? 7200, W = p.W ?? 2400, gc = p.gc ?? 460, fh = p.fh ?? 640, cabl = p.cabl ?? 1800, cabh = p.cabh ?? 1750, boxl = p.boxl ?? 5000, boxh = p.boxh ?? 2350, rw = p.rw ?? 520, tw = p.tw ?? 295, fo = p.fo ?? 1100, wb = p.wb ?? 3900, ax2 = p.ax2 ?? 1350;
  const out: VPart[] = [], zf = gc + fh, cabW = W - 250, white: V3 = [0.92, 0.93, 0.94];
  const ch = new B('Chassis frame', 'metal'); for (const sd of [-1, 1]) rbox(ch, [L / 2, sd * 500, gc + fh / 2], [L / 2, 60, fh / 2 - 30], 4, 0, 4, 8);
  const cab = new B('Cab', 'paint', paint);
  bodyLoft({ m: cab, x0: 100, x1: 100 + cabl, z0: () => zf - 40, z1: (x) => zf + cabh, hw: () => cabW / 2, n: 5, capF: 380, capR: 100, arches: [{ x: fo, r: rw + 40 }], col: paint, step: 40, nr: 40 });
  const box = new B('Cargo box', 'paint', white); const bx0 = L - boxl; rbox(box, [bx0 + boxl / 2, 0, (zf + boxh + zf) / 2 + 20], [boxl / 2, W / 2, boxh / 2 - 10], 12, 0, 8, 24);
  const glass = new B('Window glass', 'glass'), fr = new B('Window frames', 'black', [0.03, 0.03, 0.035]);
  rbox(fr, [104, 0, zf + cabh * 0.62], [8, cabW / 2 - 130, cabh * 0.28], 6, 0, 4, 8); rbox(glass, [96, 0, zf + cabh * 0.62], [4, cabW / 2 - 150, cabh * 0.265], 6, 0, 4, 8);
  for (const sd of [-1, 1]) { rbox(fr, [560, sd * (cabW / 2 + 2), zf + cabh * 0.62], [330, 5, cabh * 0.27], 6, 0, 4, 8); rbox(glass, [560, sd * (cabW / 2 + 6), zf + cabh * 0.62], [310, 4, cabh * 0.25], 6, 0, 4, 8); }
  const lamp = new B('Headlamps', 'lamp'), tail = new B('Tail lamps', 'tail'), blk = new B('Bumper and grille', 'black', [0.04, 0.04, 0.045]);
  for (const sd of [-1, 1]) { rbox(lamp, [96, sd * (cabW / 2 - 140), zf + 180], [14, 110, 70], 3, 0, 6, 10); rbox(tail, [L - 8, sd * (W / 2 - 100), zf + 400], [14, 50, 140], 3, 0, 6, 10); }
  rbox(blk, [98, 0, zf + 160], [14, cabW / 2 - 330, 110], 5, 0, 6, 10); rbox(blk, [60, 0, gc + 140], [60, W / 2 - 60, 90], 5, 0, 6, 10); rbox(blk, [L + 10, 0, gc + 150], [30, W / 2 - 100, 70], 5, 0, 6, 10);
  const ribs = new B('Box ribs', 'white'); for (let k = 0; k < 8; k++) for (const sd of [-1, 1]) rbox(ribs, [bx0 + 300 + k * ((boxl - 600) / 7), sd * (W / 2 + 4), zf + boxh / 2 + 10], [18, 6, boxh / 2 - 60], 4, 0, 4, 8);
  const mir = new B('Mirrors', 'black', [0.04, 0.04, 0.045]); for (const sd of [-1, 1]) { tube(mir, [220, sd * (cabW / 2), zf + 1000], [150, sd * (cabW / 2 + 240), zf + 1050], 14, 6); rbox(mir, [140, sd * (cabW / 2 + 250), zf + 1000], [30, 70, 220], 3, 0, 6, 8); }
  const pipe = new B('Exhaust stack', 'chrome'); tube(pipe, [bx0 - 40, cabW / 2 + 40, zf + 100], [bx0 - 40, cabW / 2 + 40, zf + cabh + 300], 50, 12);
  out.push(ch.part, cab.part, box.part, glass.part, fr.part, lamp.part, tail.part, blk.part, ribs.part, mir.part, pipe.part);
  const wo: WOpt = { rw, tw, solid: true, sw: 0.4 }, wy = W / 2 - tw / 2 - 30;
  for (const [i, ax] of [fo, fo + wb, fo + wb + ax2].entries()) for (const sd of [-1, 1]) wheel(out, [ax, sd * wy, rw], sd, wo, `axle ${i + 1} ${sd > 0 ? 'right' : 'left'}`);
  return out;
}
function trailer(p: P, paint: V3): VPart[] {
  const L = p.L ?? 3000, W = p.W ?? 1800, gc = p.gc ?? 330, ch = p.ch ?? 150, bw = p.bw ?? 480, wall = p.wall ?? 70, ax = p.ax ?? 1350, rw = p.rw ?? 300, tw = p.tw ?? 200, dl = p.dl ?? 1200, dw = p.dw ?? 260;
  const out: VPart[] = [], fl = gc + ch, rails = new B('Chassis', 'metal'), floor = new B('Floor', 'wood'), walls = new B('Box walls', 'paint', paint), fend = new B('Mudguards', 'black', [0.05, 0.05, 0.055]), lt = new B('Lights', 'tail');
  for (const sd of [-1, 1]) { rbox(rails, [L / 2, sd * (W / 2 - 90), gc + ch / 2], [L / 2, 40, ch / 2], 4, 0, 4, 8); tube(rails, [0, sd * (dw / 2), gc + ch / 2], [-dl, 0, gc + ch / 2 + 10], 28, 8); }
  rbox(floor, [L / 2, 0, fl + 15], [L / 2, W / 2, 18], 8, 0, 4, 10);
  for (const sd of [-1, 1]) rbox(walls, [L / 2, sd * (W / 2 - wall / 2), fl + bw / 2], [L / 2, wall / 2, bw / 2], 6, 0, 6, 10);
  rbox(walls, [wall / 2, 0, fl + bw / 2], [wall / 2, W / 2, bw / 2], 6, 0, 6, 10); rbox(walls, [L - wall / 2, 0, fl + bw / 2], [wall / 2, W / 2, bw / 2], 6, 0, 6, 10);
  for (const sd of [-1, 1]) { rbox(fend, [ax, sd * (W / 2 - tw / 2 - 60), gc + ch + rw * 0.25 + 60], [rw + 70, tw / 2 + 50, 30], 4, 0, 6, 10); rbox(lt, [L + 4, sd * (W / 2 - 90), fl + 110], [6, 55, 45], 3, 0, 6, 8); }
  const cp = new B('Coupler', 'chrome'); rbox(cp, [-dl, 0, gc + ch / 2 + 30], [70, 55, 55], 3, 0, 6, 10); tube(cp, [-dl + 60, 0, gc + ch / 2 + 20], [-dl + 60, 0, 0 + rw * 0.9], 18, 8);
  out.push(rails.part, floor.part, walls.part, fend.part, lt.part, cp.part);
  const wy = W / 2 - tw / 2 - 40; for (const sd of [-1, 1]) wheel(out, [ax, sd * wy, rw], sd, { rw, tw, solid: true, sw: 0.5 }, sd > 0 ? 'right' : 'left');
  return out;
}
function tractor(p: P, paint: V3): VPart[] {
  const rrw = p.rrw ?? 800, rtw = p.rtw ?? 450, rtr = p.rtr ?? 1650, frw = p.frw ?? 500, ftw = p.ftw ?? 250, ftr = p.ftr ?? 1500, rax = p.rax ?? 2650, fax = p.fax ?? 500, hoodl = p.hoodl ?? 1500, hw = p.hw ?? 700, cabx = p.cabx ?? 1750, cabl = p.cabl ?? 1350, cabh = p.cabh ?? 1450, cwid = p.cw ?? 1350, chH = p.chassisH ?? 220, L = p.L ?? 3900;
  const out: VPart[] = [], hood = new B('Bonnet', 'paint', paint), grill = new B('Grille', 'black', [0.04, 0.04, 0.045]), lamp = new B('Headlamps', 'lamp'), met = new B('Chassis and engine', 'metal');
  const zh = rrw * 1.05; rbox(hood, [hoodl / 2 + 150, 0, zh + 130], [hoodl / 2, hw / 2, 330], 4, 0, 10, 20);
  rbox(grill, [60, 0, zh + 120], [30, hw / 2 - 50, 230], 6, 0, 6, 10); for (const sd of [-1, 1]) rbox(lamp, [70, sd * (hw / 2 - 20), zh + 420], [26, 90, 60], 3, 0, 6, 10);
  rbox(met, [(L - 300) / 2 + 150, 0, zh - 120], [(L - 300) / 2, 180, 110], 4, 0, 6, 10); rbox(met, [fax, 0, frw], [90, ftr / 2, 70], 4, 0, 4, 10);
  const cabm = new B('Cab', 'paint', paint), glass = new B('Cab glass', 'glass'), post = new B('Cab pillars', 'black', [0.04, 0.04, 0.045]), seat = new B('Seat', 'seat');
  const cz0 = zh + 200, cz1 = cz0 + cabh;
  rbox(cabm, [cabx + cabl / 2, 0, cz1 + 40], [cabl / 2 + 60, cwid / 2 + 50, 40], 6, 0, 6, 10); rbox(met, [cabx + cabl / 2, 0, cz0], [cabl / 2, cwid / 2, 40], 6, 0, 4, 8);
  for (const sx of [0, 1]) for (const sd of [-1, 1]) tube(post, [cabx + sx * cabl, sd * cwid / 2, cz0], [cabx + sx * cabl, sd * cwid / 2, cz1 + 20], 32, 8);
  for (const sd of [-1, 1]) rbox(glass, [cabx + cabl / 2, sd * (cwid / 2 - 2), (cz0 + cz1) / 2], [cabl / 2 - 40, 3, cabh / 2 - 30], 6, 0, 4, 8);
  rbox(glass, [cabx + 2, 0, (cz0 + cz1) / 2], [3, cwid / 2 - 40, cabh / 2 - 30], 6, 0, 4, 8); rbox(glass, [cabx + cabl - 2, 0, (cz0 + cz1) / 2], [3, cwid / 2 - 40, cabh / 2 - 30], 6, 0, 4, 8);
  rbox(seat, [cabx + cabl * 0.55, 0, cz0 + 180], [230, 220, 90], 3.4, 0, 8, 12); rbox(seat, [cabx + cabl * 0.55 + 220, 0, cz0 + 480], [50, 220, 280], 3.4, 0.15, 8, 12);
  const sw = new B('Steering wheel', 'black', [0.03, 0.03, 0.035]); torus(sw, [cabx + cabl * 0.22, 0, cz0 + 450], 190, 16, [1, 0, 0.5], 24, 6);
  const ex = new B('Exhaust pipe', 'chrome'); tube(ex, [hoodl - 250, -hw / 2 + 90, zh + 380], [hoodl - 250, -hw / 2 + 90, zh + 1250], p.exh ?? 36, 12);
  const fend = new B('Rear mudguards', 'paint', paint); for (const sd of [-1, 1]) rbox(fend, [rax, sd * (rtr / 2 - rtw / 2 + 40), rrw * 2 + 70], [rrw * 0.95, rtw / 2 + 60, 28], 4, 0, 6, 12);
  out.push(hood.part, grill.part, lamp.part, met.part, cabm.part, glass.part, post.part, seat.part, sw.part, ex.part, fend.part);
  for (const sd of [-1, 1]) { wheel(out, [rax, sd * (rtr / 2), rrw], sd, { rw: rrw, tw: rtw, solid: true, lugs: true, sw: 0.55, rimCol: undefined }, `rear ${sd > 0 ? 'right' : 'left'}`); wheel(out, [fax, sd * (ftr / 2), frw], sd, { rw: frw, tw: ftw, solid: true, lugs: true, sw: 0.5 }, `front ${sd > 0 ? 'right' : 'left'}`); }
  return out;
}
function moto(p: P, paint: V3): VPart[] {
  const wb = p.wb ?? 1450, rw = p.rw ?? 330, tw = p.tw ?? 130, out: VPart[] = [], fr = new B('Frame', 'paint', paint), tank = new B('Fuel tank', 'paint', paint), seat = new B('Saddle', 'seat'), eng = new B('Engine', 'metal'), ex = new B('Exhaust', 'chrome'), lamp = new B('Headlamp', 'lamp'), blk = new B('Bars and grips', 'black', [0.03, 0.03, 0.035]), fk = new B('Forks', 'chrome');
  const head: V3 = [0.17 * wb, 0, 0.72 * wb], top: V3 = [0.13 * wb, 0, 0.745 * wb];
  for (const sd of [-1, 1]) { tube(fk, [0, sd * 85, rw], [head[0] - 30, sd * 75, head[2] + 40], 17, 10); tube(fr, [0.62 * wb, sd * 130, 0.45 * wb], [wb, sd * (tw / 2 + 28), rw], 20, 8); tube(fr, [head[0], sd * 30, head[2] - 60], [0.60 * wb, sd * 130, 0.45 * wb], 22, 8); tube(blk, [top[0], sd * 70, top[2] + 40], [top[0] + 60, sd * 380, top[2] + 90], 12, 8); rbox(blk, [top[0] + 70, sd * 400, top[2] + 95], [60, 20, 20], 3, 0, 5, 8); }
  rbox(tank, [0.34 * wb, 0, 0.76 * wb], [0.17 * wb, 160, 0.075 * wb], 2.6, 0, 10, 18); rbox(tank, [0.80 * wb, 0, 0.74 * wb], [0.14 * wb, 120, 0.05 * wb], 2.6, 0, 8, 14);
  rbox(seat, [0.58 * wb, 0, 0.73 * wb], [0.17 * wb, 150, 50], 3.4, 0, 8, 14); rbox(eng, [0.45 * wb, 0, 0.40 * wb], [0.14 * wb, 130, 0.12 * wb], 4, 0, 8, 12);
  for (let k = 0; k < 4; k++) rbox(eng, [0.38 * wb + k * 0.05 * wb, 0, 0.55 * wb], [0.02 * wb, 120, 0.04 * wb], 4, 0.3, 4, 8);
  rbox(lamp, [head[0] - 70, 0, head[2] + 20], [55, 105, 95], 2.4, 0, 8, 14);
  for (const sd of [-1, 1]) { tube(ex, [0.40 * wb, sd * 170, 0.28 * wb], [0.88 * wb, sd * 190, 0.34 * wb], 38, 12); }
  out.push(fr.part, tank.part, seat.part, eng.part, ex.part, lamp.part, blk.part, fk.part);
  for (const [x, w] of [[0, tw * 0.9], [wb, tw]] as [number, number][]) wheel(out, [x, 0, rw], 1, { rw, tw: w, spokes: 12, sw: 0.9, thin: true }, x ? 'rear' : 'front');
  return out;
}
function bike(p: P, paint: V3): VPart[] {
  const wb = p.wb ?? 1050, rw = p.rw ?? 340, out: VPart[] = [], fr = new B('Frame', 'paint', paint), bits = new B('Saddle and grips', 'black', [0.03, 0.03, 0.035]), met = new B('Cranks and bars', 'chrome'), sp_ = new B('Spokes', 'chrome');
  const bb: V3 = [0.52 * wb, 0, rw * 0.9], st: V3 = [0.60 * wb, 0, rw + 460], ht0: V3 = [0.07 * wb, 0, rw + 300], ht1: V3 = [0.115 * wb, 0, rw + 440];
  tube(fr, ht0, ht1, 22, 10); tube(fr, ht1, st, 17, 10); tube(fr, ht0, bb, 20, 10); tube(fr, bb, [st[0] + 40, 0, st[2] + 90], 17, 10);
  for (const sd of [-1, 1]) { tube(fr, bb, [wb, sd * 55, rw], 11, 8); tube(fr, [st[0], 0, st[2] - 20], [wb, sd * 55, rw], 10, 8); tube(fr, ht0, [0, sd * 55, rw], 13, 8); tube(met, [bb[0], sd * 85, bb[2] + (sd > 0 ? -160 : 160)], [bb[0], sd * 85, bb[2]], 9, 6); rbox(bits, [bb[0], sd * 110, bb[2] + (sd > 0 ? -160 : 160)], [50, 30, 12], 3, 0, 5, 8); tube(met, [ht1[0] - 10, sd * 10, ht1[2] + 90], [ht1[0] - 40, sd * 220, ht1[2] + 110], 11, 8); rbox(bits, [ht1[0] - 40, sd * 250, ht1[2] + 110], [20, 55, 17], 3, 0, 5, 8); }
  tube(met, ht1, [ht1[0] - 10, 0, ht1[2] + 90], 13, 8); rbox(bits, [st[0] + 70, 0, st[2] + 105], [140, 70, 25], 3, 0, 6, 10); lathe(met, [[70, -18], [70, 18]], [bb[0], 0, bb[2]], 1, 32);
  out.push(fr.part, bits.part, met.part);
  for (const [x, nm] of [[0, 'front'], [wb, 'rear']] as [number, string][]) {
    wheel(out, [x, 0, rw], 1, { rw, tw: 38, thin: true, spokes: 0, sw: 1 }, nm);
    for (let k = 0; k < 28; k++) { const a = (k * 2 * Math.PI) / 14, y = k % 2 ? 22 : -22; tube(sp_, [x + Math.cos(a) * 14, y, rw + Math.sin(a) * 14], [x + Math.cos(a + 0.3) * (rw - 22), 0, rw + Math.sin(a + 0.3) * (rw - 22)], 1.2, 4); }
  }
  out.push(sp_.part);
  return out;
}

export function buildVehicle(spec: VSpec, p: P, paintHex: string): VPart[] {
  const paint = hexRgb(spec.paint ?? paintHex);
  const parts = spec.kind === 'car' ? car(spec, p, paint) : spec.kind === 'bus' ? bus(p, paint) : spec.kind === 'truck' ? truck(p, paint) : spec.kind === 'moto' ? moto(p, paint) : spec.kind === 'bike' ? bike(p, paint) : spec.kind === 'trailer' ? trailer(p, paint) : tractor(p, paint);
  return parts.filter(q => q.idx.length > 0);
}
export function vehicleBounds(parts: VPart[]) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const q of parts) for (let i = 0; i < q.pos.length; i += 3) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], q.pos[i + a]); hi[a] = Math.max(hi[a], q.pos[i + a]); }
  return { lo, hi };
}
