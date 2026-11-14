// Paper and canvas sizes for printing and PDF. All sizes are millimetres, listed landscape (width >= height).
// Pure functions, tested. The print dialog (components/PrintOptions.tsx) and the PDF writer (lib/pdf.web.ts) use these.
export type PaperDef = { key: string; label: string; group: string; w: number; h: number };
const IN = 25.4;
const def = (group: string, key: string, label: string, w: number, h: number): PaperDef => ({ key, label, group, w, h });
const inch = (group: string, key: string, label: string, w: number, h: number) => def(group, key, label, Math.round(w * IN * 10) / 10, Math.round(h * IN * 10) / 10);

export const PAPERS: PaperDef[] = [
  def('ISO A', 'A0', 'A0', 1189, 841), def('ISO A', 'A1', 'A1', 841, 594), def('ISO A', 'A2', 'A2', 594, 420), def('ISO A', 'A3', 'A3', 420, 297),
  def('ISO A', 'A4', 'A4', 297, 210), def('ISO A', 'A5', 'A5', 210, 148), def('ISO A', 'A6', 'A6', 148, 105),
  def('ISO B', 'B0', 'B0', 1414, 1000), def('ISO B', 'B1', 'B1', 1000, 707), def('ISO B', 'B2', 'B2', 707, 500), def('ISO B', 'B3', 'B3', 500, 353),
  def('ISO B', 'B4', 'B4', 353, 250), def('ISO B', 'B5', 'B5', 250, 176),
  inch('US', 'Letter', 'Letter', 11, 8.5), inch('US', 'Legal', 'Legal', 14, 8.5), inch('US', 'Tabloid', 'Tabloid / Ledger', 17, 11), inch('US', 'Statement', 'Statement', 8.5, 5.5),
  inch('ANSI', 'ANSI-C', 'ANSI C', 22, 17), inch('ANSI', 'ANSI-D', 'ANSI D', 34, 22), inch('ANSI', 'ANSI-E', 'ANSI E', 44, 34),
  inch('Architectural', 'Arch-A', 'Arch A', 12, 9), inch('Architectural', 'Arch-B', 'Arch B', 18, 12), inch('Architectural', 'Arch-C', 'Arch C', 24, 18),
  inch('Architectural', 'Arch-D', 'Arch D', 36, 24), inch('Architectural', 'Arch-E', 'Arch E', 48, 36), inch('Architectural', 'Arch-E1', 'Arch E1', 42, 30),
  inch('Canvas and poster', 'C-8x10', '8 × 10 in', 10, 8), inch('Canvas and poster', 'C-11x14', '11 × 14 in', 14, 11), inch('Canvas and poster', 'C-12x12', '12 × 12 in square', 12, 12),
  inch('Canvas and poster', 'C-16x20', '16 × 20 in', 20, 16), inch('Canvas and poster', 'C-18x24', '18 × 24 in', 24, 18), inch('Canvas and poster', 'C-24x36', '24 × 36 in', 36, 24),
  inch('Canvas and poster', 'C-30x40', '30 × 40 in', 40, 30), inch('Canvas and poster', 'C-20x20', '20 × 20 in square', 20, 20),
];
export const PAPER_GROUPS = ['ISO A', 'ISO B', 'US', 'ANSI', 'Architectural', 'Canvas and poster'];
export const CUSTOM = 'custom';

export type Orient = 'landscape' | 'portrait';
export type PageSetup = { key: string; orient: Orient; custom: [number, number]; margin: number };   // custom is width x height in mm
export const defaultSetup = (): PageSetup => ({ key: 'A3', orient: 'landscape', custom: [420, 297], margin: 0 });
export const MARGINS = [0, 5, 10, 15, 20];

// width and height in mm for a setup, with the orientation applied
export function pageMm(s: PageSetup): [number, number] {
  let w: number, h: number;
  if (s.key === CUSTOM) [w, h] = [Math.max(20, Math.min(3000, s.custom[0] || 20)), Math.max(20, Math.min(3000, s.custom[1] || 20))];
  else { const p = PAPERS.find(q => q.key === s.key) ?? PAPERS[3]; [w, h] = [p.w, p.h]; }
  const long = Math.max(w, h), short = Math.min(w, h);
  return s.orient === 'portrait' ? [short, long] : [long, short];
}
export const paperLabel = (s: PageSetup): string => {
  const [w, h] = pageMm(s), n = s.key === CUSTOM ? 'Custom' : PAPERS.find(q => q.key === s.key)?.label ?? s.key;
  return `${n} ${w >= h ? 'landscape' : 'portrait'} (${Math.round(w * 10) / 10} × ${Math.round(h * 10) / 10} mm)`;
};

// the size of an svg from its viewBox (or width and height attributes), in its own units
export function svgBox(svg: string): [number, number] {
  const vb = /viewBox="\s*([-\d.eE]+)[ ,]+([-\d.eE]+)[ ,]+([-\d.eE]+)[ ,]+([-\d.eE]+)\s*"/.exec(svg);
  if (vb) return [+vb[3], +vb[4]];
  const w = /<svg[^>]*\swidth="([\d.]+)/.exec(svg), h = /<svg[^>]*\sheight="([\d.]+)/.exec(svg);
  return [w ? +w[1] : 297, h ? +h[1] : 210];
}
// where an artwork of aspect w:h lands on a page: scaled to fit inside the margins, centred
export function fitBox(art: [number, number], page: [number, number], margin: number): { x: number; y: number; w: number; h: number } {
  const aw = Math.max(1, page[0] - 2 * margin), ah = Math.max(1, page[1] - 2 * margin), k = Math.min(aw / art[0], ah / art[1]), w = art[0] * k, h = art[1] * k;
  return { x: (page[0] - w) / 2, y: (page[1] - h) / 2, w, h };
}
// the same svg with fixed pixel sizes replaced so it fills its box
export const fillSvg = (svg: string): string => svg.replace(/<svg([^>]*)>/, (m, a: string) => `<svg${a.replace(/\s(width|height)="[^"]*"/g, '')} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
// A print document: one page per svg, sized by @page. `fit` pages scale the artwork into the margins; exact pages (drawing sheets
// already built at the page size in mm) are placed at the corner untouched.
export function printPages(svgs: string[], page: [number, number], title: string, margin: number, fit: boolean): string {
  const [W, H] = page;
  const body = svgs.map(s => fit ? `<div class="p" style="padding:${margin}mm">${fillSvg(s)}</div>` : `<div class="p">${s}</div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:${W}mm ${H}mm;margin:0}html,body{margin:0;padding:0;background:#fff}.p{width:${W}mm;height:${H}mm;box-sizing:border-box;page-break-after:always;overflow:hidden}.p:last-child{page-break-after:auto}svg{display:block}</style></head><body>${body}</body></html>`;
}
