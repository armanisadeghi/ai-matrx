-- additive: yes
--
-- chair-step: THE ONE INVERSE OF ALL THREE OF WAVE 1's FILES —
--   writeperf4_a_fact_about_the_table_is_read_once.sql,
--   writeperf4_a_memo_slot_costs_what_a_guc_costs.sql and
--   writeperf4_the_wave_keeps_only_what_it_measured.sql.
--   It restores all twenty function bodies to the exact bytes wave 1 found, then drops the five
--   helpers, the four `platform.memo_k_*` primitives and the one event trigger it created.
--   THE ORDER IS LOAD-BEARING: the bodies come back FIRST, because `door_follows_its_function`
--   (a `sql_drop` event trigger) re-reads every function body when a function is dropped and
--   refuses a body that names something no longer there. Run bottom-up and it fails; run as
--   written and it does not. This file takes no table lock at all — twenty `create or replace`
--   statements and eleven drops, none of which touches a row.
--
-- BODIES-ONLY FORM: everything above the `-- ── THE OBJECTS THIS WAVE ADDED ──` rule is a complete,
--   self-sufficient revert of the BEHAVIOUR (`scripts/campaign-tests/writeperf4_ab.sql` uses
--   exactly that half to measure the before column inside one transaction). The drops below only
--   remove objects nothing else references once the bodies are back.

CREATE OR REPLACE FUNCTION custom.applicable_fields(p_organization_id uuid, p_table_id uuid, p_record_type text DEFAULT NULL::text)
 RETURNS SETOF custom.record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_types text[];
  v_key   text;
  v_json  jsonb;
begin
  -- The decision comes BEFORE the read, so a foreign organization id and an invented one
  -- answer identically: both are refused, neither is told whether the table exists.
  perform custom.assert_store_door(p_organization_id, 'custom.applicable_fields');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.applicable_fields');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.applicable_fields');

  -- THE SAME TABLE, ALREADY READ IN THIS TRANSACTION. The three lines above ran first, so this
  -- is a shortcut through the READ and never through the DECISION.
  v_key := 'af:' || coalesce(p_organization_id::text, '-') || ':' ||
                    coalesce(p_table_id::text, '-') || ':' || coalesce(p_record_type, '');
  v_json := platform.memo_b_get(v_key)::jsonb;
  if v_json is not null then
    return query select * from jsonb_populate_recordset(null::custom.record, v_json);
    return;
  end if;

  -- T8. The record's type value is the option's KEY; whoever declared "Radius applies to a
  -- Circle" may have written the word, the key or the option's id. All of them name the same
  -- choice, so the question is asked with all of them. This is the clause the seventh pass
  -- failed: "asking what columns THIS record has answers without Radius".
  v_types := case when p_record_type is null then '{}'::text[]
                  else custom.choice_synonyms(p_organization_id, p_table_id, p_record_type) end;

  select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) into v_json from (
    select f.*
      from custom.record f
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and (f.data ->> 'entity_definition_id')::uuid = p_table_id
       and (jsonb_array_length(coalesce(f.data -> 'applies_to_types', '[]'::jsonb)) = 0
            or (p_record_type is not null
                and coalesce(f.data -> 'applies_to_types', '[]'::jsonb) ?| v_types))) q;

  perform platform.memo_b_put(v_key, v_json::text);
  return query select * from jsonb_populate_recordset(null::custom.record, v_json);
end $function$;

