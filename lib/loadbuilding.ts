// Writes a building template into a project: reuses the project's storeys from the ground up, adds any storeys it needs, and places the
// elements beside whatever is already modelled so nothing overlaps.
import { supabase } from './supabase';
import { newId } from './useModel';
import { DISC, placeBuilding } from './placebuilding';
import type { El, Lib, Story } from './engineering';
import type { Building } from './buildings';

export async function loadBuilding(b: Building, projectId: string, stories: Story[], els: El[], lib: Lib[]): Promise<{ added: number; firstStory: string | null }> {
  const plan = placeBuilding(b, stories, els, lib, newId);
  const ids: (string | null)[] = [];
  for (const st of plan.stories) {
    if (!st.isNew) { ids.push(st.id); continue; }
    const { data, error } = await supabase.from('stories').insert({ project_id: projectId, name: st.name, elevation_m: st.elevation_m, height_m: st.height_m, sort_order: ids.length }).select('id').single();
    if (error || !data) throw new Error(error?.message ?? 'Could not add a storey');
    ids.push(data.id);
  }
  const rows = plan.rows.map(r => ({ id: r.id, project_id: projectId, story_id: r.story >= 0 ? ids[r.story] : null, type: r.type, discipline: DISC[r.type] ?? 'architecture', library_item_id: r.lib, geometry: r.geometry }));
  // walls first, so the doors and windows that refer to them can be written
  const ordered = [...rows.filter(r => r.type !== 'door' && r.type !== 'window'), ...rows.filter(r => r.type === 'door' || r.type === 'window')];
  for (let i = 0; i < ordered.length; i += 150) {
    const { error } = await supabase.from('elements').insert(ordered.slice(i, i + 150));
    if (error) throw new Error(error.message);
  }
  return { added: rows.length, firstStory: ids[0] ?? null };
}
