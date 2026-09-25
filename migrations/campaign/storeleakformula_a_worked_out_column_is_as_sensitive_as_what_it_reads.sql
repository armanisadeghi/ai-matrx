-- chair-step: a STORE FIX for a data leak (VERIFIER-18 finding 1, HIGH). It ADDS five functions
--   (`custom.sensitivity_rank`, `custom.field_inputs_of`, `custom.field_input_closure`,
--   `custom.field_sensitivity_floor`, `iam.may_touch_field_itself`), two trigger functions and two
--   triggers on `custom.record` that fire only for Field definition rows, and REPLACES two bodies,
--   each declared below with the body it was written against: `iam.may_touch_field` (the one field
--   question every read door, the aggregate, the filter and the export ask) and
--   `custom.hidden_field_notice` (the notice a withheld column carries). No table, column, policy
--   or grant is added; no row of anybody's data is rewritten by this file — the re-derivation of
--   existing columns is the separate, audited repair
--   `storeleakformula_every_worked_out_column_reads_its_inputs_again.sql`.
--   Inverse: `migrations/inverse/storeleakformula_a_worked_out_column_is_as_sensitive_as_what_it_reads_down.sql`.
--   Applied directly (owner, 2026-09-24 ~17:30 PT: "all db stuff applied directly"), proven on the
--   dev clone first (up, inverse, up).
-- lock: custom,iam
-- lane: STORE-LEAK-FORMULA
-- based-on: iam.may_touch_field(uuid, uuid, uuid, permission_level, text) 583b23dd17f203ca50d7f48d64b171240fd0e3997923df9a7229dc25aa283f66
-- based-on: custom.hidden_field_notice(custom.record, text) 186b6fda966e0efa06dabb66b2ca31270d5988647d2496dcf2d8d7cc8b3a4e80
--
-- ════════════════════════════════════════════════════════════════════════════════════════
-- A WORKED-OUT COLUMN IS AT LEAST AS SENSITIVE AS EVERY COLUMN IT READS
-- ════════════════════════════════════════════════════════════════════════════════════════
--
-- THE LEAK (VERIFIER-18, production, 2026-09-24). Rooms' *Budget* is confidential, so
-- test@test.com (Viewer) is shown "—". Beside it, *Budget with contingency* (`{Budget} * 1.1`)
-- is `internal` with `depends_on: []`, so she reads 19,800, 67,100, 10,450 … and the hidden
-- budget is one division away. The store asked each column only about ITSELF: the formula's own
-- word was `internal`, so every door — the grid, the record panel, the Sheet, the aggregate, the
-- export — handed out its answer. The same hole is open for a lookup of a confidential column in
-- another table and a rollup that adds one up. PROGRESS-S2's AGG-FIELD-READ closed the same class
-- one door over (the aggregate measured a column without asking its sensitivity).
--
-- THE RULE. A formula, lookup or rollup column's effective sensitivity is at least the strongest
-- sensitivity of every column it reads, directly or through another worked-out column
-- (public < internal < confidential < restricted, FLD-12's four words in order). Three halves,
-- so none of them can be forgotten by a door:
--
--   1. ON EVERY WRITE OF THE DEFINITION (declare, edit, import, a table copy, a restore — every
--      path ends in a write of a Field row, so the trigger is the one place): `depends_on` is
--      re-derived from what the column actually reads (the keys of the same table it reads, the
--      list `custom.field_dependants` and REC-18 read), and `sensitivity` is raised to the
--      strongest input's word when it says less. It is never lowered here: a person who wants a
--      formula less sensitive says so, and the floor still holds.
--   2. WHEN AN INPUT BECOMES MORE SENSITIVE, every column that reads it is raised with it (the
--      AFTER trigger), so the stored word never drifts below its inputs.
--   3. ON EVERY READ, `iam.may_touch_field` asks the field question of the column AND of every
--      live column it reads, with the reader's own level, grants and portal. So a person who may
--      not read Budget is withheld *Budget with contingency* even where the stored word is right
--      and a per-person grant or a portal would have admitted the formula alone. Every door that
--      asks the one question inherits it: `custom.read_records` / `read_records_matching` /
--      `read_records_archived` (the grid, the Sheet, the export `custom.io_export` /
--      `io_export_csv` / `export_records`, which are built on read_records), `custom.record_card`
--      and `custom.read_mask` (the record panel, history), `custom.agg_fields_readable_assert`
--      (record_aggregate, the compared aggregate, dashboard_run, the summary bar, digests),
--      `custom.record_filter_sql` (a filter on a withheld column is refused by name) and
--      `custom.dashboard_target_field_assert`.
--
-- WITHHELD BY NAME. `custom.hidden_field_notice` now says, for a worked-out column, which
-- columns it is worked out from (`reads`) and one sentence (`says`), so the reader is told
-- *Budget with contingency is worked out from Budget* — never a value, never a bare "—".
--
-- WHAT COUNTS AS AN INPUT (`custom.field_inputs_of`):
--   formula  every `field` and `parent_field` leaf of `config.expr` (REC-17: a Field id; the
--            older shape's same-table key is honoured too), `previous` included (it carries
--            `field`);
--   lookup   the relation column `config.via` and the far table's `config.pick`;
--   rollup   the relation column `config.via` and the far table's `config.of`.
-- A retired input still counts for the stored word (an archived table comes back with its
-- columns), and is not asked about on read (nobody may be given a retired column, and asking
-- would withhold the formula from its own owner).
--
-- LOCKS. `create function` / `create or replace function` / `comment on` take nothing on
-- `custom.record`. The two `create trigger` statements take SHARE ROW EXCLUSIVE on
-- `custom.record` and its sixteen partitions for the length of this transaction only (milliseconds;
-- the file does no data work), under `lock_timeout = 30s`.

set local lock_timeout = '30s';
set local statement_timeout = '120s';

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- THE ORDER OF THE FOUR WORDS
-- ═════════════════════════════════════════════════════════════════════════════════════════

create function custom.sensitivity_rank(p_sensitivity text)
returns integer
language sql
immutable parallel safe
set search_path to 'pg_catalog'
as $$
  -- FLD-12's four words, weakest first. A missing word reads as `internal` (the store's own
  -- default for a Field that says nothing); a word the store does not know is the STRICTEST,
  -- never the weakest, so an unknown can only ever withhold.
  select case coalesce(p_sensitivity, 'internal')
           when 'public'       then 1
           when 'internal'     then 2
           when 'confidential' then 3
           when 'restricted'   then 4
           else 4
         end;
