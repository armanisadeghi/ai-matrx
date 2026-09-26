-- chair-step: RC-A5e inverse — returns plan_review and map_facet_assignment to ungated (their free-text notes readable by every member of the edge's organization) and restores the RC-A5 reasons.

update platform.edge_payload_kind k
   set payload_follows_endpoints = v.follows,
       payload_follows_endpoints_reason = v.reason
  from (values
    ('plan_review', false, 'When a plan node was reviewed and the reviewer''s notes on the review itself.'),
    ('map_facet_assignment', false, 'Who set a facet value and which facet; provenance of the edge, not endpoint content.'),
    ('map_page_intent', false, 'The disposition decided for a page (keep/move/merge...); a decision about the edge, not endpoint content.'),
    ('map_topic_coverage', false, 'Mapper confidence, source and a one-line reason about the edge itself; no endpoint content.')
  ) as v(kind, follows, reason)
 where k.kind = v.kind;
