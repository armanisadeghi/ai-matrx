-- ctx_scope_access_membrane_b7_fix1.sql
--
-- B-7 / DD-099 FIX ROUND 1 — the four findings of the independent verification (V-7, 2026-09-11).
-- Read ctx_scope_access_membrane_b7.sql first; this file assumes it is applied.
--
-- V-7 confirmed every live target of the original fix. It also found that the same law was
-- applied to a record's VALUES and not to the record's own ROW, that the guard's class test was a
-- substring match a comment defeats, and that one refusal sentence asserts a capability the caller
-- does not have. All three are closed here. The fourth finding is conformance debt on the table's
-- column shape, which predates B-7 and is recorded rather than smuggled into a security round —
-- §4 below says exactly why, item by item.
--
-- Idempotent, same discipline as round 1: every function rewrite is a guarded string replacement
-- against the LIVE definition, so a re-run no-ops and only the named predicate can move.

-- ============================================================================
-- 1 (V-7 B-F1, HIGH) — THE RECORD'S OWN ROW IS DETAIL TOO
-- ============================================================================
--
-- `list_scopes`, `get_scope_tree` and `search_scopes` are SECURITY DEFINER, authorize on
-- organization membership, and handed a non-creator plain member the COMPLETE row of a `personal`
-- scope — name, slug, visibility, created_by — in the same transaction in which
-- `context.scopes` returned that member 0 rows and `get_scope_context` refused him. On a personal
-- legal matter the case NAME is the most sensitive field there is; "it is only identity, not cell
-- values" describes the defect rather than excusing it.
--
-- THE SET, NOT PER ROW. One `iam.accessible_entity_ids('scope','viewer')` resolution per call, the
-- same set the component membrane uses, so the list and the record agree by construction: if a row
-- appears in a list, opening it works, and if opening it refuses, it was never listed.

create or replace function context._readable_scope_ids()
returns setof uuid
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  -- The server's own trusted lane. It has already authorized its user, and asks per-user through
  -- context._scope_readable_for; narrowing it here would blind the agent pipeline to every record.
  if auth.role() = 'service_role' then
    return query select s.id from context.scopes s;
    return;
  end if;
  return query select iam.unnest_uuids(iam.accessible_entity_ids('scope', 'viewer'::public.permission_level));
end;
$fn$;

comment on function context._readable_scope_ids() is
  'B-7 fix 1: the scope ids the caller may open, resolved ONCE per call. Every DEFINER door that '
  'LISTS scopes filters on this, so a list can never name a record the caller cannot open.';

do $mig$
declare
  v_old text := '    and s.deleted_at is null and st.deleted_at is null';
  v_new text := '    and s.deleted_at is null and st.deleted_at is null' || chr(10) ||
                '    and s.id in (select context._readable_scope_ids())';
  v_fn text;
  v_def text;
begin
  foreach v_fn in array array[
    'public.list_scopes(uuid,uuid,uuid)',
    'public.get_scope_tree(uuid,uuid)',
    'public.search_scopes(uuid,text,uuid)'
  ] loop
    v_def := pg_get_functiondef(v_fn::regprocedure);
    if position('_readable_scope_ids' in v_def) > 0 then
      raise notice 'B-7 fix 1: % already filters on the readable set; skipping', v_fn;
      continue;
    end if;
    if position(v_old in v_def) = 0 then
      raise exception
        'B-7 fix 1: could not find the soft-delete predicate in % — re-read the live body before re-running.', v_fn;
    end if;
    execute replace(v_def, v_old, v_new);
  end loop;
end
$mig$;

-- ============================================================================
-- 3 (V-7 B-F3, MEDIUM) — A SCREEN NEVER LIES
-- ============================================================================
--
-- `set_context_value` returned "You can view this record but you cannot change it" to a caller who
-- could not view it at all. `_assert_scope_readable` chose the sentence correctly; the envelope path
-- hardcoded one of the two. One function now owns the wording and both paths ask it.

