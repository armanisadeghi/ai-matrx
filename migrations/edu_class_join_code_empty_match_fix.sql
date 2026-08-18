-- Empty-code match fix (adversarial finding, 2026-08-18, HIGH).
--
-- edu_class_by_code / edu_class_join_by_code matched with
--   upper(coalesce(s.settings->>'join_code','')) = upper(btrim(p_code))
-- so p_code = '' (or whitespace) matched EVERY class with no join code —
-- letting any authenticated user preview and even JOIN an arbitrary codeless
-- open/closed class, bypassing the closed-class approval flow. Fix: refuse
-- short/empty input outright AND only match classes that actually HAVE a code.
-- (The client's length>=4 guard never protected the RPC surface.)

-- ── edu_class_by_code ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.edu_class_by_code(p_code text)
 RETURNS TABLE(class_id uuid, name text, description text, access_mode text, member_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_code, ''))) < 4 then
    return; -- an impossible code matches nothing
  end if;
  return query
  select s.id,
         s.name,
         s.description,
         public._edu_access_mode(s),
         (select count(*) from iam.memberships m
           where m.container_type = 'scope' and m.container_id = s.id
             and m.status = 'active' and m.deleted_at is null)
  from context.scopes s
  join context.scope_types st on st.id = s.scope_type_id
  where st.slug = 'class'
    and s.deleted_at is null
    and s.settings->>'join_code' is not null
    and upper(s.settings->>'join_code') = upper(btrim(p_code))
  limit 1;
end;
$function$;

-- ── edu_class_join_by_code ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.edu_class_join_by_code(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_scope context.scopes;
  v_mode text;
  v_row iam.memberships;
  v_live boolean;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_code, ''))) < 4 then
    raise exception 'invalid join code' using errcode = 'P0002';
  end if;

  select s.* into v_scope
  from context.scopes s
  join context.scope_types st on st.id = s.scope_type_id
  where st.slug = 'class'
    and s.deleted_at is null
    and s.settings->>'join_code' is not null
    and upper(s.settings->>'join_code') = upper(btrim(p_code))
  limit 1;
  if v_scope.id is null then
    raise exception 'invalid join code' using errcode = 'P0002';
  end if;

  v_mode := public._edu_access_mode(v_scope);

  if public._edu_is_owner(v_scope) then
    perform public._edu_ensure_owner_membership(v_scope);
    return jsonb_build_object('status', 'already_member', 'role', 'owner', 'access_mode', v_mode, 'class_id', v_scope.id);
  end if;

  select * into v_row from iam.memberships
  where container_type = 'scope' and container_id = v_scope.id
    and user_id = v_uid limit 1;
  v_live := v_row.id is not null and v_row.deleted_at is null;

  if v_live and v_row.status = 'active' then
    return jsonb_build_object('status', 'already_member', 'role', v_row.role, 'access_mode', v_mode, 'class_id', v_scope.id);
  end if;

  if v_mode = 'paid' and not (v_live and v_row.status = 'entitled') then
    return jsonb_build_object('status', 'needs_purchase', 'access_mode', v_mode, 'class_id', v_scope.id);
  end if;

  if v_row.id is not null then
    update iam.memberships
       set status = 'active', role = 'member', deleted_at = null, updated_at = now(), updated_by = v_uid
     where id = v_row.id;
  else
    insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
    values (v_scope.organization_id, 'scope', v_scope.id, v_uid, 'member', 'active', v_uid);
  end if;

  return jsonb_build_object('status', 'joined', 'role', 'member', 'access_mode', v_mode, 'class_id', v_scope.id);
end;
$function$;

-- ── _edu_generate_join_code — same shape hardening (never harmful, now airtight)
CREATE OR REPLACE FUNCTION public._edu_generate_join_code()
 RETURNS text
 LANGUAGE plpgsql
 VOLATILE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_attempt int := 0;
begin
  loop
    v_attempt := v_attempt + 1;
    if v_attempt > 20 then
      raise exception 'could not generate a unique join code';
    end if;
    select string_agg(substr(v_alphabet, 1 + floor(random() * 32)::int, 1), '')
      into v_code
      from generate_series(1, 6);
    exit when not exists (
      select 1
      from context.scopes s
      join context.scope_types st on st.id = s.scope_type_id
      where st.slug = 'class'
        and s.deleted_at is null
        and s.settings->>'join_code' is not null
        and upper(s.settings->>'join_code') = v_code
    );
  end loop;
  return v_code;
end;
$function$;
