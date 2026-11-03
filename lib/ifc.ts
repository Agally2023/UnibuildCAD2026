// IFC4 export (STEP text, metres). Walls, columns, beams, doors, windows, ducts and pipes become
// IfcWall, IfcColumn, IfcBeam, IfcDoor, IfcWindow, IfcDuctSegment and IfcPipeSegment with swept-solid geometry.
// Doors and windows get openings cut into their host walls. Opens in ArchiCAD, Revit, BIMcollab, Solibri, etc.
import type { El, Lib, Story } from './engineering';
import { beamSec, DEFAULT_H, wallT } from './model';
const f = (n: number) => { const s = (Math.round((n + 0) * 1e5) / 1e5).toString(); return /[.e]/.test(s) ? s : s + '.'; };
const str = (s: string) => `'${s.replace(/'/g, "''").replace(/[^\x20-\x7E]/g, '?')}'`;
const B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
function guidFromHex(hex: string) { let n = BigInt('0x' + hex.padStart(32, '0').slice(0, 32)), out = ''; for (let i = 0; i < 22; i++) { out = B64[Number(n & 63n)] + out; n >>= 6n; } return out; }
function guid(seed: string) {                                   // stable 128-bit id from a seed (element uuids keep their own bits)
  const clean = seed.replace(/-/g, '');
  if (/^[0-9a-f]{32}$/i.test(clean)) return guidFromHex(clean);
  let h = ['811c9dc5', 'cbf29ce4', '84222325', '9e3779b9'].map(x => parseInt(x, 16) >>> 0), hex = '';
  for (let i = 0; i < seed.length; i++) h = h.map((x, k) => Math.imul(x ^ (seed.charCodeAt(i) + k), 16777619) >>> 0);
  h.forEach(x => (hex += x.toString(16).padStart(8, '0')));
  return guidFromHex(hex);
}

