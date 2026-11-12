import { TEMPLATES } from './partlib';
import { VEHICLE_TEMPLATES } from './vehicles';
import { BRAND_TEMPLATES } from './brands';
import { CATALOG_TEMPLATES } from './catalog';
// complete vehicles and brand models are marked so the 3D view paints them (body, glass, lamps, tyres) instead of showing bare steel
const tag = (t: (typeof TEMPLATES)[number]) => (t.group === 'vehicle' || t.group === 'brand' ? { ...t, make: () => ({ ...t.make(), kind: 'vehicle' as const }) } : t);
export const ALL_TEMPLATES = [...TEMPLATES, ...VEHICLE_TEMPLATES, ...BRAND_TEMPLATES, ...CATALOG_TEMPLATES].map(tag);
