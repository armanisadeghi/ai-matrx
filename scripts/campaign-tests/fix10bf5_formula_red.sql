-- FIX-10B-F5 — THE RED TWIN. IT PUTS THE DEFECT BACK AND REQUIRES THE GREEN CLAUSES TO FAIL.
--
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/fix10bf5_formula_red.sql
--
-- It executes the REAL BYTES of
-- `migrations/inverse/fix10bf5_a_worked_out_column_names_columns_that_exist_down.sql` inside a
-- transaction that always rolls back. That is two things at once: it proves the inverse is
-- valid SQL that actually executes, and it proves `fix10bf5_formula_green.sql` is green about
-- something. A green suite nobody has seen fail is a green suite that may be asserting nothing.
--
-- WHAT COMES BACK. The `custom._field_type_parity_guard` body in which a worked-out column
-- could name its source columns BY NAME (REC-17 says by id, never by name), or name a column
-- that is not in the organization at all, and be created anyway — after which
-- `custom.rule_eval` refuses it on every read, `custom.derived_value` swallows that refusal
-- into a server warning nobody reads, and the column shows `—` on every record of its table
-- for the rest of its life. Three such columns were live on the main database on 2026-09-22.
--
-- NOTHING IS COMMITTED. The function body, the fixture and the organization all disappear at
-- ROLLBACK. Same real use case as the green suite: Rincon Plumbing Co's Truck 1 ticket label.

\set ON_ERROR_STOP on
\timing off

\set suite 'fix10bf5_formula_red.sql'
\set requires 'function:custom.organization_kernel_id'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

\set ORG   '\'7e10b5f0-0000-4a00-8a00-000000000002\''
\set ADMIN '\'87a6e699-3622-4869-8843-d0867456c0dd\''

begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';
select set_config('app.actor_system', 'campaign-test/fix10bf5_red', true);

-- ══════════════════════════ THE DEFECT, PUT BACK, FROM THE INVERSE'S OWN BYTES ══════════════

CREATE OR REPLACE FUNCTION custom._field_type_parity_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d          jsonb := new.data;
  v_label    text;
  v_declared text;
  v_derived  text;
  v_type     text;
  v_edef     uuid;
  v_via      text;
  v_via_fld  jsonb;
