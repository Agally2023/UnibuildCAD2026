import { useMemo } from 'react';
import { beamSec, wallT } from '../lib/model';

export type El = { id: string; type: string; geometry: any; library_item_id: string | null; story_id?: string | null };
export type Lib = { id: string; specs: any };
type Pt = [number, number];
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
      } else if (BOX[e.type] && g.rect) {
        const [x0, y0, x1, y1] = g.rect as number[], z0 = g.z0 ?? 0, z1 = g.z1 ?? 0.2;
        out.push(<mesh key={e.id} position={[(x0 + x1) / 2, (z0 + z1) / 2, (y0 + y1) / 2]}><boxGeometry args={[Math.abs(x1 - x0), Math.max(z1 - z0, 0.02), Math.abs(y1 - y0)]} /><meshStandardMaterial color={BOX[e.type]} transparent opacity={e.type === 'slab' ? 0.75 : 1} /></mesh>);
      }
    }
    return out;
  }, [els, lib, storeyH]);
  return <group position={[-center[0], 0, -center[1]]}>{items}</group>;
}
