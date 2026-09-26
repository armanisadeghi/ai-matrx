-- RC-A5e — PAYLOAD KINDS THAT CARRY FREE TEXT ARE DECLARED BY WHAT THAT TEXT CAN COPY.
-- chair-step: re-declares four edge payload kinds after the RC-A5 verification (evidence/verify-RC-A5.md §7.1); data only, no DDL, no lock beyond the 15-row registry.
-- Design: common-docs/projects/rich-content-unification/ASSOCIATION-VISIBILITY.md §11. Register row RC-A5.
--
-- Free-text fields on kinds RC-A5 declared "describes the edge" (measured on production 2026-09-25):
--   plan_review.notes            2 rows, both with text. plan.node carries per-row visibility and
--                                crm.party is confidential, so a reviewer's notes about a private
--                                node can quote it -> GATED.
--   map_facet_assignment.note    1,144 rows, 0 with text today. Its target, seo.map_facet_value,
--                                carries per-row visibility (personal is possible) -> GATED, so the
--                                first note written about a personal facet value follows it.
--   map_page_intent.note         4,148 of 4,149 rows carry text, and map_topic_coverage.reason
--                                5,573 of 5,575: machine summaries of the SOURCE web page. They stay
--                                ungated, and this is the bound: web.page has no visibility column
--                                (created_by only adds a read lane; nothing narrows a row), so every member
--                                who can read the edge can read the page the text summarizes. A
--                                sample of 150 rows x 3 members read both ends 150/150. The forcing
--                                suite asserts the bound on live data (test_association_visibility.py,
--                                test_seo_summaries_only_quote_pages_every_member_reads).

update platform.edge_payload_kind k
   set payload_follows_endpoints = v.follows,
       payload_follows_endpoints_reason = v.reason
  from (values
    ('plan_review', true, 'The notes field is free text about a plan node, which can be personal (plan.node carries visibility) and names a confidential party; a note can quote either end.'),
    ('map_facet_assignment', true, 'The note field is free text and the target facet value carries per-row visibility, so a note can quote a personal facet value.'),
    ('map_page_intent', false, 'The note summarizes the SOURCE web page (web.page has no visibility column, so nothing narrows a page below its organization: every member who reads the edge reads the page). Bound asserted by test_seo_summaries_only_quote_pages_every_member_reads.'),
    ('map_topic_coverage', false, 'The reason summarizes the SOURCE web page (web.page has no visibility column, so nothing narrows a page below its organization: every member who reads the edge reads the page). Bound asserted by test_seo_summaries_only_quote_pages_every_member_reads.')
  ) as v(kind, follows, reason)
 where k.kind = v.kind;
