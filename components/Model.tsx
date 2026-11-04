import { useMemo } from 'react';
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Path, Shape } from 'three';
import { isPitched, roofFaces, roofThickness } from '../lib/roof';
import { beamSec, stairSteps, wallT } from '../lib/model';

export type El = { id: string; type: string; geometry: any; library_item_id: string | null; story_id?: string | null };
export type Lib = { id: string; specs: any };
type Pt = [number, number];
// a roof face as a thin prism: the top polygon, the same polygon one thickness lower, and the sides
function prism(face: number[][], t: number) {
  const pos: number[] = [], v = (p: number[], dz = 0) => [p[0], p[2] - dz, p[1]];
  const tri = (a: number[], b: number[], c: number[]) => pos.push(...a, ...b, ...c);
  for (let i = 1; i < face.length - 1; i++) { tri(v(face[0]), v(face[i]), v(face[i + 1])); tri(v(face[0], t), v(face[i + 1], t), v(face[i], t)); }
  for (let i = 0; i < face.length; i++) { const a = face[i], b = face[(i + 1) % face.length]; tri(v(a), v(b), v(b, t)); tri(v(a), v(b, t), v(a, t)); }
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
}
const BOX: Record<string, string> = { slab: '#cdd5da', roof: '#b9a99a', stair: '#9aa8b1', foundation: '#8a8f94' };