begin
  -- THE DOOR. One call to the ONE predicate (`custom.assert_store_door`), which
  -- judges `custom.caller_role()` - the identity the caller actually held - and not
  -- `current_user`, which a SECURITY DEFINER door has already rewritten to itself.
  -- The switch never removes a check: everything below runs exactly as before.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  -- A RETIREMENT IS NOT A CHANGE OF SHAPE (the shared rule DOOR-FIX and TABLE-DELETE built,
  -- now asked as ONE question). The only change in this update is `deleted_at` going from
  -- nothing to a time: the document is byte-for-byte what it was, so there is no new shape
  -- to judge. This is what lets a dependent field retire in the SAME operation as the
  -- relation it reads through - the sweep, the cascade and the door all arrive here.
  if tg_op = 'UPDATE'
     and custom.is_a_retirement(old.deleted_at, new.deleted_at,
                                old.data, new.data,
                                old.table_id, new.table_id,
                                old.organization_id, new.organization_id,
                                old.data_class, new.data_class) then
    return new;
  end if;

  -- Only field definitions, and never the kernel `Field` row itself (REC-27).
  if new.table_id is distinct from custom.field_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;

  v_label    := coalesce(nullif(d ->> 'label', ''), d ->> 'key', 'this field');
  v_type     := d ->> 'type';
  v_declared := nullif(d ->> 'parity_type', '');
  v_derived  := custom.parity_type(d);
  v_edef     := nullif(d ->> 'entity_definition_id', '')::uuid;

  -- (a) A NAME NOBODY SHIPS. Refused with the list, so a typo is not a silent plain field.
  if v_declared is not null
     and not exists (select 1 from custom.parity_field_types() t
                      where t.parity_type = v_declared) then
    raise exception 'the field % says it is a % and that is not one of the field types this system ships',
                    v_label, v_declared
      using errcode = '23514',
            hint = format('FLD-11: select parity_type from custom.parity_field_types() - %s.', custom._parity_types_sentence());
  end if;

  -- A Field that CALLS itself the formula parity type and carries no expression of its own.
  -- (A behaviour-`formula` Field whose answer comes from a compute Rule derives NULL above
  -- and never reaches here — it is W1-RULE's, and this lane does not demand anything of it.)
  if v_declared = 'formula' and jsonb_typeof(d -> 'config' -> 'expr') is distinct from 'object' then
    raise exception 'the field % is worked out and does not say how', v_label
      using errcode = '23514',
            hint = 'FLD-11 / REC-15: config.expr is a Rule expression - the same shape and the same evaluator a Rule uses (select node from custom.rule_node_kinds()).';
  end if;

  -- (b) THE DECLARATION AND WHAT IT ACTUALLY DECLARES HAVE TO AGREE. This is the whole of
  -- ruling 1 as a refusal: a parity type is made of a behaviour and its modifiers, so a
  -- field that CALLS itself a currency while declaring no unit is refused naming BOTH words.
  if v_declared is not null and v_derived is distinct from v_declared then
    raise exception 'the field % calls itself a %, and what it actually says it is is %',
                    v_label, v_declared, coalesce(v_derived, 'a plain ' || custom.said(v_type, 'field'))
      using errcode = '23514',
            hint = format('FLD-11: %s is made of %s. A parity type is a behaviour plus its modifiers, never a behaviour of its own - fix the declaration, not the name.',
                          v_declared,
                          coalesce((select t.made_of from custom.parity_field_types() t
                                     where t.parity_type = v_declared), 'a behaviour'));
  end if;

  -- (c) THE FOUR WITH NO LIVE IMPLEMENTATION have declarations of their own, and each one
  -- is refused BY THE FIELD'S NAME rather than by an evaluator failing later.
  if v_derived in ('lookup', 'rollup') then
    v_via := nullif(d -> 'config' ->> 'via', '');
    if v_via is null then
      raise exception 'the field % has to say which relation it reads through', v_label
        using errcode = '23514',
              hint = 'FLD-11: a lookup and a rollup both travel along a relation. config.via names a relation Field of this same table, by its key.';
    end if;
    if v_edef is not null then
      select f.data into v_via_fld
        from custom.record f
       where f.organization_id = new.organization_id
         and f.table_id = custom.field_kernel_id()
         and f.deleted_at is null
         and (f.data ->> 'entity_definition_id')::uuid = v_edef
         and f.data ->> 'key' = v_via
       limit 1;
      if v_via_fld is null then
        raise exception 'the field % reads through a relation called %, and this table has no field called %',
                        v_label, v_via, v_via
          using errcode = '23514', hint = 'FLD-11: config.via names a field of the SAME table, by key.';
      end if;
      if v_via_fld ->> 'type' <> 'relation' then
        raise exception 'the field % reads through %, and % is not a relation - it is a %',
                        v_label, v_via, v_via, v_via_fld ->> 'type'
          using errcode = '23514',
                hint = 'FLD-11: a lookup reads a value through a RELATION and a rollup aggregates along one. A value on this same record is a formula, not a lookup.';
      end if;
      if v_derived = 'rollup' and not coalesce((v_via_fld ->> 'multi')::boolean, false) then
        raise exception 'the field % adds up % and % points at one thing at a time', v_label, v_via, v_via
          using errcode = '23514',
                hint = 'FLD-11: a rollup aggregates MANY records. Give the relation the multi modifier, or read the one value with a lookup.';
      end if;
    end if;
  end if;

  if v_derived = 'lookup' and nullif(d -> 'config' ->> 'pick', '') is null then
    raise exception 'the field % has to say which value it reads on the other side', v_label
      using errcode = '23514', hint = 'FLD-11: config.pick names a field key of the related record.';
  end if;

  if v_derived = 'rollup' then
    if nullif(d -> 'config' ->> 'agg', '') not in ('sum', 'count', 'min', 'max', 'avg') then
      raise exception 'the field % says it works out % of the records it points at, and it adds them up, counts them, or takes the smallest, the largest or the average',
                      v_label, custom.said(d -> 'config' ->> 'agg', 'nothing')
        using errcode = '23514', hint = 'FLD-11: config.agg is sum, count, min, max or avg.';
    end if;
    if (d -> 'config' ->> 'agg') <> 'count'
       and nullif(d -> 'config' ->> 'of', '') is null then
      raise exception 'the field % has to say which value of the records it points at it works out', v_label
        using errcode = '23514',
              hint = 'FLD-11: config.of names a field key on the far side. Only count needs no field, because it counts the records themselves.';
    end if;
    -- ANNOUNCED, NOT SILENT (rule 16). A rollup stamped at write time goes stale the moment
    -- a contained record moves, and nothing in this campaign yet propagates a child's write
    -- to its parents. So the declaration is refused rather than quietly wrong.
    if (d ->> 'compute_on') = 'write' then
      raise exception 'the field % adds up other records and says it works itself out when this record is saved, and it would then be out of date the moment one of them changed',
                      v_label
        using errcode = '23514',
              hint = 'FLD-11 / FLD-9: declare compute_on read for a rollup - it is then worked out from the contained records every time it is read, and is never stale. Stamping one at write time needs a child-to-parent recompute that no lane has built; W3-MIG/W3-HIST is where it belongs when somebody wants the cache.';
    end if;
  end if;

  -- (d) THE NINE THAT DO EXIST, each refused on the one thing that makes it that type.
  if v_derived = 'attachment'
     and coalesce(d ->> 'on_target_delete', '') = 'cascade' then
    raise exception 'the field % says deleting the file deletes the record that shows it', v_label
      using errcode = '23514',
            hint = 'REC-31: a picture is a File record reached through a relation. Removing the file removes the attachment, never the record it was attached to - set_null or restrict.';
  end if;

  if v_derived in ('url', 'email', 'phone')
     and not exists (select 1 from custom.field_rules(d) r where r.kind = 'pattern') then
    raise exception 'the field % holds a % and nothing says what a % looks like', v_label, v_derived, v_derived
      using errcode = '23514',
            hint = 'FLD-3 / FLD-11: the format says how to SHOW it; what makes it enforceable is an attached validation Rule of kind pattern. A format with no rule is a label on an empty box.';
  end if;

  if v_derived = 'percent'
     and not exists (select 1 from custom.field_rules(d) r where r.kind in ('min', 'max')) then
    raise exception 'the field % holds a percentage and nothing says the range it lives in', v_label
      using errcode = '23514',
            hint = 'FLD-3 / FLD-11: attach min and max Rules. A percent field that takes -40 is a percent in name only.';
  end if;

  return new;
end;
$function$

;

insert into iam.organizations (id, name, slug, abbreviation, created_by)
values (:ORG, 'FIX-10B-F5 Red Throwaway', 'fix10bf5-red-throwaway', 'FFR', :ADMIN);
insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
values (:ORG, 'organization', :ORG, :ADMIN, 'owner', 'active');
insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
values ('custom', 'system_enabled', 'organization', :ORG, :ORG, 'true'::jsonb, 'FIX-10B-F5 red suite');

do $t$
declare
  v_org     constant uuid := '7e10b5f0-0000-4a00-8a00-000000000002';
  v_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j text;
  v_home uuid; v_tbl uuid; v_job uuid; v_addr uuid; v_bad uuid; v_rec uuid;
  v_seen text; v_ghost uuid := '3014b868-2c69-434c-87ed-d7bf9df14be3';
begin
  c_admin_j := json_build_object('sub', v_admin::text, 'role', 'authenticated', 'email', 'admin@admin.com')::text;
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);

  v_home := custom.record_write(v_org, custom.organization_kernel_id(),
                                jsonb_build_object('name', 'Rincon Plumbing Co'));
  v_tbl  := custom.table_declare(v_org, jsonb_build_object(
    'name','truck_1_dispatch_backlog','slug','truck_1_dispatch_backlog',
    'label_singular','Ticket','label_plural','Tickets',
    'type','entity','display','list','ordered',false,'weight','light','retention_days',30,
    'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','title','kind','text')),
    'title_field','title','parent_id', v_home::text));
  v_job  := custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Job Number','type','text','sort',30));
  v_addr := custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Service Address','type','text','sort',40));
  v_rec  := custom.record_write(v_org, v_tbl, jsonb_build_object(
    'title','RPC-T1-7000', 'job_number','RPC-T1-7000', 'service_address','100 Ventura Ave, Ventura'));

  -- ══════════════════════════════ RED 2 — green PART 2 fails: it is CREATED.
  v_bad := custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'label','Shouty','parity_type','formula','compute_on','read','sort',60,
    'expr', jsonb_build_object('op','concat','args', jsonb_build_array(
              jsonb_build_object('field','job_number')))));
  if v_bad is null then
    raise exception 'RED 2 DID NOT LAND: the by-name formula was still refused, so the inverse did not put the defect back';
  end if;
  -- AND THIS IS WHAT THE DISPATCHER THEN SEES, FOREVER, WITH NO WORD ANYWHERE.
  select custom.read_record(v_org, v_rec, true) ->> 'shouty' into v_seen;
  if v_seen is not null then
    raise exception 'RED 2: the by-name column answered "%" — it was supposed to be empty on every read', v_seen;
  end if;
  raise notice 'RED 2 — a worked-out column naming its source BY NAME was created, and reads nothing on every ticket (field %)', v_bad;

  -- ══════════════════════════════ RED 3 — green PART 3 fails: it is CREATED.
  v_bad := custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'label','Doubled','parity_type','formula','compute_on','read','sort',70,
    'expr', jsonb_build_object('op','concat','args', jsonb_build_array(
              jsonb_build_object('field', v_ghost)))));
  if v_bad is null then
    raise exception 'RED 3 DID NOT LAND: the absent-column formula was still refused';
  end if;
  select custom.read_record(v_org, v_rec, true) ->> 'doubled' into v_seen;
  if v_seen is not null then
    raise exception 'RED 3: the absent-column formula answered "%"', v_seen;
  end if;
  raise notice 'RED 3 — a worked-out column naming a column that is not in this organization was created, and reads nothing (field %)', v_bad;

  -- ══════════════════════════════ RED 4 — green PART 4 fails: the retype door takes it too.
  v_bad := custom.field_update(v_org, v_bad, jsonb_build_object(
    'parity_type','formula',
    'expr', jsonb_build_object('op','concat','args', jsonb_build_array(
              jsonb_build_object('field','service_address')))));
  if v_bad is null then
    raise exception 'RED 4 DID NOT LAND: the retype door still refused the by-name expression';
  end if;
  raise notice 'RED 4 — the retype door re-pointed a worked-out column at a NAME and the store took it';

  -- ══════════════════════════════ AND THE CONTROL CLAUSES STAY GREEN, which is how this file
  -- proves it put back ONE behaviour rather than breaking the function.
  if custom.read_record(v_org, v_rec, true) ->> 'title' is distinct from 'RPC-T1-7000' then
    raise exception 'RED CONTROL: the inverse body broke an ordinary column, so nothing above is about this defect';
  end if;
  raise notice 'RED CONTROL — ordinary columns are untouched by the inverse body';

  raise notice 'ALL RED CLAUSES LANDED (2 by-name created, 3 absent-column created, 4 the retype door) — the green suite asserts something';
end $t$;

rollback;
