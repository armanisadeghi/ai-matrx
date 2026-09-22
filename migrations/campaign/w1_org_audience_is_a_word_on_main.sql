-- based-on: public.list_templates(text, boolean) 69483120693b4d55a7e610793cfe03e99262971c0cb7349428a3b93a58896a53
-- based-on: public.ctx_seed_template(jsonb) 3cd4a93c6ed09b0e7576074cc77368774ff433cf512354eb16be49d9e50024cc
-- chair-step: this DROPS a live column, context.templates.is_personal, after copying its meaning
--   into a new column `audience`. 34 rows, 7 of them is_personal = true. Two live bodies read the
--   column and BOTH are replaced here in the same transaction, so no reader is ever pointed at a
--   column that is gone. The client-facing signature does not change: public.list_templates keeps
--   `p_personal_only boolean` and keeps EMITTING `is_personal` alongside the new `audience`, so no
--   caller in either repo has to move before or after this file. A person reads the whole body.
--
-- w1_org_audience_is_a_word_on_main.sql
--
-- W1-ORG — REC-64, THE PRODUCTION HALF, for the MAIN database: A TEMPLATE'S AUDIENCE IS A WORD.
--
-- THE LAW. REC-64: `context.templates.is_personal` becomes `audience ∈ {individual, organization}`.
-- The boolean's two states were the same two facts wearing a name that could not grow — a third
-- audience is a third word here and was a second boolean there.
--
-- WHY THIS FILE EXISTS AS A NEW FILE (W1-ORG-PREP, 2026-09-22)
-- ------------------------------------------------------------
-- The rehearsed bytes are `migrations/campaign/w1_org_is_personal_is_deprecated_and_audience_is_a_word.sql`,
-- headed `-- target: branch` because the night it was written was branch-only. At production that
-- header is a refusal — `pnpm db:apply --judge-only` answers `header-flag-disagree` (measured
-- 2026-09-22) — and the file is ledgered on the rehearsal branch, so its bytes may not be edited.
-- The lane's own precedent is `w1_org_a_door_is_compared_by_argument_type_on_main.sql`: a NEW
-- file, the same statements, a `-- chair-step:` header that says why a person reads it.
--
-- AND WHY IT IS SPLIT. The rehearsed file carried REC-61 (deprecating `iam.organizations.is_personal`)
-- and REC-64 (this) in one transaction. They share nothing but the phrase "is_personal": different
-- schemas, different tables, different readers, different revert — and REC-61 holds ACCESS
-- EXCLUSIVE on `iam.organizations`, which every signup writes to, for as long as the transaction
-- lasts. Splitting them makes both transactions short. REC-61 is now
-- `w1_org_is_personal_is_deprecated_on_main.sql`; the two apply in either order.
--
-- MEASURED ON PRODUCTION, 2026-09-22 (SELECT-only), every assumption this file makes:
--   * `context.templates` holds 34 rows — 7 with is_personal = true, 27 false
--   * it has NO `audience` column yet; `is_personal` is still there
--   * both `-- based-on:` hashes above are production's live bodies, byte-for-byte, and are the
--     same on the nightly clone
--   * `platform.client_callable_door` already carries the row for
--     `public.list_templates(p_category text, p_personal_only boolean)`; this file does not change
--     that signature, so the row still describes it exactly. `public.ctx_seed_template(jsonb)` has
--     NO door row, and gets one here that says in writing why it is a server-only lane.
--
-- THE LOCK, SAID PLAINLY. Every statement is on `context.templates` — 34 rows. `add column` with
-- no default is a catalog change; the `update` touches 34 rows; `set not null`, the CHECK and the
-- `drop column` each take ACCESS EXCLUSIVE on that one small table for milliseconds. Nothing here
-- rewrites a large table and nothing here touches a hot one. `lock_timeout = '5s'` means it gives
-- up rather than queues.
--
-- THE ORDER MATTERS AND IS NOT COSMETIC: the column is added and filled BEFORE either body is
-- replaced, and `is_personal` is dropped BEFORE the new bodies are created — so at no instant
-- inside this transaction does a live body name a column that does not exist, and the two
-- `create or replace` statements at the end are what make the drop safe rather than a bet.
--
-- WHAT MAKES IT FAIL (the guards that own this class):
--   scripts/campaign-tests/w1_org_c7_is_personal_deprecation.sql — block 4 asserts both words
--   land, a third is refused, and `list_templates` emits the word. It declares
--   `column:context.templates.audience` to the shared preamble and SKIPS BY NAME until this file
--   lands.
--
-- REVERT: migrations/inverse/w1_org_audience_is_a_word_on_main_down.sql

set lock_timeout = '5s';

-- 1. THE WORD ARRIVES, CARRYING THE BOOLEAN'S MEANING. ----------------------------------------
alter table context.templates add column audience text;

update context.templates
   set audience = case when is_personal then 'individual' else 'organization' end;

alter table context.templates alter column audience set not null;
alter table context.templates alter column audience set default 'organization';

alter table context.templates
  add constraint templates_audience_is_one_of_two
  check (audience in ('individual', 'organization'));

comment on column context.templates.audience is
  'REC-64: who a template is FOR, as a word — individual or organization. It replaces the boolean is_personal, whose two states were the same two facts wearing a name that could not grow: a third audience is a third word here and was a second boolean there. Default organization, which is what is_personal = false meant.';

-- 2. THE BOOLEAN GOES. ------------------------------------------------------------------------
alter table context.templates drop column is_personal;