create or replace function context._scope_denial_message(
  p_scope_id uuid,
  p_level text default 'viewer'
) returns text
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_name text;
begin
  select s.name into v_name
  from context.scopes s
  where s.id = p_scope_id and s.deleted_at is null;

  if v_name is null then
    return 'That record no longer exists, or it was deleted.';
  end if;

  -- Only claim they can view it when they actually can.
  if p_level <> 'viewer' and context._scope_readable(p_scope_id, 'viewer') then
    return format('You can view "%s" but you cannot change it. Ask for edit access on that record.', v_name);
  end if;

  return format('You do not have access to "%s". Ask someone who can already open it to share it with you.', v_name);
end;
$fn$;

comment on function context._scope_denial_message(uuid, text) is
  'B-7 fix 1: the ONE place the refusal sentence is chosen. Both the raising gate '
  '(context._assert_scope_readable) and the envelope callers use it, so the two can never drift '
  'into telling the same user two different stories.';

create or replace function context._assert_scope_readable(
  p_scope_id uuid,
  p_level text default 'viewer'
) returns void
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  if context._scope_readable(p_scope_id, p_level) then
    return;
  end if;
  raise exception '%', context._scope_denial_message(p_scope_id, p_level)
    using errcode = '42501';
end;
$fn$;

do $mig$
declare
  v_old text :=
    '    RETURN jsonb_build_object(''ok'', false, ''error'', jsonb_build_object(''code'',''forbidden'',' || chr(10) ||
    '      ''message'',''You can view this record but you cannot change it. Ask for edit access on that record.''));';
  v_new text :=
    '    RETURN jsonb_build_object(''ok'', false, ''error'', jsonb_build_object(''code'',''forbidden'',' || chr(10) ||
    '      ''message'', context._scope_denial_message(v_scope_id, ''editor'')));';
  v_def text;
begin
  v_def := pg_get_functiondef('public.set_context_value(jsonb)'::regprocedure);
  if position('_scope_denial_message' in v_def) > 0 then
    raise notice 'B-7 fix 1: set_context_value already derives its sentence; skipping';
  elsif position(v_old in v_def) = 0 then
    raise exception 'B-7 fix 1: could not find the hardcoded refusal sentence in set_context_value — re-read the live body.';
  else
    execute replace(v_def, v_old, v_new);
  end if;
end
$mig$;

-- ============================================================================
-- 2 (V-7 B-F2, HIGH) — THE GUARD BECOMES STRUCTURAL
-- ============================================================================
--
-- Round 1's class checks were `prosrc !~ '_scope_readable'`. The verifier defeated both with a
-- door whose entire membrane was a COMMENT:
--
--   create function public.v7_fake_door2() returns setof context.context_item_values
--   language sql security definer as $$ -- reviewed: _scope_readable not needed here
--   select * from context.context_item_values $$;
--
-- Two changes, and the first is the one that matters:
--
--  (a) EVERY DEFINER function that references these tables must be REGISTERED, membraned or not.
--      A door nobody has decided about fails on its existence, not on what its body says — so no
--      amount of body text can talk its way past. The reviewed list moves out of a baked array in
--      a migration and into a table, where the reason is a row anyone can read.
--  (b) A door registered as `membraned` must carry a real CALL: comments, single-quoted literals
--      and dollar-quoted blocks are stripped first, then the text must match a call shape
--      (`context._scope_readable(`, `_assert_scope_readable(`, `_scope_readable_for(`). That
--      catches the membrane being lifted back out of a door that is already registered.

create table if not exists context.scope_door_registry (
  function_name text primary key,
  door_class    text not null check (door_class in ('membraned', 'education', 'org_lane', 'unreachable', 'helper')),
  reason        text not null check (length(btrim(reason)) >= 20),
  reviewed_at   date not null default current_date,
  -- `helper` is the membrane's own machinery, not a door — structurally restricted to the
  -- underscore-prefixed functions in schema `context` so it cannot become a place to park a leak.
  constraint scope_door_registry_helper_is_internal
    check (door_class <> 'helper' or function_name like 'context.\_%')
);

comment on table context.scope_door_registry is
  'B-7 fix 1: every SECURITY DEFINER function in public/context whose body references '
  'context.scopes / context_items / context_item_values, and the decision taken about it. '
  'Read by public.__scope_access_membrane_conformance(); a function missing from here FAILS the '
  'gate on its absence, which is the point — a new door cannot ship undecided. '
  'door_class: membraned = calls context._assert_scope_readable/_scope_readable and must keep '
  'doing so; education = p_class IS a scope id but the education module runs its own '
  'authorization (roster/teacher/join code) and a viewer assert would break a student joining a '
  'class they cannot yet read; org_lane = serves record TYPES or field definitions, which are '
  'organization dimensions (internal by nature, org-wide by Doctrine R20), or acts on a row the '
  'caller is creating or already owns; unreachable = no caller can reach it.';

