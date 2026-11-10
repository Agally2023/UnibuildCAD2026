import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Color, PMREMGenerator } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// Image-based lighting made on the spot (no image files): a bright studio room reflected by glass, paint and metal, plus a soft sky.
export default function Studio({ sky = '#dbe7f0' }: { sky?: string }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pm = new PMREMGenerator(gl), env = pm.fromScene(new RoomEnvironment(), 0.04).texture, bg = scene.background;
    scene.environment = env; scene.environmentIntensity = 0.55; scene.background = new Color(sky);
    return () => { scene.environment = null; scene.background = bg; env.dispose(); pm.dispose(); };
  }, [gl, scene, sky]);
  return null;
}