export function toIfc(projectName: string, els: El[], lib: Pick<Lib, 'id' | 'name' | 'specs'>[], stories: Story[] = []): string {
  const L: string[] = []; let n = 0;
  const add = (s: string) => { L.push(`#${++n}=${s};`); return n; };
  const P3 = (x: number, y: number, z: number) => add(`IFCCARTESIANPOINT((${f(x)},${f(y)},${f(z)}))`);
  const P2 = (x: number, y: number) => add(`IFCCARTESIANPOINT((${f(x)},${f(y)}))`);
  const D3 = (x: number, y: number, z: number) => add(`IFCDIRECTION((${f(x)},${f(y)},${f(z)}))`);
  const A3 = (p: number, z?: number, x?: number) => add(`IFCAXIS2PLACEMENT3D(#${p},${z ? '#' + z : '$'},${x ? '#' + x : '$'})`);
  const LP = (rel: number | null, a: number) => add(`IFCLOCALPLACEMENT(${rel ? '#' + rel : '$'},#${a})`);
  const G = (seed: string) => `'${guid(seed)}'`;

  const origin = P3(0, 0, 0), dZ = D3(0, 0, 1), dX = D3(1, 0, 0), dY = D3(0, 1, 0), world = A3(origin, dZ, dX);
  const ctx = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#${world},$)`);
  const sub = add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#${ctx},$,.MODEL_VIEW.,$)`);
  const units = add(`IFCUNITASSIGNMENT((#${add('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)')},#${add('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)')},#${add('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)')},#${add('IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)')}))`);
  const project = add(`IFCPROJECT(${G('project')},$,${str(projectName)},$,$,$,$,(#${ctx}),#${units})`);
  const sitePl = LP(null, world), bldPl = LP(sitePl, world);
  const site = add(`IFCSITE(${G('site')},$,'Site',$,$,#${sitePl},$,$,.ELEMENT.,$,$,$,$,$)`);
  const bld = add(`IFCBUILDING(${G('building')},$,'Building',$,$,#${bldPl},$,$,.ELEMENT.,$,$,$)`);
  add(`IFCRELAGGREGATES(${G('agg1')},$,$,$,#${project},(#${site}))`);
  add(`IFCRELAGGREGATES(${G('agg2')},$,$,$,#${site},(#${bld}))`);
  const sts = (stories.length ? [...stories].sort((a, b) => a.elevation_m - b.elevation_m) : [{ id: '_', name: 'Ground floor', elevation_m: 0, height_m: DEFAULT_H }]) as Story[];
  const stInfo: Record<string, { ent: number; pl: number; h: number; products: number[] }> = {};
  const storeyEnts: number[] = [];
  for (const s of sts) {
    const pl = LP(bldPl, A3(P3(0, 0, s.elevation_m), dZ, dX));
    const ent = add(`IFCBUILDINGSTOREY(${G('storey' + s.id)},$,${str(s.name)},$,$,#${pl},$,$,.ELEMENT.,${f(s.elevation_m)})`);
    stInfo[s.id] = { ent, pl, h: s.height_m, products: [] }; storeyEnts.push(ent);
  }
  add(`IFCRELAGGREGATES(${G('agg3')},$,$,$,#${bld},(${storeyEnts.map(x => '#' + x).join(',')}))`);
  const firstId = sts[0].id, infoOf = (e: El) => stInfo[e.story_id ?? firstId] ?? stInfo[firstId];

  // geometry helpers: a profile swept along the element's local Z (or along its local X for horizontal runs)
  const shape = (solid: number) => add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${add(`IFCSHAPEREPRESENTATION(#${sub},'Body','SweptSolid',(#${solid}))`)}))`);
  const rect = (w: number, d: number, cx: number, cy: number) => add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${add(`IFCAXIS2PLACEMENT2D(#${P2(cx, cy)},$)`)},${f(w)},${f(d)})`);
  // an arbitrary closed outline (slabs and roofs that are not rectangles); points are in plan metres
  const polyline = (pts: number[][]) => add(`IFCPOLYLINE((${[...pts, pts[0]].map(q => '#' + P2(q[0], q[1])).join(',')}))`);
  const voidProf = (pts: number[][], holes: number[][]) => add(`IFCARBITRARYPROFILEDEFWITHVOIDS(.AREA.,$,#${polyline(pts)},(${holes.map(h => '#' + polyline([[h[0], h[1]], [h[2], h[1]], [h[2], h[3]], [h[0], h[3]]])).join(',')}))`);
  const polyProf = (pts: number[][]) => add(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#${add(`IFCPOLYLINE((${[...pts, pts[0]].map(q => '#' + P2(q[0], q[1])).join(',')}))`)})`);
  const circle = (r: number) => add(`IFCCIRCLEPROFILEDEF(.AREA.,$,#${add(`IFCAXIS2PLACEMENT2D(#${P2(0, 0)},$)`)},${f(r)})`);
  const up = (prof: number, depth: number) => add(`IFCEXTRUDEDAREASOLID(#${prof},#${A3(origin)},#${dZ},${f(depth)})`);
  const along = (prof: number, len: number) => add(`IFCEXTRUDEDAREASOLID(#${prof},#${A3(origin, dX, dY)},#${dZ},${f(len)})`);
  const place = (pl: number, x: number, y: number, z: number, ang: number) => LP(pl, A3(P3(x, y, z), dZ, D3(Math.cos(ang), Math.sin(ang), 0)));
  const seg = (a: number[], b: number[]) => ({ len: Math.hypot(b[0] - a[0], b[1] - a[1]), ang: Math.atan2(b[1] - a[1], b[0] - a[0]) });
  const libOf = (e: El) => lib.find(l => l.id === e.library_item_id);

  const walls: Record<string, { ent: number; a: number[]; b: number[]; t: number; pl: number }> = {}, counts: Record<string, number> = {};
  const name = (t: string, label: string) => `${label} ${(counts[t] = (counts[t] ?? 0) + 1)}`;
  const ctr = (e: El, ent: number) => infoOf(e).products.push(ent);
  const pset = (e: El, ent: number, disc: string) => {
    const li = libOf(e), props = [add(`IFCPROPERTYSINGLEVALUE('Discipline',$,IFCLABEL(${str(disc)}),$)`)];
    if (li) props.push(add(`IFCPROPERTYSINGLEVALUE('LibraryItem',$,IFCLABEL(${str(li.name)}),$)`));
    props.push(add(`IFCPROPERTYSINGLEVALUE('UnibuildId',$,IFCIDENTIFIER(${str(e.id)}),$)`));
    const ps = add(`IFCPROPERTYSET(${G('ps' + e.id)},$,'Pset_Unibuild',$,(${props.map(p => '#' + p).join(',')}))`);
    add(`IFCRELDEFINESBYPROPERTIES(${G('rd' + e.id)},$,$,$,(#${ent}),#${ps})`);
  };

  // walls first so doors and windows can find their host
  const order = ['wall', 'column', 'beam', 'duct', 'pipe', 'equipment', 'fixture', 'slab', 'roof', 'stair', 'foundation', 'door', 'window'];
  for (const e of [...els].filter(x => order.includes(x.type)).sort((p, q) => order.indexOf(p.type) - order.indexOf(q.type))) {
    const g = e.geometry, s = libOf(e)?.specs ?? {}, S = infoOf(e);
    if (e.type === 'wall') {
      const { len, ang } = seg(g.start, g.end);
      if (len < 1e-6) continue;
      const ent = add(`IFCWALL(${G(e.id)},$,${str(name('wall', 'Wall'))},$,$,#${place(S.pl, g.start[0], g.start[1], 0, ang)},#${shape(up(rect(len, wallT(g), len / 2, 0), g.height))},$,.STANDARD.)`);
      walls[e.id] = { ent, a: g.start, b: g.end, t: wallT(g), pl: S.pl }; ctr(e, ent); pset(e, ent, 'architecture');
    } else if (e.type === 'column') {
      const b = (s.b_mm ?? g.b * 1000) / 1000, h = (s.h_mm ?? g.h * 1000) / 1000;
      const ent = add(`IFCCOLUMN(${G(e.id)},$,${str(name('column', 'Column'))},$,$,#${place(S.pl, g.at[0], g.at[1], 0, 0)},#${shape(up(rect(b, h, 0, 0), g.height))},$,.COLUMN.)`);
      ctr(e, ent); pset(e, ent, 'structure');
    } else if (e.type === 'beam') {
      const { len, ang } = seg(g.start, g.end), { b: bw, d: bd } = beamSec(g, s), top = g.top_m ?? S.h;
      if (len < 1e-6) continue;
      const ent = add(`IFCBEAM(${G(e.id)},$,${str(name('beam', 'Beam'))},$,$,#${place(S.pl, g.start[0], g.start[1], top - bd, ang)},#${shape(along(rect(bw, bd, 0, bd / 2), len))},$,.BEAM.)`);
      ctr(e, ent); pset(e, ent, 'structure');
    } else if (e.type === 'duct' || e.type === 'pipe') {
      const { len, ang } = seg(g.start, g.end); if (len < 1e-6) continue;
      const isD = e.type === 'duct', c = g.elevation_m ?? (isD ? 3.15 : 3.2);
      const prof = isD ? rect((g.w_mm ?? s.w_mm ?? 600) / 1000, (g.h_mm ?? s.h_mm ?? 300) / 1000, 0, 0) : circle((g.dia_mm ?? s.dia_mm ?? 110) / 2000);
      const ent = add(`${isD ? 'IFCDUCTSEGMENT' : 'IFCPIPESEGMENT'}(${G(e.id)},$,${str(name(e.type, isD ? 'Duct' : 'Pipe'))},$,$,#${place(S.pl, g.start[0], g.start[1], c, ang)},#${shape(along(prof, len))},$,.RIGIDSEGMENT.)`);
      ctr(e, ent); pset(e, ent, 'mep');
    } else if (g.at && (e.type === 'equipment' || e.type === 'fixture')) {
      const isEq = e.type === 'equipment', sz = isEq ? [0.9, 0.9, 0.6] : [0.6, 0.6, 0.08], z = isEq ? S.h - 1.2 : S.h - 0.13;
      const ent = add(`${isEq ? 'IFCUNITARYEQUIPMENT' : 'IFCAIRTERMINAL'}(${G(e.id)},$,${str(name(e.type, isEq ? 'Air handler' : 'Diffuser'))},$,$,#${place(S.pl, g.at[0], g.at[1], z, 0)},#${shape(up(rect(sz[0], sz[1], 0, 0), sz[2]))},$,${isEq ? '.AIRHANDLER.' : '.DIFFUSER.'})`);
      ctr(e, ent); pset(e, ent, 'mep');
    } else if (g.rect && ['slab', 'roof', 'stair', 'foundation'].includes(e.type)) {
      const [x0, y0, x1, y1] = g.rect as number[], z0 = g.z0 ?? 0, z1 = g.z1 ?? 0.2, w = Math.abs(x1 - x0), d = Math.abs(y1 - y0);
      if (w < 1e-3 || d < 1e-3) continue;
      const holes: number[][] = (e.type === 'slab' || e.type === 'roof') && Array.isArray(g.holes) ? g.holes : [];
      const poly = g.poly && g.poly.length >= 3 && (e.type === 'slab' || e.type === 'roof') ? (g.poly as number[][]) : holes.length ? [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] : null;
      const lab = { slab: 'Slab', roof: 'Roof', stair: 'Stair', foundation: 'Footing' }[e.type as 'slab'], cls = { slab: 'IFCSLAB', roof: 'IFCROOF', stair: 'IFCSTAIR', foundation: 'IFCFOOTING' }[e.type as 'slab'];
      const pre = { slab: '.FLOOR.', roof: '.FLAT_ROOF.', stair: '.STRAIGHT_RUN_STAIR.', foundation: '.PAD_FOOTING.' }[e.type as 'slab'];
      const ent = add(`${cls}(${G(e.id)},$,${str(name(e.type, lab))},$,$,#${place(S.pl, poly ? 0 : Math.min(x0, x1), poly ? 0 : Math.min(y0, y1), z0, 0)},#${shape(up(poly ? (holes.length ? voidProf(poly, holes) : polyProf(poly)) : rect(w, d, w / 2, d / 2), Math.max(z1 - z0, 0.02)))},$,${pre})`);
      ctr(e, ent); pset(e, ent, e.type === 'roof' || e.type === 'stair' ? 'architecture' : 'structure');
    } else if (e.type === 'door' || e.type === 'window') {
      const w = walls[g.wall_id]; if (!w) continue;
      const { len, ang } = seg(w.a, w.b), ux = (w.b[0] - w.a[0]) / len, uy = (w.b[1] - w.a[1]) / len;
      const x0 = w.a[0] + ux * (g.offset_m - g.width_m / 2), y0 = w.a[1] + uy * (g.offset_m - g.width_m / 2);
      const isDoor = e.type === 'door', z0 = isDoor ? 0 : 0.9, hgt = isDoor ? 2.1 : 1.2;
      const open = add(`IFCOPENINGELEMENT(${G('o' + e.id)},$,'Opening',$,$,#${place(w.pl, x0, y0, z0, ang)},#${shape(up(rect(g.width_m, w.t + 0.1, g.width_m / 2, 0), hgt))},$,.OPENING.)`);
      add(`IFCRELVOIDSELEMENT(${G('v' + e.id)},$,$,$,#${w.ent},#${open})`);
      const ent = isDoor
        ? add(`IFCDOOR(${G(e.id)},$,${str(name('door', 'Door'))},$,$,#${place(w.pl, x0, y0, z0, ang)},#${shape(up(rect(g.width_m, 0.06, g.width_m / 2, 0), hgt))},$,${f(hgt)},${f(g.width_m)},.DOOR.,.NOTDEFINED.,$)`)
        : add(`IFCWINDOW(${G(e.id)},$,${str(name('window', 'Window'))},$,$,#${place(w.pl, x0, y0, z0, ang)},#${shape(up(rect(g.width_m, 0.06, g.width_m / 2, 0), hgt))},$,${f(hgt)},${f(g.width_m)},.WINDOW.,.NOTDEFINED.,$)`);
      add(`IFCRELFILLSELEMENT(${G('f' + e.id)},$,$,$,#${open},#${ent})`);
      ctr(e, ent); pset(e, ent, 'architecture');
    }
  }
  for (const s of sts) { const S = stInfo[s.id]; if (S.products.length) add(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${G('contain' + s.id)},$,$,$,(${S.products.map(p => '#' + p).join(',')}),#${S.ent})`); }

  const now = new Date().toISOString().slice(0, 19);
  return ['ISO-10303-21;', 'HEADER;', "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');",
    `FILE_NAME(${str(projectName + '.ifc')},'${now}',('Unibuild'),('Unibuild'),'Unibuild','Unibuild','');`, "FILE_SCHEMA(('IFC4'));", 'ENDSEC;', 'DATA;', ...L, 'ENDSEC;', 'END-ISO-10303-21;'].join('\n');
}
