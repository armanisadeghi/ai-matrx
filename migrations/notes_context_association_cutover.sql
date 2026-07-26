-- Canonicalize note project/task context on platform.associations.
--
-- workbench.notes historically carried project_id/task_id columns plus
-- platform._mirror_fk_to_assoc triggers. That created two relationship
-- authorities and invoked a forbidden generic mirror primitive. Backfill the
-- canonical edges and cut every frontend/live RPC reader over. The physical
-- columns remain temporarily as inert compatibility fields because aidream's
-- generated Notes model still selects them; its generator must be cut over
-- and deployed before the cross-repo column drop can be safe.

insert into platform.associations (
  source_type,
  source_id,
  target_type,
  target_id,
  organization_id,
  metadata,
  created_by,
  created_at
)
select
  'note',
  n.id,
  'project',
  n.project_id,
  n.organization_id,
  jsonb_build_object('backfilled_from', 'workbench.notes.project_id'),
  n.created_by,
  coalesce(n.created_at, now())
from workbench.notes n
where n.project_id is not null
on conflict on constraint associations_unique do nothing;

insert into platform.associations (
  source_type,
  source_id,
  target_type,
  target_id,
  organization_id,
  metadata,
  created_by,
  created_at
)
select
  'note',
  n.id,
  'task',
  n.task_id,
  n.organization_id,
  jsonb_build_object('backfilled_from', 'workbench.notes.task_id'),
  n.created_by,
  coalesce(n.created_at, now())
from workbench.notes n
where n.task_id is not null
on conflict on constraint associations_unique do nothing;

do $verify$
begin
  if exists (
    select 1
    from workbench.notes n
    where n.project_id is not null
      and not exists (
        select 1
        from platform.associations a
        where a.source_type = 'note'
          and a.source_id = n.id
          and a.target_type = 'project'
          and a.target_id = n.project_id
      )
  ) then
    raise exception 'note project association backfill is incomplete';
  end if;

  if exists (
    select 1
    from workbench.notes n
    where n.task_id is not null
      and not exists (
        select 1
        from platform.associations a
        where a.source_type = 'note'
          and a.source_id = n.id
          and a.target_type = 'task'
          and a.target_id = n.task_id
      )
  ) then
    raise exception 'note task association backfill is incomplete';
  end if;
end
$verify$;

create or replace function public.get_notes_shared_with_me()
returns table(
  id uuid,
  label text,
  folder_name text,
  tags text[],
  created_at timestamptz,
  updated_at timestamptz,
  organization_id uuid,
  project_id uuid,
  task_id uuid,
  visibility text,
  version integer,
  created_by uuid,
  permission_level text,
  owner_email text
)
language sql
stable
security definer
set search_path = public
as $function$
  select
    n.id,
    n.label,
    n.folder_name,
    n.tags,
    n.created_at,
    n.updated_at,
    n.organization_id,
    (
      select a.target_id
      from platform.associations a
      where a.source_type = 'note'
        and a.source_id = n.id
        and a.target_type = 'project'
      order by a.position nulls last, a.created_at, a.id
      limit 1
    ) as project_id,
    (
      select a.target_id
      from platform.associations a
      where a.source_type = 'note'
        and a.source_id = n.id
        and a.target_type = 'task'
      order by a.position nulls last, a.created_at, a.id
      limit 1
    ) as task_id,
    n.visibility::text,
    n.version,
    n.created_by,
    max(p.permission_level)::text as permission_level,
    u.email::text as owner_email
  from iam.permissions p
  join workbench.notes n on n.id = p.resource_id
  left join auth.users u on u.id = n.created_by
  where p.resource_type = 'note'
    and (
      p.granted_to_user_id = auth.uid()
      or p.granted_to_organization_id in (select iam.my_orgs())
    )
    and coalesce(p.status, 'active') = 'active'
    and (p.expires_at is null or p.expires_at > now())
    and n.created_by is distinct from auth.uid()
    and n.deleted_at is null
  group by n.id, u.email
  order by n.updated_at desc;
$function$;

-- Preserve the mature context resolver while replacing only its legacy note
-- lookup. The guard makes replay idempotent and fails loudly if the live
-- function has drifted to an unrecognized body.
do $cutover$
declare
  v_oid oid := to_regprocedure(
    'public.resolve_full_context(uuid,text,uuid,uuid[])'
  );
  v_definition text;
  v_legacy text := $legacy$
        select n.organization_id, n.project_id, n.task_id into v_org_id, v_project_id, v_task_id
        from workbench.notes n where n.id = p_entity_id;$legacy$;
  v_canonical text := $canonical$
        select
            n.organization_id,
            (
                select a.target_id
                from platform.associations a
                where a.source_type = 'note'
                  and a.source_id = n.id
                  and a.target_type = 'project'
                order by a.position nulls last, a.created_at, a.id
                limit 1
            ),
            (
                select a.target_id
                from platform.associations a
                where a.source_type = 'note'
                  and a.source_id = n.id
                  and a.target_type = 'task'
                order by a.position nulls last, a.created_at, a.id
                limit 1
            )
        into v_org_id, v_project_id, v_task_id
        from workbench.notes n where n.id = p_entity_id;$canonical$;
begin
  if v_oid is null then
    raise exception 'resolve_full_context(uuid,text,uuid,uuid[]) is missing';
  end if;

  select pg_get_functiondef(v_oid) into v_definition;
  if position(v_legacy in v_definition) > 0 then
    execute replace(v_definition, v_legacy, v_canonical);
  elsif position(
    'from platform.associations a' in v_definition
  ) = 0 then
    raise exception 'resolve_full_context note branch has unexpected drift';
  end if;
end
$cutover$;

drop trigger if exists _mirror_proj on workbench.notes;
drop trigger if exists _mirror_task on workbench.notes;

alter table workbench.notes
  drop constraint if exists notes_project_id_fkey,
  drop constraint if exists notes_task_id_fkey;

comment on column workbench.notes.project_id is
  'DEPRECATED compatibility field; canonical note-project context is platform.associations. Do not read or write.';
comment on column workbench.notes.task_id is
  'DEPRECATED compatibility field; canonical note-task context is platform.associations. Do not read or write.';
