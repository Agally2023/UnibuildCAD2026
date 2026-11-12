// Shaded software renderer for the realistic vehicle models: used for the template thumbnails and as the view when WebGL is not available.
// Painter's algorithm on a 2D canvas (web only); returns a PNG data URL, or '' where no canvas exists.
import { qRotate, type Q } from './orbit';
import type { VPart, VMat } from './vmodel';

const FILL: Record<VMat, string> = { paint: '#c9ccd1', glass: '#16222e', rubber: '#171717', rim: '#c8ccd2', chrome: '#e8eaec', black: '#18181a', lamp: '#fff3c4', tail: '#c0202a', blue: '#2a4cd0', interior: '#35302b', seat: '#463e35', metal: '#6a6e73', white: '#eceded', wood: '#8b6b45', caliper: '#c21c1c' };
const hex = (h: string): [number, number, number] => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

export function paintVehicleURL(parts: VPart[], q: Q, w: number, h: number, scale = 2, pad = 8): string {
  if (typeof document === 'undefined' || !parts.length) return '';
  type T = { z: number; a: number; b: number; c: number; col: string; part: number };
  const pts: number[][] = parts.map(p => { const o: number[] = []; for (let i = 0; i < p.pos.length; i += 3) { const r = qRotate(q, [p.pos[i], p.pos[i + 2], -p.pos[i + 1]]); o.push(r[0], -r[1], r[2]); } return o; });
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const o of pts) for (let i = 0; i < o.length; i += 3) { x0 = Math.min(x0, o[i]); x1 = Math.max(x1, o[i]); y0 = Math.min(y0, o[i + 1]); y1 = Math.max(y1, o[i + 1]); }
  const k = Math.min((w - 2 * pad) / Math.max(1e-9, x1 - x0), (h - 2 * pad) / Math.max(1e-9, y1 - y0)), ox = (w - k * (x1 + x0)) / 2, oy = (h - k * (y1 + y0)) / 2;
  const L: [number, number, number] = [-0.35, 0.75, 0.55], ll = Math.hypot(...L), tris: T[] = [];
  parts.forEach((p, pi) => {
    const o = pts[pi], base = hex(FILL[p.mat]), alpha = p.mat === 'glass' ? 0.8 : 1;
    for (let i = 0; i < p.idx.length; i += 3) {
      const a = p.idx[i] * 3, b = p.idx[i + 1] * 3, c = p.idx[i + 2] * 3;
      const ux = o[b] - o[a], uy = o[b + 1] - o[a + 1], uz = o[b + 2] - o[a + 2], vx = o[c] - o[a], vy = o[c + 1] - o[a + 1], vz = o[c + 2] - o[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      // screen y is flipped, so flip the normal's y for lighting
      const d = Math.max(0, (nx * L[0] + -ny * L[1] + nz * L[2]) / ll), sh = 0.38 + 0.72 * d + (p.mat === 'paint' || p.mat === 'chrome' || p.mat === 'rim' ? 0.35 * Math.pow(d, 12) : 0);
      let r = base[0], g = base[1], bl = base[2];
      if (p.col && p.mat !== 'glass') { const vc = (p.col[p.idx[i] * 3] + p.col[p.idx[i + 1] * 3] + p.col[p.idx[i + 2] * 3]) / 3, vg = (p.col[p.idx[i] * 3 + 1] + p.col[p.idx[i + 1] * 3 + 1] + p.col[p.idx[i + 2] * 3 + 1]) / 3, vb = (p.col[p.idx[i] * 3 + 2] + p.col[p.idx[i + 1] * 3 + 2] + p.col[p.idx[i + 2] * 3 + 2]) / 3; if (p.mat === 'paint') { r = vc * 255; g = vg * 255; bl = vb * 255; } }
      const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v * sh)));
      tris.push({ z: (o[a + 2] + o[b + 2] + o[c + 2]) / 3, a, b, c, col: `rgba(${cl(r)},${cl(g)},${cl(bl)},${alpha})`, part: pi });
    }
  });
  tris.sort((p, q2) => p.z - q2.z);
  const cv = document.createElement('canvas'); cv.width = w * scale; cv.height = h * scale; const cx = cv.getContext('2d'); if (!cx) return '';
  cx.scale(scale, scale);
  const gx = w / 2, gy = h * 0.5 + (y1 - y0) * k * 0.46; cx.fillStyle = 'rgba(0,0,0,0.16)'; cx.beginPath(); cx.ellipse(gx, Math.min(h - 4, gy), (x1 - x0) * k * 0.46, (x1 - x0) * k * 0.09, 0, 0, Math.PI * 2); cx.fill();
  for (const t of tris) {
    const o = pts[t.part]; cx.fillStyle = t.col; cx.strokeStyle = t.col; cx.lineWidth = 0.6;
    cx.beginPath(); cx.moveTo(o[t.a] * k + ox, o[t.a + 1] * k + oy); cx.lineTo(o[t.b] * k + ox, o[t.b + 1] * k + oy); cx.lineTo(o[t.c] * k + ox, o[t.c + 1] * k + oy); cx.closePath(); cx.fill(); cx.stroke();
  }
  return cv.toDataURL('image/png');
}
