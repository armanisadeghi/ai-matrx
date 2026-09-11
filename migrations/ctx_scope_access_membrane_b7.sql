-- ctx_scope_access_membrane_b7.sql
--
-- B-7 — SCOPE VALUES INHERIT THE SCOPE'S ACCESS (Data Doctrine program, D1 finding 1 / D12 R-1,
-- re-scoped by the chair 2026-09-11 after the RED probe falsified the original premise).
--
-- WHAT THE RED PROBE ACTUALLY FOUND (live brsgrqvjdzwihsvnfqkf, 2026-09-11, rolled back):
--   1. The claimed TABLE-level leak does not exist. `context_item_values_select` reads
--      `scope_id IN (SELECT s.id FROM context.scopes s WHERE s.organization_id IN (SELECT iam.my_orgs()))`,
--      and a policy subquery runs with the QUERYING role's privileges — so that subquery is itself
--      filtered by `scopes`' canonical membrane. Flipping a scope to `personal` took a non-creator
--      member's visible values from 37 to 0.
--   2. The leak is REAL but it is in the SECURITY DEFINER door, where RLS does not run at all.
--      `public.get_scope_context` authorizes on `iam.has_org_access` only and handed that same
--      member 16 populated cells of the same personal scope. Census: 59 SECURITY DEFINER functions
--      read `context.scopes|context_items|context_item_values` and ZERO call `iam.has_access('scope', …)`.
--   3. Two defects in the OPPOSITE direction of the brief: a real `viewer` grant in `iam.permissions`
--      opened the scope but yielded 0 values and 0 field definitions (conveyance broken), and a plain
--      member deleted all 37 append-only value rows of a scope they merely had org membership on.
--
-- THIS MIGRATION, IN TWO PARTS:
--   A. THE DOOR. One helper pair in schema `context` — `_scope_readable` (boolean) and
--      `_assert_scope_readable` (raises a human sentence) — and every SECURITY DEFINER function that
--      returns or writes a scope's CELL VALUES now goes through it instead of testing organization
--      membership. That is the class fix: the eight functions whose bodies name
--      `context.context_item_values`.
--   B. THE MEMBRANE. `context.context_item_values` becomes a registered COMPONENT of `scope` and is
--      given the canonical generated component lane (`iam.apply_rls(…,'component')`), so the parent
--      membrane is emitted ONCE PER QUERY (THE COMPONENT-ACCESS PRECEDENT, 2026-08-08) instead of
--      being inherited by accident through a subquery. This is what fixes (3): a `viewer` grant now
--      conveys the values, and writes/deletes are gated at the scope's EDITOR level.
--
-- DELIBERATELY NOT TOUCHED (order constraint for the custom-data unification, recorded here because
-- it is a live trap): `context.context_items` and `context.scope_types` keep their current policies.
-- `context.scope_types` has NO `created_by` and NO `visibility`, so
-- `iam.accessible_entity_ids('scope_type','viewer')` returns 0 ids for an ordinary member while RLS
-- shows them 4 rows. Making `context_items` a component of `scope_type` today would take field
-- definitions from 57 visible to 0 for every user and blank the scopes UI. `scope_type` needs a base
-- retrofit (created_by + visibility) and a canonical entity lane FIRST.
--
-- Idempotent: every function rewrite is a guarded string replacement against the LIVE definition, so
-- re-running is a no-op and nothing but the named predicate can move.

-- ============================================================================
-- PART A — THE DOOR
-- ============================================================================

-- The one place that answers "may this caller open this record?". Everything else calls it.
-- `service_role` is the server's own trusted lane: it has already authorized its user, and the
-- per-user variant below is how the server asks on that user's behalf.
create or replace function context._scope_readable(
  p_scope_id uuid,
  p_level text default 'viewer'
) returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  if p_scope_id is null then
    return false;
  end if;
  if auth.role() = 'service_role' then
    return true;
  end if;
  return coalesce(iam.has_access('scope', p_scope_id, p_level::public.permission_level), false);
