import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { El, Lib, Story } from './engineering';

// Loads a project's elements, storeys and library, and refreshes them when anyone edits the model.
export function useModel(id: string) {
  const [els, setEls] = useState<El[]>([]);
  const [lib, setLib] = useState<Lib[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const reload = useCallback(async () => {
    const [e, s] = await Promise.all([
      supabase.from('elements').select('id,type,geometry,library_item_id,story_id,properties').eq('project_id', id).order('updated_at'),
      supabase.from('stories').select('id,name,elevation_m,height_m,sort_order').eq('project_id', id).order('elevation_m'),
    ]);
    setEls((e.data as El[]) ?? []);
    setStories(((s.data as any[]) ?? []).map(x => ({ ...x, elevation_m: Number(x.elevation_m), height_m: Number(x.height_m) })));
  }, [id]);
  useEffect(() => {
    supabase.from('library_items').select('id,category,name,specs,unit_cost').then(({ data }) => setLib((data as Lib[]) ?? []));
    reload();
    const ch = supabase.channel(`model-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'elements', filter: `project_id=eq.${id}` }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stories', filter: `project_id=eq.${id}` }, reload)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, reload]);
  return { els, lib, stories, reload };
}
