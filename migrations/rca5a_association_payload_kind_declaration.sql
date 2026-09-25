-- RC-A5a — WHICH ASSOCIATION PAYLOAD KINDS COPY AN ENDPOINT'S CONTENT (the declaration the RC-A5b gate reads).
-- chair-step: adds the fail-closed payload_follows_endpoints declaration to platform.edge_payload_kind; applied only when named, in the 1-4 AM PT window, immediately before rca5b.
-- Design, census and measurements: common-docs/projects/rich-content-unification/ASSOCIATION-VISIBILITY.md
-- Register: common-docs/projects/rich-content-unification/REGISTER.md row RC-A5.
--
-- Split from the gate (plan-attack finding 4): ADD COLUMN holds ACCESS EXCLUSIVE on the 15-row
-- registry until COMMIT, and every edge insert carrying a payload_kind FK-checks against it, so this
-- transaction must not also wait in the queue for the gate's lock on platform.associations.
-- Inverse: migrations/inverse/rca5a_association_payload_kind_declaration_down.sql.

set local lock_timeout = '2s';

-- ─────────────────────────────────────────────────────────────────────────────
-- THE DECLARATION (ADD COLUMN on a 15-row registry; the default is a constant, so catalog-only).
-- ─────────────────────────────────────────────────────────────────────────────
alter table platform.edge_payload_kind
  add column if not exists payload_follows_endpoints boolean not null default true,
  add column if not exists payload_follows_endpoints_reason text;

comment on column platform.edge_payload_kind.payload_follows_endpoints is
  'RC-A5. True when this payload copies content out of an endpoint (a quoted passage, a snapshot of a record''s values, the values that filled a document, a quote from a source). An edge of such a kind is readable only by a platform admin or by someone who can read BOTH ends (policy assoc_payload_follows_endpoints on platform.associations). Defaults TRUE (fail-closed): set it false only with a payload_follows_endpoints_reason saying why the payload describes the edge itself. Content from an endpoint never goes in label or metadata. See common-docs/projects/rich-content-unification/ASSOCIATION-VISIBILITY.md.';
comment on column platform.edge_payload_kind.payload_follows_endpoints_reason is
  'Why payload_follows_endpoints is what it is for this kind — one sentence, required reading for the next kind author.';

update platform.edge_payload_kind k
   set payload_follows_endpoints = v.follows,
       payload_follows_endpoints_reason = v.reason
  from (values
    ('text_anchor', true, 'The payload is the exact quoted passage (plus prefix/suffix) of the target document; reading it is reading the target.'),
    ('text_anchor_set', true, 'The payload is several exact quoted passages of the target document; reading it is reading the target.'),
    ('render_binding', true, 'The payload holds the variable values that filled a sealed rendered document; reading it is reading that document''s content.'),
    ('relation_snapshot', true, 'The payload is a frozen copy of the target record''s values; reading it is reading the target.'),
    ('party_observation', true, 'The payload quotes and extracts fields from a research source (the rs_source row the party was observed in); reading it is reading the source.'),
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

-- A kind registered after this file was written takes the fail-closed default; say so, by name.
do $$
declare v_defaulted text;
begin
  select string_agg(kind, ', ') into v_defaulted
    from platform.edge_payload_kind where payload_follows_endpoints_reason is null;
  if v_defaulted is not null then
    raise notice 'rca5: payload kinds gated by the fail-closed default (no reason recorded yet): %', v_defaulted;
  end if;
end $$;