end;
$fn$;

comment on function context._scope_readable(uuid, text) is
  'B-7: does the CURRENT caller hold p_level on this scope? The canonical membrane (visibility, '
  'grants in iam.permissions, memberships, reachability/conveyance), never organization membership. '
  'service_role short-circuits: the server authorizes its own user and asks per-user via '
  'context._scope_readable_for.';

-- The per-user variant. `resolve_full_context` assembles context FOR a named user, not for the
-- caller, so it cannot ask about auth.uid().
create or replace function context._scope_readable_for(
  p_user_id uuid,
  p_scope_id uuid,
  p_level text default 'viewer'
) returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  if p_user_id is null or p_scope_id is null then
    return false;
  end if;
  return coalesce(iam.has_access_for(p_user_id, 'scope', p_scope_id, p_level::public.permission_level), false);
end;
$fn$;

comment on function context._scope_readable_for(uuid, uuid, text) is
  'B-7: does the NAMED user hold p_level on this scope? Used by the agent context assembly path, '
  'which resolves context for a user who is not the caller.';

-- The raising form. NOTHING FAILS SILENTLY: the refusal is a real error with a sentence a person can
-- act on, and it names the record (a signed-in user may be told kind + name — the 2026-08-11
-- disclosure ruling) so "I cannot see my own case" is a five-second conversation.
create or replace function context._assert_scope_readable(
  p_scope_id uuid,
  p_level text default 'viewer'
) returns void
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_name text;
begin
  if context._scope_readable(p_scope_id, p_level) then
    return;
  end if;

  select s.name into v_name
  from context.scopes s
  where s.id = p_scope_id and s.deleted_at is null;

  if v_name is null then
    raise exception 'That record no longer exists, or it was deleted.'
      using errcode = '42501';
  end if;

  if p_level = 'viewer' then
    raise exception 'You do not have access to "%". Ask someone who can already open it to share it with you.', v_name
      using errcode = '42501';
  else
    raise exception 'You can view "%" but you cannot change it. Ask for edit access on that record.', v_name
      using errcode = '42501';
  end if;
end;
$fn$;

comment on function context._assert_scope_readable(uuid, text) is
  'B-7: the gate every SECURITY DEFINER function that serves a scope''s cell values must call. RLS '
  'does not run inside a DEFINER function, so this is the only thing standing between a caller and '
  'another person''s record.';

-- ---------------------------------------------------------------------------
-- A.1 — the two read doors that shared one org-membership check, byte-identical in both bodies
--       (public.get_scope_context, public.get_value_history)
-- ---------------------------------------------------------------------------
do $mig$
declare
  v_old text :=
    '  if (auth.role() = ''service_role'' or iam.has_org_access(v_org_id)) is not true then' || chr(10) ||
    '    raise exception ''not authorized for organization %'', v_org_id' || chr(10) ||
    '      using errcode = ''42501'';' || chr(10) ||
    '  end if;';
  v_new text := '  perform context._assert_scope_readable(p_scope_id, ''viewer'');';
  v_fn text;
  v_def text;
begin
  foreach v_fn in array array[
    'public.get_scope_context(uuid,uuid[],boolean)',
    'public.get_value_history(uuid,uuid,integer)'
  ] loop
    v_def := pg_get_functiondef(v_fn::regprocedure);
    if position(v_old in v_def) = 0 then
      if position('_assert_scope_readable' in v_def) > 0 then
        raise notice 'B-7: % already carries the membrane; skipping', v_fn;
        continue;
      end if;
      raise exception
        'B-7: could not find the organization-membership check in % — it changed under this migration. Re-read the live body before re-running.', v_fn;
    end if;
    execute replace(v_def, v_old, v_new);
  end loop;
end
$mig$;

