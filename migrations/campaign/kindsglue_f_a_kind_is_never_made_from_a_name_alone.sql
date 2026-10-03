-- lane KINDS-GLUE wave 1b (2026-10-02) — a kind is never created from a picker with only a name.
--
-- WHY. content_ir_kind is an active, reference-pickable token with a title column, so
-- public.entity_row_create('content_ir_kind', '<name>', <org>) inserted a bare kind_definition row — no schema,
-- no disposition. kindsglue_c's trigger now refuses that insert, but with "The kind <NULL> does not say…" (the
-- door never sets the slug). The registry already has the word for "made through its own door":
-- the Table API's facts, create_via ("insert, refuse, or a named server door"), kept by lane 7 in the knob
-- table_api/standard_tables (chair ruling: a knob, not registry columns) and read only through
-- platform.api_facts(token). This file:
--   1. names content_ir_kind's door in that knob: create_via = 'content_ir.kind_create' (the agent tool and the
--      Shapes studio, both of which require a disposition). The token gets no reach (api_facts answers 'none'
--      for a key that says nothing else), so the Table API does not start reaching kinds;
--   2. teaches entity_row_create to honour a NAMED door: a token whose create_via is neither 'insert' nor 'refuse'
--      is refused with a plain sentence before any insert. Every other token keeps today's behaviour (all are
--      'refuse', which this door has never read and still does not).
-- NEEDS THE CHAIR'S CONSENT before production: entity_row_create is a chair-owned store door and
-- platform.entity_types a chair-owned registry.
-- Locks: pg_proc row lock; one row lock on platform.feature_knob.
-- based-on: public.entity_row_create(text, text, uuid) 5190c99e16b37313b8c23c51af5f3e5cec0ed50a0c3e5876155954a3167cbc8f
-- lane: KINDS-GLUE
-- INVERSE: migrations/inverse/kindsglue_f_a_kind_is_never_made_from_a_name_alone_down.sql

select set_config('app.actor_system', 'migration/kindsglue_f', true);

update platform.feature_knob
   set value = jsonb_set(value, '{content_ir_kind}',
                         coalesce(value -> 'content_ir_kind', '{}'::jsonb) || '{"create_via": "content_ir.kind_create"}'::jsonb)
 where feature = 'table_api' and key = 'standard_tables'
   and value -> 'content_ir_kind' ->> 'create_via' is distinct from 'content_ir.kind_create';

CREATE OR REPLACE FUNCTION public.entity_row_create(p_token text, p_title text, p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_et    record;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_id    uuid;
begin
  if v_actor is null then
    raise exception 'entity_row_create: nobody is signed in.' using errcode = '42501';
  end if;
  if v_title is null then
    raise exception 'entity_row_create: a new % needs a name.', coalesce(p_token, 'record')
      using errcode = '22004';
  end if;
  if p_organization_id is null then
    raise exception 'entity_row_create: name the organization this belongs to.'
      using errcode = '22004';
  end if;
  if not iam.has_org_access(p_organization_id) then
    raise exception 'entity_row_create: that is not an organization you can act in.' using errcode = '42501',
            detail = jsonb_build_object('organization_id', p_organization_id)::text;
  end if;

  select et.schema_name, et.table_name, et.title_column, et.audit_class, et.label,
         (select f.create_via from platform.api_facts(p_token) f) as create_via
    into v_et
    from platform.entity_types et
   where et.token = p_token and et.is_active and et.reference_pickable;
  if not found then
    raise exception 'entity_row_create: % is not a reference-pickable entity.', p_token
      using errcode = '22023',
            hint = 'Only an active, reference-pickable token in platform.entity_types can be created from a picker.';
  end if;
  if v_et.title_column is null then
    raise exception 'entity_row_create: a % has no single name column, so it cannot be created from a name alone.', coalesce(v_et.label, p_token)
      using errcode = '22023';
  end if;
  -- ACCESS MACHINERY IS NEVER REACHED BY A GENERIC "MAKE ME A ROW".
  if coalesce(v_et.audit_class, 'entity') = 'machinery' then
    raise exception 'entity_row_create: % is access machinery and is never created from a picker.', coalesce(v_et.label, p_token)
      using errcode = '42501';
  end if;
  -- A TOKEN WHOSE API FACTS NAME ITS OWN SERVER DOOR (create_via is neither 'insert' nor
  -- 'refuse') is never made from a name alone: that door asks the questions a bare row cannot
  -- answer (a kind must say what its output is — KINDS-GLUE).
  if coalesce(v_et.create_via, 'refuse') not in ('insert', 'refuse') then
    raise exception 'entity_row_create: a % is not made from a name alone — create it where it is built.', coalesce(v_et.label, p_token)
      using errcode = '22023',
            hint = format('Its API facts name its own door: %s.', v_et.create_via);
  end if;
  -- 🚨 A TABLE WITH NO `organization_id` CANNOT CARRY ONE, and the direct path has been
  -- sending it anyway and getting 42703. `iam.organizations` is that table: creating an
  -- organization is `public.org_create`, which asks a different set of questions.
  if not exists (select 1 from information_schema.columns c
                  where c.table_schema = v_et.schema_name
                    and c.table_name = v_et.table_name
                    and c.column_name = 'organization_id') then
    raise exception 'entity_row_create: a % is not something that lives inside an organization, so it cannot be created here.', coalesce(v_et.label, p_token)
      using errcode = '22023',
            hint = 'An organization itself is created with public.org_create.';
  end if;

  execute format(
    'insert into %I.%I (%I, created_by, organization_id) values ($1, $2, $3) returning id',
    v_et.schema_name, v_et.table_name, v_et.title_column)
    into v_id using v_title, v_actor, p_organization_id;

  return jsonb_build_object('id', v_id, 'title', v_title, 'token', p_token);
end;
$function$;
