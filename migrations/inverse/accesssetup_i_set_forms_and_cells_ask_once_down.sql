-- chair-step: inverse of accesssetup_i — restores the accesssetup_h body of iam._seat_table_now, the accesssetup_f body of iam._cells_for (no statement memo) and the accesssetup_c/f bodies of the four hr.review_seat_*_set forms, then drops iam._cells_for_now and its door row.
-- lane: access-setup
-- lock: hr,iam
-- ground-standing-ok: b - this inverse restores bodies of iam._seat_table_now and iam._cells_for that call iam._access_setup_call_uuid and iam._access_setup_stages; it runs BEFORE accesssetup_h's, g's and b's inverses, and accesssetup_b_the_seat_and_part_answers_down drops those bodies and their helpers together.

CREATE OR REPLACE FUNCTION iam._seat_table_now(p_type text, p_id uuid)
 RETURNS TABLE(seat text, user_id uuid, source text, removable boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  s jsonb := iam._access_setup_of(p_type);
  v_seat jsonb; v_key text; v_kind text; v_org uuid; v_required boolean;
  v_subject_key text; v_subject uuid[] := '{}';
  v_res uuid[]; v_src text; v_add uuid[]; v_excl uuid[]; v_fb uuid[]; v_n integer; v_head jsonb;
begin
  if s is null or p_id is null then return; end if;
  v_subject_key := s ->> 'subject_seat';
  v_org := iam._access_setup_head_org(p_type, p_id);
  if v_org is null then return; end if;

  -- the subject seat first, so every other seat can drop its holders
  for v_seat in
    select e from jsonb_array_elements(s -> 'seats') e
     order by (e ->> 'key') is distinct from v_subject_key
  loop
    v_key := v_seat ->> 'key';
    v_kind := v_seat #>> '{resolver,kind}';
    v_required := coalesce((v_seat ->> 'required')::boolean, false);
    v_res := '{}'; v_src := 'resolver'; v_fb := '{}';
    if v_kind = 'function' then
      v_res := coalesce((select array_agg(distinct x::uuid) from jsonb_array_elements_text(
                 coalesce(iam._access_setup_call_uuid(v_seat #>> '{resolver,fn}', p_id), '[]'::jsonb)) x
                 where x is not null), '{}');
    elsif v_kind = 'grants' then
      v_src := 'grant';
      v_res := coalesce((select array_agg(distinct p.granted_to_user_id) from iam.permissions p
                          where p.resource_type = p_type and p.resource_id = p_id and p.granted_to_user_id is not null
                            and coalesce(p.status, 'active') = 'active'
                            and (p.expires_at is null or p.expires_at > now())), '{}');
    end if;
    v_add := coalesce((select array_agg(distinct c.user_id) from iam.record_seat_change c
                        where c.entity_type = p_type and c.record_id = p_id and c.seat_key = v_key
                          and c.change = 'add' and c.deleted_at is null), '{}');
    v_excl := coalesce((select array_agg(distinct c.user_id) from iam.record_seat_change c
                         where c.entity_type = p_type and c.record_id = p_id and c.seat_key = v_key
                           and c.change = 'exclude' and c.deleted_at is null), '{}');
    v_res := coalesce((select array_agg(x) from unnest(v_res) x where not x = any(v_excl)), '{}');
    v_add := coalesce((select array_agg(x) from unnest(v_add) x where not x = any(v_excl) and not x = any(v_res)), '{}');
    if v_key = v_subject_key then
      v_subject := v_res || v_add;
    else
      -- the subject rule: other seats never resolve to the person the record is about
      v_res := coalesce((select array_agg(x) from unnest(v_res) x where not x = any(v_subject)), '{}');
      v_add := coalesce((select array_agg(x) from unnest(v_add) x where not x = any(v_subject)), '{}');
      -- the fallback: a required seat is never empty — unless the seat's fallback_when_fact says the record
      -- itself names the holder (a manager employment without a login is filled by the recorder rule)
      if v_required and cardinality(v_res) + cardinality(v_add) = 0
         and v_seat ->> 'fallback' = 'org_owners_admins' then
        if v_seat ? 'fallback_when_fact' and v_head is null then
          v_head := coalesce(iam._access_setup_facts(s, p_type, p_id), '{}'::jsonb);
        end if;
        if not (v_seat ? 'fallback_when_fact') or v_head @> (v_seat -> 'fallback_when_fact') then
          v_fb := coalesce((select array_agg(distinct m.user_id) from iam.memberships m
                             where m.organization_id = v_org and m.container_type = 'organization'
                               and m.role in ('owner', 'admin') and m.status = 'active' and m.deleted_at is null
                               and not (m.user_id = any(v_subject))
                               and not (m.user_id = any(v_excl))), '{}');
        end if;
      end if;
    end if;
    v_n := cardinality(v_res) + cardinality(v_add) + cardinality(v_fb);
    return query
      select v_key, x, v_src, not v_required or v_n > 1 from unnest(v_res) x
      union all
      select v_key, x, 'added', true from unnest(v_add) x
      union all
      select v_key, x, 'fallback', false from unnest(v_fb) x;
  end loop;
end
$function$;

CREATE OR REPLACE FUNCTION iam._cells_for(p_person uuid, p_type text, p_id uuid, p_part text)
 RETURNS TABLE(seat text, level permission_level, rows_rule text, from_stage jsonb, names text, reached boolean, borrowed boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  s jsonb := iam._access_setup_of(p_type);
  v_seats text[]; v_blind text[]; v_stages text[]; v_head jsonb; v_admin text[]; r jsonb; v_lend text[];
  v_seat text; c jsonb; v_held text[];
begin
  if s is null or p_person is null then return; end if;
  v_seats := iam.seats_of(p_person, p_type, p_id);
  v_stages := iam._access_setup_stages(s, p_id);
  v_admin := coalesce((select array_agg(x) from jsonb_array_elements_text(s -> 'admin_seats') x), '{}');

  -- blind_wins: a person who also holds a listed seat keeps that seat's gate on this part — only when they
  -- hold it in their own right (resolver, grant, add), never when a fallback merely filled an empty seat
  v_blind := (select array_agg(x) from jsonb_array_elements_text(s -> 'blind_wins' -> p_part) x);
  if v_blind is not null and v_seats && v_blind then
    v_held := coalesce((select array_agg(distinct t.seat) from iam._seat_table(p_type, p_id) t
                         where t.user_id = p_person and t.source <> 'fallback'), '{}');
    if v_held && v_blind then
      v_seats := (select array_agg(x) from unnest(v_seats) x where x = any(v_blind));
    end if;
  end if;

  foreach v_seat in array coalesce(v_seats, '{}') loop
    c := s -> 'grid' -> v_seat -> p_part;
    if c is not null then
      seat := v_seat; level := (c ->> 'level')::public.permission_level; rows_rule := coalesce(c ->> 'rows', 'all');
      from_stage := c -> 'from_stage'; names := coalesce(c ->> 'names', 'shown');
      reached := iam._access_setup_stage_reached(c -> 'from_stage', v_stages); borrowed := false;
      return next;
    end if;
  end loop;

  -- recorders: when a seat's holder has no login, the lend_to seats borrow that seat's editor cells
  -- (never the subject, never the holder themselves)
  if jsonb_array_length(coalesce(s -> 'recorders', '[]'::jsonb)) > 0
     and not (coalesce(iam.seats_of(p_person, p_type, p_id), '{}') @> array[s ->> 'subject_seat']) then
    v_head := iam._access_setup_facts(s, p_type, p_id);
    for r in select e from jsonb_array_elements(s -> 'recorders') e loop
      v_lend := case when r ->> 'lend_to' = 'admin_seats' then v_admin
                     else (select array_agg(x) from jsonb_array_elements_text(r -> 'lend_to') x) end;
      if coalesce(iam.seats_of(p_person, p_type, p_id), '{}') && coalesce(v_lend, '{}')
         and not (coalesce(iam.seats_of(p_person, p_type, p_id), '{}') @> array[r ->> 'for_seat'])
         and coalesce(v_head, '{}'::jsonb) @> coalesce(r -> 'when_fact', '{}'::jsonb) then
        c := s -> 'grid' -> (r ->> 'for_seat') -> p_part;
        if c is not null and c ->> 'level' = 'editor' then
          seat := r ->> 'for_seat'; level := 'editor'; rows_rule := coalesce(c ->> 'rows', 'all');
          from_stage := c -> 'from_stage'; names := coalesce(c ->> 'names', 'shown');
          reached := iam._access_setup_stage_reached(c -> 'from_stage', v_stages); borrowed := true;
          return next;
        end if;
      end if;
    end loop;
  end if;
end
$function$;

CREATE OR REPLACE FUNCTION hr.review_seat_employee_set(p_person uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
  select r.id from hr.review r
   where r.deleted_at is null
     and (r.employee_user_id = p_person or r.employment_id = any(hr.employments_of(p_person)));
$function$;

CREATE OR REPLACE FUNCTION hr.review_seat_line_manager_set(p_person uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
  select r.id from hr.review r
   where r.deleted_at is null
     and (exists (select 1 from hr.manager_chain(r.employment_id, current_date) mc
                   where mc.manager_employment_id = any(hr.employments_of(p_person))
                     and (mc.depth = 1 or (mc.depth = 2 and hr._review_skip_level_on(r.organization_id))))
          or exists (select 1 from hr.review r2 where r2.employment_id = r.employment_id and r2.deleted_at is null
                       and r2.manager_employment_id = any(hr.employments_of(p_person))));
$function$;

CREATE OR REPLACE FUNCTION hr.review_seat_manager_set(p_person uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
  select r.id from hr.review r
   where r.deleted_at is null
     and (r.manager_user_id = p_person or r.manager_employment_id = any(hr.employments_of(p_person)));
$function$;

CREATE OR REPLACE FUNCTION hr.review_seat_skip_level_set(p_person uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
  select r.id from hr.review r
   where r.deleted_at is null and r.manager_employment_id is not null
     and hr.manager_as_of(r.manager_employment_id, current_date) = any(hr.employments_of(p_person))
     and hr._review_skip_level_on(r.organization_id);
$function$;

delete from platform.client_callable_door where schema_name = 'iam' and function_name = '_cells_for_now';
drop function iam._cells_for_now(uuid, text, uuid, text);
