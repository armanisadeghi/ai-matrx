-- SEAT-SUITES — THE RED TWIN. The three doors this lane fixed, each put back inside a
-- transaction that ends in ROLLBACK, and each clause shown going RED for its own reason.
--
-- All three were found by running a campaign suite FROM THE SEAT A SIGNED-IN PERSON HAS. Not
-- one of them was visible from the role that owns `custom.record`, which is the seat every
-- campaign suite ran in until 2026-09-20:
--
--   RED 6  custom.field_declare refused a column the table had declared and never defined, so
--          the first column of every table a person makes could never be given a type.
--   RED 7  custom.read_record carried `_alternates` and dropped `_retired`, so the values the
--          store keeps WITH THEIR REASON never reached a person.
--   RED 8  custom.field_update accepted `promoted` and `unique`, returned the field id, and
--          changed nothing, so nobody could ask for an indexed or a unique column.
--
-- IT EXECUTES THE REAL INVERSES — the bytes of migrations/inverse/seatsuites_*_down.sql — not
-- a hand-weakened copy, so the RED it shows is the rule-27 inverse itself. It runs in ONE
-- transaction that ends in ROLLBACK, so the fixed bodies are back the moment it finishes.
--
-- RUN IT (against the MAIN database):
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/seatsuites_red.sql
--
-- ITS GREEN TWIN is scripts/campaign-tests/doorfix_green.sql (every clause from the seat) and
-- blocks RED 6-8 of scripts/campaign-tests/doorfix_red.sql.

begin;
CREATE OR REPLACE FUNCTION custom.field_declare(p_organization_id uuid, p_table_id uuid, p_spec jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_doc     jsonb;
  v_key     text;
  v_fields  jsonb;
  v_opts    uuid;
  v_id      uuid;
begin
  -- THE DECISION FIRST, BEFORE ANYTHING IS READ OR WRITTEN: the organization's
  -- own off switch, then the organization wall, then the right to change the
  -- SHAPE of this table, which is an admin's right and not an editor's.
  perform custom.assert_store_door(p_organization_id, 'custom.field_declare');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_declare');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.field_declare',
                                          'admin'::public.permission_level, 'table');

  select r.data -> 'fields' into v_fields
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_table_id
     and r.table_id = custom.table_kernel_id()
     and r.deleted_at is null;
  if v_fields is null then
    raise exception 'That table is not in this organization, so a field cannot be added to it.'
      using errcode = '23514',
            hint = 'REC-29: organizations are hard walls. Open the table you meant and add the field there.';
  end if;

  v_doc := custom._field_document_for(p_organization_id, p_table_id, p_spec);
  v_key := v_doc ->> 'key';

  if exists (select 1 from jsonb_array_elements(v_fields) f where f ->> 'name' = v_key) then
    raise exception 'This table already has a field called "%".', v_doc ->> 'label'
      using errcode = '23505',
            hint = 'Two fields of one table cannot share a key. Give this one a different name, or edit the one that is already there.';
  end if;

  -- THE CHOICE LIST. The person typed words; the store keeps them the only way
  -- FLD-5/FLD-6 allows — as the records of a Table — and points the Field at it.
  if (v_doc ->> 'type') = 'list'
     and nullif(v_doc -> 'config' ->> 'options_table_id', '') is null then
    if jsonb_typeof(p_spec -> 'options') is distinct from 'array'
       or jsonb_array_length(coalesce(p_spec -> 'options', '[]'::jsonb)) = 0 then
      raise exception 'A list of choices needs its choices - "%" has none yet.', v_doc ->> 'label'
        using errcode = '23514',
              hint = 'Type the choices into the field panel, one per line, and they are saved with the field.';
    end if;
    v_opts := custom._options_table_for(p_organization_id, v_doc ->> 'label', p_spec -> 'options');
    v_doc := jsonb_set(v_doc, '{config,options_table_id}', to_jsonb(v_opts::text));
  end if;

  -- ONE SOURCE OF TRUTH, both ways: the TABLE declares which fields it has and
  -- `custom.field` defines what one of them is, so the table is told first —
  -- the field guard refuses a definition for a field the table never declared,
  -- which is the exact sentence every "Add field" ended on.
  update custom.record
     set data = jsonb_set(data, '{fields}',
                          coalesce(data -> 'fields', '[]'::jsonb)
                          || jsonb_build_array(jsonb_build_object('name', v_key))),
         updated_at = now(), version = version + 1
   where organization_id = p_organization_id
     and id = p_table_id
     and table_id = custom.table_kernel_id();

  -- `data_class = 'field'` is the other half of what no client could write. A
  -- field stored as a plain record is invisible to the delete rules and to the
  -- formula-dependency check (the 19 September verdict's defect 1).
  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.field_kernel_id(), 'field', v_doc)
  returning id into v_id;

  return v_id;
