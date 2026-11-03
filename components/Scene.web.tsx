import { Canvas } from '@react-three/fiber';
import Model, { El, Lib } from './Model';
import type { Q } from '../lib/orbit';

export type StoryScene = { id: string; elevation: number; height: number; els: El[] };
type P = { stories: StoryScene[]; lib: Record<string, Lib>; center: [number, number]; extent: number; quat: Q; zoom: number };

// The camera looks straight at the middle of the model; the model itself is turned by a quaternion about its own centre,
// so it can be rotated without limit about the X, Y and Z axes.
export default function Scene({ stories, lib, center, extent, quat, zoom }: P) {
  const top = stories.reduce((m, s) => Math.max(m, s.elevation + s.height), 3.6);
  const reach = Math.max(extent, top) * 1.3 + 4;
  return (
    <Canvas camera={{ position: [0, 0, reach], fov: 50, near: 0.1, far: reach * 6 }}>
      <ambientLight intensity={0.75} />
      <directionalLight position={[10, 30, 20]} intensity={1.1} />
      <directionalLight position={[-15, -20, -25]} intensity={0.6} />
      <group quaternion={quat} scale={zoom}>
        <group position={[0, -top / 2, 0]}>
          {stories.map(s => <group key={s.id} position={[0, s.elevation, 0]}><Model els={s.els} lib={lib} storeyH={s.height} center={center} /></group>)}
        </group>
      </group>
    </Canvas>
  );
}
