-- platform_registered_tables_generated_dd159b_batch — EVERY REGISTERED TABLE HAS GENERATED POLICIES
-- (DD-159 batch 2, continuing B-48's registration round. SECURITY.)
--
-- B-48 registered 121 client-readable tables and deliberately regenerated NONE of them, because at
-- that moment `iam.apply_rls` dropped every policy on a table including ones it had not written.
-- DD-147 (the file before this one) fixed that: the generator now drops only the seven names in
-- `iam.generated_policy_names()` and KEEPS anything else, naming it out loud.
--
-- 🚨 THAT MAKES THIS FILE'S SHAPE DIFFERENT, AND THE DIFFERENCE IS THE POINT. If it simply called
-- `iam.apply_rls`, every one of these tables would end up carrying its hand-written set AND a
-- generated set at once — permissive policies OR together, so the table would finish WIDER than
-- either regime intended. Each table's bespoke policies are therefore superseded FIRST, BY NAME,
-- through `iam.supersede_bespoke_policies` with a reason recorded in `iam.superseded_policy`.
-- Nothing here drops a policy nobody enumerated, and the enumeration is RE-READ before any drop:
-- any difference from the census this file was written against aborts the whole file, naming both
-- sides. A census taken at 20:40 and applied at 21:10 is a guess unless something re-reads it.
--
-- ═══ THE DECLARATION THAT MUST COME BEFORE THE GENERATION ═════════════════════════════════════
-- `iam.class_lanes` says `platform_admin_lane = false` for every `private` and `confidential` token
-- in this batch, and B-48 registered all 121 without `suppress_platform_admin_lane`. Generating
-- them as they stand would emit `platform_admin_all` on tables whose class forbids a staff lane —
-- the exact defect DD-137b closed for the rest of the registry, re-opened on 93 new tables, which
-- is why `pnpm check:staff-door` is RED. So the DECLARATION is set here, in the same transaction,
-- BEFORE the generator runs, and the generator reads it. A wall that is only written down is a
-- wall the next regeneration quietly removes.
--
-- ═══ WHAT IS IN THIS BATCH, AND WHAT IS NOT ═══════════════════════════════════════════════════
-- Of B-48's 121: **36 are `audit_class='machinery'`** and `iam.apply_rls` refuses them by
-- construction; **58 more refuse** because they lack the base contract their variant requires
-- (`created_by`, `organization_id`, or a typed visibility column) — a base retrofit is a schema
-- change and another lane's decision, not something to smuggle into an RLS batch. Measured token by
-- token in a rolled-back rehearsal on this database, 2026-09-12: **27 of 121 generate**. Seven of
-- those 27 are held back and every one is named in the B-54 report with its reason:
--   platform_share_link, user_secret_audit  — B-48's own registration text says do NOT run
--       iam.apply_rls on them (the anon share-link resolver, 355 live links; the vault's own trail).
--   row_version             — partitioned; its 28 partitions each carry their own bespoke
--                             restrictive policy, so regenerating the parent alone leaves a mixed
--                             regime.
--   billing_usage_ledger,   — classed `private`, whose `iam.class_lanes` has NO org-member lane,
--   retrieval_audit           but the `ledger` VARIANT emits an org read lane unconditionally.
--                             Rehearsed: an org admin would go from 0 to 1,520 rows of other
--                             people's spend. The generator has no private-ledger shape; that is a
--                             gap to rule on, not to ship.
--   udt_document_snapshot,  — components whose resolved class is `private` (no org lane) while the
--   udt_workbook_snapshot     component lane reads through the parent's accessible ids. Rehearsed:
--                             a NON-MEMBER would gain 27 snapshots. Same shape of conflict.
--   knob_override_audit     — classed `confidential`, but the generated `ledger` lane carries the
--                             db-rules §6e global-readable system-org arm, and 27 of its 88 rows
--                             belong to such an org. Rehearsed: those 27 become readable by EVERY
--                             authenticated user, non-members included. `iam.class_lanes` has no
--                             opinion about the system-org arm, so nothing in the class regime
--                             sanctions handing a confidential audit to everyone signed in.
-- **19 tokens are in this batch.**
--
-- Nothing here changes a schema. Policies, grants and one registry declaration.
set local lock_timeout = '4s';

-- ═════════════════════════════ 1. THE DECLARATION (read by the generator in step 3, same txn)
do $$
declare r record; n integer := 0;
begin
  for r in
    select et.token, l.platform_admin_lane, coalesce(et.suppress_platform_admin_lane,false) sup
      from platform.entity_types et, lateral iam.class_lanes(et.token) l
     where et.token = any (array[
       'assignment_session', 'dict_entry', 'org_member_control',
       'udt_dataset_template', 'org_admin_audit',
       'billing_connect_account', 'billing_customer', 'billing_subscription',
       'billing_user_plan', 'chat_user_usage_summary', 'extension_auth_code',
       'files_user_account', 'html_extraction', 'mcp_user_conn',
       'study_streak', 'task_user_state', 'user_active_context',
       'user_entity_state', 'user_storage_usage'])
     order by et.token
  loop
    if not r.platform_admin_lane and not r.sup then
      update platform.entity_types set suppress_platform_admin_lane = true where token = r.token;
      n := n + 1;
      raise notice 'dd159b: % declares suppress_platform_admin_lane — its class has no staff lane', r.token;
    elsif r.platform_admin_lane and r.sup then
      raise exception 'dd159b: % declares suppress_platform_admin_lane but its class HAS a staff lane. The registry and the class disagree; nothing was generated.', r.token;
    end if;
  end loop;
  raise notice 'dd159b: % token(s) newly declared', n;
end $$;

-- ══════════════════════ 2. THE SUPERSEDE, BY NAME   +   3. THE GENERATION, in one pass per table
do $$
declare
  r record;
  v_live text[];
  v_missing text[];
  v_extra text[];
  v_reason text;
  n integer := 0;
begin
  for r in
    select * from (values
      ('assignment_session', 'assignment', 'session', 'entity', array['platform_admin_only']),
      ('dict_entry', 'dictionary', 'dict_entries', 'entity', array['dict_entries_read']),
      ('org_member_control', 'iam', 'org_member_controls', 'entity', array['platform_admin_only']),
      ('udt_dataset_template', 'workbench', 'udt_dataset_templates', 'entity', array['udt_dataset_templates_delete', 'udt_dataset_templates_insert', 'udt_dataset_templates_select', 'udt_dataset_templates_update']),
      ('org_admin_audit', 'iam', 'org_admin_audit', 'ledger', array['platform_admin_only']),
      ('billing_connect_account', 'billing', 'connect_account', 'personal', array['platform_admin_only']),
      ('billing_customer', 'billing', 'customer', 'personal', array['customer_no_write', 'customer_self', 'platform_admin_delete_only', 'platform_admin_insert_only', 'platform_admin_update_only']),
      ('billing_subscription', 'billing', 'subscription', 'personal', array['platform_admin_delete_only', 'platform_admin_insert_only', 'platform_admin_update_only', 'subscription_no_write', 'subscription_self']),
      ('billing_user_plan', 'billing', 'user_plan', 'personal', array['platform_admin_only']),
      ('chat_user_usage_summary', 'chat', 'user_usage_summary', 'personal', array['rt_select']),
      ('extension_auth_code', 'extend', 'extension_auth_codes', 'personal', array['Users can delete their own codes', 'Users can insert their own codes', 'Users can read their own codes', 'Users can update their own codes']),
      ('files_user_account', 'files', 'user_account', 'personal', array['cld_user_account_owner_select']),
      ('html_extraction', 'api', 'html_extractions', 'personal', array['platform_admin_only']),
      ('mcp_user_conn', 'tool', 'mcp_user_conn', 'personal', array['tool_mcp_user_conn_delete', 'tool_mcp_user_conn_insert', 'tool_mcp_user_conn_select', 'tool_mcp_user_conn_update']),
      ('study_streak', 'education', 'study_streak', 'personal', array['platform_admin_delete_only', 'platform_admin_insert_only', 'platform_admin_update_only', 'study_streak_select_own']),
      ('task_user_state', 'workspace', 'task_user_state', 'personal', array['own_rows']),
      ('user_active_context', 'context', 'user_active_context', 'personal', array['uac_delete', 'uac_insert', 'uac_select', 'uac_update']),
      ('user_entity_state', 'platform', 'user_entity_state', 'personal', array['platform_admin_only', 'ues_own']),
      ('user_storage_usage', 'files', 'user_storage_usage', 'personal', array['cld_user_storage_usage_owner_select'])
    ) as t(token, sch, tbl, variant, bespoke)
    order by t.token
  loop
    raise notice 'dd159b: starting % (%.%)', r.token, r.sch, r.tbl;
    if to_regclass(format('%I.%I', r.sch, r.tbl)) is null then
      raise exception 'dd159b: %.% does not exist', r.sch, r.tbl;
    end if;

    select coalesce(array_agg(p.polname order by p.polname), '{}') into v_live
      from pg_policy p
     where p.polrelid = format('%I.%I', r.sch, r.tbl)::regclass
       and not (p.polname = any (iam.generated_policy_names()));
    v_missing := array(select unnest(r.bespoke::text[]) except select unnest(v_live));
    v_extra   := array(select unnest(v_live) except select unnest(r.bespoke::text[]));
    if v_missing <> '{}' or v_extra <> '{}' then
      raise exception
        'dd159b: the bespoke policy set on %.% is not what this file was written against. Declared but absent: %. Present but undeclared: %. Nothing was dropped. Re-census and re-write this file rather than guessing.',
        r.sch, r.tbl, array_to_string(v_missing, ', '), array_to_string(v_extra, ', ');
    end if;

    if cardinality(r.bespoke::text[]) > 0 then
      v_reason := format(
        'DD-159 batch 2: %s was registered by B-48 with a data_class and an rls_variant, and its hand-written policy set is superseded by the generated set iam.apply_rls emits for variant %s in the same transaction. Kept unsuperseded it would OR with the generated set and leave the table wider than either regime intended.',
        r.token, r.variant);
      perform iam.supersede_bespoke_policies(r.sch, r.tbl, r.bespoke::text[], v_reason);
    end if;

    perform iam.apply_rls(r.sch, r.tbl, r.token, r.variant);
    n := n + 1;
    raise notice 'dd159b: generated % (%.% / %), superseding % bespoke policy/policies',
      r.token, r.sch, r.tbl, r.variant, cardinality(r.bespoke::text[]);
  end loop;
  raise notice 'dd159b: % token(s) generated', n;
end $$;
