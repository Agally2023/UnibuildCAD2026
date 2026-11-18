// The drawing document: sheets of views and annotations, kept inside the part file. Everything is plain data (JSON).
import type { PageSetup } from './paper';
import type { NamedView } from './dwgGeom';

export type Layer = 'vis' | 'hid' | 'cen' | 'dim' | 'note' | 'sym' | 'tbl' | 'hat' | 'frm' | 'img';
export const LAYERS: { key: Layer; label: string }[] = [
  { key: 'vis', label: 'Visible lines' }, { key: 'hid', label: 'Hidden lines' }, { key: 'cen', label: 'Centre lines and marks' }, { key: 'dim', label: 'Dimensions' },
  { key: 'note', label: 'Notes and balloons' }, { key: 'sym', label: 'Symbols (finish, weld, GD&T, datum)' }, { key: 'tbl', label: 'Tables' }, { key: 'hat', label: 'Hatching' },
  { key: 'frm', label: 'Border and title block' }, { key: 'img', label: 'Shaded images' },
];

export type Prim =
  | { k: 'l'; a: [number, number]; b: [number, number]; layer: Layer; w: number; dash?: number[]; col?: string }
  | { k: 't'; p: [number, number]; s: string; size: number; anchor?: 'start' | 'middle' | 'end'; rot?: number; bold?: boolean; layer: Layer; col?: string }
  | { k: 'c'; c: [number, number]; r: number; w: number; layer: Layer; fill?: string }
  | { k: 'a'; c: [number, number]; r: number; a0: number; a1: number; w: number; layer: Layer }          // arc, degrees, drawn clockwise on screen from a0 to a1
  | { k: 'p'; pts: [number, number][]; closed: boolean; w: number; layer: Layer; fill?: string }
  | { k: 'i'; href: string; p: [number, number]; w: number; h: number; layer: Layer };

export type Display = 'hlv' | 'hlr' | 'wire' | 'shaded' | 'edges';
export const DISPLAYS: { key: Display; label: string }[] = [
  { key: 'hlv', label: 'Hidden lines visible' }, { key: 'hlr', label: 'Hidden lines removed' }, { key: 'wire', label: 'Wireframe' }, { key: 'shaded', label: 'Shaded' }, { key: 'edges', label: 'Shaded with edges' },
];

export type Cut = { axis: 'x' | 'y' | 'z'; pos: number; flip: boolean; kind: 'full' | 'half' | 'offset'; pos2?: number; split?: number; halfSide?: 'l' | 'r' };
export type Brk = { dir: 'h' | 'v'; a: number; b: number; style: 'straight' | 'zigzag' | 'curved' };   // a..b in view units (u for h, v for v)
export type HatchStyle = 'iron' | 'steel' | 'brass' | 'alu' | 'cross' | 'solid' | 'none';
export const HATCHES: { key: HatchStyle; label: string }[] = [
  { key: 'iron', label: 'ANSI31 iron, general' }, { key: 'steel', label: 'ANSI32 steel' }, { key: 'brass', label: 'ANSI33 brass, bronze' }, { key: 'alu', label: 'ANSI38 aluminium' },
  { key: 'cross', label: 'ANSI37 cross hatch' }, { key: 'solid', label: 'Solid fill' }, { key: 'none', label: 'No hatch' },
];

export type DView = {
  id: string; kind: NamedView | 'section' | 'detail' | 'aux' | 'proj'; proj?: 'r' | 'l' | 'u' | 'd'; parent?: string; cx: number; cy: number;    // centre on the sheet, mm
  scale: number | null;                                                                                     // null: the sheet scale
  display: Display; marks: boolean; showLabel: boolean; label?: string; showScale: boolean; letter?: string; locked?: boolean;
  cut?: Cut; hatch?: HatchStyle;
  detail?: { u: number; v: number; r: number; round: boolean };                                              // circle (or square) on the parent, in parent view units
  aux?: { a: [number, number]; b: [number, number]; flip: boolean };                                         // an edge of the parent
  breaks?: Brk[]; crop?: { u0: number; v0: number; u1: number; v1: number; round: boolean };
  breakout?: { u0: number; v0: number; u1: number; v1: number; depth: number };                              // depth: model coordinate of the cut, along the view direction
  align?: 'h' | 'v';                                                                                         // projected views move along one direction only
};