-- ---------------------------------------------------------------------------
-- A.2 — public.set_scope_context_value: the client write door. Membership became EDITOR.
-- ---------------------------------------------------------------------------
do $mig$
declare
  v_old text :=
    '  IF NOT EXISTS (' || chr(10) ||
    '    SELECT 1 FROM context.scopes s' || chr(10) ||
    '    JOIN iam.organization_member om ON om.organization_id = s.organization_id AND om.user_id = (select auth.uid())' || chr(10) ||
    '    WHERE s.id = p_scope_id' || chr(10) ||
    '  ) THEN' || chr(10) ||
    '    RAISE EXCEPTION ''not authorized to write to scope %'', p_scope_id USING ERRCODE = ''42501'';' || chr(10) ||
    '  END IF;';
  v_new text := '  PERFORM context._assert_scope_readable(p_scope_id, ''editor'');';
  v_def text;
begin
  v_def := pg_get_functiondef('public.set_scope_context_value(uuid,uuid,text,numeric,boolean,jsonb,text,date,timestamp with time zone,time without time zone,text)'::regprocedure);
  if position(v_old in v_def) = 0 then
    if position('_assert_scope_readable' in v_def) > 0 then
      raise notice 'B-7: set_scope_context_value already carries the membrane; skipping';
    else
      raise exception 'B-7: could not find the org-membership write check in set_scope_context_value — re-read the live body.';
    end if;
  else
    execute replace(v_def, v_old, v_new);
  end if;
end
$mig$;

-- ---------------------------------------------------------------------------
-- A.3 — public.set_context_value: the agent/server write door. Keeps its {ok,error} envelope, so the
--       gate is caught and rendered rather than raised through the contract.
-- ---------------------------------------------------------------------------
do $mig$
declare
  v_old text :=
    '  v_can_write := (v_scope_owner = v_uid) OR EXISTS (' || chr(10) ||
    '    SELECT 1 FROM iam.organization_member om WHERE om.organization_id = v_scope_org AND om.user_id = v_uid' || chr(10) ||
    '  );' || chr(10) ||
    '  IF NOT v_can_write THEN' || chr(10) ||
    '    RETURN jsonb_build_object(''ok'', false, ''error'', jsonb_build_object(''code'',''forbidden_org'',''message'',''caller may not write this scope''));' || chr(10) ||
    '  END IF;';
  v_new text :=
    '  v_can_write := (v_scope_owner = v_uid) OR context._scope_readable_for(v_uid, v_scope_id, ''editor'');' || chr(10) ||
    '  IF NOT v_can_write THEN' || chr(10) ||
    '    RETURN jsonb_build_object(''ok'', false, ''error'', jsonb_build_object(''code'',''forbidden'',' || chr(10) ||
    '      ''message'',''You can view this record but you cannot change it. Ask for edit access on that record.''));' || chr(10) ||
    '  END IF;';
  v_def text;
begin
  v_def := pg_get_functiondef('public.set_context_value(jsonb)'::regprocedure);
  if position(v_old in v_def) = 0 then
    if position('_scope_readable_for' in v_def) > 0 then
      raise notice 'B-7: set_context_value already carries the membrane; skipping';
    else
      raise exception 'B-7: could not find the org-membership write check in set_context_value — re-read the live body.';
    end if;
  else
    execute replace(v_def, v_old, v_new);
  end if;
end
$mig$;

-- ---------------------------------------------------------------------------
-- A.4 — public.resolve_full_context: THE AGENT CONTEXT SEEDING PATH. It assembles context FOR a named
--       user and filtered explicitly requested scopes by organization membership, which is exactly how
--       a personal or un-shared record reached an agent rendering under acting_as_user.
--       Not client-callable (service_role only), so this is the server's own correctness, not a live
--       client hole — and it is the per-USER variant, never auth.uid().
-- ---------------------------------------------------------------------------
do $mig$
declare
  v_old text := 'join iam.organization_member om on om.organization_id = s.organization_id and om.user_id = p_user_id';
  -- Alias kept as `om` so nothing else in the query can break on a renamed relation.
  v_new text := 'join lateral (select 1 as ok) om on context._scope_readable_for(p_user_id, s.id, ''viewer'')';
  v_def text;
