import { useMemo } from 'react';
import { BufferGeometry, BufferAttribute, ConeGeometry, CylinderGeometry, DoubleSide, IcosahedronGeometry, Color } from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import RealMat from './RealMat';
import { crown, tiers, fronds, lean, noise3, trunkHeight, trunkRadius, type TreeKind } from '../lib/trees';
import { hsl, toHex } from '../lib/materials';

// A tree drawn as organic geometry: lumpy crowns, drooping conifer skirts, leaning palms with arching fronds. Textures come from the
// foliage and bark materials, so the leaves are rough and mottled rather than smooth polygons.
function lumpy(g: BufferGeometry, amp: number, freq: number, seed: number): BufferGeometry {
  g.deleteAttribute('normal'); g.deleteAttribute('uv'); const m = mergeVertices(g, 1e-4), p = m.getAttribute('position');
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), l = Math.hypot(x, y, z) || 1, n = noise3(x * freq, y * freq, z * freq, seed) * 0.6 + noise3(x * freq * 2.3, y * freq * 2.3, z * freq * 2.3, seed + 7) * 0.4, k = 1 + amp * n; p.setXYZ(i, x * k, y * k, z * k); void l; }
  m.computeVertexNormals(); return m;
}
const shadeOf = (base: string, s: number) => { const [h, sat, l] = hsl(base); const c = new Color().setHSL(h / 360, Math.min(1, sat), Math.max(0.05, Math.min(0.9, l + s * 0.07))); return toHex([c.r, c.g, c.b]); };
const BARK = '#6b4d33';

export default function Tree({ g }: { g: any }) {
  const kind: TreeKind = g.kind ?? 'round', z0 = g.z0 ?? 0, h = Math.max(0.3, (g.z1 ?? 4) - z0), r = g.r ?? 1.5, seed = g.seed ?? Math.round((g.at?.[0] ?? 0) * 7.3 + (g.at?.[1] ?? 0) * 3.1), col = g.color ?? '#3f8a3a';
  const parts = useMemo(() => {
    const out: { key: string; geo: BufferGeometry; pos: [number, number, number]; rot?: [number, number, number]; scale?: [number, number, number]; color: string; bark?: boolean; double?: boolean }[] = [];
    const t0 = trunkHeight(kind, h), tr = trunkRadius(kind, h, r);
    if (kind === 'round' || kind === 'cypress') {
      const trunk = lumpy(new CylinderGeometry(tr * 0.7, tr * 1.25, t0 * 1.15, 10, 5), 0.12, 2, seed); out.push({ key: 'tr', geo: trunk, pos: [0, t0 * 0.575, 0], color: BARK, bark: true });
      if (kind === 'round') for (let i = 0; i < 3; i++) { const a = i * 2.1 + seed, lim = lumpy(new CylinderGeometry(tr * 0.25, tr * 0.5, t0 * 0.9, 6, 2), 0.1, 2, seed + i); out.push({ key: 'br' + i, geo: lim, pos: [Math.cos(a) * t0 * 0.28, t0 * 1.02, Math.sin(a) * t0 * 0.28], rot: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5], color: BARK, bark: true }); }
    }
    if (kind === 'round' || kind === 'cypress' || kind === 'shrub') {
      crown(kind, h, r, seed).forEach((b, i) => out.push({ key: 'b' + i, geo: lumpy(new IcosahedronGeometry(1, 3), kind === 'cypress' ? 0.16 : 0.3, 1.6, seed + i), pos: [b.c[0], b.c[2], b.c[1]], scale: [b.r[0], b.r[2], b.r[1]], color: shadeOf(col, b.shade) }));
    }
    if (kind === 'pine') {
      out.push({ key: 'tr', geo: lumpy(new CylinderGeometry(tr * 0.45, tr * 1.2, h * 0.95, 8, 6), 0.1, 2, seed), pos: [0, h * 0.475, 0], color: BARK, bark: true });
      tiers(h, r, seed).forEach((t, i) => { const c = new ConeGeometry(t.r, t.h, 30, 4, true); const p = c.getAttribute('position'); for (let k = 0; k < p.count; k++) { const x = p.getX(k), y = p.getY(k), z = p.getZ(k), f = (0.5 - y / t.h), n = noise3(x * 0.9, y * 0.9, z * 0.9, seed + i); p.setXYZ(k, x * (1 + 0.12 * n), y - f * f * t.h * 0.3, z * (1 + 0.12 * n)); } c.deleteAttribute('uv'); const m = mergeVertices(c, 1e-4); m.computeVertexNormals(); out.push({ key: 't' + i, geo: m, pos: [0, t.z + t.h / 2, 0], color: shadeOf(col, t.shade), double: true }); });
    }
    if (kind === 'palm') {
      const n = 9; for (let i = 0; i < n; i++) { const f0 = i / n, f1 = (i + 1) / n, a = lean(h, seed, f0), b = lean(h, seed, f1), seg = new CylinderGeometry(tr * (1 - f1 * 0.45), tr * (1 - f0 * 0.45), (h * 0.92) / n * 1.06, 9, 1); out.push({ key: 'p' + i, geo: lumpy(seg, 0.06, 3, seed + i), pos: [(a[0] + b[0]) / 2, ((f0 + f1) / 2) * h * 0.92, (a[1] + b[1]) / 2], rot: [(b[1] - a[1]) / ((h * 0.92) / n) * -1, 0, (b[0] - a[0]) / ((h * 0.92) / n)], color: BARK, bark: true }); }
      const top = lean(h, seed, 1);
      fronds(h, r, seed).forEach((f, i) => {
        const seg = 8, pos: number[] = [], idx: number[] = [], wmax = r * 0.14;
        for (let s = 0; s <= seg; s++) { const t = s / seg, d = f.len * t, z = f.lift * f.len * Math.sin(Math.PI * Math.min(1, t * 1.1)) * 0.9 - f.droop * f.len * t * t, w = wmax * Math.sin(Math.PI * (0.12 + 0.88 * (1 - t))) * (1 - 0.3 * t); const ca = Math.cos(f.a), sa = Math.sin(f.a); pos.push(ca * d - sa * w, z, sa * d + ca * w, ca * d + sa * w, z, sa * d - ca * w); }
        for (let s = 0; s < seg; s++) { const a = s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        const gg = new BufferGeometry(); gg.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3)); gg.setIndex(idx); gg.computeVertexNormals();
        out.push({ key: 'f' + i, geo: gg, pos: [top[0], h * 0.92 + 0.1, top[1]], color: shadeOf(col, (i % 3) - 1), double: true });
      });
      for (let i = 0; i < 3; i++) out.push({ key: 'c' + i, geo: new IcosahedronGeometry(0.16, 1), pos: [top[0] + Math.cos(i * 2.1) * 0.22, h * 0.92 - 0.1, top[1] + Math.sin(i * 2.1) * 0.22], color: '#7a5a2b' });
    }
    return out;
  }, [kind, h, r, seed, col]);
  return <group position={[g.at[0], z0, g.at[1]]}>{parts.map(p => <mesh key={p.key} geometry={p.geo} position={p.pos} rotation={p.rot} scale={p.scale} castShadow receiveShadow><RealMat kind={p.bark ? 'bark' : 'foliage'} color={p.color} side={p.double ? DoubleSide : undefined} /></mesh>)}</group>;
}
