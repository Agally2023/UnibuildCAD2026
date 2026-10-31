// IFC import: a dependency-free STEP reader (IFC2x3 and IFC4) that works on web and mobile.
// Reads walls, columns, beams, doors, windows, ducts, pipes, slabs, roofs, stairs and footings.
// Swept solids (rectangle, circle, polyline profiles, mapped items, clipped walls) are read exactly. Meshes, B-reps and
// unusual profiles are fitted with an oriented bounding box, so they still become walls, columns and beams.
type V = null | number | string | { ref: number } | { en: string } | { t: string; v: V } | V[];
type Ent = { t: string; raw: string; a?: V[] };
type M = { r: number[][]; t: number[] };
type Vec = number[];

export type Kind = 'wall' | 'column' | 'beam' | 'duct' | 'pipe' | 'door' | 'window' | 'slab' | 'roof' | 'stair' | 'foundation';
export type ImportedEl = { kind: Kind; fitted?: boolean; geometry: any; section?: { b_mm?: number; h_mm?: number; w_mm?: number; dia_mm?: number }; wallIdx?: number; props: { ifc_guid: string | null; ifc_name: string | null } };
export type IfcResult = { elements: ImportedEl[]; skipped: Record<string, number>; notes: string[]; extent: [number, number]; min: [number, number]; wallHeight: number };
export type Storey = { id: number | null; name: string; count: number; elevation: number };

const I3: M = { r: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], t: [0, 0, 0] };
const mul = (A: M, B: M): M => ({ r: [0, 1, 2].map(i => [0, 1, 2].map(j => A.r[i][0] * B.r[0][j] + A.r[i][1] * B.r[1][j] + A.r[i][2] * B.r[2][j])), t: [0, 1, 2].map(i => A.r[i][0] * B.t[0] + A.r[i][1] * B.t[1] + A.r[i][2] * B.t[2] + A.t[i]) });
const rot = (A: M, p: Vec) => [0, 1, 2].map(i => A.r[i][0] * p[0] + A.r[i][1] * p[1] + A.r[i][2] * p[2]);
const app = (A: M, p: Vec) => rot(A, p).map((v, i) => v + A.t[i]);
const norm = (v: Vec) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return v.map(x => x / l); };
const cross = (a: Vec, b: Vec) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const fromAxes = (x: Vec, y: Vec, z: Vec, t: Vec): M => ({ r: [0, 1, 2].map(i => [x[i], y[i], z[i]]), t });
const r2 = (x: number) => Math.round(x * 100) / 100;

