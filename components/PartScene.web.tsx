import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, EdgesGeometry } from 'three';
import type { Mesh } from '../lib/solid';
import type { Q } from '../lib/orbit';

type P = { mesh: Mesh; quat: Q; zoom: number };

// Flat-shaded solid with its sharp edges drawn, as in a CAD viewport. The part is modelled Z up; the scene is Y up.
export default function PartScene({ mesh, quat, zoom }: P) {
  const { geo, edges, c, r } = useMemo(() => {
    const pos = new Float32Array(mesh.f.length * 3); let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    mesh.f.forEach((vi, k) => { for (let a = 0; a < 3; a++) { const x = mesh.v[vi * 3 + a]; pos[k * 3 + a] = x; lo[a] = Math.min(lo[a], x); hi[a] = Math.max(hi[a], x); } });
    const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(pos, 3)); g.computeVertexNormals();
    const cc = lo.map((v, i) => (v + hi[i]) / 2), rr = Math.max(1, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2);
    return { geo: g, edges: pos.length ? new EdgesGeometry(g, 30) : null, c: cc, r: rr };
  }, [mesh]);
  return (
    <Canvas camera={{ position: [0, 0, r * 3.2], fov: 45, near: r / 100, far: r * 40 }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[r, r * 3, r * 2]} intensity={1.2} />
      <directionalLight position={[-r * 2, -r, -r * 2]} intensity={0.5} />
      <group quaternion={quat} scale={zoom}>
        <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <group position={[-c[0], -c[1], -c[2]]}>
            <mesh geometry={geo}><meshStandardMaterial color="#8fb7a1" metalness={0.15} roughness={0.55} flatShading /></mesh>
            {edges && <lineSegments geometry={edges}><lineBasicMaterial color="#0a2e1f" /></lineSegments>}
          </group>
        </group>
      </group>
    </Canvas>
  );
}
