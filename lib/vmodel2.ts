// Realistic models for the rest of the catalogue: construction and farm machinery, aircraft, ships, trains, emergency and leisure vehicles.
// Same frame as vmodel.ts: millimetres, X front to rear, Y across (+Y right), Z up, ground at Z = 0.
import { B, rbox, tube, lathe, torus, ribbon, wheel, truck, bus, moto, bike, hexRgb, lerp, clamp, type VPart, type VSpec, type V3, type P } from './vmodel';

const DARK: V3 = [0.04, 0.04, 0.045], STEEL: V3 = [0.62, 0.64, 0.67];
const C = (h: string) => hexRgb(h);
const pt = (m: B, x: number, y: number, z: number): V3 => { void m; return [x, y, z]; };

// ---- tracks and heavy machinery ----
function tracks(out: VPart[], cx: number, y: number, len: number, h: number, w: number) {
  const t = new B('Track chains', 'rubber'), g = new B('Track frames', 'metal'), sp = new B('Sprockets', 'metal');
  for (const sd of [-1, 1]) {
    rbox(t, [cx, sd * y, h / 2], [len / 2, w / 2, h / 2], 4.5, 0, 10, 20); rbox(g, [cx, sd * (y - w / 2 + 40), h / 2], [len / 2 - h * 0.3, 40, h * 0.34], 4, 0, 4, 8);
    for (const e of [-1, 1]) lathe(sp, [[h * 0.3, -w / 2 - 6], [h * 0.3, w / 2 + 6]], [cx + e * (len / 2 - h * 0.45), sd * y, h / 2], 1, 20);
    for (let k = -2; k <= 2; k++) lathe(sp, [[h * 0.2, -w / 2 - 6], [h * 0.2, w / 2 + 6]], [cx + k * len * 0.15, sd * y, h * 0.3], 1, 14);
  }
  out.push(t.part, g.part, sp.part);
}
function excavator(p: P, paint: V3): VPart[] {
  const L = p.L ?? 9500, W = p.W ?? 3200, H = p.H ?? 3200, out: VPart[] = [], tl = L * 0.42, cx = L * 0.62, th = W * 0.28;
  tracks(out, cx, W * 0.36, tl, th, W * 0.2);
  const body = new B('Upper structure', 'paint', paint), cab = new B('Cab', 'paint', paint), gl = new B('Cab glass', 'glass'), met = new B('Boom and stick', 'paint', paint), bk = new B('Bucket', 'metal'), blk = new B('Counterweight', 'black', DARK);
  rbox(met, [cx, 0, th + 100], [tl * 0.2, W * 0.34, 100], 4, 0, 6, 10);
  rbox(body, [cx + 100, 0, th + 750], [tl * 0.42, W * 0.46, 650], 4, 0, 10, 16); rbox(blk, [cx + tl * 0.42, 0, th + 760], [W * 0.18, W * 0.44, 460], 5, 0, 8, 14);
  rbox(cab, [cx - tl * 0.22, W * 0.2, th + 1750], [W * 0.26, W * 0.17, 760], 4, 0, 8, 12); rbox(gl, [cx - tl * 0.22 - W * 0.26 + 12, W * 0.2, th + 1800], [6, W * 0.15, 560], 6, 0, 4, 8); rbox(gl, [cx - tl * 0.22, W * 0.37 - 6, th + 1800], [W * 0.22, 6, 560], 6, 0, 4, 8);
  const P0: V3 = [cx - tl * 0.28, -W * 0.12, th + 800], E: V3 = [cx - tl * 0.95, -W * 0.12, th + 2500], T: V3 = [cx - tl * 1.25, -W * 0.12, th + 350];
  tube(met, P0, E, 220, 12, 150); tube(met, E, T, 150, 12, 110); rbox(bk, [T[0] - 100, T[1], T[2] - 160], [420, 480, 380], 3, 0.5, 8, 12);
  tube(bk, [P0[0] - 150, -W * 0.12, th + 650], [E[0] + 200, -W * 0.12, E[2] - 150], 40, 8);
  out.push(body.part, cab.part, gl.part, met.part, bk.part, blk.part);
  const lt = new B('Work lamps', 'lamp'); rbox(lt, [cx - tl * 0.22, W * 0.2, th + 2100], [60, 90, 40], 3, 0, 6, 8); out.push(lt.part);
  return out;
}
function bulldozer(p: P, paint: V3): VPart[] {
  const L = p.L ?? 5500, W = p.W ?? 3400, H = p.H ?? 3200, out: VPart[] = [], tl = L * 0.62, cx = L * 0.58, th = H * 0.3;
  tracks(out, cx, W * 0.36, tl, th, W * 0.16);
  const body = new B('Body', 'paint', paint), cab = new B('Cab', 'black', DARK), gl = new B('Glass', 'glass'), bl = new B('Blade', 'metal'), rip = new B('Ripper', 'metal');
  rbox(body, [cx - 150, 0, th + 450], [tl * 0.42, W * 0.3, 450], 4, 0, 10, 16); rbox(body, [cx - tl * 0.3, 0, th + 750], [tl * 0.2, W * 0.26, 300], 4, 0, 8, 12);
  for (const sd of [-1, 1]) tube(cab, [cx + tl * 0.12, sd * W * 0.2, th + 900], [cx + tl * 0.12, sd * W * 0.2, H - 80], 40, 8);
  rbox(cab, [cx + tl * 0.18, 0, H - 40], [tl * 0.2, W * 0.24, 40], 5, 0, 6, 10); rbox(gl, [cx + tl * 0.18, 0, th + 1500], [tl * 0.19, W * 0.23, 380], 6, 0, 4, 8);
  rbox(bl, [180, 0, th * 0.9], [100, W * 0.5, th * 0.9], 4, 0, 8, 16);
  for (const sd of [-1, 1]) tube(bl, [cx - tl * 0.1, sd * W * 0.34, th * 0.9], [260, sd * W * 0.34, th * 0.9], 80, 8);
  tube(rip, [L - 80, 0, th * 1.1], [L + 400, 0, th * 0.3], 80, 8);
  out.push(body.part, cab.part, gl.part, bl.part, rip.part); return out;
}
function loader(p: P, paint: V3): VPart[] {
  const L = p.L ?? 8200, W = p.W ?? 3200, H = p.H ?? 3600, rw = p.rw ?? 900, tw = p.tw ?? 600, out: VPart[] = [], body = new B('Body', 'paint', paint), cab = new B('Cab', 'black', DARK), gl = new B('Glass', 'glass'), arm = new B('Lift arms', 'paint', paint), bk = new B('Bucket', 'metal');
  const fo = L * 0.36, rb = L * 0.72;
  rbox(body, [rb - 300, 0, rw * 1.3], [L * 0.2, W * 0.34, rw * 0.7], 4, 0, 10, 16); rbox(body, [fo + 250, 0, rw * 1.1], [L * 0.18, W * 0.3, rw * 0.5], 4, 0, 8, 12);
  for (const sd of [-1, 1]) { tube(cab, [fo + 600, sd * W * 0.24, rw * 2.0], [fo + 600, sd * W * 0.24, H - 60], 45, 8); tube(cab, [fo + 1700, sd * W * 0.24, rw * 2.0], [fo + 1700, sd * W * 0.24, H - 60], 45, 8); tube(arm, [fo + 1200, sd * W * 0.36, rw * 1.6], [60, sd * W * 0.36, rw * 0.8], 130, 10); }
  rbox(cab, [fo + 1150, 0, H - 40], [680, W * 0.27, 40], 5, 0, 6, 10); rbox(gl, [fo + 1150, 0, rw * 2.0 + 560], [660, W * 0.26, 560], 6, 0, 4, 8);
  rbox(bk, [0, 0, rw * 0.55], [380, W * 0.5, rw * 0.5], 3.2, 0, 8, 16);
  const ct = new B('Counterweight', 'black', DARK); rbox(ct, [L - 150, 0, rw * 1.5], [200, W * 0.32, rw * 0.7], 5, 0, 6, 12);
  out.push(body.part, cab.part, gl.part, arm.part, bk.part, ct.part);
  for (const ax of [fo, L * 0.76]) for (const sd of [-1, 1]) wheel(out, [ax, sd * (W / 2 - tw / 2), rw], sd, { rw, tw, solid: true, lugs: true, sw: 0.5 }, `axle ${sd}`);
  return out;
}
function roller(p: P, paint: V3): VPart[] {
  const L = p.L ?? 5000, W = p.W ?? 2300, H = p.H ?? 3000, out: VPart[] = [], body = new B('Body', 'paint', paint), dr = new B('Steel drums', 'metal'), cab = new B('Canopy', 'black', DARK), seat = new B('Seat', 'seat');
  const dd = 800, dw = W * 0.86;
  for (const x of [L * 0.2, L * 0.8]) lathe(dr, [[dd, -dw / 2], [dd, dw / 2], [0.001, dw / 2]], [x, 0, dd], 1, 40), lathe(dr, [[dd, -dw / 2], [0.001, -dw / 2]], [x, 0, dd], 1, 40);
  rbox(body, [L * 0.65, 0, dd + 420], [L * 0.2, W * 0.3, 380], 4, 0, 8, 14); rbox(body, [L * 0.3, 0, dd + 150], [L * 0.2, W * 0.12, 80], 4, 0, 6, 10);
  for (const sd of [-1, 1]) for (const x of [L * 0.4, L * 0.58]) tube(cab, [x, sd * W * 0.3, dd + 800], [x, sd * W * 0.3, H], 35, 8);
  rbox(cab, [L * 0.49, 0, H], [L * 0.12, W * 0.32, 30], 5, 0, 6, 10); rbox(seat, [L * 0.5, 0, dd + 780], [180, 200, 70], 3.4, 0, 8, 10);
  out.push(body.part, dr.part, cab.part, seat.part); return out;
}
function forklift(p: P, paint: V3): VPart[] {
  const L = p.L ?? 3300, W = p.W ?? 1200, H = p.H ?? 2200, out: VPart[] = [], body = new B('Body', 'paint', paint), mast = new B('Mast', 'metal'), cage = new B('Overhead guard', 'black', DARK), seat = new B('Seat', 'seat'), ct = new B('Counterweight', 'paint', paint);
  const rw = 330, tw = 200;
  rbox(body, [L * 0.52, 0, 560], [L * 0.28, W * 0.4, 330], 4, 0, 10, 16); rbox(ct, [L * 0.9, 0, 640], [L * 0.1, W * 0.44, 380], 5, 0, 8, 12);
  for (const sd of [-1, 1]) { tube(mast, [260, sd * 260, 120], [260, sd * 260, H * 0.94], 45, 8); tube(cage, [L * 0.46, sd * W * 0.4, 900], [L * 0.46, sd * W * 0.4, H], 25, 8); tube(cage, [L * 0.78, sd * W * 0.4, 900], [L * 0.78, sd * W * 0.4, H * 0.96], 25, 8); rbox(mast, [60, sd * 300, 100], [40, 40, 50], 3, 0, 4, 6); tube(mast, [180, sd * 350, 40], [-1000, sd * 350, 40], 28, 8); rbox(mast, [-500, sd * 350, 60], [500, 55, 25], 4, 0, 4, 8); }
  rbox(mast, [250, 0, 900], [20, W * 0.34, 340], 6, 0, 4, 8); rbox(cage, [L * 0.62, 0, H], [L * 0.2, W * 0.4, 20], 6, 0, 4, 8); rbox(seat, [L * 0.62, 0, 980], [220, 200, 60], 3.4, 0, 8, 10);
  out.push(body.part, ct.part, mast.part, cage.part, seat.part);
  for (const [x, t] of [[L * 0.3, 200], [L * 0.82, 170]] as [number, number][]) for (const sd of [-1, 1]) wheel(out, [x, sd * (W / 2 - t / 2), rw], sd, { rw, tw: t, solid: true, sw: 0.5 }, `x${x}`);
  return out;
}
function dumper(p: P, paint: V3, mining: boolean): VPart[] {
  const q = { ...p, nobox: 1 }, out = truck(q, paint), L = p.L ?? 7200, W = p.W ?? 2400, gc = p.gc ?? 460, fh = p.fh ?? 640, boxl = p.boxl ?? 4200, boxh = p.boxh ?? 1500, zf = gc + fh;
  const bx0 = L - boxl, bed = new B('Tipping body', 'paint', C('#e8a317')), ld = new B('Load', 'interior');
  const tilt = 0.0; void tilt;
  rbox(bed, [bx0 + boxl / 2, 0, zf + 140], [boxl / 2, W / 2, 140], 8, 0, 6, 16);
  for (const sd of [-1, 1]) rbox(bed, [bx0 + boxl / 2, sd * (W / 2 - 60), zf + boxh / 2], [boxl / 2, 60, boxh / 2], 8, 0, 6, 12);
  rbox(bed, [bx0 + 60, 0, zf + boxh * 0.62], [60, W / 2, boxh * 0.62], 8, 0, 6, 12); rbox(bed, [L - 60, 0, zf + boxh / 2 - 100], [60, W / 2, boxh / 2 - 100], 8, 0, 6, 12);
  rbox(ld, [bx0 + boxl / 2, 0, zf + boxh * 0.62], [boxl / 2 - 120, W / 2 - 140, boxh * 0.28], 2.4, 0, 8, 14);
  void mining;
  return [...out.filter(q2 => q2.name !== 'Cargo box'), bed.part, ld.part];
}
function mixer(p: P, paint: V3): VPart[] {
  const out = truck({ ...p, nobox: 1 }, paint), L = p.L ?? 7600, W = p.W ?? 2500, gc = p.gc ?? 460, fh = p.fh ?? 640, zf = gc + fh, dr = new B('Mixer drum', 'paint', C('#e9ebee')), st = new B('Drum stripes', 'paint', paint);
  const x0 = L * 0.36, x1 = L - 150, r = 1100, cz = zf + r + 350;
  const prof: [number, number][] = Array.from({ length: 31 }, (_, i) => { const t = i / 30, x = lerp(x0, x1, t); const rr = r * Math.pow(Math.sin(Math.PI * (0.06 + 0.88 * t)), 0.35) * (t > 0.82 ? 1 - (t - 0.82) * 2.6 : 1) + 20; return [Math.max(40, rr), x - x0] as [number, number]; });
  // lathe about the X axis: build by hand so the drum is tilted up towards the rear
  dr.grid(prof.length - 1, 44, (i, j) => { const a = (2 * Math.PI * j) / 44, [rr, x] = prof[i], tl = x * 0.12; return [x0 + x, rr * Math.cos(a), cz + tl + rr * Math.sin(a)]; }, (i, j) => ((j + i * 0.2) % 11 < 1.6 ? paint : undefined));
  tube(st, [L * 0.82, 0, cz + r * 0.9], [L * 0.98, 0, cz + r * 1.35], 80, 10);
  return [...out.filter(q2 => q2.name !== 'Cargo box'), dr.part, st.part];
}
function craneTruck(p: P, paint: V3): VPart[] {
  const out = truck({ ...p, nobox: 1 }, paint), L = p.L ?? 11500, W = p.W ?? 2550, gc = p.gc ?? 460, fh = p.fh ?? 640, zf = gc + fh, b = new B('Crane boom', 'paint', C('#f1c40f')), met = new B('Crane base', 'metal');
  rbox(met, [L * 0.55, 0, zf + 380], [L * 0.2, W * 0.4, 300], 5, 0, 6, 12);
  const base: V3 = [L * 0.5, 0, zf + 800], tip: V3 = [-L * 0.18, 0, zf + L * 0.42];
  for (const sd of [-1, 1]) for (const dz of [-1, 1]) tube(b, [base[0], sd * 150, base[2] + dz * 150], [tip[0], sd * 90, tip[2] + dz * 90], 38, 8);
  for (let k = 0; k <= 8; k++) { const t = k / 8, x = lerp(base[0], tip[0], t), z = lerp(base[2], tip[2], t); tube(b, [x, -150 * (1 - t) - 90 * t, z + 150 * (1 - t) * (k % 2 ? 1 : -1)], [x, 150 * (1 - t) + 90 * t, z - 150 * (1 - t) * (k % 2 ? 1 : -1)], 16, 6); }
  tube(met, tip, [tip[0], 0, tip[2] - 2200], 14, 6); rbox(met, [tip[0], 0, tip[2] - 2300], [120, 80, 100], 3, 0, 5, 8);
  for (const sd of [-1, 1]) { tube(met, [L * 0.55, sd * W * 0.4, zf + 300], [L * 0.55, sd * (W * 0.7), gc * 0.4], 70, 8); rbox(met, [L * 0.55, sd * W * 0.7, 40], [200, 200, 40], 4, 0, 5, 8); }
  return [...out.filter(q2 => q2.name !== 'Cargo box'), b.part, met.part];
}
function snowPlough(p: P, paint: V3): VPart[] {
  const out = truck({ ...p, nobox: 1 }, paint), W = p.W ?? 2500, gc = p.gc ?? 460, bl = new B('Plough blade', 'paint', C('#e8a317')), bx = new B('Gritter body', 'paint', paint), L = p.L ?? 7000;
  rbox(bl, [-300, 0, gc + 700], [140, W * 0.62, 560], 3, 0.2, 8, 14); rbox(bx, [L * 0.66, 0, gc + 1250], [L * 0.2, W * 0.4, 460], 5, 0, 8, 12);
  const lt = new B('Beacon', 'tail'); rbox(lt, [600, 0, gc + 2900], [100, 150, 40], 3, 0, 5, 8);
  return [...out.filter(q2 => q2.name !== 'Cargo box'), bl.part, bx.part, lt.part];
}
function fireEngine(p: P, paint: V3): VPart[] {
  const out = truck({ ...p, nobox: 1, boxh: 0 }, paint), L = p.L ?? 8000, W = p.W ?? 2500, gc = p.gc ?? 460, fh = p.fh ?? 640, zf = gc + fh, bx = new B('Equipment lockers', 'paint', paint), ld = new B('Ladder', 'metal'), lr = new B('Beacons', 'tail'), lb = new B('Blue beacons', 'blue'), st = new B('Reflective stripe', 'white');
  rbox(bx, [L * 0.62, 0, zf + 700], [L * 0.28, W / 2, 700], 8, 0, 8, 14);
  for (const sd of [-1, 1]) { tube(ld, [L * 0.4, sd * 300, zf + 1520], [L * 0.92, sd * 300, zf + 1520], 22, 8); rbox(st, [L * 0.62, sd * (W / 2 + 2), zf + 760], [L * 0.28, 3, 60], 4, 0, 3, 6); }
  for (let k = 0; k < 12; k++) tube(ld, [L * 0.4 + k * L * 0.043, -300, zf + 1520], [L * 0.4 + k * L * 0.043, 300, zf + 1520], 12, 5);
  for (const sd of [-1, 1]) rbox(sd < 0 ? lb : lr, [L * 0.12, sd * 400, zf + 2700], [110, 190, 40], 3, 0, 6, 8);
  return [...out.filter(q2 => q2.name !== 'Cargo box'), bx.part, ld.part, lr.part, lb.part, st.part];
}
function towTruck(p: P, paint: V3): VPart[] {
  const out = truck({ ...p, nobox: 1 }, paint), L = p.L ?? 7000, W = p.W ?? 2400, gc = p.gc ?? 460, fh = p.fh ?? 640, zf = gc + fh, fb = new B('Flatbed', 'paint', C('#e8a317')), lr = new B('Beacons', 'tail');
  rbox(fb, [L * 0.62, 0, zf + 120], [L * 0.3, W / 2, 100], 8, 0.05, 6, 14); for (const sd of [-1, 1]) rbox(fb, [L * 0.62, sd * (W / 2 - 30), zf + 280], [L * 0.3, 30, 90], 6, 0, 4, 8);
  tube(fb, [L * 0.36, 0, zf + 200], [L * 0.28, 0, zf + 1500], 50, 8); rbox(lr, [L * 0.12, 0, zf + 2700], [120, 260, 40], 3, 0, 6, 8);
  return [...out.filter(q2 => q2.name !== 'Cargo box'), fb.part, lr.part];
}
function semi(p: P, paint: V3): VPart[] {
  const L = p.L ?? 16500, W = p.W ?? 2550, gc = p.gc ?? 460, out: VPart[] = truck({ ...p, L: 6300, nobox: 1, boxl: 0, wb: 3800, ax2: 0 }, paint).filter(q => q.name !== 'Cargo box');
  const tr = new B('Trailer box', 'paint', C('#eef0f2')), ch = new B('Trailer chassis', 'metal'), x0 = 5200, x1 = L, zf = gc + 640;
  rbox(tr, [(x0 + x1) / 2, 0, zf + 1500], [(x1 - x0) / 2, W / 2, 1450], 12, 0, 8, 24); rbox(ch, [(x0 + x1) / 2, 0, zf - 100], [(x1 - x0) / 2, 500, 100], 4, 0, 4, 8);
  for (const ax of [x1 - 2600, x1 - 1300, x1]) for (const sd of [-1, 1]) wheel(out, [ax - 400, sd * (W / 2 - 150), 520], sd, { rw: 520, tw: 295, solid: true, sw: 0.4 }, `t${ax}${sd}`);
  return [...out, tr.part, ch.part];
}
function combine(p: P, paint: V3): VPart[] {
  const L = p.L ?? 9500, W = p.W ?? 3500, H = p.H ?? 4000, out: VPart[] = [], body = new B('Body', 'paint', paint), cab = new B('Cab', 'black', DARK), gl = new B('Glass', 'glass'), hd = new B('Cutter header', 'paint', C('#e0a30b')), rl = new B('Reel', 'metal'), tk = new B('Grain tank', 'paint', paint);
  const rw = 900, rr = 650;
  rbox(body, [L * 0.58, 0, 1500], [L * 0.26, W * 0.36, 800], 4, 0, 10, 16); rbox(tk, [L * 0.58, 0, 2700], [L * 0.2, W * 0.34, 560], 4, 0, 8, 14);
  rbox(cab, [L * 0.38, 0, 2650], [700, W * 0.3, 760], 5, 0, 8, 12); rbox(gl, [L * 0.38 - 690, 0, 2760], [8, W * 0.28, 600], 6, 0, 4, 8); for (const sd of [-1, 1]) rbox(gl, [L * 0.38, sd * W * 0.3, 2760], [600, 8, 600], 6, 0, 4, 8);
  tube(tk, [L * 0.7, W * 0.3, 3000], [L * 0.92, W * 0.62, 3300], 160, 12);
  rbox(hd, [L * 0.1, 0, 900], [L * 0.1, W * 0.5, 550], 4, 0, 8, 16); lathe(rl, [[420, -W * 0.5], [420, W * 0.5]], [L * 0.06, 0, 1550], 1, 8);
  rbox(body, [L * 0.28, 0, 1300], [L * 0.07, W * 0.28, 450], 4, 0, 6, 10);
  out.push(body.part, tk.part, cab.part, gl.part, hd.part, rl.part);
  for (const sd of [-1, 1]) { wheel(out, [L * 0.38, sd * (W / 2 - 330), rw], sd, { rw, tw: 650, solid: true, lugs: true, sw: 0.5 }, `f${sd}`); wheel(out, [L * 0.82, sd * (W * 0.36), rr], sd, { rw: rr, tw: 400, solid: true, sw: 0.5 }, `r${sd}`); }
  return out;
}
function sprayer(p: P, paint: V3): VPart[] {
  const L = p.L ?? 7200, W = p.W ?? 3000, H = p.H ?? 3900, out: VPart[] = [], body = new B('Body', 'paint', paint), cab = new B('Cab', 'black', DARK), gl = new B('Glass', 'glass'), tk = new B('Tank', 'white'), bm = new B('Spray booms', 'paint', paint), nz = new B('Nozzles', 'chrome');
  const rw = 950;
  rbox(body, [L * 0.4, 0, 1800], [L * 0.38, 380, 360], 4, 0, 8, 14); rbox(cab, [L * 0.2, 0, 2850], [900, 800, 700], 5, 0, 8, 12); rbox(gl, [L * 0.2 - 890, 0, 2900], [8, 700, 560], 6, 0, 4, 8); for (const sd of [-1, 1]) rbox(gl, [L * 0.2, sd * 790, 2900], [800, 8, 560], 6, 0, 4, 8);
  rbox(tk, [L * 0.62, 0, 2650], [L * 0.2, 800, 800], 2.6, 0, 10, 16);
  for (const sd of [-1, 1]) { tube(bm, [L * 0.96, sd * 400, 1400], [L * 0.96, sd * W * 3.6, 1400], 40, 8); tube(bm, [L * 0.96, sd * 400, 1400], [L * 0.96, sd * W * 0.9, 1700], 30, 8); for (let k = 1; k < 14; k++) tube(nz, [L * 0.96, sd * k * W * 0.26, 1400], [L * 0.96, sd * k * W * 0.26, 1250], 10, 5); }
  out.push(body.part, cab.part, gl.part, tk.part, bm.part, nz.part);
  for (const x of [L * 0.14, L * 0.74]) for (const sd of [-1, 1]) { wheel(out, [x, sd * (W / 2 - 150), rw], sd, { rw, tw: 330, solid: true, sw: 0.3 }, `${x}${sd}`); tube(body, [x, sd * (W / 2 - 150), rw], [x, sd * 380, 1800], 60, 8); }
  return out;
}
function seeder(p: P, paint: V3): VPart[] {
  const L = p.L ?? 4200, W = p.W ?? 3200, H = p.H ?? 2400, out: VPart[] = [], body = new B('Hopper', 'paint', paint), fr = new B('Frame', 'metal'), dk = new B('Coulters', 'metal');
  rbox(body, [L * 0.5, 0, H * 0.7], [L * 0.28, W * 0.44, H * 0.28], 3.2, 0, 10, 18); tube(fr, [L * 0.2, -W * 0.45, 800], [L * 0.8, -W * 0.45, 800], 70, 8); tube(fr, [L * 0.2, W * 0.45, 800], [L * 0.8, W * 0.45, 800], 70, 8); tube(fr, [L * 0.2, 0, 800], [-1400, 0, 700], 60, 8);
  for (let k = 0; k < 16; k++) lathe(dk, [[230, -20], [230, 20]], [L * 0.25, -W * 0.45 + k * W * 0.06, 520], 1, 18);
  out.push(body.part, fr.part, dk.part); for (const sd of [-1, 1]) wheel(out, [L * 0.5, sd * (W * 0.46), 520], sd, { rw: 520, tw: 300, solid: true, sw: 0.4 }, `${sd}`); return out;
}
function baler(p: P, paint: V3): VPart[] {
  const L = p.L ?? 5200, W = p.W ?? 2400, H = p.H ?? 2300, out: VPart[] = [], body = new B('Bale chamber', 'paint', paint), fr = new B('Drawbar', 'metal'), pk = new B('Pick-up reel', 'black', DARK);
  rbox(body, [L * 0.6, 0, 1350], [L * 0.28, W * 0.34, 750], 6, 0, 10, 18); rbox(pk, [L * 0.24, 0, 650], [260, W * 0.3, 120], 4, 0, 6, 12); tube(fr, [L * 0.3, 0, 900], [-1000, 0, 800], 55, 8);
  out.push(body.part, fr.part, pk.part); for (const sd of [-1, 1]) wheel(out, [L * 0.6, sd * (W / 2 - 150), 520], sd, { rw: 520, tw: 320, solid: true, sw: 0.4 }, `${sd}`); return out;
}