$$;
comment on function custom.sensitivity_rank(text) is
  'STORE-LEAK-FORMULA: public 1 < internal 2 < confidential 3 < restricted 4; nothing = internal; an unknown word = the strictest.';

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- WHAT A COLUMN READS
-- ═════════════════════════════════════════════════════════════════════════════════════════

create function custom.field_inputs_of(p_organization_id uuid, p_field_data jsonb)
returns table(input_id uuid, input_key text, input_label text, input_table uuid,
              sensitivity text, retired boolean, how text)
language sql
stable
security definer
set search_path to 'pg_catalog'
as $$
  -- Only a worked-out column reads other columns: a formula (config.expr), a lookup
  -- (config.pick) or a rollup (config.agg). A formula the Rule layer fills in (no expr) reads
  -- what its Rule reads, and the Rule's own door answers for that.
  with me as (
    select p_field_data as d,
           p_field_data ->> 'entity_definition_id' as tbl
     where coalesce(p_field_data ->> 'type', '') = 'formula'
       and coalesce(p_field_data -> 'config', '{}'::jsonb) ?| array['expr', 'pick', 'agg']),
  expr as (
    select case when jsonb_typeof(me.d -> 'config' -> 'expr') in ('object', 'array')
                then me.d -> 'config' -> 'expr' else 'null'::jsonb end as e, me.tbl
      from me),
  refs as (
    select v #>> '{}' as ref, expr.tbl
      from expr, jsonb_path_query(expr.e, 'strict $.**.field') v
     where jsonb_typeof(v) = 'string'
    union
    select v #>> '{}', expr.tbl
      from expr, jsonb_path_query(expr.e, 'strict $.**.parent_field') v
     where jsonb_typeof(v) = 'string'),
  by_id as (
    select case when r.ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then r.ref::uuid end as id
      from refs r),
  via as (
    select f.*
      from me
      join custom.record f
        on f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.data_class <> 'kernel'
       and f.data ->> 'entity_definition_id' = me.tbl
       and f.data ->> 'key' = me.d -> 'config' ->> 'via'
     where me.d -> 'config' ?| array['pick', 'agg'])
  select f.id, f.data ->> 'key', coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key'),
         nullif(f.data ->> 'entity_definition_id', '')::uuid,
         f.data ->> 'sensitivity', f.deleted_at is not null, 'names it by id'
    from by_id b
    join custom.record f
      on f.organization_id = p_organization_id
     and f.id = b.id
     and f.table_id = custom.field_kernel_id()
     and f.data_class <> 'kernel'
  union
  select f.id, f.data ->> 'key', coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key'),
         nullif(f.data ->> 'entity_definition_id', '')::uuid,
         f.data ->> 'sensitivity', f.deleted_at is not null, 'names it by key'
    from refs r
    join custom.record f
      on f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.data_class <> 'kernel'
     and f.data ->> 'entity_definition_id' = r.tbl
     and f.data ->> 'key' = r.ref
   where r.ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  union
  select v.id, v.data ->> 'key', coalesce(nullif(v.data ->> 'label', ''), v.data ->> 'key'),
         nullif(v.data ->> 'entity_definition_id', '')::uuid,
         v.data ->> 'sensitivity', v.deleted_at is not null, 'reads through it'
    from via v
  union
  select far.id, far.data ->> 'key', coalesce(nullif(far.data ->> 'label', ''), far.data ->> 'key'),
         nullif(far.data ->> 'entity_definition_id', '')::uuid,
         far.data ->> 'sensitivity', far.deleted_at is not null, 'reads it on the far side'
    from me
    join via v on true
    join custom.record far
      on far.organization_id = p_organization_id
     and far.table_id = custom.field_kernel_id()
     and far.data_class <> 'kernel'
     and far.data ->> 'entity_definition_id' = v.data ->> 'relation_target'
     and far.data ->> 'key' = coalesce(me.d -> 'config' ->> 'pick', me.d -> 'config' ->> 'of');
