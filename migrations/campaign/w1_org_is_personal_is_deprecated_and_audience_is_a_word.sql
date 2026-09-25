-- target: branch
-- additive: no
-- based-on: public.list_templates(text,boolean) 69483120693b4d55a7e610793cfe03e99262971c0cb7349428a3b93a58896a53
-- based-on: public.ctx_seed_template(jsonb) 3cd4a93c6ed09b0e7576074cc77368774ff433cf512354eb16be49d9e50024cc
--
-- W1-ORG — REC-61 (second half, AS A DEPRECATION) and REC-64: `is_personal` STOPS BEING A
-- FLAG, AND A TEMPLATE'S AUDIENCE BECOMES A WORD.
--
-- THE LAW
-- -------
-- REC-61: "`iam.organizations.is_personal` is dropped with its CHECK constraint and its
-- partial unique index, every one of its 51 functions, 1 policy and 1 view is classified and
-- rewritten, and `users.user_preferences.default_organization_id` is added …". The preference
-- half LANDED earlier tonight (`w1_org_the_default_organization_is_a_preference.sql`).
-- REC-64: "`context.templates.is_personal` becomes `audience ∈ {individual, organization}`,
-- and the one template mechanism reads that word."
--
-- 🚨 A MEASURED CORRECTION TO THE CONTRACT ROW, RECORDED RATHER THAN QUIETLY WORKED AROUND
-- ----------------------------------------------------------------------------------------
-- REC-61's evidence cell says `is_personal` is "additionally enforced by a CHECK constraint
-- and the partial unique index". Measured on the branch 2026-09-18:
--   select conname from pg_constraint where conrelid='iam.organizations'::regclass
--     and pg_get_constraintdef(oid) ilike '%is_personal%';   -> 0 ROWS
--   select indexname from pg_indexes where schemaname='iam' and tablename='organizations'
--     and indexdef ilike '%is_personal%';
--     -> organizations_one_personal_per_creator
-- THERE IS NO CHECK CONSTRAINT. There is exactly one enforcement object, the partial unique
-- index, and it is the one this file removes. A lane that "dropped the CHECK" would have been
-- dropping something that was never there.
--
-- WHY THIS IS A DEPRECATION AND NOT A DROP, ON THE ORGANIZATION SIDE
-- ------------------------------------------------------------------
-- `iam.organizations.is_personal` is read by 45 function bodies on this database. Dropping the
-- COLUMN tonight would break all of them at once, in one transaction, with no way to land the
-- 45 rewrites behind the same switch — which is a worse system than the one it replaces. So
-- the column is DEPRECATED, which here means four things that are true of nothing else:
--   · its one piece of ENFORCEMENT is gone (the partial unique index), so it no longer rules
--     anything — it only records;
--   · it carries a column comment naming its replacement and the remedy (nothing silent);
--   · it has a row in `platform.deprecated_relations`, the register the campaign already uses
--     for retirements, pointing at `users.user_preferences.default_organization_id`;
--   · `iam.is_personal_dependents()` turns the 45 bodies from a remembered number into a
--     QUERY — the work list the rewrite wave reads, which can never go stale.
-- The column drop itself is the switch step's, after that list empties.
--
-- THE TEMPLATE SIDE IS A REAL CONVERSION, BECAUSE IT CAN BE
-- ---------------------------------------------------------
-- `context.templates.is_personal` has exactly TWO readers — `public.list_templates` and
-- `public.ctx_seed_template` (censused out of `pg_proc`, not remembered) — and 34 rows on
-- production, 0 on the branch. Two readers is a conversion, not a wave: the column becomes
-- `audience`, the two bodies read the word, and `list_templates`'s boolean argument keeps
-- working for every caller that still passes it while its OUTPUT gains the word.
--
-- REVERSIBLE: `migrations/inverse/w1_org_is_personal_is_deprecated_and_audience_is_a_word_down.sql`.

set lock_timeout = '2s';

-- 1. REC-61 — THE ORGANIZATION FLAG STOPS RULING ---------------------------------------------
drop index iam.organizations_one_personal_per_creator;

comment on column iam.organizations.is_personal is
  'DEPRECATED (REC-61 / Doctrine R11: "Default organization is a user preference, never an organization flag"). It no longer rules anything — its partial unique index organizations_one_personal_per_creator was removed by the unified-data campaign, so it records and does not enforce. The replacement is users.user_preferences.default_organization_id, read through iam.default_organization_id(person). Remedy for a body that still reads this column: ask iam.default_organization_id(person) = organizations.id instead, and remove the read. The remaining readers are the live list from iam.is_personal_dependents(); the column is dropped when that list is empty.';

