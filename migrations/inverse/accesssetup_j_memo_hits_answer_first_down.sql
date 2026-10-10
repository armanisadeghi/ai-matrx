-- chair-step: inverse of accesssetup_j — restores the accesssetup_h/i bodies of the six statement-memo wrappers (iam._seat_table, iam.seats_of, iam.part_level, iam._cells_for, iam._access_setup_stages, iam._access_setup_facts), which ask iam.kernel_batch_on before reading a memo slot.
-- lane: access-setup
-- lock: iam
-- ground-standing-ok: b - the restored iam._access_setup_stages body calls iam._access_setup_call_uuid; this inverse runs BEFORE accesssetup_i's, h's, g's and b's inverses, and accesssetup_b_the_seat_and_part_answers_down drops those bodies and their helpers together.

CREATE OR REPLACE FUNCTION iam._access_setup_facts(p_setup jsonb, p_token text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- a row's facts from the setup's rows_fn; statement memo per (rows_fn, token, id, snapshot) while iam.kernel_batch_on
declare v_proc regprocedure; v_out jsonb; v_key text; v_m text;
begin
  if p_setup is null or p_setup ->> 'rows_fn' is null or p_id is null then return null; end if;
  if iam.kernel_batch_on(null) then
    v_key := 'iam._access_setup_facts:' || (p_setup ->> 'rows_fn') || ':' || coalesce(p_token, '') || ':' || p_id::text
          || ':' || pg_catalog.pg_current_snapshot()::text;
    v_m := platform.memo_k_get(v_key);
    if v_m is not null then return nullif(v_m, '-')::jsonb; end if;
  end if;
  v_proc := to_regprocedure(p_setup ->> 'rows_fn');
  if v_proc is null then raise exception 'access setup: rows_fn % does not exist', p_setup ->> 'rows_fn' using errcode = '42883'; end if;
  execute format('select %s($1, $2)', v_proc::regproc) into v_out using p_token, p_id;
  if v_key is not null then perform platform.memo_k_put(v_key, coalesce(v_out::text, '-')); end if;
  return v_out;
end
$function$
;
CREATE OR REPLACE FUNCTION iam._access_setup_stages(p_setup jsonb, p_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- the record's reached stages; statement memo per (stages_fn, id, snapshot) while iam.kernel_batch_on
declare v jsonb; v_key text; v_m text; v_out text[];
begin
  if p_setup is null or p_setup ->> 'stages_fn' is null then return '{}'::text[]; end if;
  if p_id is not null and iam.kernel_batch_on(null) then
    v_key := 'iam._access_setup_stages:' || (p_setup ->> 'stages_fn') || ':' || p_id::text || ':'
          || pg_catalog.pg_current_snapshot()::text;
    v_m := platform.memo_k_get(v_key);
    if v_m is not null then return v_m::text[]; end if;
  end if;
  v := iam._access_setup_call_uuid(p_setup ->> 'stages_fn', p_id);
  v_out := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v, '[]'::jsonb)) x), '{}'::text[]);
  if v_key is not null then perform platform.memo_k_put(v_key, v_out::text); end if;
  return v_out;
