import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Color } from 'three';
import { featureEdges, type Mesh } from '../lib/solid';
import type { Q } from '../lib/orbit';
import Studio from './Studio';
import { partLook, paintFor, vehicleColor } from '../lib/materials';

type P = { mesh: Mesh; quat: Q; zoom: number; name?: string; density?: number; vehicle?: boolean };

// Flat-shaded solid with its sharp edges drawn, as in a CAD viewport. The part is modelled Z up; the scene is Y up.
export default function PartScene({ mesh, quat, zoom, name = '', density = 7850, vehicle = false }: P) {
  const look = partLook(density);
  const { geo, edges, c, r } = useMemo(() => {
    const pos = new Float32Array(mesh.f.length * 3); let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    mesh.f.forEach((vi, k) => { for (let a = 0; a < 3; a++) { const x = mesh.v[vi * 3 + a]; pos[k * 3 + a] = x; lo[a] = Math.min(lo[a], x); hi[a] = Math.max(hi[a], x); } });
    const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(pos, 3)); g.computeVertexNormals();
    if (vehicle) { const paint = paintFor(name), n = g.getAttribute('normal'), col = new Float32Array(mesh.f.length * 3), z0 = lo[2], dz = Math.max(hi[2] - lo[2], 1e-6); for (let k = 0; k < mesh.f.length; k += 3) { const zc = (pos[k * 3 + 2] + pos[k * 3 + 5] + pos[k * 3 + 8]) / 3, c = new Color(vehicleColor([n.getX(k), n.getY(k), n.getZ(k)], (zc - z0) / dz, paint)); for (let j = 0; j < 3; j++) { col[(k + j) * 3] = c.r; col[(k + j) * 3 + 1] = c.g; col[(k + j) * 3 + 2] = c.b; } } g.setAttribute('color', new BufferAttribute(col, 3)); }
    const cc = lo.map((v, i) => (v + hi[i]) / 2), rr = Math.max(1, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2);
    const ev = featureEdges(mesh, 30), eg = new BufferGeometry(); eg.setAttribute('position', new BufferAttribute(new Float32Array(ev), 3));
    return { geo: g, edges: ev.length ? eg : null, c: cc, r: rr };
  }, [mesh, vehicle, name]);
  return (
    <Canvas camera={{ position: [0, 0, 130], fov: 45, near: 1, far: 2000 }}>
      <Studio />
      <ambientLight intensity={0.3} />
      <directionalLight position={[40, 120, 80]} intensity={2.2} />
      <directionalLight position={[-80, 40, -80]} intensity={0.6} />
      <group quaternion={quat} scale={(zoom * 40) / r}>
        <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <group position={[-c[0], -c[1], -c[2]]}>
            <mesh geometry={geo}>{vehicle ? <meshPhysicalMaterial vertexColors metalness={0.45} roughness={0.28} clearcoat={1} clearcoatRoughness={0.08} envMapIntensity={1.4} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} /> : <meshStandardMaterial color={look.color} metalness={look.metal} roughness={look.rough} envMapIntensity={1.5} flatShading polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />}</mesh>
            {edges && !vehicle && <lineSegments geometry={edges}><lineBasicMaterial color="#0a2e1f" /></lineSegments>}
          </group>
        </group>
      </group>
    </Canvas>
  );
}