end
$function$

;
CREATE OR REPLACE FUNCTION custom.read_record(p_organization_id uuid, p_record_id uuid, p_by_id boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me       uuid := auth.uid();
  v_table    uuid;
  v_doc      jsonb;
  v_level    public.permission_level;
  v_visible  text[];
  v_declared text[];
  v_notices  jsonb;
  v_key_ids  jsonb;
  v_now      uuid;
  v_alts     jsonb;
  v_out      jsonb;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501', hint = 'DOOR-1: the read door reads the person from the session.';
  end if;

  -- REC-21 / T5. THE ID A MERGE SENT SOMEWHERE ELSE. `custom.resolve_id` walks the whole
  -- chain and ignores a REVOKED alias, so an undone merge puts the id back to itself. The
  -- read then happens on the record the id MEANS, and the answer SAYS which id was asked
  -- for — a redirect, never a silent substitution.
  v_now := custom.resolve_id(p_organization_id, p_record_id);

  select r.table_id, custom.record_values(r.organization_id, r.id)
    into v_table, v_doc
    from custom.record r
   where r.organization_id = p_organization_id and r.id = v_now and r.deleted_at is null;
  if not found then
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000', hint = 'It was deleted, or it never existed here.';
  end if;

  if not custom.has_visibility(v_me, 'record', v_now, 'viewer') then
    raise exception 'You do not have access to this record.'
      using errcode = '42501',
            hint = 'DOOR-1: nothing reads a record around this door - not a screen, not an export, not an agent. Ask somebody who holds it to share it with you.';
  end if;

  v_level := custom.effective_level(v_me, p_organization_id, v_now);

  select coalesce(array_agg(f.field_key), '{}'::text[])
    into v_visible
    from iam.visible_field_ids(v_me, p_organization_id, v_table, v_level, 'read') f;

  -- EVERY key this Table has a Field record for, visible or not. The difference between
  -- this list and v_visible is what masking is about; a key in NEITHER is undeclared.
  select coalesce(array_agg(f.data ->> 'key'), '{}'::text[])
    into v_declared
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_table;

  select coalesce(jsonb_object_agg(f.data ->> 'key', custom.hidden_field_notice(f, 'read')) , '{}'::jsonb),
         coalesce(jsonb_object_agg(f.data ->> 'key', f.id::text), '{}'::jsonb)
    into v_notices, v_key_ids
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_table
     and not (f.data ->> 'key' = any (v_visible));

  v_out := custom.mask_document(v_doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared);

  -- T5 / REC-N-11. THE ALTERNATES THE MERGE KEPT. Two Chens become one Person and BOTH phone
  -- numbers survive, each with its source — and until now the read door showed one of them.
  -- Only for keys this reader may see: an alternate IS the value, so a masked field's
  -- alternates are masked with it.
  select jsonb_object_agg(k, alts) into v_alts
    from (
      select e.key as k,
             (select jsonb_agg(jsonb_build_object(
                       'value',  a -> 'value',
                       'rank',   a -> 'rank',
                       'source', r.data -> '_sources' -> (a ->> 'src'))
                     order by (a ->> 'rank')::int)
                from jsonb_array_elements(coalesce(e.value -> 'alternates', '[]'::jsonb)) a) as alts
        from custom.record r
        cross join lateral jsonb_each(coalesce(r.data -> '_values', '{}'::jsonb)) e
       where r.organization_id = p_organization_id and r.id = v_now
         and e.key = any (v_visible)
         and jsonb_array_length(coalesce(e.value -> 'alternates', '[]'::jsonb)) > 0
    ) x
   where x.alts is not null;

  if v_alts is not null and v_alts <> '{}'::jsonb then
    v_out := v_out || jsonb_build_object('_alternates', v_alts);
  end if;

  if v_now is distinct from p_record_id then
    v_out := v_out || jsonb_build_object(
      '_redirected_from', p_record_id,
      '_redirect_says', 'That record was merged into this one, so its id now answers with this record. REC-21: the merged id resolves to the survivor for good — undoing the merge puts both records and both ids back.');
  end if;

  return v_out;
end;
$function$

;
CREATE OR REPLACE FUNCTION custom.field_update(p_organization_id uuid, p_field_id uuid, p_patch jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_old       jsonb;
  v_table     uuid;
  v_next      jsonb;
  v_opts      uuid;
  v_word      text;
  v_spec      jsonb;
  v_was       text;
  v_now       text;
  v_behaviour boolean;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.field_update');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_update');

  select r.data, (r.data ->> 'entity_definition_id')::uuid into v_old, v_table
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_field_id
     and r.table_id = custom.field_kernel_id()
     and r.deleted_at is null;
  if v_old is null then
    raise exception 'There is no such field in this organization, so nothing was changed.'
      using errcode = '23514', hint = 'REC-29: organizations are hard walls.';
  end if;
  if v_table is not null then
    perform custom.assert_client_may_change(p_organization_id, v_table, 'custom.field_update',
                                            'admin'::public.permission_level, 'table');
  end if;

  if nullif(p_patch ->> 'key', '') is not null and (p_patch ->> 'key') is distinct from (v_old ->> 'key') then
    raise exception 'A field''s key is how every saved value finds it, so it cannot be renamed.'
      using errcode = '23514', hint = 'The name a person reads is the label, and that can be changed freely.';
  end if;

  -- ── IS THIS A CHANGE OF BEHAVIOUR? T12. ───────────────────────────────────────────────
  -- Any of the three words a caller uses for it. The door used to refuse one of them and
  -- ignore the other two; it now carries all three out through the same function that shapes
  -- a field when it is created, so a column changed and a column created are the same shape.
  v_behaviour := coalesce(nullif(p_patch ->> 'parity_type', ''),
                          nullif(p_patch ->> 'plain', ''),
                          nullif(p_patch ->> 'type', '')) is not null;

  if v_behaviour then
    -- The spec is everything this field already is, with the patch written over it. The key
    -- and the table never move; `custom._field_document_for` decides the rest.
    v_spec := jsonb_strip_nulls(jsonb_build_object(
      'key',            v_old ->> 'key',
      'label',          coalesce(p_patch ->> 'label', v_old ->> 'label'),
      'multi',          coalesce(p_patch -> 'multi', v_old -> 'multi'),
      'dated',          coalesce(p_patch -> 'dated', v_old -> 'dated'),
      'required',       coalesce(p_patch -> 'required', v_old -> 'required'),
      'sort',           coalesce(p_patch -> 'sort', v_old -> 'sort'),
      'source',         coalesce(p_patch ->> 'source', v_old ->> 'source'),
      'source_config',  coalesce(p_patch -> 'source_config', v_old -> 'source_config'),
      'sensitivity',    coalesce(p_patch ->> 'sensitivity', v_old ->> 'sensitivity'),
      'context_policy', coalesce(p_patch ->> 'context_policy', v_old ->> 'context_policy'),
      'applies_to_types', coalesce(p_patch -> 'applies_to_types', v_old -> 'applies_to_types'),
      'depends_on',     coalesce(p_patch -> 'depends_on', v_old -> 'depends_on'),
      'unit',           coalesce(p_patch ->> 'unit', v_old ->> 'unit'),
      'expr',           coalesce(p_patch -> 'expr', v_old -> 'config' -> 'expr'),
      'on_target_delete', coalesce(p_patch ->> 'on_target_delete', v_old ->> 'on_target_delete'),
      'options_table_id', coalesce(p_patch ->> 'options_table_id', v_old -> 'config' ->> 'options_table_id'),
      'options',        p_patch -> 'options',
      'rules',          coalesce(p_patch -> 'rules', v_old -> 'rules')));
    -- The patch's own word for the behaviour, whichever of the three it used.
    if nullif(p_patch ->> 'parity_type', '') is not null then
      v_spec := v_spec || jsonb_build_object('parity_type', p_patch ->> 'parity_type');
    elsif nullif(p_patch ->> 'plain', '') is not null then
      v_spec := v_spec || jsonb_build_object('plain', p_patch ->> 'plain');
    else
      v_spec := v_spec || jsonb_build_object('type', p_patch ->> 'type');
    end if;

    v_next := custom._field_document_for(p_organization_id, v_table, v_spec);
    -- The key and the table are this field's identity and _field_document_for takes them from
    -- the spec; written again here so a spec that lost one cannot silently move a field.
    v_next := v_next || jsonb_build_object('key', v_old ->> 'key');
    if v_table is not null then
      v_next := v_next || jsonb_build_object('entity_definition_id', v_table::text);
    end if;

    v_was := custom.field_behaviour(v_old);
    v_now := custom.field_behaviour(v_next);

    -- THE CHOICES, if the new behaviour is a list and the caller typed some.
    if (v_next ->> 'type') = 'list'
       and nullif(v_next -> 'config' ->> 'options_table_id', '') is null
       and jsonb_typeof(p_patch -> 'options') = 'array'
       and jsonb_array_length(p_patch -> 'options') > 0 then
      v_opts := custom._options_table_for(p_organization_id, v_next ->> 'label', p_patch -> 'options');
      v_next := jsonb_set(v_next, '{config,options_table_id}', to_jsonb(v_opts::text));
    end if;

    -- AND THE WRITE, which is what fires custom._field_type_converts_values: every value of
    -- this column is converted where it converts and kept in `_retired` with its reason where
    -- it does not, and the history.migration_log row is written by that same trigger. Nothing
    -- here duplicates any of it — this door's whole job was to let it happen.
    update custom.record
       set data = v_next, updated_at = now(), version = version + 1
     where organization_id = p_organization_id
       and id = p_field_id
       and table_id = custom.field_kernel_id();

    if v_was is not distinct from v_now then
      raise notice 'custom: "%" still behaves as %; its other settings were saved.',
        coalesce(v_next ->> 'label', v_next ->> 'key'), coalesce(v_now, 'before');
    end if;
    return p_field_id;
  end if;

  -- ── OTHERWISE: THE SETTINGS, exactly as before. ───────────────────────────────────────
  v_next := v_old;
  if p_patch ? 'label'          then v_next := jsonb_set(v_next, '{label}', to_jsonb(p_patch ->> 'label')); end if;
  if p_patch ? 'required'       then v_next := jsonb_set(v_next, '{required}', to_jsonb(coalesce((p_patch ->> 'required')::boolean, false))); end if;
  if p_patch ? 'dated'          then v_next := jsonb_set(v_next, '{dated}', to_jsonb(coalesce((p_patch ->> 'dated')::boolean, false))); end if;
  if p_patch ? 'sort'           then v_next := jsonb_set(v_next, '{sort}', to_jsonb(coalesce((p_patch ->> 'sort')::numeric, 100))); end if;
  if p_patch ? 'sensitivity'    then v_next := jsonb_set(v_next, '{sensitivity}', to_jsonb(p_patch ->> 'sensitivity')); end if;
  if p_patch ? 'context_policy' then v_next := jsonb_set(v_next, '{context_policy}', to_jsonb(p_patch ->> 'context_policy')); end if;
  if p_patch ? 'unit'           then v_next := jsonb_set(v_next, '{unit}', to_jsonb(p_patch ->> 'unit')); end if;
  if p_patch ? 'rules'          then v_next := jsonb_set(v_next, '{rules}', coalesce(p_patch -> 'rules', '[]'::jsonb)); end if;
  -- STORE-T / T7: the dependency list is a SETTING of a worked-out column, and a door that
  -- could not change it could not fix a formula that reads the wrong column either.
  if p_patch ? 'depends_on'     then v_next := jsonb_set(v_next, '{depends_on}',
                                       case when jsonb_typeof(p_patch -> 'depends_on') = 'array'
                                            then p_patch -> 'depends_on' else '[]'::jsonb end); end if;

  -- THE CHOICES, EDITED WHERE THEY WERE TYPED (unchanged).
  if jsonb_typeof(p_patch -> 'options') = 'array' and (v_old ->> 'type') = 'list' then
    v_opts := nullif(v_old -> 'config' ->> 'options_table_id', '')::uuid;
    if v_opts is null then
      v_opts := custom._options_table_for(p_organization_id, v_next ->> 'label', p_patch -> 'options');
      v_next := jsonb_set(v_next, '{config,options_table_id}', to_jsonb(v_opts::text));
    else
      update custom.record o
         set deleted_at = now()
       where o.organization_id = p_organization_id
         and o.table_id = v_opts
         and o.deleted_at is null
         and not exists (select 1 from jsonb_array_elements_text(p_patch -> 'options') w
                          where btrim(w.value) = (o.data ->> 'title'));
      for v_word in select btrim(value) from jsonb_array_elements_text(p_patch -> 'options') loop
        if v_word <> '' and not exists (
             select 1 from custom.record o
              where o.organization_id = p_organization_id and o.table_id = v_opts
                and o.deleted_at is null and o.data ->> 'title' = v_word) then
          insert into custom.record (organization_id, table_id, data)
          values (p_organization_id, v_opts, jsonb_build_object('title', v_word));
        end if;
      end loop;
    end if;
  end if;

  update custom.record
     set data = v_next, updated_at = now(), version = version + 1
   where organization_id = p_organization_id
     and id = p_field_id
     and table_id = custom.field_kernel_id();

  return p_field_id;
end;
$function$

;
do $t$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_org uuid := gen_random_uuid(); v_home uuid; v_tbl uuid; v_a uuid; v_b uuid; v_f uuid;
  v_doc jsonb; v_caught text; v_reds int := 0;
begin
  perform set_config('app.actor_system','campaign-test/seatsuites_inverse_proof',true);
  perform set_config('request.jwt.claims', json_build_object('sub',c_admin,'role','authenticated')::text, true);
  insert into iam.organizations (id,name,slug,abbreviation,created_by)
    values (v_org,'The Offside Rule — Trivia Night','offside-rule-trivia-night-'||substr(v_org::text,1,8),'TOR',c_admin);
  insert into iam.memberships (organization_id,container_type,container_id,user_id,role,status)
    values (v_org,'organization',v_org,c_admin,'owner','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note)
    values ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'inv');
  insert into custom.record (organization_id,table_id,data) values (v_org,null,jsonb_build_object('name','The Offside Rule — Main Bar')) returning id into v_home;
  perform set_config('role','authenticated',true);
  -- THE SEAT, PROVEN. Without these three lines "taking the seat" is a spelling, not a fact.
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Quiz team','slug','quiz_teams','type','entity','label_singular','Quiz team','label_plural','Quiz teams',
    'title_field','pname','display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields',jsonb_build_array(jsonb_build_object('name','pname')),'parent_id',v_home::text));
  -- RED 6
  begin
    perform custom.field_declare(v_org,v_tbl,jsonb_build_object('key','pname','label','Pname','plain','text'));
  exception when others then v_caught := sqlerrm; end;
  if v_caught is null then raise exception 'INVERSE PROOF FAILED: field_declare still defines a declared column'; end if;
  raise notice 'RED 6 IS RED with the inverse in place: %', v_caught;
  v_f := custom.field_declare(v_org,v_tbl,jsonb_build_object('label','Phone','plain','text'));
  -- RED 8
  perform custom.field_update(v_org, v_f, jsonb_build_object('unique', true));
  if exists (select 1 from custom.applicable_fields(v_org,v_tbl,null) f where f.id=v_f and coalesce((f.data->>'unique')::boolean,false)) then
    raise exception 'INVERSE PROOF FAILED: field_update still saved unique';
  end if;
  raise notice 'RED 8 IS RED with the inverse in place: the field door said yes to `unique` and changed nothing.';
  -- RED 7
  v_a := custom.record_write(v_org,v_tbl,jsonb_build_object('pname','The Golden Goal','nickname','Goldies'));
  v_b := custom.record_write(v_org,v_tbl,jsonb_build_object('pname','The Golden Goal','nickname','The Goal'));
  perform custom.migrate_merge(v_org,v_a,v_b,'inv 7');
  v_doc := custom.read_record(v_org,v_a,true);
  if v_doc ? '_retired' then raise exception 'INVERSE PROOF FAILED: read_record still carries _retired'; end if;
  raise notice 'RED 7 IS RED with the inverse in place: the read door answers % with no _retired.', v_doc;
  raise notice '=== ALL THREE SEAT-SUITES FIXES PROVEN RED BY THEIR OWN INVERSES. This transaction rolls back. ===';
end $t$;
rollback;
