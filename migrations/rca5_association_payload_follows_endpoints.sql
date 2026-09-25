-- RC-A5 — AN EDGE THAT CARRIES AN ENDPOINT'S CONTENT IS READ ONLY BY SOMEONE WHO CAN READ BOTH ENDS.
-- chair-step: narrows client reads of platform.associations (restrictive policy) and takes the supautils 23-relation policy lock; applied only when named, in the 1-4 AM PT window, after plan-attack and clone rehearsal.
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
--      endpoint (`payload_follows_endpoints`, with the reason for every one of the 13 kinds).
--      True: text_anchor (quoted passage of the target), relation_snapshot (frozen copy of the
--      target's values), party_observation (quote + fields asserted from a research source, whose
--      default visibility is personal).
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
-- is the LAST statement and nothing follows it. Applied in the 1-4 AM PT window.
-- Emergency inverse: migrations/inverse/rca5_association_payload_follows_endpoints_down.sql.

set local lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. THE DECLARATION (catalog-only ADD COLUMN on a 13-row registry).
-- ─────────────────────────────────────────────────────────────────────────────
alter table platform.edge_payload_kind
  add column if not exists payload_follows_endpoints boolean not null default false,
  add column if not exists payload_follows_endpoints_reason text;

comment on column platform.edge_payload_kind.payload_follows_endpoints is
  'RC-A5. True when this payload copies content out of an endpoint (a quoted passage, a snapshot of a record''s values, a quote from a source). An edge of such a kind is readable only by a platform admin or by someone who can read BOTH ends (policy assoc_payload_follows_endpoints on platform.associations). Content from an endpoint never goes in label or metadata. See common-docs/projects/rich-content-unification/ASSOCIATION-VISIBILITY.md.';
comment on column platform.edge_payload_kind.payload_follows_endpoints_reason is
  'Why payload_follows_endpoints is what it is for this kind — one sentence, required reading for the next kind author.';

update platform.edge_payload_kind k
   set payload_follows_endpoints = v.follows,
       payload_follows_endpoints_reason = v.reason
  from (values
    ('text_anchor', true, 'The payload is the exact quoted passage (plus prefix/suffix) of the target document; reading it is reading the target.'),
    ('relation_snapshot', true, 'The payload is a frozen copy of the target record''s values; reading it is reading the target.'),
    ('party_observation', true, 'The payload quotes and extracts fields from the research source (default visibility personal); reading it is reading the source.'),
    ('map_topic_coverage', false, 'Mapper confidence, source and a one-line reason about the edge itself; no endpoint content.'),
    ('map_page_intent', false, 'The disposition decided for a page (keep/move/merge...); a decision about the edge, not endpoint content.'),
    ('map_facet_assignment', false, 'Who set a facet value and which facet; provenance of the edge, not endpoint content.'),
    ('party_affiliation', false, 'Display mirror of crm.affiliation (title, dates) describing the relationship itself.'),
    ('party_link_prospect', false, 'Why a referring domain became a CRM organization: bridge provenance, public link metrics.'),
    ('party_outreach_case', false, 'Why a media outlet became a CRM organization: the case verdict that motivated the edge.'),
    ('party_link_gap', false, 'Why a link-gap domain became a CRM organization: public competitor link metrics.'),
    ('party_serp_prospect', false, 'Why a SERP domain became a CRM organization: public search metrics and broken-link facts.'),
    ('plan_review', false, 'When a plan node was reviewed and the reviewer''s notes on the review itself.'),
    ('surface_binding', false, 'How an agent''s variables map onto a UI surface; configuration of the binding, not endpoint content.')
  ) as v(kind, follows, reason)
 where k.kind = v.kind;

-- Every registered kind must carry a reason; a new kind added later defaults to false and must say why.
do $$
declare v_missing text;
begin
  select string_agg(kind, ', ') into v_missing
    from platform.edge_payload_kind where payload_follows_endpoints_reason is null;
  if v_missing is not null then
    raise exception 'rca5: payload kinds with no payload_follows_endpoints declaration: %', v_missing;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. THE GATE — LAST STATEMENT (see window-class above).
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
    or (iam.has_access(source_type, source_id, 'viewer'::public.permission_level)
        and iam.has_access(target_type, target_id, 'viewer'::public.permission_level))
  );
