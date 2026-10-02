-- chair-step: it UPDATES three existing platform.entity_types rows (meet_meeting, mandate,
--   anon_form) to name their title column and mark them reference-pickable — the same two facts
--   /administration/relationships/entity-types sets — and INSERTS the three registry rows
--   `record → meet_meeting | mandate | anon_form` into platform.association_types (container_side
--   'none', conveys no access), exactly the shape SC-R seeded the first 109 with. An UPDATE is a
--   shape the production allow-list refuses by name, so it comes through this route. Nothing is
--   granted, revoked, dropped or replaced; no function body changes; no table, column, policy or
--   trigger is touched; row locks on six registry rows only. The association insert notes one
--   reachability rebuild at commit (platform.trg_reachability_on_rules), as SC-R's insert did.
--   The inverse is `migrations/inverse/w22_a_reference_can_point_at_a_meeting_a_mandate_and_a_form_down.sql`.
-- lane: INTEGRATION
-- lock: platform
--
-- v6 LANE 3 INTEGRATION · W2.2 — REFERENCES TO EVERY MODULE (handoff item 5).
--
-- THE USE CASE. Cedar Ridge Physical Therapy keeps a Referral Intake Queue table. Each referral
-- row points at the intake form the patient filled in, the booking page they took their first
-- visit on, and the case-review meeting the clinicians held about them. Until now a reference
-- column could name a note, an agent, a workflow … 109 kinds, and none of a meeting, a mandate,
-- a form or a booking page — so the front desk typed "see Tuesday's meeting" into a text cell.
--
-- WHY THESE THREE, AND WHY ONLY A REGISTRY CHANGE. custom.entity_reference_kinds() answers
-- exactly the registered `record → <token>` association types whose entity is active, and every
-- other door asks the same registry:
--   · the write rule (custom._entity_reference_target_ok) — the thing is live and the writer
--     holds viewer on it through iam.has_access(<token>, id) — measured on the clone 2026-10-02
--     to answer correctly for all three (a member of another organization is refused);
--   · the chip's words (platform.relation_label) read entity_types.title_column after the same
--     access question, so a reader who may not open it sees the withheld words, never the title;
--   · the picker's list (custom.entity_reference_search → public.reference_search_candidates)
--     refuses a token that is not reference_pickable or has no title column.
-- So each kind needs only its title column, reference_pickable, and its registry row. The chip
-- opens through the host's entity overlay: a meeting at /meet/<id>, a mandate at
-- /mandates/id/<id>, a form or booking page at /o/<id> (custom.where_id_opens already answers
-- both, booking pages being anon_form rows whose presentation carries `booking`).
--
-- NOT HERE, ON PURPOSE (each is in the reference vocabulary census's exclusion map with its
-- reason): a portal (custom.portal is not a registered entity type), a dashboard (a store record
-- in the presentation kernel, reached by no relation target), a CMS page (another database), an
-- email thread (no thread entity exists), an SMS thread (its access resolver reads created_by
-- while the thread's owner is user_id).

set local statement_timeout = '120s';

update platform.entity_types e
   set title_column = v.title_column,
       reference_pickable = true
  from (values ('meet_meeting', 'title'),
               ('mandate',      'label'),
               ('anon_form',    'title')) as v(token, title_column)
 where e.token = v.token
   and e.is_active
   and (e.title_column is distinct from v.title_column or not e.reference_pickable);

insert into platform.association_types
  (source_type, target_type, label, container_side, conveys_max, is_active, notes)
select 'record', t.token, null, 'none', 'viewer'::public.permission_level, true,
       'W2.2 (2026-10-02): an entity-reference Field on a record points at this kind of thing. '
       || 'The edge carries the field (relation_field_id, role = field key) and conveys no access.'
  from (values ('meet_meeting'), ('mandate'), ('anon_form')) as t(token)
  join platform.entity_types e on e.token = t.token and e.is_active
on conflict do nothing;
