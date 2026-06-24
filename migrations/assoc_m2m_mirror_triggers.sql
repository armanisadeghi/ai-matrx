-- assoc_m2m_mirror_triggers.sql
-- Applied 2026-06-24 during the DB changeover (via Supabase MCP apply_migration).
--
-- One-directional mirror (old M2M tables -> platform.associations), matching the
-- existing _mirror_fk_to_assoc pattern. Closes the gap where the 33 FK-column
-- mirror triggers covered project_id/task_id writes but NOT the two general-purpose
-- M2M tables the FE still writes (ctx_scope_assignments via set_entity_scopes,
-- ctx_task_associations via associate_with_task). Without this, any scope/task tag
-- written after the one-time backfill is invisible to platform.associations the
-- moment a reader flips to it. War-room writes associations directly in its rewrite
-- (no mirror needed there). Idempotent.

create or replace function platform._mirror_m2m_to_assoc()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  c_etype text := TG_ARGV[0];   -- entity_type column (polymorphic source type)
  c_eid   text := TG_ARGV[1];   -- entity_id column   (polymorphic source id)
  k_tgt   text := TG_ARGV[2];   -- constant target_type ('scope' | 'task')
  c_tid   text := TG_ARGV[3];   -- target_id column ('scope_id' | 'task_id')
  org_tbl text := TG_ARGV[4];   -- org-resolution table by target id ('ctx_scopes' | 'ctx_tasks')
  c_label text := TG_ARGV[5];   -- label column, or '' when none
  nj jsonb; oj jsonb; v_org uuid; v_label text; v_meta jsonb;
begin
  if TG_OP <> 'INSERT' then oj := to_jsonb(OLD); end if;
  if TG_OP <> 'DELETE' then nj := to_jsonb(NEW); end if;

  -- Remove the old edge on DELETE, or on UPDATE when the edge identity changed.
  if TG_OP in ('UPDATE','DELETE') then
    if TG_OP = 'DELETE'
       or (oj->>c_etype) is distinct from (nj->>c_etype)
       or (oj->>c_eid)   is distinct from (nj->>c_eid)
       or (oj->>c_tid)   is distinct from (nj->>c_tid) then
      delete from platform.associations
       where source_type = (oj->>c_etype)
         and source_id   = (oj->>c_eid)::uuid
         and target_type = k_tgt
         and target_id   = (oj->>c_tid)::uuid;
    end if;
  end if;

  -- Add / refresh the new edge on INSERT or UPDATE.
  if TG_OP in ('INSERT','UPDATE') then
    execute format('select organization_id from public.%I where id = $1', org_tbl)
      into v_org using (nj->>c_tid)::uuid;
    if c_label <> '' then v_label := nj->>c_label; end if;
    v_meta := coalesce(nj->'metadata', '{}'::jsonb);
    insert into platform.associations
      (source_type, source_id, target_type, target_id, org_id, label, metadata, created_by)
    values
      ((nj->>c_etype), (nj->>c_eid)::uuid, k_tgt, (nj->>c_tid)::uuid, v_org, v_label, v_meta, (nj->>'created_by')::uuid)
    on conflict (source_type, source_id, target_type, target_id)
    do update set
      org_id   = coalesce(excluded.org_id, platform.associations.org_id),
      label    = coalesce(excluded.label, platform.associations.label),
      metadata = excluded.metadata;
  end if;

  return coalesce(NEW, OLD);
end
$fn$;

drop trigger if exists _mirror_assoc on public.ctx_scope_assignments;
create trigger _mirror_assoc
  after insert or update or delete on public.ctx_scope_assignments
  for each row execute function platform._mirror_m2m_to_assoc('entity_type','entity_id','scope','scope_id','ctx_scopes','');

drop trigger if exists _mirror_assoc on public.ctx_task_associations;
create trigger _mirror_assoc
  after insert or update or delete on public.ctx_task_associations
  for each row execute function platform._mirror_m2m_to_assoc('entity_type','entity_id','task','task_id','ctx_tasks','label');