export type TolType = 'none' | 'basic' | 'symmetric' | 'bilateral' | 'limit' | 'fit' | 'ref';
export type Tol = { type: TolType; plus: number; minus: number; fit?: string };
export type DimKind = 'hor' | 'ver' | 'ali' | 'dia' | 'rad' | 'ang' | 'chamfer' | 'ord';
export type GdtSym = 'flat' | 'straight' | 'circ' | 'cyl' | 'linep' | 'surfp' | 'para' | 'perp' | 'angl' | 'pos' | 'conc' | 'symm' | 'run' | 'trun';
export const GDT: { key: GdtSym; label: string }[] = [
  { key: 'flat', label: 'Flatness' }, { key: 'straight', label: 'Straightness' }, { key: 'circ', label: 'Circularity' }, { key: 'cyl', label: 'Cylindricity' }, { key: 'linep', label: 'Profile of a line' },
  { key: 'surfp', label: 'Profile of a surface' }, { key: 'para', label: 'Parallelism' }, { key: 'perp', label: 'Perpendicularity' }, { key: 'angl', label: 'Angularity' }, { key: 'pos', label: 'Position' },
  { key: 'conc', label: 'Concentricity' }, { key: 'symm', label: 'Symmetry' }, { key: 'run', label: 'Circular runout' }, { key: 'trun', label: 'Total runout' },
];
export type WeldType = 'fillet' | 'v' | 'square' | 'bevel' | 'u' | 'plug' | 'spot' | 'seam' | 'backing';
export const WELDS: { key: WeldType; label: string }[] = [
  { key: 'fillet', label: 'Fillet' }, { key: 'v', label: 'V groove' }, { key: 'square', label: 'Square groove' }, { key: 'bevel', label: 'Bevel groove' }, { key: 'u', label: 'U groove' },
  { key: 'plug', label: 'Plug or slot' }, { key: 'spot', label: 'Spot' }, { key: 'seam', label: 'Seam' }, { key: 'backing', label: 'Back or backing' },
];
type Base = { id: string; layer?: Layer };
export type Ann =
  | (Base & { t: 'dim'; view: string; kind: DimKind; a: [number, number]; b: [number, number]; c?: [number, number]; p: [number, number]; text?: string; tol?: Tol; prec?: number; prefix?: string; suffix?: string; ref?: boolean; arrow?: 'filled' | 'open' | 'dot' | 'slash' | 'none'; org?: [number, number] })
  | (Base & { t: 'note'; view?: string; at: [number, number]; target?: [number, number]; text: string; size: number; box?: 'none' | 'box' | 'circle' })
  | (Base & { t: 'balloon'; view: string; at: [number, number]; target: [number, number]; text: string; shape: 'circle' | 'triangle' | 'hex' | 'box' })
  | (Base & { t: 'finish'; view: string; at: [number, number]; target: [number, number]; text: string; kind: 'machined' | 'basic' | 'prohibited' })
  | (Base & { t: 'weld'; view: string; at: [number, number]; target: [number, number]; type: WeldType; size: string; length: string; around: boolean; field: boolean; other: boolean })
  | (Base & { t: 'gdt'; view: string; at: [number, number]; target: [number, number]; sym: GdtSym; tol: string; mod: string; datums: string[]; dia: boolean })
  | (Base & { t: 'datum'; view: string; at: [number, number]; target: [number, number]; letter: string })
  | (Base & { t: 'dtarget'; view: string; at: [number, number]; target: [number, number]; letter: string; n: string })
  | (Base & { t: 'cmark'; view: string; c: [number, number]; r: number })
  | (Base & { t: 'cline'; view: string; a: [number, number]; b: [number, number] })
  | (Base & { t: 'hole'; view: string; c: [number, number]; r: number; at: [number, number]; text: string })
  | (Base & { t: 'thread'; view: string; c: [number, number]; r: number; nom: number; at: [number, number]; text: string; ext: boolean })
  | (Base & { t: 'dxf'; x: number; y: number; s: number; box: [number, number, number, number]; prims: Prim[]; name: string })
  | (Base & { t: 'symbol'; x: number; y: number; name: SymName })
  | (Base & { t: 'htable'; view: string; x: number; y: number; org: [number, number]; style?: 'xy' | 'group' | 'polar' })
  | (Base & { t: 'bom'; x: number; y: number })
  | (Base & { t: 'rev'; x: number; y: number; rows: { rev: string; desc: string; date: string; by: string }[] })
  | (Base & { t: 'table'; x: number; y: number; title: string; rows: string[][] })
  | (Base & { t: 'cloud'; x: number; y: number; w: number; h: number; tag: string })
  | (Base & { t: 'fill'; view: string; u0: number; v0: number; u1: number; v1: number; style: HatchStyle; angle: number; gap: number });
export type AnnType = Ann['t'];
export type SymName = 'gentol' | 'notes' | 'finish' | 'edges';
export const SYMBOLS: { key: SymName; label: string }[] = [{ key: 'gentol', label: 'General tolerances (ISO 2768-m)' }, { key: 'notes', label: 'Standard notes' }, { key: 'finish', label: 'Surface finish, all over' }, { key: 'edges', label: 'Edges, fillets and chamfers' }];

export type Sheet = { id: string; name: string; size: PageSetup; scale: number; views: DView[]; anns: Ann[] };
export type Props = { company: string; title: string; drawnBy: string; checkedBy: string; approvedBy: string; drawingNo: string; revision: string; partNo: string; description: string; finish: string; tolerance: string; weight: string };
export type DrawingDoc = {
  v: 1; sheets: Sheet[]; std: 'iso' | 'ansi'; projection: 'first' | 'third'; units: 'mm' | 'in'; dual: boolean; prec: number; arrow: 'filled' | 'open' | 'dot' | 'slash' | 'none'; textH: number;
  zones: boolean; border: boolean; titleBlock: boolean; hatch: HatchStyle; layers: Partial<Record<Layer, boolean>>; props: Props; bomNote: string;
};
