// Lateral-load settings shared by the Wind & quake and Foundations screens for the length of the session.
export type LatSettings = { on: boolean; wind: boolean; vb: number; terrain: number; seis: boolean; ag: number; ground: number; q: number; base: 'fixed' | 'pinned' };
export const lat: LatSettings = { on: false, wind: true, vb: 22, terrain: 3, seis: true, ag: 0.1, ground: 1, q: 1.5, base: 'fixed' };
export const setLat = (p: Partial<LatSettings>) => Object.assign(lat, p);
