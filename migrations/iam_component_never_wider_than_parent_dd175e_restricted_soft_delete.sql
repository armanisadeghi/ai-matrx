-- iam_component_never_wider_than_parent_dd175e_restricted_soft_delete — DD-175, the second
-- divergence, found by the certifier dd175a installed.
--
-- WHAT THE CERTIFIER FOUND AFTER dd175b CLOSED THE CLASS LANES (measured live 2026-09-13)
-- --------------------------------------------------------------------------------------
-- The DD-175a BEFORE probe recorded 22 (component, parent, principal) readings totalling 321
-- component rows readable under a parent row the principal's own parent policy refuses. After
-- dd175b and dd175c, four of the five leaking components close completely:
--
--   udt_document_snapshot / admin@admin.com    81 -> 0
--   agent_run_stage       / admin@admin.com    57 -> 0
--   tool_call             / admin@admin.com    47 -> 0
--   udt_workbook_snapshot / admin@admin.com    35 -> 0
--
-- One did not: `coding_session_entry` / admin@admin.com, 101 rows, and the cause is a DIFFERENT
-- divergence between the set form and the deployed policy.
--
-- `chat.coding_session` is the `restricted` variant. `iam._apply_rls_unchecked` emits its
-- `std_select` with the soft-delete prefix its own `v_delpfx` builds:
--
--     deleted_at is null and (created_by = (select auth.uid()) ...)
--
-- `iam.accessible_entity_ids` has no soft-delete arm at all, so it returned 160 ids to
-- admin@admin.com where the table's own policy hands back 159. The 161st… the ONE extra id is
-- `84de29f8-b2b5-5223-8bc6-0d3342de9d59` — created_by admin@admin.com, `deleted_at`
-- 2026-08-16T17:41:35Z — and the component under it carries 101 entries the parent hides.
--
-- WHY THE FIX IS SCOPED TO `restricted` AND NOT TO EVERY TABLE WITH A deleted_at COLUMN
-- ------------------------------------------------------------------------------------
-- `restricted` is the ONE variant whose generated `std_select` carries that prefix. The `entity`,
-- `system`, `component`, `ledger` and `personal` lanes do NOT filter `deleted_at`, deliberately:
-- an archived row stays readable to the people who could read it (the archived-items law — every
-- list has an archive filter, hidden by default, one or two clicks away). A blanket
-- `deleted_at is null` in the set form would cut every archived row out of every list that resolves
-- it, which is over-tightening, and db-rules §6 treats a legitimate reader blocked from their own
-- data as the same size of bug as a stranger let in.
--
-- So the filter asks the registry the same question the generator asks: is this token `restricted`,
-- and does its table carry `deleted_at`? Exactly those tokens, exactly that prefix. 40 tokens are
-- `restricted` today; 5 of them parent 6 components (coding_session, hr_employer_profile ×2, hr_i9,
-- hr_incident, hr_legal_hold), which is the whole blast radius of the component half.

