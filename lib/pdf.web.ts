// Web: print through the browser, or write a real vector PDF (text and lines stay sharp at any size).
import { fitBox, printPages, svgBox } from './paper';

export const pdfSupported = true;

export function printSvgs(svgs: string[], page: [number, number], title: string, margin: number, fit: boolean): string {
  const w = window.open('', '_blank');
  if (!w) return 'The browser blocked the print window. Allow pop-ups for this site and try again.';
  w.document.write(printPages(svgs, page, title, margin, fit)); w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 400);
  return 'In the print window pick your printer, or "Save as PDF". Margins: none, scale: 100%.';
}

export async function savePdf(svgs: string[], page: [number, number], fileName: string, margin: number, fit: boolean): Promise<void> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const [W, H] = page, doc = new jsPDF({ unit: 'mm', format: [Math.min(W, H), Math.max(W, H)], orientation: W >= H ? 'landscape' : 'portrait', compress: true });
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-99999px;top:0;width:1200px;visibility:hidden';
  document.body.appendChild(host);
  try {
    for (let i = 0; i < svgs.length; i++) {
      if (i > 0) doc.addPage([Math.min(W, H), Math.max(W, H)], W >= H ? 'landscape' : 'portrait');
      host.innerHTML = svgs[i];
      const el = host.querySelector('svg') as SVGSVGElement;
      const box = fit ? fitBox(svgBox(svgs[i]), page, margin) : { x: 0, y: 0, w: W, h: H };
      if (!el.getAttribute('viewBox')) { const [bw, bh] = svgBox(svgs[i]); el.setAttribute('viewBox', `0 0 ${bw} ${bh}`); }
      await svg2pdf(el, doc, { x: box.x, y: box.y, width: box.w, height: box.h });
    }
    doc.save(fileName.endsWith('.pdf') ? fileName : fileName + '.pdf');
  } finally { document.body.removeChild(host); }
}