begin
  v_def := pg_get_functiondef('public.resolve_full_context(uuid,text,uuid,uuid[])'::regprocedure);
  if position(v_old in v_def) = 0 then
    if position('_scope_readable_for' in v_def) > 0 then
      raise notice 'B-7: resolve_full_context already carries the membrane; skipping';
    else
      raise exception 'B-7: could not find the org-membership scope filter in resolve_full_context — re-read the live body.';
    end if;
  else
    execute replace(v_def, v_old, v_new);
  end if;
end
$mig$;

-- ---------------------------------------------------------------------------
-- A.5 — public.list_context_value_refs: "what points at this entity" — it returned the scope name and
--       org of every reference cell in any org the caller belongs to.
-- ---------------------------------------------------------------------------
do $mig$
declare
  v_old text := '  JOIN iam.organization_member om ON om.organization_id = s.organization_id AND om.user_id = v_uid' || chr(10) ||
                '  WHERE cvr.ref_type = p_ref_type';
  v_new text := '  WHERE context._scope_readable(s.id, ''viewer'')' || chr(10) ||
                '    AND cvr.ref_type = p_ref_type';
  v_def text;
begin
  v_def := pg_get_functiondef('public.list_context_value_refs(text,text)'::regprocedure);
  if position(v_old in v_def) = 0 then
    if position('_scope_readable' in v_def) > 0 then
      raise notice 'B-7: list_context_value_refs already carries the membrane; skipping';
    else
      raise exception 'B-7: could not find the org-membership join in list_context_value_refs — re-read the live body.';
    end if;
  else
    execute replace(v_def, v_old, v_new);
  end if;
end
$mig$;

-- ---------------------------------------------------------------------------
-- A.6 — public.scope_system_inspect: the agent tool. Takes an ORG id and returned every scope in it,
--       with every cell value when p_include_values. Org access still gates the call; each scope now
--       has to be individually readable before its row (and therefore its values) is emitted.
-- ---------------------------------------------------------------------------
do $mig$
declare
  v_old text := 'from context.scopes s where s.scope_type_id=st.id and s.deleted_at is null)';
  v_new text := 'from context.scopes s where s.scope_type_id=st.id and s.deleted_at is null and context._scope_readable(s.id,''viewer''))';
  v_def text;
begin
  v_def := pg_get_functiondef('public.scope_system_inspect(uuid,boolean)'::regprocedure);
  if position(v_old in v_def) = 0 then
    if position('_scope_readable' in v_def) > 0 then
      raise notice 'B-7: scope_system_inspect already carries the membrane; skipping';
    else
      raise exception 'B-7: could not find the scope subquery in scope_system_inspect — re-read the live body.';
    end if;
  else
    execute replace(v_def, v_old, v_new);
  end if;
end
$mig$;

-- ---------------------------------------------------------------------------
-- A.7 — public.accept_scope_suggestion: creates a scope and seeds its cells. The caller is the creator,
--       so the gate can never refuse them today; it is here so the CLASS is closed — a later change to
--       who may accept a suggestion cannot silently become a way to write another person's record.
-- ---------------------------------------------------------------------------
do $mig$
declare
  v_old text := '  FOR v_key, v_val IN' || chr(10) ||
                '    SELECT key, value FROM jsonb_each_text(COALESCE(v_sugg.suggested_slot_values, ''{}''::jsonb))';
  v_new text := '  PERFORM context._assert_scope_readable(v_scope_id, ''editor'');' || chr(10) || chr(10) ||
                '  FOR v_key, v_val IN' || chr(10) ||
                '    SELECT key, value FROM jsonb_each_text(COALESCE(v_sugg.suggested_slot_values, ''{}''::jsonb))';
  v_def text;
