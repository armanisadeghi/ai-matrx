-- INVERSE of migrations/campaign/trash2_personal_trash_is_yours_and_the_organization_has_its_own.sql
-- Puts back the pre-TRASH-2 bodies of public.trash_list / public.trash_counts (captured live
-- 2026-09-25), drops the organization Trash doors and the shared listing body, and removes the
-- door and notice-type rows the up file declared. Notification rows already written stay (history).
-- lane: TRASH-2
-- based-on: public.trash_list(text[], integer, integer) 4efca1945342f185116795d1bd7adc235ad90eaf3c1371af98519470864329c4
-- based-on: public.trash_counts() e689ba7ca3e0cc743ac46ffae5ab3b00cfab901a731744663ff892b64965d3c9


CREATE OR REPLACE FUNCTION public.trash_list(p_kinds text[] DEFAULT NULL::text[], p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(artifact_kind text, entity_token text, label text, id uuid, title text, deleted_at timestamp with time zone, organization_id uuid, is_mine boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  rec record;
  v_uid uuid := (select auth.uid());
  v_title text;
  v_org text;
  v_sql text;
  v_limit int := least(greatest(coalesce(p_limit, 200), 1), 1000);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  if v_uid is null then return; end if;

  for rec in
    select e.token, e.user_artifact_kind as kind, e.label,
           e.schema_name as sch, e.table_name as tbl,
           coalesce(e.retention_owner_column, 'created_by') as owner_col,
           e.title_column, e.feature_owned_restore
      from platform.entity_types e
     where e.user_artifact_kind is not null
       and e.is_active
       and (p_kinds is null or e.user_artifact_kind = any(p_kinds))
     order by e.user_artifact_kind
  loop
    begin
      if to_regclass(format('%I.%I', rec.sch, rec.tbl)) is null then continue; end if;

      if rec.token = 'credential_item' and rec.feature_owned_restore then
        return query execute format(
          'select %L::text, %L::text, %L::text, t.id, t.display_name::text,
                  t.deleted_at, t.organization_id, (t.user_id = $1)
             from users.credential_items t
            where t.deleted_at is not null
              and (
                t.user_id = $1
                or (
                  t.organization_id is not null
                  and t.organization_id in (select iam.my_orgs())
                  and public.is_org_admin_for($1, t.organization_id)
                )
              )
            order by t.deleted_at desc
            limit %s offset %s',
          rec.kind, rec.token, rec.label, v_limit, v_offset)
          using v_uid;
        continue;
      end if;

      select c.column_name into v_title
        from information_schema.columns c
       where c.table_schema = rec.sch and c.table_name = rec.tbl
         and c.column_name = coalesce(rec.title_column, '')
       limit 1;
      if v_title is null then
        select c.column_name into v_title
          from information_schema.columns c
          join lateral (select array_position(
                 array['name','title','label','display_name','file_name','folder_name'],
                 c.column_name) as rank) r on true
         where c.table_schema = rec.sch and c.table_name = rec.tbl and r.rank is not null
         order by r.rank
         limit 1;
      end if;

      select c.column_name into v_org
        from information_schema.columns c
       where c.table_schema = rec.sch and c.table_name = rec.tbl
         and c.column_name = 'organization_id'
       limit 1;

      v_sql := format(
        'select %L::text, %L::text, %L::text, t.id, %s, t.deleted_at, %s, (t.%I = $1)
           from %I.%I t
          where t.deleted_at is not null
            and (t.%I = $1 %s)
            and (t.%I = $1 or iam.has_access(%L, t.id, ''viewer''::permission_level))
          order by t.deleted_at desc
          limit %s offset %s',
        rec.kind, rec.token, rec.label,
        case when v_title is null then 'null::text' else format('t.%I::text', v_title) end,
        case when v_org is null then 'null::uuid' else format('t.%I', v_org) end,
        rec.owner_col, rec.sch, rec.tbl, rec.owner_col,
        case when v_org is null then '' else format('or t.%I in (select iam.my_orgs())', v_org) end,
        rec.owner_col, rec.token, v_limit, v_offset);
      return query execute v_sql using v_uid;
    exception when undefined_table or undefined_column or insufficient_privilege then continue;
    end;
  end loop;
end;
$function$;


CREATE OR REPLACE FUNCTION public.trash_counts()
 RETURNS TABLE(artifact_kind text, label text, n bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  rec record;
  v_uid uuid := (select auth.uid());
  v_org text;
  v_n bigint;
begin
  if v_uid is null then return; end if;

  for rec in
    select e.token, e.user_artifact_kind as kind, e.label,
           e.schema_name as sch, e.table_name as tbl,
           coalesce(e.retention_owner_column, 'created_by') as owner_col,
           e.feature_owned_restore
      from platform.entity_types e
     where e.user_artifact_kind is not null and e.is_active
     order by e.user_artifact_kind
  loop
    begin
      if to_regclass(format('%I.%I', rec.sch, rec.tbl)) is null then continue; end if;

      if rec.token = 'credential_item' and rec.feature_owned_restore then
        select count(*) into v_n
          from users.credential_items t
         where t.deleted_at is not null
           and (
             t.user_id = v_uid
             or (
               t.organization_id is not null
               and t.organization_id in (select iam.my_orgs())
               and public.is_org_admin_for(v_uid, t.organization_id)
             )
           );
      else
        select c.column_name into v_org
          from information_schema.columns c
         where c.table_schema = rec.sch and c.table_name = rec.tbl
           and c.column_name = 'organization_id'
         limit 1;
        execute format(
          'select count(*) from %I.%I t
            where t.deleted_at is not null
              and (t.%I = $1 %s)
              and (t.%I = $1 or iam.has_access(%L, t.id, ''viewer''::permission_level))',
          rec.sch, rec.tbl, rec.owner_col,
          case when v_org is null then '' else format('or t.%I in (select iam.my_orgs())', v_org) end,
          rec.owner_col, rec.token)
          into v_n using v_uid;
      end if;

      if v_n > 0 then
        artifact_kind := rec.kind; label := rec.label; n := v_n; return next;
      end if;
    exception when undefined_table or undefined_column or insufficient_privilege then continue;
    end;
  end loop;
end;
$function$;


delete from platform.client_callable_door
 where schema_name = 'public' and function_name in ('org_trash_list', 'org_trash_counts', 'org_trash_restore',
                         '_trash_kind_rows', '_trash_kind_counts', '_org_trash_gate');

delete from communication.notification_event_type
 where event_key = 'trash.restored_by_org_admin'
   and not exists (select 1 from communication.notification n where n.event_key = 'trash.restored_by_org_admin');

drop function if exists public.org_trash_restore(uuid, text, uuid);
drop function if exists public.org_trash_counts(uuid, uuid);
drop function if exists public.org_trash_list(uuid, text[], uuid, integer, integer);
drop function if exists public._org_trash_gate(uuid);
drop function if exists public._trash_kind_counts(uuid, uuid, uuid);
drop function if exists public._trash_kind_rows(uuid, uuid, uuid, text[], integer, integer);