comment on column context.scope_door_registry.reason is
  'Why this door is in this class, in a sentence. Twenty characters minimum because "ok" is not a '
  'review — the reason IS the decision record.';

insert into context.scope_door_registry (function_name, door_class, reason) values
  -- the membrane's own machinery (they read context.scopes to answer the question / name the record)
  ('context._scope_readable','helper','The membrane itself: does the current caller hold this level on this record?'),
  ('context._scope_readable_for','helper','The membrane asked on behalf of a named user, for the agent context assembly path.'),
  ('context._assert_scope_readable','helper','The raising form of the membrane; every door that must refuse calls this.'),
  ('context._scope_denial_message','helper','Chooses the refusal sentence; reads the record name so the message can say which record.'),
  ('context._readable_scope_ids','helper','Resolves the caller''s readable scope id set once per call, for the list doors.'),
  -- the eight doors that serve a scope''s cell values
  ('public.get_scope_context','membraned','The read door the scopes UI and the agent both use; it served a personal scope''s cells to any org member until 2026-09-11.'),
  ('public.get_value_history','membraned','Returns one cell''s full revision history, which is the same customer data as the cell.'),
  ('public.set_scope_context_value','membraned','The client write door for a cell; asserts editor on the record.'),
  ('public.set_context_value','membraned','The agent/server write door for a cell; asserts editor for the acting user and renders the refusal in its envelope.'),
  ('public.resolve_full_context','membraned','The agent context seeding path; filters requested scopes per the named user, not by that user''s organizations.'),
  ('public.list_context_value_refs','membraned','Reverse index of reference cells; returned scope name and organization for every org the caller belonged to.'),
  ('public.scope_system_inspect','membraned','The agent inspect tool; returned every scope in an organization with every cell value.'),
  ('public.accept_scope_suggestion','membraned','Creates a scope and seeds its cells; the assert cannot refuse the creator today and is there so the class stays closed.'),
  -- the three list doors closed in this round
  ('public.list_scopes','membraned','Returned a personal scope''s complete row to a non-creator member; now filters on context._readable_scope_ids().'),
  ('public.get_scope_tree','membraned','Same disclosure as list_scopes, through the tree shape; filters on the same set.'),
  ('public.search_scopes','membraned','Same disclosure as list_scopes, reachable by name search; filters on the same set.'),
  -- education: the module''s own gate is the correct one
  ('public._edu_class','education','Resolves a class row for the education gates; every caller of it is itself gated.'),
  ('public._edu_generate_join_code','education','Generates a join code for a class the caller already governs.'),
  ('public.edu_class_approve','education','Teacher action on a class; gated on the education roster, not on record access.'),
  ('public.edu_class_assign','education','Teacher action on a class; gated on the education roster.'),
  ('public.edu_class_assignments','education','Roster-gated read of a class''s assignments.'),
  ('public.edu_class_by_code','education','Join-code lookup: the whole point is that a student who cannot yet read the class can find it.'),
  ('public.edu_class_confer_purchase','education','Teacher action on a class; gated on the education roster.'),
  ('public.edu_class_grant','education','Teacher action on a class; gated on the education roster.'),
  ('public.edu_class_join','education','A student joining a class they cannot yet read — a viewer assert would make joining impossible.'),
  ('public.edu_class_join_by_code','education','Same as edu_class_join, reached by code.'),
  ('public.edu_class_join_code','education','Reads or rotates a class join code for the teacher who governs it.'),
  ('public.edu_class_leave','education','A student leaving a class; roster-gated.'),
  ('public.edu_class_progress_overview','education','Roster-gated progress read for the teacher.'),
  ('public.edu_class_remove','education','Teacher action on a class; gated on the education roster.'),
  ('public.edu_class_request','education','A student requesting access to a class they cannot yet read.'),
  ('public.edu_class_revoke_purchase','education','Teacher action on a class; gated on the education roster.'),
  ('public.edu_class_roster','education','Raises 42501 from its own iam.memberships gate (teacher-owner or roster member).'),
  ('public.edu_class_set_access','education','Teacher action on a class; gated on the education roster.'),
  ('public.edu_class_state','education','Roster-gated read of a class''s state.'),
  ('public.edu_class_student_progress','education','Roster-gated progress read for one student.'),
  ('public.edu_class_unassign','education','Teacher action on a class; gated on the education roster.'),
  ('public.edu_my_classes','education','Lists the caller''s own classes from their own membership rows.'),
  -- org lane: record TYPES, field definitions, or a row the caller is creating/owns
  ('public.accept_context_item_suggestion','org_lane','Acts on a field definition of a scope type the caller administers.'),
  ('public.apply_template','org_lane','Creates record types and field definitions in an organization the caller administers.'),
  ('public.apply_template_definition','org_lane','Same as apply_template, from an inline definition.'),
  ('public.create_context_item','org_lane','Creates a field definition on a scope type; organization-admin gated.'),
  ('public.delete_context_item','org_lane','Removes a field definition; organization-admin gated.'),
  ('public.update_context_item','org_lane','Edits a field definition; organization-admin gated.'),
  ('public.list_scope_type_items','org_lane','Lists field definitions of a record type; never touches context.scopes.'),
  ('public.list_scope_types','org_lane','Lists the organization''s record types, which are organization dimensions.'),
  ('public.delete_scope_type','org_lane','Removes a record type; organization-admin gated.'),
  ('public.create_scope','org_lane','Creates a record the caller will own.'),
  ('public.update_scope','org_lane','Edits a record; see the register note — this one wants a record-level assert, not an org one.'),
  ('public.delete_scope','org_lane','Removes a record; see the register note — this one wants a record-level assert, not an org one.'),
  ('public.create_tasks_bulk','org_lane','Creates tasks and tags them with scope ids the caller supplies; the tag write is association-gated.'),
  ('public.creator_public_page','org_lane','Renders a public creator page from deliberately public rows.'),
  ('public.get_entity_scopes','org_lane','Lists the scope tags on one entity the caller can already read.'),
  ('public.get_org_structure','org_lane','Organization shape for an organization the caller belongs to.'),
  ('public.get_user_dashboard_metrics','org_lane','Counts over the caller''s own rows.'),
  ('public.get_user_full_context','org_lane','Assembles the caller''s own context.'),
  ('public.get_user_scopes','org_lane','Lists the caller''s own scopes.'),
  ('public.inv_get_by_token','org_lane','Resolves an invitation by its own secret token.'),
  ('public.kg_caller_can_target_scope','org_lane','A boolean predicate used by the knowledge-graph writer, not a data door.'),
  ('public.scope_system_apply','org_lane','The agent apply tool; creates and edits record types and field definitions, organization-admin gated.'),
  ('public.set_entity_scopes','org_lane','Writes scope tags on one entity; association-gated.'),
  -- unreachable
  ('context.provision_scope_dataset','unreachable','Reached only from a trigger that never fires: all 204 context_items.reference_source are NULL live.'),
  ('context.provision_scope_datasets_trigger','unreachable','The trigger itself; short-circuits on every insert because reference_source is NULL everywhere.')
