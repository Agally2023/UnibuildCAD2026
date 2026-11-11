// The finishes (materials) a house can be made of, grouped by part: floor, wall, roof, door, window, column and beam, stair, foundation, ground.
// Applying one writes `mat` (the material kind, drawn with a real texture), `color` and `finish` (its id) into the element's geometry,
// so it shows in the plan, in 3D, and survives save and reload. Pure data and functions, tested.
import type { MatKind } from './materials';
export type Part = 'floor' | 'wall' | 'roof' | 'door' | 'window' | 'column' | 'stair' | 'foundation' | 'ground';
export type Finish = { id: string; part: Part; group: string; label: string; kind: MatKind; color: string; opacity?: number };
export const PARTS: { key: Part; label: string; types: string[]; icon: string }[] = [
  { key: 'floor', label: 'Floor', types: ['slab'], icon: '▦' },
  { key: 'wall', label: 'Wall', types: ['wall'], icon: '▥' },
  { key: 'roof', label: 'Roof', types: ['roof'], icon: '⌂' },
  { key: 'door', label: 'Door', types: ['door'], icon: '🚪' },
  { key: 'window', label: 'Window', types: ['window'], icon: '⊞' },
  { key: 'column', label: 'Column & beam', types: ['column', 'beam'], icon: '▮' },
  { key: 'stair', label: 'Stair', types: ['stair'], icon: '≡' },
  { key: 'foundation', label: 'Foundation', types: ['foundation'], icon: '⏹' },
  { key: 'ground', label: 'Ground & paving', types: ['deco'], icon: '▒' },
];
const F = (part: Part, group: string, id: string, label: string, kind: MatKind, color: string, opacity?: number): Finish => ({ id: `${part}-${id}`, part, group, label, kind, color, ...(opacity !== undefined ? { opacity } : {}) });
const fl = (g: string, id: string, l: string, k: MatKind, c: string) => F('floor', g, id, l, k, c);
const wl = (g: string, id: string, l: string, k: MatKind, c: string) => F('wall', g, id, l, k, c);
const rf = (g: string, id: string, l: string, k: MatKind, c: string) => F('roof', g, id, l, k, c);
const dr = (id: string, l: string, k: MatKind, c: string) => F('door', 'Doors', id, l, k, c);
const wn = (id: string, l: string, c: string, o: number) => F('window', 'Glass', id, l, 'glass', c, o);
const co = (g: string, id: string, l: string, k: MatKind, c: string) => F('column', g, id, l, k, c);
const st = (id: string, l: string, k: MatKind, c: string) => F('stair', 'Stairs', id, l, k, c);
const fo = (id: string, l: string, k: MatKind, c: string) => F('foundation', 'Foundations', id, l, k, c);
const gr = (g: string, id: string, l: string, k: MatKind, c: string) => F('ground', g, id, l, k, c);

