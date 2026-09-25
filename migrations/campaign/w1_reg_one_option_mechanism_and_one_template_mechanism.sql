-- target: branch
--
-- REC-49 · REC-50 · REC-35 · REC-N-13 · REC-65 · REC-67 — ONE OPTION MECHANISM, ONE
-- TEMPLATE MECHANISM, AND EVERY OTHER IMPLEMENTATION NAMED AS CONVERGING INTO IT.
--
-- WHAT A "CONVERGENCE DECLARATION" IS, AND WHY IT IS A ROW RATHER THAN A DOCUMENT
-- ------------------------------------------------------------------------------
-- Five of this lane's rows say the same shape of thing: there are N live implementations of
-- one idea, one of them survives, and the rest converge into it. None of them can be
-- EXECUTED tonight — moving the rows is switch-checklist step 8's backfill and dropping the
-- stores is step 12 — so what the campaign owes is the RECORD: which store survives, which
-- ones converge into it, and where each one's rows are going. A record nobody can query is
-- a sentence in a document; a record in the database is something `W7-MAP` can read, a
-- verifier can re-derive, and a drift check can fail on.
--
-- THE REGISTER ALREADY EXISTS AND THIS CAMPAIGN DOES NOT INVENT A SECOND ONE.
-- `platform.deprecated_relations (old_ref, new_ref, archived_as, reason)` is live, held zero
-- rows before this lane, and says exactly "this old thing is replaced by that new thing".
-- Every declaration below is one of its rows. A row here is a RECORD, never an enforcement:
-- the only enforcement in this file is REC-50's write guard, and it is named as such.
--
-- REC-50 — THE ONE TEMPLATE MECHANISM IS `context.templates`, AND IT IS NOT A PREFERENCE
-- ---------------------------------------------------------------------------------------
-- The contract's own next row settles it rather than a builder's taste: REC-64 (`W1-ORG`)
-- reads "`context.templates.is_personal` becomes `audience ∈ {individual, organization}`,
-- and the one template mechanism reads that word" — the store that GAINS the audience word
-- is the store that survives. It is also the largest by a distance (34 templates, 846 items,
-- 116 scope types on production per REC-50's own proof) and the only one with a template
-- ITEM model at all.
--
-- The six that converge into it, measured on the branch 2026-09-18 by `information_schema`
-- rather than typed from the contract: `seo.starter_pack` (+ `seo.starter_pack_item`),
-- `web.offering_template`, `workflow.template`, `agent.template`, `research.rs_template`,
-- `workbench.schema_templates`. Each one gets, here, exactly what REC-50 says the campaign
-- owes — the type Deprecated, the REC-55 write guard, and its register row — and exactly
-- nothing else: no rename, no drop, no row moved, and each store's row count is asserted
-- UNCHANGED across this file.
--
-- 🚨 `context.templates`, `context.template_context_items` and `context.template_scope_types`
-- are the survivor and are NOT guarded, NOT typed Deprecated and NOT recorded here. A file
-- that guarded the survivor would be a silent outage on the one store the platform keeps.
--
-- REC-49 — ONE OPTION MECHANISM, AND WHY IT ABSORBS STRUCTURED LISTS FOR FREE
-- ---------------------------------------------------------------------------
-- An option set is a Table and an option is a Record (REC-6: "every Record has identity,
-- always — categories, relations-with-details, facts at a crossing"). That is the one
-- mechanism, and it lives in `custom.record`. The three live mechanisms REC-49 names,
-- re-measured here: `workbench.udt_structured_lists` + `udt_structured_list_items`;
-- 73 Postgres enum types carrying 749 labels (exactly the contract's numbers, still true on
-- the branch); and the `options` jsonb columns, of which the branch carries 6 (the contract
-- measured 7 on production — the cell is the query, not the number, so both are recorded by
-- enumeration rather than by count).
--
-- The nine `context.*` / `workbench.*` source TABLES belong to `W7-DEPR-DATA`, whose row
-- names them one by one; this file records the convergence and leaves their guards and
-- their retirement to that lane, because two lanes guarding one table is how a retirement
-- gets undone by the second one's inverse.
--
-- REC-65 RIDES ON REC-49 AND IS STRUCTURAL ONCE AN OPTION IS A RECORD
-- -------------------------------------------------------------------
-- REC-65: "editing a pick-list preserves its item ids". MEASURED on the branch 2026-09-18,
-- and it is worse than DD-258 records: the door `public.update_user_list(uuid, varchar,
-- text, boolean, boolean, boolean, jsonb)` delegates to
-- `public._d31_impl_update_user_list`, whose body runs `DELETE FROM
-- workbench.udt_structured_list_items WHERE list_id = p_list_id` and then re-INSERTs every
-- item from the payload — and the payload carries `Label`, `Description`, `Help Text` and
-- `Group` and NO id at all, so the ids cannot be preserved by that function no matter how it
-- is written. Rule 4 gives this campaign exactly ONE replacement of a live body (`W2-PRED`'s,
-- named, with a rollback) and refuses a third, so this file does not rewrite it. It records
-- the requirement against the mechanism that satisfies it by construction: once an option is
-- a Record in `custom.record`, an edit is a write to Records that already have identity, and
-- there is no delete-and-reinsert to preserve ids through.
--
-- REC-35 / REC-N-13 — THE CUSTOM-FIELD IMPLEMENTATIONS, INCLUDING THE ONE ON ANOTHER DATABASE
-- -------------------------------------------------------------------------------------------
-- REC-N-13 says CMS collections' `field_schema` is a SIXTH custom-field implementation.
-- MEASURED 2026-09-18: `site_collections` does not exist on this database or on the
-- rehearsal branch at all, and neither does a `cms` schema — the CMS runs on its own Supabase
-- project, and the shape lives in `aidream/aidream/services/cms/collections.py`
-- (`_validate_field_schema`, field types text · richtext · number · boolean · email · url ·
-- datetime · select · json). So it cannot be typed, guarded or counted here, and this file
-- records it as what it is: an implementation on another database, named with the code that
-- owns it, so the sixth store is not the one everybody forgets.
--
-- REC-67 — THE WORD `custom` HAS EXACTLY ONE MEANING, AND THE RENAMES ARE CUTOVER STEPS
-- -------------------------------------------------------------------------------------
-- MEASURED on the branch 2026-09-18: `entity_types_version_store_check` still reads
-- `CHECK (version_store = ANY (ARRAY['history','custom']))` with 3 rows using `custom`, and
-- the knob ladder carries 17 rows under `feature = 'extensibility'`. Both renames change a
-- live value's meaning under live readers, which is precisely what REL-15 is a switch-
-- checklist step for (§1: "the SIX rows no lane builds"), so this file records both with
-- their exact counts instead of performing them.
--
-- REVERSIBLE: `migrations/inverse/w1_reg_one_option_mechanism_and_one_template_mechanism_down.sql`.

set lock_timeout = '2s';
set statement_timeout = '600s';

-- ============================================================ REC-50: the six converge
do $w1reg$
declare
  r record;
  v_before jsonb := '{}'::jsonb;
  v_after  jsonb := '{}'::jsonb;
  v_n bigint;
  v_msg text;
  v_guarded int := 0;
  c_stores constant text[][] := array[
    array['seo','starter_pack'], array['seo','starter_pack_item'],
    array['web','offering_template'], array['workflow','template'],
    array['agent','template'], array['research','rs_template'],
    array['workbench','schema_templates']
  ];
begin
  -- The survivor must exist, or the convergence has no target and this file is meaningless.
  if to_regclass('context.templates') is null then
    raise exception 'REC-50: context.templates — the one template mechanism — does not exist on this database';
  end if;

  for r in select c_stores[i][1] as s, c_stores[i][2] as t
             from generate_subscripts(c_stores, 1) i
  loop
    if to_regclass(format('%I.%I', r.s, r.t)) is null then
      raise exception 'REC-50: %.% does not exist on this database — the store list is stale', r.s, r.t;
    end if;

    execute format('select count(*) from %I.%I', r.s, r.t) into v_n;
    v_before := v_before || jsonb_build_object(r.s || '.' || r.t, v_n);

    -- the register row, carrying the prior registry values so the inverse restores exactly
    insert into platform.deprecated_relations (old_ref, new_ref, archived_as, reason)
    select r.s || '.' || r.t,
           'context.templates',
           null,
           'REC-50 (W1-REG): one template mechanism carries the industry templates and this store converges into it. Write-guarded and typed Deprecated by this campaign; its rows move at switch-checklist step 8 and it is dropped at step 12 — never by a campaign. PRIOR=' ||
           coalesce((select jsonb_build_object('type', e.type, 'type_reason', e.type_reason,
                                               'custom_fields_enabled', e.custom_fields_enabled)::text
                       from platform.entity_types e
                      where e.schema_name = r.s and e.table_name = r.t), '{}')
    on conflict (old_ref) do nothing;

    update platform.entity_types e
       set type = 'deprecated',
           type_reason = 'REC-50: one template mechanism carries the industry templates — context.templates (REC-64 gives it the audience word). This store converges into it: typed Deprecated and write-guarded, still is_active because it is still READ until switch-checklist step 8 moves its rows. A type is not an enforcement word.',
           custom_fields_enabled = false
     where e.schema_name = r.s and e.table_name = r.t;

    if not exists (select 1 from pg_trigger tg
                    where tg.tgrelid = format('%I.%I', r.s, r.t)::regclass
                      and not tg.tgisinternal
                      and tg.tgfoid = 'platform._deprecated_write_guard()'::regprocedure) then
      execute format('create trigger _deprecated_write_guard before insert or update or delete on %I.%I '
                     'for each row execute function platform._deprecated_write_guard()', r.s, r.t);
    end if;

    -- the guard, EXERCISED: a planted INSERT must come back as the guard's own refusal.
    begin
      execute format('insert into %I.%I default values', r.s, r.t);
      raise exception 'REC-50: %.% took an INSERT after being guarded', r.s, r.t;
    exception when check_violation then
      get stacked diagnostics v_msg = message_text;
      if v_msg not like '%DEPRECATED and takes no writes%' then
        raise exception 'REC-50: %.% refused the INSERT for another reason: %', r.s, r.t, v_msg;
      end if;
      v_guarded := v_guarded + 1;
    end;

    execute format('select count(*) from %I.%I', r.s, r.t) into v_n;
    v_after := v_after || jsonb_build_object(r.s || '.' || r.t, v_n);
  end loop;

  if v_before <> v_after then
    raise exception 'REC-50: a store''s row count MOVED across this file — before % after %', v_before, v_after;
  end if;
  if v_guarded <> 7 then
    raise exception 'REC-50: % of 7 stores proved their guard, not all of them', v_guarded;
  end if;

  -- the survivor is untouched, and that is asserted rather than assumed
  if exists (select 1 from pg_trigger tg
              where tg.tgrelid in ('context.templates'::regclass,
                                   'context.template_context_items'::regclass,
                                   'context.template_scope_types'::regclass)
                and not tg.tgisinternal
                and tg.tgfoid = 'platform._deprecated_write_guard()'::regprocedure) then
    raise exception 'REC-50: the SURVIVING template mechanism was write-guarded — that is an outage, not a convergence';
  end if;
  if exists (select 1 from platform.entity_types
              where schema_name = 'context' and table_name in ('templates','template_context_items','template_scope_types')
                and type = 'deprecated') then
    raise exception 'REC-50: the surviving template mechanism was typed Deprecated';
  end if;

  raise notice 'W1-REG REC-50: the one template mechanism is context.templates (REC-64 gives it the audience word); 7 tables across 6 stores are typed Deprecated, write-guarded and recorded as converging into it, every guard exercised by a refused INSERT, and every row count unchanged: %', v_after;
end
$w1reg$;

-- ============================================================ REC-49: one option mechanism
do $w1reg$
declare
  v_enums int; v_labels int; v_opts int; v_lists int;
begin
  -- the three live mechanisms, enumerated rather than counted
  insert into platform.deprecated_relations (old_ref, new_ref, archived_as, reason)
  values ('workbench.udt_structured_lists', 'custom.record (an option set is a Table; an option is a Record)', null,
          'REC-49 (W1-REG): option sets and options are ONE mechanism, and it absorbs structured lists. Declaration only — the table itself is W7-DEPR-DATA''s to guard and retire, and two lanes guarding one table is how a retirement gets undone.'),
         ('workbench.udt_structured_list_items', 'custom.record (an option is a Record with identity)', null,
          'REC-49 (W1-REG): the items of a structured list become Records. Declaration only — W7-DEPR-DATA owns this table.'),
         ('public._d31_impl_update_user_list', 'custom.record (an option is a Record, so an edit preserves ids by construction)', null,
          'REC-65 (W1-REG): MEASURED 2026-09-18 — this body DELETEs every udt_structured_list_items row for the list and re-INSERTs from a payload that carries Label/Description/Help Text/Group and NO id, so item ids churn on every edit and history, relations and links to an option break (DD-258). Rule 4 gives this campaign one live-body replacement and it is W2-PRED''s, so this is RECORDED, not rewritten: the requirement is satisfied structurally once an option is a Record.')
  on conflict (old_ref) do nothing;

  insert into platform.deprecated_relations (old_ref, new_ref, archived_as, reason)
  select 'type:' || n.nspname || '.' || t.typname,
         'custom.record (an option set is a Table; its options are Records)',
         null,
         'REC-49 (W1-REG): a Postgres enum type is an option set whose options a customer can never edit. Recorded as converging into the one mechanism; nothing here changes the type, and no live column loses it inside this campaign.'
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
   where t.typtype = 'e'
     and n.nspname not in ('pg_catalog','information_schema')
  on conflict (old_ref) do nothing;

  insert into platform.deprecated_relations (old_ref, new_ref, archived_as, reason)
  select c.table_schema || '.' || c.table_name || '.' || c.column_name,
         'custom.record (an option set is a Table; its options are Records)',
         null,
         'REC-49 (W1-REG): an `options` jsonb column is an option set with no identity — its options cannot be referenced, counted or renamed without rewriting every row that quotes them. Recorded as converging into the one mechanism.'
    from information_schema.columns c
    join information_schema.tables ta
      on ta.table_schema = c.table_schema and ta.table_name = c.table_name and ta.table_type = 'BASE TABLE'
   where c.column_name in ('options','option_set','options_json')
     and c.data_type = 'jsonb'
     and c.table_schema not in ('pg_catalog','information_schema','deprecated')
  on conflict (old_ref) do nothing;

  select count(*) into v_enums from pg_type t join pg_namespace n on n.oid = t.typnamespace
   where t.typtype = 'e' and n.nspname not in ('pg_catalog','information_schema');
  select count(*) into v_labels from pg_enum;
  select count(*) into v_opts from platform.deprecated_relations where reason like 'REC-49 (W1-REG): an `options` jsonb%';
  select count(*) into v_lists from platform.deprecated_relations where reason like 'REC-49 (W1-REG)%';

  raise notice 'W1-REG REC-49: the one mechanism is custom.record — an option set is a Table, an option is a Record. Recorded: % enum type(s) carrying % label(s), % `options` jsonb column(s), and the two structured-list tables; % REC-49 rows in the register.',
    v_enums, v_labels, v_opts, v_lists;
end
$w1reg$;

-- ================================================ REC-35 / REC-N-13: the custom-field stores
do $w1reg$
declare v_n int;
begin
  insert into platform.deprecated_relations (old_ref, new_ref, archived_as, reason)
  values
    ('platform.custom_field_definition', 'custom.record + the Field kernel Table', null,
     'REC-35 (W1-REG): one custom data system, `custom`, extends the entity registry and every existing implementation collapses into it. Declaration only — this table is W7-DEPR-PLAT''s to guard and retire.'),
    ('platform.custom_field_target', 'custom.record + the Field kernel Table', null,
     'REC-35 (W1-REG): same system, same convergence. Declaration only — W7-DEPR-PLAT owns this table.'),
    ('users.user_form_profile.custom_fields', 'custom.record (custom fields are Values on a Record)', null,
     'REC-35 (W1-REG): MEASURED — the ONE live `custom_fields` column in the whole database today, and it is not the campaign''s guarded one on crm.party. Its contents converge into the record store; the column is recorded, never dropped.'),
    ('context.context_items', 'custom.record (a context item is a Record)', null,
     'REC-35 (W1-REG): the context system is a custom-field implementation in everything but name. Declaration only — W7-DEPR-DATA owns this table.'),
    ('context.context_item_values', 'custom.record (a value is a Value on a Record)', null,
     'REC-35 (W1-REG): same system, same convergence. Declaration only — W7-DEPR-DATA owns this table.'),
    ('cms:site_collections.field_schema', 'custom.record + the Field kernel Table', null,
     'REC-N-13 (W1-REG): the SIXTH custom-field implementation, and the one that is invisible from here — MEASURED 2026-09-18, neither `site_collections` nor a `cms` schema exists on this database or the rehearsal branch, because the CMS runs on its own Supabase project. The shape is owned by aidream/aidream/services/cms/collections.py (_validate_field_schema); its flat type list is text, richtext, number, boolean, email, url, datetime, select, json — no relations. Recorded here so the store on another database is not the one nobody converges.')
  on conflict (old_ref) do nothing;

  select count(*) into v_n from platform.deprecated_relations
   where reason like 'REC-35 (W1-REG)%' or reason like 'REC-N-13 (W1-REG)%';
  raise notice 'W1-REG REC-35/REC-N-13: % custom-field implementation(s) recorded as converging into the one system, the sixth of them living on the CMS''s own database and named with the code that owns it.', v_n;
end
$w1reg$;

-- ================================================ REC-67: one meaning for the word `custom`
do $w1reg$
declare v_store int; v_knob int; v_check text;
begin
  select count(*) into v_store from platform.entity_types where version_store = 'custom';
  select count(*) into v_knob from platform.feature_knob where feature = 'extensibility';
  select pg_get_constraintdef(oid) into v_check from pg_constraint where conname = 'entity_types_version_store_check';

  insert into platform.deprecated_relations (old_ref, new_ref, archived_as, reason)
  values
    ('platform.entity_types.version_store=custom', 'platform.entity_types.version_store=local', null,
     format('REC-67 (W1-REG): `custom` means ORIGIN — a table or field an organization defined — and nothing else. Here it means "this table keeps its own version store", which is one name for two things (Doctrine R16). MEASURED 2026-09-18: %s row(s) use it and the live constraint reads %s. The rename changes a live value under live readers, so it is a switch-checklist step of REL-15''s class, recorded here rather than performed by a lane.', v_store, v_check)),
    ('platform.feature_knob.feature=extensibility', 'platform.feature_knob.feature=custom', null,
     format('REC-67 (W1-REG): the knob feature `extensibility` is the same idea wearing a second name. MEASURED 2026-09-18: %s knob row(s) carry it. A rename moves every override and every reader with it, so it is a switch-checklist step, recorded here.', v_knob)),
    ('db-rules §2: "custom fields" for a table''s own domain columns', 'db-rules §2: "domain columns"', null,
     'REC-67 (W1-REG): the third of REC-67''s three, and the only one that is a document rather than a value — recorded in the same register so the word''s three meanings are counted in one place.')
  on conflict (old_ref) do nothing;

  raise notice 'W1-REG REC-67: the three places the word `custom` means something else are recorded — version_store (% rows), the knob feature `extensibility` (% rows) and db-rules §2''s phrase. All three are renames of live values and belong to the switch checklist, not to a lane.', v_store, v_knob;
end
$w1reg$;