on conflict (function_name) do update set
  door_class = excluded.door_class, reason = excluded.reason, reviewed_at = excluded.reviewed_at;

-- Comments, single-quoted literals and dollar-quoted blocks are not code. This is what makes the
-- check structural rather than a substring match.
create or replace function context._strip_sql_noise(p_src text)
returns text
language sql
immutable
as $fn$
  select regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(coalesce(p_src, ''), '\$[A-Za-z_]*\$.*?\$[A-Za-z_]*\$', ' ', 'gs'),
               '/\*.*?\*/', ' ', 'gs'),
             '--[^' || chr(10) || ']*', ' ', 'g'),
           '''(?:[^'']|'''')*''', ' ', 'g');
$fn$;

comment on function context._strip_sql_noise(text) is
  'B-7 fix 1: removes dollar-quoted blocks, block comments, line comments and single-quoted '
  'literals from a function body so a guard can test what the function DOES, not what it SAYS. '
  'A comment defeated the round-1 substring check (V-7 B-F2).';

create or replace function public.__scope_access_membrane_conformance()
returns table (check_key text, ok boolean, severity text, detail jsonb)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  -- A door "references the scopes tables" if its body names one of them. The reference test stays a
  -- text test (that is how you find candidates at all); every DECISION below is structural.
  c_refs constant text := 'context\.(scopes|context_items|context_item_values)';
  c_values constant text := 'context\.context_item_values';
  -- What a real call looks like, after context._strip_sql_noise has removed everything that is not
  -- code. Schema-qualified on purpose: a bare identifier somewhere else cannot satisfy it.
  c_call constant text := 'context\._(assert_scope_readable|scope_readable|scope_readable_for|readable_scope_ids)\s*\(';
  v_unregistered text[];
  v_stale text[];
  v_lost text[];
  v_wrongclass text[];
  v_listdoors text[];
  v_pols jsonb;
  v_sel text;