CREATE OR REPLACE FUNCTION custom.assert_client_may_reach(p_organization_id uuid, p_door text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_owner oid;
  v_who   name;
  v_memo  text := 'w:r:' || coalesce(p_organization_id::text, '-');
begin
  -- THE SAME YES, ALREADY GIVEN IN THIS TRANSACTION, TO THIS SEAT, ABOUT THIS ORGANIZATION.
  if platform.memo_get(v_memo) = '1' then
    return;
  end if;
  v_who := custom.caller_role();

  -- The campaign's own lanes run as the role that owns the store. Read the owner from the
  -- catalogue, never as a role literal (rule 15), so this cannot drift from the table.
  select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
  if pg_has_role(v_who, v_owner, 'member') then
    perform platform.memo_put(v_memo, '1');
    return;
  end if;

  if p_organization_id is null then
    raise exception 'custom: % was called without an organization, and the store is keyed (organization_id, id).',
      coalesce(nullif(btrim(p_door), ''), 'that door')
      using errcode = '22004',
            hint = 'Name the organization you are working in. A door that took null would be a door onto every organization at once.';
  end if;

  if iam.has_org_access(p_organization_id) then
    perform platform.memo_put(v_memo, '1');
    return;
  end if;

  -- VIS-31 / PORTAL (2026-09-20). A live portal principal of THIS organization may reach its
  -- doors. Not because she is a member — she is not, and nothing here says she is — but
  -- because the organization named her, through a portal, as somebody whose own records live
  -- here. The next line of every door is the ladder, and she holds exactly one grant.
  -- THE SWITCH, NAMED HERE AS WELL AS INSIDE `custom.portal_admits`. Not belt and braces:
  -- the rule that lets this file name production requires the body it replaces to READ the
  -- knob that holds it off, and that rule is right — a switch a body never reads is a
  -- comment, not a switch. It costs nothing, because this line is only reached after
  -- membership has already said no. (`#>> '{}'`, not `#>> '{value}'`: `platform.knob_resolve`
  -- answers a BARE jsonb scalar, and the other spelling reads null forever — W2-TRUST's own
  -- defect, found by its suite before it shipped.)
  if coalesce((platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean, false)
     and custom.portal_admits(p_organization_id) then
    perform platform.memo_put(v_memo, '1');
    return;
  end if;

  raise exception 'You are not a member of that organization, so % has nothing to do there.',
    coalesce(nullif(btrim(p_door), ''), 'that door')
    using errcode = '42501',
          hint = 'REC-29 / T15: organizations are hard walls, and a door decides who may reach one before it decides anything else. Switch to an organization you belong to, or ask an owner of that one to add you.';
end $function$;

CREATE OR REPLACE FUNCTION custom.assert_may_know_table(p_organization_id uuid, p_table_id uuid, p_door text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me   uuid;
  v_pred text;
  v_any  boolean := false;
  v_memo text := 'w:k:' || coalesce(p_organization_id::text, '-') || ':' || coalesce(p_table_id::text, '-');
begin
  -- THE SAME YES, ALREADY GIVEN IN THIS TRANSACTION, TO THIS SEAT, ABOUT THIS TABLE. The wall
  -- below is part of that yes: this memo entry is only ever written after it has been passed.
  if platform.memo_get(v_memo) = '1' then
    return;
  end if;

  -- The wall first, always, and in the same order every other door asks it.
  perform custom.assert_client_may_reach(p_organization_id, p_door);

  -- WAY THROUGH 1: the Table record itself. Unchanged — this is the whole of what this
  -- function used to be, and it is still the answer under the shipped setting.
  if custom.query_is_store_owner() then
    perform platform.memo_put(v_memo, '1');
    return;
  end if;
  v_me := custom.query_principal();
  if v_me is null or p_table_id is null then
    perform platform.memo_put(v_memo, '1');
    return;
  end if;
  if custom.has_visibility(v_me, 'record', p_table_id, 'viewer'::public.permission_level) then
    perform platform.memo_put(v_memo, '1');
    return;
  end if;

  -- WAY THROUGH 2: anything IN it that she may see. The same ladder, asked set-wise over the
  -- table's own partition and stopped at the first row.
  v_pred := custom.visible_predicate_sql(v_me, p_organization_id, p_table_id,
                                         'viewer'::public.permission_level, 'r');
  execute format(
    'select exists (select 1 from custom.record r
                     where r.organization_id = %L::uuid
                       and r.table_id = %L::uuid
                       and r.deleted_at is null
                       and (%s)
                     limit 1)', p_organization_id, p_table_id, v_pred)
    into v_any;
  if v_any then
    perform platform.memo_put(v_memo, '1');
    return;
  end if;

  -- NEITHER. T10's refusal, word for word — and it is now true when it is said: there is
  -- nothing in this table she may see, so telling her it exists would be the leak.
  raise exception 'You do not have access to this table, so % has nothing to show you.',
    coalesce(nullif(btrim(p_door), ''), 'that door')
    using errcode = '42501',
          hint = 'VIS-5 / T10: you know a table if you may open the table itself, or if anything in it has been shared with you. Ask whoever owns it to share the table, or a record in it, with you.';
end;
$function$;

CREATE OR REPLACE FUNCTION custom.assert_store_door(p_organization_id uuid, p_door text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_owner oid;
  v_who   name;
  v_memo  text := 'w:d:' || coalesce(p_organization_id::text, '-');
begin
  -- THE SAME YES, ALREADY GIVEN IN THIS TRANSACTION, TO THIS SEAT, ABOUT THIS ORGANIZATION.
  if platform.memo_get(v_memo) = '1' then
    return;
  end if;
  v_who := custom.caller_role();

  -- The switch is a PRODUCT switch and never the security boundary (§6 fact two's REVOKEs
  -- are). While it resolves false the store belongs to the campaign that owns it, and the
  -- only legitimate writer is the role that owns custom.record.
  if custom.store_is_open(p_organization_id) then
    perform platform.memo_put(v_memo, '1');
    return;
  end if;

  -- Read the owner from the catalogue, never as a role literal (rule 15), so the door
  -- cannot drift from the table it guards.
  select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
  if pg_has_role(v_who, v_owner, 'member') then
    perform platform.memo_put(v_memo, '1');
    return;
  end if;

  -- ── LIMITS-FIX 2026-09-21: THE SENTENCE NAMES WHAT TO DO, NOT WHAT A LANE KNOWS. ───────
  -- Real-data crew D made three organizations, followed the guide's own steps, and met
  -- this refusal on `custom.record_write` several calls in: it named a knob, a campaign
  -- checklist and a database role, and nothing a person could act on. Worse, it arrived at
  -- the WRITE rather than at the first door touched, so the crew had already built a table
  -- and its fields before being told the store was never on. The switch is unchanged and
  -- the door is exactly as closed; what changes is that the refusal says whose organization
  -- it is about and where the switch lives.
  raise exception 'This organization has not turned the record store on yet, so % is not taking writes.',
    coalesce(nullif(btrim(p_door), ''), 'it')
    using errcode = '42501',
          hint = 'Open Database Settings for this organization and turn the record store on (the custom/system_enabled switch); everything you have already made is kept and starts working. Organizations created from 2026-09-21 have it on the moment they exist - this one was made before that. Until it is on, this store takes writes only from the role that owns custom.record, through every door: it is a closed door, not a quiet one.';
end;
$function$;

CREATE OR REPLACE FUNCTION custom.choice_field_map(p_organization_id uuid, p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
declare
  v_key text := 'cm:' || coalesce(p_organization_id::text, '-') || ':' || coalesce(p_table_id::text, '-');
  v_hit text := platform.memo_b_get(v_key);
  v_out jsonb;
begin
  if v_hit is not null then
    return v_hit::jsonb;
  end if;
  -- LADDER-PERF's class, on the WRITE path. Everything between `begin` and `end`
  -- is this function's own SQL body, character for character; only the language
  -- moved, so a plan is cached for the session instead of built on every call.
  v_out := (
  -- field key -> {label, multi, options_table_id, options}. ONE call per table per request is
    -- what every door below is built on; a table with no list Field answers '{}' and every
    -- caller short-circuits on that.
    select coalesce(jsonb_object_agg(f.data ->> 'key', jsonb_build_object(
             'label',            coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key'),
             'multi',            coalesce((f.data ->> 'multi')::boolean, false),
             'field_id',         f.id::text,
             'options_table_id', f.data -> 'config' ->> 'options_table_id',
             'options',          custom.choice_options(p_organization_id,
                                   (f.data -> 'config' ->> 'options_table_id')::uuid))), '{}'::jsonb)
      from custom.record f
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and coalesce(f.data_class, '') <> 'kernel'
       and (f.data ->> 'entity_definition_id')::uuid = p_table_id
       and f.data ->> 'type' = 'list'
       and nullif(f.data -> 'config' ->> 'options_table_id', '') is not null
  );
  perform platform.memo_b_put(v_key, v_out::text);
  return v_out;
end
$function$;

CREATE OR REPLACE FUNCTION custom.choice_options(p_organization_id uuid, p_options_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  -- LADDER-PERF's class, on the WRITE path. Everything between `begin` and `end`
  -- is this function's own SQL body, character for character; only the language
  -- moved, so a plan is cached for the session instead of built on every call.
  return (
  -- key -> {label, id, retired, reason}. RETIRED OPTIONS ARE IN HERE: a value that points at
    -- one must read as its label with the reason, not disappear. Live rows are aggregated LAST
    -- so that if a retired option and a live one ever shared a key, the live one wins.
    select coalesce(jsonb_object_agg(x.k, x.v), '{}'::jsonb)
      from (select coalesce(nullif(o.metadata ->> 'option_key', ''),
                            custom.choice_slug(coalesce(o.data ->> 'title', o.data ->> 'name'))) as k,
                   jsonb_build_object(
                     'label',   coalesce(nullif(o.data ->> 'title', ''),
                                         nullif(o.data ->> 'name', ''),
                                         coalesce(nullif(o.metadata ->> 'option_key', ''), '(unnamed choice)')),
                     'id',      o.id::text,
                     -- THE POSITION THE PERSON DECLARED. Every caller that draws these in a
                     -- row — a dropdown, a board's columns, an export's vocabulary — needs
                     -- it, and until now there was nothing to order by: one list is written
                     -- in one transaction, so every option shares one `created_at` and the
                     -- only tiebreak left was a random uuid.
                     'position', (o.metadata ->> 'option_position')::integer,
                     'retired', o.deleted_at is not null,
                     'reason',  case when o.deleted_at is not null
                                     then format('This choice was retired on %s. The value is kept and still means what it meant.',
                                                 to_char(o.deleted_at at time zone 'utc', 'FMDD Month YYYY'))
                                end) as v
              from custom.record o
             where o.organization_id = p_organization_id
               and o.table_id = p_options_table_id
             order by (o.deleted_at is null),
                      (o.metadata ->> 'option_position')::integer nulls last,
                      o.created_at, o.id) x
  );
end
$function$;

CREATE OR REPLACE FUNCTION custom.table_column_source(p_organization_id uuid, p_table_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_class text;
  v_word  text;
begin
  -- A record with no Table is a Home, and a Home is not a row of anything.
  if p_table_id is null then
    return 'free_form';
  end if;

  -- THE KERNEL, asked by id alone. Its nine Tables are defined in platform code, hold no
  -- Field rows, and are pointed at by every organization; custom._record_field_validation
  -- already exempts two of the nine by name for this reason.
  if exists (select 1 from custom.record k
              where k.id = p_table_id and k.data_class = 'kernel') then
    return 'code';
  end if;

  select r.data_class, nullif(r.data ->> 'columns', '')
    into v_class, v_word
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_table_id
   limit 1;

  -- A Table this organization cannot see is a question for the organization wall
  -- (custom._organization_wall_guard), never for this function. It judges nothing.
  -- AND: a row that is not a Table at all has no Field rows to be the truth about, so
  -- there is nothing here for `fields` to mean.
  if v_class is distinct from 'table' then
    return 'free_form';
  end if;

  if v_word = 'free_form' then
    return 'free_form';
  end if;

  -- SILENCE MEANS THE DOCTRINE. A Table that says nothing has Field rows for columns.
  return 'fields';
end;
$function$;

CREATE OR REPLACE FUNCTION custom.table_type_field(p_organization_id uuid, p_table_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_answer text;
  v_key    text;
  v_hit    text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_type_field');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.table_type_field');

  -- `to_jsonb`/`#>> '{}'` and not the bare text, so a Table that HAS no type field — a null
  -- answer, which is the common one — is a hit rather than a miss forever.
  v_key := 'tf:' || coalesce(p_organization_id::text, '-') || ':' || coalesce(p_table_id::text, '-');
  v_hit := platform.memo_s_get(v_key);
  if v_hit is not null then
    return v_hit::jsonb #>> '{}';
  end if;

  select t.data ->> 'type_field' into v_answer
    from custom.record t
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null;
  perform platform.memo_s_put(v_key, coalesce(to_jsonb(v_answer), 'null'::jsonb)::text);
  return v_answer;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.undeclared_keys(p_organization_id uuid, p_table_id uuid, p_data jsonb)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_keys     text[];
  v_memo_key text;
  v_declared text;
begin
  -- EVERY Field row of the Table, not custom.applicable_fields: a Value for a Field that
  -- does not apply to THIS record's type is a different question entirely, and
  -- custom._record_field_validation's retype path already answers it by moving the value
  -- into `_retired` with its reason. Asking applicable_fields here would call such a value
  -- undeclared and refuse a write that is perfectly legal.
  v_memo_key := 'udk:' || coalesce(p_organization_id::text, '-') || ':' ||
                          coalesce(p_table_id::text, '-');
  v_declared := platform.memo_b_get(v_memo_key);
  if v_declared is null then
    select coalesce(jsonb_agg(distinct f.data ->> 'key'), '[]'::jsonb)::text
      into v_declared
      from custom.record f
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.data_class = 'field'
       and f.deleted_at is null
       and f.data ->> 'entity_definition_id' = p_table_id::text;
    perform platform.memo_b_put(v_memo_key, v_declared);
  end if;

  select coalesce(array_agg(k.key order by k.key), array[]::text[])
    into v_keys
    from jsonb_object_keys(case when jsonb_typeof(p_data) = 'object' then p_data else '{}'::jsonb end) k(key)
   where left(k.key, 1) <> '_'
     and not (k.key = any (custom.record_platform_keys()))
     and not (v_declared::jsonb ? k.key);
  return v_keys;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.memo_clear_on_structure_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if coalesce(new.table_id, old.table_id) in (custom.table_kernel_id(),
                                              custom.field_kernel_id(),
                                              custom.rule_kernel_id()) then
    perform platform.memo_clear();
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.memo_clear()
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select set_config('mx_memo.v', '', true),
         set_config('mx_memo.s', '', true),
         set_config('mx_memo.b', '', true);
$function$;

CREATE OR REPLACE FUNCTION custom._organization_wall_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_kind text;
begin
  -- 🚨 THE NAME HAS TO BE THE PARTITION ROOT'S, NOT THE PARTITION'S, AND THIS LANE LEARNED
  -- IT THE ONLY WAY THAT COUNTS. The first rehearsal of this file built its census key as
  -- `format('%I.%I', tg_table_schema, tg_table_name)`. Every catalogue check a verifier
  -- would run read green - seventeen triggers in `pg_trigger`, the parent's and one per
  -- partition, BEFORE INSERT OR UPDATE, calling this function - and a record of one
  -- organization carrying another organization's `table_id` STILL LANDED, while
  -- `custom.assert_organization_wall(...)` called directly with the same row refused it by
  -- name. `custom.record` is HASH PARTITIONED into sixteen children, an INSERT on the parent
  -- is ROUTED to a partition, and it is that PARTITION's copy of the trigger that fires - so
  -- `tg_table_name` was `record_p07`, the census keyed on `custom.record` returned ZERO
  -- rows, and the wall passed everything. A guard that cannot be wrong about anything is the
  -- exact failure this campaign exists to catch; it was caught by re-running the RED rather
  -- than by reading the catalogue. `pg_partition_root` answers NULL for a table that is
  -- neither a partition nor partitioned, so the coalesce covers `external_link` and
  -- `external_source` - and every partitioned table a later lane adds to `custom` (REC-N-8's
  -- tiering will add them) inherits the right behaviour, because nothing here keys on
  -- `tg_table_name` any more.
  select format('%I.%I', n.nspname, c.relname) into v_kind
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.oid = coalesce(pg_partition_root(tg_relid), tg_relid);
  -- THE DOOR. One call to the ONE predicate (`custom.assert_store_door`), which judges
  -- `custom.caller_role()` - the identity the caller actually held - and not `current_user`,
  -- which a SECURITY DEFINER door has already rewritten to itself. The switch never removes
  -- a check: the wall below runs exactly as it would with the store open.
  perform custom.assert_store_door(new.organization_id, v_kind);
  perform custom.assert_organization_wall(v_kind, new.organization_id, to_jsonb(new));
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION custom._unique_rule_holds()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  f       record;
  v_key   text;
  v_label text;
  v_val   jsonb;
  v_text  text;
begin
  if new.table_id is null or new.data_class = 'kernel' or new.deleted_at is not null
     or new.table_id in (custom.field_kernel_id(), custom.table_kernel_id(),
                         custom.rule_kernel_id(), custom.merge_field_kernel_id()) then
    return new;
  end if;
  if new.data is null or jsonb_typeof(new.data) <> 'object' then
    return new;
  end if;

  for f in
    select r.data as d from custom.record r
     where r.organization_id = new.organization_id
       and r.table_id = custom.field_kernel_id()
       and r.deleted_at is null
       and r.data_class <> 'kernel'
       and (r.data ->> 'entity_definition_id')::uuid = new.table_id
       and exists (select 1 from jsonb_array_elements(coalesce(r.data -> 'rules', '[]'::jsonb)) x
                    where x ->> 'kind' = 'unique')
  loop
    v_key   := f.d ->> 'key';
    v_label := coalesce(nullif(f.d ->> 'label', ''), v_key);
    v_val   := new.data -> v_key;
    if v_val is null or jsonb_typeof(v_val) = 'null' then
      continue;                     -- nothing written is not a duplicate of anything
    end if;
    v_text := lower(btrim(v_val #>> '{}'));
    if v_text is null or v_text = '' then
      continue;
    end if;

    -- THE LOCK IS THE WHOLE OF B1. Two sessions writing the same value at the same moment take
    -- the same advisory lock, which is held until whichever of them commits or rolls back. The
    -- loser then reads the winner's committed row and is refused. Transaction-scoped, so it is
    -- released by the commit itself and nothing can leak it.
    perform pg_advisory_xact_lock(
      hashtextextended(new.organization_id::text || '|' || new.table_id::text || '|' || v_key || '|' || v_text, 0));

    if exists (select 1 from custom.record x
                where x.organization_id = new.organization_id
                  and x.table_id = new.table_id
                  and x.deleted_at is null
                  and x.id <> new.id
                  and lower(btrim(x.data ->> v_key)) = v_text) then
      raise exception 'Another record here already has % "%", and % has to be different on every record.',
                      v_label, btrim(v_val #>> '{}'), v_label
        using errcode = '23505',
              hint = format('FLD-3 / B1: %s carries a rule that says its value is unique in this table. Change the value, or open the record that already holds it. Nothing was written.', v_label);
    end if;
  end loop;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION platform._touch_row()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    shape jsonb := to_jsonb(NEW);
BEGIN
    -- DD-184: NEVER `NEW := jsonb_populate_record(NEW, ...)` here.  That rebuilds the
    -- row from a TupleDesc cached at the first firing in this transaction, so a column
    -- added in between is silently written back as NULL.  Direct field assignment is
    -- resolved against the tuple itself, every time.
    --
    -- A declared relabel (a migration that only renames attribution/vocabulary values,
    -- set transaction-locally via `app.relabel_keeps_updated_at = 'on'`) is not
    -- activity: it keeps updated_at. version still bumps below.
    IF shape ? 'updated_at'
       AND coalesce(current_setting('app.relabel_keeps_updated_at', true), '') <> 'on' THEN
        NEW.updated_at := now();
    END IF;
    IF TG_OP = 'UPDATE' AND shape ? 'version' THEN
        -- A record field reference inside a branch that is not taken is never resolved,
        -- so this stays inert on the row types that carry no `version` (the reason
        -- ai_050 reached for jsonb_populate_record in the first place).
        NEW.version := COALESCE((to_jsonb(OLD) ->> 'version')::integer, 0) + 1;
    END IF;
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION platform._stamp_actor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  uid uuid := COALESCE(
    NULLIF(current_setting('app.user_id', true), '')::uuid,
    (SELECT auth.uid())
  );
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, uid);
  END IF;
  NEW.updated_by := COALESCE(uid, NEW.updated_by);
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION custom._resolve_choice_words()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_on      boolean;
  v_map     jsonb;
  v_field   jsonb;
  v_key     text;
  v_label   text;
  v_val     jsonb;
  v_items   jsonb;
  v_one     jsonb;
  v_word    text;
  v_hit     text;
  v_out     jsonb;
  v_new     jsonb;
  v_before  text[];
  v_title   text;
  e         record;
begin
  -- THE SWITCH, BY NAME, BEFORE ANYTHING. While `custom/system_enabled` resolves false for this
  -- organization nothing of this store's product behaviour runs and the value is left exactly as
  -- the writer sent it. `custom._record_field_validation` already refuses a CLIENT write while
  -- the switch is off; this is the same rule for the owner-role writes it lets through — a
  -- backfill, a migration, a repair — so an organization whose store is off is byte-untouched by
  -- this lane. The read is the established one (`custom.store_is_open`,
  -- `custom._entity_custom_fields_guard` and `custom.containment_depth_ceiling` all make it):
  -- `platform.knob_resolve` answers jsonb and a switch this writer cannot read is CLOSED.
  begin
    v_on := custom.store_is_open(new.organization_id);
  exception when others then
    v_on := false;
  end;
  if not v_on then
    return new;
  end if;

  if new.data is null or jsonb_typeof(new.data) <> 'object' then
    return new;
  end if;

  -- ── AN OPTION RECORD IS BORN WITH ITS KEY ───────────────────────────────────────────
  -- The store's own bookkeeping, done where every write arrives — the panel, the import,
  -- the agent and the ordinary write door all pass through here. A RENAME NEVER TOUCHES IT:
  -- the key is set when it is missing and never recomputed, which is the whole point.
  -- IT LIVES IN `metadata`, WHICH IS WHAT THAT COLUMN IS FOR: system-owned, keyed system
  -- state, judged by `platform._metadata_guard` against a registry no client may add to. Two
  -- consequences, both deliberate. FLD-5 stays byte-true - a category is still a Record of a
  -- Table with ONE title field, and `w1_field_t4_t8.sql` asserts exactly that of the kernel's
  -- own choice tables. And a client CANNOT forge one: `_metadata_guard` sorts before
  -- `custom_record_choice_words`, so it judges what the CALLER sent (an unregistered key, which
  -- it refuses) and never what this trigger sets afterwards.
  -- ON UPDATE THE EXISTING KEY IS CARRIED, never recomputed: renaming an option must rewrite no
  -- row, and recomputing from the new title is exactly how that promise would be broken.
  if new.table_id is not null
     and coalesce(new.data_class, '') not in ('kernel', 'relation', 'field', 'table', 'rule')
     and exists (select 1 from custom.record f
                  where f.organization_id = new.organization_id
                    and f.table_id = custom.field_kernel_id()
                    and f.deleted_at is null
                    and f.data ->> 'type' = 'list'
                    and (f.data -> 'config' ->> 'options_table_id')::uuid = new.table_id) then
    -- WHAT THE CALLER SENT IS NEVER TRUSTED. `option_key` is a registered metadata key, which
    -- means `platform._metadata_guard` lets it through - so a client could put a word of their
    -- own in it. On a NEW option the key is always derived here and whatever arrived is
    -- overwritten; on an UPDATE the key the option was born with is carried, whatever arrived.
    -- Either way the caller has no say, which is what makes it stable.
    if tg_op = 'UPDATE' and coalesce(old.metadata ->> 'option_key', '') <> '' then
      new.metadata := coalesce(new.metadata, '{}'::jsonb)
                        || jsonb_build_object('option_key', old.metadata ->> 'option_key');
    else
      v_title := coalesce(nullif(new.data ->> 'title', ''), nullif(new.data ->> 'name', ''));
      if v_title is not null then
        new.metadata := coalesce(new.metadata, '{}'::jsonb)
                          || jsonb_build_object('option_key',
                               custom.choice_key_for(new.organization_id, new.table_id, v_title, new.id));
      else
        new.metadata := coalesce(new.metadata, '{}'::jsonb) - 'option_key';
      end if;
    end if;
  end if;

  -- Only ordinary records of an ordinary Table have choices of their own to resolve.
  if new.table_id is null or new.data_class = 'kernel'
     or new.table_id in (custom.field_kernel_id(), custom.table_kernel_id(),
                         custom.rule_kernel_id(), custom.merge_field_kernel_id()) then
    return new;
  end if;

  v_map := custom.choice_field_map(new.organization_id, new.table_id);
  if v_map = '{}'::jsonb then
    return new;
  end if;

  for e in select key as k, value as v from jsonb_each(v_map) loop
    v_key   := e.k;
    v_field := e.v;
    v_label := coalesce(nullif(v_field ->> 'label', ''), v_key);
    v_val   := new.data -> v_key;
    if v_val is null or jsonb_typeof(v_val) = 'null' then
      continue;
    end if;

    -- The keys this cell already held, so that a record carrying a RETIRED choice can still
    -- be saved when somebody edits a different column. Only a NEW retired choice is refused.
    if tg_op = 'UPDATE' then
      select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_before
        from jsonb_array_elements(
               case when jsonb_typeof(old.data -> v_key) = 'array' then old.data -> v_key
                    when old.data -> v_key is null then '[]'::jsonb
                    else jsonb_build_array(old.data -> v_key) end) x
       where jsonb_typeof(x) = 'string';
    else
      v_before := '{}'::text[];
    end if;

    v_items := case when jsonb_typeof(v_val) = 'array' then v_val else jsonb_build_array(v_val) end;
    v_out   := '[]'::jsonb;

    for v_one in select x from jsonb_array_elements(v_items) x loop
      if jsonb_typeof(v_one) <> 'string' then
        v_out := v_out || jsonb_build_array(v_one);
        continue;
      end if;
      v_word := btrim(v_one #>> '{}');
      if v_word = '' then
        v_out := v_out || jsonb_build_array(v_one);
        continue;
      end if;

      v_hit := custom.choice_key_of(v_field, v_word);

      if v_hit is null then
        -- REFUSED WITH THE CHOICES THEMSELVES, in the words a person reads.
        raise exception '% does not have a choice called "%".', v_label, v_word
          using errcode = '23514',
                hint = format('The choices for %s are %s. Pick one of those, or add "%s" to the column''s list of choices first.',
                              v_label,
                              coalesce(custom.choice_words(v_field), 'not set up yet'),
                              v_word);
      end if;

      if coalesce((v_field -> 'options' -> v_hit ->> 'retired')::boolean, false)
         and not (v_hit = any (v_before)) then
        raise exception '% is no longer one of the choices for %.',
                        coalesce(v_field -> 'options' -> v_hit ->> 'label', v_hit), v_label
          using errcode = '23514',
                hint = format('It was retired, so it can no longer be picked. Records that already hold it keep it and still read as "%s". The choices now are %s.',
                              coalesce(v_field -> 'options' -> v_hit ->> 'label', v_hit),
                              coalesce(custom.choice_words(v_field), 'none — add one first'));
      end if;

      v_out := v_out || jsonb_build_array(to_jsonb(v_hit));
    end loop;

    v_new := case when jsonb_typeof(v_val) = 'array' then v_out else v_out -> 0 end;
    if v_new is distinct from v_val then
      new.data := new.data || jsonb_build_object(v_key, v_new);
    end if;
  end loop;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION custom._work_shape_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d       jsonb := new.data;
  v_why   text;
  v_kind  text;
  v_until timestamptz;
begin
  -- THE DOOR. One call to the ONE predicate (`custom.assert_store_door`), which judges
  -- `custom.caller_role()` - the identity the caller actually held - and not `current_user`,
  -- which a SECURITY DEFINER door has already rewritten to itself.
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

  if new.data_class = 'work_template' then
    v_why := custom.work_template_refusal(d -> 'graph');
    if v_why is not null then
      raise exception '%', v_why
        using errcode = '23514',
              hint = 'REC-70: a template is judged when it is written, not when somebody runs it.';
    end if;
    return new;
  end if;

  if new.data_class = 'work_instantiation' then
    if nullif(d ->> 'template_id', '') is null
       or jsonb_typeof(d -> 'records') is distinct from 'array' then
      raise exception 'a record of an instantiation has to name its template and the records it made'
        using errcode = '23514',
              hint = 'REC-70: the act is logged, and a log that cannot say what it made is not one.';
    end if;
    return new;
  end if;

  if new.table_id is null or new.data_class in ('kernel', 'table', 'field', 'rule', 'relation', 'merge_field') then
    return new;
  end if;

  -- REC-69 — THE ACTION STATES. A move the model forbids is refused, naming both states and
  -- saying where the record CAN go instead. The cheap test is first: this costs a `jsonb ->>`
  -- on every write to the store and a query only on a write that actually moves a status.
  if tg_op = 'UPDATE'
     and nullif(new.data ->> 'status', '') is distinct from nullif(old.data ->> 'status', '')
     and nullif(old.data ->> 'status', '') is not null
     and nullif(new.data ->> 'status', '') is not null then
    -- CHOICE-VALUE. `status` is a choice column and a choice value is the option's own key
    -- now, not the option record's uuid. `custom.work_state_id` turns whatever is stored - the
    -- key, the label, or an id written before that lane - into the state RECORD this model is
    -- expressed in. Six casts in five work functions made the same assumption; all six now ask
    -- this one question.
    v_why := custom.work_transition_refusal(new.organization_id,
                                            custom.work_state_id(new.organization_id, new.table_id,
                                                                 old.data ->> 'status'),
                                            custom.work_state_id(new.organization_id, new.table_id,
                                                                 new.data ->> 'status'));
    if v_why is not null then
      raise exception '%', v_why
        using errcode = '23514',
              hint = 'REC-69: the states a record can move to are declared on the state it is in. Change the state records if this organization works differently.';
    end if;
  end if;

  -- A HOLD. Its Table says so; nothing here guesses from a field name.
  select t.data ->> 'work_kind' into v_kind
    from custom.record t
   where t.organization_id = new.organization_id
     and t.id = new.table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null;
  if v_kind is distinct from 'slot' then
    return new;
  end if;

  if nullif(d ->> 'slot_key', '') is null then
    raise exception 'a hold has to say which slot it is on'
      using errcode = '23514', hint = 'REC-71: slot_key is what the unique index keeps single.';
  end if;
  if nullif(d ->> 'holder', '') is null then
    raise exception 'a hold has to say who is holding it'
      using errcode = '23514', hint = 'REC-71: a reservation nobody holds is not a reservation.';
  end if;
  begin
    v_until := (nullif(d ->> 'expires_at', ''))::timestamptz;
  exception when others then
    v_until := null;
  end;
  if v_until is null then
    raise exception 'a hold has to say when it runs out'
      using errcode = '23514',
            hint = 'REC-71: a slot hold is a reservation WITH an expiry - a hold with no expiry would keep the slot forever.';
  end if;
  if tg_op = 'INSERT' and v_until <= now() then
    raise exception 'a hold that has already expired is not a hold'
      using errcode = '22023', hint = 'REC-71: the expiry is in the future when the hold is taken.';
  end if;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION custom._entity_custom_fields_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org     uuid;
  v_token   text := tg_argv[0];
  v_doc     jsonb;
  v_old     jsonb;
  v_actor   text;
  v_obo     text;
  v_fields  custom.record[];
  v_values  jsonb;
  v_keys    text[];
  v_key     text;
  v_refusal text;
  v_open    boolean;
  v_memo_key text;
  v_memo    jsonb;
begin
  -- GUARD-SWITCH (2026-09-19), B1's move, unchanged. This used to read
  -- `custom/entity_custom_fields_guard`, which was false platform-wide with no rung that
  -- could turn any on, so a `custom_fields` document on a standard Entity table was never
  -- validated for anybody. It follows the organization's own store switch: an organization
  -- whose store is OFF answers byte for byte as it does today.
  begin
    v_org := to_jsonb(new) ->> 'organization_id';
  exception when others then
    v_org := null;
  end;
  if v_org is null then
    return new;
  end if;
  -- THE SWITCH, READ BY NAME AND EXACTLY ONCE. This is `custom.store_is_open`'s own body,
  -- spelled out here rather than called: the runner refuses a guarded replacement whose
  -- body never NAMES the knob that is supposed to hold it off (`guardUnreadBy`, ATTACK-6
  -- finding 2), and it is right to — a switch a body never names is a comment. Spelling it
  -- out also keeps this to ONE knob read on a path that now fires on every INSERT into 643
  -- tables, some of them busy. The rule is the store's own and unchanged: a switch this
  -- writer cannot read is CLOSED, never open. While it answers false the row is written
  -- byte for byte as it is today.
  begin
    v_open := custom.store_is_open(v_org);
  exception when others then
    v_open := false;
  end;
  if not v_open then
    return new;
  end if;

  -- A ROW WITH NO CUSTOM FIELDS HAS NONE, AND THAT IS NOT A MALFORMED WRITE.
  -- `crm.party.custom_fields` — the one column that existed before this lane — is NULLABLE
  -- with no default, so `to_jsonb(new) -> 'custom_fields'` is JSON `null`, which `coalesce`
  -- does not catch because it is not SQL NULL. The first version of this guard therefore
  -- refused every INSERT into `crm.party` for a store-ON organization with "this write gives
  -- them as null" — trading one outage for another. Measured from the seat immediately after
  -- that apply, which is why it is a sentence here and not a story.
  -- Absent, SQL NULL and JSON null all mean the same thing and are read as the empty set.
  -- A value that is genuinely the wrong SHAPE — a string, a number, an array — is still
  -- refused by name, which is what that refusal was always for.
  v_doc := to_jsonb(new) -> 'custom_fields';
  if v_doc is null or jsonb_typeof(v_doc) = 'null' then
    v_doc := '{}'::jsonb;
  elsif jsonb_typeof(v_doc) <> 'object' then
    raise exception 'The custom fields of a % are a set of named values, and this write gives them as %.',
      v_token, jsonb_typeof(v_doc)
      using errcode = '22023',
            hint = 'REC-40: custom_fields is one jsonb object per row - {"key": value}. Nothing was written.';
  end if;
  v_old := case when tg_op = 'UPDATE' then to_jsonb(old) -> 'custom_fields' else null end;
  if v_old is null or jsonb_typeof(v_old) = 'null' then
    v_old := '{}'::jsonb;
  end if;

  -- A WRITE THAT CHANGES NO CUSTOM VALUE ASSERTS NOTHING AND HAS NO AUTHOR TO RECORD. This
  -- is `custom._value_envelope`'s own rule, for the same reason: an UPDATE touching only the
  -- row's real columns must not re-author values nobody touched.
  if tg_op = 'UPDATE' and v_old is not distinct from v_doc then
    return new;
  end if;

  -- 1. THE DEFINITIONS DECIDE. FLD-8: the Fields of a STANDARD table are the field-kernel
  -- records carrying this table's registry token, and there is no per-table list anywhere.
  --
  -- WRITE-PERF-3, 2026-09-22: READ ONCE PER STATEMENT, NOT TWICE PER ROW. This block used to
  -- run the SAME index query over `custom.record` twice for every row written — once inside
  -- `custom.validate_custom_fields`, whose whole body is that query plus
  -- `custom.validate_values`, and once again here for the envelope. The Fields of a standard
  -- table are a fact about the TABLE, so the answer is now read once per (organization, token)
  -- into WRITE-PERF-3's transaction-local memo and both readers use it. Measured on the main
  -- database: this trigger cost 185 ms of one 250-row insert into `custom.record`, for 250
  -- rows that carry no custom fields at all.
  --
  -- IT CANNOT GO STALE. The memo is a GUC set with `is_local => true`, dies with the
  -- transaction, is scoped to the seat by `platform.memo_b_seat()`, and `custom.record` — the
  -- one table this query reads — carries `_aa_memo_clear`
  -- (`platform.memo_clear_on_structure_row`, BEFORE ROW, so a Field written EARLIER IN THE
  -- SAME STATEMENT empties it before this reader is served) and `zz_memo_clear_i/_u/_d`.
  v_memo_key := 'scf:' || v_org::text || ':' || v_token;
  v_memo     := platform.memo_b_get(v_memo_key)::jsonb;
  if v_memo is null then
    select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) into v_memo
      from custom.record f
     where f.organization_id = v_org
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and f.data ->> 'table_token' = v_token;
    perform platform.memo_b_put(v_memo_key, v_memo::text);
  end if;
  select array_agg(q) into v_fields
    from jsonb_populate_recordset(null::custom.record, v_memo) q;

  -- `custom.validate_custom_fields`'s own body, character for character, with the read it
  -- would have repeated handed to it. The function itself is untouched: every other caller
  -- keeps it exactly as it is.
  if v_fields is not null then
    perform custom.validate_values(v_org, v_fields, coalesce(v_doc, '{}'::jsonb), null);
  end if;

  -- NOTHING DECLARED, NOTHING TO ENVELOPE. An organization that has added no custom field to
  -- this table gets exactly the document it wrote, byte for byte, as it does with the store
  -- off. Opening an envelope over a document with no Fields would invent provenance for
  -- values no Field describes.
  if v_fields is null then
    return new;
  end if;

  -- 2. THE CEILING, over what the writer supplied, before anything else touches it.
  v_refusal := custom.size_refusal(v_org, v_doc);
  if v_refusal is not null then
    raise exception '%', v_refusal
      using errcode = '23514',
            hint = 'The ceilings are custom/value_max_bytes and custom/document_max_bytes - organization-settable knobs with published defaults, not constants.';
  end if;

  -- 3. WHO WROTE IT (VAL-2 / AGT-N-4), the same two arms `custom._value_envelope` asks.
  v_actor := custom.actor_word(v_doc ->> '_actor');
  v_obo   := nullif(btrim(coalesce(v_doc ->> '_on_behalf_of', '')), '');
  if v_obo is not null and v_actor <> 'agent' then
    raise exception 'This write says it is on behalf of somebody, and its author is a %. Only an agent acts on behalf of a person.', v_actor
      using errcode = '22023';
  end if;
  if v_actor = 'agent' and v_obo is null then
    raise exception 'This write says an agent wrote it, and does not say who the agent is acting for. An agent always acts on behalf of a person.'
      using errcode = '22004',
            hint = 'Put "_on_behalf_of" in the custom fields with that person''s id.';
  end if;
  v_doc := v_doc - '_actor' - '_on_behalf_of';

  -- 4. THE ENVELOPE, over the declared Fields and never over anything else.
  v_values := coalesce(v_doc -> '_values', '{}'::jsonb);
  if jsonb_typeof(v_values) <> 'object' then
    v_values := '{}'::jsonb;       -- the envelope law below refuses the malformed block by name
  end if;
  select coalesce(array_agg(f.data ->> 'key'), '{}'::text[]) into v_keys from unnest(v_fields) f;
  foreach v_key in array v_keys loop
    if v_key is not null and v_doc ? v_key and not (v_values ? v_key) then
      v_values := v_values || jsonb_build_object(v_key, '{}'::jsonb);
    end if;
  end loop;
  if v_values <> '{}'::jsonb or v_doc ? '_values' then
    v_doc := jsonb_set(v_doc, '{_values}', v_values);
  end if;
  v_doc := custom.stamp_value_envelopes(v_doc, v_actor, v_obo, now());
  v_doc := custom.value_versions(v_old, v_doc);

  v_refusal := custom.value_envelope_refusal(v_doc);
  if v_refusal is not null then
    raise exception '%', v_refusal
      using errcode = '23514',
            hint = 'VAL-1..VAL-8: a value carries its source, its author, its reason for being missing and its other candidates, beside it in this row''s custom fields.';
  end if;
  perform custom.validate_value_envelope(v_org, v_fields, v_doc);

  new.custom_fields := v_doc;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION platform._stamp_actor_tier()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  has_upd_tier     boolean;
  has_upd_sys      boolean;
  has_crt_tier     boolean;
  has_crt_sys      boolean;
  has_confirmation boolean;
  has_conf_by      boolean;
  has_conf_at      boolean;
  table_scope_id   uuid;
  tier             text;
  raw_tier         text;
  sys              text;
  agent_id         uuid;
  patch            jsonb := '{}'::jsonb;
  row_json         jsonb;
  org              uuid;
  actor            uuid;
  born             text;
BEGIN
  -- Read live from pg_attribute on every firing: this is the catalog, not a cache,
  -- so it already sees a column added earlier in this transaction.  Every column this
  -- function writes is tested for on its own, because the write below is now a direct
  -- field assignment and a missing column is an error rather than a silent skip.
  SELECT bool_or(attname = 'updated_by_tier'),
         bool_or(attname = 'updated_by_system'),
         bool_or(attname = 'created_by_tier'),
         bool_or(attname = 'created_by_system'),
         bool_or(attname = 'confirmation'),
         bool_or(attname = 'confirmed_by'),
         bool_or(attname = 'confirmed_at')
    INTO has_upd_tier, has_upd_sys, has_crt_tier, has_crt_sys,
         has_confirmation, has_conf_by, has_conf_at
    FROM pg_attribute
   WHERE attrelid = TG_RELID
     AND attname IN ('updated_by_tier', 'updated_by_system', 'created_by_tier',
                     'created_by_system', 'confirmation', 'confirmed_by', 'confirmed_at')
     AND NOT attisdropped;

  -- Column-guarded: inert on every table that does not carry what it writes. That guard is what
  -- makes this trigger legal on a `component`, where _stamp_actor is forbidden (db-rules §6d-1).
  IF NOT COALESCE(has_upd_tier, false)
     AND NOT (COALESCE(has_crt_tier, false) AND TG_OP = 'INSERT')
     AND NOT (COALESCE(has_confirmation, false) AND TG_OP = 'INSERT') THEN
    RETURN NEW;
  END IF;

  raw_tier := platform.declared_actor_tier();
  sys      := platform.actor_system();
  -- DD-211: WHICH AGENT, when one is writing. Three current_setting() reads, no SPI,
  -- no catalog probe -- the per-row cost FEATURE.md §2 measures is a round trip, and
  -- this is not one.
  agent_id := platform.declared_actor_agent();

  -- Chair R-A/R-B: the RAW declaration first, so a client's x-matrx-actor-tier header reaches the
  -- tier columns. platform.actor_tier() remains the fallback for the *_by_tier columns only, so
  -- nothing that worked before wf_044 changes.
  tier := COALESCE(raw_tier, platform.actor_tier());

  -- wf_051 / V-45 §6: an agent must name itself; a person needs no system. `platform.actor_system()`
  -- resolves to `platform.declared_actor_system()` alone (matrx-frontend's
  -- dd131_actor_system_no_person_header.sql) — NULL here means genuinely undeclared, on whichever
  -- channel this write arrived on. A `human` tier is exempt on purpose: its NULL system is the
  -- chair's ruling, not a gap.
  IF tier IN ('ai', 'code') AND sys IS NULL THEN
    RAISE EXCEPTION
      'This write declares actor_tier=%, but names no actor_system. An agent or automated write must say WHICH agent/system it is (x-matrx-actor-system on the client channel, or the app.actor_system GUC on a server channel) — a person''s write needs no system at all, but "an AI did it" with no name is not provenance. Table: %.%',
      tier, TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;

  -- DD-211: a PERSON'S write carries no agent. "A person did this" and "agent X did
  -- this" are two different authors, and a row cannot have both -- accepting the pair
  -- would let a human-tier write borrow an agent's born-confirmed exception.
  IF tier = 'human' AND agent_id IS NOT NULL THEN
    RAISE EXCEPTION
      'This write declares actor_tier=human AND an actor_agent (%). A person''s write carries no agent: either the person is the author (drop the x-matrx-actor-agent header / the app.actor_agent GUC) or the agent is (declare actor_tier=ai and the agent that is running). Table: %.%',
      agent_id, TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;

  IF COALESCE(has_upd_tier, false) THEN
    patch := patch || jsonb_build_object('updated_by_tier', tier);
    IF COALESCE(has_upd_sys, false) THEN
      patch := patch || jsonb_build_object('updated_by_system', sys);
    END IF;
  END IF;
  IF COALESCE(has_crt_tier, false) AND TG_OP = 'INSERT' THEN
    patch := patch || jsonb_build_object('created_by_tier', tier);
    IF COALESCE(has_crt_sys, false) THEN
      patch := patch || jsonb_build_object('created_by_system', sys);
    END IF;
  END IF;

  -- ---- DD-131: the confirmation branch, INSERT only (wf_046/wf_048, unchanged by wf_051). -----
  -- UPDATE never moves the value here: every transition is a named action with its own door (§3).
  IF COALESCE(has_confirmation, false) AND TG_OP = 'INSERT' THEN
    table_scope_id := platform._confirmation_admission(TG_RELID);

    IF table_scope_id IS NULL THEN
      -- The column exists but this table is not admitted (or is not registered at all). Write
      -- the only value that is TRUE of such a row -- nobody has confirmed it -- so the flag can
      -- be turned off again without bricking the table (wf_048).
      born  := 'unconfirmed';
      patch := patch || jsonb_build_object('confirmation', born);
      IF COALESCE(has_conf_by, false) THEN patch := patch || jsonb_build_object('confirmed_by', NULL); END IF;
      IF COALESCE(has_conf_at, false) THEN patch := patch || jsonb_build_object('confirmed_at', NULL); END IF;
    ELSE
      row_json := to_jsonb(NEW);
      org   := NULLIF(row_json ->> 'organization_id', '')::uuid;
      actor := COALESCE(NULLIF(current_setting('app.user_id', true), '')::uuid, auth.uid());

      IF raw_tier = 'human' THEN
        -- A person declared themselves the author. Writing it is standing behind it.
        born := 'confirmed';
      ELSIF raw_tier IN ('ai', 'code') THEN
        -- Born confirmed ONLY when a person decided that in advance, at BOTH rungs (§3.3, §4.2
        -- keys 1 and 2). They are a conjunction across different rungs, so no precedence race.
        --
        -- DD-198 shape: an ARRAY of {kind, id}. DD-211: the rungs are WRITTEN OUT at the call
        -- site -- the table always, and the AGENT too when one is writing -- so that both the
        -- array guard and the rung census can READ which rungs this read stands on. A local
        -- variable here made this call site unreadable to both (dd211b's header). knob_resolve
        -- filters every candidate override by the knob's own `overridable_by`, so naming both
        -- rungs on both keys can never cross them over.
        IF  COALESCE((platform.knob_resolve('records', 'confirmation.agent_write_born_confirmed',
                        org, NULL,
                        CASE WHEN agent_id IS NULL
                             THEN jsonb_build_array(jsonb_build_object('kind', 'table', 'id', table_scope_id))
                             ELSE jsonb_build_array(jsonb_build_object('kind', 'agent', 'id', agent_id),
                                                    jsonb_build_object('kind', 'table', 'id', table_scope_id))
                        END))::text::boolean, false)
        AND COALESCE((platform.knob_resolve('records', 'confirmation.table_allows_born_confirmed',
                        org, NULL,
                        CASE WHEN agent_id IS NULL
                             THEN jsonb_build_array(jsonb_build_object('kind', 'table', 'id', table_scope_id))
                             ELSE jsonb_build_array(jsonb_build_object('kind', 'agent', 'id', agent_id),
                                                    jsonb_build_object('kind', 'table', 'id', table_scope_id))
                        END))::text::boolean, false)
        THEN
          born := 'confirmed';
        ELSE
          born := 'unconfirmed';
        END IF;
      ELSE
        -- raw_tier IS NULL: a server channel that declared nothing. Fail SAFE and fail LOUD.
        born := 'unconfirmed';
        PERFORM platform._report_undeclared_confirmation_write(TG_RELID, org, actor);
      END IF;

      -- Unconditional: no API, no RPC, no client and no agent may pass `confirmation`,
      -- `confirmed_by` or `confirmed_at` (§2.2 rule 3).
      patch := patch || jsonb_build_object('confirmation', born);
      IF born = 'confirmed' THEN
        IF COALESCE(has_conf_by, false) THEN patch := patch || jsonb_build_object('confirmed_by', actor); END IF;
        IF COALESCE(has_conf_at, false) THEN patch := patch || jsonb_build_object('confirmed_at', now()); END IF;
      ELSE
        IF COALESCE(has_conf_by, false) THEN patch := patch || jsonb_build_object('confirmed_by', NULL); END IF;
        IF COALESCE(has_conf_at, false) THEN patch := patch || jsonb_build_object('confirmed_at', NULL); END IF;
      END IF;
    END IF;
  END IF;

  IF patch = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  -- DD-184: apply the patch by DIRECT FIELD ASSIGNMENT. `jsonb_populate_record(NEW, patch)`
  -- rebuilds the whole row from a TupleDesc cached at this call site's first firing in the
  -- transaction, which silently NULLs any column added after that.  Each key is present only
  -- when the column exists (checked against pg_attribute above), so no assignment can raise.
  IF patch ? 'updated_by_tier'   THEN NEW.updated_by_tier   := patch ->> 'updated_by_tier';   END IF;
  IF patch ? 'updated_by_system' THEN NEW.updated_by_system := patch ->> 'updated_by_system'; END IF;
  IF patch ? 'created_by_tier'   THEN NEW.created_by_tier   := patch ->> 'created_by_tier';   END IF;
  IF patch ? 'created_by_system' THEN NEW.created_by_system := patch ->> 'created_by_system'; END IF;
  IF patch ? 'confirmation'      THEN NEW.confirmation      := patch ->> 'confirmation';      END IF;
  IF patch ? 'confirmed_by'      THEN NEW.confirmed_by      := (patch ->> 'confirmed_by')::uuid; END IF;
  IF patch ? 'confirmed_at'      THEN NEW.confirmed_at      := (patch ->> 'confirmed_at')::timestamptz; END IF;

  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION platform._metadata_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'auth', 'platform'
AS $function$
declare
  v_role  text := auth.role();
  v_token text;
  v_new   jsonb := coalesce(new.metadata, '{}'::jsonb);
  v_old   jsonb := '{}'::jsonb;
  k       text;
begin
  -- service_role, postgres, the migration runner: not a client, not guarded.
  if v_role is distinct from 'anon' and v_role is distinct from 'authenticated' then
    return new;
  end if;
  -- the provisioner's cooperation marker (platform.create_entity_table).
  if platform.is_provisioning() then  -- wave 3: a proof only the provisioner can write, never the forgeable `matrx.provisioner` GUC
    return new;
  end if;

  if jsonb_typeof(v_new) <> 'object' then
    raise exception 'matrx_validation_gate: %.%.metadata must be a JSON object (got %) — metadata is system-owned and holds keyed system state, never a scalar or an array',
      tg_table_schema, tg_table_name, jsonb_typeof(v_new)
      using errcode = '42501';
  end if;

  v_token := nullif(tg_argv[0], '');
  if v_token is null then
    select e.token into v_token from platform.entity_types e where e.table_ref = tg_relid limit 1;
  end if;

  if tg_op = 'UPDATE' then
    v_old := coalesce(old.metadata, '{}'::jsonb);
    if jsonb_typeof(v_old) <> 'object' then v_old := '{}'::jsonb; end if;
  end if;

  for k in select jsonb_object_keys(v_new) loop
    -- only keys this write actually CHANGES are judged; untouched legacy keys survive.
    continue when tg_op = 'UPDATE' and (v_new -> k) is not distinct from (v_old -> k);
    if not exists (
      select 1 from platform.metadata_reserved_keys r
       where r.key = k and r.table_token in ('*', coalesce(v_token, ''))
    ) then
      raise exception 'matrx_validation_gate: metadata key "%" is not system-owned state on %.% — the metadata column belongs to the platform, never to user content. Put this in a real column on the table (or in custom_fields), not in metadata.',
        k, tg_table_schema, tg_table_name
        using errcode = '42501',
              hint = 'AI Matrx Data Doctrine §3.2/§4.4 (DD-060). If this key really is system state the server stamps, the server writes it with the service role (which bypasses this guard) or it is registered in platform.metadata_reserved_keys with a reason.';
    end if;
  end loop;

  return new;
end;
$function$;

-- ── THE OBJECTS THIS WAVE ADDED ──────────────────────────────────────────────────────────
drop event trigger if exists memo_ddl_forgets_the_shape;
drop function if exists platform.memo_ddl_forgets_the_shape();
drop function if exists platform.memo_col_flags(oid,text[]);
drop function if exists platform.relation_name(oid);
drop function if exists custom.table_work_kind(uuid,uuid);
drop function if exists custom.table_unique_rule_fields(uuid,uuid);
drop function if exists custom.table_is_options_table(uuid,uuid);
drop function if exists platform.memo_k_get(text);
drop function if exists platform.memo_k_put(text,text);
drop function if exists platform.memo_k_drop(text);
drop function if exists platform.memo_k_stamp();
