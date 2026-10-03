-- chair-step: this file replaces six live function bodies (CREATE OR REPLACE only: no table, trigger or
-- grant change, no strong lock). Its inverse puts the six bodies back byte for byte.
-- ORDER: built on production's bodies as of 2026-10-03 08:00Z. lane7w2_a_a_choice_on_a_standard_row_holds_its_key.sql
-- (pending) also replaces custom._entity_custom_fields_guard() from the same base (e29bf768…): apply THIS file
-- first, then re-base W2 on this body (its one insertion, custom._entity_choice_keys before the round-1 block,
-- does not overlap this file's lines). onehome_d2 edits the guard by fragment and applies in either order.
-- based-on: custom.validate_value_envelope(uuid, custom.record[], jsonb) e1defeafba87841ebee2496ec9a5aab8b943fcc8cc0b4b2e48e46884f6a3926a
-- based-on: custom._entity_custom_fields_guard() e29bf768997e4a2e1a0c1523dc88ff25f67a850e3b9d7617b2cd2263d7ee3c2a
-- based-on: custom._field_shape_guard() 61b232660f4fb5b016533abb6cc09db7c50c44a1c48cc7753d5c4711f75ea2a8
-- based-on: custom.entity_read_mask(uuid, text, permission_level, text) 3c020b508a43abb8b6d17bfaef593ffd3c833d4b592457d3c549ff6c606ca5b6
-- based-on: custom.field_restore(uuid, uuid) bb4ee908c69c1e9530a679ea33b3608858ea5f9ab0cbda4926beac5a68496cd6
-- based-on: custom._field_document_for(uuid, uuid, jsonb) 97c91a847ee7958386d79554f0d356855ac6614836647be02406a85b7dcf5ca1
--
-- LANE 7 · SEC — AN ARCHIVED FIELD NEVER BLOCKS A ROW, COMES BACK FROM TRASH, AND A STANDARD TABLE TAKES NO
-- WORKED-OUT FIELD.
--
-- MEASURED on the clone 2026-10-03 as admin@admin.com and test@test.com: Marisol Vega (a CRM person
-- in Cedar Ridge) refused EVERY custom-field write once "Insurance verified" was archived:
--   23514 This record carries where "insurance_verified" came from, and this table has no field
--         called "insurance_verified". Provenance nobody can read is worse than none.
-- ROOT CAUSE: custom.validate_value_envelope exempts a retired Field's envelope only when the Field
-- names a custom Table (entity_definition_id); a standard table's Fields carry table_token, so an
-- archived standard Field's envelope looked like provenance for a Field that never existed.
-- Production (read-only, 2026-10-03): 1 archived standard Field, 0 rows holding its value — no row
-- is blocked there today; every archive from now on would have blocked its rows.
--
--   1. custom.validate_value_envelope  a retired Field of a standard table is known by its token
--   2. custom._entity_custom_fields_guard  an archived Field's value and envelope are carried untouched on
--      every write; changing or clearing one — or editing its stored history — is refused, for every
--      writer, in one sentence that names the way back (restore from Trash)
--   3. custom.entity_read_mask  for an edit, an archived Field passes the door so the guard's true
--      sentence is what a person reads (never "has no field called …")
--   4. custom.field_restore  (the door Trash uses) brings a standard table's archived field back, at the
--      owner/admin rung that archived it — so the sentence's way back is real
--   5. custom._field_shape_guard + 6. custom._field_document_for  a standard table refuses a worked-out
--      field (formula, lookup, rollup, count, record number, time stamp) on every declare door, in field
--      words, before any formula is parsed

CREATE OR REPLACE FUNCTION custom.validate_value_envelope(p_organization_id uuid, p_fields custom.record[], p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_keys  text[];
  v_key   text;
  v_alt   jsonb;
  v_table text;
  v_token text;   -- LANE7-SEC-ARCHIVE: a standard table's Fields carry its registry token instead
  f       custom.record;
begin
  if coalesce(jsonb_typeof(p_data -> '_values'), '') <> 'object' then
    return;
  end if;
  select array_agg(x.data ->> 'key') into v_keys from unnest(p_fields) x;
  select min(x.data ->> 'entity_definition_id') into v_table from unnest(p_fields) x;
  select min(x.data ->> 'table_token') into v_token from unnest(p_fields) x;

  for v_key in select k from jsonb_object_keys(p_data -> '_values') k loop
    if not (v_key = any (coalesce(v_keys, array[]::text[]))) then
      -- A RETIRED Field of this table: its envelope is the column's history, kept, never judged.
      -- LANE7-SEC-ARCHIVE: the same for a standard table, whose Fields name it by token.
      if (v_table is not null or v_token is not null) and exists (
           select 1 from custom.record r
            where r.organization_id = p_organization_id
              and r.table_id = custom.field_kernel_id()
              and r.deleted_at is not null
              and (r.data ->> 'entity_definition_id' = v_table or r.data ->> 'table_token' = v_token)
              and r.data ->> 'key' = v_key) then
        continue;
      end if;
      raise exception 'This record carries where "%" came from, and this table has no field called "%". Provenance nobody can read is worse than none.', v_key, v_key
        using errcode = '23514', hint = 'VAL-1: every value envelope belongs to a declared Field of this table.';
    end if;
    -- VAL-3: an alternate is a candidate for the SAME field, so it is the same kind of
    -- value. An alternate nobody could promote is not an alternate.
    -- `select * into`, never `select x into`: `unnest()` over an array of a composite type
    -- EXPANDS it into columns, so `x` is the whole row and plpgsql would assign it to the
    -- first field — `id uuid` — and refuse the composite's text as a uuid.
    select * into f from unnest(p_fields) x where x.data ->> 'key' = v_key limit 1;
    for v_alt in select value from jsonb_array_elements(
                   coalesce(p_data -> '_values' -> v_key -> 'alternates', '[]'::jsonb)) loop
      if jsonb_typeof(v_alt -> 'value') is not null and jsonb_typeof(v_alt -> 'value') <> 'null' then
        perform custom.validate_values(p_organization_id, array[f],
                                       jsonb_build_object(v_key, v_alt -> 'value'), null);
      end if;
    end loop;
  end loop;
end;
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
  v_row     jsonb;
  -- LANE7-SEC: the person this write is for, and the field rule asked of it.
  v_me       uuid := auth.uid();
  v_bad      text[];
  v_list     text;
  v_label    text;
  v_sess     text;
  v_decl     text;
  v_needs    text;
  v_closed   boolean;
  v_declared text[];
  v_f        custom.record;
  v_ok       text;
  v_admin    text;
  v_hdr      text;
  v_arch     jsonb;   -- LANE7-SEC-ARCHIVE: this token's archived Fields, key -> label
begin
  -- WRITE-PERF-4: `to_jsonb(new)` ONCE. This serialised the whole row twice (three times on
  -- an UPDATE) to read two keys out of it; on a wide standard table that is the row's entire
  -- content, per row, on 643 tables.
  begin
    v_row := to_jsonb(new);
  exception when others then
    v_row := null;
  end;
  -- GUARD-SWITCH (2026-09-19), B1's move, unchanged. This used to read
  -- `custom/entity_custom_fields_guard`, which was false platform-wide with no rung that
  -- could turn any on, so a `custom_fields` document on a standard Entity table was never
  -- validated for anybody. It follows the organization's own store switch: an organization
  -- whose store is OFF answers byte for byte as it does today.
  begin
    v_org := v_row ->> 'organization_id';
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
  v_doc := v_row -> 'custom_fields';
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
  v_memo     := platform.memo_k_get(v_memo_key)::jsonb;
  if v_memo is null then
    select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) into v_memo
      from custom.record f
     where f.organization_id = v_org
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and f.data ->> 'table_token' = v_token;
    perform platform.memo_k_put(v_memo_key, v_memo::text);
  end if;
  select array_agg(q) into v_fields
    from jsonb_populate_recordset(null::custom.record, v_memo) q;

  -- `custom.validate_custom_fields`'s own body, character for character, with the read it
  -- would have repeated handed to it. The function itself is untouched: every other caller
  -- keeps it exactly as it is.
  if v_fields is not null then
    perform custom.validate_values(v_org, v_fields, coalesce(v_doc, '{}'::jsonb), null);
  end if;

  -- LANE7-SEC-ARCHIVE (2026-10-02). AN ARCHIVED FIELD'S VALUE IS CARRIED, NEVER A BLOCK. Archiving
  -- a Field keeps every value it holds so restoring it brings them back. Those values (and their
  -- envelopes under `_values`) ride along on every later write of the row untouched — the
  -- envelope check below knows a retired Field of a standard table by its token — and only a
  -- write that CHANGES or CLEARS one is refused, for every writer, in one sentence. Read once
  -- per statement.
  v_memo := platform.memo_k_get('scfa:' || v_org::text || ':' || v_token);
  if v_memo is null then
    select coalesce(jsonb_object_agg(f.data ->> 'key', coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key')), '{}'::jsonb)
      into v_arch
      from custom.record f
     where f.organization_id = v_org
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is not null
       and f.data ->> 'table_token' = v_token
       and f.data ->> 'key' is not null
       and not exists (select 1 from unnest(coalesce(v_fields, '{}'::custom.record[])) l
                        where l.data ->> 'key' = f.data ->> 'key');
    perform platform.memo_k_put('scfa:' || v_org::text || ':' || v_token, v_arch::text);
  else
    v_arch := v_memo;
  end if;
  if v_arch <> '{}'::jsonb then
    select string_agg(format('"%s"', v_arch ->> k), ', ' order by k) into v_list
      from jsonb_object_keys(v_arch) k
     where (v_old -> k) is distinct from (v_doc -> k)
        -- an edit of the archived value's stored history is an edit too; an envelope the write
        -- did not send at all is not, and is carried back below
        or (jsonb_typeof(v_doc -> '_values') = 'object' and (v_doc -> '_values') ? k
            and (v_old -> '_values' -> k) is distinct from (v_doc -> '_values' -> k));
    if v_list is not null then
      raise exception '% on this record is archived, so its value is kept as it was and nothing was written; restoring the field from Trash lets it change again.',
                      v_list
        using errcode = '23514',
              hint = 'LANE7-SEC-ARCHIVE: an archived field''s value is carried untouched; an owner or admin can restore the field from Trash.';
    end if;
  end if;

  -- LANE7-SEC (2026-10-02, round 1, CHAIR-SEC-R1). THE FIELD RULE, ON EVERY WRITE PATH.
  -- This door, entity_value_write, a direct supabase update, a server job and the service role
  -- all arrive here, and only when `custom_fields` actually changed (the no-change return above).
  -- Only a key THIS write added and the row did not already carry is judged: a legacy key stays
  -- editable, and clearing a key is always allowed. The store's own keys are named, never guessed
  -- by prefix: `_values` (each value's envelope), `_actor` and `_on_behalf_of` (read and removed
  -- below). A value's envelope under `_values` needs its Field too.
  --   · a CLIENT (custom.caller_role() authenticated / anon) on a table the organization's
  --     custom/closed_custom_field_tables knob names is refused, in a sentence, and nothing is written;
  --   · every other writer keeps the key, and a NOTICE names it — never silent.
  select coalesce(array_agg(f.data ->> 'key'), '{}'::text[]) into v_declared
    from unnest(coalesce(v_fields, '{}'::custom.record[])) f;
  select coalesce(array_agg(distinct k order by k), '{}'::text[]) into v_bad
    from (select k from jsonb_object_keys(v_doc) k
           where k <> all (array['_values', '_actor', '_on_behalf_of'])
             and not (v_old ? k)
          union all
          select k from jsonb_object_keys(case when jsonb_typeof(v_doc -> '_values') = 'object'
                                               then v_doc -> '_values' else '{}'::jsonb end) k
           where not coalesce((v_old -> '_values') ? k, false)) c
   where not (k = any (v_declared));
  if cardinality(v_bad) > 0 then
    v_memo := platform.memo_k_get('sccl:' || v_org::text || ':' || v_token);
    if v_memo is null then
      begin
        v_closed := coalesce(platform.knob_resolve('custom', 'closed_custom_field_tables', v_org) ? v_token, false);
      exception when others then
        v_closed := true;   -- a shape rule this writer cannot read is closed for a client, never open
      end;
      perform platform.memo_k_put('sccl:' || v_org::text || ':' || v_token, to_jsonb(v_closed)::text);
    else
      v_closed := (v_memo #>> '{}')::boolean;
    end if;
    select e.label into v_label from custom.entity_table(v_token) e;
    select string_agg(format('"%s"', x), ', ' order by x) into v_list from unnest(v_bad) x;
    if v_closed and coalesce(custom.caller_role()::text, '') in ('authenticated', 'anon') then
      if exists (select 1 from unnest(v_bad) x where left(x, 1) = '_') then
        raise exception '% keeps its own bookkeeping only under "_values", "_actor" and "_on_behalf_of", so % cannot be stored and nothing was written.',
                        coalesce(v_label, v_token), v_list
          using errcode = '23514',
                hint = 'LANE7-SEC: a key that starts with _ is the store''s own; name a value by its field''s key.';
      end if;
      raise exception '% has no field called %, so there is nowhere to keep %; adding a field is an owner''s or an admin''s to do.',
                      coalesce(v_label, v_token), v_list,
                      case when cardinality(v_bad) = 1 then 'that value' else 'those values' end
        using errcode = '23514',
              hint = 'REC-1 / REC-51: a value with no field is a value nobody will ever see. Declare the field first (custom.entity_field_declare). Nothing was written.';
    end if;
    raise notice '% has no field called %; kept as written, and no field shows it until one is declared.',
                 coalesce(v_label, v_token), v_list
      using hint = 'LANE7-SEC: custom._entity_custom_fields_guard keeps an undeclared key from the platform''s own writers and on open tables.';
  end if;

  -- (c) A PERSON CHANGES ONLY THE FIELDS SHE MAY EDIT (DOOR-3), asked through the same
  --     iam.may_touch_field a custom table's custom._field_write_door asks. The UPDATE reaching
  --     this trigger proves `editor`, so that rung is asked first and remembered per Field for
  --     the statement; only a Field `editor` may not change asks whether this person is an
  --     admin here (the organization's, remembered per statement, or this row's share).
  --     Creating a row is not editing somebody else's field, exactly as on a custom table.
  if v_me is not null and v_fields is not null
     and not (tg_op = 'INSERT' and (v_row ->> 'created_by') is not distinct from v_me::text) then
    v_bad := '{}'::text[];
    foreach v_f in array v_fields loop
      v_key := v_f.data ->> 'key';
      continue when v_key is null or (v_old -> v_key) is not distinct from (v_doc -> v_key);
      v_ok := platform.memo_k_get('mtf:' || v_f.id::text || ':editor');
      if v_ok is null then
        v_ok := iam.may_touch_field(v_me, v_f.id, v_org, 'editor'::public.permission_level, 'edit')::text;
        perform platform.memo_k_put('mtf:' || v_f.id::text || ':editor', v_ok);
      end if;
      continue when v_ok = 'true';
      v_admin := platform.memo_k_get('oadm:' || v_org::text);
      if v_admin is null then
        v_admin := coalesce(iam.has_org_admin(v_org), false)::text;
        perform platform.memo_k_put('oadm:' || v_org::text, v_admin);
      end if;
      if v_admin = 'false' then
        begin
          v_admin := coalesce(iam.has_access(v_token, (v_row ->> 'id')::uuid, 'admin'::public.permission_level), false)::text;
        exception when others then
          v_admin := 'false';
        end;
      end if;
      if v_admin = 'true' then
        v_ok := platform.memo_k_get('mtf:' || v_f.id::text || ':admin');
        if v_ok is null then
          v_ok := iam.may_touch_field(v_me, v_f.id, v_org, 'admin'::public.permission_level, 'edit')::text;
          perform platform.memo_k_put('mtf:' || v_f.id::text || ':admin', v_ok);
        end if;
        continue when v_ok = 'true';
      end if;
      v_bad := v_bad || coalesce(nullif(v_f.data ->> 'label', ''), v_key);
      v_needs := coalesce(v_needs, iam.level_label('record',
                   iam.field_sensitivity_level(v_f.data ->> 'sensitivity', 'edit', v_org)));
    end loop;
    if cardinality(v_bad) > 0 then
      select e.label into v_label from custom.entity_table(v_token) e;
      select string_agg(format('"%s"', x), ', ' order by x) into v_list from unnest(v_bad) x;
      raise exception 'You can see this %, but % % not yours to change; that takes % access or a share of %, so nothing was written.',
                      coalesce(v_label, v_token), v_list,
                      case when cardinality(v_bad) = 1 then 'is' else 'are' end, v_needs,
                      case when cardinality(v_bad) = 1 then 'that one field' else 'each field' end
        using errcode = '42501',
              hint = 'DOOR-3: the store refuses an edit to a field you may not edit, whichever door you came through.';
    end if;
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
  -- LANE7-SEC: FOR A PERSON'S SESSION THE AUTHOR IS THE SESSION'S, never the payload's. The
  -- session's word is read the way platform.declared_actor_tier() reads it — the connection's
  -- GUC first, then, for a signed-in client, its x-matrx-actor-tier header (agent / system),
  -- otherwise a person. That function asks `current_user`, which a SECURITY DEFINER trigger
  -- has already rewritten, so the client arm is asked here with custom.caller_role() — the
  -- role the request actually held — and the same accepted words and canonical spelling.
  -- A payload may say nothing, repeat the session's word, or narrow a person's own write to
  -- "her agent"; an agent acts only for the person whose session it is. A write with no
  -- person behind it is the store's own housekeeping and keeps both payload arms.
  if v_me is not null then
    v_sess := platform.declared_actor_tier();
    if v_sess is null and custom.caller_role() = 'authenticated' then
      begin
        v_hdr := nullif(lower(btrim((nullif(current_setting('request.headers', true), '')::json) ->> 'x-matrx-actor-tier')), '');
      exception when others then
        v_hdr := null;
      end;
      v_sess := case when v_hdr in ('agent', 'system', 'ai', 'code')
                     then platform.canonical_actor_tier(v_hdr) else 'user' end;
    end if;
    v_sess  := custom.actor_word(v_sess);
    v_decl  := nullif(btrim(coalesce(v_doc ->> '_actor', '')), '');
    v_actor := case when v_decl is null then v_sess else custom.actor_word(v_decl) end;
    if v_actor <> v_sess and not (v_sess = 'user' and v_actor = 'agent') then
      raise exception 'This write says it was made by "%", and the session making it is "%"; who changed a value comes from the session, so nothing was written.', v_actor, v_sess
        using errcode = '42501',
              hint = 'VAL-2: leave "_actor" out and the store records the session''s own author.';
    end if;
    v_obo := nullif(btrim(coalesce(v_doc ->> '_on_behalf_of', '')), '');
    if v_actor = 'agent' then
      if v_obo is not null and v_obo <> v_me::text then
        raise exception 'This write says its agent acts for somebody else, and an agent acts only for the person whose session it is; nothing was written.'
          using errcode = '42501',
                hint = 'VAL-2: leave "_on_behalf_of" out and the store records the signed-in person.';
      end if;
      v_obo := v_me::text;
    end if;
  else
    v_actor := custom.actor_word(v_doc ->> '_actor');
    v_obo   := nullif(btrim(coalesce(v_doc ->> '_on_behalf_of', '')), '');
  end if;
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
  -- LANE7-SEC-ARCHIVE: an archived Field's envelope is carried exactly as it was, never restamped.
  if v_arch <> '{}'::jsonb and jsonb_typeof(v_doc -> '_values') = 'object' then
    select jsonb_set(v_doc, '{_values}',
             (v_doc -> '_values')
             || coalesce((select jsonb_object_agg(k, v_old -> '_values' -> k)
                            from jsonb_object_keys(v_arch) k
                           where (v_old -> '_values') ? k), '{}'::jsonb))
      into v_doc;
  end if;

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

CREATE OR REPLACE FUNCTION custom._field_shape_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_names_bad text;   -- SC-R: the kinds an entity reference names that no record may point at
  d           jsonb := new.data;
  v_type      text;
  v_key       text;
  v_label     text;
  v_edef      uuid;
  v_token     text;
  v_opts      uuid;
  v_display   text;
  v_source    text;
  v_names     text[];
  v_rule      jsonb;
  v_kind      text;
  v_example   text;
  v_archived  text;   -- UI-FIX-19: the name of an archived choices table
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

  -- Only field definitions. A `kernel` row is the kernel Table `Field` itself (REC-27:
  -- defined in code, not data) and is exempt, exactly as W1-TABLE exempts the kernel Tables.
  if new.table_id is distinct from custom.field_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;

  v_label := nullif(d ->> 'label', '');
  v_key   := d ->> 'key';
  if v_key is null or v_key !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'a field needs a key made of lower-case letters, digits and underscores, and this one says %',
                    custom.said(v_key, 'nothing')
      using errcode = '23514', hint = 'FLD-13: key.';
  end if;
  if v_label is null then
    raise exception 'the field % needs a label - it is what a person reads', v_key
      using errcode = '23514', hint = 'FLD-13: label.';
  end if;

  -- FLD-8 / FLD-13: ONE definitions surface for standard and custom tables alike. Exactly
  -- one of the two identifiers, never both and never neither — which is what makes it one
  -- surface rather than two tables sharing a name.
  v_edef  := nullif(d ->> 'entity_definition_id', '')::uuid;
  v_token := nullif(d ->> 'table_token', '');
  if (v_edef is null) = (v_token is null) then
    raise exception 'the field % has to say what it is a field OF - a custom table or a standard one, and exactly one of them',
                    v_label
      using errcode = '23514',
            hint = 'FLD-8 / FLD-13: entity_definition_id names a custom Table record; table_token names a standard table''s registry token. One definitions table holds both, so exactly one of the two is set.';
  end if;
  if v_token is not null
     and not exists (select 1 from platform.entity_types e
                      where e.token = v_token and e.is_active) then
    raise exception 'the field % says it belongs to a standard table called %, and no such table is registered',
                    v_label, v_token
      using errcode = '23514', hint = 'FLD-8: table_token names a live platform.entity_types token.';
  end if;

  -- LANE7-SEC (2026-10-02): A PROMISE THE STORE CANNOT KEEP IS REFUSED. A standard table's
  -- custom values live in the row's own `custom_fields` column, which every member who can
  -- read the row can SELECT directly (638 of 673 tables), so the masking the doors apply cannot
  -- make a confidential or restricted value secret there. Until protected values have their
  -- own storage, a Field on a standard table is never made more sensitive than internal.
  -- Fields of custom tables are unaffected: their values are only ever served by the doors.
  if v_token is not null
     and custom.sensitivity_rank(coalesce(d ->> 'sensitivity', 'internal')) > custom.sensitivity_rank('internal')
     and (tg_op = 'INSERT'
          or coalesce(old.data ->> 'sensitivity', 'internal') is distinct from coalesce(d ->> 'sensitivity', 'internal')) then
    raise exception 'A field on a standard table cannot be % yet, because its values sit in the row where every member can read them; keep "%" internal or public, or add it to a custom table instead.',
                    d ->> 'sensitivity', v_label
      using errcode = '23514',
            hint = 'LANE7-SEC: protected values on standard rows need their own storage first. Nothing was written.';
  end if;

  -- LANE7-SEC-ARCHIVE (2026-10-02): A STANDARD TABLE TAKES NO WORKED-OUT FIELD YET. A formula,
  -- lookup, rollup, count, record number or created/updated stamp is worked out by the store's
  -- record doors, which a standard row never passes through, so it would show nothing. Declaring
  -- one, turning a field into one, or bringing an archived one back is refused, in "field" words.
  if v_token is not null
     and coalesce(d ->> 'type', '') = 'formula'
     and (tg_op = 'INSERT'
          or coalesce(old.data ->> 'type', '') <> 'formula'
          or (old.deleted_at is not null and new.deleted_at is null)) then
    raise exception 'A field on a standard table cannot be worked out from other values yet, so "%" cannot be a formula, lookup, rollup, count, record number or time stamp here; add it to a custom table instead.',
                    v_label
      using errcode = '23514',
            hint = 'LANE7-SEC-ARCHIVE: worked-out fields run only through the store''s record doors. Nothing was written.';
  end if;

  -- FLD-1: exactly ONE behavior, from a CLOSED set. An array is refused by name, so
  -- "exactly one" is unrepresentable rather than merely unwritten.
  if jsonb_typeof(d -> 'type') = 'array' then
    raise exception 'the field % has more than one behavior, and a field has exactly one', v_label
      using errcode = '23514',
            hint = 'FLD-1: one of list, range, text, relation, formula, boolean. What looks like a second behavior is a modifier (FLD-2) or a Rule (FLD-3).';
  end if;
  v_type := d ->> 'type';
  -- LIMITS-FIX 2026-09-21: `boolean` joins the closed set. It is a BEHAVIOUR and not a
  -- format on something else, because a tick box has THREE answers — ticked, unticked, and
  -- nobody has said — and only a behaviour of its own can hold a real boolean while an
  -- absent key keeps meaning "never asked" (VAL-2).
  if v_type is null or v_type not in ('list', 'range', 'text', 'relation', 'formula', 'boolean') then
    raise exception 'the field % says its behavior is %, and a field behaves as a list, a range, text, a relation, a formula or a tick box',
                    v_label, custom.said(v_type, 'nothing')
      using errcode = '23514', hint = 'FLD-1: the set is closed.';
  end if;

  -- FLD-2: modifiers are SEPARATE from behavior. Three distinct stored keys.
  if jsonb_typeof(d -> 'multi') is distinct from 'boolean' then
    raise exception 'the field % has to say whether it holds one value or many', v_label
      using errcode = '23514', hint = 'FLD-2: multi is a modifier, never a behavior of its own.';
  end if;
  if jsonb_typeof(d -> 'dated') is distinct from 'boolean' then
    raise exception 'the field % has to say whether its values are dated', v_label
      using errcode = '23514', hint = 'FLD-2: dated is a modifier, never a behavior of its own.';
  end if;
  if jsonb_typeof(d -> 'rules') is distinct from 'array' then
    raise exception 'the field % has to carry its rules as a list, even an empty one', v_label
      using errcode = '23514', hint = 'FLD-2 / FLD-3: any number of attached validation Rules.';
  end if;

  -- FLD-3: a constraint is a Rule, not a behavior — and not a config key either. This is
  -- the only shape in which the law can actually be broken, so it is the shape refused.
  for v_rule in select r from jsonb_array_elements(d -> 'rules') r loop
    v_kind := v_rule ->> 'kind';
    -- STORE-T / B1: `unique` joins the set. It is not judged here — a shape guard sees one
    -- row and uniqueness is a statement about the OTHERS — it is carried out by
    -- custom._unique_rule_holds, which is a trigger and can take the lock that makes it true
    -- under concurrency. A kind this store cannot execute is still refused by name.
    if v_kind is null or v_kind not in ('min', 'max', 'pattern', 'length', 'equals_field', 'differs_from_field', 'unique') then
      raise exception 'the field % carries a rule of kind %, which this validator cannot execute',
                      v_label, custom.said(v_kind, 'nothing')
        using errcode = '23514',
              hint = 'FLD-3: an attached validation Rule declares its kind. The general Rule object, its versions and its four uses are W1-RULE''s (REC-15, REC-17, REC-19).';
    end if;

    -- ── STORE-RULE-GAPS (1), 2026-09-23: A PATTERN SAYS HOW TO WRITE IT. ─────────────────
    -- The older grid's `patternHint`: "949-555-0142" beside a phone pattern, so a person who is
    -- refused is shown the shape rather than told only that theirs is wrong. It belongs to the
    -- pattern Rule (it is an example OF that pattern), it is judged here once, and an example
    -- that its own pattern would refuse is refused - a hint that is wrong is worse than none.
    if v_rule ? 'example' and jsonb_typeof(v_rule -> 'example') <> 'null' then
      if v_kind <> 'pattern' then
        raise exception 'the field % shows an example on its % rule, and only a pattern rule has an example to show',
                        v_label, v_kind
          using errcode = '23514',
                hint = 'FLD-3: example belongs to a pattern Rule - {"kind":"pattern","value":"<pattern>","example":"<how a person writes it>"}.';
      end if;
      v_example := case when jsonb_typeof(v_rule -> 'example') = 'string' then btrim(v_rule ->> 'example') end;
      if v_example is null or v_example = '' then
        raise exception 'the field % gives an example of how to write it, and an example is the words a person would type',
                        v_label
          using errcode = '23514', hint = 'FLD-3: example is a short piece of text, like 949-555-0142.';
      end if;
      if length(v_example) > 120 then
        raise exception 'the field % gives an example that is % characters long, and an example is at most 120',
                        v_label, length(v_example)
          using errcode = '23514', hint = 'FLD-3: an example shows the shape of one value, not a paragraph about it.';
      end if;
      if v_example !~ (v_rule ->> 'value') then
        raise exception 'the field % shows "%" as the way to write it, and its own pattern would refuse that',
                        v_label, v_example
          using errcode = '23514',
                hint = 'FLD-3: the example has to pass the pattern it illustrates. Change the example, or the pattern.';
      end if;
    end if;

    -- ── STORE-RULE-GAPS (3), 2026-09-23: A LENGTH HAS A SHORTEST AS WELL AS A LONGEST. ──
    -- The older grid's `minLength`. `value` stays the longest (every stored rule already means
    -- that), `min` is the shortest, and a length rule says at least one of the two. Both are
    -- whole numbers of characters; a shortest past the longest could never be met.
    if v_rule ? 'min' and jsonb_typeof(v_rule -> 'min') <> 'null' and v_kind <> 'length' then
      raise exception 'the field % gives its % rule a shortest length, and only a length rule has one',
                      v_label, v_kind
        using errcode = '23514',
              hint = 'FLD-3: {"kind":"length","min":<shortest>,"value":<longest>} - min is the fewest characters, value the most.';
    end if;
    if v_kind = 'length' then
      if coalesce(v_rule ->> 'value', '') = '' and coalesce(v_rule ->> 'min', '') = '' then
        raise exception 'the field % has a length rule that says neither how short nor how long a value may be',
                        v_label
          using errcode = '23514',
                hint = 'FLD-3: a length rule carries min (the fewest characters), value (the most), or both.';
      end if;
      if coalesce(v_rule ->> 'value', '') <> '' and (v_rule ->> 'value') !~ '^[0-9]+$' then
        raise exception 'the field % says a value may be at most % characters long, and that is not a whole number',
                        v_label, v_rule ->> 'value'
          using errcode = '23514', hint = 'FLD-3: value is the most characters, as a whole number.';
      end if;
      if coalesce(v_rule ->> 'min', '') <> '' and (v_rule ->> 'min') !~ '^[0-9]+$' then
        raise exception 'the field % says a value has to be at least % characters long, and that is not a whole number',
                        v_label, v_rule ->> 'min'
          using errcode = '23514', hint = 'FLD-3: min is the fewest characters, as a whole number.';
      end if;
      if coalesce(v_rule ->> 'value', '') <> '' and coalesce(v_rule ->> 'min', '') <> ''
         and (v_rule ->> 'min')::bigint > (v_rule ->> 'value')::bigint then
        raise exception 'the field % has to be at least % characters and at most %, and nothing is both',
                        v_label, v_rule ->> 'min', v_rule ->> 'value'
          using errcode = '23514', hint = 'FLD-3: the shortest length cannot be more than the longest.';
      end if;
    end if;
  end loop;
  if d -> 'config' ?| array['min', 'max', 'pattern', 'length', 'required_if', 'validation', 'constraint'] then
    raise exception 'the field % writes a constraint into its behavior, and a constraint is a Rule', v_label
      using errcode = '23514',
            hint = 'FLD-3: move it into rules, where it is an attached validation Rule with a kind.';
  end if;

  -- FLD-N-1: unit and format change what a value MEANS, so they live on the Field and reach
  -- the agent''s context. Only layout, colour and conditional formatting are presentation —
  -- and a presentation blob carrying either is the one way this law actually fails.
  if d -> 'presentation' ?| array['unit', 'format'] then
    raise exception 'the field % puts its unit or its format in presentation, and those change what the value MEANS',
                    v_label
      using errcode = '23514',
            hint = 'FLD-N-1: unit and format are the Field''s own columns and reach the agent''s context; presentation carries layout, colour and conditional formatting.';
  end if;
  if d ? 'unit' and jsonb_typeof(d -> 'unit') not in ('string', 'null') then
    raise exception 'the field % has to say its unit as a word', v_label
      using errcode = '23514', hint = 'FLD-N-1: unit.';
  end if;
  if d ? 'format' and jsonb_typeof(d -> 'format') not in ('string', 'null') then
    raise exception 'the field % has to say its format as a word', v_label
      using errcode = '23514', hint = 'FLD-N-1: format.';
  end if;

  -- FLD-7: where the value comes from.
  v_source := d ->> 'source';
  if v_source is null or v_source not in ('manual', 'formula', 'agent', 'synced') then
    raise exception 'the field % says its values come from %, and a field is filled in by hand, computed, written by an agent, or synced from somewhere else',
                    v_label, custom.said(v_source, 'nothing')
      using errcode = '23514', hint = 'FLD-7: manual, formula, agent, synced.';
  end if;

  -- FLD-9: a Formula declares whether it computes on read or on write — and only a formula
  -- may declare it, or the choice stops meaning anything.
  if v_type = 'formula' or v_source = 'formula' then
    if coalesce(d ->> 'compute_on', '') not in ('read', 'write') then
      raise exception 'the formula % has to say whether it works out its answer when somebody reads it or when somebody saves',
                      v_label
        using errcode = '23514', hint = 'FLD-9: compute_on is read or write.';
    end if;
  elsif d ? 'compute_on' and jsonb_typeof(d -> 'compute_on') <> 'null' then
    raise exception 'the field % is not a formula, so it has nothing to work out', v_label
      using errcode = '23514', hint = 'FLD-9: compute_on belongs to a formula and to nothing else.';
  end if;

  -- FLD-5 / FLD-6: a list field''s options are the records of a Table with display: list.
  if v_type = 'list' then
    v_opts := nullif(d -> 'config' ->> 'options_table_id', '')::uuid;
    if v_opts is null then
      raise exception 'the list field % has to say which table its choices come from', v_label
        using errcode = '23514',
              hint = 'FLD-5 / FLD-6: every pick-list is already a Table, so a list field names one rather than carrying an enum.';
    end if;
    select t.data ->> 'display' into v_display
      from custom.record t
     where t.organization_id = new.organization_id
       and t.id = v_opts
       and t.table_id = custom.table_kernel_id()
       and t.deleted_at is null;
    if v_display is null then
      -- UI-FIX-19 (VERIFIER-19 #4): A CHOICES TABLE THAT IS ARCHIVED IS NAMED, WITH ITS WAY BACK.
      -- Rooms and its Status choices were archived separately; bringing Rooms back refused with
      -- "points at something that is not a table of this organization", which is false (it is
      -- this organization's table, only archived) and names no fix. Now the refusal names the
      -- archived table and says to bring it back first.
      select coalesce(nullif(btrim(t.data ->> 'name'), ''), 'its choices table') into v_archived
        from custom.record t
       where t.organization_id = new.organization_id
         and t.id = v_opts
         and t.table_id = custom.table_kernel_id()
         and t.deleted_at is not null;
      if v_archived is not null then
        raise exception 'the list field % takes its choices from "%", which is archived - bring "%" back first, then bring this back', v_label, v_archived, v_archived
          using errcode = '23514',
                hint = 'FLD-5: a list field''s choices come from a live Table. "Bring it back" on the archived choices table, in the organization''s archive, restores it.';
      end if;
      raise exception 'the list field % points at something that is not a table of this organization', v_label
        using errcode = '23514', hint = 'FLD-5: options_table_id names a Table record.';
    end if;
    if v_display <> 'list' then
      raise exception 'the list field % takes its choices from a table that shows its records as a page, not as a list',
                      v_label
        using errcode = '23514',
              hint = 'FLD-5: a category is a Record of a Table with display: list. A table that grew up (T4) keeps serving the fields that already point at it — this refusal is about DECLARING a new one.';
    end if;
  elsif d -> 'config' ? 'options_table_id' then
    raise exception 'the field % is not a list, so it has no choices to take from a table', v_label
      using errcode = '23514', hint = 'FLD-1 / FLD-5.';
  end if;

  -- ── STORE-RULE-GAPS (2), 2026-09-23: A CHOICE LIST MAY TAKE OTHER VALUES. ───────────────
  -- The older grid's `allowOther`, as the column's own setting: when it is on, a value that is
  -- none of the choices is ADDED to the list as it was typed (custom._resolve_choice_words)
  -- instead of refused. Absent means off, which is what every column declared before today
  -- means. It is a list's setting and nothing else's.
  if d -> 'config' ? 'allow_other' and jsonb_typeof(d -> 'config' -> 'allow_other') <> 'null' then
    if jsonb_typeof(d -> 'config' -> 'allow_other') <> 'boolean' then
      raise exception 'the field % has to say whether it takes values that are not one of its choices as yes or no, and it says %',
                      v_label, d -> 'config' ->> 'allow_other'
        using errcode = '23514', hint = 'FLD-5: allow_other is true or false.';
    end if;
    if v_type <> 'list' then
      raise exception 'the field % is not a choice list, so there is no list for other values to join', v_label
        using errcode = '23514', hint = 'FLD-5: allow_other belongs to a list field.';
    end if;
  end if;

  -- FLD-12 / FLD-13: the relation properties, and they belong to a relation.
  if v_type = 'relation' then
    -- SC-R / P12: an ENTITY REFERENCE says what it points at with config.allowed_types — the
    -- platform kinds it may name — and target mode `any` (REL-8), instead of one Table. Every
    -- kind it names is one custom.entity_reference_kinds() lists, and it names no Table too.
    if jsonb_typeof(d -> 'config' -> 'allowed_types') = 'array' then
      if jsonb_array_length(d -> 'config' -> 'allowed_types') = 0 then
        raise exception 'the field % points at things on the platform and names no kind of thing', v_label
          using errcode = '23514', hint = 'SC-R / P12: config.allowed_types lists the kinds, from custom.entity_reference_kinds().';
      end if;
      if coalesce(d -> 'config' ->> 'target_mode', '') <> 'any' then
        raise exception 'the field % points at things on the platform, so its target mode is any', v_label
          using errcode = '23514', hint = 'SC-R / P12 / REL-8: an entity reference is polymorphic; config.allowed_types is what restricts it.';
      end if;
      if nullif(d ->> 'relation_target', '') is not null then
        raise exception 'the field % points at things on the platform, so it names no Table as well', v_label
          using errcode = '23514', hint = 'SC-R / P12: a column points at the records of a Table (relation_target) or at platform things (config.allowed_types), never both.';
      end if;
      select string_agg(x #>> '{}', ', ' order by x #>> '{}') into v_names_bad
        from jsonb_array_elements(d -> 'config' -> 'allowed_types') x
       where jsonb_typeof(x) <> 'string'
          or not exists (select 1 from custom.entity_reference_kinds() k where k.token = x #>> '{}');
      if v_names_bad is not null then
        raise exception 'the field % points at %, and a record cannot point at that kind of thing', v_label, v_names_bad
          using errcode = '23514',
                hint = case when v_names_bad ~ '(^|, )(file)(,|$)'
                            then 'SC-R / P12: a file is a File column (an attachment — a relation to the kernel File Table), not an entity reference. The kinds are custom.entity_reference_kinds().'
                            when v_names_bad ~ '(^|, )(user|person|user_profile)(,|$)'
                            then 'SC-R / P12: a person is a Person column (a relation to the kernel Person Table), not an entity reference. The kinds are custom.entity_reference_kinds().'
                            else 'SC-R / P12: the kinds a record may point at are custom.entity_reference_kinds(). Nothing was written.' end;
      end if;
    elsif nullif(d ->> 'relation_target', '') is null then
      raise exception 'the relation field % has to say what it points at', v_label
        using errcode = '23514', hint = 'FLD-13: relation_target.';
    end if;
    if coalesce((d ->> 'relation_max')::integer, 0) < 1 then
      raise exception 'the relation field % has to say how many things it can point at, and it is at least one',
                      v_label
        using errcode = '23514', hint = 'FLD-13: relation_max, where 1 is a foreign key.';
    end if;
    if coalesce(d ->> 'on_target_delete', '') not in ('cascade', 'set_null', 'restrict') then
      raise exception 'the relation field % has to say what happens to it when the thing it points at is deleted',
                      v_label
        using errcode = '23514', hint = 'FLD-13: on_target_delete is cascade, set_null or restrict.';
    end if;
  elsif d ?| array['relation_target', 'relation_max', 'on_target_delete', 'inverse_key']
        and (nullif(d ->> 'relation_target', '') is not null
             or nullif(d ->> 'relation_max', '') is not null
             or nullif(d ->> 'on_target_delete', '') is not null
             or nullif(d ->> 'inverse_key', '') is not null) then
    raise exception 'the field % is not a relation, so it has no relation properties', v_label
      using errcode = '23514', hint = 'FLD-13: relation_target, relation_max, on_target_delete and inverse_key belong to a relation.';
  end if;

  -- FLD-12: the four properties the live system declares and enforces nowhere.
  if coalesce(d ->> 'sensitivity', '') not in ('public', 'internal', 'confidential', 'restricted') then
    raise exception 'the field % has to say how sensitive its values are, and it says %',
                    v_label, custom.said(d ->> 'sensitivity', 'nothing')
      using errcode = '23514', hint = 'FLD-12: sensitivity is public, internal, confidential or restricted.';
  end if;
  if coalesce(d ->> 'context_policy', '') not in ('include', 'summarize', 'exclude', 'on_request') then
    raise exception 'the field % has to say whether an agent may see its values, and it says %',
                    v_label, custom.said(d ->> 'context_policy', 'nothing')
      using errcode = '23514', hint = 'FLD-12: context_policy is include, summarize, exclude or on_request.';
  end if;
  if d ? 'review_interval_days' and jsonb_typeof(d -> 'review_interval_days') = 'number'
     and (d ->> 'review_interval_days')::numeric <= 0 then
    raise exception 'the field % says it is reviewed every % days, and a review interval is at least one day',
                    v_label, d ->> 'review_interval_days'
      using errcode = '23514', hint = 'FLD-12: review_interval_days.';
  end if;
  if jsonb_typeof(d -> 'depends_on') is distinct from 'array' then
    raise exception 'the field % has to list what it depends on, even when the list is empty', v_label
      using errcode = '23514', hint = 'FLD-12: depends_on.';
  end if;

  -- FLD-10: which record types this field applies to.
  if jsonb_typeof(d -> 'applies_to_types') is distinct from 'array' then
    raise exception 'the field % has to say which kinds of record it applies to, even when that is all of them',
                    v_label
      using errcode = '23514', hint = 'FLD-10: applies_to_types, empty meaning every kind.';
  end if;

  -- ONE SOURCE OF TRUTH, both ways. A custom Table declares WHICH fields it has (REC-1,
  -- W1-TABLE''s guard); this record declares WHAT one of them is. They can never disagree,
  -- because a definition for a field the Table never declared is refused here by name.
  -- DATA-V2-BASICS, 2026-09-27: A RETIRED COLUMN IS NOT DECLARED, BY DESIGN. Retiring a column takes
  -- its name off the Table's list, so any later write to the retired row (a press that points older
  -- tables at their copies, a carry, a restamp) was refused "the table does not declare a field called
  -- referral_source" — measured: Harbor Dental's Data tables press rolled back whole at 18:41 UTC over
  -- one column somebody added to a copy and removed again. The check is for columns that are LIVE.
  if v_edef is not null and new.deleted_at is null then
    select array_agg(f ->> 'name') into v_names
      from custom.record t, jsonb_array_elements(coalesce(t.data -> 'fields', '[]'::jsonb)) f
     where t.organization_id = new.organization_id
       and t.id = v_edef
       and t.table_id = custom.table_kernel_id()
       and t.deleted_at is null;
    if v_names is null then
      raise exception 'the field % says it belongs to a table this organization does not have', v_label
        using errcode = '23514', hint = 'FLD-8: entity_definition_id names a Table record of the same organization.';
    end if;
    if not (v_key = any (v_names)) then
      raise exception 'the table does not declare a field called % - declare it there first', v_key
        using errcode = '23514',
              hint = 'REC-1 / FLD-8: a Table declares its fields and custom.field defines them. A definition for a field the table never declared would be a second source of truth.';
    end if;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.entity_read_mask(p_organization_id uuid, p_token text, p_level permission_level, p_action text DEFAULT 'read'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me       uuid := auth.uid();
  f          custom.record;
  v_key      text;
  v_visible  text[] := '{}'::text[];
  v_declared text[] := '{}'::text[];
  v_notices  jsonb  := '{}'::jsonb;
  v_labels   jsonb  := '{}'::jsonb;
  v_ids      jsonb  := '{}'::jsonb;
  v_excluded text[];
begin
  perform custom.assert_entity_door(p_organization_id, 'custom.entity_read_mask');
  if p_action is null or p_action not in ('read', 'edit') then
    raise exception 'A field is read or edited, and this asks to %.', coalesce(p_action, 'nothing')
      using errcode = '22023';
  end if;

  for f in select * from custom.entity_fields(p_organization_id, p_token) loop
    v_key := f.data ->> 'key';
    continue when v_key is null;
    v_declared := v_declared || v_key;
    v_labels := v_labels || jsonb_build_object(v_key, coalesce(nullif(f.data ->> 'label', ''), v_key));
    v_ids    := v_ids    || jsonb_build_object(v_key, f.id::text);
    -- No reader or no rung narrows to nothing: iam.may_touch_field grants only what a
    -- per-person share of the Field grants on its own.
    if v_me is not null
       and iam.may_touch_field(v_me, f.id, p_organization_id, p_level, p_action) then
      v_visible := v_visible || v_key;
    else
      v_notices := v_notices || jsonb_build_object(v_key, custom.hidden_field_notice(f, p_action));
    end if;
  end loop;

  -- LANE7-SEC-ARCHIVE: for an EDIT, an archived Field of this token is passed through as declared
  -- and editable, so the door does not call it "no field" — the custom_fields guard every write
  -- reaches then refuses changing it in the one true sentence ("… is archived …").
  if p_action = 'edit' then
    select v_declared || coalesce(array_agg(a.k), '{}'::text[]),
           v_visible  || coalesce(array_agg(a.k), '{}'::text[])
      into v_declared, v_visible
      from (select distinct ar.data ->> 'key' as k
              from custom.record ar
             where ar.organization_id = p_organization_id
               and ar.table_id = custom.field_kernel_id()
               and ar.deleted_at is not null
               and ar.data ->> 'table_token' = p_token
               and ar.data ->> 'key' is not null
               and not ((ar.data ->> 'key') = any (v_declared))) a;
  end if;

  select coalesce(e.client_excluded_columns, '{}'::text[]) into v_excluded
    from platform.entity_types e where e.token = p_token;

  return jsonb_build_object(
    'token',    p_token,
    'level',    p_level,
    'action',   p_action,
    'visible',  to_jsonb(v_visible),
    'declared', to_jsonb(v_declared),
    'notices',  v_notices,
    'labels',   v_labels,
    'key_ids',  v_ids,
    'excluded', to_jsonb(coalesce(v_excluded, '{}'::text[])));
end
$function$;

CREATE OR REPLACE FUNCTION custom.field_restore(p_organization_id uuid, p_field_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- lane STORE-RESTORE-DOORS. THE UNDO OF custom.field_retire. A retirement takes a SET — the Field
-- and every Field of the same Table that works its answer out through it — in one statement, so the
-- set is every Field of this Table archived at this Field's own moment. It comes back whole: the
-- Table declares the columns again (custom.field_declare's order: the Table is told first), the
-- Field rows are live again, and the links custom.relation_edges_withdraw took out in the same
-- statement come back. THE VALUES NEVER LEFT: a retirement changes no record's document (the
-- undeclared-key guard judges only a key a write changes), so every record still holds what it held
-- under that column, and the column shows it again the moment it is back.
declare
  v_field  jsonb;
  v_table  uuid;
  v_at     timestamptz;
  v_spec   jsonb;
  v_going  uuid[];
  v_keys   text[];
  v_taken  text;
  v_edges  integer := 0;
  v_named  boolean := false;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.field_restore');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_restore');

  select r.data, nullif(r.data ->> 'entity_definition_id', '')::uuid, r.deleted_at
    into v_field, v_table, v_at
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_field_id
     and r.table_id = custom.field_kernel_id();
  if v_field is null then
    raise exception 'There is no such field in this organization, so nothing was brought back.'
      using errcode = '02000', hint = 'REC-29: organizations are hard walls.';
  end if;
  if v_at is null then
    raise exception 'The field "%" was not removed, so there was nothing to bring back.',
                    custom.said(v_field ->> 'label', v_field ->> 'key')
      using errcode = '02000', hint = 'REC-23: it is already here.';
  end if;
  -- LANE7-SEC-ARCHIVE (2026-10-03): A STANDARD TABLE'S FIELD COMES BACK FROM TRASH TOO. Its values
  -- never left the rows (the custom_fields guard carries them untouched while it is archived), so
  -- bringing the definition back is the whole restore. The rung is custom.entity_field_retire's:
  -- an owner or an admin of the organization. A field made since under the same key holds it.
  if v_table is null and nullif(v_field ->> 'table_token', '') is not null then
    if not (custom.query_is_store_owner() or iam.has_org_admin(p_organization_id)) then
      raise exception 'Bringing back "%" changes it for everybody in this organization, and that is an owner''s or an admin''s to do.',
                      custom.said(v_field ->> 'label', v_field ->> 'key')
        using errcode = '42501', hint = 'The same rung that archived it. Nothing was brought back.';
    end if;
    select string_agg(format('"%s"', custom.said(f.data ->> 'label', f.data ->> 'key')), ', ')
      into v_taken
      from custom.record f
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and f.data ->> 'table_token' = v_field ->> 'table_token'
       and f.data ->> 'key' = v_field ->> 'key';
    if v_taken is not null then
      raise exception 'This table has a field % again, so "%" cannot come back beside it.',
                      v_taken, custom.said(v_field ->> 'label', v_field ->> 'key')
        using errcode = '23505',
              hint = 'Two fields of one table cannot share a key. Rename or remove the newer one, then restore this one from Trash.';
    end if;
    update custom.record
       set deleted_at = null
     where organization_id = p_organization_id
       and id = p_field_id
       and table_id = custom.field_kernel_id()
       and deleted_at = v_at;
    raise notice '%', 'Brought back: 1 field with its values.';
    return true;
  end if;
  if v_table is null then
    raise exception 'The field "%" belongs to a standard table, and this door brings back a field of a table somebody made.',
                    custom.said(v_field ->> 'label', 'that one')
      using errcode = '23514', hint = 'FLD-8: a field on a standard table is part of that table''s own definition.';
  end if;

  select r.data into v_spec
    from custom.record r
   where r.organization_id = p_organization_id and r.id = v_table
     and r.table_id = custom.table_kernel_id() and r.deleted_at is null;
  if v_spec is null then
    raise exception 'The field "%" belongs to a table that is archived, so it cannot come back on its own.',
                    custom.said(v_field ->> 'label', v_field ->> 'key')
      using errcode = '23514',
            hint = 'Restore the table from Trash first. A field removed with its table comes back with it; a field removed before, from Trash once the table is back.';
  end if;

  -- The rung custom.field_retire climbs: admin on the Table.
  perform custom.assert_client_may_change(p_organization_id, v_table, 'custom.field_restore',
                                          'admin'::public.permission_level, 'table');

  -- THE SET THAT WENT TOGETHER: every Field of this Table retired in the same statement.
  select array_agg(f.id order by f.id), array_agg(f.data ->> 'key' order by f.id)
    into v_going, v_keys
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at = v_at
     and f.data ->> 'entity_definition_id' = v_table::text;

  -- A column made since under the same key holds that key now; two columns cannot share it.
  select string_agg(format('"%s"', custom.said(f.data ->> 'label', f.data ->> 'key')), ', ')
    into v_taken
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and f.data ->> 'entity_definition_id' = v_table::text
     and f.data ->> 'key' = any (v_keys);
  if v_taken is not null then
    raise exception 'This table has a field % again, so "%" cannot come back beside it.',
                    v_taken, custom.said(v_field ->> 'label', v_field ->> 'key')
      using errcode = '23505',
            hint = 'Two fields of one table cannot share a key. Rename or remove the newer one, then restore this one from Trash.';
  end if;

  -- The Table declares the columns first — the field guard refuses a definition for a column the
  -- Table does not declare (custom.field_declare tells the Table first for the same reason).
  update custom.record
     set data = jsonb_set(data, '{fields}',
                          coalesce(data -> 'fields', '[]'::jsonb)
                          || coalesce((select jsonb_agg(jsonb_build_object('name', k) order by o)
                                         from unnest(v_keys) with ordinality as u(k, o)
                                        where not exists (select 1
                                                            from jsonb_array_elements(coalesce(data -> 'fields', '[]'::jsonb)) x
                                                           where x ->> 'name' = k)), '[]'::jsonb)),
         updated_at = now(), version = version + 1
   where organization_id = p_organization_id and id = v_table
     and table_id = custom.table_kernel_id();

  update custom.record
     set deleted_at = null
   where organization_id = p_organization_id
     and id = any (v_going)
     and table_id = custom.field_kernel_id()
     and deleted_at = v_at;

  -- THE LINKS THE RETIREMENT TOOK: custom.relation_edges_withdraw tombstoned them in the same
  -- statement (deleted_at = that moment, no deleted_via — it is not a trashing). One the records
  -- have made again since is live already and is left as it is.
  if nullif(current_setting('app.actor_system', true), '') is null
     and coalesce(platform.declared_actor_tier(), platform.actor_tier()) in ('agent', 'system') then
    perform set_config('app.actor_system', 'custom.relations', true);
    v_named := true;
  end if;
  update platform.associations a
     set deleted_at = null
   where a.organization_id = p_organization_id
     and a.relation_field_id = any (v_going)
     and a.deleted_at = v_at
     and a.deleted_via_type is null
     and not exists (select 1 from platform.associations b
                      where b.organization_id = a.organization_id
                        and b.relation_field_id = a.relation_field_id
                        and b.source_type = a.source_type and b.source_id = a.source_id
                        and b.target_type = a.target_type and b.target_id = a.target_id
                        and b.role is not distinct from a.role
                        and b.deleted_at is null);
  get diagnostics v_edges = row_count;
  if v_named then
    perform set_config('app.actor_system', '', true);
  end if;

  raise notice '%', format('Brought back: %s field(s) with their values%s.',
    cardinality(v_going),
    case when v_edges > 0 then format(', and %s link(s) they made', v_edges) else '' end);
  return true;
end
$function$;

CREATE OR REPLACE FUNCTION custom._field_document_for(p_organization_id uuid, p_table_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d        jsonb;
  v_parity text := nullif(p_spec ->> 'parity_type', '');
  v_key    text := nullif(p_spec ->> 'key', '');
  -- ── LIMITS-FIX 2026-09-21: ONE WORD FOR WHAT A PERSON READS ON THE COLUMN. ──────────
  -- A table spec's inline field says `name` (`custom._table_shape_guard` demands it) and
  -- this door said `label`, so the same concept had two words one call apart and a caller
  -- that used the table's word was told "A field needs a name" while holding one. Real-data
  -- crew D hit this on 2026-09-21 declaring a podcast episode pipeline. Both words are read
  -- here; `label` still wins when a caller sends both, so no existing caller changes.
  v_label  text := coalesce(nullif(p_spec ->> 'label', ''), nullif(p_spec ->> 'name', ''));
  v_multi  boolean := coalesce((p_spec ->> 'multi')::boolean, false);
  v_config jsonb := coalesce(p_spec -> 'config', '{}'::jsonb);
  v_rules  jsonb := coalesce(p_spec -> 'rules', '[]'::jsonb);
  v_plain  text := coalesce(nullif(p_spec ->> 'plain', ''), 'text');
  v_alias  text := lower(btrim(coalesce(p_spec ->> 'type', '')));
  -- FIX-10B-F6: the caller said the word `signature`. It is one of the kinds
  -- `custom.field_kinds()` publishes and it is NOT a parity type — it is plain
  -- text wearing the one format `custom.doc_sign` accepts — so it is resolved
  -- here, beside the other words, and carried into the plain-text arm below.
  v_signature boolean := false;
  -- GRID-PRIMITIVES G5: the three column kinds the store fills in itself.
  v_system text := null;
  -- GRID-PRIMITIVES G3: a formula a person TYPED, parsed by the store.
  v_parsed jsonb := null;
  v_relation uuid := null;   -- SEAT-SUITES: the Table a caller's own relation column points at
  -- SC-R / P12, 2026-09-24: a column that points at a PLATFORM thing — an agent, a note, a web
  -- site, a workbook — rather than at a record of one of this organization's Tables.
  v_entity  boolean := false;
  v_allowed jsonb   := null;
  -- LIMITS-FIX 2026-09-21: the same one-word rule for the relation's target. Real-data crew E
  -- reported that no client door could declare a table-to-table relation; the door could, and
  -- has since 2026-09-19 — it only ever answered to `relation_target`, and a caller reaching
  -- for `target_table` got "A column that points at other records is a Person column or a File
  -- column", which describes a different mistake entirely.
  v_target text := coalesce(nullif(p_spec ->> 'relation_target', ''), nullif(p_spec ->> 'target_table', ''));
  v_deps   jsonb := case when jsonb_typeof(p_spec -> 'depends_on') = 'array'
                         then p_spec -> 'depends_on' else '[]'::jsonb end;
begin
  -- ── STORE-T: `type` IS THE WORD EVERY CALLER REACHES FOR, AND IT WAS THROWN AWAY. ──────
  -- Measured on 2026-09-20: `{"type":"number"}` produced a TEXT column and `{"type":"banana"}`
  -- was ACCEPTED, silently, as text. Only `parity_type` and `plain` were ever read, so every
  -- agent, script and other client that said "type" got a text column and was never told.
  -- Now it is read as what it plainly means, and a word that means nothing is refused BY NAME
  -- with the list — nothing is guessed and nothing is silently dropped.
  if v_alias <> '' and v_parity is null and nullif(p_spec ->> 'plain', '') is null then
    if exists (select 1 from custom.parity_field_types() t where t.parity_type = v_alias) then
      v_parity := v_alias;
    elsif v_alias in ('number', 'range', 'integer', 'decimal', 'float') then
      v_plain := 'number';
    elsif v_alias in ('long_text', 'longtext', 'long text', 'paragraph') then
      v_plain := 'long_text';
    elsif v_alias in ('text', 'string') then
      v_plain := 'text';
    elsif v_alias in ('boolean', 'bool', 'checkbox', 'check_box', 'tick', 'tickbox',
                      'yes_no', 'yesno', 'yes/no', 'toggle', 'switch') then
      -- LIMITS-FIX: every word a person, an agent or a spreadsheet reaches for when they
      -- mean a tick box lands on the one type that is one.
      v_parity := 'checkbox';
    elsif v_alias = 'list' then
      v_parity := 'select';
    elsif v_alias in ('signature', 'sign', 'e_signature', 'esignature') then
      -- ── FIX-10B-F6, 2026-09-22: THE E-SIGN HALF OF DOCUMENTS COULD NOT BE REACHED. ──────
      -- `custom.doc_sign` accepts exactly one field — text whose format is `signature` — and
      -- this door would write that format only when a caller sent `format: signature`
      -- alongside a plain text type. No screen sends a format: the add-a-column panel
      -- collects an INTENTION and the store answers the behaviour, the format and the unit.
      -- So the sentence under a rendered document ("Crews needs a signature column - a text
      -- column whose format is signature") named a precondition no screen could meet, and
      -- every sign request, expiring link and sealed hash behind it was unreachable.
      -- VERIFIER-10 F6, measured from the admin seat on Rincon Plumbing's Crews table.
      -- A signature is now a WORD like every other kind, published by
      -- `custom.field_kinds()`, and the panel that offers it sends the word.
      v_plain := 'text';
      v_signature := true;
    elsif v_alias in ('autonumber', 'created_time', 'modified_time', 'auto_number',
                      'created', 'modified', 'last_modified', 'last_modified_time') then
      -- ── GRID-PRIMITIVES G5, 2026-09-22: THE STORE'S OWN STAMPS AS COLUMNS. ──────────────
      -- The older grid has an Autonumber, a Created time and a Last modified time column,
      -- and none of the three is typed: the database assigns the number and the row carries
      -- its own stamps. Here each is a formula Field whose expression is the system node —
      -- fx.autonumber is worked out ONCE, on write, and kept; the two stamps on read — so
      -- every reader that serves a worked-out value serves these with nothing new, and a
      -- hand-typed value is refused exactly as it is for any formula (FLD-9).
      v_parity := 'formula';
      v_system := case when v_alias in ('autonumber', 'auto_number') then 'autonumber'
                       when v_alias in ('created_time', 'created') then 'created_time'
                       else 'modified_time' end;
    elsif v_alias in ('entity_reference', 'entity', 'entity_ref', 'reference', 'platform_reference') then
      -- ── SC-R / P12, 2026-09-24: A RECORD POINTING AT SOMETHING THAT IS NOT A RECORD. ─────
      -- The scope system let a client's column point at its web site, its intake note or the
      -- agent that works it (16 such columns live on the main database), and the store could
      -- not: a relation reached one Table of this organization or the kernel File / Person
      -- Table and nothing else, so the mover had to refuse all sixteen. An entity reference is
      -- a RELATION (FLD-1's closed set of five behaviours holds) whose target mode is `any`
      -- (REL-8), restricted to the kinds it names in `allowed_types` — the scope system's own
      -- word `allowed_reference_types` is read too. Each kind must be one
      -- custom.entity_reference_kinds() lists; custom._field_shape_guard says which is not.
      v_entity := true;
      v_allowed := coalesce(
        case when jsonb_typeof(p_spec -> 'allowed_types') = 'array' then p_spec -> 'allowed_types' end,
        case when jsonb_typeof(v_config -> 'allowed_types') = 'array' then v_config -> 'allowed_types' end,
        case when jsonb_typeof(p_spec -> 'allowed_reference_types') = 'array' then p_spec -> 'allowed_reference_types' end,
        case when jsonb_typeof(p_spec -> 'allowed_types') = 'string'
             then jsonb_build_array(p_spec -> 'allowed_types') end);
      select coalesce(jsonb_agg(w order by first_at), '[]'::jsonb) into v_allowed
        from (select lower(btrim(x #>> '{}')) as w, min(o) as first_at
                from jsonb_array_elements(coalesce(v_allowed, '[]'::jsonb)) with ordinality as a(x, o)
               where jsonb_typeof(x) = 'string' and btrim(x #>> '{}') <> ''
               group by 1) s;
      if jsonb_array_length(v_allowed) = 0 then
        raise exception 'A column that points at things on the platform has to say which kinds of thing, and "%" names none.', coalesce(v_label, v_key, 'this column')
          using errcode = '23514',
                hint = 'SC-R / P12: send allowed_types, a list such as ["note", "web_site"]; select token, label from custom.entity_reference_kinds() lists every kind. A file is a File column and a person a Person column. Nothing was created.';
      end if;
    elsif v_alias = 'relation' then
      -- ── SEAT-SUITES, 2026-09-19: A COLUMN POINTING AT ANOTHER OF YOUR OWN TABLES COULD
      -- NOT BE MADE AT ALL. ────────────────────────────────────────────────────────────
      -- `member` points at the kernel Person Table and `attachment` at the kernel File
      -- Table, and those were the ONLY two relations this door could build. A person with
      -- an Invoice Table and a Line Table could not give Invoice a Lines column through any
      -- door, although the store holds exactly that shape already: the parity-floor
      -- fixture's own `lines` field is a plain relation at a custom Table, and every guard,
      -- every edge, every rollup and `custom.record_relation_edges` handle it. Only the
      -- door refused, and it refused EVEN WHEN THE CALLER SAID WHICH TABLE.
      -- THE RULE: a caller that NAMES its target gets the relation it asked for; a caller
      -- that names nothing still gets the old sentence, because a relation with no target
      -- is the thing that sentence is actually about.
      if v_target is null then
        raise exception 'A column that points at other records is a Person column or a File column, and "%" does not say which.', v_alias
          using errcode = '23514',
                hint = 'FLD-11: say member for a person or attachment for a file, or name the Table this column points at in relation_target. Nothing was created.';
      end if;
      v_relation := v_target::uuid;
      -- ── RELATION-DECLARE, 2026-09-20: A COLUMN COULD POINT AT SOMETHING THAT IS NOT A
      -- TABLE, AND NOBODY WAS TOLD. ────────────────────────────────────────────────────────
      -- This arm took the caller's uuid and wrote it down unread. A uuid naming NOTHING at
      -- all was accepted; a uuid naming a RECORD instead of a Table was accepted. The column
      -- then points at a thing with no records to pick from and no title field to make a chip
      -- out of, and every reader downstream has to guess what that means. Measured from the
      -- seat `authenticated` on the main database, 2026-09-20. (A Table in ANOTHER
      -- organization was already refused by custom._field_shape_guard; that stands.)
      if not exists (select 1 from custom.record t
                      where t.id = v_relation
                        and t.deleted_at is null
                        and t.table_id = custom.table_kernel_id()
                        and (t.organization_id = p_organization_id or t.data_class = 'kernel')) then
        raise exception 'A column that points at other records has to point at a TABLE, and the one it names is not one of this organization''s tables.' using errcode = '23503',
                hint = 'FLD-11 / REL-8: relation_target names the Table whose records this column may point at - open the Table you meant and use its id. Nothing was created.',
            detail = jsonb_build_object('relation', v_relation)::text;
      end if;
    else
      raise exception 'There is no kind of column called "%".', p_spec ->> 'type'
        using errcode = '23514',
              hint = format('FLD-11: %s. Nothing was created.', custom._field_kinds_sentence());
    end if;
  end if;
  if v_label is null then
    raise exception 'A field needs a name - it is what a person reads on the column.'
      using errcode = '23514', hint = 'Give the field a name (a table spec''s own word) or a label - they mean the same thing here. Everything else this door can work out.';
  end if;
  if v_key is null then
    -- The panel derives the key from the label; a caller that did not is not
    -- refused for a machine token it never meant to think about.
    v_key := regexp_replace(lower(btrim(v_label)), '[^a-z0-9]+', '_', 'g');
    v_key := regexp_replace(v_key, '^_+|_+$', '', 'g');
    if v_key !~ '^[a-z]' then v_key := 'f_' || v_key; end if;
    v_key := left(v_key, 48);
  end if;
  if v_key !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'A field''s key is made of lower-case letters, digits and underscores, and this one is "%".', v_key
      using errcode = '23514', hint = 'FLD-13: leave the key out and the store makes one from the name.';
  end if;

  -- THE FLOOR EVERY FIELD STANDS ON. Every key the guards demand is written,
  -- always, so no caller can omit one by accident.
  d := jsonb_build_object(
    'key',                  v_key,
    'label',                v_label,
    'multi',                v_multi,
    'dated',                coalesce((p_spec ->> 'dated')::boolean, false),
    'required',             coalesce((p_spec ->> 'required')::boolean, false),
    'sort',                 coalesce((p_spec ->> 'sort')::numeric, 100),
    'source',               coalesce(nullif(p_spec ->> 'source', ''), 'manual'),
    'source_config',        coalesce(p_spec -> 'source_config', '{}'::jsonb),
    'sensitivity',          coalesce(nullif(p_spec ->> 'sensitivity', ''), 'internal'),
    'context_policy',       coalesce(nullif(p_spec ->> 'context_policy', ''), 'include'),
    'applies_to_types',     coalesce(p_spec -> 'applies_to_types', '[]'::jsonb),
    -- STORE-T / T7: THE CALLER'S OWN DEPENDENCY LIST, KEPT. It used to be hard-coded to the
    -- empty list here, so NO client-made formula ever had dependencies, `custom.field_dependants`
    -- could never name one, and REC-18's refusal — "this field is used by …" — could not fire for
    -- anything a person or an agent built. That is the third half of T7.
    'depends_on',           v_deps,
    'entity_definition_id', p_table_id);

  -- SEAT-SUITES 2026-09-19: two properties `custom.field` has always projected and this door
  -- silently dropped, so a person could read them and never set them. They are carried only
  -- when the caller names them, so no existing field's document changes shape.
  if nullif(p_spec ->> 'review_interval_days', '') is not null then
    d := d || jsonb_build_object('review_interval_days', (p_spec ->> 'review_interval_days')::integer);
  end if;
  if p_spec ? 'default' then
    d := d || jsonb_build_object('default', p_spec -> 'default');
  end if;

  -- SC-R / P12: THE ENTITY REFERENCE (see its arm above). A relation with no Table target: its
  -- target mode is `any` and `allowed_types` says which platform kinds it may name. No display
  -- spec — its words are each thing's own title, read by platform.relation_label.
  if v_entity then
    d := d || jsonb_build_object(
      'type',             'relation',
      'relation_max',     coalesce((p_spec ->> 'relation_max')::integer, case when v_multi then 25 else 1 end),
      'on_target_delete', case when nullif(p_spec ->> 'on_target_delete', '') in ('restrict','set_null','cascade')
                               then p_spec ->> 'on_target_delete' else 'set_null' end,
      'rules',            v_rules,
      'config',           (v_config - 'allowed_types' - 'target_tables')
                          || jsonb_build_object('target_mode', 'any', 'allowed_types', v_allowed));
    return custom._with_display_format(d, p_spec - 'display');
  end if;

  -- THE RELATION A CALLER NAMED ITSELF (see the `relation` arm above). It carries no parity
  -- type — `custom.parity_type` answers nothing for it, exactly as it answers nothing for
  -- plain text and plain numbers — and every relation property is the caller's to declare.
  if v_relation is not null then
    d := d || jsonb_build_object(
      'type',             'relation',
      'relation_target',  v_relation,
      'relation_max',     coalesce((p_spec ->> 'relation_max')::integer, case when v_multi then 25 else 1 end),
      'on_target_delete', case when nullif(p_spec ->> 'on_target_delete', '') in ('restrict','set_null','cascade')
                               then p_spec ->> 'on_target_delete' else 'set_null' end,
      'rules',            v_rules,
      'config',           v_config);
    if nullif(p_spec ->> 'inverse_key', '') is not null then
      d := d || jsonb_build_object('inverse_key', p_spec ->> 'inverse_key');
    end if;
    return custom._with_display_format(custom._with_display(p_organization_id, d, p_spec - 'display_format'), p_spec);
  end if;

  if v_parity is null then
    -- The three behaviours a person picks that are NOT one of the parity types:
    -- plain text, a long text and a plain number. They carry no parity type,
    -- which is exactly what `custom.parity_type` answers for them.
    if v_plain = 'number' then
      d := d || jsonb_build_object('type', 'range', 'config', v_config, 'rules', v_rules);
      if nullif(p_spec ->> 'unit', '') is not null then
        d := d || jsonb_build_object('unit', p_spec ->> 'unit');
      end if;
    elsif v_plain = 'long_text' then
      d := d || jsonb_build_object('type', 'text', 'format', 'long',
                                   'config', v_config || jsonb_build_object('multiline', true),
                                   'rules', v_rules);
    else
      d := d || jsonb_build_object('type', 'text', 'config', v_config, 'rules', v_rules);
      -- ── SEAT-SUITES, 2026-09-19: A SIGNATURE FIELD COULD NOT BE DECLARED BY ANYBODY. ────
      -- `custom.doc_signature_field_ok` accepts exactly one shape — a text field whose
      -- `format` is `signature` — and `custom.doc_sign` refuses every other field by name.
      -- No door wrote that `format`: this branch dropped it, and the parity types
      -- have no signature among them. So `custom.doc_sign`, which IS granted to
      -- `authenticated`, could never be used by a signed-in person at all: the one field it
      -- accepts had no way to exist outside an INSERT straight into `custom.record`, which
      -- needs a table privilege nobody has. Measured from the seat on the main database on
      -- 2026-09-19 while converting `scripts/campaign-tests/w3_doc_c43.sql`.
      -- A plain text field may now SAY it holds a signature, and nothing else changes: a
      -- field that does not ask for it is written exactly as before.
      if v_signature or nullif(p_spec ->> 'format', '') = 'signature' then
        d := d || jsonb_build_object('format', 'signature');
      end if;
    end if;
    return custom._with_display_format(custom._with_display(p_organization_id, d, p_spec - 'display_format'), p_spec);
  end if;

  if not exists (select 1 from custom.parity_field_types() t where t.parity_type = v_parity) then
    raise exception 'There is no field type called "%" in this system.', v_parity
      using errcode = '23514',
            hint = format('FLD-11: %s.', custom._parity_types_sentence());
  end if;

  d := d || jsonb_build_object('parity_type', v_parity);

  -- LANE7-SEC-ARCHIVE (2026-10-03): a standard table (no Table id: custom.entity_field_declare /
  -- entity_field_update) takes no worked-out field, said in field words BEFORE a formula is parsed
  -- against columns it does not have. custom._field_shape_guard holds the same line for every
  -- other way a definition is written.
  if p_table_id is null and (v_parity in ('formula', 'lookup', 'rollup') or v_system is not null) then
    raise exception 'A field on a standard table cannot be worked out from other values yet, so "%" cannot be a formula, lookup, rollup, count, record number or time stamp here; add it to a custom table instead.',
                    coalesce(v_label, v_key, 'this field')
      using errcode = '23514',
            hint = 'LANE7-SEC-ARCHIVE: worked-out fields run only through the store''s record doors. Nothing was written.';
  end if;

  case v_parity
    -- ── the two list types ───────────────────────────────────────────────────
    when 'select', 'multi_select' then
      d := d || jsonb_build_object(
        'type',   'list',
        'multi',  v_parity = 'multi_select',
        'rules',  v_rules,
        'config', v_config || jsonb_build_object(
                    'options_table_id', coalesce(nullif(p_spec ->> 'options_table_id', ''),
                                                nullif(v_config ->> 'options_table_id', ''))));

    -- ── the two relation types a person names by what they hold ─────────────
    when 'member' then
      d := d || jsonb_build_object(
        'type',             'relation',
        'relation_target',  custom.person_kernel_id(),
        'relation_max',     coalesce((p_spec ->> 'relation_max')::integer, case when v_multi then 25 else 1 end),
        -- STORE-T / T7 (REL-2): what happens to this record when the thing it points at is
        -- deleted is the CALLER'S to declare — restrict, set_null or cascade. It was hard-coded
        -- to set_null, so no client could ever declare the `restrict` T7 asks for and every
        -- delete of a pointed-at record was accepted. set_null stays the default.
        'on_target_delete', case when nullif(p_spec ->> 'on_target_delete', '') in ('restrict','set_null','cascade')
                                 then p_spec ->> 'on_target_delete' else 'set_null' end,
        'rules',            v_rules,
        'config',           v_config);
    when 'attachment' then
      d := d || jsonb_build_object(
        'type',             'relation',
        'relation_target',  custom.file_kernel_id(),
        'relation_max',     coalesce((p_spec ->> 'relation_max')::integer, case when v_multi then 25 else 1 end),
        -- REC-31: removing the file removes the attachment, never the record — so `cascade` is
        -- the one answer this field may not give, and custom._field_type_parity_guard refuses it
        -- by name. restrict is a caller's to choose.
        'on_target_delete', case when nullif(p_spec ->> 'on_target_delete', '') in ('restrict','set_null','cascade')
                                 then p_spec ->> 'on_target_delete' else 'set_null' end,
        'rules',            v_rules,
        'config',           v_config);

    -- ── the three worked-out types ──────────────────────────────────────────
    when 'lookup' then
      d := d || jsonb_build_object(
        'type',       'formula',
        'source',     'formula',
        'compute_on', coalesce(nullif(p_spec ->> 'compute_on', ''), 'read'),
        'rules',      v_rules,
        'config',     v_config || jsonb_strip_nulls(jsonb_build_object(
                        'via',  nullif(p_spec ->> 'via', ''),
                        'pick', nullif(p_spec ->> 'pick', ''))));
    when 'rollup' then
      d := d || jsonb_build_object(
        'type',       'formula',
        'source',     'formula',
        -- FLD-11: a rollup that stamped itself at write time would be stale the
        -- moment a contained record changed, and the store refuses that — so the
        -- only answer this door can give is the right one.
        'compute_on', 'read',
        'rules',      v_rules,
        'config',     v_config || jsonb_strip_nulls(jsonb_build_object(
                        'via', nullif(p_spec ->> 'via', ''),
                        'agg', nullif(p_spec ->> 'agg', ''),
                        'of',  nullif(p_spec ->> 'of', ''))));
    when 'formula' then
      -- ── GRID-PRIMITIVES G3 / G5, 2026-09-22. ────────────────────────────────────────────
      -- A system kind carries its system expression and says which it is; nothing else it
      -- was sent can change what it works out. A formula a person TYPED (`formula_text`, the
      -- older grid's language) is parsed here by custom.formula_parse, against this Table's
      -- own columns; a mistake is refused in the parser's own words with where it is, and
      -- the text is kept beside the expression so the person edits text and never JSON.
      if v_system is not null then
        v_config := (v_config - 'formula_text') || jsonb_build_object('system', v_system);
        d := d || jsonb_build_object(
          'type',       'formula',
          'source',     'formula',
          'compute_on', case when v_system = 'autonumber' then 'write' else 'read' end,
          'rules',      v_rules,
          'config',     v_config || jsonb_build_object('expr', jsonb_build_object('op', 'fx.' || v_system)));
        if coalesce(jsonb_typeof(p_spec -> 'display_format'), 'null') = 'null' then
          p_spec := p_spec || jsonb_build_object('display_format', jsonb_build_object('id', v_system));
        end if;
      else
        if nullif(btrim(coalesce(p_spec ->> 'formula_text', '')), '') is not null then
          v_parsed := custom.formula_parse(p_organization_id, p_table_id, p_spec ->> 'formula_text');
          if not coalesce((v_parsed ->> 'ok')::boolean, false) then
            raise exception 'The formula for "%" cannot be worked out: % (at character %).',
                            v_label, v_parsed ->> 'error', coalesce((v_parsed ->> 'position')::integer, 0) + 1
              using errcode = '23514',
                    hint = 'GRID-PRIMITIVES G3: a formula names columns in braces, like {Visit fee} - {Deposit taken}; select signature, says from custom.formula_node_kinds() lists every function. Nothing was written.';
          end if;
          v_config := v_config || jsonb_build_object('formula_text', p_spec ->> 'formula_text',
                                                     'expr', v_parsed -> 'expr');
        elsif p_spec ? 'expr' then
          -- An expression written by hand no longer matches any text it came with.
          v_config := v_config - 'formula_text';
        end if;
        d := d || jsonb_build_object(
          'type',       'formula',
          'source',     'formula',
          'compute_on', coalesce(nullif(p_spec ->> 'compute_on', ''), 'read'),
          'rules',      v_rules,
          'config',     v_config || jsonb_build_object('expr',
                          coalesce(v_parsed -> 'expr', p_spec -> 'expr', v_config -> 'expr')));
      end if;

    -- ── the three formatted texts. The format says how to SHOW it; the
    --    pattern Rule is what makes it enforceable (FLD-3 / FLD-11), so the
    --    door writes the Rule rather than leaving a label on an empty box.
    when 'url' then
      d := d || jsonb_build_object('type', 'text', 'format', 'url', 'config', v_config,
        'rules', case when exists (select 1 from jsonb_array_elements(v_rules) r where r ->> 'kind' = 'pattern')
                      then v_rules
                      else v_rules || jsonb_build_array(jsonb_build_object(
                             'kind', 'pattern', 'value', '^https?://[^\s]+$')) end);
    when 'email' then
      d := d || jsonb_build_object('type', 'text', 'format', 'email', 'config', v_config,
        'rules', case when exists (select 1 from jsonb_array_elements(v_rules) r where r ->> 'kind' = 'pattern')
                      then v_rules
                      else v_rules || jsonb_build_array(jsonb_build_object(
                             'kind', 'pattern', 'value', '^[^@\s]+@[^@\s]+\.[^@\s]+$')) end);
    when 'phone' then
      d := d || jsonb_build_object('type', 'text', 'format', 'phone', 'config', v_config,
        'rules', case when exists (select 1 from jsonb_array_elements(v_rules) r where r ->> 'kind' = 'pattern')
                      then v_rules
                      else v_rules || jsonb_build_array(jsonb_build_object(
                             'kind', 'pattern', 'value', custom.phone_pattern())) end);

    -- ── the three numbers and dates ─────────────────────────────────────────
    when 'currency' then
      d := d || jsonb_build_object(
        'type', 'range', 'format', 'currency',
        'unit', coalesce(nullif(p_spec ->> 'unit', ''), '$'),
        'config', v_config, 'rules', v_rules);
    when 'percent' then
      d := d || jsonb_build_object(
        'type', 'range', 'format', 'percent', 'unit', '%', 'config', v_config,
        -- FLD-3 / FLD-11: a percent field that takes -40 is a percent in name only.
        'rules', case when exists (select 1 from jsonb_array_elements(v_rules) r
                                    where r ->> 'kind' in ('min', 'max'))
                      then v_rules
                      else v_rules || jsonb_build_array(
                             jsonb_build_object('kind', 'min', 'value', 0),
                             jsonb_build_object('kind', 'max', 'value', 100)) end);
    -- ── the tick box ────────────────────────────────────────────────────────
    -- No format, no unit, no options Table and no Rule: what it holds IS the
    -- behaviour. A default is carried when the caller named one (above), which is
    -- how a column can start life ticked.
    when 'checkbox' then
      d := d || jsonb_build_object('type', 'boolean', 'config', v_config, 'rules', v_rules);

    when 'datetime' then
      d := d || jsonb_build_object(
        'type', 'range', 'rules', v_rules,
        'config', v_config || jsonb_build_object(
                    'kind', case when coalesce(p_spec ->> 'kind', v_config ->> 'kind') = 'datetime'
                                 then 'datetime' else 'date' end));
      if coalesce(p_spec ->> 'kind', v_config ->> 'kind') = 'datetime' then
        d := d || jsonb_build_object('format', 'datetime');
      end if;
    else
      raise exception 'The field type "%" is known but this store does not yet know what it is made of.', v_parity
        using errcode = '23514',
              hint = 'custom._field_document_for has an arm per parity type; this one is missing. Nothing was written.';
  end case;

  return custom._with_display_format(custom._with_display(p_organization_id, d, p_spec - 'display_format'), p_spec);
end
$function$;