begin
  v_def := pg_get_functiondef('public.accept_scope_suggestion(uuid,uuid)'::regprocedure);
  if position(v_old in v_def) = 0 then
    if position('_assert_scope_readable' in v_def) > 0 then
      raise notice 'B-7: accept_scope_suggestion already carries the membrane; skipping';
    else
      raise exception 'B-7: could not find the seeding loop in accept_scope_suggestion — re-read the live body.';
    end if;
  else
    execute replace(v_def, v_old, v_new);
  end if;
end
$mig$;

-- ---------------------------------------------------------------------------
-- A.8 — the guard. Every SECURITY DEFINER function in `context`/`public` whose body names
--       context.context_item_values must carry the membrane. This runs INSIDE the migration so the
--       migration itself cannot half-land, and the same rule is a repo gate (check:scope-access-membrane).
-- ---------------------------------------------------------------------------
do $mig$
declare
  v_missing text;
begin
  select string_agg(p.oid::regprocedure::text, ', ' order by p.proname)
    into v_missing
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'context')
    and p.prosecdef
    and p.prosrc ~ 'context\.context_item_values'
    and p.prosrc !~ '_scope_readable'
    -- context.write_context_value/index_reference_value are the INVOKER storage layer, not doors;
    -- context.provision_scope_dataset is reached only from a trigger that provably never fires
    -- (every context_items.reference_source is NULL live) and takes no caller.
    and p.proname not in ('provision_scope_dataset', 'provision_scope_datasets_trigger');

  if v_missing is not null then
    raise exception
      'B-7 guard: these SECURITY DEFINER functions serve scope cell values without the access membrane: %. Add context._assert_scope_readable / context._scope_readable before shipping.',
      v_missing;
  end if;
end
$mig$;

-- ============================================================================
-- PART B — THE MEMBRANE
-- ============================================================================

-- `context.context_item_values` has no created_by, no organization_id, no deleted_at and no
-- visibility: it is a textbook COMPONENT (§6d-1 THE COMPONENT OWNERSHIP LAW — its access IS its
-- parent's). It has never been registered at all, so this is a new token, not a variant change.
insert into platform.entity_types (
  token, schema_name, table_name, label,
  rls_variant, is_component, is_versioned, has_soft_delete,
  is_listed, audit_class, notes
) values (
  'context_item_value', 'context', 'context_item_values', 'Record Value',
  'component', true, false, false,
  false, 'entity',
  'B-7 (2026-09-11): the cell values of a scope. Component of `scope` — access is exactly the '
  'record''s. Not versioned through history.row_versions: the table is itself append-only, '
  'versioned by trg_ctx_version_context_item_value (one is_current row per cell).'
)
on conflict (token) do update set
  rls_variant = excluded.rls_variant,
  is_component = excluded.is_component,
  is_versioned = excluded.is_versioned,
  has_soft_delete = excluded.has_soft_delete,
  notes = excluded.notes;

-- THE PARENT IS `scope`, AND ONLY `scope`. `context_item_id` is deliberately NOT declared a
-- composition parent: field definitions are org-wide by design, so a second parent arm would OR an
-- org-wide id set back in and reopen exactly the door this membrane closes.
insert into platform.entity_relationships (child_type, parent_type, fk_column, kind, note)
values (
  'context_item_value', 'scope', 'scope_id', 'composition',
  'B-7: a cell belongs to its record. Never declare context_item as a second parent — field '
  'definitions are org-wide and would re-widen the values.'
)
on conflict do nothing;

-- The generated component lane. Emitted ONCE PER QUERY over the parent id set
-- (THE COMPONENT-ACCESS PRECEDENT, 2026-08-08); never hand-written.
select iam.apply_rls('context', 'context_item_values', 'context_item_value', 'component');

-- `anon` held SELECT+INSERT+UPDATE+DELETE on this table. RLS denied it (no anon policy), but a table
-- grant that only a policy stands behind is one `apply_rls` away from being a hole. The component
-- lane revokes SELECT itself; the write grants are revoked here.
revoke all on context.context_item_values from anon;