$$;
comment on function custom.field_inputs_of(uuid, jsonb) is
  'STORE-LEAK-FORMULA: the columns a formula, lookup or rollup definition reads directly (expr field/parent_field leaves by id or same-table key; a lookup/rollup''s via column and far pick/of column), retired ones flagged.';

create function custom.field_input_closure(p_organization_id uuid, p_field_data jsonb,
                                           p_self uuid default null)
returns table(input_id uuid, input_key text, input_label text, input_table uuid,
              sensitivity text, retired boolean, depth integer)
language sql
stable
security definer
set search_path to 'pg_catalog'
as $$
  -- Inputs of inputs: a formula over a formula over Budget reads Budget. Twelve levels, and a
  -- column never counts as its own input, so a cycle ends instead of spinning.
  with recursive c(input_id, input_key, input_label, input_table, sensitivity, retired, depth, path) as (
    select i.input_id, i.input_key, i.input_label, i.input_table, i.sensitivity, i.retired, 1,
           array[coalesce(p_self, '00000000-0000-0000-0000-000000000000'::uuid), i.input_id]
      from custom.field_inputs_of(p_organization_id, p_field_data) i
     where i.input_id is distinct from p_self
    union all
    select j.input_id, j.input_key, j.input_label, j.input_table, j.sensitivity, j.retired,
           c.depth + 1, c.path || j.input_id
      from c
      join custom.record f
        on f.organization_id = p_organization_id
       and f.id = c.input_id
       and f.table_id = custom.field_kernel_id()
      cross join lateral custom.field_inputs_of(p_organization_id, f.data) j
     where c.depth < 12
       and not (j.input_id = any (c.path)))
  select distinct on (c.input_id)
         c.input_id, c.input_key, c.input_label, c.input_table, c.sensitivity, c.retired, c.depth
    from c
   order by c.input_id, c.depth;
$$;
comment on function custom.field_input_closure(uuid, jsonb, uuid) is
  'STORE-LEAK-FORMULA: every column a worked-out definition reads, directly or through another worked-out column (12 levels, cycle-safe, self excluded).';

create function custom.field_sensitivity_floor(p_organization_id uuid, p_field_data jsonb,
                                               p_self uuid default null)