// ---- aircraft ----
function fuselage(m: B, x0: number, x1: number, rad: (t: number) => number, cz: number, nose = 0.12, tail = 0.2, col?: (i: number, j: number) => V3 | undefined) {
  const n = 60; m.grid(n, 36, (i, j) => { const t = i / n, a = (2 * Math.PI * j) / 36; let r = rad(t), k = 1; if (t < nose) k = Math.pow(Math.sin((t / nose) * Math.PI / 2), 0.6); if (t > 1 - tail) k = Math.pow(1 - (t - (1 - tail)) / tail * 0.88, 0.8); const lift = t > 1 - tail ? (t - (1 - tail)) / tail * r * 0.45 : 0; return [lerp(x0, x1, t), r * k * Math.cos(a), cz + lift + r * k * Math.sin(a)]; }, col ? (i, j) => col(i, j) : undefined);
}
function airliner(p: P, paint: V3, small: boolean): VPart[] {
  const L = p.L ?? 57000, W = p.W ?? 60000, H = p.H ?? 17000, out: VPart[] = [], fr = Math.min(W, L) * (small ? 0.05 : 0.075), cz = H * 0.5 + (small ? 1200 : 1500);
  const fu = new B('Fuselage', 'paint', C('#f4f6f8')), cs = new B('Livery', 'paint', paint), wn = new B('Wings', 'paint', C('#e6e9ec')), en = new B('Engines', 'metal'), wd = new B('Cockpit and cabin windows', 'glass'), gear = new B('Landing gear', 'metal'), tyre = new B('Gear wheels', 'rubber');
  fuselage(fu, 0, L, () => fr, cz, 0.1, 0.22, (i, j) => (i / 60 > 0.1 && i / 60 < 0.8 && Math.sin((2 * Math.PI * j) / 36) < -0.45 ? paint : undefined));
  const ys = (sd: number, t: number) => sd * (fr + (W / 2 - fr) * t);
  for (const sd of [-1, 1]) {
    const root = L * 0.4, sweep = L * 0.18, chordR = L * 0.2, chordT = L * 0.045;
    wn.grid(8, 2, (i, j) => { const t = i / 8, x = root + sweep * t + (j === 2 ? chordR * (1 - t) + chordT * t : 0) * (j === 2 ? 1 : 0) + (j === 1 ? (chordR * (1 - t) + chordT * t) * 0.5 : 0), z = cz - fr * 0.55 + t * W * 0.012 + (j === 1 ? 70 : 0); return [x, ys(sd, t), z]; });
    const stab = L * 0.9; wn.grid(3, 2, (i, j) => { const t = i / 3; return [stab + L * 0.05 * t + j * L * 0.05 * (1 - t * 0.6), sd * (fr * 0.3 + W * 0.17 * t), cz + fr * 0.7]; });
    const ex = root + sweep * 0.42, ey = ys(sd, 0.36); const nacR = small ? 0 : W * 0.025;
    if (nacR) { lathe(en, [[nacR * 0.8, -L * 0.04], [nacR, -L * 0.035], [nacR, L * 0.03], [nacR * 0.6, L * 0.05]], [ex, 0, cz - fr * 0.95], 1, 28); } void ey;
    if (nacR) { en.pos.length = en.pos.length; }
  }
  // engines as lathes about the X axis
  if (!small) for (const sd of [-1, 1]) for (const t of [0.36, 0.62]) { const ex = L * 0.4 + L * 0.18 * t * 0.9 - L * 0.04, ez = cz - fr * 0.95 - W * 0.012 * t, r = W * 0.026; en.grid(8, 24, (i, j) => { const a = (2 * Math.PI * j) / 24, u = i / 8, rr = r * (0.82 + 0.18 * Math.sin(u * Math.PI)); return [ex + u * L * 0.075, ys(sd, t) + rr * Math.cos(a), ez + rr * Math.sin(a)]; }); }
  else for (const sd of [-1, 1]) { const r = fr * 0.7; en.grid(8, 20, (i, j) => { const a = (2 * Math.PI * j) / 20, u = i / 8, rr = r * (0.7 + 0.3 * Math.sin(u * Math.PI)); return [L * 0.55 + u * L * 0.1, sd * (fr + W * 0.1) + rr * Math.cos(a), cz - fr * 0.3 + rr * Math.sin(a)]; }); }
  // vertical tail fin
  cs.grid(4, 2, (i, j) => { const t = i / 4; return [L * 0.84 + t * L * 0.12 + j * L * 0.07 * (1 - t * 0.7), (j - 1) * 6, cz + fr * 0.6 + t * H * 0.42]; });
  for (let k = 0; k < (small ? 8 : 34); k++) for (const sd of [-1, 1]) rbox(wd, [L * (0.16 + k * (small ? 0.03 : 0.0195)), sd * fr * 0.985, cz + fr * 0.28], [L * 0.004, 6, fr * 0.07], 3, 0, 4, 6);
  rbox(wd, [L * 0.04, 0, cz + fr * 0.3], [L * 0.012, fr * 0.5, fr * 0.2], 3, 0, 4, 8);
  const gs = small ? 0.3 : 1; for (const x of [L * 0.15, L * 0.52]) { tube(gear, [x, 0, cz - fr * 0.6], [x, 0, 480 * gs], 60 * gs, 6); for (const sd of x > L * 0.4 ? [-1, 1] : [0]) wheel(out, [x, sd * 450 * gs, 480 * gs], 1, { rw: 480 * gs, tw: 260 * gs, solid: true, sw: 0.3 }, `g${x}${sd}`); }
  out.push(fu.part, cs.part, wn.part, en.part, wd.part, gear.part, tyre.part);
  return out;
}
function helicopter(p: P, paint: V3): VPart[] {
  const L = p.L ?? 14000, H = p.H ?? 4000, W = p.W ?? 2800, out: VPart[] = [], bd = new B('Fuselage', 'paint', paint), gl = new B('Canopy glass', 'glass'), tb = new B('Tail boom', 'paint', paint), rt = new B('Rotor blades', 'black', DARK), met = new B('Skids and mast', 'metal'), lt = new B('Lights', 'tail');
  const cz = 1500;
  rbox(bd, [L * 0.22, 0, cz], [L * 0.17, W * 0.42, 750], 2.4, 0, 14, 24); rbox(gl, [L * 0.1, 0, cz + 120], [L * 0.09, W * 0.4, 560], 2.4, 0, 12, 20);
  tube(tb, [L * 0.34, 0, cz + 250], [L * 0.92, 0, cz + 450], 220, 14, 70); rbox(tb, [L * 0.95, 0, cz + 1000], [160, 40, 560], 3, 0.25, 6, 10); rbox(tb, [L * 0.93, 0, cz + 480], [180, 500, 30], 3, 0, 4, 10);
  tube(met, [L * 0.22, 0, cz + 700], [L * 0.22, 0, cz + 1250], 70, 10);
  for (const a of [0, 1, 2, 3]) { const an = (a * Math.PI) / 2 + 0.4; tube(rt, [L * 0.22, 0, cz + 1250], [L * 0.22 + Math.cos(an) * L * 0.42, Math.sin(an) * L * 0.42, cz + 1250], 80, 6, 26); }
  for (const sd of [-1, 1]) { tube(met, [L * 0.05, sd * W * 0.36, 160], [L * 0.38, sd * W * 0.36, 160], 40, 8); tube(met, [L * 0.12, sd * W * 0.3, 180], [L * 0.14, sd * W * 0.28, cz - 500], 35, 6); tube(met, [L * 0.3, sd * W * 0.3, 180], [L * 0.3, sd * W * 0.28, cz - 500], 35, 6); }
  tube(rt, [L * 0.96, 120, cz + 800], [L * 0.96, 120, cz + 1500], 60, 6, 16); rbox(lt, [L * 0.97, 0, cz + 1550], [40, 40, 40], 2, 0, 4, 6);
  out.push(bd.part, gl.part, tb.part, rt.part, met.part, lt.part); return out;
}