insert into platform.deprecated_relations (old_ref, new_ref, reason)
values ('iam.organizations.is_personal',
        'users.user_preferences.default_organization_id',
        'REC-61 / Doctrine R11. The default organization is a PERSON''s preference, not a property of the organization, so the flag cannot answer the question it was being asked. Enforcement (the partial unique index organizations_one_personal_per_creator) was removed by the campaign; the column stays until iam.is_personal_dependents() returns zero rows.')
on conflict (old_ref) do nothing;

create or replace function iam.is_personal_dependents()
returns table(kind text, identity text, detail text)
language sql
stable
set search_path to 'pg_catalog'
as $function$
  -- THE WORK LIST, AS A QUERY. REC-61 says "every one of its 51 functions, 1 policy and 1 view
  -- is classified and rewritten"; a number written into a document is stale the next morning,
  -- so the list is computed from the catalogue every time it is asked for. A body leaves this
  -- list by being rewritten, never by being exempted.
  select 'function',
         n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         'body reads is_personal'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prosrc ~ '\mis_personal\M'
  union all
  select 'policy', pol.schemaname || '.' || pol.tablename || ' / ' || pol.policyname,
         'policy expression reads is_personal'
    from pg_policies pol
   where coalesce(pol.qual, '') ~ '\mis_personal\M'
      or coalesce(pol.with_check, '') ~ '\mis_personal\M'
  union all
  select 'view', v.schemaname || '.' || v.viewname, 'view definition reads is_personal'
    from pg_views v
   where v.definition ~ '\mis_personal\M'
  union all
  select 'index', i.schemaname || '.' || i.indexname, i.indexdef
    from pg_indexes i
   where i.indexdef ~ '\mis_personal\M'
  union all
  select 'constraint', c.conrelid::regclass::text || ' / ' || c.conname, pg_get_constraintdef(c.oid)
    from pg_constraint c
   where pg_get_constraintdef(c.oid) ~ '\mis_personal\M'
   order by 1, 2;
$function$;

comment on function iam.is_personal_dependents() is
  'REC-61''s classification, as a live query rather than a remembered count: every function body, policy expression, view definition, index and constraint that still reads is_personal. The column is dropped when this returns zero rows. Includes context.templates.is_personal readers too, which is the point — one question, one answer, both tables.';

-- 2. REC-64 — A TEMPLATE'S AUDIENCE IS A WORD ---------------------------------------------------
alter table context.templates add column audience text;

update context.templates
   set audience = case when is_personal then 'individual' else 'organization' end;

alter table context.templates alter column audience set not null;
alter table context.templates alter column audience set default 'organization';
alter table context.templates
  add constraint templates_audience_is_one_of_two
  check (audience in ('individual', 'organization'));

alter table context.templates drop column is_personal;

comment on column context.templates.audience is
  'REC-64: who a template is FOR, as a word — individual or organization. It replaces the boolean is_personal, whose two states were the same two facts wearing a name that could not grow: a third audience is a third word here and was a second boolean there. Default organization, which is what is_personal = false meant.';

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
        -- REC-64: the WORD is the answer. `is_personal` is still emitted, derived from the
        -- word, so no caller reading the old key breaks on the day the column changed — it is
        -- a stand-in and it says so here rather than pretending to be a column.
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

-- `public.ctx_seed_template(jsonb)` is SECURITY DEFINER and was UNDECLARED: it has never had a
-- `platform.client_callable_door` row, so `provision_shape_guard` refuses the first replacement
-- of it (23514, measured on the branch 2026-09-18) until somebody says IN DATA who may call it.
-- Found outside the brief and fixed rather than routed around (rule 20). The answer is: NOBODY
-- with a browser — `authenticated` does not hold EXECUTE on it today and this file does not
-- grant it. `public.list_templates` already carries its door row and keeps it.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers, non_client_lane)
values
  ('public', 'ctx_seed_template', 'p_template jsonb', array['jsonb'::regtype]::oid[],
   'Takes a whole template document and writes it, with its scope types and context items, as platform seed data. It checks no identity because it is never reached by one: authenticated holds no EXECUTE on it (measured 2026-09-18) and this migration grants none.',
   'w1_org_is_personal_is_deprecated_and_audience_is_a_word.sql', false, false,
   'server_only: the seeding lane. It is called by migrations and by the platform seed scripts running as the ledger owner, never from a browser or a PostgREST route - a client that could call it could invent platform-wide context templates for everyone.')
on conflict (schema_name, function_name, identity_argtypes) do nothing;

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
  -- REC-64: the seed takes the WORD when it is given one, and still understands a caller that
  -- only knows the old boolean. An `audience` that is neither word is refused by the table's
  -- own CHECK rather than silently coerced.
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

  -- First pass: insert all scope types (without parent refs)
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

  -- Second pass: resolve parent_template_type_id for nested types
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
