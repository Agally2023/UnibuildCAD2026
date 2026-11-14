-- Owners can delete their own projects (children cascade). Idempotent.
drop policy if exists p_del on projects;
create policy p_del on projects for delete using (is_member(id,'owner') or created_by = auth.uid());