returns table(sensitivity text, reads jsonb)
language sql
stable
security definer
set search_path to 'pg_catalog'
as $$
  -- The strongest word among everything the column reads, and the columns that carry it. No
  -- row at all when the column reads nothing.
  with c as (select * from custom.field_input_closure(p_organization_id, p_field_data, p_self)),
  top as (select max(custom.sensitivity_rank(c.sensitivity)) as r from c)
  select (array['public', 'internal', 'confidential', 'restricted'])[top.r],
         (select jsonb_agg(jsonb_build_object('id', c.input_id, 'key', c.input_key,
                                              'label', c.input_label, 'sensitivity', c.sensitivity)
                           order by c.input_label)
            from c where custom.sensitivity_rank(c.sensitivity) = top.r)
    from top
   where top.r is not null;
$$;
comment on function custom.field_sensitivity_floor(uuid, jsonb, uuid) is
  'STORE-LEAK-FORMULA: the strongest sensitivity among every column a worked-out definition reads, and the columns that carry it.';

revoke all on function custom.sensitivity_rank(text) from public;
revoke all on function custom.field_inputs_of(uuid, jsonb) from public;
revoke all on function custom.field_input_closure(uuid, jsonb, uuid) from public;
revoke all on function custom.field_sensitivity_floor(uuid, jsonb, uuid) from public;

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- HALF 1 — EVERY WRITE OF A WORKED-OUT DEFINITION RE-DERIVES WHAT IT READS
-- ═════════════════════════════════════════════════════════════════════════════════════════

create function custom._field_reads_what_it_reads()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $$
declare
  v_deps  jsonb;
  v_floor record;