// One storey of the model as 3D meshes (plan x/y metres -> x, up, z). Shared by native and web scenes.
export default function Model({ els, lib, storeyH, center }: { els: El[]; lib: Record<string, Lib>; storeyH: number; center: Pt }) {
  const items = useMemo(() => {
    const walls = els.filter(e => e.type === 'wall'), wallById = Object.fromEntries(walls.map(x => [x.id, x]));
    const seg = (a: Pt, b: Pt) => ({ len: Math.hypot(b[0] - a[0], b[1] - a[1]), ang: -Math.atan2(b[1] - a[1], b[0] - a[0]) });
    const out: JSX.Element[] = [];
    for (const e of els) {
      const g = e.geometry, spec = lib[e.library_item_id ?? '']?.specs ?? {};
      if (e.type === 'wall') {
        const { len, ang } = seg(g.start, g.end);
        out.push(<mesh key={e.id} position={[(g.start[0] + g.end[0]) / 2, g.height / 2, (g.start[1] + g.end[1]) / 2]} rotation={[0, ang, 0]}><boxGeometry args={[len, g.height, wallT(g)]} /><meshStandardMaterial color="#aab6e8" /></mesh>);
      } else if (e.type === 'column') {
        const b = (spec.b_mm ?? g.b * 1000) / 1000, h = (spec.h_mm ?? g.h * 1000) / 1000;
        out.push(<mesh key={e.id} position={[g.at[0], g.height / 2, g.at[1]]}><boxGeometry args={[b, g.height, h]} /><meshStandardMaterial color="#c98a00" /></mesh>);
      } else if (e.type === 'beam') {
        const { len, ang } = seg(g.start, g.end), { b: bw, d: bd } = beamSec(g, spec), top = g.top_m ?? storeyH;
        out.push(<mesh key={e.id} position={[(g.start[0] + g.end[0]) / 2, top - bd / 2, (g.start[1] + g.end[1]) / 2]} rotation={[0, ang, 0]}><boxGeometry args={[len, bd, bw]} /><meshStandardMaterial color="#e0a100" /></mesh>);
      } else if (e.type === 'duct' || e.type === 'pipe') {
        const { len, ang } = seg(g.start, g.end), isD = e.type === 'duct';
        const w = (isD ? g.w_mm ?? spec.w_mm ?? 600 : g.dia_mm ?? spec.dia_mm ?? 110) / 1000, h = (isD ? g.h_mm ?? spec.h_mm ?? 300 : g.dia_mm ?? spec.dia_mm ?? 110) / 1000, c = g.elevation_m ?? (isD ? 3.15 : 3.2);
        out.push(<mesh key={e.id} position={[(g.start[0] + g.end[0]) / 2, c, (g.start[1] + g.end[1]) / 2]} rotation={[0, ang, 0]}><boxGeometry args={[len, h, w]} /><meshStandardMaterial color={isD ? '#0c9a87' : '#0b6b8a'} /></mesh>);
      } else if (e.type === 'door' || e.type === 'window') {
        const wl = wallById[g.wall_id]; if (!wl) continue;
        const [a, b] = [wl.geometry.start as Pt, wl.geometry.end as Pt], { len, ang } = seg(a, b);
        const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len, oh = e.type === 'door' ? 2.1 : 1.2, sill = e.type === 'door' ? 0 : 0.9;
        out.push(<mesh key={e.id} position={[a[0] + ux * g.offset_m, sill + oh / 2, a[1] + uz * g.offset_m]} rotation={[0, ang, 0]}><boxGeometry args={[g.width_m, oh, wallT(wl.geometry) + 0.06]} /><meshStandardMaterial color={e.type === 'door' ? '#1a8f4d' : '#4fd1c5'} transparent opacity={e.type === 'door' ? 1 : 0.7} /></mesh>);
      } else if (e.type === 'equipment' && g.at) {
        out.push(<mesh key={e.id} position={[g.at[0], 0.5, g.at[1]]}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#0a6f61" /></mesh>);
      } else if (e.type === 'fixture' && g.at) {
        out.push(<mesh key={e.id} position={[g.at[0], storeyH - 0.2, g.at[1]]}><boxGeometry args={[0.6, 0.1, 0.6]} /><meshStandardMaterial color="#7fe0d2" /></mesh>);
      } else if (e.type === 'stair' && g.rect) {
        // a flight of boxes rising along the longer side of the footprint
        const [x0, y0, x1, y1] = g.rect as number[], n = stairSteps(g), z0 = g.z0 ?? 0, z1 = g.z1 ?? storeyH, rise = (z1 - z0) / n, alongX = Math.abs(x1 - x0) >= Math.abs(y1 - y0), flip = g.flip ? -1 : 1;
        for (let i = 0; i < n; i++) {
          const f0 = i / n, f1 = (i + 1) / n, a = flip > 0 ? f0 : 1 - f1, b = flip > 0 ? f1 : 1 - f0, h = rise * (i + 1);
          const sx0 = alongX ? x0 + (x1 - x0) * a : x0, sx1 = alongX ? x0 + (x1 - x0) * b : x1, sy0 = alongX ? y0 : y0 + (y1 - y0) * a, sy1 = alongX ? y1 : y0 + (y1 - y0) * b;
          out.push(<mesh key={e.id + i} position={[(sx0 + sx1) / 2, z0 + h / 2, (sy0 + sy1) / 2]}><boxGeometry args={[Math.abs(sx1 - sx0), h, Math.abs(sy1 - sy0)]} /><meshStandardMaterial color={BOX.stair} /></mesh>);
        }
      } else if (e.type === 'roof' && isPitched(g)) {
        const t = roofThickness(g);
        roofFaces(g).forEach((f, i) => out.push(<mesh key={e.id + 'f' + i} geometry={prism(f, t)}><meshStandardMaterial color={BOX.roof} side={DoubleSide} /></mesh>));
      } else if (BOX[e.type] && (e.type === 'slab' || e.type === 'roof') && ((Array.isArray(g.holes) && g.holes.length) || (Array.isArray(g.rounds) && g.rounds.length)) && (g.poly?.length >= 3 || g.rect)) {
        const z0 = g.z0 ?? 0, z1 = g.z1 ?? 0.2, outer: number[][] = g.poly?.length >= 3 ? g.poly : [[g.rect[0], g.rect[1]], [g.rect[2], g.rect[1]], [g.rect[2], g.rect[3]], [g.rect[0], g.rect[3]]], sh = new Shape();
        outer.forEach((q, i) => (i ? sh.lineTo(q[0], -q[1]) : sh.moveTo(q[0], -q[1])));
        for (const q of (g.rounds ?? []) as { c: number[]; r: number }[]) { const pc = new Path(); pc.absarc(q.c[0], -q.c[1], q.r, 0, Math.PI * 2, false); sh.holes.push(pc); }
        for (const h of (g.holes ?? []) as number[][]) { const ph = new Path(); ph.moveTo(h[0], -h[1]); ph.lineTo(h[2], -h[1]); ph.lineTo(h[2], -h[3]); ph.lineTo(h[0], -h[3]); ph.closePath(); sh.holes.push(ph); }
        out.push(<mesh key={e.id} position={[0, z0, 0]} rotation={[-Math.PI / 2, 0, 0]}><extrudeGeometry args={[sh, { depth: Math.max(z1 - z0, 0.02), bevelEnabled: false }]} /><meshStandardMaterial color={BOX[e.type]} transparent opacity={e.type === 'slab' ? 0.75 : 1} /></mesh>);
      } else if (BOX[e.type] && g.poly && g.poly.length >= 3) {
        const z0 = g.z0 ?? 0, z1 = g.z1 ?? 0.2, sh = new Shape(); (g.poly as number[][]).forEach((q, i) => (i ? sh.lineTo(q[0], -q[1]) : sh.moveTo(q[0], -q[1])));
        out.push(<mesh key={e.id} position={[0, z0, 0]} rotation={[-Math.PI / 2, 0, 0]}><extrudeGeometry args={[sh, { depth: Math.max(z1 - z0, 0.02), bevelEnabled: false }]} /><meshStandardMaterial color={BOX[e.type]} transparent opacity={e.type === 'slab' ? 0.75 : 1} /></mesh>);
      } else if (BOX[e.type] && g.rect) {
        const [x0, y0, x1, y1] = g.rect as number[], z0 = g.z0 ?? 0, z1 = g.z1 ?? 0.2;
        out.push(<mesh key={e.id} position={[(x0 + x1) / 2, (z0 + z1) / 2, (y0 + y1) / 2]}><boxGeometry args={[Math.abs(x1 - x0), Math.max(z1 - z0, 0.02), Math.abs(y1 - y0)]} /><meshStandardMaterial color={BOX[e.type]} transparent opacity={e.type === 'slab' ? 0.75 : 1} /></mesh>);
      }
    }
    return out;
  }, [els, lib, storeyH]);
  return <group position={[-center[0], 0, -center[1]]}>{items}</group>;
}