// ---- ships and boats ----
function hull(m: B, L: number, W: number, depth: number, draft: number, bowF = 0.18, sternF = 0.08, flare = 0.0, col?: (z: number) => V3 | undefined) {
  const n = 56; m.grid(n, 28, (i, j) => {
    const t = i / n, x = L * t; let k = 1; if (t < bowF) k = Math.pow(Math.sin((t / bowF) * Math.PI / 2), 1.0); if (t > 1 - sternF) k = Math.pow(1 - ((t - (1 - sternF)) / sternF) * 0.5, 0.7);
    const a = (Math.PI * j) / 28, hw = (W / 2) * k, y = hw * Math.cos(a) * (1 + flare * Math.sin(a)), z = -draft * Math.pow(Math.sin(a), 0.8) * (t < bowF ? 0.7 + 0.3 * k : 1) + (j === 0 || j === 28 ? depth - draft : 0);
    return [x, y, depth - draft + Math.min(0, z) * 1 + (j > 0 && j < 28 ? 0 : 0) + Math.max(0, 0)];
  }, col ? (i, j, p) => col(p[2]) : undefined);
}
function ship(p: P, paint: V3, variant: string): VPart[] {
  const L = p.L ?? 100000, W = p.W ?? 20000, H = p.H ?? 20000, out: VPart[] = [], hullc = variant === 'cruise' ? C('#f3f5f7') : variant === 'tanker' ? C('#3b4a5a') : variant === 'cargo' ? C('#a3281f') : variant === 'fishing' ? C('#2c5aa0') : C('#f3f5f7');
  const wl = H * 0.2, hl = new B('Hull', 'paint', hullc), wt = new B('Waterline paint', 'paint', C('#9b1c1c')), up = new B('Superstructure', 'paint', C('#f3f5f7')), wd = new B('Windows', 'glass'), fn = new B('Funnel', 'paint', paint), ct = new B('Deck cargo', 'paint', paint), dk = new B('Deck', 'wood');
  // hull is built as a flat-bottomed half-ellipse section lofted along its length; the underwater part is painted red
  const draft = wl, topZ = H * 0.28;
  hl.grid(56, 24, (i, j) => { const t = i / 56, x = L * t, bowF = 0.2, k = t < bowF ? Math.pow(Math.sin((t / bowF) * Math.PI / 2), 0.9) : t > 0.94 ? 1 - (t - 0.94) * 4 : 1, a = (Math.PI * j) / 24; return [x, (W / 2) * k * Math.cos(a) * (1 + 0.04 * (1 - Math.sin(a))), topZ - (topZ + 0) * Math.pow(Math.sin(a), 1.4) * 0.0 - (H * 0.26) * Math.pow(Math.sin(a), 1.6) + H * 0.04]; }, (i, j, q) => (q[2] < wl * 0.55 ? C('#8e1b1b') : undefined));
  rbox(dk, [L / 2, 0, topZ + H * 0.04 + 40], [L * 0.47, W * 0.48, 40], 12, 0, 4, 20);
  if (variant === 'cruise') {
    for (let d = 0; d < 10; d++) { const len = L * (0.7 - d * 0.03), zc = topZ + H * 0.04 + 180 + d * 330; rbox(up, [L * 0.5, 0, zc], [len / 2, W * 0.4 - d * 70, 160], 10, 0, 4, 20); for (const sd of [-1, 1]) rbox(wd, [L * 0.5, sd * (W * 0.4 - d * 70 + 8), zc], [len / 2 - 600, 6, 60], 10, 0, 3, 20); }
    rbox(up, [L * 0.4, 0, topZ + H * 0.04 + 180 + 10 * 330 + 80], [L * 0.1, W * 0.22, 120], 8, 0, 4, 12);
    for (const x of [L * 0.55, L * 0.62]) rbox(fn, [x, 0, topZ + H * 0.04 + 180 + 10 * 330 + 420], [L * 0.025, W * 0.08, 420], 3, 0, 8, 14);
  } else if (variant === 'tanker' || variant === 'cargo') {
    rbox(up, [L * 0.86, 0, topZ + H * 0.04 + 1300], [L * 0.05, W * 0.38, 1250], 8, 0, 6, 14); for (const sd of [-1, 1]) rbox(wd, [L * 0.86 - L * 0.05 + 6, sd * W * 0.2, topZ + H * 0.04 + 1900], [6, W * 0.1, 160], 6, 0, 4, 8);
    rbox(fn, [L * 0.88, 0, topZ + H * 0.04 + 2900], [L * 0.012, W * 0.08, 400], 3, 0, 6, 12);
    if (variant === 'tanker') { const tp = new B('Pipework', 'metal'); tube(tp, [L * 0.18, 0, topZ + H * 0.04 + 260], [L * 0.78, 0, topZ + H * 0.04 + 260], 160, 8); for (let k = 0; k < 10; k++) rbox(tp, [L * 0.2 + k * L * 0.06, 0, topZ + H * 0.04 + 150], [L * 0.014, W * 0.2, 90], 3, 0, 4, 10); out.push(tp.part); }
    else { const cols = ['#c0392b', '#2471a3', '#e67e22', '#27ae60', '#f1c40f', '#8e44ad']; for (let r = 0; r < 4; r++) for (let k = 0; k < 7; k++) for (let h = 0; h < 3; h++) { const m = new B('Container', 'paint', C(cols[(r * 3 + k + h * 5) % cols.length])); rbox(m, [L * 0.18 + k * L * 0.085, (r - 1.5) * W * 0.21, topZ + H * 0.04 + 150 + h * 270], [L * 0.04, W * 0.095, 125], 12, 0, 3, 8); out.push(m.part); } }
  } else if (variant === 'fishing') {
    rbox(up, [L * 0.4, 0, topZ + H * 0.04 + 700], [L * 0.14, W * 0.32, 600], 8, 0, 6, 12); for (const sd of [-1, 1]) rbox(wd, [L * 0.4, sd * (W * 0.32 + 6), topZ + H * 0.04 + 800], [L * 0.12, 6, 150], 6, 0, 4, 8); rbox(wd, [L * 0.4 - L * 0.14, 0, topZ + H * 0.04 + 800], [6, W * 0.28, 150], 6, 0, 4, 8);
    const mt = new B('Mast and gear', 'metal'); tube(mt, [L * 0.62, 0, topZ + H * 0.04], [L * 0.62, 0, topZ + H * 0.04 + 3800], 100, 8); tube(mt, [L * 0.62, 0, topZ + H * 0.04 + 3200], [L * 0.85, 0, topZ + H * 0.04 + 600], 40, 6); tube(mt, [L * 0.62, -W * 0.3, topZ + H * 0.04 + 1500], [L * 0.62, W * 0.3, topZ + H * 0.04 + 1500], 40, 6); out.push(mt.part);
  } else if (variant === 'yacht') {
    rbox(up, [L * 0.5, 0, topZ + H * 0.04 + 400], [L * 0.28, W * 0.36, 330], 5, 0, 8, 14); rbox(up, [L * 0.44, 0, topZ + H * 0.04 + 900], [L * 0.17, W * 0.3, 240], 5, 0, 8, 14); rbox(up, [L * 0.42, 0, topZ + H * 0.04 + 1300], [L * 0.1, W * 0.24, 140], 5, 0, 8, 12);
    for (const sd of [-1, 1]) { rbox(wd, [L * 0.5, sd * (W * 0.36 + 6), topZ + H * 0.04 + 450], [L * 0.25, 6, 110], 6, 0, 4, 10); rbox(wd, [L * 0.44, sd * (W * 0.3 + 6), topZ + H * 0.04 + 950], [L * 0.15, 6, 90], 6, 0, 4, 10); }
    const mt = new B('Radar mast', 'chrome'); tube(mt, [L * 0.42, 0, topZ + H * 0.04 + 1400], [L * 0.42, 0, topZ + H * 0.04 + 2300], 40, 6); out.push(mt.part);
  } else if (variant === 'speedboat') {
    rbox(up, [L * 0.52, 0, topZ + H * 0.04 + 200], [L * 0.22, W * 0.3, 160], 5, 0, 8, 14); rbox(wd, [L * 0.4, 0, topZ + H * 0.04 + 520], [L * 0.07, W * 0.26, 200], 3, 0.6, 6, 12);
    const sm = new B('Seats', 'seat'); rbox(sm, [L * 0.62, 0, topZ + H * 0.04 + 330], [L * 0.08, W * 0.22, 130], 4, 0, 6, 10); out.push(sm.part);
  }
  out.push(hl.part, wt.part, up.part, wd.part, fn.part, ct.part, dk.part);
  return out;
}
function sailboat(p: P, paint: V3): VPart[] {
  const L = p.L ?? 9000, W = p.W ?? 3000, H = p.H ?? 14000, out = ship({ L, W, H: 3600 }, paint, 'speedboat').filter(q => !['Seats', 'Windows'].includes(q.name)), mt = new B('Mast and boom', 'metal'), sl = new B('Sails', 'white'), cab = new B('Cabin', 'paint', C('#f3f5f7'));
  const top = 3600 * 0.32 + 144;
  rbox(cab, [L * 0.5, 0, top + 250], [L * 0.2, W * 0.3, 220], 5, 0, 8, 12);
  tube(mt, [L * 0.45, 0, top], [L * 0.45, 0, H], 60, 8); tube(mt, [L * 0.45, 0, top + 700], [L * 0.9, 0, top + 700], 45, 8);
  sl.grid(6, 6, (i, j) => { const u = i / 6, v = j / 6, x = L * 0.45 + (L * 0.43) * (1 - u) * v + 20, z = lerp(top + 800, H - 100, u) * (1 - v * 0.0) - (1 - u) * 0; return [x, 0 + Math.sin(v * Math.PI) * 180 * (1 - u * 0.4), z - v * (z - (top + 800)) * (1 - u)]; });
  sl.grid(6, 6, (i, j) => { const u = i / 6, v = j / 6; return [L * 0.45 - v * L * 0.35 * (1 - u) - 20, Math.sin(v * Math.PI) * 160, lerp(top + 200, H - 200, u) * (1 - 0) - v * 0]; });
  out.push(mt.part, sl.part, cab.part); return out;
}
function submarine(p: P, paint: V3, mini: boolean): VPart[] {
  const L = p.L ?? 56000, W = p.W ?? 7000, H = p.H ?? 11000, out: VPart[] = [], hl = new B('Pressure hull', 'paint', paint), sl = new B('Sail and fins', 'paint', paint), pr = new B('Propeller', 'chrome'), gl = new B('Viewport', 'glass');
  const r = W / 2, cz = H * 0.45;
  fuselage(hl, 0, L, () => r, cz, 0.16, 0.24);
  rbox(sl, [L * 0.36, 0, cz + r + H * 0.12], [L * 0.07, r * 0.28, H * 0.14], 3, 0, 8, 12);
  for (const sd of [-1, 1]) { rbox(sl, [L * 0.38, sd * r * 0.95, cz + r * 0.95], [L * 0.03, r * 0.28, 60], 3, 0, 4, 8); rbox(sl, [L * 0.93, sd * r * 0.7, cz], [L * 0.03, r * 0.5, 50], 3, 0, 4, 8); rbox(sl, [L * 0.93, 0, cz + sd * r * 0.7], [L * 0.03, 50, r * 0.5], 3, 0, 4, 8); }
  if (mini) rbox(gl, [L * 0.06, 0, cz + r * 0.2], [L * 0.06, r * 0.55, r * 0.5], 2.4, 0, 8, 14);
  for (let k = 0; k < 5; k++) { const a = (k * 2 * Math.PI) / 5; tube(pr, [L + 100, 0, cz], [L + 160, Math.cos(a) * r * 0.55, cz + Math.sin(a) * r * 0.55], 60, 6, 30); }
  out.push(hl.part, sl.part, pr.part, gl.part); return out;
}
function jetski(p: P, paint: V3): VPart[] {
  const L = p.L ?? 3300, W = p.W ?? 1200, H = p.H ?? 1100, out: VPart[] = [], hl = new B('Hull', 'paint', paint), st = new B('Seat', 'seat'), hb = new B('Handlebar', 'black', DARK), gl = new B('Windshield', 'glass'), wh = new B('Hull base', 'white');
  rbox(hl, [L * 0.5, 0, 380], [L * 0.5, W * 0.5, 250], 2.6, 0, 12, 22); rbox(wh, [L * 0.5, 0, 220], [L * 0.46, W * 0.42, 90], 3, 0, 8, 16); rbox(st, [L * 0.62, 0, 700], [L * 0.2, W * 0.14, 110], 3.4, 0, 8, 12); rbox(hl, [L * 0.3, 0, 640], [L * 0.1, W * 0.22, 150], 3, 0.3, 8, 12); rbox(gl, [L * 0.22, 0, 760], [L * 0.05, W * 0.2, 130], 3, 0.8, 6, 10); tube(hb, [L * 0.3, -W * 0.22, 800], [L * 0.3, W * 0.22, 800], 18, 8);
  out.push(hl.part, wh.part, st.part, hb.part, gl.part); return out;
}

