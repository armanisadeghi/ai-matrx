-- chair-step: this REPLACES the body of custom.table_ensure(uuid, jsonb) (born in lane12_two_first_saves_make_one_table.sql, last replaced by lane12_c_an_ensured_table_says_what_differs_from_its_spec.sql) — same signature, same SECURITY DEFINER, same search_path, same grants (CREATE OR REPLACE keeps them). Seven things change: (1) a spec carrying `kept_for` is found by slug AND kept_for, and a spec without one finds only a table kept for nothing — a person's table and an app's table of the same slug are different tables (the advisory lock carries kept_for too); (2) a spec may name an existing Home (`home_id`, one the caller may change, live, in this organization) and the new table is put there instead of in a new Home; `home_id`, `row_defaults` and `members_reach` are never stored on the table by this door. (3) a NEW table's columns keep their declared keys exactly (`cards__flashcard` is no longer rebuilt from its name as `cards_flashcard`); (4) a spec carrying `kept_for` whose table is ARCHIVED (and none live) is REFUSED by name with the remedy — never made a second time; (5) an APP table (`app_table` in the spec) with no named Home goes into the organization's ONE app Home, "Kept by the app" (found or made under its own lock); (6) on birth, `row_defaults` (an instruction) is set through custom.table_row_defaults_set and `members_reach` (an instruction) through custom.share_lane_set(…, 'organization', level) — both as the caller, through their own doors, neither stored on the table; (7) drift also names a stored column the spec no longer declares (aspect `extra`). The `drift` answer is unchanged. No table, column, trigger, policy or grant is touched. Inverse: migrations/inverse/lane12_f_an_ensured_table_finds_its_kept_for_and_takes_a_home_down.sql restores lane12_c's body.
-- lane: PLATFORM-APP-DATA (v6 lane 12)
-- lock: custom
-- based-on: custom.table_ensure(uuid, jsonb) be376c8ab01e14fd61a21ffb5ede4cfe3fc27b205911b7dcdc343b2d4ff757dd
--
-- THE USE CASE (lane KINDS-GLUE, board items L12-6 / L12-7; KINDS-GLUE-WAVE2-DESIGN.md §2). An agent
-- turn's flashcards land in the organization's "flashcard outputs" table: kept by the app
-- (`kept_for: agent_output`), found again on every turn, and living in the one Home all of the
-- organization's output tables share. Cedar Ridge Physical Therapy already has a person's own table
-- whose slug the lander could produce; matching on slug alone would write agent output into it.
--
-- L12-1 (placement, kind, drafts_for, drafts_stamp stored on the table) and L12-2 (full field specs)
-- needed no body change: the spec's keys already reach custom.table_declare and every field spec
-- already reaches custom.field_declare. The records client now sends them (@ai-matrx/records 0.61.0).
--
-- RED before this file (clone, 2026-10-02, as admin@admin.com and test@test.com):
--   aidream apps/shared/records/src/__tests__/an-ensured-table-carries-what-an-agent-output-table-needs.test.ts
--   "L12-6 …" and "L12-7 …"

