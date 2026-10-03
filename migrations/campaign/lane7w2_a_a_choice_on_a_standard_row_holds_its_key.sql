-- chair-step: this file creates one function (custom._entity_choice_keys, plpgsql, no grant: it is
-- called only from inside the SECURITY DEFINER trigger) and replaces one live trigger body
-- (CREATE OR REPLACE, no trigger DDL). It changes no grant and alters no table. Its inverse puts
-- the trigger body back byte for byte and drops the new function.
-- based-on: custom._entity_custom_fields_guard() f13edfda19808d5d4245ae195c56a9f736e5d37a7b092852c2bbc0c587081812
--
-- LANE 7 · W2 FIX ROUND 1 — A CHOICE ON A STANDARD ROW HOLDS ITS KEY.
--
-- The store's rule (FLD-5/FLD-6, @ai-matrx/records choice.ts): a choice cell holds the option's
-- stable KEY, and every write turns a label, a key or the option's id into that key. On a custom
-- table custom._resolve_choice_words does it on every write. On a STANDARD row (crm.party, any
-- registry token with custom fields) nothing did: custom.entity_value_write, a direct PostgREST
-- update of custom_fields and a server job all stored whatever was sent. Measured on the clone
-- 2026-10-02: Marisol Vega's "Home clinic" held the label "Westside", an option id was stored as
-- the id, so every list filter, group and agent read had to guess at spellings.
--
-- The fix is the class, at the one place every write path to a standard row passes:
-- custom._entity_custom_fields_guard calls custom._entity_choice_keys before it validates or
-- envelopes the document. Only a value THIS write changed is judged (a row holding an older
-- spelling stays saveable when another field is edited); a word that names no choice is refused
-- in a sentence naming the choices, unless the Field takes other values (config.allow_other);
-- a retired choice cannot be newly picked. Same words and order as the custom-table trigger.
--
-- Clone proof (2026-10-02, rolled back): as admin@admin.com — label "Harbor" -> "harbor";
-- option id -> "westside"; "Uptown" refused naming Home clinic; a direct update with "Downtown"
-- -> "downtown"; RED without this file: "Harbor", the id and "Downtown" stored as sent.
-- Round 2: the options table id is read from the Field's own column first, its config only for a
-- Field written before that column (the client reads it the same way).
-- ORDER (round 4): based on lane7sec_r2_an_archived_field_never_blocks_a_row.sql's guard body —
-- apply r2 FIRST, then this file; this file inserts its one call into r2's body and changes nothing
-- else, so r2's archive fix stands. Its inverse returns r2's body byte for byte.
-- Coordination: lane 7 SEC owns this trigger's field-rule half; this file inserts one call above
-- validate_values and changes nothing else in the body.

CREATE OR REPLACE FUNCTION custom._entity_choice_keys(p_organization_id uuid, p_fields custom.record[], p_doc jsonb, p_old jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  f        custom.record;
  v_key    text;
  v_label  text;
  v_otid   uuid;
  v_field  jsonb;
  v_val    jsonb;
  v_items  jsonb;
  v_one    jsonb;
  v_word   text;
  v_hit    text;
  v_out    jsonb;
  v_new    jsonb;
  v_before text[];
  v_allow  boolean;
begin
  -- LANE7-W2 (2026-10-02). A CHOICE ON A STANDARD ROW HOLDS ITS KEY, exactly as a custom table's
  -- cell does (custom._resolve_choice_words, FLD-5/FLD-6): every write turns the label, the key or
  -- the option's id into the option's stable key, refuses a word that names no choice (unless the
  -- Field takes other values), and refuses newly picking a retired choice. Only a value THIS write
  -- changed is judged, so a row carrying an older spelling can still be saved when somebody edits
  -- another field. Called from custom._entity_custom_fields_guard, the trigger every write path
  -- to a standard row passes (custom.entity_value_write, a direct update, a server job).
  if p_fields is null or p_doc is null or jsonb_typeof(p_doc) <> 'object' then
    return p_doc;
  end if;
  foreach f in array p_fields loop
    continue when f.data ->> 'type' <> 'list';
    v_key := f.data ->> 'key';
    continue when v_key is null or not (p_doc ? v_key);
    v_val := p_doc -> v_key;
    continue when v_val is null or jsonb_typeof(v_val) = 'null';
    continue when coalesce(p_old, '{}'::jsonb) -> v_key is not distinct from v_val;
    -- The Field's own options column, its config only for a Field written before that column.
    v_otid := coalesce(nullif(f.data ->> 'options_table_id', ''),
                       nullif(f.data -> 'config' ->> 'options_table_id', ''))::uuid;
    continue when v_otid is null;
    v_label := coalesce(nullif(f.data ->> 'label', ''), v_key);
    v_field := jsonb_build_object('label', v_label, 'field_id', f.id::text,
                                  'options', custom.choice_options(p_organization_id, v_otid));

    select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_before
      from jsonb_array_elements(
             case when jsonb_typeof(p_old -> v_key) = 'array' then p_old -> v_key
                  when p_old -> v_key is null or jsonb_typeof(p_old -> v_key) = 'null' then '[]'::jsonb
                  else jsonb_build_array(p_old -> v_key) end) x
     where jsonb_typeof(x) = 'string';

    v_items := case when jsonb_typeof(v_val) = 'array' then v_val else jsonb_build_array(v_val) end;
    v_out   := '[]'::jsonb;
    for v_one in select x from jsonb_array_elements(v_items) x loop
      if jsonb_typeof(v_one) <> 'string' or btrim(v_one #>> '{}') = '' then
        v_out := v_out || jsonb_build_array(v_one);
        continue;
      end if;
      v_word := btrim(v_one #>> '{}');
      v_hit  := custom.choice_key_of(v_field, v_word);
      if v_hit is null
         or (coalesce((v_field -> 'options' -> v_hit ->> 'retired')::boolean, false)
             and not (v_hit = any (v_before))) then
        v_allow := coalesce((f.data -> 'config' ->> 'allow_other')::boolean, false);
        if v_allow then
          v_out := v_out || jsonb_build_array(to_jsonb(v_word));
          continue;
        end if;
      end if;
      if v_hit is null then
        raise exception '% does not have a choice called "%".', v_label, v_word
          using errcode = '23514',
                hint = format('The choices for %s are %s. Pick one of those, or add "%s" to the field''s list of choices first.',
                              v_label, coalesce(custom.choice_words(v_field), 'not set up yet'), v_word);
      end if;
      if coalesce((v_field -> 'options' -> v_hit ->> 'retired')::boolean, false)
         and not (v_hit = any (v_before)) then
        raise exception '% is no longer one of the choices for %.',
                        coalesce(v_field -> 'options' -> v_hit ->> 'label', v_hit), v_label
          using errcode = '23514',
                hint = format('It was retired, so it can no longer be picked. The choices now are %s.',
                              coalesce(custom.choice_words(v_field), 'none — add one first'));
      end if;
      v_out := v_out || jsonb_build_array(to_jsonb(v_hit));
    end loop;
    v_new := case when jsonb_typeof(v_val) = 'array' then v_out else v_out -> 0 end;
    if v_new is distinct from v_val then
      p_doc := p_doc || jsonb_build_object(v_key, v_new);
    end if;
  end loop;
  return p_doc;
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
  -- LANE7-W2 (2026-10-02): A CHOICE HOLDS ITS KEY. A label, key or option id this write sent
  -- becomes the option's key before anything validates or envelopes it, as on a custom table.
  if v_fields is not null then
    v_doc := custom._entity_choice_keys(v_org, v_fields, v_doc, v_old);
  end if;

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
