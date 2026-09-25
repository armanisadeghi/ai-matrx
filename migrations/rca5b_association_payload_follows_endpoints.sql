-- RC-A5b — AN EDGE THAT CARRIES AN ENDPOINT'S CONTENT IS READ ONLY BY SOMEONE WHO CAN READ BOTH ENDS.
-- chair-step: narrows client reads of platform.associations (restrictive policy) and takes the supautils 23-relation policy lock; applied only when named, in the 1-4 AM PT window, right after rca5a.
-- Design, census and measurements: common-docs/projects/rich-content-unification/ASSOCIATION-VISIBILITY.md
-- Register: common-docs/projects/rich-content-unification/REGISTER.md row RC-A5.
--
-- THE DEFECT (reproduced on production 2026-09-25 in a rolled-back block, nothing committed):
-- platform.associations is read by clients under `assoc_select` = platform admin OR member of the
-- edge's organization. RC-A3's `text_anchor` payload is the exact quoted passage of the target
-- document, so a plain member (test@test.com) of Admin's Workspace read a quote from admin's
-- PERSONAL study guide on an `annotates` edge between two personal documents:
--     member: rows=1 quote=private src_readable=f tgt_readable=f
--
-- THE CLASS FIX — kind-declared, both ends:
--   1. platform.edge_payload_kind declares, per kind, whether its payload copies content out of an
--      endpoint (`payload_follows_endpoints`, with a reason for every kind registered today).
--      FAIL-CLOSED: the column defaults TRUE, so a kind registered later is gated until its author
--      writes down why it carries no endpoint content. True today: text_anchor, text_anchor_set
--      (quoted passages of the target), relation_snapshot (frozen copy of the target's values),
--      render_binding (the variable values that filled a rendered document), party_observation
--      (quote + fields from a research source, default visibility personal).
--   2. ONE RESTRICTIVE SELECT policy on platform.associations: a row of a declared kind is visible
--      only to a platform admin or to someone for whom iam.has_access(..., 'viewer') is true on
--      BOTH ends — the predicate every assoc_* door already applies to every edge (DD-205;
--      iam.assoc_side_readable answers exactly this for a signed-in caller). Restrictive, so it can
--      only narrow: assoc_select and platform_admin_select are untouched, and every other row keeps
--      today's rule.
--
-- WHY NOT EVERY ROW (measured, ASSOCIATION-VISIBILITY.md §4): iam.has_access costs ~1.1 ms; 681
-- generated std_select policies read this table through the security_invoker view
-- platform.associations_live, and the fc_card arm alone would add 4,077 x 2 kernel calls to every
-- flashcard read. Whole-row parity needs Rule 9's set-wise visibility cache (RC-A5b). Measured on
-- the clone for THIS design, same member, before -> after: source read 231.5 -> 233.6 ms, target
-- read 7.19 -> 7.26 ms, flashcard list 4,500 -> 4,536 ms, conversation summary 4,297 -> 4,289 ms.
--
-- WHY NOT iam.apply_rls: platform.associations is registered audit_class = machinery (token
-- agent_surface_binding); the generator refuses machinery by construction because the kernel reads
-- these rows. The machinery route is a policy of record in a ledgered migration (DD-172) — this one.
--
-- window-class: CREATE POLICY on platform.associations. supautils' policy_grants hook takes ACCESS
-- EXCLUSIVE on the 23 auth/storage/realtime relations for any policy DDL until COMMIT, so the policy
-- is the ONLY statement in this file and nothing follows it. Applied in the 1-4 AM PT window.
-- Requires rca5a (the declaration). Emergency inverse: migrations/inverse/rca5b_association_payload_follows_endpoints_down.sql.
-- lock_timeout is 2s: the queued ACCESS EXCLUSIVE blocks new readers of this table while it waits,
-- so it gives up fast and is re-run rather than stalling every reader for longer (plan-attack finding 4).

set local lock_timeout = '2s';

-- ─────────────────────────────────────────────────────────────────────────────
-- THE GATE — the only statement (see window-class above).
-- ─────────────────────────────────────────────────────────────────────────────
create policy assoc_payload_follows_endpoints on platform.associations
  as restrictive
  for select
  to authenticated
  using (
    (select public.is_platform_admin())
    or payload_kind is null
    or payload_kind <> all (array(select k.kind from platform.edge_payload_kind k
                                   where k.payload_follows_endpoints))
    -- has_org_access first: assoc_select already requires it, so it changes nothing about WHO reads,
    -- and it keeps a scan across other organizations' gated rows from paying two kernel calls each.
    or (iam.has_org_access(organization_id)
        and iam.has_access(source_type, source_id, 'viewer'::public.permission_level)
        and iam.has_access(target_type, target_id, 'viewer'::public.permission_level))
  );