export const FINISHES: Finish[] = [
  // ---- floors ----
  fl('Wood', 'oak', 'Oak boards', 'timber', '#c89a62'), fl('Wood', 'walnut', 'Walnut boards', 'timber', '#6e4a2e'), fl('Wood', 'teak', 'Teak boards', 'timber', '#a8742f'), fl('Wood', 'parquet', 'Maple parquet', 'parquet', '#d9b27a'), fl('Wood', 'parquet-dark', 'Dark parquet', 'parquet', '#5b3a24'), fl('Wood', 'bamboo', 'Bamboo', 'parquet', '#d8c06a'), fl('Wood', 'vinyl-wood', 'Wood-look vinyl', 'parquet', '#b98f62'),
  fl('Terrazzo', 'terrazzo-white', 'Terrazzo white', 'terrazzo', '#eeeae0'), fl('Terrazzo', 'terrazzo-grey', 'Terrazzo grey', 'terrazzo', '#a9acaf'), fl('Terrazzo', 'terrazzo-terracotta', 'Terrazzo terracotta', 'terrazzo', '#d29a7c'), fl('Terrazzo', 'terrazzo-green', 'Terrazzo green', 'terrazzo', '#9db8a0'),
  fl('Tile', 'ceramic-white', 'Ceramic white', 'ceramic', '#f3f3ef'), fl('Tile', 'ceramic-beige', 'Ceramic beige', 'ceramic', '#e2d2b4'), fl('Tile', 'ceramic-grey', 'Ceramic grey', 'ceramic', '#b9bcbe'), fl('Tile', 'porcelain-black', 'Porcelain black', 'ceramic', '#2c2e31'), fl('Tile', 'quarry-red', 'Quarry tile red', 'ceramic', '#b2573d'), fl('Tile', 'mosaic-blue', 'Blue tile', 'ceramic', '#5d8fb8'), fl('Tile', 'slate-floor', 'Slate', 'slate', '#5f666c'),
  fl('Stone', 'marble-white', 'Marble white', 'marble', '#f1efe9'), fl('Stone', 'marble-black', 'Marble black', 'marble', '#34363a'), fl('Stone', 'marble-beige', 'Marble beige', 'marble', '#dccaa6'), fl('Stone', 'granite-grey', 'Granite grey', 'granite', '#a2a5a8'), fl('Stone', 'granite-black', 'Granite black', 'granite', '#3a3c40'), fl('Stone', 'granite-red', 'Granite red', 'granite', '#a5584c'),
  fl('Resin and concrete', 'epoxy-grey', 'Epoxy resin grey', 'epoxy', '#a9afb4'), fl('Resin and concrete', 'epoxy-white', 'Epoxy resin white', 'epoxy', '#eef0f1'), fl('Resin and concrete', 'epoxy-green', 'Epoxy resin green', 'epoxy', '#5f9270'), fl('Resin and concrete', 'epoxy-blue', 'Epoxy resin blue', 'epoxy', '#5a88b8'), fl('Resin and concrete', 'polished', 'Polished concrete', 'concrete', '#b5b7b8'), fl('Resin and concrete', 'screed', 'Cement screed', 'concrete', '#a4a6a7'),
  fl('Soft', 'carpet-grey', 'Carpet grey', 'carpet', '#8e9399'), fl('Soft', 'carpet-red', 'Carpet red', 'carpet', '#9a3b3a'), fl('Soft', 'carpet-beige', 'Carpet beige', 'carpet', '#cdb998'),
  // ---- walls ----
  wl('Brick', 'brick-red', 'Red clay brick', 'brick', '#a8482f'), wl('Brick', 'brick-face', 'Face brick tan', 'brick', '#c79a63'), wl('Brick', 'brick-engineering', 'Engineering brick blue', 'brick', '#46586b'), wl('Brick', 'brick-london', 'London stock yellow', 'brick', '#c9ac6a'), wl('Brick', 'brick-clinker', 'Clinker dark', 'brick', '#5a3a30'), wl('Brick', 'brick-handmade', 'Handmade brown', 'brick', '#8a5a3c'), wl('Brick', 'brick-white', 'Whitewashed brick', 'brick', '#ebe6dc'), wl('Brick', 'brick-burnt', 'Burnt clay brick', 'brick', '#b5683f'),
  wl('Block', 'block-concrete', 'Concrete block', 'blockwork', '#a8abad'), wl('Block', 'block-sandcrete', 'Sandcrete block', 'blockwork', '#c5beb0'), wl('Block', 'block-hollow', 'Hollow block painted', 'blockwork', '#e4ddcc'), wl('Block', 'block-aerated', 'Aerated block', 'blockwork', '#e6e7e5'), wl('Block', 'adobe', 'Adobe / mud wall', 'soil', '#b98a5e'), wl('Block', 'laterite', 'Laterite block', 'blockwork', '#a8553a'),
  wl('Stone', 'stone-rubble', 'Rubble stone', 'stone', '#9b9488'), wl('Stone', 'stone-dressed', 'Dressed stone', 'stone', '#b8b2a5'), wl('Stone', 'stone-limestone', 'Limestone', 'stone', '#d9cfb8'), wl('Stone', 'stone-sandstone', 'Sandstone', 'stone', '#c79a6a'), wl('Stone', 'stone-slate', 'Slate cladding', 'slate', '#59616a'), wl('Stone', 'granite', 'Granite', 'granite', '#9fa3a6'), wl('Stone', 'marble-white', 'Marble white', 'marble', '#f0eee8'), wl('Stone', 'marble-black', 'Marble black', 'marble', '#34363a'), wl('Stone', 'marble-green', 'Marble green', 'marble', '#6f8f7a'),
  wl('Paint and render', 'paint-white', 'White paint', 'plaster', '#f4f1ea'), wl('Paint and render', 'paint-cream', 'Cream paint', 'plaster', '#f0e2bf'), wl('Paint and render', 'paint-terracotta', 'Terracotta render', 'plaster', '#cf7b55'), wl('Paint and render', 'paint-ochre', 'Ochre', 'plaster', '#dcae4e'), wl('Paint and render', 'paint-sage', 'Sage green', 'plaster', '#a8b89a'), wl('Paint and render', 'paint-sky', 'Sky blue', 'plaster', '#9cc4dc'), wl('Paint and render', 'paint-pink', 'Rose pink', 'plaster', '#e8b3b0'), wl('Paint and render', 'paint-grey', 'Grey', 'plaster', '#a7abae'), wl('Paint and render', 'exposed', 'Exposed concrete', 'concrete', '#a9abac'),
  wl('Timber and metal', 'timber-oak', 'Oak cladding', 'timber', '#b98a54'), wl('Timber and metal', 'timber-cedar', 'Cedar cladding', 'timber', '#a8603a'), wl('Timber and metal', 'timber-white', 'White boards', 'timber', '#f1eee6'), wl('Timber and metal', 'timber-black', 'Black timber', 'timber', '#2d2e30'), wl('Timber and metal', 'timber-falu', 'Falu red boards', 'timber', '#9c2b1e'), wl('Timber and metal', 'iron-sheet', 'Corrugated iron', 'metal', '#c3c8cd'), wl('Timber and metal', 'glass-curtain', 'Glass curtain wall', 'glass', '#8cb8cf'),
  // ---- roofs ----
  rf('Iron sheets', 'iron-galv', 'Iron sheets, galvanised', 'metal', '#c5cacf'), rf('Iron sheets', 'iron-red', 'Iron sheets, red', 'metal', '#b23a2e'), rf('Iron sheets', 'iron-blue', 'Iron sheets, blue', 'metal', '#2e5f9e'), rf('Iron sheets', 'iron-green', 'Iron sheets, green', 'metal', '#3f7a4c'), rf('Iron sheets', 'iron-charcoal', 'Iron sheets, charcoal', 'metal', '#4b4f55'), rf('Iron sheets', 'box-grey', 'Box profile (IBR) grey', 'boxprofile', '#b9bec3'), rf('Iron sheets', 'box-red', 'Box profile red', 'boxprofile', '#a5382e'), rf('Iron sheets', 'box-green', 'Box profile green', 'boxprofile', '#3d6f4a'), rf('Iron sheets', 'box-charcoal', 'Box profile charcoal', 'boxprofile', '#464a50'),
  rf('Tiles', 'clay-terracotta', 'Clay tiles terracotta', 'tile', '#c4572f'), rf('Tiles', 'clay-brown', 'Clay tiles brown', 'tile', '#7d4a34'), rf('Tiles', 'clay-black', 'Clay tiles black', 'tile', '#3a3d42'), rf('Tiles', 'concrete-grey', 'Concrete tiles grey', 'tile', '#8f9296'), rf('Tiles', 'concrete-red', 'Concrete tiles red', 'tile', '#a84a38'), rf('Tiles', 'slate', 'Slate', 'slate', '#575f68'), rf('Tiles', 'shingle-black', 'Asphalt shingles black', 'shingle', '#3b3d40'), rf('Tiles', 'shingle-brown', 'Asphalt shingles brown', 'shingle', '#6b4a38'), rf('Tiles', 'cedar', 'Cedar shingles', 'timber', '#a0734a'),
  rf('Metal', 'seam-grey', 'Standing seam grey', 'seam', '#aab0b6'), rf('Metal', 'seam-black', 'Standing seam black', 'seam', '#2f3236'), rf('Metal', 'copper', 'Copper', 'seam', '#4fa28b'), rf('Metal', 'zinc', 'Zinc', 'seam', '#8f9ba3'),
  rf('Flat and natural', 'slab', 'Concrete slab', 'concrete', '#b0b2b3'), rf('Flat and natural', 'membrane', 'Flat roof membrane', 'plaster', '#4a4d52'), rf('Flat and natural', 'green', 'Green roof', 'grass', '#5f9a4c'), rf('Flat and natural', 'thatch', 'Thatch', 'thatch', '#c9a64a'), rf('Flat and natural', 'gravel', 'Gravel ballast', 'gravel', '#9a9a96'),
  // ---- doors ----
  dr('oak', 'Oak', 'timber', '#a8743a'), dr('mahogany', 'Mahogany', 'timber', '#6b2f22'), dr('white', 'White painted', 'plaster', '#f2efe8'), dr('red', 'Red painted', 'plaster', '#a5281f'), dr('green', 'Green painted', 'plaster', '#2e6b3c'), dr('blue', 'Blue painted', 'plaster', '#2e5f9e'), dr('black', 'Black', 'plaster', '#25272a'), dr('steel', 'Steel', 'metal', '#8e959b'), dr('steel-green', 'Steel green', 'metal', '#3f6f52'), dr('aluminium', 'Aluminium', 'metal', '#c9cdd1'), dr('glass', 'Glass door', 'glass', '#a9d4ea'),
  // ---- windows ----
  wn('clear', 'Clear glass', '#a9d4ea', 0.45), wn('blue', 'Blue tint', '#7fb0d6', 0.55), wn('grey', 'Grey tint', '#6d7780', 0.6), wn('bronze', 'Bronze tint', '#9a7650', 0.55), wn('green', 'Green tint', '#7fb59a', 0.55), wn('mirror', 'Reflective', '#c7d6df', 0.85), wn('frosted', 'Frosted', '#e6eef2', 0.9),
  // ---- columns and beams ----
  co('Structure', 'concrete', 'Concrete', 'concrete', '#b3b6b8'), co('Structure', 'exposed', 'Exposed concrete', 'concrete', '#9fa2a4'), co('Structure', 'steel-grey', 'Painted steel', 'metal', '#8f959b'), co('Structure', 'steel-red', 'Red oxide steel', 'metal', '#9a3f33'), co('Structure', 'steel-bright', 'Bright steel', 'metal', '#d0d4d8'), co('Structure', 'timber', 'Timber', 'timber', '#a8743a'), co('Structure', 'brick', 'Brick pier', 'brick', '#a8482f'), co('Structure', 'stone', 'Stone', 'stone', '#b0aa9d'), co('Structure', 'white', 'White plaster', 'plaster', '#f1eee6'), co('Structure', 'marble', 'Marble', 'marble', '#eeeae2'),
  // ---- stairs ----
  st('concrete', 'Concrete', 'concrete', '#b0b3b5'), st('timber', 'Timber', 'timber', '#a8743a'), st('marble', 'Marble', 'marble', '#eeeae2'), st('granite', 'Granite', 'granite', '#9fa3a6'), st('terrazzo', 'Terrazzo', 'terrazzo', '#d6d2c8'), st('steel', 'Steel', 'metal', '#8f959b'), st('tile', 'Tiled', 'ceramic', '#d6d0c2'),
  // ---- foundations ----
  fo('concrete', 'Concrete', 'concrete', '#8f9396'), fo('stone', 'Stone footing', 'stone', '#8a857b'), fo('brick', 'Engineering brick', 'brick', '#46586b'), fo('block', 'Block plinth', 'blockwork', '#9a9d9f'),
  // ---- ground ----
  gr('Soft', 'lawn', 'Lawn', 'grass', '#6aa84f'), gr('Soft', 'dry', 'Dry grass', 'grass', '#b5aa6a'), gr('Soft', 'soil', 'Bare soil', 'soil', '#8a6a48'), gr('Soft', 'sand', 'Sand', 'soil', '#d8c590'),
  gr('Hard', 'gravel', 'Gravel', 'gravel', '#9c9a94'), gr('Hard', 'cobble', 'Cobblestones', 'cobble', '#8c8a85'), gr('Hard', 'brick-paving', 'Brick paving', 'brick', '#b0583e'), gr('Hard', 'concrete', 'Concrete paving', 'concrete', '#b3b5b6'), gr('Hard', 'tarmac', 'Tarmac', 'concrete', '#4a4d52'), gr('Hard', 'flagstone', 'Flagstone', 'stone', '#a39e92'), gr('Hard', 'pavers', 'Block pavers', 'paving', '#b5aea0'), gr('Hard', 'timber-deck', 'Timber decking', 'timber', '#a8774a'),
];
export const finishById = (id: string | undefined): Finish | undefined => FINISHES.find(f => f.id === id);
export const partOf = (type: string): Part | null => PARTS.find(p => p.types.includes(type))?.key ?? null;
export const typesOf = (part: Part): string[] => PARTS.find(p => p.key === part)!.types;
export const finishesOf = (part: Part): Finish[] => FINISHES.filter(f => f.part === part);
export const groupsOf = (part: Part): string[] => [...new Set(finishesOf(part).map(f => f.group))];
// geometry with the finish written in; everything else (size, position) is kept
export function withFinish(g: any, f: Finish): any {
  const { opacity: _o, ...rest } = g ?? {};
  return { ...rest, mat: f.kind, color: f.color, finish: f.id, ...(f.opacity !== undefined ? { opacity: f.opacity } : {}) };
}
// ground finishes apply to flat ground decoration (lawns, paving, decking), never to trees, towers or fences
export const isGround = (e: { type: string; geometry: any }) => e.type === 'deco' && e.geometry?.shape !== 'tree' && (e.geometry?.z1 ?? 0) <= 0.45 && e.geometry?.shape !== 'cyl' && e.geometry?.shape !== 'cone' && e.geometry?.shape !== 'pyramid';
export function targetsOf<T extends { type: string; story_id?: string | null; geometry: any }>(els: T[], part: Part, scope: 'sel' | 'storey' | 'all', storeyId?: string | null): T[] {
  const ty = typesOf(part), ok = (e: T) => ty.includes(e.type) && (part !== 'ground' || isGround(e));
  return els.filter(e => ok(e) && (scope === 'all' || scope === 'sel' || e.story_id === storeyId));
}
