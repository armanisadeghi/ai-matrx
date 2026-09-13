-- iam_component_never_wider_than_parent_dd175g_public_parent_anon — DD-175: the one lane this round
-- took that it should not have, restored the canonical way.
--
-- WHAT THE GATE CAUGHT IN ITS OWN NARROWING LIST
-- ---------------------------------------------
-- dd175d's access delta recorded 16 narrowings. Fifteen are the point of DD-175 — a component row
-- that was only ever reachable under a parent the reader may not read. ONE is not:
--
--   udt_document_snapshot / anonymous (no JWT):  74 -> 0
--
-- `workbench.udt_documents` carries `pub_read` for `anon` (`deleted_at is null and visibility =
-- 'public'`), and 74 of the 243 snapshots hang off a public, live document. Before this round the
-- snapshots table carried a hand-written `udt_document_snapshots_select` policy granted to the
-- `public` role, and anon held a SELECT grant beside it; dd175c's canonical `iam.apply_table_grants`
-- for the `component` variant took the grant away and dd175f superseded the policy, so the lane
-- closed as a side effect of two changes that were aimed at the platform-staff door.
--
-- db-rules §6: a legitimate reader blocked from their own data is as serious a bug as a stranger let
-- in. So the lane comes back — through the registry flag that exists for exactly this shape, never
-- by re-adding a bespoke policy:
--
--   platform.entity_types.component_anon_read_via_public_parent = true
--
-- `iam._apply_rls_unchecked` then emits `pub_read` keyed on the PARENT'S `visibility = 'public'`
-- (and on the parent's own `deleted_at is null`), and refuses outright if anon has no SELECT grant
-- on the parent — so the emitted lane cannot be wider than the parent's own anonymous lane, by
-- construction. `iam.verify_canonical`'s `component_public_read` check then holds it there.
--
-- `udt_workbook_snapshot` is NOT given the flag: the same delta shows it at 0 for the anonymous
-- principal both before and after, so there is no lane to restore and declaring one would be a
-- widening nobody measured.

update platform.entity_types
   set component_anon_read_via_public_parent = true
 where token = 'udt_document_snapshot'
   and is_active
   and coalesce(component_anon_read_via_public_parent, false) = false;

do $$
declare r record;
begin
  select et.schema_name, et.table_name into r
    from platform.entity_types et where et.token = 'udt_document_snapshot' and et.is_active;
  perform iam.apply_rls(r.schema_name, r.table_name, 'udt_document_snapshot', 'component');
end $$;

-- ── THE PROOF: anon reads the snapshots of PUBLIC documents and nothing else ──────────────────────
do $$
declare v_public bigint; v_anon bigint; v_leak bigint;
begin
  select count(*) into v_public
    from workbench.udt_document_snapshots s
    join workbench.udt_documents d on d.id = s.document_id
   where d.visibility = 'public' and d.deleted_at is null;
  if v_public = 0 then
    raise exception 'dd175g: no snapshot hangs off a public document, so the lane being restored '
      'has nothing to carry and this file is restoring nothing. Refusing.';
  end if;

  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
  select count(*) into v_anon from workbench.udt_document_snapshots;
  select count(*) into v_leak from workbench.udt_document_snapshots s
   where not exists (select 1 from workbench.udt_documents d
                      where d.id = s.document_id and d.visibility = 'public' and d.deleted_at is null);
  perform set_config('role', 'postgres', true);

  if v_leak <> 0 then
    raise exception 'dd175g: an anonymous session reads % snapshot(s) whose document is not a live '
      'public document. The restored lane is wider than the parent''s own anonymous lane.', v_leak;
  end if;
  if v_anon <> v_public then
    raise exception 'dd175g: an anonymous session reads % snapshots but % hang off a live public '
      'document. The restored lane does not match the parent''s.', v_anon, v_public;
  end if;
  raise notice 'dd175g: an anonymous session reads exactly the % snapshots of live public documents, '
    'and 0 others.', v_anon;
end $$;
