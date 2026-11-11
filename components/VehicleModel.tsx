import { useMemo } from 'react';
import { BufferAttribute, BufferGeometry, CanvasTexture, DoubleSide } from 'three';
import type { VPart, VMat } from '../lib/vmodel';

// Physically based materials for each vehicle part: clear-coated metallic paint, tinted glass, rubber, aluminium, chrome, lamps.
const MATS: Record<VMat, { color: string; metalness: number; roughness: number; env: number; clearcoat?: number; opacity?: number; emissive?: string; ei?: number }> = {
  paint: { color: '#ffffff', metalness: 0.55, roughness: 0.28, env: 1.4, clearcoat: 1 },
  glass: { color: '#0b1620', metalness: 0.2, roughness: 0.03, env: 2.4, clearcoat: 1, opacity: 0.62 },
  rubber: { color: '#151515', metalness: 0, roughness: 0.92, env: 0.25 },
  rim: { color: '#cfd3d9', metalness: 1, roughness: 0.2, env: 1.7 },
  chrome: { color: '#eceff2', metalness: 1, roughness: 0.07, env: 2 },
  black: { color: '#ffffff', metalness: 0.1, roughness: 0.5, env: 0.5 },
  lamp: { color: '#f2f5f8', metalness: 0.1, roughness: 0.06, env: 2, emissive: '#fff4d0', ei: 0.55 },
  tail: { color: '#a3121a', metalness: 0.1, roughness: 0.1, env: 1.5, emissive: '#ff2020', ei: 0.5 },
  interior: { color: '#2b2824', metalness: 0, roughness: 0.9, env: 0.4 },
  seat: { color: '#3d362e', metalness: 0, roughness: 0.85, env: 0.4 },
  metal: { color: '#5b5e63', metalness: 0.85, roughness: 0.42, env: 1 },
  white: { color: '#eceded', metalness: 0.05, roughness: 0.55, env: 0.8 },
  wood: { color: '#8b6b45', metalness: 0, roughness: 0.8, env: 0.4 },
  caliper: { color: '#c21c1c', metalness: 0.3, roughness: 0.35, env: 1 },
};

export function VehicleParts({ parts }: { parts: VPart[] }) {
  const geos = useMemo(() => parts.map(q => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(q.pos), 3));
    if (q.col) g.setAttribute('color', new BufferAttribute(new Float32Array(q.col), 3));
    g.setIndex(q.idx); g.computeVertexNormals(); return g;
  }), [parts]);
  return <>{parts.map((q, i) => {
    const m = MATS[q.mat], tr = m.opacity !== undefined;
    return <mesh key={i} geometry={geos[i]} castShadow renderOrder={tr ? 2 : 0}>
      <meshPhysicalMaterial vertexColors color={m.color} metalness={m.metalness} roughness={m.roughness} envMapIntensity={m.env} clearcoat={m.clearcoat ?? 0} clearcoatRoughness={0.06}
        transparent={tr} opacity={m.opacity ?? 1} emissive={m.emissive ?? '#000000'} emissiveIntensity={m.ei ?? 0} side={DoubleSide} />
    </mesh>;
  })}</>;
}

// soft contact shadow on the ground under the vehicle
export function GroundShadow({ w, l, cx, cy }: { w: number; l: number; cx: number; cy: number }) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d')!;
    const g = x.createRadialGradient(64, 64, 8, 64, 64, 62); g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(0.6, 'rgba(0,0,0,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new CanvasTexture(c);
  }, []);
  return <mesh position={[cx, cy, -1]}><planeGeometry args={[l * 1.25, w * 1.9]} /><meshBasicMaterial map={tex} transparent depthWrite={false} /></mesh>;
}
