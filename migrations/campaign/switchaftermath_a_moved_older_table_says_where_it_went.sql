-- chair-step: lane SWITCH-AFTERMATH. After an owner presses Data tables → new system, the older tables are archived and every screen that read them went quiet: /data listed nothing, Trash listed them as "Dataset" titled by their description with a Restore that would bring back ONE older table beside a switch that says the organization lives in the new system. ADDS the member door platform.data_tables_switched_for_me() (which of my organizations switched, when and by whom — /data's home reads it and lists those organizations' tables where they now live), the private question platform._older_table_moved_by_switch(uuid), and the trigger workbench._moved_older_table_restores_with_switch_back on workbench.udt_datasets (a moved older table comes back only through Switch back, i.e. workbench.udt_dataset_unarchive, never by one Trash restore). REPLACES public.trash_list and public.org_trash_list (a moved older table is labelled "Older table (moved to the new system)"). UPDATES one registry row: platform.entity_types token dataset title_column description → table_name (Trash, rename and reference search name a table by its name).
-- based-on: public.trash_list(text[], integer, integer) 4efca1945342f185116795d1bd7adc235ad90eaf3c1371af98519470864329c4
-- based-on: public.org_trash_list(uuid, text[], uuid, integer, integer) 7850e3b262c44571df3178439cc563375bc7f03df75048ddb886dbbc9db71b53
-- lane: SWITCH-AFTERMATH
-- INVERSE: migrations/inverse/switchaftermath_a_moved_older_table_says_where_it_went_down.sql


-- ── 1. WHICH OF MY ORGANIZATIONS SWITCHED ─────────────────────────────────────────────────────
create or replace function platform.data_tables_switched_for_me()
returns table(organization_id uuid, organization_name text, switched_at timestamptz, switched_by text)
language sql
stable
security definer
set search_path to 'pg_catalog'
as $$
  select o.id,
         o.name::text,
         p.pressed_at,
         coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                  nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
                  u.email::text)
    from iam.organization_member m
    join iam.organizations o on o.id = m.organization_id and o.archived_at is null
    cross join lateral platform._cutover_seam_last_done('older_tables', o.id) p
    left join auth.users u on u.id = p.pressed_by
   where m.user_id = (select auth.uid())
     and p.direction = 'new'
   order by p.pressed_at desc;
$$;

comment on function platform.data_tables_switched_for_me() is
  'SWITCH-AFTERMATH: the organizations the signed-in person is a member of whose Data tables switch (platform.cutover_seam_press, older_tables) is on the new system, with when and who pressed it. /data''s home reads it to list those organizations'' tables where they now live and to say "Data tables moved to the new system on <date> by <who>. Switch back". Members only; nothing about a table.';


insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, signed_in_callers)
select 'platform', 'data_tables_switched_for_me', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/switchaftermath_a_moved_older_table_says_where_it_went.sql (lane SWITCH-AFTERMATH)',
       'Takes no argument. Answers only the caller''s own organizations (iam.organization_member for auth.uid()) whose Data tables switch is on, with the press time and the presser''s display name — the same line every member already reads on the organization''s settings page (platform.cutover_seams). Nothing about any table.',
       true
  from pg_proc p where p.oid = 'platform.data_tables_switched_for_me()'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;

grant execute on function platform.data_tables_switched_for_me() to authenticated, service_role;


