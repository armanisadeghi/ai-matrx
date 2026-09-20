-- chair-step: it GRANTS EXECUTE to `authenticated` on six functions of schema `custom`. A GRANT
--   is the one shape this runner's allow-list refuses by name, and correctly so — a grant is how
--   the store gets wider. It is deliberate here and it is the whole point of the file.
--   Measured live on 2026-09-20 from the seat a signed-in person actually has (`set role
--   authenticated` plus `request.jwt.claims`, which is what PostgREST sets), SEVEN functions the
--   product needs answered `permission denied for function ...` to the OWNER of the record, and
--   an eighth was granted and useless. Every function this file opens decides FIRST, on the one
--   ladder: the organization wall (custom.assert_client_may_reach), then the row
--   (custom.assert_client_may_open / custom.assert_may_know_table). Nothing becomes visible to
--   anybody that custom.has_visibility did not already say they may see; nothing is dropped;
--   nothing is revoked; no row of any feature is deleted or rewritten. The three primitives that
--   platform.client_callable_door already declares server-only — custom.effective_level,
--   custom.record_state_as_of and custom.delete_rule — STAY server-only, for the reasons their
--   own rows give; each gets a client door BESIDE it that asks the caller's question and decides
--   it. The inverse is migrations/inverse/storet_the_doors_a_person_can_reach_down.sql.
-- based-on: custom.migrate_retype(uuid, uuid, text, text) a08b2447432f256abf39715df9e4c351099b36e20cb274cf37a2acec18bf8b8c
-- based-on: custom.value_read(uuid, uuid, text) 9fec9d48d2b99405f5c9cc06952dc5efafa78dadc39d5582b1341df1662e6d03
-- based-on: custom.field_dependants(uuid, uuid) 218dab14860a4e16bbf41b8846cbf7767d1aba4f084189e7a4451bb36f460a4f
-- based-on: custom.table_type_field(uuid, uuid) 603a9b3187cd20998ad452c9ace7e28d26606d6f152cd0e0e685d88e615096f8
-- guard: custom/system_enabled
--
-- STORE-T — THE EIGHT DOORS A SIGNED-IN PERSON COULD NOT OPEN.
--
-- WHY EVERY LANE SUITE SAID GREEN ON THINGS THAT DO NOT WORK. `custom.assert_client_may_reach`
-- returns EARLY when `pg_has_role(custom.caller_role(), <the owner of custom.record>, 'member')`
-- — the campaign's own lanes run as the role that owns the store. Every suite in
-- `scripts/campaign-tests/` sets `request.jwt.claims` and never sets `role`, so it ran as the
-- superuser: grants were free, RLS was off, SECURITY INVOKER and SECURITY DEFINER were the same
-- thing, and `custom.record` was directly readable. A suite in that seat CANNOT fail any of the
-- eight things this file fixes. The suites this lane ships take the seat first and never give
-- it back, and `pnpm check:store-doors-decide` now counts, live, the shape that made it
-- possible: a function `authenticated` may execute that is SECURITY INVOKER.
--
-- The store switch (`custom/system_enabled`) is unchanged: every body opened here is reached
-- through doors that already ask `custom.assert_store_door`, and the register row is what makes
-- each one client-callable at all.

-- ── 1. WHAT MAY I DO WITH THIS? ─────────────────────────────────────────────────────────
-- `custom.effective_level` stays what its own door row says it is: server-only, because a
-- client that could name an arbitrary `p_user_id` would be reading another person's
-- permissions. The question a SCREEN asks is not that one — it is "what may *I* do with this",
-- and that question is about the caller, so this door takes no principal at all.
create function custom.my_level(p_organization_id uuid, p_id uuid, p_type text default 'record')
returns public.permission_level
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_me uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.my_level');
  perform custom.assert_client_may_open(p_organization_id, p_id, 'custom.my_level',
                                        'viewer'::public.permission_level,
                                        coalesce(nullif(p_type, ''), 'record'));
  v_me := custom.query_principal();
  if v_me is null then
    return null;
  end if;
  return custom.effective_level(v_me, p_organization_id, p_id, coalesce(nullif(p_type, ''), 'record'));
end;
$function$;

