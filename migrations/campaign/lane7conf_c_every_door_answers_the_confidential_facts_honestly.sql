-- chair-step: NEEDS ARMAN WATCHING (CHAIR-GUIDANCE § What needs Arman watching). This file:
--   · GRANTS EXECUTE to authenticated on one new door, crm.party_confidential_apply (declared in
--     platform.client_callable_door first). No new table, column, index or policy.
--   · LOCKS: two CREATE TRIGGER on crm.party (SHARE ROW EXCLUSIVE: writes wait, reads do not; no DROP).
--   · FRAGMENT edits (each anchor asserted present exactly once, refused by name otherwise) of five live
--     bodies: custom.entity_record_read, custom.entity_reference_rows, platform.drill_rows,
--     public.crm_merge_parties, public.crm_unmerge_parties; and a body replace of
--     crm._party_confidential_moves_aside (from lane7conf_a).
-- Needs lane7conf_a first. Inverse: migrations/inverse/lane7conf_c_every_door_answers_the_confidential_facts_honestly_down.sql
-- lane: STANDARD-TABLES (lane 7)
-- lock: custom
-- window-class: two CREATE TRIGGER on crm.party + six function bodies; no DDL on a table's shape.
-- based-on: custom.entity_record_read(uuid, text, uuid) 34a0944ef8c389aea17486889dc24e92908a97170657efc7c33ea0fd0daca3c7
-- based-on: custom.entity_reference_rows(uuid, text, uuid[]) 3d899f5d3846770588702340e524e4e7eb24b621b117927e17a07f490a46aa3f
-- based-on: platform.drill_rows(uuid, jsonb, jsonb) e42f0cea747930d0e2c24757c0072d51ca782db2cd4d83c35a1f365cf7de7321
-- based-on: public.crm_merge_parties(uuid, uuid, text, text) da884ac9a4a843115e7be2a3a8aef8835b09e4ed49247b510f8561865a664972
-- based-on: public.crm_unmerge_parties(uuid) 0214291ceb5dafd51ff701a92cc9c39219f841e6d2dd51d919c57d2ddca3ea45
-- based-on: crm._party_confidential_moves_aside() 9bac14c0d3c9b5083971d063e56dcc4d828b022c99c501f41cdfe6d7f0d0d815
--
-- LANE 7 · CONFIDENTIAL SPLIT (c) — EVERY DOOR ANSWERS THE CONFIDENTIAL FACTS HONESTLY.
-- Three gaps lane7conf_a left:
--  1. The generic doors (custom.entity_record_read — the MCP read; platform.drill_rows — the Table API
--     and drill pages; custom.entity_reference_rows — a Reference's record) read crm.party, whose two
--     columns are blank: a reader got null, a non-reader got null. Now each passes its party rows through
--     crm.party_confidential_apply: a reader gets the values (tax_id on a company, date_of_birth on a
--     person); anyone else gets the keys removed and `_withheld: [the field]` on the row. A call with no
--     person (server) is trusted, as everywhere else.
--  2. Writing NULL to an old column did not clear the split value (the trigger could not tell which
--     column a statement named). Now one trigger per column (UPDATE OF that column only): a value moves
--     aside, a NULL clears that fact. The INSERT path stays in crm._party_confidential_moves_aside.
--  3. Merging two contacts left the facts on the loser. Now crm_merge_parties fills the winner's EMPTY
--     facts from the loser (the winner's own values win; facet rule kept) and records what it filled in
--     the merge's `moved` ledger; crm_unmerge_parties takes back exactly those (only if unchanged since).
-- RED before, GREEN after: scripts/campaign-tests/lane7conf_member_reads_no_confidential_fact.mjs (§ c)
set local lock_timeout = '3s';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 1. THE ONE OVERLAY. A party row (object) or a list of them (array) → the same shape, with the
--    confidential facts filled for a reader and withheld (keys removed, `_withheld` named) otherwise.
--    A row with no party id, or whose party the caller cannot be placed in, loses the two keys.
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm.party_confidential_apply(p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_uid  uuid := auth.uid();
  v_id   uuid;
  v_p    record;
  v_lvl  text;
  v_full boolean;
  v_vals jsonb;
begin
  if p_rows is null then return null; end if;
  if jsonb_typeof(p_rows) = 'array' then
    return coalesce((select jsonb_agg(crm.party_confidential_apply(e.v) order by e.n)
                       from jsonb_array_elements(p_rows) with ordinality e(v, n)), '[]'::jsonb);
  end if;
  if jsonb_typeof(p_rows) <> 'object' then return p_rows; end if;

  v_full := p_rows ? 'tax_id' or p_rows ? 'date_of_birth';
  if (p_rows ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_id := (p_rows ->> 'id')::uuid;
  end if;
  select p.party_kind, p.organization_id, p.created_by, p.assigned_to, c.tax_id, c.date_of_birth
    into v_p
    from crm.party p left join crm.party_confidential c on c.party_id = p.id
   where p.id = v_id;
  if v_id is null or v_p.organization_id is null then
    return p_rows - 'tax_id' - 'date_of_birth';
  end if;

  if v_uid is not null then
    v_lvl := crm.party_confidential_level(v_p.organization_id, v_p.created_by, v_p.assigned_to, v_uid);
  end if;
  if v_uid is null or v_lvl is not null then
    v_vals := jsonb_build_object(
      'tax_id',        case when v_p.party_kind = 'organization' then to_jsonb(v_p.tax_id) else 'null'::jsonb end,
      'date_of_birth', case when v_p.party_kind = 'person' then to_jsonb(v_p.date_of_birth) else 'null'::jsonb end);
    return (p_rows - 'tax_id' - 'date_of_birth' - '_withheld')
           || case when v_full then v_vals else jsonb_strip_nulls(v_vals) end;
  end if;
  return (p_rows - 'tax_id' - 'date_of_birth')
         || jsonb_build_object('_withheld',
              case v_p.party_kind when 'organization' then jsonb_build_array('tax_id')
                                  else jsonb_build_array('date_of_birth') end);
end
$function$;
INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason, signed_in_callers, anonymous_callers)
SELECT 'crm', 'party_confidential_apply', 'p_rows jsonb', 'lane7conf_c (STANDARD-TABLES)',
   'LANE7-CONF-C: called by the invoker doors custom.entity_record_read / entity_reference_rows / platform.drill_rows on crm.party rows they already returned to the caller. Each row''s id is checked against crm.party_confidential_level for auth.uid(): a reader gets the two facts, anyone else gets them removed and named in _withheld. A row with no id or an unknown id only loses the two keys. NULL answers NULL.',
   true, false
 WHERE NOT EXISTS (SELECT 1 FROM platform.client_callable_door d
                    WHERE d.schema_name = 'crm' AND d.function_name = 'party_confidential_apply');
GRANT EXECUTE ON FUNCTION crm.party_confidential_apply(jsonb) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 2. THE GENERIC DOORS ASK IT (fragment edits on the live bodies).
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.lane7conf_patch(p_fn regprocedure, p_anchor text, p_new text)
 RETURNS void LANGUAGE plpgsql AS $f$
declare v_def text := pg_get_functiondef(p_fn); v_n int;
begin
  v_n := (length(v_def) - length(replace(v_def, p_anchor, ''))) / length(p_anchor);
  if v_n <> 1 then
    raise exception 'lane7conf_c: % holds its anchor % time(s), not once; nothing was changed. Anchor: %', p_fn, v_n, p_anchor
      using errcode = '55000';
  end if;
  execute replace(v_def, p_anchor, p_new);
end $f$;

SELECT pg_temp.lane7conf_patch('custom.entity_record_read(uuid,text,uuid)'::regprocedure,
$a$    'columns', (v_row - 'custom_fields') - v_excluded,$a$,
$b$    -- LANE7-CONF-C: a contact's confidential facts come from their own table, for their readers.
    'columns', case when t.token = 'party'
                    then crm.party_confidential_apply((v_row - 'custom_fields') - v_excluded)
                    else (v_row - 'custom_fields') - v_excluded end,$b$);

SELECT pg_temp.lane7conf_patch('custom.entity_reference_rows(uuid,text,uuid[])'::regprocedure,
$a$    into v_out using p_ids, v_drop, p_token;$a$,
$b$    into v_out using p_ids, v_drop, p_token;
  -- LANE7-CONF-C: a contact's confidential facts come from their own table, for their readers.
  if p_token = 'party' then
    select coalesce(jsonb_object_agg(e.key, crm.party_confidential_apply(e.value)), '{}'::jsonb)
      into v_out from jsonb_each(v_out) e;
  end if;$b$);

SELECT pg_temp.lane7conf_patch('platform.drill_rows(uuid,jsonb,jsonb)'::regprocedure,
$a$  execute v_plan ->> 'sql' into v_total, v_rows using v_plan -> 'params';$a$,
$b$  execute v_plan ->> 'sql' into v_total, v_rows using v_plan -> 'params';
  -- LANE7-CONF-C: a contact's confidential facts come from their own table, for their readers.
  if p_source ->> 'kind' = 'entity' and p_source ->> 'token' = 'party' then
    v_rows := crm.party_confidential_apply(v_rows);
  end if;$b$);

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 3. ONE WRITE PATH PER COLUMN. INSERT keeps crm._party_confidential_moves_aside; an UPDATE that names
--    a column goes to that column's trigger: a value moves aside, NULL clears that fact.
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm._party_confidential_moves_aside()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_tax text := nullif(btrim(new.tax_id), '');
  v_lvl text;
begin
  -- LANE7-CONF-C: an UPDATE is handled per column by crm._party_confidential_column_write.
  if tg_op = 'UPDATE' then return new; end if;
  if v_tax is null and new.date_of_birth is null then
    new.tax_id := null;
    return new;
  end if;
  if v_tax is not null and new.party_kind <> 'organization' then
    raise exception 'A tax ID belongs to a company, not a person.' using errcode = '23514';
  end if;
  if new.date_of_birth is not null and new.party_kind <> 'person' then
    raise exception 'A date of birth belongs to a person, not a company.' using errcode = '23514';
  end if;
  if new.organization_id is null then
    raise exception 'A tax ID or date of birth is kept only on a contact that belongs to an organization.' using errcode = '22023';
  end if;
  if platform.is_client_channel() then
    v_lvl := crm.party_confidential_level(new.organization_id, new.created_by, new.assigned_to, auth.uid());
    if v_lvl is distinct from 'editor' then
      raise exception 'Only this contact''s confidential editors can change its tax ID or date of birth; an owner or admin of the organization can add you.' using errcode = '42501';
    end if;
  end if;
  insert into crm.party_confidential as c (party_id, organization_id, tax_id, date_of_birth, updated_by)
  values (new.id, new.organization_id, v_tax, new.date_of_birth, auth.uid())
  on conflict (party_id) do update
     set tax_id        = coalesce(excluded.tax_id, c.tax_id),
         date_of_birth = coalesce(excluded.date_of_birth, c.date_of_birth),
         updated_at    = now(),
         updated_by    = excluded.updated_by;
  new.tax_id := null;
  new.date_of_birth := null;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION crm._party_confidential_column_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- One column per trigger (TG_ARGV[0] = 'tax_id' | 'date_of_birth'; the trigger is UPDATE OF that
-- column), so the statement named it: a value moves aside, a NULL clears that fact. The column on
-- crm.party is always written back blank.
declare
  v_col text := tg_argv[0];
  v_tax text;
  v_dob date;
  v_lvl text;
begin
  if v_col = 'tax_id' then
    v_tax := nullif(btrim(new.tax_id), '');
    if v_tax is not null and new.party_kind <> 'organization' then
      raise exception 'A tax ID belongs to a company, not a person.' using errcode = '23514';
    end if;
  elsif v_col = 'date_of_birth' then
    v_dob := new.date_of_birth;
    if v_dob is not null and new.party_kind <> 'person' then
      raise exception 'A date of birth belongs to a person, not a company.' using errcode = '23514';
    end if;
  else
    raise exception 'crm._party_confidential_column_write: unknown column %', v_col using errcode = '22023';
  end if;
  if v_tax is null and v_dob is null
     and not exists (select 1 from crm.party_confidential c where c.party_id = new.id) then
    new.tax_id := null; new.date_of_birth := null;
    return new;                                   -- clearing what was never kept: nothing to do
  end if;
  if new.organization_id is null then
    raise exception 'A tax ID or date of birth is kept only on a contact that belongs to an organization.' using errcode = '22023';
  end if;
  if platform.is_client_channel() then
    v_lvl := crm.party_confidential_level(new.organization_id, new.created_by, new.assigned_to, auth.uid());
    if v_lvl is distinct from 'editor' then
      raise exception 'Only this contact''s confidential editors can change its tax ID or date of birth; an owner or admin of the organization can add you.' using errcode = '42501';
    end if;
  end if;
  insert into crm.party_confidential as c (party_id, organization_id, tax_id, date_of_birth, updated_by)
  values (new.id, new.organization_id, v_tax, v_dob, auth.uid())
  on conflict (party_id) do update
     set tax_id        = case when v_col = 'tax_id' then excluded.tax_id else c.tax_id end,
         date_of_birth = case when v_col = 'date_of_birth' then excluded.date_of_birth else c.date_of_birth end,
         updated_at    = now(),
         updated_by    = excluded.updated_by;
  if v_col = 'tax_id' then new.tax_id := null; else new.date_of_birth := null; end if;
  return new;
end
$function$;
REVOKE ALL ON FUNCTION crm._party_confidential_column_write() FROM PUBLIC, anon, authenticated;

DO $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'crm.party'::regclass and tgname = '_zz_party_confidential_tax_id') then
    create trigger _zz_party_confidential_tax_id
      before update of tax_id on crm.party
      for each row execute function crm._party_confidential_column_write('tax_id');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'crm.party'::regclass and tgname = '_zz_party_confidential_date_of_birth') then
    create trigger _zz_party_confidential_date_of_birth
      before update of date_of_birth on crm.party
      for each row execute function crm._party_confidential_column_write('date_of_birth');
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 4. MERGE CARRIES THE FACTS; UNMERGE TAKES BACK EXACTLY WHAT IT CARRIED.
-- ─────────────────────────────────────────────────────────────────────────────────────────
SELECT pg_temp.lane7conf_patch('public.crm_merge_parties(uuid,uuid,text,text)'::regprocedure,
$a$  update crm.party set canonical_id = p_winner where id = p_loser;$a$,
$b$  -- LANE7-CONF-C: the loser's confidential facts fill the winner's EMPTY ones (the winner's own
  -- values win; a tax ID only onto a company, a date of birth only onto a person). What was filled is
  -- recorded so unmerge takes back exactly that.
  declare
    v_w record; v_l record; v_fill jsonb := '{}'::jsonb;
  begin
    select p.party_kind, c.tax_id, c.date_of_birth into v_w
      from crm.party p left join crm.party_confidential c on c.party_id = p.id where p.id = p_winner;
    select c.tax_id, c.date_of_birth into v_l from crm.party_confidential c where c.party_id = p_loser;
    if v_l.tax_id is not null and v_w.tax_id is null and v_w.party_kind = 'organization' then
      v_fill := v_fill || jsonb_build_object('tax_id', v_l.tax_id);
    end if;
    if v_l.date_of_birth is not null and v_w.date_of_birth is null and v_w.party_kind = 'person' then
      v_fill := v_fill || jsonb_build_object('date_of_birth', v_l.date_of_birth);
    end if;
    if v_fill <> '{}'::jsonb then
      insert into crm.party_confidential as c (party_id, organization_id, tax_id, date_of_birth, updated_by)
      values (p_winner, v_org, v_fill ->> 'tax_id', (v_fill ->> 'date_of_birth')::date, (select auth.uid()))
      on conflict (party_id) do update
         set tax_id        = coalesce(c.tax_id, excluded.tax_id),
             date_of_birth = coalesce(c.date_of_birth, excluded.date_of_birth),
             updated_at    = now(), updated_by = excluded.updated_by;
      v_moved := v_moved || jsonb_build_object('confidential_filled', v_fill);
    end if;
  end;

  update crm.party set canonical_id = p_winner where id = p_loser;$b$);

SELECT pg_temp.lane7conf_patch('public.crm_unmerge_parties(uuid)'::regprocedure,
$a$  update crm.party set canonical_id = null where id = v_m.loser_id;$a$,
$b$  -- LANE7-CONF-C: take back exactly the confidential facts the merge filled, if still unchanged.
  if jsonb_typeof(v_m.moved -> 'confidential_filled') = 'object' then
    update crm.party_confidential c
       set tax_id = case when c.tax_id is not distinct from (v_m.moved -> 'confidential_filled' ->> 'tax_id')
                         and v_m.moved -> 'confidential_filled' ? 'tax_id' then null else c.tax_id end,
           date_of_birth = case when c.date_of_birth is not distinct from (v_m.moved -> 'confidential_filled' ->> 'date_of_birth')::date
                         and v_m.moved -> 'confidential_filled' ? 'date_of_birth' then null else c.date_of_birth end,
           updated_at = now(), updated_by = (select auth.uid())
     where c.party_id = v_m.winner_id;
  end if;

  update crm.party set canonical_id = null where id = v_m.loser_id;$b$);
