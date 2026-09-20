-- inverse of writeperf_the_same_question_is_asked_once.sql
-- WHAT IT DOES NOT UNDO: nothing. It restores platform.knob_resolve's body byte for byte as
-- the catalogue held it before the memo, drops the memo and its six bump triggers, and drops
-- the uncached twin. No data was written, so none is lost.

CREATE OR REPLACE FUNCTION platform.knob_resolve(p_feature text, p_key text, p_organization_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_scopes jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'platform', 'public'
AS $function$
declare
  k record;
  v jsonb;
  v_num numeric;
  r record;
  v_effective jsonb;
  v_bound numeric;
  v_offered numeric;
begin
  -- ═══ DD-198: p_scopes is an ARRAY of rungs, or it is nothing ═══════════════
  -- This check is FIRST, before the register lookup, because the only other place
  -- p_scopes is ever touched is `jsonb_array_elements(p_scopes)` inside the
  -- candidate-override EXISTS below -- and that is reached only once an override
  -- row exists at a row-keyed rung. A caller passing an OBJECT therefore ran
  -- green for as long as nobody had created such an override, and raised
  -- `cannot extract elements from an object` on the first person who did
  -- (`platform._stamp_actor_tier`, every AI/code insert in that organization).
  -- A wrong argument must be wrong on the FIRST call, not on the first call that
  -- happens to reach the line that dereferences it.
  if p_scopes is not null and jsonb_typeof(p_scopes) <> 'array' then
    raise exception
      'platform.knob_resolve: p_scopes must be a JSON ARRAY of rungs this read is standing on, each {"kind": <rung>, "id": <uuid>} -- it arrived as a %, resolving %.%. An object such as jsonb_build_object(''table'', <id>) or ''{}''::jsonb names no rung at all, so every row-keyed override would be silently unreachable.',
      jsonb_typeof(p_scopes), p_feature, p_key
      using errcode = '22023',
            hint = 'Pass jsonb_build_array(jsonb_build_object(''kind'', ''table'', ''id'', <uuid>)), or NULL when this read stands on no row-keyed rung.';
  end if;
  select value_type, coalesce(value, default_value) as base,
         min_value, max_value, allowed_values, overridable_by,
         coalesce(override_direction, 'any') as direction
    into k
    from platform.feature_knob
   where feature = p_feature and key = p_key;
  if not found then
    raise exception 'platform.knob_resolve: knob %.% is not seeded', p_feature, p_key
      using errcode = 'P0001',
            hint = 'A missing knob raises rather than falling back to a hard-coded value. Seed it in the knob register.';
  end if;

  if p_organization_id is not null and k.overridable_by <> '{}'::text[] then
    if k.direction in ('lower_only', 'raise_only') then
      -- Walk the rungs OUTWARD from the platform value, lowest precedence
      -- first, keeping the bound the nearest higher rung established. Same walk
      -- as the Python resolver's `_apply_direction`.
      v_effective := k.base;
      v_bound := case when jsonb_typeof(k.base) = 'number' then (k.base #>> '{}')::numeric
                      when jsonb_typeof(k.base) = 'boolean' then ((k.base #>> '{}')::boolean)::int::numeric
                      else null end;
      for r in
        select o.value, o.scope_kind, s.precedence
          from platform.knob_override o
          join platform.knob_scope_kind s on s.kind = o.scope_kind
         where o.feature = p_feature and o.key = p_key
           and o.organization_id = p_organization_id
           and o.scope_kind = any (k.overridable_by)
           and not exists (select 1 from platform.knob_rung_lock l
                            where l.feature = o.feature and l.key = o.key
                              and l.organization_id = o.organization_id
                              and o.scope_kind = any (l.locked_kinds))
           and (   (o.scope_kind = 'organization')
                or (o.scope_kind = 'user' and p_user_id is not null and o.scope_id = p_user_id)
                or (p_scopes is not null and exists (
                      select 1 from jsonb_array_elements(p_scopes) e
                       where e ->> 'kind' = o.scope_kind
                         and (e ->> 'id')::uuid = o.scope_id)))
         order by s.precedence asc
      loop
        v_offered := case when jsonb_typeof(r.value) = 'number' then (r.value #>> '{}')::numeric
                          when jsonb_typeof(r.value) = 'boolean' then ((r.value #>> '{}')::boolean)::int::numeric
                          else null end;
        if v_offered is null or v_bound is null then
          v_effective := r.value;
          v_bound := v_offered;
          continue;
        end if;
        if (k.direction = 'lower_only' and v_offered > v_bound)
           or (k.direction = 'raise_only' and v_offered < v_bound) then
          raise warning 'knob_resolve: %.% the % rung offered %, which loosens the standing value % on a % knob — discarded',
            p_feature, p_key, r.scope_kind, v_offered, v_bound, k.direction;
          continue;
        end if;
        v_effective := r.value;
        v_bound := v_offered;
      end loop;
      -- `v` stays NULL when no rung moved it, so the base return below is the
      -- same single path it has always been.
      if v_effective is distinct from k.base then
        v := v_effective;
      end if;
    else
      select o.value into v
        from platform.knob_override o
        join platform.knob_scope_kind s on s.kind = o.scope_kind
       where o.feature = p_feature and o.key = p_key
         and o.organization_id = p_organization_id
         and o.scope_kind = any (k.overridable_by)
         and not exists (select 1 from platform.knob_rung_lock l
                          where l.feature = o.feature and l.key = o.key
                            and l.organization_id = o.organization_id
                            and o.scope_kind = any (l.locked_kinds))
         and (   (o.scope_kind = 'organization')
              or (o.scope_kind = 'user' and p_user_id is not null and o.scope_id = p_user_id)
              or (p_scopes is not null and exists (
                    select 1 from jsonb_array_elements(p_scopes) e
                     where e ->> 'kind' = o.scope_kind
                       and (e ->> 'id')::uuid = o.scope_id)))
       order by s.precedence desc
       limit 1;
    end if;
  end if;

  if v is null then
    return k.base;
  end if;

  if k.value_type in ('number','integer') and jsonb_typeof(v) = 'number' then
    v_num := (v #>> '{}')::numeric;
    if k.min_value is not null and v_num < k.min_value then
      raise warning 'knob_resolve: %.% override % below current min % — clamped',
        p_feature, p_key, v_num, k.min_value;
      return to_jsonb(k.min_value);
    end if;
    if k.max_value is not null and v_num > k.max_value then
      raise warning 'knob_resolve: %.% override % above current max % — clamped',
        p_feature, p_key, v_num, k.max_value;
      return to_jsonb(k.max_value);
    end if;
  elsif k.value_type in ('enum','string') and k.allowed_values is not null
        and not (k.allowed_values @> jsonb_build_array(v)) then
    raise warning 'knob_resolve: %.% override % no longer in allowed_values — using platform value',
      p_feature, p_key, v;
    return k.base;
  end if;

  return v;
end;
$function$

;

drop trigger if exists zz_memo_bump_i on platform.feature_knob;
drop trigger if exists zz_memo_bump_u on platform.feature_knob;
drop trigger if exists zz_memo_bump_d on platform.feature_knob;
drop trigger if exists zz_memo_bump_i on platform.knob_override;
drop trigger if exists zz_memo_bump_u on platform.knob_override;
drop trigger if exists zz_memo_bump_d on platform.knob_override;
drop trigger if exists zz_memo_bump_i on platform.knob_rung_lock;
drop trigger if exists zz_memo_bump_u on platform.knob_rung_lock;
drop trigger if exists zz_memo_bump_d on platform.knob_rung_lock;
drop function if exists platform.knob_resolve_uncached(text, text, uuid, uuid, jsonb);
drop function if exists platform.memo_bump();
drop function if exists platform.memo_clear();
drop function if exists platform.memo_put(text, text);
drop function if exists platform.memo_get(text);
drop function if exists platform.memo_all();
drop function if exists platform.memo_seat();
drop function if exists platform.memo_ceiling();
