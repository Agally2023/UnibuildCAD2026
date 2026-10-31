import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { El, Lib, Story } from './engineering';

// Loads a project's elements, storeys and library and keeps them current.
// Speed: the last model for each project is cached in memory, so moving between screens shows data instantly while a
// fresh copy loads in the background; realtime changes are applied to the model directly instead of refetching it;
// and addEls / removeEls / updateEl let a screen show an edit immediately, before the server has confirmed it.
type Snap = { els: El[]; stories: Story[]; loaded: boolean };
const cache = new Map<string, Snap>();
let libCache: Lib[] | null = null;
const EMPTY: Snap = { els: [], stories: [], loaded: false };
const COLS = 'id,type,geometry,library_item_id,story_id,properties';
const pick = (r: any): El => ({ id: r.id, type: r.type, geometry: r.geometry, library_item_id: r.library_item_id ?? null, story_id: r.story_id ?? null, properties: r.properties ?? {} });

// called on sign-out so the next user never sees a previous user's cached model
export function clearModelCache() { cache.clear(); libCache = null; }

export function newId(): string {
  const h = '0123456789abcdef'; let s = '';
  for (let i = 0; i < 36; i++) s += i === 8 || i === 13 || i === 18 || i === 23 ? '-' : i === 14 ? '4' : i === 19 ? h[8 + Math.floor(Math.random() * 4)] : h[Math.floor(Math.random() * 16)];
  return s;
}

export function useModel(id: string) {
  const [snap, setSnap] = useState<Snap>(() => cache.get(id) ?? EMPTY);
  const [lib, setLib] = useState<Lib[]>(libCache ?? []);

  const commit = useCallback((fn: (s: Snap) => Snap) => setSnap(prev => { const next = fn(prev); cache.set(id, next); return next; }), [id]);

  const reload = useCallback(async () => {
    const [e, s] = await Promise.all([
      supabase.from('elements').select(COLS).eq('project_id', id).order('updated_at'),
      supabase.from('stories').select('id,name,elevation_m,height_m,sort_order').eq('project_id', id).order('elevation_m'),
    ]);
    if (e.error || s.error) return;
    commit(() => ({ els: ((e.data as any[]) ?? []).map(pick), stories: ((s.data as any[]) ?? []).map(x => ({ ...x, elevation_m: Number(x.elevation_m), height_m: Number(x.height_m) })), loaded: true }));
  }, [id, commit]);

  const addEls = useCallback((rows: El[]) => commit(s => ({ ...s, els: [...s.els.filter(e => !rows.some(r => r.id === e.id)), ...rows] })), [commit]);
  const removeEls = useCallback((ids: string[]) => commit(s => ({ ...s, els: s.els.filter(e => !ids.includes(e.id)) })), [commit]);
  const updateEl = useCallback((row: El) => commit(s => ({ ...s, els: s.els.map(e => (e.id === row.id ? row : e)) })), [commit]);

  useEffect(() => {
    setSnap(cache.get(id) ?? EMPTY);
    if (libCache) setLib(libCache);
    supabase.from('library_items').select('id,category,name,specs,unit_cost').then(({ data }) => { libCache = (data as Lib[]) ?? []; setLib(libCache); });
    reload();
    const ch = supabase.channel(`model-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'elements', filter: `project_id=eq.${id}` }, (p: any) => {
        if (p.eventType === 'DELETE') { if (p.old?.id) removeEls([p.old.id]); return; }
        if (p.new?.id) commit(s => { const row = pick(p.new), has = s.els.some(e => e.id === row.id); return { ...s, els: has ? s.els.map(e => (e.id === row.id ? row : e)) : [...s.els, row] }; });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, reload, commit, removeEls]);

  return { els: snap.els, lib, stories: snap.stories, loaded: snap.loaded, reload, addEls, removeEls, updateEl };
}
