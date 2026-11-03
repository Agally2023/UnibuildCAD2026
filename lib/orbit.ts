// Free 3D rotation with quaternions: no gimbal lock, any number of turns about any axis.
// Screen axes: X to the right, Y up, Z towards the viewer. Rotations are applied about those fixed screen axes.
export type Q = [number, number, number, number];   // x, y, z, w
export type Axis = 'x' | 'y' | 'z';
export const IDENTITY: Q = [0, 0, 0, 1];

export function qAxis(axis: Axis, angle: number): Q {
  const s = Math.sin(angle / 2), c = Math.cos(angle / 2);
  return axis === 'x' ? [s, 0, 0, c] : axis === 'y' ? [0, s, 0, c] : [0, 0, s, c];
}
export function qMul(a: Q, b: Q): Q {   // apply b first, then a
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
export function qNorm(q: Q): Q { const n = Math.hypot(...q) || 1; return [q[0] / n, q[1] / n, q[2] / n, q[3] / n]; }
export function qRotate(q: Q, v: [number, number, number]): [number, number, number] {
  const u: [number, number, number] = [q[0], q[1], q[2]], w = q[3];
  const cr = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const t = cr(u, v).map(x => 2 * x), c2 = cr(u, t);
  return [v[0] + w * t[0] + c2[0], v[1] + w * t[1] + c2[1], v[2] + w * t[2] + c2[2]];
}
// turn the model by an angle about one screen axis, on top of what it already has
export const turn = (q: Q, axis: Axis, angle: number): Q => qNorm(qMul(qAxis(axis, angle), q));
// a mouse drag: horizontal movement turns about the vertical screen axis, vertical movement about the horizontal one
export const drag = (q: Q, dx: number, dy: number, k = 0.01): Q => turn(turn(q, 'y', dx * k), 'x', dy * k);

export const VIEWS: Record<string, { label: string; q: Q }> = {
  iso: { label: 'Isometric', q: qNorm(qMul(qAxis('x', 0.5), qAxis('y', 0.6))) },
  front: { label: 'Front', q: IDENTITY },
  back: { label: 'Back', q: qAxis('y', Math.PI) },
  right: { label: 'Right', q: qAxis('y', -Math.PI / 2) },
  left: { label: 'Left', q: qAxis('y', Math.PI / 2) },
  top: { label: 'Top', q: qAxis('x', Math.PI / 2) },
  bottom: { label: 'Bottom', q: qAxis('x', -Math.PI / 2) },
};