-- ── 2. WHAT DID THIS RECORD SAY THEN? ───────────────────────────────────────────────────
-- `custom.record_state_as_of` stays server-only for the reason its row gives: it returns a
-- record's whole stored row with no access decision of its own. This is the decision, in front
-- of it — the wall, then the row at viewer — so T6's second clock is answerable from a seat.
create function custom.record_as_of(p_organization_id uuid, p_record_id uuid, p_at timestamp with time zone)
returns table(state jsonb, replayed boolean)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_as_of');
  perform custom.assert_client_may_open(p_organization_id, p_record_id, 'custom.record_as_of',
                                        'viewer'::public.permission_level, 'record');
  return query select s.state, s.replayed from custom.record_state_as_of(p_record_id, p_at) s;
end;
$function$;

-- ── 3. WHAT WOULD DELETING THIS TAKE WITH IT? ───────────────────────────────────────────
-- `custom.delete_rule` stays server-only for the reason its row gives: it decides nothing
-- about the caller and, asked to apply, it detaches set_null edges for real. This door decides,
-- and it NEVER applies — a screen asks what would happen, it does not make it happen. That is
-- the T7 preview the sixth pass could not reach.
create function custom.delete_preview(p_organization_id uuid, p_record_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_out jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.delete_preview');
  perform custom.assert_client_may_open(p_organization_id, p_record_id, 'custom.delete_preview',
                                        'viewer'::public.permission_level, 'record');
  begin
    v_out := custom.delete_rule(p_organization_id, p_record_id, false);
  exception when others then
    -- THE REFUSAL IS THE ANSWER. `custom.delete_rule` refuses by raising, naming what stands
    -- in the way; a preview that re-raised would be a screen that cannot show the reason.
    return jsonb_build_object('would_be_refused', true, 'reason', sqlerrm,
                              'cascade_to', '[]'::jsonb, 'detached', 0, 'carried_out', false);
  end;
  return v_out || jsonb_build_object('would_be_refused', false, 'carried_out', false,
           'note', 'This is what deleting it would do. Nothing was changed.');
end;
$function$;

-- ── 4. WHY IS THIS VALUE HERE? ──────────────────────────────────────────────────────────
create or replace function custom.value_read(p_organization_id uuid, p_record_id uuid, p_key text)
returns table(field_key text, field_id uuid, value jsonb, value_version integer, source jsonb,
              absent_reason text, actor text, on_behalf_of text,
              written_at timestamp with time zone, alternates jsonb)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.value_read');
  perform custom.assert_client_may_open(p_organization_id, p_record_id, 'custom.value_read',
                                        'viewer'::public.permission_level, 'record');
  return query
    select * from custom.record_values_versioned(p_organization_id, p_record_id) v
     where v.field_key = p_key;
end;
$function$;

-- ── 5. WHAT BREAKS IF I DELETE THIS FIELD? ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.field_dependants(p_organization_id uuid, p_field_id uuid)
 RETURNS TABLE(kind text, dependant_id uuid, label text, how text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_key   text;
  v_table uuid;
begin
  -- STORE-T: the wall, then the field itself. The answer names other people's rules and
  -- fields, so it is only ever given about a field the caller can already open.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_dependants');
  perform custom.assert_client_may_open(p_organization_id, p_field_id, 'custom.field_dependants',
                                        'viewer'::public.permission_level, 'field');

  select f.data ->> 'key', nullif(f.data ->> 'entity_definition_id', '')::uuid
    into v_key, v_table
    from custom.record f
   where f.organization_id = p_organization_id
     and f.id = p_field_id
     and f.table_id = custom.field_kernel_id()
     and f.data_class <> 'kernel';
  if v_key is null then
    return;                        -- not a Field of this organization: nothing depends on it
  end if;

  return query
  -- (1) BY ID. A Rule's `expr` names a Field as {"field": "<uuid>"}; a formula or derived
  --     Field's `config` names it the same way.
  select case when r.table_id = custom.rule_kernel_id() then 'rule'
              when r.table_id = custom.merge_field_kernel_id() then 'merge field'
              else 'field' end,
         r.id,
         coalesce(nullif(r.data ->> 'name', ''), nullif(r.data ->> 'label', ''),
                  nullif(r.data ->> 'key', ''), r.id::text),
         'names it by id'
    from custom.record r
   where r.organization_id = p_organization_id
     and r.deleted_at is null
     and r.id <> p_field_id
     and r.data_class <> 'kernel'
     and r.table_id in (custom.rule_kernel_id(), custom.field_kernel_id(),
                        custom.merge_field_kernel_id())
     and (coalesce((r.data -> 'expr')::text, '')   like '%' || p_field_id::text || '%'
       or coalesce((r.data -> 'config')::text, '') like '%' || p_field_id::text || '%'
       or coalesce((r.data -> 'rules')::text, '')  like '%' || p_field_id::text || '%'
       or coalesce(r.data ->> 'target_field_id', '') = p_field_id::text)
     and not custom.owning_table_gone(p_organization_id, r.id)
  union
  -- (2) BY KEY, within the same Table. `depends_on` is a list of Field KEYS.
  select 'field', r.id,
         coalesce(nullif(r.data ->> 'label', ''), r.data ->> 'key', r.id::text),
         'reads it by name in depends_on'
    from custom.record r
   where r.organization_id = p_organization_id
     and r.deleted_at is null
     and r.table_id = custom.field_kernel_id()
     and r.data_class <> 'kernel'
     and r.id <> p_field_id
     and nullif(r.data ->> 'entity_definition_id', '')::uuid is not distinct from v_table
     and exists (select 1 from jsonb_array_elements_text(coalesce(r.data -> 'depends_on', '[]'::jsonb)) d
                  where d = v_key)
     and not custom.owning_table_gone(p_organization_id, r.id);
end;
$function$;

-- ── 6. WHICH COLUMN DECIDES WHAT KIND OF THING THIS IS? ─────────────────────────────────
create or replace function custom.table_type_field(p_organization_id uuid, p_table_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_answer text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_type_field');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.table_type_field');
  select t.data ->> 'type_field' into v_answer
    from custom.record t
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null;
  return v_answer;
end;
$function$;

-- ── 7. AND THE THIRTEEN KINDS OF COLUMN, WHICH ARE A CONSTANT ───────────────────────────
-- No organization, no row, nothing to decide: the same list for everybody, and every field
-- panel needs it to offer a person their choices. Opened exactly as it stands.

-- ── 8. T9: THE VERB THAT WAS OPEN AND COULD NOT RUN ─────────────────────────────────────
-- Everything above is a grant that was missing. This is a grant that was there and worth
-- nothing: `custom.migrate_retype` is declared client-callable and was SECURITY INVOKER, so it
-- ran with the caller's own privileges and died on its own FIRST LINE — `permission denied for
-- function assert_client_may_reach` — for the owner of the record. The body below is
-- byte-for-byte what was already there and the three decisions it makes are the same three.
-- The one word it always needed is on it. That is the whole of T9.
CREATE OR REPLACE FUNCTION custom.migrate_retype(p_organization_id uuid, p_id uuid, p_to text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row     custom.record%rowtype;
  v_log     uuid;
  v_keep    jsonb;
  v_misfit  jsonb := '{}'::jsonb;
  v_ok      text[];
  v_key     text;
  v_to_tbl  uuid;
  v_was     text;
  v_conv    integer;
  v_ret     integer;
begin
  -- THE CALLER AND THE ROW, on the one ladder, exactly as the other verbs ask it — this verb
  -- is executable by `authenticated` and a door that decides nothing is not a door. Then the
  -- switch: custom.assert_store_door resolves custom/system_enabled.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.migrate_retype');
  perform custom.assert_client_may_change(p_organization_id, p_id, 'custom.migrate_retype', 'editor'::public.permission_level, 'record');
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_retype');

  select * into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no record % here to retype.', p_id using errcode = '02000';
  end if;

  -- ── ARM TWO FIRST, because it is the smaller one: a FIELD changes what it behaves as
  --    (FLD-4 / T12). The values already written are CONVERTED where they convert and kept in
  --    `_retired` with their reason where they do not — by the trigger on the Field row, so
  --    this verb and an ordinary write behave identically.
  if v_row.data_class = 'field' then
    v_was := v_row.data ->> 'type';
    if v_was = p_to then
      return jsonb_build_object('verb', 'retype', 'field_id', p_id, 'was', v_was, 'now', p_to,
                                'changed', false, 'at', now());
    end if;
    v_log := history.migration_record(p_organization_id, 'retype', 'field', p_id,
               jsonb_build_object('kind', 'patch', 'record_id', p_id::text,
                                  'patch', jsonb_build_object('type', v_was)),
               coalesce(p_note, format('%s behaves as %s instead of %s; values that fit are converted and values that do not are kept in _retired with the reason, neither coerced nor deleted (FLD-4)', coalesce(v_row.data ->> 'label', v_row.data ->> 'key'), p_to, v_was)));
    perform custom.record_update(p_organization_id, p_id, jsonb_build_object('type', p_to));
    select count(*) filter (where true) into v_ret
      from custom.record x, lateral jsonb_array_elements(coalesce(x.data -> '_retired', '[]'::jsonb)) e
     where x.organization_id = p_organization_id
       and x.table_id = nullif(v_row.data ->> 'entity_definition_id', '')::uuid
       and x.deleted_at is null
       and e ->> 'key' = (v_row.data ->> 'key');
    select count(*) into v_conv
      from custom.record x
     where x.organization_id = p_organization_id
       and x.table_id = nullif(v_row.data ->> 'entity_definition_id', '')::uuid
       and x.deleted_at is null
       and x.data ? (v_row.data ->> 'key');
    return jsonb_build_object('verb', 'retype', 'field_id', p_id, 'was', v_was, 'now', p_to,
                              'changed', true, 'migration_id', v_log,
                              'records_still_holding_a_value', v_conv,
                              'values_in_retired_for_this_field', v_ret,
                              'values', 'converted where they convert; kept in _retired with the reason where they do not (FLD-4 / T12)',
                              'at', now());
  end if;

  -- ── ARM ONE: a RECORD moves to another Table (REC-N-18 / T9). The id does not change, so
  --    every relation to it still resolves — that is the whole point of the verb.
  select t.id into v_to_tbl from custom.record t
   where t.organization_id = p_organization_id and t.data_class = 'table'
     and t.deleted_at is null
     and (t.id::text = p_to or t.data ->> 'slug' = p_to or t.data ->> 'name' = p_to)
   limit 1;
  if v_to_tbl is null then
    raise exception 'There is no table "%" in this organization to retype it to.', p_to
      using errcode = '02000', hint = 'REC-N-18: name the table by id, slug or name.';
  end if;

  select coalesce(array_agg(f.data ->> 'key'), '{}')
    into v_ok
    from custom.applicable_fields(p_organization_id, v_to_tbl, null) f;

  v_keep := v_row.data;
  for v_key in select jsonb_object_keys(v_row.data) loop
    if left(v_key, 1) = '_' or v_key in ('parent_id') then
      continue;
    end if;
    if not (v_key = any (v_ok)) then
      v_misfit := v_misfit || jsonb_build_object(v_key, v_row.data -> v_key);
      v_keep := v_keep - v_key;
      -- THE ENVELOPE GOES WITH THE VALUE. A record saying where a value it no longer holds
      -- came from is orphan provenance, and W1-VAL refuses it by name — correctly.
      v_keep := case when v_keep ? '_values'
                     then jsonb_set(v_keep, array['_values'], (v_keep -> '_values') - v_key)
                     else v_keep end;
    end if;
  end loop;

  v_log := history.migration_record(p_organization_id, 'retype', 'record', p_id,
             jsonb_build_object('kind', 'patch', 'record_id', p_id::text,
                                'patch', v_row.data, 'table_id', v_row.table_id::text),
             coalesce(p_note, format('retyped to %s; %s value(s) did not fit and are in History with this reason, neither coerced nor deleted',
                                     coalesce((select t.data ->> 'name' from custom.record t
                                                where t.organization_id = p_organization_id and t.id = v_to_tbl), p_to),
                                     (select count(*) from jsonb_object_keys(v_misfit)))));

  update custom.record r
     set table_id = v_to_tbl, data = v_keep
   where r.organization_id = p_organization_id and r.id = p_id;

  return jsonb_build_object('verb', 'retype', 'record_id', p_id, 'kept_the_id', true,
                            'from_table', v_row.table_id, 'to_table', v_to_tbl,
                            'migration_id', v_log,
                            'misfits', v_misfit,
                            'misfits_are', 'in History with the reason, on migration ' || v_log::text,
                            'at', now());
end;
$function$;

-- ── THE REGISTER FIRST, THEN THE GRANTS ─────────────────────────────────────────────────
-- platform.enforce_definer_client_grants reads platform.client_callable_door AT GRANT TIME, so
-- a grant issued before its row is taken straight back again. Rows first, grants after.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason, signed_in_callers, identity_argtypes)
values
  ('custom','my_level','p_organization_id uuid, p_id uuid, p_type text',
   'migrations/campaign/storet_the_doors_a_person_can_reach.sql (lane STORE-T)',
   'STORE-T: "what may I do with this?" — the caller''s own level on one thing, which is the question every screen asks. It takes NO principal argument, so it cannot be asked about anybody else; custom.effective_level, which can, stays server-only for exactly that reason. The organization wall and then the subject at viewer are decided before it answers, so a caller only ever learns their level on something they can already open. Writes nothing.',
   true, array[2950,2950,25]::oid[]),
  ('custom','record_as_of','p_organization_id uuid, p_record_id uuid, p_at timestamp with time zone',
   'migrations/campaign/storet_the_doors_a_person_can_reach.sql (lane STORE-T)',
   'STORE-T / T6: what this record said at a moment in the past. This is the DECISION in front of custom.record_state_as_of, which stays server-only because it has none of its own: the organization wall, then the record at viewer, then the replay. Writes nothing.',
   true, array[2950,2950,1184]::oid[]),
  ('custom','delete_preview','p_organization_id uuid, p_record_id uuid',
   'migrations/campaign/storet_the_doors_a_person_can_reach.sql (lane STORE-T)',
   'STORE-T / T7: what deleting this would take with it, and what would refuse it — asked BEFORE a person presses delete. It calls custom.delete_rule with p_apply = false always, so it can change nothing; custom.delete_rule itself stays server-only because asked to apply it detaches set_null edges for real. A refusal comes back as the answer rather than as an error, because a screen has to be able to show the reason. The organization wall and the record at viewer are decided first.',
   true, array[2950,2950]::oid[]),
  ('custom','value_read','p_organization_id uuid, p_record_id uuid, p_key text',
   'migrations/campaign/storet_the_doors_a_person_can_reach.sql (lane STORE-T)',
   'STORE-T: "why is this value here?" — one value''s envelope, its source, who wrote it and the other candidates for it. The organization wall and the record at viewer are decided before anything is read. Writes nothing.',
   true, array[2950,2950,25]::oid[]),
  ('custom','field_dependants','p_organization_id uuid, p_field_id uuid',
   'migrations/campaign/storet_the_doors_a_person_can_reach.sql (lane STORE-T)',
   'STORE-T / T7: which rules, formulas and merge fields read this column — the sentence custom.delete_rule refuses with, available before the person presses delete. The organization wall and the field itself at viewer are decided first, so it never names a dependant of a field the caller cannot open. Writes nothing.',
   true, array[2950,2950]::oid[]),
  ('custom','table_type_field','p_organization_id uuid, p_table_id uuid',
   'migrations/campaign/storet_the_doors_a_person_can_reach.sql (lane STORE-T)',
   'STORE-T / T8: which column of this table says what kind of thing a record is, which is what a form needs before it can show the right fields. The organization wall and then custom.assert_may_know_table are asked first. Writes nothing.',
   true, array[2950,2950]::oid[]),
  ('custom','parity_field_types','',
   'migrations/campaign/storet_the_doors_a_person_can_reach.sql (lane STORE-T)',
   'STORE-T: the thirteen kinds of column this system ships, with what each is made of. A constant — no organization, no row, no caller, the same answer for everybody — and the field panel cannot offer a person their choices without it.',
   true, array[]::oid[])
on conflict do nothing;

grant execute on function custom.my_level(uuid, uuid, text)                                  to authenticated;
grant execute on function custom.record_as_of(uuid, uuid, timestamp with time zone)          to authenticated;
grant execute on function custom.delete_preview(uuid, uuid)                                  to authenticated;
grant execute on function custom.value_read(uuid, uuid, text)                                to authenticated;
grant execute on function custom.field_dependants(uuid, uuid)                                to authenticated;
grant execute on function custom.table_type_field(uuid, uuid)                                to authenticated;
grant execute on function custom.parity_field_types()                                        to authenticated;