begin
  check_key := 'membrane_helpers_installed';
  detail := (select jsonb_object_agg(p.proname, jsonb_build_object('definer', p.prosecdef))
               from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'context'
                and p.proname in ('_scope_readable','_scope_readable_for','_assert_scope_readable',
                                  '_scope_denial_message','_readable_scope_ids'));
  ok := (select count(*) = 5 and bool_and(p.prosecdef)
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'context'
            and p.proname in ('_scope_readable','_scope_readable_for','_assert_scope_readable',
                              '_scope_denial_message','_readable_scope_ids'));
  severity := 'error';
  if not ok then detail := coalesce(detail,'{}'::jsonb) || jsonb_build_object(
    'why','All five membrane helpers must exist and be SECURITY DEFINER. As INVOKER they would ask the question through the caller''s own RLS and answer "no" to everybody.'); end if;
  return next;

  -- THE STRUCTURAL RULE. A door nobody has decided about fails on its ABSENCE from the registry, so
  -- no amount of body text — comment, literal or otherwise — can talk it past the gate. This is the
  -- check that replaces round 1's substring test (V-7 B-F2).
  select array_agg(n.nspname || '.' || p.proname order by n.nspname, p.proname)
    into v_unregistered
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public','context') and p.prosecdef
    and p.prosrc ~ c_refs
    and n.nspname || '.' || p.proname <> 'public.__scope_access_membrane_conformance'
    and not exists (select 1 from context.scope_door_registry r
                     where r.function_name = n.nspname || '.' || p.proname);
  check_key := 'all_scope_doors_registered';
  ok := v_unregistered is null;
  severity := 'error';
  detail := jsonb_build_object(
    'why','A new SECURITY DEFINER function reads the scopes tables and nobody has decided what it is. Either make it call context._assert_scope_readable and register it as `membraned`, or register it with the class and the reason it does not need one: insert into context.scope_door_registry.',
    'unregistered', coalesce(to_jsonb(v_unregistered),'[]'::jsonb));
  return next;

  -- A registry row for a function that no longer exists is a decision about nothing, and it would
  -- quietly excuse a future function that reuses the name.
  select array_agg(r.function_name order by r.function_name)
    into v_stale
  from context.scope_door_registry r
  where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname || '.' || p.proname = r.function_name and p.prosecdef);
  check_key := 'registry_has_no_stale_rows';
  ok := v_stale is null;
  severity := 'error';
  detail := jsonb_build_object(
    'why','These registry rows name a SECURITY DEFINER function that does not exist. Delete the row, or restore the function.',
    'stale', coalesce(to_jsonb(v_stale),'[]'::jsonb));
  return next;

  -- THE CALL IS REAL. Comments, literals and dollar-quoted blocks stripped, then a call shape.
  select array_agg(r.function_name order by r.function_name)
    into v_lost
  from context.scope_door_registry r
  join pg_proc p on true
  join pg_namespace n on n.oid = p.pronamespace and n.nspname || '.' || p.proname = r.function_name
  where r.door_class = 'membraned'
    and p.prosecdef
    and context._strip_sql_noise(p.prosrc) !~ c_call;
  check_key := 'membraned_doors_carry_a_real_call';
  ok := v_lost is null;
  severity := 'error';
  detail := jsonb_build_object(
    'why','These doors are registered as `membraned` and their live body contains no CALL to the membrane once comments, string literals and dollar-quoted blocks are removed. A comment is not a gate (V-7 B-F2). Re-apply migrations/ctx_scope_access_membrane_b7.sql, or change the row''s class with a reason.',
    'lost', coalesce(to_jsonb(v_lost),'[]'::jsonb));
  return next;

  -- THE CLASS: anything that touches cell values is membraned or provably unreachable. `education`
  -- and `org_lane` are reasons to skip an assert on a door that serves record IDENTITY; they are
  -- never a reason to hand out somebody''s cell values.
  select array_agg(n.nspname || '.' || p.proname || ' (' || coalesce(r.door_class,'UNREGISTERED') || ')'
                   order by p.proname)
    into v_wrongclass
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  left join context.scope_door_registry r on r.function_name = n.nspname || '.' || p.proname
  where n.nspname in ('public','context') and p.prosecdef
    and p.prosrc ~ c_values
    and n.nspname || '.' || p.proname <> 'public.__scope_access_membrane_conformance'
    and coalesce(r.door_class,'') not in ('membraned','unreachable');
  check_key := 'value_doors_are_membraned';
  ok := v_wrongclass is null;
  severity := 'error';
  detail := jsonb_build_object(
    'why','RLS does not run inside a SECURITY DEFINER function. A door that serves a scope''s cell values must be class `membraned` (or provably `unreachable`) — organization membership is not the question. This is the 2026-09-11 finding on get_scope_context.',
    'offenders', coalesce(to_jsonb(v_wrongclass),'[]'::jsonb));
  return next;

  -- THE LIST AND THE RECORD MUST AGREE. If a list can name a record, opening it must work; if
  -- opening refuses, the list must never have named it (V-7 B-F1).
  select array_agg(x.fn order by x.fn) into v_listdoors
  from (select unnest(array['public.list_scopes','public.get_scope_tree','public.search_scopes']) as fn) x
  where not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname || '.' || p.proname = x.fn
       and context._strip_sql_noise(p.prosrc) ~ 'context\._readable_scope_ids\s*\(');
  check_key := 'list_doors_filter_the_readable_set';
  ok := v_listdoors is null;
  severity := 'error';
  detail := jsonb_build_object(
    'why','These doors list scopes without filtering on context._readable_scope_ids(), so they can name a `personal` record — its name, slug, creator and visibility — to somebody the record itself refuses. On a personal legal matter the case NAME is the most sensitive field there is.',
    'unfiltered', coalesce(to_jsonb(v_listdoors),'[]'::jsonb));
  return next;

  check_key := 'values_registered_as_component_of_scope';
  detail := jsonb_build_object(
    'entity_type', (select to_jsonb(t) from (select rls_variant, is_component, is_active
                                               from platform.entity_types where token = 'context_item_value') t),
    'parents', coalesce((select jsonb_agg(jsonb_build_object('parent', er.parent_type, 'fk', er.fk_column))
                           from platform.entity_relationships er
                          where er.child_type = 'context_item_value' and er.kind = 'composition'), '[]'::jsonb),
    'why','A second composition parent (context_item) would OR an ORG-WIDE id set back into the read lane and undo the membrane. The parent is `scope`, and only `scope`.');
  ok := exists (select 1 from platform.entity_types
                 where token = 'context_item_value' and rls_variant = 'component' and is_component and is_active)
        and (select count(*) from platform.entity_relationships
              where child_type = 'context_item_value' and kind = 'composition') = 1
        and exists (select 1 from platform.entity_relationships
                     where child_type = 'context_item_value' and parent_type = 'scope' and fk_column = 'scope_id');
  severity := 'error';
  return next;

  select jsonb_object_agg(policyname, cmd), max(qual) filter (where cmd = 'SELECT')
    into v_pols, v_sel
  from pg_policies where schemaname = 'context' and tablename = 'context_item_values';
  check_key := 'values_policies_are_generated_component_lane';
  ok := coalesce(v_sel,'') like '%accessible_entity_ids(''scope''::text%'
        and coalesce(v_sel,'') not like '%context.scopes%'
        and v_pols ? 'std_select' and v_pols ? 'std_insert' and v_pols ? 'std_update'
        and v_pols ? 'std_delete' and v_pols ? 'svc_all';
  severity := 'error';
  detail := jsonb_build_object(
    'policies', coalesce(v_pols,'{}'::jsonb),
    'why','The read lane must resolve the PARENT id set once per query (THE COMPONENT-ACCESS PRECEDENT, 2026-08-08) and must not fall back to organization membership. Re-apply with select iam.apply_rls(''context'',''context_item_values'',''context_item_value'',''component'').');
  return next;

  check_key := 'no_anon_grants_on_values';
  detail := jsonb_build_object(
    'grants', coalesce((select jsonb_agg(privilege_type order by privilege_type)
                          from information_schema.role_table_grants
                         where table_schema = 'context' and table_name = 'context_item_values'
                           and grantee = 'anon'), '[]'::jsonb),
    'why','A table grant that only a policy stands behind is one apply_rls away from being a hole.');
  ok := not exists (select 1 from information_schema.role_table_grants
                     where table_schema = 'context' and table_name = 'context_item_values' and grantee = 'anon');
  severity := 'error';
  return next;