function conveyor(p: P, paint: V3, tracked: boolean): VPart[] {
  const L = p.L ?? 30000, W = p.W ?? 3000, H = p.H ?? 9000, out: VPart[] = [], belt = new B('Conveyor belt', 'rubber'), fr = new B('Gantry', 'paint', paint), sup = new B('Supports', 'metal'), rl = new B('Rollers', 'metal');
  const a: V3 = [L * 0.05, 0, 1400], b: V3 = [L * 0.95, 0, H * 0.9];
  for (const sd of [-1, 1]) { tube(fr, [a[0], sd * W * 0.22, a[2]], [b[0], sd * W * 0.22, b[2]], 140, 8); }
  for (let k = 0; k <= 10; k++) { const t = k / 10, x = lerp(a[0], b[0], t), z = lerp(a[2], b[2], t); tube(fr, [x, -W * 0.22, z], [x, W * 0.22, z], 50, 6); rbox(rl, [x, 0, z + 150], [60, W * 0.2, 55], 3, 0, 4, 8); }
  rbox(belt, [(a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2 + 240], [Math.hypot(b[0] - a[0], b[2] - a[2]) / 2, W * 0.2, 30], 8, Math.atan2(b[2] - a[2], b[0] - a[0]) * -1 * 0 - Math.atan2(b[2] - a[2], b[0] - a[0]), 4, 12);
  for (const t of [0.3, 0.6, 0.95]) { const x = lerp(a[0], b[0], t), z = lerp(a[2], b[2], t); for (const sd of [-1, 1]) tube(sup, [x, sd * W * 0.22, z], [x - 400, sd * W * 0.3, 0], 90, 8); }
  out.push(belt.part, fr.part, sup.part, rl.part);
  if (tracked) { tracks(out, L * 0.1, W * 0.34, 5000, 900, 700); rbox(fr, [L * 0.1, 0, 1300], [2200, W * 0.3, 350], 4, 0, 6, 10); out.push(fr.part); }
  return out;
}

// ---- trains ----
function train(p: P, paint: V3, variant: string): VPart[] {
  const L = p.L ?? 120000, W = p.W ?? 3000, H = p.H ?? 4100, n = Math.max(2, Math.round(p.cars ?? 4)), cl = L / n, out: VPart[] = [], body = new B('Carriage bodies', 'paint', C('#eef0f2')), st = new B('Livery', 'paint', paint), gl = new B('Windows', 'glass'), rf = new B('Roof equipment', 'metal'), bg = new B('Bogies', 'metal'), nose = new B('Nose cone', 'paint', C('#eef0f2')), lamp = new B('Headlamps', 'lamp'), pan = new B('Pantograph', 'black', DARK);
  const zc = 1000 + (H - 1000) / 2 - 150, hh = (H - 1000) / 2;
  for (let k = 0; k < n; k++) {
    const x0 = k * cl + 150, x1 = (k + 1) * cl - 150, xm = (x0 + x1) / 2; rbox(body, [xm, 0, zc], [(x1 - x0) / 2, W / 2, hh], 6, 0, 8, 22);
    rbox(st, [xm, 0, zc - hh * 0.55], [(x1 - x0) / 2 + 2, W / 2 + 2, hh * 0.28], 6, 0, 3, 22);
    for (const sd of [-1, 1]) for (let w = 0; w < Math.floor((x1 - x0) / 2600); w++) rbox(gl, [x0 + 1300 + w * 2600, sd * (W / 2 + 4), zc + hh * 0.2], [850, 5, hh * 0.28], 6, 0, 3, 8);
    for (const b of [x0 + cl * 0.14, x1 - cl * 0.14]) for (const sd of [-1, 1]) { rbox(bg, [b, 0, 620], [1300, W * 0.34, 90], 4, 0, 4, 8); for (const dx of [-900, 900]) wheel(out, [b + dx, sd * W * 0.26, 460], sd, { rw: 460, tw: 130, solid: true, sw: 0.3 }, `b${b}${dx}${sd}`); }
    if (variant !== 'tram' && k % 2 === 0) rbox(rf, [xm, 0, H + 60], [cl * 0.2, W * 0.2, 60], 4, 0, 4, 10);
    if (k % 2 === 0) { tube(pan, [xm - 600, 0, H], [xm, 0, H + 700], 40, 6); tube(pan, [xm, 0, H + 700], [xm + 600, 0, H], 40, 6); rbox(pan, [xm, 0, H + 720], [400, 900, 30], 4, 0, 3, 8); }
  }
  for (const e of [0, 1]) { const sx = e ? L - 150 : 150, dir = e ? 1 : -1; nose.grid(10, 20, (i, j) => { const t = i / 10, a = (2 * Math.PI * j) / 20, k = Math.pow(1 - t, 0.55); return [sx + dir * t * 3800 * (variant === 'tram' ? 0.2 : 1), W / 2 * k * Math.cos(a), zc - hh * 0.1 * t + hh * k * Math.sin(a) * (1 - 0.35 * t)]; }); rbox(lamp, [sx + dir * 2500 * (variant === 'tram' ? 0.1 : 1), 0, zc - hh * 0.35], [60, W * 0.2, 60], 3, 0, 4, 8); rbox(gl, [sx + dir * 1600 * (variant === 'tram' ? 0.1 : 1), 0, zc + hh * 0.5], [100, W * 0.3, hh * 0.3], 3, 0, 4, 8); }
  out.push(body.part, st.part, gl.part, rf.part, bg.part, nose.part, lamp.part, pan.part); return out;
}

// ---- two-wheelers, personal and leisure ----
function scooter(p: P, paint: V3): VPart[] {
  const wb = p.wb ?? 1280, rw = p.rw ?? 250, tw = p.tw ?? 110, out: VPart[] = [], bd = new B('Body panels', 'paint', paint), st = new B('Seat', 'seat'), hb = new B('Handlebar', 'black', DARK), lamp = new B('Headlamp', 'lamp'), gl = new B('Screen', 'glass'), fk = new B('Fork', 'chrome');
  rbox(bd, [wb * 0.55, 0, rw * 1.55], [wb * 0.28, 190, rw * 1.2], 2.6, 0, 12, 20); rbox(bd, [wb * 0.18, 0, rw * 2.6], [wb * 0.1, 190, rw * 1.3], 2.6, 0.1, 10, 16); rbox(bd, [wb * 0.35, 0, rw * 0.7], [wb * 0.3, 160, 60], 4, 0, 6, 12);
  rbox(st, [wb * 0.65, 0, rw * 2.9], [wb * 0.16, 150, 60], 3.4, 0, 8, 12); rbox(lamp, [wb * 0.12, 0, rw * 3.2], [40, 80, 70], 2.4, 0, 6, 10);
  for (const sd of [-1, 1]) tube(fk, [0, sd * 70, rw], [wb * 0.11, sd * 70, rw * 3.4], 14, 8); tube(hb, [wb * 0.11, -330, rw * 3.5], [wb * 0.11, 330, rw * 3.5], 14, 8); rbox(gl, [wb * 0.1, 0, rw * 4.1], [20, 160, 110], 3, 0.3, 6, 10);
  out.push(bd.part, st.part, hb.part, lamp.part, gl.part, fk.part);
  for (const [x, t] of [[0, tw], [wb, tw + 20]] as [number, number][]) wheel(out, [x, 0, rw], 1, { rw, tw: t, spokes: 5, sw: 0.7, thin: true }, `${x}`);
  return out;
}
function trike(p: P, paint: V3, cargo: boolean): VPart[] {
  const wb = p.wb ?? 1400, rw = p.rw ?? 300, out: VPart[] = [], fr = new B('Frame', 'paint', paint), bits = new B('Saddle and grips', 'black', DARK), met = new B('Bars', 'chrome'), bx = new B('Cargo box', 'wood');
  const bb: V3 = [wb * 0.5, 0, rw * 0.9]; tube(fr, [wb * 0.08, 0, rw + 250], bb, 24, 8); tube(fr, bb, [wb * 0.6, 0, rw + 520], 24, 8); tube(fr, [wb * 0.08, 0, rw + 250], [wb * 0.1, 0, rw + 420], 24, 8); tube(fr, bb, [wb, 0, rw], 18, 8);
  tube(met, [wb * 0.1, 0, rw + 420], [wb * 0.1, 0, rw + 520], 14, 6); tube(met, [wb * 0.1, -230, rw + 540], [wb * 0.1, 230, rw + 540], 12, 6); rbox(bits, [wb * 0.62, 0, rw + 570], [130, 70, 25], 3, 0, 6, 8);
  tube(fr, [wb, -380, rw], [wb, 380, rw], 18, 8); if (cargo) { rbox(bx, [wb + 450, 0, rw + 350], [450, 380, 220], 6, 0, 6, 10); for (const sd of [-1, 1]) tube(fr, [wb, sd * 380, rw], [wb + 800, sd * 380, rw], 18, 6); } else rbox(bits, [wb + 200, 0, rw + 330], [180, 280, 40], 4, 0, 6, 8);
  out.push(fr.part, bits.part, met.part, bx.part);
  wheel(out, [0, 0, rw], 1, { rw, tw: 40, thin: true, spokes: 0, sw: 1 }, 'front'); for (const sd of [-1, 1]) wheel(out, [wb, sd * 380, rw], 1, { rw, tw: 40, thin: true, spokes: 0, sw: 1 }, `rear${sd}`); return out;
}
function segway(p: P, paint: V3): VPart[] {
  const out: VPart[] = [], rw = 170, fr = new B('Deck and stem', 'paint', paint), bits = new B('Grips', 'black', DARK), dk = new B('Deck', 'black', DARK);
  rbox(dk, [600, 0, 280], [350, 80, 30], 4, 0, 6, 10); tube(fr, [250, 0, 280], [150, 0, 1150], 22, 8); tube(bits, [150, -230, 1170], [150, 230, 1170], 14, 8);
  const lt = new B('Light', 'lamp'); rbox(lt, [110, 0, 1000], [20, 50, 30], 3, 0, 4, 6);
  out.push(fr.part, bits.part, dk.part, lt.part); wheel(out, [0, 0, rw], 1, { rw, tw: 80, thin: true, spokes: 5, sw: 0.7 }, 'front'); wheel(out, [1000, 0, rw], 1, { rw, tw: 80, thin: true, spokes: 5, sw: 0.7 }, 'rear'); return out;
}
function hoverboard(p: P, paint: V3): VPart[] {
  const out: VPart[] = [], rw = 85, bd = new B('Body', 'paint', paint), pad = new B('Foot pads', 'black', DARK);
  rbox(bd, [350, 0, rw + 40], [170, 110, 50], 3, 0, 8, 14); rbox(bd, [350 - 280, 0, rw + 40], [180, 110, 50], 3, 0, 8, 14); for (const sd of [-1, 1]) rbox(pad, [350 + sd * 230, 0, rw + 100], [130, 90, 15], 4, 0, 4, 8);
  out.push(bd.part, pad.part); for (const sd of [-1, 1]) wheel(out, [350, sd * 230, rw], sd, { rw, tw: 60, solid: true, sw: 0.4 }, `${sd}`); return out;
}
function drone(p: P, paint: V3): VPart[] {
  const out: VPart[] = [], bd = new B('Body', 'paint', paint), arm = new B('Arms', 'black', DARK), rt = new B('Propellers', 'black', DARK), cam = new B('Camera gimbal', 'black', DARK), gl = new B('Lens', 'glass'), lg = new B('Landing legs', 'metal');
  rbox(bd, [200, 0, 220], [130, 90, 55], 2.6, 0, 10, 16); rbox(cam, [330, 0, 150], [45, 45, 45], 2.2, 0, 8, 12); rbox(gl, [370, 0, 150], [10, 25, 25], 2.2, 0, 6, 8);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const ax = 200 + sx * 230, ay = sy * 230; tube(arm, [200, 0, 220], [ax, ay, 240], 18, 8); rbox(arm, [ax, ay, 260], [30, 30, 30], 3, 0, 6, 8); for (const a of [0, 1]) { const an = a * Math.PI + (sx * sy > 0 ? 0.6 : -0.6); tube(rt, [ax + Math.cos(an) * 150, ay + Math.sin(an) * 150, 300], [ax - Math.cos(an) * 150, ay - Math.sin(an) * 150, 300], 7, 5, 3); } tube(lg, [ax, ay * 0.6, 220], [ax + sx * 20, ay * 0.9, 20], 6, 5); }
  out.push(bd.part, arm.part, rt.part, cam.part, gl.part, lg.part); return out;
}
function balloon(p: P, paint: V3): VPart[] {
  const H = p.H ?? 22000, W = p.W ?? 15000, out: VPart[] = [], env = new B('Envelope', 'paint', paint), bk = new B('Basket', 'wood'), bn = new B('Burner and ropes', 'metal'), st = new B('Stripes', 'paint', C('#f4f1e8'));
  const cz = H * 0.62; env.grid(24, 36, (i, j) => { const t = i / 24, a = (2 * Math.PI * j) / 36, ph = -Math.PI * 0.5 * 0.9 + t * Math.PI * 0.9 * 1 + Math.PI * 0.05, r = (W / 2) * Math.cos(ph) * (ph < -0.9 ? 0.7 : 1); return [r * Math.cos(a), r * Math.sin(a), cz + (W / 2) * 1.15 * Math.sin(ph)]; }, (i, j) => (j % 6 < 3 ? undefined : C('#f3ead7')));
  rbox(bk, [0, 0, 600], [650, 650, 500], 8, 0, 6, 10); for (const a of [0, 1, 2, 3]) { const an = a * Math.PI / 2 + 0.78; tube(bn, [Math.cos(an) * 640, Math.sin(an) * 640, 1100], [Math.cos(an) * W * 0.3, Math.sin(an) * W * 0.3, cz - W * 0.4], 12, 5); }
  rbox(bn, [0, 0, 2200], [260, 260, 300], 3, 0, 6, 10); out.push(env.part, bk.part, bn.part, st.part); return out;
}
function rvvan(p: P, paint: V3, kind: string): VPart[] {
  const L = p.L ?? 6200, W = p.W ?? 2150, H = p.H ?? 2900, out: VPart[] = [], rw = 340, tw = 235, fo = L * 0.2, wb = L * 0.58, body = new B('Living body', 'paint', C('#f1f3f5')), cab = new B('Cab', 'paint', paint), gl = new B('Windows', 'glass'), ch = new B('Chassis', 'metal'), lamp = new B('Headlamps', 'lamp'), tail = new B('Tail lamps', 'tail'), st = new B('Livery stripe', 'paint', paint);
  const bx0 = kind === 'caravan' ? 0 : L * 0.27;
  rbox(body, [(bx0 + L) / 2, 0, 400 + (H - 400) / 2 + 60], [(L - bx0) / 2, W / 2, (H - 400) / 2 - 20], 10, 0, 8, 22); rbox(ch, [L / 2, 0, 330], [L / 2 - 100, W * 0.38, 70], 4, 0, 4, 8);
  rbox(st, [(bx0 + L) / 2, 0, 1150], [(L - bx0) / 2 + 2, W / 2 + 2, 90], 10, 0, 3, 22);
  for (const sd of [-1, 1]) { for (let k = 0; k < 3; k++) rbox(gl, [bx0 + (L - bx0) * (0.22 + k * 0.28), sd * (W / 2 + 4), 1750], [380, 5, 280], 6, 0, 3, 8); rbox(tail, [L - 10, sd * (W / 2 - 130), 900], [10, 40, 120], 3, 0, 4, 8); }
  if (kind !== 'caravan') { rbox(cab, [L * 0.12, 0, 1000], [L * 0.12, W / 2 - 15, 700], 5, 0.0, 10, 20); rbox(gl, [L * 0.025, 0, 1350], [8, W * 0.4, 330], 6, -0.35, 4, 10); for (const sd of [-1, 1]) { rbox(gl, [L * 0.14, sd * (W / 2 - 14), 1350], [L * 0.06, 6, 300], 6, 0, 4, 8); rbox(lamp, [30, sd * W * 0.37, 700], [24, 130, 55], 3, 0, 6, 10); } }
  out.push(body.part, cab.part, gl.part, ch.part, lamp.part, tail.part, st.part);
  const axles = kind === 'caravan' ? [L * 0.5] : [fo, fo + wb];
  for (const ax of axles) for (const sd of [-1, 1]) wheel(out, [ax, sd * (W / 2 - tw / 2 - 20), rw], sd, { rw, tw, spokes: 5, sw: 0.5 }, `${ax}${sd}`);
  if (kind === 'caravan') { const dr = new B('Drawbar', 'metal'); tube(dr, [0, -220, 450], [-1300, 0, 520], 30, 8); tube(dr, [0, 220, 450], [-1300, 0, 520], 30, 8); out.push(dr.part); }
  return out;
}
function coachBus(p: P, paint: V3, variant: string): VPart[] {
  const out = bus(p, paint), L = p.L ?? 12000, W = p.W ?? 2550, H = p.H ?? 3250;
  if (variant === 'double') { const up = new B('Upper deck windows', 'glass'), fr = new B('Upper window frames', 'black', DARK); for (const sd of [-1, 1]) for (let k = 0; k < 9; k++) { const cx = 900 + k * 1200; rbox(fr, [cx, sd * (W / 2 + 3), H * 0.78], [560, 5, 380], 8, 0, 3, 8); rbox(up, [cx, sd * (W / 2 + 8), H * 0.78], [520, 4, 340], 8, 0, 3, 8); } out.push(fr.part, up.part); }
  if (variant === 'coach') { const gl = new B('Panoramic glass', 'glass'); for (const sd of [-1, 1]) rbox(gl, [L * 0.52, sd * (W / 2 + 9), (p.wz ?? 1450) + 480], [L * 0.38, 4, 520], 8, 0, 3, 16); out.push(gl.part); }
  void L; return out;
}