begin
  if new.table_id is distinct from custom.field_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;
  if coalesce(new.data ->> 'type', '') <> 'formula'
     or not (coalesce(new.data -> 'config', '{}'::jsonb) ?| array['expr', 'pick', 'agg']) then
    return new;
  end if;
  -- A retirement is not a change of shape (the shared rule): the document stays byte-for-byte
  -- what it was, so every guard after this one still sees a retirement.
  if tg_op = 'UPDATE'
     and custom.is_a_retirement(old.deleted_at, new.deleted_at, old.data, new.data,
                                old.table_id, new.table_id, old.organization_id,
                                new.organization_id, old.data_class, new.data_class) then
    return new;
  end if;

  -- depends_on: the columns of THIS table it reads, by key (the list custom.field_dependants
  -- and REC-18's "this field is used by …" read). Worked out from the definition, never typed.
  select coalesce(jsonb_agg(distinct i.input_key order by i.input_key), '[]'::jsonb)
    into v_deps
    from custom.field_inputs_of(new.organization_id, new.data) i
   where i.input_table::text = new.data ->> 'entity_definition_id'
     and not i.retired;
  if new.data -> 'depends_on' is distinct from v_deps then
    new.data := jsonb_set(new.data, '{depends_on}', v_deps);
  end if;

  select * into v_floor
    from custom.field_sensitivity_floor(new.organization_id, new.data, new.id);
  if v_floor.sensitivity is not null
     and custom.sensitivity_rank(new.data ->> 'sensitivity') < custom.sensitivity_rank(v_floor.sensitivity) then
    raise notice 'the column "%" reads %, which is %, so it is % too (it was %)',
      coalesce(nullif(new.data ->> 'label', ''), new.data ->> 'key'),
      (select string_agg(format('"%s"', e ->> 'label'), ', ') from jsonb_array_elements(v_floor.reads) e),
      v_floor.sensitivity, v_floor.sensitivity, coalesce(new.data ->> 'sensitivity', 'nothing');
    new.data := jsonb_set(new.data, '{sensitivity}', to_jsonb(v_floor.sensitivity));
  end if;
  return new;
end;
$$;
comment on function custom._field_reads_what_it_reads() is
  'STORE-LEAK-FORMULA: on every write of a formula/lookup/rollup definition, depends_on is re-derived from what it reads and sensitivity is raised to the strongest column it reads (never lowered).';
revoke all on function custom._field_reads_what_it_reads() from public;

-- Sorts before custom_record_field_shape_guard, so the shape guard judges the derived document.
create trigger custom_record_field_reads_what_it_reads
  before insert or update on custom.record
  for each row
  when (new.table_id = '11111111-0000-4000-8000-000000000002'::uuid)
  execute function custom._field_reads_what_it_reads();

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- HALF 2 — AN INPUT THAT BECOMES MORE SENSITIVE TAKES ITS READERS WITH IT
-- ═════════════════════════════════════════════════════════════════════════════════════════

create function custom._field_sensitivity_reaches_its_readers()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $$
declare
  r record;
begin
  if custom.sensitivity_rank(new.data ->> 'sensitivity')
     <= custom.sensitivity_rank(old.data ->> 'sensitivity') then
    return null;                        -- only a rise travels; a lowered input lowers nothing
  end if;
  for r in
    select f.organization_id, f.id
      from custom.record f
     where f.organization_id = new.organization_id
       and f.table_id = custom.field_kernel_id()
       and f.data_class <> 'kernel'
       and f.id <> new.id
       and f.data ->> 'type' = 'formula'
       and coalesce(f.data -> 'config', '{}'::jsonb) ?| array['expr', 'pick', 'agg']
       and custom.sensitivity_rank(f.data ->> 'sensitivity') < custom.sensitivity_rank(new.data ->> 'sensitivity')
       and exists (select 1 from custom.field_input_closure(f.organization_id, f.data, f.id) c
                    where c.input_id = new.id)
  loop
    -- The reader's own trigger (half 1) re-derives it, and its own rise travels on in turn.
    update custom.record
       set data = jsonb_set(data, '{sensitivity}', to_jsonb(new.data ->> 'sensitivity'))
     where organization_id = r.organization_id
       and id = r.id;
  end loop;
  return null;
end;
$$;
comment on function custom._field_sensitivity_reaches_its_readers() is
  'STORE-LEAK-FORMULA: when a column''s sensitivity rises, every formula/lookup/rollup that reads it (directly or through another) is raised to at least the same word.';
revoke all on function custom._field_sensitivity_reaches_its_readers() from public;

create trigger custom_record_field_sensitivity_reaches_its_readers
  after update on custom.record
  for each row
  when (new.table_id = '11111111-0000-4000-8000-000000000002'::uuid
        and (old.data ->> 'sensitivity') is distinct from (new.data ->> 'sensitivity'))
  execute function custom._field_sensitivity_reaches_its_readers();

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- HALF 3 — EVERY READ ASKS ABOUT EVERY COLUMN THE ANSWER IS WORKED OUT FROM
-- ═════════════════════════════════════════════════════════════════════════════════════════

-- The question about ONE column, exactly as `iam.may_touch_field` asked it until today (body
-- unchanged: `583b23dd…`), under its own name so the new body can ask it of each input.
create function iam.may_touch_field_itself(p_user_id uuid, p_field_id uuid, p_organization_id uuid, p_level_on_record permission_level, p_action text DEFAULT 'read'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sensitivity text;
  v_required    public.permission_level;
  v_granted     public.permission_level;
begin
  if p_field_id is null then return true; end if;

  select f.data ->> 'sensitivity'
    into v_sensitivity
    from custom.record f
   where f.organization_id = p_organization_id
     and f.id = p_field_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null;
  if not found then
    -- A field nobody declared is not a field this store will hand out.
    return false;
  end if;

  -- PORTAL (2026-09-20) — AN OUTSIDER'S FIELDS ARE THE ONES HER PORTAL DECLARED, AND THIS
  -- NARROWS ONLY. A portal says which fields a client sees and which she may change; the
  -- answer belongs here, in the one question the platform already asks about a field, so a
  -- portal screen and an edit through `custom.record_update` cannot disagree and neither of
  -- them needs to know a portal exists.
  --
  -- The first test is one index probe on `custom.portal_principal (user_id, organization_id)`
  -- and finds nothing for every member of every organization, which is the whole platform
  -- except the handful of people a portal named. A person who is BOTH a member here and a
  -- portal principal here is a member: the portal is for outsiders, and narrowing a colleague
  -- because somebody put their address in a client row would be a new way to lose access.
  if coalesce((platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean, false)
     and exists (select 1 from custom.portal_principal pp
                  where pp.user_id = p_user_id
                    and pp.organization_id = p_organization_id
                    and pp.is_active)
     and not iam.has_org_access_for(p_user_id, p_organization_id) then
    if not exists (
      select 1
        from custom.portal_table pt
        join custom.portal p on p.id = pt.portal_id and p.is_active
        join custom.portal_principal pp on pp.portal_id = p.id
       where pt.organization_id = p_organization_id
         and pp.user_id = p_user_id
         and pp.is_active
         and case when p_action = 'read'
                  then p_field_id = any (pt.visible_field_ids)
                  else p_field_id = any (pt.editable_field_ids)
             end) then
      return false;
    end if;
  end if;

  v_required := iam.field_sensitivity_level(v_sensitivity, p_action, p_organization_id);

  -- VIS-21 / VIS-26: the OVERRIDE is a row in the one grant table, on the field record.
  v_granted := iam.granted_level(p_user_id, 'record', p_field_id);
  if v_granted is not null and v_granted >= v_required then
    return true;
  end if;

  return p_level_on_record is not null and p_level_on_record >= v_required;
end $function$;
comment on function iam.may_touch_field_itself(uuid, uuid, uuid, permission_level, text) is
  'The field question about ONE column only (sensitivity, per-person grant, portal). Callers ask iam.may_touch_field, which also asks it of every column a worked-out column reads.';
revoke all on function iam.may_touch_field_itself(uuid, uuid, uuid, permission_level, text) from public;

CREATE OR REPLACE FUNCTION iam.may_touch_field(p_user_id uuid, p_field_id uuid, p_organization_id uuid, p_level_on_record permission_level, p_action text DEFAULT 'read'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_data  jsonb;
  v_input record;
begin
  if not iam.may_touch_field_itself(p_user_id, p_field_id, p_organization_id, p_level_on_record, p_action) then
    return false;
  end if;
  if p_field_id is null then return true; end if;

  -- STORE-LEAK-FORMULA (VERIFIER-18 finding 1): A WORKED-OUT ANSWER IS AS SECRET AS WHAT IT IS
  -- WORKED OUT FROM. A formula, lookup or rollup column is read only by a person who may read
  -- every live column it reads — asked with the same level, the same per-person grants and the
  -- same portal — so `{Budget} * 1.1` is withheld from everyone Budget is withheld from, even
  -- where a grant or a portal names the formula alone. Every door asks this one question, so
  -- the grid, the Sheet, the record panel, the aggregate, the filter and the export inherit it.
  select f.data into v_data
    from custom.record f
   where f.organization_id = p_organization_id
     and f.id = p_field_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null;
  if v_data is null
     or coalesce(v_data ->> 'type', '') <> 'formula'
     or not (coalesce(v_data -> 'config', '{}'::jsonb) ?| array['expr', 'pick', 'agg']) then
    return true;
  end if;

  for v_input in
    select c.input_id
      from custom.field_input_closure(p_organization_id, v_data, p_field_id) c
     where not c.retired
  loop
    if not iam.may_touch_field_itself(p_user_id, v_input.input_id, p_organization_id,
                                      p_level_on_record, 'read') then
      return false;
    end if;
  end loop;
  return true;
end $function$;

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- WITHHELD BY NAME
-- ═════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION custom.hidden_field_notice(p_field custom.record, p_action text DEFAULT 'read'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- STORE-LEAK-FORMULA: a withheld worked-out column also says WHAT it is worked out from, so a
  -- reader is told "Budget with contingency is worked out from Budget" — never shown a value
  -- and never a bare "—". Every other column's notice is exactly what it was.
  select jsonb_build_object(
    'reason', p_field.data ->> 'sensitivity',
    'needs',  iam.level_label('record',
                iam.field_sensitivity_level(p_field.data ->> 'sensitivity', p_action,
                                            p_field.organization_id)),
    'or',     'a share of this one field with you')
  || coalesce((
    select jsonb_build_object(
             'reads', jsonb_agg(c.input_label order by c.input_label),
             'says',  format('%s is worked out from %s, which you have not been given.',
                             coalesce(nullif(p_field.data ->> 'label', ''), p_field.data ->> 'key'),
                             string_agg(c.input_label, ', ' order by c.input_label)))
      from custom.field_input_closure(p_field.organization_id, p_field.data, p_field.id) c
     where not c.retired
       and custom.sensitivity_rank(c.sensitivity) > custom.sensitivity_rank('internal')
    having count(*) > 0), '{}'::jsonb);
$function$;