create or replace function custom.table_ensure(p_organization_id uuid, p_spec jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_name    text := nullif(btrim(p_spec ->> 'name'), '');
  v_slug    text := nullif(btrim(p_spec ->> 'slug'), '');
  v_fields  jsonb := case when jsonb_typeof(p_spec -> 'fields') = 'array' then p_spec -> 'fields' else '[]'::jsonb end;
  v_field   jsonb;
  v_table   uuid;
  v_home    uuid;
  v_created boolean := false;
  v_stored  jsonb;
  v_doc     jsonb;
  v_key     text;
  v_drift   jsonb := '[]'::jsonb;
  -- L12-7: which feature keeps the table this spec describes. A slug is not unique, and two tables
  -- of one slug kept for different things (a person's own, and an app's) are different tables.
  v_kept_for text := nullif(btrim(p_spec ->> 'kept_for'), '');
  -- L12-6: the Home the caller names, when she names one. An instruction, never stored.
  v_home_raw text := nullif(btrim(p_spec ->> 'home_id'), '');
  v_home_given uuid;
  -- VERIFIER 2026-10-02: an archived app table, the app Home, and what a new table's rows start with.
  v_gone      record;
  v_app       boolean := jsonb_typeof(p_spec -> 'app_table') = 'object';
  v_row_defs  jsonb := case when jsonb_typeof(p_spec -> 'row_defaults') = 'object' then p_spec -> 'row_defaults' end;
  v_reach     text := nullif(btrim(p_spec ->> 'members_reach'), '');
  v_keys      text[];
begin
  perform custom.assert_store_door(p_organization_id, 'custom.table_ensure');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_ensure');

  if v_name is null then
    raise exception 'Give the table a name.'
      using errcode = '22023',
            hint = 'A table is found by its slug and made with its name. Nothing was made.';
  end if;
  if v_slug is null then
    v_slug := coalesce(nullif(left(btrim(regexp_replace(lower(v_name), '[^a-z0-9]+', '_', 'g'), '_'), 48), ''), 'table');
  end if;
  if v_home_raw is not null then
    if v_home_raw !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'That home is not one this store knows, so the table was not made.'
        using errcode = '22023', hint = 'Name the Home by its id, or leave it out and one is made. Nothing was made.';
    end if;
    v_home_given := v_home_raw::uuid;
  end if;

  -- THE LOCK IS THE WHOLE RACE GUARANTEE. Held until this transaction ends; the second caller
  -- reads the first one's committed table below instead of making its own.
  perform pg_advisory_xact_lock(
    hashtextextended('custom.table_ensure|' || p_organization_id::text || '|' || v_slug
                     || coalesce('|' || v_kept_for, ''), 0));

  select r.id, (r.data ->> 'parent_id')::uuid into v_table, v_home
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = custom.table_kernel_id()
     and r.data_class = 'table'
     and r.deleted_at is null
     and r.data ->> 'slug' = v_slug
     and nullif(btrim(r.data ->> 'kept_for'), '') is not distinct from v_kept_for
   order by r.created_at, r.id
   limit 1;

  if v_table is null and v_kept_for is not null then
    -- AN ARCHIVED TABLE IS NEVER MADE AGAIN BEHIND THE BACK OF WHOEVER ARCHIVED IT (verifier,
    -- 2026-10-02: an archived app table was silently remade by the next save, so the archive
    -- "worked" and the table came back empty beside it). A table kept for something is found by
    -- slug and kept_for; when none is live and one is archived, this is refused by name, with the
    -- remedy. A table kept for nothing (a person's "Create table") is unchanged: a new one is made.
    select r.id, coalesce(nullif(r.data ->> 'name', ''), v_name) as name into v_gone
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = custom.table_kernel_id()
       and r.data_class = 'table'
       and r.deleted_at is not null
       and r.data ->> 'slug' = v_slug
       and nullif(btrim(r.data ->> 'kept_for'), '') = v_kept_for
     order by r.created_at, r.id
     limit 1;
    if v_gone.id is not null then
      raise exception '% is archived, so it was not made again.', v_gone.name
        using errcode = '55000',
              hint = 'Restore it from Archived tables, then try again. Nothing was made.',
              detail = jsonb_build_object('archived_table_id', v_gone.id)::text;
    end if;
  end if;

  if v_table is not null then
    -- A table she may not know is refused in the read door's own words, never re-made beside it.
    perform custom.assert_may_know_table(p_organization_id, v_table, 'custom.table_ensure');
  elsif v_home_given is null and v_app then
    -- ONE HOME FOR EVERY APP TABLE OF THE ORGANIZATION (verifier, 2026-10-02: each app table made a
    -- Home of its own, so the organization's Homes filled with "<table> Home" entries nobody made).
    -- Named by placement; found or made under its own lock, so two first saves make one Home.
    perform pg_advisory_xact_lock(hashtextextended('custom.table_ensure|app_home|' || p_organization_id::text, 0));
    select h.id into v_home
      from custom.record h
     where h.organization_id = p_organization_id
       and h.table_id = custom.person_kernel_id()
       and h.deleted_at is null
       and h.data ->> 'name' = 'Kept by the app'
     order by h.created_at, h.id
     limit 1;
    if v_home is null then
      v_home := custom.record_write(p_organization_id, custom.person_kernel_id(),
                                    jsonb_build_object('name', 'Kept by the app'));
    end if;
  elsif v_home_given is not null then
    -- L12-6: AN EXISTING HOME, one she may change (a table under it is a change to it), in this
    -- organization and live. No second Home is made.
    perform custom.assert_client_may_change(p_organization_id, v_home_given, 'custom.table_ensure',
                                            'editor'::public.permission_level, 'home');
    if not exists (select 1 from custom.record h
                    where h.organization_id = p_organization_id
                      and h.id = v_home_given
                      and h.deleted_at is null) then
      raise exception 'That home is not here, so the table was not made.'
        using errcode = '22023',
              hint = 'Name a Home of this organization that is not archived, or leave it out and one is made. Nothing was made.';
    end if;
    v_home := v_home_given;
  else
    v_home := custom.record_write(p_organization_id, custom.person_kernel_id(),
                                  jsonb_build_object('name', v_name || ' Home'));
  end if;

  if v_table is null then
    v_table := custom.table_declare(
      p_organization_id,
      (p_spec - 'fields' - 'home_id' - 'row_defaults' - 'members_reach')
        || jsonb_build_object(
             'slug', v_slug,
             'parent_id', v_home,
             -- THE DECLARED KEY, KEPT. A table's `fields` list names each column by its key, and
             -- table_declare's column sketch builds a key from `name` unless one is given — which
             -- collapsed KINDS-GLUE's `cards__flashcard` to `cards_flashcard` and the table was refused.
             'fields', coalesce((select jsonb_agg(jsonb_build_object('name', f ->> 'key', 'key', f ->> 'key') order by n)
                                   from jsonb_array_elements(v_fields) with ordinality e(f, n)
                                  where nullif(f ->> 'key', '') is not null), '[]'::jsonb)));
    v_created := true;

    -- WHAT A NEW TABLE'S ROWS START WITH, AND WHO OF THE ORGANIZATION REACHES IT — each through its
    -- own door, as the caller (who made the table, so may set both). An app table of scope `person`
    -- starts its rows "Only me" (hidden from others' lists, never locked — T-36); an app table every
    -- member adds rows to is reached by members at the level the spec names.
    if v_row_defs is not null then
      perform custom.table_row_defaults_set(p_organization_id, v_table, v_row_defs);
    end if;
    if v_reach is not null then
      perform custom.share_lane_set(p_organization_id, v_table, 'organization', v_reach::public.permission_level);
    end if;
  end if;

  -- THE COLUMNS, through the column door. On a new table every one is defined (the sketches
  -- table_declare made are filled in); on an existing table only a key it does not have yet is
  -- added — a column already defined is never touched, and how it differs from the spec is SAID.
  for v_field in select f from jsonb_array_elements(v_fields) f loop
    v_key := v_field ->> 'key';
    v_stored := null;
    if not v_created then
      select r.data into v_stored
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = custom.field_kernel_id()
         and r.data_class = 'field'
         and r.deleted_at is null
         and r.data ->> 'entity_definition_id' = v_table::text
         and r.data ->> 'key' = v_key
         and not coalesce((r.data ->> 'declared_with_table')::boolean, false)
       order by r.created_at, r.id
       limit 1;
    end if;

    if v_stored is null then
      perform custom.field_declare(p_organization_id, v_table, v_field);
      continue;
    end if;

    -- THE DECLARED SIDE, as the store would have stored it. A spec it cannot read is itself a
    -- difference, named with the store's own sentence — never a refusal of the whole call.
    begin
      v_doc := custom._field_document_for(p_organization_id, v_table, v_field);
    exception when others then
      v_drift := v_drift || jsonb_build_array(jsonb_build_object(
        'field', v_key, 'aspect', 'spec', 'stored', null, 'declared', sqlerrm));
      continue;
    end;

    v_drift := v_drift || coalesce((
      select jsonb_agg(jsonb_build_object('field', v_key, 'aspect', a.aspect, 'stored', a.stored, 'declared', a.declared)
                       order by a.n)
        from (values
          (1, 'type',     to_jsonb(coalesce(v_stored ->> 'parity_type', v_stored ->> 'type')),
                          to_jsonb(coalesce(v_doc ->> 'parity_type', v_doc ->> 'type'))),
          (2, 'format',   to_jsonb(nullif(v_stored ->> 'format', '')),
                          to_jsonb(nullif(v_doc ->> 'format', ''))),
          (3, 'label',    to_jsonb(btrim(v_stored ->> 'label')),
                          to_jsonb(btrim(v_doc ->> 'label'))),
          (4, 'multi',    to_jsonb(coalesce((v_stored ->> 'multi')::boolean, false)),
                          to_jsonb(coalesce((v_doc ->> 'multi')::boolean, false))),
          (5, 'required', to_jsonb(coalesce((v_stored ->> 'required')::boolean, false)),
                          to_jsonb(coalesce((v_doc ->> 'required')::boolean, false))),
          (6, 'unique',   to_jsonb(exists (select 1 from jsonb_array_elements(coalesce(v_stored -> 'rules', '[]'::jsonb)) x
                                            where x ->> 'kind' = 'unique')),
                          to_jsonb(exists (select 1 from jsonb_array_elements(coalesce(v_doc -> 'rules', '[]'::jsonb)) x
                                            where x ->> 'kind' = 'unique')))
        ) a(n, aspect, stored, declared)
       where a.stored is distinct from a.declared), '[]'::jsonb);
  end loop;

  -- A STORED COLUMN THE SPEC NO LONGER DECLARES (verifier, 2026-10-02): kept, never removed, and
  -- said — aspect `extra`, its stored type in `stored`.
  if not v_created then
    select coalesce(array_agg(f ->> 'key'), '{}'::text[]) into v_keys from jsonb_array_elements(v_fields) f;
    v_drift := v_drift || coalesce((
      select jsonb_agg(jsonb_build_object('field', r.data ->> 'key', 'aspect', 'extra',
                                          'stored', coalesce(r.data ->> 'parity_type', r.data ->> 'type'),
                                          'declared', null)
                       order by r.created_at, r.id)
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = custom.field_kernel_id()
         and r.data_class = 'field'
         and r.deleted_at is null
         and r.data ->> 'entity_definition_id' = v_table::text
         and nullif(r.data ->> 'key', '') is not null
         and not ((r.data ->> 'key') = any (v_keys))), '[]'::jsonb);
  end if;

  return jsonb_build_object('table_id', v_table, 'home_id', v_home, 'created', v_created, 'drift', v_drift);
end;
$function$;

comment on function custom.table_ensure(uuid, jsonb) is
  'Lane PLATFORM-APP-DATA: find this organization''s Table by its slug (and kept_for, when the spec keeps it for something) or make it — in the Home the spec names, else a new one — (Home via record_write, Table via table_declare, columns via field_declare) in one transaction under pg_advisory_xact_lock(hash(organization, slug)); idempotent, adds missing columns, never retypes or drops one, and answers drift: every stored column whose type, format, label, multi, required or unique differs from the spec.';
