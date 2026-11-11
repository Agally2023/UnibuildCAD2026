// Procedural surface textures drawn on a canvas: no image files. They are light, neutral patterns that are multiplied with the
// element's colour, so one brick texture serves red, brown and yellow brick alike. Web only (needs a canvas).
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import type { Tex } from './materials';

const S = 256, cache = new Map<Tex, Texture>();
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const g = (v: number, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a})`;
function grain(c: CanvasRenderingContext2D, amp: number, r: () => number) {
  const im = c.getImageData(0, 0, S, S), d = im.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * amp; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  c.putImageData(im, 0, 0);
}
function blotches(c: CanvasRenderingContext2D, n: number, lo: number, hi: number, r: () => number, size = 60) {
  for (let i = 0; i < n; i++) { const x = r() * S, y = r() * S, rad = 10 + r() * size, v = lo + r() * (hi - lo), gr = c.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, g(v, 0.35)); gr.addColorStop(1, g(v, 0)); c.fillStyle = gr; for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { c.save(); c.translate(ox, oy); c.fillRect(x - rad, y - rad, rad * 2, rad * 2); c.restore(); } }
}
function draw(kind: Tex): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = cv.height = S; const c = cv.getContext('2d')!, r = rng(kind.length * 977 + kind.charCodeAt(0));
  const fill = (v: number) => { c.fillStyle = g(v); c.fillRect(0, 0, S, S); };
  switch (kind) {
    case 'parquet': {
      fill(150); const cols = 6, rows = 18, w = S / cols, h = S / rows;
      for (let y = 0; y < rows; y++) { const off = (y % 3) * (w / 3); for (let x = -1; x < cols; x++) { const v = 200 + r() * 55; c.fillStyle = g(v); c.fillRect(x * w + off + 1, y * h + 1, w - 2, h - 2); for (let k = 0; k < 5; k++) { c.strokeStyle = g(120 + r() * 90, 0.16); c.lineWidth = 0.8; const yy = y * h + 2 + r() * (h - 4); c.beginPath(); c.moveTo(x * w + off + 2, yy); c.lineTo(x * w + off + w - 2, yy + (r() - 0.5) * 2); c.stroke(); } } }
      grain(c, 10, r); break;
    }
    case 'terrazzo': { fill(232); blotches(c, 18, 200, 255, r, 70); for (let i = 0; i < 420; i++) { c.fillStyle = g(70 + r() * 150, 0.95); c.beginPath(); const x = r() * S, y = r() * S, a = 1 + r() * 4.5; c.moveTo(x, y); c.lineTo(x + a, y + r() * a); c.lineTo(x + r() * a, y + a); c.lineTo(x - a * 0.3, y + a * 0.5); c.closePath(); c.fill(); } grain(c, 12, r); break; }
    case 'ceramic': { fill(110); const n = 4, w = S / n; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const v = 232 + r() * 23, gr = c.createLinearGradient(x * w, y * w, x * w + w, y * w + w); gr.addColorStop(0, g(v)); gr.addColorStop(1, g(v - 22)); c.fillStyle = gr; c.fillRect(x * w + 2.5, y * w + 2.5, w - 5, w - 5); } grain(c, 6, r); break; }
    case 'marble': { fill(244); blotches(c, 26, 215, 255, r, 90); for (let i = 0; i < 9; i++) { c.strokeStyle = g(70 + r() * 90, 0.35 + r() * 0.3); c.lineWidth = 0.6 + r() * 2; c.beginPath(); let x = r() * S, y = 0; c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 70; y += S / 6; c.bezierCurveTo(x - 20, y - 30, x + 20, y - 10, x, y); } c.stroke(); } grain(c, 6, r); break; }
    case 'epoxy': { fill(244); blotches(c, 22, 215, 255, r, 100); for (let i = 0; i < 160; i++) { c.fillStyle = g(r() < 0.5 ? 255 : 170, 0.5); c.fillRect(r() * S, r() * S, 1 + r() * 1.5, 1 + r() * 1.5); } grain(c, 5, r); break; }
    case 'granite': { fill(210); blotches(c, 20, 170, 245, r, 50); for (let i = 0; i < 1800; i++) { c.fillStyle = g(60 + r() * 195, 0.85); c.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2); } grain(c, 18, r); break; }
    case 'blockwork': { fill(150); const rows = 8, rh = S / rows, bw = S / 4; for (let y = 0; y < rows; y++) for (let x = -1; x < 4; x++) { const ox = (y % 2 ? bw / 2 : 0) + x * bw; c.fillStyle = g(205 + r() * 45); c.fillRect(ox + 2, y * rh + 2, bw - 4, rh - 4); } blotches(c, 24, 150, 250, r, 50); grain(c, 28, r); break; }
    case 'slate': { fill(90); const rows = 9, rh = S / rows; for (let y = 0; y < rows; y++) { let x = -r() * 30; while (x < S) { const w = 30 + r() * 26, v = 165 + r() * 90, gr = c.createLinearGradient(0, y * rh, 0, y * rh + rh * 1.5); gr.addColorStop(0, g(v - 35)); gr.addColorStop(1, g(v)); c.fillStyle = gr; c.fillRect(x + 1, y * rh, w - 2, rh * 1.5); x += w; } } grain(c, 26, r); break; }
    case 'shingle': { fill(110); const rows = 12, rh = S / rows, w = S / 7; for (let y = 0; y < rows; y++) for (let x = -1; x < 7; x++) { const ox = (y % 2 ? w / 2 : 0) + x * w; c.fillStyle = g(180 + r() * 75); c.beginPath(); c.moveTo(ox + 1, y * rh); c.lineTo(ox + w - 1, y * rh); c.lineTo(ox + w - 1, y * rh + rh * 1.1); c.arc(ox + w / 2, y * rh + rh * 1.1, w / 2 - 1, 0, Math.PI); c.closePath(); c.fill(); } grain(c, 36, r); break; }
    case 'boxprofile': { fill(215); const ribs = 5, w = S / ribs; for (let i = 0; i < ribs; i++) { const x = i * w; c.fillStyle = g(255); c.fillRect(x + w * 0.1, 0, w * 0.22, S); c.fillStyle = g(150); c.fillRect(x + w * 0.32, 0, w * 0.08, S); c.fillStyle = g(235); c.fillRect(x + w * 0.4, 0, w * 0.35, S); c.fillStyle = g(135); c.fillRect(x + w * 0.75, 0, w * 0.08, S); } c.fillStyle = g(120, 0.4); c.fillRect(0, S * 0.5 - 1, S, 2); blotches(c, 10, 180, 255, r, 50); grain(c, 12, r); break; }
    case 'cobble': { fill(110); for (let i = 0; i < 90; i++) { const x = r() * S, y = r() * S, rr = 10 + r() * 9, v = 160 + r() * 95; c.fillStyle = g(v); c.beginPath(); c.ellipse(x, y, rr, rr * (0.7 + r() * 0.3), r() * 3, 0, 7); c.fill(); } grain(c, 30, r); break; }
    case 'gravel': { fill(170); for (let i = 0; i < 1500; i++) { c.fillStyle = g(100 + r() * 155, 0.95); c.beginPath(); c.arc(r() * S, r() * S, 1 + r() * 3, 0, 7); c.fill(); } grain(c, 30, r); break; }
    case 'carpet': { fill(225); grain(c, 55, r); for (let i = 0; i < 1800; i++) { c.strokeStyle = g(150 + r() * 105, 0.3); c.lineWidth = 0.7; const x = r() * S, y = r() * S; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 4, y + (r() - 0.5) * 4); c.stroke(); } break; }
    case 'seam': { fill(225); const pans = 6, w = S / pans; for (let i = 0; i < pans; i++) { const x = i * w; const gr = c.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, g(250)); gr.addColorStop(0.9, g(215)); gr.addColorStop(1, g(255)); c.fillStyle = gr; c.fillRect(x, 0, w, S); c.fillStyle = g(130, 0.7); c.fillRect(x - 1.5, 0, 3, S); c.fillStyle = g(255, 0.6); c.fillRect(x + 1.5, 0, 2, S); } grain(c, 9, r); break; }
    case 'brick': {
      fill(150); const rows = 16, rh = S / rows, bw = S / 5;
      for (let y = 0; y < rows; y++) for (let x = -1; x < 5; x++) { const ox = (y % 2 ? bw / 2 : 0) + x * bw; c.fillStyle = g(208 + r() * 47); c.fillRect(ox + 1.5, y * rh + 1.5, bw - 3, rh - 3); }
      blotches(c, 14, 120, 255, r, 40); grain(c, 26, r); break;
    }
    case 'plaster': fill(238); blotches(c, 30, 190, 255, r, 70); grain(c, 20, r); break;
    case 'concrete': fill(214); blotches(c, 40, 160, 250, r, 80); for (let i = 0; i < 90; i++) { c.fillStyle = g(120 + r() * 40, 0.5); c.beginPath(); c.arc(r() * S, r() * S, 0.6 + r() * 1.4, 0, 7); c.fill(); } grain(c, 28, r); break;
    case 'timber': {
      fill(200); const n = 8, w = S / n;
      for (let i = 0; i < n; i++) { const base = 205 + r() * 45; c.fillStyle = g(base); c.fillRect(i * w, 0, w, S); for (let k = 0; k < 26; k++) { c.strokeStyle = g(120 + r() * 80, 0.18); c.lineWidth = 0.6 + r(); const x = i * w + r() * w; c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + r() * 4 - 2, S * 0.3, x + r() * 4 - 2, S * 0.7, x + r() * 3 - 1.5, S); c.stroke(); } if (r() < 0.5) { c.fillStyle = g(120, 0.35); c.beginPath(); c.ellipse(i * w + w / 2, r() * S, 3.5, 6, 0, 0, 7); c.fill(); } c.fillStyle = g(95); c.fillRect(i * w, 0, 2, S); }
      grain(c, 14, r); break;
    }
    case 'tile': {
      fill(120); const rows = 12, rh = S / rows, tw = S / 8;
      for (let y = 0; y < rows; y++) for (let x = -1; x < 8; x++) { const ox = (y % 2 ? tw / 2 : 0) + x * tw, v = 205 + r() * 50, gr = c.createLinearGradient(0, y * rh, 0, y * rh + rh * 1.4); gr.addColorStop(0, g(v)); gr.addColorStop(0.78, g(v * 0.93)); gr.addColorStop(1, g(v * 0.5)); c.fillStyle = gr; c.fillRect(ox + 1, y * rh, tw - 2, rh * 1.3); c.fillStyle = g(90, 0.5); c.fillRect(ox, y * rh, 1.2, rh * 1.3); }
      grain(c, 22, r); break;
    }
    case 'metal': {
      fill(220); const ribs = 16, w = S / ribs;
      for (let i = 0; i < ribs; i++) { const gr = c.createLinearGradient(i * w, 0, (i + 1) * w, 0); gr.addColorStop(0, g(150)); gr.addColorStop(0.35, g(250)); gr.addColorStop(0.6, g(225)); gr.addColorStop(1, g(140)); c.fillStyle = gr; c.fillRect(i * w, 0, w, S); }
      c.fillStyle = g(120, 0.5); c.fillRect(0, S / 2 - 1, S, 2); blotches(c, 12, 170, 255, r, 50); grain(c, 14, r); break;
    }
    case 'stone': {
      fill(135); let y = 0; while (y < S) { const h = 28 + r() * 22; let x = -r() * 40; while (x < S) { const w = 40 + r() * 50, v = 185 + r() * 60; c.fillStyle = g(v); c.fillRect(x + 1.5, y + 1.5, w - 3, Math.min(h, S - y) - 3); x += w; } y += h; }
      blotches(c, 24, 140, 250, r, 50); grain(c, 32, r); break;
    }
    case 'thatch': {
      fill(190); for (let i = 0; i < 1400; i++) { const x = r() * S, y = r() * S, l = 14 + r() * 40; c.strokeStyle = g(90 + r() * 165, 0.55); c.lineWidth = 0.7 + r() * 1.3; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 6, y + l); c.stroke(); }
      grain(c, 30, r); break;
    }
    case 'grass': {
      fill(205); blotches(c, 36, 150, 255, r, 70); for (let i = 0; i < 2200; i++) { const x = r() * S, y = r() * S; c.strokeStyle = g(130 + r() * 125, 0.6); c.lineWidth = 0.8; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 3, y - 3 - r() * 5); c.stroke(); }
      grain(c, 26, r); break;
    }
    case 'soil': fill(205); blotches(c, 50, 130, 255, r, 50); for (let i = 0; i < 260; i++) { c.fillStyle = g(100 + r() * 130, 0.6); c.beginPath(); c.arc(r() * S, r() * S, 0.6 + r() * 1.8, 0, 7); c.fill(); } grain(c, 42, r); break;
    case 'water': {
      fill(238); for (let i = 0; i < 40; i++) { const y = r() * S, a = 2 + r() * 4, f = 0.02 + r() * 0.04, ph = r() * 6; c.strokeStyle = g(r() < 0.5 ? 255 : 190, 0.35); c.lineWidth = 1 + r() * 1.5; c.beginPath(); for (let x = 0; x <= S; x += 4) c.lineTo(x, y + Math.sin(x * f * 6.28 + ph) * a); c.stroke(); }
      grain(c, 8, r); break;
    }
    case 'bark': { fill(190); for (let i = 0; i < 70; i++) { const x = r() * S; c.strokeStyle = g(60 + r() * 120, 0.55); c.lineWidth = 1 + r() * 3; c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + r() * 10 - 5, S * 0.3, x + r() * 10 - 5, S * 0.7, x + r() * 6 - 3, S); c.stroke(); } grain(c, 30, r); break; }
    case 'foliage': { fill(185); for (let i = 0; i < 900; i++) { c.fillStyle = g(90 + r() * 165, 0.7); c.beginPath(); c.ellipse(r() * S, r() * S, 2 + r() * 5, 1.5 + r() * 3, r() * 3, 0, 7); c.fill(); } grain(c, 24, r); break; }
    case 'paving': { fill(140); const n = 4, w = S / n; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { c.fillStyle = g(195 + r() * 55); c.fillRect(x * w + 2, y * w + 2, w - 4, w - 4); } blotches(c, 16, 150, 250, r, 50); grain(c, 30, r); break; }
  }
  return cv;
}
export function texture(kind: Tex): Texture | null {
  if (typeof document === 'undefined') return null;
  let t = cache.get(kind);
  if (!t) { t = new CanvasTexture(draw(kind)); t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = SRGBColorSpace; t.anisotropy = 8; cache.set(kind, t); }
  return t;
}
const urls = new Map<Tex, string>();
// small picture of a texture for the finish chooser (web only; empty elsewhere)
export function swatchUrl(kind: Tex): string {
  if (typeof document === 'undefined') return '';
  let u = urls.get(kind); if (!u) { u = draw(kind).toDataURL('image/png'); urls.set(kind, u); } return u;
}