-- 3. BOTH READERS FOLLOW IT, IN THE SAME TRANSACTION. -----------------------------------------
-- `list_templates` keeps its signature and keeps emitting `is_personal` as a DERIVED value, so
-- every existing caller keeps working unchanged and can move to `audience` on its own schedule.
create or replace function public.list_templates(p_category text default null::text, p_personal_only boolean default null::boolean)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', t.id, 'key', t.key, 'name', t.name, 'description', t.description,
        'category', t.category, 'icon', t.icon,
        'audience', t.audience,
        'is_personal', (t.audience = 'individual'),
        'scope_types', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'label_singular', tst.label_singular,
              'label_plural', tst.label_plural,
              'icon', tst.icon,
              'field_count', (SELECT count(*) FROM context.template_context_items WHERE template_scope_type_id = tst.id),
              'fields', COALESCE((
                SELECT jsonb_agg(jsonb_build_object('key', tci.key, 'display_name', tci.display_name) ORDER BY tci.sort_order)
                FROM context.template_context_items tci
                WHERE tci.template_scope_type_id = tst.id
              ), '[]'::jsonb)
            ) ORDER BY tst.sort_order
          )
          FROM context.template_scope_types tst
          WHERE tst.template_id = t.id
        ), '[]'::jsonb)
      ) ORDER BY t.sort_order, t.name
    )
    FROM context.templates t
    WHERE t.is_active = true
      AND (p_category IS NULL OR t.category = p_category)
      AND (p_personal_only IS NULL
           OR t.audience = CASE WHEN p_personal_only THEN 'individual' ELSE 'organization' END)
  ), '[]'::jsonb);
END;
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers, non_client_lane)
values
  ('public', 'ctx_seed_template', 'p_template jsonb', array['jsonb'::regtype]::oid[],
   'Takes a whole template document and writes it, with its scope types and context items, as platform seed data. It checks no identity because it is never reached by one: authenticated holds no EXECUTE on it (measured 2026-09-18, re-measured 2026-09-22) and this migration grants none.',
   'w1_org_audience_is_a_word_on_main.sql', false, false,
   'server_only: the seeding lane. It is called by migrations and by the platform seed scripts running as the ledger owner, never from a browser or a PostgREST route - a client that could call it could invent platform-wide context templates for everyone.')
on conflict (schema_name, function_name, identity_argtypes) do nothing;

-- `ctx_seed_template` accepts EITHER word on the way in: a seed document that still says
-- `is_personal` keeps working, and one that says `audience` is taken literally.
create or replace function public.ctx_seed_template(p_template jsonb)
returns uuid
language plpgsql
security definer
as $function$
DECLARE
  v_template_id uuid;
  v_type_record jsonb;
  v_type_id uuid;
  v_field jsonb;
  v_field_sort int;
  v_type_id_map jsonb := '{}'::jsonb;
BEGIN
  INSERT INTO context.templates (key, name, description, category, icon, sort_order, audience)
  VALUES (
    p_template->>'key',
    p_template->>'name',
    COALESCE(p_template->>'description', ''),
    p_template->>'category',
    COALESCE(p_template->>'icon', 'folder'),
    COALESCE((p_template->>'sort_order')::int, 0),
    COALESCE(
      p_template->>'audience',
      CASE WHEN COALESCE((p_template->>'is_personal')::boolean, false)
           THEN 'individual' ELSE 'organization' END)
  )
  RETURNING id INTO v_template_id;
  FOR v_type_record IN SELECT * FROM jsonb_array_elements(p_template->'scope_types')
  LOOP
    INSERT INTO context.template_scope_types (
      template_id, key, label_singular, label_plural, icon, description, sort_order, max_assignments_per_entity
    ) VALUES (
      v_template_id,
      v_type_record->>'key',
      v_type_record->>'singular',
      v_type_record->>'plural',
      COALESCE(v_type_record->>'icon', 'folder'),
      COALESCE(v_type_record->>'description', ''),
      COALESCE((v_type_record->>'sort_order')::int, 0),
      NULLIF((v_type_record->>'max_assignments_per_entity'), '')::smallint
    )
    RETURNING id INTO v_type_id;
    v_type_id_map := v_type_id_map || jsonb_build_object(v_type_record->>'key', v_type_id::text);
    v_field_sort := 0;
    FOR v_field IN SELECT * FROM jsonb_array_elements(COALESCE(v_type_record->'fields', '[]'::jsonb))
    LOOP
      INSERT INTO context.template_context_items (
        template_scope_type_id, key, display_name, description, value_type, sort_order
      ) VALUES (
        v_type_id,
        v_field->>'key',
        v_field->>'display_name',
        COALESCE(v_field->>'description', ''),
        COALESCE(NULLIF((v_field->>'value_type'), '')::context_value_type, 'string'::context_value_type),
        v_field_sort
      );
      v_field_sort := v_field_sort + 1;
    END LOOP;
  END LOOP;
  FOR v_type_record IN SELECT * FROM jsonb_array_elements(p_template->'scope_types')
  LOOP
    IF v_type_record->>'parent_key' IS NOT NULL THEN
      UPDATE context.template_scope_types
      SET parent_template_type_id = (v_type_id_map->>(v_type_record->>'parent_key'))::uuid
      WHERE id = (v_type_id_map->>(v_type_record->>'key'))::uuid;
    END IF;
  END LOOP;
  RETURN v_template_id;
END;
$function$;
