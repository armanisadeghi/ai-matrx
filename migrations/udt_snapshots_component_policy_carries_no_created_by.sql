-- udt_snapshots_component_policy_carries_no_created_by — 2026-09-18
--
-- THE FINDING. `pnpm check:component-created-by:strict` (THE COMPONENT OWNERSHIP LAW, db-rules
-- §6d-1): two component INSERT policies reference created_by in their with_check —
-- workbench.udt_document_snapshots.udt_document_snapshots_insert and
-- workbench.udt_workbook_snapshots.udt_workbook_snapshots_insert.
--
-- THE CLASS. Both are BESPOKE policies from before the tables were registered as components; the
-- generator later added the canonical set (std_insert: parent editor via iam.accessible_entity_ids)
-- BESIDE them and, by contract, never drops a policy it did not author. So the canonical insert
-- lane and a hand-written one carrying `d.created_by = auth.uid()` on the PARENT row have coexisted
-- — the D182(3) shape the law was written to kill. The parent-owner arm the bespoke policy
-- expressed is already inside std_insert (an owner holds editor on their own parent), so the
-- bespoke policy adds nothing but the violation. Both are superseded through the generator's own
-- removal door, iam.supersede_bespoke_policies, which records the reason.
--
-- Regeneration: udt_workbook_snapshots regenerates cleanly (proven in a rolled-back dry run).
-- udt_document_snapshots is REFUSED by iam.apply_rls: its token declares
-- component_anon_read_via_public_parent but the parent workbench.udt_documents has no anon SELECT
-- grant, so the generated pub_read subquery would 42501 for anonymous readers — a pre-existing,
-- separate defect recorded in FOUND_DEFECTS (D-udt-anon-parent), owned by the workbench lane. This
-- file does not regenerate that table; the offending policy is gone either way.

set local lock_timeout = '10s';

-- The generator's own removal door (iam.supersede_bespoke_policies records the reason in
-- iam.superseded_policy) — the route its regeneration NOTICE names for a bespoke policy.
select iam.supersede_bespoke_policies('workbench', 'udt_document_snapshots', array['udt_document_snapshots_insert'],
  'THE COMPONENT OWNERSHIP LAW (db-rules 6d-1): this bespoke INSERT policy keyed on the parent document''s created_by = auth.uid(); the generated std_insert (parent editor via iam.accessible_entity_ids) already admits the owner, so the policy added only the created_by clause check:component-created-by forbids. 2026-09-18.');
select iam.supersede_bespoke_policies('workbench', 'udt_workbook_snapshots', array['udt_workbook_snapshots_insert'],
  'THE COMPONENT OWNERSHIP LAW (db-rules 6d-1): this bespoke INSERT policy keyed on the parent workbook''s created_by = auth.uid(); the generated std_insert (parent editor via iam.accessible_entity_ids) already admits the owner, so the policy added only the created_by clause check:component-created-by forbids. 2026-09-18.');

select iam.apply_rls('workbench', 'udt_workbook_snapshots', 'udt_workbook_snapshot', 'component');

do $proof$
declare v_n int; v_bad text;
begin
  select count(*), string_agg(p.polrelid::regclass::text || '.' || p.polname, ', ') into v_n, v_bad
    from pg_policy p
   where p.polrelid in ('workbench.udt_document_snapshots'::regclass, 'workbench.udt_workbook_snapshots'::regclass)
     and (coalesce(pg_get_expr(p.polqual, p.polrelid), '') ~ 'created_by'
          or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ~ 'created_by');
  if v_n > 0 then
    raise exception 'udt_snapshots: % component polic(ies) still reference created_by: %', v_n, v_bad;
  end if;
end $proof$;