end;
$fn$;

revoke all on function public.__scope_access_membrane_conformance() from public;
grant execute on function public.__scope_access_membrane_conformance() to service_role;

-- ============================================================================
-- 4 (V-7 B-F4, MEDIUM) — WHY THE TOKEN DOES NOT CERTIFY, ITEM BY ITEM
-- ============================================================================
--
-- iam.canonical_certify_ok('context','context_item_values','context_item_value') = FALSE on four
-- checks. All four are PRE-EXISTING COLUMN-SHAPE DRIFT on a table B-7 did not reshape — registering
-- the token is what made them visible, not what caused them — and one of them must STAY failing:
--
--  * trg_touch_row — "missing _touch_row trigger". IT MUST NOT BE ADDED. `version` on this table is
--    a per-cell REVISION INDEX assigned by trg_ctx_version_context_item_value and protected by the
--    UNIQUE index context_item_values_version, not the base contract's row-version CAS token. When
--    _touch_row was attached (aidream 0615), every UPDATE renumbered the revision: flipping
--    is_current on a superseded row — the commonest write this table takes — raised
--    `duplicate key value violates unique constraint "context_item_values_version"`. It was removed
--    again by aidream/db/migrations/0621_touch_row_exclude_cell_revision_table_dd_061.sql and is
--    guarded by tests/test_version_bump_trigger_live.py, whose exclusion list names this exact
--    table. So this FAIL is iam.verify_canonical not knowing about a standing ruling (DD-061),
--    and the correct resolution is to teach the verifier, not the table.
--
--  * base_metadata — "missing metadata jsonb NOT NULL". A pure addition, and the only one of the
--    four that is trivially safe. Not done here: it changes the table shape, which means
--    `pnpm db-types` and the aidream ORM model move with it, and on its own it does not change the
--    certification verdict (the other three still fail). It belongs in the same migration as the
--    organization_id work, not bolted onto a security round.
--
--  * base_organization_id / base_org_fk — "missing organization_id" / "missing FK". This is real
--    work, not a column: NO DB-ASSIGNED ORG (2026-08-21/23) means the WRITER supplies it, so
--    context.write_context_value and every other writer of this table must pass the scope's
--    organization explicitly before NOT NULL can hold. Adding a parent-inheritance backstop instead
--    would be adding a new emergency assigner the same ruling is trying to retire.
--
-- Recorded, not silently carried. CONVERGE note below; register item in
-- /projects/data-doctrine-adoption/REGISTER.md (DD-099 residue, see the B-7 report §4).

comment on table context.context_item_values is
  'The cell values of a scope: append-only, one is_current row per (context_item_id, scope_id). '
  'Access is its parent record''s — registered component of `scope` since 2026-09-11 (B-7). '
  'CONVERGE: iam.canonical_certify_ok is FALSE on four base-contract checks and three of them are '
  'real debt — metadata jsonb is absent, organization_id and its FK are absent (and need the WRITER '
  'to supply the org, per NO DB-ASSIGNED ORG, not a new inheritance trigger). The fourth, '
  'trg_touch_row, must STAY absent: `version` here is a per-cell revision index, and _touch_row '
  'renumbers it (aidream 0621, DD-061). Retires into custom.record under DD-030.';
