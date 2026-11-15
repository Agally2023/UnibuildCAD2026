// Output of drawing primitives: SVG (screen, print and PDF) and DXF (AutoCAD R12 text, millimetres, y up).
import type { Prim } from './dwgTypes';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n = (x: number) => Math.round(x * 1000) / 1000;
const INK = '#14181d';

export function toSvg(prims: Prim[], page: [number, number], o: { overlay?: string; px?: number } = {}): string {
  const [W, H] = page, body: string[] = [];
  for (const p of prims) {
    const col = ('col' in p && p.col) || INK;
    if (p.k === 'l') body.push(`<line x1="${n(p.a[0])}" y1="${n(p.a[1])}" x2="${n(p.b[0])}" y2="${n(p.b[1])}" stroke="${col}" stroke-width="${p.w}" stroke-linecap="round"${p.dash ? ` stroke-dasharray="${p.dash.join(' ')}"` : ''}/>`);
    else if (p.k === 't') body.push(`<text x="${n(p.p[0])}" y="${n(p.p[1])}" font-family="Arial, Helvetica, sans-serif" font-size="${n(p.size)}" font-weight="${p.bold ? 700 : 400}" fill="${col}" text-anchor="${p.anchor ?? 'middle'}"${p.rot ? ` transform="rotate(${p.rot} ${n(p.p[0])} ${n(p.p[1])})"` : ''}>${esc(p.s)}</text>`);
    else if (p.k === 'c') body.push(`<circle cx="${n(p.c[0])}" cy="${n(p.c[1])}" r="${n(p.r)}" fill="${p.fill ?? 'none'}" stroke="${INK}" stroke-width="${p.w}"/>`);
    else if (p.k === 'a') { const a0 = (p.a0 * Math.PI) / 180, a1 = (p.a1 * Math.PI) / 180, x0 = p.c[0] + p.r * Math.cos(a0), y0 = p.c[1] + p.r * Math.sin(a0), x1 = p.c[0] + p.r * Math.cos(a1), y1 = p.c[1] + p.r * Math.sin(a1); body.push(`<path d="M${n(x0)} ${n(y0)} A${n(p.r)} ${n(p.r)} 0 ${(((p.a1 - p.a0) % 360) + 360) % 360 > 180 ? 1 : 0} 1 ${n(x1)} ${n(y1)}" fill="none" stroke="${INK}" stroke-width="${p.w}"/>`); }
    else if (p.k === 'p') body.push(`<polyline points="${p.pts.map(q => `${n(q[0])},${n(q[1])}`).join(' ')}${p.closed ? ` ${n(p.pts[0][0])},${n(p.pts[0][1])}` : ''}" fill="${p.fill ?? 'none'}" stroke="${INK}" stroke-width="${p.w}" stroke-linejoin="round"/>`);
    else if (p.k === 'i') body.push(`<image href="${p.href}" xlink:href="${p.href}" x="${n(p.p[0])}" y="${n(p.p[1])}" width="${n(p.w)}" height="${n(p.h)}" preserveAspectRatio="none"/>`);
  }
  const px = o.px ?? 3;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W * px}" height="${H * px}"><rect width="${W}" height="${H}" fill="#ffffff"/>${body.join('')}${o.overlay ?? ''}</svg>`;
}

const LAYER_NAME: Record<string, [string, number]> = { vis: ['VISIBLE', 7], hid: ['HIDDEN', 8], cen: ['CENTER', 1], dim: ['DIMENSIONS', 3], note: ['NOTES', 7], sym: ['SYMBOLS', 5], tbl: ['TABLES', 7], hat: ['HATCH', 8], frm: ['BORDER', 7], img: ['IMAGE', 7] };
export function toDxf(prims: Prim[], page: [number, number]): string {
  const H = page[1], out: string[] = [], g = (c: number, v: string | number) => out.push(String(c), String(v)), used = new Set<string>(), Y = (y: number) => n(H - y);
  const body: string[] = [], push = (...a: (string | number)[]) => a.forEach(x => body.push(String(x)));
  const ent = (type: string, layer: string) => { used.add(layer); push(0, type, 8, layer); };
  for (const p of prims) {
    const L = LAYER_NAME[p.layer][0];
    if (p.k === 'l') { ent('LINE', L); push(10, n(p.a[0]), 20, Y(p.a[1]), 30, 0, 11, n(p.b[0]), 21, Y(p.b[1]), 31, 0); }
    else if (p.k === 't') { ent('TEXT', L); const ha = p.anchor === 'end' ? 2 : p.anchor === 'start' ? 0 : 1; push(10, n(p.p[0]), 20, Y(p.p[1]), 30, 0, 40, n(p.size), 1, p.s.replace(/[\r\n]+/g, ' '), 50, n(-(p.rot ?? 0))); if (ha) push(72, ha, 11, n(p.p[0]), 21, Y(p.p[1]), 31, 0); }
    else if (p.k === 'c') { ent('CIRCLE', L); push(10, n(p.c[0]), 20, Y(p.c[1]), 30, 0, 40, n(p.r)); }
    else if (p.k === 'a') { ent('ARC', L); push(10, n(p.c[0]), 20, Y(p.c[1]), 30, 0, 40, n(p.r), 50, n((((-p.a1) % 360) + 360) % 360), 51, n((((-p.a0) % 360) + 360) % 360)); }
    else if (p.k === 'p') { ent('POLYLINE', L); push(66, 1, 70, p.closed ? 1 : 0); for (const q of p.pts) push(0, 'VERTEX', 8, L, 10, n(q[0]), 20, Y(q[1]), 30, 0); push(0, 'SEQEND', 8, L); }
  }
  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$INSUNITS'); g(70, 4); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES'); g(0, 'TABLE'); g(2, 'LAYER'); g(70, used.size);
  for (const [, [name, col]] of Object.entries(LAYER_NAME)) if (used.has(name)) { g(0, 'LAYER'); g(2, name); g(70, 0); g(62, col); g(6, 'CONTINUOUS'); }
  g(0, 'ENDTAB'); g(0, 'ENDSEC'); g(0, 'SECTION'); g(2, 'ENTITIES');
  const head = out.join('\n'), tail = ['0', 'ENDSEC', '0', 'EOF'].join('\n');
  return `${head}\n${body.join('\n')}\n${tail}\n`;
}
