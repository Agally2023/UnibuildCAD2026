// Native (Android, iOS): printing and PDF export are in the web version.
export const pdfSupported = false;
export function printSvgs(_s: string[], _p: [number, number], _t: string, _m: number, _f: boolean): string {
  return 'Printing and PDF export work in the web version. Open Unibuild in a browser, or download the SVG here.';
}
export async function savePdf(_s: string[], _p: [number, number], _f: string, _m: number, _fit: boolean): Promise<void> { throw new Error('PDF export works in the web version.'); }