end
$function$
;
CREATE OR REPLACE FUNCTION iam._cells_for(p_person uuid, p_type text, p_id uuid, p_part text)
 RETURNS TABLE(seat text, level permission_level, rows_rule text, from_stage jsonb, names text, reached boolean, borrowed boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- iam._cells_for_now's rows, kept in the statement memo per (person, type, id, part, snapshot) while
-- iam.kernel_batch_on(person): every response row's part_level asks the same cells
declare v_key text; v_m text; v_j jsonb;
begin
  if p_person is null or p_id is null or not iam.kernel_batch_on(p_person) then
    return query select * from iam._cells_for_now(p_person, p_type, p_id, p_part);
    return;
  end if;
  v_key := 'iam._cells_for:' || p_person::text || ':' || coalesce(p_type, '') || ':' || p_id::text || ':'
        || coalesce(p_part, '') || ':' || pg_catalog.pg_current_snapshot()::text;
  v_m := platform.memo_k_get(v_key);
  if v_m is null then
    select coalesce(jsonb_agg(jsonb_build_array(c.seat, c.level, c.rows_rule, c.from_stage, c.names, c.reached, c.borrowed)
                              order by c.n), '[]'::jsonb)
      into v_j
      from iam._cells_for_now(p_person, p_type, p_id, p_part)
           with ordinality c(seat, level, rows_rule, from_stage, names, reached, borrowed, n);
    perform platform.memo_k_put(v_key, v_j::text);
  else
    v_j := v_m::jsonb;
  end if;
  return query select e ->> 0, (e ->> 1)::public.permission_level, e ->> 2,
                      case when jsonb_typeof(e -> 3) = 'null' then null else e -> 3 end,
                      e ->> 4, (e ->> 5)::boolean, (e ->> 6)::boolean
                 from jsonb_array_elements(v_j) with ordinality x(e, n) order by x.n;
end
$function$
;
CREATE OR REPLACE FUNCTION iam._seat_table(p_type text, p_id uuid)
 RETURNS TABLE(seat text, user_id uuid, source text, removable boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- iam._seat_table_now's rows, kept in the statement memo per (type, id, snapshot) while iam.kernel_batch_on.
declare v_key text; v_m text; v_j jsonb;
begin
  if p_id is null or not iam.kernel_batch_on(null) then
    return query select * from iam._seat_table_now(p_type, p_id);
    return;
  end if;
  v_key := 'iam._seat_table:' || coalesce(p_type, '') || ':' || p_id::text || ':' || pg_catalog.pg_current_snapshot()::text;
  v_m := platform.memo_k_get(v_key);
  if v_m is null then
    select coalesce(jsonb_agg(jsonb_build_array(t.seat, t.user_id, t.source, t.removable) order by t.n), '[]'::jsonb)
      into v_j from iam._seat_table_now(p_type, p_id) with ordinality t(seat, user_id, source, removable, n);
    perform platform.memo_k_put(v_key, v_j::text);
  else
    v_j := v_m::jsonb;
  end if;
  return query select e ->> 0, (e ->> 1)::uuid, e ->> 2, (e ->> 3)::boolean
                 from jsonb_array_elements(v_j) with ordinality x(e, n) order by x.n;
end
$function$
;
CREATE OR REPLACE FUNCTION iam.part_level(p_person uuid, p_type text, p_id uuid, p_part text, p_row_token text DEFAULT NULL::text, p_row_id uuid DEFAULT NULL::uuid)
 RETURNS permission_level
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- iam._part_level_now's answer, kept in the statement memo per (person, type, id, part, row, snapshot) while
-- iam.kernel_batch_on(person): redact_by_parts asks the same part once per mapped column
declare v_key text; v_m text; v_l public.permission_level;
begin
  if p_person is null or p_id is null or not iam.kernel_batch_on(p_person) then
    return iam._part_level_now(p_person, p_type, p_id, p_part, p_row_token, p_row_id);
  end if;
  v_key := 'iam.part_level:' || p_person::text || ':' || coalesce(p_type, '') || ':' || p_id::text || ':'
        || coalesce(p_part, '') || ':' || coalesce(p_row_token, '') || ':' || coalesce(p_row_id::text, '') || ':'
        || pg_catalog.pg_current_snapshot()::text;
  v_m := platform.memo_k_get(v_key);
  if v_m is not null then return nullif(v_m, '-')::public.permission_level; end if;
  v_l := iam._part_level_now(p_person, p_type, p_id, p_part, p_row_token, p_row_id);
  perform platform.memo_k_put(v_key, coalesce(v_l::text, '-'));
  return v_l;
end
$function$
;
CREATE OR REPLACE FUNCTION iam.seats_of(p_person uuid, p_type text, p_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- the seats one person holds on one record; asked once per (person, type, id, snapshot) per statement while
-- iam.kernel_batch_on(person) (statement memo)
declare v_key text; v_m text; v_s text[];
begin
  if iam._access_setup_of(p_type) is null or p_person is null then return null; end if;
  if iam.kernel_batch_on(p_person) then
    v_key := 'iam.seats_of:' || p_person::text || ':' || p_type || ':' || coalesce(p_id::text, '') || ':'
          || pg_catalog.pg_current_snapshot()::text;
    v_m := platform.memo_k_get(v_key);
    if v_m is not null then return v_m::text[]; end if;
  end if;
  v_s := coalesce((select array_agg(distinct t.seat order by t.seat)
                     from iam._seat_table(p_type, p_id) t where t.user_id = p_person), '{}'::text[]);
  if v_key is not null then perform platform.memo_k_put(v_key, v_s::text); end if;
  return v_s;
end
$function$
;
