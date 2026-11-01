// Lateral-load settings shared by the Wind & quake and Foundations screens for the length of the session.
export type LatSettings = { on: boolean; wind: boolean; vb: number; terrain: number; seis: boolean; ag: number; ground: number; q: number; base: 'fixed' | 'pinned' };
export const lat: LatSettings = { on: false, wind: true, vb: 22, terrain: 3, seis: true, ag: 0.1, ground: 1, q: 1.5, base: 'fixed' };
export const setLat = (p: Partial<LatSettings>) => Object.assign(lat, p);

// Design basis set on the ribbon and used by every design screen: code, concrete class (index into CLASSES),
// occupancy (index into the imposed-load list), default tributary width and allowable soil bearing.
export type DesignBasis = { code: 'EC2' | 'BS8110'; cls: number; use: number; trib: number; q: number };
export const dsn: DesignBasis = { code: 'EC2', cls: 0, use: 1, trib: 3, q: 150 };
export const setDsn = (p: Partial<DesignBasis>) => Object.assign(dsn, p);

// Drawing settings on the ribbon: snap step (m), grid and dimension labels, default wall and slab thickness (m).
export type PlanSettings = { snap: number; grid: boolean; dims: boolean; wallTh: number; slabTh: number };
export const plan: PlanSettings = { snap: 0.5, grid: true, dims: true, wallTh: 0.2, slabTh: 0.2 };
export const setPlan = (p: Partial<PlanSettings>) => Object.assign(plan, p);