do $patch$
declare v_def text; v_new text; v_a text; v_b text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'iam' and p.proname = 'accessible_entity_ids'
    and pg_get_function_identity_arguments(p.oid)
        = 'p_type text, p_required permission_level, p_depth integer, p_include_public boolean';
  if v_def is null then
    raise exception 'DD-175e: the 4-arg iam.accessible_entity_ids was not found';
  end if;
  if position('v_soft_deleted_hidden' in v_def) > 0 then
    raise notice 'dd175e: the soft-delete filter is already installed';
    return;
  end if;
  if position('v_lanes := iam.class_lanes(p_type);' in v_def) = 0 then
    raise exception 'DD-175e: dd175b has not been applied to this database — the class gate is '
      'absent, so this file would be patching a function that is not the one it was written against';
  end if;
  v_new := v_def;

  -- 1. declare
  v_a := '  v_lanes platform.lane_set;';
  if (length(v_new) - length(replace(v_new, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'DD-175e anchor 1 is not unique'; end if;
  v_new := replace(v_new, v_a, v_a || chr(10) ||
    '  -- 🚨 DD-175e (2026-09-13) — THE `restricted` VARIANT HIDES ITS SOFT-DELETED ROWS AND THIS' || chr(10) ||
    '  -- FUNCTION DID NOT. iam._apply_rls_unchecked''s restricted branch emits std_select with its' || chr(10) ||
    '  -- own `deleted_at is null and …` prefix (v_delpfx). The set form had no soft-delete arm, so' || chr(10) ||
    '  -- a component under a restricted parent read rows whose parent the parent''s own policy' || chr(10) ||
    '  -- hides: measured live, admin@admin.com read 101 chat.coding_session_entry rows under one' || chr(10) ||
    '  -- soft-deleted chat.coding_session. Scoped to `restricted` ON PURPOSE — every other variant' || chr(10) ||
    '  -- keeps archived rows readable (the archived-items law), and cutting them out here would' || chr(10) ||
    '  -- empty every archive view on the platform.' || chr(10) ||
    '  v_soft_deleted_hidden boolean;');

  -- 2. resolve it beside the lanes
  v_a := '  v_lanes := iam.class_lanes(p_type);';
  if (length(v_new) - length(replace(v_new, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'DD-175e anchor 2 is not unique'; end if;
  v_new := replace(v_new, v_a, v_a || chr(10) ||
    '  select coalesce(et.rls_variant = ''restricted'', false)' || chr(10) ||
    '         and exists (select 1 from information_schema.columns c' || chr(10) ||
    '                      where c.table_schema = v_schema and c.table_name = v_table' || chr(10) ||
    '                        and c.column_name = ''deleted_at'')' || chr(10) ||
    '    into v_soft_deleted_hidden' || chr(10) ||
    '    from platform.entity_types et where et.token = p_type and et.is_active;' || chr(10) ||
    '  v_soft_deleted_hidden := coalesce(v_soft_deleted_hidden, false);');

  -- 3. the final filter, over EVERY lane at once — the trusted set, the confirmed candidates and
  --    the parent cascade all flow through this return.
  v_a := '  return coalesce((' || chr(10) ||
         '    select array_agg(distinct x) from unnest(v_ids) x' || chr(10) ||
         '  ), ''{}''::uuid[]);';
  if (length(v_new) - length(replace(v_new, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'DD-175e anchor 3 (the return) is not unique — the function has moved'; end if;
  v_b := '  -- DD-175e: one filter over every lane at once, so no arm can reintroduce a row the' || chr(10) ||
         '  -- parent''s own std_select hides.' || chr(10) ||
         '  if v_soft_deleted_hidden and coalesce(array_length(v_ids,1),0) > 0 then' || chr(10) ||
         '    v_sql := format(' || chr(10) ||
         '      ''select coalesce(array_agg(t.id), ''''{}'''') from %s t'' ||' || chr(10) ||
         '      '' where t.id = any($1) and t.deleted_at is null'', v_tbl);' || chr(10) ||
         '    execute v_sql into v_more using v_ids;' || chr(10) ||
         '    v_ids := coalesce(v_more, ''{}''::uuid[]);' || chr(10) ||
         '  end if;' || chr(10) ||
         v_a;
  v_new := replace(v_new, v_a, v_b);

  if v_new = v_def then raise exception 'DD-175e: the patch changed nothing'; end if;
  execute v_new;
end $patch$;

-- ── THE FINGERPRINT, RE-STAMPED AND ASSERTED MOVED ───────────────────────────────────────────────
do $fp$
declare v_old text; v_new text;
begin
  v_old := iam.entity_read_kernel_expected();
  v_new := iam.entity_read_kernel_fingerprint();
  if v_new = v_old then
    raise exception 'dd175e: the read-kernel fingerprint did not move (%). The patch above did not '
      'change iam.accessible_entity_ids.', v_old;
  end if;
  execute format(
    'create or replace function iam.entity_read_kernel_expected() returns text language sql '
    'immutable as $f$ select %L::text $f$', v_new);
  if iam.entity_read_kernel_fingerprint() <> iam.entity_read_kernel_expected() then
    raise exception 'dd175e: the re-stamp did not take — iam.entity_read_expr would refuse to emit.';
  end if;
  raise notice 'dd175e: read-kernel fingerprint % -> % (DD-175e)', v_old, v_new;
end $fp$;

-- ── RED THEN GREEN, ON THE REAL ROW, WITH THE REAL IDENTITY ──────────────────────────────────────
-- The RED is on disk: iam.dd175_component_lane_baseline's BEFORE phase records 101
-- chat.coding_session_entry rows readable by admin@admin.com under a soft-deleted parent, and the
-- same probe was still reporting 101 immediately before this file ran. This asserts the GREEN, and
-- asserts the owner did not lose the sessions that are NOT deleted.
do $$
declare
  v_uid uuid; v_dead uuid; v_n bigint; v_live bigint; v_ids uuid[];
begin
  select id into v_uid from auth.users where email = 'admin@admin.com';
  select s.id into v_dead from chat.coding_session s
   where s.created_by = v_uid and s.deleted_at is not null
     and exists (select 1 from chat.coding_session_entry e where e.coding_session_id = s.id)
   order by s.deleted_at desc limit 1;
  if v_dead is null then
    raise exception 'dd175e: no soft-deleted chat.coding_session with entries exists for '
      'admin@admin.com, so the proof cannot run. An unrun forcing test is not a forcing test.';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_ids := iam.accessible_entity_ids('coding_session', 'viewer'::public.permission_level, 0, true);
  execute format('select count(*) from chat.coding_session_entry e where e.coding_session_id = %L', v_dead)
    into v_n;
  select count(*) into v_live from chat.coding_session s
   where s.created_by = v_uid and s.deleted_at is null;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);

  if v_dead = any(coalesce(v_ids, '{}'::uuid[])) then
    raise exception 'dd175e: iam.accessible_entity_ids still returns the soft-deleted coding_session '
      '% that chat.coding_session''s own std_select hides.', v_dead;
  end if;
  if v_n <> 0 then
    raise exception 'dd175e: admin@admin.com still reads % coding_session_entry row(s) under the '
      'soft-deleted session %.', v_n, v_dead;
  end if;
  if coalesce(array_length(v_ids,1),0) < v_live then
    raise exception 'dd175e: the filter took too much — admin@admin.com owns % live coding_sessions '
      'but the set form now returns only %.', v_live, coalesce(array_length(v_ids,1),0);
  end if;
  raise notice 'dd175e: the soft-deleted coding_session % is gone from the set form, its 101 entries '
    'read 0, and the % live sessions the owner has are all still there.', v_dead, v_live;
end $$;