-- ── 2. WAS THIS OLDER TABLE MOVED BY ITS ORGANIZATION'S SWITCH? ───────────────────────────────
create or replace function platform._older_table_moved_by_switch(p_table_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog'
as $$
  select coalesce((
    select d.deleted_at is not null
       and d.metadata ? 'moved_to'
       and (platform._cutover_seam_last_done('older_tables', d.organization_id)).direction = 'new'
      from workbench.udt_datasets d
     where d.id = p_table_id), false);
$$;

comment on function platform._older_table_moved_by_switch(uuid) is
  'SWITCH-AFTERMATH: true when the older table <id> is archived with a moved_to pointer and its organization''s Data tables switch is on the new system — it moved with the switch and comes back only with Switch back. Private: asked by the Trash lists and the restore guard.';


insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select 'platform', '_older_table_moved_by_switch', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/switchaftermath_a_moved_older_table_says_where_it_went.sql (lane SWITCH-AFTERMATH)',
       'p_table_id is only looked up (workbench.udt_datasets by primary key); an unknown id answers false. It returns one boolean.',
       'server_only: called only from inside public.trash_list, public.org_trash_list and the trigger workbench._moved_older_table_restores_with_switch_back (all SECURITY DEFINER); EXECUTE is revoked from every client role.',
       false, false
  from pg_proc p where p.oid = 'platform._older_table_moved_by_switch(uuid)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;



-- ── 3. A MOVED OLDER TABLE COMES BACK ONLY WITH SWITCH BACK ───────────────────────────────────
-- Switch back (platform._cutover_seam_apply, direction old) brings them back through
-- workbench.udt_dataset_unarchive, which stamps metadata.unarchived_at in the same update. Every
-- other door (Trash's entity_undelete and org_trash_restore, a raw update) only clears deleted_at;
-- that would bring back ONE older table while the organization's switch says its tables live in
-- the new system, and the older viewer would open it beside its copy. Refused here, once, for
-- every door, with what to do instead.
create or replace function workbench._moved_older_table_restores_with_switch_back()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
begin
  if old.deleted_at is not null and new.deleted_at is null
     and old.metadata ? 'moved_to'
     and (new.metadata ->> 'unarchived_at') is not distinct from (old.metadata ->> 'unarchived_at')
     and platform._older_table_moved_by_switch(old.id) then
    raise exception '"%" moved to the new system when this organization switched its Data tables, so it is not restored on its own. Switch back restores all of them together: organization settings, Data, Switch back.',
                    coalesce(nullif(btrim(old.table_name), ''), 'This older table')
      using errcode = '23514',
            hint = 'Its copy in the new system is the live table (same id, same address). To go back to the older tables, press Switch back on /organizations/' || old.organization_id || '/settings#data.';
  end if;
  return new;
end;
$$;

comment on function workbench._moved_older_table_restores_with_switch_back() is
  'SWITCH-AFTERMATH: refuses clearing deleted_at on an older table that moved with its organization''s Data tables switch unless the write is Switch back''s own (workbench.udt_dataset_unarchive stamps metadata.unarchived_at). One Trash restore must never bring back one older table beside the switch.';


create or replace trigger _moved_older_table_restores_with_switch_back
  before update of deleted_at on workbench.udt_datasets
  for each row
  when (old.deleted_at is not null and new.deleted_at is null)
  execute function workbench._moved_older_table_restores_with_switch_back();

-- ── 4. TRASH NAMES A TABLE BY ITS NAME, AND SAYS A MOVED ONE MOVED ────────────────────────────
update platform.entity_types
   set title_column = 'table_name'
 where token = 'dataset' and schema_name = 'workbench' and table_name = 'udt_datasets'
   and title_column is distinct from 'table_name';

create or replace function public.trash_list(p_kinds text[] default null::text[], p_limit integer default 200, p_offset integer default 0)
 returns table(artifact_kind text, entity_token text, label text, id uuid, title text, deleted_at timestamp with time zone, organization_id uuid, is_mine boolean)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  -- lane TRASH-2: personal Trash — what you own plus what was named to you. `limit`/`offset` are per kind.
  -- lane SWITCH-AFTERMATH: an older table that moved with its organization's Data tables switch says so.
  select r.artifact_kind, r.entity_token,
         case when r.entity_token = 'dataset' and platform._older_table_moved_by_switch(r.id)
              then 'Older table (moved to the new system)' else r.label end,
         r.id, r.title, r.deleted_at, r.organization_id, r.is_mine
    from public._trash_kind_rows((select auth.uid()), null, null, p_kinds, p_limit, p_offset) r;
$function$;

create or replace function public.org_trash_list(p_organization_id uuid, p_kinds text[] default null::text[], p_member uuid default null::uuid, p_limit integer default 50, p_offset integer default 0)
 returns table(artifact_kind text, entity_token text, label text, id uuid, title text, deleted_at timestamp with time zone, organization_id uuid, is_mine boolean, owner_id uuid, owner_label text)
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
-- lane TRASH-2. One merged page (newest first) across the chosen kinds: `limit`/`offset` apply to the
-- merged list, not per kind.
-- lane SWITCH-AFTERMATH: an older table that moved with the organization's Data tables switch says so.
declare
  v_me uuid := public._org_trash_gate(p_organization_id);
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  return query
  select r.artifact_kind, r.entity_token,
         case when r.entity_token = 'dataset' and platform._older_table_moved_by_switch(r.id)
              then 'Older table (moved to the new system)' else r.label end,
         r.id, r.title, r.deleted_at, r.organization_id,
         r.is_mine, r.owner_id,
         coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                  nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
                  u.email::text)
    from public._trash_kind_rows(v_me, p_organization_id, p_member, p_kinds, v_limit + v_offset, 0) r
    left join auth.users u on u.id = r.owner_id
   order by r.deleted_at desc, r.id
   limit v_limit offset v_offset;
end;
$function$;
