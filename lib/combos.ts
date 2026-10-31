// Foundation load combinations from the gravity loads (G, Q in kN, characteristic) and the lateral effects at a ground-storey
// column. Sign convention: for a lateral load towards +x or +y (sg = +1) the overturning axial change dNs is positive on the
// +side and the column applies a clockwise couple to the footing (viewed with the loaded axis to the right).
import type { Code } from './rc';

export type Eff = { name: string; kind: 'wind' | 'seismic'; dir: 'x' | 'y'; dNs: number; Vx: number; Vy: number; Mb: number };
export type Combo = { name: string; ls: 'uls' | 'sls' | 'stab'; lateral: boolean; N: number; Mx: number; My: number; Vx: number; Vy: number };
// Mx: moment in the x-z plane from the x shear, My: moment in the y-z plane from the y shear (both signed with the load direction)

export function foundationCombos(code: Code | undefined, G: number, Q: number, effs: Eff[], psi2 = 0.3): Combo[] {
  const bs = code === 'BS8110', out: Combo[] = [];
  const add = (name: string, ls: Combo['ls'], base: number, f: number, e: Eff, sg: number) =>
    out.push({ name: `${e.name}${sg > 0 ? ' (+)' : ' (−)'}: ${name}`, ls, lateral: true, N: base + sg * f * e.dNs, Mx: sg * f * e.Vx * e.Mb, My: sg * f * e.Vy * e.Mb, Vx: f * e.Vx, Vy: f * e.Vy });
  for (const e of effs) for (const sg of [1, -1]) {
    if (e.kind === 'wind') {
      if (bs) { add('1.2 (G + Q + W)', 'uls', 1.2 * (G + Q), 1.2, e, sg); add('1.4 G + 1.4 W', 'uls', 1.4 * G, 1.4, e, sg); add('1.0 G + 1.4 W (stability)', 'stab', G, 1.4, e, sg); }
      else { add('1.35 G + 1.05 Q + 1.5 W', 'uls', 1.35 * G + 1.05 * Q, 1.5, e, sg); add('1.0 G + 1.5 W', 'uls', G, 1.5, e, sg); add('0.9 G + 1.5 W (uplift)', 'stab', 0.9 * G, 1.5, e, sg); }
      add('G + Q + 0.6 W', 'sls', G + Q, 0.6, e, sg); add('G + 0.7 Q + W', 'sls', G + 0.7 * Q, 1, e, sg);
    } else { add('G + ψ2 Q + E', 'uls', G + psi2 * Q, 1, e, sg); add('G + ψ2 Q + E', 'sls', G + psi2 * Q, 1, e, sg); add('G + E (stability)', 'stab', G, 1, e, sg); }
  }
  return out;
}

// Punching shear enhancement factor for a column transferring a moment M (kNm) with axial load V (kN), column c and effective depth d (mm).
// EC2 6.4.3: beta = 1 + k (M/V)(u1/W1) for an interior square column, never below 1.15. BS 8110 3.7.6.2: V_eff = V (1 + 1.5 M/(V x)), never below 1.15 V.
export function betaMoment(code: Code | undefined, V: number, M: number, c: number, d: number): number {
  if (V <= 0) return 1.15;
  if (code === 'BS8110') return Math.max(1.15, 1 + (1.5 * M * 1000) / (V * (c + 3 * d)));
  const u1 = 4 * c + 4 * Math.PI * d, W1 = (c * c) / 2 + c * c + 4 * c * d + 16 * d * d + 2 * Math.PI * d * c;
  return Math.max(1.15, 1 + 0.6 * ((M * 1000) / V) * (u1 / W1));
}
