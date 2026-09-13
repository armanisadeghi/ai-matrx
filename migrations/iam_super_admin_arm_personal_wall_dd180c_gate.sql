-- iam_super_admin_arm_personal_wall_dd180c_gate — DD-180, THE END-STATE ASSERTION.
--
-- The seven batch files each committed on their own, so "the migrations ran" is not the same
-- sentence as "the §6e super-admin arm is walled everywhere it can be". A batch can commit and the
-- next one fail — two of them did fail on their first attempt, deadlocked against live traffic, and
-- were re-run. This file asks the DATABASE, token by token, through the check itself.
--
-- THE POPULATION: every active registered token whose table carries a real
-- `platform.visibility` column — the only tables that can hold a `personal` row at all, and
-- therefore the only ones where an unwalled super-admin arm means anything.
--
-- WHAT IS OUTSIDE THAT POPULATION, NAMED RATHER THAN OMITTED:
--
--  1. 162 std_select policies on tables with NO `platform.visibility` column still carry the arm in
--     its unwalled form, and that is correct by construction, not residue.
--     `platform.entity_row_access_attrs` hard-codes `personal` for such a table, so the kernel's own
--     arm is guarded `not iam.table_has_visibility(...) and not iam.token_is_parented_component(...)`
--     and `iam.entity_read_expr` emits exactly that shape. Walling it would delete the arm's only
--     lane on a table that cannot hold a personal row. The check SKIPs them for the same reason.
--
--  2. FOUR RETIRED TABLES IN `graveyard` CARRY THE UNWALLED ARM AND CANNOT BE SWEPT — AND DO NOT
--     NEED TO BE, BECAUSE THE DOOR ITSELF IS GONE. `graveyard.user_flashcard_sets` (token
--     flashcard_set), `graveyard.mandate_binding` (mandate_binding_legacy), `graveyard.mandate`
--     (mandate_legacy) and `graveyard.provision` (agent_provision_legacy) all have a typed
--     visibility column, a generated std_select carrying the pre-DD-170 arm, and an INACTIVE
--     registry row — so `iam.apply_rls` refuses them by construction ("token X is not an active
--     registered entity") and a policy is never hand-written (db-rules §0).
--     Measured 2026-09-13: 24 / 10 / 375 / 225 rows, and `graveyard.mandate_binding` holds ONE row
--     with `visibility = 'personal'` owned by a global-readable system organization. That row is NOT
--     reachable: `anon` and `authenticated` hold no privilege of any kind on these four tables
--     (DD-136c removed them; only `service_role` is granted, and it bypasses RLS regardless of what
--     any policy says), so no client role can reach the arm to use it. `check:staff-door` already
--     carries the same four as frozen unguarded arms on tables no client role can reach, and says
--     out loud that a RESTORED GRANT makes them a finding again. This gate asserts the same four
--     stay exactly as measured, in both directions, so the residue cannot rot into folklore.
--
-- Nothing in this file changes access. It measures and it raises.
do $dd180c$
declare
  r record; v_open text[] := '{}'; v_checked int := 0;
  v_gy_open text[] := '{}'; v_gy_expected constant text[] := array[
    'graveyard.user_flashcard_sets','graveyard.mandate_binding','graveyard.mandate','graveyard.provision'];
  v_gy_unexpected text[]; v_gy_closed text[]; v_personal bigint;
begin
  -- ═══════ 1. THE ACTIVE POPULATION — every one of them, walled ════════════════════════════════
  for r in
    select et.token, et.schema_name, et.table_name, et.rls_variant
      from platform.entity_types et
     where et.is_active
       and to_regclass(format('%I.%I', et.schema_name, et.table_name)) is not null
       and exists (select 1 from information_schema.columns c
                    where c.table_schema = et.schema_name and c.table_name = et.table_name
                      and c.column_name = 'visibility' and c.udt_schema = 'platform'
                      and c.udt_name = 'visibility')
     order by et.token
  loop
    v_checked := v_checked + 1;
    if exists (select 1 from iam.verify_canonical(r.schema_name, r.table_name, r.token, r.rls_variant) v
                where v.check_name = 'super_admin_system_org_arm_walled' and v.status = 'FAIL') then
      v_open := array_append(v_open, r.token);
    end if;
  end loop;
  if cardinality(v_open) > 0 then
    raise exception 'dd180c: % active token(s) still carry a super-admin read arm with no `visibility >= ''internal''` wall: %. Re-run the batch that owns them (dd180b1..7 are idempotent).',
      cardinality(v_open), array_to_string(v_open, ', ');
  end if;
  raise notice 'dd180c: all % active tokens with a typed visibility column carry the §6e super-admin arm WALLED. Zero residue in the population.', v_checked;

  -- ═══════ 2. THE FOUR RETIRED TABLES — named, measured, and asserted in both directions ═══════
  for r in
    select n.nspname as s, c.relname as t
      from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'graveyard' and p.polpermissive
       and regexp_replace(coalesce(pg_get_expr(p.polqual, p.polrelid), ''), '\s+', ' ', 'g')
           like '%(organization_id IS NOT NULL) AND ( SELECT is_super_admin() AS is_super_admin)%'
       -- the same population as the active half: only a table with a REAL visibility column can
       -- hold a `personal` row, so only there is the missing wall a defect. `graveyard`'s other
       -- retired tables carry the arm in its correct unwalled form (e.g. user_flashcard_reviews,
       -- which has no visibility column at all) and belong to case 1 above, not to this list.
       and exists (select 1 from information_schema.columns col
                    where col.table_schema = n.nspname and col.table_name = c.relname
                      and col.column_name = 'visibility' and col.udt_schema = 'platform'
                      and col.udt_name = 'visibility')
     group by 1, 2 order by 1, 2
  loop
    v_gy_open := array_append(v_gy_open, r.s || '.' || r.t);
  end loop;
  v_gy_unexpected := array(select unnest(v_gy_open) except select unnest(v_gy_expected));
  v_gy_closed     := array(select unnest(v_gy_expected) except select unnest(v_gy_open));
  if cardinality(v_gy_unexpected) > 0 then
    raise exception 'dd180c: % retired table(s) in graveyard carry the unwalled arm and are NOT the four this round measured: %. A retired table gaining a generated policy is a finding of its own.',
      cardinality(v_gy_unexpected), array_to_string(v_gy_unexpected, ', ');
  end if;
  if cardinality(v_gy_closed) > 0 then
    raise exception 'dd180c: % of the four named retired tables no longer carries the arm: %. Good news — remove it from v_gy_expected here in the same commit as whatever closed it. A residue list that quietly shrinks is a residue list nobody re-reads.',
      cardinality(v_gy_closed), array_to_string(v_gy_closed, ', ');
  end if;
  -- 🚨 THE SENTENCE ABOVE IS ASSERTED, NOT CLAIMED. The four are residue ONLY because no client
  -- role can reach them; if a grant comes back, the unwalled arm is live again and this file must
  -- stop saying they are harmless.
  if exists (select 1 from information_schema.role_table_grants g
              where g.table_schema = 'graveyard'
                and g.table_name in ('user_flashcard_sets','mandate_binding','mandate','provision')
                and g.grantee in ('anon','authenticated')) then
    raise exception 'dd180c: a client role (anon/authenticated) has been granted a privilege on one of the four retired graveyard tables that still carry the UNWALLED system-org super-admin arm. The arm is reachable again and the residue is no longer residue: revoke the grant, or retire the table properly.';
  end if;
  select count(*) into v_personal from graveyard.mandate_binding b
   where b.visibility = 'personal'
     and b.organization_id in (select organization_id from iam.system_orgs where global_readable);
  raise notice 'dd180c: the four retired graveyard tables still carry the unwalled arm (iam.apply_rls refuses an inactive token by construction); graveyard.mandate_binding holds % personal row(s) under a global-readable system organization, reachable by NO client role — anon and authenticated hold no privilege on any of the four (DD-136c). Named residue, asserted in both directions, not silently excused.', v_personal;
end
$dd180c$;
