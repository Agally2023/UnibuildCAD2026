import { useMemo } from 'react';
import { MAT, type MatKind } from '../lib/materials';
import { texture } from '../lib/textures';

// A physically based material with an optional procedural texture. The texture is projected from the three axes in the mesh's own
// space (triplanar), in metres, so walls, roofs and cones need no UV mapping and bricks keep their real size at any wall length.
export default function RealMat({ kind, color, opacity = 1, side }: { kind: MatKind; color: string; opacity?: number; side?: any }) {
  const m = MAT[kind], tex = useMemo(() => (m.tex ? texture(m.tex) : null), [m.tex]);
  const patch = useMemo(() => {
    if (!tex) return undefined;
    const sc = (1 / m.tile).toFixed(5);
    return (sh: any) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP; varying vec3 vON;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position; vON = normal;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP; varying vec3 vON;').replace('#include <map_fragment>',
        `vec3 tn = pow(abs(normalize(vON)), vec3(6.0)); tn /= (tn.x + tn.y + tn.z);
         vec4 tcol = texture2D(map, vOP.zy * ${sc}) * tn.x + texture2D(map, vOP.xz * ${sc}) * tn.y + texture2D(map, vOP.xy * ${sc}) * tn.z;
         diffuseColor *= tcol;`);
    };
  }, [tex, m.tile]);
  return <meshStandardMaterial color={color} roughness={m.rough} metalness={m.metal} envMapIntensity={m.env} map={tex ?? undefined} transparent={opacity < 1} opacity={opacity} side={side} onBeforeCompile={patch} customProgramCacheKey={() => `tri${m.tile}${tex ? 1 : 0}`} />;
}
