-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- based-on: custom._entity_custom_fields_guard() a59a0973a6f6ad1b6db267b1275d87a305b17b52435c4b84dad8ff2bbf5e8302
--
-- ENTITY-FIELDS 1 — THE GUARD THAT FOLLOWS THE STORE SWITCH COULD NOT RUN AS A PERSON,
-- SO TURNING THE STORE ON BROKE THE CRM.
--
-- MEASURED from the seat PostgREST serves (`authenticated`, admin@admin.com, organization
-- "admin's Workspace", whose `custom/system_enabled` is true) on the MAIN database,
-- 2026-09-19:
--
--     insert into crm.party (organization_id, party_kind, display_name) values (…)
--       → 42501  permission denied for function validate_custom_fields
--     update crm.party set custom_fields = '{"account_tier":"gold"}' where id = …
--       → 42501  permission denied for function validate_custom_fields
--
-- `custom._entity_custom_fields_guard` is SECURITY INVOKER, so the trigger runs as the
-- PERSON, and `custom.validate_custom_fields` is granted to nobody but the store's owner.
-- While the knob was platform-wide false (before GUARD-SWITCH) the guard returned on its
-- second line and nobody ever reached the call. The moment the guard started following the
-- organization's own store switch, every INSERT into `crm.party` — the one table carrying
-- the column — began failing for every signed-in person of a store-ON organization. Two
-- organizations have the store on today. A validator that refuses the write it is supposed
-- to validate is not a stricter rule; it is an outage.
--
-- THE CLASS, NOT THE INSTANCE. A trigger that has to read the organization's Field records
-- to judge a document can only ever run as the definer: the writer is a person, and a person
-- holds no privilege in schema `custom` at all (that is `check:store-doors-decide`'s census 7
-- and it stays true). So the guard becomes SECURITY DEFINER, and it is the guard — not a
-- grant handed to `authenticated` — that carries the reach. No new client grant is created.
--
-- AND IT NOW DOES THE OTHER HALF OF ITS JOB (REC-53). A custom record's document gets its
-- value envelopes opened, stamped and versioned by `custom._value_envelope`; a standard row's
-- `custom_fields` document got nothing, so the identical values on the two sides of REC-53
-- carried provenance on one side and none on the other. The same four calls this store
-- already uses — `custom.size_refusal`, `custom.actor_word`, `custom.stamp_value_envelopes`,
-- `custom.value_versions` — now run over `custom_fields` too, so who wrote a custom value on
-- a standard row, when, on whose behalf and in which version is recorded exactly as it is for
-- a record. A table whose organization has declared NO field for it is byte-for-byte
-- untouched: the function returns before it opens anything.
--
-- ADDITIVE: one `create or replace` declaring its `-- based-on:`, and one GRANT-free change
-- of the security context. An organization with the store OFF answers exactly as today.
--
-- INVERSE: migrations/inverse/entityfields_the_guard_can_do_its_job_down.sql

set lock_timeout = '3s';
set statement_timeout = '120s';


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
    v_open := coalesce((platform.knob_resolve('custom', 'system_enabled', v_org) #>> '{}')::boolean,
                       false);
  exception when others then
    v_open := false;
  end;
  if not v_open then
    return new;
  end if;

  v_doc := coalesce(to_jsonb(new) -> 'custom_fields', '{}'::jsonb);
  if jsonb_typeof(v_doc) <> 'object' then
    raise exception 'The custom fields of a % are a set of named values, and this write gives them as %.',
      v_token, jsonb_typeof(v_doc)
      using errcode = '22023',
            hint = 'REC-40: custom_fields is one jsonb object per row - {"key": value}. Nothing was written.';
  end if;
  v_old := case when tg_op = 'UPDATE'
                then coalesce(to_jsonb(old) -> 'custom_fields', '{}'::jsonb)
                else '{}'::jsonb end;

  -- A WRITE THAT CHANGES NO CUSTOM VALUE ASSERTS NOTHING AND HAS NO AUTHOR TO RECORD. This
  -- is `custom._value_envelope`'s own rule, for the same reason: an UPDATE touching only the
  -- row's real columns must not re-author values nobody touched.
  if tg_op = 'UPDATE' and v_old is not distinct from v_doc then
    return new;
  end if;

  -- 1. THE DEFINITIONS DECIDE. FLD-8: the Fields of a STANDARD table are the field-kernel
  -- records carrying this table's registry token, and there is no per-table list anywhere.
  perform custom.validate_custom_fields(v_token, v_org, v_doc);

  select array_agg(f) into v_fields
    from custom.record f
   where f.organization_id = v_org
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and f.data ->> 'table_token' = v_token;

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

COMMENT ON FUNCTION custom._entity_custom_fields_guard() IS
  'REC-40 / REC-51 / REC-53: validates and envelopes the custom_fields document of a standard Entity or Detail row against the Field records carrying that table''s registry token. SECURITY DEFINER because the writer is a person and a person holds no privilege in schema custom. Attached by platform.custom_fields_retrofit with the table''s token as its one argument.';
