import { Canvas } from '@react-three/fiber/native';
import Model, { El, Lib } from './Model';

export type StoryScene = { id: string; elevation: number; height: number; els: El[] };
type P = { stories: StoryScene[]; lib: Record<string, Lib>; center: [number, number]; extent: number; rotY: number; zoom: number };

export default function Scene({ stories, lib, center, extent, rotY, zoom }: P) {
  const top = stories.reduce((m, s) => Math.max(m, s.elevation + s.height), 3.6);
  return (
    <Canvas camera={{ position: [0, extent * 0.8 + top, extent * 1.3 + 10], fov: 50 }}>
      <ambientLight intensity={0.8} />
      <directionalLight position={[10, 30, 10]} intensity={1.2} />
      <group rotation={[0, rotY, 0]} scale={zoom}>
        {stories.map(s => <group key={s.id} position={[0, s.elevation, 0]}><Model els={s.els} lib={lib} storeyH={s.height} center={center} /></group>)}
      </group>
    </Canvas>
  );
}