// ---------- STEP parsing ----------
function parseList(s: string): V[] {
  let i = 0;
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const list = (): V[] => {
    const out: V[] = []; ws();
    if (s[i] === ')') { i++; return out; }
    for (;;) { out.push(val()); ws(); if (s[i] === ',') { i++; continue; } if (s[i] === ')') i++; break; }
    return out;
  };
  const val = (): V => {
    ws(); const c = s[i];
    if (c === "'") { let j = i + 1, o = ''; while (j < s.length) { if (s[j] === "'") { if (s[j + 1] === "'") { o += "'"; j += 2; continue; } break; } o += s[j++]; } i = j + 1; return o; }
    if (c === '#') { let j = i + 1; while (j < s.length && s[j] >= '0' && s[j] <= '9') j++; const r = +s.slice(i + 1, j); i = j; return { ref: r }; }
    if (c === '$' || c === '*') { i++; return null; }
    if (c === '.') { const j = s.indexOf('.', i + 1); const e = s.slice(i + 1, j); i = j + 1; return { en: e }; }
    if (c === '(') { i++; return list(); }
    const m = /^([A-Za-z0-9_]+)\(/.exec(s.slice(i, i + 80));
    if (m) { i += m[0].length; const inner = list(); return { t: m[1].toUpperCase(), v: inner.length === 1 ? inner[0] : inner }; }
    const n = /^[-+]?\d*\.?\d*(?:[eE][-+]?\d+)?/.exec(s.slice(i, i + 40))![0];
    i += n.length || 1; return n ? parseFloat(n) : null;
  };
  return list();               // s is the entity's argument text without its outer brackets
}

function readEntities(text: string) {
  const start = text.search(/DATA\s*;/), end = text.lastIndexOf('ENDSEC');
  const data = text.slice(start < 0 ? 0 : start + 5, end < 0 ? text.length : end).replace(/\/\*[\s\S]*?\*\//g, '');
  const E = new Map<number, Ent>(); let cur = '', q = false;
  for (let i = 0; i < data.length; i++) {
    const c = data[i];
    if (c === "'") q = !q;
    if (c === ';' && !q) { add(cur); cur = ''; } else cur += c;
  }
  function add(st: string) {
    const m = /^\s*#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\(([\s\S]*)\)\s*$/.exec(st);
    if (m) E.set(+m[1], { t: m[2].toUpperCase(), raw: m[3] });
  }
  return E;
}

const SUPPORTED: [RegExp, Kind][] = [[/^IFCSLAB(STANDARDCASE|ELEMENTEDCASE)?$/, 'slab'], [/^IFCROOF$/, 'roof'], [/^IFCSTAIR(FLIGHT)?$/, 'stair'], [/^IFCFOOTING$/, 'foundation'], [/^IFCWALL(STANDARDCASE)?$/, 'wall'], [/^IFCCOLUMN(STANDARDCASE)?$/, 'column'], [/^IFCBEAM(STANDARDCASE)?$/, 'beam'], [/^IFCDOOR(STANDARDCASE)?$/, 'door'], [/^IFCWINDOW(STANDARDCASE)?$/, 'window'], [/^IFCDUCTSEGMENT$/, 'duct'], [/^IFCPIPESEGMENT$/, 'pipe']];
const SKIP = /^IFC(AIRTERMINAL|UNITARYEQUIPMENT|RAMP|RAILING|COVERING|FURNISHINGELEMENT|FURNITURE|FLOWTERMINAL|FLOWFITTING|FLOWSEGMENT|DUCTFITTING|PIPEFITTING|MEMBER|PLATE|PILE|CURTAINWALL|BUILDINGELEMENTPROXY|DISTRIBUTIONELEMENT|SPACE|TRANSPORTELEMENT|OPENINGELEMENT)(STANDARDCASE)?$/;

export function parseIfc(text: string) {
  const E = readEntities(text), notes: string[] = [];
  const args = (e: Ent) => (e.a ??= parseList(e.raw));
  const get = (v: V | undefined): Ent | undefined => (v && typeof v === 'object' && !Array.isArray(v) && 'ref' in v ? E.get(v.ref) : undefined);
  const id = (v: V | undefined) => (v && typeof v === 'object' && !Array.isArray(v) && 'ref' in v ? v.ref : null);
  const num = (v: V | undefined): number => (typeof v === 'number' ? v : v && typeof v === 'object' && !Array.isArray(v) && 't' in v ? num(v.v) : 0);
  const str = (v: V | undefined) => (typeof v === 'string' ? v : null);

  // length unit -> metres
  let unit = 1;
  for (const e of E.values()) if (e.t === 'IFCUNITASSIGNMENT') {
    for (const u of (args(e)[0] as V[]) ?? []) {
      const ue = get(u); if (!ue) continue; const a = args(ue);
      if (ue.t === 'IFCSIUNIT' && (a[1] as any)?.en === 'LENGTHUNIT') unit = (a[2] as any)?.en === 'MILLI' ? 0.001 : (a[2] as any)?.en === 'CENTI' ? 0.01 : 1;
      if (ue.t === 'IFCCONVERSIONBASEDUNIT' && (a[1] as any)?.en === 'LENGTHUNIT') { const mw = get(a[3]); if (mw) unit = num(args(mw)[0]); }
    }
    break;
  }
  const pt = (v: V | undefined, s = unit): Vec => { const e = get(v); const c = e ? (args(e)[0] as V[]) : [0, 0, 0]; return [num(c[0]) * s, num(c[1]) * s, (c.length > 2 ? num(c[2]) : 0) * s]; };
  const dir = (v: V | undefined, d: Vec): Vec => { const e = get(v); if (!e) return d; const c = args(e)[0] as V[]; const o = [num(c[0]), num(c[1]), c.length > 2 ? num(c[2]) : 0]; return Math.hypot(...o) ? norm(o) : d; };

  const axis3 = (v: V | undefined): M => {
    const e = get(v); if (!e) return I3; const a = args(e);
    const z = dir(a[1], [0, 0, 1]); let x = dir(a[2], [1, 0, 0]);
    x = norm(x.map((c, i) => c - dot(x, z) * z[i])); if (!Math.hypot(...x)) x = [1, 0, 0];
    return fromAxes(x, cross(z, x), z, pt(a[0]));
  };
  const placeCache = new Map<number, M>();
  const place = (v: V | undefined): M => {
    const k = id(v); if (k === null) return I3; if (placeCache.has(k)) return placeCache.get(k)!;
    const e = E.get(k); let m = I3;
    if (e && e.t === 'IFCLOCALPLACEMENT') { const a = args(e); m = mul(a[0] ? place(a[0]) : I3, axis3(a[1])); }
    placeCache.set(k, m); return m;
  };
  const operator = (v: V | undefined): M => {
    const e = get(v); if (!e) return I3; const a = args(e);
    const x = dir(a[0], [1, 0, 0]); let y = dir(a[1], [0, 1, 0]); const z = cross(x, y);
    return fromAxes(x, cross(z, x), z, pt(a[2]));
  };

  // solids of a representation item: extruded solids, through clipping results and mapped items
  type Solid = { e: Ent; M: M };
  const solids = (v: V | undefined, M0: M, depth = 0): Solid[] => {
    const e = get(v); if (!e || depth > 5) return [];
    const a = args(e);
    if (e.t === 'IFCEXTRUDEDAREASOLID') return [{ e, M: M0 }];
    if (e.t === 'IFCBOOLEANCLIPPINGRESULT' || e.t === 'IFCBOOLEANRESULT') return solids(a[1], M0, depth + 1);
    if (e.t === 'IFCMAPPEDITEM') {
      const src = get(a[0]); if (!src) return [];
      const sa = args(src), M1 = mul(mul(M0, operator(a[1])), axis3(sa[0]));
      const rep = get(sa[1]); return rep ? ((args(rep)[3] as V[]) ?? []).flatMap(i => solids(i, M1, depth + 1)) : [];
    }
    return [];
  };
  const bodySolids = (prod: Ent): Solid[] => {
    const pds = get(args(prod)[6]); if (!pds) return [];
    const reps = ((args(pds)[2] as V[]) ?? []).map(get).filter(Boolean) as Ent[];
    const body = reps.filter(r => str(args(r)[1]) === 'Body'), pick = body.length ? body : reps;
    return pick.flatMap(r => ((args(r)[3] as V[]) ?? []).flatMap(i => solids(i, place(args(prod)[5]))));
  };


  // ---- fallback geometry: every point of a representation item, in world metres ----
  const profileOutline = (prof: Ent): Vec[] => {
    const pa = args(prof); let pts: Vec[] = [];
    if (/^IFCRECTANGLE(HOLLOW)?PROFILEDEF$/.test(prof.t) || prof.t === 'IFCROUNDEDRECTANGLEPROFILEDEF') { const w = num(pa[3]) * unit / 2, h = num(pa[4]) * unit / 2; pts = [[-w, -h, 0], [w, -h, 0], [w, h, 0], [-w, h, 0]]; }
    else if (prof.t === 'IFCCIRCLEPROFILEDEF' || prof.t === 'IFCCIRCLEHOLLOWPROFILEDEF') { const r = num(pa[3]) * unit; for (let i = 0; i < 12; i++) pts.push([r * Math.cos((i * Math.PI) / 6), r * Math.sin((i * Math.PI) / 6), 0]); }
    else if (prof.t === 'IFCARBITRARYCLOSEDPROFILEDEF' || prof.t === 'IFCARBITRARYPROFILEDEFWITHVOIDS') {
      const cv = get(pa[2]);
      if (cv && cv.t === 'IFCPOLYLINE') pts = ((args(cv)[0] as V[]) ?? []).map(p => pt(p));
      else if (cv && cv.t === 'IFCINDEXEDPOLYCURVE') { const pl = get(args(cv)[0]); pts = (pl ? ((args(pl)[0] as V[]) ?? []) : []).map(c => [num((c as V[])[0]) * unit, num((c as V[])[1]) * unit, 0]); }
    } else if (prof.t.endsWith('PROFILEDEF')) {            // I, L, T, U, C, Z shapes: use their overall box
      const w = Math.max(num(pa[3]), num(pa[4]), 0) * unit / 2, h = Math.max(num(pa[4]), num(pa[3]), 0) * unit / 2; if (w && h) pts = [[-w, -h, 0], [w, -h, 0], [w, h, 0], [-w, h, 0]];
    }
    const pe = prof.t.startsWith('IFCARBITRARY') ? null : get(pa[2]);
    if (pe && pts.length) { const pp = args(pe), loc = get(pp[0]) ? (args(get(pp[0])!)[0] as V[]) : [0, 0], rd = get(pp[1]); const ang = rd ? Math.atan2(num((args(rd)[0] as V[])[1]), num((args(rd)[0] as V[])[0])) : 0, ca = Math.cos(ang), sn = Math.sin(ang); pts = pts.map(p => [p[0] * ca - p[1] * sn + num(loc[0]) * unit, p[0] * sn + p[1] * ca + num(loc[1]) * unit, 0]); }
    return pts;
  };
  const itemPoints = (v: V | undefined, M0: M, depth = 0): Vec[] => {
    const e = get(v); if (!e || depth > 5) return [];
    const a = args(e);
    if (e.t === 'IFCEXTRUDEDAREASOLID') {
      const prof = get(a[0]); if (!prof) return [];
      const T = mul(M0, axis3(a[1])), d = norm(rot(T, dir(a[2], [0, 0, 1]))), len = num(a[3]) * unit, base = profileOutline(prof).map(p => app(T, p));
      return [...base, ...base.map(p => [p[0] + d[0] * len, p[1] + d[1] * len, p[2] + d[2] * len])];
    }
    if (e.t === 'IFCBOOLEANCLIPPINGRESULT' || e.t === 'IFCBOOLEANRESULT') return itemPoints(a[1], M0, depth + 1);
    if (e.t === 'IFCMAPPEDITEM') { const src = get(a[0]); if (!src) return []; const sa = args(src), M1 = mul(mul(M0, operator(a[1])), axis3(sa[0])), rep = get(sa[1]); return rep ? ((args(rep)[3] as V[]) ?? []).flatMap(i => itemPoints(i, M1, depth + 1)) : []; }
    if (e.t === 'IFCTRIANGULATEDFACESET' || e.t === 'IFCPOLYGONALFACESET') {
      const cl = get(a[0]); const lst = cl ? ((args(cl)[0] as V[]) ?? []) : [];
      return lst.map(c => app(M0, [num((c as V[])[0]) * unit, num((c as V[])[1]) * unit, num((c as V[])[2]) * unit]));
    }
    if (e.t === 'IFCFACETEDBREP' || e.t === 'IFCFACETEDBREPWITHVOIDS') {
      const shell = get(a[0]), out: Vec[] = [];
      for (const f of shell ? ((args(shell)[0] as V[]) ?? []) : []) { const fe = get(f); if (!fe) continue; const b0 = get(((args(fe)[0] as V[]) ?? [])[0]); const loop = b0 ? get(args(b0)[0]) : null; if (loop) for (const p of (args(loop)[0] as V[]) ?? []) out.push(app(M0, pt(p))); }
      return out;
    }
    return [];
  };
  const productPoints = (prod: Ent): Vec[] => {
    const pds = get(args(prod)[6]); if (!pds) return [];
    const reps = ((args(pds)[2] as V[]) ?? []).map(get).filter(Boolean) as Ent[];
    const body = reps.filter(r => str(args(r)[1]) === 'Body'), pick = body.length ? body : reps, M0 = place(args(prod)[5]);
    const pts = pick.flatMap(r => ((args(r)[3] as V[]) ?? []).flatMap(i => itemPoints(i, M0)));
    if (pts.length <= 20000) return pts;
    const step = Math.ceil(pts.length / 20000); return pts.filter((_, i) => i % step === 0);
  };
  // smallest oriented rectangle around the plan footprint (convex hull + rotating edges) and the height range
  const fit = (pts: Vec[]) => {
    const P = [...new Map(pts.map(p => [`${p[0].toFixed(3)},${p[1].toFixed(3)}`, [p[0], p[1]]] as [string, number[]])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const hull: number[][] = [];
    for (const half of [P, [...P].reverse()]) { const h: number[][] = []; for (const p of half) { while (h.length >= 2 && cr(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop(); h.push(p); } h.pop(); hull.push(...h); }
    const H = hull.length >= 3 ? hull : P;
    let best = { area: Infinity, ang: 0, x0: 0, x1: 0, y0: 0, y1: 0 };
    for (let i = 0; i < H.length; i++) {
      const a = H[i], b = H[(i + 1) % H.length], ang = Math.atan2(b[1] - a[1], b[0] - a[0]), c = Math.cos(ang), s = Math.sin(ang);
      const xs = H.map(p => p[0] * c + p[1] * s), ys = H.map(p => -p[0] * s + p[1] * c), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), area = (x1 - x0) * (y1 - y0);
      if (area < best.area) best = { area, ang, x0, x1, y0, y1 };
    }
    const c = Math.cos(best.ang), s = Math.sin(best.ang), cx = (best.x0 + best.x1) / 2, cy = (best.y0 + best.y1) / 2;
    let w = best.x1 - best.x0, h = best.y1 - best.y0, ux = [c, s, 0], uy = [-s, c, 0];
    if (h > w) { [w, h] = [h, w]; [ux, uy] = [uy, ux]; }
    const zs = pts.map(p => p[2]);
    return { c: [cx * c - cy * s, cx * s + cy * c], ux, uy, w, h, zmin: Math.min(...zs), zmax: Math.max(...zs) };
  };

  // storeys
  const storeyOf = new Map<number, number | null>(), storeyName = new Map<number, string>();
  for (const [k, e] of E) if (e.t === 'IFCBUILDINGSTOREY') storeyName.set(k, str(args(e)[2]) ?? `Storey ${k}`);
  for (const e of E.values()) if (e.t === 'IFCRELCONTAINEDINSPATIALSTRUCTURE') {
    const a = args(e), st = id(a[5]);
    for (const r of (a[4] as V[]) ?? []) { const k = id(r); if (k !== null) storeyOf.set(k, st !== null && storeyName.has(st) ? st : null); }
  }
  const products: [number, Ent, Kind][] = [];
  const skipped: Record<string, number> = {};
  for (const [k, e] of E) {
    const s = SUPPORTED.find(([re]) => re.test(e.t));
    if (s) products.push([k, e, s[1]]);
  }
  const elevOf = new Map<number, number>();
  for (const [k, e] of E) if (e.t === 'IFCBUILDINGSTOREY') elevOf.set(k, num(args(e)[9]) * unit);
  const storeys: Storey[] = [...storeyName].map(([sid, name]) => ({ id: sid, name, count: products.filter(p => storeyOf.get(p[0]) === sid).length, elevation: elevOf.get(sid) ?? 0 }));
  const loose = products.filter(p => !storeyOf.has(p[0]) || storeyOf.get(p[0]) === null).length;
  if (loose) storeys.push({ id: null, name: 'Not assigned to a storey', count: loose, elevation: 0 });
  storeys.sort((a, b) => b.count - a.count);

  type Raw = { kind: Kind; c: Vec; ux: Vec; uy: Vec; d: Vec; depth: number; w: number; h: number; round: boolean; name: string | null; guid: string | null; ent: Ent; fitted?: boolean; zmax?: number; box?: { x0: number; y0: number; x1: number; y1: number; zmin: number; zmax: number } };
  const BOXES = ['slab', 'roof', 'stair', 'foundation'];

  // exact reading of an extruded solid; returns null when the geometry is something else
  function exactRaw(e: Ent, kind: Kind, name: string | null, guid: string | null): Raw | null {
    const s = bodySolids(e)[0]; if (!s) return null;
    const sa = args(s.e), prof = get(sa[0]); if (!prof) return null;
    const pa = args(prof); let cx = 0, cy = 0, ang = 0, w = 0, h = 0, round = false;
    if (/^IFCRECTANGLE(HOLLOW)?PROFILEDEF$/.test(prof.t) || prof.t === 'IFCROUNDEDRECTANGLEPROFILEDEF') { w = num(pa[3]) * unit; h = num(pa[4]) * unit; }
    else if (prof.t === 'IFCCIRCLEPROFILEDEF' || prof.t === 'IFCCIRCLEHOLLOWPROFILEDEF') { w = h = 2 * num(pa[3]) * unit; round = true; }
    else if (prof.t === 'IFCARBITRARYCLOSEDPROFILEDEF' || prof.t === 'IFCARBITRARYPROFILEDEFWITHVOIDS') {
      const ps = profileOutline(prof); if (ps.length < 3) return null;
      const xs = ps.map(p => p[0]), ys = ps.map(p => p[1]);
      w = Math.max(...xs) - Math.min(...xs); h = Math.max(...ys) - Math.min(...ys); cx = (Math.max(...xs) + Math.min(...xs)) / 2; cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    } else return null;
    if (pa[2] && !prof.t.startsWith('IFCARBITRARY')) {
      const pe = get(pa[2]);
      if (pe) { const pp = args(pe), loc = get(pp[0]) ? (args(get(pp[0])!)[0] as V[]) : [0, 0]; cx = num(loc[0]) * unit; cy = num(loc[1]) * unit; const rd = get(pp[1]); if (rd) { const rc = args(rd)[0] as V[]; ang = Math.atan2(num(rc[1]), num(rc[0])); } }
    }
    const T = mul(s.M, axis3(sa[1])), ca = Math.cos(ang), sn = Math.sin(ang);
    return { kind, c: app(T, [cx, cy, 0]), ux: rot(T, [ca, sn, 0]), uy: rot(T, [-sn, ca, 0]), d: norm(rot(T, dir(sa[2], [0, 0, 1]))), depth: num(sa[3]) * unit, w, h, round, name, guid, ent: e };
  }
  // fallback: bounding box fitted around meshes, B-reps and unusual profiles
  function fittedRaw(e: Ent, kind: Kind, name: string | null, guid: string | null): Raw | null {
    const pts = productPoints(e); if (pts.length < 3) return null;
    const zs = pts.map(p => p[2]), zmin = Math.min(...zs), zmax = Math.max(...zs);
    if (BOXES.includes(kind)) { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return { kind, c: [0, 0, zmin], ux: [1, 0, 0], uy: [0, 1, 0], d: [0, 0, 1], depth: zmax - zmin, w: 0, h: 0, round: false, name, guid, ent: e, fitted: true, box: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), zmin, zmax } }; }
    const f = fit(pts), base = { kind, name, guid, ent: e, round: false, fitted: true, zmax };
    if (kind === 'wall' || kind === 'column') return { ...base, c: [f.c[0], f.c[1], zmin], ux: f.ux, uy: f.uy, d: [0, 0, 1], depth: zmax - zmin, w: f.w, h: f.h };
    if (kind === 'beam' || kind === 'duct' || kind === 'pipe') return { ...base, c: [f.c[0] - (f.ux[0] * f.w) / 2, f.c[1] - (f.ux[1] * f.w) / 2, (zmin + zmax) / 2], ux: [f.uy[0], f.uy[1], 0], uy: [0, 0, 1], d: [f.ux[0], f.ux[1], 0], depth: f.w, w: f.h, h: zmax - zmin };
    return { ...base, c: [f.c[0], f.c[1], zmin], ux: f.ux, uy: f.uy, d: [0, 0, 1], depth: zmax - zmin, w: f.w, h: f.h };            // door, window
  }

  function extract(storeyId: number | null, shift?: [number, number]): IfcResult {
    const out: ImportedEl[] = [], skip: Record<string, number> = {}, nt: string[] = [];
    const bump = (k: string) => (skip[k] = (skip[k] ?? 0) + 1);
    for (const [k, e] of E) if (SKIP.test(e.t) && (storeyOf.get(k) ?? null) === storeyId && !e.t.startsWith('IFCOPENING')) bump(e.t.replace(/^IFC/, '').toLowerCase());
    const raws: Raw[] = []; let usedFit = 0;
    for (const [k, e, kind] of products) {
      if ((storeyOf.get(k) ?? null) !== storeyId) continue;
      const a = args(e), name = str(a[2]), guid = str(a[0]);
      let r = BOXES.includes(kind) ? null : exactRaw(e, kind, name, guid);
      if (!r) { r = fittedRaw(e, kind, name, guid); if (r) usedFit++; }
      if (!r && (kind === 'door' || kind === 'window')) r = { kind, c: place(a[5]).t, ux: [1, 0, 0], uy: [0, 1, 0], d: [0, 0, 1], depth: 0, w: 0, h: 0, round: false, name, guid, ent: e };
      if (!r) { bump(`${kind} (no readable geometry)`); continue; }
      raws.push(r);
    }
    if (usedFit) nt.push(`${usedFit} element${usedFit > 1 ? 's' : ''} had mesh or unusual geometry and were fitted with a bounding box.`);
    // base level from vertical elements, so heights and elevations are relative to the floor
    const baseZ = raws.filter(r => (r.kind === 'wall' || r.kind === 'column') && Math.abs(r.d[2]) > 0.9).map(r => (r.d[2] > 0 ? r.c[2] : r.c[2] - r.depth));
    const anyZ = raws.map(r => (r.box ? r.box.zmin : r.c[2]));
    const z0 = baseZ.length ? Math.min(...baseZ) : anyZ.length ? Math.min(...anyZ) : 0;
    const wallIdx: Record<number, number> = {}, walls: { a: Vec; b: Vec }[] = []; let wallHeight = 0;
    for (const r of raws) {
      const props = { ifc_guid: r.guid, ifc_name: r.name }, vertical = Math.abs(r.d[2]) > 0.9;
      if (r.box) {
        const b = r.box; out.push({ kind: r.kind, fitted: true, geometry: { rect: [r2(b.x0), r2(b.y0), r2(b.x1), r2(b.y1)], z0: r2(b.zmin - z0), z1: r2(b.zmax - z0) }, props }); continue;
      }
      if (r.kind === 'wall') {
        if (!vertical || r.depth < 0.5) { bump('wall (not a vertical extrusion)'); continue; }
        const along = r.w >= r.h ? r.ux : r.uy, len = Math.max(r.w, r.h), th = Math.min(r.w, r.h), a = [r.c[0] - along[0] * len / 2, r.c[1] - along[1] * len / 2, 0], b = [r.c[0] + along[0] * len / 2, r.c[1] + along[1] * len / 2, 0];
        walls.push({ a, b }); wallIdx[walls.length - 1] = out.length; wallHeight = Math.max(wallHeight, r.depth);
        out.push({ kind: 'wall', fitted: r.fitted, geometry: { start: [a[0], a[1]], end: [b[0], b[1]], height: r2(Math.max(r.depth, 0.5)), ...(th >= 0.05 && th <= 1.5 ? { thickness: r2(th) } : {}) }, props });
      } else if (r.kind === 'column') {
        if (!vertical) { bump('column (not a vertical extrusion)'); continue; }
        const swap = Math.abs(r.ux[0]) < 0.5, b = swap ? r.h : r.w, h = swap ? r.w : r.h;
        out.push({ kind: 'column', fitted: r.fitted, geometry: { at: [r.c[0], r.c[1]], b: r2(b), h: r2(h), height: r2(r.depth) }, section: { b_mm: Math.round(b * 1000), h_mm: Math.round(h * 1000) }, props });
      } else if (r.kind === 'beam' || r.kind === 'duct' || r.kind === 'pipe') {
        if (Math.abs(r.d[2]) > 0.3 || r.depth < 0.05) { bump(`${r.kind} (not a horizontal run)`); continue; }
        const s = [r.c[0], r.c[1]], e2 = [r.c[0] + r.d[0] * r.depth, r.c[1] + r.d[1] * r.depth];
        const hDim = Math.abs(r.ux[2]) > Math.abs(r.uy[2]) ? r.w : r.h, wDim = hDim === r.w ? r.h : r.w, top = r.fitted ? r.zmax! : r.c[2] + hDim / 2;
        if (r.kind === 'beam') out.push({ kind: 'beam', fitted: r.fitted, geometry: { start: s, end: e2, top_m: r2(top - z0), b_mm: Math.round(wDim * 1000), h_mm: Math.round(hDim * 1000) }, section: { b_mm: Math.round(wDim * 1000), h_mm: Math.round(hDim * 1000) }, props });
        else if (r.kind === 'duct') out.push({ kind: 'duct', fitted: r.fitted, geometry: { start: s, end: e2, elevation_m: r2(r.c[2] - z0) }, section: { w_mm: Math.round(wDim * 1000), h_mm: Math.round(hDim * 1000) }, props });
        else out.push({ kind: 'pipe', fitted: r.fitted, geometry: { start: s, end: e2, elevation_m: r2(r.c[2] - z0) }, section: { dia_mm: Math.round(Math.max(r.w, r.h) * 1000) }, props });
      }
    }
    for (const r of raws) if (r.kind === 'door' || r.kind === 'window') {
      const a = args(r.ent), width = num(a[9]) * unit || Math.max(r.w, r.h) || (r.kind === 'door' ? 0.9 : 1.2);
      let best = -1, bd = 0.6, off = 0;
      walls.forEach((w, i) => {
        const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], len = Math.hypot(dx, dy) || 1, t = Math.max(0, Math.min(1, ((r.c[0] - w.a[0]) * dx + (r.c[1] - w.a[1]) * dy) / (len * len)));
        const dist = Math.hypot(r.c[0] - (w.a[0] + t * dx), r.c[1] - (w.a[1] + t * dy));
        if (dist < bd) { bd = dist; best = i; off = t * len; }
      });
      if (best < 0) { bump(`${r.kind} (no host wall found)`); continue; }
      const wl = Math.hypot(walls[best].b[0] - walls[best].a[0], walls[best].b[1] - walls[best].a[1]);
      if (width > wl) { bump(`${r.kind} (wider than its wall)`); continue; }
      out.push({ kind: r.kind, wallIdx: wallIdx[best], geometry: { offset_m: r2(Math.max(width / 2, Math.min(wl - width / 2, off))), width_m: r2(width) }, props: { ifc_guid: str(a[0]), ifc_name: str(a[2]) } });
    }
    const xs: number[] = [], ys: number[] = [];
    for (const e of out) { const g = e.geometry; for (const p of [g.start, g.end, g.at]) if (p) { xs.push(p[0]); ys.push(p[1]); } if (g.rect) { xs.push(g.rect[0], g.rect[2]); ys.push(g.rect[1], g.rect[3]); } }
    const min: [number, number] = [xs.length ? Math.min(...xs) : 0, ys.length ? Math.min(...ys) : 0];
    const res: IfcResult = { elements: out, skipped: skip, notes: nt, extent: [0, 0], min, wallHeight };
    shiftResult(res, shift ? shift[0] : 1 - min[0], shift ? shift[1] : 1 - min[1]);
    if (unit !== 1) nt.push(`File units converted to metres (×${unit}).`);
    return res;
  }
  // move a result by (dx, dy) and refresh its extent and size warning
  function shiftResult(res: IfcResult, dx: number, dy: number) {
    const xs: number[] = [], ys: number[] = [];
    for (const e of res.elements) {
      const g = e.geometry;
      for (const key of ['start', 'end', 'at']) if (g[key]) { g[key] = [r2(g[key][0] + dx), r2(g[key][1] + dy)]; xs.push(g[key][0]); ys.push(g[key][1]); }
      if (g.rect) { g.rect = [r2(g.rect[0] + dx), r2(g.rect[1] + dy), r2(g.rect[2] + dx), r2(g.rect[3] + dy)]; xs.push(g.rect[0], g.rect[2]); ys.push(g.rect[1], g.rect[3]); }
    }
    res.extent = [xs.length ? r2(Math.max(...xs)) : 0, ys.length ? r2(Math.max(...ys)) : 0];
    res.notes = res.notes.filter(n => !n.startsWith('The model is'));
    if (Math.max(...res.extent) > 118) res.notes.push(`The model is ${res.extent[0]} × ${res.extent[1]} m, larger than the 120 m plan canvas. Part of it will be off screen on the plan (the 3D view shows all of it).`);
  }
  // every storey with a shared plan origin, elevations from the file and heights from the gaps between floors
  function extractAll() {
    const sts = storeys.filter(s => s.count > 0).map(s => ({ s, r: extract(s.id, [0, 0]) })).filter(p => p.r.elements.length);
    const gx = Math.min(...sts.map(p => p.r.min[0])), gy = Math.min(...sts.map(p => p.r.min[1]));
    sts.forEach(p => shiftResult(p.r, 1 - gx, 1 - gy));
    let elev = sts.map(p => p.s.elevation); const lo = Math.min(...elev);
    elev = elev.map(e => e - lo);
    const order = sts.map((_, i) => i).sort((a, b) => elev[a] - elev[b]);
    if (new Set(elev.map(e => e.toFixed(2))).size < sts.length) order.forEach((i, rank) => (elev[i] = rank * (Math.max(0, ...sts.map(p => p.r.wallHeight)) || 3.6)));
    const out = order.map((i, rank) => {
      const next = order[rank + 1], h = next !== undefined ? Math.max(2, elev[next] - elev[i]) : Math.max(sts[i].r.wallHeight, 3);
      return { name: sts[i].s.name, elevation_m: r2(elev[i]), height_m: r2(h), result: sts[i].r };
    });
    const skipped: Record<string, number> = {}; const notes = new Set<string>();
    out.forEach(o => { Object.entries(o.result.skipped).forEach(([k, v]) => (skipped[k] = (skipped[k] ?? 0) + v)); o.result.notes.forEach(n => notes.add(n)); });
    return { stories: out, skipped, notes: [...notes] };
  }
  return { storeys, extract, extractAll, notes };
}
