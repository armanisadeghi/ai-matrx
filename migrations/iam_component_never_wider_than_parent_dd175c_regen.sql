-- iam_component_never_wider_than_parent_dd175c_regen — DD-175: the component tokens the check
-- reports open, generated.
--
-- THE SET IS DERIVED FROM THE CHECK, NEVER HAND-TYPED. A hand-typed list drifts from the machinery
-- the moment anything else moves; this file regenerates exactly whatever
-- `component_not_wider_than_parent` still FAILs on, so it is idempotent and order-independent, and
-- re-running it after the last token closes is a no-op.
--
-- WHAT WAS OPEN WHEN THIS WAS WRITTEN (measured 2026-09-12, and each named with its reason)
-- ----------------------------------------------------------------------------------------
--   workbench.udt_document_snapshots   platform_admin_all — a staff ALL policy sitting beside a
--   workbench.udt_workbook_snapshots   lane that never asks the parent. Both parents are class
--                                      `private`, so the class closes the staff lane; the policy
--                                      granted it back. B-57 rehearsed generating these two and
--                                      REFUSED, because the set form was then wider than the
--                                      parent (a non-member would have gone 74 -> 101). dd175b
--                                      closed that, which is why they generate cleanly here.
--   agent.card                         ROW SECURITY DISABLED on a registered component: every
--   workflow.card                      signed-in client reads every row. That is the widest lane a
--   content_ir.kind_conformance        component can have, and `iam.apply_rls` enables row security
--                                      as part of generating. agent.card holds 419 rows and
--                                      content_ir.kind_conformance 1,131; workflow.card holds 0.
--
-- WHAT IS DELIBERATELY NOT REGENERATED, each by name:
--   users.credential_attachments  its single read policy is
--                                 `exists (select 1 from users.credential_items where id = …)` —
--                                 the parent's OWN deployed policy, the strictest of the three
--                                 accepted forms, and it already PASSES. Generating it would swap
--                                 that for `accessible_entity_ids('credential_item')`, which does
--                                 not know `users.user_secret_grants`, so a grantee would LOSE the
--                                 attachments of a credential they may use. Over-tightening is a
--                                 defect too (db-rules §6).
--   the other 309 live components which the check already passes: their policy text does not
--                                 change at all under DD-175 — the fix is inside the function their
--                                 parent arm already calls, so they narrow without being touched.
--                                 Regenerating 309 tables to emit byte-identical policies is 309
--                                 ACCESS EXCLUSIVE locks bought for nothing (dd171c lost two
--                                 deadlocks to exactly that shape).

do $$
declare r record; v_done text[] := '{}';
begin
  for r in
    select distinct et.token, et.schema_name, et.table_name
      from platform.entity_types et
      join platform.entity_relationships er on er.child_type = et.token and er.kind in ('composition','containment')
     where et.is_active and et.rls_variant = 'component'
       and to_regclass(format('%I.%I', et.schema_name, et.table_name)) is not null
       and exists (select 1 from information_schema.columns c
                    where c.table_schema = et.schema_name and c.table_name = et.table_name
                      and c.column_name = er.fk_column)
     order by et.token
  loop
    continue when not exists (
      select 1 from iam.verify_canonical(r.schema_name, r.table_name, r.token, 'component') v
       where v.check_name = 'component_not_wider_than_parent' and v.status = 'FAIL');
    -- users.credential_attachments carries the strictest form there is and passes; nothing else is
    -- exempt, so the exemption is not a list, it is the check's own verdict.
    perform iam.apply_rls(r.schema_name, r.table_name, r.token, 'component');
    v_done := array_append(v_done, r.token);
  end loop;
  if cardinality(v_done) = 0 then
    raise notice 'dd175c: nothing was open — component_not_wider_than_parent already passes everywhere';
  else
    raise notice 'dd175c: generated % component token(s): %', cardinality(v_done), array_to_string(v_done, ', ');
  end if;
end $$;