export function buildExtra(spec: VSpec, p: P, paint: V3): VPart[] | null {
  const v = spec.variant ?? '';
  switch (spec.kind) {
    case 'excavator': return excavator(p, paint);
    case 'bulldozer': return bulldozer(p, paint);
    case 'loader': return loader(p, paint);
    case 'roller': return roller(p, paint);
    case 'forklift': return forklift(p, paint);
    case 'dumper': return dumper(p, paint, v === 'mining');
    case 'mixer': return mixer(p, paint);
    case 'crane': return craneTruck(p, paint);
    case 'snow': return snowPlough(p, paint);
    case 'fire': return fireEngine(p, paint);
    case 'tow': return towTruck(p, paint);
    case 'semi': return semi(p, paint);
    case 'combine': return combine(p, paint);
    case 'sprayer': return sprayer(p, paint);
    case 'seeder': return seeder(p, paint);
    case 'baler': return baler(p, paint);
    case 'airliner': return airliner(p, paint, false);
    case 'plane': return airliner(p, paint, true);
    case 'helicopter': return helicopter(p, paint);
    case 'ship': {
      const vv = v || 'cargo', L = p.L ?? 100000;
      if (!['cruise', 'tanker', 'cargo'].includes(vv)) return ship(p, paint, vv);
      const k = L / 30000, parts = ship({ ...p, L: 30000, W: (p.W ?? 20000) / k, H: (p.H ?? 20000) / k }, paint, vv);
      for (const q of parts) for (let i = 0; i < q.pos.length; i++) q.pos[i] *= k;
      return parts;
    }
    case 'conveyor': return conveyor(p, paint, v === 'stacker');
    case 'sailboat': return sailboat(p, paint);
    case 'submarine': return submarine(p, paint, v === 'mini');
    case 'jetski': return jetski(p, paint);
    case 'train': return train(p, paint, v);
    case 'scooter': return scooter(p, paint);
    case 'trike': return trike(p, paint, v === 'cargo');
    case 'segway': return segway(p, paint);
    case 'hoverboard': return hoverboard(p, paint);
    case 'drone': return drone(p, paint);
    case 'balloon': return balloon(p, paint);
    case 'rv': return rvvan(p, paint, v || 'motorhome');
    case 'coach': return coachBus(p, paint, v);
    case 'moto2': return moto(p, paint);
    case 'bike2': return bike(p, paint);
    default: return null;
  }
  void pt; void clamp; void torus; void ribbon;
}
